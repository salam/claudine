/**
 * Sample JSONL data for testing CodexSessionParser.
 * Each fixture represents a different Codex session state.
 *
 * Codex format: `{ timestamp, type, payload }` envelope.
 * First line is always `session_meta`, remaining lines are `event_msg`.
 */

const ts = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

/** Helper: build a single JSONL line */
function line(entry: Record<string, unknown>): string {
  return JSON.stringify(entry);
}

/** Session metadata (first line of every session file). Flat payload format. */
export function sessionMeta(
  id = 'codex-test-session-001',
  cwd = '/Users/dev/my-project',
  minutesAgo = 30,
): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'session_meta',
    payload: { id, cwd, timestamp: ts(minutesAgo) },
  });
}

/** User message event. */
export function userMsg(text: string, minutesAgo = 10): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'event_msg',
    payload: { type: 'user_message', message: text },
  });
}

/** Agent (assistant) message event. */
export function agentMsg(text: string, minutesAgo = 9): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'event_msg',
    payload: { type: 'agent_message', message: text },
  });
}

/** Task started event. */
export function taskStarted(minutesAgo = 8): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'event_msg',
    payload: { type: 'task_started' },
  });
}

/** Task complete event. */
export function taskComplete(minutesAgo = 5): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'event_msg',
    payload: { type: 'task_complete' },
  });
}

/** Turn aborted event. */
export function turnAborted(minutesAgo = 5): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'event_msg',
    payload: { type: 'turn_aborted' },
  });
}

/** Error event. */
export function errorEvent(message = 'Something went wrong', minutesAgo = 5): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'event_msg',
    payload: { type: 'error', error: message, message },
  });
}

/** Command execution end event. */
export function execCommandEnd(exitCode = 0, minutesAgo = 6): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'event_msg',
    payload: { type: 'exec_command_end', exit_code: exitCode },
  });
}

/** Rate limit event. */
export function rateLimitEvent(resetAt?: string, message?: string, minutesAgo = 5): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'event_msg',
    payload: { type: 'rate_limit', reset_at: resetAt, message: message || 'Rate limit exceeded' },
  });
}

/** MCP tool call end event. */
export function mcpToolCallEnd(toolName = 'read_file', minutesAgo = 7): string {
  return line({
    timestamp: ts(minutesAgo),
    type: 'event_msg',
    payload: { type: 'mcp_tool_call_end', tool_name: toolName },
  });
}

// ── Pre-built scenarios ──────────────────────────────────────────────

/** A completed Codex session (task_complete at end). */
export const completedSession = [
  sessionMeta('sess-complete', '/Users/dev/my-project', 30),
  userMsg('Fix the login bug in auth.ts', 28),
  taskStarted(27),
  agentMsg('I found and fixed the login bug.', 25),
  taskComplete(24),
].join('\n');

/** A session that is still running (task_started, no task_complete). */
export const inProgressSession = [
  sessionMeta('sess-in-progress', '/Users/dev/my-project', 10),
  userMsg('Create a new REST API endpoint', 8),
  taskStarted(7),
  agentMsg('Working on the endpoint now...', 1),
].join('\n');

/** A session with an error event. */
export const errorSession = [
  sessionMeta('sess-error', '/Users/dev/my-project', 20),
  userMsg('Deploy to production', 18),
  taskStarted(17),
  errorEvent('Deployment failed: permission denied', 15),
].join('\n');

/** A session that was aborted (turn_aborted). */
export const abortedSession = [
  sessionMeta('sess-aborted', '/Users/dev/my-project', 20),
  userMsg('Run the full test suite', 18),
  taskStarted(17),
  agentMsg('Running tests...', 16),
  turnAborted(15),
].join('\n');

/** A session that hit a rate limit. */
export const rateLimitedSession = [
  sessionMeta('sess-rate-limit', '/Users/dev/my-project', 20),
  userMsg('Implement the search feature', 18),
  taskStarted(17),
  agentMsg('Working on search...', 16),
  rateLimitEvent('2026-02-24T10:00:00Z', 'Rate limit exceeded — resets at 10am', 15),
].join('\n');

/** A multi-turn session with several user/agent exchanges. */
export const multiTurnSession = [
  sessionMeta('sess-multi', '/Users/dev/my-project', 30),
  userMsg('Add dark mode support', 28),
  taskStarted(27),
  agentMsg('I\'ll start with the CSS variables.', 26),
  userMsg('Use a theme provider instead', 24),
  agentMsg('Switching to theme provider approach.', 22),
  agentMsg('All done with dark mode implementation.', 20),
  taskComplete(19),
].join('\n');

/**
 * Legacy format — older Codex files have bare objects without the
 * `type`/`payload` envelope. The parser should handle these gracefully.
 */
export const legacySession = [
  // Bare session meta (no envelope)
  line({ meta: { id: 'sess-legacy', cwd: '/Users/dev/old-project', timestamp: ts(60) }, git: { branch: 'legacy-branch' } }),
  // Bare user message
  line({ type: 'user_message', message: 'Fix the old bug', timestamp: ts(58) }),
  // Bare agent message
  line({ type: 'agent_message', message: 'Fixed the old bug. All done.', timestamp: ts(55) }),
].join('\n');

/** Empty session — only metadata, no events. */
export const emptySession = sessionMeta('sess-empty', '/Users/dev/empty', 30);

/** Session with no metadata at all (malformed). */
export const noMetaSession = [
  userMsg('Hello?', 10),
  agentMsg('Hi there.', 9),
].join('\n');

/** Session with command execution events. */
export const commandSession = [
  sessionMeta('sess-cmd', '/Users/dev/my-project', 20),
  userMsg('Run npm test', 18),
  taskStarted(17),
  line({ timestamp: ts(16), type: 'event_msg', payload: { type: 'exec_command_begin', command: 'npm test' } }),
  execCommandEnd(0, 14),
  agentMsg('Tests passed.', 13),
  taskComplete(12),
].join('\n');

/** Session with a failed command (non-zero exit code). */
export const failedCommandSession = [
  sessionMeta('sess-fail-cmd', '/Users/dev/my-project', 20),
  userMsg('Run the linter', 18),
  taskStarted(17),
  line({ timestamp: ts(16), type: 'event_msg', payload: { type: 'exec_command_begin', command: 'npm run lint' } }),
  execCommandEnd(1, 14),
  errorEvent('Lint errors found', 13),
].join('\n');

/** Completely empty content. */
export const emptyContent = '';

/** Malformed JSON. */
export const malformedContent = 'not json at all\n{invalid json too';
