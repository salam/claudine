// VSCode Webview API bridge — supports both VSCode postMessage and standalone WebSocket

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __CLAUDINE_TOKEN__?: string;
    __CLAUDINE_STANDALONE__?: boolean;
    __CLAUDINE_WS_URL__?: string;
  }
}

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

/** Reconnection parameters for standalone WebSocket. */
const WS_RECONNECT_BASE_MS = 500;
const WS_RECONNECT_MAX_MS = 10_000;

class VSCodeAPIWrapper {
  private readonly vscode: VsCodeApi | undefined;
  private _ws: WebSocket | undefined;
  private _wsReconnectDelay = WS_RECONNECT_BASE_MS;
  private _wsReconnectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (typeof window !== 'undefined' && window.acquireVsCodeApi) {
      this.vscode = window.acquireVsCodeApi();
    } else if (typeof window !== 'undefined' && window.__CLAUDINE_STANDALONE__) {
      this._connectWebSocket();
    }
  }

  public postMessage(message: unknown): void {
    const msg = typeof message === 'object' && message !== null
      ? { ...message, _token: window.__CLAUDINE_TOKEN__ }
      : message;

    if (this.vscode) {
      this.vscode.postMessage(msg);
    } else if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg));
    } else {
      console.log('No transport available, message:', message);
    }
  }

  public getState<T>(): T | undefined {
    if (this.vscode) {
      return this.vscode.getState() as T | undefined;
    }
    // Standalone: use localStorage
    try {
      const stored = localStorage.getItem('claudine-state');
      return stored ? JSON.parse(stored) as T : undefined;
    } catch {
      return undefined;
    }
  }

  public setState<T>(state: T): void {
    if (this.vscode) {
      this.vscode.setState(state);
    } else {
      try {
        localStorage.setItem('claudine-state', JSON.stringify(state));
      } catch {
        // localStorage may be full or unavailable
      }
    }
  }

  /** Merge partial state into existing webview state (safe for concurrent writes). */
  public mergeState(partial: Record<string, unknown>): void {
    const current = (this.getState<Record<string, unknown>>() ?? {});
    this.setState({ ...current, ...partial });
  }

  public get isInVSCode(): boolean {
    return !!this.vscode;
  }

  /** Open a URL in the system browser (VS Code) or a new tab (standalone). */
  public openLink(url: string): void {
    if (this.vscode) {
      this.postMessage({ type: 'openExternal', url });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  public get isStandalone(): boolean {
    return !this.vscode && !!window.__CLAUDINE_STANDALONE__;
  }

  // ── WebSocket transport for standalone mode ──────────────────────

  private _connectWebSocket() {
    const wsUrl = window.__CLAUDINE_WS_URL__;
    if (!wsUrl) return;

    try {
      this._ws = new WebSocket(wsUrl);

      this._ws.onopen = () => {
        this._wsReconnectDelay = WS_RECONNECT_BASE_MS;
        // Send ready to trigger initial state push from server
        this.postMessage({ type: 'ready' });
      };

      this._ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Dispatch as a window MessageEvent so App.svelte's handler picks it up
          window.dispatchEvent(new MessageEvent('message', { data }));
        } catch (err) {
          console.error('Claudine: Error parsing WebSocket message', err);
        }
      };

      this._ws.onclose = () => {
        this._scheduleReconnect();
      };

      this._ws.onerror = () => {
        // onclose fires after onerror — reconnect handled there
      };
    } catch (err) {
      console.error('Claudine: WebSocket connection failed', err);
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect() {
    clearTimeout(this._wsReconnectTimer);
    this._wsReconnectTimer = setTimeout(() => {
      this._wsReconnectDelay = Math.min(this._wsReconnectDelay * 2, WS_RECONNECT_MAX_MS);
      this._connectWebSocket();
    }, this._wsReconnectDelay);
  }
}

export const vscode = new VSCodeAPIWrapper();

// Message types (matching the extension types)
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

export interface Conversation {
  id: string;
  title: string;
  description: string;
  category: ConversationCategory;
  status: ConversationStatus;
  previousStatus?: ConversationStatus;
  lastMessage: string;
  agents: Agent[];
  gitBranch?: string;
  hasError: boolean;
  errorMessage?: string;
  isInterrupted: boolean;
  hasQuestion: boolean;
  isRateLimited: boolean;
  rateLimitResetDisplay?: string;
  rateLimitResetTime?: string;
  sidechainSteps?: SidechainStep[];
  icon?: string;
  isDraft?: boolean;
  originalTitle?: string;
  originalDescription?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  workspacePath?: string;
}

/** A group of conversations belonging to the same project. */
export interface ProjectGroup {
  /** Display name derived from the workspace path (last directory component). */
  name: string;
  /** Full workspace path, e.g. "/Users/matthias/Development/claudine". */
  path: string;
  /** Conversations belonging to this project. */
  conversations: Conversation[];
  /** Count of active (non-archived) conversations. */
  activeCount: number;
  /** Count of conversations currently in-progress. */
  inProgressCount: number;
  /** True if any conversation has an error or needs input. */
  needsAttention: boolean;
}

export type ToolbarAction = 'toggleSearch' | 'toggleFilter' | 'toggleCompactView' | 'toggleExpandAll' | 'toggleArchive';

export interface ClaudineSettings {
  imageGenerationApi: 'openai' | 'stability' | 'none';
  claudeCodePath: string;
  enableSummarization: boolean;
  hasApiKey: boolean;
  toolbarLocation: 'sidebar' | 'titlebar' | 'both';
  autoRestartAfterRateLimit: boolean;
  showTaskIcon: boolean;
  showTaskDescription: boolean;
  showTaskLatest: boolean;
  showTaskGitBranch: boolean;
}

export type IndexingPhase = 'idle' | 'discovery' | 'scanning' | 'complete';

export interface ProjectManifestEntry {
  encodedPath: string;
  decodedPath?: string;
  name: string;
  fileCount: number;
  enabled: boolean;
  autoExcluded: boolean;
  excludeReason?: string;
}

export type ExtensionMessage =
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
  | { type: 'projectConversationsLoaded'; projectPath: string; conversations: Conversation[] };
