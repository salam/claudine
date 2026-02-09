"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fsp = __importStar(require("fs/promises"));
const ConversationParser_1 = require("../providers/ConversationParser");
const constants_1 = require("../constants");
const fixtures = __importStar(require("./fixtures/sample-conversations"));
// Mock fs/promises module
vitest_1.vi.mock('fs/promises', () => ({
    stat: vitest_1.vi.fn().mockResolvedValue({ size: 1024 }),
    readFile: vitest_1.vi.fn().mockResolvedValue(''),
    access: vitest_1.vi.fn().mockRejectedValue(new Error('ENOENT')),
    open: vitest_1.vi.fn(),
}));
const mockStat = vitest_1.vi.mocked(fsp.stat);
const mockReadFile = vitest_1.vi.mocked(fsp.readFile);
(0, vitest_1.describe)('ConversationParser', () => {
    let parser;
    (0, vitest_1.beforeEach)(() => {
        parser = new ConversationParser_1.ConversationParser();
        vitest_1.vi.clearAllMocks();
        // Restore default mock behavior after clearAllMocks
        vitest_1.vi.mocked(fsp.access).mockRejectedValue(new Error('ENOENT'));
    });
    function parseContent(content, filePath = '/home/user/.claude/projects/test-project/abc123.jsonl') {
        const bytes = Buffer.byteLength(content, 'utf-8');
        mockStat.mockResolvedValue({ size: bytes });
        mockReadFile.mockResolvedValue(content);
        return parser.parseFile(filePath);
    }
    (0, vitest_1.describe)('parseFile', () => {
        (0, vitest_1.it)('returns null for non-jsonl files', async () => {
            const result = await parser.parseFile('/path/to/file.txt');
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('returns null for empty content', async () => {
            const result = await parseContent(fixtures.emptyContent);
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('returns null for content with only metadata entries', async () => {
            const result = await parseContent(fixtures.onlyMetadataContent);
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('skips malformed JSON lines gracefully', async () => {
            const content = [
                'not valid json',
                fixtures.userMessage('Valid message after bad line', 10),
                '{also broken',
                fixtures.assistantMessage('Valid assistant response', 9),
            ].join('\n');
            const result = await parseContent(content);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.title).toBe('Valid message after bad line');
        });
        (0, vitest_1.it)('extracts session ID from file path', async () => {
            const result = await parseContent(fixtures.completedConversation, '/path/to/abc-123-def.jsonl');
            (0, vitest_1.expect)(result.id).toBe('abc-123-def');
        });
    });
    (0, vitest_1.describe)('title extraction', () => {
        (0, vitest_1.it)('extracts title from first user message', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result.title).toBe('Fix the login bug in auth.ts');
        });
        (0, vitest_1.it)(`truncates long titles to ${constants_1.MAX_TITLE_LENGTH} characters`, async () => {
            const longText = 'A'.repeat(100);
            const content = [
                fixtures.userMessage(longText, 10),
                fixtures.assistantMessage('OK', 9),
            ].join('\n');
            const result = await parseContent(content);
            (0, vitest_1.expect)(result.title.length).toBeLessThanOrEqual(constants_1.MAX_TITLE_LENGTH);
            (0, vitest_1.expect)(result.title).toMatch(/\.\.\.$/);
        });
        (0, vitest_1.it)('strips markup tags from title', async () => {
            const result = await parseContent(fixtures.markupConversation);
            (0, vitest_1.expect)(result.title).toBe('Fix the typo in the header');
            (0, vitest_1.expect)(result.title).not.toContain('ide_opened_file');
        });
        (0, vitest_1.it)('returns "Untitled Conversation" when no user text', async () => {
            const content = [
                fixtures.assistantMessage('Hello!', 10),
            ].join('\n');
            // Assistant-only won't produce a conversation (no user message with text)
            // But an assistant message still counts as a message
            const result = await parseContent(content);
            (0, vitest_1.expect)(result.title).toBe('Untitled Conversation');
        });
    });
    (0, vitest_1.describe)('description extraction', () => {
        (0, vitest_1.it)('extracts description from first assistant message', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result.description).toContain('fixed the login bug');
        });
        (0, vitest_1.it)(`truncates long descriptions to ${constants_1.MAX_DESCRIPTION_LENGTH} characters`, async () => {
            const content = [
                fixtures.userMessage('Do something', 10),
                fixtures.assistantMessage('B'.repeat(300), 9),
            ].join('\n');
            const result = await parseContent(content);
            (0, vitest_1.expect)(result.description.length).toBeLessThanOrEqual(constants_1.MAX_DESCRIPTION_LENGTH);
        });
    });
    (0, vitest_1.describe)('status detection', () => {
        (0, vitest_1.it)('detects todo status (no assistant response)', async () => {
            const result = await parseContent(fixtures.todoConversation);
            (0, vitest_1.expect)(result.status).toBe('todo');
        });
        (0, vitest_1.it)('detects in-review from completion phrases', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result.status).toBe('in-review');
        });
        (0, vitest_1.it)('detects needs-input from question patterns', async () => {
            const result = await parseContent(fixtures.needsInputConversation);
            (0, vitest_1.expect)(result.status).toBe('needs-input');
        });
        (0, vitest_1.it)('detects needs-input from AskUserQuestion tool use', async () => {
            const result = await parseContent(fixtures.askUserQuestionConversation);
            (0, vitest_1.expect)(result.status).toBe('needs-input');
        });
        (0, vitest_1.it)('detects in-progress when last message is from user', async () => {
            const result = await parseContent(fixtures.inProgressConversation);
            (0, vitest_1.expect)(result.status).toBe('in-progress');
        });
        (0, vitest_1.it)('detects needs-input when recent messages have errors', async () => {
            const result = await parseContent(fixtures.errorConversation);
            (0, vitest_1.expect)(result.status).toBe('needs-input');
        });
    });
    (0, vitest_1.describe)('agent detection', () => {
        (0, vitest_1.it)('always includes main Claude agent', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result.agents).toHaveLength(1);
            (0, vitest_1.expect)(result.agents[0].id).toBe('claude-main');
            (0, vitest_1.expect)(result.agents[0].name).toBe('Claude');
        });
        (0, vitest_1.it)('detects sub-agents from Task tool uses', async () => {
            const result = await parseContent(fixtures.subAgentConversation);
            (0, vitest_1.expect)(result.agents.length).toBeGreaterThanOrEqual(3);
            const agentIds = result.agents.map(a => a.id);
            (0, vitest_1.expect)(agentIds).toContain('agent-Explore');
            (0, vitest_1.expect)(agentIds).toContain('agent-Plan');
        });
        (0, vitest_1.it)('deduplicates sub-agents by type', async () => {
            const content = [
                fixtures.userMessage('Do work', 30),
                fixtures.assistantMessage('', 28, [
                    { name: 'Task', input: { subagent_type: 'Explore', description: 'First explore' } },
                ]),
                fixtures.assistantMessage('', 25, [
                    { name: 'Task', input: { subagent_type: 'Explore', description: 'Second explore' } },
                ]),
                fixtures.assistantMessage('Done!', 20),
            ].join('\n');
            const result = await parseContent(content);
            const exploreAgents = result.agents.filter(a => a.id === 'agent-Explore');
            (0, vitest_1.expect)(exploreAgents).toHaveLength(1);
        });
    });
    (0, vitest_1.describe)('git branch detection', () => {
        (0, vitest_1.it)('extracts git branch from entry metadata', async () => {
            const result = await parseContent(fixtures.gitBranchConversation);
            (0, vitest_1.expect)(result.gitBranch).toBe('feature/dark-mode');
        });
    });
    (0, vitest_1.describe)('error detection', () => {
        (0, vitest_1.it)('detects errors in conversations', async () => {
            const result = await parseContent(fixtures.errorConversation);
            (0, vitest_1.expect)(result.hasError).toBe(true);
        });
        (0, vitest_1.it)('marks clean conversations as error-free', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result.hasError).toBe(false);
        });
    });
    (0, vitest_1.describe)('interruption detection', () => {
        (0, vitest_1.it)('detects interrupted conversations via toolUseResult', async () => {
            const result = await parseContent(fixtures.interruptedConversation);
            (0, vitest_1.expect)(result.isInterrupted).toBe(true);
        });
        (0, vitest_1.it)('marks uninterrupted conversations correctly', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result.isInterrupted).toBe(false);
        });
    });
    (0, vitest_1.describe)('question detection', () => {
        (0, vitest_1.it)('detects questions from AskUserQuestion tool', async () => {
            const result = await parseContent(fixtures.askUserQuestionConversation);
            (0, vitest_1.expect)(result.hasQuestion).toBe(true);
        });
        (0, vitest_1.it)('no question in completed conversations', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result.hasQuestion).toBe(false);
        });
    });
    (0, vitest_1.describe)('category classification', () => {
        (0, vitest_1.it)('classifies based on conversation content', async () => {
            const result = await parseContent(fixtures.completedConversation);
            // "Fix the login bug" → should be classified as bug
            (0, vitest_1.expect)(result.category).toBe('bug');
        });
    });
    (0, vitest_1.describe)('timestamps', () => {
        (0, vitest_1.it)('uses JSONL timestamps for createdAt and updatedAt', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result.createdAt).toBeInstanceOf(Date);
            (0, vitest_1.expect)(result.updatedAt).toBeInstanceOf(Date);
            (0, vitest_1.expect)(result.updatedAt.getTime()).toBeGreaterThanOrEqual(result.createdAt.getTime());
        });
    });
    // ── BUG regression tests ──────────────────────────────────────────
    (0, vitest_1.describe)('BUG1 — sidechain filtering', () => {
        (0, vitest_1.it)('returns null for conversations where all messages are sidechain', async () => {
            const result = await parseContent(fixtures.sidechainOnlyConversation);
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('ignores sidechain messages when extracting title/description', async () => {
            const result = await parseContent(fixtures.mixedSidechainConversation);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.title).toBe('Implement the login page');
            (0, vitest_1.expect)(result.description).not.toContain('Sidechain noise');
        });
    });
    (0, vitest_1.describe)('BUG3 — empty/meaningless conversations', () => {
        (0, vitest_1.it)('returns null for conversations with only system-reminder content', async () => {
            const result = await parseContent(fixtures.emptyMeaninglessConversation);
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('returns null for conversations with only assistant tool-use and no user text', async () => {
            const result = await parseContent(fixtures.noUserTextConversation);
            // No user text, no assistant text → empty conversation
            (0, vitest_1.expect)(result).toBeNull();
        });
    });
    (0, vitest_1.describe)('rate limit detection', () => {
        (0, vitest_1.it)('detects rate limit in assistant text', async () => {
            const result = await parseContent(fixtures.rateLimitConversation);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.isRateLimited).toBe(true);
            (0, vitest_1.expect)(result.rateLimitResetDisplay).toBe('10am (Europe/Zurich)');
            (0, vitest_1.expect)(result.rateLimitResetTime).toBeDefined();
        });
        (0, vitest_1.it)('detects rate limit in tool_result text', async () => {
            const result = await parseContent(fixtures.rateLimitToolResultConversation);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.isRateLimited).toBe(true);
            (0, vitest_1.expect)(result.rateLimitResetDisplay).toBe('2:30pm (America/New_York)');
        });
        (0, vitest_1.it)('does not flag resolved rate limits (new activity after limit)', async () => {
            const result = await parseContent(fixtures.rateLimitResolvedConversation);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.isRateLimited).toBe(false);
        });
        (0, vitest_1.it)('marks rate-limited conversations as needs-input', async () => {
            const result = await parseContent(fixtures.rateLimitConversation);
            (0, vitest_1.expect)(result.status).toBe('needs-input');
        });
        (0, vitest_1.it)('clean conversations are not rate-limited', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result.isRateLimited).toBe(false);
            (0, vitest_1.expect)(result.rateLimitResetDisplay).toBeUndefined();
            (0, vitest_1.expect)(result.rateLimitResetTime).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('parseResetTime', () => {
        (0, vitest_1.it)('parses "10am" in a valid timezone', () => {
            const result = ConversationParser_1.ConversationParser.parseResetTime('10am', 'Europe/Zurich');
            (0, vitest_1.expect)(result).toBeDefined();
            // Should be a valid ISO string
            (0, vitest_1.expect)(new Date(result).toISOString()).toBe(result);
        });
        (0, vitest_1.it)('parses "2:30pm" format', () => {
            const result = ConversationParser_1.ConversationParser.parseResetTime('2:30pm', 'America/New_York');
            (0, vitest_1.expect)(result).toBeDefined();
            const d = new Date(result);
            // Should be in the future
            (0, vitest_1.expect)(d.getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
        });
        (0, vitest_1.it)('returns undefined for invalid time format', () => {
            const result = ConversationParser_1.ConversationParser.parseResetTime('invalid', 'UTC');
            (0, vitest_1.expect)(result).toBeUndefined();
        });
        (0, vitest_1.it)('returns undefined for invalid timezone', () => {
            const result = ConversationParser_1.ConversationParser.parseResetTime('10am', 'Not/A/Timezone');
            (0, vitest_1.expect)(result).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('sidechain activity dots', () => {
        (0, vitest_1.it)('collects sidechain steps with correct statuses', async () => {
            const result = await parseContent(fixtures.sidechainActivityConversation);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.sidechainSteps).toBeDefined();
            (0, vitest_1.expect)(result.sidechainSteps).toHaveLength(3);
            // running (assistant tool_use), completed (tool_result ok), failed (tool_result error)
            (0, vitest_1.expect)(result.sidechainSteps[0].status).toBe('running');
            (0, vitest_1.expect)(result.sidechainSteps[0].toolName).toBe('Bash');
            (0, vitest_1.expect)(result.sidechainSteps[1].status).toBe('completed');
            (0, vitest_1.expect)(result.sidechainSteps[2].status).toBe('failed');
        });
        (0, vitest_1.it)('keeps only the last 3 sidechain steps', async () => {
            const result = await parseContent(fixtures.manySidechainStepsConversation);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.sidechainSteps).toHaveLength(3);
            // Last 3 of 5 entries: Tool2, Tool3, Tool4
            (0, vitest_1.expect)(result.sidechainSteps[0].toolName).toBe('Tool2');
            (0, vitest_1.expect)(result.sidechainSteps[1].toolName).toBe('Tool3');
            (0, vitest_1.expect)(result.sidechainSteps[2].toolName).toBe('Tool4');
        });
        (0, vitest_1.it)('returns undefined sidechainSteps when no sidechain entries', async () => {
            const result = await parseContent(fixtures.completedConversation);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.sidechainSteps).toBeUndefined();
        });
    });
});
//# sourceMappingURL=ConversationParser.test.js.map