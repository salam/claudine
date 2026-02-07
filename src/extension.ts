import * as vscode from 'vscode';
import { KanbanViewProvider } from './providers/KanbanViewProvider';
import { ClaudeCodeWatcher } from './providers/ClaudeCodeWatcher';
import { StateManager } from './services/StateManager';
import { StorageService } from './services/StorageService';
import { ImageGenerator } from './services/ImageGenerator';

let kanbanProvider: KanbanViewProvider;
let claudeCodeWatcher: ClaudeCodeWatcher;
let stateManager: StateManager;
let storageService: StorageService;
let imageGenerator: ImageGenerator;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Claudine extension is now active');

  // Initialize services
  storageService = new StorageService(context);
  stateManager = new StateManager(storageService);
  imageGenerator = new ImageGenerator(storageService);
  claudeCodeWatcher = new ClaudeCodeWatcher(stateManager, context, imageGenerator);

  // Wait for saved state to load before scanning — prevents stale cross-project
  // conversations from being re-injected after setConversations() cleans up.
  await stateManager.ready;

  // Initialize the Kanban view provider
  kanbanProvider = new KanbanViewProvider(
    context.extensionUri,
    stateManager,
    claudeCodeWatcher
  );

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

  // Start watching for Claude Code changes
  claudeCodeWatcher.startWatching();

  // Close restored-but-empty Claude tabs after conversations load.
  // After a workspace restart VSCode restores Claude editor tabs as empty shells.
  const sweepDisposable = stateManager.onConversationsChanged(() => {
    sweepDisposable.dispose(); // only run once
    // Short delay so tabs have time to fully initialize
    setTimeout(() => kanbanProvider.closeEmptyClaudeTabs(), 2000);
  });
  context.subscriptions.push(sweepDisposable);

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
    }
  });
}

export function deactivate() {
  if (claudeCodeWatcher) {
    claudeCodeWatcher.stopWatching();
  }
}
