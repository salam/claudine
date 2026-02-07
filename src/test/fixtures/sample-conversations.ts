/**
 * Sample JSONL data for testing ConversationParser.
 * Each fixture represents a different conversation state.
 */

const ts = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

/** Helper: build a single JSONL line */
function line(entry: Record<string, unknown>): string {
  return JSON.stringify(entry);
}

/** Minimal user message entry */
export function userMessage(text: string, minutesAgo = 10, extra: Record<string, unknown> = {}): string {
  return line({
    type: 'user',
    uuid: crypto.randomUUID(),
    timestamp: ts(minutesAgo),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
    ...extra,
  });
}

/** Minimal assistant message entry */
export function assistantMessage(text: string, minutesAgo = 9, toolUses: Array<{ name: string; input?: Record<string, unknown> }> = []): string {
  const content: Array<Record<string, unknown>> = [];
  if (text) {
    content.push({ type: 'text', text });
  }
  for (const tool of toolUses) {
    content.push({ type: 'tool_use', name: tool.name, input: tool.input || {} });
  }
  return line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(minutesAgo),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: {
      role: 'assistant',
      content,
    },
  });
}

/** A simple completed conversation */
export const completedConversation = [
  userMessage('Fix the login bug in auth.ts', 30),
  assistantMessage("I've fixed the login bug. All done!", 28),
].join('\n');

/** A conversation needing user input (question) */
export const needsInputConversation = [
  userMessage('Add dark mode support', 20),
  assistantMessage('Would you like me to use CSS variables or a theme provider?', 18),
].join('\n');

/** A conversation with AskUserQuestion tool use */
export const askUserQuestionConversation = [
  userMessage('Refactor the database layer', 15),
  assistantMessage('', 13, [{ name: 'AskUserQuestion', input: { question: 'Which ORM?' } }]),
].join('\n');

/** A conversation that is still in progress (last message from user) */
export const inProgressConversation = [
  userMessage('Create a new REST API endpoint', 10),
  assistantMessage('I\'ll create the endpoint now.', 9),
  userMessage('Use Express instead of Fastify', 5),
].join('\n');

/** A conversation with an error */
export const errorConversation = [
  userMessage('Deploy to production', 20),
  assistantMessage('Deploying now...', 18, [{ name: 'Bash' }]),
  line({
    type: 'user',
    uuid: crypto.randomUUID(),
    timestamp: ts(17),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', content: 'API Error: 500 Internal Server Error' }],
    },
  }),
].join('\n');

/** A todo conversation (only user message, no assistant) */
export const todoConversation = [
  userMessage('Write unit tests for the parser', 60),
].join('\n');

/** A conversation with git branch info */
export const gitBranchConversation = [
  userMessage('Implement feature X', 30, { gitBranch: 'feature/dark-mode' }),
  assistantMessage('Done implementing feature X. All changes are complete.', 28),
].join('\n');

/** A conversation with sub-agents */
export const subAgentConversation = [
  userMessage('Build a complete auth system', 30),
  assistantMessage('Let me explore the codebase first.', 28, [
    { name: 'Task', input: { subagent_type: 'Explore', description: 'Explore auth patterns' } },
  ]),
  assistantMessage('Now let me plan the implementation.', 25, [
    { name: 'Task', input: { subagent_type: 'Plan', description: 'Plan auth system' } },
  ]),
  assistantMessage("I've completed the auth system. All done!", 20),
].join('\n');

/** A recently active conversation (timestamps within 2 minutes) */
export const recentlyActiveConversation = [
  userMessage('Help me debug this', 1.5),
  assistantMessage('Let me check the logs.', 0.5, [{ name: 'Bash' }]),
].join('\n');

/** A conversation with markup tags that should be stripped from title */
export const markupConversation = [
  userMessage('<ide_opened_file>src/main.ts</ide_opened_file>Fix the typo in the header', 30),
  assistantMessage("I've fixed the typo.", 28),
].join('\n');

/** Empty / malformed content */
export const emptyContent = '';
export const malformedContent = 'not json at all\n{invalid json too';
export const onlyMetadataContent = line({
  type: 'file-history-snapshot',
  uuid: crypto.randomUUID(),
  timestamp: ts(10),
  sessionId: 'test-session',
  parentUuid: null,
  isSidechain: false,
  snapshot: {},
});

/** An interrupted conversation */
export const interruptedConversation = [
  userMessage('Run the test suite', 20),
  line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(18),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Running tests...' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }],
    },
    toolUseResult: { interrupted: true },
  }),
].join('\n');
