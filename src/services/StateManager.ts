import * as vscode from 'vscode';
import { StorageService } from './StorageService';
import { Conversation, ConversationStatus } from '../types';

export class StateManager {
  private _conversations: Map<string, Conversation> = new Map();
  private _onConversationsChanged: vscode.EventEmitter<Conversation[]>;

  public readonly onConversationsChanged: vscode.Event<Conversation[]>;

  constructor(private readonly _storageService: StorageService) {
    this._onConversationsChanged = new vscode.EventEmitter<Conversation[]>();
    this.onConversationsChanged = this._onConversationsChanged.event;

    // Load saved state
    this.loadState();
  }

  private async loadState() {
    const savedState = await this._storageService.loadBoardState();
    if (savedState?.conversations) {
      for (const conv of savedState.conversations) {
        this._conversations.set(conv.id, {
          ...conv,
          createdAt: new Date(conv.createdAt),
          updatedAt: new Date(conv.updatedAt)
        });
      }
    }
  }

  private async saveState() {
    const conversations = this.getConversations();
    await this._storageService.saveBoardState({
      conversations,
      lastUpdated: new Date()
    });
  }

  public getConversations(): Conversation[] {
    return Array.from(this._conversations.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  public getConversation(id: string): Conversation | undefined {
    return this._conversations.get(id);
  }

  public setConversations(conversations: Conversation[]) {
    // Merge with existing conversations, preserving manual overrides
    for (const conv of conversations) {
      this.mergeWithExisting(conv);
      this._conversations.set(conv.id, conv);
    }

    this.notifyChange();
    this.saveState();
  }

  public updateConversation(conversation: Conversation) {
    this.mergeWithExisting(conversation);
    this._conversations.set(conversation.id, conversation);
    this.notifyChange();
    this.saveState();
  }

  /**
   * Merge an incoming (parsed) conversation with the existing one.
   * Manual status overrides (done/cancelled) are preserved only while the
   * conversation has no new activity. Once Claude Code adds new messages
   * (updatedAt advances past the override timestamp), the auto-detected
   * status takes over again.
   */
  private mergeWithExisting(conv: Conversation) {
    const existing = this._conversations.get(conv.id);
    if (!existing) return;

    if (existing.status === 'done' || existing.status === 'cancelled') {
      const hasNewActivity = conv.updatedAt.getTime() > existing.updatedAt.getTime();
      if (!hasNewActivity) {
        conv.status = existing.status;
      }
    }

    if (existing.icon && !conv.icon) {
      conv.icon = existing.icon;
    }
  }

  public removeConversation(id: string) {
    this._conversations.delete(id);
    this.notifyChange();
    this.saveState();
  }

  public moveConversation(id: string, newStatus: ConversationStatus) {
    const conversation = this._conversations.get(id);
    if (conversation) {
      conversation.status = newStatus;
      conversation.updatedAt = new Date();
      this._conversations.set(id, conversation);
      this.notifyChange();
      this.saveState();
    }
  }

  public setConversationIcon(id: string, icon: string) {
    const conversation = this._conversations.get(id);
    if (conversation) {
      conversation.icon = icon;
      this._conversations.set(id, conversation);
      this.notifyChange();
      this.saveState();
    }
  }

  public async clearAllIcons() {
    for (const conv of this._conversations.values()) {
      conv.icon = undefined;
    }
    this.notifyChange();
    await this.saveState();
  }

  public getConversationsByStatus(status: ConversationStatus): Conversation[] {
    return this.getConversations().filter(c => c.status === status);
  }

  public async saveDrafts(drafts: Array<{ id: string; title: string }>): Promise<void> {
    await this._storageService.saveDrafts(drafts);
  }

  public async loadDrafts(): Promise<Array<{ id: string; title: string }>> {
    return this._storageService.loadDrafts();
  }

  private notifyChange() {
    this._onConversationsChanged.fire(this.getConversations());
  }
}
