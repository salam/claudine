import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { StateManager } from '../services/StateManager';
import { ClaudeCodeWatcher } from './ClaudeCodeWatcher';
import { TabManager } from './TabManager';
import {
  Conversation,
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
  ClaudineSettings
} from '../types';
import {
  ARCHIVE_CHECK_INTERVAL_MS,
  FOCUS_SUPPRESS_DURATION_MS,
  EDITOR_FOCUS_DELAY_MS,
  TAB_MAPPING_DELAY_MS,
  NONCE_BYTES,
  AUTO_RESTART_PROMPT,
  AUTO_RESTART_GRACE_MS
} from '../constants';

export class KanbanViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudine.kanbanView';

  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _archiveTimer: ReturnType<typeof setInterval>;
  private _focusEditorTimer: ReturnType<typeof setTimeout> | undefined;
  private _autoRestartTimer: ReturnType<typeof setTimeout> | undefined;
  private _secrets?: vscode.SecretStorage;
  private _authToken: string = '';
  private _tabManager: TabManager;
  /** Fingerprints of last-sent conversations, keyed by ID. */
  private _lastSentFingerprints = new Map<string, string>();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _stateManager: StateManager,
    private readonly _claudeCodeWatcher: ClaudeCodeWatcher
  ) {
    this._tabManager = new TabManager(_stateManager);
    this._tabManager.onFocusChanged = (conversationId) => {
      this.sendMessage({ type: 'focusedConversation', conversationId });
    };
    this._tabManager.onOpenConversation = (id) => {
      this.openConversation(id);
    };

    this._stateManager.onConversationsChanged((conversations) => {
      this.sendDiff(conversations);
    });

    this._archiveTimer = setInterval(() => {
      this._stateManager.archiveStaleConversations();
    }, ARCHIVE_CHECK_INTERVAL_MS);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    // Clean up listeners from a previous view (e.g. when switching panel ↔ sidebar)
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];

    this._view = webviewView;
    this._authToken = crypto.randomBytes(NONCE_BYTES).toString('hex');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'webview', 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'resources')
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    this._disposables.push(
      webviewView.webview.onDidReceiveMessage(
        (message: WebviewToExtensionMessage & { _token?: string }) => {
          if (message._token !== this._authToken) {
            console.warn('Claudine: Rejected webview message with invalid auth token');
            return;
          }
          this.handleWebviewMessage(message);
        }
      ),
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this.refresh();
          this.resumeArchiveTimer();
        } else {
          this.pauseArchiveTimer();
        }
      })
    );

    // Track which editor/terminal is focused to detect active Claude Code conversation
    this._disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(() => {
        this._tabManager.pruneStaleTabMappings();
        this._tabManager.scheduleFocusDetection();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this._tabManager.scheduleFocusDetection();
      }),
      vscode.window.onDidChangeActiveTerminal(() => {
        this._tabManager.scheduleFocusDetection();
      })
    );
  }

  private handleWebviewMessage(message: WebviewToExtensionMessage) {
    switch (message.type) {
      case 'ready':
        this.refresh();
        this.updateSettings();
        this.sendLocale();
        this.loadDrafts();
        this._tabManager.detectFocusedConversation();
        break;

      case 'sendPrompt':
        this.sendPromptToConversation(message.conversationId, message.prompt);
        break;

      case 'openConversation':
        this.openConversation(message.conversationId);
        break;

      case 'openGitBranch':
        this.openGitBranch(message.branch);
        break;

      case 'moveConversation':
        if (message.newStatus === 'done' || message.newStatus === 'cancelled') {
          this.interruptConversation(message.conversationId);
        }
        this._stateManager.moveConversation(message.conversationId, message.newStatus);
        break;

      case 'refreshConversations':
        this._claudeCodeWatcher.refresh();
        break;

      case 'search': {
        const ids = this._claudeCodeWatcher.searchConversations(message.query);
        this.sendMessage({ type: 'searchResults', query: message.query, ids });
        break;
      }

      case 'toggleSummarization': {
        const cfg = vscode.workspace.getConfiguration('claudine');
        const current = cfg.get<boolean>('enableSummarization', false);
        cfg.update('enableSummarization', !current, vscode.ConfigurationTarget.Global).then(() => {
          this.updateSettings();
          if (!current) {
            this._claudeCodeWatcher.refresh();
          }
        });
        break;
      }

      case 'updateSetting': {
        const ALLOWED_SETTING_KEYS = [
          'imageGenerationApi',
          'enableSummarization',
          'autoRestartAfterRateLimit'
        ];
        if (message.key === 'imageGenerationApiKey') {
          this._secrets?.store('imageGenerationApiKey', String(message.value ?? '')).then(() => {
            this.updateSettings();
          });
        } else if (ALLOWED_SETTING_KEYS.includes(message.key)) {
          const config = vscode.workspace.getConfiguration('claudine');
          config.update(message.key, message.value, vscode.ConfigurationTarget.Global).then(() => {
            this.updateSettings();
          });
        }
        break;
      }

      case 'regenerateIcons':
        this._stateManager.clearAllIcons().then(() => {
          this._claudeCodeWatcher.clearPendingIcons();
          this._claudeCodeWatcher.refresh();
        });
        break;

      case 'quickIdea':
        this.startNewConversation(message.prompt);
        break;

      case 'saveDrafts':
        this._stateManager.saveDrafts(message.drafts);
        break;

      case 'closeEmptyClaudeTabs':
        this.closeEmptyClaudeTabs();
        break;

      case 'setupAgentIntegration':
        vscode.commands.executeCommand('claudine.setupAgentIntegration');
        break;

      case 'testApiConnection':
        this.testApiConnection();
        break;

      case 'toggleAutoRestart': {
        const cfg = vscode.workspace.getConfiguration('claudine');
        const current = cfg.get<boolean>('autoRestartAfterRateLimit', false);
        cfg.update('autoRestartAfterRateLimit', !current, vscode.ConfigurationTarget.Global).then(() => {
          this.updateSettings();
          if (!current) {
            // Turning ON — schedule restart if there are rate-limited conversations
            const limited = this._stateManager.getRateLimitedConversations();
            if (limited.length > 0 && limited[0].rateLimitResetTime) {
              this.scheduleAutoRestart(limited[0].rateLimitResetTime);
            }
          } else {
            // Turning OFF — cancel pending timer
            this.cancelAutoRestart();
          }
        });
        break;
      }
    }
  }

  // ── Conversation actions ─────────────────────────────────────────────

  public async openConversation(conversationId: string) {
    const conversation = this._stateManager.getConversation(conversationId);
    if (!conversation) {
      this.sendMessage({ type: 'error', message: `Conversation ${conversationId} not found` });
      return;
    }

    clearTimeout(this._focusEditorTimer);
    this.sendMessage({ type: 'focusedConversation', conversationId });
    this._tabManager.suppressFocus(FOCUS_SUPPRESS_DURATION_MS);

    // Check if we already have a known tab for this conversation
    const knownLabel = this._tabManager.getTabLabel(conversationId);
    if (knownLabel) {
      const focused = await this._tabManager.focusTabByLabel(knownLabel);
      if (focused) {
        console.log(`Claudine: Focused existing tab "${knownLabel}" for conversation ${conversationId}`);
        return;
      }
      this._tabManager.removeMapping(conversationId);
    }

    // No known tab — create one via Claude Code extension
    await this._tabManager.closeUnmappedClaudeTabByTitle(conversation.title);

    try {
      await vscode.commands.executeCommand('claude-vscode.editor.open', conversationId);
      this.focusEditorOnce(EDITOR_FOCUS_DELAY_MS);
      setTimeout(() => this._tabManager.recordActiveTabMapping(conversationId), TAB_MAPPING_DELAY_MS);
    } catch {
      this._tabManager.suppressFocus(0);
      vscode.window.showWarningMessage(
        vscode.l10n.t('Could not open conversation in Claude Code. Is the Claude Code extension installed?')
      );
    }
  }

  private async sendPromptToConversation(conversationId: string, prompt: string) {
    const conversation = this._stateManager.getConversation(conversationId);
    if (!conversation) {
      this.sendMessage({ type: 'error', message: `Conversation ${conversationId} not found` });
      return;
    }

    this.sendMessage({ type: 'focusedConversation', conversationId });
    this._tabManager.suppressFocus(FOCUS_SUPPRESS_DURATION_MS);

    const knownLabel = this._tabManager.getTabLabel(conversationId);
    if (knownLabel) {
      await this._tabManager.focusTabByLabel(knownLabel);
    }

    try {
      await vscode.commands.executeCommand('claude-vscode.editor.open', conversationId, prompt);
      setTimeout(() => this._tabManager.recordActiveTabMapping(conversationId), TAB_MAPPING_DELAY_MS);
    } catch {
      this._tabManager.suppressFocus(0);
      vscode.window.showWarningMessage(
        vscode.l10n.t('Could not send prompt to Claude Code. Is the Claude Code extension installed?')
      );
    }
  }

  public async startNewConversation(prompt: string) {
    try {
      await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, prompt);
      this.focusEditorOnce(EDITOR_FOCUS_DELAY_MS);
    } catch {
      vscode.window.showWarningMessage(
        vscode.l10n.t('Could not start a new Claude Code conversation. Is the Claude Code extension installed?')
      );
    }
  }

  private async interruptConversation(conversationId: string) {
    const conversation = this._stateManager.getConversation(conversationId);
    if (!conversation) return;
    if (conversation.status !== 'in-progress' && conversation.status !== 'needs-input') return;

    let sentToTerminal = false;
    for (const terminal of vscode.window.terminals) {
      const name = terminal.name;
      if (/claude/i.test(name) && !/claudine/i.test(name)) {
        terminal.sendText('\x03', false);
        sentToTerminal = true;
      }
    }

    if (!sentToTerminal) {
      const knownLabel = this._tabManager.getTabLabel(conversationId);
      if (knownLabel) {
        await this._tabManager.focusTabByLabel(knownLabel);
      } else {
        await this._tabManager.focusAnyClaudeTab();
      }
    }
  }

  private focusEditorOnce(delay: number) {
    clearTimeout(this._focusEditorTimer);
    this._focusEditorTimer = setTimeout(async () => {
      try {
        await vscode.commands.executeCommand('claude-vscode.focus');
      } catch {
        // focus command may not be available
      }
    }, delay);
  }

  private async openGitBranch(branch?: string) {
    if (!branch) return;
    try {
      await vscode.commands.executeCommand('workbench.view.scm');
      try {
        await vscode.commands.executeCommand('git.branchFrom', branch);
      } catch { /* ignore if command unavailable */ }
    } catch {
      vscode.window.showInformationMessage(`Branch: ${branch}`);
    }
  }

  public async closeEmptyClaudeTabs(): Promise<number> {
    return this._tabManager.closeEmptyClaudeTabs();
  }

  public async focusAnyClaudeTab(): Promise<boolean> {
    return this._tabManager.focusAnyClaudeTab();
  }

  // ── Auto-restart after rate limit ────────────────────────────────────

  /**
   * Schedule auto-restart of rate-limited conversations at the given reset time
   * (plus a grace period). If a timer is already set, it is replaced.
   */
  public scheduleAutoRestart(resetTimeIso: string) {
    this.cancelAutoRestart();
    const resetMs = new Date(resetTimeIso).getTime();
    const delay = Math.max(0, resetMs - Date.now() + AUTO_RESTART_GRACE_MS);
    console.log(`Claudine: Scheduling auto-restart in ${Math.round(delay / 1000)}s`);
    this._autoRestartTimer = setTimeout(() => {
      this.executeAutoRestart();
    }, delay);
  }

  public cancelAutoRestart() {
    if (this._autoRestartTimer !== undefined) {
      clearTimeout(this._autoRestartTimer);
      this._autoRestartTimer = undefined;
    }
  }

  private async executeAutoRestart() {
    this._autoRestartTimer = undefined;
    const limited = this._stateManager.getRateLimitedConversations();
    console.log(`Claudine: Auto-restarting ${limited.length} rate-limited conversation(s)`);
    for (const conv of limited) {
      try {
        await this.sendPromptToConversation(conv.id, AUTO_RESTART_PROMPT);
      } catch (err) {
        console.error(`Claudine: Failed to auto-restart conversation ${conv.id}`, err);
      }
    }
  }

  // ── Standard webview provider methods ────────────────────────────────

  public setSecretStorage(secrets: vscode.SecretStorage) {
    this._secrets = secrets;
  }

  public refresh() {
    const conversations = this._stateManager.getConversations();
    this.sendMessage({ type: 'updateConversations', conversations });
    // Update fingerprints after full send
    this._lastSentFingerprints.clear();
    for (const c of conversations) {
      this._lastSentFingerprints.set(c.id, this.fingerprint(c));
    }
  }

  private fingerprint(c: Conversation): string {
    const sc = c.sidechainSteps?.map(s => s.status[0]).join('') ?? '';
    return `${c.status}|${c.updatedAt.getTime()}|${c.hasError}|${c.isInterrupted}|${c.hasQuestion}|${c.isRateLimited}|${c.icon ? '1' : '0'}|${c.title}|${c.lastMessage}|${sc}`;
  }

  private sendDiff(conversations: Conversation[]) {
    // First send: always send full state
    if (this._lastSentFingerprints.size === 0) {
      this.sendMessage({ type: 'updateConversations', conversations });
      for (const c of conversations) {
        this._lastSentFingerprints.set(c.id, this.fingerprint(c));
      }
      return;
    }

    const currentIds = new Set<string>();
    const changed: Conversation[] = [];

    for (const c of conversations) {
      currentIds.add(c.id);
      const fp = this.fingerprint(c);
      if (this._lastSentFingerprints.get(c.id) !== fp) {
        changed.push(c);
        this._lastSentFingerprints.set(c.id, fp);
      }
    }

    // Find removed IDs
    const removed: string[] = [];
    for (const id of this._lastSentFingerprints.keys()) {
      if (!currentIds.has(id)) {
        removed.push(id);
      }
    }
    for (const id of removed) {
      this._lastSentFingerprints.delete(id);
    }

    // Nothing changed
    if (changed.length === 0 && removed.length === 0) return;

    // If most conversations changed, send full update (cheaper than many individual messages)
    if (changed.length > conversations.length / 2) {
      this.sendMessage({ type: 'updateConversations', conversations });
      return;
    }

    // Send individual updates
    for (const c of changed) {
      this.sendMessage({ type: 'conversationUpdated', conversation: c });
    }
    if (removed.length > 0) {
      this.sendMessage({ type: 'removeConversations', ids: removed });
    }
  }

  private async loadDrafts() {
    const drafts = await this._stateManager.loadDrafts();
    this.sendMessage({ type: 'draftsLoaded', drafts });
  }

  private sendLocale() {
    const t = vscode.l10n.t;
    this.sendMessage({
      type: 'updateLocale',
      strings: {
        'column.todo': t('To Do'),
        'column.needsInput': t('Needs Input'),
        'column.inProgress': t('In Progress'),
        'column.inReview': t('In Review'),
        'column.done': t('Done'),
        'column.cancelled': t('Cancelled'),
        'column.archived': t('Archived'),
        'board.emptyTitle': t('Welcome to Claudine'),
        'board.emptyStep1': t('Open a Claude Code editor'),
        'board.emptyStep2': t('Start a conversation — Claudine will pick it up in real time'),
        'board.emptyStep3': t('Drag cards between columns to track progress'),
        'board.quickIdea': t('Quick idea...'),
        'board.addIdea': t('Add idea'),
        'card.dragToMove': t('Drag to move'),
        'card.errorOccurred': t('Error occurred'),
        'card.toolInterrupted': t('Tool interrupted'),
        'card.waitingForInput': t('Waiting for input'),
        'card.currentlyViewing': t('Currently viewing this conversation'),
        'card.latest': t('Latest:'),
        'card.openInSourceControl': t('Open in source control'),
        'card.respond': t('Respond'),
        'card.expandCard': t('Expand card'),
        'card.collapseCard': t('Collapse card'),
        'card.taskIcon': t('Task icon'),
        'card.deleteIdea': t('Delete idea'),
        'card.startConversation': t('Start conversation'),
        'card.describeIdea': t('Describe your idea...'),
        'search.placeholder': t('Search conversations...'),
        'search.fade': t('Fade'),
        'search.hide': t('Hide'),
        'toolbar.search': t('Search conversations'),
        'toolbar.compactView': t('Toggle compact / full view'),
        'toolbar.expandCollapse': t('Expand / Collapse all'),
        'toolbar.refresh': t('Refresh conversations'),
        'toolbar.closeTabs': t('Close empty & duplicate Claude tabs'),
        'toolbar.settings': t('Settings'),
        'toolbar.about': t('About Claudine'),
        'settings.title': t('Settings'),
        'settings.imageGeneration': t('Image Generation'),
        'settings.none': t('None'),
        'settings.openai': t('OpenAI (DALL-E 3)'),
        'settings.stability': t('Stability AI'),
        'settings.apiKey': t('API Key'),
        'settings.saved': t('Saved'),
        'settings.regenerate': t('Regenerate Thumbnails'),
        'filter.title': t('Filter by category'),
        'filter.clear': t('Clear filter'),
        'prompt.placeholder': t('Send a message...'),
        'prompt.send': t('Send message'),
        'close': t('Close'),
      },
    });
  }

  public async updateSettings() {
    const config = vscode.workspace.getConfiguration('claudine');
    const apiKey = await this._secrets?.get('imageGenerationApiKey') ?? '';
    const settings: ClaudineSettings = {
      imageGenerationApi: config.get('imageGenerationApi', 'none'),
      claudeCodePath: config.get('claudeCodePath', '~/.claude'),
      enableSummarization: config.get('enableSummarization', false),
      hasApiKey: !!apiKey,
      viewLocation: config.get('viewLocation', 'panel') as 'panel' | 'sidebar',
      autoRestartAfterRateLimit: config.get('autoRestartAfterRateLimit', false)
    };
    this.sendMessage({ type: 'updateSettings', settings });
  }

  private async testApiConnection() {
    const config = vscode.workspace.getConfiguration('claudine');
    const api = config.get<string>('imageGenerationApi', 'none');
    const apiKey = await this._secrets?.get('imageGenerationApiKey') ?? '';

    if (!apiKey) {
      this.sendMessage({ type: 'apiTestResult', success: false, error: 'No API key configured' });
      return;
    }

    try {
      if (api === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        this.sendMessage({ type: 'apiTestResult', success: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
      } else if (api === 'stability') {
        const res = await fetch('https://api.stability.ai/v1/user/account', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        this.sendMessage({ type: 'apiTestResult', success: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
      } else {
        this.sendMessage({ type: 'apiTestResult', success: false, error: 'No API selected' });
      }
    } catch (err) {
      this.sendMessage({ type: 'apiTestResult', success: false, error: String(err) });
    }
  }

  private sendMessage(message: ExtensionToWebviewMessage) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private pauseArchiveTimer() {
    clearInterval(this._archiveTimer);
    this._archiveTimer = undefined!;
  }

  private resumeArchiveTimer() {
    if (this._archiveTimer) return; // already running
    this._archiveTimer = setInterval(() => {
      this._stateManager.archiveStaleConversations();
    }, ARCHIVE_CHECK_INTERVAL_MS);
  }

  public dispose() {
    clearInterval(this._archiveTimer);
    clearTimeout(this._focusEditorTimer);
    this.cancelAutoRestart();
    this._tabManager.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview', 'dist', 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview', 'dist', 'assets', 'index.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Claudine</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">window.__CLAUDINE_TOKEN__='${this._authToken}';</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return crypto.randomBytes(NONCE_BYTES).toString('hex');
}
