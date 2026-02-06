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

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _stateManager: StateManager,
    private readonly _claudeCodeWatcher: ClaudeCodeWatcher
  ) {
    this._stateManager.onConversationsChanged((conversations) => {
      this.sendMessage({ type: 'updateConversations', conversations });
    });
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

    // Track which editor/terminal is focused to detect active Claude Code conversation (#1)
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.detectFocusedConversation();
      }),
      vscode.window.onDidChangeActiveTerminal(() => {
        this.detectFocusedConversation();
      })
    );
  }

  private handleWebviewMessage(message: WebviewToExtensionMessage) {
    switch (message.type) {
      case 'ready':
        this.refresh();
        this.updateSettings();
        this.loadDrafts();
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
    }
  }

  /**
   * Open the Claude Code conversation in the visual editor panel.
   * If an existing Claude Code editor tab is already open, focus it instead.
   */
  private async openConversation(conversationId: string) {
    const conversation = this._stateManager.getConversation(conversationId);
    if (!conversation) {
      this.sendMessage({ type: 'error', message: `Conversation ${conversationId} not found` });
      return;
    }

    try {
      if (await this.focusExistingClaudeTab()) return;
      await vscode.commands.executeCommand('claude-vscode.editor.open', conversationId);
      this.focusEditorWithRetries();
    } catch {
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

    try {
      // Always open with prompt — the command handles routing to the right session
      await vscode.commands.executeCommand('claude-vscode.editor.open', conversationId, prompt);
      this.focusEditorWithRetries();
    } catch {
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
      this.focusEditorWithRetries();
    } catch {
      vscode.window.showWarningMessage(
        'Could not start a new Claude Code conversation. Is the Claude Code extension installed?'
      );
    }
  }

  /**
   * Search all open editor tabs for an existing Claude Code visual editor.
   * If found, activate it and return true. Otherwise return false.
   */
  private async focusExistingClaudeTab(): Promise<boolean> {
    for (const group of vscode.window.tabGroups.all) {
      for (let i = 0; i < group.tabs.length; i++) {
        const input = group.tabs[i].input;
        if (
          input instanceof vscode.TabInputWebview &&
          /claude/i.test(input.viewType) &&
          !/claudine/i.test(input.viewType)
        ) {
          // Focus the editor group containing the tab
          const focusCmds = [
            'workbench.action.focusFirstEditorGroup',
            'workbench.action.focusSecondEditorGroup',
            'workbench.action.focusThirdEditorGroup',
          ];
          const groupIdx = (group.viewColumn ?? 1) - 1;
          if (groupIdx >= 0 && groupIdx < focusCmds.length) {
            await vscode.commands.executeCommand(focusCmds[groupIdx]);
          }
          // Activate the tab by 0-based index
          await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', i);
          this.focusEditorWithRetries();
          return true;
        }
      }
    }
    return false;
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

    // 2. Visual editor: focus the Claude tab so the user can press Escape.
    //    There is no VSCode API to send keystrokes to a webview from outside,
    //    so we bring it to focus — the user can then hit Escape to abort.
    if (!sentToTerminal) {
      await this.focusExistingClaudeTab();
    }
  }

  /**
   * Focus the Claude Code editor input multiple times with increasing delays.
   * The editor webview needs time to render all messages before focus triggers
   * a scroll-to-bottom. Retrying ensures at least one attempt hits after full load.
   */
  private focusEditorWithRetries() {
    const delays = [300, 800, 1500, 3000];
    for (const delay of delays) {
      setTimeout(async () => {
        try {
          await vscode.commands.executeCommand('claude-vscode.focus');
        } catch {
          // focus command may not be available
        }
      }, delay);
    }
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

  /**
   * (#1) Detect which Claude Code conversation is currently focused
   * by matching the active terminal/editor to a session.
   */
  private detectFocusedConversation() {
    const activeTerminal = vscode.window.activeTerminal;
    let focusedId: string | null = null;

    if (activeTerminal) {
      const name = activeTerminal.name.toLowerCase();
      if (name.includes('claude')) {
        // Try to match terminal to a conversation
        // For now, match to most recently updated conversation that is in-progress
        const conversations = this._stateManager.getConversations();
        const activeConv = conversations.find(c => c.status === 'in-progress');
        if (activeConv) {
          focusedId = activeConv.id;
        }
      }
    }

    this.sendMessage({ type: 'focusedConversation', conversationId: focusedId });
  }

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
