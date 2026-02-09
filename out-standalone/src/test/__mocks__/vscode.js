"use strict";
// Minimal vscode mock for unit tests
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionMode = exports.RelativePattern = exports.Disposable = exports.commands = exports.TabInputWebview = exports.l10n = exports.ConfigurationTarget = exports.Uri = exports.window = exports.workspace = exports.EventEmitter = void 0;
exports.createFileSystemWatcher = createFileSystemWatcher;
class EventEmitter {
    _listeners = [];
    get event() {
        return (listener) => {
            this._listeners.push(listener);
            return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
        };
    }
    fire(data) {
        for (const listener of this._listeners) {
            listener(data);
        }
    }
    dispose() {
        this._listeners = [];
    }
}
exports.EventEmitter = EventEmitter;
exports.workspace = {
    getConfiguration: () => ({
        get: (_key, defaultValue) => defaultValue,
        update: async () => { },
    }),
};
exports.window = {
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
};
exports.Uri = {
    file: (path) => ({ fsPath: path, scheme: 'file' }),
};
var ConfigurationTarget;
(function (ConfigurationTarget) {
    ConfigurationTarget[ConfigurationTarget["Global"] = 1] = "Global";
    ConfigurationTarget[ConfigurationTarget["Workspace"] = 2] = "Workspace";
    ConfigurationTarget[ConfigurationTarget["WorkspaceFolder"] = 3] = "WorkspaceFolder";
})(ConfigurationTarget || (exports.ConfigurationTarget = ConfigurationTarget = {}));
exports.l10n = {
    t: (message, ..._args) => message,
};
// Tab system mocks for KanbanViewProvider / TabManager tests
class TabInputWebview {
    viewType;
    constructor(viewType) {
        this.viewType = viewType;
    }
}
exports.TabInputWebview = TabInputWebview;
exports.commands = {
    executeCommand: async (..._args) => undefined,
};
class Disposable {
    _callOnDispose;
    constructor(_callOnDispose) {
        this._callOnDispose = _callOnDispose;
    }
    dispose() { this._callOnDispose(); }
}
exports.Disposable = Disposable;
// Minimal FileSystemWatcher mock
function createFileSystemWatcher() {
    return {
        onDidCreate: () => ({ dispose: () => { } }),
        onDidChange: () => ({ dispose: () => { } }),
        onDidDelete: () => ({ dispose: () => { } }),
        dispose: () => { },
    };
}
// RelativePattern mock
class RelativePattern {
    base;
    pattern;
    constructor(base, pattern) {
        this.base = base;
        this.pattern = pattern;
    }
}
exports.RelativePattern = RelativePattern;
// ExtensionMode enum
var ExtensionMode;
(function (ExtensionMode) {
    ExtensionMode[ExtensionMode["Production"] = 1] = "Production";
    ExtensionMode[ExtensionMode["Development"] = 2] = "Development";
    ExtensionMode[ExtensionMode["Test"] = 3] = "Test";
})(ExtensionMode || (exports.ExtensionMode = ExtensionMode = {}));
//# sourceMappingURL=vscode.js.map