import { describe, it, expect, beforeEach } from 'vitest';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { CodexSessionParser } from '../providers/CodexSessionParser';
import * as fixtures from './fixtures/codex-sessions';

let parser: CodexSessionParser;
let tmpDir: string;

/** Write fixture content to a temp .jsonl file and parse it. */
async function parseContent(content: string) {
  const filePath = path.join(tmpDir, `${crypto.randomUUID()}.jsonl`);
  await fsp.writeFile(filePath, content, 'utf-8');
  return parser.parseFile(filePath);
}

beforeEach(async () => {
  parser = new CodexSessionParser();
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-parser-test-'));
});

// ── Basic parsing ────────────────────────────────────────────────────

describe('CodexSessionParser', () => {
  it('returns null for non-jsonl files', async () => {
    const result = await parser.parseFile('/tmp/test.txt');
    expect(result).toBeNull();
  });

  it('returns null for empty content', async () => {
    const result = await parseContent(fixtures.emptyContent);
    expect(result).toBeNull();
  });

  it('returns null for malformed content', async () => {
    const result = await parseContent(fixtures.malformedContent);
    expect(result).toBeNull();
  });

  it('returns null for empty session (metadata-only, no messages)', async () => {
    const result = await parseContent(fixtures.emptySession);
    expect(result).toBeNull();
  });

  // ── ID and provider ──────────────────────────────────────────────

  it('prefixes conversation ID with codex-', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('codex-sess-complete');
  });

  it('sets provider to codex', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result!.provider).toBe('codex');
  });

  // ── Metadata extraction ──────────────────────────────────────────

  it('extracts workspace path from session_meta', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result!.workspacePath).toBe('/Users/dev/my-project');
  });

  it('gitBranch is undefined for standard format (no branch in flat payload)', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result!.gitBranch).toBeUndefined();
  });

  it('extracts title from first user message', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result!.title).toBe('Fix the login bug in auth.ts');
  });

  it('extracts description from first agent message', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result!.description).toBe('I found and fixed the login bug.');
  });

  // ── Status detection ──────────────────────────────────────────────

  it('detects completed session as in-review', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result!.status).toBe('in-review');
  });

  it('detects in-progress session', async () => {
    const result = await parseContent(fixtures.inProgressSession);
    expect(result!.status).toBe('in-progress');
  });

  it('detects error session as needs-input', async () => {
    const result = await parseContent(fixtures.errorSession);
    expect(result!.status).toBe('needs-input');
    expect(result!.hasError).toBe(true);
    expect(result!.errorMessage).toBeTruthy();
  });

  it('detects aborted session as needs-input', async () => {
    const result = await parseContent(fixtures.abortedSession);
    expect(result!.status).toBe('needs-input');
    expect(result!.isInterrupted).toBe(true);
  });

  it('detects rate-limited session as needs-input', async () => {
    const result = await parseContent(fixtures.rateLimitedSession);
    expect(result!.status).toBe('needs-input');
    expect(result!.isRateLimited).toBe(true);
    expect(result!.rateLimitResetTime).toBe('2026-02-24T10:00:00Z');
  });

  it('detects todo session (only user messages, no events)', async () => {
    const result = await parseContent(fixtures.noMetaSession);
    // noMetaSession has user + agent msgs but no session_meta → no sessionId → null
    expect(result).toBeNull();
  });

  // ── Multi-turn ─────────────────────────────────────────────────────

  it('parses multi-turn session correctly', async () => {
    const result = await parseContent(fixtures.multiTurnSession);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Add dark mode support');
    expect(result!.status).toBe('in-review');
  });

  // ── Agent detection ────────────────────────────────────────────────

  it('shows Codex as the main agent', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result!.agents).toHaveLength(1);
    expect(result!.agents[0].name).toBe('Codex');
    expect(result!.agents[0].id).toBe('codex-main');
  });

  // ── Command execution ──────────────────────────────────────────────

  it('parses command session as completed', async () => {
    const result = await parseContent(fixtures.commandSession);
    expect(result!.status).toBe('in-review');
  });

  it('parses failed command session with error', async () => {
    const result = await parseContent(fixtures.failedCommandSession);
    expect(result!.hasError).toBe(true);
    expect(result!.status).toBe('needs-input');
  });

  // ── Legacy format ──────────────────────────────────────────────────

  it('parses legacy format without envelope', async () => {
    const result = await parseContent(fixtures.legacySession);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('codex-sess-legacy');
    expect(result!.workspacePath).toBe('/Users/dev/old-project');
    expect(result!.gitBranch).toBe('legacy-branch');
    expect(result!.title).toBe('Fix the old bug');
  });

  // ── Incremental parsing ────────────────────────────────────────────

  it('incrementally parses appended content', async () => {
    const filePath = path.join(tmpDir, 'incremental.jsonl');

    // Write initial content
    const initial = [
      fixtures.sessionMeta('sess-inc', '/Users/dev/inc', 30),
      fixtures.userMsg('Build the API', 28),
      fixtures.taskStarted(27),
    ].join('\n') + '\n';
    await fsp.writeFile(filePath, initial, 'utf-8');

    const first = await parser.parseFile(filePath);
    expect(first).not.toBeNull();
    expect(first!.status).toBe('in-progress');

    // Append completion
    const appended = [
      fixtures.agentMsg('API is built.', 25),
      fixtures.taskComplete(24),
    ].join('\n') + '\n';
    await fsp.appendFile(filePath, appended, 'utf-8');

    const second = await parser.parseFile(filePath);
    expect(second).not.toBeNull();
    expect(second!.status).toBe('in-review');
    expect(second!.description).toBe('API is built.');
  });

  // ── Cache management ───────────────────────────────────────────────

  it('tracks cache size', async () => {
    expect(parser.cacheSize).toBe(0);
    await parseContent(fixtures.completedSession);
    expect(parser.cacheSize).toBe(1);
  });

  it('clearCache removes a specific entry', async () => {
    const filePath = path.join(tmpDir, 'cached.jsonl');
    await fsp.writeFile(filePath, fixtures.completedSession, 'utf-8');
    await parser.parseFile(filePath);
    expect(parser.cacheSize).toBe(1);
    parser.clearCache(filePath);
    expect(parser.cacheSize).toBe(0);
  });

  // ── Timestamps ─────────────────────────────────────────────────────

  it('sets createdAt and updatedAt from timestamps', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result!.createdAt).toBeInstanceOf(Date);
    expect(result!.updatedAt).toBeInstanceOf(Date);
    expect(result!.createdAt.getTime()).toBeLessThanOrEqual(result!.updatedAt.getTime());
  });

  // ── hasQuestion is always false for Codex ──────────────────────────

  it('never sets hasQuestion for Codex sessions', async () => {
    const result = await parseContent(fixtures.completedSession);
    expect(result!.hasQuestion).toBe(false);
  });
});
