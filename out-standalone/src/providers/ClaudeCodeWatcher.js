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
exports.ClaudeCodeWatcher = void 0;
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const ConversationParser_1 = require("./ConversationParser");
const SummaryService_1 = require("../services/SummaryService");
const constants_1 = require("../constants");
/** Patterns that identify OS temp/system directories to auto-exclude in standalone mode. */
const EXCLUDED_PATH_PATTERNS = [
    /\/var\/folders\//, // macOS temp (also /private/var/folders/)
    /\/tmp\//, // Unix /tmp
    /\\Temp\\/i, // Windows %TEMP%
    /\/\.Trash\//, // macOS Trash
    /\\Recycle\.Bin\\/i, // Windows Recycle Bin
];
class ClaudeCodeWatcher {
    _stateManager;
    _platform;
    _watcherDisposable;
    _parser;
    _summaryService;
    _imageGenerator;
    _claudePath;
    _excludedWorkspacePath;
    _iconPending = new Set();
    /** Clear the pending-icon set so regeneration can pick up all conversations. */
    clearPendingIcons() {
        this._iconPending.clear();
    }
    constructor(_stateManager, _platform, imageGenerator) {
        this._stateManager = _stateManager;
        this._platform = _platform;
        this._parser = new ConversationParser_1.ConversationParser();
        this._summaryService = new SummaryService_1.SummaryService();
        this._imageGenerator = imageGenerator;
        this._summaryService.init(_platform);
        this._claudePath = this.getClaudePath();
        // When running in Extension Development Host, exclude the extension's own
        // workspace so that development conversations don't appear in the EDH board.
        if (_platform.isDevelopmentMode()) {
            this._excludedWorkspacePath = _platform.getExtensionPath();
            if (this._excludedWorkspacePath) {
                console.log(`Claudine: Development mode — excluding extension workspace: ${this._excludedWorkspacePath}`);
            }
        }
    }
    /** Resolved path to the Claude Code data directory. */
    get claudePath() {
        return this._claudePath;
    }
    /** Whether the file system watcher is active. */
    get isWatching() {
        return this._watcherDisposable !== undefined;
    }
    /** Number of files held in the incremental parse cache. */
    get parseCacheSize() {
        return this._parser.cacheSize;
    }
    getClaudePath() {
        const configPath = this._platform.getConfig('claudeCodePath', '~/.claude');
        return configPath.replace('~', os.homedir());
    }
    startWatching() {
        this.setupFileWatcher();
        // Initial scan
        this.refresh();
    }
    /** Set up the file system watcher without triggering an initial scan. */
    setupFileWatcher() {
        // Watch the Claude Code projects directory for JSONL changes
        const projectsPath = path.join(this._claudePath, 'projects');
        try {
            this._watcherDisposable = this._platform.watchFiles(projectsPath, '**/*.jsonl', {
                onCreate: (filePath) => this.onFileChanged(filePath),
                onChange: (filePath) => this.onFileChanged(filePath),
                onDelete: (filePath) => this.onFileDeleted(filePath)
            });
            console.log(`Claudine: Watching ${projectsPath} for changes`);
        }
        catch (error) {
            console.error('Claudine: Error setting up file watcher', error);
        }
    }
    stopWatching() {
        if (this._watcherDisposable) {
            this._watcherDisposable.dispose();
            this._watcherDisposable = undefined;
        }
    }
    async refresh() {
        try {
            const conversations = await this.scanForConversations();
            console.log(`Claudine: Found ${conversations.length} conversations`);
            this._stateManager.setConversations(conversations);
            // Kick off async summarization for uncached conversations (non-blocking)
            this._summaryService.summarizeUncached(conversations, (id, summary) => {
                const existing = this._stateManager.getConversation(id);
                if (existing) {
                    this._stateManager.updateConversation({
                        ...existing,
                        originalTitle: existing.originalTitle || existing.title,
                        originalDescription: existing.originalDescription || existing.description,
                        title: summary.title,
                        description: summary.description,
                        lastMessage: summary.lastMessage
                    });
                }
            });
            // Kick off async icon generation for conversations without icons
            this.generateIcons(conversations);
        }
        catch (error) {
            console.error('Claudine: Error refreshing conversations', error);
        }
    }
    async onFileChanged(filePath) {
        // Only process top-level JSONL files (not subagent files)
        if (this.isSubagentFile(filePath))
            return;
        // Skip files from the extension's own workspace when in EDH
        if (this._excludedWorkspacePath && this.isFromExcludedWorkspace(filePath))
            return;
        // BUG2: Only process files that belong to the current workspace's project
        // directory. The file watcher covers all projects, so we must filter here.
        if (!this.isFromCurrentWorkspace(filePath))
            return;
        try {
            const conversation = await this._parser.parseFile(filePath);
            if (conversation) {
                this._summaryService.applyCached(conversation);
                this._stateManager.updateConversation(conversation);
                // Kick off async summarization if not cached
                if (!this._summaryService.hasCached(conversation.id)) {
                    this._summaryService.summarizeUncached([conversation], (id, summary) => {
                        const existing = this._stateManager.getConversation(id);
                        if (existing) {
                            this._stateManager.updateConversation({
                                ...existing,
                                originalTitle: existing.originalTitle || existing.title,
                                originalDescription: existing.originalDescription || existing.description,
                                title: summary.title,
                                description: summary.description,
                                lastMessage: summary.lastMessage
                            });
                        }
                    });
                }
            }
        }
        catch (error) {
            console.error(`Claudine: Error parsing file ${filePath}`, error);
        }
    }
    onFileDeleted(filePath) {
        this._parser.clearCache(filePath);
        const conversationId = path.basename(filePath, '.jsonl');
        if (conversationId) {
            this._stateManager.removeConversation(conversationId);
        }
    }
    isSubagentFile(filePath) {
        return filePath.includes(`${path.sep}subagents${path.sep}`);
    }
    isFromExcludedWorkspace(filePath) {
        if (!this._excludedWorkspacePath)
            return false;
        const encodedExcluded = this.encodeWorkspacePath(this._excludedWorkspacePath);
        return filePath.includes(`${path.sep}${encodedExcluded}${path.sep}`);
    }
    /** BUG2: Check whether a JSONL file belongs to one of the current workspace's
     *  project directories. When no workspace is open, allow all files (fallback). */
    isFromCurrentWorkspace(filePath) {
        const workspaceFolders = this._platform.getWorkspaceFolders();
        if (!workspaceFolders || workspaceFolders.length === 0)
            return true; // fallback: no workspace → allow all
        for (const folder of workspaceFolders) {
            if (this._excludedWorkspacePath && folder === this._excludedWorkspacePath)
                continue;
            const encodedPath = this.encodeWorkspacePath(folder);
            if (filePath.includes(`${path.sep}${encodedPath}${path.sep}`))
                return true;
        }
        return false;
    }
    async scanForConversations() {
        const conversations = [];
        const projectsPath = path.join(this._claudePath, 'projects');
        // Determine which project directories to scan
        const projectDirs = this.getProjectDirsToScan(projectsPath);
        console.log(`Claudine: Scanning ${projectDirs.length} project directories`);
        for (const projectDir of projectDirs) {
            try {
                const entries = fs.readdirSync(projectDir, { withFileTypes: true });
                for (const entry of entries) {
                    // Only process top-level .jsonl files (session conversations)
                    if (!entry.isFile() || !entry.name.endsWith('.jsonl'))
                        continue;
                    const filePath = path.join(projectDir, entry.name);
                    try {
                        const conversation = await this._parser.parseFile(filePath);
                        if (conversation) {
                            conversations.push(conversation);
                        }
                    }
                    catch (error) {
                        console.error(`Claudine: Error parsing ${filePath}`, error);
                    }
                }
            }
            catch (error) {
                console.error(`Claudine: Error reading directory ${projectDir}`, error);
            }
        }
        // Apply cached summaries (instant, no API calls)
        for (const conv of conversations) {
            this._summaryService.applyCached(conv);
        }
        // Merge with saved board state (for manual overrides like done/cancelled)
        await this.mergeSavedState(conversations);
        return conversations;
    }
    getProjectDirsToScan(projectsPath) {
        const dirs = [];
        try {
            if (!fs.existsSync(projectsPath)) {
                console.warn(`Claudine: Projects path does not exist: ${projectsPath}`);
                return dirs;
            }
            const workspaceFolders = this._platform.getWorkspaceFolders();
            if (workspaceFolders && workspaceFolders.length > 0) {
                // Only scan project directories that match the current workspace
                for (const folder of workspaceFolders) {
                    // Skip the extension's own workspace when running in EDH
                    if (this._excludedWorkspacePath && folder === this._excludedWorkspacePath) {
                        console.log(`Claudine: Skipping extension dev workspace: ${folder}`);
                        continue;
                    }
                    const encodedPath = this.encodeWorkspacePath(folder);
                    const projectDir = path.join(projectsPath, encodedPath);
                    console.log(`Claudine: Workspace "${folder}" → encoded "${encodedPath}"`);
                    if (fs.existsSync(projectDir)) {
                        dirs.push(projectDir);
                        console.log(`Claudine: Matched project dir: ${projectDir}`);
                    }
                    else {
                        console.warn(`Claudine: No project dir found for workspace: ${projectDir}`);
                    }
                }
            }
            else {
                // No workspace open — scan all projects as fallback
                console.log('Claudine: No workspace folders, scanning all projects');
                const entries = fs.readdirSync(projectsPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory())
                        continue;
                    const exclusion = ClaudeCodeWatcher.isExcludedProjectDir(entry.name);
                    if (exclusion.excluded) {
                        console.log(`Claudine: Auto-excluding project dir "${entry.name}" — ${exclusion.reason}`);
                        continue;
                    }
                    dirs.push(path.join(projectsPath, entry.name));
                }
            }
        }
        catch (error) {
            console.error('Claudine: Error listing project directories', error);
        }
        return dirs;
    }
    /**
     * Encode a workspace path the same way Claude Code does.
     * /Users/matthias/Development/foo → -Users-matthias-Development-foo
     */
    encodeWorkspacePath(workspacePath) {
        return workspacePath.replace(/\//g, '-');
    }
    // ── Project discovery & progressive scanning (standalone) ─────────
    /**
     * Decode an encoded project directory name back to a path approximation.
     * e.g. "-Users-matthias-Development-foo" → "/Users/matthias/Development/foo"
     */
    static decodeProjectDirName(encodedName) {
        return '/' + encodedName.replace(/^-/, '').replace(/-/g, '/');
    }
    /**
     * Check whether an encoded project directory name corresponds to an OS
     * temp/system directory that should be auto-excluded from scanning.
     */
    static isExcludedProjectDir(encodedDirName) {
        const decoded = ClaudeCodeWatcher.decodeProjectDirName(encodedDirName);
        for (const pattern of EXCLUDED_PATH_PATTERNS) {
            if (pattern.test(decoded)) {
                return { excluded: true, reason: `Temp/system path (${pattern.source})` };
            }
        }
        return { excluded: false };
    }
    /**
     * Quickly enumerate all project directories and count their .jsonl files
     * without parsing any of them. Returns a manifest suitable for the UI.
     */
    discoverProjects() {
        const projectsPath = path.join(this._claudePath, 'projects');
        if (!fs.existsSync(projectsPath))
            return [];
        const entries = fs.readdirSync(projectsPath, { withFileTypes: true });
        const manifest = [];
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const exclusion = ClaudeCodeWatcher.isExcludedProjectDir(entry.name);
            const projectDir = path.join(projectsPath, entry.name);
            let fileCount = 0;
            try {
                const files = fs.readdirSync(projectDir, { withFileTypes: true });
                fileCount = files.filter(f => f.isFile() && f.name.endsWith('.jsonl')).length;
            }
            catch {
                // Skip unreadable dirs
            }
            if (fileCount === 0)
                continue;
            const decoded = ClaudeCodeWatcher.decodeProjectDirName(entry.name);
            const segments = decoded.split('/').filter(Boolean);
            const name = segments[segments.length - 1] || entry.name;
            manifest.push({
                encodedPath: entry.name,
                decodedPath: decoded,
                name,
                fileCount,
                enabled: !exclusion.excluded,
                autoExcluded: exclusion.excluded,
                excludeReason: exclusion.reason,
            });
        }
        return manifest;
    }
    /**
     * Scan enabled projects one at a time, emitting results after each project.
     * Yields to the event loop periodically to keep the server responsive.
     */
    async scanProjectsProgressively(enabledProjects, onProgress, onProjectScanned) {
        const projectsPath = path.join(this._claudePath, 'projects');
        const allConversations = [];
        const totalProjects = enabledProjects.length;
        const totalFiles = enabledProjects.reduce((sum, p) => sum + p.fileCount, 0);
        let scannedProjects = 0;
        let scannedFiles = 0;
        for (const project of enabledProjects) {
            const projectDir = path.join(projectsPath, project.encodedPath);
            const projectConvs = [];
            onProgress({ scannedProjects, totalProjects, scannedFiles, totalFiles, currentProject: project.name });
            try {
                const entries = fs.readdirSync(projectDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isFile() || !entry.name.endsWith('.jsonl'))
                        continue;
                    const filePath = path.join(projectDir, entry.name);
                    try {
                        const conversation = await this._parser.parseFile(filePath);
                        if (conversation) {
                            projectConvs.push(conversation);
                        }
                    }
                    catch (error) {
                        console.error(`Claudine: Error parsing ${filePath}`, error);
                    }
                    scannedFiles++;
                    // Yield to the event loop every 50 files to keep the server responsive
                    if (scannedFiles % 50 === 0) {
                        await new Promise(resolve => setImmediate(resolve));
                    }
                }
            }
            catch (error) {
                console.error(`Claudine: Error reading directory ${projectDir}`, error);
            }
            // Apply cached summaries
            for (const conv of projectConvs) {
                this._summaryService.applyCached(conv);
            }
            allConversations.push(...projectConvs);
            scannedProjects++;
            onProjectScanned(project.decodedPath || project.name, projectConvs);
        }
        // Merge with saved board state
        await this.mergeSavedState(allConversations);
        onProgress({ scannedProjects: totalProjects, totalProjects, scannedFiles: totalFiles, totalFiles, currentProject: '' });
        return allConversations;
    }
    /**
     * Search JSONL conversation files for a query string.
     * Returns conversation IDs that contain the query (case-insensitive).
     */
    searchConversations(query) {
        if (!query.trim())
            return [];
        const q = query.toLowerCase();
        const matchingIds = [];
        const projectsPath = path.join(this._claudePath, 'projects');
        const projectDirs = this.getProjectDirsToScan(projectsPath);
        for (const projectDir of projectDirs) {
            try {
                const entries = fs.readdirSync(projectDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isFile() || !entry.name.endsWith('.jsonl'))
                        continue;
                    const filePath = path.join(projectDir, entry.name);
                    try {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        if (content.toLowerCase().includes(q)) {
                            matchingIds.push(path.basename(entry.name, '.jsonl'));
                        }
                    }
                    catch {
                        // skip unreadable files
                    }
                }
            }
            catch {
                // skip unreadable dirs
            }
        }
        return matchingIds;
    }
    /**
     * Generate icons for conversations that don't have one yet.
     * Checks for referenced images first, then falls back to AI generation.
     */
    async generateIcons(conversations) {
        const needsIcon = conversations.filter(c => !c.icon && !this._iconPending.has(c.id));
        if (needsIcon.length === 0)
            return;
        for (const conv of needsIcon) {
            this._iconPending.add(conv.id);
            try {
                let icon;
                // 1. Try using a referenced image from the conversation
                if (conv.referencedImage) {
                    icon = this.readImageAsDataUri(conv.referencedImage);
                }
                // 2. Fall back to AI-generated icon
                if (!icon && this._imageGenerator) {
                    icon = await this._imageGenerator.generateIcon(conv.id, conv.title, conv.description);
                }
                // 3. Fall back to deterministic placeholder pattern
                if (!icon && this._imageGenerator) {
                    icon = this._imageGenerator.generatePlaceholderIcon(conv.id, conv.category);
                }
                if (icon) {
                    this._stateManager.setConversationIcon(conv.id, icon);
                }
            }
            catch (error) {
                console.error(`Claudine: Error generating icon for ${conv.id}`, error);
            }
            finally {
                this._iconPending.delete(conv.id);
            }
        }
    }
    /**
     * Read an image file and return it as a data URI.
     * Returns undefined if the file doesn't exist or is too large (>512KB).
     */
    readImageAsDataUri(filePath) {
        try {
            if (!fs.existsSync(filePath))
                return undefined;
            const stats = fs.statSync(filePath);
            if (stats.size > constants_1.MAX_IMAGE_FILE_SIZE_BYTES)
                return undefined;
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase().replace('.', '');
            const mimeMap = {
                png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml'
            };
            const mime = mimeMap[ext] || 'image/png';
            return `data:${mime};base64,${buffer.toString('base64')}`;
        }
        catch {
            return undefined;
        }
    }
    async mergeSavedState(conversations) {
        const workspaceFolders = this._platform.getWorkspaceFolders();
        if (!workspaceFolders)
            return;
        for (const folder of workspaceFolders) {
            const statePath = path.join(folder, '.claudine', 'state.json');
            try {
                if (!fs.existsSync(statePath))
                    continue;
                const stateData = fs.readFileSync(statePath, 'utf-8');
                const state = JSON.parse(stateData);
                if (state.conversations) {
                    for (const saved of state.conversations) {
                        const existing = conversations.find(c => c.id === saved.id);
                        if (existing) {
                            // Preserve manual status overrides
                            if (saved.status === 'done' || saved.status === 'cancelled' || saved.status === 'archived') {
                                existing.status = saved.status;
                            }
                            // Preserve previousStatus for active→inactive transitions
                            if (saved.previousStatus) {
                                existing.previousStatus = saved.previousStatus;
                            }
                            // Preserve generated icon
                            if (saved.icon) {
                                existing.icon = saved.icon;
                            }
                        }
                    }
                }
            }
            catch {
                // .claudine state doesn't exist yet
            }
        }
    }
}
exports.ClaudeCodeWatcher = ClaudeCodeWatcher;
//# sourceMappingURL=ClaudeCodeWatcher.js.map