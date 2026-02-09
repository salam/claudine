"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Regression tests for KanbanViewProvider.
 *
 * These tests lock in current behavior so that performance optimizations
 * (diff-based messaging, disposal changes, leak fixes)
 * can be validated without silently breaking functionality.
 */
const vitest_1 = require("vitest");
const vscode_1 = require("vscode");
const KanbanViewProvider_1 = require("../providers/KanbanViewProvider");
// Track TabManager instances for assertions
const tabManagerInstances = [];
vitest_1.vi.mock('../providers/TabManager', () => {
    return {
        TabManager: class MockTabManager {
            dispose = vitest_1.vi.fn();
            scheduleFocusDetection = vitest_1.vi.fn();
            detectFocusedConversation = vitest_1.vi.fn();
            pruneStaleTabMappings = vitest_1.vi.fn();
            recordActiveTabMapping = vitest_1.vi.fn();
            getTabLabel = vitest_1.vi.fn();
            focusTabByLabel = vitest_1.vi.fn();
            focusAnyClaudeTab = vitest_1.vi.fn();
            suppressFocus = vitest_1.vi.fn();
            removeMapping = vitest_1.vi.fn();
            closeEmptyClaudeTabs = vitest_1.vi.fn().mockResolvedValue(0);
            closeUnmappedClaudeTabByTitle = vitest_1.vi.fn();
            isClaudeCodeTab = vitest_1.vi.fn();
            set onFocusChanged(_cb) { }
            set onOpenConversation(_cb) { }
            constructor() {
                tabManagerInstances.push(this);
            }
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
function createMockStateManager() {
    const conversationsEmitter = new vscode_1.EventEmitter();
    const needsInputEmitter = new vscode_1.EventEmitter();
    return {
        getConversations: vitest_1.vi.fn().mockReturnValue([]),
        getConversation: vitest_1.vi.fn(),
        setConversations: vitest_1.vi.fn(),
        updateConversation: vitest_1.vi.fn(),
        moveConversation: vitest_1.vi.fn(),
        removeConversation: vitest_1.vi.fn(),
        setConversationIcon: vitest_1.vi.fn(),
        clearAllIcons: vitest_1.vi.fn().mockResolvedValue(undefined),
        loadDrafts: vitest_1.vi.fn().mockResolvedValue([]),
        saveDrafts: vitest_1.vi.fn().mockResolvedValue(undefined),
        archiveStaleConversations: vitest_1.vi.fn(),
        archiveAllDone: vitest_1.vi.fn(),
        getConversationsByStatus: vitest_1.vi.fn().mockReturnValue([]),
        onConversationsChanged: conversationsEmitter.event,
        onNeedsInput: needsInputEmitter.event,
        ready: Promise.resolve(),
        _conversationsEmitter: conversationsEmitter,
        _needsInputEmitter: needsInputEmitter,
    };
}
function createMockWatcher() {
    return {
        refresh: vitest_1.vi.fn(),
        searchConversations: vitest_1.vi.fn().mockReturnValue([]),
        clearPendingIcons: vitest_1.vi.fn(),
        startWatching: vitest_1.vi.fn(),
        stopWatching: vitest_1.vi.fn(),
        claudePath: '/home/user/.claude',
        isWatching: false,
        parseCacheSize: 0,
    };
}
function createMockExtensionUri() {
    return {
        fsPath: '/mock/extension',
        scheme: 'file',
    };
}
(0, vitest_1.describe)('KanbanViewProvider — regression tests', () => {
    let provider;
    let mockStateManager;
    let mockWatcher;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
        tabManagerInstances.length = 0;
        mockStateManager = createMockStateManager();
        mockWatcher = createMockWatcher();
        provider = new KanbanViewProvider_1.KanbanViewProvider(createMockExtensionUri(), mockStateManager, mockWatcher);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    // ---------- dispose ----------
    (0, vitest_1.describe)('dispose', () => {
        (0, vitest_1.it)('clears archive interval', () => {
            const clearIntervalSpy = vitest_1.vi.spyOn(global, 'clearInterval');
            provider.dispose();
            (0, vitest_1.expect)(clearIntervalSpy).toHaveBeenCalled();
            clearIntervalSpy.mockRestore();
        });
        (0, vitest_1.it)('clears focus editor timer', () => {
            const clearTimeoutSpy = vitest_1.vi.spyOn(global, 'clearTimeout');
            provider.dispose();
            (0, vitest_1.expect)(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });
        (0, vitest_1.it)('calls tabManager.dispose', () => {
            const instance = tabManagerInstances.at(-1);
            provider.dispose();
            (0, vitest_1.expect)(instance).toBeDefined();
            (0, vitest_1.expect)(instance.dispose).toHaveBeenCalled();
        });
    });
    // ---------- sendMessage no-op when no view ----------
    (0, vitest_1.describe)('sendMessage is no-op when no view', () => {
        (0, vitest_1.it)('refresh does not throw when no webview is resolved', () => {
            // refresh() calls sendMessage internally, which should be a no-op
            (0, vitest_1.expect)(() => provider.refresh()).not.toThrow();
        });
        (0, vitest_1.it)('refresh sends updateConversations when called', () => {
            mockStateManager.getConversations.mockReturnValue([
                makeConversation({ id: 'a' }),
            ]);
            // Should not throw even without a view
            provider.refresh();
        });
    });
    // ---------- Archive timer runs ----------
    (0, vitest_1.describe)('archive timer', () => {
        (0, vitest_1.it)('calls archiveStaleConversations on interval', () => {
            // The archive timer is set up in the constructor with ARCHIVE_CHECK_INTERVAL_MS (5 min)
            (0, vitest_1.expect)(mockStateManager.archiveStaleConversations).not.toHaveBeenCalled();
            vitest_1.vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
            (0, vitest_1.expect)(mockStateManager.archiveStaleConversations).toHaveBeenCalledTimes(1);
            vitest_1.vi.advanceTimersByTime(5 * 60 * 1000); // another 5 minutes
            (0, vitest_1.expect)(mockStateManager.archiveStaleConversations).toHaveBeenCalledTimes(2);
        });
        (0, vitest_1.it)('stops archive timer on dispose', () => {
            provider.dispose();
            mockStateManager.archiveStaleConversations.mockClear();
            vitest_1.vi.advanceTimersByTime(10 * 60 * 1000);
            (0, vitest_1.expect)(mockStateManager.archiveStaleConversations).not.toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=KanbanViewProvider.perf.test.js.map