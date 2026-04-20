# Workspace Detection & No-Workspace Banner

**Date:** 2026-04-01
**Status:** Approved

## Problem

When VS Code starts with no workspace open, Claudine falls back to showing all conversations. If the user later opens a workspace folder, Claudine doesn't re-evaluate — it keeps showing everything until a manual refresh.

## Solution

### Extension-side

1. **New field `workspaceDetected: boolean`** on `ClaudineSettings` — `true` when `getEffectiveWorkspaceFolders()` returns a non-empty array, `false` otherwise.

2. **`onDidChangeWorkspaceFolders` listener** in `extension.ts` — on change, calls `kanbanProvider.updateSettings()` then `provider.refresh()` so the watcher re-evaluates effective folders and re-scans.

3. **Compute `workspaceDetected`** in `KanbanViewProvider.updateSettings()` by checking `this._provider.getWorkspacePaths()`.

### Webview-side

1. **Gray "no workspace" banner** in `App.svelte`, above the board, below the rate-limit banner. Shown when `$settings.workspaceDetected === false`. Text: *"No workspace detected. Showing all conversations."* with a *"Select path in settings"* link that sends `openSettings` command.

2. **Transient "workspace detected" banner** — when `workspaceDetected` transitions `false → true`, show a brief info banner: *"Workspace detected — now filtering conversations."* with a *"Change in settings"* link. Auto-dismisses after 5 seconds.

3. **Styling** follows the rate-limit banner pattern with gray VS Code theme variables.

## Files to modify

- `src/types/index.ts` — add `workspaceDetected` to `ClaudineSettings`
- `src/providers/KanbanViewProvider.ts` — compute `workspaceDetected` in `updateSettings()`
- `src/extension.ts` — add `onDidChangeWorkspaceFolders` listener
- `webview/src/lib/vscode.ts` — add `workspaceDetected` to webview `ClaudineSettings`
- `webview/src/stores/conversations.ts` — update default settings
- `webview/src/App.svelte` — add banners and `openSettings` message handler
- `src/providers/KanbanViewProvider.ts` — handle `openSettings` message from webview