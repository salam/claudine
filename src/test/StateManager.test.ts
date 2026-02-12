import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { StateManager } from '../services/StateManager';
import { Conversation, ConversationStatus } from '../types';
import { NOTIFY_COALESCE_MS } from '../constants';
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
    isDevelopmentMode: () => false,
    getExtensionPath: () => undefined,
  };
}

// Create a mock storage instance reused across tests
function createMockStorage() {
  return {
    loadBoardState: vi.fn().mockResolvedValue(null),
    saveBoardState: vi.fn().mockResolvedValue(undefined),
    loadDrafts: vi.fn().mockResolvedValue([]),
    saveDrafts: vi.fn().mockResolvedValue(undefined),
  };
}

// Mock the StorageService module with a proper class
vi.mock('../services/StorageService', () => {
  return {
    StorageService: class MockStorageService {
      loadBoardState = vi.fn().mockResolvedValue(null);
      saveBoardState = vi.fn().mockResolvedValue(undefined);
      loadDrafts = vi.fn().mockResolvedValue([]);
      saveDrafts = vi.fn().mockResolvedValue(undefined);
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

describe('StateManager', () => {
  let stateManager: StateManager;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockStorage = createMockStorage();
    stateManager = new StateManager(mockStorage as never, createMockPlatform());
    // Wait for loadState to complete
    await stateManager.ready;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic CRUD', () => {
    it('starts with empty conversations', () => {
      expect(stateManager.getConversations()).toEqual([]);
    });

    it('sets and retrieves conversations', () => {
      const conv = makeConversation();
      stateManager.setConversations([conv]);
      expect(stateManager.getConversations()).toHaveLength(1);
      expect(stateManager.getConversation('conv-1')).toBeDefined();
    });

    it('updates a single conversation', () => {
      const conv = makeConversation();
      stateManager.setConversations([conv]);

      const updated = makeConversation({ title: 'Updated Title' });
      stateManager.updateConversation(updated);

      expect(stateManager.getConversation('conv-1')!.title).toBe('Updated Title');
    });

    it('removes a conversation', () => {
      stateManager.setConversations([makeConversation()]);
      stateManager.removeConversation('conv-1');
      expect(stateManager.getConversations()).toHaveLength(0);
    });

    it('sorts conversations by updatedAt descending', () => {
      const older = makeConversation({ id: 'old', updatedAt: new Date('2025-01-01') });
      const newer = makeConversation({ id: 'new', updatedAt: new Date('2025-01-02') });
      stateManager.setConversations([older, newer]);
      const conversations = stateManager.getConversations();
      expect(conversations[0].id).toBe('new');
      expect(conversations[1].id).toBe('old');
    });
  });

  describe('getConversationsByStatus', () => {
    it('filters conversations by status', () => {
      stateManager.setConversations([
        makeConversation({ id: 'a', status: 'in-progress' }),
        makeConversation({ id: 'b', status: 'done' }),
        makeConversation({ id: 'c', status: 'in-progress' }),
      ]);
      const inProgress = stateManager.getConversationsByStatus('in-progress');
      expect(inProgress).toHaveLength(2);
      expect(inProgress.every(c => c.status === 'in-progress')).toBe(true);
    });

    it('returns empty array when no conversations match', () => {
      stateManager.setConversations([makeConversation({ status: 'done' })]);
      expect(stateManager.getConversationsByStatus('todo')).toHaveLength(0);
    });
  });

  describe('moveConversation', () => {
    it('changes the status of a conversation', () => {
      stateManager.setConversations([makeConversation({ status: 'in-progress' })]);
      stateManager.moveConversation('conv-1', 'done');
      expect(stateManager.getConversation('conv-1')!.status).toBe('done');
    });

    it('updates the updatedAt timestamp on move', () => {
      const conv = makeConversation({ updatedAt: new Date('2025-01-01') });
      stateManager.setConversations([conv]);
      const before = stateManager.getConversation('conv-1')!.updatedAt.getTime();
      stateManager.moveConversation('conv-1', 'done');
      const after = stateManager.getConversation('conv-1')!.updatedAt.getTime();
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('clears previousStatus on manual move', () => {
      const conv = makeConversation({ previousStatus: 'todo' });
      stateManager.setConversations([conv]);
      stateManager.moveConversation('conv-1', 'done');
      expect(stateManager.getConversation('conv-1')!.previousStatus).toBeUndefined();
    });

    it('ignores move for non-existent conversation', () => {
      stateManager.moveConversation('non-existent', 'done');
      // Should not throw
      expect(stateManager.getConversations()).toHaveLength(0);
    });
  });

  describe('mergeWithExisting (via setConversations/updateConversation)', () => {
    it('preserves icon from existing conversation', () => {
      const existing = makeConversation({ icon: 'data:image/png;base64,abc' });
      stateManager.setConversations([existing]);

      const updated = makeConversation({ icon: undefined, updatedAt: new Date('2025-01-01T13:00:00Z') });
      stateManager.setConversations([updated]);

      expect(stateManager.getConversation('conv-1')!.icon).toBe('data:image/png;base64,abc');
    });

    it('preserves done status when no new content arrives', () => {
      stateManager.setConversations([makeConversation({ status: 'in-progress' })]);
      stateManager.moveConversation('conv-1', 'done');

      // Re-scan with same updatedAt → status should stay 'done'
      const rescanned = makeConversation({
        status: 'in-progress',
        updatedAt: stateManager.getConversation('conv-1')!.updatedAt,
      });
      stateManager.setConversations([rescanned]);
      expect(stateManager.getConversation('conv-1')!.status).toBe('done');
    });

    it('overrides done status when new content arrives', () => {
      stateManager.setConversations([makeConversation({ status: 'done', updatedAt: new Date('2025-01-01T12:00:00Z') })]);

      // New content with later timestamp
      const withNewContent = makeConversation({
        status: 'in-progress',
        updatedAt: new Date('2025-01-01T14:00:00Z'),
        agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: true }],
      });
      stateManager.setConversations([withNewContent]);
      expect(stateManager.getConversation('conv-1')!.status).toBe('in-progress');
    });

    it('tracks previousStatus when entering in-progress', () => {
      stateManager.setConversations([makeConversation({ status: 'todo', updatedAt: new Date('2025-01-01T10:00:00Z') })]);

      const inProgress = makeConversation({
        status: 'in-progress',
        updatedAt: new Date('2025-01-01T12:00:00Z'),
        agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: true }],
      });
      stateManager.setConversations([inProgress]);
      expect(stateManager.getConversation('conv-1')!.previousStatus).toBe('todo');
    });

    it('transitions to needs-input on error when agent finishes', () => {
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
      expect(stateManager.getConversation('conv-1')!.status).toBe('needs-input');
    });

    it('transitions to needs-input when agent finishes with question', () => {
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
      expect(stateManager.getConversation('conv-1')!.status).toBe('needs-input');
    });

    it('transitions to in-review when agent finishes normally', () => {
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
      expect(stateManager.getConversation('conv-1')!.status).toBe('in-review');
    });

    it('restores done status when agent re-runs and finishes', () => {
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
      expect(stateManager.getConversation('conv-1')!.status).toBe('done');
    });

    // BUG10: Done/Cancelled/Archived tasks must not bounce back on trailing JSONL output
    it('preserves done status when new content arrives but agent is inactive', () => {
      const now = Date.now();
      const t0 = new Date(now - 30 * 60 * 1000);
      const t1 = new Date(now - 20 * 60 * 1000);

      stateManager.setConversations([makeConversation({ status: 'in-progress', updatedAt: t0 })]);
      stateManager.moveConversation('conv-1', 'done');

      // Trailing JSONL output (later timestamp) but agent NOT active
      const trailing = makeConversation({
        status: 'in-review',
        updatedAt: t1,
        agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: false }],
      });
      stateManager.setConversations([trailing]);
      expect(stateManager.getConversation('conv-1')!.status).toBe('done');
    });

    // BUG10
    it('preserves cancelled status when new content arrives but agent is inactive', () => {
      const now = Date.now();
      const t0 = new Date(now - 30 * 60 * 1000);
      const t1 = new Date(now - 20 * 60 * 1000);

      stateManager.setConversations([makeConversation({ status: 'in-progress', updatedAt: t0 })]);
      stateManager.moveConversation('conv-1', 'cancelled');

      const trailing = makeConversation({
        status: 'in-progress',
        updatedAt: t1,
        agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: false }],
      });
      stateManager.setConversations([trailing]);
      expect(stateManager.getConversation('conv-1')!.status).toBe('cancelled');
    });

    // BUG10
    it('preserves archived status when new content arrives but agent is inactive', () => {
      stateManager.setConversations([makeConversation({
        status: 'archived',
        updatedAt: new Date('2025-01-01T10:00:00Z'),
      })]);

      const trailing = makeConversation({
        status: 'needs-input',
        updatedAt: new Date('2025-01-01T11:00:00Z'),
        agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: false }],
      });
      stateManager.setConversations([trailing]);
      expect(stateManager.getConversation('conv-1')!.status).toBe('archived');
    });

    // BUG10: Verify that genuinely resumed conversations DO move back
    it('moves done task back to in-progress when conversation is genuinely resumed', () => {
      const t0 = new Date(Date.now() - 30 * 60 * 1000);

      stateManager.setConversations([makeConversation({ status: 'in-progress', updatedAt: t0 })]);
      stateManager.moveConversation('conv-1', 'done');

      // Advance time so the resumed conversation's timestamp is genuinely newer
      vi.advanceTimersByTime(5 * 60 * 1000);

      // User resumes conversation: agent is actively running
      const resumed = makeConversation({
        status: 'in-progress',
        updatedAt: new Date(),
        agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: true }],
      });
      stateManager.setConversations([resumed]);
      expect(stateManager.getConversation('conv-1')!.status).toBe('in-progress');
    });

    it('removes conversations that no longer have JSONL files', () => {
      stateManager.setConversations([
        makeConversation({ id: 'a' }),
        makeConversation({ id: 'b' }),
      ]);

      // Re-scan only finds 'a'
      stateManager.setConversations([makeConversation({ id: 'a' })]);
      expect(stateManager.getConversation('b')).toBeUndefined();
      expect(stateManager.getConversations()).toHaveLength(1);
    });
  });

  describe('archiveAllDone', () => {
    it('archives done and cancelled conversations', () => {
      stateManager.setConversations([
        makeConversation({ id: 'a', status: 'done' }),
        makeConversation({ id: 'b', status: 'cancelled' }),
        makeConversation({ id: 'c', status: 'in-progress' }),
      ]);
      stateManager.archiveAllDone();
      expect(stateManager.getConversation('a')!.status).toBe('archived');
      expect(stateManager.getConversation('b')!.status).toBe('archived');
      expect(stateManager.getConversation('c')!.status).toBe('in-progress');
    });

    it('does nothing when no done/cancelled conversations exist', () => {
      stateManager.setConversations([
        makeConversation({ id: 'a', status: 'in-progress' }),
      ]);
      stateManager.archiveAllDone();
      expect(stateManager.getConversation('a')!.status).toBe('in-progress');
    });
  });

  describe('archiveStaleConversations', () => {
    it('archives conversations done for more than 4 hours', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      stateManager.setConversations([
        makeConversation({ id: 'stale', status: 'done', updatedAt: fiveHoursAgo }),
      ]);
      stateManager.archiveStaleConversations();
      expect(stateManager.getConversation('stale')!.status).toBe('archived');
    });

    it('keeps recently done conversations', () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
      stateManager.setConversations([
        makeConversation({ id: 'recent', status: 'done', updatedAt: oneHourAgo }),
      ]);
      stateManager.archiveStaleConversations();
      expect(stateManager.getConversation('recent')!.status).toBe('done');
    });
  });

  describe('icon management', () => {
    it('sets conversation icon', () => {
      stateManager.setConversations([makeConversation()]);
      stateManager.setConversationIcon('conv-1', 'data:image/png;base64,xyz');
      expect(stateManager.getConversation('conv-1')!.icon).toBe('data:image/png;base64,xyz');
    });

    it('clears all icons', async () => {
      stateManager.setConversations([
        makeConversation({ id: 'a', icon: 'icon-a' }),
        makeConversation({ id: 'b', icon: 'icon-b' }),
      ]);
      await stateManager.clearAllIcons();
      expect(stateManager.getConversation('a')!.icon).toBeUndefined();
      expect(stateManager.getConversation('b')!.icon).toBeUndefined();
    });
  });

  describe('event emission', () => {
    it('fires onConversationsChanged when conversations are set', () => {
      const listener = vi.fn();
      stateManager.onConversationsChanged(listener);
      stateManager.setConversations([makeConversation()]);
      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires onConversationsChanged when a conversation is moved', () => {
      stateManager.setConversations([makeConversation()]);
      const listener = vi.fn();
      stateManager.onConversationsChanged(listener);
      stateManager.moveConversation('conv-1', 'done');
      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires onConversationsChanged when a conversation is removed', () => {
      stateManager.setConversations([makeConversation()]);
      const listener = vi.fn();
      stateManager.onConversationsChanged(listener);
      stateManager.removeConversation('conv-1');
      vi.advanceTimersByTime(NOTIFY_COALESCE_MS);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limit detection', () => {
    it('fires onRateLimitDetected when conversation becomes rate-limited', async () => {
      const handler = vi.fn();
      stateManager.onRateLimitDetected(handler);

      const conv = makeConversation({ isRateLimited: false });
      stateManager.setConversations([conv]);
      expect(handler).not.toHaveBeenCalled();

      const rateLimited = makeConversation({
        isRateLimited: true,
        rateLimitResetDisplay: '10am (Europe/Zurich)',
        updatedAt: new Date('2025-01-01T13:00:00Z'),
      });
      stateManager.updateConversation(rateLimited);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].isRateLimited).toBe(true);
    });

    it('does not fire onRateLimitDetected if already rate-limited', async () => {
      const handler = vi.fn();
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
      expect(handler).not.toHaveBeenCalled();
    });

    it('getRateLimitedConversations returns only rate-limited conversations', () => {
      stateManager.setConversations([
        makeConversation({ id: 'a', isRateLimited: true }),
        makeConversation({ id: 'b', isRateLimited: false }),
        makeConversation({ id: 'c', isRateLimited: true }),
      ]);
      const limited = stateManager.getRateLimitedConversations();
      expect(limited).toHaveLength(2);
      expect(limited.map(c => c.id).sort()).toEqual(['a', 'c']);
    });
  });

  describe('drafts', () => {
    it('delegates saveDrafts to storage service', async () => {
      const drafts = [{ id: 'd1', title: 'Draft 1' }];
      await stateManager.saveDrafts(drafts);
      expect(mockStorage.saveDrafts).toHaveBeenCalledWith(drafts);
    });

    it('delegates loadDrafts to storage service', async () => {
      await stateManager.loadDrafts();
      expect(mockStorage.loadDrafts).toHaveBeenCalled();
    });
  });
});
