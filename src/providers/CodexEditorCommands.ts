/**
 * Editor commands for OpenAI Codex.
 *
 * The Codex VS Code extension (`openai.chatgpt`) doesn't expose a documented
 * command API yet. As a fallback, conversations are opened by displaying their
 * session JSONL file. This can be fleshed out once the Codex extension
 * publishes public commands.
 */

import * as vscode from 'vscode';
import { IEditorCommands } from './IEditorCommands';
import { StateManager } from '../services/StateManager';

export class CodexEditorCommands implements IEditorCommands {

  constructor(private readonly _stateManager: StateManager) {}

  async openConversation(conversationId: string): Promise<boolean> {
    const conv = this._stateManager.getConversation(conversationId);
    if (!conv?.filePath) {
      return false;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(conv.filePath);
      await vscode.window.showTextDocument(doc, { preview: false });
      return true;
    } catch {
      return false;
    }
  }

  async sendPrompt(_conversationId: string, _prompt: string): Promise<boolean> {
    return false;
  }

  async startNewConversation(_prompt: string): Promise<boolean> {
    return false;
  }

  async focusEditor(): Promise<boolean> {
    return false;
  }

  interruptTerminals(): void {
    // No-op — Codex terminal detection not implemented yet
  }
}
