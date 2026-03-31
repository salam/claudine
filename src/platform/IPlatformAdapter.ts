/**
 * Platform abstraction layer.
 *
 * Decouples core services from VS Code APIs so they can run in both
 * the extension host (VS Code) and standalone mode (Node.js server).
 */

// ── Disposable ───────────────────────────────────────────────────────

export interface Disposable {
  dispose(): void;
}

// ── Event system (mirrors vscode.EventEmitter / vscode.Event) ────────

/**
 * A function that subscribes a listener and returns a disposable.
 * Mirrors the `vscode.Event<T>` signature.
 */
export type PlatformEvent<T> = (listener: (e: T) => void) => Disposable;

/**
 * Fire-and-subscribe event emitter.
 * Mirrors the `vscode.EventEmitter<T>` API surface used by StateManager.
 */
export interface PlatformEventEmitter<T> {
  /** The subscribable event. */
  readonly event: PlatformEvent<T>;
  /** Emit the event to all listeners. */
  fire(data: T): void;
  /** Dispose the emitter and all subscriptions. */
  dispose(): void;
}

// ── File watcher ─────────────────────────────────────────────────────

export interface FileWatchCallbacks {
  onCreate?: (filePath: string) => void;
  onChange?: (filePath: string) => void;
  onDelete?: (filePath: string) => void;
}

// ── Platform adapter ─────────────────────────────────────────────────

export interface IPlatformAdapter {
  // ── Event emitters ───────────────────────────────────────────────

  /** Create a typed event emitter (replaces `new vscode.EventEmitter<T>()`). */
  createEventEmitter<T>(): PlatformEventEmitter<T>;

  // ── File watching ────────────────────────────────────────────────

  /**
   * Watch files matching a glob pattern under `basePath`.
   * Replaces `vscode.workspace.createFileSystemWatcher(new RelativePattern(...))`.
   */
  watchFiles(basePath: string, globPattern: string, callbacks: FileWatchCallbacks): Disposable;

  // ── Configuration ────────────────────────────────────────────────

  /**
   * Read a Claudine configuration value.
   * Replaces `vscode.workspace.getConfiguration('claudine').get<T>(key, default)`.
   */
  getConfig<T>(key: string, defaultValue: T): T;

  /**
   * Write a Claudine configuration value.
   * Replaces `vscode.workspace.getConfiguration('claudine').update(key, value, Global)`.
   */
  setConfig<T>(key: string, value: T): Promise<void>;

  // ── File system ──────────────────────────────────────────────────

  /** Ensure a directory exists (create recursively if needed). */
  ensureDirectory(dirPath: string): Promise<void>;

  /** Write data to a file (creates parent directories as needed). */
  writeFile(filePath: string, data: Uint8Array | string): Promise<void>;

  /** Read a file's raw bytes. Throws if file does not exist. */
  readFile(filePath: string): Promise<Uint8Array>;

  /** Check whether a file exists and return basic stats, or undefined. */
  stat(filePath: string): Promise<{ size: number } | undefined>;

  // ── Global state (key-value store persisted across sessions) ─────

  /**
   * Retrieve a persisted value.
   * Replaces `context.globalState.get<T>(key, default)`.
   */
  getGlobalState<T>(key: string, defaultValue: T): T;

  /**
   * Persist a value.
   * Replaces `context.globalState.update(key, value)`.
   */
  setGlobalState<T>(key: string, value: T): Promise<void>;

  // ── Secret storage ───────────────────────────────────────────────

  /** Retrieve a secret (e.g. API key). */
  getSecret(key: string): Promise<string | undefined>;

  /** Store a secret. */
  setSecret(key: string, value: string): Promise<void>;

  // ── Storage paths ────────────────────────────────────────────────

  /**
   * Absolute path to extension-global storage (icons, cache, etc.).
   * Replaces `context.globalStorageUri.fsPath`.
   */
  getGlobalStoragePath(): string;

  /**
   * Return open workspace folder paths, or `null` in standalone mode
   * (meaning: scan all projects).
   * Replaces `vscode.workspace.workspaceFolders`.
   */
  getWorkspaceFolders(): string[] | null;

  // ── Extension context ────────────────────────────────────────────

  /** Whether the extension is running in development mode (EDH). */
  isDevelopmentMode(): boolean;

  /** Path to the extension source directory (for bundled resources). */
  getExtensionPath(): string | undefined;

}
