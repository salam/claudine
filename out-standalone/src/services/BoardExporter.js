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
exports.exportToCsv = exportToCsv;
exports.exportToJson = exportToJson;
exports.exportToTrelloJson = exportToTrelloJson;
exports.importFromJson = importFromJson;
exports.promptExport = promptExport;
exports.promptImport = promptImport;
const vscode = __importStar(require("vscode"));
function toExportable(conv) {
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
function escapeCsv(value) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
function exportToCsv(conversations) {
    const headers = ['ID', 'Title', 'Description', 'Category', 'Status', 'Last Message', 'Git Branch', 'Has Error', 'Created At', 'Updated At'];
    const rows = conversations.map(c => {
        const e = toExportable(c);
        return [e.id, e.title, e.description, e.category, e.status, e.lastMessage, e.gitBranch || '', String(e.hasError), e.createdAt, e.updatedAt]
            .map(escapeCsv)
            .join(',');
    });
    return [headers.join(','), ...rows].join('\n');
}
function exportToJson(conversations, workspace) {
    const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        workspace,
        conversations: conversations.map(toExportable),
    };
    return JSON.stringify(data, null, 2);
}
function exportToTrelloJson(conversations, boardName) {
    const lists = [
        { id: 'todo', name: 'To Do' },
        { id: 'needs-input', name: 'Needs Input' },
        { id: 'in-progress', name: 'In Progress' },
        { id: 'in-review', name: 'In Review' },
        { id: 'done', name: 'Done' },
        { id: 'cancelled', name: 'Cancelled' },
        { id: 'archived', name: 'Archived' },
    ];
    const categoryLabels = {
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
function importFromJson(content) {
    try {
        const data = JSON.parse(content);
        if (data.version !== 1 || !Array.isArray(data.conversations)) {
            return null;
        }
        return data.conversations.map(c => ({
            ...c,
            agents: [],
            isInterrupted: false,
            hasQuestion: false,
            isRateLimited: false,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.updatedAt),
        }));
    }
    catch {
        return null;
    }
}
async function promptExport(conversations) {
    const format = await vscode.window.showQuickPick([
        { label: '$(file) CSV', description: 'Comma-separated values (spreadsheets)', format: 'csv' },
        { label: '$(json) JSON', description: 'Claudine board format (re-importable)', format: 'json' },
        { label: '$(symbol-namespace) Trello JSON', description: 'Trello-compatible board export', format: 'trello' },
    ], {
        placeHolder: vscode.l10n.t('Select export format'),
    });
    if (!format)
        return;
    const workspace = vscode.workspace.workspaceFolders?.[0]?.name || 'Claudine';
    let content;
    let defaultName;
    let filters;
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
    if (!uri)
        return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    vscode.window.showInformationMessage(vscode.l10n.t('Board exported to {0}', uri.fsPath));
}
async function promptImport() {
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON': ['json'] },
        openLabel: vscode.l10n.t('Import Board'),
    });
    if (!uris || uris.length === 0)
        return null;
    const content = await vscode.workspace.fs.readFile(uris[0]);
    const conversations = importFromJson(Buffer.from(content).toString('utf-8'));
    if (!conversations) {
        vscode.window.showErrorMessage(vscode.l10n.t('Invalid Claudine board file.'));
        return null;
    }
    vscode.window.showInformationMessage(vscode.l10n.t('Imported {0} conversation(s).', conversations.length));
    return conversations;
}
//# sourceMappingURL=BoardExporter.js.map