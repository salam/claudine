"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StandaloneMessageHandler = void 0;
/** Default locale strings for standalone mode (English). */
const DEFAULT_LOCALE = {
    'column.todo': 'To Do',
    'column.needsInput': 'Needs Input',
    'column.inProgress': 'In Progress',
    'column.inReview': 'In Review',
    'column.done': 'Done',
    'column.cancelled': 'Cancelled',
    'column.archived': 'Archived',
    'board.emptyTitle': 'Welcome to Claudine',
    'board.emptyStep1': 'Start a Claude Code session in any project',
    'board.emptyStep2': 'Claudine will pick up conversations in real time',
    'board.emptyStep3': 'Drag cards between columns to track progress',
    'board.quickIdea': 'Quick idea...',
    'board.addIdea': 'Add idea',
    'card.dragToMove': 'Drag to move',
    'card.errorOccurred': 'Error occurred',
    'card.toolInterrupted': 'Tool interrupted',
    'card.waitingForInput': 'Waiting for input',
    'card.currentlyViewing': 'Currently viewing this conversation',
    'card.latest': 'Latest:',
    'card.openInSourceControl': 'Open in source control',
    'card.respond': 'Respond',
    'card.expandCard': 'Expand card',
    'card.collapseCard': 'Collapse card',
    'card.taskIcon': 'Task icon',
    'card.deleteIdea': 'Delete idea',
    'card.startConversation': 'Start conversation',
    'card.describeIdea': 'Describe your idea...',
    'search.placeholder': 'Search conversations...',
    'search.fade': 'Fade',
    'search.hide': 'Hide',
    'toolbar.search': 'Search conversations',
    'toolbar.compactView': 'Toggle compact / full view',
    'toolbar.expandCollapse': 'Expand / Collapse all',
    'toolbar.refresh': 'Refresh conversations',
    'toolbar.closeTabs': 'Close empty & duplicate Claude tabs',
    'toolbar.settings': 'Settings',
    'toolbar.about': 'About Claudine',
    'settings.title': 'Settings',
    'settings.imageGeneration': 'Image Generation',
    'settings.none': 'None',
    'settings.openai': 'OpenAI (DALL-E 3)',
    'settings.stability': 'Stability AI',
    'settings.apiKey': 'API Key',
    'settings.saved': 'Saved',
    'settings.regenerate': 'Regenerate Thumbnails',
    'filter.title': 'Filter by category',
    'filter.clear': 'Clear filter',
    'prompt.placeholder': 'Send a message...',
    'prompt.send': 'Send message',
    'close': 'Close',
};
/**
 * Handles WebSocket messages in standalone mode.
 * Mirrors `KanbanViewProvider.handleWebviewMessage` but without VSCode APIs.
 */
class StandaloneMessageHandler {
    _stateManager;
    _claudeCodeWatcher;
    _platform;
    _send;
    /** Fingerprints of last-sent conversations, keyed by ID. */
    _lastSentFingerprints = new Map();
    /** Whether the initial progressive scan has completed. */
    _initialScanDone = false;
    /** Cached project manifest from the most recent discovery. */
    _manifest = [];
    constructor(_stateManager, _claudeCodeWatcher, _platform, _send) {
        this._stateManager = _stateManager;
        this._claudeCodeWatcher = _claudeCodeWatcher;
        this._platform = _platform;
        this._send = _send;
    }
    handleMessage(message) {
        switch (message.type) {
            case 'ready':
                this.onReady();
                break;
            case 'moveConversation':
                this._stateManager.moveConversation(message.conversationId, message.newStatus);
                break;
            case 'refreshConversations':
                this.progressiveRefresh();
                break;
            case 'search': {
                const ids = this._claudeCodeWatcher.searchConversations(message.query);
                this._send({ type: 'searchResults', query: message.query, ids });
                break;
            }
            case 'toggleSummarization': {
                // In standalone mode, toggle the config value in the JSON file
                const current = this._platform.getConfig('enableSummarization', false);
                // Note: StandaloneAdapter doesn't persist config changes yet — this is a no-op for now
                // The setting is read-only from ~/.claudine/config.json
                this.sendSettings();
                if (!current) {
                    this.progressiveRefresh();
                }
                break;
            }
            case 'updateSetting': {
                if (message.key === 'imageGenerationApiKey') {
                    this._platform.setSecret('imageGenerationApiKey', String(message.value ?? '')).then(() => {
                        this.sendSettings();
                    });
                }
                // Other settings are read from config.json — user edits the file directly
                break;
            }
            case 'regenerateIcons':
                this._stateManager.clearAllIcons().then(() => {
                    this._claudeCodeWatcher.clearPendingIcons();
                    this.progressiveRefresh();
                });
                break;
            case 'setProjectEnabled':
                this.handleSetProjectEnabled(message.projectPath, message.enabled);
                break;
            case 'setAllProjectsEnabled':
                this.handleSetAllProjectsEnabled(message.enabled);
                break;
            case 'quickIdea':
                // In standalone mode, we can't launch Claude Code — just log
                console.log(`Claudine: Quick idea received: ${message.prompt}`);
                break;
            case 'saveDrafts':
                this._stateManager.saveDrafts(message.drafts);
                break;
            case 'testApiConnection':
                this.testApiConnection();
                break;
            case 'toggleAutoRestart':
                // Read-only in standalone for now
                break;
            // These are VSCode-specific — no-ops in standalone
            case 'sendPrompt':
            case 'openConversation':
            case 'openGitBranch':
            case 'closeEmptyClaudeTabs':
            case 'setupAgentIntegration':
                console.log(`Claudine: Action "${message.type}" is not available in standalone mode`);
                break;
        }
    }
    async onReady() {
        this.sendSettings();
        this._send({ type: 'updateLocale', strings: DEFAULT_LOCALE });
        this.loadDrafts();
        // If the initial scan is already done (e.g. reconnecting client), send cached state
        if (this._initialScanDone) {
            const conversations = this._stateManager.getConversations();
            this._send({ type: 'updateConversations', conversations });
            return;
        }
        // Progressive loading flow
        await this.progressiveRefresh();
    }
    /** Run project discovery followed by progressive per-project scanning. */
    async progressiveRefresh() {
        // Phase 1: Fast discovery
        this._send({ type: 'indexingProgress', phase: 'discovery', totalProjects: 0, scannedProjects: 0, totalFiles: 0, scannedFiles: 0 });
        const manifest = this._claudeCodeWatcher.discoverProjects();
        this._manifest = manifest;
        // Merge with persisted enable/disable preferences
        const savedMap = this._platform.getGlobalState('projectEnabledMap', {});
        for (const entry of manifest) {
            if (entry.encodedPath in savedMap) {
                entry.enabled = savedMap[entry.encodedPath];
            }
        }
        this._send({ type: 'projectDiscovered', projects: manifest });
        // Phase 2: Progressive scanning of enabled projects
        const enabled = manifest.filter(p => p.enabled);
        const totalFiles = enabled.reduce((s, p) => s + p.fileCount, 0);
        console.log(`Claudine: Discovered ${manifest.length} projects (${enabled.length} enabled, ${totalFiles} files)`);
        const allConversations = await this._claudeCodeWatcher.scanProjectsProgressively(enabled, (progress) => {
            this._send({ type: 'indexingProgress', phase: 'scanning', ...progress });
        }, (projectPath, conversations) => {
            this._send({ type: 'projectConversationsLoaded', projectPath, conversations });
        });
        // Phase 3: Complete — set full state in StateManager for file-watcher updates
        this._stateManager.setConversations(allConversations);
        this._initialScanDone = true;
        this._send({
            type: 'indexingProgress', phase: 'complete',
            totalProjects: enabled.length, scannedProjects: enabled.length,
            totalFiles, scannedFiles: totalFiles,
        });
        console.log(`Claudine: Progressive scan complete — ${allConversations.length} conversations loaded`);
    }
    async handleSetProjectEnabled(encodedPath, enabled) {
        // Update manifest cache
        const entry = this._manifest.find(p => p.encodedPath === encodedPath);
        if (entry)
            entry.enabled = enabled;
        // Persist preference
        const savedMap = this._platform.getGlobalState('projectEnabledMap', {});
        savedMap[encodedPath] = enabled;
        await this._platform.setGlobalState('projectEnabledMap', savedMap);
        // Send updated manifest
        this._send({ type: 'projectDiscovered', projects: this._manifest });
        // If disabling, remove that project's conversations from the state
        if (!enabled && entry?.decodedPath) {
            const all = this._stateManager.getConversations();
            const remaining = all.filter(c => c.workspacePath !== entry.decodedPath);
            this._stateManager.setConversations(remaining);
        }
        // If enabling, scan just that project
        if (enabled && entry) {
            const convs = await this._claudeCodeWatcher.scanProjectsProgressively([entry], (progress) => {
                this._send({ type: 'indexingProgress', phase: 'scanning', ...progress });
            }, (projectPath, conversations) => {
                this._send({ type: 'projectConversationsLoaded', projectPath, conversations });
            });
            // Merge with existing
            const all = this._stateManager.getConversations();
            this._stateManager.setConversations([...all, ...convs]);
            this._send({ type: 'indexingProgress', phase: 'complete', totalProjects: 1, scannedProjects: 1, totalFiles: entry.fileCount, scannedFiles: entry.fileCount });
        }
    }
    async handleSetAllProjectsEnabled(enabled) {
        const savedMap = {};
        for (const entry of this._manifest) {
            // Don't override auto-excluded projects when enabling all
            if (enabled && entry.autoExcluded)
                continue;
            entry.enabled = enabled;
            savedMap[entry.encodedPath] = enabled;
        }
        await this._platform.setGlobalState('projectEnabledMap', savedMap);
        this._send({ type: 'projectDiscovered', projects: this._manifest });
        // Re-scan with updated state
        await this.progressiveRefresh();
    }
    async sendSettings() {
        const apiKey = await this._platform.getSecret('imageGenerationApiKey') ?? '';
        const settings = {
            imageGenerationApi: this._platform.getConfig('imageGenerationApi', 'none'),
            claudeCodePath: this._platform.getConfig('claudeCodePath', '~/.claude'),
            enableSummarization: this._platform.getConfig('enableSummarization', false),
            hasApiKey: !!apiKey,
            viewLocation: 'panel',
            toolbarLocation: 'sidebar',
            autoRestartAfterRateLimit: this._platform.getConfig('autoRestartAfterRateLimit', false),
            showTaskIcon: this._platform.getConfig('showTaskIcon', true),
            showTaskDescription: this._platform.getConfig('showTaskDescription', true),
            showTaskLatest: this._platform.getConfig('showTaskLatest', true),
            showTaskGitBranch: this._platform.getConfig('showTaskGitBranch', true),
        };
        this._send({ type: 'updateSettings', settings });
    }
    async loadDrafts() {
        const drafts = await this._stateManager.loadDrafts();
        this._send({ type: 'draftsLoaded', drafts });
    }
    async testApiConnection() {
        const api = this._platform.getConfig('imageGenerationApi', 'none');
        const apiKey = await this._platform.getSecret('imageGenerationApiKey') ?? '';
        if (!apiKey) {
            this._send({ type: 'apiTestResult', success: false, error: 'No API key configured' });
            return;
        }
        try {
            if (api === 'openai') {
                const res = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                });
                this._send({ type: 'apiTestResult', success: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
            }
            else if (api === 'stability') {
                const res = await fetch('https://api.stability.ai/v1/user/account', {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                });
                this._send({ type: 'apiTestResult', success: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
            }
            else {
                this._send({ type: 'apiTestResult', success: false, error: 'No API selected' });
            }
        }
        catch (err) {
            this._send({ type: 'apiTestResult', success: false, error: String(err) });
        }
    }
}
exports.StandaloneMessageHandler = StandaloneMessageHandler;
//# sourceMappingURL=StandaloneMessageHandler.js.map