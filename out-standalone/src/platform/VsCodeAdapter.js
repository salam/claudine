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
exports.VsCodeAdapter = void 0;
const vscode = __importStar(require("vscode"));
/**
 * VS Code implementation of the platform adapter.
 *
 * Wraps `vscode.*` APIs so that core services never import `vscode` directly.
 */
class VsCodeAdapter {
    _context;
    constructor(_context) {
        this._context = _context;
    }
    // ── Event emitters ───────────────────────────────────────────────
    createEventEmitter() {
        const emitter = new vscode.EventEmitter();
        return {
            get event() {
                return (listener) => {
                    const disposable = emitter.event(listener);
                    return { dispose: () => disposable.dispose() };
                };
            },
            fire: (data) => emitter.fire(data),
            dispose: () => emitter.dispose()
        };
    }
    // ── File watching ────────────────────────────────────────────────
    watchFiles(basePath, globPattern, callbacks) {
        const pattern = new vscode.RelativePattern(basePath, globPattern);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        if (callbacks.onCreate) {
            watcher.onDidCreate((uri) => callbacks.onCreate(uri.fsPath));
        }
        if (callbacks.onChange) {
            watcher.onDidChange((uri) => callbacks.onChange(uri.fsPath));
        }
        if (callbacks.onDelete) {
            watcher.onDidDelete((uri) => callbacks.onDelete(uri.fsPath));
        }
        return { dispose: () => watcher.dispose() };
    }
    // ── Configuration ────────────────────────────────────────────────
    getConfig(key, defaultValue) {
        return vscode.workspace.getConfiguration('claudine').get(key, defaultValue);
    }
    // ── File system ──────────────────────────────────────────────────
    async ensureDirectory(dirPath) {
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
        }
        catch {
            // Directory may already exist
        }
    }
    async writeFile(filePath, data) {
        const bytes = typeof data === 'string' ? Buffer.from(data) : data;
        await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes);
    }
    async readFile(filePath) {
        return vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    }
    async stat(filePath) {
        try {
            const s = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            return { size: s.size };
        }
        catch {
            return undefined;
        }
    }
    // ── Global state ─────────────────────────────────────────────────
    getGlobalState(key, defaultValue) {
        return this._context.globalState.get(key, defaultValue);
    }
    async setGlobalState(key, value) {
        await this._context.globalState.update(key, value);
    }
    // ── Secret storage ───────────────────────────────────────────────
    async getSecret(key) {
        return this._context.secrets.get(key);
    }
    async setSecret(key, value) {
        await this._context.secrets.store(key, value);
    }
    // ── Storage paths ────────────────────────────────────────────────
    getGlobalStoragePath() {
        return this._context.globalStorageUri.fsPath;
    }
    getWorkspaceFolders() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return null;
        }
        return folders.map(f => f.uri.fsPath);
    }
    // ── Extension context ────────────────────────────────────────────
    isDevelopmentMode() {
        return this._context.extensionMode === vscode.ExtensionMode.Development;
    }
    getExtensionPath() {
        return this._context.extensionPath;
    }
}
exports.VsCodeAdapter = VsCodeAdapter;
//# sourceMappingURL=VsCodeAdapter.js.map