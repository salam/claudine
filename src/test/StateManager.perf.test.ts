/**
 * Regression tests for StateManager.
 *
 * These tests lock in current behavior so that performance optimizations
 * (debounced saves, cached sort, coalesced notifications, batched events)
 * can be validated without silently breaking functionality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { StateManager } from '../services/StateManager';
import { Conversation, ConversationStatus } from '../types';
import { SAVE_STATE_DEBOUNCE_MS, NOTIFY_COALESCE_MS } from '../constants';
import type { IPlatformAdapter, PlatformEventEmitter, PlatformEvent, Disposable } from '../platform/IPlatformAdapter';

function createMockPlatform(): IPlatformAdapter {
  return {
    createEventEmitter<T>(): PlatformEventEmitter<T> {
      const ee = new EventEmitter();
      return {
        get event(): PlatformEvent<T> {
          return (listener: (e: T) => void): Disposable => {
            ee.on('data', listener);
            return { dispose: () => { ee.removeListener('data', listener); } };
          };
        },
        fire: (data: T) => { ee.emit('data', data); },
        dispose: () => { ee.removeAllListeners(); }
      };
    },
    watchFiles: () => ({ dispose: () => {} }),
    getConfig: (_k: string, d: unknown) => d as never,
    setConfig: async () => {},
    ensureDirectory: async () => {},
    writeFile: async () => {},
    readFile: async () => new Uint8Array(),
    stat: async () => undefined,
    getGlobalState: (_k: string, d: unknown) => d as never,
    setGlobalState: async () => {},
    getSecret: async () => undefined,
    setSecret: async () => {},
    getGlobalStoragePath: () => '/tmp/claudine-test',
    getWorkspaceFolders: () => null,
    getWorkspaceLocalConfig: (_k: string, d: unknown) => d as never,
    setWorkspaceLocalConfig: async () => {},
    isDevelopmentMode: () => false,
    getExtensionPath: () => undefined,
  };
}

function createMockStorage() {
  return {
    loadBoardState: vi.fn().mockResolvedValue(null),
    saveBoardState: vi.fn().mockResolvedValue(undefined),
    loadDrafts: vi.fn().mockResolvedValue([]),
    saveDrafts: vi.fn().mockResolvedValue(undefined),
    saveGlobalSetting: vi.fn().mockResolvedValue(undefined),
    getGlobalSetting: vi.fn((_k: string, d: unknown) => d),
  };
}

vi.mock('../services/StorageService', () => {
  return {
    StorageService: class MockStorageService {
      loadBoardState = vi.fn().mockResolvedValue(null);
      saveBoardState = vi.fn().mockResolvedValue(undefined);
      loadDrafts = vi.fn().mockResolvedValue([]);
      saveDrafts = vi.fn().mockResolvedValue(undefined);
      saveGlobalSetting = vi.fn().mockResolvedValue(undefined);
      getGlobalSetting = vi.fn((_k: string, d: unknown) => d);
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

describe('StateManager — regression tests', () => {
  let stateManager: StateManager;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockStorage = createMockStorage();
    stateManager = new StateManager(mockStorage as never, createMockPlatform());
    await stateManager.ready;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- Save-on-every-mutation ----------

  describe('saveState called after debounce on every mutation', () => {
    it('calls saveBoardState after debounce for updateConversation', () => {
      stateManager.setConversations([makeConversation()]);
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      mockStorage.saveBoardState.mockClear();

      stateManager.updateConversation(makeConversation({ title: 'Updated' }));
      expect(mockStorage.saveBoardState).not.toHaveBeenCalled();
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      expect(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);

      stateManager.updateConversation(makeConversation({ title: 'Again' }));
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      expect(mockStorage.saveBoardState).toHaveBeenCalledTimes(2);

      stateManager.updateConversation(makeConversation({ title: 'Third' }));
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      expect(mockStorage.saveBoardState).toHaveBeenCalledTimes(3);
    });

    it('calls saveBoardState after debounce for moveConversation', () => {
      stateManager.setConversations([makeConversation()]);
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      mockStorage.saveBoardState.mockClear();

      stateManager.moveConversation('conv-1', 'done');
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      expect(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);

      stateManager.moveConversation('conv-1', 'cancelled');
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      expect(mockStorage.saveBoardState).toHaveBeenCalledTimes(2);
    });

    it('calls saveBoardState after debounce for setConversationIcon', () => {
      stateManager.setConversations([makeConversation()]);
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      mockStorage.saveBoardState.mockClear();

      stateManager.setConversationIcon('conv-1', 'data:image/png;base64,icon1');
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      expect(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);

      stateManager.setConversationIcon('conv-1', 'data:image/png;base64,icon2');
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      expect(mockStorage.saveBoardState).toHaveBeenCalledTimes(2);
    });

    it('coalesces rapid mutations into a single save', () => {
      stateManager.setConversations([makeConversation()]);
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      mockStorage.saveBoardState.mockClear();

      stateManager.updateConversation(makeConversation({ title: 'A' }));
      stateManager.updateConversation(makeConversation({ title: 'B' }));
      stateManager.updateConversation(makeConversation({ title: 'C' }));

      // Not saved yet (debounce pending)
      expect(mockStorage.saveBoardState).not.toHaveBeenCalled();

      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      // All 3 mutations coalesced into 1 save
      expect(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);
    });

    it('flushSave writes immediately', () => {
      stateManager.setConversations([makeConversation()]);
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);
      mockStorage.saveBoardState.mockClear();

      stateManager.updateConversation(makeConversation({ title: 'Pending' }));
      expect(mockStorage.saveBoardState).not.toHaveBeenCalled();

      stateManager.flushSave();
      expect(mockStorage.saveBoardState).toHaveBeenCalledTimes(1);
    });
  });

  // ---------- Notification on every update ----------

  describe('onConversationsChanged fires after coalesce window', () => {
    it('coalesces rapid updates into a single notification', () => {
      stateManager.setConversations([makeConversation()]);
      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);

      const listener = vi.fn();
      stateManager.onConversationsChanged(listener);

      stateManager.updateConversation(makeConversation({ title: 'A' }));
      stateManager.updateConversation(makeConversation({ title: 'B' }));
      stateManager.updateConversation(makeConversation({ title: 'C' }));

      // Not fired yet — coalescing
      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);
      // All 3 coalesced into 1 notification
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires for each update when separated by coalesce window', () => {
      stateManager.setConversations([makeConversation()]);
      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);

      const listener = vi.fn();
      stateManager.onConversationsChanged(listener);

      stateManager.updateConversation(makeConversation({ title: 'A' }));
      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);
      stateManager.updateConversation(makeConversation({ title: 'B' }));
      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('delivers a sorted array on each notification', () => {
      const listener = vi.fn();
      stateManager.onConversationsChanged(listener);

      stateManager.setConversations([
        makeConversation({ id: 'old', updatedAt: new Date('2025-01-01') }),
        makeConversation({ id: 'new', updatedAt: new Date('2025-01-02') }),
      ]);

      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);

      const delivered = listener.mock.calls[0][0] as Conversation[];
      expect(delivered[0].id).toBe('new');
      expect(delivered[1].id).toBe('old');
    });
  });

  // ---------- Consistent sort after rapid mutations ----------

  describe('sort consistency', () => {
    it('returns consistent sort after rapid mutations', () => {
      // Add 10 conversations with sequential timestamps
      const convs = Array.from({ length: 10 }, (_, i) =>
        makeConversation({
          id: `conv-${i}`,
          updatedAt: new Date(`2025-01-01T${String(i).padStart(2, '0')}:00:00Z`),
        })
      );
      stateManager.setConversations(convs);

      // Move 5 of them (which updates their updatedAt)
      for (let i = 0; i < 5; i++) {
        stateManager.moveConversation(`conv-${i}`, 'done');
      }

      const result = stateManager.getConversations();
      // Verify sort order: each updatedAt >= next
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].updatedAt.getTime()).toBeGreaterThanOrEqual(result[i + 1].updatedAt.getTime());
      }
    });
  });

  // ---------- Atomic removal of stale IDs ----------

  describe('setConversations removes stale IDs atomically', () => {
    it('removes conversations not in the new scan and fires event with correct set', () => {
      stateManager.setConversations([
        makeConversation({ id: 'a' }),
        makeConversation({ id: 'b' }),
        makeConversation({ id: 'c' }),
      ]);
      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);

      const listener = vi.fn();
      stateManager.onConversationsChanged(listener);

      // Re-scan only finds a and c
      stateManager.setConversations([
        makeConversation({ id: 'a' }),
        makeConversation({ id: 'c' }),
      ]);

      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);

      expect(stateManager.getConversation('b')).toBeUndefined();
      const delivered = listener.mock.calls[0][0] as Conversation[];
      const ids = delivered.map(c => c.id);
      expect(ids).toContain('a');
      expect(ids).toContain('c');
      expect(ids).not.toContain('b');
    });
  });

  // ---------- Rapid icon sets ----------

  describe('rapid icon sets all persist', () => {
    it('retains all icons after 5 rapid setConversationIcon calls', () => {
      const convs = Array.from({ length: 5 }, (_, i) =>
        makeConversation({ id: `conv-${i}` })
      );
      stateManager.setConversations(convs);

      for (let i = 0; i < 5; i++) {
        stateManager.setConversationIcon(`conv-${i}`, `data:image/png;base64,icon${i}`);
      }

      for (let i = 0; i < 5; i++) {
        expect(stateManager.getConversation(`conv-${i}`)!.icon).toBe(`data:image/png;base64,icon${i}`);
      }
    });
  });

  // ---------- onNeedsInput fires exactly once per transition ----------

  describe('onNeedsInput fires exactly once per transition', () => {
    it('fires once when status transitions to needs-input via setConversations', () => {
      stateManager.setConversations([
        makeConversation({
          id: 'conv-1',
          status: 'in-progress',
          updatedAt: new Date('2025-01-01T10:00:00Z'),
        }),
      ]);

      const listener = vi.fn();
      stateManager.onNeedsInput(listener);

      // Transition to needs-input via agent finish with error
      stateManager.setConversations([
        makeConversation({
          id: 'conv-1',
          status: 'needs-input',
          updatedAt: new Date('2025-01-01T12:00:00Z'),
        }),
      ]);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].id).toBe('conv-1');
    });

    it('does not fire when status stays at needs-input', () => {
      stateManager.setConversations([
        makeConversation({
          id: 'conv-1',
          status: 'needs-input',
          updatedAt: new Date('2025-01-01T10:00:00Z'),
        }),
      ]);

      const listener = vi.fn();
      stateManager.onNeedsInput(listener);

      // Re-scan with same status
      stateManager.setConversations([
        makeConversation({
          id: 'conv-1',
          status: 'needs-input',
          updatedAt: new Date('2025-01-01T10:00:00Z'),
        }),
      ]);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ---------- State persistence includes icons ----------

  describe('state persistence includes icons', () => {
    it('persists conversations with icons via saveBoardState', () => {
      stateManager.setConversations([makeConversation({ icon: 'data:image/png;base64,abc' })]);
      stateManager.setConversationIcon('conv-1', 'data:image/png;base64,xyz');

      // Flush the debounced save
      vi.advanceTimersByTime(SAVE_STATE_DEBOUNCE_MS);

      // saveBoardState should have been called with conversations that include the icon
      const lastCall = mockStorage.saveBoardState.mock.calls.at(-1);
      expect(lastCall).toBeDefined();
      const saved = lastCall![0];
      expect(saved.conversations[0].icon).toBe('data:image/png;base64,xyz');
    });
  });
});
