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
exports.CommandProcessor = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const constants_1 = require("../constants");
const VALID_STATUSES = [
    'todo', 'needs-input', 'in-progress', 'in-review', 'done', 'cancelled', 'archived'
];
const VALID_CATEGORIES = [
    'user-story', 'bug', 'feature', 'improvement', 'task'
];
const MAX_COMMAND_AGE_MS = 5 * 60 * 1000;
class CommandProcessor {
    _stateManager;
    _platform;
    _processedIds = new Set();
    _watcherDisposable;
    _commandsPath;
    _resultsPath;
    constructor(_stateManager, _platform) {
        this._stateManager = _stateManager;
        this._platform = _platform;
    }
    startWatching() {
        const workspaceFolders = this._platform.getWorkspaceFolders();
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }
        const claudinePath = path.join(workspaceFolders[0], '.claudine');
        this._commandsPath = path.join(claudinePath, 'commands.jsonl');
        this._resultsPath = path.join(claudinePath, 'command-results.json');
        this._watcherDisposable = this._platform.watchFiles(claudinePath, 'commands.jsonl', {
            onCreate: () => this.processCommandFile(),
            onChange: () => this.processCommandFile()
        });
        // Process any commands written while the extension was not running
        this.processCommandFile();
    }
    stopWatching() {
        this._watcherDisposable?.dispose();
        this._watcherDisposable = undefined;
    }
    async processCommandFile() {
        if (!this._commandsPath) {
            return;
        }
        if (!fs.existsSync(this._commandsPath)) {
            return;
        }
        let content;
        try {
            content = fs.readFileSync(this._commandsPath, 'utf-8');
        }
        catch {
            return;
        }
        if (!content.trim()) {
            return;
        }
        const lines = content.split('\n').filter(l => l.trim());
        const results = [];
        const now = Date.now();
        for (const line of lines) {
            let command;
            try {
                command = JSON.parse(line);
            }
            catch {
                console.warn('Claudine: Skipping invalid JSON line in commands.jsonl');
                continue;
            }
            if (!command.id || !command.command || !command.task) {
                console.warn('Claudine: Skipping command with missing required fields');
                continue;
            }
            // Idempotency: skip already-processed commands
            if (this._processedIds.has(command.id)) {
                continue;
            }
            // Skip stale commands
            const age = now - new Date(command.timestamp).getTime();
            if (age > MAX_COMMAND_AGE_MS) {
                this._processedIds.add(command.id);
                continue;
            }
            const result = this.executeCommand(command);
            results.push(result);
            this._processedIds.add(command.id);
        }
        // Truncate the commands file
        try {
            fs.writeFileSync(this._commandsPath, '');
        }
        catch {
            console.error('Claudine: Failed to truncate commands.jsonl');
        }
        if (results.length > 0) {
            this.writeResults(results);
            console.log(`Claudine: Processed ${results.length} agent command(s)`);
        }
    }
    executeCommand(command) {
        const base = { commandId: command.id, timestamp: new Date().toISOString() };
        try {
            switch (command.command) {
                case 'move':
                    return this.executeMove(command, base);
                case 'update':
                    return this.executeUpdate(command, base);
                case 'set-category':
                    return this.executeSetCategory(command, base);
                default:
                    return { ...base, success: false, error: `Unknown command: ${command.command}` };
            }
        }
        catch (error) {
            return { ...base, success: false, error: String(error) };
        }
    }
    executeMove(command, base) {
        if (!command.status) {
            return { ...base, success: false, error: 'Missing "status" field for move command' };
        }
        if (!VALID_STATUSES.includes(command.status)) {
            return { ...base, success: false, error: `Invalid status: ${command.status}. Valid: ${VALID_STATUSES.join(', ')}` };
        }
        const conversation = this.resolveTask(command.task);
        if (!conversation) {
            return { ...base, success: false, error: `Task not found: ${command.task}` };
        }
        this._stateManager.moveConversation(conversation.id, command.status);
        return { ...base, success: true };
    }
    executeUpdate(command, base) {
        const conversation = this.resolveTask(command.task);
        if (!conversation) {
            return { ...base, success: false, error: `Task not found: ${command.task}` };
        }
        if (command.title !== undefined) {
            conversation.title = command.title;
        }
        if (command.description !== undefined) {
            conversation.description = command.description;
        }
        conversation.updatedAt = new Date();
        this._stateManager.updateConversation(conversation);
        return { ...base, success: true };
    }
    executeSetCategory(command, base) {
        if (!command.category) {
            return { ...base, success: false, error: 'Missing "category" field for set-category command' };
        }
        if (!VALID_CATEGORIES.includes(command.category)) {
            return { ...base, success: false, error: `Invalid category: ${command.category}. Valid: ${VALID_CATEGORIES.join(', ')}` };
        }
        const conversation = this.resolveTask(command.task);
        if (!conversation) {
            return { ...base, success: false, error: `Task not found: ${command.task}` };
        }
        conversation.category = command.category;
        conversation.updatedAt = new Date();
        this._stateManager.updateConversation(conversation);
        return { ...base, success: true };
    }
    /** Resolve a task identifier to a Conversation. Supports exact ID or title matching. */
    resolveTask(taskIdentifier) {
        // 1. Exact ID match
        const byId = this._stateManager.getConversation(taskIdentifier);
        if (byId) {
            return byId;
        }
        // 2. Title match (case-insensitive)
        const conversations = this._stateManager.getConversations();
        const lower = taskIdentifier.toLowerCase();
        // Exact title match
        const exactTitle = conversations.find(c => c.title.toLowerCase() === lower);
        if (exactTitle) {
            return exactTitle;
        }
        // Substring match
        const substring = conversations.find(c => c.title.toLowerCase().includes(lower));
        if (substring) {
            return substring;
        }
        return undefined;
    }
    writeResults(results) {
        if (!this._resultsPath) {
            return;
        }
        try {
            let existing = [];
            if (fs.existsSync(this._resultsPath)) {
                try {
                    existing = JSON.parse(fs.readFileSync(this._resultsPath, 'utf-8')).results || [];
                }
                catch { /* ignore parse errors */ }
            }
            const all = [...existing, ...results].slice(-constants_1.MAX_COMMAND_RESULTS_HISTORY);
            fs.writeFileSync(this._resultsPath, JSON.stringify({ results: all }, null, 2));
        }
        catch (error) {
            console.error('Claudine: Error writing command results', error);
        }
    }
}
exports.CommandProcessor = CommandProcessor;
//# sourceMappingURL=CommandProcessor.js.map