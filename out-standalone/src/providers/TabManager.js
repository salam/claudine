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
exports.TabManager = void 0;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../constants");
/**
 * Manages the bidirectional mapping between Claude Code editor tabs and
 * Claudine conversation IDs.  Handles tab focus detection, stale tab
 * cleanup, and restored-shell-tab replacement.
 */
class TabManager {
    _stateManager;
    // Bidirectional tab ↔ conversation mapping
    _tabToConversation = new Map(); // tab label → conversationId
    _conversationToTab = new Map(); // conversationId → tab label
    // Focus detection debounce & suppression
    _focusDetectionTimer;
    _suppressFocusUntil = 0;
    _replacingStaleTab = false;
    _onFocusChanged = () => { };
    constructor(_stateManager) {
        this._stateManager = _stateManager;
    }
    /** Register a callback fired whenever the focused conversation changes. */
    set onFocusChanged(cb) {
        this._onFocusChanged = cb;
    }
    /** Suppress event-driven focus detection for the given duration. */
    suppressFocus(ms) {
        this._suppressFocusUntil = Date.now() + ms;
    }
    // ── Tab identification ──────────────────────────────────────────────
    /** Check if a tab is a Claude Code Visual Editor (not Claudine). */
    isClaudeCodeTab(tab) {
        const input = tab.input;
        return (input instanceof vscode.TabInputWebview &&
            /claude/i.test(input.viewType) &&
            !/claudine/i.test(input.viewType));
    }
    // ── Tab ↔ conversation mapping ─────────────────────────────────────
    /** Record a mapping between a conversation and the currently active Claude tab. */
    recordActiveTabMapping(conversationId) {
        for (const group of vscode.window.tabGroups.all) {
            if (!group.isActive)
                continue;
            const tab = group.activeTab;
            if (tab && this.isClaudeCodeTab(tab)) {
                const oldLabel = this._conversationToTab.get(conversationId);
                if (oldLabel)
                    this._tabToConversation.delete(oldLabel);
                this._tabToConversation.set(tab.label, conversationId);
                this._conversationToTab.set(conversationId, tab.label);
                console.log(`Claudine: Mapped tab "${tab.label}" → conversation ${conversationId}`);
                return;
            }
        }
    }
    /** Remove mappings for tabs that no longer exist. */
    pruneStaleTabMappings() {
        const allLabels = new Set();
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
    getTabLabel(conversationId) {
        return this._conversationToTab.get(conversationId);
    }
    /** Remove a stale tab mapping for a conversation. */
    removeMapping(conversationId) {
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
    async closeEmptyClaudeTabs() {
        const tabsToClose = [];
        const seenLabels = new Set();
        const hasMappings = this._tabToConversation.size > 0;
        const knownTitles = new Set(this._stateManager.getConversations().map(c => c.title.toLowerCase().trim()));
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (!this.isClaudeCodeTab(tab))
                    continue;
                if (tab.isDirty)
                    continue;
                if (seenLabels.has(tab.label)) {
                    tabsToClose.push(tab);
                    continue;
                }
                seenLabels.add(tab.label);
                if (this._tabToConversation.has(tab.label))
                    continue;
                if (!hasMappings) {
                    tabsToClose.push(tab);
                    continue;
                }
                if (knownTitles.has(tab.label.toLowerCase().trim()))
                    continue;
                tabsToClose.push(tab);
            }
        }
        if (tabsToClose.length === 0)
            return 0;
        console.log(`Claudine: Clean sweep — closing ${tabsToClose.length} empty/duplicate Claude tab(s)`);
        await vscode.window.tabGroups.close(tabsToClose);
        return tabsToClose.length;
    }
    /** Close an unmapped Claude tab whose label matches the given title. */
    async closeUnmappedClaudeTabByTitle(title) {
        const titleLower = title.toLowerCase().trim();
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (!this.isClaudeCodeTab(tab))
                    continue;
                if (this._tabToConversation.has(tab.label))
                    continue;
                if (tab.label.toLowerCase().trim() === titleLower) {
                    try {
                        await vscode.window.tabGroups.close(tab);
                        console.log(`Claudine: Closed stale restored tab "${tab.label}"`);
                    }
                    catch { /* ignore */ }
                    return;
                }
            }
        }
    }
    /** Focus a specific Claude Code tab by its label. */
    async focusTabByLabel(label) {
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
    async focusAnyClaudeTab() {
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
    async focusTabAtIndex(group, index) {
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
        if (Date.now() < this._suppressFocusUntil)
            return;
        this._focusDetectionTimer = setTimeout(() => {
            this.detectFocusedConversation();
        }, constants_1.FOCUS_DETECTION_DEBOUNCE_MS);
    }
    /**
     * Detect which Claude Code conversation is currently focused
     * by checking: 1) active Claude Code Visual Editor tabs, 2) active terminals.
     */
    detectFocusedConversation() {
        let focusedId = null;
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
    getActiveClaudeCodeTab() {
        for (const group of vscode.window.tabGroups.all) {
            if (!group.isActive)
                continue;
            const tab = group.activeTab;
            if (tab && this.isClaudeCodeTab(tab))
                return tab;
        }
        return null;
    }
    matchTabToConversation(tab) {
        const mapped = this._tabToConversation.get(tab.label);
        if (mapped)
            return mapped;
        const conversations = this._stateManager.getConversations();
        const tabLabel = tab.label.toLowerCase().trim();
        for (const conv of conversations) {
            if (conv.title.toLowerCase().trim() === tabLabel)
                return conv.id;
        }
        for (const conv of conversations) {
            const title = conv.title.toLowerCase().trim();
            if (title && tabLabel && (tabLabel.includes(title) || title.includes(tabLabel))) {
                return conv.id;
            }
        }
        return null;
    }
    _onOpenConversation;
    /** Register a callback for when a restored tab needs to open a conversation. */
    set onOpenConversation(cb) {
        this._onOpenConversation = cb;
    }
    async replaceRestoredTab(staleTab, conversationId) {
        try {
            await vscode.window.tabGroups.close(staleTab);
            console.log(`Claudine: Closed restored shell tab "${staleTab.label}"`);
        }
        catch { /* ignore */ }
        this._onOpenConversation?.(conversationId);
        this._replacingStaleTab = false;
    }
    dispose() {
        clearTimeout(this._focusDetectionTimer);
    }
}
exports.TabManager = TabManager;
//# sourceMappingURL=TabManager.js.map