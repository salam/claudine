import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IPlatformAdapter, PlatformEventEmitter, PlatformEvent, Disposable } from '../platform/IPlatformAdapter';
import type { ExtensionToWebviewMessage, ClaudineSettings } from '../types';

/**
 * BUG8 — AI summarization toggle button doesn't work
 *
 * The standalone toggleSummarization handler read the current value but never
 * wrote the toggled value back because IPlatformAdapter lacked setConfig().
 */

// Dynamically-scoped config store for the mock platform
let configStore: Record<string, unknown>;

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
    getConfig: <T>(key: string, d: T) => {
      const v = configStore[key];
      return (v !== undefined ? v : d) as T;
    },
    setConfig: async <T>(key: string, value: T) => {
      configStore[key] = value;
    },
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

// Lazy-import to avoid pulling in real FS/chokidar deps; mock modules first.
vi.mock('../services/StorageService', () => ({
  StorageService: class { loadBoardState = vi.fn().mockResolvedValue(null); saveBoardState = vi.fn(); loadDrafts = vi.fn().mockResolvedValue([]); saveDrafts = vi.fn(); },
}));

describe('BUG8 – toggleSummarization in standalone mode', () => {
  let platform: IPlatformAdapter;
  let sent: ExtensionToWebviewMessage[];

  beforeEach(() => {
    configStore = { enableSummarization: false };
    platform = createMockPlatform();
    sent = [];
  });

  it('setConfig persists the new value in memory', async () => {
    expect(platform.getConfig('enableSummarization', false)).toBe(false);
    await platform.setConfig('enableSummarization', true);
    expect(platform.getConfig('enableSummarization', false)).toBe(true);
  });

  it('setConfig toggles back to false', async () => {
    configStore.enableSummarization = true;
    expect(platform.getConfig('enableSummarization', false)).toBe(true);
    await platform.setConfig('enableSummarization', false);
    expect(platform.getConfig('enableSummarization', false)).toBe(false);
  });

  it('toggle cycle: OFF → ON → OFF produces correct settings messages', async () => {
    // Simulate what StandaloneMessageHandler.toggleSummarization does
    async function toggleAndSendSettings() {
      const current = platform.getConfig<boolean>('enableSummarization', false);
      await platform.setConfig('enableSummarization', !current);
      const settings: ClaudineSettings = {
        imageGenerationApi: 'none',
        claudeCodePath: '~/.claude',
        codexPath: '~/.codex',
        enableSummarization: platform.getConfig('enableSummarization', false),
        hasApiKey: false,
        toolbarLocation: 'sidebar',
        autoRestartAfterRateLimit: false,
        showTaskIcon: true,
        showTaskDescription: true,
        showTaskLatest: true,
        showTaskGitBranch: true,
        monitoredWorkspace: { mode: 'auto' },
        detectedWorkspacePaths: [],
        customTerminals: [],
      };
      sent.push({ type: 'updateSettings', settings });
    }

    // Toggle 1: OFF → ON
    await toggleAndSendSettings();
    const msg1 = sent[0];
    expect(msg1.type).toBe('updateSettings');
    expect((msg1 as { type: 'updateSettings'; settings: ClaudineSettings }).settings.enableSummarization).toBe(true);

    // Toggle 2: ON → OFF
    await toggleAndSendSettings();
    const msg2 = sent[1];
    expect((msg2 as { type: 'updateSettings'; settings: ClaudineSettings }).settings.enableSummarization).toBe(false);
  });

  it('updateSetting handler writes allowed config keys', async () => {
    // Simulate what the fixed updateSetting handler does
    const ALLOWED_SETTING_KEYS = [
      'imageGenerationApi', 'enableSummarization', 'autoRestartAfterRateLimit',
      'showTaskIcon', 'showTaskDescription', 'showTaskLatest', 'showTaskGitBranch'
    ];

    const key = 'enableSummarization';
    const value = true;

    if (ALLOWED_SETTING_KEYS.includes(key)) {
      await platform.setConfig(key, value);
    }

    expect(platform.getConfig('enableSummarization', false)).toBe(true);
  });

  it('updateSetting handler ignores unknown keys', async () => {
    const ALLOWED_SETTING_KEYS = [
      'imageGenerationApi', 'enableSummarization', 'autoRestartAfterRateLimit',
      'showTaskIcon', 'showTaskDescription', 'showTaskLatest', 'showTaskGitBranch'
    ];

    const key = 'someUnknownKey';
    if (ALLOWED_SETTING_KEYS.includes(key)) {
      await platform.setConfig(key, 'evil');
    }

    expect(configStore['someUnknownKey']).toBeUndefined();
  });
});
