import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execFile } from 'child_process';
import { IPlatformAdapter } from '../platform/IPlatformAdapter';
import { Conversation } from '../types';
import {
  SUMMARIZATION_BATCH_SIZE,
  SUMMARIZATION_TITLE_MAX_LENGTH,
  SUMMARIZATION_DESC_MAX_LENGTH,
  SUMMARIZATION_MESSAGE_MAX_LENGTH,
  CLI_TIMEOUT_MS,
  CLI_CHECK_TIMEOUT_MS
} from '../constants';

interface CachedSummary {
  title: string;
  description: string;
  lastMessage: string;
}

/** Minimal env passed to child processes — avoids leaking user secrets. */
const CHILD_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  LANG: process.env.LANG,
  TERM: process.env.TERM,
  // Windows: needed for CLI tools to locate config/data dirs and resolve .cmd files
  ...(process.platform === 'win32' && {
    APPDATA: process.env.APPDATA,
    USERPROFILE: process.env.USERPROFILE,
    PATHEXT: process.env.PATHEXT,
  })
};

/** Which CLI backend is being used for summarization. */
type CliBackend = { kind: 'claude'; path: string } | { kind: 'codex'; path: string };

export class SummaryService {
  private _cache: Record<string, CachedSummary> = {};
  private _pending = new Set<string>();
  private _cliChecked = false;
  private _cliBackend: CliBackend | undefined;
  private _platform: IPlatformAdapter | undefined;

  public init(platform: IPlatformAdapter) {
    this._platform = platform;
    this._cache = platform.getGlobalState<Record<string, CachedSummary>>('summaryCache', {});
  }

  /** Apply cached summary to a conversation. Returns true if cache hit. */
  public applyCached(conversation: Conversation): boolean {
    const cached = this._cache[conversation.id];
    if (!cached) return false;
    conversation.originalTitle = conversation.title;
    conversation.originalDescription = conversation.description;
    conversation.title = cached.title;
    conversation.description = cached.description;
    conversation.lastMessage = cached.lastMessage;
    return true;
  }

  /** Check whether a conversation already has a cached summary. */
  public hasCached(id: string): boolean {
    return id in this._cache;
  }

  /** Remove cache entries for conversations that no longer exist. */
  public pruneCache(activeIds: Set<string>): void {
    let pruned = false;
    for (const id of Object.keys(this._cache)) {
      if (!activeIds.has(id)) {
        delete this._cache[id];
        pruned = true;
      }
    }
    if (pruned) {
      this.saveCache();
    }
  }

  /**
   * Summarize uncached conversations via the Claude Code CLI.
   * Fire-and-forget: calls onUpdate for each completed summary.
   */
  public summarizeUncached(
    conversations: Conversation[],
    onUpdate: (id: string, summary: CachedSummary) => void
  ): void {
    // Check setting
    const enabled = this._platform?.getConfig<boolean>('enableSummarization', false) ?? false;
    if (!enabled) return;

    // Prune stale entries on each scan cycle
    this.pruneCache(new Set(conversations.map(c => c.id)));

    const uncached = conversations.filter(c => !this._cache[c.id] && !this._pending.has(c.id));
    if (uncached.length === 0) return;

    for (const c of uncached) this._pending.add(c.id);

    this.processBatches(uncached, onUpdate).catch(error => {
      console.error('Claudine: Summarization failed', error);
    });
  }

  private async processBatches(
    conversations: Conversation[],
    onUpdate: (id: string, summary: CachedSummary) => void
  ): Promise<void> {
    if (!this._cliChecked) {
      this._cliBackend = await this.discoverCliBackend();
      this._cliChecked = true;
    }
    if (!this._cliBackend) {
      for (const c of conversations) this._pending.delete(c.id);
      return;
    }

    for (let i = 0; i < conversations.length; i += SUMMARIZATION_BATCH_SIZE) {
      const batch = conversations.slice(i, i + SUMMARIZATION_BATCH_SIZE);
      try {
        const summaries = await this.callCli(batch);
        for (let j = 0; j < batch.length && j < summaries.length; j++) {
          const conv = batch[j];
          const raw = summaries[j];
          if (raw) {
            const summary: CachedSummary = {
              title: raw.title || conv.title,
              description: raw.description || conv.description,
              lastMessage: raw.lastMessage || conv.lastMessage
            };
            this._cache[conv.id] = summary;
            this._pending.delete(conv.id);
            onUpdate(conv.id, summary);
          }
        }
        this.saveCache();
      } catch (error) {
        console.error('Claudine: Summarization batch failed', error);
        for (const c of batch) this._pending.delete(c.id);
      }
    }
  }

  private callCli(
    conversations: Conversation[]
  ): Promise<Array<{ title?: string; description?: string; lastMessage?: string }>> {
    return new Promise((resolve, reject) => {
      const entries = conversations.map((c, i) =>
        `${i + 1}.\n  title: ${c.title.slice(0, SUMMARIZATION_TITLE_MAX_LENGTH)}\n  desc: ${c.description.slice(0, SUMMARIZATION_DESC_MAX_LENGTH)}\n  latest: ${c.lastMessage.slice(0, SUMMARIZATION_MESSAGE_MAX_LENGTH)}`
      ).join('\n\n');

      const prompt = `Summarize these coding conversations for compact Kanban board cards.
Rules per entry:
- title: max 8 words, imperative style (e.g. "Fix login page auth bug")
- description: 1 sentence, max 15 words
- lastMessage: keep as-is or shorten to 1 line

${entries}

Return ONLY a JSON array in the same order: [{"title":"...","description":"...","lastMessage":"..."}]`;

      const backend = this._cliBackend!;
      const args = backend.kind === 'claude'
        ? ['-p']
        : ['exec', '--ephemeral', '--skip-git-repo-check', '-'];

      let stdout = '';
      let stderr = '';

      const child = spawn(backend.path, args, {
        cwd: os.tmpdir(),
        timeout: CLI_TIMEOUT_MS,
        env: CHILD_ENV,
        shell: process.platform === 'win32'  // required to execute .cmd/.bat files on Windows
      });

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      child.on('error', (err) => reject(err));

      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`${backend.kind} exited with code ${code}`));
        }
        try {
          const match = stdout.match(/\[[\s\S]*\]/);
          if (!match) return reject(new Error(`No JSON array in ${backend.kind} response`));
          const results = JSON.parse(match[0]);
          if (!Array.isArray(results)) return reject(new Error(`${backend.kind} response is not an array`));
          resolve(results.map((r: Record<string, unknown>) => ({
            title: typeof r.title === 'string' ? r.title : undefined,
            description: typeof r.description === 'string' ? r.description : undefined,
            lastMessage: typeof r.lastMessage === 'string' ? r.lastMessage : undefined,
          })));
        } catch (e) {
          reject(e);
        }
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  /**
   * Discover a CLI backend for summarization.
   * Tries Claude CLI first, then Codex CLI (including VSCode extension bundled binary).
   */
  private async discoverCliBackend(): Promise<CliBackend | undefined> {
    // 1. Try Claude CLI
    const claudePath = await this.resolveExecutable('claude');
    if (claudePath) {
      console.log(`Claudine: Using Claude CLI for summarization: ${claudePath}`);
      return { kind: 'claude', path: claudePath };
    }

    // 2. Try Codex CLI in PATH
    const codexPath = await this.resolveExecutable('codex');
    if (codexPath) {
      console.log(`Claudine: Using Codex CLI for summarization: ${codexPath}`);
      return { kind: 'codex', path: codexPath };
    }

    // 3. Try Codex CLI bundled with VSCode extension
    const bundledCodex = this.findBundledCodexCli();
    if (bundledCodex) {
      console.log(`Claudine: Using bundled Codex CLI for summarization: ${bundledCodex}`);
      return { kind: 'codex', path: bundledCodex };
    }

    console.log('Claudine: No CLI found (claude or codex), skipping summarization');
    return undefined;
  }

  /** Resolve an executable name to an absolute path via `which` (Unix) or `where` (Windows). */
  private resolveExecutable(name: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const whichCmd = isWindows ? 'where' : 'which';
      execFile(whichCmd, [name], { timeout: CLI_CHECK_TIMEOUT_MS, env: CHILD_ENV }, (err, stdout) => {
        if (err || !stdout.trim()) return resolve(undefined);
        // `where` on Windows may return multiple matches (one per line); take the first
        const binPath = stdout.trim().split('\n')[0].trim();
        const child = spawn(binPath, ['--version'], {
          timeout: CLI_CHECK_TIMEOUT_MS,
          env: CHILD_ENV,
          shell: isWindows  // required to execute .cmd/.bat files on Windows
        });
        child.on('error', () => resolve(undefined));
        child.on('close', (code) => resolve(code === 0 ? binPath : undefined));
      });
    });
  }

  /**
   * Search for Codex CLI binary bundled inside VSCode extensions.
   * The OpenAI ChatGPT extension ships a platform-specific binary under bin/.
   */
  private findBundledCodexCli(): string | undefined {
    const extensionDirs = [
      path.join(os.homedir(), '.vscode', 'extensions'),
      path.join(os.homedir(), '.cursor', 'extensions'),
      path.join(os.homedir(), '.vscode-insiders', 'extensions'),
    ];

    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    const platformDir = process.platform === 'darwin' ? `macos-${arch}`
      : process.platform === 'linux' ? `linux-${arch}`
      : process.platform === 'win32' ? `windows-${arch}` : null;
    if (!platformDir) return undefined;

    for (const extDir of extensionDirs) {
      try {
        if (!fs.existsSync(extDir)) continue;
        const entries = fs.readdirSync(extDir).filter(e => e.startsWith('openai.'));
        // Sort descending to prefer latest version
        entries.sort().reverse();
        for (const entry of entries) {
          const binPath = path.join(extDir, entry, 'bin', platformDir, 'codex');
          if (fs.existsSync(binPath)) return binPath;
        }
      } catch {
        // Skip unreadable dirs
      }
    }
    return undefined;
  }

  private saveCache() {
    this._platform?.setGlobalState('summaryCache', this._cache);
  }
}
