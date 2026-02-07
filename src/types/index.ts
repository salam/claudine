export type ConversationCategory = 'user-story' | 'bug' | 'feature' | 'improvement' | 'task';

export type ConversationStatus = 'todo' | 'needs-input' | 'in-progress' | 'in-review' | 'done' | 'cancelled' | 'archived';

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  isActive: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  description: string;
  category: ConversationCategory;
  status: ConversationStatus;
  /** Status before the conversation entered in-progress (for restoring on completion). */
  previousStatus?: ConversationStatus;
  lastMessage: string;
  agents: Agent[];
  gitBranch?: string;
  hasError: boolean;
  errorMessage?: string;
  isInterrupted: boolean;
  hasQuestion: boolean;
  icon?: string;
  referencedImage?: string;
  originalTitle?: string;
  originalDescription?: string;
  createdAt: Date;
  updatedAt: Date;
  filePath?: string;
  workspacePath?: string;
}

export interface KanbanColumn {
  id: ConversationStatus;
  title: string;
  conversations: Conversation[];
}

export interface BoardState {
  columns: KanbanColumn[];
  lastUpdated: Date;
}

// Messages between extension and webview
export type ExtensionToWebviewMessage =
  | { type: 'updateConversations'; conversations: Conversation[] }
  | { type: 'updateSettings'; settings: ClaudineSettings }
  | { type: 'conversationUpdated'; conversation: Conversation }
  | { type: 'focusedConversation'; conversationId: string | null }
  | { type: 'searchResults'; query: string; ids: string[] }
  | { type: 'draftsLoaded'; drafts: Array<{ id: string; title: string }> }
  | { type: 'error'; message: string };

export type WebviewToExtensionMessage =
  | { type: 'sendPrompt'; conversationId: string; prompt: string }
  | { type: 'openConversation'; conversationId: string }
  | { type: 'openGitBranch'; conversationId: string; branch?: string }
  | { type: 'moveConversation'; conversationId: string; newStatus: ConversationStatus }
  | { type: 'refreshConversations' }
  | { type: 'toggleSummarization' }
  | { type: 'updateSetting'; key: string; value: unknown }
  | { type: 'regenerateIcons' }
  | { type: 'search'; query: string }
  | { type: 'quickIdea'; prompt: string }
  | { type: 'saveDrafts'; drafts: Array<{ id: string; title: string }> }
  | { type: 'closeEmptyClaudeTabs' }
  | { type: 'ready' };

export interface ClaudineSettings {
  imageGenerationApi: 'openai' | 'stability' | 'none';
  claudeCodePath: string;
  enableSummarization: boolean;
  hasApiKey: boolean;
}

// Claude Code data structures (based on actual file format)
// Each line in a JSONL conversation file is one of these:
export interface ClaudeCodeJsonlEntry {
  type: 'user' | 'assistant' | 'file-history-snapshot' | 'queue-operation';
  uuid: string;
  timestamp: string; // ISO 8601
  sessionId: string;
  parentUuid: string | null;
  isSidechain: boolean;
  userType?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  slug?: string;
  requestId?: string;
  permissionMode?: string;
  message?: ClaudeCodeApiMessage;
  // tool execution result (entry-level, separate from message.content)
  toolUseResult?: { interrupted?: boolean; stdout?: string; stderr?: string };
  // file-history-snapshot fields
  snapshot?: unknown;
  // queue-operation fields
  operation?: string;
}

export interface ClaudeCodeApiMessage {
  role: 'user' | 'assistant';
  content: ClaudeCodeContent[];
  model?: string;
  id?: string;
  type?: string;
  stop_reason?: string | null;
  usage?: Record<string, unknown>;
}

export interface ClaudeCodeContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  content?: string | ClaudeCodeContent[];
  tool_use_id?: string;
}

// Parsed message (simplified for our use)
export interface ParsedMessage {
  role: 'user' | 'assistant';
  textContent: string;
  toolUses: Array<{ name: string; input: Record<string, unknown> }>;
  timestamp: string;
  gitBranch?: string;
  hasError: boolean;
  isInterrupted: boolean;
  hasQuestion: boolean;
}

export interface ClaudeCodeSession {
  id: string;
  projectPath: string;
  messages: ParsedMessage[];
  createdAt: string;
  updatedAt: string;
}

// Agent command interface (for external Claude Code agents)
export type AgentCommandType = 'move' | 'update' | 'set-category';

export interface AgentCommand {
  id: string;
  command: AgentCommandType;
  task: string;
  status?: ConversationStatus;
  title?: string;
  description?: string;
  category?: ConversationCategory;
  timestamp: string;
}

export interface AgentCommandResult {
  commandId: string;
  success: boolean;
  error?: string;
  timestamp: string;
}
