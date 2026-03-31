import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { IPlatformAdapter, Disposable } from '../platform/IPlatformAdapter';
import { ConversationParser } from './ConversationParser';
import { StateManager } from '../services/StateManager';
import { SummaryService } from '../services/SummaryService';
import { ImageGenerator } from '../services/ImageGenerator';
import { Conversation, ProjectManifestEntry } from '../types';
import { IConversationProvider } from './IConversationProvider';
import { MAX_IMAGE_FILE_SIZE_BYTES } from '../constants';

/** Patterns that identify OS temp/system directories to auto-exclude in standalone mode. */
const EXCLUDED_PATH_PATTERNS = [
  /\/var\/folders\//i,       // macOS temp (also /private/var/folders/)
  /\/tmp\//,                // Unix /tmp
  /\\Temp\\/i,              // Windows %TEMP%
  /\/\.Trash\//i,            // macOS Trash
  /\\Recycle\.Bin\\/i,      // Windows Recycle Bin
];

export class ClaudeCodeWatcher implements IConversationProvider {
  readonly id = 'claude-code';
  readonly displayName = 'Claude Code';

  private _watcherDisposable: Disposable | undefined;
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

  constructor(
    private readonly _stateManager: StateManager,
    private readonly _platform: IPlatformAdapter,
    imageGenerator?: ImageGenerator,
    summaryService?: SummaryService
  ) {
    this._parser = new ConversationParser();
    this._summaryService = summaryService ?? new SummaryService();
    this._imageGenerator = imageGenerator;
    if (!summaryService) this._summaryService.init(_platform);
    this._claudePath = this.getClaudePath();

    // When running in Extension Development Host, exclude the extension's own
    // workspace so that development conversations don't appear in the EDH board.
    if (_platform.isDevelopmentMode()) {
      this._excludedWorkspacePath = _platform.getExtensionPath();
      if (this._excludedWorkspacePath) {
        console.log(`Claudine: Development mode — excluding extension workspace: ${this._excludedWorkspacePath}`);
      }
    }
  }

  /** Resolved path to the Claude Code data directory. */
  public get claudePath(): string {
    return this._claudePath;
  }

  /** Alias for IConversationProvider. */
  public get dataPath(): string {
    return this._claudePath;
  }

  /** Whether the file system watcher is active. */
  public get isWatching(): boolean {
    return this._watcherDisposable !== undefined;
  }

  public getWorkspacePaths(): string[] {
    return this._platform.getWorkspaceFolders() ?? [];
  }

  /** Number of files held in the incremental parse cache. */
  public get parseCacheSize(): number {
    return this._parser.cacheSize;
  }

  private getClaudePath(): string {
    const configPath = this._platform.getConfig<string>('claudeCodePath', '~/.claude');
    return path.normalize(configPath.replace('~', os.homedir()));
  }

  public startWatching() {
    this.setupFileWatcher();
    // Initial scan
    this.refresh();
  }

  /** Set up the file system watcher without triggering an initial scan. */
  public setupFileWatcher() {
    // Watch the Claude Code projects directory for JSONL changes
    const projectsPath = path.join(this._claudePath, 'projects');

    try {
      this._watcherDisposable = this._platform.watchFiles(projectsPath, '**/*.jsonl', {
        onCreate: (filePath) => this.onFileChanged(filePath),
        onChange: (filePath) => this.onFileChanged(filePath),
        onDelete: (filePath) => this.onFileDeleted(filePath)
      });

      console.log(`Claudine: Watching ${projectsPath} for changes`);
    } catch (error) {
      console.error('Claudine: Error setting up file watcher', error);
    }
  }

  public stopWatching() {
    if (this._watcherDisposable) {
      this._watcherDisposable.dispose();
      this._watcherDisposable = undefined;
    }
  }

  public async refresh(): Promise<Conversation[]> {
    try {
      const conversations = await this.scanForConversations();
      console.log(`Claudine: Found ${conversations.length} conversations`);
      this._stateManager.setConversations(conversations, 'claude-code');

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

      return conversations;
    } catch (error) {
      console.error('Claudine: Error refreshing conversations', error);
      return [];
    }
  }

  private async onFileChanged(filePath: string) {
    // Only process top-level JSONL files (not subagent files)
    if (this.isSubagentFile(filePath)) return;

    // Skip files from the extension's own workspace when in EDH
    if (this._excludedWorkspacePath && this.isFromExcludedWorkspace(filePath)) return;

    // BUG2: Only process files that belong to the current workspace's project
    // directory. The file watcher covers all projects, so we must filter here.
    if (!this.isFromCurrentWorkspace(filePath)) return;

    try {
      const conversation = await this._parser.parseFile(filePath);
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
      console.error(`Claudine: Error parsing file ${filePath}`, error);
    }
  }

  private onFileDeleted(filePath: string) {
    this._parser.clearCache(filePath);
    const conversationId = path.basename(filePath, '.jsonl');
    if (conversationId) {
      this._stateManager.removeConversation(conversationId);
    }
  }

  private isSubagentFile(filePath: string): boolean {
    return filePath.includes(`${path.sep}subagents${path.sep}`);
  }

  private isFromExcludedWorkspace(filePath: string): boolean {
    if (!this._excludedWorkspacePath) return false;
    const lowercase = process.platform === 'win32' || process.platform === 'darwin';
    const encodedExcluded = this.encodeWorkspacePath(this._excludedWorkspacePath, lowercase);
    const normalizedFilePath = this.normalizePath(filePath, lowercase);
    return normalizedFilePath.includes(`/${encodedExcluded}/`);
  }

  /** BUG2: Check whether a JSONL file belongs to one of the effective workspace's
   *  project directories. When no workspace is open, allow all files (fallback). */
  private isFromCurrentWorkspace(filePath: string): boolean {
    const effectiveFolders = this.getEffectiveWorkspaceFolders();
    if (!effectiveFolders || effectiveFolders.length === 0) return true; // fallback: no workspace → allow all

    for (const folder of effectiveFolders) {
      if (this._excludedWorkspacePath && folder === this._excludedWorkspacePath) continue;
      const lowercase = process.platform === 'win32' || process.platform === 'darwin';
      const encodedPath = this.encodeWorkspacePath(folder, lowercase);
      const normalizedFilePath = this.normalizePath(filePath, lowercase);
      if (normalizedFilePath.includes(`/${encodedPath}/`)) return true;
    }
    return false;
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

  /**
   * Resolve the effective workspace folders based on the monitoredWorkspace setting.
   * Returns null when auto mode has no workspace open (scan-all fallback).
   */
  private getEffectiveWorkspaceFolders(): string[] | null {
    const monitored = this._platform.getConfig<{ mode: string; path?: string; paths?: string[] }>(
      'monitoredWorkspace', { mode: 'auto' }
    );

    if (monitored.mode === 'single' && monitored.path) {
      return [monitored.path];
    }
    if (monitored.mode === 'multi' && monitored.paths && monitored.paths.length > 0) {
      return monitored.paths;
    }
    // Auto mode: delegate to platform
    return this._platform.getWorkspaceFolders();
  }

  private getProjectDirsToScan(projectsPath: string, ignoreCase?: boolean): string[] {
    const dirs: string[] = [];
    ignoreCase = ignoreCase ?? (process.platform === 'win32' || process.platform === 'darwin');
    try {
      if (!fs.existsSync(projectsPath)) {
        console.warn(`Claudine: Projects path does not exist: ${projectsPath}`);
        return dirs;
      }

      const effectiveFolders = this.getEffectiveWorkspaceFolders();

      if (effectiveFolders && effectiveFolders.length > 0) {
        // Only scan project directories that match the effective folders
        for (const folder of effectiveFolders) {
          // Skip the extension's own workspace when running in EDH
          if (this._excludedWorkspacePath && folder === this._excludedWorkspacePath) {
            console.log(`Claudine: Skipping extension dev workspace: ${folder}`);
            continue;
          }

          const encodedPath = this.encodeWorkspacePath(folder, ignoreCase);
          const projectDir = path.join(projectsPath, encodedPath);

          console.log(`Claudine: Workspace "${folder}" → encoded "${encodedPath}"`);

          if (fs.existsSync(projectDir)) {
            dirs.push(projectDir);
            console.log(`Claudine: Matched project dir: ${projectDir}`);
          } else {
            console.warn(`Claudine: No project dir found for workspace: ${projectDir}`);
          }
        }
      } else {
        // No workspace open & auto mode — scan all projects as fallback
        console.log('Claudine: No workspace folders, scanning all projects');
        const entries = fs.readdirSync(projectsPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const exclusion = ClaudeCodeWatcher.isExcludedProjectDir(entry.name);
          if (exclusion.excluded) {
            console.log(`Claudine: Auto-excluding project dir "${entry.name}" — ${exclusion.reason}`);
            continue;
          }
          dirs.push(path.join(projectsPath, entry.name));
        }
      }
    } catch (error) {
      console.error('Claudine: Error listing project directories', error);
    }

    return dirs;
  }

  /**
   * Normalize fs path to use forward-slash as separator, and optionally be 
   * lowercase e.g. for macOS or Windows
   */
  private normalizePath(p: string, lowercase: boolean = false): string {
    let npath = path.normalize(p);
    npath = npath.replace(/\\/g, '/');
    
    if (lowercase) npath = npath.toLowerCase();

    return npath;
  }

  /**
   * Encode a workspace path the same way Claude Code does; optionally lowercase
   * /Users/matthias/Development/foo → -users-matthias-development-foo
   * /Users/matthias/Development/molts.club → -Users-matthias-Development-molts-club
   * C:\Users\foo\project → c--users-foo-project (BUG20: Windows backslash + colon)
   */
  private encodeWorkspacePath(workspacePath: string, lowercase: boolean = false): string {
    const normalizedWorkspacePath = this.normalizePath(workspacePath, lowercase);
    return normalizedWorkspacePath.replace(/[/.:_]/g, '-');
  }

  // ── Project discovery & progressive scanning (standalone) ─────────

  /**
   * Decode an encoded project directory name back to a path approximation.
   * e.g. "-Users-matthias-Development-foo" → "/Users/matthias/Development/foo"
   */
  public static decodeProjectDirName(encodedName: string): string {
    return '/' + encodedName.replace(/^-/, '').replace(/-/g, '/');
  }

  /**
   * Check whether an encoded project directory name corresponds to an OS
   * temp/system directory that should be auto-excluded from scanning.
   */
  public static isExcludedProjectDir(encodedDirName: string): { excluded: boolean; reason?: string } {
    const decoded = ClaudeCodeWatcher.decodeProjectDirName(encodedDirName);
    for (const pattern of EXCLUDED_PATH_PATTERNS) {
      if (pattern.test(decoded)) {
        return { excluded: true, reason: `Temp/system path (${pattern.source})` };
      }
    }
    return { excluded: false };
  }

  /**
   * Quickly enumerate all project directories and count their .jsonl files
   * without parsing any of them. Returns a manifest suitable for the UI.
   */
  public discoverProjects(): ProjectManifestEntry[] {
    const projectsPath = path.join(this._claudePath, 'projects');
    if (!fs.existsSync(projectsPath)) return [];

    const entries = fs.readdirSync(projectsPath, { withFileTypes: true });
    const manifest: ProjectManifestEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const exclusion = ClaudeCodeWatcher.isExcludedProjectDir(entry.name);
      const projectDir = path.join(projectsPath, entry.name);

      let fileCount = 0;
      try {
        const files = fs.readdirSync(projectDir, { withFileTypes: true });
        fileCount = files.filter(f => f.isFile() && f.name.endsWith('.jsonl')).length;
      } catch {
        // Skip unreadable dirs
      }

      if (fileCount === 0) continue;

      const decoded = ClaudeCodeWatcher.decodeProjectDirName(entry.name);
      const segments = decoded.split('/').filter(Boolean);
      const name = segments[segments.length - 1] || entry.name;

      manifest.push({
        encodedPath: entry.name,
        decodedPath: decoded,
        name,
        fileCount,
        enabled: !exclusion.excluded,
        autoExcluded: exclusion.excluded,
        excludeReason: exclusion.reason,
      });
    }

    return manifest;
  }

  /**
   * Scan enabled projects one at a time, emitting results after each project.
   * Yields to the event loop periodically to keep the server responsive.
   */
  public async scanProjectsProgressively(
    enabledProjects: ProjectManifestEntry[],
    onProgress: (progress: {
      scannedProjects: number;
      totalProjects: number;
      scannedFiles: number;
      totalFiles: number;
      currentProject: string;
    }) => void,
    onProjectScanned: (projectPath: string, conversations: Conversation[]) => void
  ): Promise<Conversation[]> {
    const projectsPath = path.join(this._claudePath, 'projects');
    const allConversations: Conversation[] = [];
    const totalProjects = enabledProjects.length;
    const totalFiles = enabledProjects.reduce((sum, p) => sum + p.fileCount, 0);
    let scannedProjects = 0;
    let scannedFiles = 0;

    for (const project of enabledProjects) {
      const projectDir = path.join(projectsPath, project.encodedPath);
      const projectConvs: Conversation[] = [];

      onProgress({ scannedProjects, totalProjects, scannedFiles, totalFiles, currentProject: project.name });

      try {
        const entries = fs.readdirSync(projectDir, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
          const filePath = path.join(projectDir, entry.name);

          try {
            const conversation = await this._parser.parseFile(filePath);
            if (conversation) {
              projectConvs.push(conversation);
            }
          } catch (error) {
            console.error(`Claudine: Error parsing ${filePath}`, error);
          }

          scannedFiles++;

          // Yield to the event loop every 50 files to keep the server responsive
          if (scannedFiles % 50 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      } catch (error) {
        console.error(`Claudine: Error reading directory ${projectDir}`, error);
      }

      // Apply cached summaries
      for (const conv of projectConvs) {
        this._summaryService.applyCached(conv);
      }

      allConversations.push(...projectConvs);
      scannedProjects++;

      onProjectScanned(project.decodedPath || project.name, projectConvs);
    }

    // Merge with saved board state
    await this.mergeSavedState(allConversations);

    onProgress({ scannedProjects: totalProjects, totalProjects, scannedFiles: totalFiles, totalFiles, currentProject: '' });

    return allConversations;
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
      if (stats.size > MAX_IMAGE_FILE_SIZE_BYTES) return undefined;

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
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders) return;

    for (const folder of workspaceFolders) {
      const statePath = path.join(folder, '.claudine', 'state.json');

      try {
        if (!fs.existsSync(statePath)) continue;

        const stateData = fs.readFileSync(statePath, 'utf-8');
        const state = JSON.parse(stateData);

        if (state.conversations) {
          for (const saved of state.conversations) {
            const existing = conversations.find(c => c.id === saved.id);
            if (existing) {
              // Preserve manual status overrides
              if (saved.status === 'done' || saved.status === 'cancelled' || saved.status === 'archived') {
                existing.status = saved.status;
              }
              // Preserve previousStatus for active→inactive transitions
              if (saved.previousStatus) {
                existing.previousStatus = saved.previousStatus;
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
