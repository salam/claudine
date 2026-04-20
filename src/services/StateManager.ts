import { IPlatformAdapter, PlatformEvent, PlatformEventEmitter } from '../platform/IPlatformAdapter';
import { StorageService } from './StorageService';
import { Conversation, ConversationStatus } from '../types';
import { SAVE_STATE_DEBOUNCE_MS, NOTIFY_COALESCE_MS } from '../constants';

export class StateManager {
  private _conversations: Map<string, Conversation> = new Map();
  private _nextShortId: number = 1;
  private _onConversationsChanged: PlatformEventEmitter<Conversation[]>;
  private _onNeedsInput: PlatformEventEmitter<Conversation>;
  private _onRateLimitDetected: PlatformEventEmitter<Conversation>;

  public readonly onConversationsChanged: PlatformEvent<Conversation[]>;
  /** Fires when a conversation transitions into 'needs-input' status. */
  public readonly onNeedsInput: PlatformEvent<Conversation>;
  /** Fires when a conversation becomes rate-limited (transition from not-limited to limited). */
  public readonly onRateLimitDetected: PlatformEvent<Conversation>;

  /** Resolves when saved state has been loaded from disk. Await before scanning. */
  public readonly ready: Promise<void>;
  private _readyResolve!: () => void;
  private _saveTimer: ReturnType<typeof setTimeout> | undefined;
  private _notifyTimer: ReturnType<typeof setTimeout> | undefined;
  private _sortedCache: Conversation[] | null = null;

  constructor(
    private readonly _storageService: StorageService,
    platform: IPlatformAdapter
  ) {
    this._onConversationsChanged = platform.createEventEmitter<Conversation[]>();
    this.onConversationsChanged = this._onConversationsChanged.event;
    this._onNeedsInput = platform.createEventEmitter<Conversation>();
    this.onNeedsInput = this._onNeedsInput.event;
    this._onRateLimitDetected = platform.createEventEmitter<Conversation>();
    this.onRateLimitDetected = this._onRateLimitDetected.event;

    this.ready = new Promise(resolve => { this._readyResolve = resolve; });
    this.loadState();
  }

  private async loadState() {
    try {
      this._nextShortId = this._storageService.getGlobalSetting('shortIdCounter', 1);
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

  private scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      const conversations = this.getConversations();
      this._storageService.saveBoardState({
        conversations,
        lastUpdated: new Date()
      });
    }, SAVE_STATE_DEBOUNCE_MS);
  }

  /** Flush any pending debounced save immediately (e.g. on dispose). */
  public flushSave() {
    if (this._saveTimer !== undefined) {
      clearTimeout(this._saveTimer);
      this._saveTimer = undefined;
      const conversations = this.getConversations();
      this._storageService.saveBoardState({
        conversations,
        lastUpdated: new Date()
      });
    }
  }

  public getConversations(): Conversation[] {
    if (!this._sortedCache) {
      this._sortedCache = Array.from(this._conversations.values())
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    return this._sortedCache;
  }

  public getConversation(id: string): Conversation | undefined {
    return this._conversations.get(id);
  }

  public getConversationByShortId(shortId: string): Conversation | undefined {
    const lower = shortId.toLowerCase();
    for (const conv of this._conversations.values()) {
      if (conv.shortId?.toLowerCase() === lower) return conv;
    }
    return undefined;
  }

  private assignShortId(conv: Conversation): void {
    if (conv.shortId) return;
    conv.shortId = 'T-' + this._nextShortId++;
    this._storageService.saveGlobalSetting('shortIdCounter', this._nextShortId);
  }

  /**
   * Replace conversations from a scan.
   *
   * When `providerTag` is given, only conversations whose `provider` matches
   * the tag are eligible for deletion — this prevents two providers from
   * clobbering each other's entries. Without a tag the original behaviour
   * (delete anything missing from the scan) is preserved for backward compat.
   */
  public setConversations(conversations: Conversation[], providerTag?: string) {
    // Build the new set of IDs from the scan results
    const scannedIds = new Set(conversations.map(c => c.id));

    // Remove conversations that no longer have a JSONL file on disk.
    // When a providerTag is specified, only remove entries from that provider.
    for (const [id, existing] of this._conversations.entries()) {
      if (!scannedIds.has(id)) {
        if (!providerTag || existing.provider === providerTag) {
          this._conversations.delete(id);
        }
      }
    }

    // Merge with existing conversations, preserving manual overrides
    for (const conv of conversations) {
      const existing = this._conversations.get(conv.id);
      const prevStatus = existing?.status;
      const wasRateLimited = existing?.isRateLimited ?? false;
      this.mergeWithExisting(conv);
      this.assignShortId(conv);
      this._conversations.set(conv.id, conv);
      if (conv.status === 'needs-input' && prevStatus && prevStatus !== 'needs-input') {
        this._onNeedsInput.fire(conv);
      }
      if (conv.isRateLimited && !wasRateLimited) {
        this._onRateLimitDetected.fire(conv);
      }
    }

    this.archiveStaleConversations();
    this.invalidateSort();
    this.notifyChange();
    this.scheduleSave();
  }

  public updateConversation(conversation: Conversation) {
    const existing = this._conversations.get(conversation.id);
    const wasRateLimited = existing?.isRateLimited ?? false;
    this.mergeWithExisting(conversation);
    this.assignShortId(conversation);
    this._conversations.set(conversation.id, conversation);
    if (conversation.isRateLimited && !wasRateLimited) {
      this._onRateLimitDetected.fire(conversation);
    }
    this.invalidateSort();
    this.notifyChange();
    this.scheduleSave();
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

    // Preserve icon and short ID
    if (existing.icon && !conv.icon) {
      conv.icon = existing.icon;
    }
    if (existing.shortId && !conv.shortId) {
      conv.shortId = existing.shortId;
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

      // BUG10: New content arrived but the conversation is not actively running.
      // Trailing agent output (e.g. final tool results, closing messages) must not
      // bump a manually-closed task back into an active column. Only allow
      // re-activation when the conversation is genuinely resumed (isActive means
      // recent messages within RECENTLY_ACTIVE_WINDOW_MS).
      if (!conv.agents.some(a => a.isActive)) {
        conv.status = existing.status;
        conv.previousStatus = existing.previousStatus;
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
    this.invalidateSort();
    this.notifyChange();
    this.scheduleSave();
  }

  public moveConversation(id: string, newStatus: ConversationStatus) {
    const conversation = this._conversations.get(id);
    if (conversation) {
      // Manual moves clear previousStatus — the user explicitly chose this status
      conversation.previousStatus = undefined;
      conversation.status = newStatus;
      conversation.updatedAt = new Date();
      this._conversations.set(id, conversation);
      this.invalidateSort();
      this.notifyChange();
      this.scheduleSave();
    }
  }

  public setConversationIcon(id: string, icon: string) {
    const conversation = this._conversations.get(id);
    if (conversation) {
      conversation.icon = icon;
      this._conversations.set(id, conversation);
      this.invalidateSort();
      this.notifyChange();
      this.scheduleSave();
    }
  }

  public async clearAllIcons() {
    for (const conv of this._conversations.values()) {
      conv.icon = undefined;
    }
    this.invalidateSort();
    this.notifyChange();
    this.scheduleSave();
  }

  public getConversationsByStatus(status: ConversationStatus): Conversation[] {
    return this.getConversations().filter(c => c.status === status);
  }

  /** Get all conversations currently paused due to a rate limit. */
  public getRateLimitedConversations(): Conversation[] {
    return this.getConversations().filter(c => c.isRateLimited);
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
      this.invalidateSort();
      this.notifyChange();
      this.scheduleSave();
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
      this.invalidateSort();
      this.notifyChange();
      this.scheduleSave();
    }
  }

  private invalidateSort() {
    this._sortedCache = null;
  }

  private notifyChange() {
    clearTimeout(this._notifyTimer);
    this._notifyTimer = setTimeout(() => {
      this._onConversationsChanged.fire(this.getConversations());
    }, NOTIFY_COALESCE_MS);
  }
}
