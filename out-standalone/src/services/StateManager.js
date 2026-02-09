"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManager = void 0;
const constants_1 = require("../constants");
class StateManager {
    _storageService;
    _conversations = new Map();
    _onConversationsChanged;
    _onNeedsInput;
    _onRateLimitDetected;
    onConversationsChanged;
    /** Fires when a conversation transitions into 'needs-input' status. */
    onNeedsInput;
    /** Fires when a conversation becomes rate-limited (transition from not-limited to limited). */
    onRateLimitDetected;
    /** Resolves when saved state has been loaded from disk. Await before scanning. */
    ready;
    _readyResolve;
    _saveTimer;
    _notifyTimer;
    _sortedCache = null;
    constructor(_storageService, platform) {
        this._storageService = _storageService;
        this._onConversationsChanged = platform.createEventEmitter();
        this.onConversationsChanged = this._onConversationsChanged.event;
        this._onNeedsInput = platform.createEventEmitter();
        this.onNeedsInput = this._onNeedsInput.event;
        this._onRateLimitDetected = platform.createEventEmitter();
        this.onRateLimitDetected = this._onRateLimitDetected.event;
        this.ready = new Promise(resolve => { this._readyResolve = resolve; });
        this.loadState();
    }
    async loadState() {
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
        }
        finally {
            this._readyResolve();
        }
    }
    scheduleSave() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            const conversations = this.getConversations();
            this._storageService.saveBoardState({
                conversations,
                lastUpdated: new Date()
            });
        }, constants_1.SAVE_STATE_DEBOUNCE_MS);
    }
    /** Flush any pending debounced save immediately (e.g. on dispose). */
    flushSave() {
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
    getConversations() {
        if (!this._sortedCache) {
            this._sortedCache = Array.from(this._conversations.values())
                .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        return this._sortedCache;
    }
    getConversation(id) {
        return this._conversations.get(id);
    }
    setConversations(conversations) {
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
            const existing = this._conversations.get(conv.id);
            const prevStatus = existing?.status;
            const wasRateLimited = existing?.isRateLimited ?? false;
            this.mergeWithExisting(conv);
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
    updateConversation(conversation) {
        const existing = this._conversations.get(conversation.id);
        const wasRateLimited = existing?.isRateLimited ?? false;
        this.mergeWithExisting(conversation);
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
    mergeWithExisting(conv) {
        const existing = this._conversations.get(conv.id);
        if (!existing)
            return;
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
        }
        else {
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
            }
            else if (conv.hasQuestion) {
                // Agent asked a question → needs user input
                conv.status = 'needs-input';
            }
            else if (prev === 'done') {
                // Was done, agent re-ran briefly → restore to done
                conv.status = 'done';
            }
            else if (prev === 'cancelled') {
                // Was cancelled, agent re-ran briefly → restore to cancelled
                conv.status = 'cancelled';
            }
            else if (prev === 'in-review') {
                // Was in-review, agent re-ran → back to in-review
                conv.status = 'in-review';
            }
            else if (prev === 'needs-input') {
                // Was needs-input, agent answered → in-review (completed the work)
                conv.status = 'in-review';
            }
            else {
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
    removeConversation(id) {
        this._conversations.delete(id);
        this.invalidateSort();
        this.notifyChange();
        this.scheduleSave();
    }
    moveConversation(id, newStatus) {
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
    setConversationIcon(id, icon) {
        const conversation = this._conversations.get(id);
        if (conversation) {
            conversation.icon = icon;
            this._conversations.set(id, conversation);
            this.invalidateSort();
            this.notifyChange();
            this.scheduleSave();
        }
    }
    async clearAllIcons() {
        for (const conv of this._conversations.values()) {
            conv.icon = undefined;
        }
        this.invalidateSort();
        this.notifyChange();
        this.scheduleSave();
    }
    getConversationsByStatus(status) {
        return this.getConversations().filter(c => c.status === status);
    }
    /** Get all conversations currently paused due to a rate limit. */
    getRateLimitedConversations() {
        return this.getConversations().filter(c => c.isRateLimited);
    }
    async saveDrafts(drafts) {
        await this._storageService.saveDrafts(drafts);
    }
    async loadDrafts() {
        return this._storageService.loadDrafts();
    }
    static ARCHIVE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
    archiveAllDone() {
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
    archiveStaleConversations() {
        const now = Date.now();
        let changed = false;
        for (const conv of this._conversations.values()) {
            if ((conv.status === 'done' || conv.status === 'cancelled') &&
                (now - conv.updatedAt.getTime()) >= StateManager.ARCHIVE_THRESHOLD_MS) {
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
    invalidateSort() {
        this._sortedCache = null;
    }
    notifyChange() {
        clearTimeout(this._notifyTimer);
        this._notifyTimer = setTimeout(() => {
            this._onConversationsChanged.fire(this.getConversations());
        }, constants_1.NOTIFY_COALESCE_MS);
    }
}
exports.StateManager = StateManager;
//# sourceMappingURL=StateManager.js.map