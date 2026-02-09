# Bugfixes

## BUG1 — Ghost "Untitled Conversation" tasks
- **Reported:** 2026-02-08
- **Symptom:** Random "Untitled Conversation" cards appear on the board that seem to be fragments or steps from other conversations.
- **Root cause:** `parseLines()` does not filter out JSONL entries where `isSidechain: true`. Sidechain entries (branched sub-conversations within Claude Code) are included in the parsed messages, producing ghost conversations with no real user content.
- [✔️] Fixed

## BUG2 — Tasks from other projects appear on the board
- **Reported:** 2026-02-08
- **Symptom:** Conversations from projects other than the currently opened workspace show up on the Kanban board.
- **Root cause:** The file system watcher in `ClaudeCodeWatcher.startWatching()` watches `**/*.jsonl` across ALL project directories. The `onFileChanged` callback processes any changed file without checking whether it belongs to the current workspace. While the initial `scanForConversations()` correctly filters via `getProjectDirsToScan()`, real-time file-change events bypass that filter.
- [✔️] Fixed

## BUG2b — Drag-and-drop broken in zoomed state
- **Reported:** 2026-02-09
- **Symptom:** When the board is zoomed in or out (zoom != 1.0), dragging a card shows it at the wrong size/position and drop zones don't align with the cursor.
- **Root cause:** CSS `zoom` on `.kanban-board` creates a coordinate mismatch between the zoomed drop zones and the un-zoomed dragged clone. `svelte-dnd-action` clones the dragged card to `document.body` (outside the zoom context) using `getBoundingClientRect()` dimensions (zoomed) but `getComputedStyle()` values (un-zoomed), producing a visually broken clone. Drop zone detection also drifts because the library's internal bookkeeping doesn't account for CSS `zoom`.
- [✔️] Fixed — replaced CSS `zoom` with `transform: scale()` + wrapper div

## BUG4 — Toolbar inconsistency between sidebar and titlebar
- **Reported:** 2026-02-09
- **Symptom:** The toolbar only appears in the sidebar by default with no way to switch. The sidebar and titlebar show different icon sets (sidebar had fewer buttons). Sidebar used custom SVGs while the titlebar used VS Code codicons, making the two toolbars look inconsistent. Attempting to use the codicon CSS font in the webview rendered as broken rectangles.
- **Root cause:** Default `toolbarLocation` is `'sidebar'`, hiding the titlebar icons entirely. No UI existed in the settings panel to change the toolbar placement. The sidebar used bespoke SVG icons instead of VS Code's codicon font. The codicon CSS font-face approach doesn't work in VS Code webviews (iframes with separate documents that can't resolve the bundled font URLs). Titlebar was missing zoom, settings, and about buttons that the sidebar had.
- [✔️] Fixed — toolbar shows in one place at a time (sidebar or titlebar, user's choice in Settings); both toolbars now show the exact same 13 buttons in the same order; sidebar icons use inline SVGs with paths extracted from the official `@vscode/codicons` package for pixel-perfect rendering in webview iframes

## BUG4b — Board stays in vertical column order after moving back to panel
- **Reported:** 2026-02-09
- **Symptom:** After moving Claudine from sidebar back to bottom panel, columns remain stacked top-to-bottom instead of returning to left-to-right.
- **Root cause:** `KanbanViewProvider` keeps a single `_view` + `_authToken` and disposes previous listeners on every `resolveWebviewView()`. After switching views, the previously resolved panel webview can become visible with stale settings and an invalid token, so it does not receive fresh `updateSettings`/state messages.
- [✔️] Fixed — provider now tracks panel/sidebar webviews independently, keeps per-view auth tokens/listeners, and broadcasts state/settings updates to all resolved views

## BUG4c — Manual drag/drop placement is not synced back to `viewLocation`
- **Reported:** 2026-02-09
- **Symptom:** When users move Claudine via VS Code drag-and-drop layout controls (instead of the toggle command), the board orientation can stay wrong because `claudine.viewLocation` keeps the old value and still drives rendering.
- **Root cause:** The webview layout used `settings.viewLocation` as a hard input, but there was no runtime reconciliation path to update the setting when actual placement changed externally.
- [✔️] Fixed — board now infers effective placement from live geometry, debounces reconciliation, and writes `viewLocation` back via `updateSetting`

## BUG4d — Placement sync races and snaps board back after drag/drop
- **Reported:** 2026-02-09
- **Symptom:** Moving the Claudine view between panel/sidebar can snap back immediately because extension setting writes race VS Code’s own placement persistence.
- **Root cause:** Placement was managed by two sources of truth (`claudine.viewLocation` and VS Code layout state), causing conflicting updates.
- [✔️] Fixed — removed user-facing `viewLocation` setting/command, made VS Code the single placement owner, and switched board orientation to live geometry detection

## BUG3 — Empty conversations shown on the board
- **Reported:** 2026-02-08
- **Symptom:** Empty cards appear with title "Untitled Conversation", no description, and "No messages" — providing no useful information.
- **Root cause:** `ConversationParser.parseFile()` returns a `Conversation` object even when the conversation has no meaningful content (title is "Untitled Conversation", description and lastMessage are both empty). There is no minimum-content gate.
- [✔️] Fixed

## BUG5 — False "needs input" detection while agent is working
- **Reported:** 2026-02-09
- **Symptom:** Conversations show "needs input" status and question badge even when the agent is actively thinking, executing tools, or dispatching sub-agents — not actually waiting for user input.
- **Root cause:** In `ConversationParser.detectStatus()`, when the last JSONL entry is an assistant message with `tool_use` blocks and the conversation is recently active (within 2 min), the parser assumes it's "waiting for permission approval" and returns `needs-input`. But this is the normal state while any tool is executing — there's a timing gap between the assistant dispatching the tool and the tool result being written to JSONL. Similarly, `hasRecentQuestion()` treats any pending `tool_use` on a recently active conversation as a question. The real "needs input" tools (`AskUserQuestion`, `ExitPlanMode`) are already caught earlier in the detection logic.
- [✔️] Fixed — pending tool_use now returns `in-progress`; `hasRecentQuestion` no longer flags pending tool executions

## BUG5b — Question regex matches normal agent reasoning text

- **Reported:** 2026-02-09
- **Symptom:** Conversations where the assistant says things like "I should implement this using CSS variables" are detected as "needs input" because "should implement" contains the substring "should i".
- **Root cause:** The question-detection regex `/should i/i` lacked word boundaries, matching partial words. Additionally, the regex was checked against ANY last assistant message — even one from earlier in the conversation that the user already responded to.
- [✔️] Fixed — added word boundaries to regex patterns; question pattern only triggers needs-input when it's the very last message (user hasn't responded yet)
