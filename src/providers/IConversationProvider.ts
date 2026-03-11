/**
 * Abstraction for a conversation data source.
 *
 * Decouples the Kanban board, state management, and UI layers from any
 * specific coding-agent tool (Claude Code, OpenAI Codex, OpenClaw, etc.).
 * Each provider implements this interface to supply conversations from
 * its own storage format and directory layout.
 */

import { Conversation, ProjectManifestEntry } from '../types';

export interface IConversationProvider {
  /** Unique identifier, e.g. 'claude-code', 'codex', 'openclaw'. */
  readonly id: string;
  /** Human-readable name shown in UI and diagnostics. */
  readonly displayName: string;
  /** Resolved data directory path (for diagnostics). */
  readonly dataPath: string;
  /** Whether the file/data watcher is currently active. */
  readonly isWatching: boolean;
  /** Number of entries held in the incremental parse cache (for diagnostics). */
  readonly parseCacheSize: number;

  // ── Lifecycle ──────────────────────────────────────────────────────

  /** Start watching for changes and perform an initial scan. */
  startWatching(): void;
  /** Set up the watcher without triggering an initial scan (standalone progressive mode). */
  setupFileWatcher(): void;
  /** Stop watching and release resources. */
  stopWatching(): void;

  // ── Scanning & search ──────────────────────────────────────────────

  /** Scan all conversation sources and update the state manager. */
  refresh(): Promise<Conversation[]>;
  /** Full-text search across raw conversation data. Returns matching conversation IDs. */
  searchConversations(query: string): string[];

  // ── Icon management ────────────────────────────────────────────────

  /** Clear the pending-icon set so regeneration can pick up all conversations. */
  clearPendingIcons(): void;

  /** Return the workspace paths currently detected by the platform (for settings display). */
  getWorkspacePaths?(): string[];

  // ── Project discovery (standalone progressive loading) ─────────────

  /** Quickly enumerate all project directories without parsing conversations. */
  discoverProjects(): ProjectManifestEntry[];
  /** Scan enabled projects one at a time, emitting results after each project. */
  scanProjectsProgressively(
    enabledProjects: ProjectManifestEntry[],
    onProgress: (progress: {
      scannedProjects: number;
      totalProjects: number;
      scannedFiles: number;
      totalFiles: number;
      currentProject: string;
    }) => void,
    onProjectScanned: (projectPath: string, conversations: Conversation[]) => void
  ): Promise<Conversation[]>;
}
