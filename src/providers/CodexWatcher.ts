import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { IPlatformAdapter, Disposable } from '../platform/IPlatformAdapter';
import { CodexSessionParser } from './CodexSessionParser';
import { StateManager } from '../services/StateManager';
import { SummaryService } from '../services/SummaryService';
import { ImageGenerator } from '../services/ImageGenerator';
import { Conversation, ProjectManifestEntry } from '../types';
import { IConversationProvider } from './IConversationProvider';

/**
 * Conversation provider for OpenAI Codex sessions.
 *
 * Codex stores sessions under `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<id>.jsonl`.
 * Unlike Claude Code (project-based), Codex organises by date and embeds the
 * workspace path inside each file's `session_meta` payload.
 */
export class CodexWatcher implements IConversationProvider {
  readonly id = 'codex';
  readonly displayName = 'Codex';

  private _watcherDisposable: Disposable | undefined;
  private _parser: CodexSessionParser;
  private _summaryService: SummaryService | undefined;
  private _imageGenerator: ImageGenerator | undefined;
  private _iconPending = new Set<string>();
  private _codexPath: string;

  constructor(
    private readonly _stateManager: StateManager,
    private readonly _platform: IPlatformAdapter,
    summaryService?: SummaryService,
    imageGenerator?: ImageGenerator
  ) {
    this._parser = new CodexSessionParser();
    this._summaryService = summaryService;
    this._imageGenerator = imageGenerator;
    this._codexPath = this.getCodexPath();
  }

  /** Resolved path to the Codex data directory. */
  public get dataPath(): string {
    return this._codexPath;
  }

  public get isWatching(): boolean {
    return this._watcherDisposable !== undefined;
  }

  public get parseCacheSize(): number {
    return this._parser.cacheSize;
  }

  /**
   * Check whether Codex sessions are available on this machine.
   * Returns true if the sessions directory exists.
   */
  public static isAvailable(platform: IPlatformAdapter): boolean {
    const configPath = platform.getConfig<string>('codexPath', '~/.codex');
    const resolved = path.normalize(configPath.replace('~', os.homedir()));
    const sessionsDir = path.join(resolved, 'sessions');
    return fs.existsSync(sessionsDir);
  }

  private getCodexPath(): string {
    const configPath = this._platform.getConfig<string>('codexPath', '~/.codex');
    return path.normalize(configPath.replace('~', os.homedir()));
  }

  private get sessionsPath(): string {
    return path.join(this._codexPath, 'sessions');
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  public startWatching() {
    this.setupFileWatcher();
    this.refresh();
  }

  public setupFileWatcher() {
    try {
      this._watcherDisposable = this._platform.watchFiles(this.sessionsPath, '**/*.jsonl', {
        onCreate: (filePath) => this.onFileChanged(filePath),
        onChange: (filePath) => this.onFileChanged(filePath),
        onDelete: (filePath) => this.onFileDeleted(filePath),
      });
      console.log(`Claudine: Codex — watching ${this.sessionsPath} for changes`);
    } catch (error) {
      console.error('Claudine: Codex — error setting up file watcher', error);
    }
  }

  public stopWatching() {
    if (this._watcherDisposable) {
      this._watcherDisposable.dispose();
      this._watcherDisposable = undefined;
    }
  }

  // ── Scanning ─────────────────────────────────────────────────────

  public async refresh(): Promise<Conversation[]> {
    try {
      const conversations = await this.scanForConversations();
      console.log(`Claudine: Codex — found ${conversations.length} conversations`);

      // Apply cached summaries before setting state
      if (this._summaryService) {
        for (const conv of conversations) {
          this._summaryService.applyCached(conv);
        }
      }

      this._stateManager.setConversations(conversations, 'codex');

      // Kick off async summarization for uncached conversations (non-blocking)
      if (this._summaryService) {
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
      }

      // Kick off async icon generation for conversations without icons
      this.generateIcons(conversations);

      return conversations;
    } catch (error) {
      console.error('Claudine: Codex — error refreshing conversations', error);
      return [];
    }
  }

  private async scanForConversations(): Promise<Conversation[]> {
    const conversations: Conversation[] = [];
    const sessionsDir = this.sessionsPath;

    if (!fs.existsSync(sessionsDir)) return conversations;

    // Walk the date tree: sessions/YYYY/MM/DD/*.jsonl
    const workspaceFolders = this._platform.getWorkspaceFolders();

    for (const filePath of this.walkJsonlFiles(sessionsDir)) {
      try {
        const conv = await this._parser.parseFile(filePath);
        if (conv && this.matchesWorkspace(conv, workspaceFolders)) {
          conversations.push(conv);
        }
      } catch (error) {
        console.error(`Claudine: Codex — error parsing ${filePath}`, error);
      }
    }

    return conversations;
  }

  /** Recursively yield all .jsonl files under a directory. */
  private *walkJsonlFiles(dir: string): Generator<string> {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          yield* this.walkJsonlFiles(full);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          yield full;
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  /**
   * Filter conversations by workspace.
   * When workspace folders are known, only include conversations whose
   * `workspacePath` matches one of them. When no workspace is open, include all.
   */
  private matchesWorkspace(conv: Conversation, workspaceFolders: string[] | null): boolean {
    if (!workspaceFolders || workspaceFolders.length === 0) return true;
    if (!conv.workspacePath) return true; // No cwd in meta → show everywhere

    // Normalise trailing slashes for comparison
    const convPath = conv.workspacePath.replace(/\/+$/, '');
    return workspaceFolders.some(f => convPath === f.replace(/\/+$/, ''));
  }

  private async onFileChanged(filePath: string) {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    try {
      const conv = await this._parser.parseFile(filePath);
      if (conv && this.matchesWorkspace(conv, workspaceFolders)) {
        if (this._summaryService) {
          this._summaryService.applyCached(conv);
        }
        this._stateManager.updateConversation(conv);

        // Kick off async summarization if not cached
        if (this._summaryService && !this._summaryService.hasCached(conv.id)) {
          this._summaryService.summarizeUncached([conv], (id, summary) => {
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
      console.error(`Claudine: Codex — error parsing file ${filePath}`, error);
    }
  }

  private onFileDeleted(filePath: string) {
    this._parser.clearCache(filePath);
    // Codex IDs are prefixed — extract session ID from the filename
    const baseName = path.basename(filePath, '.jsonl');
    // The actual conversation ID is `codex-<sessionId>`, but we don't know
    // the session ID without parsing. Use a best-effort removal by scanning
    // existing conversations for this filePath.
    const all = this._stateManager.getConversations();
    const match = all.find(c => c.filePath === filePath);
    if (match) {
      this._stateManager.removeConversation(match.id);
    }
  }

  // ── Search ───────────────────────────────────────────────────────

  public searchConversations(query: string): string[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const matchingIds: string[] = [];
    const sessionsDir = this.sessionsPath;

    if (!fs.existsSync(sessionsDir)) return matchingIds;

    for (const filePath of this.walkJsonlFiles(sessionsDir)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.toLowerCase().includes(q)) {
          // We need the actual conversation ID (codex-<sessionId>), not the filename.
          // Quick parse for the session ID from the first line.
          const firstLine = content.split('\n')[0];
          try {
            const obj = JSON.parse(firstLine);
            // BUG16b: Standard format has payload.id, legacy has meta.id
            if (obj.payload?.id) {
              matchingIds.push(`codex-${obj.payload.id}`);
            } else if (obj.meta?.id) {
              matchingIds.push(`codex-${obj.meta.id}`);
            }
          } catch {
            // Can't extract ID, skip
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return matchingIds;
  }

  // ── Icons ────────────────────────────────────────────────────────

  public clearPendingIcons() {
    this._iconPending.clear();
  }

  /**
   * Generate icons for conversations that don't have one yet.
   * Falls back to AI generation, then to deterministic placeholder.
   */
  private async generateIcons(conversations: Conversation[]): Promise<void> {
    const needsIcon = conversations.filter(c => !c.icon && !this._iconPending.has(c.id));
    if (needsIcon.length === 0) return;

    for (const conv of needsIcon) {
      this._iconPending.add(conv.id);
      try {
        let icon: string | undefined;

        // 1. AI-generated icon
        if (!icon && this._imageGenerator) {
          icon = await this._imageGenerator.generateIcon(conv.id, conv.title, conv.description);
        }

        // 2. Deterministic placeholder pattern
        if (!icon && this._imageGenerator) {
          icon = this._imageGenerator.generatePlaceholderIcon(conv.id, conv.category);
        }

        if (icon) {
          this._stateManager.setConversationIcon(conv.id, icon);
        }
      } catch (error) {
        console.error(`Claudine: Codex — error generating icon for ${conv.id}`, error);
      } finally {
        this._iconPending.delete(conv.id);
      }
    }
  }

  // ── Project discovery (stub — not applicable for date-based layout) ──

  public discoverProjects(): ProjectManifestEntry[] {
    // Codex doesn't use a project-based directory layout.
    return [];
  }

  public async scanProjectsProgressively(
    _enabledProjects: ProjectManifestEntry[],
    _onProgress: (progress: { scannedProjects: number; totalProjects: number; scannedFiles: number; totalFiles: number; currentProject: string }) => void,
    _onProjectScanned: (projectPath: string, conversations: Conversation[]) => void
  ): Promise<Conversation[]> {
    // Not applicable — Codex sessions are date-based, not project-based.
    return [];
  }
}
