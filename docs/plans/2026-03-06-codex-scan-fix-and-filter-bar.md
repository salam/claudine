# Codex Scan Fix & Enhanced Filter Bar — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Codex conversations not appearing in standalone task panels, and add provider + state/problem filter chips to the filter bar.

**Architecture:** Two independent changes: (1) Make `CompositeConversationProvider.scanProjectsProgressively()` include non-primary children by calling their `refresh()` method and merging results. (2) Extend the webview filter bar with three chip groups — providers, state/problems, categories — using the same multi-select toggle pattern as existing category chips.

**Tech Stack:** TypeScript, Svelte, VS Code webview API

---

### Task 1: Change `IConversationProvider.refresh()` to return `Conversation[]`

**Files:**
- Modify: `src/providers/IConversationProvider.ts:36`
- Modify: `src/providers/ClaudeCodeWatcher.ts:116`
- Modify: `src/providers/CodexWatcher.ts:95`
- Modify: `src/providers/CompositeConversationProvider.ts:59`

**Step 1: Update the interface**

In `src/providers/IConversationProvider.ts:36`, change:
```typescript
refresh(): Promise<void>;
```
to:
```typescript
refresh(): Promise<Conversation[]>;
```

**Step 2: Update `ClaudeCodeWatcher.refresh()`**

In `src/providers/ClaudeCodeWatcher.ts:116`, change the method to return the conversations array:
```typescript
public async refresh(): Promise<Conversation[]> {
  try {
    const conversations = await this.scanForConversations();
    console.log(`Claudine: Found ${conversations.length} conversations`);
    this._stateManager.setConversations(conversations, 'claude-code');

    // Kick off async summarization for uncached conversations (non-blocking)
    this._summaryService.summarizeUncached(conversations, (id, summary) => {
      // ... existing summarization callback unchanged ...
    });

    return conversations;
  } catch (error) {
    console.error('Claudine: Error refreshing conversations', error);
    return [];
  }
}
```

**Step 3: Update `CodexWatcher.refresh()`**

In `src/providers/CodexWatcher.ts:95`, change:
```typescript
public async refresh(): Promise<Conversation[]> {
  try {
    const conversations = await this.scanForConversations();
    console.log(`Claudine: Codex — found ${conversations.length} conversations`);
    this._stateManager.setConversations(conversations, 'codex');
    return conversations;
  } catch (error) {
    console.error('Claudine: Codex — error refreshing conversations', error);
    return [];
  }
}
```

**Step 4: Update `CompositeConversationProvider.refresh()`**

In `src/providers/CompositeConversationProvider.ts:59`, change:
```typescript
async refresh(): Promise<Conversation[]> {
  const results = await Promise.all(this._children.map(c => c.refresh()));
  return results.flat();
}
```

**Step 5: Compile and verify**

Run: `npm run compile`
Expected: No type errors

**Step 6: Commit**

```
feat: change IConversationProvider.refresh() to return Conversation[]
```

---

### Task 2: Include non-primary providers in `scanProjectsProgressively()`

**Files:**
- Modify: `src/providers/CompositeConversationProvider.ts:83-89`
- Test: `src/test/CompositeConversationProvider.test.ts`

**Step 1: Write the failing test**

In `src/test/CompositeConversationProvider.test.ts`, add a test case:

```typescript
it('scanProjectsProgressively includes non-primary provider conversations', async () => {
  // Create a mock non-primary provider whose refresh() returns Codex conversations
  const codexConv = createMockConversation({ id: 'codex-abc', provider: 'codex', title: 'Codex task' });
  const mockCodexProvider: IConversationProvider = {
    id: 'codex',
    displayName: 'Codex',
    dataPath: '/tmp/codex',
    isWatching: false,
    parseCacheSize: 0,
    startWatching: () => {},
    setupFileWatcher: () => {},
    stopWatching: () => {},
    refresh: async () => [codexConv],
    searchConversations: () => [],
    clearPendingIcons: () => {},
    discoverProjects: () => [],
    scanProjectsProgressively: async () => [],
  };

  // Create a mock primary provider that returns Claude conversations via scanProjectsProgressively
  const claudeConv = createMockConversation({ id: 'claude-123', provider: 'claude-code', title: 'Claude task' });
  const mockClaudeProvider: IConversationProvider = {
    id: 'claude-code',
    displayName: 'Claude Code',
    dataPath: '/tmp/claude',
    isWatching: false,
    parseCacheSize: 0,
    startWatching: () => {},
    setupFileWatcher: () => {},
    stopWatching: () => {},
    refresh: async () => [claudeConv],
    searchConversations: () => [],
    clearPendingIcons: () => {},
    discoverProjects: () => [],
    scanProjectsProgressively: async (_projects, _onProgress, _onProjectScanned) => [claudeConv],
  };

  const composite = new CompositeConversationProvider([mockClaudeProvider, mockCodexProvider]);
  const result = await composite.scanProjectsProgressively([], () => {}, () => {});

  expect(result).toHaveLength(2);
  expect(result.find(c => c.id === 'claude-123')).toBeDefined();
  expect(result.find(c => c.id === 'codex-abc')).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/CompositeConversationProvider.test.ts`
Expected: FAIL — Codex conversation not in results

**Step 3: Implement the fix**

In `src/providers/CompositeConversationProvider.ts:83-89`, replace:
```typescript
async scanProjectsProgressively(
  enabledProjects: ProjectManifestEntry[],
  onProgress: (progress: { scannedProjects: number; totalProjects: number; scannedFiles: number; totalFiles: number; currentProject: string }) => void,
  onProjectScanned: (projectPath: string, conversations: Conversation[]) => void
): Promise<Conversation[]> {
  return this._children[0].scanProjectsProgressively(enabledProjects, onProgress, onProjectScanned);
}
```
with:
```typescript
async scanProjectsProgressively(
  enabledProjects: ProjectManifestEntry[],
  onProgress: (progress: { scannedProjects: number; totalProjects: number; scannedFiles: number; totalFiles: number; currentProject: string }) => void,
  onProjectScanned: (projectPath: string, conversations: Conversation[]) => void
): Promise<Conversation[]> {
  // Primary child handles project-based progressive scanning
  const primary = await this._children[0].scanProjectsProgressively(enabledProjects, onProgress, onProjectScanned);

  // Non-primary children (e.g. Codex) use their own scan logic via refresh()
  const secondary: Conversation[] = [];
  for (const child of this._children.slice(1)) {
    const convs = await child.refresh();
    secondary.push(...convs);
  }

  return [...primary, ...secondary];
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/CompositeConversationProvider.test.ts`
Expected: PASS

**Step 5: Compile**

Run: `npm run compile`
Expected: No errors

**Step 6: Commit**

```
fix: include non-primary providers (Codex) in scanProjectsProgressively
```

---

### Task 3: Add `provider` to webview Conversation type

**Files:**
- Modify: `webview/src/lib/vscode.ts:173-200`

**Step 1: Add `provider` field**

In `webview/src/lib/vscode.ts`, after line 199 (`workspacePath?: string;`), add:
```typescript
/** Which conversation provider produced this (e.g. 'claude-code', 'codex'). */
provider?: string;
```

**Step 2: Compile webview**

Run: `npm run compile`
Expected: No errors

**Step 3: Commit**

```
feat: add provider field to webview Conversation type
```

---

### Task 4: Add provider and state filter stores

**Files:**
- Modify: `webview/src/stores/conversations.ts`

**Step 1: Add the provider filter stores and helpers**

After the `clearCategoryFilter()` function (line 70), add:

```typescript
// Provider filter: empty set = show all, non-empty = show only selected providers
export const activeProviders = writable<Set<string>>(new Set());

export function toggleProvider(provider: string) {
  activeProviders.update(set => {
    const next = new Set(set);
    if (next.has(provider)) next.delete(provider);
    else next.add(provider);
    return next;
  });
}

export function clearProviderFilter() {
  activeProviders.set(new Set());
}

// State/problem filter: empty set = show all, non-empty = show only matching states
export type StateFilterKey = 'needs-attention' | 'hasQuestion' | 'isInterrupted' | 'hasError' | 'isRateLimited';

export const activeStateFilters = writable<Set<StateFilterKey>>(new Set());

export function toggleStateFilter(key: StateFilterKey) {
  activeStateFilters.update(set => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
}

export function clearStateFilter() {
  activeStateFilters.set(new Set());
}

/** Clear ALL filter groups at once. */
export function clearAllFilters() {
  clearCategoryFilter();
  clearProviderFilter();
  clearStateFilter();
}

/** Whether any filter is active across all groups. */
export const hasActiveFilters = derived(
  [activeCategories, activeProviders, activeStateFilters],
  ([$cats, $provs, $states]) => $cats.size > 0 || $provs.size > 0 || $states.size > 0
);

/** Available providers derived from current conversations (only shown when >1). */
export const availableProviders = derived(conversations, ($conversations) => {
  const providers = new Set<string>();
  for (const c of $conversations) {
    if (c.provider) providers.add(c.provider);
  }
  return providers;
});

/** Available state/problem filters derived from current conversations. */
export const availableStateFilters = derived(conversations, ($conversations) => {
  const available = new Set<StateFilterKey>();
  for (const c of $conversations) {
    if (c.hasQuestion) available.add('hasQuestion');
    if (c.isInterrupted) available.add('isInterrupted');
    if (c.hasError) available.add('hasError');
    if (c.isRateLimited) available.add('isRateLimited');
  }
  // Show "needs-attention" when any problem state exists
  if (available.size > 0) available.add('needs-attention');
  return available;
});
```

**Step 2: Compile webview**

Run: `npm run compile`
Expected: No errors

**Step 3: Commit**

```
feat: add provider and state filter stores
```

---

### Task 5: Extend `isVisible()` in KanbanBoard

**Files:**
- Modify: `webview/src/components/KanbanBoard.svelte:128-134`

**Step 1: Import new stores**

At the top of `KanbanBoard.svelte`, add to the existing import from `../stores/conversations`:
```typescript
activeProviders, activeStateFilters
```

**Step 2: Extend `isVisible()`**

Replace the existing `isVisible` function (lines 128-134) with:

```typescript
function isVisible(
  conv: Conversation,
  matchIds: Set<string> | null,
  mode: string,
  catFilter: Set<ConversationCategory>,
  provFilter: Set<string>,
  stateFilter: Set<string>
): boolean {
  // Provider filter
  if (provFilter.size > 0 && conv.provider && !provFilter.has(conv.provider)) return false;

  // State/problem filter
  if (stateFilter.size > 0) {
    const hasNeedsAttention = stateFilter.has('needs-attention');
    const hasSpecific = stateFilter.has('hasQuestion') || stateFilter.has('isInterrupted') || stateFilter.has('hasError') || stateFilter.has('isRateLimited');

    if (hasNeedsAttention && hasSpecific) {
      // Intersection: must be "needs attention" AND match a specific filter
      const isAttention = conv.hasQuestion || conv.isInterrupted || conv.hasError || conv.isRateLimited;
      const matchesSpecific =
        (stateFilter.has('hasQuestion') && conv.hasQuestion) ||
        (stateFilter.has('isInterrupted') && conv.isInterrupted) ||
        (stateFilter.has('hasError') && conv.hasError) ||
        (stateFilter.has('isRateLimited') && conv.isRateLimited);
      if (!isAttention || !matchesSpecific) return false;
    } else if (hasNeedsAttention) {
      if (!conv.hasQuestion && !conv.isInterrupted && !conv.hasError && !conv.isRateLimited) return false;
    } else {
      // Only specific filters active — match ANY
      const matchesAny =
        (stateFilter.has('hasQuestion') && conv.hasQuestion) ||
        (stateFilter.has('isInterrupted') && conv.isInterrupted) ||
        (stateFilter.has('hasError') && conv.hasError) ||
        (stateFilter.has('isRateLimited') && conv.isRateLimited);
      if (!matchesAny) return false;
    }
  }

  // Category filter
  if (catFilter.size > 0 && !catFilter.has(conv.category)) return false;

  // Search filter
  if (!matchIds) return true;
  if (mode === 'hide') return matchIds.has(conv.id);
  return true;
}
```

**Step 3: Update all call sites in the template**

There are 4 call sites (lines 280, 302, 331, and the archive column). Change each from:
```svelte
{#if isVisible(conversation.id, $searchMatchIds, $searchMode, conversation.category, $activeCategories)}
```
to:
```svelte
{#if isVisible(conversation, $searchMatchIds, $searchMode, $activeCategories, $activeProviders, $activeStateFilters)}
```

**Step 4: Compile and verify**

Run: `npm run compile`
Expected: No errors

**Step 5: Commit**

```
feat: extend isVisible() with provider and state filters
```

---

### Task 6: Extend the filter bar UI in App.svelte

**Files:**
- Modify: `webview/src/App.svelte:14` (imports)
- Modify: `webview/src/App.svelte:155-158` (toggleFilter function)
- Modify: `webview/src/App.svelte:255` (sidebar button active state)
- Modify: `webview/src/App.svelte:339-365` (filter bar template)

**Step 1: Update imports**

In `webview/src/App.svelte`, update the store import (line 14) to also include:
```typescript
activeProviders, toggleProvider, availableProviders,
activeStateFilters, toggleStateFilter, availableStateFilters,
hasActiveFilters, clearAllFilters,
```
Also import `StateFilterKey` type:
```typescript
import type { StateFilterKey } from '../stores/conversations';
```

**Step 2: Add state filter chip metadata**

In the script section, add a lookup for state filter display info:
```typescript
const stateFilterDetails: Record<StateFilterKey, { icon: string; label: string; color: string }> = {
  'needs-attention': { icon: '⚠', label: 'Needs Attention', color: '#f59e0b' },
  'hasQuestion':     { icon: '❓', label: 'Question',        color: '#8b5cf6' },
  'isInterrupted':   { icon: '⏸', label: 'Interrupted',     color: '#ef4444' },
  'hasError':        { icon: '❌', label: 'Error',           color: '#dc2626' },
  'isRateLimited':   { icon: '⏳', label: 'Rate Limited',    color: '#f97316' },
};

const providerDetails: Record<string, { icon: string; label: string; color: string }> = {
  'claude-code': { icon: '🤖', label: 'Claude Code', color: '#d97706' },
  'codex':       { icon: '🔮', label: 'Codex',       color: '#7c3aed' },
};

function getProviderDetails(provider: string) {
  return providerDetails[provider] || { icon: '🔧', label: provider, color: '#6b7280' };
}
```

**Step 3: Update `toggleFilter()` to clear all groups**

Replace:
```typescript
function toggleFilter() {
  filterOpen = !filterOpen;
  if (!filterOpen) clearCategoryFilter();
}
```
with:
```typescript
function toggleFilter() {
  filterOpen = !filterOpen;
  if (!filterOpen) clearAllFilters();
}
```

**Step 4: Update sidebar button active indicator**

Replace (line 255):
```svelte
class:active={filterOpen || $activeCategories.size > 0}
```
with:
```svelte
class:active={filterOpen || $hasActiveFilters}
```

**Step 5: Replace the filter bar template**

Replace lines 339-365 (the entire `{#if filterOpen}` block) with:
```svelte
{#if filterOpen}
  <div class="filter-bar">
    <svg class="filter-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z"/></svg>
    <div class="filter-chips">
      <!-- Provider chips (only when multiple providers exist) -->
      {#if $availableProviders.size > 1}
        {#each [...$availableProviders] as provider}
          {@const details = getProviderDetails(provider)}
          <button
            class="filter-chip"
            class:active={$activeProviders.has(provider)}
            style:--chip-color={details.color}
            on:click={() => toggleProvider(provider)}
            aria-pressed={$activeProviders.has(provider)}
          >
            <span class="chip-icon">{details.icon}</span>
            <span class="chip-label">{details.label}</span>
          </button>
        {/each}
        <span class="filter-divider"></span>
      {/if}

      <!-- State/problem chips -->
      {#if $availableStateFilters.size > 0}
        {#each ['needs-attention', 'hasQuestion', 'isInterrupted', 'hasError', 'isRateLimited'] as key}
          {#if $availableStateFilters.has(key)}
            {@const details = stateFilterDetails[key]}
            <button
              class="filter-chip"
              class:active={$activeStateFilters.has(key)}
              style:--chip-color={details.color}
              on:click={() => toggleStateFilter(key)}
              aria-pressed={$activeStateFilters.has(key)}
            >
              <span class="chip-icon">{details.icon}</span>
              <span class="chip-label">{details.label}</span>
            </button>
          {/if}
        {/each}
        <span class="filter-divider"></span>
      {/if}

      <!-- Category chips -->
      {#each allCategories as cat}
        {@const details = getCategoryDetails(cat)}
        <button
          class="filter-chip"
          class:active={$activeCategories.has(cat)}
          style:--chip-color={details.color}
          on:click={() => toggleCategory(cat)}
          aria-pressed={$activeCategories.has(cat)}
        >
          <span class="chip-icon">{details.icon}</span>
          <span class="chip-label">{details.label}</span>
        </button>
      {/each}
    </div>
    {#if $hasActiveFilters}
      <button class="filter-clear" on:click={clearAllFilters} title="Clear all filters">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
      </button>
    {/if}
    <button class="filter-close" on:click={toggleFilter}>
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
    </button>
  </div>
{/if}
```

**Step 6: Add CSS for the filter divider**

In the `<style>` section, after the `.filter-chip.active` styles, add:
```css
.filter-divider {
  width: 1px;
  height: 18px;
  background: var(--vscode-panel-border, #3c3c3c);
  flex-shrink: 0;
  margin: 0 2px;
}
```

**Step 7: Compile and verify visually**

Run: `npm run compile`
Expected: No errors

**Step 8: Commit**

```
feat: add provider and state/problem filter chips to filter bar
```

---

### Task 7: Update FEATURES.md and RELEASE_NOTES.md

**Files:**
- Modify: `FEATURES.md`
- Modify: `RELEASE_NOTES.md`

**Step 1: Add feature checklist to FEATURES.md**

```markdown
## Enhanced Filter Bar

- [ ] Provider filter chips (Claude Code, Codex) — multi-select, shown when >1 provider
- [ ] State/problem filter chips — Needs Attention, Question, Interrupted, Error, Rate Limited
- [ ] "Needs Attention" meta-filter (union of all problem states)
- [ ] Individual + meta intersection behavior
- [ ] Chips auto-hide when no conversations match that state
- [ ] Clear-all button resets all filter groups
- [ ] Visual dividers between chip groups
```

**Step 2: Add release notes to RELEASE_NOTES.md**

Add a new section for the current release.

**Step 3: Commit**

```
docs: update FEATURES.md and RELEASE_NOTES.md for filter bar
```

---

### Task 8: Run full test suite and compile

**Step 1:** Run: `npm run compile`
**Step 2:** Run: `npm test`
**Step 3:** Fix any failures
**Step 4:** Final commit if needed
