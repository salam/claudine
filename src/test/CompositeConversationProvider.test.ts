import { describe, it, expect, vi } from 'vitest';
import { CompositeConversationProvider } from '../providers/CompositeConversationProvider';
import { IConversationProvider } from '../providers/IConversationProvider';
import { Conversation, ProjectManifestEntry } from '../types';

function makeConversation(id: string, provider: string): Conversation {
  return {
    id,
    title: `Conv ${id}`,
    description: '',
    category: 'task',
    status: 'in-progress',
    lastMessage: '',
    agents: [],
    hasError: false,
    isInterrupted: false,
    hasQuestion: false,
    isRateLimited: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    provider,
  };
}

function mockProvider(id: string, overrides: Partial<IConversationProvider> = {}): IConversationProvider {
  return {
    id,
    displayName: id.charAt(0).toUpperCase() + id.slice(1),
    dataPath: `/mock/${id}`,
    isWatching: false,
    parseCacheSize: 0,
    startWatching: vi.fn(),
    setupFileWatcher: vi.fn(),
    stopWatching: vi.fn(),
    refresh: vi.fn().mockResolvedValue([]),
    searchConversations: vi.fn().mockReturnValue([]),
    clearPendingIcons: vi.fn(),
    discoverProjects: vi.fn().mockReturnValue([]),
    scanProjectsProgressively: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('CompositeConversationProvider', () => {

  it('throws on empty children array', () => {
    expect(() => new CompositeConversationProvider([])).toThrow();
  });

  it('combines child IDs and display names', () => {
    const c = new CompositeConversationProvider([
      mockProvider('claude-code'),
      mockProvider('codex'),
    ]);
    expect(c.id).toBe('claude-code+codex');
    expect(c.displayName).toBe('Claude-code + Codex');
  });

  it('reports combined dataPath', () => {
    const c = new CompositeConversationProvider([
      mockProvider('claude-code'),
      mockProvider('codex'),
    ]);
    expect(c.dataPath).toBe('/mock/claude-code, /mock/codex');
  });

  it('isWatching is true if any child is watching', () => {
    const c = new CompositeConversationProvider([
      mockProvider('a', { isWatching: false } as Partial<IConversationProvider>),
      mockProvider('b', { isWatching: true } as Partial<IConversationProvider>),
    ]);
    expect(c.isWatching).toBe(true);
  });

  it('sums parseCacheSize across children', () => {
    const c = new CompositeConversationProvider([
      mockProvider('a', { parseCacheSize: 10 } as Partial<IConversationProvider>),
      mockProvider('b', { parseCacheSize: 5 } as Partial<IConversationProvider>),
    ]);
    expect(c.parseCacheSize).toBe(15);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────

  it('startWatching delegates to all children', () => {
    const a = mockProvider('a');
    const b = mockProvider('b');
    const c = new CompositeConversationProvider([a, b]);
    c.startWatching();
    expect(a.startWatching).toHaveBeenCalled();
    expect(b.startWatching).toHaveBeenCalled();
  });

  it('setupFileWatcher delegates to all children', () => {
    const a = mockProvider('a');
    const b = mockProvider('b');
    const c = new CompositeConversationProvider([a, b]);
    c.setupFileWatcher();
    expect(a.setupFileWatcher).toHaveBeenCalled();
    expect(b.setupFileWatcher).toHaveBeenCalled();
  });

  it('stopWatching delegates to all children', () => {
    const a = mockProvider('a');
    const b = mockProvider('b');
    const c = new CompositeConversationProvider([a, b]);
    c.stopWatching();
    expect(a.stopWatching).toHaveBeenCalled();
    expect(b.stopWatching).toHaveBeenCalled();
  });

  // ── Refresh ────────────────────────────────────────────────────────

  it('refresh delegates to all children in parallel', async () => {
    const a = mockProvider('a');
    const b = mockProvider('b');
    const c = new CompositeConversationProvider([a, b]);
    await c.refresh();
    expect(a.refresh).toHaveBeenCalled();
    expect(b.refresh).toHaveBeenCalled();
  });

  // ── Search ─────────────────────────────────────────────────────────

  it('searchConversations merges results from all children', () => {
    const a = mockProvider('a', { searchConversations: vi.fn().mockReturnValue(['c1', 'c2']) });
    const b = mockProvider('b', { searchConversations: vi.fn().mockReturnValue(['x1']) });
    const c = new CompositeConversationProvider([a, b]);
    expect(c.searchConversations('test')).toEqual(['c1', 'c2', 'x1']);
  });

  // ── Icons ──────────────────────────────────────────────────────────

  it('clearPendingIcons delegates to all children', () => {
    const a = mockProvider('a');
    const b = mockProvider('b');
    const c = new CompositeConversationProvider([a, b]);
    c.clearPendingIcons();
    expect(a.clearPendingIcons).toHaveBeenCalled();
    expect(b.clearPendingIcons).toHaveBeenCalled();
  });

  // ── Project discovery (primary only) ───────────────────────────────

  it('discoverProjects delegates to first child only', () => {
    const a = mockProvider('a', {
      discoverProjects: vi.fn().mockReturnValue([{ encodedPath: 'p1', name: 'P1', fileCount: 3, enabled: true, autoExcluded: false }]),
    });
    const b = mockProvider('b', {
      discoverProjects: vi.fn().mockReturnValue([{ encodedPath: 'p2', name: 'P2', fileCount: 1, enabled: true, autoExcluded: false }]),
    });
    const c = new CompositeConversationProvider([a, b]);
    const result = c.discoverProjects();
    expect(result).toHaveLength(1);
    expect(a.discoverProjects).toHaveBeenCalled();
    expect(b.discoverProjects).not.toHaveBeenCalled();
  });

  it('scanProjectsProgressively uses primary child for projects and refresh() for non-primary', async () => {
    const claudeConv = makeConversation('claude-1', 'claude-code');
    const codexConv = makeConversation('codex-1', 'codex');
    const a = mockProvider('claude-code', {
      scanProjectsProgressively: vi.fn().mockResolvedValue([claudeConv]),
    });
    const b = mockProvider('codex', {
      refresh: vi.fn().mockResolvedValue([codexConv]),
    });
    const c = new CompositeConversationProvider([a, b]);
    const result = await c.scanProjectsProgressively([], vi.fn(), vi.fn());

    expect(a.scanProjectsProgressively).toHaveBeenCalled();
    expect(b.scanProjectsProgressively).not.toHaveBeenCalled();
    expect(b.refresh).toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result.find(r => r.id === 'claude-1')).toBeDefined();
    expect(result.find(r => r.id === 'codex-1')).toBeDefined();
  });

  // ── getChild ───────────────────────────────────────────────────────

  it('getChild returns the matching child', () => {
    const a = mockProvider('claude-code');
    const b = mockProvider('codex');
    const c = new CompositeConversationProvider([a, b]);
    expect(c.getChild('codex')).toBe(b);
    expect(c.getChild('claude-code')).toBe(a);
    expect(c.getChild('unknown')).toBeUndefined();
  });
});
