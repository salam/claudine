import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { StateManager } from '../services/StateManager';
import { Conversation } from '../types';
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

function createMockStorage(globalSettings: Record<string, unknown> = {}) {
  return {
    loadBoardState: vi.fn().mockResolvedValue(null),
    saveBoardState: vi.fn().mockResolvedValue(undefined),
    loadDrafts: vi.fn().mockResolvedValue([]),
    saveDrafts: vi.fn().mockResolvedValue(undefined),
    saveGlobalSetting: vi.fn().mockResolvedValue(undefined),
    getGlobalSetting: vi.fn((key: string, defaultValue: unknown) => {
      return key in globalSettings ? globalSettings[key] : defaultValue;
    }),
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

describe('Short Task IDs', () => {
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

  describe('auto-assignment', () => {
    it('assigns T-1, T-2, etc. to new conversations', () => {
      const conv1 = makeConversation({ id: 'conv-1' });
      const conv2 = makeConversation({ id: 'conv-2' });

      stateManager.setConversations([conv1, conv2]);

      const c1 = stateManager.getConversation('conv-1')!;
      const c2 = stateManager.getConversation('conv-2')!;
      expect(c1.shortId).toBe('T-1');
      expect(c2.shortId).toBe('T-2');
    });

    it('assigns a short ID via updateConversation for new conversations', () => {
      const conv = makeConversation({ id: 'conv-new' });
      stateManager.updateConversation(conv);

      const result = stateManager.getConversation('conv-new')!;
      expect(result.shortId).toBe('T-1');
    });
  });

  describe('stability', () => {
    it('preserves short IDs across repeated setConversations calls', () => {
      const conv = makeConversation({ id: 'conv-1' });
      stateManager.setConversations([conv]);

      const firstId = stateManager.getConversation('conv-1')!.shortId;
      expect(firstId).toBe('T-1');

      // Re-set with same conversation (simulating a re-scan)
      const conv2 = makeConversation({ id: 'conv-1', updatedAt: new Date('2025-01-01T13:00:00Z') });
      stateManager.setConversations([conv2]);

      expect(stateManager.getConversation('conv-1')!.shortId).toBe('T-1');
    });

    it('preserves short ID when updateConversation is called on existing', () => {
      const conv = makeConversation({ id: 'conv-1' });
      stateManager.setConversations([conv]);
      expect(stateManager.getConversation('conv-1')!.shortId).toBe('T-1');

      const updated = makeConversation({ id: 'conv-1', title: 'New Title', updatedAt: new Date('2025-01-01T13:00:00Z') });
      stateManager.updateConversation(updated);

      expect(stateManager.getConversation('conv-1')!.shortId).toBe('T-1');
    });
  });

  describe('counter persistence', () => {
    it('persists counter via saveGlobalSetting on assignment', () => {
      const conv = makeConversation({ id: 'conv-1' });
      stateManager.setConversations([conv]);

      expect(mockStorage.saveGlobalSetting).toHaveBeenCalledWith('shortIdCounter', 2);
    });

    it('resumes counter from persisted value', async () => {
      // Create a new StateManager with a pre-existing counter
      const storage = createMockStorage({ shortIdCounter: 42 });
      const sm = new StateManager(storage as never, createMockPlatform());
      await sm.ready;

      const conv = makeConversation({ id: 'conv-1' });
      sm.setConversations([conv]);

      expect(sm.getConversation('conv-1')!.shortId).toBe('T-42');
    });

    it('never goes backward even if conversations are removed', () => {
      const conv1 = makeConversation({ id: 'conv-1' });
      const conv2 = makeConversation({ id: 'conv-2' });
      stateManager.setConversations([conv1, conv2]);

      expect(stateManager.getConversation('conv-1')!.shortId).toBe('T-1');
      expect(stateManager.getConversation('conv-2')!.shortId).toBe('T-2');

      // Remove conv-1 by not including it in the next scan
      stateManager.setConversations([conv2]);

      // Add a new conversation — should get T-3, not T-1
      const conv3 = makeConversation({ id: 'conv-3' });
      stateManager.setConversations([conv2, conv3]);

      expect(conv3.shortId || stateManager.getConversation('conv-3')!.shortId).toBe('T-3');
    });
  });

  describe('lookup', () => {
    it('getConversationByShortId returns the correct conversation', () => {
      const conv1 = makeConversation({ id: 'conv-1' });
      const conv2 = makeConversation({ id: 'conv-2' });
      stateManager.setConversations([conv1, conv2]);

      expect(stateManager.getConversationByShortId('T-1')?.id).toBe('conv-1');
      expect(stateManager.getConversationByShortId('T-2')?.id).toBe('conv-2');
    });

    it('getConversationByShortId is case-insensitive', () => {
      const conv = makeConversation({ id: 'conv-1' });
      stateManager.setConversations([conv]);

      expect(stateManager.getConversationByShortId('t-1')?.id).toBe('conv-1');
      expect(stateManager.getConversationByShortId('T-1')?.id).toBe('conv-1');
    });

    it('getConversationByShortId returns undefined for unknown ID', () => {
      expect(stateManager.getConversationByShortId('T-999')).toBeUndefined();
    });
  });

  describe('board state round-trip', () => {
    it('preserves shortId from saved board state on load', async () => {
      const savedConv = makeConversation({
        id: 'conv-1',
        shortId: 'T-5',
        createdAt: new Date('2025-01-01T10:00:00Z'),
        updatedAt: new Date('2025-01-01T12:00:00Z'),
      });
      const storage = createMockStorage({ shortIdCounter: 6 });
      storage.loadBoardState.mockResolvedValue({
        conversations: [savedConv],
        lastUpdated: new Date(),
      });

      const sm = new StateManager(storage as never, createMockPlatform());
      await sm.ready;

      const loaded = sm.getConversation('conv-1')!;
      expect(loaded.shortId).toBe('T-5');

      // New conversation should get T-6
      const newConv = makeConversation({ id: 'conv-new' });
      sm.updateConversation(newConv);
      expect(sm.getConversation('conv-new')!.shortId).toBe('T-6');
    });
  });
});
