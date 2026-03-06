/**
 * Abstraction for editor integration commands.
 *
 * Each conversation provider may have its own VS Code extension (or none)
 * with different command names for opening, focusing, and interacting
 * with conversations. This interface decouples the Kanban board UI from
 * any specific extension's command surface.
 */

export interface IEditorCommands {
  /** Open an existing conversation by ID. Returns false if unavailable. */
  openConversation(conversationId: string): Promise<boolean>;
  /** Send a prompt to an existing conversation. Returns false if unavailable. */
  sendPrompt(conversationId: string, prompt: string): Promise<boolean>;
  /** Start a brand-new conversation with a prompt. Returns false if unavailable. */
  startNewConversation(prompt: string): Promise<boolean>;
  /** Focus the provider's editor panel. Returns false if unavailable. */
  focusEditor(): Promise<boolean>;
  /** Send an interrupt signal (e.g. Ctrl+C) to the provider's terminals. */
  interruptTerminals(): void;
}
