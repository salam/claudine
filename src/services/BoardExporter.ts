import * as vscode from 'vscode';
import { Conversation, ConversationStatus, ConversationCategory } from '../types';

interface ExportedConversation {
  id: string;
  title: string;
  description: string;
  category: ConversationCategory;
  status: ConversationStatus;
  lastMessage: string;
  gitBranch?: string;
  hasError: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BoardExport {
  version: 1;
  exportedAt: string;
  workspace: string;
  conversations: ExportedConversation[];
}

function toExportable(conv: Conversation): ExportedConversation {
  return {
    id: conv.id,
    title: conv.title,
    description: conv.description,
    category: conv.category,
    status: conv.status,
    lastMessage: conv.lastMessage,
    gitBranch: conv.gitBranch,
    hasError: conv.hasError,
    createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : String(conv.createdAt),
    updatedAt: conv.updatedAt instanceof Date ? conv.updatedAt.toISOString() : String(conv.updatedAt),
  };
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportToCsv(conversations: Conversation[]): string {
  const headers = ['ID', 'Title', 'Description', 'Category', 'Status', 'Last Message', 'Git Branch', 'Has Error', 'Created At', 'Updated At'];
  const rows = conversations.map(c => {
    const e = toExportable(c);
    return [e.id, e.title, e.description, e.category, e.status, e.lastMessage, e.gitBranch || '', String(e.hasError), e.createdAt, e.updatedAt]
      .map(escapeCsv)
      .join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

export function exportToJson(conversations: Conversation[], workspace: string): string {
  const data: BoardExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace,
    conversations: conversations.map(toExportable),
  };
  return JSON.stringify(data, null, 2);
}

export function exportToTrelloJson(conversations: Conversation[], boardName: string): string {
  const lists = [
    { id: 'todo', name: 'To Do' },
    { id: 'needs-input', name: 'Needs Input' },
    { id: 'in-progress', name: 'In Progress' },
    { id: 'in-review', name: 'In Review' },
    { id: 'done', name: 'Done' },
    { id: 'cancelled', name: 'Cancelled' },
    { id: 'archived', name: 'Archived' },
  ];

  const categoryLabels: Record<ConversationCategory, { name: string; color: string }> = {
    'bug': { name: 'Bug', color: 'red' },
    'user-story': { name: 'User Story', color: 'blue' },
    'feature': { name: 'Feature', color: 'green' },
    'improvement': { name: 'Improvement', color: 'yellow' },
    'task': { name: 'Task', color: 'black' },
  };

  const cards = conversations.map(c => ({
    name: c.title,
    desc: c.description + (c.lastMessage ? `\n\nLast message: ${c.lastMessage}` : ''),
    idList: c.status,
    labels: [categoryLabels[c.category]],
    due: null,
    closed: c.status === 'archived',
  }));

  return JSON.stringify({
    name: boardName,
    lists,
    cards,
    labels: Object.values(categoryLabels),
  }, null, 2);
}

export function importFromJson(content: string): Conversation[] | null {
  try {
    const data = JSON.parse(content) as BoardExport;
    if (data.version !== 1 || !Array.isArray(data.conversations)) {
      return null;
    }
    return data.conversations.map(c => ({
      ...c,
      agents: [],
      isInterrupted: false,
      hasQuestion: false,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    }));
  } catch {
    return null;
  }
}

export async function promptExport(conversations: Conversation[]): Promise<void> {
  const format = await vscode.window.showQuickPick([
    { label: '$(file) CSV', description: 'Comma-separated values (spreadsheets)', format: 'csv' as const },
    { label: '$(json) JSON', description: 'Claudine board format (re-importable)', format: 'json' as const },
    { label: '$(symbol-namespace) Trello JSON', description: 'Trello-compatible board export', format: 'trello' as const },
  ], {
    placeHolder: vscode.l10n.t('Select export format'),
  });

  if (!format) return;

  const workspace = vscode.workspace.workspaceFolders?.[0]?.name || 'Claudine';
  let content: string;
  let defaultName: string;
  let filters: Record<string, string[]>;

  switch (format.format) {
    case 'csv':
      content = exportToCsv(conversations);
      defaultName = `claudine-board.csv`;
      filters = { 'CSV': ['csv'] };
      break;
    case 'json':
      content = exportToJson(conversations, workspace);
      defaultName = `claudine-board.json`;
      filters = { 'JSON': ['json'] };
      break;
    case 'trello':
      content = exportToTrelloJson(conversations, `Claudine — ${workspace}`);
      defaultName = `claudine-trello.json`;
      filters = { 'JSON': ['json'] };
      break;
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultName),
    filters,
  });

  if (!uri) return;

  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
  vscode.window.showInformationMessage(vscode.l10n.t('Board exported to {0}', uri.fsPath));
}

export async function promptImport(): Promise<Conversation[] | null> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'JSON': ['json'] },
    openLabel: vscode.l10n.t('Import Board'),
  });

  if (!uris || uris.length === 0) return null;

  const content = await vscode.workspace.fs.readFile(uris[0]);
  const conversations = importFromJson(Buffer.from(content).toString('utf-8'));

  if (!conversations) {
    vscode.window.showErrorMessage(vscode.l10n.t('Invalid Claudine board file.'));
    return null;
  }

  vscode.window.showInformationMessage(
    vscode.l10n.t('Imported {0} conversation(s).', conversations.length)
  );
  return conversations;
}
