import * as path from 'path';
import { IPlatformAdapter } from '../platform/IPlatformAdapter';
import { Conversation } from '../types';

interface BoardState {
  conversations: Conversation[];
  lastUpdated: Date;
}

export class StorageService {
  private _globalStoragePath: string;

  constructor(private readonly _platform: IPlatformAdapter) {
    this._globalStoragePath = _platform.getGlobalStoragePath();
    this.ensureStorageExists();
  }

  private async ensureStorageExists() {
    try {
      await this._platform.ensureDirectory(this._globalStoragePath);
    } catch {
      // Directory might already exist
    }
  }

  // Global storage methods (for extension-wide data)

  public async saveGlobalSetting<T>(key: string, value: T): Promise<void> {
    await this._platform.setGlobalState(key, value);
  }

  public getGlobalSetting<T>(key: string, defaultValue: T): T {
    return this._platform.getGlobalState(key, defaultValue);
  }

  public async saveIcon(conversationId: string, iconData: string): Promise<void> {
    const iconsDir = path.join(this._globalStoragePath, 'icons');
    const iconPath = path.join(iconsDir, `${conversationId}.png`);

    try {
      await this._platform.ensureDirectory(iconsDir);
    } catch {
      // Directory might already exist
    }

    // Convert base64 to buffer and save
    const buffer = Buffer.from(iconData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    await this._platform.writeFile(iconPath, buffer);
  }

  public async getIconPath(conversationId: string): Promise<string | undefined> {
    const iconPath = path.join(this._globalStoragePath, 'icons', `${conversationId}.png`);

    const stats = await this._platform.stat(iconPath);
    if (stats) {
      return iconPath;
    }
    return undefined;
  }

  // Workspace storage methods (for project-specific data)

  public async saveBoardState(state: BoardState): Promise<void> {
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
    } catch {
      // Directory might already exist
    }

    const stateJson = JSON.stringify(state, null, 2);
    await this._platform.writeFile(statePath, stateJson);
  }

  public async loadBoardState(): Promise<BoardState | null> {
    const workspaceFolders = this._platform.getWorkspaceFolders();

    if (workspaceFolders && workspaceFolders.length > 0) {
      const statePath = path.join(workspaceFolders[0], '.claudine', 'state.json');

      try {
        const content = await this._platform.readFile(statePath);
        return JSON.parse(content.toString());
      } catch {
        // File doesn't exist
      }
    }

    // Fall back to global storage
    return this.getGlobalSetting<BoardState | null>('boardState', null);
  }

  public async saveWorkspaceIcon(
    conversationId: string,
    iconData: string
  ): Promise<string | undefined> {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) { return undefined; }

    const claudinePath = path.join(workspaceFolders[0], '.claudine');
    const iconsPath = path.join(claudinePath, 'icons');
    const iconPath = path.join(iconsPath, `${conversationId}.png`);

    try {
      await this._platform.ensureDirectory(iconsPath);
    } catch {
      // Directory might already exist
    }

    const buffer = Buffer.from(iconData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    await this._platform.writeFile(iconPath, buffer);

    return iconPath;
  }

  public async saveDrafts(drafts: Array<{ id: string; title: string }>): Promise<void> {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) { return; }

    const claudinePath = path.join(workspaceFolders[0], '.claudine');
    const draftsPath = path.join(claudinePath, 'drafts.json');

    try {
      await this._platform.ensureDirectory(claudinePath);
    } catch {
      // Directory might already exist
    }

    await this._platform.writeFile(draftsPath, JSON.stringify(drafts, null, 2));
  }

  public async loadDrafts(): Promise<Array<{ id: string; title: string }>> {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) { return []; }

    const draftsPath = path.join(workspaceFolders[0], '.claudine', 'drafts.json');

    try {
      const content = await this._platform.readFile(draftsPath);
      return JSON.parse(content.toString());
    } catch {
      return [];
    }
  }

  public getWorkspaceIconPath(conversationId: string): string | undefined {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) { return undefined; }

    return path.join(
      workspaceFolders[0],
      '.claudine',
      'icons',
      `${conversationId}.png`
    );
  }
}
