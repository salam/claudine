import * as path from 'path';
import * as fsp from 'fs/promises';
import type { Dirent } from 'fs';
import { execFile } from 'child_process';
import { CategoryClassifier } from '../services/CategoryClassifier';
import {
  Conversation,
  ConversationStatus,
  Agent,
  ParsedMessage,
  ClaudeCodeJsonlEntry,
  ClaudeCodeContent,
  SidechainStep,
  LastActivity
} from '../types';
import {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LAST_MESSAGE_LENGTH,
  MAX_MARKUP_STRIP_LENGTH,
  RECENTLY_ACTIVE_WINDOW_MS,
  MAX_PARSE_CACHE_ENTRIES,
  RATE_LIMIT_PATTERN
} from '../constants';

/** Cached intermediate state for incremental parsing. */
interface ParseCache {
  byteOffset: number;
  messages: ParsedMessage[];
  sidechainSteps: SidechainStep[];
  /** Maps each sidechain message UUID to its root parent (the parentUuid of the
   *  first message in that sidechain chain — i.e. the main-thread message that
   *  spawned the agent). */
  sidechainUuidToRoot: Map<string, string>;
  /** Latest step status per agent, keyed by root parentUuid. */
  sidechainAgentStatus: Map<string, SidechainStep>;
  firstTimestamp: string | undefined;
  lastTimestamp: string | undefined;
  gitBranch: string | undefined;
}

export class ConversationParser {
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
      // Map iterates in insertion order — first key is the oldest
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

      // If the file shrank (e.g. was rewritten), invalidate the cache
      if (cached && cached.byteOffset > fileSize) {
        this._cache.delete(filePath);
        return this.parseFile(filePath);
      }

      // Incremental: read only from where we left off
      if (cached && cached.byteOffset === fileSize) {
        // No new data — promote in LRU and rebuild from cached messages
        this.touchCache(filePath, cached);
        if (cached.messages.length === 0) return null;
        return await this.buildConversation(filePath, cached.messages, cached.firstTimestamp, cached.lastTimestamp, cached.gitBranch, cached.sidechainSteps);
      }

      if (cached && cached.byteOffset < fileSize) {
        const result = await this.parseIncremental(filePath, cached, fileSize);
        this.touchCache(filePath, cached);
        return result;
      }

      // First read: full parse
      return await this.parseFullFile(filePath, fileSize);
    } catch (error) {
      console.error(`Claudine: Error parsing file ${filePath}:`, error);
      return null;
    }
  }

  private async parseFullFile(filePath: string, fileSize: number): Promise<Conversation | null> {
    const content = await fsp.readFile(filePath, 'utf-8');
    if (!content.trim()) return null;

    const cache: ParseCache = {
      byteOffset: fileSize,
      messages: [],
      sidechainSteps: [],
      sidechainUuidToRoot: new Map(),
      sidechainAgentStatus: new Map(),
      firstTimestamp: undefined,
      lastTimestamp: undefined,
      gitBranch: undefined,
    };

    this.parseLines(content, cache);
    this.touchCache(filePath, cache);

    if (cache.messages.length === 0) return null;
    return await this.buildConversation(filePath, cache.messages, cache.firstTimestamp, cache.lastTimestamp, cache.gitBranch, cache.sidechainSteps);
  }

  private async parseIncremental(filePath: string, cached: ParseCache, fileSize: number): Promise<Conversation | null> {
    // Read only the new bytes appended since last parse
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

    if (cached.messages.length === 0) return null;
    return await this.buildConversation(filePath, cached.messages, cached.firstTimestamp, cached.lastTimestamp, cached.gitBranch, cached.sidechainSteps);
  }

  /** Parse raw JSONL lines and accumulate results into the cache. */
  private parseLines(content: string, cache: ParseCache) {
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const entry: ClaudeCodeJsonlEntry = JSON.parse(trimmed);

        if (entry.timestamp) {
          if (!cache.firstTimestamp) cache.firstTimestamp = entry.timestamp;
          cache.lastTimestamp = entry.timestamp;
        }

        if (entry.gitBranch && entry.gitBranch !== 'HEAD') {
          cache.gitBranch = entry.gitBranch;
        }

        if ((entry.type !== 'user' && entry.type !== 'assistant') || !entry.message) {
          continue;
        }

        // BUG1: Skip sidechain entries from main message list — they are branched
        // sub-conversations. But collect their status as activity dots.
        if (entry.isSidechain) {
          this.collectSidechainStep(entry, cache);
          continue;
        }

        const parsed = this.parseMessage(entry);
        if (parsed) {
          cache.messages.push(parsed);
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  /** Extract a sidechain activity step from a sidechain JSONL entry.
   *  BUG18: Groups by agent — each distinct sidechain (identified by tracing
   *  parentUuid chains back to a main-thread message) gets one dot showing its
   *  latest status. */
  private collectSidechainStep(entry: ClaudeCodeJsonlEntry, cache: ParseCache) {
    if (!entry.message) return;

    const content = entry.message.content || [];
    const role = entry.message.role;

    // Find the first tool_use or tool_result to determine status
    const toolUse = content.find(b => b.type === 'tool_use' && b.name);
    const toolResult = content.find(b => b.type === 'tool_result');
    const toolName = toolUse?.name;

    let step: SidechainStep;

    if (role === 'assistant' && toolUse) {
      // Assistant dispatching a tool → running
      step = { status: 'running', toolName };
    } else if (role === 'user' && toolResult) {
      // Tool result returned — check for error
      const isError = (toolResult as { is_error?: boolean }).is_error === true;
      const resultText = typeof toolResult.content === 'string' ? toolResult.content : '';
      const hasErrorPattern = isError || /error|exit code [1-9]/i.test(resultText);
      step = { status: hasErrorPattern ? 'failed' : 'completed', toolName };
    } else if (role === 'assistant' && content.some(b => b.type === 'text' && b.text)) {
      // Assistant text response (no tool_use) → completed
      step = { status: 'completed' };
    } else {
      return; // Not informative enough to show
    }

    // Determine which agent this entry belongs to by tracing parentUuid
    const parentUuid = entry.parentUuid || '';
    let rootParent: string;

    if (cache.sidechainUuidToRoot.has(parentUuid)) {
      // Parent is a known sidechain message → same agent chain
      rootParent = cache.sidechainUuidToRoot.get(parentUuid)!;
    } else {
      // Parent is NOT a known sidechain message → new agent (parentUuid
      // points back to a main-thread message that spawned this sidechain)
      rootParent = parentUuid;
    }

    // Register this entry's UUID so subsequent messages in the same chain
    // can be traced back to this agent
    cache.sidechainUuidToRoot.set(entry.uuid, rootParent);

    // Update this agent's latest status (toolName from the latest informative step)
    const existing = cache.sidechainAgentStatus.get(rootParent);
    cache.sidechainAgentStatus.set(rootParent, {
      ...step,
      // Preserve the toolName from the initial dispatch if the current step
      // doesn't have one (e.g. a completion step without a tool name)
      toolName: step.toolName || existing?.toolName,
    });

    // Rebuild sidechainSteps from per-agent statuses
    cache.sidechainSteps = Array.from(cache.sidechainAgentStatus.values());
  }

  private parseMessage(entry: ClaudeCodeJsonlEntry): ParsedMessage | null {
    if (!entry.message) return null;

    const role = entry.message.role;
    if (role !== 'user' && role !== 'assistant') return null;

    const contentBlocks: ClaudeCodeContent[] = entry.message.content || [];

    const textParts: string[] = [];
    const toolUses: Array<{ name: string; input: Record<string, unknown> }> = [];
    let hasError = false;
    let isInterrupted = false;
    let hasQuestion = false;
    let isRateLimited = false;
    let rateLimitResetDisplay: string | undefined;
    let rateLimitResetTime: string | undefined;
    let toolResultHint: string | undefined;

    // BUG7: anchor reset-time computation to the message's own timestamp
    const messageDate = entry.timestamp ? new Date(entry.timestamp) : undefined;

    for (const block of contentBlocks) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
        // Detect rate limit message in assistant text
        const rlMatch = block.text.match(RATE_LIMIT_PATTERN);
        if (rlMatch) {
          isRateLimited = true;
          const timeStr = rlMatch[1]; // e.g. "10am"
          const tz = rlMatch[2];      // e.g. "Europe/Zurich"
          rateLimitResetDisplay = `${timeStr} (${tz})`;
          rateLimitResetTime = ConversationParser.parseResetTime(timeStr, tz, messageDate);
        }
      } else if (block.type === 'tool_use' && block.name) {
        toolUses.push({
          name: block.name,
          input: this.trimToolInput(block.name, block.input || {}),
        });
        // AskUserQuestion = interactive question (yes/no/multiple choice)
        if (block.name === 'AskUserQuestion' || block.name === 'ExitPlanMode') {
          hasQuestion = true;
        }
      } else if (block.type === 'tool_result') {
        const resultText = typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? block.content.filter(b => b.type === 'text').map(b => b.text || '').join('\n')
            : '';
        if (/tool interrupted/i.test(resultText)) {
          isInterrupted = true;
        }
        if (/API Error:\s*\d{3}/i.test(resultText)) {
          hasError = true;
        }
        // Capture a brief hint from the tool result for display
        if (resultText) {
          const resultLines = resultText.split('\n').filter(l => l.trim());
          if (resultLines.length > 3) {
            toolResultHint = `${resultLines.length} lines of output`;
          } else {
            const brief = resultText.trim().slice(0, 100);
            toolResultHint = brief.length < resultText.trim().length ? brief + '...' : brief;
          }
        }
        // Also check tool results for rate limit messages
        const rlMatch = resultText.match(RATE_LIMIT_PATTERN);
        if (rlMatch) {
          isRateLimited = true;
          const timeStr = rlMatch[1];
          const tz = rlMatch[2];
          rateLimitResetDisplay = `${timeStr} (${tz})`;
          rateLimitResetTime = ConversationParser.parseResetTime(timeStr, tz, messageDate);
        }
      }
    }

    // Entry-level toolUseResult.interrupted flag (set by Claude Code runtime)
    if (entry.toolUseResult?.interrupted) {
      isInterrupted = true;
    }

    const textContent = textParts.join('\n');

    return {
      role,
      textContent,
      toolUses,
      timestamp: entry.timestamp,
      gitBranch: entry.gitBranch,
      hasError,
      isInterrupted,
      hasQuestion,
      isRateLimited,
      rateLimitResetDisplay,
      rateLimitResetTime,
      toolResultHint
    };
  }

  /** Keep only the fields we actually use from tool inputs, discarding large payloads. */
  private trimToolInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
    // Task tool: keep subagent_type + description for agent detection
    if (toolName === 'Task') {
      const trimmed: Record<string, unknown> = {};
      if (input.subagent_type) trimmed.subagent_type = input.subagent_type;
      if (input.description) trimmed.description = input.description;
      return trimmed;
    }
    // File tools: keep file_path for display + image detection
    if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
      const trimmed: Record<string, unknown> = {};
      if (input.file_path) trimmed.file_path = input.file_path;
      return trimmed;
    }
    // AskUserQuestion: keep question for display
    if (toolName === 'AskUserQuestion') {
      const trimmed: Record<string, unknown> = {};
      if (input.question) trimmed.question = input.question;
      return trimmed;
    }
    // Search tools: keep pattern + path for display
    if (toolName === 'Grep' || toolName === 'Glob') {
      const trimmed: Record<string, unknown> = {};
      if (input.pattern) trimmed.pattern = input.pattern;
      if (input.path) trimmed.path = input.path;
      return trimmed;
    }
    // Bash: keep truncated command for display
    if (toolName === 'Bash') {
      const trimmed: Record<string, unknown> = {};
      if (input.command) {
        const cmd = String(input.command);
        trimmed.command = cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd;
      }
      return trimmed;
    }
    // WebSearch: keep query for display
    if (toolName === 'WebSearch') {
      const trimmed: Record<string, unknown> = {};
      if (input.query) trimmed.query = input.query;
      return trimmed;
    }
    // All other tools: discard inputs entirely
    return {};
  }

  private async buildConversation(
    filePath: string,
    messages: ParsedMessage[],
    firstTimestamp: string | undefined,
    lastTimestamp: string | undefined,
    gitBranch: string | undefined,
    sidechainSteps: SidechainStep[] = []
  ): Promise<Conversation | null> {
    const id = this.extractSessionId(filePath);
    const title = this.extractTitle(messages);
    const description = this.extractDescription(messages);
    const lastMessage = this.extractLastMessage(messages);

    // BUG3/BUG9: Skip empty/meaningless conversations that have no real user content.
    // If the title is "Untitled" it means the first user message was entirely markup/metadata,
    // so the conversation itself is not meaningful (even if the assistant responded to it).
    if (title === 'Untitled Conversation' && !this.hasRealUserContent(messages)) {
      return null;
    }

    const status = this.detectStatus(messages, sidechainSteps);
    const category = this._classifier.classify(title, description, messages);
    const agents = this.detectAgents(messages);
    const hasError = this.hasRecentError(messages);
    const isInterrupted = this.hasRecentInterruption(messages);
    const hasQuestion = this.hasRecentQuestion(messages);
    const isRateLimited = this.hasRecentRateLimit(messages);
    const rateLimitInfo = isRateLimited ? this.extractRateLimitInfo(messages) : {};
    const lastActivity = this.extractLastActivity(messages);
    const lastStatusText = this.extractLastStatusText(messages);

    const createdAt = firstTimestamp ? new Date(firstTimestamp) : new Date();
    const updatedAt = lastTimestamp ? new Date(lastTimestamp) : new Date();

    return {
      id,
      title,
      description,
      category,
      status,
      lastMessage,
      agents,
      gitBranch: gitBranch || this.detectGitBranchFromMessages(messages),
      hasError,
      errorMessage: hasError ? this.extractErrorMessage(messages) : undefined,
      isInterrupted,
      hasQuestion,
      isRateLimited,
      rateLimitResetDisplay: rateLimitInfo.display,
      rateLimitResetTime: rateLimitInfo.time,
      sidechainSteps: sidechainSteps.length > 0 ? sidechainSteps : undefined,
      lastActivity,
      lastStatusText,
      referencedImage: this.extractReferencedImage(messages),
      createdAt,
      updatedAt,
      filePath,
      workspacePath: await this.extractWorkspacePath(filePath),
      provider: 'claude-code'
    };
  }

  /** Check if any user message has real content (not just markup tags). */
  private hasRealUserContent(messages: ParsedMessage[]): boolean {
    return messages
      .filter(m => m.role === 'user' && m.textContent.trim())
      .some(m => this.stripMarkupTags(m.textContent.trim()).length > 0);
  }

  private extractSessionId(filePath: string): string {
    return path.basename(filePath, '.jsonl');
  }

  private extractTitle(messages: ParsedMessage[]): string {
    const firstUser = messages.find(m => m.role === 'user' && m.textContent.trim());
    if (!firstUser) return 'Untitled Conversation';

    const content = this.stripMarkupTags(firstUser.textContent.trim());
    if (!content) return 'Untitled Conversation';
    const firstLine = content.split('\n')[0];
    return firstLine.length > MAX_TITLE_LENGTH ? firstLine.slice(0, MAX_TITLE_LENGTH - 3) + '...' : firstLine;
  }

  /** Strip XML-like tags and their content (ide_opened_file, system-reminder, permissions, etc.) */
  private stripMarkupTags(text: string): string {
    // Limit input length to prevent ReDoS on crafted JSONL data
    const capped = text.length > MAX_MARKUP_STRIP_LENGTH ? text.slice(0, MAX_MARKUP_STRIP_LENGTH) : text;
    // Match both single-line and multi-line XML-like blocks (BUG9)
    return capped.replace(/<([a-zA-Z][\w-]*)[\s>][^]*?<\/\1>/g, '').trim();
  }

  private extractDescription(messages: ParsedMessage[]): string {
    const firstAssistant = messages.find(m => m.role === 'assistant' && m.textContent.trim());
    if (!firstAssistant) return '';

    const content = this.stripMarkupTags(firstAssistant.textContent.trim());
    if (!content) return '';
    const firstPara = content.split('\n\n')[0];
    return firstPara.length > MAX_DESCRIPTION_LENGTH ? firstPara.slice(0, MAX_DESCRIPTION_LENGTH - 3) + '...' : firstPara;
  }

  private extractLastMessage(messages: ParsedMessage[]): string {
    const reversed = [...messages].reverse();
    const lastAssistant = reversed.find(m => m.role === 'assistant' && m.textContent.trim());
    if (!lastAssistant) return '';

    const content = this.stripMarkupTags(lastAssistant.textContent.trim());
    if (!content) return '';
    const lines = content.split('\n').filter(l => l.trim());
    // Return the last 2 lines, cropped from the beginning (left) when too long
    const lastTwo = lines.slice(-2);
    const combined = lastTwo.join('\n');
    if (combined.length > MAX_LAST_MESSAGE_LENGTH) {
      return '[...] ' + combined.slice(combined.length - MAX_LAST_MESSAGE_LENGTH + 6);
    }
    return combined;
  }

  private detectStatus(messages: ParsedMessage[], sidechainSteps: SidechainStep[] = []): ConversationStatus {
    if (messages.length === 0) return 'todo';

    const hasAssistant = messages.some(m => m.role === 'assistant');
    if (!hasAssistant) return 'todo';

    const lastMessage = messages[messages.length - 1];
    const recentMessages = messages.slice(-3);

    if (recentMessages.some(m => m.hasError)) {
      return 'needs-input';
    }

    // Rate-limited conversations are paused — mark as needs-input
    if (recentMessages.some(m => m.isRateLimited)) {
      return 'needs-input';
    }

    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      const content = lastAssistant.textContent.toLowerCase();

      // Check for tool-based needs-input (AskUserQuestion, permissions)
      if (lastAssistant.toolUses.some(t =>
        t.name === 'AskUserQuestion' ||
        t.name === 'ExitPlanMode'
      )) {
        return 'needs-input';
      }

      // Check for question / approval patterns (word-bounded to avoid partial
      // matches like "should implement" triggering "should i")
      if (
        /\b(would you like|do you want|shall i|should i\b(?!\w)|please (confirm|approve|review)|which (option|approach) (would|do|should))\b/i.test(content)
      ) {
        // Only treat as needs-input if this is the LAST assistant message and
        // the user hasn't responded yet (i.e. the conversation ended on this).
        if (lastAssistant === lastMessage) {
          return 'needs-input';
        }
      }

      // BUG18: If any background agent is still running, the conversation is
      // actively working regardless of what the main thread says.
      const hasRunningAgents = sidechainSteps.some(s => s.status === 'running');

      // Check for completion (only when no background agents are still running)
      if (
        !hasRunningAgents &&
        /\b(all (done|set|changes)|completed?|finished|i've (made|completed|finished|implemented)|successfully|here's a summary)\b/i.test(content)
      ) {
        return 'in-review';
      }

      if (hasRunningAgents) {
        return 'in-progress';
      }
    }

    // Still actively working
    if (lastMessage.role === 'user') {
      return 'in-progress';
    }

    // Last message from assistant with tool uses — the tool is either currently
    // executing or the session was abandoned. Genuine questions (AskUserQuestion,
    // ExitPlanMode) are already caught above, so a pending tool_use on a recently
    // active session most likely means the tool is still running, not waiting for
    // user permission.
    if (lastMessage.role === 'assistant' && lastMessage.toolUses.length > 0) {
      return 'in-progress';
    }

    return 'in-review';
  }

  private detectAgents(messages: ParsedMessage[]): Agent[] {
    const agents: Agent[] = [];
    const seenTypes = new Set<string>();

    agents.push({
      id: 'claude-main',
      name: 'Claude',
      avatar: '',
      isActive: this.isRecentlyActive(messages)
    });

    for (const message of messages) {
      for (const tool of message.toolUses) {
        if (tool.name === 'Task') {
          const subType = (tool.input as { subagent_type?: string })?.subagent_type;
          const desc = (tool.input as { description?: string })?.description;
          if (subType && !seenTypes.has(subType)) {
            seenTypes.add(subType);
            agents.push({
              id: `agent-${subType}`,
              name: desc || subType,
              avatar: '',
              isActive: false
            });
          }
        }
      }
    }

    return agents;
  }

  /** Only flag errors from the latest message exchange (last user msg onward) */
  private hasRecentError(messages: ParsedMessage[]): boolean {
    // Find the last user message index — everything from there is the latest exchange
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return false;
    return messages.slice(lastUserIdx).some(m => m.hasError);
  }

  /** Check if the latest exchange has a tool interruption or stalled session. */
  private hasRecentInterruption(messages: ParsedMessage[]): boolean {
    // Explicit interrupted flag on any recent message
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx !== -1 && messages.slice(lastUserIdx).some(m => m.isInterrupted)) {
      return true;
    }
    const lastMsg = messages[messages.length - 1];
    // User cancelled mid-tool: "Request interrupted by user" / "[interrupted]"
    if (lastMsg.role === 'user' && /interrupted by user|request interrupted|\[interrupted\]/i.test(lastMsg.textContent)) {
      return true;
    }
    // Last message is assistant with tool_use but no user response.
    // If recently active → tool still executing (not interrupted).
    // If stale → session was interrupted/abandoned.
    if (lastMsg.role === 'assistant' && lastMsg.toolUses.length > 0 && !lastMsg.hasQuestion) {
      return !this.isRecentlyActive(messages);
    }
    return false;
  }

  /** Check if the last assistant message asks an explicit question or awaits permission. */
  private hasRecentQuestion(messages: ParsedMessage[]): boolean {
    // If the conversation was interrupted after the question, it's not a pending question
    if (this.hasRecentInterruption(messages)) return false;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return false;
    if (lastAssistant.hasQuestion) return true;
    // Text-based question detection: if last non-empty line ends with "?"
    const trimmed = lastAssistant.textContent.trimEnd();
    const lastLine = trimmed.split('\n').filter(l => l.trim()).pop();
    if (lastLine && lastLine.trimEnd().endsWith('?')) return true;
    return false;
  }

  /** Check if any recent message carries a rate limit notice that hasn't expired yet. */
  private hasRecentRateLimit(messages: ParsedMessage[]): boolean {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return false;

    const now = Date.now();
    // BUG7: a rate limit is only active if its reset time is still in the future
    return messages.slice(lastUserIdx).some(m => {
      if (!m.isRateLimited) return false;
      if (m.rateLimitResetTime) {
        return new Date(m.rateLimitResetTime).getTime() > now;
      }
      // No parseable reset time — fall back to message age (expire after 6 hours)
      if (m.timestamp) {
        return (now - new Date(m.timestamp).getTime()) < 6 * 60 * 60 * 1000;
      }
      return true;
    });
  }

  /** Extract rate limit reset info from the most recent rate-limited message. */
  private extractRateLimitInfo(messages: ParsedMessage[]): { display?: string; time?: string } {
    for (const msg of [...messages].reverse()) {
      if (msg.isRateLimited) {
        return { display: msg.rateLimitResetDisplay, time: msg.rateLimitResetTime };
      }
    }
    return {};
  }

  /**
   * Parse a human-readable reset time (e.g. "10am", "2:30pm") in a given timezone
   * into the next occurrence after `referenceDate` as an ISO 8601 string.
   *
   * When `referenceDate` is provided (e.g. the message timestamp), the result is
   * anchored to that moment — so a stale rate-limit message from yesterday produces
   * a past date that callers can compare against `now` to detect expiry.
   */
  public static parseResetTime(timeStr: string, timezone: string, referenceDate?: Date): string | undefined {
    try {
      // Parse the time components from strings like "10am", "2:30pm", "10 am"
      const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
      if (!match) return undefined;

      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const meridiem = match[3].toLowerCase();

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      // Use the reference date (message timestamp) or fall back to now
      const ref = referenceDate || new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
      const parts = formatter.formatToParts(ref);
      const get = (type: string) => parts.find(p => p.type === type)?.value || '0';

      const currentYear = parseInt(get('year'), 10);
      const currentMonth = parseInt(get('month'), 10);
      const currentDay = parseInt(get('day'), 10);
      const currentHour = parseInt(get('hour'), 10);
      const currentMinute = parseInt(get('minute'), 10);

      // Build a date in the target timezone for the reference day at the reset time.
      // If that time has passed relative to the reference, advance to the next day.
      let resetDay = currentDay;
      if (hours < currentHour || (hours === currentHour && minutes <= currentMinute)) {
        resetDay += 1;
      }

      // Construct the date string in the target timezone and convert to UTC
      // Use a temporary Date with the timezone offset to find the real UTC moment
      const tzDate = new Date(
        `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(resetDay).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
      );
      // Re-interpret through the formatter to get the correct UTC offset
      const utcFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      // Find the UTC time that corresponds to the target local time
      // by checking what local time `tzDate` maps to in the target timezone
      const localParts = utcFormatter.formatToParts(tzDate);
      const localHour = parseInt(localParts.find(p => p.type === 'hour')?.value || '0', 10);
      const localMinute = parseInt(localParts.find(p => p.type === 'minute')?.value || '0', 10);
      // Calculate the offset in minutes between what we want and what we got
      const wantedMinutes = hours * 60 + minutes;
      const gotMinutes = localHour * 60 + localMinute;
      const offsetMs = (gotMinutes - wantedMinutes) * 60 * 1000;
      const corrected = new Date(tzDate.getTime() - offsetMs);

      // If the corrected time is still before the reference, add 24 hours
      if (corrected.getTime() <= ref.getTime()) {
        corrected.setTime(corrected.getTime() + 24 * 60 * 60 * 1000);
      }

      return corrected.toISOString();
    } catch {
      return undefined;
    }
  }

  /** Tools that represent visible work and are worth showing in the card. */
  private static readonly DISPLAY_TOOLS = new Set([
    'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'Task',
    'WebSearch', 'WebFetch', 'AskUserQuestion', 'NotebookEdit',
  ]);

  /** Extract the last tool activity for display in the task card. */
  private extractLastActivity(messages: ParsedMessage[]): LastActivity | undefined {
    // Walk backwards to find the last assistant message with a displayable tool use
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.toolUses.length > 0) {
        // Pick the last displayable tool (skip internal ones like TodoWrite)
        const displayTool = [...msg.toolUses].reverse()
          .find(t => ConversationParser.DISPLAY_TOOLS.has(t.name));
        if (!displayTool) continue;

        const summary = this.formatToolSummary(displayTool.name, displayTool.input);

        // Check the following user message for tool result info
        const nextMsg = i + 1 < messages.length ? messages[i + 1] : undefined;
        let outputHint: string | undefined;
        let status: 'running' | 'completed' | 'failed' = 'running';

        if (nextMsg && nextMsg.role === 'user') {
          status = (nextMsg.hasError || nextMsg.isInterrupted) ? 'failed' : 'completed';
          outputHint = nextMsg.toolResultHint;
        }

        return { toolName: displayTool.name, summary, outputHint, status };
      }
    }
    return undefined;
  }

  /** Format a brief human-readable summary of tool parameters. */
  private formatToolSummary(toolName: string, input: Record<string, unknown>): string | undefined {
    switch (toolName) {
      case 'Grep': {
        const p = input.path ? ` (in ${this.shortenPath(String(input.path))})` : '';
        return input.pattern ? `"${input.pattern}"${p}` : undefined;
      }
      case 'Glob':
        return input.pattern ? `"${input.pattern}"` : undefined;
      case 'Read':
      case 'Write':
      case 'Edit':
        return input.file_path ? this.shortenPath(String(input.file_path)) : undefined;
      case 'Bash':
        return input.command ? String(input.command) : undefined;
      case 'Task':
        return input.subagent_type ? String(input.subagent_type) : undefined;
      case 'WebSearch':
        return input.query ? `"${input.query}"` : undefined;
      default:
        return undefined;
    }
  }

  /** Shorten a file path to at most the last 2 segments. */
  private shortenPath(p: string): string {
    const parts = p.split('/').filter(Boolean);
    if (parts.length <= 2) return p;
    return '.../' + parts.slice(-2).join('/');
  }

  /** Extract a status text ("Interrupted", "Tool interrupted") from recent messages. */
  private extractLastStatusText(messages: ParsedMessage[]): string | undefined {
    if (messages.length === 0) return undefined;

    // Check recent messages for explicit tool interruption
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 4); i--) {
      if (messages[i].isInterrupted) return 'Tool interrupted';
    }

    const lastMsg = messages[messages.length - 1];
    // User cancelled mid-tool
    if (lastMsg.role === 'user' && /interrupted by user|request interrupted|\[interrupted\]/i.test(lastMsg.textContent)) {
      return 'Interrupted';
    }
    // Stale assistant with pending tool_use → abandoned session
    if (lastMsg.role === 'assistant' && lastMsg.toolUses.length > 0 && !lastMsg.hasQuestion) {
      if (!this.isRecentlyActive(messages)) return 'Interrupted';
    }

    return undefined;
  }

  private isRecentlyActive(messages: ParsedMessage[]): boolean {
    const last = messages[messages.length - 1];
    if (!last?.timestamp) return false;
    return (Date.now() - new Date(last.timestamp).getTime()) < RECENTLY_ACTIVE_WINDOW_MS;
  }

  private extractErrorMessage(messages: ParsedMessage[]): string {
    for (const msg of [...messages.slice(-5)].reverse()) {
      if (msg.hasError) {
        // Match "API Error: 500 ..." pattern
        const apiMatch = msg.textContent.match(/API Error:\s*\d{3}\s*(.{0,100})/i);
        if (apiMatch) return `API Error: ${apiMatch[0].slice(0, 100)}`;
        // Fallback: "Tool interrupted"
        return 'Tool interrupted';
      }
    }
    return 'An error occurred';
  }

  private detectGitBranchFromMessages(messages: ParsedMessage[]): string | undefined {
    for (const msg of [...messages].reverse()) {
      if (msg.gitBranch && msg.gitBranch !== 'HEAD') return msg.gitBranch;
    }
    for (const msg of messages) {
      const match = msg.textContent.match(/(?:branch|checkout\s+-b)\s+([a-zA-Z0-9\-_/]+)/i);
      if (match) return match[1];
    }
    return undefined;
  }

  private static readonly IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;

  /**
   * Find the first image file referenced in the conversation.
   * Checks Read tool calls and user text for @-referenced image paths.
   */
  private extractReferencedImage(messages: ParsedMessage[]): string | undefined {
    // 1. Check Read tool_use inputs for image file paths
    for (const msg of messages) {
      for (const tool of msg.toolUses) {
        if (tool.name === 'Read') {
          const fp = (tool.input as { file_path?: string })?.file_path;
          if (fp && ConversationParser.IMAGE_EXTENSIONS.test(fp)) {
            return fp;
          }
        }
      }
    }

    // 2. Check user text for file paths that look like images
    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      // Match absolute paths or relative paths ending in image extensions
      const match = msg.textContent.match(/(?:^|\s|@)((?:\/|\.\.?\/)[^\s]+\.(png|jpe?g|gif|webp|svg))\b/i);
      if (match) return match[1];
    }

    return undefined;
  }

  /**
   * Extract the workspace path from a conversation file path.
   * The encoded directory name (e.g. `-Users-matthias-Development-ai-stick`) is lossy
   * — dashes in the original path are indistinguishable from separator dashes.
   * Instead of guessing, check the actual filesystem for matching paths.
   */
  private async extractWorkspacePath(filePath: string): Promise<string | undefined> {
    const parts = filePath.split(path.sep);
    const projectsIndex = parts.indexOf('projects');
    if (projectsIndex === -1 || !parts[projectsIndex + 1]) return undefined;
    
    // macOS and Windows use case-insensitive filesystems; Claude Code may lowercase parts of
    // the encoded project directory name on these platforms.
    const ignoreCase = process.platform === 'win32' || process.platform === 'darwin';
    const encoded = ignoreCase
      ? parts[projectsIndex + 1].toLowerCase()
      : parts[projectsIndex + 1];
    const roots = await this.getFilesystemRoots();
    
    for (const root of roots) {
      const result = await this.resolveEncodedPath(encoded, root, ignoreCase);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  private async getFilesystemRoots(): Promise<string[]> {
    if (process.platform !== 'win32') return ['/'];
    try {
      const stdout = await new Promise<string>((resolve, reject) =>
        execFile('fsutil', ['fsinfo', 'drives'], (err, out) => err ? reject(err) : resolve(out))
      );
      // Output e.g. "Drives: C:\ D:\ E:\ G:\"
      const drives = stdout.match(/[A-Za-z]:\\/g);
      if (drives && drives.length > 0) return drives;
    } catch {
      console.warn('Failed to get Windows drives, defaulting to C:\\');
    }
    return ['C:\\'];
  }

  /**
   * Walk the filesystem from `currentPath`, encoding each candidate path the 
   * same way Claude does, and checking it as a prefix of `encoded`.
   */
  private async resolveEncodedPath(encoded: string, currentPath: string, ignoreCase = false): Promise<string | undefined> {
    const currentEncoded = ignoreCase
      ? currentPath.replace(/[/\\.:_]/g, '-').toLowerCase()
      : currentPath.replace(/[/\\.:_]/g, '-');
    
    if (currentEncoded === encoded) return currentPath;
    if (!encoded.startsWith(currentEncoded)) return undefined;

    let entries: Dirent[];
    try {
      entries = await fsp.readdir(currentPath, { withFileTypes: true }) as Dirent[];
    } catch {
      return undefined;
    }
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childPath = path.join(currentPath, entry.name);
      const result = await this.resolveEncodedPath(encoded, childPath, ignoreCase);
      if (result !== undefined) return result;
    }
    return undefined;
  }
}
