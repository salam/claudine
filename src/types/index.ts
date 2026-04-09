export type ConversationCategory = 'user-story' | 'bug' | 'feature' | 'improvement' | 'task';

export type ConversationStatus = 'todo' | 'needs-input' | 'in-progress' | 'in-review' | 'done' | 'cancelled' | 'archived';

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  isActive: boolean;
}

export type SidechainStepStatus = 'running' | 'completed' | 'failed' | 'idle';

export interface SidechainStep {
  status: SidechainStepStatus;
  toolName?: string;
}

export interface LastActivity {
  toolName: string;
  /** Brief parameter summary, e.g. '"getGridState" (in src/)' */
  summary?: string;
  /** Brief output hint, e.g. '147 lines of output' */
  outputHint?: string;
  /** Status of the last tool invocation */
  status: 'running' | 'completed' | 'failed';
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
  isRateLimited: boolean;
  /** Human-readable reset display, e.g. "10am (Europe/Zurich)". */
  rateLimitResetDisplay?: string;
  /** Absolute ISO datetime when the rate limit lifts. */
  rateLimitResetTime?: string;
  icon?: string;
  sidechainSteps?: SidechainStep[];
  /** Last tool activity for display in the card. */
  lastActivity?: LastActivity;
  /** Status text like "Interrupted" or "Tool interrupted". */
  lastStatusText?: string;
  referencedImage?: string;
  originalTitle?: string;
  originalDescription?: string;
  createdAt: Date;
  updatedAt: Date;
  filePath?: string;
  workspacePath?: string;
  /** Claude Code worktree name, when the conversation belongs to a managed worktree. */
  worktreeName?: string;
  /** Which conversation provider produced this conversation (e.g. 'claude-code'). */
  provider?: string;
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

// ── Project manifest (standalone progressive loading) ─────────────

export interface ProjectManifestEntry {
  /** Encoded directory name under ~/.claude/projects/ */
  encodedPath: string;
  /** Decoded workspace path (best-effort) */
  decodedPath?: string;
  /** Display name (last path component) */
  name: string;
  /** Number of .jsonl files found (fast count, no parsing) */
  fileCount: number;
  /** Whether this project is enabled for loading */
  enabled: boolean;
  /** Whether this was auto-excluded (temp dir) */
  autoExcluded: boolean;
  /** Reason for auto-exclusion, if any */
  excludeReason?: string;
}

export type IndexingPhase = 'idle' | 'discovery' | 'scanning' | 'complete';

// Messages between extension and webview
export type ExtensionToWebviewMessage =
  | { type: 'updateConversations'; conversations: Conversation[] }
  | { type: 'updateSettings'; settings: ClaudineSettings }
  | { type: 'updateLocale'; strings: Record<string, string> }
  | { type: 'conversationUpdated'; conversation: Conversation }
  | { type: 'removeConversations'; ids: string[] }
  | { type: 'focusedConversation'; conversationId: string | null }
  | { type: 'searchResults'; query: string; ids: string[] }
  | { type: 'draftsLoaded'; drafts: Array<{ id: string; title: string }> }
  | { type: 'apiTestResult'; success: boolean; error?: string }
  | { type: 'error'; message: string }
  | { type: 'toolbarAction'; action: ToolbarAction }
  | { type: 'indexingProgress'; phase: IndexingPhase; totalProjects: number; scannedProjects: number; totalFiles: number; scannedFiles: number; currentProject?: string }
  | { type: 'projectDiscovered'; projects: ProjectManifestEntry[] }
  | { type: 'projectConversationsLoaded'; projectPath: string; conversations: Conversation[] }
  | { type: 'folderSelected'; path: string };

export type OpenConversationTarget = 'terminal' | 'vscode' | 'cursor' | 'codex-vscode' | 'codex-cursor';

export type WebviewToExtensionMessage =
  | { type: 'sendPrompt'; conversationId: string; prompt: string }
  | { type: 'openConversation'; conversationId: string }
  | { type: 'openConversationAs'; conversationId: string; target: OpenConversationTarget }
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
  | { type: 'setupAgentIntegration' }
  | { type: 'testApiConnection' }
  | { type: 'toggleAutoRestart' }
  | { type: 'setProjectEnabled'; projectPath: string; enabled: boolean }
  | { type: 'setAllProjectsEnabled'; enabled: boolean }
  | { type: 'openExternal'; url: string }
  | { type: 'browseWorkspaceFolder' }
  | { type: 'ready' };

export type ToolbarAction = 'toggleSearch' | 'toggleFilter' | 'toggleCompactView' | 'toggleExpandAll' | 'toggleArchive' | 'zoomIn' | 'zoomOut' | 'zoomReset' | 'toggleSettingsPanel' | 'toggleAbout';

export type MonitoredWorkspace =
  | { mode: 'auto' }
  | { mode: 'single'; path: string }
  | { mode: 'multi'; paths: string[] };

export interface CustomTerminalConfig {
  command: string;
  args: string[];
}

export interface ClaudineSettings {
  imageGenerationApi: 'openai' | 'stability' | 'none';
  claudeCodePath: string;
  codexPath: string;
  enableSummarization: boolean;
  hasApiKey: boolean;
  toolbarLocation: 'sidebar' | 'titlebar';
  autoRestartAfterRateLimit: boolean;
  showTaskIcon: boolean;
  showTaskDescription: boolean;
  showTaskLatest: boolean;
  showTaskGitBranch: boolean;
  monitoredWorkspace: MonitoredWorkspace;
  monitorWorktrees: boolean;
  detectedWorkspacePaths: string[];
  customTerminals: CustomTerminalConfig[];
}

// Claude Code data structures (based on actual file format)
// Each line in a JSONL conversation file is one of these:
export interface ClaudeCodeJsonlEntry {
  type: 'user' | 'assistant' | 'file-history-snapshot' | 'queue-operation' | 'worktree-state';
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
  // worktree-state fields
  worktreeSession?: { worktreeName: string; [key: string]: unknown } | null;
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
  isRateLimited: boolean;
  /** Human-readable reset display, e.g. "10am (Europe/Zurich)". */
  rateLimitResetDisplay?: string;
  /** Absolute ISO datetime when the rate limit lifts. */
  rateLimitResetTime?: string;
  /** Brief hint from the last tool result in this message (max ~100 chars). */
  toolResultHint?: string;
}

export interface ClaudeCodeSession {
  id: string;
  projectPath: string;
  messages: ParsedMessage[];
  createdAt: string;
  updatedAt: string;
}

// ── OpenAI Codex data structures ──────────────────────────────────

/** Top-level envelope for each line in a Codex session JSONL file. */
export interface CodexJsonlEnvelope {
  timestamp: string; // ISO 8601
  type: string;      // e.g. 'session_meta', 'event_msg', 'response_item'
  payload: CodexSessionMetaPayload | CodexEventMsgPayload | CodexResponseItemPayload | Record<string, unknown>;
}

/**
 * Payload for `type: 'session_meta'` — first line of every session file.
 * Fields are flat on the payload (not nested inside a `meta` sub-object).
 */
export interface CodexSessionMetaPayload {
  id: string;        // session UUID
  cwd: string;       // workspace path
  timestamp: string; // ISO 8601
}

/**
 * Payload for `type: 'response_item'` — rich message payloads containing
 * user input (`input_text`) or assistant output (`output_text`).
 */
export interface CodexResponseItemPayload {
  type: 'message' | 'reasoning' | string;
  role?: 'user' | 'assistant';
  content?: Array<{ type: string; text?: string }> | null;
}

/**
 * Payload for `type: 'event_msg'` — discriminated on `payload.type`.
 *
 * Not every event type is modelled here; unknown types are silently ignored
 * by the parser so the union can grow over time.
 */
export type CodexEventMsgPayload =
  | { type: 'user_message';      message: string }
  | { type: 'agent_message';     message: string }
  | { type: 'agent_reasoning';   text: string }
  | { type: 'task_started' }
  | { type: 'task_complete';     last_agent_message?: string | null }
  | { type: 'turn_aborted' }
  | { type: 'error';             error?: string; message?: string }
  | { type: 'exec_command_begin'; command: string }
  | { type: 'exec_command_end';  exit_code?: number }
  | { type: 'mcp_tool_call_begin'; tool_name?: string }
  | { type: 'mcp_tool_call_end';  tool_name?: string }
  | { type: 'rate_limit';        reset_at?: string; message?: string };

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
