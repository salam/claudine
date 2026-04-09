import { execFile } from 'child_process';
import { homedir } from 'os';
import { IPlatformAdapter } from '../src/platform/IPlatformAdapter';
import { StateManager } from '../src/services/StateManager';
import { IConversationProvider } from '../src/providers/IConversationProvider';
import {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
  ClaudineSettings,
  CustomTerminalConfig,
  ProjectManifestEntry,
} from '../src/types';

/** Default locale strings for standalone mode (English). */
const DEFAULT_LOCALE: Record<string, string> = {
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
export class StandaloneMessageHandler {
  /** Fingerprints of last-sent conversations, keyed by ID. */
  private _lastSentFingerprints = new Map<string, string>();

  /** Whether the initial progressive scan has completed. */
  private _initialScanDone = false;

  /** Cached project manifest from the most recent discovery. */
  private _manifest: ProjectManifestEntry[] = [];

  constructor(
    private readonly _stateManager: StateManager,
    private readonly _provider: IConversationProvider,
    private readonly _platform: IPlatformAdapter,
    private readonly _send: (msg: ExtensionToWebviewMessage) => void
  ) {}

  handleMessage(message: WebviewToExtensionMessage) {
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
        const ids = this._provider.searchConversations(message.query);
        this._send({ type: 'searchResults', query: message.query, ids });
        break;
      }

      case 'toggleSummarization': {
        const current = this._platform.getConfig<boolean>('enableSummarization', false);
        this._platform.setConfig('enableSummarization', !current).then(() => {
          this.sendSettings();
          // BUG8b: Always refresh — turning ON kicks off summarization,
          // turning OFF re-sends conversations with originalTitle for revert.
          this.progressiveRefresh();
        });
        break;
      }

      case 'updateSetting': {
        const ALLOWED_SETTING_KEYS = [
          'imageGenerationApi',
          'enableSummarization',
          'autoRestartAfterRateLimit',
          'showTaskIcon',
          'showTaskDescription',
          'showTaskLatest',
          'showTaskGitBranch'
        ];
        if (message.key === 'imageGenerationApiKey') {
          this._platform.setSecret('imageGenerationApiKey', String(message.value ?? '')).then(() => {
            this.sendSettings();
          });
        } else if (ALLOWED_SETTING_KEYS.includes(message.key)) {
          this._platform.setConfig(message.key, message.value).then(() => {
            this.sendSettings();
          });
        }
        break;
      }

      case 'regenerateIcons':
        this._stateManager.clearAllIcons().then(() => {
          this._provider.clearPendingIcons();
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

      case 'openConversationAs':
        this.openConversationAs(message.conversationId, message.target);
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

  private async onReady() {
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
  private async progressiveRefresh() {
    // Phase 1: Fast discovery
    this._send({ type: 'indexingProgress', phase: 'discovery', totalProjects: 0, scannedProjects: 0, totalFiles: 0, scannedFiles: 0 });

    const manifest = this._provider.discoverProjects();
    this._manifest = manifest;

    // Merge with persisted enable/disable preferences
    const savedMap = this._platform.getGlobalState<Record<string, boolean>>('projectEnabledMap', {});
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

    const allConversations = await this._provider.scanProjectsProgressively(
      enabled,
      (progress) => {
        this._send({ type: 'indexingProgress', phase: 'scanning', ...progress });
      },
      (projectPath, conversations) => {
        this._send({ type: 'projectConversationsLoaded', projectPath, conversations });
      }
    );

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

  private async handleSetProjectEnabled(encodedPath: string, enabled: boolean) {
    // Update manifest cache
    const entry = this._manifest.find(p => p.encodedPath === encodedPath);
    if (entry) entry.enabled = enabled;

    // Persist preference
    const savedMap = this._platform.getGlobalState<Record<string, boolean>>('projectEnabledMap', {});
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
      const convs = await this._provider.scanProjectsProgressively(
        [entry],
        (progress) => {
          this._send({ type: 'indexingProgress', phase: 'scanning', ...progress });
        },
        (projectPath, conversations) => {
          this._send({ type: 'projectConversationsLoaded', projectPath, conversations });
        }
      );
      // Merge with existing
      const all = this._stateManager.getConversations();
      this._stateManager.setConversations([...all, ...convs]);
      this._send({ type: 'indexingProgress', phase: 'complete', totalProjects: 1, scannedProjects: 1, totalFiles: entry.fileCount, scannedFiles: entry.fileCount });
    }
  }

  private async handleSetAllProjectsEnabled(enabled: boolean) {
    const savedMap: Record<string, boolean> = {};
    for (const entry of this._manifest) {
      // Don't override auto-excluded projects when enabling all
      if (enabled && entry.autoExcluded) continue;
      entry.enabled = enabled;
      savedMap[entry.encodedPath] = enabled;
    }
    await this._platform.setGlobalState('projectEnabledMap', savedMap);
    this._send({ type: 'projectDiscovered', projects: this._manifest });

    // Re-scan with updated state
    await this.progressiveRefresh();
  }

  private async sendSettings() {
    const apiKey = await this._platform.getSecret('imageGenerationApiKey') ?? '';
    const settings: ClaudineSettings = {
      imageGenerationApi: this._platform.getConfig('imageGenerationApi', 'none'),
      claudeCodePath: this._platform.getConfig('claudeCodePath', '~/.claude'),
      codexPath: this._platform.getConfig('codexPath', '~/.codex'),
      enableSummarization: this._platform.getConfig('enableSummarization', false),
      hasApiKey: !!apiKey,
      toolbarLocation: 'sidebar',
      autoRestartAfterRateLimit: this._platform.getConfig('autoRestartAfterRateLimit', false),
      showTaskIcon: this._platform.getConfig('showTaskIcon', true),
      showTaskDescription: this._platform.getConfig('showTaskDescription', true),
      showTaskLatest: this._platform.getConfig('showTaskLatest', true),
      showTaskGitBranch: this._platform.getConfig('showTaskGitBranch', true),
      customTerminals: this._platform.getConfig<CustomTerminalConfig[]>('customTerminals', []),
      monitoredWorkspace: this._platform.getConfig('monitoredWorkspace', { mode: 'auto' }),
      detectedWorkspacePaths: [],
    };
    this._send({ type: 'updateSettings', settings });
  }

  private async loadDrafts() {
    const drafts = await this._stateManager.loadDrafts();
    this._send({ type: 'draftsLoaded', drafts });
  }

  private openConversationAs(conversationId: string, target: string) {
    const conversation = this._stateManager.getConversation(conversationId);
    if (!conversation) {
      console.warn(`Claudine: Conversation ${conversationId} not found`);
      this._send({ type: 'error', message: 'Conversation not found' });
      return;
    }

    const cwd = conversation.workspacePath || homedir();
    const sessionId = conversation.id;

    switch (target) {
      case 'terminal':
        this.openInTerminal(cwd, sessionId);
        break;
      case 'vscode':
        this.openInEditor('code', cwd);
        break;
      case 'cursor':
        this.openInEditor('cursor', cwd);
        break;
      case 'codex-vscode':
        // Open workspace in VSCode — the Codex extension will be available there
        this.openInEditor('code', cwd);
        break;
      case 'codex-cursor':
        // Open workspace in Cursor — the Codex extension will be available there
        this.openInEditor('cursor', cwd);
        break;
      default:
        console.warn(`Claudine: Unknown open target "${target}"`);
        break;
    }
  }

  /** Open a workspace folder in an editor (VSCode, Cursor, etc.). */
  private openInEditor(cmd: string, cwd: string) {
    execFile(cmd, [cwd], (err) => {
      if (err) {
        console.error(`Claudine: Failed to open ${cmd}`, err);
        this._send({ type: 'error', message: `Failed to open ${cmd}: ${err.message}` });
      }
    });
  }

  /** Resume a Claude Code conversation in a terminal emulator. */
  private openInTerminal(cwd: string, sessionId: string) {
    const platform = process.platform;
    // Use a minimal env to avoid leaking secrets and stripping Node.js debugger
    // variables (e.g. NODE_OPTIONS) that interfere with child processes.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: process.env.LANG,
      TERM: process.env.TERM,
      // Windows: needed for terminal emulators to locate config dirs and resolve .cmd files
      ...(platform === 'win32' && {
        APPDATA: process.env.APPDATA,
        USERPROFILE: process.env.USERPROFILE,
        PATHEXT: process.env.PATHEXT,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      }),
    };

    const resumeCmd = `claude --resume ${sessionId}`;

    // Custom terminals from settings are tried first, before platform defaults.
    // cwd is passed via execFile options so users don't need to encode it themselves.
    const customTerminals = this._platform.getConfig<CustomTerminalConfig[]>('customTerminals', []);
    const customEntries = customTerminals.map(t => ({ cmd: t.command, args: [...t.args, resumeCmd] }));

    let builtins: Array<{ cmd: string; args: string[] }>;
    if (platform === 'darwin') {
      // Terminal.app does not inherit cwd from the osascript process, so it must be
      // embedded in the AppleScript string directly.
      const script = `tell application "Terminal" to do script "cd '${cwd}' && ${resumeCmd}"`;
      builtins = [{ cmd: 'osascript', args: ['-e', script] }];
    } else if (platform === 'linux') {
      // cwd is inherited by the shell via execFile's cwd option, so no cd prefix needed.
      // `; exec bash` keeps the window open after claude exits.
      const shellCmd = `${resumeCmd}; exec bash`;
      builtins = [
        { cmd: 'gnome-terminal', args: ['--', 'bash', '-c', shellCmd] },
        { cmd: 'konsole', args: ['-e', 'bash', '-c', shellCmd] },
        { cmd: 'xterm', args: ['-e', 'bash', '-c', shellCmd] },
      ];
    } else {
      // wt doesn't inherit cwd from its parent; -d sets the starting directory explicitly.
      // For cmd, `start` opens a new independent window but inherits the outer cmd's cwd
      // (set via execFile), so /D is not needed.
      builtins = [
        { cmd: 'wt', args: ['-d', cwd, 'cmd', '/k', resumeCmd] },
        { cmd: 'cmd', args: ['/c', 'start', '', 'cmd', '/k', resumeCmd] },
      ];
    }

    this.tryExecFiles([...customEntries, ...builtins], env, cwd)
      .then(started => {
        if (!started) this._send({ type: 'error', message: 'No supported terminal emulator found' });
      });
  }

  /** Try a list of terminal emulators in order, stopping at the first success.
   *  `cwd` is passed as the working directory option for each execFile call.
   *  Returns true if a command launched without error, false if all failed. */
  private async tryExecFiles(
    commands: Array<{ cmd: string; args: string[] }>,
    env: NodeJS.ProcessEnv,
    cwd: string
  ): Promise<boolean> {
    for (const { cmd, args } of commands) {
      const err = await new Promise<Error | null>(resolve => {
        execFile(cmd, args, { env, cwd }, err => resolve(err));
      });
      if (!err) return true;
      console.warn(`Claudine: Failed to launch "${cmd}": ${err.message}`);
    }
    return false;
  }

  private async testApiConnection() {
    const api = this._platform.getConfig<string>('imageGenerationApi', 'none');
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
      } else if (api === 'stability') {
        const res = await fetch('https://api.stability.ai/v1/user/account', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        this._send({ type: 'apiTestResult', success: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
      } else {
        this._send({ type: 'apiTestResult', success: false, error: 'No API selected' });
      }
    } catch (err) {
      this._send({ type: 'apiTestResult', success: false, error: String(err) });
    }
  }
}
