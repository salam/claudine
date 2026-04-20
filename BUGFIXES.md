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

## BUG14c — Opening a new Claude Code conversation spawns infinite duplicate views

- **Reported:** 2026-03-25
- **Symptom:** Clicking a Claude Code button to open a new conversation causes Claudine to open many Claude Code conversations in an infinite loop, as if it keeps spawning them in parallel.
- **Root cause:** Three compounding issues in `TabManager`:
  1. The `replaceRestoredTab` mechanism (meant only for VS Code startup shell restoration) could trigger on ANY unmapped tab in a fresh session — including legitimately new tabs the user opens via Claude Code's own buttons. The `_tabToConversation.size === 0` condition was too broad.
  2. The `_onOpenConversation` callback in KanbanViewProvider did not call `suppressFocus()`, so the replacement tab immediately triggered another detection cascade.
  3. The suppression in `replaceRestoredTab` was `FOCUS_DETECTION_DEBOUNCE_MS * 3 = 450ms`, which expired BEFORE `recordActiveTabMapping` ran at 500ms, leaving a 50ms gap for re-entry.
- [✔️] Fixed — added `_restoredTabReplacementDone` flag that is set after the first `detectFocusedConversation` call, ensuring `replaceRestoredTab` can only fire once per session; added `suppressFocus(FOCUS_SUPPRESS_DURATION_MS)` to the `_onOpenConversation` callback; increased suppression in `replaceRestoredTab` from 450ms to `FOCUS_SUPPRESS_DURATION_MS` (2s)

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

## BUG21 — Monitored Workspace setting shared across all VS Code windows

- **Reported:** 2026-03-25
- **Symptom:** Changing the Monitored Workspace setting in one VS Code window (sidebar or bottom panel) affects all other concurrently open windows. Each workspace should have its own independent setting.
- **Root cause:** The `monitoredWorkspace` setting was stored in `vscode.ConfigurationTarget.Global`, making it a single global value shared across all VS Code windows and workspaces. Both `ClaudeCodeWatcher.getEffectiveWorkspaceFolders()` and `KanbanViewProvider.updateSettings()` read from this global config.
- [✔️] Fixed — moved `monitoredWorkspace` from global VS Code config to a per-workspace file at `.claudine/workspace-settings.json` (already gitignored). Added `getWorkspaceLocalConfig`/`setWorkspaceLocalConfig` to the platform adapter interface. Each VS Code window now reads/writes its own workspace-local setting independently.

## BUG7b — False positive "Rate limit hit" popup from non-rate-limit conversations
- **Reported:** 2026-03-25
- **Symptom:** VS Code popup "Rate limit hit — resets 10am (Europe/Zurich)" appears even when there is no active rate limit. The popup shows but the yellow banner in the kanban board does not.
- **Root cause:** Three compounding issues:
  1. When a rate-limit message has no `entry.timestamp`, `parseResetTime` falls back to `new Date()` — same defect as BUG7 but in the missing-timestamp path. Each restart recomputes a future reset time.
  2. `RATE_LIMIT_PATTERN` matches text in conversations that *discuss* rate limits (e.g. while developing Claudine). A long Claude response quoting the rate-limit message triggers a false positive.
  3. `hasRecentRateLimit` returns `true` when both `rateLimitResetTime` and `timestamp` are undefined (no-data fallback is overly aggressive).
  4. `detectStatus` checks message-level `isRateLimited` without time validation, marking expired rate limits as `needs-input`.
- [✔️] Fixed — four changes in ConversationParser: (1) `parseResetTime` no longer called when `messageDate` is undefined, (2) `RATE_LIMIT_PATTERN` only checked on short text blocks (<200 chars), (3) `hasRecentRateLimit` returns false when both timestamp and reset time are missing, (4) `detectStatus` uses time-aware rate limit check

## BUG22 — 👀 focus indicator not updating when switching Claude Code tabs

- **Reported:** 2026-03-25
- **Symptom:** Clicking on / switching to a different Claude Code conversation tab in VS Code does not automatically update the 👀 focus indicator in the Claudine kanban board.
- **Root cause:** Two issues in focus detection:
  1. `KanbanViewProvider` listens to `tabGroups.onDidChangeTabs` (fires on tab open/close/property change) but not `tabGroups.onDidChangeTabGroups` (fires when a tab group's `activeTab` changes — i.e., when the user clicks a different tab). The `onDidChangeTabs` event isn't guaranteed to fire for tab activation changes in all VS Code versions.
  2. The `onDidChangeVisibility` handler calls `refresh()` but not `detectFocusedConversation()`, so focus state isn't re-synced when the Claudine sidebar becomes visible after being hidden.
- [✔️] Fixed — added `tabGroups.onDidChangeTabGroups` event listener (fires when a group's `activeTab` changes); added `detectFocusedConversation()` call in `onDidChangeVisibility` handler to re-sync focus when sidebar becomes visible

## BUG23 — Codex tasks incorrectly placed in "To Do" column

- **Reported:** 2026-03-25
- **Symptom:** When Claudine detects Codex conversations, they appear in the "To Do" column even though they are already started and running.
- **Root cause:** `CodexSessionParser.detectStatus()` returns `'todo'` when only user messages are present (no agent response yet). Unlike Claude Code where a "to do" state is meaningful (e.g. draft ideas), Codex sessions are file-based — by the time we detect a JSONL file, the conversation has already been submitted and is running. The minimum state should be `'in-progress'`.
- [✔️] Fixed — `detectStatus()` now returns `'in-progress'` as the default instead of `'todo'` for Codex sessions

## BUG23b — Clicking Codex task opens JSONL file instead of Codex sidebar

- **Reported:** 2026-03-25
- **Symptom:** Clicking a task card for a Codex conversation opens the raw `.jsonl` session file in the editor, instead of focusing the Codex sidebar panel.
- **Root cause:** `CodexEditorCommands.openConversation()` falls back to opening the JSONL file via `vscode.workspace.openTextDocument()` because the Codex VS Code extension (`openai.chatgpt`) was assumed to not expose a command API. However, the extension does register `chatgpt.openSidebar` which can be used to open the Codex panel.
- [✔️] Fixed — `CodexEditorCommands` now calls `chatgpt.openSidebar` first (focuses the Codex sidebar panel), falling back to opening the JSONL file only if the command is unavailable

## BUG23c — Opening Codex task also opens/focuses a Claude Code conversation

- **Reported:** 2026-03-25
- **Symptom:** Clicking a Codex task card opens the Codex sidebar correctly, but an instant later also opens an empty Claude Code conversation or focuses a random existing one.
- **Root cause:** `KanbanViewProvider.openConversation()` calls `focusEditorOnce()` after a successful open. `focusEditorOnce()` always uses `this._editorCommands` (the default editor commands, which is Claude Code's `ClaudeCodeEditorCommands`), regardless of which provider's conversation was opened. This fires `claude-vscode.focus` after a delay, triggering Claude Code to open/focus a conversation. Related to the "dozens of Claude Code conversations" bug — repeated clicks compound the delayed focus calls.
- [✔️] Fixed — `focusEditorOnce()` now accepts a provider-specific `IEditorCommands` parameter; `openConversation()` passes the resolved provider commands so the delayed focus targets the correct editor (Codex sidebar or Claude Code)

## BUG24 — Clicking Codex task non-deterministically opens a Claude Code conversation

- **Reported:** 2026-03-26
- **Symptom:** Clicking a Codex task card sometimes opens the Codex sidebar correctly, but other times focuses a random Claude Code conversation tab instead. The behavior is non-deterministic — it depends on which Claude Code tab happens to be active at the moment.
- **Root cause:** Three compounding issues:
  1. `KanbanViewProvider.openConversation()` schedules `recordActiveTabMapping(conversationId)` for ALL conversations including Codex. But `TabManager.recordActiveTabMapping` only detects Claude Code tabs (`_isProviderTab` matches Claude webview tabs). When a Codex conversation is opened (sidebar focus), whichever Claude Code tab happens to be active gets mapped to the Codex conversation ID.
  2. On subsequent clicks, `getTabLabel(conversationId)` returns the wrongly-cached Claude Code tab label, and `focusTabByLabel` focuses that Claude Code tab — completely bypassing the Codex sidebar.
  3. `TabManager.matchTabToConversation()` does fuzzy title matching against ALL conversations including Codex, so focus detection can report a Codex conversation ID when a Claude Code tab with a similar title is focused.
- [✔️] Fixed — `openConversation` and `sendPromptToConversation` now skip tab caching, `closeUnmappedClaudeTabByTitle`, `focusEditorOnce`, and `recordActiveTabMapping` for non-tab-based providers (Codex); `matchTabToConversation` filters out Codex conversations so focus detection only matches Claude Code tabs to Claude Code conversations

## BUG24b — Clicking Codex task should open the specific conversation (not just sidebar)

- **Reported:** 2026-03-26
- **Symptom:** Clicking a Codex task card opens the Codex sidebar panel, but doesn't navigate to the specific conversation. The user has to find it manually.
- **Root cause:** The Codex VS Code extension (`openai.chatgpt`) does not expose a command to open a specific conversation by ID — only `chatgpt.openSidebar` is available. This is a limitation of the Codex extension's public API, not of Claudine. Once Codex exposes such a command, `CodexEditorCommands.openConversation` can be updated.
- [ ] Blocked on Codex extension API

## BUG2c — Workspace not re-detected after opening a folder

- **Reported:** 2026-04-01
- **Symptom:** When VS Code starts with no workspace open, Claudine shows all conversations (correct). But when the user then opens a workspace folder, Claudine keeps showing all conversations instead of filtering to the workspace. Also, no indication is given to the user that they're seeing all projects.
- **Root cause:** No `onDidChangeWorkspaceFolders` listener existed — `getEffectiveWorkspaceFolders()` was only evaluated on initial scan and manual refresh. The webview also had no "no workspace" banner to inform users of the unfiltered state.
- [✔️] Fixed — added `onDidChangeWorkspaceFolders` listener in `extension.ts` that triggers `updateSettings()` + `provider.refresh()`. Added `workspaceDetected` boolean to `ClaudineSettings`. Webview shows gray banner when no workspace is detected, and a transient info banner when a workspace is detected.

## BUG8b — AI summarization produces no summaries and toggle-off has no effect

- **Reported:** 2026-03-26
- **Symptom:** Clicking the AI Summarization toolbar button appears to toggle the setting (button changes visually), but no conversation titles or descriptions are ever summarized. Toggling it back off also has no visible effect — the original text was never replaced, so there is nothing to revert.
- **Root cause:** Three compounding issues in `SummaryService`:
  1. **stdin not received by Claude CLI**: `callCli()` writes the summarization prompt to `child.stdin`, but `claude -p` may not reliably read piped stdin from a spawned child process. The CLI exits with code 0 and empty stdout, causing the JSON parser to reject with "No JSON array in claude response". This error is caught and logged to the console only — no notification reaches the user.
  2. **`spawn` timeout option is ignored**: Node.js `spawn()` does not support a `timeout` option (only `exec`/`execFile` do). The 60-second timeout passed to `spawn` is silently ignored, so a hanging CLI process would block indefinitely.
  3. **Toggle OFF skips refresh**: When summarization is toggled OFF, only `updateSettings()` is called — `refresh()` is not. While Svelte reactivity should re-render based on the settings change, if no summaries were ever generated (due to issues 1–2), the conversations never received `originalTitle` fields, so the toggle has no visible effect in either direction.
- [✔️] Fixed — three changes: (1) `callCli` now passes the prompt as a positional argument to `claude -p` instead of via stdin, (2) `spawn` timeout replaced with `AbortController` + `signal`, (3) toggle OFF now calls `refresh()` in both VS Code and standalone handlers
