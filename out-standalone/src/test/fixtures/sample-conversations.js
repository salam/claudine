"use strict";
/**
 * Sample JSONL data for testing ConversationParser.
 * Each fixture represents a different conversation state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.manySidechainStepsConversation = exports.rateLimitResolvedConversation = exports.rateLimitToolResultConversation = exports.rateLimitConversation = exports.sidechainActivityConversation = exports.noUserTextConversation = exports.emptyMeaninglessConversation = exports.mixedSidechainConversation = exports.sidechainOnlyConversation = exports.interruptedConversation = exports.largeToolInputConversation = exports.onlyMetadataContent = exports.malformedContent = exports.emptyContent = exports.markupConversation = exports.recentlyActiveConversation = exports.subAgentConversation = exports.gitBranchConversation = exports.todoConversation = exports.errorConversation = exports.inProgressConversation = exports.askUserQuestionConversation = exports.needsInputConversation = exports.completedConversation = void 0;
exports.userMessage = userMessage;
exports.assistantMessage = assistantMessage;
exports.largeParsableConversation = largeParsableConversation;
const ts = (minutesAgo) => new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
/** Helper: build a single JSONL line */
function line(entry) {
    return JSON.stringify(entry);
}
/** Minimal user message entry */
function userMessage(text, minutesAgo = 10, extra = {}) {
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
function assistantMessage(text, minutesAgo = 9, toolUses = []) {
    const content = [];
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
exports.completedConversation = [
    userMessage('Fix the login bug in auth.ts', 30),
    assistantMessage("I've fixed the login bug. All done!", 28),
].join('\n');
/** A conversation needing user input (question) */
exports.needsInputConversation = [
    userMessage('Add dark mode support', 20),
    assistantMessage('Would you like me to use CSS variables or a theme provider?', 18),
].join('\n');
/** A conversation with AskUserQuestion tool use */
exports.askUserQuestionConversation = [
    userMessage('Refactor the database layer', 15),
    assistantMessage('', 13, [{ name: 'AskUserQuestion', input: { question: 'Which ORM?' } }]),
].join('\n');
/** A conversation that is still in progress (last message from user) */
exports.inProgressConversation = [
    userMessage('Create a new REST API endpoint', 10),
    assistantMessage('I\'ll create the endpoint now.', 9),
    userMessage('Use Express instead of Fastify', 5),
].join('\n');
/** A conversation with an error */
exports.errorConversation = [
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
exports.todoConversation = [
    userMessage('Write unit tests for the parser', 60),
].join('\n');
/** A conversation with git branch info */
exports.gitBranchConversation = [
    userMessage('Implement feature X', 30, { gitBranch: 'feature/dark-mode' }),
    assistantMessage('Done implementing feature X. All changes are complete.', 28),
].join('\n');
/** A conversation with sub-agents */
exports.subAgentConversation = [
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
exports.recentlyActiveConversation = [
    userMessage('Help me debug this', 1.5),
    assistantMessage('Let me check the logs.', 0.5, [{ name: 'Bash' }]),
].join('\n');
/** A conversation with markup tags that should be stripped from title */
exports.markupConversation = [
    userMessage('<ide_opened_file>src/main.ts</ide_opened_file>Fix the typo in the header', 30),
    assistantMessage("I've fixed the typo.", 28),
].join('\n');
/** Empty / malformed content */
exports.emptyContent = '';
exports.malformedContent = 'not json at all\n{invalid json too';
exports.onlyMetadataContent = line({
    type: 'file-history-snapshot',
    uuid: crypto.randomUUID(),
    timestamp: ts(10),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    snapshot: {},
});
/** A large conversation with many messages for stress testing */
function largeParsableConversation(messageCount = 500) {
    const lines = [];
    for (let i = 0; i < messageCount; i++) {
        const minutesAgo = messageCount - i;
        if (i % 2 === 0) {
            lines.push(userMessage(i === 0 ? 'Build the authentication system' : `Follow-up message ${i}`, minutesAgo));
        }
        else {
            const tools = i % 10 === 1
                ? [{ name: 'Task', input: { subagent_type: 'Explore', description: `Explore step ${i}` } }]
                : i % 10 === 3
                    ? [{ name: 'Bash', input: { command: `echo step-${i}` } }]
                    : [];
            lines.push(assistantMessage(i === messageCount - 1
                ? "I've completed the authentication system. All done!"
                : `Working on step ${i}...`, minutesAgo, tools));
        }
    }
    return lines.join('\n');
}
/** A conversation with tool_use blocks containing large inputs */
exports.largeToolInputConversation = [
    userMessage('Refactor the entire codebase', 30),
    assistantMessage('', 28, [
        {
            name: 'Edit',
            input: {
                file_path: '/src/very/long/path/to/file.ts',
                old_string: 'x'.repeat(500),
                new_string: 'y'.repeat(500),
            },
        },
        {
            name: 'Write',
            input: {
                file_path: '/src/another/file.ts',
                content: 'z'.repeat(1000),
            },
        },
    ]),
    assistantMessage("I've completed the refactoring. All done!", 25),
].join('\n');
/** An interrupted conversation */
exports.interruptedConversation = [
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
// ── BUG reproduction fixtures ────────────────────────────────────────
/** BUG1 — Sidechain-only conversation: all messages are isSidechain=true.
 *  Should be filtered out, not shown as a ghost "Untitled Conversation". */
exports.sidechainOnlyConversation = [
    line({
        type: 'user',
        uuid: crypto.randomUUID(),
        timestamp: ts(20),
        sessionId: 'test-session',
        parentUuid: 'some-parent',
        isSidechain: true,
        message: { role: 'user', content: [{ type: 'text', text: 'sidechain user msg' }] },
    }),
    line({
        type: 'assistant',
        uuid: crypto.randomUUID(),
        timestamp: ts(19),
        sessionId: 'test-session',
        parentUuid: 'some-parent',
        isSidechain: true,
        message: { role: 'assistant', content: [{ type: 'text', text: 'sidechain assistant msg' }] },
    }),
].join('\n');
/** BUG1 — Mixed sidechain: real conversation with sidechain entries mixed in.
 *  Title/description should come from non-sidechain messages only. */
exports.mixedSidechainConversation = [
    userMessage('Implement the login page', 30),
    line({
        type: 'assistant',
        uuid: crypto.randomUUID(),
        timestamp: ts(28),
        sessionId: 'test-session',
        parentUuid: 'some-parent',
        isSidechain: true,
        message: { role: 'assistant', content: [{ type: 'text', text: 'Sidechain noise that should not appear' }] },
    }),
    assistantMessage("I've implemented the login page. All done!", 25),
].join('\n');
/** BUG3 — Empty conversation: only system-reminder content that gets stripped,
 *  leaving no meaningful title, description, or lastMessage. */
exports.emptyMeaninglessConversation = [
    line({
        type: 'user',
        uuid: crypto.randomUUID(),
        timestamp: ts(10),
        sessionId: 'test-session',
        parentUuid: null,
        isSidechain: false,
        message: { role: 'user', content: [{ type: 'text', text: '<system-reminder>hook output</system-reminder>' }] },
    }),
    line({
        type: 'assistant',
        uuid: crypto.randomUUID(),
        timestamp: ts(9),
        sessionId: 'test-session',
        parentUuid: null,
        isSidechain: false,
        message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
    }),
].join('\n');
/** BUG3 — Conversation with only assistant tool-use, no user text at all. */
exports.noUserTextConversation = [
    line({
        type: 'assistant',
        uuid: crypto.randomUUID(),
        timestamp: ts(10),
        sessionId: 'test-session',
        parentUuid: null,
        isSidechain: false,
        message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
    }),
].join('\n');
// ── Sidechain activity fixtures ──────────────────────────────────────
/** Conversation with sidechain activity — assistant tool_use (running),
 *  user tool_result success (completed), user tool_result error (failed). */
exports.sidechainActivityConversation = [
    userMessage('Build the auth system', 30),
    // Sidechain: assistant dispatches Bash → running
    line({
        type: 'assistant',
        uuid: crypto.randomUUID(),
        timestamp: ts(28),
        sessionId: 'test-session',
        parentUuid: 'sc-parent',
        isSidechain: true,
        message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] },
    }),
    // Sidechain: tool result success → completed
    line({
        type: 'user',
        uuid: crypto.randomUUID(),
        timestamp: ts(27),
        sessionId: 'test-session',
        parentUuid: 'sc-parent',
        isSidechain: true,
        message: { role: 'user', content: [{ type: 'tool_result', content: 'Tests passed', tool_use_id: 'tu1' }] },
    }),
    // Sidechain: tool result error → failed
    line({
        type: 'user',
        uuid: crypto.randomUUID(),
        timestamp: ts(26),
        sessionId: 'test-session',
        parentUuid: 'sc-parent',
        isSidechain: true,
        message: { role: 'user', content: [{ type: 'tool_result', content: 'Error: Exit code 1', tool_use_id: 'tu2', is_error: true }] },
    }),
    assistantMessage("I've completed the auth system. All done!", 20),
].join('\n');
// ── Rate limit fixtures ──────────────────────────────────────────────
/** Conversation where Claude Code hit a rate limit. */
exports.rateLimitConversation = [
    userMessage('Implement the search feature', 30),
    assistantMessage('Working on the search feature...', 28, [{ name: 'Bash' }]),
    assistantMessage("You've hit your limit \u00b7 resets 10am (Europe/Zurich)", 27),
].join('\n');
/** Conversation where rate limit message is in a tool_result. */
exports.rateLimitToolResultConversation = [
    userMessage('Fix the tests', 20),
    assistantMessage('Running tests...', 18, [{ name: 'Bash' }]),
    line({
        type: 'user',
        uuid: crypto.randomUUID(),
        timestamp: ts(17),
        sessionId: 'test-session',
        parentUuid: null,
        isSidechain: false,
        message: {
            role: 'user',
            content: [{ type: 'tool_result', content: "You've hit your limit \u00b7 resets 2:30pm (America/New_York)" }],
        },
    }),
].join('\n');
/** Rate limit in older messages but resolved by new activity — should NOT be flagged. */
exports.rateLimitResolvedConversation = [
    userMessage('Build the API', 60),
    assistantMessage("You've hit your limit \u00b7 resets 10am (Europe/Zurich)", 55),
    userMessage('continue', 30),
    assistantMessage("I've built the API. All done!", 28),
].join('\n');
/** Conversation with more than 3 sidechain entries — only last 3 should be kept. */
exports.manySidechainStepsConversation = [
    userMessage('Large task', 30),
    // 5 sidechain entries — only last 3 should survive
    ...Array.from({ length: 5 }, (_, i) => line({
        type: 'assistant',
        uuid: crypto.randomUUID(),
        timestamp: ts(28 - i),
        sessionId: 'test-session',
        parentUuid: 'sc-parent',
        isSidechain: true,
        message: { role: 'assistant', content: [{ type: 'tool_use', name: `Tool${i}`, input: {} }] },
    })),
    assistantMessage('All done!', 20),
].join('\n');
//# sourceMappingURL=sample-conversations.js.map