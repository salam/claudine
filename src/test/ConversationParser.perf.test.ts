/**
 * Regression tests for ConversationParser.
 *
 * These tests lock in current behavior so that performance optimizations
 * (async I/O, cache eviction, streaming parse, diff-based messaging)
 * can be validated without silently breaking functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fsp from 'fs/promises';
import { ConversationParser } from '../providers/ConversationParser';
import * as fixtures from './fixtures/sample-conversations';

// Mock fs/promises module
vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 1024 }),
  readFile: vi.fn().mockResolvedValue(''),
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  readdir: vi.fn().mockResolvedValue([]),
  open: vi.fn(),
}));

const mockStat = vi.mocked(fsp.stat);
const mockReadFile = vi.mocked(fsp.readFile);
const mockReaddir = vi.mocked(fsp.readdir);
const mockOpen = vi.mocked(fsp.open);

const TEST_PATH = '/home/user/.claude/projects/test-project/abc123.jsonl';

describe('ConversationParser — regression tests', () => {
  let parser: ConversationParser;

  beforeEach(() => {
    parser = new ConversationParser();
    vi.clearAllMocks();
    // Restore default mock behavior after clearAllMocks
    mockStat.mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fsp.access).mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockResolvedValue([]);
  });

  function parseContent(content: string, filePath = TEST_PATH) {
    const bytes = Buffer.byteLength(content, 'utf-8');
    mockStat.mockResolvedValue({ size: bytes } as any);
    mockReadFile.mockResolvedValue(content);
    return parser.parseFile(filePath);
  }

  /** Create a mock FileHandle that reads from the given buffer at the given offset. */
  function createMockFileHandle(data: Buffer) {
    return {
      read: vi.fn().mockImplementation(async (buf: Buffer, offset: number, length: number, position: number) => {
        data.copy(buf, offset, 0, Math.min(length, data.length));
        return { bytesRead: Math.min(length, data.length), buffer: buf };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }

  // ---------- Incremental parsing ----------

  describe('incremental parsing', () => {
    it('returns same result on cold parse and incremental re-parse with appended data', async () => {
      // First parse — cold, full content
      const initialContent = fixtures.completedConversation;
      const initialBytes = Buffer.byteLength(initialContent, 'utf-8');

      mockStat.mockResolvedValue({ size: initialBytes } as any);
      mockReadFile.mockResolvedValue(initialContent);
      const first = await parser.parseFile(TEST_PATH);

      // Append new data
      const appended = '\n' + fixtures.assistantMessage('Additional follow-up. All done!', 5);
      const fullBytes = Buffer.byteLength(initialContent + appended, 'utf-8');
      const appendedBuffer = Buffer.from(appended, 'utf-8');

      mockStat.mockResolvedValue({ size: fullBytes } as any);
      mockOpen.mockResolvedValue(createMockFileHandle(appendedBuffer) as any);

      const second = await parser.parseFile(TEST_PATH);

      // Both parses should produce valid conversations
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(second!.id).toBe(first!.id);
      // The title should remain the same (comes from first user message)
      expect(second!.title).toBe(first!.title);
    });

    it('produces identical results on re-parse without changes (cache hit)', async () => {
      const content = fixtures.completedConversation;
      const bytes = Buffer.byteLength(content, 'utf-8');

      mockStat.mockResolvedValue({ size: bytes } as any);
      mockReadFile.mockResolvedValue(content);

      const first = await parser.parseFile(TEST_PATH);
      // Second parse — same size → should use cache, no readFile
      mockReadFile.mockClear();
      const second = await parser.parseFile(TEST_PATH);

      expect(first).toEqual(second);
      // readFile should NOT be called on the cache-hit path
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('invalidates cache when file shrinks', async () => {
      // Parse the full content first
      const fullContent = fixtures.completedConversation;
      const fullBytes = Buffer.byteLength(fullContent, 'utf-8');

      mockStat.mockResolvedValue({ size: fullBytes } as any);
      mockReadFile.mockResolvedValue(fullContent);
      await parser.parseFile(TEST_PATH);

      // Now file is smaller (e.g. rewritten)
      const smallerContent = fixtures.todoConversation;
      const smallerBytes = Buffer.byteLength(smallerContent, 'utf-8');

      mockStat.mockResolvedValue({ size: smallerBytes } as any);
      mockReadFile.mockResolvedValue(smallerContent);

      const result = await parser.parseFile(TEST_PATH);

      // Must return the new content, not stale cache
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Write unit tests for the parser');
    });
  });

  // ---------- Cache isolation ----------

  describe('cache isolation', () => {
    it('maintains independent caches for multiple files', async () => {
      const pathA = '/home/user/.claude/projects/project-a/conv-a.jsonl';
      const pathB = '/home/user/.claude/projects/project-b/conv-b.jsonl';

      const contentA = fixtures.completedConversation;
      const contentB = fixtures.todoConversation;

      // Parse file A
      const bytesA = Buffer.byteLength(contentA, 'utf-8');
      mockStat.mockResolvedValue({ size: bytesA } as any);
      mockReadFile.mockResolvedValue(contentA);
      const resultA = await parser.parseFile(pathA);

      // Parse file B
      const bytesB = Buffer.byteLength(contentB, 'utf-8');
      mockStat.mockResolvedValue({ size: bytesB } as any);
      mockReadFile.mockResolvedValue(contentB);
      const resultB = await parser.parseFile(pathB);

      expect(resultA!.id).toBe('conv-a');
      expect(resultB!.id).toBe('conv-b');
      expect(resultA!.title).not.toBe(resultB!.title);
      expect(parser.cacheSize).toBe(2);
    });

    it('clearCache removes specific file without affecting others', async () => {
      const pathA = '/home/user/.claude/projects/project-a/conv-a.jsonl';
      const pathB = '/home/user/.claude/projects/project-b/conv-b.jsonl';

      // Parse both files
      for (const [p, content] of [[pathA, fixtures.completedConversation], [pathB, fixtures.todoConversation]] as const) {
        const bytes = Buffer.byteLength(content, 'utf-8');
        mockStat.mockResolvedValue({ size: bytes } as any);
        mockReadFile.mockResolvedValue(content);
        await parser.parseFile(p);
      }

      expect(parser.cacheSize).toBe(2);

      // Clear only A
      parser.clearCache(pathA);
      expect(parser.cacheSize).toBe(1);

      // B should still produce cached results without readFile
      const bytesB = Buffer.byteLength(fixtures.todoConversation, 'utf-8');
      mockStat.mockResolvedValue({ size: bytesB } as any);
      mockReadFile.mockClear();
      const resultB = await parser.parseFile(pathB);
      expect(resultB).not.toBeNull();
      expect(resultB!.id).toBe('conv-b');
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });

  // ---------- Large conversations ----------

  describe('large conversations', () => {
    it('parses 500+ messages correctly', async () => {
      const content = fixtures.largeParsableConversation(500);
      const result = await parseContent(content);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Build the authentication system');
      expect(result!.status).toBe('in-review'); // ends with completed assistant message
      expect(result!.agents.length).toBeGreaterThanOrEqual(1); // at least main claude
      expect(result!.lastMessage).toBeTruthy();
    });

    it('extracts tool uses with large inputs correctly', async () => {
      const result = await parseContent(fixtures.largeToolInputConversation);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Refactor the entire codebase');
      // The conversation should still parse fine and detect completion
      expect(result!.status).toBe('in-review');
    });
  });

  // ---------- Timestamp extraction ----------

  describe('timestamp extraction', () => {
    it('uses JSONL timestamps for createdAt and updatedAt, not fs.stat', async () => {
      // The JSONL lines have timestamps embedded (from the ts() helper)
      const content = [
        fixtures.userMessage('Start task', 60),    // 60 min ago
        fixtures.assistantMessage('All done!', 30),  // 30 min ago
      ].join('\n');

      const result = await parseContent(content);

      expect(result).not.toBeNull();
      // createdAt should be ~60 min ago (from JSONL), not the mocked fsp.stat birthtime
      const sixtyMinAgo = Date.now() - 60 * 60 * 1000;
      const thirtyMinAgo = Date.now() - 30 * 60 * 1000;

      expect(Math.abs(result!.createdAt.getTime() - sixtyMinAgo)).toBeLessThan(5000);
      expect(Math.abs(result!.updatedAt.getTime() - thirtyMinAgo)).toBeLessThan(5000);
    });
  });

  // ---------- Workspace path extraction ----------

  describe('workspace path extraction', () => {
    it('handles hyphenated directories in encoded path', async () => {
      // Path encodes /Users/user/my-project as -Users-user-my-project
      const filePath = '/home/user/.claude/projects/-Users-user-my-project/conv.jsonl';
      const content = fixtures.completedConversation;
      const bytes = Buffer.byteLength(content, 'utf-8');

      mockStat.mockResolvedValue({ size: bytes } as any);
      mockReadFile.mockResolvedValue(content);
      // fsp.access rejects by default, so extractWorkspacePath will
      // attempt greedy path reconstruction and eventually return undefined
      const result = await parser.parseFile(filePath);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('conv');
      // workspacePath should be undefined since access rejects
      // (the important thing is it doesn't crash on hyphenated dirs)
      expect(result!.workspacePath).toBeUndefined();
    });
  });

  // ---------- Workspace path reconstruction (dots, underscores, colons) ----------

  describe('workspace path reconstruction via filesystem walk', () => {
    const isWin = process.platform === 'win32';

    interface ReconCase { label: string; filePath: string; tree: Record<string, string[]>; expected: string; }

    // Platform-appropriate test cases: { filePath, readdir tree, expected workspace }.
    // On Windows paths are C:\… with case-folded encoding; on Unix /home/… with no case folding.
    const cases: ReconCase[] = isWin
      ? [
          {
            label: 'dot in directory name',
            filePath: 'C:\\Users\\alice\\.claude\\projects\\c--users-jane-doe-project\\conv.jsonl',
            tree: { 'C:\\': ['Users'], 'C:\\Users': ['jane.doe'], 'C:\\Users\\jane.doe': ['project'] },
            expected: 'C:\\Users\\jane.doe\\project',
          },
          {
            label: 'underscore in directory name',
            filePath: 'C:\\Users\\alice\\.claude\\projects\\c--users-alice-my-project\\conv.jsonl',
            tree: { 'C:\\': ['Users'], 'C:\\Users': ['alice'], 'C:\\Users\\alice': ['my_project'] },
            expected: 'C:\\Users\\alice\\my_project',
          },
          {
            label: 'both dots and underscores',
            filePath: 'C:\\Users\\alice\\.claude\\projects\\c--users-jane-doe-work-my-project\\conv.jsonl',
            tree: { 'C:\\': ['Users'], 'C:\\Users': ['jane.doe_work'], 'C:\\Users\\jane.doe_work': ['my_project'] },
            expected: 'C:\\Users\\jane.doe_work\\my_project',
          },
        ]
      : [
          {
            label: 'dot in directory name',
            filePath: '/home/alice/.claude/projects/-home-jane-doe-project/conv.jsonl',
            tree: { '/': ['home'], '/home': ['jane.doe'], '/home/jane.doe': ['project'] },
            expected: '/home/jane.doe/project',
          },
          {
            label: 'underscore in directory name',
            filePath: '/home/alice/.claude/projects/-home-alice-my-project/conv.jsonl',
            tree: { '/': ['home'], '/home': ['alice'], '/home/alice': ['my_project'] },
            expected: '/home/alice/my_project',
          },
          {
            label: 'both dots and underscores',
            filePath: '/home/alice/.claude/projects/-home-jane-doe-work-my-project/conv.jsonl',
            tree: { '/': ['home'], '/home': ['jane.doe_work'], '/home/jane.doe_work': ['my_project'] },
            expected: '/home/jane.doe_work/my_project',
          },
        ];

    it.each(cases)('reconstructs a path with $label', async ({ filePath, tree, expected }) => {
      const dirent = (name: string) => ({ name, isDirectory: () => true, isFile: () => false });
      mockReaddir.mockImplementation(async (p) => (tree[p as string] ?? []).map(dirent) as any);
      const result = await parseContent(fixtures.completedConversation, filePath);
      expect(result!.workspacePath).toBe(expected);
    });
  });
});
