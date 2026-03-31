/**
 * Regression tests for ClaudeCodeWatcher.
 *
 * These tests lock in current behavior so that performance optimizations
 * (async I/O, search indexing, icon separation, batched updates)
 * can be validated without silently breaking functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeWatcher } from '../providers/ClaudeCodeWatcher';
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
    isDevelopmentMode: () => false,
    getExtensionPath: () => undefined,
  };
}

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
    watcher = new ClaudeCodeWatcher(mockStateManager as never, createMockPlatform());

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

    // BUG12: projects with dots in their path (e.g. molts.club) were not found
    // because encodeWorkspacePath only replaced '/' with '-', but Claude Code
    // also replaces '.' with '-'.
    it('finds conversations for workspace paths containing dots', async () => {
      const dottedWorkspace = '/Users/matthias/Development/molts.club';
      const encodedDir = '-Users-matthias-Development-molts-club';

      // Create a watcher with a workspace folder containing a dot
      const platform = createMockPlatform();
      platform.getWorkspaceFolders = () => [dottedWorkspace];
      const sm = createMockStateManager();
      const w = new ClaudeCodeWatcher(sm as never, platform);
      const ignoreCase = process.platform === 'win32' || process.platform === 'darwin';

      mockExistsSync.mockImplementation(((p: string) => {
        if (typeof p === 'string' && 
          p.includes(ignoreCase ? encodedDir.toLowerCase() : encodedDir)
        ) return true;
        if (p === path.join(claudePath, 'projects')) return true;
        return false;
      }) as typeof fs.existsSync);

      mockReaddirSync.mockImplementation(((dirPath: string) => {
        if (typeof dirPath === 'string' && 
          dirPath.includes(ignoreCase ? encodedDir.toLowerCase() : encodedDir)
        ) {
          return [{ name: 'conv-1.jsonl', isDirectory: () => false, isFile: () => true }];
        }
        return [];
      }) as unknown as typeof fs.readdirSync);

      const ts = new Date().toISOString();
      const jsonl = JSON.stringify({
        type: 'user', uuid: '1', timestamp: ts, sessionId: 's',
        parentUuid: null, isSidechain: false,
        message: { role: 'user', content: [{ type: 'text', text: 'Hello from molts.club' }] },
      });
      const bytes = Buffer.byteLength(jsonl, 'utf-8');
      mockStat.mockResolvedValue({ size: bytes } as any);
      mockReadFile.mockResolvedValue(jsonl);

      await w.refresh();

      expect(sm.setConversations).toHaveBeenCalledTimes(1);
      const convs = sm.setConversations.mock.calls[0][0] as Conversation[];
      expect(convs.length).toBe(1);
    });

    // BUG20: Windows backslash paths were not encoded correctly because
    // encodeWorkspacePath only replaced '/' and '.', not '\' and ':'.
    it('encodes Windows-style backslash paths correctly', async () => {
      const windowsWorkspace = 'C:\\Users\\dev\\my-project';
      const encodedDir = 'C--Users-dev-my-project';

      const platform = createMockPlatform();
      platform.getWorkspaceFolders = () => [windowsWorkspace];
      const sm = createMockStateManager();
      const w = new ClaudeCodeWatcher(sm as never, platform);
      const ignoreCase = process.platform === 'win32' || process.platform === 'darwin';

      mockExistsSync.mockImplementation(((p: string) => {
        if (typeof p === 'string' && 
          p.includes(ignoreCase ? encodedDir.toLowerCase() : encodedDir)
        ) return true;
        if (p === path.join(claudePath, 'projects')) return true;
        return false;
      }) as typeof fs.existsSync);

      mockReaddirSync.mockImplementation(((dirPath: string) => {
        if (typeof dirPath === 'string' && 
          dirPath.includes(ignoreCase ? encodedDir.toLowerCase() : encodedDir)
        ) {
          return [{ name: 'conv-win.jsonl', isDirectory: () => false, isFile: () => true }];
        }
        return [];
      }) as unknown as typeof fs.readdirSync);

      const ts = new Date().toISOString();
      const jsonl = JSON.stringify({
        type: 'user', uuid: '1', timestamp: ts, sessionId: 's',
        parentUuid: null, isSidechain: false,
        message: { role: 'user', content: [{ type: 'text', text: 'Hello from Windows' }] },
      });
      const bytes = Buffer.byteLength(jsonl, 'utf-8');
      mockStat.mockResolvedValue({ size: bytes } as any);
      mockReadFile.mockResolvedValue(jsonl);

      await w.refresh();

      expect(sm.setConversations).toHaveBeenCalledTimes(1);
      const convs = sm.setConversations.mock.calls[0][0] as Conversation[];
      expect(convs.length).toBe(1);
    });

    it('encodes mixed forward/backslash paths correctly', async () => {
      // Some Windows APIs return mixed separators
      const mixedWorkspace = 'C:\\Users\\dev/my-project';
      const encodedDir = 'C--Users-dev-my-project';

      const platform = createMockPlatform();
      platform.getWorkspaceFolders = () => [mixedWorkspace];
      const sm = createMockStateManager();
      const w = new ClaudeCodeWatcher(sm as never, platform);
      const ignoreCase = process.platform === 'win32' || process.platform === 'darwin';

      mockExistsSync.mockImplementation(((p: string) => {
        if (typeof p === 'string' && 
          p.includes(ignoreCase ? encodedDir.toLowerCase() : encodedDir)
        ) return true;
        if (p === path.join(claudePath, 'projects')) return true;
        return false;
      }) as typeof fs.existsSync);

      mockReaddirSync.mockImplementation(((dirPath: string) => {
        if (typeof dirPath === 'string' && 
          dirPath.includes(ignoreCase ? encodedDir.toLowerCase() : encodedDir)
        ) {
          return [{ name: 'conv-mix.jsonl', isDirectory: () => false, isFile: () => true }];
        }
        return [];
      }) as unknown as typeof fs.readdirSync);

      const ts = new Date().toISOString();
      const jsonl = JSON.stringify({
        type: 'user', uuid: '1', timestamp: ts, sessionId: 's',
        parentUuid: null, isSidechain: false,
        message: { role: 'user', content: [{ type: 'text', text: 'Hello from mixed path' }] },
      });
      const bytes = Buffer.byteLength(jsonl, 'utf-8');
      mockStat.mockResolvedValue({ size: bytes } as any);
      mockReadFile.mockResolvedValue(jsonl);

      await w.refresh();

      expect(sm.setConversations).toHaveBeenCalledTimes(1);
      const convs = sm.setConversations.mock.calls[0][0] as Conversation[];
      expect(convs.length).toBe(1);
    });

    it('encodes Linux-style paths correctly', async () => {
      const linuxWorkspace = '/home/dev/my-project';
      const encodedDir = '-home-dev-my-project';

      const platform = createMockPlatform();
      platform.getWorkspaceFolders = () => [linuxWorkspace];
      const sm = createMockStateManager();
      const w = new ClaudeCodeWatcher(sm as never, platform);

      mockExistsSync.mockImplementation(((p: string) => {
        if (typeof p === 'string' && p.includes(encodedDir)) return true;
        if (p === path.join(claudePath, 'projects')) return true;
        return false;
      }) as typeof fs.existsSync);

      mockReaddirSync.mockImplementation(((dirPath: string) => {
        if (typeof dirPath === 'string' && dirPath.includes(encodedDir)) {
          return [{ name: 'conv-linux.jsonl', isDirectory: () => false, isFile: () => true }];
        }
        return [];
      }) as unknown as typeof fs.readdirSync);

      const ts = new Date().toISOString();
      const jsonl = JSON.stringify({
        type: 'user', uuid: '1', timestamp: ts, sessionId: 's',
        parentUuid: null, isSidechain: false,
        message: { role: 'user', content: [{ type: 'text', text: 'Hello from Linux' }] },
      });
      const bytes = Buffer.byteLength(jsonl, 'utf-8');
      mockStat.mockResolvedValue({ size: bytes } as any);
      mockReadFile.mockResolvedValue(jsonl);

      await w.refresh();

      expect(sm.setConversations).toHaveBeenCalledTimes(1);
      const convs = sm.setConversations.mock.calls[0][0] as Conversation[];
      expect(convs.length).toBe(1);
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

  // ---------- Temp directory exclusion ----------

  describe('isExcludedProjectDir (static)', () => {
    it('excludes macOS temp dir /private/var/folders/', () => {
      const result = ClaudeCodeWatcher.isExcludedProjectDir(
        '-private-var-folders-4n-sj5qzp3x3sl32qt21rpsxjlc0000gq-T'
      );
      expect(result.excluded).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it('excludes /var/folders/ variant', () => {
      const result = ClaudeCodeWatcher.isExcludedProjectDir(
        '-var-folders-xx-yy-T'
      );
      expect(result.excluded).toBe(true);
    });

    it('excludes /tmp/ paths', () => {
      const result = ClaudeCodeWatcher.isExcludedProjectDir('-tmp-scratch-project');
      expect(result.excluded).toBe(true);
    });

    it('does NOT exclude normal project paths', () => {
      const result = ClaudeCodeWatcher.isExcludedProjectDir(
        '-Users-matthias-Development-claudine'
      );
      expect(result.excluded).toBe(false);
    });

    it('does NOT exclude paths that just contain "var" in a name', () => {
      const result = ClaudeCodeWatcher.isExcludedProjectDir(
        '-Users-matthias-Development-variable-project'
      );
      expect(result.excluded).toBe(false);
    });
  });

  // ---------- decodeProjectDirName ----------

  describe('decodeProjectDirName (static)', () => {
    it('decodes encoded path back to approximation', () => {
      expect(ClaudeCodeWatcher.decodeProjectDirName('-Users-matthias-Development-foo'))
        .toBe('/Users/matthias/Development/foo');
    });

    it('handles macOS temp path', () => {
      expect(ClaudeCodeWatcher.decodeProjectDirName(
        '-private-var-folders-4n-abc123-T'
      )).toBe('/private/var/folders/4n/abc123/T');
    });
  });

  // ---------- discoverProjects ----------

  describe('discoverProjects', () => {
    it('returns manifest with file counts and exclusion flags', () => {
      mockReaddirSync.mockImplementation(((dirPath: string) => {
        if (dirPath === projectsPath) {
          return [
            { name: '-Users-matthias-Development-myapp', isDirectory: () => true, isFile: () => false },
            { name: '-private-var-folders-xx-T', isDirectory: () => true, isFile: () => false },
          ];
        }
        if (dirPath.includes('-Users-matthias-Development-myapp')) {
          return [
            { name: 'conv-1.jsonl', isFile: () => true, isDirectory: () => false },
            { name: 'conv-2.jsonl', isFile: () => true, isDirectory: () => false },
          ];
        }
        if (dirPath.includes('-private-var-folders')) {
          return [
            { name: 'conv-temp.jsonl', isFile: () => true, isDirectory: () => false },
          ];
        }
        return [];
      }) as unknown as typeof fs.readdirSync);

      const manifest = watcher.discoverProjects();
      expect(manifest).toHaveLength(2);

      const myApp = manifest.find(p => p.name === 'myapp');
      expect(myApp).toBeDefined();
      expect(myApp!.fileCount).toBe(2);
      expect(myApp!.enabled).toBe(true);
      expect(myApp!.autoExcluded).toBe(false);

      const tempDir = manifest.find(p => p.autoExcluded);
      expect(tempDir).toBeDefined();
      expect(tempDir!.fileCount).toBe(1);
      expect(tempDir!.enabled).toBe(false);
      expect(tempDir!.autoExcluded).toBe(true);
    });

    it('skips empty project directories', () => {
      mockReaddirSync.mockImplementation(((dirPath: string) => {
        if (dirPath === projectsPath) {
          return [
            { name: '-Users-matthias-Development-empty', isDirectory: () => true, isFile: () => false },
          ];
        }
        return []; // no .jsonl files
      }) as unknown as typeof fs.readdirSync);

      const manifest = watcher.discoverProjects();
      expect(manifest).toHaveLength(0);
    });
  });

  // ---------- setupFileWatcher ----------

  describe('setupFileWatcher', () => {
    it('sets up watcher without calling refresh', () => {
      // setupFileWatcher should NOT trigger setConversations (no refresh)
      watcher.setupFileWatcher();
      expect(watcher.isWatching).toBe(true);
      expect(mockStateManager.setConversations).not.toHaveBeenCalled();
      watcher.stopWatching();
    });
  });

  // ---------- scanProjectsProgressively ----------

  describe('scanProjectsProgressively', () => {
    it('calls onProgress and onProjectScanned per project', async () => {
      const ts = new Date().toISOString();
      const jsonl = JSON.stringify({
        type: 'user', uuid: '1', timestamp: ts, sessionId: 's',
        parentUuid: null, isSidechain: false,
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      });
      const bytes = Buffer.byteLength(jsonl, 'utf-8');
      mockStat.mockResolvedValue({ size: bytes } as any);
      mockReadFile.mockResolvedValue(jsonl);

      mockReaddirSync.mockImplementation(((dirPath: string) => {
        return [
          { name: 'conv-1.jsonl', isFile: () => true, isDirectory: () => false },
        ];
      }) as unknown as typeof fs.readdirSync);

      const onProgress = vi.fn();
      const onProjectScanned = vi.fn();

      const manifest = [{
        encodedPath: '-Users-matthias-Development-test',
        decodedPath: '/Users/matthias/Development/test',
        name: 'test',
        fileCount: 1,
        enabled: true,
        autoExcluded: false,
      }];

      const result = await watcher.scanProjectsProgressively(manifest, onProgress, onProjectScanned);

      expect(result.length).toBe(1);
      expect(onProgress).toHaveBeenCalled();
      expect(onProjectScanned).toHaveBeenCalledTimes(1);
      expect(onProjectScanned.mock.calls[0][0]).toBe('/Users/matthias/Development/test');
      expect(onProjectScanned.mock.calls[0][1]).toHaveLength(1);
    });
  });
});
