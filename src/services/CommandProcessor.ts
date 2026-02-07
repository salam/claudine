import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from './StateManager';
import {
  AgentCommand,
  AgentCommandResult,
  AgentCommandType,
  ConversationStatus,
  ConversationCategory,
  Conversation
} from '../types';

const VALID_STATUSES: ConversationStatus[] = [
  'todo', 'needs-input', 'in-progress', 'in-review', 'done', 'cancelled', 'archived'
];

const VALID_CATEGORIES: ConversationCategory[] = [
  'user-story', 'bug', 'feature', 'improvement', 'task'
];

const MAX_COMMAND_AGE_MS = 5 * 60 * 1000;

export class CommandProcessor {
  private _processedIds = new Set<string>();
  private _watcher: vscode.FileSystemWatcher | undefined;
  private _commandsPath: string | undefined;
  private _resultsPath: string | undefined;

  constructor(private readonly _stateManager: StateManager) {}

  public startWatching() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) { return; }

    const claudinePath = path.join(workspaceFolder.uri.fsPath, '.claudine');
    this._commandsPath = path.join(claudinePath, 'commands.jsonl');
    this._resultsPath = path.join(claudinePath, 'command-results.json');

    const pattern = new vscode.RelativePattern(claudinePath, 'commands.jsonl');
    this._watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this._watcher.onDidCreate(() => this.processCommandFile());
    this._watcher.onDidChange(() => this.processCommandFile());

    // Process any commands written while the extension was not running
    this.processCommandFile();
  }

  public stopWatching() {
    this._watcher?.dispose();
    this._watcher = undefined;
  }

  private async processCommandFile() {
    if (!this._commandsPath) { return; }
    if (!fs.existsSync(this._commandsPath)) { return; }

    let content: string;
    try {
      content = fs.readFileSync(this._commandsPath, 'utf-8');
    } catch {
      return;
    }

    if (!content.trim()) { return; }

    const lines = content.split('\n').filter(l => l.trim());
    const results: AgentCommandResult[] = [];
    const now = Date.now();

    for (const line of lines) {
      let command: AgentCommand;
      try {
        command = JSON.parse(line);
      } catch {
        console.warn('Claudine: Skipping invalid JSON line in commands.jsonl');
        continue;
      }

      if (!command.id || !command.command || !command.task) {
        console.warn('Claudine: Skipping command with missing required fields');
        continue;
      }

      // Idempotency: skip already-processed commands
      if (this._processedIds.has(command.id)) { continue; }

      // Skip stale commands
      const age = now - new Date(command.timestamp).getTime();
      if (age > MAX_COMMAND_AGE_MS) {
        this._processedIds.add(command.id);
        continue;
      }

      const result = this.executeCommand(command);
      results.push(result);
      this._processedIds.add(command.id);
    }

    // Truncate the commands file
    try {
      fs.writeFileSync(this._commandsPath, '');
    } catch {
      console.error('Claudine: Failed to truncate commands.jsonl');
    }

    if (results.length > 0) {
      this.writeResults(results);
      console.log(`Claudine: Processed ${results.length} agent command(s)`);
    }
  }

  private executeCommand(command: AgentCommand): AgentCommandResult {
    const base = { commandId: command.id, timestamp: new Date().toISOString() };

    try {
      switch (command.command) {
        case 'move':
          return this.executeMove(command, base);
        case 'update':
          return this.executeUpdate(command, base);
        case 'set-category':
          return this.executeSetCategory(command, base);
        default:
          return { ...base, success: false, error: `Unknown command: ${command.command}` };
      }
    } catch (error) {
      return { ...base, success: false, error: String(error) };
    }
  }

  private executeMove(
    command: AgentCommand,
    base: { commandId: string; timestamp: string }
  ): AgentCommandResult {
    if (!command.status) {
      return { ...base, success: false, error: 'Missing "status" field for move command' };
    }
    if (!VALID_STATUSES.includes(command.status)) {
      return { ...base, success: false, error: `Invalid status: ${command.status}. Valid: ${VALID_STATUSES.join(', ')}` };
    }

    const conversation = this.resolveTask(command.task);
    if (!conversation) {
      return { ...base, success: false, error: `Task not found: ${command.task}` };
    }

    this._stateManager.moveConversation(conversation.id, command.status);
    return { ...base, success: true };
  }

  private executeUpdate(
    command: AgentCommand,
    base: { commandId: string; timestamp: string }
  ): AgentCommandResult {
    const conversation = this.resolveTask(command.task);
    if (!conversation) {
      return { ...base, success: false, error: `Task not found: ${command.task}` };
    }

    if (command.title !== undefined) { conversation.title = command.title; }
    if (command.description !== undefined) { conversation.description = command.description; }
    conversation.updatedAt = new Date();

    this._stateManager.updateConversation(conversation);
    return { ...base, success: true };
  }

  private executeSetCategory(
    command: AgentCommand,
    base: { commandId: string; timestamp: string }
  ): AgentCommandResult {
    if (!command.category) {
      return { ...base, success: false, error: 'Missing "category" field for set-category command' };
    }
    if (!VALID_CATEGORIES.includes(command.category)) {
      return { ...base, success: false, error: `Invalid category: ${command.category}. Valid: ${VALID_CATEGORIES.join(', ')}` };
    }

    const conversation = this.resolveTask(command.task);
    if (!conversation) {
      return { ...base, success: false, error: `Task not found: ${command.task}` };
    }

    conversation.category = command.category;
    conversation.updatedAt = new Date();

    this._stateManager.updateConversation(conversation);
    return { ...base, success: true };
  }

  /** Resolve a task identifier to a Conversation. Supports exact ID or title matching. */
  private resolveTask(taskIdentifier: string): Conversation | undefined {
    // 1. Exact ID match
    const byId = this._stateManager.getConversation(taskIdentifier);
    if (byId) { return byId; }

    // 2. Title match (case-insensitive)
    const conversations = this._stateManager.getConversations();
    const lower = taskIdentifier.toLowerCase();

    // Exact title match
    const exactTitle = conversations.find(c => c.title.toLowerCase() === lower);
    if (exactTitle) { return exactTitle; }

    // Substring match
    const substring = conversations.find(c => c.title.toLowerCase().includes(lower));
    if (substring) { return substring; }

    return undefined;
  }

  private writeResults(results: AgentCommandResult[]) {
    if (!this._resultsPath) { return; }

    try {
      let existing: AgentCommandResult[] = [];
      if (fs.existsSync(this._resultsPath)) {
        try {
          existing = JSON.parse(fs.readFileSync(this._resultsPath, 'utf-8')).results || [];
        } catch { /* ignore parse errors */ }
      }

      const all = [...existing, ...results].slice(-50);
      fs.writeFileSync(this._resultsPath, JSON.stringify({ results: all }, null, 2));
    } catch (error) {
      console.error('Claudine: Error writing command results', error);
    }
  }
}
