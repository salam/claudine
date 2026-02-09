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
/**
 * Regression tests for ConversationParser.
 *
 * These tests lock in current behavior so that performance optimizations
 * (async I/O, cache eviction, streaming parse, diff-based messaging)
 * can be validated without silently breaking functionality.
 */
const vitest_1 = require("vitest");
const fsp = __importStar(require("fs/promises"));
const ConversationParser_1 = require("../providers/ConversationParser");
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
const mockOpen = vitest_1.vi.mocked(fsp.open);
const TEST_PATH = '/home/user/.claude/projects/test-project/abc123.jsonl';
(0, vitest_1.describe)('ConversationParser — regression tests', () => {
    let parser;
    (0, vitest_1.beforeEach)(() => {
        parser = new ConversationParser_1.ConversationParser();
        vitest_1.vi.clearAllMocks();
        // Restore default mock behavior after clearAllMocks
        mockStat.mockResolvedValue({ size: 1024 });
        vitest_1.vi.mocked(fsp.access).mockRejectedValue(new Error('ENOENT'));
    });
    function parseContent(content, filePath = TEST_PATH) {
        const bytes = Buffer.byteLength(content, 'utf-8');
        mockStat.mockResolvedValue({ size: bytes });
        mockReadFile.mockResolvedValue(content);
        return parser.parseFile(filePath);
    }
    /** Create a mock FileHandle that reads from the given buffer at the given offset. */
    function createMockFileHandle(data) {
        return {
            read: vitest_1.vi.fn().mockImplementation(async (buf, offset, length, position) => {
                data.copy(buf, offset, 0, Math.min(length, data.length));
                return { bytesRead: Math.min(length, data.length), buffer: buf };
            }),
            close: vitest_1.vi.fn().mockResolvedValue(undefined),
        };
    }
    // ---------- Incremental parsing ----------
    (0, vitest_1.describe)('incremental parsing', () => {
        (0, vitest_1.it)('returns same result on cold parse and incremental re-parse with appended data', async () => {
            // First parse — cold, full content
            const initialContent = fixtures.completedConversation;
            const initialBytes = Buffer.byteLength(initialContent, 'utf-8');
            mockStat.mockResolvedValue({ size: initialBytes });
            mockReadFile.mockResolvedValue(initialContent);
            const first = await parser.parseFile(TEST_PATH);
            // Append new data
            const appended = '\n' + fixtures.assistantMessage('Additional follow-up. All done!', 5);
            const fullBytes = Buffer.byteLength(initialContent + appended, 'utf-8');
            const appendedBuffer = Buffer.from(appended, 'utf-8');
            mockStat.mockResolvedValue({ size: fullBytes });
            mockOpen.mockResolvedValue(createMockFileHandle(appendedBuffer));
            const second = await parser.parseFile(TEST_PATH);
            // Both parses should produce valid conversations
            (0, vitest_1.expect)(first).not.toBeNull();
            (0, vitest_1.expect)(second).not.toBeNull();
            (0, vitest_1.expect)(second.id).toBe(first.id);
            // The title should remain the same (comes from first user message)
            (0, vitest_1.expect)(second.title).toBe(first.title);
        });
        (0, vitest_1.it)('produces identical results on re-parse without changes (cache hit)', async () => {
            const content = fixtures.completedConversation;
            const bytes = Buffer.byteLength(content, 'utf-8');
            mockStat.mockResolvedValue({ size: bytes });
            mockReadFile.mockResolvedValue(content);
            const first = await parser.parseFile(TEST_PATH);
            // Second parse — same size → should use cache, no readFile
            mockReadFile.mockClear();
            const second = await parser.parseFile(TEST_PATH);
            (0, vitest_1.expect)(first).toEqual(second);
            // readFile should NOT be called on the cache-hit path
            (0, vitest_1.expect)(mockReadFile).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('invalidates cache when file shrinks', async () => {
            // Parse the full content first
            const fullContent = fixtures.completedConversation;
            const fullBytes = Buffer.byteLength(fullContent, 'utf-8');
            mockStat.mockResolvedValue({ size: fullBytes });
            mockReadFile.mockResolvedValue(fullContent);
            await parser.parseFile(TEST_PATH);
            // Now file is smaller (e.g. rewritten)
            const smallerContent = fixtures.todoConversation;
            const smallerBytes = Buffer.byteLength(smallerContent, 'utf-8');
            mockStat.mockResolvedValue({ size: smallerBytes });
            mockReadFile.mockResolvedValue(smallerContent);
            const result = await parser.parseFile(TEST_PATH);
            // Must return the new content, not stale cache
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.title).toBe('Write unit tests for the parser');
        });
    });
    // ---------- Cache isolation ----------
    (0, vitest_1.describe)('cache isolation', () => {
        (0, vitest_1.it)('maintains independent caches for multiple files', async () => {
            const pathA = '/home/user/.claude/projects/project-a/conv-a.jsonl';
            const pathB = '/home/user/.claude/projects/project-b/conv-b.jsonl';
            const contentA = fixtures.completedConversation;
            const contentB = fixtures.todoConversation;
            // Parse file A
            const bytesA = Buffer.byteLength(contentA, 'utf-8');
            mockStat.mockResolvedValue({ size: bytesA });
            mockReadFile.mockResolvedValue(contentA);
            const resultA = await parser.parseFile(pathA);
            // Parse file B
            const bytesB = Buffer.byteLength(contentB, 'utf-8');
            mockStat.mockResolvedValue({ size: bytesB });
            mockReadFile.mockResolvedValue(contentB);
            const resultB = await parser.parseFile(pathB);
            (0, vitest_1.expect)(resultA.id).toBe('conv-a');
            (0, vitest_1.expect)(resultB.id).toBe('conv-b');
            (0, vitest_1.expect)(resultA.title).not.toBe(resultB.title);
            (0, vitest_1.expect)(parser.cacheSize).toBe(2);
        });
        (0, vitest_1.it)('clearCache removes specific file without affecting others', async () => {
            const pathA = '/home/user/.claude/projects/project-a/conv-a.jsonl';
            const pathB = '/home/user/.claude/projects/project-b/conv-b.jsonl';
            // Parse both files
            for (const [p, content] of [[pathA, fixtures.completedConversation], [pathB, fixtures.todoConversation]]) {
                const bytes = Buffer.byteLength(content, 'utf-8');
                mockStat.mockResolvedValue({ size: bytes });
                mockReadFile.mockResolvedValue(content);
                await parser.parseFile(p);
            }
            (0, vitest_1.expect)(parser.cacheSize).toBe(2);
            // Clear only A
            parser.clearCache(pathA);
            (0, vitest_1.expect)(parser.cacheSize).toBe(1);
            // B should still produce cached results without readFile
            const bytesB = Buffer.byteLength(fixtures.todoConversation, 'utf-8');
            mockStat.mockResolvedValue({ size: bytesB });
            mockReadFile.mockClear();
            const resultB = await parser.parseFile(pathB);
            (0, vitest_1.expect)(resultB).not.toBeNull();
            (0, vitest_1.expect)(resultB.id).toBe('conv-b');
            (0, vitest_1.expect)(mockReadFile).not.toHaveBeenCalled();
        });
    });
    // ---------- Large conversations ----------
    (0, vitest_1.describe)('large conversations', () => {
        (0, vitest_1.it)('parses 500+ messages correctly', async () => {
            const content = fixtures.largeParsableConversation(500);
            const result = await parseContent(content);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.title).toBe('Build the authentication system');
            (0, vitest_1.expect)(result.status).toBe('in-review'); // ends with completed assistant message
            (0, vitest_1.expect)(result.agents.length).toBeGreaterThanOrEqual(1); // at least main claude
            (0, vitest_1.expect)(result.lastMessage).toBeTruthy();
        });
        (0, vitest_1.it)('extracts tool uses with large inputs correctly', async () => {
            const result = await parseContent(fixtures.largeToolInputConversation);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.title).toBe('Refactor the entire codebase');
            // The conversation should still parse fine and detect completion
            (0, vitest_1.expect)(result.status).toBe('in-review');
        });
    });
    // ---------- Timestamp extraction ----------
    (0, vitest_1.describe)('timestamp extraction', () => {
        (0, vitest_1.it)('uses JSONL timestamps for createdAt and updatedAt, not fs.stat', async () => {
            // The JSONL lines have timestamps embedded (from the ts() helper)
            const content = [
                fixtures.userMessage('Start task', 60), // 60 min ago
                fixtures.assistantMessage('All done!', 30), // 30 min ago
            ].join('\n');
            const result = await parseContent(content);
            (0, vitest_1.expect)(result).not.toBeNull();
            // createdAt should be ~60 min ago (from JSONL), not the mocked fsp.stat birthtime
            const sixtyMinAgo = Date.now() - 60 * 60 * 1000;
            const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
            (0, vitest_1.expect)(Math.abs(result.createdAt.getTime() - sixtyMinAgo)).toBeLessThan(5000);
            (0, vitest_1.expect)(Math.abs(result.updatedAt.getTime() - thirtyMinAgo)).toBeLessThan(5000);
        });
    });
    // ---------- Workspace path extraction ----------
    (0, vitest_1.describe)('workspace path extraction', () => {
        (0, vitest_1.it)('handles hyphenated directories in encoded path', async () => {
            // Path encodes /Users/user/my-project as -Users-user-my-project
            const filePath = '/home/user/.claude/projects/-Users-user-my-project/conv.jsonl';
            const content = fixtures.completedConversation;
            const bytes = Buffer.byteLength(content, 'utf-8');
            mockStat.mockResolvedValue({ size: bytes });
            mockReadFile.mockResolvedValue(content);
            // fsp.access rejects by default, so extractWorkspacePath will
            // attempt greedy path reconstruction and eventually return undefined
            const result = await parser.parseFile(filePath);
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.id).toBe('conv');
            // workspacePath should be undefined since access rejects
            // (the important thing is it doesn't crash on hyphenated dirs)
            (0, vitest_1.expect)(result.workspacePath).toBeUndefined();
        });
    });
});
//# sourceMappingURL=ConversationParser.perf.test.js.map