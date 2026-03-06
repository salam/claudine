import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { VsCodeAdapter } from './platform/VsCodeAdapter';
import { KanbanViewProvider } from './providers/KanbanViewProvider';
import { ClaudeCodeWatcher } from './providers/ClaudeCodeWatcher';
import { CodexWatcher } from './providers/CodexWatcher';
import { CompositeConversationProvider } from './providers/CompositeConversationProvider';
import { ClaudeCodeEditorCommands } from './providers/ClaudeCodeEditorCommands';
import { CodexEditorCommands } from './providers/CodexEditorCommands';
import { IEditorCommands } from './providers/IEditorCommands';
import { IConversationProvider } from './providers/IConversationProvider';
import { StateManager } from './services/StateManager';
import { StorageService } from './services/StorageService';
import { ImageGenerator } from './services/ImageGenerator';
import { SummaryService } from './services/SummaryService';
import { CommandProcessor } from './services/CommandProcessor';
import { promptExport, promptImport } from './services/BoardExporter';
import { ConversationStatus } from './types';

let kanbanProvider: KanbanViewProvider;
let provider: IConversationProvider;
let stateManager: StateManager;
let storageService: StorageService;
let imageGenerator: ImageGenerator;
let commandProcessor: CommandProcessor;

export type AgentIntegrationState = 'missing' | 'unreferenced' | 'ok';

/**
 * Pure check: determines the agent integration status for a workspace root.
 * Returns 'missing' when CLAUDINE.AGENTS.md does not exist,
 * 'unreferenced' when it exists but neither AGENTS.md nor CLAUDE.md mention it,
 * or 'ok' when everything is wired up.
 */
export function getAgentIntegrationState(wsRoot: string): AgentIntegrationState {
  const agentsFilePath = path.join(wsRoot, 'CLAUDINE.AGENTS.md');
  if (!fs.existsSync(agentsFilePath)) {
    return 'missing';
  }
  const filesToCheck = ['AGENTS.md', 'CLAUDE.md'];
  for (const name of filesToCheck) {
    const filePath = path.join(wsRoot, name);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('CLAUDINE.AGENTS.md')) {
        return 'ok';
      }
    }
  }
  return 'unreferenced';
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('Claudine extension is now active');

  // Initialize platform adapter — decouples services from VS Code APIs
  const platform = new VsCodeAdapter(context);

  // Initialize services
  storageService = new StorageService(platform);
  stateManager = new StateManager(storageService, platform);
  imageGenerator = new ImageGenerator(storageService, platform);
  const summaryService = new SummaryService();
  summaryService.init(platform);

  // Build provider: Claude Code is always present; Codex is conditional.
  const claudeProvider = new ClaudeCodeWatcher(stateManager, platform, imageGenerator, summaryService);
  if (CodexWatcher.isAvailable(platform)) {
    const codexProvider = new CodexWatcher(stateManager, platform, summaryService, imageGenerator);
    provider = new CompositeConversationProvider([claudeProvider, codexProvider]);
    console.log('Claudine: Codex sessions detected — multi-provider mode');
  } else {
    provider = claudeProvider;
  }

  // Wait for saved state to load before scanning — prevents stale cross-project
  // conversations from being re-injected after setConversations() cleans up.
  await stateManager.ready;

  // Watch for agent commands in .claudine/commands.jsonl
  commandProcessor = new CommandProcessor(stateManager, platform);
  commandProcessor.startWatching();

  // Initialize the Kanban view provider with provider-aware editor commands
  const claudeEditorCommands = new ClaudeCodeEditorCommands();
  const editorCommandsByProvider = new Map<string, IEditorCommands>();
  editorCommandsByProvider.set('claude-code', claudeEditorCommands);
  editorCommandsByProvider.set('codex', new CodexEditorCommands(stateManager));

  kanbanProvider = new KanbanViewProvider(
    context.extensionUri,
    stateManager,
    provider,
    claudeEditorCommands,
    editorCommandsByProvider
  );
  kanbanProvider.setSecretStorage(context.secrets);

  // One-time migration: move API key from plaintext settings to encrypted secret storage
  const legacyKey = vscode.workspace.getConfiguration('claudine').get<string>('imageGenerationApiKey', '');
  if (legacyKey) {
    await context.secrets.store('imageGenerationApiKey', legacyKey);
    await vscode.workspace.getConfiguration('claudine').update('imageGenerationApiKey', undefined, vscode.ConfigurationTarget.Global);
  }

  // Register the Claudine webview once; VS Code persists placement when users move the view.
  const webviewOptions = { webviewOptions: { retainContextWhenHidden: true } };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudine.kanbanView', kanbanProvider, webviewOptions)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.openKanban', () => {
      vscode.commands.executeCommand('claudine.kanbanView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.refresh', () => {
      provider.refresh();
      kanbanProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.closeEmptyClaudeTabs', () => {
      kanbanProvider.closeEmptyClaudeTabs();
    })
  );

  // Open Conversation — QuickPick list of all conversations
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.openConversation', async () => {
      const conversations = stateManager.getConversations();
      if (conversations.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No conversations found. Start a Claude Code conversation first.'));
        return;
      }
      const statusIcons: Record<ConversationStatus, string> = {
        'todo': '$(circle-outline)',
        'needs-input': '$(bell)',
        'in-progress': '$(sync~spin)',
        'in-review': '$(eye)',
        'done': '$(check)',
        'cancelled': '$(circle-slash)',
        'archived': '$(archive)'
      };
      const items = conversations.map(c => ({
        label: `${statusIcons[c.status] || ''} ${c.title}`,
        description: c.category,
        detail: c.description,
        conversationId: c.id
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: vscode.l10n.t('Select a conversation to open'),
        matchOnDescription: true,
        matchOnDetail: true
      });
      if (picked) {
        kanbanProvider.openConversation(picked.conversationId);
      }
    })
  );

  // Search Conversations — interactive search with filter
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.searchConversations', async () => {
      const query = await vscode.window.showInputBox({
        placeHolder: vscode.l10n.t('Search conversation content...'),
        prompt: vscode.l10n.t('Enter text to search across all conversation JSONL files')
      });
      if (!query) return;
      const matchIds = provider.searchConversations(query);
      if (matchIds.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No conversations found matching "{0}".', query));
        return;
      }
      const conversations = stateManager.getConversations().filter(c => matchIds.includes(c.id));
      const items = conversations.map(c => ({
        label: c.title,
        description: c.status,
        detail: c.description,
        conversationId: c.id
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: vscode.l10n.t('{0} conversation(s) matching "{1}"', matchIds.length, query),
        matchOnDescription: true,
        matchOnDetail: true
      });
      if (picked) {
        kanbanProvider.openConversation(picked.conversationId);
      }
    })
  );

  // Start New Conversation — input prompt and launch
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.newConversation', async () => {
      const prompt = await vscode.window.showInputBox({
        placeHolder: vscode.l10n.t('What would you like Claude to work on?'),
        prompt: vscode.l10n.t('Enter a prompt to start a new Claude Code conversation')
      });
      if (prompt) {
        kanbanProvider.startNewConversation(prompt);
      }
    })
  );

  // Move Conversation to Status — pick conversation, then pick target status
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.moveConversation', async () => {
      const conversations = stateManager.getConversations().filter(c => c.status !== 'archived');
      if (conversations.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No active conversations to move.'));
        return;
      }
      const convItems = conversations.map(c => ({
        label: c.title,
        description: c.status,
        detail: c.description,
        conversationId: c.id
      }));
      const pickedConv = await vscode.window.showQuickPick(convItems, {
        placeHolder: vscode.l10n.t('Select a conversation to move')
      });
      if (!pickedConv) return;
      const statusOptions: Array<{ label: string; status: ConversationStatus }> = [
        { label: `$(circle-outline) ${vscode.l10n.t('To Do')}`, status: 'todo' },
        { label: `$(bell) ${vscode.l10n.t('Needs Input')}`, status: 'needs-input' },
        { label: `$(sync~spin) ${vscode.l10n.t('In Progress')}`, status: 'in-progress' },
        { label: `$(eye) ${vscode.l10n.t('In Review')}`, status: 'in-review' },
        { label: `$(check) ${vscode.l10n.t('Done')}`, status: 'done' },
        { label: `$(circle-slash) ${vscode.l10n.t('Cancelled')}`, status: 'cancelled' },
        { label: `$(archive) ${vscode.l10n.t('Archived')}`, status: 'archived' }
      ];
      const pickedStatus = await vscode.window.showQuickPick(statusOptions, {
        placeHolder: vscode.l10n.t('Move "{0}" to...', pickedConv.label)
      });
      if (pickedStatus) {
        stateManager.moveConversation(pickedConv.conversationId, pickedStatus.status);
        kanbanProvider.refresh();
      }
    })
  );

  // Show Conversations Needing Input — quick filter
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.showNeedsInput', async () => {
      const conversations = stateManager.getConversationsByStatus('needs-input');
      if (conversations.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No conversations need input right now.'));
        return;
      }
      const items = conversations.map(c => ({
        label: `$(bell) ${c.title}`,
        detail: c.lastMessage || c.description,
        conversationId: c.id
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: vscode.l10n.t('{0} conversation(s) need your input', conversations.length)
      });
      if (picked) {
        kanbanProvider.openConversation(picked.conversationId);
      }
    })
  );

  // Show In-Progress Conversations
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.showInProgress', async () => {
      const conversations = stateManager.getConversationsByStatus('in-progress');
      if (conversations.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No conversations are in progress.'));
        return;
      }
      const items = conversations.map(c => ({
        label: `$(sync~spin) ${c.title}`,
        detail: c.lastMessage || c.description,
        conversationId: c.id
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: vscode.l10n.t('{0} conversation(s) in progress', conversations.length)
      });
      if (picked) {
        kanbanProvider.openConversation(picked.conversationId);
      }
    })
  );

  // Archive Completed Conversations — immediately archive all done/cancelled
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.archiveDone', () => {
      stateManager.archiveAllDone();
      kanbanProvider.refresh();
      vscode.window.showInformationMessage(vscode.l10n.t('Archived all completed and cancelled conversations.'));
    })
  );

  // Toggle AI Summarization
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.toggleSummarization', () => {
      const cfg = vscode.workspace.getConfiguration('claudine');
      const current = cfg.get<boolean>('enableSummarization', false);
      cfg.update('enableSummarization', !current, vscode.ConfigurationTarget.Global).then(() => {
        kanbanProvider.updateSettings();
        vscode.window.showInformationMessage(vscode.l10n.t('AI Summarization {0}.', !current ? vscode.l10n.t('enabled') : vscode.l10n.t('disabled')));
        if (!current) {
          provider.refresh();
        }
      });
    })
  );

  // Toolbar actions — forwarded to webview from title bar buttons
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.toggleSearch', () => {
      kanbanProvider.sendToolbarAction('toggleSearch');
    }),
    vscode.commands.registerCommand('claudine.toggleFilter', () => {
      kanbanProvider.sendToolbarAction('toggleFilter');
    }),
    vscode.commands.registerCommand('claudine.toggleCompactView', () => {
      kanbanProvider.sendToolbarAction('toggleCompactView');
    }),
    vscode.commands.registerCommand('claudine.toggleExpandAll', () => {
      kanbanProvider.sendToolbarAction('toggleExpandAll');
    }),
    vscode.commands.registerCommand('claudine.toggleArchive', () => {
      kanbanProvider.sendToolbarAction('toggleArchive');
    }),
    vscode.commands.registerCommand('claudine.zoomIn', () => {
      kanbanProvider.sendToolbarAction('zoomIn');
    }),
    vscode.commands.registerCommand('claudine.zoomOut', () => {
      kanbanProvider.sendToolbarAction('zoomOut');
    }),
    vscode.commands.registerCommand('claudine.zoomReset', () => {
      kanbanProvider.sendToolbarAction('zoomReset');
    }),
    vscode.commands.registerCommand('claudine.toggleSettingsPanel', () => {
      kanbanProvider.sendToolbarAction('toggleSettingsPanel');
    }),
    vscode.commands.registerCommand('claudine.toggleAbout', () => {
      kanbanProvider.sendToolbarAction('toggleAbout');
    })
  );

  // Regenerate All Icons
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.regenerateIcons', async () => {
      await stateManager.clearAllIcons();
      provider.clearPendingIcons();
      provider.refresh();
      vscode.window.showInformationMessage(vscode.l10n.t('Regenerating all conversation icons...'));
    })
  );

  // Open Settings — jump to Claudine settings in VS Code
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:claudine.claudine');
    })
  );

  // Export Board — save conversations as CSV, JSON, or Trello format
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.exportBoard', async () => {
      const conversations = stateManager.getConversations();
      if (conversations.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No conversations to export.'));
        return;
      }
      await promptExport(conversations);
    })
  );

  // Import Board — load conversations from a Claudine JSON export
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.importBoard', async () => {
      const imported = await promptImport();
      if (imported) {
        for (const conv of imported) {
          stateManager.updateConversation(conv);
        }
        kanbanProvider.refresh();
      }
    })
  );

  // Setup Agent Integration — scaffold CLAUDINE.AGENTS.md into workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.setupAgentIntegration', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage(vscode.l10n.t('Open a workspace folder first.'));
        return;
      }
      const targetPath = path.join(workspaceFolder.uri.fsPath, 'CLAUDINE.AGENTS.md');
      if (fs.existsSync(targetPath)) {
        const doc = await vscode.workspace.openTextDocument(targetPath);
        await vscode.window.showTextDocument(doc);
        return;
      }
      const templatePath = path.join(context.extensionPath, 'resources', 'CLAUDINE.AGENTS.md');
      const template = fs.readFileSync(templatePath, 'utf-8');
      fs.writeFileSync(targetPath, template);
      const doc = await vscode.workspace.openTextDocument(targetPath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(vscode.l10n.t('Created CLAUDINE.AGENTS.md — reference it from your CLAUDE.md to enable agent board control.'));
    })
  );

  // Show Diagnostics — display extension health info in an output channel
  const diagnosticChannel = vscode.window.createOutputChannel('Claudine Diagnostics');
  context.subscriptions.push(diagnosticChannel);
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.showDiagnostics', async () => {
      const config = vscode.workspace.getConfiguration('claudine');
      const conversations = stateManager.getConversations();
      const statusCounts: Record<string, number> = {};
      for (const c of conversations) {
        statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
      }
      const apiKey = await context.secrets.get('imageGenerationApiKey');

      const lines: string[] = [
        `Claudine Diagnostics — ${new Date().toISOString()}`,
        '='.repeat(50),
        '',
        '## Extension',
        `  Version: ${context.extension.packageJSON.version}`,
        `  Extension Path: ${context.extensionPath}`,
        `  VS Code: ${vscode.version}`,
        '',
        '## Configuration',
        `  Claude Code Path: ${provider.dataPath}`,
        `  Image Generation API: ${config.get('imageGenerationApi', 'none')}`,
        `  API Key Configured: ${apiKey ? 'Yes' : 'No'}`,
        `  Summarization: ${config.get('enableSummarization', false) ? 'Enabled' : 'Disabled'}`,
        '',
        '## Watcher',
        `  File Watcher Active: ${provider.isWatching}`,
        `  Parse Cache Entries: ${provider.parseCacheSize}`,
        '',
        '## Board State',
        `  Total Conversations: ${conversations.length}`,
        ...Object.entries(statusCounts).map(([status, count]) => `    ${status}: ${count}`),
        '',
        '## Workspace',
        ...(vscode.workspace.workspaceFolders?.map(f => `  ${f.uri.fsPath}`) ?? ['  (no workspace)']),
      ];

      diagnosticChannel.clear();
      diagnosticChannel.appendLine(lines.join('\n'));
      diagnosticChannel.show();
    })
  );

  // Focus Active Claude Tab
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.focusClaude', async () => {
      const focused = await kanbanProvider.focusAnyClaudeTab();
      if (!focused) {
        vscode.window.showInformationMessage(vscode.l10n.t('No Claude Code tab is open. Use "Claudine: Open Conversation" to open one.'));
      }
    })
  );

  // First-run welcome notification
  const hasSeenWelcome = context.globalState.get<boolean>('claudine.hasSeenWelcome', false);
  if (!hasSeenWelcome) {
    context.globalState.update('claudine.hasSeenWelcome', true);
    const walkthroughAction = vscode.l10n.t('Open Walkthrough');
    const openAction = vscode.l10n.t('Open Claudine');
    vscode.window.showInformationMessage(
      vscode.l10n.t('Claudine is ready! A kanban board for your Claude Code conversations.'),
      walkthroughAction,
      openAction
    ).then(selection => {
      if (selection === walkthroughAction) {
        vscode.commands.executeCommand(
          'workbench.action.openWalkthrough',
          'claudine.claudine#claudine.gettingStarted',
          true
        );
      } else if (selection === openAction) {
        vscode.commands.executeCommand('claudine.openKanban');
      }
    });
  }

  // --- Status bar button: agent integration setup / reference reminder ---
  const agentStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  context.subscriptions.push(agentStatusBar);

  // Command for the "not referenced" reminder — opens the file and shows a popup
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.remindAgentReference', async () => {
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) return;
      const targetPath = path.join(wsRoot, 'CLAUDINE.AGENTS.md');
      if (fs.existsSync(targetPath)) {
        const doc = await vscode.workspace.openTextDocument(targetPath);
        await vscode.window.showTextDocument(doc);
      }
      vscode.window.showWarningMessage(
        vscode.l10n.t('CLAUDINE.AGENTS.md is not referenced in AGENTS.md or CLAUDE.md. Add a reference so Claude Code agents can discover it.')
      );
    })
  );

  /** Check workspace files and update the status bar item accordingly. */
  function refreshAgentStatusBar() {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) {
      agentStatusBar.hide();
      return;
    }

    const state = getAgentIntegrationState(wsRoot);

    if (state === 'missing') {
      agentStatusBar.text = '$(plug) Claudine Agents';
      agentStatusBar.tooltip = vscode.l10n.t('Set up CLAUDINE.AGENTS.md so Claude Code agents can control the board');
      agentStatusBar.command = 'claudine.setupAgentIntegration';
      agentStatusBar.show();
      return;
    }

    if (state === 'unreferenced') {
      agentStatusBar.text = '$(warning) Claudine Agents';
      agentStatusBar.tooltip = vscode.l10n.t('CLAUDINE.AGENTS.md is not referenced in AGENTS.md or CLAUDE.md — click to fix');
      agentStatusBar.command = 'claudine.remindAgentReference';
      agentStatusBar.show();
      return;
    }

    // 'ok' — nothing to nudge about
    agentStatusBar.hide();
  }

  // Initial evaluation
  refreshAgentStatusBar();

  // Re-evaluate whenever relevant markdown files change
  const agentFileWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.workspace.workspaceFolders?.[0] ?? '', '{CLAUDINE.AGENTS.md,AGENTS.md,CLAUDE.md}')
  );
  agentFileWatcher.onDidCreate(() => refreshAgentStatusBar());
  agentFileWatcher.onDidChange(() => refreshAgentStatusBar());
  agentFileWatcher.onDidDelete(() => refreshAgentStatusBar());
  context.subscriptions.push(agentFileWatcher);

  // Notify when conversations need user input
  context.subscriptions.push(
    stateManager.onNeedsInput(conv => {
      const openAction = vscode.l10n.t('Open');
      vscode.window.showInformationMessage(
        vscode.l10n.t('"{0}" needs your input', conv.title),
        openAction
      ).then(selection => {
        if (selection === openAction) {
          kanbanProvider.openConversation(conv.id);
        }
      });
    })
  );

  // Notify and schedule auto-restart when a rate limit is detected
  context.subscriptions.push(
    stateManager.onRateLimitDetected(conv => {
      const resetDisplay = conv.rateLimitResetDisplay || 'soon';
      vscode.window.showWarningMessage(
        vscode.l10n.t('Rate limit hit — resets {0}', resetDisplay)
      );
      // Schedule auto-restart if the setting is enabled
      const autoRestart = vscode.workspace.getConfiguration('claudine').get<boolean>('autoRestartAfterRateLimit', false);
      if (autoRestart && conv.rateLimitResetTime) {
        kanbanProvider.scheduleAutoRestart(conv.rateLimitResetTime);
      }
    })
  );

  // Start watching for Claude Code changes
  provider.startWatching();

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudine')) {
        kanbanProvider.updateSettings();
      }
    })
  );

  // Clean up on deactivation
  context.subscriptions.push({
    dispose: () => {
      provider.stopWatching();
      commandProcessor.stopWatching();
    }
  });

  // Public API for other extensions
  // Usage: const claudine = vscode.extensions.getExtension('claudine.claudine')?.exports;
  return {
    getConversations: () => stateManager.getConversations(),
    getConversation: (id: string) => stateManager.getConversation(id),
    getConversationsByStatus: (status: ConversationStatus) => stateManager.getConversationsByStatus(status),
    moveConversation: (id: string, status: ConversationStatus) => {
      stateManager.moveConversation(id, status);
      kanbanProvider.refresh();
    },
    onConversationsChanged: stateManager.onConversationsChanged.bind(stateManager),
    onNeedsInput: stateManager.onNeedsInput.bind(stateManager),
  };
}

export function deactivate() {
  if (kanbanProvider) {
    kanbanProvider.dispose();
  }
  if (stateManager) {
    stateManager.flushSave();
  }
  if (provider) {
    provider.stopWatching();
  }
}
