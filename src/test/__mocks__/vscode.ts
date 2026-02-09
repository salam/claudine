// Minimal vscode mock for unit tests

export class EventEmitter<T> {
  private _listeners: Array<(e: T) => void> = [];

  get event() {
    return (listener: (e: T) => void) => {
      this._listeners.push(listener);
      return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
    };
  }

  fire(data: T) {
    for (const listener of this._listeners) {
      listener(data);
    }
  }

  dispose() {
    this._listeners = [];
  }
}

export const workspace = {
  getConfiguration: () => ({
    get: (_key: string, defaultValue?: unknown) => defaultValue,
    update: async () => {},
  }),
};

export const window = {
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  tabGroups: {
    onDidChangeTabs: () => ({ dispose: () => {} }),
  },
  onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
  onDidChangeActiveTerminal: () => ({ dispose: () => {} }),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
    fsPath: [base.fsPath, ...segments].join('/'),
    scheme: 'file'
  }),
};

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export const l10n = {
  t: (message: string, ..._args: unknown[]) => message,
};

// Tab system mocks for KanbanViewProvider / TabManager tests
export class TabInputWebview {
  constructor(public readonly viewType: string) {}
}

export const commands = {
  executeCommand: async (..._args: unknown[]) => undefined,
};

export class Disposable {
  constructor(private _callOnDispose: () => void) {}
  dispose() { this._callOnDispose(); }
}

// Minimal FileSystemWatcher mock
export function createFileSystemWatcher() {
  return {
    onDidCreate: () => ({ dispose: () => {} }),
    onDidChange: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  };
}

// RelativePattern mock
export class RelativePattern {
  constructor(public base: string, public pattern: string) {}
}

// ExtensionMode enum
export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}
