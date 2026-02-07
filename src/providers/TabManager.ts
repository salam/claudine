import * as vscode from 'vscode';
import { StateManager } from '../services/StateManager';

/**
 * Manages the bidirectional mapping between Claude Code editor tabs and
 * Claudine conversation IDs.  Handles tab focus detection, stale tab
 * cleanup, and restored-shell-tab replacement.
 */
export class TabManager {
  // Bidirectional tab ↔ conversation mapping
  private _tabToConversation = new Map<string, string>(); // tab label → conversationId
  private _conversationToTab = new Map<string, string>(); // conversationId → tab label

  // Focus detection debounce & suppression
  private _focusDetectionTimer: ReturnType<typeof setTimeout> | undefined;
  private _suppressFocusUntil = 0;
  private _replacingStaleTab = false;

  private _onFocusChanged: (conversationId: string | null) => void = () => {};

  constructor(private readonly _stateManager: StateManager) {}

  /** Register a callback fired whenever the focused conversation changes. */
  set onFocusChanged(cb: (conversationId: string | null) => void) {
    this._onFocusChanged = cb;
  }

  /** Suppress event-driven focus detection for the given duration. */
  suppressFocus(ms: number) {
    this._suppressFocusUntil = Date.now() + ms;
  }

  // ── Tab identification ──────────────────────────────────────────────

  /** Check if a tab is a Claude Code Visual Editor (not Claudine). */
  isClaudeCodeTab(tab: vscode.Tab): boolean {
    const input = tab.input;
    return (
      input instanceof vscode.TabInputWebview &&
      /claude/i.test(input.viewType) &&
      !/claudine/i.test(input.viewType)
    );
  }

  // ── Tab ↔ conversation mapping ─────────────────────────────────────

  /** Record a mapping between a conversation and the currently active Claude tab. */
  recordActiveTabMapping(conversationId: string) {
    for (const group of vscode.window.tabGroups.all) {
      if (!group.isActive) continue;
      const tab = group.activeTab;
      if (tab && this.isClaudeCodeTab(tab)) {
        const oldLabel = this._conversationToTab.get(conversationId);
        if (oldLabel) this._tabToConversation.delete(oldLabel);

        this._tabToConversation.set(tab.label, conversationId);
        this._conversationToTab.set(conversationId, tab.label);
        console.log(`Claudine: Mapped tab "${tab.label}" → conversation ${conversationId}`);
        return;
      }
    }
  }

  /** Remove mappings for tabs that no longer exist. */
  pruneStaleTabMappings() {
    const allLabels = new Set<string>();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (this.isClaudeCodeTab(tab)) {
          allLabels.add(tab.label);
        }
      }
    }

    for (const [label, convId] of this._tabToConversation) {
      if (!allLabels.has(label)) {
        this._tabToConversation.delete(label);
        this._conversationToTab.delete(convId);
        console.log(`Claudine: Pruned stale tab mapping "${label}"`);
      }
    }
  }

  /** Get the known tab label for a conversation, if any. */
  getTabLabel(conversationId: string): string | undefined {
    return this._conversationToTab.get(conversationId);
  }

  /** Remove a stale tab mapping for a conversation. */
  removeMapping(conversationId: string) {
    const label = this._conversationToTab.get(conversationId);
    if (label) {
      this._tabToConversation.delete(label);
      this._conversationToTab.delete(conversationId);
    }
  }

  // ── Tab operations ──────────────────────────────────────────────────

  /**
   * Close empty and duplicate Claude Code Visual Editor tabs.
   *
   * After a workspace restart, VSCode restores Claude editor tabs as empty
   * shells — their webview content is gone.
   *
   * Detection: if `_tabToConversation` has NO entries, we're in a fresh
   * session and ALL existing Claude tabs are restored shells → close them.
   */
  async closeEmptyClaudeTabs(): Promise<number> {
    const tabsToClose: vscode.Tab[] = [];
    const seenLabels = new Set<string>();
    const hasMappings = this._tabToConversation.size > 0;

    const knownTitles = new Set(
      this._stateManager.getConversations().map(c => c.title.toLowerCase().trim())
    );

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (!this.isClaudeCodeTab(tab)) continue;
        if (tab.isDirty) continue;

        if (seenLabels.has(tab.label)) {
          tabsToClose.push(tab);
          continue;
        }
        seenLabels.add(tab.label);

        if (this._tabToConversation.has(tab.label)) continue;

        if (!hasMappings) {
          tabsToClose.push(tab);
          continue;
        }

        if (knownTitles.has(tab.label.toLowerCase().trim())) continue;

        tabsToClose.push(tab);
      }
    }

    if (tabsToClose.length === 0) return 0;

    console.log(`Claudine: Clean sweep — closing ${tabsToClose.length} empty/duplicate Claude tab(s)`);
    await vscode.window.tabGroups.close(tabsToClose);
    return tabsToClose.length;
  }

  /** Close an unmapped Claude tab whose label matches the given title. */
  async closeUnmappedClaudeTabByTitle(title: string): Promise<void> {
    const titleLower = title.toLowerCase().trim();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (!this.isClaudeCodeTab(tab)) continue;
        if (this._tabToConversation.has(tab.label)) continue;
        if (tab.label.toLowerCase().trim() === titleLower) {
          try {
            await vscode.window.tabGroups.close(tab);
            console.log(`Claudine: Closed stale restored tab "${tab.label}"`);
          } catch {}
          return;
        }
      }
    }
  }

  /** Focus a specific Claude Code tab by its label. */
  async focusTabByLabel(label: string): Promise<boolean> {
    for (const group of vscode.window.tabGroups.all) {
      for (let i = 0; i < group.tabs.length; i++) {
        const tab = group.tabs[i];
        if (tab.label === label && this.isClaudeCodeTab(tab)) {
          await this.focusTabAtIndex(group, i);
          return true;
        }
      }
    }
    return false;
  }

  /** Focus ANY open Claude Code editor tab (first found). */
  async focusAnyClaudeTab(): Promise<boolean> {
    for (const group of vscode.window.tabGroups.all) {
      for (let i = 0; i < group.tabs.length; i++) {
        if (this.isClaudeCodeTab(group.tabs[i])) {
          await this.focusTabAtIndex(group, i);
          return true;
        }
      }
    }
    return false;
  }

  private async focusTabAtIndex(group: vscode.TabGroup, index: number) {
    const focusCmds = [
      'workbench.action.focusFirstEditorGroup',
      'workbench.action.focusSecondEditorGroup',
      'workbench.action.focusThirdEditorGroup',
    ];
    const groupIdx = (group.viewColumn ?? 1) - 1;
    if (groupIdx >= 0 && groupIdx < focusCmds.length) {
      await vscode.commands.executeCommand(focusCmds[groupIdx]);
    }
    await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', index);
  }

  // ── Focus detection ─────────────────────────────────────────────────

  /** Schedule a debounced focus detection. */
  scheduleFocusDetection() {
    clearTimeout(this._focusDetectionTimer);
    if (Date.now() < this._suppressFocusUntil) return;
    this._focusDetectionTimer = setTimeout(() => {
      this.detectFocusedConversation();
    }, 150);
  }

  /**
   * Detect which Claude Code conversation is currently focused
   * by checking: 1) active Claude Code Visual Editor tabs, 2) active terminals.
   */
  detectFocusedConversation() {
    let focusedId: string | null = null;

    const claudeTab = this.getActiveClaudeCodeTab();
    if (claudeTab) {
      const isMapped = this._tabToConversation.has(claudeTab.label);
      focusedId = this.matchTabToConversation(claudeTab);

      // Unmapped tab in a fresh session → restored shell. Replace it.
      if (focusedId && !isMapped && this._tabToConversation.size === 0 && !this._replacingStaleTab) {
        console.log(`Claudine: Replacing restored shell tab "${claudeTab.label}"`);
        this._replacingStaleTab = true;
        this.replaceRestoredTab(claudeTab, focusedId);
        return;
      }

      console.log(`Claudine: Focused Claude tab "${claudeTab.label}" → conversation ${focusedId}`);
    }

    // Fall back to terminal detection
    if (!focusedId) {
      const activeTerminal = vscode.window.activeTerminal;
      if (activeTerminal && /claude/i.test(activeTerminal.name) && !/claudine/i.test(activeTerminal.name)) {
        const activeConv = this._stateManager.getConversations().find(c => c.status === 'in-progress');
        if (activeConv) {
          focusedId = activeConv.id;
        }
      }
    }

    this._onFocusChanged(focusedId);
  }

  private getActiveClaudeCodeTab(): vscode.Tab | null {
    for (const group of vscode.window.tabGroups.all) {
      if (!group.isActive) continue;
      const tab = group.activeTab;
      if (tab && this.isClaudeCodeTab(tab)) return tab;
    }
    return null;
  }

  private matchTabToConversation(tab: vscode.Tab): string | null {
    const mapped = this._tabToConversation.get(tab.label);
    if (mapped) return mapped;

    const conversations = this._stateManager.getConversations();
    const tabLabel = tab.label.toLowerCase().trim();

    for (const conv of conversations) {
      if (conv.title.toLowerCase().trim() === tabLabel) return conv.id;
    }

    for (const conv of conversations) {
      const title = conv.title.toLowerCase().trim();
      if (title && tabLabel && (tabLabel.includes(title) || title.includes(tabLabel))) {
        return conv.id;
      }
    }

    return null;
  }

  private _onOpenConversation?: (id: string) => void;

  /** Register a callback for when a restored tab needs to open a conversation. */
  set onOpenConversation(cb: (id: string) => void) {
    this._onOpenConversation = cb;
  }

  private async replaceRestoredTab(staleTab: vscode.Tab, conversationId: string) {
    try {
      await vscode.window.tabGroups.close(staleTab);
      console.log(`Claudine: Closed restored shell tab "${staleTab.label}"`);
    } catch {}
    this._onOpenConversation?.(conversationId);
    this._replacingStaleTab = false;
  }

  dispose() {
    clearTimeout(this._focusDetectionTimer);
  }
}
