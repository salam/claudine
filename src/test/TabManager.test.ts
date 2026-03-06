/**
 * Tests for TabManager — focus on BUG14 / BUG14b race conditions.
 *
 * BUG14:  replaceRestoredTab race allows infinite tab open/close loops.
 * BUG14b: Same race causes frantic focus-switching between Claude Code views.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { TabManager } from '../providers/TabManager';

// ── helpers ──────────────────────────────────────────────────────────

/** Build a fake tab that matches the Claude Code provider pattern. */
function makeClaudeTab(label: string): vscode.Tab {
  return {
    label,
    input: new vscode.TabInputWebview('claude-code-editor'),
    isActive: true,
    isDirty: false,
    isPinned: false,
    isPreview: false,
    group: {} as vscode.TabGroup,
  };
}

function createMockStateManager() {
  return {
    getConversations: vi.fn().mockReturnValue([]),
    getConversation: vi.fn(),
    setConversations: vi.fn(),
    updateConversation: vi.fn(),
    moveConversation: vi.fn(),
    removeConversation: vi.fn(),
    setConversationIcon: vi.fn(),
    clearAllIcons: vi.fn().mockResolvedValue(undefined),
    loadDrafts: vi.fn().mockResolvedValue([]),
    saveDrafts: vi.fn().mockResolvedValue(undefined),
    archiveStaleConversations: vi.fn(),
    archiveAllDone: vi.fn(),
    getConversationsByStatus: vi.fn().mockReturnValue([]),
    onConversationsChanged: () => ({ dispose: () => {} }),
    onNeedsInput: () => ({ dispose: () => {} }),
    ready: Promise.resolve(),
    getRateLimitedConversations: vi.fn().mockReturnValue([]),
    flushSave: vi.fn(),
  };
}

/**
 * Create a TabManager with mocked VS Code tab enumeration.
 * Uses injected isProviderTab to bypass instanceof checks in the mock.
 */
function createTabManager(opts: {
  tabs?: vscode.Tab[];
  activeTab?: vscode.Tab | null;
  conversations?: Array<{ id: string; title: string; status: string }>;
}) {
  const stateManager = createMockStateManager();
  if (opts.conversations) {
    stateManager.getConversations.mockReturnValue(opts.conversations);
  }

  const allTabs = opts.tabs ?? [];
  const activeTab = opts.activeTab ?? (allTabs.length > 0 ? allTabs[0] : null);

  const closeFn = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(vscode.window, 'tabGroups', {
    value: {
      all: [{
        isActive: true,
        activeTab,
        tabs: allTabs,
        viewColumn: 1,
      }],
      close: closeFn,
      onDidChangeTabs: () => ({ dispose: () => {} }),
    },
    configurable: true,
    writable: true,
  });

  const isProviderTab = (tab: vscode.Tab): boolean => {
    const input = tab.input as { viewType?: string };
    return !!input && typeof input.viewType === 'string' &&
      /claude/i.test(input.viewType) && !/claudine/i.test(input.viewType);
  };
  const isProviderTerminal = (terminal: vscode.Terminal): boolean => {
    return /claude/i.test(terminal.name) && !/claudine/i.test(terminal.name);
  };

  const tabManager = new TabManager(stateManager as never, isProviderTab, isProviderTerminal);

  return { tabManager, stateManager, closeFn };
}

// ── tests ────────────────────────────────────────────────────────────

describe('TabManager — BUG14 replaceRestoredTab race condition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not re-enter replaceRestoredTab while a replacement is pending', async () => {
    const tab = makeClaudeTab('Fix auth bug');
    const conversations = [{ id: 'conv-1', title: 'Fix auth bug', status: 'in-progress' }];
    const { tabManager } = createTabManager({
      tabs: [tab],
      activeTab: tab,
      conversations,
    });

    const openCalls: string[] = [];
    tabManager.onOpenConversation = (id) => { openCalls.push(id); };

    // First detection triggers replaceRestoredTab (async — flush with advanceTimersAsync)
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);
    expect(openCalls[0]).toBe('conv-1');

    // Second detection while replacement guard is still held:
    // _replacingStaleTab is true → no second replacement
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1); // BUG14: was 2 before fix
  });

  it('resets replacement guard after recordActiveTabMapping is called', async () => {
    const tab = makeClaudeTab('Fix auth bug');
    const conversations = [{ id: 'conv-1', title: 'Fix auth bug', status: 'in-progress' }];
    const { tabManager } = createTabManager({
      tabs: [tab],
      activeTab: tab,
      conversations,
    });

    const openCalls: string[] = [];
    tabManager.onOpenConversation = (id) => { openCalls.push(id); };

    // First replacement triggers
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);

    // Simulate the tab mapping being recorded
    tabManager.recordActiveTabMapping('conv-1');

    // Detection should NOT re-trigger replacement because mapping now exists
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);
  });

  it('resets replacement guard via safety timeout if mapping never arrives', async () => {
    const tab = makeClaudeTab('Fix auth bug');
    const conversations = [{ id: 'conv-1', title: 'Fix auth bug', status: 'in-progress' }];
    const { tabManager } = createTabManager({
      tabs: [tab],
      activeTab: tab,
      conversations,
    });

    const openCalls: string[] = [];
    tabManager.onOpenConversation = (id) => { openCalls.push(id); };

    // First detection triggers replacement
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);

    // Still guarded before timeout
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);

    // Advance past the safety timeout (3000ms) + suppression window
    await vi.advanceTimersByTimeAsync(5000);

    // After timeout, guard is reset — can trigger again, breaking the tight loop
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(2);
  });
});

describe('TabManager — BUG14b focus suppression on replacement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses focus detection during tab replacement', async () => {
    const tab = makeClaudeTab('Fix auth bug');
    const conversations = [{ id: 'conv-1', title: 'Fix auth bug', status: 'in-progress' }];
    const { tabManager } = createTabManager({
      tabs: [tab],
      activeTab: tab,
      conversations,
    });

    tabManager.onOpenConversation = () => {};

    // Trigger replacement — calls suppressFocus internally
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);

    // scheduleFocusDetection should be suppressed during the replacement window
    const focusChanges: Array<string | null> = [];
    tabManager.onFocusChanged = (id) => { focusChanges.push(id); };

    tabManager.scheduleFocusDetection();
    await vi.advanceTimersByTimeAsync(200); // past the normal debounce
    expect(focusChanges).toHaveLength(0); // suppressed
  });
});
