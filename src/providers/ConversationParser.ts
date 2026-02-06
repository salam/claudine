import * as path from 'path';
import * as fs from 'fs';
import { CategoryClassifier } from '../services/CategoryClassifier';
import {
  Conversation,
  ConversationStatus,
  Agent,
  ParsedMessage,
  ClaudeCodeJsonlEntry,
  ClaudeCodeContent
} from '../types';

export class ConversationParser {
  private _classifier: CategoryClassifier;

  constructor() {
    this._classifier = new CategoryClassifier();
  }

  public async parseFile(filePath: string): Promise<Conversation | null> {
    try {
      if (!filePath.endsWith('.jsonl')) return null;

      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.trim()) return null;

      return this.parseJsonlFile(filePath, content);
    } catch (error) {
      console.error(`Claudine: Error parsing file ${filePath}:`, error);
      return null;
    }
  }

  private parseJsonlFile(filePath: string, content: string): Conversation | null {
    const lines = content.trim().split('\n').filter(line => line.trim());
    if (lines.length === 0) return null;

    const messages: ParsedMessage[] = [];
    let firstTimestamp: string | undefined;
    let lastTimestamp: string | undefined;
    let detectedGitBranch: string | undefined;

    for (const line of lines) {
      try {
        const entry: ClaudeCodeJsonlEntry = JSON.parse(line);

        // Track timestamps
        if (entry.timestamp) {
          if (!firstTimestamp) firstTimestamp = entry.timestamp;
          lastTimestamp = entry.timestamp;
        }

        // Track git branch from entry metadata
        if (entry.gitBranch && entry.gitBranch !== 'HEAD') {
          detectedGitBranch = entry.gitBranch;
        }

        // Only process user and assistant messages that have a message body
        if ((entry.type !== 'user' && entry.type !== 'assistant') || !entry.message) {
          continue;
        }

        const parsed = this.parseMessage(entry);
        if (parsed) {
          messages.push(parsed);
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (messages.length === 0) return null;

    return this.buildConversation(filePath, messages, firstTimestamp, lastTimestamp, detectedGitBranch);
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

    for (const block of contentBlocks) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      } else if (block.type === 'tool_use' && block.name) {
        toolUses.push({
          name: block.name,
          input: block.input || {}
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
      hasQuestion
    };
  }

  private buildConversation(
    filePath: string,
    messages: ParsedMessage[],
    firstTimestamp: string | undefined,
    lastTimestamp: string | undefined,
    gitBranch: string | undefined
  ): Conversation {
    const id = this.extractSessionId(filePath);
    const title = this.extractTitle(messages);
    const description = this.extractDescription(messages);
    const lastMessage = this.extractLastMessage(messages);
    const status = this.detectStatus(messages);
    const category = this._classifier.classify(title, description, messages);
    const agents = this.detectAgents(messages);
    const hasError = this.hasRecentError(messages);
    const isInterrupted = this.hasRecentInterruption(messages);
    const hasQuestion = this.hasRecentQuestion(messages);

    let createdAt: Date;
    let updatedAt: Date;
    try {
      const stats = fs.statSync(filePath);
      createdAt = firstTimestamp ? new Date(firstTimestamp) : stats.birthtime;
      updatedAt = lastTimestamp ? new Date(lastTimestamp) : stats.mtime;
    } catch {
      createdAt = firstTimestamp ? new Date(firstTimestamp) : new Date();
      updatedAt = lastTimestamp ? new Date(lastTimestamp) : new Date();
    }

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
      referencedImage: this.extractReferencedImage(messages),
      createdAt,
      updatedAt,
      filePath,
      workspacePath: this.extractWorkspacePath(filePath)
    };
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
    return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
  }

  /** Strip XML-like tags and their content (ide_opened_file, system-reminder, etc.) */
  private stripMarkupTags(text: string): string {
    return text.replace(/<[a-zA-Z_:-]+[^>]*>[\s\S]*?<\/[a-zA-Z_:-]+>/g, '').trim();
  }

  private extractDescription(messages: ParsedMessage[]): string {
    const firstAssistant = messages.find(m => m.role === 'assistant' && m.textContent.trim());
    if (!firstAssistant) return '';

    const content = firstAssistant.textContent.trim();
    const firstPara = content.split('\n\n')[0];
    return firstPara.length > 200 ? firstPara.slice(0, 197) + '...' : firstPara;
  }

  private extractLastMessage(messages: ParsedMessage[]): string {
    const reversed = [...messages].reverse();
    const lastAssistant = reversed.find(m => m.role === 'assistant' && m.textContent.trim());
    if (!lastAssistant) return '';

    const content = lastAssistant.textContent.trim();
    const lines = content.split('\n').filter(l => l.trim());
    const lastLine = lines[lines.length - 1] || '';
    return lastLine.length > 120 ? lastLine.slice(0, 117) + '...' : lastLine;
  }

  private detectStatus(messages: ParsedMessage[]): ConversationStatus {
    if (messages.length === 0) return 'todo';

    const hasAssistant = messages.some(m => m.role === 'assistant');
    if (!hasAssistant) return 'todo';

    const lastMessage = messages[messages.length - 1];
    const recentMessages = messages.slice(-3);

    if (recentMessages.some(m => m.hasError)) {
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

      // Check for question / approval patterns
      if (
        /would you like|do you want|should i|please (confirm|approve|review)|which (option|approach)/i.test(content)
      ) {
        return 'needs-input';
      }

      // Check for completion
      if (
        /\b(all (done|set|changes)|completed?|finished|i've (made|completed|finished|implemented)|successfully|here's a summary)\b/i.test(content)
      ) {
        return 'in-review';
      }
    }

    // Still actively working
    if (lastMessage.role === 'user') {
      return 'in-progress';
    }

    // Last message from assistant with tool uses
    if (lastMessage.role === 'assistant' && lastMessage.toolUses.length > 0) {
      // Recently active → likely waiting for permission approval
      if (this.isRecentlyActive(messages)) return 'needs-input';
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
    // If recently active → waiting for permission (not interrupted).
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
    // Pending tool_use on a recently active conversation → waiting for permission
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'assistant' && lastMsg.toolUses.length > 0 && this.isRecentlyActive(messages)) {
      return true;
    }
    return false;
  }

  private isRecentlyActive(messages: ParsedMessage[]): boolean {
    const last = messages[messages.length - 1];
    if (!last?.timestamp) return false;
    return (Date.now() - new Date(last.timestamp).getTime()) < 2 * 60 * 1000;
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
      const match = msg.textContent.match(/(?:branch|checkout\s+-b)\s+([a-zA-Z0-9\-_\/]+)/i);
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
  private extractWorkspacePath(filePath: string): string | undefined {
    const parts = filePath.split(path.sep);
    const projectsIndex = parts.indexOf('projects');
    if (projectsIndex === -1 || !parts[projectsIndex + 1]) return undefined;

    const encoded = parts[projectsIndex + 1]; // e.g. "-Users-matthias-Development-ai-stick"
    const segments = encoded.split('-').filter(Boolean); // ["Users","matthias","Development","ai","stick"]

    // Greedily rebuild the path by checking which combinations exist on disk
    let current: string = path.sep;
    let i = 0;
    while (i < segments.length) {
      // Try joining progressively more segments with hyphens to handle names like "ai-stick"
      let found = false;
      for (let len = segments.length - i; len >= 1; len--) {
        const candidate = segments.slice(i, i + len).join('-');
        const testPath = path.join(current, candidate);
        try {
          if (fs.existsSync(testPath)) {
            current = testPath;
            i += len;
            found = true;
            break;
          }
        } catch {
          // ignore fs errors
        }
      }
      if (!found) {
        // Can't resolve — fall back to simple single-segment
        current = path.join(current, segments[i]);
        i++;
      }
    }

    return fs.existsSync(current) ? current : undefined;
  }
}
