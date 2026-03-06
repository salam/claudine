import * as path from 'path';
import * as fsp from 'fs/promises';
import {
  Conversation,
  ConversationStatus,
  Agent,
  CodexJsonlEnvelope,
  CodexSessionMetaPayload,
  CodexEventMsgPayload,
  CodexResponseItemPayload,
} from '../types';
import { CategoryClassifier } from '../services/CategoryClassifier';
import {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LAST_MESSAGE_LENGTH,
  MAX_PARSE_CACHE_ENTRIES,
  RECENTLY_ACTIVE_WINDOW_MS,
} from '../constants';

/** Intermediate state accumulated while parsing a Codex session JSONL file. */
interface ParseCache {
  byteOffset: number;
  sessionId: string | undefined;
  workspacePath: string | undefined;
  gitBranch: string | undefined;
  firstTimestamp: string | undefined;
  lastTimestamp: string | undefined;
  userMessages: string[];
  agentMessages: string[];
  lastEventType: string | undefined;
  hasError: boolean;
  errorMessage: string | undefined;
  isAborted: boolean;
  isRateLimited: boolean;
  rateLimitResetTime: string | undefined;
  rateLimitMessage: string | undefined;
}

export class CodexSessionParser {
  private _classifier: CategoryClassifier;
  private _cache = new Map<string, ParseCache>();

  constructor() {
    this._classifier = new CategoryClassifier();
  }

  /** Number of files currently held in the incremental parse cache. */
  public get cacheSize(): number {
    return this._cache.size;
  }

  /** Clear the parse cache for a specific file (e.g. on deletion). */
  public clearCache(filePath: string) {
    this._cache.delete(filePath);
  }

  /** Promote a key to most-recently-used and evict the oldest if over limit. */
  private touchCache(key: string, value: ParseCache) {
    this._cache.delete(key);
    this._cache.set(key, value);
    if (this._cache.size > MAX_PARSE_CACHE_ENTRIES) {
      const oldest = this._cache.keys().next().value;
      if (oldest !== undefined) {
        this._cache.delete(oldest);
      }
    }
  }

  public async parseFile(filePath: string): Promise<Conversation | null> {
    try {
      if (!filePath.endsWith('.jsonl')) return null;

      const cached = this._cache.get(filePath);
      let fileSize: number;
      try {
        fileSize = (await fsp.stat(filePath)).size;
      } catch {
        return null;
      }
      if (fileSize === 0) return null;

      // File shrank → invalidate cache
      if (cached && cached.byteOffset > fileSize) {
        this._cache.delete(filePath);
        return this.parseFile(filePath);
      }

      // No new data → rebuild from cache
      if (cached && cached.byteOffset === fileSize) {
        this.touchCache(filePath, cached);
        if (!cached.sessionId) return null;
        return this.buildConversation(filePath, cached);
      }

      // Incremental read
      if (cached && cached.byteOffset < fileSize) {
        return await this.parseIncremental(filePath, cached, fileSize);
      }

      // First read: full parse
      return await this.parseFullFile(filePath, fileSize);
    } catch (error) {
      console.error(`Claudine: Error parsing Codex file ${filePath}:`, error);
      return null;
    }
  }

  private async parseFullFile(filePath: string, fileSize: number): Promise<Conversation | null> {
    const content = await fsp.readFile(filePath, 'utf-8');
    if (!content.trim()) return null;

    const cache = this.freshCache(fileSize);
    this.parseLines(content, cache);
    this.touchCache(filePath, cache);

    if (!cache.sessionId) return null;
    return this.buildConversation(filePath, cache);
  }

  private async parseIncremental(filePath: string, cached: ParseCache, fileSize: number): Promise<Conversation | null> {
    const handle = await fsp.open(filePath, 'r');
    try {
      const newSize = fileSize - cached.byteOffset;
      const buffer = Buffer.alloc(newSize);
      await handle.read(buffer, 0, newSize, cached.byteOffset);
      const newContent = buffer.toString('utf-8');
      this.parseLines(newContent, cached);
      cached.byteOffset = fileSize;
    } finally {
      await handle.close();
    }

    this.touchCache(filePath, cached);
    if (!cached.sessionId) return null;
    return this.buildConversation(filePath, cached);
  }

  private freshCache(byteOffset: number): ParseCache {
    return {
      byteOffset,
      sessionId: undefined,
      workspacePath: undefined,
      gitBranch: undefined,
      firstTimestamp: undefined,
      lastTimestamp: undefined,
      userMessages: [],
      agentMessages: [],
      lastEventType: undefined,
      hasError: false,
      errorMessage: undefined,
      isAborted: false,
      isRateLimited: false,
      rateLimitResetTime: undefined,
      rateLimitMessage: undefined,
    };
  }

  /** Parse raw JSONL lines and accumulate results into the cache. */
  private parseLines(content: string, cache: ParseCache) {
    const lines = content.split('\n');

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      try {
        const obj = JSON.parse(trimmed);
        this.processEntry(obj, cache);
      } catch {
        // Skip malformed lines
      }
    }
  }

  /**
   * Process a single parsed JSON object.
   * Handles both the standard envelope format and the legacy bare-object format.
   */
  private processEntry(obj: Record<string, unknown>, cache: ParseCache) {
    // Record timestamp (both formats put it at the top level)
    const ts = (obj.timestamp as string) || undefined;
    if (ts) {
      if (!cache.firstTimestamp) cache.firstTimestamp = ts;
      cache.lastTimestamp = ts;
    }

    // ── Standard envelope: { timestamp, type, payload } ──
    if (obj.type && obj.payload && typeof obj.payload === 'object') {
      const envelope = obj as unknown as CodexJsonlEnvelope;

      if (envelope.type === 'session_meta') {
        const meta = envelope.payload as CodexSessionMetaPayload;
        if (meta.id) cache.sessionId = meta.id;
        if (meta.cwd) cache.workspacePath = meta.cwd;
        return;
      }

      if (envelope.type === 'event_msg') {
        const event = envelope.payload as CodexEventMsgPayload;
        this.processEvent(event, cache);
        return;
      }

      if (envelope.type === 'response_item') {
        const item = envelope.payload as CodexResponseItemPayload;
        if (item.content && Array.isArray(item.content)) {
          for (const block of item.content) {
            // BUG16a: input_text blocks contain system instructions (permissions,
            // AGENTS.md, environment context) mixed with user messages. User messages
            // are reliably captured via event_msg/user_message, so skip input_text
            // entirely to avoid system text becoming the title.
            if (block.type === 'output_text' && block.text) {
              cache.agentMessages.push(block.text);
            }
          }
        }
        return;
      }
      // Unknown envelope type — skip
      return;
    }

    // ── Legacy bare-object format ──
    // session_meta without envelope: `{ meta: { id, cwd, timestamp }, git?: ... }`
    if (obj.meta && typeof obj.meta === 'object') {
      const meta = obj.meta as Record<string, unknown>;
      if (meta.id) cache.sessionId = meta.id as string;
      if (meta.cwd) cache.workspacePath = meta.cwd as string;
      const git = obj.git as Record<string, unknown> | undefined;
      if (git?.branch) cache.gitBranch = git.branch as string;
      return;
    }

    // Legacy event_msg without envelope: bare `{ type: 'user_message', ... }`
    if (obj.type && typeof obj.type === 'string' && !obj.payload) {
      this.processEvent(obj as unknown as CodexEventMsgPayload, cache);
    }
  }

  /** Process a Codex event (from either envelope or legacy format). */
  private processEvent(event: CodexEventMsgPayload, cache: ParseCache) {
    const evType = event.type;
    cache.lastEventType = evType;

    switch (evType) {
      case 'user_message':
        if ('message' in event && event.message) {
          cache.userMessages.push(event.message);
        }
        break;
      case 'agent_message':
        if ('message' in event && event.message) {
          cache.agentMessages.push(event.message);
        }
        break;
      case 'error':
        cache.hasError = true;
        if ('message' in event && event.message) {
          cache.errorMessage = event.message;
        } else if ('error' in event && event.error) {
          cache.errorMessage = event.error;
        }
        break;
      case 'turn_aborted':
        cache.isAborted = true;
        break;
      case 'rate_limit':
        cache.isRateLimited = true;
        if ('reset_at' in event && event.reset_at) {
          cache.rateLimitResetTime = event.reset_at;
        }
        if ('message' in event && event.message) {
          cache.rateLimitMessage = event.message;
        }
        break;
      // task_started, task_complete, exec_command_*, mcp_tool_call_* are
      // tracked implicitly via lastEventType for status detection.
      default:
        break;
    }
  }

  /** Build a Conversation object from accumulated cache data. */
  private buildConversation(filePath: string, cache: ParseCache): Conversation | null {
    if (!cache.sessionId) return null;

    const title = this.extractTitle(cache);
    const description = this.extractDescription(cache);
    const lastMessage = this.extractLastMessage(cache);

    // Skip empty sessions with no meaningful content
    if (title === 'Untitled Session' && !description && !lastMessage) {
      return null;
    }

    const status = this.detectStatus(cache);
    const category = this._classifier.classify(title, description, []);
    const agents = this.buildAgents(cache);
    const createdAt = cache.firstTimestamp ? new Date(cache.firstTimestamp) : new Date();
    const updatedAt = cache.lastTimestamp ? new Date(cache.lastTimestamp) : new Date();

    return {
      id: `codex-${cache.sessionId}`,
      title,
      description,
      category,
      status,
      lastMessage,
      agents,
      gitBranch: cache.gitBranch,
      hasError: cache.hasError,
      errorMessage: cache.hasError ? cache.errorMessage : undefined,
      isInterrupted: cache.isAborted,
      hasQuestion: false, // Codex doesn't have interactive questions
      isRateLimited: cache.isRateLimited,
      rateLimitResetTime: cache.rateLimitResetTime,
      rateLimitResetDisplay: cache.rateLimitMessage,
      createdAt,
      updatedAt,
      filePath,
      workspacePath: cache.workspacePath,
      provider: 'codex',
    };
  }

  private extractTitle(cache: ParseCache): string {
    const first = cache.userMessages[0];
    if (!first) return 'Untitled Session';

    // BUG16c: Codex VSCode wraps user messages in IDE context. Extract the
    // actual request from after the "## My request for Codex:" header.
    const text = this.stripIDEContext(first);

    const firstLine = text.split('\n')[0].trim();
    if (!firstLine) return 'Untitled Session';
    return firstLine.length > MAX_TITLE_LENGTH
      ? firstLine.slice(0, MAX_TITLE_LENGTH - 3) + '...'
      : firstLine;
  }

  /**
   * Strip IDE context preamble from Codex VSCode user messages.
   * Codex VSCode wraps user messages like:
   *   # Context from my IDE setup:
   *   ## Open tabs: ...
   *   ## My request for Codex:
   *   <actual user request>
   */
  private stripIDEContext(text: string): string {
    const marker = /^##\s+My request for Codex:\s*$/m;
    const match = marker.exec(text);
    if (match) {
      const afterMarker = text.slice(match.index + match[0].length).trim();
      if (afterMarker) return afterMarker;
    }
    return text;
  }

  private extractDescription(cache: ParseCache): string {
    const first = cache.agentMessages[0];
    if (!first) return '';
    const firstPara = first.split('\n\n')[0].trim();
    return firstPara.length > MAX_DESCRIPTION_LENGTH
      ? firstPara.slice(0, MAX_DESCRIPTION_LENGTH - 3) + '...'
      : firstPara;
  }

  private extractLastMessage(cache: ParseCache): string {
    const last = cache.agentMessages[cache.agentMessages.length - 1];
    if (!last) return '';
    const lines = last.split('\n').filter(l => l.trim());
    const lastTwo = lines.slice(-2).join('\n');
    return lastTwo.length > MAX_LAST_MESSAGE_LENGTH
      ? lastTwo.slice(0, MAX_LAST_MESSAGE_LENGTH - 3) + '...'
      : lastTwo;
  }

  private detectStatus(cache: ParseCache): ConversationStatus {
    // Rate-limited → paused
    if (cache.isRateLimited) return 'needs-input';
    // Error → needs attention
    if (cache.hasError) return 'needs-input';
    // Aborted → needs attention
    if (cache.isAborted) return 'needs-input';

    const last = cache.lastEventType;

    // Completed task
    if (last === 'task_complete') return 'in-review';

    // Task is actively running
    if (last === 'task_started' || last === 'exec_command_begin' || last === 'mcp_tool_call_begin') {
      return 'in-progress';
    }

    // Has agent messages but no clear completion → check recency
    if (cache.agentMessages.length > 0) {
      if (this.isRecentlyActive(cache)) return 'in-progress';
      return 'in-review';
    }

    // Only user messages → todo
    if (cache.userMessages.length > 0) return 'todo';

    return 'todo';
  }

  private buildAgents(cache: ParseCache): Agent[] {
    return [{
      id: 'codex-main',
      name: 'Codex',
      avatar: '',
      isActive: this.isRecentlyActive(cache),
    }];
  }

  private isRecentlyActive(cache: ParseCache): boolean {
    if (!cache.lastTimestamp) return false;
    return (Date.now() - new Date(cache.lastTimestamp).getTime()) < RECENTLY_ACTIVE_WINDOW_MS;
  }
}
