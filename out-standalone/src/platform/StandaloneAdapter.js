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
exports.StandaloneAdapter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const events_1 = require("events");
/**
 * Default Claudine config directory for standalone mode.
 */
const CLAUDINE_HOME = path.join(os.homedir(), '.claudine');
/**
 * Node.js implementation of the platform adapter for standalone mode.
 *
 * Uses `chokidar` for file watching, `fs/promises` for storage,
 * and JSON config files instead of VS Code settings.
 */
class StandaloneAdapter {
    _config = {};
    _globalState = {};
    _globalStatePath;
    _configPath;
    constructor() {
        this._configPath = path.join(CLAUDINE_HOME, 'config.json');
        this._globalStatePath = path.join(CLAUDINE_HOME, 'global-state.json');
        this.loadConfig();
        this.loadGlobalState();
    }
    loadConfig() {
        try {
            if (fs.existsSync(this._configPath)) {
                this._config = JSON.parse(fs.readFileSync(this._configPath, 'utf-8'));
            }
        }
        catch {
            this._config = {};
        }
    }
    loadGlobalState() {
        try {
            if (fs.existsSync(this._globalStatePath)) {
                this._globalState = JSON.parse(fs.readFileSync(this._globalStatePath, 'utf-8'));
            }
        }
        catch {
            this._globalState = {};
        }
    }
    // ── Event emitters ───────────────────────────────────────────────
    createEventEmitter() {
        const ee = new events_1.EventEmitter();
        const EVENT_NAME = 'data';
        return {
            get event() {
                return (listener) => {
                    ee.on(EVENT_NAME, listener);
                    return { dispose: () => { ee.removeListener(EVENT_NAME, listener); } };
                };
            },
            fire: (data) => { ee.emit(EVENT_NAME, data); },
            dispose: () => { ee.removeAllListeners(); }
        };
    }
    // ── File watching ────────────────────────────────────────────────
    _chokidar;
    watchFiles(basePath, globPattern, callbacks) {
        if (!this._chokidar) {
            throw new Error('Call initAsync() before watchFiles() in standalone mode');
        }
        const fullPattern = path.join(basePath, globPattern);
        const watcher = this._chokidar.watch(fullPattern, {
            persistent: true,
            ignoreInitial: true,
            depth: 3,
            awaitWriteFinish: { stabilityThreshold: 200 }
        });
        if (callbacks.onCreate) {
            watcher.on('add', callbacks.onCreate);
        }
        if (callbacks.onChange) {
            watcher.on('change', callbacks.onChange);
        }
        if (callbacks.onDelete) {
            watcher.on('unlink', callbacks.onDelete);
        }
        return { dispose: () => { watcher.close(); } };
    }
    /** Load async dependencies (chokidar). Call once before using watchFiles(). */
    async initAsync() {
        this._chokidar = await Promise.resolve().then(() => __importStar(require('chokidar')));
    }
    // ── Configuration ────────────────────────────────────────────────
    getConfig(key, defaultValue) {
        const value = this._config[key];
        return value !== undefined ? value : defaultValue;
    }
    // ── File system ──────────────────────────────────────────────────
    async ensureDirectory(dirPath) {
        await fs.promises.mkdir(dirPath, { recursive: true });
    }
    async writeFile(filePath, data) {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, data);
    }
    async readFile(filePath) {
        return fs.promises.readFile(filePath);
    }
    async stat(filePath) {
        try {
            const s = await fs.promises.stat(filePath);
            return { size: s.size };
        }
        catch {
            return undefined;
        }
    }
    // ── Global state ─────────────────────────────────────────────────
    getGlobalState(key, defaultValue) {
        const value = this._globalState[key];
        return value !== undefined ? value : defaultValue;
    }
    async setGlobalState(key, value) {
        this._globalState[key] = value;
        await this.ensureDirectory(CLAUDINE_HOME);
        await fs.promises.writeFile(this._globalStatePath, JSON.stringify(this._globalState, null, 2));
    }
    // ── Secret storage ───────────────────────────────────────────────
    async getSecret(key) {
        // Simple encrypted-file approach for standalone mode.
        // A production version could use `keytar` for OS keychain access.
        const secretsPath = path.join(CLAUDINE_HOME, '.secrets.json');
        try {
            if (fs.existsSync(secretsPath)) {
                const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
                return secrets[key];
            }
        }
        catch {
            // Ignore read errors
        }
        return undefined;
    }
    async setSecret(key, value) {
        const secretsPath = path.join(CLAUDINE_HOME, '.secrets.json');
        let secrets = {};
        try {
            if (fs.existsSync(secretsPath)) {
                secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
            }
        }
        catch {
            // Ignore
        }
        secrets[key] = value;
        await this.ensureDirectory(CLAUDINE_HOME);
        await fs.promises.writeFile(secretsPath, JSON.stringify(secrets, null, 2));
    }
    // ── Storage paths ────────────────────────────────────────────────
    getGlobalStoragePath() {
        return path.join(CLAUDINE_HOME, 'storage');
    }
    /** Standalone mode: return null to scan all projects. */
    getWorkspaceFolders() {
        return null;
    }
    // ── Extension context ────────────────────────────────────────────
    isDevelopmentMode() {
        return process.env.NODE_ENV === 'development';
    }
    getExtensionPath() {
        return path.resolve(__dirname, '..');
    }
}
exports.StandaloneAdapter = StandaloneAdapter;
//# sourceMappingURL=StandaloneAdapter.js.map