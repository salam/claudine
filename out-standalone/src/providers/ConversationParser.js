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
exports.ConversationParser = void 0;
const path = __importStar(require("path"));
const fsp = __importStar(require("fs/promises"));
const CategoryClassifier_1 = require("../services/CategoryClassifier");
const constants_1 = require("../constants");
/** Maximum number of sidechain activity steps to retain (ring buffer). */
const MAX_SIDECHAIN_STEPS = 3;
class ConversationParser {
    _classifier;
    _cache = new Map();
    constructor() {
        this._classifier = new CategoryClassifier_1.CategoryClassifier();
    }
    /** Number of files currently held in the incremental parse cache. */
    get cacheSize() {
        return this._cache.size;
    }
    /** Clear the parse cache for a specific file (e.g. on deletion). */
    clearCache(filePath) {
        this._cache.delete(filePath);
    }
    /** Promote a key to most-recently-used and evict the oldest if over limit. */
    touchCache(key, value) {
        this._cache.delete(key);
        this._cache.set(key, value);
        if (this._cache.size > constants_1.MAX_PARSE_CACHE_ENTRIES) {
            // Map iterates in insertion order — first key is the oldest
            const oldest = this._cache.keys().next().value;
            if (oldest !== undefined) {
                this._cache.delete(oldest);
            }
        }
    }
    async parseFile(filePath) {
        try {
            if (!filePath.endsWith('.jsonl'))
                return null;
            const cached = this._cache.get(filePath);
            let fileSize;
            try {
                fileSize = (await fsp.stat(filePath)).size;
            }
            catch {
                return null;
            }
            if (fileSize === 0)
                return null;
            // If the file shrank (e.g. was rewritten), invalidate the cache
            if (cached && cached.byteOffset > fileSize) {
                this._cache.delete(filePath);
                return this.parseFile(filePath);
            }
            // Incremental: read only from where we left off
            if (cached && cached.byteOffset === fileSize) {
                // No new data — promote in LRU and rebuild from cached messages
                this.touchCache(filePath, cached);
                if (cached.messages.length === 0)
                    return null;
                return await this.buildConversation(filePath, cached.messages, cached.firstTimestamp, cached.lastTimestamp, cached.gitBranch, cached.sidechainSteps);
            }
            if (cached && cached.byteOffset < fileSize) {
                const result = await this.parseIncremental(filePath, cached, fileSize);
                this.touchCache(filePath, cached);
                return result;
            }
            // First read: full parse
            return await this.parseFullFile(filePath, fileSize);
        }
        catch (error) {
            console.error(`Claudine: Error parsing file ${filePath}:`, error);
            return null;
        }
    }
    async parseFullFile(filePath, fileSize) {
        const content = await fsp.readFile(filePath, 'utf-8');
        if (!content.trim())
            return null;
        const cache = {
            byteOffset: fileSize,
            messages: [],
            sidechainSteps: [],
            firstTimestamp: undefined,
            lastTimestamp: undefined,
            gitBranch: undefined,
        };
        this.parseLines(content, cache);
        this.touchCache(filePath, cache);
        if (cache.messages.length === 0)
            return null;
        return await this.buildConversation(filePath, cache.messages, cache.firstTimestamp, cache.lastTimestamp, cache.gitBranch, cache.sidechainSteps);
    }
    async parseIncremental(filePath, cached, fileSize) {
        // Read only the new bytes appended since last parse
        const handle = await fsp.open(filePath, 'r');
        try {
            const newSize = fileSize - cached.byteOffset;
            const buffer = Buffer.alloc(newSize);
            await handle.read(buffer, 0, newSize, cached.byteOffset);
            const newContent = buffer.toString('utf-8');
            this.parseLines(newContent, cached);
            cached.byteOffset = fileSize;
        }
        finally {
            await handle.close();
        }
        if (cached.messages.length === 0)
            return null;
        return await this.buildConversation(filePath, cached.messages, cached.firstTimestamp, cached.lastTimestamp, cached.gitBranch, cached.sidechainSteps);
    }
    /** Parse raw JSONL lines and accumulate results into the cache. */
    parseLines(content, cache) {
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const entry = JSON.parse(trimmed);
                if (entry.timestamp) {
                    if (!cache.firstTimestamp)
                        cache.firstTimestamp = entry.timestamp;
                    cache.lastTimestamp = entry.timestamp;
                }
                if (entry.gitBranch && entry.gitBranch !== 'HEAD') {
                    cache.gitBranch = entry.gitBranch;
                }
                if ((entry.type !== 'user' && entry.type !== 'assistant') || !entry.message) {
                    continue;
                }
                // BUG1: Skip sidechain entries from main message list — they are branched
                // sub-conversations. But collect their status as activity dots.
                if (entry.isSidechain) {
                    this.collectSidechainStep(entry, cache);
                    continue;
                }
                const parsed = this.parseMessage(entry);
                if (parsed) {
                    cache.messages.push(parsed);
                }
            }
            catch {
                // Skip malformed lines
            }
        }
    }
    /** Extract a sidechain activity step from a sidechain JSONL entry. */
    collectSidechainStep(entry, cache) {
        if (!entry.message)
            return;
        const content = entry.message.content || [];
        const role = entry.message.role;
        // Find the first tool_use or tool_result to determine status
        const toolUse = content.find(b => b.type === 'tool_use' && b.name);
        const toolResult = content.find(b => b.type === 'tool_result');
        const toolName = toolUse?.name;
        let step;
        if (role === 'assistant' && toolUse) {
            // Assistant dispatching a tool → running
            step = { status: 'running', toolName };
        }
        else if (role === 'user' && toolResult) {
            // Tool result returned — check for error
            const isError = toolResult.is_error === true;
            const resultText = typeof toolResult.content === 'string' ? toolResult.content : '';
            const hasErrorPattern = isError || /error|exit code [1-9]/i.test(resultText);
            step = { status: hasErrorPattern ? 'failed' : 'completed', toolName };
        }
        else if (role === 'assistant' && content.some(b => b.type === 'text' && b.text)) {
            // Assistant text response (no tool_use) → completed
            step = { status: 'completed' };
        }
        else {
            return; // Not informative enough to show
        }
        cache.sidechainSteps.push(step);
        // Keep only the last N steps
        if (cache.sidechainSteps.length > MAX_SIDECHAIN_STEPS) {
            cache.sidechainSteps.splice(0, cache.sidechainSteps.length - MAX_SIDECHAIN_STEPS);
        }
    }
    parseMessage(entry) {
        if (!entry.message)
            return null;
        const role = entry.message.role;
        if (role !== 'user' && role !== 'assistant')
            return null;
        const contentBlocks = entry.message.content || [];
        const textParts = [];
        const toolUses = [];
        let hasError = false;
        let isInterrupted = false;
        let hasQuestion = false;
        let isRateLimited = false;
        let rateLimitResetDisplay;
        let rateLimitResetTime;
        for (const block of contentBlocks) {
            if (block.type === 'text' && block.text) {
                textParts.push(block.text);
                // Detect rate limit message in assistant text
                const rlMatch = block.text.match(constants_1.RATE_LIMIT_PATTERN);
                if (rlMatch) {
                    isRateLimited = true;
                    const timeStr = rlMatch[1]; // e.g. "10am"
                    const tz = rlMatch[2]; // e.g. "Europe/Zurich"
                    rateLimitResetDisplay = `${timeStr} (${tz})`;
                    rateLimitResetTime = ConversationParser.parseResetTime(timeStr, tz);
                }
            }
            else if (block.type === 'tool_use' && block.name) {
                toolUses.push({
                    name: block.name,
                    input: this.trimToolInput(block.name, block.input || {}),
                });
                // AskUserQuestion = interactive question (yes/no/multiple choice)
                if (block.name === 'AskUserQuestion' || block.name === 'ExitPlanMode') {
                    hasQuestion = true;
                }
            }
            else if (block.type === 'tool_result') {
                const resultText = typeof block.content === 'string'
                    ? block.content
                    : Array.isArray(block.content)
                        ? block.content.filter(b => b.type === 'text').map(b => b.text || '').join('\n')
                        : '';
                if (/tool interrupted/i.test(resultText)) {
                    isInterrupted = true;
                }
                if (/API Error:\s*\d{3}/i.test(resultText)) {
                    hasError = true;
                }
                // Also check tool results for rate limit messages
                const rlMatch = resultText.match(constants_1.RATE_LIMIT_PATTERN);
                if (rlMatch) {
                    isRateLimited = true;
                    const timeStr = rlMatch[1];
                    const tz = rlMatch[2];
                    rateLimitResetDisplay = `${timeStr} (${tz})`;
                    rateLimitResetTime = ConversationParser.parseResetTime(timeStr, tz);
                }
            }
        }
        // Entry-level toolUseResult.interrupted flag (set by Claude Code runtime)
        if (entry.toolUseResult?.interrupted) {
            isInterrupted = true;
        }
        const textContent = textParts.join('\n');
        return {
            role,
            textContent,
            toolUses,
            timestamp: entry.timestamp,
            gitBranch: entry.gitBranch,
            hasError,
            isInterrupted,
            hasQuestion,
            isRateLimited,
            rateLimitResetDisplay,
            rateLimitResetTime
        };
    }
    /** Keep only the fields we actually use from tool inputs, discarding large payloads. */
    trimToolInput(toolName, input) {
        // Task tool: keep subagent_type + description for agent detection
        if (toolName === 'Task') {
            const trimmed = {};
            if (input.subagent_type)
                trimmed.subagent_type = input.subagent_type;
            if (input.description)
                trimmed.description = input.description;
            return trimmed;
        }
        // Read tool: keep file_path for image detection
        if (toolName === 'Read') {
            const trimmed = {};
            if (input.file_path)
                trimmed.file_path = input.file_path;
            return trimmed;
        }
        // AskUserQuestion: keep question for display
        if (toolName === 'AskUserQuestion') {
            const trimmed = {};
            if (input.question)
                trimmed.question = input.question;
            return trimmed;
        }
        // All other tools: discard inputs entirely
        return {};
    }
    async buildConversation(filePath, messages, firstTimestamp, lastTimestamp, gitBranch, sidechainSteps = []) {
        const id = this.extractSessionId(filePath);
        const title = this.extractTitle(messages);
        const description = this.extractDescription(messages);
        const lastMessage = this.extractLastMessage(messages);
        // BUG3: Skip empty/meaningless conversations that have no real content.
        if (title === 'Untitled Conversation' && !description && !lastMessage) {
            return null;
        }
        const status = this.detectStatus(messages);
        const category = this._classifier.classify(title, description, messages);
        const agents = this.detectAgents(messages);
        const hasError = this.hasRecentError(messages);
        const isInterrupted = this.hasRecentInterruption(messages);
        const hasQuestion = this.hasRecentQuestion(messages);
        const isRateLimited = this.hasRecentRateLimit(messages);
        const rateLimitInfo = isRateLimited ? this.extractRateLimitInfo(messages) : {};
        const createdAt = firstTimestamp ? new Date(firstTimestamp) : new Date();
        const updatedAt = lastTimestamp ? new Date(lastTimestamp) : new Date();
        return {
            id,
            title,
            description,
            category,
            status,
            lastMessage,
            agents,
            gitBranch: gitBranch || this.detectGitBranchFromMessages(messages),
            hasError,
            errorMessage: hasError ? this.extractErrorMessage(messages) : undefined,
            isInterrupted,
            hasQuestion,
            isRateLimited,
            rateLimitResetDisplay: rateLimitInfo.display,
            rateLimitResetTime: rateLimitInfo.time,
            sidechainSteps: sidechainSteps.length > 0 ? sidechainSteps : undefined,
            referencedImage: this.extractReferencedImage(messages),
            createdAt,
            updatedAt,
            filePath,
            workspacePath: await this.extractWorkspacePath(filePath)
        };
    }
    extractSessionId(filePath) {
        return path.basename(filePath, '.jsonl');
    }
    extractTitle(messages) {
        const firstUser = messages.find(m => m.role === 'user' && m.textContent.trim());
        if (!firstUser)
            return 'Untitled Conversation';
        const content = this.stripMarkupTags(firstUser.textContent.trim());
        if (!content)
            return 'Untitled Conversation';
        const firstLine = content.split('\n')[0];
        return firstLine.length > constants_1.MAX_TITLE_LENGTH ? firstLine.slice(0, constants_1.MAX_TITLE_LENGTH - 3) + '...' : firstLine;
    }
    /** Strip XML-like tags and their content (ide_opened_file, system-reminder, etc.) */
    stripMarkupTags(text) {
        // Limit input length to prevent ReDoS on crafted JSONL data
        const capped = text.length > constants_1.MAX_MARKUP_STRIP_LENGTH ? text.slice(0, constants_1.MAX_MARKUP_STRIP_LENGTH) : text;
        return capped.replace(/<[^>]+>[^<]*<\/[^>]+>/g, '').trim();
    }
    extractDescription(messages) {
        const firstAssistant = messages.find(m => m.role === 'assistant' && m.textContent.trim());
        if (!firstAssistant)
            return '';
        const content = firstAssistant.textContent.trim();
        const firstPara = content.split('\n\n')[0];
        return firstPara.length > constants_1.MAX_DESCRIPTION_LENGTH ? firstPara.slice(0, constants_1.MAX_DESCRIPTION_LENGTH - 3) + '...' : firstPara;
    }
    extractLastMessage(messages) {
        const reversed = [...messages].reverse();
        const lastAssistant = reversed.find(m => m.role === 'assistant' && m.textContent.trim());
        if (!lastAssistant)
            return '';
        const content = lastAssistant.textContent.trim();
        const lines = content.split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1] || '';
        return lastLine.length > constants_1.MAX_LAST_MESSAGE_LENGTH ? lastLine.slice(0, constants_1.MAX_LAST_MESSAGE_LENGTH - 3) + '...' : lastLine;
    }
    detectStatus(messages) {
        if (messages.length === 0)
            return 'todo';
        const hasAssistant = messages.some(m => m.role === 'assistant');
        if (!hasAssistant)
            return 'todo';
        const lastMessage = messages[messages.length - 1];
        const recentMessages = messages.slice(-3);
        if (recentMessages.some(m => m.hasError)) {
            return 'needs-input';
        }
        // Rate-limited conversations are paused — mark as needs-input
        if (recentMessages.some(m => m.isRateLimited)) {
            return 'needs-input';
        }
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistant) {
            const content = lastAssistant.textContent.toLowerCase();
            // Check for tool-based needs-input (AskUserQuestion, permissions)
            if (lastAssistant.toolUses.some(t => t.name === 'AskUserQuestion' ||
                t.name === 'ExitPlanMode')) {
                return 'needs-input';
            }
            // Check for question / approval patterns
            if (/would you like|do you want|should i|please (confirm|approve|review)|which (option|approach)/i.test(content)) {
                return 'needs-input';
            }
            // Check for completion
            if (/\b(all (done|set|changes)|completed?|finished|i've (made|completed|finished|implemented)|successfully|here's a summary)\b/i.test(content)) {
                return 'in-review';
            }
        }
        // Still actively working
        if (lastMessage.role === 'user') {
            return 'in-progress';
        }
        // Last message from assistant with tool uses
        if (lastMessage.role === 'assistant' && lastMessage.toolUses.length > 0) {
            // Recently active → likely waiting for permission approval
            if (this.isRecentlyActive(messages))
                return 'needs-input';
            return 'in-progress';
        }
        return 'in-review';
    }
    detectAgents(messages) {
        const agents = [];
        const seenTypes = new Set();
        agents.push({
            id: 'claude-main',
            name: 'Claude',
            avatar: '',
            isActive: this.isRecentlyActive(messages)
        });
        for (const message of messages) {
            for (const tool of message.toolUses) {
                if (tool.name === 'Task') {
                    const subType = tool.input?.subagent_type;
                    const desc = tool.input?.description;
                    if (subType && !seenTypes.has(subType)) {
                        seenTypes.add(subType);
                        agents.push({
                            id: `agent-${subType}`,
                            name: desc || subType,
                            avatar: '',
                            isActive: false
                        });
                    }
                }
            }
        }
        return agents;
    }
    /** Only flag errors from the latest message exchange (last user msg onward) */
    hasRecentError(messages) {
        // Find the last user message index — everything from there is the latest exchange
        let lastUserIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserIdx = i;
                break;
            }
        }
        if (lastUserIdx === -1)
            return false;
        return messages.slice(lastUserIdx).some(m => m.hasError);
    }
    /** Check if the latest exchange has a tool interruption or stalled session. */
    hasRecentInterruption(messages) {
        // Explicit interrupted flag on any recent message
        let lastUserIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserIdx = i;
                break;
            }
        }
        if (lastUserIdx !== -1 && messages.slice(lastUserIdx).some(m => m.isInterrupted)) {
            return true;
        }
        const lastMsg = messages[messages.length - 1];
        // User cancelled mid-tool: "Request interrupted by user" / "[interrupted]"
        if (lastMsg.role === 'user' && /interrupted by user|request interrupted|\[interrupted\]/i.test(lastMsg.textContent)) {
            return true;
        }
        // Last message is assistant with tool_use but no user response.
        // If recently active → waiting for permission (not interrupted).
        // If stale → session was interrupted/abandoned.
        if (lastMsg.role === 'assistant' && lastMsg.toolUses.length > 0 && !lastMsg.hasQuestion) {
            return !this.isRecentlyActive(messages);
        }
        return false;
    }
    /** Check if the last assistant message asks an explicit question or awaits permission. */
    hasRecentQuestion(messages) {
        // If the conversation was interrupted after the question, it's not a pending question
        if (this.hasRecentInterruption(messages))
            return false;
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
        if (!lastAssistant)
            return false;
        if (lastAssistant.hasQuestion)
            return true;
        // Pending tool_use on a recently active conversation → waiting for permission
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'assistant' && lastMsg.toolUses.length > 0 && this.isRecentlyActive(messages)) {
            return true;
        }
        return false;
    }
    /** Check if any recent message carries a rate limit notice. */
    hasRecentRateLimit(messages) {
        let lastUserIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserIdx = i;
                break;
            }
        }
        if (lastUserIdx === -1)
            return false;
        return messages.slice(lastUserIdx).some(m => m.isRateLimited);
    }
    /** Extract rate limit reset info from the most recent rate-limited message. */
    extractRateLimitInfo(messages) {
        for (const msg of [...messages].reverse()) {
            if (msg.isRateLimited) {
                return { display: msg.rateLimitResetDisplay, time: msg.rateLimitResetTime };
            }
        }
        return {};
    }
    /**
     * Parse a human-readable reset time (e.g. "10am", "2:30pm") in a given timezone
     * into the next occurrence as an ISO 8601 string.
     */
    static parseResetTime(timeStr, timezone) {
        try {
            // Parse the time components from strings like "10am", "2:30pm", "10 am"
            const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
            if (!match)
                return undefined;
            let hours = parseInt(match[1], 10);
            const minutes = match[2] ? parseInt(match[2], 10) : 0;
            const meridiem = match[3].toLowerCase();
            if (meridiem === 'pm' && hours < 12)
                hours += 12;
            if (meridiem === 'am' && hours === 12)
                hours = 0;
            // Get the current time in the target timezone
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            const parts = formatter.formatToParts(now);
            const get = (type) => parts.find(p => p.type === type)?.value || '0';
            const currentYear = parseInt(get('year'), 10);
            const currentMonth = parseInt(get('month'), 10);
            const currentDay = parseInt(get('day'), 10);
            const currentHour = parseInt(get('hour'), 10);
            const currentMinute = parseInt(get('minute'), 10);
            // Build a date in the target timezone for today at the reset time.
            // If that time has passed already, advance to tomorrow.
            let resetDay = currentDay;
            if (hours < currentHour || (hours === currentHour && minutes <= currentMinute)) {
                resetDay += 1;
            }
            // Construct the date string in the target timezone and convert to UTC
            // Use a temporary Date with the timezone offset to find the real UTC moment
            const tzDate = new Date(`${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(resetDay).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
            // Re-interpret through the formatter to get the correct UTC offset
            const utcFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            });
            // Find the UTC time that corresponds to the target local time
            // by checking what local time `tzDate` maps to in the target timezone
            const localParts = utcFormatter.formatToParts(tzDate);
            const localHour = parseInt(localParts.find(p => p.type === 'hour')?.value || '0', 10);
            const localMinute = parseInt(localParts.find(p => p.type === 'minute')?.value || '0', 10);
            // Calculate the offset in minutes between what we want and what we got
            const wantedMinutes = hours * 60 + minutes;
            const gotMinutes = localHour * 60 + localMinute;
            const offsetMs = (gotMinutes - wantedMinutes) * 60 * 1000;
            const corrected = new Date(tzDate.getTime() - offsetMs);
            // If the corrected time is in the past, add 24 hours
            if (corrected.getTime() <= now.getTime()) {
                corrected.setTime(corrected.getTime() + 24 * 60 * 60 * 1000);
            }
            return corrected.toISOString();
        }
        catch {
            return undefined;
        }
    }
    isRecentlyActive(messages) {
        const last = messages[messages.length - 1];
        if (!last?.timestamp)
            return false;
        return (Date.now() - new Date(last.timestamp).getTime()) < constants_1.RECENTLY_ACTIVE_WINDOW_MS;
    }
    extractErrorMessage(messages) {
        for (const msg of [...messages.slice(-5)].reverse()) {
            if (msg.hasError) {
                // Match "API Error: 500 ..." pattern
                const apiMatch = msg.textContent.match(/API Error:\s*\d{3}\s*(.{0,100})/i);
                if (apiMatch)
                    return `API Error: ${apiMatch[0].slice(0, 100)}`;
                // Fallback: "Tool interrupted"
                return 'Tool interrupted';
            }
        }
        return 'An error occurred';
    }
    detectGitBranchFromMessages(messages) {
        for (const msg of [...messages].reverse()) {
            if (msg.gitBranch && msg.gitBranch !== 'HEAD')
                return msg.gitBranch;
        }
        for (const msg of messages) {
            const match = msg.textContent.match(/(?:branch|checkout\s+-b)\s+([a-zA-Z0-9\-_/]+)/i);
            if (match)
                return match[1];
        }
        return undefined;
    }
    static IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;
    /**
     * Find the first image file referenced in the conversation.
     * Checks Read tool calls and user text for @-referenced image paths.
     */
    extractReferencedImage(messages) {
        // 1. Check Read tool_use inputs for image file paths
        for (const msg of messages) {
            for (const tool of msg.toolUses) {
                if (tool.name === 'Read') {
                    const fp = tool.input?.file_path;
                    if (fp && ConversationParser.IMAGE_EXTENSIONS.test(fp)) {
                        return fp;
                    }
                }
            }
        }
        // 2. Check user text for file paths that look like images
        for (const msg of messages) {
            if (msg.role !== 'user')
                continue;
            // Match absolute paths or relative paths ending in image extensions
            const match = msg.textContent.match(/(?:^|\s|@)((?:\/|\.\.?\/)[^\s]+\.(png|jpe?g|gif|webp|svg))\b/i);
            if (match)
                return match[1];
        }
        return undefined;
    }
    /**
     * Extract the workspace path from a conversation file path.
     * The encoded directory name (e.g. `-Users-matthias-Development-ai-stick`) is lossy
     * — dashes in the original path are indistinguishable from separator dashes.
     * Instead of guessing, check the actual filesystem for matching paths.
     */
    async extractWorkspacePath(filePath) {
        const parts = filePath.split(path.sep);
        const projectsIndex = parts.indexOf('projects');
        if (projectsIndex === -1 || !parts[projectsIndex + 1])
            return undefined;
        const encoded = parts[projectsIndex + 1]; // e.g. "-Users-matthias-Development-ai-stick"
        const segments = encoded.split('-').filter(Boolean); // ["Users","matthias","Development","ai","stick"]
        // Greedily rebuild the path by checking which combinations exist on disk
        let current = path.sep;
        let i = 0;
        while (i < segments.length) {
            // Try joining progressively more segments with hyphens to handle names like "ai-stick"
            let found = false;
            for (let len = segments.length - i; len >= 1; len--) {
                const candidate = segments.slice(i, i + len).join('-');
                const testPath = path.join(current, candidate);
                if (await this.pathExists(testPath)) {
                    current = testPath;
                    i += len;
                    found = true;
                    break;
                }
            }
            if (!found) {
                // Can't resolve — fall back to simple single-segment
                current = path.join(current, segments[i]);
                i++;
            }
        }
        return (await this.pathExists(current)) ? current : undefined;
    }
    async pathExists(p) {
        try {
            await fsp.access(p);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.ConversationParser = ConversationParser;
//# sourceMappingURL=ConversationParser.js.map