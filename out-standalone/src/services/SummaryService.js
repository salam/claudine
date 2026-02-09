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
exports.SummaryService = void 0;
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const constants_1 = require("../constants");
/** Minimal env passed to child processes — avoids leaking user secrets. */
const CHILD_ENV = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG,
    TERM: process.env.TERM
};
class SummaryService {
    _cache = {};
    _pending = new Set();
    _claudeAvailable;
    _claudePath;
    _platform;
    init(platform) {
        this._platform = platform;
        this._cache = platform.getGlobalState('summaryCache', {});
    }
    /** Apply cached summary to a conversation. Returns true if cache hit. */
    applyCached(conversation) {
        const cached = this._cache[conversation.id];
        if (!cached)
            return false;
        conversation.originalTitle = conversation.title;
        conversation.originalDescription = conversation.description;
        conversation.title = cached.title;
        conversation.description = cached.description;
        conversation.lastMessage = cached.lastMessage;
        return true;
    }
    /** Check whether a conversation already has a cached summary. */
    hasCached(id) {
        return id in this._cache;
    }
    /** Remove cache entries for conversations that no longer exist. */
    pruneCache(activeIds) {
        let pruned = false;
        for (const id of Object.keys(this._cache)) {
            if (!activeIds.has(id)) {
                delete this._cache[id];
                pruned = true;
            }
        }
        if (pruned) {
            this.saveCache();
        }
    }
    /**
     * Summarize uncached conversations via the Claude Code CLI.
     * Fire-and-forget: calls onUpdate for each completed summary.
     */
    summarizeUncached(conversations, onUpdate) {
        // Check setting
        const enabled = this._platform?.getConfig('enableSummarization', false) ?? false;
        if (!enabled)
            return;
        // Prune stale entries on each scan cycle
        this.pruneCache(new Set(conversations.map(c => c.id)));
        const uncached = conversations.filter(c => !this._cache[c.id] && !this._pending.has(c.id));
        if (uncached.length === 0)
            return;
        for (const c of uncached)
            this._pending.add(c.id);
        this.processBatches(uncached, onUpdate).catch(error => {
            console.error('Claudine: Summarization failed', error);
        });
    }
    async processBatches(conversations, onUpdate) {
        if (this._claudeAvailable === undefined) {
            this._claudeAvailable = await this.checkClaudeAvailable();
        }
        if (!this._claudeAvailable) {
            for (const c of conversations)
                this._pending.delete(c.id);
            return;
        }
        for (let i = 0; i < conversations.length; i += constants_1.SUMMARIZATION_BATCH_SIZE) {
            const batch = conversations.slice(i, i + constants_1.SUMMARIZATION_BATCH_SIZE);
            try {
                const summaries = await this.callClaude(batch);
                for (let j = 0; j < batch.length && j < summaries.length; j++) {
                    const conv = batch[j];
                    const raw = summaries[j];
                    if (raw) {
                        const summary = {
                            title: raw.title || conv.title,
                            description: raw.description || conv.description,
                            lastMessage: raw.lastMessage || conv.lastMessage
                        };
                        this._cache[conv.id] = summary;
                        this._pending.delete(conv.id);
                        onUpdate(conv.id, summary);
                    }
                }
                this.saveCache();
            }
            catch (error) {
                console.error('Claudine: Summarization batch failed', error);
                for (const c of batch)
                    this._pending.delete(c.id);
            }
        }
    }
    callClaude(conversations) {
        return new Promise((resolve, reject) => {
            const entries = conversations.map((c, i) => `${i + 1}.\n  title: ${c.title.slice(0, constants_1.SUMMARIZATION_TITLE_MAX_LENGTH)}\n  desc: ${c.description.slice(0, constants_1.SUMMARIZATION_DESC_MAX_LENGTH)}\n  latest: ${c.lastMessage.slice(0, constants_1.SUMMARIZATION_MESSAGE_MAX_LENGTH)}`).join('\n\n');
            const prompt = `Summarize these coding conversations for compact Kanban board cards.
Rules per entry:
- title: max 8 words, imperative style (e.g. "Fix login page auth bug")
- description: 1 sentence, max 15 words
- lastMessage: keep as-is or shorten to 1 line

${entries}

Return ONLY a JSON array in the same order: [{"title":"...","description":"...","lastMessage":"..."}]`;
            let stdout = '';
            let stderr = '';
            const claudePath = this._claudePath;
            const child = (0, child_process_1.spawn)(claudePath, ['-p'], {
                cwd: os.tmpdir(),
                timeout: constants_1.CLI_TIMEOUT_MS,
                env: CHILD_ENV
            });
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            child.on('error', (err) => reject(err));
            child.on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error(`claude exited with code ${code}`));
                }
                try {
                    const match = stdout.match(/\[[\s\S]*\]/);
                    if (!match)
                        return reject(new Error('No JSON array in Claude response'));
                    const results = JSON.parse(match[0]);
                    if (!Array.isArray(results))
                        return reject(new Error('Claude response is not an array'));
                    resolve(results.map((r) => ({
                        title: typeof r.title === 'string' ? r.title : undefined,
                        description: typeof r.description === 'string' ? r.description : undefined,
                        lastMessage: typeof r.lastMessage === 'string' ? r.lastMessage : undefined,
                    })));
                }
                catch (e) {
                    reject(e);
                }
            });
            child.stdin.write(prompt);
            child.stdin.end();
        });
    }
    checkClaudeAvailable() {
        return new Promise((resolve) => {
            // Resolve the absolute path to `claude` via `which` to avoid shell: true
            (0, child_process_1.execFile)('which', ['claude'], { timeout: constants_1.CLI_CHECK_TIMEOUT_MS, env: CHILD_ENV }, (err, stdout) => {
                if (err || !stdout.trim()) {
                    console.log('Claudine: Claude CLI not found in PATH, skipping summarization');
                    return resolve(false);
                }
                this._claudePath = stdout.trim();
                const child = (0, child_process_1.spawn)(this._claudePath, ['--version'], { timeout: constants_1.CLI_CHECK_TIMEOUT_MS, env: CHILD_ENV });
                child.on('error', () => {
                    console.log('Claudine: Claude CLI not available, skipping summarization');
                    resolve(false);
                });
                child.on('close', (code) => {
                    if (code !== 0) {
                        console.log('Claudine: Claude CLI not available, skipping summarization');
                    }
                    resolve(code === 0);
                });
            });
        });
    }
    saveCache() {
        this._platform?.setGlobalState('summaryCache', this._cache);
    }
}
exports.SummaryService = SummaryService;
//# sourceMappingURL=SummaryService.js.map