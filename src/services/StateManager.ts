import * as vscode from 'vscode';
import { StorageService } from './StorageService';
import { Conversation, ConversationStatus } from '../types';

export class StateManager {
  private _conversations: Map<string, Conversation> = new Map();
  private _onConversationsChanged: vscode.EventEmitter<Conversation[]>;

  public readonly onConversationsChanged: vscode.Event<Conversation[]>;

  /** Resolves when saved state has been loaded from disk. Await before scanning. */
  public readonly ready: Promise<void>;
  private _readyResolve!: () => void;

  constructor(private readonly _storageService: StorageService) {
    this._onConversationsChanged = new vscode.EventEmitter<Conversation[]>();
    this.onConversationsChanged = this._onConversationsChanged.event;

    this.ready = new Promise(resolve => { this._readyResolve = resolve; });
    this.loadState();
  }

  private async loadState() {
    try {
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
    } finally {
      this._readyResolve();
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
    // Build the new set of IDs from the scan results
    const scannedIds = new Set(conversations.map(c => c.id));

    // Remove conversations that no longer have a JSONL file on disk
    for (const id of this._conversations.keys()) {
      if (!scannedIds.has(id)) {
        this._conversations.delete(id);
      }
    }

    // Merge with existing conversations, preserving manual overrides
    for (const conv of conversations) {
      this.mergeWithExisting(conv);
      this._conversations.set(conv.id, conv);
    }

    this.archiveStaleConversations();
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
   *
   * Handles two key scenarios:
   * 1. Manual status overrides (done/cancelled/archived) are preserved until
   *    new activity is detected (updatedAt advances).
   * 2. Agent active→inactive transitions: when an agent was working (isActive)
   *    and becomes idle, the status is updated based on the conversation state
   *    and the status it had before the agent started working.
   *
   * IMPORTANT: `isActive` is based on a 2-minute time window, so it can flip
   * from true→false on a mere re-parse without any new content. We must only
   * trigger the transition when the JSONL file actually has new messages
   * (updatedAt advanced), not when the time window simply expires.
   */
  private mergeWithExisting(conv: Conversation) {
    const existing = this._conversations.get(conv.id);
    if (!existing) return;

    // Preserve icon
    if (existing.icon && !conv.icon) {
      conv.icon = existing.icon;
    }

    const hasNewContent = conv.updatedAt.getTime() > existing.updatedAt.getTime();

    // Preserve manual done/cancelled/archived while no new messages arrive.
    // Also preserve updatedAt so the archive timer counts from when the status
    // was set (e.g. via moveConversation), not from the JSONL file's last activity.
    if (existing.status === 'done' || existing.status === 'cancelled' || existing.status === 'archived') {
      if (!hasNewContent) {
        conv.status = existing.status;
        conv.previousStatus = existing.previousStatus;
        conv.updatedAt = existing.updatedAt;
        return;
      }
    }

    const wasActive = existing.agents.some(a => a.isActive);
    const isNowActive = conv.agents.some(a => a.isActive);

    // Track previousStatus: when a conversation enters in-progress, remember where it came from
    if (hasNewContent && conv.status === 'in-progress' && existing.status !== 'in-progress') {
      conv.previousStatus = existing.status;
    } else {
      // Carry forward the existing previousStatus
      conv.previousStatus = existing.previousStatus;
    }

    // Detect active → inactive transition (agent finished working).
    // Only trigger when the JSONL file has new content — a stale re-parse
    // where isRecentlyActive() naturally expires must NOT cause a transition.
    if (wasActive && !isNowActive && hasNewContent) {
      const prev = conv.previousStatus;

      if (conv.hasError) {
        // Error → needs user attention
        conv.status = 'needs-input';
      } else if (conv.hasQuestion) {
        // Agent asked a question → needs user input
        conv.status = 'needs-input';
      } else if (prev === 'done') {
        // Was done, agent re-ran briefly → restore to done
        conv.status = 'done';
      } else if (prev === 'cancelled') {
        // Was cancelled, agent re-ran briefly → restore to cancelled
        conv.status = 'cancelled';
      } else if (prev === 'in-review') {
        // Was in-review, agent re-ran → back to in-review
        conv.status = 'in-review';
      } else if (prev === 'needs-input') {
        // Was needs-input, agent answered → in-review (completed the work)
        conv.status = 'in-review';
      } else {
        // Default: agent finished → in-review
        conv.status = 'in-review';
      }

      // Clear previousStatus since the transition is complete
      conv.previousStatus = undefined;
    }

    // No new content: preserve existing status (parser's detection is based
    // on the same stale data, so the existing status is more trustworthy).
    if (!hasNewContent && !isNowActive) {
      conv.status = existing.status;
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
      // Manual moves clear previousStatus — the user explicitly chose this status
      conversation.previousStatus = undefined;
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

  private static readonly ARCHIVE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

  public archiveAllDone(): void {
    let changed = false;
    for (const conv of this._conversations.values()) {
      if (conv.status === 'done' || conv.status === 'cancelled') {
        conv.status = 'archived';
        conv.updatedAt = new Date();
        changed = true;
      }
    }
    if (changed) {
      this.notifyChange();
      this.saveState();
    }
  }

  public archiveStaleConversations(): void {
    const now = Date.now();
    let changed = false;

    for (const conv of this._conversations.values()) {
      if (
        (conv.status === 'done' || conv.status === 'cancelled') &&
        (now - conv.updatedAt.getTime()) >= StateManager.ARCHIVE_THRESHOLD_MS
      ) {
        conv.status = 'archived';
        changed = true;
      }
    }

    if (changed) {
      this.notifyChange();
      this.saveState();
    }
  }

  private notifyChange() {
    this._onConversationsChanged.fire(this.getConversations());
  }
}
