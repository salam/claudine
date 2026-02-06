import * as vscode from 'vscode';
import * as path from 'path';
import { Conversation } from '../types';

interface BoardState {
  conversations: Conversation[];
  lastUpdated: Date;
}

export class StorageService {
  private _globalStorageUri: vscode.Uri;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._globalStorageUri = _context.globalStorageUri;
    this.ensureStorageExists();
  }

  private async ensureStorageExists() {
    try {
      await vscode.workspace.fs.createDirectory(this._globalStorageUri);
    } catch {
      // Directory might already exist
    }
  }

  // Global storage methods (for extension-wide data)

  public async saveGlobalSetting<T>(key: string, value: T): Promise<void> {
    await this._context.globalState.update(key, value);
  }

  public getGlobalSetting<T>(key: string, defaultValue: T): T {
    return this._context.globalState.get(key, defaultValue);
  }

  public async saveIcon(conversationId: string, iconData: string): Promise<void> {
    const iconPath = vscode.Uri.joinPath(
      this._globalStorageUri,
      'icons',
      `${conversationId}.png`
    );

    try {
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.joinPath(this._globalStorageUri, 'icons')
      );
    } catch {
      // Directory might already exist
    }

    // Convert base64 to buffer and save
    const buffer = Buffer.from(iconData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    await vscode.workspace.fs.writeFile(iconPath, buffer);
  }

  public async getIconPath(conversationId: string): Promise<string | undefined> {
    const iconPath = vscode.Uri.joinPath(
      this._globalStorageUri,
      'icons',
      `${conversationId}.png`
    );

    try {
      await vscode.workspace.fs.stat(iconPath);
      return iconPath.fsPath;
    } catch {
      return undefined;
    }
  }

  // Workspace storage methods (for project-specific data)

  public async saveBoardState(state: BoardState): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      // Fall back to global storage
      await this.saveGlobalSetting('boardState', state);
      return;
    }

    const claudinePath = vscode.Uri.joinPath(workspaceFolder.uri, '.claudine');
    const statePath = vscode.Uri.joinPath(claudinePath, 'state.json');

    try {
      await vscode.workspace.fs.createDirectory(claudinePath);
    } catch {
      // Directory might already exist
    }

    const stateJson = JSON.stringify(state, null, 2);
    await vscode.workspace.fs.writeFile(statePath, Buffer.from(stateJson));
  }

  public async loadBoardState(): Promise<BoardState | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (workspaceFolder) {
      const statePath = vscode.Uri.joinPath(
        workspaceFolder.uri,
        '.claudine',
        'state.json'
      );

      try {
        const content = await vscode.workspace.fs.readFile(statePath);
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
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return undefined;

    const claudinePath = vscode.Uri.joinPath(workspaceFolder.uri, '.claudine');
    const iconsPath = vscode.Uri.joinPath(claudinePath, 'icons');
    const iconPath = vscode.Uri.joinPath(iconsPath, `${conversationId}.png`);

    try {
      await vscode.workspace.fs.createDirectory(iconsPath);
    } catch {
      // Directory might already exist
    }

    const buffer = Buffer.from(iconData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    await vscode.workspace.fs.writeFile(iconPath, buffer);

    return iconPath.fsPath;
  }

  public async saveDrafts(drafts: Array<{ id: string; title: string }>): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const claudinePath = vscode.Uri.joinPath(workspaceFolder.uri, '.claudine');
    const draftsPath = vscode.Uri.joinPath(claudinePath, 'drafts.json');

    try {
      await vscode.workspace.fs.createDirectory(claudinePath);
    } catch {
      // Directory might already exist
    }

    await vscode.workspace.fs.writeFile(draftsPath, Buffer.from(JSON.stringify(drafts, null, 2)));
  }

  public async loadDrafts(): Promise<Array<{ id: string; title: string }>> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return [];

    const draftsPath = vscode.Uri.joinPath(workspaceFolder.uri, '.claudine', 'drafts.json');

    try {
      const content = await vscode.workspace.fs.readFile(draftsPath);
      return JSON.parse(content.toString());
    } catch {
      return [];
    }
  }

  public getWorkspaceIconPath(conversationId: string): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return undefined;

    return path.join(
      workspaceFolder.uri.fsPath,
      '.claudine',
      'icons',
      `${conversationId}.png`
    );
  }
}
