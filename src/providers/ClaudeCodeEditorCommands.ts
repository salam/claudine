/**
 * Claude Code–specific editor integration.
 *
 * Wraps the `claude-vscode` extension commands for opening conversations,
 * sending prompts, focusing the editor, and interrupting running sessions.
 */

import * as vscode from 'vscode';
import { IEditorCommands } from './IEditorCommands';

export class ClaudeCodeEditorCommands implements IEditorCommands {

  async openConversation(conversationId: string): Promise<boolean> {
    try {
      await vscode.commands.executeCommand('claude-vscode.editor.open', conversationId);
      return true;
    } catch {
      return false;
    }
  }

  async sendPrompt(conversationId: string, prompt: string): Promise<boolean> {
    try {
      await vscode.commands.executeCommand('claude-vscode.editor.open', conversationId, prompt);
      return true;
    } catch {
      return false;
    }
  }

  async startNewConversation(prompt: string): Promise<boolean> {
    try {
      await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, prompt);
      return true;
    } catch {
      return false;
    }
  }

  async focusEditor(): Promise<boolean> {
    try {
      await vscode.commands.executeCommand('claude-vscode.focus');
      return true;
    } catch {
      return false;
    }
  }

  interruptTerminals(): void {
    for (const terminal of vscode.window.terminals) {
      const name = terminal.name;
      if (/claude/i.test(name) && !/claudine/i.test(name)) {
        terminal.sendText('\x03', false);
      }
    }
  }
}
