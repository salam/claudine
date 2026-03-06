# Task Card Context Menu

## Summary

Add a right-click context menu to task cards in the Kanban board. The menu provides quick access to opening conversations and moving cards between columns without drag-and-drop.

## Trigger

- Right-click (`contextmenu` event) on any task card — full, compact, narrow, and draft modes
- Prevents the browser default context menu
- Only one context menu visible at a time; clicking outside or pressing Escape closes it

## Menu Structure

| # | Label | Behavior |
|---|-------|----------|
| 1 | **Open conversation** | Bold/default. Calls existing `handleOpenConversation()` |
| — | Separator | — |
| 2 | Move to To Do | `moveConversation` with status `todo` |
| 3 | Move to Needs Input | `moveConversation` with status `needs-input` |
| 4 | Move to In Progress | `moveConversation` with status `in-progress` |
| 5 | Move to In Review | `moveConversation` with status `in-review` |
| 6 | Move to Done | `moveConversation` with status `done` |
| — | Separator | — |
| 7 | Archive immediately | `moveConversation` with status `archived` |

- Each "Move to X" item shows the column's color dot
- The card's current column is **omitted** from the list (not grayed, just hidden)

### Draft card menu

| # | Label | Behavior |
|---|-------|----------|
| 1 | **Send idea** | Bold/default. Dispatches `sendDraft` event |
| — | Separator | — |
| 2 | Delete idea | Red text. Dispatches `deleteDraft` event |

## Positioning

- Placed at mouse coordinates (`clientX`, `clientY`)
- Clamped to viewport edges to prevent overflow

## Implementation

- All logic in `TaskCard.svelte`
- Import `columns` and `archiveColumn` from `stores/conversations`
- New state: `contextMenuVisible`, `contextMenuX`, `contextMenuY`
- Handler: `handleContextMenu(e: MouseEvent)` — sets position, shows menu
- Move actions reuse existing `vscode.postMessage({ type: 'moveConversation' })` + `updateConversationStatus()`
- Styles follow existing `.open-menu` / `.open-menu-item` patterns

## Out of Scope

- Sub-menus
- Keyboard navigation within the menu (beyond Escape to close)
