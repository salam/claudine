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
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file' }),
};

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export const l10n = {
  t: (message: string, ..._args: unknown[]) => message,
};
