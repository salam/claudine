import { Conversation, ProjectManifestEntry } from '../types';
import { IConversationProvider } from './IConversationProvider';

/**
 * Wraps N child `IConversationProvider`s behind a single interface.
 *
 * The first child is the "primary" — it handles project discovery and
 * progressive scanning (the standalone progressive-load flow relies on
 * exactly one provider owning the project-level scan). Non-primary
 * providers contribute conversations via their own `refresh()` calls
 * but do not participate in project discovery.
 */
export class CompositeConversationProvider implements IConversationProvider {
  readonly id: string;
  readonly displayName: string;
  private _children: IConversationProvider[];

  constructor(children: IConversationProvider[]) {
    if (children.length === 0) throw new Error('CompositeConversationProvider requires at least one child');
    this._children = children;
    this.id = children.map(c => c.id).join('+');
    this.displayName = children.map(c => c.displayName).join(' + ');
  }

  /** Resolved data paths from all children. */
  get dataPath(): string {
    return this._children.map(c => c.dataPath).join(', ');
  }

  get isWatching(): boolean {
    return this._children.some(c => c.isWatching);
  }

  get parseCacheSize(): number {
    return this._children.reduce((sum, c) => sum + c.parseCacheSize, 0);
  }

  /** Access a child provider by its ID. */
  public getChild(id: string): IConversationProvider | undefined {
    return this._children.find(c => c.id === id);
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  startWatching(): void {
    for (const child of this._children) child.startWatching();
  }

  setupFileWatcher(): void {
    for (const child of this._children) child.setupFileWatcher();
  }

  stopWatching(): void {
    for (const child of this._children) child.stopWatching();
  }

  // ── Scanning ─────────────────────────────────────────────────────

  async refresh(): Promise<Conversation[]> {
    const results = await Promise.all(this._children.map(c => c.refresh()));
    return results.flat();
  }

  searchConversations(query: string): string[] {
    const results: string[] = [];
    for (const child of this._children) {
      results.push(...child.searchConversations(query));
    }
    return results;
  }

  // ── Icons ────────────────────────────────────────────────────────

  clearPendingIcons(): void {
    for (const child of this._children) child.clearPendingIcons();
  }

  // ── Project discovery (delegated to primary child) ───────────────

  discoverProjects(): ProjectManifestEntry[] {
    return this._children[0].discoverProjects();
  }

  async scanProjectsProgressively(
    enabledProjects: ProjectManifestEntry[],
    onProgress: (progress: { scannedProjects: number; totalProjects: number; scannedFiles: number; totalFiles: number; currentProject: string }) => void,
    onProjectScanned: (projectPath: string, conversations: Conversation[]) => void
  ): Promise<Conversation[]> {
    // Primary child handles project-based progressive scanning
    const primary = await this._children[0].scanProjectsProgressively(enabledProjects, onProgress, onProjectScanned);

    // Non-primary children (e.g. Codex) use their own scan logic via refresh()
    const secondary: Conversation[] = [];
    for (const child of this._children.slice(1)) {
      const convs = await child.refresh();
      secondary.push(...convs);
    }

    return [...primary, ...secondary];
  }
}
