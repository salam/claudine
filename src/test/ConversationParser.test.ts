import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { ConversationParser } from '../providers/ConversationParser';
import * as fixtures from './fixtures/sample-conversations';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  statSync: vi.fn(() => ({
    birthtime: new Date('2025-01-01'),
    mtime: new Date('2025-01-02'),
  })),
  existsSync: vi.fn(() => false),
}));

const mockReadFileSync = vi.mocked(fs.readFileSync);

describe('ConversationParser', () => {
  let parser: ConversationParser;

  beforeEach(() => {
    parser = new ConversationParser();
    vi.clearAllMocks();
  });

  function parseContent(content: string, filePath = '/home/user/.claude/projects/test-project/abc123.jsonl') {
    mockReadFileSync.mockReturnValue(content);
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
  });

  describe('title extraction', () => {
    it('extracts title from first user message', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.title).toBe('Fix the login bug in auth.ts');
    });

    it('truncates long titles to 80 characters', async () => {
      const longText = 'A'.repeat(100);
      const content = [
        fixtures.userMessage(longText, 10),
        fixtures.assistantMessage('OK', 9),
      ].join('\n');
      const result = await parseContent(content);
      expect(result!.title.length).toBeLessThanOrEqual(80);
      expect(result!.title).toMatch(/\.\.\.$/);
    });

    it('strips markup tags from title', async () => {
      const result = await parseContent(fixtures.markupConversation);
      expect(result!.title).toBe('Fix the typo in the header');
      expect(result!.title).not.toContain('ide_opened_file');
    });

    it('returns "Untitled Conversation" when no user text', async () => {
      const content = [
        fixtures.assistantMessage('Hello!', 10),
      ].join('\n');
      // Assistant-only won't produce a conversation (no user message with text)
      // But an assistant message still counts as a message
      const result = await parseContent(content);
      expect(result!.title).toBe('Untitled Conversation');
    });
  });

  describe('description extraction', () => {
    it('extracts description from first assistant message', async () => {
      const result = await parseContent(fixtures.completedConversation);
      expect(result!.description).toContain('fixed the login bug');
    });

    it('truncates long descriptions to 200 characters', async () => {
      const content = [
        fixtures.userMessage('Do something', 10),
        fixtures.assistantMessage('B'.repeat(300), 9),
      ].join('\n');
      const result = await parseContent(content);
      expect(result!.description.length).toBeLessThanOrEqual(200);
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
});
