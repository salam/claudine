import * as vscode from 'vscode';
import { KanbanViewProvider } from './providers/KanbanViewProvider';
import { ClaudeCodeWatcher } from './providers/ClaudeCodeWatcher';
import { StateManager } from './services/StateManager';
import { StorageService } from './services/StorageService';
import { ImageGenerator } from './services/ImageGenerator';
import { CommandProcessor } from './services/CommandProcessor';
import { ConversationStatus } from './types';

let kanbanProvider: KanbanViewProvider;
let claudeCodeWatcher: ClaudeCodeWatcher;
let stateManager: StateManager;
let storageService: StorageService;
let imageGenerator: ImageGenerator;
let commandProcessor: CommandProcessor;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Claudine extension is now active');

  // Initialize services
  storageService = new StorageService(context);
  stateManager = new StateManager(storageService);
  imageGenerator = new ImageGenerator(storageService);
  imageGenerator.setSecretStorage(context.secrets);
  claudeCodeWatcher = new ClaudeCodeWatcher(stateManager, context, imageGenerator);

  // Wait for saved state to load before scanning — prevents stale cross-project
  // conversations from being re-injected after setConversations() cleans up.
  await stateManager.ready;

  // Watch for agent commands in .claudine/commands.jsonl
  commandProcessor = new CommandProcessor(stateManager);
  commandProcessor.startWatching();

  // Initialize the Kanban view provider
  kanbanProvider = new KanbanViewProvider(
    context.extensionUri,
    stateManager,
    claudeCodeWatcher
  );
  kanbanProvider.setSecretStorage(context.secrets);

  // One-time migration: move API key from plaintext settings to encrypted secret storage
  const legacyKey = vscode.workspace.getConfiguration('claudine').get<string>('imageGenerationApiKey', '');
  if (legacyKey) {
    await context.secrets.store('imageGenerationApiKey', legacyKey);
    await vscode.workspace.getConfiguration('claudine').update('imageGenerationApiKey', undefined, vscode.ConfigurationTarget.Global);
  }

  // Register the webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'claudine.kanbanView',
      kanbanProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.openKanban', () => {
      vscode.commands.executeCommand('claudine.kanbanView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.refresh', () => {
      claudeCodeWatcher.refresh();
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
        vscode.window.showInformationMessage('No conversations found. Start a Claude Code conversation first.');
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
        placeHolder: 'Select a conversation to open',
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
        placeHolder: 'Search conversation content...',
        prompt: 'Enter text to search across all conversation JSONL files'
      });
      if (!query) return;
      const matchIds = claudeCodeWatcher.searchConversations(query);
      if (matchIds.length === 0) {
        vscode.window.showInformationMessage(`No conversations found matching "${query}".`);
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
        placeHolder: `${matchIds.length} conversation(s) matching "${query}"`,
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
        placeHolder: 'What would you like Claude to work on?',
        prompt: 'Enter a prompt to start a new Claude Code conversation'
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
        vscode.window.showInformationMessage('No active conversations to move.');
        return;
      }
      const convItems = conversations.map(c => ({
        label: c.title,
        description: c.status,
        detail: c.description,
        conversationId: c.id
      }));
      const pickedConv = await vscode.window.showQuickPick(convItems, {
        placeHolder: 'Select a conversation to move'
      });
      if (!pickedConv) return;
      const statusOptions: Array<{ label: string; status: ConversationStatus }> = [
        { label: '$(circle-outline) To Do', status: 'todo' },
        { label: '$(bell) Needs Input', status: 'needs-input' },
        { label: '$(sync~spin) In Progress', status: 'in-progress' },
        { label: '$(eye) In Review', status: 'in-review' },
        { label: '$(check) Done', status: 'done' },
        { label: '$(circle-slash) Cancelled', status: 'cancelled' },
        { label: '$(archive) Archived', status: 'archived' }
      ];
      const pickedStatus = await vscode.window.showQuickPick(statusOptions, {
        placeHolder: `Move "${pickedConv.label}" to...`
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
        vscode.window.showInformationMessage('No conversations need input right now.');
        return;
      }
      const items = conversations.map(c => ({
        label: `$(bell) ${c.title}`,
        detail: c.lastMessage || c.description,
        conversationId: c.id
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `${conversations.length} conversation(s) need your input`
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
        vscode.window.showInformationMessage('No conversations are in progress.');
        return;
      }
      const items = conversations.map(c => ({
        label: `$(sync~spin) ${c.title}`,
        detail: c.lastMessage || c.description,
        conversationId: c.id
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `${conversations.length} conversation(s) in progress`
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
      vscode.window.showInformationMessage('Archived all completed and cancelled conversations.');
    })
  );

  // Toggle AI Summarization
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.toggleSummarization', () => {
      const cfg = vscode.workspace.getConfiguration('claudine');
      const current = cfg.get<boolean>('enableSummarization', false);
      cfg.update('enableSummarization', !current, vscode.ConfigurationTarget.Global).then(() => {
        kanbanProvider.updateSettings();
        vscode.window.showInformationMessage(`AI Summarization ${!current ? 'enabled' : 'disabled'}.`);
        if (!current) {
          claudeCodeWatcher.refresh();
        }
      });
    })
  );

  // Regenerate All Icons
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.regenerateIcons', async () => {
      await stateManager.clearAllIcons();
      claudeCodeWatcher.clearPendingIcons();
      claudeCodeWatcher.refresh();
      vscode.window.showInformationMessage('Regenerating all conversation icons...');
    })
  );

  // Open Settings — jump to Claudine settings in VS Code
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:claudine.claudine');
    })
  );

  // Focus Active Claude Tab
  context.subscriptions.push(
    vscode.commands.registerCommand('claudine.focusClaude', async () => {
      const focused = await kanbanProvider.focusAnyClaudeTab();
      if (!focused) {
        vscode.window.showInformationMessage('No Claude Code tab is open. Use "Claudine: Open Conversation" to open one.');
      }
    })
  );

  // First-run welcome notification
  const hasSeenWelcome = context.globalState.get<boolean>('claudine.hasSeenWelcome', false);
  if (!hasSeenWelcome) {
    context.globalState.update('claudine.hasSeenWelcome', true);
    vscode.window.showInformationMessage(
      'Claudine is ready! Find the 🐘 Claudine tab in the bottom panel (next to Terminal).',
      'Open Claudine'
    ).then(selection => {
      if (selection === 'Open Claudine') {
        vscode.commands.executeCommand('claudine.kanbanView.focus');
      }
    });
  }

  // Start watching for Claude Code changes
  claudeCodeWatcher.startWatching();

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
      claudeCodeWatcher.stopWatching();
      commandProcessor.stopWatching();
    }
  });
}

export function deactivate() {
  if (claudeCodeWatcher) {
    claudeCodeWatcher.stopWatching();
  }
}
