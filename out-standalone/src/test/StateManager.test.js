"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const events_1 = require("events");
const StateManager_1 = require("../services/StateManager");
const constants_1 = require("../constants");
function createMockPlatform() {
    return {
        createEventEmitter() {
            const ee = new events_1.EventEmitter();
            return {
                get event() {
                    return (listener) => {
                        ee.on('data', listener);
                        return { dispose: () => { ee.removeListener('data', listener); } };
                    };
                },
                fire: (data) => { ee.emit('data', data); },
                dispose: () => { ee.removeAllListeners(); }
            };
        },
        watchFiles: () => ({ dispose: () => { } }),
        getConfig: (_k, d) => d,
        ensureDirectory: async () => { },
        writeFile: async () => { },
        readFile: async () => new Uint8Array(),
        stat: async () => undefined,
        getGlobalState: (_k, d) => d,
        setGlobalState: async () => { },
        getSecret: async () => undefined,
        setSecret: async () => { },
        getGlobalStoragePath: () => '/tmp/claudine-test',
        getWorkspaceFolders: () => null,
        isDevelopmentMode: () => false,
        getExtensionPath: () => undefined,
    };
}
// Create a mock storage instance reused across tests
function createMockStorage() {
    return {
        loadBoardState: vitest_1.vi.fn().mockResolvedValue(null),
        saveBoardState: vitest_1.vi.fn().mockResolvedValue(undefined),
        loadDrafts: vitest_1.vi.fn().mockResolvedValue([]),
        saveDrafts: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
}
// Mock the StorageService module with a proper class
vitest_1.vi.mock('../services/StorageService', () => {
    return {
        StorageService: class MockStorageService {
            loadBoardState = vitest_1.vi.fn().mockResolvedValue(null);
            saveBoardState = vitest_1.vi.fn().mockResolvedValue(undefined);
            loadDrafts = vitest_1.vi.fn().mockResolvedValue([]);
            saveDrafts = vitest_1.vi.fn().mockResolvedValue(undefined);
        },
    };
});
function makeConversation(overrides = {}) {
    return {
        id: overrides.id || 'conv-1',
        title: 'Test Conversation',
        description: 'A test conversation',
        category: 'task',
        status: 'in-progress',
        lastMessage: 'Last message',
        agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: false }],
        hasError: false,
        isInterrupted: false,
        hasQuestion: false,
        isRateLimited: false,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        updatedAt: new Date('2025-01-01T12:00:00Z'),
        ...overrides,
    };
}
(0, vitest_1.describe)('StateManager', () => {
    let stateManager;
    let mockStorage;
    (0, vitest_1.beforeEach)(async () => {
        vitest_1.vi.useFakeTimers();
        mockStorage = createMockStorage();
        stateManager = new StateManager_1.StateManager(mockStorage, createMockPlatform());
        // Wait for loadState to complete
        await stateManager.ready;
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.describe)('basic CRUD', () => {
        (0, vitest_1.it)('starts with empty conversations', () => {
            (0, vitest_1.expect)(stateManager.getConversations()).toEqual([]);
        });
        (0, vitest_1.it)('sets and retrieves conversations', () => {
            const conv = makeConversation();
            stateManager.setConversations([conv]);
            (0, vitest_1.expect)(stateManager.getConversations()).toHaveLength(1);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1')).toBeDefined();
        });
        (0, vitest_1.it)('updates a single conversation', () => {
            const conv = makeConversation();
            stateManager.setConversations([conv]);
            const updated = makeConversation({ title: 'Updated Title' });
            stateManager.updateConversation(updated);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').title).toBe('Updated Title');
        });
        (0, vitest_1.it)('removes a conversation', () => {
            stateManager.setConversations([makeConversation()]);
            stateManager.removeConversation('conv-1');
            (0, vitest_1.expect)(stateManager.getConversations()).toHaveLength(0);
        });
        (0, vitest_1.it)('sorts conversations by updatedAt descending', () => {
            const older = makeConversation({ id: 'old', updatedAt: new Date('2025-01-01') });
            const newer = makeConversation({ id: 'new', updatedAt: new Date('2025-01-02') });
            stateManager.setConversations([older, newer]);
            const conversations = stateManager.getConversations();
            (0, vitest_1.expect)(conversations[0].id).toBe('new');
            (0, vitest_1.expect)(conversations[1].id).toBe('old');
        });
    });
    (0, vitest_1.describe)('getConversationsByStatus', () => {
        (0, vitest_1.it)('filters conversations by status', () => {
            stateManager.setConversations([
                makeConversation({ id: 'a', status: 'in-progress' }),
                makeConversation({ id: 'b', status: 'done' }),
                makeConversation({ id: 'c', status: 'in-progress' }),
            ]);
            const inProgress = stateManager.getConversationsByStatus('in-progress');
            (0, vitest_1.expect)(inProgress).toHaveLength(2);
            (0, vitest_1.expect)(inProgress.every(c => c.status === 'in-progress')).toBe(true);
        });
        (0, vitest_1.it)('returns empty array when no conversations match', () => {
            stateManager.setConversations([makeConversation({ status: 'done' })]);
            (0, vitest_1.expect)(stateManager.getConversationsByStatus('todo')).toHaveLength(0);
        });
    });
    (0, vitest_1.describe)('moveConversation', () => {
        (0, vitest_1.it)('changes the status of a conversation', () => {
            stateManager.setConversations([makeConversation({ status: 'in-progress' })]);
            stateManager.moveConversation('conv-1', 'done');
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').status).toBe('done');
        });
        (0, vitest_1.it)('updates the updatedAt timestamp on move', () => {
            const conv = makeConversation({ updatedAt: new Date('2025-01-01') });
            stateManager.setConversations([conv]);
            const before = stateManager.getConversation('conv-1').updatedAt.getTime();
            stateManager.moveConversation('conv-1', 'done');
            const after = stateManager.getConversation('conv-1').updatedAt.getTime();
            (0, vitest_1.expect)(after).toBeGreaterThanOrEqual(before);
        });
        (0, vitest_1.it)('clears previousStatus on manual move', () => {
            const conv = makeConversation({ previousStatus: 'todo' });
            stateManager.setConversations([conv]);
            stateManager.moveConversation('conv-1', 'done');
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').previousStatus).toBeUndefined();
        });
        (0, vitest_1.it)('ignores move for non-existent conversation', () => {
            stateManager.moveConversation('non-existent', 'done');
            // Should not throw
            (0, vitest_1.expect)(stateManager.getConversations()).toHaveLength(0);
        });
    });
    (0, vitest_1.describe)('mergeWithExisting (via setConversations/updateConversation)', () => {
        (0, vitest_1.it)('preserves icon from existing conversation', () => {
            const existing = makeConversation({ icon: 'data:image/png;base64,abc' });
            stateManager.setConversations([existing]);
            const updated = makeConversation({ icon: undefined, updatedAt: new Date('2025-01-01T13:00:00Z') });
            stateManager.setConversations([updated]);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').icon).toBe('data:image/png;base64,abc');
        });
        (0, vitest_1.it)('preserves done status when no new content arrives', () => {
            stateManager.setConversations([makeConversation({ status: 'in-progress' })]);
            stateManager.moveConversation('conv-1', 'done');
            // Re-scan with same updatedAt → status should stay 'done'
            const rescanned = makeConversation({
                status: 'in-progress',
                updatedAt: stateManager.getConversation('conv-1').updatedAt,
            });
            stateManager.setConversations([rescanned]);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').status).toBe('done');
        });
        (0, vitest_1.it)('overrides done status when new content arrives', () => {
            stateManager.setConversations([makeConversation({ status: 'done', updatedAt: new Date('2025-01-01T12:00:00Z') })]);
            // New content with later timestamp
            const withNewContent = makeConversation({
                status: 'in-progress',
                updatedAt: new Date('2025-01-01T14:00:00Z'),
                agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: true }],
            });
            stateManager.setConversations([withNewContent]);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').status).toBe('in-progress');
        });
        (0, vitest_1.it)('tracks previousStatus when entering in-progress', () => {
            stateManager.setConversations([makeConversation({ status: 'todo', updatedAt: new Date('2025-01-01T10:00:00Z') })]);
            const inProgress = makeConversation({
                status: 'in-progress',
                updatedAt: new Date('2025-01-01T12:00:00Z'),
                agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: true }],
            });
            stateManager.setConversations([inProgress]);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').previousStatus).toBe('todo');
        });
        (0, vitest_1.it)('transitions to needs-input on error when agent finishes', () => {
            // Setup: agent is active
            stateManager.setConversations([makeConversation({
                    status: 'in-progress',
                    updatedAt: new Date('2025-01-01T10:00:00Z'),
                    agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: true }],
                })]);
            // Agent finishes with error (new content, not active, has error)
            const finished = makeConversation({
                status: 'in-progress',
                updatedAt: new Date('2025-01-01T12:00:00Z'),
                hasError: true,
                agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: false }],
            });
            stateManager.setConversations([finished]);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').status).toBe('needs-input');
        });
        (0, vitest_1.it)('transitions to needs-input when agent finishes with question', () => {
            stateManager.setConversations([makeConversation({
                    status: 'in-progress',
                    updatedAt: new Date('2025-01-01T10:00:00Z'),
                    agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: true }],
                })]);
            const finished = makeConversation({
                status: 'in-progress',
                updatedAt: new Date('2025-01-01T12:00:00Z'),
                hasQuestion: true,
                agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: false }],
            });
            stateManager.setConversations([finished]);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').status).toBe('needs-input');
        });
        (0, vitest_1.it)('transitions to in-review when agent finishes normally', () => {
            stateManager.setConversations([makeConversation({
                    status: 'in-progress',
                    updatedAt: new Date('2025-01-01T10:00:00Z'),
                    agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: true }],
                })]);
            const finished = makeConversation({
                status: 'in-progress',
                updatedAt: new Date('2025-01-01T12:00:00Z'),
                agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: false }],
            });
            stateManager.setConversations([finished]);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').status).toBe('in-review');
        });
        (0, vitest_1.it)('restores done status when agent re-runs and finishes', () => {
            // Use recent timestamps to avoid the 4-hour auto-archival threshold
            const now = Date.now();
            const t0 = new Date(now - 30 * 60 * 1000); // 30 min ago
            const t1 = new Date(now - 20 * 60 * 1000); // 20 min ago
            const t2 = new Date(now - 10 * 60 * 1000); // 10 min ago
            // Start as done (recent enough to not auto-archive)
            stateManager.setConversations([makeConversation({
                    status: 'done',
                    updatedAt: t0,
                })]);
            // Agent starts working (new content, is active)
            const active = makeConversation({
                status: 'in-progress',
                updatedAt: t1,
                agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: true }],
            });
            stateManager.setConversations([active]);
            // Agent finishes → should restore to 'done' (previousStatus was 'done')
            const finished = makeConversation({
                status: 'in-progress',
                updatedAt: t2,
                agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: false }],
            });
            stateManager.setConversations([finished]);
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').status).toBe('done');
        });
        (0, vitest_1.it)('removes conversations that no longer have JSONL files', () => {
            stateManager.setConversations([
                makeConversation({ id: 'a' }),
                makeConversation({ id: 'b' }),
            ]);
            // Re-scan only finds 'a'
            stateManager.setConversations([makeConversation({ id: 'a' })]);
            (0, vitest_1.expect)(stateManager.getConversation('b')).toBeUndefined();
            (0, vitest_1.expect)(stateManager.getConversations()).toHaveLength(1);
        });
    });
    (0, vitest_1.describe)('archiveAllDone', () => {
        (0, vitest_1.it)('archives done and cancelled conversations', () => {
            stateManager.setConversations([
                makeConversation({ id: 'a', status: 'done' }),
                makeConversation({ id: 'b', status: 'cancelled' }),
                makeConversation({ id: 'c', status: 'in-progress' }),
            ]);
            stateManager.archiveAllDone();
            (0, vitest_1.expect)(stateManager.getConversation('a').status).toBe('archived');
            (0, vitest_1.expect)(stateManager.getConversation('b').status).toBe('archived');
            (0, vitest_1.expect)(stateManager.getConversation('c').status).toBe('in-progress');
        });
        (0, vitest_1.it)('does nothing when no done/cancelled conversations exist', () => {
            stateManager.setConversations([
                makeConversation({ id: 'a', status: 'in-progress' }),
            ]);
            stateManager.archiveAllDone();
            (0, vitest_1.expect)(stateManager.getConversation('a').status).toBe('in-progress');
        });
    });
    (0, vitest_1.describe)('archiveStaleConversations', () => {
        (0, vitest_1.it)('archives conversations done for more than 4 hours', () => {
            const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
            stateManager.setConversations([
                makeConversation({ id: 'stale', status: 'done', updatedAt: fiveHoursAgo }),
            ]);
            stateManager.archiveStaleConversations();
            (0, vitest_1.expect)(stateManager.getConversation('stale').status).toBe('archived');
        });
        (0, vitest_1.it)('keeps recently done conversations', () => {
            const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
            stateManager.setConversations([
                makeConversation({ id: 'recent', status: 'done', updatedAt: oneHourAgo }),
            ]);
            stateManager.archiveStaleConversations();
            (0, vitest_1.expect)(stateManager.getConversation('recent').status).toBe('done');
        });
    });
    (0, vitest_1.describe)('icon management', () => {
        (0, vitest_1.it)('sets conversation icon', () => {
            stateManager.setConversations([makeConversation()]);
            stateManager.setConversationIcon('conv-1', 'data:image/png;base64,xyz');
            (0, vitest_1.expect)(stateManager.getConversation('conv-1').icon).toBe('data:image/png;base64,xyz');
        });
        (0, vitest_1.it)('clears all icons', async () => {
            stateManager.setConversations([
                makeConversation({ id: 'a', icon: 'icon-a' }),
                makeConversation({ id: 'b', icon: 'icon-b' }),
            ]);
            await stateManager.clearAllIcons();
            (0, vitest_1.expect)(stateManager.getConversation('a').icon).toBeUndefined();
            (0, vitest_1.expect)(stateManager.getConversation('b').icon).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('event emission', () => {
        (0, vitest_1.it)('fires onConversationsChanged when conversations are set', () => {
            const listener = vitest_1.vi.fn();
            stateManager.onConversationsChanged(listener);
            stateManager.setConversations([makeConversation()]);
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            (0, vitest_1.expect)(listener).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('fires onConversationsChanged when a conversation is moved', () => {
            stateManager.setConversations([makeConversation()]);
            const listener = vitest_1.vi.fn();
            stateManager.onConversationsChanged(listener);
            stateManager.moveConversation('conv-1', 'done');
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            (0, vitest_1.expect)(listener).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('fires onConversationsChanged when a conversation is removed', () => {
            stateManager.setConversations([makeConversation()]);
            const listener = vitest_1.vi.fn();
            stateManager.onConversationsChanged(listener);
            stateManager.removeConversation('conv-1');
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            (0, vitest_1.expect)(listener).toHaveBeenCalledTimes(1);
        });
    });
    (0, vitest_1.describe)('rate limit detection', () => {
        (0, vitest_1.it)('fires onRateLimitDetected when conversation becomes rate-limited', async () => {
            const handler = vitest_1.vi.fn();
            stateManager.onRateLimitDetected(handler);
            const conv = makeConversation({ isRateLimited: false });
            stateManager.setConversations([conv]);
            (0, vitest_1.expect)(handler).not.toHaveBeenCalled();
            const rateLimited = makeConversation({
                isRateLimited: true,
                rateLimitResetDisplay: '10am (Europe/Zurich)',
                updatedAt: new Date('2025-01-01T13:00:00Z'),
            });
            stateManager.updateConversation(rateLimited);
            (0, vitest_1.expect)(handler).toHaveBeenCalledOnce();
            (0, vitest_1.expect)(handler.mock.calls[0][0].isRateLimited).toBe(true);
        });
        (0, vitest_1.it)('does not fire onRateLimitDetected if already rate-limited', async () => {
            const handler = vitest_1.vi.fn();
            stateManager.onRateLimitDetected(handler);
            const conv = makeConversation({
                isRateLimited: true,
                rateLimitResetDisplay: '10am (Europe/Zurich)',
            });
            stateManager.setConversations([conv]);
            // First set fires it
            handler.mockClear();
            const updated = makeConversation({
                isRateLimited: true,
                rateLimitResetDisplay: '10am (Europe/Zurich)',
                updatedAt: new Date('2025-01-01T13:00:00Z'),
            });
            stateManager.updateConversation(updated);
            (0, vitest_1.expect)(handler).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('getRateLimitedConversations returns only rate-limited conversations', () => {
            stateManager.setConversations([
                makeConversation({ id: 'a', isRateLimited: true }),
                makeConversation({ id: 'b', isRateLimited: false }),
                makeConversation({ id: 'c', isRateLimited: true }),
            ]);
            const limited = stateManager.getRateLimitedConversations();
            (0, vitest_1.expect)(limited).toHaveLength(2);
            (0, vitest_1.expect)(limited.map(c => c.id).sort()).toEqual(['a', 'c']);
        });
    });
    (0, vitest_1.describe)('drafts', () => {
        (0, vitest_1.it)('delegates saveDrafts to storage service', async () => {
            const drafts = [{ id: 'd1', title: 'Draft 1' }];
            await stateManager.saveDrafts(drafts);
            (0, vitest_1.expect)(mockStorage.saveDrafts).toHaveBeenCalledWith(drafts);
        });
        (0, vitest_1.it)('delegates loadDrafts to storage service', async () => {
            await stateManager.loadDrafts();
            (0, vitest_1.expect)(mockStorage.loadDrafts).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=StateManager.test.js.map