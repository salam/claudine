import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InlineCommandRouter } from '../services/InlineCommandRouter';
import type { InlineCommand, AgentCommand, AgentCommandResult } from '../types';

function makeCommand(overrides: Partial<InlineCommand> = {}): InlineCommand {
  return {
    id: 'msg-1:cmd-0',
    type: 'done',
    timestamp: '2025-01-01T12:00:00Z',
    ...overrides,
  };
}

function successResult(commandId: string): AgentCommandResult {
  return { commandId, success: true, timestamp: new Date().toISOString() };
}

describe('InlineCommandRouter', () => {
  let router: InlineCommandRouter;
  let mockCommandProcessor: { executeCommand: ReturnType<typeof vi.fn> };
  let mockStorageService: {
    getGlobalSetting: ReturnType<typeof vi.fn>;
    saveGlobalSetting: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCommandProcessor = {
      executeCommand: vi.fn((cmd: AgentCommand) => successResult(cmd.id)),
    };
    mockStorageService = {
      getGlobalSetting: vi.fn((_k: string, d: unknown) => d),
      saveGlobalSetting: vi.fn(),
    };
    router = new InlineCommandRouter(mockCommandProcessor as any);
  });

  describe('command routing', () => {
    it('routes a done command through CommandProcessor', () => {
      router.routeCommands('conv-uuid-1', [makeCommand({ type: 'done' })]);

      expect(mockCommandProcessor.executeCommand).toHaveBeenCalledTimes(1);
      const arg = mockCommandProcessor.executeCommand.mock.calls[0][0] as AgentCommand;
      expect(arg.command).toBe('move');
      expect(arg.status).toBe('done');
      expect(arg.task).toBe('conv-uuid-1');
    });

    it('routes archive command with status archived', () => {
      router.routeCommands('conv-1', [makeCommand({ type: 'archive' })]);

      const arg = mockCommandProcessor.executeCommand.mock.calls[0][0] as AgentCommand;
      expect(arg.command).toBe('move');
      expect(arg.status).toBe('archived');
    });

    it('routes cancel command with status cancelled', () => {
      router.routeCommands('conv-1', [makeCommand({ type: 'cancel' })]);

      const arg = mockCommandProcessor.executeCommand.mock.calls[0][0] as AgentCommand;
      expect(arg.status).toBe('cancelled');
    });

    it('routes review command with status in-review', () => {
      router.routeCommands('conv-1', [makeCommand({ type: 'review' })]);

      const arg = mockCommandProcessor.executeCommand.mock.calls[0][0] as AgentCommand;
      expect(arg.status).toBe('in-review');
    });

    it('routes todo command with status todo', () => {
      router.routeCommands('conv-1', [makeCommand({ type: 'todo' })]);

      const arg = mockCommandProcessor.executeCommand.mock.calls[0][0] as AgentCommand;
      expect(arg.status).toBe('todo');
    });

    it('routes category command as set-category', () => {
      router.routeCommands('conv-1', [makeCommand({ type: 'category', argument: 'bug' })]);

      const arg = mockCommandProcessor.executeCommand.mock.calls[0][0] as AgentCommand;
      expect(arg.command).toBe('set-category');
      expect(arg.category).toBe('bug');
    });

    it('routes title command as update', () => {
      router.routeCommands('conv-1', [makeCommand({ type: 'title', argument: 'Fix login' })]);

      const arg = mockCommandProcessor.executeCommand.mock.calls[0][0] as AgentCommand;
      expect(arg.command).toBe('update');
      expect(arg.title).toBe('Fix login');
    });
  });

  describe('targeting', () => {
    it('defaults target to current conversation UUID', () => {
      router.routeCommands('current-conv-id', [makeCommand()]);

      const arg = mockCommandProcessor.executeCommand.mock.calls[0][0] as AgentCommand;
      expect(arg.task).toBe('current-conv-id');
    });

    it('uses target short ID when specified', () => {
      router.routeCommands('current-conv-id', [makeCommand({ target: 'T-3' })]);

      const arg = mockCommandProcessor.executeCommand.mock.calls[0][0] as AgentCommand;
      expect(arg.task).toBe('T-3');
    });
  });

  describe('deduplication', () => {
    it('does not execute the same command ID twice', () => {
      const cmd = makeCommand({ id: 'msg-1:cmd-0' });

      router.routeCommands('conv-1', [cmd]);
      router.routeCommands('conv-1', [cmd]);

      expect(mockCommandProcessor.executeCommand).toHaveBeenCalledTimes(1);
    });

    it('executes different command IDs independently', () => {
      router.routeCommands('conv-1', [
        makeCommand({ id: 'msg-1:cmd-0' }),
        makeCommand({ id: 'msg-1:cmd-1', type: 'archive' }),
      ]);

      expect(mockCommandProcessor.executeCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe('persistence', () => {
    it('loads processed IDs from storage', async () => {
      mockStorageService.getGlobalSetting.mockReturnValue(['old-cmd-1', 'old-cmd-2']);
      await router.loadProcessedIds(mockStorageService as any);

      // These commands should be skipped as already processed
      router.routeCommands('conv-1', [
        makeCommand({ id: 'old-cmd-1' }),
        makeCommand({ id: 'old-cmd-2' }),
      ]);

      expect(mockCommandProcessor.executeCommand).not.toHaveBeenCalled();
    });

    it('saves processed IDs to storage', async () => {
      router.routeCommands('conv-1', [makeCommand({ id: 'new-cmd-1' })]);
      await router.saveProcessedIds(mockStorageService as any);

      expect(mockStorageService.saveGlobalSetting).toHaveBeenCalledWith(
        'processedInlineCommandIds',
        expect.arrayContaining(['new-cmd-1'])
      );
    });

    it('caps stored IDs at 500', async () => {
      // Process 510 commands
      const commands = Array.from({ length: 510 }, (_, i) =>
        makeCommand({ id: `cmd-${i}` })
      );
      router.routeCommands('conv-1', commands);
      await router.saveProcessedIds(mockStorageService as any);

      const savedIds = mockStorageService.saveGlobalSetting.mock.calls[0][1] as string[];
      expect(savedIds.length).toBe(500);
    });
  });
});
