/**
 * Tests for CodexWatcher.
 *
 * These focus on workspace filtering and the availability check.
 * Parsing logic is covered by CodexSessionParser.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { CodexWatcher } from '../providers/CodexWatcher';
import type { IPlatformAdapter, PlatformEventEmitter, PlatformEvent, Disposable } from '../platform/IPlatformAdapter';

function createMockPlatform(overrides: Partial<IPlatformAdapter> = {}): IPlatformAdapter {
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
    ...overrides,
  };
}

// Mock fs (used by CodexWatcher for sync directory scanning + search)
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => ''),
  statSync: vi.fn(() => ({ size: 1024 })),
}));

// Mock fs/promises (used by CodexSessionParser)
vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 1024 }),
  readFile: vi.fn().mockResolvedValue(''),
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  open: vi.fn(),
  mkdtemp: vi.fn(),
  writeFile: vi.fn(),
}));

function createMockStateManager() {
  return {
    ready: Promise.resolve(),
    setConversations: vi.fn(),
    updateConversation: vi.fn(),
    removeConversation: vi.fn(),
    getConversation: vi.fn(),
    getConversations: vi.fn(() => []),
  };
}

describe('CodexWatcher', () => {

  describe('isAvailable', () => {
    it('returns true when sessions directory exists', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      const platform = createMockPlatform();
      expect(CodexWatcher.isAvailable(platform)).toBe(true);
    });

    it('returns false when sessions directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      const platform = createMockPlatform();
      expect(CodexWatcher.isAvailable(platform)).toBe(false);
    });

    it('uses custom codexPath from config', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      const platform = createMockPlatform({
        getConfig: (key: string, d: unknown) => {
          if (key === 'codexPath') return '/custom/codex' as never;
          return d as never;
        },
      });
      CodexWatcher.isAvailable(platform);
      expect(vi.mocked(fs.existsSync)).toHaveBeenCalledWith('/custom/codex/sessions');
    });
  });

  describe('lifecycle', () => {
    it('sets isWatching to true after startWatching', () => {
      const mockSM = createMockStateManager();
      const platform = createMockPlatform();
      const watcher = new CodexWatcher(mockSM as never, platform);

      // existsSync returns false for sessions dir → empty scan
      vi.mocked(fs.existsSync).mockReturnValue(false);

      watcher.startWatching();
      expect(watcher.isWatching).toBe(true);
    });

    it('sets isWatching to false after stopWatching', () => {
      const mockSM = createMockStateManager();
      const platform = createMockPlatform();
      const watcher = new CodexWatcher(mockSM as never, platform);

      vi.mocked(fs.existsSync).mockReturnValue(false);
      watcher.startWatching();
      watcher.stopWatching();
      expect(watcher.isWatching).toBe(false);
    });
  });

  describe('provider metadata', () => {
    it('has id "codex"', () => {
      const mockSM = createMockStateManager();
      const platform = createMockPlatform();
      const watcher = new CodexWatcher(mockSM as never, platform);
      expect(watcher.id).toBe('codex');
    });

    it('has displayName "Codex"', () => {
      const mockSM = createMockStateManager();
      const platform = createMockPlatform();
      const watcher = new CodexWatcher(mockSM as never, platform);
      expect(watcher.displayName).toBe('Codex');
    });
  });

  describe('search', () => {
    it('returns empty for empty query', () => {
      const mockSM = createMockStateManager();
      const platform = createMockPlatform();
      const watcher = new CodexWatcher(mockSM as never, platform);
      expect(watcher.searchConversations('')).toEqual([]);
    });

    it('returns empty when sessions dir does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const mockSM = createMockStateManager();
      const platform = createMockPlatform();
      const watcher = new CodexWatcher(mockSM as never, platform);
      expect(watcher.searchConversations('test')).toEqual([]);
    });
  });

  describe('project discovery stubs', () => {
    it('discoverProjects returns empty (date-based layout)', () => {
      const mockSM = createMockStateManager();
      const platform = createMockPlatform();
      const watcher = new CodexWatcher(mockSM as never, platform);
      expect(watcher.discoverProjects()).toEqual([]);
    });

    it('scanProjectsProgressively returns empty', async () => {
      const mockSM = createMockStateManager();
      const platform = createMockPlatform();
      const watcher = new CodexWatcher(mockSM as never, platform);
      const result = await watcher.scanProjectsProgressively([], vi.fn(), vi.fn());
      expect(result).toEqual([]);
    });
  });

  describe('refresh', () => {
    it('calls setConversations with codex provider tag', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const mockSM = createMockStateManager();
      const platform = createMockPlatform();
      const watcher = new CodexWatcher(mockSM as never, platform);

      await watcher.refresh();
      expect(mockSM.setConversations).toHaveBeenCalledWith([], 'codex');
    });
  });
});
