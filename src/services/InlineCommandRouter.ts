import { CommandProcessor } from './CommandProcessor';
import { StorageService } from './StorageService';
import {
  InlineCommand,
  AgentCommand,
  ConversationStatus,
  ConversationCategory
} from '../types';

const MAX_STORED_IDS = 500;

const STATUS_MAP: Record<string, ConversationStatus> = {
  done: 'done',
  archive: 'archived',
  cancel: 'cancelled',
  review: 'in-review',
  todo: 'todo',
};

export class InlineCommandRouter {
  private _processedIds = new Set<string>();

  constructor(
    private readonly _commandProcessor: CommandProcessor
  ) {}

  public async loadProcessedIds(storageService: StorageService): Promise<void> {
    const ids = storageService.getGlobalSetting<string[]>('processedInlineCommandIds', []);
    for (const id of ids) this._processedIds.add(id);
  }

  public async saveProcessedIds(storageService: StorageService): Promise<void> {
    const ids = Array.from(this._processedIds).slice(-MAX_STORED_IDS);
    await storageService.saveGlobalSetting('processedInlineCommandIds', ids);
  }

  public routeCommands(conversationId: string, commands: InlineCommand[]): void {
    for (const cmd of commands) {
      if (this._processedIds.has(cmd.id)) continue;
      this._processedIds.add(cmd.id);

      const agentCommand = this.toAgentCommand(cmd, conversationId);
      if (agentCommand) {
        this._commandProcessor.executeCommand(agentCommand);
      }
    }
  }

  private toAgentCommand(cmd: InlineCommand, currentConversationId: string): AgentCommand | null {
    const task = cmd.target || currentConversationId;
    const base = { id: cmd.id, timestamp: cmd.timestamp, task };

    const status = STATUS_MAP[cmd.type];
    if (status) {
      return { ...base, command: 'move', status };
    }

    switch (cmd.type) {
      case 'category':
        return { ...base, command: 'set-category', category: cmd.argument as ConversationCategory };
      case 'title':
        return { ...base, command: 'update', title: cmd.argument };
      default:
        return null;
    }
  }
}
