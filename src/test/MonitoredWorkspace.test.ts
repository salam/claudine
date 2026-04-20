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
      if (key === 'monitorWorktrees') return overrides.monitorWorktrees ?? true;
      return defaultValue;
    }),
    setConfig: vi.fn(),
    getWorkspaceLocalConfig: vi.fn((key: string, defaultValue: unknown) => {
      if (key === 'monitoredWorkspace') return overrides.monitoredWorkspace ?? { mode: 'auto' };
      return defaultValue;
    }),
    setWorkspaceLocalConfig: vi.fn(),
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
const projectAPath = '/Users/alice/projectA';
const projectBPath = '/Users/alice/projectB';
const projectAEncoded = '-Users-alice-projectA';
const projectBEncoded = '-Users-alice-projectB';
const projectAWorktreesDir = path.join(projectAPath, '.claude', 'worktrees');
const projectAWorktreeEncoded = '-Users-alice-projectA--claude-worktrees-feature-login';
const defaultIgnoreCase = process.platform === 'win32' || process.platform === 'darwin';
const withDefaultCase = (encodedPath: string) => defaultIgnoreCase ? encodedPath.toLowerCase() : encodedPath;

describe('MonitoredWorkspace — getProjectDirsToScan', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === projectsDir) return true;
      if (s.startsWith(projectsDir)) return true;
      if (s === projectAWorktreesDir) return true;
      return false;
    });
    vi.mocked(fs.readdirSync).mockImplementation(((p: string) => {
      if (p === projectsDir) {
        return [
          { name: projectAEncoded, isDirectory: () => true, isFile: () => false },
          { name: projectBEncoded, isDirectory: () => true, isFile: () => false },
          { name: '-tmp-scratch', isDirectory: () => true, isFile: () => false },
          { name: projectAWorktreeEncoded, isDirectory: () => true, isFile: () => false },
        ];
      }
      if (p === projectAWorktreesDir) {
        return [
          { name: 'feature-login', isDirectory: () => true, isFile: () => false },
        ];
      }
      return [];
    }) as unknown as typeof fs.readdirSync);
  });

  it('applies lowercase normalization on case-insensitive platforms', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'auto' },
      monitorWorktrees: false,
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);

    let dirs = (watcher as any).getProjectDirsToScan(projectsDir, true);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain('-users-alice-projecta');

    dirs = (watcher as any).getProjectDirsToScan(projectsDir, false);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain('-Users-alice-projectA');
  });

  it('auto mode with workspace folders scans the workspace and its Claude worktrees', () => {
    const platform = createMockPlatform({
      workspaceFolders: [projectAPath],
      monitoredWorkspace: { mode: 'auto' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    expect(dirs).toHaveLength(2);
    expect(dirs).toContain(path.join(projectsDir, withDefaultCase(projectAEncoded)));
    expect(dirs).toContain(path.join(projectsDir, withDefaultCase(projectAWorktreeEncoded)));
  });

  it('auto mode without workspace folders scans all (excluding temp)', () => {
    const platform = createMockPlatform({
      workspaceFolders: null,
      monitoredWorkspace: { mode: 'auto' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    // Should include projectA, projectB, and the worktree dir, but exclude -tmp-scratch
    expect(dirs).toHaveLength(3);
  });

  it('single mode uses configured path instead of workspace folders', () => {
    const platform = createMockPlatform({
      workspaceFolders: [projectAPath],
      monitoredWorkspace: { mode: 'single', path: projectBPath },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir, false);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain(projectBEncoded);
  });

  it('multi mode uses all configured paths', () => {
    const platform = createMockPlatform({
      workspaceFolders: null,
      monitoredWorkspace: { mode: 'multi', paths: [projectAPath, projectBPath] },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    expect(dirs).toHaveLength(3);
    expect(dirs).toContain(path.join(projectsDir, withDefaultCase(projectAEncoded)));
    expect(dirs).toContain(path.join(projectsDir, withDefaultCase(projectBEncoded)));
    expect(dirs).toContain(path.join(projectsDir, withDefaultCase(projectAWorktreeEncoded)));
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

  it('includes Claude worktree directories for monitored workspaces by default', () => {
    const platform = createMockPlatform({
      workspaceFolders: [projectAPath],
      monitoredWorkspace: { mode: 'auto' },
      monitorWorktrees: true,
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    expect(dirs).toContain(path.join(projectsDir, withDefaultCase(projectAEncoded)));
    expect(dirs).toContain(path.join(projectsDir, withDefaultCase(projectAWorktreeEncoded)));
  });

  it('can disable Claude worktree discovery via monitorWorktrees', () => {
    const platform = createMockPlatform({
      workspaceFolders: [projectAPath],
      monitoredWorkspace: { mode: 'auto' },
      monitorWorktrees: false,
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    expect(dirs).toEqual([path.join(projectsDir, withDefaultCase(projectAEncoded))]);
  });
});

describe('MonitoredWorkspace — getWorkspacePaths for workspaceDetected', () => {
  it('returns workspace folders when available (workspaceDetected = true)', () => {
    const platform = createMockPlatform({
      workspaceFolders: [projectAPath],
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const paths = watcher.getWorkspacePaths();
    expect(paths.length).toBeGreaterThan(0);
  });

  it('returns empty when no workspace folders (workspaceDetected = false)', () => {
    const platform = createMockPlatform({
      workspaceFolders: null,
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const paths = watcher.getWorkspacePaths();
    expect(paths).toEqual([]);
  });

  it('returns workspace folders after simulated folder open (re-detection)', () => {
    const platform = createMockPlatform({
      workspaceFolders: null,
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    // Initially no workspace
    expect(watcher.getWorkspacePaths()).toEqual([]);

    // Simulate workspace folder being opened
    platform.getWorkspaceFolders.mockReturnValue([projectAPath]);
    expect(watcher.getWorkspacePaths().length).toBeGreaterThan(0);
  });
});

describe('MonitoredWorkspace — isFromCurrentWorkspace', () => {
  it('single mode accepts files from configured path', () => {
    const platform = createMockPlatform({
      workspaceFolders: [projectAPath],
      monitoredWorkspace: { mode: 'single', path: projectBPath },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const filePath = path.join('/tmp/test-claude/projects', projectBEncoded, 'conv123.jsonl');
    expect((watcher as any).isFromCurrentWorkspace(filePath)).toBe(true);
  });

  it('single mode rejects files from non-configured path', () => {
    const platform = createMockPlatform({
      workspaceFolders: [projectAPath],
      monitoredWorkspace: { mode: 'single', path: projectBPath },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const filePath = path.join('/tmp/test-claude/projects', projectAEncoded, 'conv123.jsonl');
    expect((watcher as any).isFromCurrentWorkspace(filePath)).toBe(false);
  });

  it('accepts files from monitored Claude worktrees when enabled', () => {
    const platform = createMockPlatform({
      workspaceFolders: [projectAPath],
      monitoredWorkspace: { mode: 'auto' },
      monitorWorktrees: true,
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const filePath = path.join('/tmp/test-claude/projects', projectAWorktreeEncoded, 'conv123.jsonl');
    expect((watcher as any).isFromCurrentWorkspace(filePath)).toBe(true);
  });

  it('rejects files from Claude worktrees when monitorWorktrees is disabled', () => {
    const platform = createMockPlatform({
      workspaceFolders: [projectAPath],
      monitoredWorkspace: { mode: 'auto' },
      monitorWorktrees: false,
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const filePath = path.join('/tmp/test-claude/projects', projectAWorktreeEncoded, 'conv123.jsonl');
    expect((watcher as any).isFromCurrentWorkspace(filePath)).toBe(false);
  });
});
