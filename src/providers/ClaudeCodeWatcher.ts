import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ConversationParser } from './ConversationParser';
import { StateManager } from '../services/StateManager';
import { SummaryService } from '../services/SummaryService';
import { ImageGenerator } from '../services/ImageGenerator';
import { Conversation } from '../types';

export class ClaudeCodeWatcher {
  private _watcher: vscode.FileSystemWatcher | undefined;
  private _parser: ConversationParser;
  private _summaryService: SummaryService;
  private _imageGenerator: ImageGenerator | undefined;
  private _claudePath: string;
  private _excludedWorkspacePath: string | undefined;
  private _iconPending = new Set<string>();

  /** Clear the pending-icon set so regeneration can pick up all conversations. */
  public clearPendingIcons() {
    this._iconPending.clear();
  }

  constructor(private readonly _stateManager: StateManager, context?: vscode.ExtensionContext, imageGenerator?: ImageGenerator) {
    this._parser = new ConversationParser();
    this._summaryService = new SummaryService();
    this._imageGenerator = imageGenerator;
    if (context) this._summaryService.init(context);
    this._claudePath = this.getClaudePath();

    // When running in Extension Development Host, exclude the extension's own
    // workspace so that development conversations don't appear in the EDH board.
    if (context?.extensionMode === vscode.ExtensionMode.Development) {
      this._excludedWorkspacePath = context.extensionUri.fsPath;
      console.log(`Claudine: Development mode — excluding extension workspace: ${this._excludedWorkspacePath}`);
    }
  }

  private getClaudePath(): string {
    const config = vscode.workspace.getConfiguration('claudine');
    const configPath = config.get<string>('claudeCodePath', '~/.claude');
    return configPath.replace('~', os.homedir());
  }

  public startWatching() {
    // Watch the Claude Code projects directory for JSONL changes
    const projectsPath = path.join(this._claudePath, 'projects');

    try {
      const watchPattern = new vscode.RelativePattern(projectsPath, '**/*.jsonl');
      this._watcher = vscode.workspace.createFileSystemWatcher(watchPattern);

      this._watcher.onDidCreate((uri) => this.onFileChanged(uri));
      this._watcher.onDidChange((uri) => this.onFileChanged(uri));
      this._watcher.onDidDelete((uri) => this.onFileDeleted(uri));

      console.log(`Claudine: Watching ${projectsPath} for changes`);
    } catch (error) {
      console.error('Claudine: Error setting up file watcher', error);
    }

    // Initial scan
    this.refresh();
  }

  public stopWatching() {
    if (this._watcher) {
      this._watcher.dispose();
      this._watcher = undefined;
    }
  }

  public async refresh() {
    try {
      const conversations = await this.scanForConversations();
      console.log(`Claudine: Found ${conversations.length} conversations`);
      this._stateManager.setConversations(conversations);

      // Kick off async summarization for uncached conversations (non-blocking)
      this._summaryService.summarizeUncached(conversations, (id, summary) => {
        const existing = this._stateManager.getConversation(id);
        if (existing) {
          this._stateManager.updateConversation({
            ...existing,
            originalTitle: existing.originalTitle || existing.title,
            originalDescription: existing.originalDescription || existing.description,
            title: summary.title,
            description: summary.description,
            lastMessage: summary.lastMessage
          });
        }
      });

      // Kick off async icon generation for conversations without icons
      this.generateIcons(conversations);
    } catch (error) {
      console.error('Claudine: Error refreshing conversations', error);
    }
  }

  private async onFileChanged(uri: vscode.Uri) {
    // Only process top-level JSONL files (not subagent files)
    if (this.isSubagentFile(uri.fsPath)) return;

    // Skip files from the extension's own workspace when in EDH
    if (this._excludedWorkspacePath && this.isFromExcludedWorkspace(uri.fsPath)) return;

    try {
      const conversation = await this._parser.parseFile(uri.fsPath);
      if (conversation) {
        this._summaryService.applyCached(conversation);
        this._stateManager.updateConversation(conversation);

        // Kick off async summarization if not cached
        if (!this._summaryService.hasCached(conversation.id)) {
          this._summaryService.summarizeUncached([conversation], (id, summary) => {
            const existing = this._stateManager.getConversation(id);
            if (existing) {
              this._stateManager.updateConversation({
                ...existing,
                originalTitle: existing.originalTitle || existing.title,
                originalDescription: existing.originalDescription || existing.description,
                title: summary.title,
                description: summary.description,
                lastMessage: summary.lastMessage
              });
            }
          });
        }
      }
    } catch (error) {
      console.error(`Claudine: Error parsing file ${uri.fsPath}`, error);
    }
  }

  private onFileDeleted(uri: vscode.Uri) {
    const conversationId = path.basename(uri.fsPath, '.jsonl');
    if (conversationId) {
      this._stateManager.removeConversation(conversationId);
    }
  }

  private isSubagentFile(filePath: string): boolean {
    return filePath.includes(`${path.sep}subagents${path.sep}`);
  }

  private isFromExcludedWorkspace(filePath: string): boolean {
    if (!this._excludedWorkspacePath) return false;
    const encodedExcluded = this.encodeWorkspacePath(this._excludedWorkspacePath);
    return filePath.includes(`${path.sep}${encodedExcluded}${path.sep}`);
  }

  private async scanForConversations(): Promise<Conversation[]> {
    const conversations: Conversation[] = [];
    const projectsPath = path.join(this._claudePath, 'projects');

    // Determine which project directories to scan
    const projectDirs = this.getProjectDirsToScan(projectsPath);
    console.log(`Claudine: Scanning ${projectDirs.length} project directories`);

    for (const projectDir of projectDirs) {
      try {
        const entries = fs.readdirSync(projectDir, { withFileTypes: true });

        for (const entry of entries) {
          // Only process top-level .jsonl files (session conversations)
          if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;

          const filePath = path.join(projectDir, entry.name);

          try {
            const conversation = await this._parser.parseFile(filePath);
            if (conversation) {
              conversations.push(conversation);
            }
          } catch (error) {
            console.error(`Claudine: Error parsing ${filePath}`, error);
          }
        }
      } catch (error) {
        console.error(`Claudine: Error reading directory ${projectDir}`, error);
      }
    }

    // Apply cached summaries (instant, no API calls)
    for (const conv of conversations) {
      this._summaryService.applyCached(conv);
    }

    // Merge with saved board state (for manual overrides like done/cancelled)
    await this.mergeSavedState(conversations);

    return conversations;
  }

  private getProjectDirsToScan(projectsPath: string): string[] {
    const dirs: string[] = [];

    try {
      if (!fs.existsSync(projectsPath)) {
        console.warn(`Claudine: Projects path does not exist: ${projectsPath}`);
        return dirs;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (workspaceFolders && workspaceFolders.length > 0) {
        // Only scan project directories that match the current workspace
        for (const folder of workspaceFolders) {
          // Skip the extension's own workspace when running in EDH
          if (this._excludedWorkspacePath && folder.uri.fsPath === this._excludedWorkspacePath) {
            console.log(`Claudine: Skipping extension dev workspace: ${folder.uri.fsPath}`);
            continue;
          }

          const encodedPath = this.encodeWorkspacePath(folder.uri.fsPath);
          const projectDir = path.join(projectsPath, encodedPath);

          console.log(`Claudine: Workspace "${folder.uri.fsPath}" → encoded "${encodedPath}"`);

          if (fs.existsSync(projectDir)) {
            dirs.push(projectDir);
            console.log(`Claudine: Matched project dir: ${projectDir}`);
          } else {
            console.warn(`Claudine: No project dir found for workspace: ${projectDir}`);
          }
        }
      } else {
        // No workspace open — scan all projects as fallback
        console.log('Claudine: No workspace folders, scanning all projects');
        const entries = fs.readdirSync(projectsPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            dirs.push(path.join(projectsPath, entry.name));
          }
        }
      }
    } catch (error) {
      console.error('Claudine: Error listing project directories', error);
    }

    return dirs;
  }

  /**
   * Encode a workspace path the same way Claude Code does.
   * /Users/matthias/Development/foo → -Users-matthias-Development-foo
   */
  private encodeWorkspacePath(workspacePath: string): string {
    return workspacePath.replace(/\//g, '-');
  }

  /**
   * Search JSONL conversation files for a query string.
   * Returns conversation IDs that contain the query (case-insensitive).
   */
  public searchConversations(query: string): string[] {
    if (!query.trim()) return [];

    const q = query.toLowerCase();
    const matchingIds: string[] = [];
    const projectsPath = path.join(this._claudePath, 'projects');
    const projectDirs = this.getProjectDirsToScan(projectsPath);

    for (const projectDir of projectDirs) {
      try {
        const entries = fs.readdirSync(projectDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
          const filePath = path.join(projectDir, entry.name);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (content.toLowerCase().includes(q)) {
              matchingIds.push(path.basename(entry.name, '.jsonl'));
            }
          } catch {
            // skip unreadable files
          }
        }
      } catch {
        // skip unreadable dirs
      }
    }

    return matchingIds;
  }

  /**
   * Generate icons for conversations that don't have one yet.
   * Checks for referenced images first, then falls back to AI generation.
   */
  private async generateIcons(conversations: Conversation[]): Promise<void> {
    const needsIcon = conversations.filter(c => !c.icon && !this._iconPending.has(c.id));
    if (needsIcon.length === 0) return;

    for (const conv of needsIcon) {
      this._iconPending.add(conv.id);

      try {
        let icon: string | undefined;

        // 1. Try using a referenced image from the conversation
        if (conv.referencedImage) {
          icon = this.readImageAsDataUri(conv.referencedImage);
        }

        // 2. Fall back to AI-generated icon
        if (!icon && this._imageGenerator) {
          icon = await this._imageGenerator.generateIcon(conv.id, conv.title, conv.description);
        }

        // 3. Fall back to deterministic placeholder pattern
        if (!icon && this._imageGenerator) {
          icon = this._imageGenerator.generatePlaceholderIcon(conv.id, conv.category);
        }

        if (icon) {
          this._stateManager.setConversationIcon(conv.id, icon);
        }
      } catch (error) {
        console.error(`Claudine: Error generating icon for ${conv.id}`, error);
      } finally {
        this._iconPending.delete(conv.id);
      }
    }
  }

  /**
   * Read an image file and return it as a data URI.
   * Returns undefined if the file doesn't exist or is too large (>512KB).
   */
  private readImageAsDataUri(filePath: string): string | undefined {
    try {
      if (!fs.existsSync(filePath)) return undefined;

      const stats = fs.statSync(filePath);
      if (stats.size > 512 * 1024) return undefined; // skip files > 512KB

      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mimeMap: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml'
      };
      const mime = mimeMap[ext] || 'image/png';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {
      return undefined;
    }
  }

  private async mergeSavedState(conversations: Conversation[]) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    for (const folder of workspaceFolders) {
      const statePath = path.join(folder.uri.fsPath, '.claudine', 'state.json');

      try {
        if (!fs.existsSync(statePath)) continue;

        const stateData = fs.readFileSync(statePath, 'utf-8');
        const state = JSON.parse(stateData);

        if (state.conversations) {
          for (const saved of state.conversations) {
            const existing = conversations.find(c => c.id === saved.id);
            if (existing) {
              // Preserve manual status overrides
              if (saved.status === 'done' || saved.status === 'cancelled') {
                existing.status = saved.status;
              }
              // Preserve generated icon
              if (saved.icon) {
                existing.icon = saved.icon;
              }
            }
          }
        }
      } catch {
        // .claudine state doesn't exist yet
      }
    }
  }
}
