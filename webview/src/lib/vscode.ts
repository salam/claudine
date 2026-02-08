// VSCode Webview API bridge

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __CLAUDINE_TOKEN__?: string;
  }
}

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

class VSCodeAPIWrapper {
  private readonly vscode: VsCodeApi | undefined;

  constructor() {
    if (typeof window !== 'undefined' && window.acquireVsCodeApi) {
      this.vscode = window.acquireVsCodeApi();
    }
  }

  public postMessage(message: unknown): void {
    if (this.vscode) {
      const msg = typeof message === 'object' && message !== null
        ? { ...message, _token: window.__CLAUDINE_TOKEN__ }
        : message;
      this.vscode.postMessage(msg);
    } else {
      console.log('VSCode API not available, message:', message);
    }
  }

  public getState<T>(): T | undefined {
    if (this.vscode) {
      return this.vscode.getState() as T | undefined;
    }
    return undefined;
  }

  public setState<T>(state: T): void {
    if (this.vscode) {
      this.vscode.setState(state);
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
}

export type ToolbarAction = 'toggleSearch' | 'toggleFilter' | 'toggleCompactView' | 'toggleExpandAll' | 'toggleArchive';

export interface ClaudineSettings {
  imageGenerationApi: 'openai' | 'stability' | 'none';
  claudeCodePath: string;
  enableSummarization: boolean;
  hasApiKey: boolean;
  viewLocation: 'panel' | 'sidebar';
  toolbarLocation: 'sidebar' | 'titlebar' | 'both';
  autoRestartAfterRateLimit: boolean;
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
  | { type: 'toolbarAction'; action: ToolbarAction };
