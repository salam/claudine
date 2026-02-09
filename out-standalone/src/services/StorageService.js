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
exports.StorageService = void 0;
const path = __importStar(require("path"));
class StorageService {
    _platform;
    _globalStoragePath;
    constructor(_platform) {
        this._platform = _platform;
        this._globalStoragePath = _platform.getGlobalStoragePath();
        this.ensureStorageExists();
    }
    async ensureStorageExists() {
        try {
            await this._platform.ensureDirectory(this._globalStoragePath);
        }
        catch {
            // Directory might already exist
        }
    }
    // Global storage methods (for extension-wide data)
    async saveGlobalSetting(key, value) {
        await this._platform.setGlobalState(key, value);
    }
    getGlobalSetting(key, defaultValue) {
        return this._platform.getGlobalState(key, defaultValue);
    }
    async saveIcon(conversationId, iconData) {
        const iconsDir = path.join(this._globalStoragePath, 'icons');
        const iconPath = path.join(iconsDir, `${conversationId}.png`);
        try {
            await this._platform.ensureDirectory(iconsDir);
        }
        catch {
            // Directory might already exist
        }
        // Convert base64 to buffer and save
        const buffer = Buffer.from(iconData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        await this._platform.writeFile(iconPath, buffer);
    }
    async getIconPath(conversationId) {
        const iconPath = path.join(this._globalStoragePath, 'icons', `${conversationId}.png`);
        const stats = await this._platform.stat(iconPath);
        if (stats) {
            return iconPath;
        }
        return undefined;
    }
    // Workspace storage methods (for project-specific data)
    async saveBoardState(state) {
        const workspaceFolders = this._platform.getWorkspaceFolders();
        if (!workspaceFolders || workspaceFolders.length === 0) {
            // Fall back to global storage
            await this.saveGlobalSetting('boardState', state);
            return;
        }
        const workspaceRoot = workspaceFolders[0];
        const claudinePath = path.join(workspaceRoot, '.claudine');
        const statePath = path.join(claudinePath, 'state.json');
        try {
            await this._platform.ensureDirectory(claudinePath);
        }
        catch {
            // Directory might already exist
        }
        const stateJson = JSON.stringify(state, null, 2);
        await this._platform.writeFile(statePath, stateJson);
    }
    async loadBoardState() {
        const workspaceFolders = this._platform.getWorkspaceFolders();
        if (workspaceFolders && workspaceFolders.length > 0) {
            const statePath = path.join(workspaceFolders[0], '.claudine', 'state.json');
            try {
                const content = await this._platform.readFile(statePath);
                return JSON.parse(content.toString());
            }
            catch {
                // File doesn't exist
            }
        }
        // Fall back to global storage
        return this.getGlobalSetting('boardState', null);
    }
    async saveWorkspaceIcon(conversationId, iconData) {
        const workspaceFolders = this._platform.getWorkspaceFolders();
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }
        const claudinePath = path.join(workspaceFolders[0], '.claudine');
        const iconsPath = path.join(claudinePath, 'icons');
        const iconPath = path.join(iconsPath, `${conversationId}.png`);
        try {
            await this._platform.ensureDirectory(iconsPath);
        }
        catch {
            // Directory might already exist
        }
        const buffer = Buffer.from(iconData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        await this._platform.writeFile(iconPath, buffer);
        return iconPath;
    }
    async saveDrafts(drafts) {
        const workspaceFolders = this._platform.getWorkspaceFolders();
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }
        const claudinePath = path.join(workspaceFolders[0], '.claudine');
        const draftsPath = path.join(claudinePath, 'drafts.json');
        try {
            await this._platform.ensureDirectory(claudinePath);
        }
        catch {
            // Directory might already exist
        }
        await this._platform.writeFile(draftsPath, JSON.stringify(drafts, null, 2));
    }
    async loadDrafts() {
        const workspaceFolders = this._platform.getWorkspaceFolders();
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }
        const draftsPath = path.join(workspaceFolders[0], '.claudine', 'drafts.json');
        try {
            const content = await this._platform.readFile(draftsPath);
            return JSON.parse(content.toString());
        }
        catch {
            return [];
        }
    }
    getWorkspaceIconPath(conversationId) {
        const workspaceFolders = this._platform.getWorkspaceFolders();
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }
        return path.join(workspaceFolders[0], '.claudine', 'icons', `${conversationId}.png`);
    }
}
exports.StorageService = StorageService;
//# sourceMappingURL=StorageService.js.map