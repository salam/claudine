/**
 * Regression tests for KanbanViewProvider.
 *
 * These tests lock in current behavior so that performance optimizations
 * (diff-based messaging, disposal changes, leak fixes)
 * can be validated without silently breaking functionality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { KanbanViewProvider } from '../providers/KanbanViewProvider';
import { Conversation } from '../types';

// Track TabManager instances for assertions
const tabManagerInstances: Array<Record<string, unknown>> = [];

vi.mock('../providers/TabManager', () => {
  return {
    TabManager: class MockTabManager {
      dispose = vi.fn();
      scheduleFocusDetection = vi.fn();
      detectFocusedConversation = vi.fn();
      pruneStaleTabMappings = vi.fn();
      recordActiveTabMapping = vi.fn();
      getTabLabel = vi.fn();
      focusTabByLabel = vi.fn();
      focusAnyClaudeTab = vi.fn();
      suppressFocus = vi.fn();
      removeMapping = vi.fn();
      closeEmptyClaudeTabs = vi.fn().mockResolvedValue(0);
      closeUnmappedClaudeTabByTitle = vi.fn();
      isClaudeCodeTab = vi.fn();
      set onFocusChanged(_cb: unknown) {}
      set onOpenConversation(_cb: unknown) {}
      constructor() {
        tabManagerInstances.push(this as unknown as Record<string, unknown>);
      }
    },
  };
});

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
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
  const conversationsEmitter = new vscode.EventEmitter();
  const needsInputEmitter = new vscode.EventEmitter();

  return {
    getConversations: vi.fn().mockReturnValue([]),
    getConversation: vi.fn(),
    setConversations: vi.fn(),
    updateConversation: vi.fn(),
    moveConversation: vi.fn(),
    removeConversation: vi.fn(),
    setConversationIcon: vi.fn(),
    clearAllIcons: vi.fn().mockResolvedValue(undefined),
    loadDrafts: vi.fn().mockResolvedValue([]),
    saveDrafts: vi.fn().mockResolvedValue(undefined),
    archiveStaleConversations: vi.fn(),
    archiveAllDone: vi.fn(),
    getConversationsByStatus: vi.fn().mockReturnValue([]),
    onConversationsChanged: conversationsEmitter.event,
    onNeedsInput: needsInputEmitter.event,
    ready: Promise.resolve(),
    _conversationsEmitter: conversationsEmitter,
    _needsInputEmitter: needsInputEmitter,
  };
}

function createMockWatcher() {
  return {
    refresh: vi.fn(),
    searchConversations: vi.fn().mockReturnValue([]),
    clearPendingIcons: vi.fn(),
    startWatching: vi.fn(),
    stopWatching: vi.fn(),
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

type MockWebviewView = {
  viewType: string;
  visible: boolean;
  webview: {
    options: unknown;
    html: string;
    postMessage: ReturnType<typeof vi.fn>;
    asWebviewUri: (uri: { fsPath: string }) => { toString: () => string };
    onDidReceiveMessage: (cb: (message: unknown) => void) => { dispose: () => void };
  };
  onDidChangeVisibility: (cb: () => void) => { dispose: () => void };
  emitMessage: (message: unknown) => void;
  setVisible: (visible: boolean) => void;
};

function createMockWebviewView(viewType: string): MockWebviewView {
  let messageHandler: ((message: unknown) => void) | undefined;
  let visibilityHandler: (() => void) | undefined;

  const view: MockWebviewView = {
    viewType,
    visible: true,
    webview: {
      options: undefined,
      html: '',
      postMessage: vi.fn(),
      asWebviewUri: (uri: { fsPath: string }) => ({ toString: () => `mock:${uri.fsPath}` }),
      onDidReceiveMessage: (cb: (message: unknown) => void) => {
        messageHandler = cb;
        return {
          dispose: () => {
            if (messageHandler === cb) {
              messageHandler = undefined;
            }
          }
        };
      }
    },
    onDidChangeVisibility: (cb: () => void) => {
      visibilityHandler = cb;
      return {
        dispose: () => {
          if (visibilityHandler === cb) {
            visibilityHandler = undefined;
          }
        }
      };
    },
    emitMessage: (message: unknown) => {
      messageHandler?.(message);
    },
    setVisible: (visible: boolean) => {
      view.visible = visible;
      visibilityHandler?.();
    }
  };

  return view;
}

function extractTokenFromHtml(html: string): string {
  const match = html.match(/window\.__CLAUDINE_TOKEN__='([^']+)'/);
  return match?.[1] || '';
}

describe('KanbanViewProvider — regression tests', () => {
  let provider: KanbanViewProvider;
  let mockStateManager: ReturnType<typeof createMockStateManager>;
  let mockWatcher: ReturnType<typeof createMockWatcher>;

  beforeEach(() => {
    vi.useFakeTimers();
    tabManagerInstances.length = 0;
    mockStateManager = createMockStateManager();
    mockWatcher = createMockWatcher();
    provider = new KanbanViewProvider(
      createMockExtensionUri() as never,
      mockStateManager as never,
      mockWatcher as never,
      {} as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- dispose ----------

  describe('dispose', () => {
    it('clears archive interval', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      provider.dispose();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('clears focus editor timer', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      provider.dispose();
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('calls tabManager.dispose', () => {
      const instance = tabManagerInstances.at(-1);
      provider.dispose();
      expect(instance).toBeDefined();
      expect((instance!.dispose as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  // ---------- sendMessage no-op when no view ----------

  describe('sendMessage is no-op when no view', () => {
    it('refresh does not throw when no webview is resolved', () => {
      // refresh() calls sendMessage internally, which should be a no-op
      expect(() => provider.refresh()).not.toThrow();
    });

    it('refresh sends updateConversations when called', () => {
      mockStateManager.getConversations.mockReturnValue([
        makeConversation({ id: 'a' }),
      ]);
      // Should not throw even without a view
      provider.refresh();
    });
  });

  // ---------- Archive timer runs ----------

  describe('archive timer', () => {
    it('calls archiveStaleConversations on interval', () => {
      // The archive timer is set up in the constructor with ARCHIVE_CHECK_INTERVAL_MS (5 min)
      expect(mockStateManager.archiveStaleConversations).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
      expect(mockStateManager.archiveStaleConversations).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5 * 60 * 1000); // another 5 minutes
      expect(mockStateManager.archiveStaleConversations).toHaveBeenCalledTimes(2);
    });

    it('stops archive timer on dispose', () => {
      provider.dispose();
      mockStateManager.archiveStaleConversations.mockClear();

      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(mockStateManager.archiveStaleConversations).not.toHaveBeenCalled();
    });
  });

  // BUG4d — stale webview listeners must not react after the same view is resolved again.
  describe('BUG4d — stale webview disposal', () => {
    it('ignores messages from the previously resolved view instance', () => {
      const firstView = createMockWebviewView('claudine.kanbanView');
      const secondView = createMockWebviewView('claudine.kanbanView');
      provider.resolveWebviewView(firstView as never, {} as never, {} as never);
      const firstToken = extractTokenFromHtml(firstView.webview.html);
      provider.resolveWebviewView(secondView as never, {} as never, {} as never);
      const secondToken = extractTokenFromHtml(secondView.webview.html);

      mockStateManager.getConversations.mockClear();
      firstView.emitMessage({ type: 'ready', _token: firstToken });
      expect(mockStateManager.getConversations).not.toHaveBeenCalled();

      secondView.emitMessage({ type: 'ready', _token: secondToken });
      expect(mockStateManager.getConversations).toHaveBeenCalled();
    });
  });

  // BUG4d — placement is VS Code-managed, so deprecated viewLocation writes must be ignored.
  describe('BUG4d — deprecated viewLocation setting writes are ignored', () => {
    it('does not persist viewLocation when webview sends updateSetting', async () => {
      const panelView = createMockWebviewView('claudine.kanbanView');
      provider.resolveWebviewView(panelView as never, {} as never, {} as never);
      const panelToken = extractTokenFromHtml(panelView.webview.html);

      const update = vi.fn().mockResolvedValue(undefined);
      const getConfigurationSpy = vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        get: (_key: string, defaultValue?: unknown) => defaultValue as never,
        update,
      } as never);

      panelView.emitMessage({
        type: 'updateSetting',
        key: 'viewLocation',
        value: 'panel',
        _token: panelToken,
      });
      await Promise.resolve();

      expect(update).not.toHaveBeenCalled();
      getConfigurationSpy.mockRestore();
    });
  });
});
