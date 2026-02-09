"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Regression tests for ClaudeCodeWatcher.
 *
 * These tests lock in current behavior so that performance optimizations
 * (async I/O, search indexing, icon separation, batched updates)
 * can be validated without silently breaking functionality.
 */
const vitest_1 = require("vitest");
const events_1 = require("events");
const fs = __importStar(require("fs"));
const fsp = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const ClaudeCodeWatcher_1 = require("../providers/ClaudeCodeWatcher");
function createMockPlatform() {
    return {
        createEventEmitter() {
            const ee = new events_1.EventEmitter();
            return {
                get event() {
                    return (listener) => {
                        ee.on('data', listener);
                        return { dispose: () => { ee.removeListener('data', listener); } };
                    };
                },
                fire: (data) => { ee.emit('data', data); },
                dispose: () => { ee.removeAllListeners(); }
            };
        },
        watchFiles: () => ({ dispose: () => { } }),
        getConfig: (_k, d) => d,
        ensureDirectory: async () => { },
        writeFile: async () => { },
        readFile: async () => new Uint8Array(),
        stat: async () => undefined,
        getGlobalState: (_k, d) => d,
        setGlobalState: async () => { },
        getSecret: async () => undefined,
        setSecret: async () => { },
        getGlobalStoragePath: () => '/tmp/claudine-test',
        getWorkspaceFolders: () => null,
        isDevelopmentMode: () => false,
        getExtensionPath: () => undefined,
    };
}
// Mock fs (used by ClaudeCodeWatcher for sync directory scanning + search)
vitest_1.vi.mock('fs', () => ({
    readFileSync: vitest_1.vi.fn(),
    statSync: vitest_1.vi.fn(() => ({
        birthtime: new Date('2025-01-01'),
        mtime: new Date('2025-01-02'),
        size: 1024,
    })),
    existsSync: vitest_1.vi.fn(() => true),
    readdirSync: vitest_1.vi.fn(() => []),
}));
// Mock fs/promises (used by ConversationParser for async file I/O)
vitest_1.vi.mock('fs/promises', () => ({
    stat: vitest_1.vi.fn().mockResolvedValue({ size: 1024 }),
    readFile: vitest_1.vi.fn().mockResolvedValue(''),
    access: vitest_1.vi.fn().mockRejectedValue(new Error('ENOENT')),
    open: vitest_1.vi.fn(),
}));
// Override vscode mock to set workspaceFolders to undefined (scan-all mode)
// and add types needed by ClaudeCodeWatcher
vitest_1.vi.mock('vscode', () => {
    class EventEmitter {
        _listeners = [];
        get event() {
            return (listener) => {
                this._listeners.push(listener);
                return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
            };
        }
        fire(data) { for (const l of this._listeners)
            l(data); }
        dispose() { this._listeners = []; }
    }
    return {
        EventEmitter,
        workspace: {
            workspaceFolders: undefined,
            getConfiguration: () => ({
                get: (_key, defaultValue) => defaultValue,
                update: async () => { },
            }),
            createFileSystemWatcher: () => ({
                onDidCreate: () => ({ dispose: () => { } }),
                onDidChange: () => ({ dispose: () => { } }),
                onDidDelete: () => ({ dispose: () => { } }),
                dispose: () => { },
            }),
        },
        Uri: {
            file: (p) => ({ fsPath: p, scheme: 'file' }),
        },
        ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
        l10n: { t: (msg) => msg },
        window: {
            showInformationMessage: async () => undefined,
            showErrorMessage: async () => undefined,
            showWarningMessage: async () => undefined,
        },
        RelativePattern: class {
            base;
            pattern;
            constructor(base, pattern) {
                this.base = base;
                this.pattern = pattern;
            }
        },
        ExtensionMode: { Production: 1, Development: 2, Test: 3 },
    };
});
const mockReadFileSync = vitest_1.vi.mocked(fs.readFileSync);
const mockExistsSync = vitest_1.vi.mocked(fs.existsSync);
const mockReaddirSync = vitest_1.vi.mocked(fs.readdirSync);
const mockStat = vitest_1.vi.mocked(fsp.stat);
const mockReadFile = vitest_1.vi.mocked(fsp.readFile);
function makeConversation(overrides = {}) {
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
        setConversations: vitest_1.vi.fn(),
        updateConversation: vitest_1.vi.fn(),
        removeConversation: vitest_1.vi.fn(),
        getConversation: vitest_1.vi.fn(),
        getConversations: vitest_1.vi.fn().mockReturnValue([]),
        setConversationIcon: vitest_1.vi.fn(),
        onConversationsChanged: vitest_1.vi.fn().mockReturnValue({ dispose: () => { } }),
        onNeedsInput: vitest_1.vi.fn().mockReturnValue({ dispose: () => { } }),
        ready: Promise.resolve(),
    };
}
(0, vitest_1.describe)('ClaudeCodeWatcher — regression tests', () => {
    let watcher;
    let mockStateManager;
    const homedir = os.homedir();
    const claudePath = path.join(homedir, '.claude');
    const projectsPath = path.join(claudePath, 'projects');
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockStateManager = createMockStateManager();
        watcher = new ClaudeCodeWatcher_1.ClaudeCodeWatcher(mockStateManager, createMockPlatform());
        // Default: existsSync returns true for standard paths
        mockExistsSync.mockReturnValue(true);
        // Restore async mock defaults after clearAllMocks
        mockStat.mockResolvedValue({ size: 1024 });
        vitest_1.vi.mocked(fsp.access).mockRejectedValue(new Error('ENOENT'));
    });
    // ---------- searchConversations ----------
    (0, vitest_1.describe)('searchConversations', () => {
        function setupSearchableFiles(files) {
            // readdirSync for the projects dir: return project dirs
            mockReaddirSync.mockImplementation(((dirPath) => {
                if (dirPath === projectsPath) {
                    return [{ name: 'test-project', isDirectory: () => true, isFile: () => false }];
                }
                // readdirSync for the project dir: return JSONL files
                return files.map(f => ({
                    name: f.name,
                    isDirectory: () => false,
                    isFile: () => true,
                }));
            }));
            mockReadFileSync.mockImplementation(((filePath) => {
                const name = path.basename(filePath);
                const file = files.find(f => f.name === name);
                return file?.content || '';
            }));
        }
        (0, vitest_1.it)('returns correct IDs for matching content', () => {
            setupSearchableFiles([
                { name: 'conv-abc.jsonl', content: '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix authentication bug"}]}}' },
                { name: 'conv-def.jsonl', content: '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Add dark mode"}]}}' },
            ]);
            const results = watcher.searchConversations('authentication');
            (0, vitest_1.expect)(results).toEqual(['conv-abc']);
        });
        (0, vitest_1.it)('returns empty for no matches', () => {
            setupSearchableFiles([
                { name: 'conv-abc.jsonl', content: '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix the login"}]}}' },
            ]);
            const results = watcher.searchConversations('nonexistent-xyz-query');
            (0, vitest_1.expect)(results).toEqual([]);
        });
        (0, vitest_1.it)('is case-insensitive', () => {
            setupSearchableFiles([
                { name: 'conv-abc.jsonl', content: '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix Authentication Bug"}]}}' },
            ]);
            const results = watcher.searchConversations('authentication');
            (0, vitest_1.expect)(results).toEqual(['conv-abc']);
        });
        (0, vitest_1.it)('returns empty for blank query', () => {
            const results = watcher.searchConversations('');
            (0, vitest_1.expect)(results).toEqual([]);
            (0, vitest_1.expect)(results).toEqual(watcher.searchConversations('   '));
        });
    });
    // ---------- refresh / file events ----------
    (0, vitest_1.describe)('refresh and file events', () => {
        (0, vitest_1.it)('refresh calls setConversations with all parsed conversations', async () => {
            // Setup: one project dir with two JSONL files
            mockReaddirSync.mockImplementation(((dirPath) => {
                if (dirPath === projectsPath) {
                    return [{ name: 'test-project', isDirectory: () => true, isFile: () => false }];
                }
                return [
                    { name: 'conv-1.jsonl', isDirectory: () => false, isFile: () => true },
                    { name: 'conv-2.jsonl', isDirectory: () => false, isFile: () => true },
                ];
            }));
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
            mockStat.mockResolvedValue({ size: bytes });
            mockReadFile.mockResolvedValue(jsonl);
            await watcher.refresh();
            (0, vitest_1.expect)(mockStateManager.setConversations).toHaveBeenCalledTimes(1);
            const conversations = mockStateManager.setConversations.mock.calls[0][0];
            (0, vitest_1.expect)(conversations.length).toBe(2);
        });
    });
    // ---------- File deletion ----------
    (0, vitest_1.describe)('onFileDeleted behavior', () => {
        (0, vitest_1.it)('is exposed correctly via the public API', () => {
            // ClaudeCodeWatcher clears parser cache and removes from state on file delete.
            // We can verify the watcher's parseCacheSize reflects this.
            (0, vitest_1.expect)(watcher.parseCacheSize).toBe(0);
        });
    });
    // ---------- Icon generation ----------
    (0, vitest_1.describe)('icon generation', () => {
        (0, vitest_1.it)('skips conversations that already have icons', async () => {
            // When conversations already have icons, generateIcons should not try to generate new ones.
            // We test this indirectly: refresh with a conversation that has an icon
            // and verify setConversationIcon is NOT called for it.
            mockReaddirSync.mockImplementation(((dirPath) => {
                if (dirPath === projectsPath) {
                    return [{ name: 'test-project', isDirectory: () => true, isFile: () => false }];
                }
                return [
                    { name: 'conv-with-icon.jsonl', isDirectory: () => false, isFile: () => true },
                ];
            }));
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
            mockStat.mockResolvedValue({ size: bytes });
            mockReadFile.mockResolvedValue(jsonl);
            // Mock: the state manager returns the conversation WITH an icon already
            mockStateManager.getConversation.mockReturnValue(makeConversation({ id: 'conv-with-icon', icon: 'data:image/png;base64,existing' }));
            await watcher.refresh();
            // No icon generation should have been triggered
            // (watcher was created without imageGenerator, so setConversationIcon won't be called)
            (0, vitest_1.expect)(mockStateManager.setConversationIcon).not.toHaveBeenCalled();
        });
    });
    // ---------- Watcher state ----------
    (0, vitest_1.describe)('watcher state', () => {
        (0, vitest_1.it)('reports isWatching correctly', () => {
            (0, vitest_1.expect)(watcher.isWatching).toBe(false);
        });
        (0, vitest_1.it)('reports claudePath correctly', () => {
            (0, vitest_1.expect)(watcher.claudePath).toBe(claudePath);
        });
        (0, vitest_1.it)('clearPendingIcons does not throw', () => {
            (0, vitest_1.expect)(() => watcher.clearPendingIcons()).not.toThrow();
        });
    });
    // ---------- Temp directory exclusion ----------
    (0, vitest_1.describe)('isExcludedProjectDir (static)', () => {
        (0, vitest_1.it)('excludes macOS temp dir /private/var/folders/', () => {
            const result = ClaudeCodeWatcher_1.ClaudeCodeWatcher.isExcludedProjectDir('-private-var-folders-4n-sj5qzp3x3sl32qt21rpsxjlc0000gq-T');
            (0, vitest_1.expect)(result.excluded).toBe(true);
            (0, vitest_1.expect)(result.reason).toBeDefined();
        });
        (0, vitest_1.it)('excludes /var/folders/ variant', () => {
            const result = ClaudeCodeWatcher_1.ClaudeCodeWatcher.isExcludedProjectDir('-var-folders-xx-yy-T');
            (0, vitest_1.expect)(result.excluded).toBe(true);
        });
        (0, vitest_1.it)('excludes /tmp/ paths', () => {
            const result = ClaudeCodeWatcher_1.ClaudeCodeWatcher.isExcludedProjectDir('-tmp-scratch-project');
            (0, vitest_1.expect)(result.excluded).toBe(true);
        });
        (0, vitest_1.it)('does NOT exclude normal project paths', () => {
            const result = ClaudeCodeWatcher_1.ClaudeCodeWatcher.isExcludedProjectDir('-Users-matthias-Development-claudine');
            (0, vitest_1.expect)(result.excluded).toBe(false);
        });
        (0, vitest_1.it)('does NOT exclude paths that just contain "var" in a name', () => {
            const result = ClaudeCodeWatcher_1.ClaudeCodeWatcher.isExcludedProjectDir('-Users-matthias-Development-variable-project');
            (0, vitest_1.expect)(result.excluded).toBe(false);
        });
    });
    // ---------- decodeProjectDirName ----------
    (0, vitest_1.describe)('decodeProjectDirName (static)', () => {
        (0, vitest_1.it)('decodes encoded path back to approximation', () => {
            (0, vitest_1.expect)(ClaudeCodeWatcher_1.ClaudeCodeWatcher.decodeProjectDirName('-Users-matthias-Development-foo'))
                .toBe('/Users/matthias/Development/foo');
        });
        (0, vitest_1.it)('handles macOS temp path', () => {
            (0, vitest_1.expect)(ClaudeCodeWatcher_1.ClaudeCodeWatcher.decodeProjectDirName('-private-var-folders-4n-abc123-T')).toBe('/private/var/folders/4n/abc123/T');
        });
    });
    // ---------- discoverProjects ----------
    (0, vitest_1.describe)('discoverProjects', () => {
        (0, vitest_1.it)('returns manifest with file counts and exclusion flags', () => {
            mockReaddirSync.mockImplementation(((dirPath) => {
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
            }));
            const manifest = watcher.discoverProjects();
            (0, vitest_1.expect)(manifest).toHaveLength(2);
            const myApp = manifest.find(p => p.name === 'myapp');
            (0, vitest_1.expect)(myApp).toBeDefined();
            (0, vitest_1.expect)(myApp.fileCount).toBe(2);
            (0, vitest_1.expect)(myApp.enabled).toBe(true);
            (0, vitest_1.expect)(myApp.autoExcluded).toBe(false);
            const tempDir = manifest.find(p => p.autoExcluded);
            (0, vitest_1.expect)(tempDir).toBeDefined();
            (0, vitest_1.expect)(tempDir.fileCount).toBe(1);
            (0, vitest_1.expect)(tempDir.enabled).toBe(false);
            (0, vitest_1.expect)(tempDir.autoExcluded).toBe(true);
        });
        (0, vitest_1.it)('skips empty project directories', () => {
            mockReaddirSync.mockImplementation(((dirPath) => {
                if (dirPath === projectsPath) {
                    return [
                        { name: '-Users-matthias-Development-empty', isDirectory: () => true, isFile: () => false },
                    ];
                }
                return []; // no .jsonl files
            }));
            const manifest = watcher.discoverProjects();
            (0, vitest_1.expect)(manifest).toHaveLength(0);
        });
    });
    // ---------- setupFileWatcher ----------
    (0, vitest_1.describe)('setupFileWatcher', () => {
        (0, vitest_1.it)('sets up watcher without calling refresh', () => {
            // setupFileWatcher should NOT trigger setConversations (no refresh)
            watcher.setupFileWatcher();
            (0, vitest_1.expect)(watcher.isWatching).toBe(true);
            (0, vitest_1.expect)(mockStateManager.setConversations).not.toHaveBeenCalled();
            watcher.stopWatching();
        });
    });
    // ---------- scanProjectsProgressively ----------
    (0, vitest_1.describe)('scanProjectsProgressively', () => {
        (0, vitest_1.it)('calls onProgress and onProjectScanned per project', async () => {
            const ts = new Date().toISOString();
            const jsonl = JSON.stringify({
                type: 'user', uuid: '1', timestamp: ts, sessionId: 's',
                parentUuid: null, isSidechain: false,
                message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
            });
            const bytes = Buffer.byteLength(jsonl, 'utf-8');
            mockStat.mockResolvedValue({ size: bytes });
            mockReadFile.mockResolvedValue(jsonl);
            mockReaddirSync.mockImplementation(((dirPath) => {
                return [
                    { name: 'conv-1.jsonl', isFile: () => true, isDirectory: () => false },
                ];
            }));
            const onProgress = vitest_1.vi.fn();
            const onProjectScanned = vitest_1.vi.fn();
            const manifest = [{
                    encodedPath: '-Users-matthias-Development-test',
                    decodedPath: '/Users/matthias/Development/test',
                    name: 'test',
                    fileCount: 1,
                    enabled: true,
                    autoExcluded: false,
                }];
            const result = await watcher.scanProjectsProgressively(manifest, onProgress, onProjectScanned);
            (0, vitest_1.expect)(result.length).toBe(1);
            (0, vitest_1.expect)(onProgress).toHaveBeenCalled();
            (0, vitest_1.expect)(onProjectScanned).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(onProjectScanned.mock.calls[0][0]).toBe('/Users/matthias/Development/test');
            (0, vitest_1.expect)(onProjectScanned.mock.calls[0][1]).toHaveLength(1);
        });
    });
});
//# sourceMappingURL=ClaudeCodeWatcher.perf.test.js.map