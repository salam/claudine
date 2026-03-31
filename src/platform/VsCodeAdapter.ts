import * as vscode from 'vscode';
import {
  IPlatformAdapter,
  Disposable,
  PlatformEventEmitter,
  PlatformEvent,
  FileWatchCallbacks
} from './IPlatformAdapter';

/**
 * VS Code implementation of the platform adapter.
 *
 * Wraps `vscode.*` APIs so that core services never import `vscode` directly.
 */
export class VsCodeAdapter implements IPlatformAdapter {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  // ── Event emitters ───────────────────────────────────────────────

  createEventEmitter<T>(): PlatformEventEmitter<T> {
    const emitter = new vscode.EventEmitter<T>();
    return {
      get event(): PlatformEvent<T> {
        return (listener: (e: T) => void): Disposable => {
          const disposable = emitter.event(listener);
          return { dispose: () => disposable.dispose() };
        };
      },
      fire: (data: T) => emitter.fire(data),
      dispose: () => emitter.dispose()
    };
  }

  // ── File watching ────────────────────────────────────────────────

  watchFiles(basePath: string, globPattern: string, callbacks: FileWatchCallbacks): Disposable {
    const pattern = new vscode.RelativePattern(basePath, globPattern);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    if (callbacks.onCreate) { watcher.onDidCreate((uri) => callbacks.onCreate!(uri.fsPath)); }
    if (callbacks.onChange) { watcher.onDidChange((uri) => callbacks.onChange!(uri.fsPath)); }
    if (callbacks.onDelete) { watcher.onDidDelete((uri) => callbacks.onDelete!(uri.fsPath)); }

    return { dispose: () => watcher.dispose() };
  }

  // ── Configuration ────────────────────────────────────────────────

  getConfig<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration('claudine').get<T>(key, defaultValue);
  }

  async setConfig<T>(key: string, value: T): Promise<void> {
    await vscode.workspace.getConfiguration('claudine').update(key, value, vscode.ConfigurationTarget.Global);
  }

  // ── File system ──────────────────────────────────────────────────

  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
    } catch {
      // Directory may already exist
    }
  }

  async writeFile(filePath: string, data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === 'string' ? Buffer.from(data) : data;
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes);
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    return vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  }

  async stat(filePath: string): Promise<{ size: number } | undefined> {
    try {
      const s = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return { size: s.size };
    } catch {
      return undefined;
    }
  }

  // ── Global state ─────────────────────────────────────────────────

  getGlobalState<T>(key: string, defaultValue: T): T {
    return this._context.globalState.get<T>(key, defaultValue);
  }

  async setGlobalState<T>(key: string, value: T): Promise<void> {
    await this._context.globalState.update(key, value);
  }

  // ── Secret storage ───────────────────────────────────────────────

  async getSecret(key: string): Promise<string | undefined> {
    return this._context.secrets.get(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this._context.secrets.store(key, value);
  }

  // ── Storage paths ────────────────────────────────────────────────

  getGlobalStoragePath(): string {
    return this._context.globalStorageUri.fsPath;
  }

  getWorkspaceFolders(): string[] | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }
    return folders.map(f => f.uri.fsPath);
  }

  // ── Extension context ────────────────────────────────────────────

  isDevelopmentMode(): boolean {
    return this._context.extensionMode === vscode.ExtensionMode.Development;
  }

  getExtensionPath(): string | undefined {
    return this._context.extensionPath;
  }

}
