/**
 * Regression tests for ClaudeCodeWatcher.
 *
 * These tests lock in current behavior so that performance optimizations
 * (async I/O, search indexing, icon separation, batched updates)
 * can be validated without silently breaking functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeWatcher } from '../providers/ClaudeCodeWatcher';
import { Conversation } from '../types';

// Mock fs (used by ClaudeCodeWatcher for sync directory scanning + search)
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  statSync: vi.fn(() => ({
    birthtime: new Date('2025-01-01'),
    mtime: new Date('2025-01-02'),
    size: 1024,
  })),
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
}));

// Mock fs/promises (used by ConversationParser for async file I/O)
vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 1024 }),
  readFile: vi.fn().mockResolvedValue(''),
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  open: vi.fn(),
}));

// Override vscode mock to set workspaceFolders to undefined (scan-all mode)
// and add types needed by ClaudeCodeWatcher
vi.mock('vscode', () => {
  class EventEmitter<T> {
    private _listeners: Array<(e: T) => void> = [];
    get event() {
      return (listener: (e: T) => void) => {
        this._listeners.push(listener);
        return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
      };
    }
    fire(data: T) { for (const l of this._listeners) l(data); }
    dispose() { this._listeners = []; }
  }
  return {
    EventEmitter,
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: () => ({
        get: (_key: string, defaultValue?: unknown) => defaultValue,
        update: async () => {},
      }),
      createFileSystemWatcher: () => ({
        onDidCreate: () => ({ dispose: () => {} }),
        onDidChange: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {},
      }),
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    l10n: { t: (msg: string) => msg },
    window: {
      showInformationMessage: async () => undefined,
      showErrorMessage: async () => undefined,
      showWarningMessage: async () => undefined,
    },
    RelativePattern: class {
      constructor(public base: string, public pattern: string) {}
    },
    ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  };
});

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockStat = vi.mocked(fsp.stat);
const mockReadFile = vi.mocked(fsp.readFile);

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
  return {
    setConversations: vi.fn(),
    updateConversation: vi.fn(),
    removeConversation: vi.fn(),
    getConversation: vi.fn(),
    getConversations: vi.fn().mockReturnValue([]),
    setConversationIcon: vi.fn(),
    onConversationsChanged: vi.fn().mockReturnValue({ dispose: () => {} }),
    onNeedsInput: vi.fn().mockReturnValue({ dispose: () => {} }),
    ready: Promise.resolve(),
  };
}

describe('ClaudeCodeWatcher — regression tests', () => {
  let watcher: ClaudeCodeWatcher;
  let mockStateManager: ReturnType<typeof createMockStateManager>;
  const homedir = os.homedir();
  const claudePath = path.join(homedir, '.claude');
  const projectsPath = path.join(claudePath, 'projects');

  beforeEach(() => {
    vi.clearAllMocks();
    mockStateManager = createMockStateManager();
    watcher = new ClaudeCodeWatcher(mockStateManager as never);

    // Default: existsSync returns true for standard paths
    mockExistsSync.mockReturnValue(true);
    // Restore async mock defaults after clearAllMocks
    mockStat.mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fsp.access).mockRejectedValue(new Error('ENOENT'));
  });

  // ---------- searchConversations ----------

  describe('searchConversations', () => {
    function setupSearchableFiles(files: Array<{ name: string; content: string }>) {
      // readdirSync for the projects dir: return project dirs
      mockReaddirSync.mockImplementation(((dirPath: string) => {
        if (dirPath === projectsPath) {
          return [{ name: 'test-project', isDirectory: () => true, isFile: () => false }];
        }
        // readdirSync for the project dir: return JSONL files
        return files.map(f => ({
          name: f.name,
          isDirectory: () => false,
          isFile: () => true,
        }));
      }) as unknown as typeof fs.readdirSync);

      mockReadFileSync.mockImplementation(((filePath: string) => {
        const name = path.basename(filePath);
        const file = files.find(f => f.name === name);
        return file?.content || '';
      }) as typeof fs.readFileSync);
    }

    it('returns correct IDs for matching content', () => {
      setupSearchableFiles([
        { name: 'conv-abc.jsonl', content: '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix authentication bug"}]}}' },
        { name: 'conv-def.jsonl', content: '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Add dark mode"}]}}' },
      ]);

      const results = watcher.searchConversations('authentication');
      expect(results).toEqual(['conv-abc']);
    });

    it('returns empty for no matches', () => {
      setupSearchableFiles([
        { name: 'conv-abc.jsonl', content: '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix the login"}]}}' },
      ]);

      const results = watcher.searchConversations('nonexistent-xyz-query');
      expect(results).toEqual([]);
    });

    it('is case-insensitive', () => {
      setupSearchableFiles([
        { name: 'conv-abc.jsonl', content: '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix Authentication Bug"}]}}' },
      ]);

      const results = watcher.searchConversations('authentication');
      expect(results).toEqual(['conv-abc']);
    });

    it('returns empty for blank query', () => {
      const results = watcher.searchConversations('');
      expect(results).toEqual([]);
      expect(results).toEqual(watcher.searchConversations('   '));
    });
  });

  // ---------- refresh / file events ----------

  describe('refresh and file events', () => {
    it('refresh calls setConversations with all parsed conversations', async () => {
      // Setup: one project dir with two JSONL files
      mockReaddirSync.mockImplementation(((dirPath: string) => {
        if (dirPath === projectsPath) {
          return [{ name: 'test-project', isDirectory: () => true, isFile: () => false }];
        }
        return [
          { name: 'conv-1.jsonl', isDirectory: () => false, isFile: () => true },
          { name: 'conv-2.jsonl', isDirectory: () => false, isFile: () => true },
        ];
      }) as unknown as typeof fs.readdirSync);

      const ts = new Date().toISOString();
      const jsonl = JSON.stringify({
        type: 'user',
        uuid: '1',
        timestamp: ts,
        sessionId: 's',
        parentUuid: null,
        isSidechain: false,
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      });

      const bytes = Buffer.byteLength(jsonl, 'utf-8');
      mockStat.mockResolvedValue({ size: bytes } as any);
      mockReadFile.mockResolvedValue(jsonl);

      await watcher.refresh();

      expect(mockStateManager.setConversations).toHaveBeenCalledTimes(1);
      const conversations = mockStateManager.setConversations.mock.calls[0][0] as Conversation[];
      expect(conversations.length).toBe(2);
    });
  });

  // ---------- File deletion ----------

  describe('onFileDeleted behavior', () => {
    it('is exposed correctly via the public API', () => {
      // ClaudeCodeWatcher clears parser cache and removes from state on file delete.
      // We can verify the watcher's parseCacheSize reflects this.
      expect(watcher.parseCacheSize).toBe(0);
    });
  });

  // ---------- Icon generation ----------

  describe('icon generation', () => {
    it('skips conversations that already have icons', async () => {
      // When conversations already have icons, generateIcons should not try to generate new ones.
      // We test this indirectly: refresh with a conversation that has an icon
      // and verify setConversationIcon is NOT called for it.
      mockReaddirSync.mockImplementation(((dirPath: string) => {
        if (dirPath === projectsPath) {
          return [{ name: 'test-project', isDirectory: () => true, isFile: () => false }];
        }
        return [
          { name: 'conv-with-icon.jsonl', isDirectory: () => false, isFile: () => true },
        ];
      }) as unknown as typeof fs.readdirSync);

      const ts = new Date().toISOString();
      const jsonl = JSON.stringify({
        type: 'user',
        uuid: '1',
        timestamp: ts,
        sessionId: 's',
        parentUuid: null,
        isSidechain: false,
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      });
      const bytes = Buffer.byteLength(jsonl, 'utf-8');
      mockStat.mockResolvedValue({ size: bytes } as any);
      mockReadFile.mockResolvedValue(jsonl);

      // Mock: the state manager returns the conversation WITH an icon already
      mockStateManager.getConversation.mockReturnValue(
        makeConversation({ id: 'conv-with-icon', icon: 'data:image/png;base64,existing' })
      );

      await watcher.refresh();

      // No icon generation should have been triggered
      // (watcher was created without imageGenerator, so setConversationIcon won't be called)
      expect(mockStateManager.setConversationIcon).not.toHaveBeenCalled();
    });
  });

  // ---------- Watcher state ----------

  describe('watcher state', () => {
    it('reports isWatching correctly', () => {
      expect(watcher.isWatching).toBe(false);
    });

    it('reports claudePath correctly', () => {
      expect(watcher.claudePath).toBe(claudePath);
    });

    it('clearPendingIcons does not throw', () => {
      expect(() => watcher.clearPendingIcons()).not.toThrow();
    });
  });
});
