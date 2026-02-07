import * as vscode from 'vscode';
import { StateManager } from '../services/StateManager';
import { ClaudeCodeWatcher } from './ClaudeCodeWatcher';
import {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
  ClaudineSettings
} from '../types';

export class KanbanViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudine.kanbanView';

  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _archiveTimer: ReturnType<typeof setInterval>;

  // Bidirectional tab ↔ conversation mapping
  private _tabToConversation = new Map<string, string>(); // tab label → conversationId
  private _conversationToTab = new Map<string, string>(); // conversationId → tab label

  // Focus detection debounce & suppression
  private _focusDetectionTimer: ReturnType<typeof setTimeout> | undefined;
  private _focusEditorTimer: ReturnType<typeof setTimeout> | undefined;
  private _suppressFocusUntil = 0; // timestamp — ignore detection events until this time

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _stateManager: StateManager,
    private readonly _claudeCodeWatcher: ClaudeCodeWatcher
  ) {
    this._stateManager.onConversationsChanged((conversations) => {
      this.sendMessage({ type: 'updateConversations', conversations });
    });

    // Periodically check for stale done/cancelled conversations to archive
    this._archiveTimer = setInterval(() => {
      this._stateManager.archiveStaleConversations();
    }, 5 * 60 * 1000);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'webview', 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'resources')
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        this.handleWebviewMessage(message);
      }
    );

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh();
      }
    });

    // Track which editor/terminal is focused to detect active Claude Code conversation
    this._disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(() => {
        this.pruneStaleTabMappings();
        this.scheduleFocusDetection();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.scheduleFocusDetection();
      }),
      vscode.window.onDidChangeActiveTerminal(() => {
        this.scheduleFocusDetection();
      })
    );
  }

  private handleWebviewMessage(message: WebviewToExtensionMessage) {
    switch (message.type) {
      case 'ready':
        this.refresh();
        this.updateSettings();
        this.loadDrafts();
        this.detectFocusedConversation();
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
            // Turning ON → kick off summarization for existing conversations
            this._claudeCodeWatcher.refresh();
          }
        });
        break;
      }

      case 'updateSetting': {
        const config = vscode.workspace.getConfiguration('claudine');
        config.update(message.key, message.value, vscode.ConfigurationTarget.Global).then(() => {
          this.updateSettings();
        });
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
    }
  }

  // ── Tab helpers ──────────────────────────────────────────────────────

  /** Check if a tab is a Claude Code Visual Editor (not Claudine). */
  private isClaudeCodeTab(tab: vscode.Tab): boolean {
    const input = tab.input;
    return (
      input instanceof vscode.TabInputWebview &&
      /claude/i.test(input.viewType) &&
      !/claudine/i.test(input.viewType)
    );
  }

  /** Record a mapping between a conversation and the currently active Claude tab. */
  private recordActiveTabMapping(conversationId: string) {
    for (const group of vscode.window.tabGroups.all) {
      if (!group.isActive) continue;
      const tab = group.activeTab;
      if (tab && this.isClaudeCodeTab(tab)) {
        // Remove any old mapping for this conversation
        const oldLabel = this._conversationToTab.get(conversationId);
        if (oldLabel) this._tabToConversation.delete(oldLabel);

        this._tabToConversation.set(tab.label, conversationId);
        this._conversationToTab.set(conversationId, tab.label);
        console.log(`Claudine: Mapped tab "${tab.label}" → conversation ${conversationId}`);
        return;
      }
    }
  }

  /** Remove mappings for tabs that no longer exist. */
  private pruneStaleTabMappings() {
    const allLabels = new Set<string>();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (this.isClaudeCodeTab(tab)) {
          allLabels.add(tab.label);
        }
      }
    }

    for (const [label, convId] of this._tabToConversation) {
      if (!allLabels.has(label)) {
        this._tabToConversation.delete(label);
        this._conversationToTab.delete(convId);
        console.log(`Claudine: Pruned stale tab mapping "${label}"`);
      }
    }
  }

  /**
   * Close empty and duplicate Claude Code Visual Editor tabs.
   *
   * After a workspace restart, VSCode restores Claude editor tabs as empty
   * shells — their webview content is gone. These look real (labels match
   * conversation titles) but open empty conversations when focused.
   *
   * Detection: if `_tabToConversation` has NO entries, we're in a fresh
   * session and ALL existing Claude tabs are restored shells → close them.
   * Otherwise, keep tabs that are mapped or whose label matches a conversation.
   */
  public async closeEmptyClaudeTabs(): Promise<number> {
    const tabsToClose: vscode.Tab[] = [];
    const seenLabels = new Set<string>();
    const hasMappings = this._tabToConversation.size > 0;

    // Build a set of known conversation titles for exact matching only
    const knownTitles = new Set(
      this._stateManager.getConversations().map(c => c.title.toLowerCase().trim())
    );

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (!this.isClaudeCodeTab(tab)) continue;
        if (tab.isDirty) continue;

        // Duplicate label — close it
        if (seenLabels.has(tab.label)) {
          tabsToClose.push(tab);
          continue;
        }
        seenLabels.add(tab.label);

        // Explicitly mapped via Claudine — keep (tab is alive in this session)
        if (this._tabToConversation.has(tab.label)) continue;

        // No mappings at all → fresh startup, all Claude tabs are restored shells
        if (!hasMappings) {
          tabsToClose.push(tab);
          continue;
        }

        // Some mappings exist (mid-session) — trust title matching for tabs
        // opened outside Claudine (e.g. via Claude Code extension directly)
        if (knownTitles.has(tab.label.toLowerCase().trim())) continue;

        // No mapping, no exact match — empty tab
        tabsToClose.push(tab);
      }
    }

    if (tabsToClose.length === 0) return 0;

    console.log(`Claudine: Clean sweep — closing ${tabsToClose.length} empty/duplicate Claude tab(s)`);
    await vscode.window.tabGroups.close(tabsToClose);
    return tabsToClose.length;
  }

  /**
   * Focus a specific Claude Code tab by its label.
   * Returns true if the tab was found and focused.
   */
  private async focusTabByLabel(label: string): Promise<boolean> {
    for (const group of vscode.window.tabGroups.all) {
      for (let i = 0; i < group.tabs.length; i++) {
        const tab = group.tabs[i];
        if (tab.label === label && this.isClaudeCodeTab(tab)) {
          const focusCmds = [
            'workbench.action.focusFirstEditorGroup',
            'workbench.action.focusSecondEditorGroup',
            'workbench.action.focusThirdEditorGroup',
          ];
          const groupIdx = (group.viewColumn ?? 1) - 1;
          if (groupIdx >= 0 && groupIdx < focusCmds.length) {
            await vscode.commands.executeCommand(focusCmds[groupIdx]);
          }
          await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', i);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Focus ANY open Claude Code editor tab (first found).
   * Used as a fallback when no specific tab is known.
   */
  private async focusAnyClaudeTab(): Promise<boolean> {
    for (const group of vscode.window.tabGroups.all) {
      for (let i = 0; i < group.tabs.length; i++) {
        if (this.isClaudeCodeTab(group.tabs[i])) {
          const focusCmds = [
            'workbench.action.focusFirstEditorGroup',
            'workbench.action.focusSecondEditorGroup',
            'workbench.action.focusThirdEditorGroup',
          ];
          const groupIdx = (group.viewColumn ?? 1) - 1;
          if (groupIdx >= 0 && groupIdx < focusCmds.length) {
            await vscode.commands.executeCommand(focusCmds[groupIdx]);
          }
          await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', i);
          return true;
        }
      }
    }
    return false;
  }

  // ── Conversation actions ─────────────────────────────────────────────

  /**
   * Open the Claude Code conversation in the visual editor panel.
   * If a tab for this conversation already exists, focus it.
   * Otherwise, create a new one via the Claude Code extension command.
   */
  private async openConversation(conversationId: string) {
    const conversation = this._stateManager.getConversation(conversationId);
    if (!conversation) {
      this.sendMessage({ type: 'error', message: `Conversation ${conversationId} not found` });
      return;
    }

    // Cancel any pending focus call from a previous open (prevents stale timer yanking focus)
    clearTimeout(this._focusEditorTimer);
    // Immediately tell the webview which conversation is focused (prevents flicker)
    this.sendMessage({ type: 'focusedConversation', conversationId });
    // Suppress event-driven focus detection while we're switching tabs
    this._suppressFocusUntil = Date.now() + 2000;

    // 1. Check if we already have a known tab for this conversation
    const knownLabel = this._conversationToTab.get(conversationId);
    if (knownLabel) {
      const focused = await this.focusTabByLabel(knownLabel);
      if (focused) {
        console.log(`Claudine: Focused existing tab "${knownLabel}" for conversation ${conversationId}`);
        // Tab is already focused by focusTabByLabel — do NOT call claude-vscode.focus
        // because that command targets whatever tab the Claude extension considers
        // "current", which may be a different tab (causing the jump-back bug).
        return;
      }
      // Tab no longer exists — remove stale mapping
      this._conversationToTab.delete(conversationId);
      this._tabToConversation.delete(knownLabel);
    }

    // 2. No known tab — create one via Claude Code extension
    try {
      await vscode.commands.executeCommand('claude-vscode.editor.open', conversationId);
      this.focusEditorOnce(800);
      // Record which tab was created for this conversation (with delay for tab to appear)
      setTimeout(() => {
        this.recordActiveTabMapping(conversationId);
      }, 500);
    } catch {
      this._suppressFocusUntil = 0;
      vscode.window.showWarningMessage(
        'Could not open conversation in Claude Code. Is the Claude Code extension installed?'
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
    this._suppressFocusUntil = Date.now() + 2000;

    // Try to focus existing tab first, then send prompt
    const knownLabel = this._conversationToTab.get(conversationId);
    if (knownLabel) {
      await this.focusTabByLabel(knownLabel);
    }

    try {
      await vscode.commands.executeCommand('claude-vscode.editor.open', conversationId, prompt);
      // editor.open already focuses the correct tab — don't call claude-vscode.focus
      setTimeout(() => this.recordActiveTabMapping(conversationId), 500);
    } catch {
      this._suppressFocusUntil = 0;
      vscode.window.showWarningMessage(
        'Could not send prompt to Claude Code. Is the Claude Code extension installed?'
      );
    }
  }

  /**
   * Start a new Claude Code conversation with the given prompt.
   * Opens the visual editor and sends the prompt as the first message.
   */
  private async startNewConversation(prompt: string) {
    try {
      // Open a new Claude Code editor (no session ID = new conversation)
      await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, prompt);
      this.focusEditorOnce(800);
    } catch {
      vscode.window.showWarningMessage(
        'Could not start a new Claude Code conversation. Is the Claude Code extension installed?'
      );
    }
  }

  /**
   * Interrupt a running Claude Code agent.
   * Tries two approaches:
   * 1. Terminal sessions: send Ctrl+C (SIGINT) to Claude Code terminals
   * 2. Visual editor: focus the webview tab and simulate Escape
   */
  private async interruptConversation(conversationId: string) {
    const conversation = this._stateManager.getConversation(conversationId);
    if (!conversation) return;

    // Only interrupt if the conversation was actively running
    if (conversation.status !== 'in-progress' && conversation.status !== 'needs-input') return;

    // 1. Terminal sessions: send Ctrl+C
    let sentToTerminal = false;
    for (const terminal of vscode.window.terminals) {
      const name = terminal.name;
      if (/claude/i.test(name) && !/claudine/i.test(name)) {
        terminal.sendText('\x03', false);
        sentToTerminal = true;
      }
    }

    // 2. Visual editor: focus the Claude tab so the user can press Escape
    if (!sentToTerminal) {
      const knownLabel = this._conversationToTab.get(conversationId);
      if (knownLabel) {
        await this.focusTabByLabel(knownLabel);
      } else {
        await this.focusAnyClaudeTab();
      }
    }
  }

  /**
   * Focus the Claude Code editor input once after a delay.
   * Gives the webview time to render before triggering scroll-to-bottom.
   * Cancels any previous pending focus call to prevent stale timers
   * from yanking focus to the wrong tab.
   */
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

  /**
   * (#4) Open the git branch in the Source Control view.
   */
  private async openGitBranch(branch?: string) {
    if (!branch) return;

    try {
      // Try to show the branch in the SCM view
      await vscode.commands.executeCommand('workbench.view.scm');

      // Also try to show the branch in the git graph if available
      try {
        await vscode.commands.executeCommand('git.branchFrom', branch);
      } catch {
        // git.branchFrom may not exist
      }
    } catch {
      vscode.window.showInformationMessage(`Branch: ${branch}`);
    }
  }

  // ── Focus detection ──────────────────────────────────────────────────

  /**
   * Schedule a debounced focus detection.
   * Skips if we're inside a suppression window (e.g. during openConversation).
   */
  private scheduleFocusDetection() {
    clearTimeout(this._focusDetectionTimer);
    if (Date.now() < this._suppressFocusUntil) return;
    this._focusDetectionTimer = setTimeout(() => {
      this.detectFocusedConversation();
    }, 150);
  }

  /**
   * Detect which Claude Code conversation is currently focused
   * by checking: 1) active Claude Code Visual Editor tabs, 2) active terminals.
   */
  private detectFocusedConversation() {
    let focusedId: string | null = null;

    // 1. Check if a Claude Code Visual Editor webview tab is active
    const claudeTab = this.getActiveClaudeCodeTab();
    if (claudeTab) {
      focusedId = this.matchTabToConversation(claudeTab);
      console.log(`Claudine: Focused Claude tab "${claudeTab.label}" → conversation ${focusedId}`);
    }

    // 2. Fall back to terminal detection
    if (!focusedId) {
      const activeTerminal = vscode.window.activeTerminal;
      if (activeTerminal && /claude/i.test(activeTerminal.name) && !/claudine/i.test(activeTerminal.name)) {
        const conversations = this._stateManager.getConversations();
        const activeConv = conversations.find(c => c.status === 'in-progress');
        if (activeConv) {
          focusedId = activeConv.id;
        }
      }
    }

    this.sendMessage({ type: 'focusedConversation', conversationId: focusedId });
  }

  /**
   * Find the active Claude Code editor tab (webview) across all tab groups.
   */
  private getActiveClaudeCodeTab(): vscode.Tab | null {
    for (const group of vscode.window.tabGroups.all) {
      if (!group.isActive) continue;
      const tab = group.activeTab;
      if (!tab) continue;
      if (this.isClaudeCodeTab(tab)) {
        return tab;
      }
    }
    return null;
  }

  /**
   * Match a Claude Code editor tab to a conversation.
   * 1. Check our recorded tab→conversation mapping (most reliable)
   * 2. Try title matching as fallback
   */
  private matchTabToConversation(tab: vscode.Tab): string | null {
    // 1. Recorded mapping — set when we open a conversation
    const mapped = this._tabToConversation.get(tab.label);
    if (mapped) return mapped;

    // 2. Title matching fallback — for tabs opened outside our control
    const conversations = this._stateManager.getConversations();
    const tabLabel = tab.label.toLowerCase().trim();

    for (const conv of conversations) {
      if (conv.title.toLowerCase().trim() === tabLabel) return conv.id;
    }

    for (const conv of conversations) {
      const title = conv.title.toLowerCase().trim();
      if (title && tabLabel && (tabLabel.includes(title) || title.includes(tabLabel))) {
        return conv.id;
      }
    }

    return null;
  }

  // ── Standard webview provider methods ────────────────────────────────

  public refresh() {
    const conversations = this._stateManager.getConversations();
    this.sendMessage({ type: 'updateConversations', conversations });
  }

  private async loadDrafts() {
    const drafts = await this._stateManager.loadDrafts();
    this.sendMessage({ type: 'draftsLoaded', drafts });
  }

  public updateSettings() {
    const config = vscode.workspace.getConfiguration('claudine');
    const apiKey = config.get<string>('imageGenerationApiKey', '');
    const settings: ClaudineSettings = {
      imageGenerationApi: config.get('imageGenerationApi', 'none'),
      claudeCodePath: config.get('claudeCodePath', '~/.claude'),
      enableSummarization: config.get('enableSummarization', false),
      hasApiKey: !!apiKey
    };
    this.sendMessage({ type: 'updateSettings', settings });
  }

  private sendMessage(message: ExtensionToWebviewMessage) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  public dispose() {
    clearInterval(this._archiveTimer);
    clearTimeout(this._focusDetectionTimer);
    clearTimeout(this._focusEditorTimer);
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Claudine</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
