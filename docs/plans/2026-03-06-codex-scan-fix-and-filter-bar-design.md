# Codex Scan Fix & Enhanced Filter Bar

**Date:** 2026-03-06

## Problem Statement

1. **Codex conversations don't appear in standalone task panels.** `CompositeConversationProvider.scanProjectsProgressively()` only delegates to the first child (Claude Code). The standalone handler calls `setConversations()` without a provider tag after the progressive scan, wiping any Codex data that `refresh()` may have loaded.

2. **No way to filter by AI service or conversation state.** The filter bar only has category chips (bug, feature, task, etc.). Users want to filter by provider (Claude Code vs Codex) and by problem state (questions, interruptions, errors, rate limits).

## Design

### Task 1: Fix Codex in `CompositeConversationProvider.scanProjectsProgressively()`

**Change `IConversationProvider.refresh()` signature** to return `Promise<Conversation[]>` (currently `Promise<void>`). Both `ClaudeCodeWatcher` and `CodexWatcher` already compute the conversation list internally — they just need to return it.

**In `CompositeConversationProvider.scanProjectsProgressively()`**, after the primary child's scan completes, call `refresh()` on all non-primary children and merge their results:

```ts
async scanProjectsProgressively(...): Promise<Conversation[]> {
  const primary = await this._children[0].scanProjectsProgressively(...);

  // Include non-primary providers (e.g. Codex)
  const secondary: Conversation[] = [];
  for (const child of this._children.slice(1)) {
    const convs = await child.refresh();
    secondary.push(...convs);
  }

  return [...primary, ...secondary];
}
```

The standalone handler at `StandaloneMessageHandler.ts:238` already calls `setConversations(allConversations)` — with this fix, `allConversations` will include Codex results. No handler changes needed.

### Task 2: Enhanced Filter Bar

#### 2a. Webview type change

Add `provider?: string` to the webview-side `Conversation` type in `webview/src/lib/vscode.ts`.

#### 2b. New stores

In `webview/src/stores/conversations.ts`:

- `activeProviders: writable<Set<string>>` — selected provider filters
- `activeStateFilters: writable<Set<string>>` — selected state/problem filters

Plus helper functions: `toggleProvider()`, `toggleStateFilter()`, `clearProviderFilter()`, `clearStateFilter()`.

A derived store `availableProviders` computes which providers exist in the current conversation set (chips only render when >1 provider has conversations).

A derived store `availableStateFilters` computes which problem states exist in the current conversation set (chips only render when at least one conversation has that problem).

#### 2c. Filter bar layout

Three chip groups in the same row, separated by subtle dividers:

```
[ Claude Code ] [ Codex ]  |  [ ⚠ Needs Attention ] [ Question ] [ Interrupted ] [ Error ] [ Rate Limited ]  |  [ bug ] [ feature ] [ task ] ...
 ─── providers ────────────    ──── state/problems ──────────────────────────────────────────────────────────    ──── categories ────────────────
```

- Provider chips appear only when >1 provider has conversations
- Individual state chips appear only when at least one conversation has that state
- "Needs Attention" is always shown when any problem state exists (it's the union: `hasQuestion || isInterrupted || hasError || isRateLimited`)
- All chips are multi-select toggles, same UX as current category chips

#### 2d. Filter logic in `isVisible()`

All three filter dimensions are AND-ed:

```
visible = passesProviderFilter AND passesStateFilter AND passesCategoryFilter AND passesSearchFilter
```

**Provider filter:** If `activeProviders` is empty → pass all. Otherwise `activeProviders.has(conv.provider)`.

**State filter:** If `activeStateFilters` is empty → pass all. Otherwise, check if the conversation matches ANY of the selected state filters (OR within the group):
- `'needs-attention'` → `hasQuestion || isInterrupted || hasError || isRateLimited`
- `'hasQuestion'` → `conv.hasQuestion`
- `'isInterrupted'` → `conv.isInterrupted`
- `'hasError'` → `conv.hasError`
- `'isRateLimited'` → `conv.isRateLimited`

When "Needs Attention" is active alongside individual chips, the individual chips narrow within that set (intersection behavior: must match "Needs Attention" AND the specific chip).

**Category filter:** Unchanged — current behavior.

**Search filter:** Unchanged — current behavior.

#### 2e. Clear button

The existing "clear all" button resets all three groups at once.

## Files to modify

| File | Change |
|------|--------|
| `src/providers/IConversationProvider.ts` | `refresh()` returns `Promise<Conversation[]>` |
| `src/providers/ClaudeCodeWatcher.ts` | `refresh()` returns conversations |
| `src/providers/CodexWatcher.ts` | `refresh()` returns conversations |
| `src/providers/CompositeConversationProvider.ts` | `scanProjectsProgressively()` merges non-primary children |
| `src/types/index.ts` | No change (provider already exists) |
| `webview/src/lib/vscode.ts` | Add `provider?: string` to webview Conversation type |
| `webview/src/stores/conversations.ts` | Add `activeProviders`, `activeStateFilters`, derived stores, helpers |
| `webview/src/App.svelte` | Extend filter bar with provider + state chip groups |
| `webview/src/components/KanbanBoard.svelte` | Extend `isVisible()` with provider + state checks |

## Tests

- `CompositeConversationProvider.test.ts` — verify `scanProjectsProgressively()` includes non-primary children
- `KanbanBoard` filter logic — unit tests for `isVisible()` with all filter combinations
- Store tests — `activeProviders`, `activeStateFilters` toggle/clear behavior
