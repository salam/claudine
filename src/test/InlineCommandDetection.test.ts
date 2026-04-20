import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fsp from 'fs/promises';
import { ConversationParser } from '../providers/ConversationParser';
import { userMessage, assistantMessage } from './fixtures/sample-conversations';

vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 1024 }),
  readFile: vi.fn().mockResolvedValue(''),
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  open: vi.fn(),
}));

const mockStat = vi.mocked(fsp.stat);
const mockReadFile = vi.mocked(fsp.readFile);

describe('Inline Command Detection', () => {
  let parser: ConversationParser;

  beforeEach(() => {
    parser = new ConversationParser();
    vi.clearAllMocks();
    vi.mocked(fsp.access).mockRejectedValue(new Error('ENOENT'));
  });

  function parseContent(content: string, filePath = '/home/user/.claude/projects/test-project/abc123.jsonl') {
    const bytes = Buffer.byteLength(content, 'utf-8');
    mockStat.mockResolvedValue({ size: bytes } as any);
    mockReadFile.mockResolvedValue(content);
    return parser.parseFile(filePath);
  }

  describe('basic command parsing', () => {
    it('detects /claudine done in a user message', async () => {
      const content = [
        userMessage('fix the bug', 10, { uuid: 'msg-1' }),
        assistantMessage('Done!', 9),
        userMessage('/claudine done', 5, { uuid: 'msg-2' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands).toBeDefined();
      expect(result!.pendingCommands).toHaveLength(1);
      expect(result!.pendingCommands![0].type).toBe('done');
      expect(result!.pendingCommands![0].id).toBe('msg-2:cmd-0');
    });

    it('detects /claudine archive', async () => {
      const content = [
        userMessage('/claudine archive', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands).toHaveLength(1);
      expect(result!.pendingCommands![0].type).toBe('archive');
    });

    it('detects /claudine cancel', async () => {
      const content = [
        userMessage('/claudine cancel', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands![0].type).toBe('cancel');
    });

    it('detects /claudine review', async () => {
      const content = [
        userMessage('/claudine review', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands![0].type).toBe('review');
    });

    it('detects /claudine todo', async () => {
      const content = [
        userMessage('/claudine todo', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands![0].type).toBe('todo');
    });
  });

  describe('commands with arguments', () => {
    it('parses /claudine category bug', async () => {
      const content = [
        userMessage('/claudine category bug', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands).toHaveLength(1);
      expect(result!.pendingCommands![0].type).toBe('category');
      expect(result!.pendingCommands![0].argument).toBe('bug');
    });

    it('parses /claudine title Fix login flow', async () => {
      const content = [
        userMessage('/claudine title Fix login flow', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands).toHaveLength(1);
      expect(result!.pendingCommands![0].type).toBe('title');
      expect(result!.pendingCommands![0].argument).toBe('Fix login flow');
    });

    it('parses /claudine done T-3 with target short ID', async () => {
      const content = [
        userMessage('/claudine done T-3', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands).toHaveLength(1);
      expect(result!.pendingCommands![0].type).toBe('done');
      expect(result!.pendingCommands![0].target).toBe('T-3');
    });
  });

  describe('edge cases', () => {
    it('does NOT detect commands in assistant messages', async () => {
      const content = [
        userMessage('help', 10, { uuid: 'msg-1' }),
        assistantMessage('/claudine done', 9),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands ?? []).toHaveLength(0);
    });

    it('detects multiple commands in one message', async () => {
      const content = [
        userMessage('/claudine done\nAlso: /claudine category bug', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands).toHaveLength(2);
      expect(result!.pendingCommands![0].type).toBe('done');
      expect(result!.pendingCommands![1].type).toBe('category');
    });

    it('is case-insensitive', async () => {
      const content = [
        userMessage('/Claudine DONE', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands).toHaveLength(1);
      expect(result!.pendingCommands![0].type).toBe('done');
    });

    it('does not falsely detect non-command mentions of claudine', async () => {
      const content = [
        userMessage('I asked claudine about the bug', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands ?? []).toHaveLength(0);
    });

    it('does not detect unknown commands', async () => {
      const content = [
        userMessage('/claudine explode', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands ?? []).toHaveLength(0);
    });

    it('aggregates commands from all user messages', async () => {
      const content = [
        userMessage('/claudine category bug', 10, { uuid: 'msg-1' }),
        assistantMessage('OK', 9),
        userMessage('/claudine done', 5, { uuid: 'msg-2' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands).toHaveLength(2);
      expect(result!.pendingCommands![0].type).toBe('category');
      expect(result!.pendingCommands![1].type).toBe('done');
    });

    it('detects command embedded in longer text', async () => {
      const content = [
        userMessage('I think we are done here.\n/claudine done\nThanks!', 5, { uuid: 'msg-1' }),
      ].join('\n');

      const result = await parseContent(content);
      expect(result!.pendingCommands).toHaveLength(1);
      expect(result!.pendingCommands![0].type).toBe('done');
    });
  });
});
