/**
 * Editor commands stub for OpenAI Codex.
 *
 * The Codex VS Code extension (`openai.chatgpt`) doesn't expose a documented
 * command API yet, so all methods return false / no-op. This can be fleshed
 * out once the Codex extension publishes public commands.
 */

import { IEditorCommands } from './IEditorCommands';

export class CodexEditorCommands implements IEditorCommands {

  async openConversation(_conversationId: string): Promise<boolean> {
    return false;
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
