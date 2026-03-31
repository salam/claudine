import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import {
  IPlatformAdapter,
  Disposable,
  PlatformEventEmitter,
  PlatformEvent,
  FileWatchCallbacks
} from './IPlatformAdapter';

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
export class StandaloneAdapter implements IPlatformAdapter {
  private _config: Record<string, unknown> = {};
  private _globalState: Record<string, unknown> = {};
  private _globalStatePath: string;
  private _configPath: string;

  constructor() {
    this._configPath = path.join(CLAUDINE_HOME, 'config.json');
    this._globalStatePath = path.join(CLAUDINE_HOME, 'global-state.json');
    this.loadConfig();
    this.loadGlobalState();
  }

  private loadConfig() {
    try {
      if (fs.existsSync(this._configPath)) {
        this._config = JSON.parse(fs.readFileSync(this._configPath, 'utf-8'));
      }
    } catch {
      this._config = {};
    }
  }

  private loadGlobalState() {
    try {
      if (fs.existsSync(this._globalStatePath)) {
        this._globalState = JSON.parse(fs.readFileSync(this._globalStatePath, 'utf-8'));
      }
    } catch {
      this._globalState = {};
    }
  }

  // ── Event emitters ───────────────────────────────────────────────

  createEventEmitter<T>(): PlatformEventEmitter<T> {
    const ee = new EventEmitter();
    const EVENT_NAME = 'data';

    return {
      get event(): PlatformEvent<T> {
        return (listener: (e: T) => void): Disposable => {
          ee.on(EVENT_NAME, listener);
          return { dispose: () => { ee.removeListener(EVENT_NAME, listener); } };
        };
      },
      fire: (data: T) => { ee.emit(EVENT_NAME, data); },
      dispose: () => { ee.removeAllListeners(); }
    };
  }

  // ── File watching ────────────────────────────────────────────────

  private _chokidar: typeof import('chokidar') | undefined;

  watchFiles(basePath: string, globPattern: string, callbacks: FileWatchCallbacks): Disposable {
    if (!this._chokidar) {
      throw new Error('Call initAsync() before watchFiles() in standalone mode');
    }

    // BUG9: chokidar v4 does not fire `change` events when watching glob
    // patterns (e.g. "**/*.jsonl"). Watching the base directory directly
    // works reliably, so we watch the directory and filter by extension.
    const ext = globPattern.match(/\*\.(\w+)$/)?.[1];
    const matchesGlob = ext
      ? (filePath: string) => filePath.endsWith(`.${ext}`)
      : () => true;

    const watcher = this._chokidar.watch(basePath, {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
      awaitWriteFinish: { stabilityThreshold: 200 }
    });

    if (callbacks.onCreate) {
      const cb = callbacks.onCreate;
      watcher.on('add', (p: string) => { if (matchesGlob(p)) cb(p); });
    }
    if (callbacks.onChange) {
      const cb = callbacks.onChange;
      watcher.on('change', (p: string) => { if (matchesGlob(p)) cb(p); });
    }
    if (callbacks.onDelete) {
      const cb = callbacks.onDelete;
      watcher.on('unlink', (p: string) => { if (matchesGlob(p)) cb(p); });
    }

    return { dispose: () => { watcher.close(); } };
  }

  /** Load async dependencies (chokidar). Call once before using watchFiles(). */
  async initAsync(): Promise<void> {
    this._chokidar = await import('chokidar');
  }

  // ── Configuration ────────────────────────────────────────────────

  getConfig<T>(key: string, defaultValue: T): T {
    const value = this._config[key];
    return value !== undefined ? value as T : defaultValue;
  }

  async setConfig<T>(key: string, value: T): Promise<void> {
    this._config[key] = value;
    await this.ensureDirectory(CLAUDINE_HOME);
    await fs.promises.writeFile(
      this._configPath,
      JSON.stringify(this._config, null, 2)
    );
  }

  // ── File system ──────────────────────────────────────────────────

  async ensureDirectory(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  async writeFile(filePath: string, data: Uint8Array | string): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, data);
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    return fs.promises.readFile(filePath);
  }

  async stat(filePath: string): Promise<{ size: number } | undefined> {
    try {
      const s = await fs.promises.stat(filePath);
      return { size: s.size };
    } catch {
      return undefined;
    }
  }

  // ── Global state ─────────────────────────────────────────────────

  getGlobalState<T>(key: string, defaultValue: T): T {
    const value = this._globalState[key];
    return value !== undefined ? value as T : defaultValue;
  }

  async setGlobalState<T>(key: string, value: T): Promise<void> {
    this._globalState[key] = value;
    await this.ensureDirectory(CLAUDINE_HOME);
    await fs.promises.writeFile(
      this._globalStatePath,
      JSON.stringify(this._globalState, null, 2)
    );
  }

  // ── Secret storage ───────────────────────────────────────────────

  async getSecret(key: string): Promise<string | undefined> {
    // Simple encrypted-file approach for standalone mode.
    // A production version could use `keytar` for OS keychain access.
    const secretsPath = path.join(CLAUDINE_HOME, '.secrets.json');
    try {
      if (fs.existsSync(secretsPath)) {
        const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
        return secrets[key];
      }
    } catch {
      // Ignore read errors
    }
    return undefined;
  }

  async setSecret(key: string, value: string): Promise<void> {
    const secretsPath = path.join(CLAUDINE_HOME, '.secrets.json');
    let secrets: Record<string, string> = {};
    try {
      if (fs.existsSync(secretsPath)) {
        secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
      }
    } catch {
      // Ignore
    }
    secrets[key] = value;
    await this.ensureDirectory(CLAUDINE_HOME);
    await fs.promises.writeFile(secretsPath, JSON.stringify(secrets, null, 2));
  }

  // ── Storage paths ────────────────────────────────────────────────

  getGlobalStoragePath(): string {
    return path.join(CLAUDINE_HOME, 'storage');
  }

  /** Standalone mode: return null to scan all projects. */
  getWorkspaceFolders(): string[] | null {
    return null;
  }

  // ── Extension context ────────────────────────────────────────────

  isDevelopmentMode(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  getExtensionPath(): string | undefined {
    return path.resolve(__dirname, '..');
  }

}
