"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Regression tests for StateManager.
 *
 * These tests lock in current behavior so that performance optimizations
 * (debounced saves, cached sort, coalesced notifications, batched events)
 * can be validated without silently breaking functionality.
 */
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
function createMockStorage() {
    return {
        loadBoardState: vitest_1.vi.fn().mockResolvedValue(null),
        saveBoardState: vitest_1.vi.fn().mockResolvedValue(undefined),
        loadDrafts: vitest_1.vi.fn().mockResolvedValue([]),
        saveDrafts: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
}
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
(0, vitest_1.describe)('StateManager — regression tests', () => {
    let stateManager;
    let mockStorage;
    (0, vitest_1.beforeEach)(async () => {
        vitest_1.vi.useFakeTimers();
        mockStorage = createMockStorage();
        stateManager = new StateManager_1.StateManager(mockStorage, createMockPlatform());
        await stateManager.ready;
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    // ---------- Save-on-every-mutation ----------
    (0, vitest_1.describe)('saveState called after debounce on every mutation', () => {
        (0, vitest_1.it)('calls saveBoardState after debounce for updateConversation', () => {
            stateManager.setConversations([makeConversation()]);
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            mockStorage.saveBoardState.mockClear();
            stateManager.updateConversation(makeConversation({ title: 'Updated' }));
            (0, vitest_1.expect)(mockStorage.saveBoardState).not.toHaveBeenCalled();
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            (0, vitest_1.expect)(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);
            stateManager.updateConversation(makeConversation({ title: 'Again' }));
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            (0, vitest_1.expect)(mockStorage.saveBoardState).toHaveBeenCalledTimes(2);
            stateManager.updateConversation(makeConversation({ title: 'Third' }));
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            (0, vitest_1.expect)(mockStorage.saveBoardState).toHaveBeenCalledTimes(3);
        });
        (0, vitest_1.it)('calls saveBoardState after debounce for moveConversation', () => {
            stateManager.setConversations([makeConversation()]);
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            mockStorage.saveBoardState.mockClear();
            stateManager.moveConversation('conv-1', 'done');
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            (0, vitest_1.expect)(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);
            stateManager.moveConversation('conv-1', 'cancelled');
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            (0, vitest_1.expect)(mockStorage.saveBoardState).toHaveBeenCalledTimes(2);
        });
        (0, vitest_1.it)('calls saveBoardState after debounce for setConversationIcon', () => {
            stateManager.setConversations([makeConversation()]);
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            mockStorage.saveBoardState.mockClear();
            stateManager.setConversationIcon('conv-1', 'data:image/png;base64,icon1');
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            (0, vitest_1.expect)(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);
            stateManager.setConversationIcon('conv-1', 'data:image/png;base64,icon2');
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            (0, vitest_1.expect)(mockStorage.saveBoardState).toHaveBeenCalledTimes(2);
        });
        (0, vitest_1.it)('coalesces rapid mutations into a single save', () => {
            stateManager.setConversations([makeConversation()]);
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            mockStorage.saveBoardState.mockClear();
            stateManager.updateConversation(makeConversation({ title: 'A' }));
            stateManager.updateConversation(makeConversation({ title: 'B' }));
            stateManager.updateConversation(makeConversation({ title: 'C' }));
            // Not saved yet (debounce pending)
            (0, vitest_1.expect)(mockStorage.saveBoardState).not.toHaveBeenCalled();
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            // All 3 mutations coalesced into 1 save
            (0, vitest_1.expect)(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('flushSave writes immediately', () => {
            stateManager.setConversations([makeConversation()]);
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            mockStorage.saveBoardState.mockClear();
            stateManager.updateConversation(makeConversation({ title: 'Pending' }));
            (0, vitest_1.expect)(mockStorage.saveBoardState).not.toHaveBeenCalled();
            stateManager.flushSave();
            (0, vitest_1.expect)(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);
        });
    });
    // ---------- Notification on every update ----------
    (0, vitest_1.describe)('onConversationsChanged fires after coalesce window', () => {
        (0, vitest_1.it)('coalesces rapid updates into a single notification', () => {
            stateManager.setConversations([makeConversation()]);
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            const listener = vitest_1.vi.fn();
            stateManager.onConversationsChanged(listener);
            stateManager.updateConversation(makeConversation({ title: 'A' }));
            stateManager.updateConversation(makeConversation({ title: 'B' }));
            stateManager.updateConversation(makeConversation({ title: 'C' }));
            // Not fired yet — coalescing
            (0, vitest_1.expect)(listener).not.toHaveBeenCalled();
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            // All 3 coalesced into 1 notification
            (0, vitest_1.expect)(listener).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('fires for each update when separated by coalesce window', () => {
            stateManager.setConversations([makeConversation()]);
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            const listener = vitest_1.vi.fn();
            stateManager.onConversationsChanged(listener);
            stateManager.updateConversation(makeConversation({ title: 'A' }));
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            stateManager.updateConversation(makeConversation({ title: 'B' }));
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            (0, vitest_1.expect)(listener).toHaveBeenCalledTimes(2);
        });
        (0, vitest_1.it)('delivers a sorted array on each notification', () => {
            const listener = vitest_1.vi.fn();
            stateManager.onConversationsChanged(listener);
            stateManager.setConversations([
                makeConversation({ id: 'old', updatedAt: new Date('2025-01-01') }),
                makeConversation({ id: 'new', updatedAt: new Date('2025-01-02') }),
            ]);
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            const delivered = listener.mock.calls[0][0];
            (0, vitest_1.expect)(delivered[0].id).toBe('new');
            (0, vitest_1.expect)(delivered[1].id).toBe('old');
        });
    });
    // ---------- Consistent sort after rapid mutations ----------
    (0, vitest_1.describe)('sort consistency', () => {
        (0, vitest_1.it)('returns consistent sort after rapid mutations', () => {
            // Add 10 conversations with sequential timestamps
            const convs = Array.from({ length: 10 }, (_, i) => makeConversation({
                id: `conv-${i}`,
                updatedAt: new Date(`2025-01-01T${String(i).padStart(2, '0')}:00:00Z`),
            }));
            stateManager.setConversations(convs);
            // Move 5 of them (which updates their updatedAt)
            for (let i = 0; i < 5; i++) {
                stateManager.moveConversation(`conv-${i}`, 'done');
            }
            const result = stateManager.getConversations();
            // Verify sort order: each updatedAt >= next
            for (let i = 0; i < result.length - 1; i++) {
                (0, vitest_1.expect)(result[i].updatedAt.getTime()).toBeGreaterThanOrEqual(result[i + 1].updatedAt.getTime());
            }
        });
    });
    // ---------- Atomic removal of stale IDs ----------
    (0, vitest_1.describe)('setConversations removes stale IDs atomically', () => {
        (0, vitest_1.it)('removes conversations not in the new scan and fires event with correct set', () => {
            stateManager.setConversations([
                makeConversation({ id: 'a' }),
                makeConversation({ id: 'b' }),
                makeConversation({ id: 'c' }),
            ]);
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            const listener = vitest_1.vi.fn();
            stateManager.onConversationsChanged(listener);
            // Re-scan only finds a and c
            stateManager.setConversations([
                makeConversation({ id: 'a' }),
                makeConversation({ id: 'c' }),
            ]);
            vitest_1.vi.advanceTimersByTime(constants_1.NOTIFY_COALESCE_MS);
            (0, vitest_1.expect)(stateManager.getConversation('b')).toBeUndefined();
            const delivered = listener.mock.calls[0][0];
            const ids = delivered.map(c => c.id);
            (0, vitest_1.expect)(ids).toContain('a');
            (0, vitest_1.expect)(ids).toContain('c');
            (0, vitest_1.expect)(ids).not.toContain('b');
        });
    });
    // ---------- Rapid icon sets ----------
    (0, vitest_1.describe)('rapid icon sets all persist', () => {
        (0, vitest_1.it)('retains all icons after 5 rapid setConversationIcon calls', () => {
            const convs = Array.from({ length: 5 }, (_, i) => makeConversation({ id: `conv-${i}` }));
            stateManager.setConversations(convs);
            for (let i = 0; i < 5; i++) {
                stateManager.setConversationIcon(`conv-${i}`, `data:image/png;base64,icon${i}`);
            }
            for (let i = 0; i < 5; i++) {
                (0, vitest_1.expect)(stateManager.getConversation(`conv-${i}`).icon).toBe(`data:image/png;base64,icon${i}`);
            }
        });
    });
    // ---------- onNeedsInput fires exactly once per transition ----------
    (0, vitest_1.describe)('onNeedsInput fires exactly once per transition', () => {
        (0, vitest_1.it)('fires once when status transitions to needs-input via setConversations', () => {
            stateManager.setConversations([
                makeConversation({
                    id: 'conv-1',
                    status: 'in-progress',
                    updatedAt: new Date('2025-01-01T10:00:00Z'),
                }),
            ]);
            const listener = vitest_1.vi.fn();
            stateManager.onNeedsInput(listener);
            // Transition to needs-input via agent finish with error
            stateManager.setConversations([
                makeConversation({
                    id: 'conv-1',
                    status: 'needs-input',
                    updatedAt: new Date('2025-01-01T12:00:00Z'),
                }),
            ]);
            (0, vitest_1.expect)(listener).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(listener.mock.calls[0][0].id).toBe('conv-1');
        });
        (0, vitest_1.it)('does not fire when status stays at needs-input', () => {
            stateManager.setConversations([
                makeConversation({
                    id: 'conv-1',
                    status: 'needs-input',
                    updatedAt: new Date('2025-01-01T10:00:00Z'),
                }),
            ]);
            const listener = vitest_1.vi.fn();
            stateManager.onNeedsInput(listener);
            // Re-scan with same status
            stateManager.setConversations([
                makeConversation({
                    id: 'conv-1',
                    status: 'needs-input',
                    updatedAt: new Date('2025-01-01T10:00:00Z'),
                }),
            ]);
            (0, vitest_1.expect)(listener).not.toHaveBeenCalled();
        });
    });
    // ---------- State persistence includes icons ----------
    (0, vitest_1.describe)('state persistence includes icons', () => {
        (0, vitest_1.it)('persists conversations with icons via saveBoardState', () => {
            stateManager.setConversations([makeConversation({ icon: 'data:image/png;base64,abc' })]);
            stateManager.setConversationIcon('conv-1', 'data:image/png;base64,xyz');
            // Flush the debounced save
            vitest_1.vi.advanceTimersByTime(constants_1.SAVE_STATE_DEBOUNCE_MS);
            // saveBoardState should have been called with conversations that include the icon
            const lastCall = mockStorage.saveBoardState.mock.calls.at(-1);
            (0, vitest_1.expect)(lastCall).toBeDefined();
            const saved = lastCall[0];
            (0, vitest_1.expect)(saved.conversations[0].icon).toBe('data:image/png;base64,xyz');
        });
    });
});
//# sourceMappingURL=StateManager.perf.test.js.map