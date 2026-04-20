import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fsp from 'fs/promises';
import { ConversationParser } from '../providers/ConversationParser';
import { MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH } from '../constants';
import * as fixtures from './fixtures/sample-conversations';

// Mock fs/promises module
vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 1024 }),
  readFile: vi.fn().mockResolvedValue(''),
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  open: vi.fn(),
}));

const mockStat = vi.mocked(fsp.stat);
const mockReadFile = vi.mocked(fsp.readFile);

describe('ConversationParser', () => {
  let parser: ConversationParser;

  beforeEach(() => {
    parser = new ConversationParser();
    vi.clearAllMocks();
    // Restore default mock behavior after clearAllMocks
    vi.mocked(fsp.access).mockRejectedValue(new Error('ENOENT'));
  });

  function parseContent(content: string, filePath = '/home/user/.claude/projects/test-project/abc123.jsonl') {
    const bytes = Buffer.byteLength(content, 'utf-8');
    mockStat.mockResolvedValue({ size: bytes } as any);
    mockReadFile.mockResolvedValue(content);
    return parser.parseFile(filePath);
  }

  describe('parseFile', () => {
    it('returns null for non-jsonl files', async () => {
      const result = await parser.parseFile('/path/to/file.txt');
      expect(result).toBeNull();
    });

    it('returns null for empty content', async () => {
      const result = await parseContent(fixtures.emptyContent);
      expect(result).toBeNull();
    });

    it('returns null for content with only metadata entries', async () => {
      const result = await parseContent(fixtures.onlyMetadataContent);
      expect(result).toBeNull();
    });

    it('skips malformed JSON lines gracefully', async () => {
      const content = [
        'not valid json',
        fixtures.userMessage('Valid message after bad line', 10),
        '{also broken',
        fixtures.assistantMessage('Valid assistant response', 9),
      ].join('\n');
      const result = await parseContent(content);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Valid message after bad line');
    });

    it('extracts session ID from file path', async () => {
      const result = await parseContent(fixtures.completedConversation, '/path/to/abc-123-def.jsonl');
      expect(result!.id).toBe('abc-123-def');
    });

    it('sets provider to claude-code', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.provider).toBe('claude-code');
    });
  });

  describe('title extraction', () => {
    it('extracts title from first user message', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.title).toBe('Fix the login bug in auth.ts');
    });

    it(`truncates long titles to ${MAX_TITLE_LENGTH} characters`, async () => {
      const longText = 'A'.repeat(100);
      const content = [
        fixtures.userMessage(longText, 10),
        fixtures.assistantMessage('OK', 9),
      ].join('\n');
      const result = await parseContent(content);
      expect(result!.title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
      expect(result!.title).toMatch(/\.\.\.$/);
    });

    it('strips markup tags from title', async () => {
      const result = await parseContent(fixtures.markupConversation);
      expect(result!.title).toBe('Fix the typo in the header');
      expect(result!.title).not.toContain('ide_opened_file');
    });

    it('returns null when no user text (BUG9: no real user content)', async () => {
      const content = [
        fixtures.assistantMessage('Hello!', 10),
      ].join('\n');
      // Assistant-only conversation has no real user content → filtered out
      const result = await parseContent(content);
      expect(result).toBeNull();
    });
  });

  describe('description extraction', () => {
    it('extracts description from first assistant message', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.description).toContain('fixed the login bug');
    });

    it(`truncates long descriptions to ${MAX_DESCRIPTION_LENGTH} characters`, async () => {
      const content = [
        fixtures.userMessage('Do something', 10),
        fixtures.assistantMessage('B'.repeat(300), 9),
      ].join('\n');
      const result = await parseContent(content);
      expect(result!.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    });
  });

  describe('status detection', () => {
    it('detects todo status (no assistant response)', async () => {
      const result = await parseContent(fixtures.todoConversation);
      expect(result!.status).toBe('todo');
    });

    it('detects in-review from completion phrases', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.status).toBe('in-review');
    });

    it('detects needs-input from question patterns', async () => {
      const result = await parseContent(fixtures.needsInputConversation);
      expect(result!.status).toBe('needs-input');
    });

    it('detects needs-input from AskUserQuestion tool use', async () => {
      const result = await parseContent(fixtures.askUserQuestionConversation);
      expect(result!.status).toBe('needs-input');
    });

    it('detects in-progress when last message is from user', async () => {
      const result = await parseContent(fixtures.inProgressConversation);
      expect(result!.status).toBe('in-progress');
    });

    it('detects needs-input when recent messages have errors', async () => {
      const result = await parseContent(fixtures.errorConversation);
      expect(result!.status).toBe('needs-input');
    });
  });

  describe('agent detection', () => {
    it('always includes main Claude agent', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.agents).toHaveLength(1);
      expect(result!.agents[0].id).toBe('claude-main');
      expect(result!.agents[0].name).toBe('Claude');
    });

    it('detects sub-agents from Task tool uses', async () => {
      const result = await parseContent(fixtures.subAgentConversation);
      expect(result!.agents.length).toBeGreaterThanOrEqual(3);
      const agentIds = result!.agents.map(a => a.id);
      expect(agentIds).toContain('agent-Explore');
      expect(agentIds).toContain('agent-Plan');
    });

    it('deduplicates sub-agents by type', async () => {
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
      const exploreAgents = result!.agents.filter(a => a.id === 'agent-Explore');
      expect(exploreAgents).toHaveLength(1);
    });
  });

  describe('git branch detection', () => {
    it('extracts git branch from entry metadata', async () => {
      const result = await parseContent(fixtures.gitBranchConversation);
      expect(result!.gitBranch).toBe('feature/dark-mode');
    });
  });

  describe('error detection', () => {
    it('detects errors in conversations', async () => {
      const result = await parseContent(fixtures.errorConversation);
      expect(result!.hasError).toBe(true);
    });

    it('marks clean conversations as error-free', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.hasError).toBe(false);
    });
  });

  describe('interruption detection', () => {
    it('detects interrupted conversations via toolUseResult', async () => {
      const result = await parseContent(fixtures.interruptedConversation);
      expect(result!.isInterrupted).toBe(true);
    });

    it('marks uninterrupted conversations correctly', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.isInterrupted).toBe(false);
    });
  });

  describe('question detection', () => {
    it('detects questions from AskUserQuestion tool', async () => {
      const result = await parseContent(fixtures.askUserQuestionConversation);
      expect(result!.hasQuestion).toBe(true);
    });

    it('no question in completed conversations', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.hasQuestion).toBe(false);
    });

    it('detects question when last assistant text ends with "?"', async () => {
      const result = await parseContent(fixtures.textEndingWithQuestionConversation);
      expect(result!.hasQuestion).toBe(true);
      expect(result!.status).toBe('needs-input');
    });

    it('no question when text "?" was already answered by user', async () => {
      const result = await parseContent(fixtures.textQuestionAnsweredConversation);
      expect(result!.hasQuestion).toBe(false);
    });
  });

  describe('category classification', () => {
    it('classifies based on conversation content', async () => {
      const result = await parseContent(fixtures.completedConversation);
      // "Fix the login bug" → should be classified as bug
      expect(result!.category).toBe('bug');
    });
  });

  describe('timestamps', () => {
    it('uses JSONL timestamps for createdAt and updatedAt', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
      expect(result!.updatedAt.getTime()).toBeGreaterThanOrEqual(result!.createdAt.getTime());
    });
  });

  // ── BUG regression tests ──────────────────────────────────────────

  describe('BUG1 — sidechain filtering', () => {
    it('returns null for conversations where all messages are sidechain', async () => {
      const result = await parseContent(fixtures.sidechainOnlyConversation);
      expect(result).toBeNull();
    });

    it('ignores sidechain messages when extracting title/description', async () => {
      const result = await parseContent(fixtures.mixedSidechainConversation);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Implement the login page');
      expect(result!.description).not.toContain('Sidechain noise');
    });
  });

  describe('BUG3 — empty/meaningless conversations', () => {
    it('returns null for conversations with only system-reminder content', async () => {
      const result = await parseContent(fixtures.emptyMeaninglessConversation);
      expect(result).toBeNull();
    });

    it('returns null for conversations with only assistant tool-use and no user text', async () => {
      const result = await parseContent(fixtures.noUserTextConversation);
      // No user text, no assistant text → empty conversation
      expect(result).toBeNull();
    });
  });

  describe('rate limit detection', () => {
    it('detects rate limit in assistant text', async () => {
      const result = await parseContent(fixtures.rateLimitConversation);
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(true);
      expect(result!.rateLimitResetDisplay).toBe('10am (Europe/Zurich)');
      expect(result!.rateLimitResetTime).toBeDefined();
    });

    it('detects rate limit in tool_result text', async () => {
      const result = await parseContent(fixtures.rateLimitToolResultConversation);
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(true);
      expect(result!.rateLimitResetDisplay).toBe('2:30pm (America/New_York)');
    });

    it('does not flag resolved rate limits (new activity after limit)', async () => {
      const result = await parseContent(fixtures.rateLimitResolvedConversation);
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(false);
    });

    it('marks rate-limited conversations as needs-input', async () => {
      const result = await parseContent(fixtures.rateLimitConversation);
      expect(result!.status).toBe('needs-input');
    });

    it('clean conversations are not rate-limited', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.isRateLimited).toBe(false);
      expect(result!.rateLimitResetDisplay).toBeUndefined();
      expect(result!.rateLimitResetTime).toBeUndefined();
    });

    // BUG7: stale rate limit from old conversation should be expired
    it('does not flag stale rate limits from old conversations', async () => {
      const result = await parseContent(fixtures.rateLimitStaleConversation);
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(false);
    });

    // BUG7b: rate limit message without a timestamp should not be flagged
    it('does not flag rate limits from messages with no timestamp', async () => {
      const result = await parseContent(fixtures.rateLimitNoTimestampConversation);
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(false);
    });

    // BUG7b: long discussion quoting the rate limit pattern should not trigger
    it('does not flag rate limit text embedded in a discussion', async () => {
      const result = await parseContent(fixtures.rateLimitDiscussionConversation);
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(false);
    });

    // BUG7b: no timestamp + invalid timezone = no parseable data → not rate limited
    it('does not flag rate limits with no timestamp and invalid timezone', async () => {
      const result = await parseContent(fixtures.rateLimitNoDataConversation);
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(false);
    });
  });

  describe('parseResetTime', () => {
    it('parses "10am" in a valid timezone', () => {
      const result = ConversationParser.parseResetTime('10am', 'Europe/Zurich');
      expect(result).toBeDefined();
      // Should be a valid ISO string
      expect(new Date(result!).toISOString()).toBe(result);
    });

    it('parses "2:30pm" format', () => {
      const result = ConversationParser.parseResetTime('2:30pm', 'America/New_York');
      expect(result).toBeDefined();
      const d = new Date(result!);
      // Should be in the future
      expect(d.getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
    });

    it('returns undefined for invalid time format', () => {
      const result = ConversationParser.parseResetTime('invalid', 'UTC');
      expect(result).toBeUndefined();
    });

    it('returns undefined for invalid timezone', () => {
      const result = ConversationParser.parseResetTime('10am', 'Not/A/Timezone');
      expect(result).toBeUndefined();
    });

    // BUG7: parseResetTime with referenceDate anchors to message time, not now
    it('anchors reset time to referenceDate when provided', () => {
      // Reference: Jan 15 2025 at 8am UTC — "resets 10am" in UTC should give Jan 15 10am UTC
      const ref = new Date('2025-01-15T08:00:00Z');
      const result = ConversationParser.parseResetTime('10am', 'UTC', ref);
      expect(result).toBeDefined();
      const d = new Date(result!);
      expect(d.getUTCFullYear()).toBe(2025);
      expect(d.getUTCMonth()).toBe(0); // January
      expect(d.getUTCDate()).toBe(15);
      expect(d.getUTCHours()).toBe(10);
    });

    it('advances to next day when referenceDate is past the stated time', () => {
      // Reference: Jan 15 2025 at 11am UTC — "resets 10am" in UTC should give Jan 16 10am UTC
      const ref = new Date('2025-01-15T11:00:00Z');
      const result = ConversationParser.parseResetTime('10am', 'UTC', ref);
      expect(result).toBeDefined();
      const d = new Date(result!);
      expect(d.getUTCDate()).toBe(16);
      expect(d.getUTCHours()).toBe(10);
    });
  });

  // ── BUG5 — False "needs input" while agent is working ────────────

  describe('BUG5 — active tool execution should not trigger needs-input', () => {
    it('detects in-progress (not needs-input) when Read tool is executing', async () => {
      const result = await parseContent(fixtures.activeToolExecutingConversation);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('in-progress');
      expect(result!.hasQuestion).toBe(false);
    });

    it('detects in-progress (not needs-input) when Task sub-agent is executing', async () => {
      const result = await parseContent(fixtures.activeSubAgentConversation);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('in-progress');
      expect(result!.hasQuestion).toBe(false);
    });

    it('detects in-progress (not needs-input) when Bash tool is executing', async () => {
      const result = await parseContent(fixtures.activeBashConversation);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('in-progress');
      expect(result!.hasQuestion).toBe(false);
    });

    it('detects in-progress (not needs-input) when TodoWrite is executing', async () => {
      const result = await parseContent(fixtures.activeTodoWriteConversation);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('in-progress');
      expect(result!.hasQuestion).toBe(false);
    });

    it('still detects needs-input for AskUserQuestion (not a false positive)', async () => {
      const result = await parseContent(fixtures.askUserQuestionConversation);
      expect(result!.status).toBe('needs-input');
      expect(result!.hasQuestion).toBe(true);
    });

    it('still detects needs-input for question text patterns', async () => {
      const result = await parseContent(fixtures.needsInputConversation);
      expect(result!.status).toBe('needs-input');
    });

    it('does NOT trigger needs-input for "should implement" (BUG5b regex false positive)', async () => {
      const result = await parseContent(fixtures.shouldImplementConversation);
      expect(result).not.toBeNull();
      // "should implement" must not match "should i" pattern
      expect(result!.status).not.toBe('needs-input');
    });

    it('does NOT trigger needs-input when a question was already answered (BUG5b)', async () => {
      const result = await parseContent(fixtures.answeredQuestionConversation);
      expect(result).not.toBeNull();
      // User responded after the question → conversation moved on
      expect(result!.status).not.toBe('needs-input');
    });
  });

  describe('sidechain activity dots', () => {
    it('shows one step per agent with latest status (single agent)', async () => {
      // BUG18: sidechainActivityConversation has 3 entries all from the same
      // agent (same parentUuid 'sc-parent'). Per-agent tracking → 1 step
      // with the final status.
      const result = await parseContent(fixtures.sidechainActivityConversation);
      expect(result).not.toBeNull();
      expect(result!.sidechainSteps).toBeDefined();
      expect(result!.sidechainSteps).toHaveLength(1);
      // Final status: failed (last entry was an error tool_result)
      expect(result!.sidechainSteps![0].status).toBe('failed');
      expect(result!.sidechainSteps![0].toolName).toBe('Bash');
    });

    it('keeps only the last step per agent (single agent = 1 step)', async () => {
      // BUG18: manySidechainStepsConversation has 5 entries all from the same
      // agent (same parentUuid chain root). Per-agent tracking → 1 step.
      const result = await parseContent(fixtures.manySidechainStepsConversation);
      expect(result).not.toBeNull();
      expect(result!.sidechainSteps).toHaveLength(1);
      // Last entry in the chain is Tool4
      expect(result!.sidechainSteps![0].toolName).toBe('Tool4');
    });

    it('returns undefined sidechainSteps when no sidechain entries', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result).not.toBeNull();
      expect(result!.sidechainSteps).toBeUndefined();
    });
  });

  describe('BUG18 — multi-agent sidechain tracking and status override', () => {
    it('shows one dot per distinct agent, not a flat ring buffer', async () => {
      const result = await parseContent(fixtures.multiAgentSidechainConversation);
      expect(result).not.toBeNull();
      expect(result!.sidechainSteps).toBeDefined();
      // 5 distinct agents → 5 sidechain steps (one per agent)
      expect(result!.sidechainSteps).toHaveLength(5);
    });

    it('tracks correct per-agent status (completed, running, failed)', async () => {
      const result = await parseContent(fixtures.multiAgentSidechainConversation);
      expect(result).not.toBeNull();
      const steps = result!.sidechainSteps!;
      // Agent 1: tool_use(Grep) → tool_result(ok) → completed
      expect(steps.find(s => s.toolName === 'Grep')?.status).toBe('completed');
      // Agent 2: tool_use(Read) → still running (no result)
      expect(steps.find(s => s.toolName === 'Read')?.status).toBe('running');
      // Agent 3: tool_use(Bash) → tool_result(error) → failed
      expect(steps.find(s => s.toolName === 'Bash')?.status).toBe('failed');
      // Agent 4: tool_use(Edit) → still running
      expect(steps.find(s => s.toolName === 'Edit')?.status).toBe('running');
      // Agent 5: tool_use(Write) → tool_result(ok) → completed
      expect(steps.find(s => s.toolName === 'Write')?.status).toBe('completed');
    });

    it('detects in-progress (not in-review) when background agents are still running', async () => {
      // BUG18: main thread says "All done!" but agent 2 is still running
      const result = await parseContent(fixtures.completedWithRunningAgentsConversation);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('in-progress');
    });

    it('detects in-review when all background agents have completed', async () => {
      const result = await parseContent(fixtures.sidechainActivityConversation);
      expect(result).not.toBeNull();
      // sidechainActivityConversation: all sidechain entries are completed/failed, main says "All done"
      expect(result!.status).toBe('in-review');
    });
  });

  describe('BUG9 — multi-line markup tag stripping', () => {
    it('returns null for conversations where user message is entirely a multi-line markup block', async () => {
      const result = await parseContent(fixtures.multiLineMarkupOnlyConversation);
      expect(result).toBeNull();
    });

    it('extracts real text from user message that has multi-line markup prefix', async () => {
      const result = await parseContent(fixtures.multiLineMarkupWithRealTextConversation);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Fix the login page');
      expect(result!.title).not.toContain('system-reminder');
    });

    it('strips markup tags from description', async () => {
      const result = await parseContent(fixtures.markupInDescriptionConversation);
      expect(result).not.toBeNull();
      expect(result!.description).not.toContain('system-reminder');
      expect(result!.description).toContain('refactor the API');
    });

    it('strips markup tags from lastMessage', async () => {
      const result = await parseContent(fixtures.markupInLastMessageConversation);
      expect(result).not.toBeNull();
      expect(result!.lastMessage).not.toContain('system-reminder');
      expect(result!.lastMessage).toContain('Dark mode is now available');
    });
  });

  describe('worktree detection', () => {
    it('extracts worktree name from worktree-state entry', async () => {
      const content = [
        fixtures.userMessage('Do some work', 10),
        JSON.stringify({
          type: 'worktree-state',
          uuid: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          sessionId: 'test-session',
          parentUuid: null,
          isSidechain: false,
          worktreeSession: { worktreeName: 'my-feature-branch' },
        }),
        fixtures.assistantMessage('Done', 9),
      ].join('\n');
      const result = await parseContent(content);
      expect(result).not.toBeNull();
      expect(result!.worktreeName).toBe('my-feature-branch');
    });

    it('returns undefined worktree when no worktree-state entry', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result).not.toBeNull();
      expect(result!.worktreeName).toBeUndefined();
    });

    it('returns undefined worktree after null worktreeSession', async () => {
      const content = [
        fixtures.userMessage('Do some work', 10),
        JSON.stringify({
          type: 'worktree-state',
          uuid: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          sessionId: 'test-session',
          parentUuid: null,
          isSidechain: false,
          worktreeSession: null,
        }),
        fixtures.assistantMessage('Done', 9),
      ].join('\n');
      const result = await parseContent(content);
      expect(result).not.toBeNull();
      expect(result!.worktreeName).toBeUndefined();
    });

    it('parses worktree based on latest worktree-state entry', async () => {
      const content = [
        fixtures.userMessage('Do some work', 10),
        JSON.stringify({
          type: 'worktree-state',
          uuid: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          sessionId: 'test-session',
          parentUuid: null,
          isSidechain: false,
          worktreeSession: { worktreeName: 'first-branch' },
        }),
        fixtures.assistantMessage('Done', 9),
        fixtures.userMessage('Do some more work', 8),
        JSON.stringify({
          type: 'worktree-state',
          uuid: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          sessionId: 'test-session',
          parentUuid: null,
          isSidechain: false,
          worktreeSession: null
        }),
        fixtures.assistantMessage('Done', 7)
      ].join('\n');
      const result = await parseContent(content);
      expect(result).not.toBeNull();
      expect(result!.worktreeName).toBeUndefined();
    });
  });

  describe('message content normalization', () => {
    it('parses string content (collapsed text format)', async () => {
      const content = JSON.stringify({
        type: 'user',
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        sessionId: 'test-session',
        parentUuid: null,
        isSidechain: false,
        message: { role: 'user', content: 'Plain string content' },
      });
      const result = await parseContent(content);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Plain string content');
    });

    it('parses single content block (non-array format)', async () => {
      const content = JSON.stringify({
        type: 'user',
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        sessionId: 'test-session',
        parentUuid: null,
        isSidechain: false,
        message: { role: 'user', content: { type: 'text', text: 'Single block content' } },
      });
      const result = await parseContent(content);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Single block content');
    });
  });
});
