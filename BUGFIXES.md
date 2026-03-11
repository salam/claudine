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

## BUG7 — Stale "You've hit your limit" banner from old conversations
- **Reported:** 2026-02-11
- **Symptom:** The rate-limit banner ("You've hit your limit · resets 10am (Europe/Zurich)") stays visible even when the stated reset time has long passed (e.g. from a conversation that hit the limit yesterday).
- **Root cause:** `parseResetTime()` always uses `new Date()` (now) as its reference date and adds 24 hours when the time-of-day has already passed, so the computed `rateLimitResetTime` is always in the future — even for rate limits from days ago. `hasRecentRateLimit()` only checks whether a rate-limit text pattern exists after the last user message, never whether the limit has actually expired.
- [✔️] Fixed — `parseResetTime()` now accepts an optional `referenceDate` (the message timestamp) instead of always using `now`; `hasRecentRateLimit()` checks whether the computed reset time is still in the future before flagging a conversation as rate-limited

## BUG8 — AI summarization toggle button doesn't work
- **Reported:** 2026-02-11
- **Symptom:** The AI-based summary of task titles and descriptions is always on. The related toolbar button doesn't toggle it off — the summarized text keeps showing regardless of the button state.
- **Root cause:** Two issues:
  1. **Standalone mode**: `StandaloneMessageHandler.toggleSummarization` reads the current config value but never writes the toggled value back. The `IPlatformAdapter` interface lacks a `setConfig` method entirely, so the standalone handler was left as a documented no-op. The in-memory config and the on-disk `config.json` are never updated.
  2. **Standalone `updateSetting` handler**: The `updateSetting` case only handles `imageGenerationApiKey` (a secret); all other config keys are silently ignored with a comment "user edits the file directly."
- [✔️] Fixed — added `setConfig` to `IPlatformAdapter` + both adapters; standalone handler now toggles and persists; `updateSetting` handler also writes allowed config keys

## BUG9 — Standalone mode: live monitoring not working (no real-time updates)
- **Reported:** 2026-02-11
- **Symptom:** After the initial project scan completes, changes to JSONL files (new Claude Code activity) are not pushed to the browser. The board only shows a static snapshot from startup; users must manually refresh to see updates.
- **Root cause:** `StandaloneAdapter.watchFiles()` passes a glob pattern (e.g. `~/.claude/projects/**/*.jsonl`) directly to `chokidar.watch()`. Chokidar v4 does not fire `change` events when the watched path is a glob — only when watching a concrete directory. The watcher initializes and reports "ready" but silently drops all subsequent file modification events.
- [✔️] Fixed — watch base directory instead of glob pattern; filter events by file extension in callbacks

## BUG10 — Done/Cancelled/Archived tasks bounce back to active columns on trailing JSONL output

- **Reported:** 2026-02-11
- **Symptom:** A task manually moved to Done, Cancelled, or Archived jumps back to Needs Input, In Progress, or In Review when the JSONL file receives trailing content (e.g. final tool results, closing assistant messages) even though the user did not resume the conversation.
- **Root cause:** `mergeWithExisting()` only preserves the terminal status when `hasNewContent` is false. When new bytes are appended to the JSONL (even non-user content like trailing tool output), the guard is bypassed and the parser's auto-detected status overwrites the manual override.
- [✔️] Fixed — `mergeWithExisting()` now preserves terminal status even when new content arrives, unless the agent is actively running (conversation genuinely resumed)

## BUG6 — Newsletter SQLite file not created in some PHP hosts
- **Reported:** 2026-02-09
- **Symptom:** Submitting the website newsletter form succeeds/fails inconsistently, but `newsletter-subscribers.sqlite` is not created on disk.
- **Root cause:** Storage path resolution only targeted `dirname(__DIR__) . '/data'`, which can be blocked by hosting layout/open_basedir restrictions or unwritable parent directories. The script also relied on implicit SQLite file creation only.
- [✔️] Fixed — endpoint now resolves the first writable storage directory (custom env dir/file, project data dir, public data dir, or system temp dir) and explicitly creates/verifies the SQLite file before writing

## BUG11 — Standalone multi-pane: some kanban boards incorrectly use vertical layout on wide windows

- **Reported:** 2026-02-12
- **Symptom:** In standalone mode with multiple projects expanded, some kanban boards render columns stacked vertically (sidebar layout) even though the window is wide enough for horizontal layout. Boards with more cards are more likely to be affected.
- **Root cause:** `.pane-content` in `ProjectPane.svelte` lacks `display: flex`, breaking the flex height chain. `.zoom-wrapper`'s `flex: 1` is inert (parent is not a flex container), so `.kanban-board`'s `height: 100%` resolves against content height instead of the constrained pane height. Boards with more cards have taller natural content, producing a lower aspect ratio that `inferPlacement()` misclassifies as sidebar geometry. This creates a self-reinforcing feedback loop: vertical layout → even taller content → confirming the wrong decision.
- [✔️] Fixed — added `display: flex; flex-direction: column` to `.pane-content` in `ProjectPane.svelte`, completing the flex height chain so `inferPlacement()` receives the constrained pane geometry

## BUG11b — Vertical (sidebar) layout columns don't resize to full width

- **Reported:** 2026-03-02
- **Symptom:** When the board is in vertical/sidebar layout, columns don't stretch to the full available width. Instead they retain their panel-mode widths (custom pixel widths or constrained flex sizing).
- **Root cause:** In vertical mode, `.column-wrapper` CSS sets `flex: none` and unsets min/max-width, but doesn't set `width: 100%`. Worse, columns with custom widths get inline `style:width` (fixed px) and `style:flex` (`0 0 auto`) that override the vertical CSS rules entirely, since inline styles have higher specificity.
- [✔️] Fixed — added `width: 100%` to vertical `.column-wrapper` CSS, and gated inline custom-width/flex styles behind `!isVertical` so they're ignored in sidebar layout

## BUG12 — Projects with dots in their name not found

- **Reported:** 2026-02-24
- **Symptom:** Conversations from workspace directories containing dots (e.g. `molts.club`) don't appear on the Kanban board. The extension logs "No project dir found for workspace" because the encoded path doesn't match the directory Claude Code created.
- **Root cause:** `encodeWorkspacePath()` only replaced `/` with `-`, but Claude Code also replaces `.` with `-`. A workspace like `/Users/matthias/Development/molts.club` was encoded as `-Users-matthias-Development-molts.club` but the actual directory on disk is `-Users-matthias-Development-molts-club`.
- [✔️] Fixed — changed `encodeWorkspacePath()` regex from `/\//g` to `/[/.]/g` to also replace dots with hyphens

## BUG13 — "Webview is disposed" errors during tab restoration

- **Reported:** 2026-02-24
- **Symptom:** On EDH startup, repeated `Error: Webview is disposed` errors appear in the Developer Console. The errors fire from `ClaudeCodeEditorCommands.focusEditor` inside a `setTimeout`.
- **Root cause:** When `replaceRestoredTab` closes a stale shell-rendered tab and re-opens it via `onOpenConversation`, the full `openConversation` flow fires — including `focusEditorOnce` which calls `claude-vscode.focus` after a delay. By the time the timer fires, the old webview is disposed and the new one may not be ready, causing `reveal()` to throw inside the Claude Code extension.
- [✔️] Fixed — `onOpenConversation` callback now opens the editor directly (via `editorCommands.openConversation`) without the follow-up `focusEditorOnce` call; the new editor focuses itself on creation

## BUG14 — Opening a Claude Code conversation spawns dozens of duplicate views

- **Reported:** 2026-03-02
- **Symptom:** Sometimes when opening a new Claude Code conversation in the IDE view, dozens of editor views are created instead of one.
- **Root cause:** Race condition in `TabManager.replaceRestoredTab()`. The `_replacingStaleTab` guard flag is reset at the end of the async method, but `recordActiveTabMapping()` runs 500 ms later. During that window the new tab exists but is unmapped, `_tabToConversation.size === 0`, and `_replacingStaleTab === false` — so `detectFocusedConversation()` re-enters `replaceRestoredTab`, creating an infinite open/close/open loop.
- [✔️] Fixed — `_replacingStaleTab` guard now stays held until `recordActiveTabMapping()` records the new tab (with a 3 s safety timeout fallback); `replaceRestoredTab` also calls `suppressFocus()` to block focus-detection cascades during the replacement window

## BUG14b — Claude Code views frantically demand focus in an infinite loop

- **Reported:** 2026-03-02
- **Symptom:** After running for a while, Claude Code editor tabs start rapidly stealing focus from each other, flipping back and forth between views.
- **Root cause:** Same `_replacingStaleTab` race condition as BUG14. Each loop iteration opens a new tab → `onDidChangeTabs` fires → `scheduleFocusDetection` → `detectFocusedConversation` re-enters `replaceRestoredTab` → rapid tab switching. Additionally, the `onOpenConversation` callback does not call `suppressFocus()`, so focus-detection cascades have no debounce protection. CLAUDINE.AGENTS.md may also contribute by instructing agents to poll the board, triggering repeated state changes.
- [✔️] Fixed — same fix as BUG14; additionally updated CLAUDINE.AGENTS.md with explicit warnings against polling/looping, explaining that Claudine handles status transitions automatically

## BUG15 — Metadata/system messages appear as kanban tasks

- **Reported:** 2026-03-06
- **Symptom:** Kanban board shows tasks containing system metadata (`<permissions instructions>`, `<system-reminder>`, hook outputs) instead of real conversation content. Multi-line XML blocks survive tag stripping and leak into titles, descriptions, and last messages.
- **Root cause:** Two issues: (1) `stripMarkupTags()` regex only matched single-line XML blocks, failing on multi-line tags like `<permissions>\n...\n</permissions>`; (2) `stripMarkupTags()` was only applied in `extractTitle()`, not in `extractDescription()` or `extractLastMessage()`.
- [✔️] Fixed — upgraded regex to `/<([a-zA-Z][\w-]*)[\s>][^]*?<\/\1>/g` for multi-line matching; applied `stripMarkupTags()` consistently in all three extraction methods; added `hasRealUserContent()` check so conversations where all user messages are pure metadata are filtered out entirely

## BUG16a — Codex conversations show cryptic/system-text titles

- **Reported:** 2026-03-06
- **Symptom:** Codex conversations appear on the kanban board but with cryptic titles like `<permissions instructions>` or system metadata instead of the actual user request.
- **Root cause:** `CodexSessionParser.processEntry()` treats ALL `response_item` blocks with `input_text` content type as user messages, pushing them into `userMessages[]`. However, Codex JSONL files include system instructions (permissions, AGENTS.md, environment context, collaboration mode) as `response_item/input_text` blocks BEFORE the actual user message. Since the title is derived from `userMessages[0]`, it picks up the first system instruction instead of the real user prompt. The actual user message is reliably available via `event_msg/user_message` events.
- [✔️] Fixed — removed `input_text` from `userMessages` collection; user messages are now exclusively sourced from `event_msg/user_message` events

## BUG16b — Codex full-text search fails to return results

- **Reported:** 2026-03-06
- **Symptom:** Searching for text that appears in Codex conversations returns no results, even though the raw JSONL file contains the search term.
- **Root cause:** `CodexWatcher.searchConversations()` correctly finds matching files via `content.toLowerCase().includes(q)`, but then fails to extract the conversation ID. It looks for `obj.payload.meta.id` or `obj.meta.id` in the first line, but the actual Codex `session_meta` format stores the ID at `obj.payload.id`. The ID extraction silently fails in a try/catch, so the match is dropped.
- [✔️] Fixed — changed ID extraction to check `obj.payload.id` (standard format) before `obj.meta.id` (legacy format)

## BUG16c — Codex VSCode user messages include IDE context preamble in title

- **Reported:** 2026-03-06
- **Symptom:** When using Codex from VSCode, conversation titles show `# Context from my IDE setup:` instead of the actual user request, because VSCode wraps user messages with IDE context (open tabs, active file) before the `## My request for Codex:` section.
- **Root cause:** Even after fixing BUG16a, the `event_msg/user_message` text includes the full IDE context wrapper. The title extractor takes the first line, which is `# Context from my IDE setup:`. The actual user request is buried after a `## My request for Codex:` header.
- [✔️] Fixed — added `stripIDEContext()` method that extracts text after the `## My request for Codex:` marker

## BUG17 — Clicking a Codex conversation opens an empty Claude Code tab

- **Reported:** 2026-03-06
- **Symptom:** Clicking a task card for a Codex conversation opens a new, empty Claude Code conversation instead of opening the conversation in the Codex extension.
- **Root cause:** In `extension.ts`, only `ClaudeCodeEditorCommands` is instantiated and passed to `KanbanViewProvider`. The provider-specific `CodexEditorCommands` class exists but is never used. When `openConversation()` is called for a Codex conversation, it always delegates to `ClaudeCodeEditorCommands`, which calls `claude-vscode.editor.open` with the Codex conversation ID. The Claude extension doesn't recognize this ID, so it opens a blank new conversation.
- [✔️] Fixed — added provider-aware editor command routing to `KanbanViewProvider`; `openConversation`, `sendPrompt`, and `interruptTerminals` now resolve the correct `IEditorCommands` via the conversation's `provider` field; `CodexEditorCommands.openConversation` opens the session JSONL file as a fallback until the Codex extension exposes public commands

## BUG19 — Context menu not visible (clipped by transform/overflow ancestors)

- **Reported:** 2026-03-06
- **Symptom:** Right-clicking a task card shows no context menu at all. The menu is rendered but invisible.
- **Root cause:** The context menu uses `position: fixed` inside a DOM tree that includes `transform: scale(...)` on `.kanban-board` (when zoom != 1) and `overflow: hidden` on `.zoom-wrapper`. CSS `transform` creates a new containing block, making `position: fixed` act like `position: absolute` relative to the transformed ancestor. Combined with `overflow: hidden`, the menu is clipped entirely. Also affects SmartBoard (`style:zoom`) and MultiProjectView (`overflow: hidden` on `.project-content`).
- [✔️] Fixed — portaled the context menu element to `document.body` via a Svelte action, escaping all overflow/transform containers

## BUG20 — Windows: workspace path encoding fails to match Claude Code directories

- **Reported:** 2026-03-11
- **Symptom:** On Windows, Claudine cannot find any conversations. The extension logs "No project dir found for workspace" for every workspace folder.
- **Root cause:** `encodeWorkspacePath()` replaces `/` and `.` with `-`, but Windows paths use `\` as separators and `:` after drive letters (e.g. `C:\Users\foo\project`). Claude Code encodes these paths by replacing all separators, dots, and colons with `-`. Claudine's regex `/[/.]/g` missed `\` and `:`, so the encoded path didn't match the directory on disk.
- [✔️] Fixed — changed regex from `/[/.]/g` to `/[/\\.:]/g` to also replace backslashes and colons

## BUG18 — Conversations with background agents not shown as "In Progress" and missing agent dots

- **Reported:** 2026-03-06
- **Symptom:** When a Claude Code conversation dispatches multiple background agents (via the Task tool), the kanban card (a) doesn't show a dot per running agent — it shows at most 3 dots regardless of agent count, and (b) gets placed in "In Review" instead of "In Progress" because the main thread's last message contains completion-like text ("All done", "completed") even though background agents are still running.
- **Root cause:** Two issues:
  1. `collectSidechainStep()` uses a flat ring buffer capped at `MAX_SIDECHAIN_STEPS = 3`. All sidechain entries from all agents are mixed into one stream, losing per-agent identity. 5 agents running → only last 3 tool activity steps shown, not 5 agent dots.
  2. `detectStatus()` only examines main-thread messages. It never checks `sidechainSteps` for running agents, so completion patterns in the main thread override the fact that background agents are still working.
- [✔️] Fixed — `collectSidechainStep()` now tracks per-agent status by tracing `parentUuid` chains: each distinct sidechain gets one dot showing its latest status. `detectStatus()` now checks for running sidechain agents and returns `in-progress` instead of `in-review` when background agents are still working
