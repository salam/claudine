import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import { ClaudeCodeWatcher } from '../providers/ClaudeCodeWatcher';
import { StateManager } from '../services/StateManager';

// Mock fs at module level for ESM compatibility
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => []),
  };
});

import * as fs from 'fs';

// Minimal platform adapter mock
function createMockPlatform(overrides: Record<string, unknown> = {}) {
  return {
    getWorkspaceFolders: vi.fn(() => overrides.workspaceFolders ?? null),
    getConfig: vi.fn((key: string, defaultValue: unknown) => {
      if (key === 'claudeCodePath') return '/tmp/test-claude';
      if (key === 'monitoredWorkspace') return overrides.monitoredWorkspace ?? { mode: 'auto' };
      return defaultValue;
    }),
    setConfig: vi.fn(),
    watchFiles: vi.fn(() => ({ dispose: vi.fn() })),
    isDevelopmentMode: vi.fn(() => false),
    getExtensionPath: vi.fn(() => undefined),
    getGlobalState: vi.fn(() => ({})),
    setGlobalState: vi.fn(),
  };
}

function createMockStateManager() {
  return {
    setConversations: vi.fn(),
    updateConversation: vi.fn(),
    removeConversation: vi.fn(),
    getConversation: vi.fn(),
    loadState: vi.fn(),
    saveDrafts: vi.fn(),
    loadDrafts: vi.fn(() => []),
    clearAllIcons: vi.fn(),
    getRateLimitedConversations: vi.fn(() => []),
    on: vi.fn(),
    onConversationsChanged: vi.fn(),
  } as unknown as StateManager;
}

const claudeDir = '/tmp/test-claude';
const projectsDir = path.join(claudeDir, 'projects');

describe('MonitoredWorkspace — getProjectDirsToScan', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === projectsDir) return true;
      if (s.startsWith(projectsDir)) return true;
      return false;
    });
    vi.mocked(fs.readdirSync).mockImplementation(((p: string) => {
      if (p === projectsDir) {
        return [
          { name: '-Users-alice-projectA', isDirectory: () => true, isFile: () => false },
          { name: '-Users-alice-projectB', isDirectory: () => true, isFile: () => false },
          { name: '-tmp-scratch', isDirectory: () => true, isFile: () => false },
        ];
      }
      return [];
    }) as unknown as typeof fs.readdirSync);
  });

  it('applies lowercase normalization on case-insensitive platforms', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'auto' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);

    let dirs = (watcher as any).getProjectDirsToScan(projectsDir, true);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain('-users-alice-projecta');

    dirs = (watcher as any).getProjectDirsToScan(projectsDir, false);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain('-Users-alice-projectA');
  });

  it('auto mode with workspace folders scans only matching dirs', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'auto' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir, true);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain('-users-alice-projecta');
  });

  it('auto mode without workspace folders scans all (excluding temp)', () => {
    const platform = createMockPlatform({
      workspaceFolders: null,
      monitoredWorkspace: { mode: 'auto' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    // Should include projectA and projectB, but exclude -tmp-scratch
    expect(dirs).toHaveLength(2);
  });

  it('single mode uses configured path instead of workspace folders', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'single', path: '/Users/alice/projectB' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir, false);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain('-Users-alice-projectB');
  });

  it('multi mode uses all configured paths', () => {
    const platform = createMockPlatform({
      workspaceFolders: null,
      monitoredWorkspace: { mode: 'multi', paths: ['/Users/alice/projectA', '/Users/alice/projectB'] },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir, true);
    expect(dirs).toHaveLength(2);
    expect(dirs[0]).toContain('-users-alice-projecta');
    expect(dirs[1]).toContain('-users-alice-projectb');
  });

  it('single mode with invalid path returns empty', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === projectsDir) return true;
      return false;
    });
    const platform = createMockPlatform({
      monitoredWorkspace: { mode: 'single', path: '/Users/alice/nonexistent' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    expect(dirs).toHaveLength(0);
  });
});

describe('MonitoredWorkspace — isFromCurrentWorkspace', () => {
  it('single mode accepts files from configured path', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'single', path: '/Users/alice/projectB' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const filePath = path.join('/tmp/test-claude/projects', '-Users-alice-projectB', 'conv123.jsonl');
    expect((watcher as any).isFromCurrentWorkspace(filePath)).toBe(true);
  });

  it('single mode rejects files from non-configured path', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'single', path: '/Users/alice/projectB' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const filePath = path.join('/tmp/test-claude/projects', '-Users-alice-projectA', 'conv123.jsonl');
    expect((watcher as any).isFromCurrentWorkspace(filePath)).toBe(false);
  });
});
