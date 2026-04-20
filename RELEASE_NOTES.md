# Release Notes

## Version 1.2.16 (Apr 1 2026, 12:00)

* **Fix: Workspace now re-detected when a folder is opened** — Claudine automatically narrows conversations to the opened workspace instead of continuing to show all projects
* **"No workspace" banner** — when no workspace is detected, a gray info bar explains that all conversations are shown and links to the Claudine settings to select a workspace path
* **Transient "Workspace detected" banner** — briefly shown when Claudine detects a newly opened workspace, with a link to change the setting

## Version 1.2.15 (Mar 26 2026, 09:19)

* **Provider-aware "Open in" menu** — standalone mode now shows context-aware options: Codex conversations offer "Open in Codex (VSCode)" and "Open in Codex (Cursor)"; Claude Code conversations offer "Resume in Terminal". All conversations show "Open in VSCode" and "Open in Cursor" as general editor options

## Version 1.2.14 (Mar 26 2026, 11:05)

* **Fix: Clicking Codex task no longer opens random Claude Code tab** — fixed non-deterministic behavior where clicking a Codex task card would sometimes focus a Claude Code conversation instead of the Codex sidebar, caused by tab mapping crossover between providers
* **Fix: Focus detection no longer confuses Codex and Claude Code conversations** — tab-to-conversation matching now only considers Claude Code conversations, preventing the focus indicator from highlighting the wrong card

## Version 1.2.13 (Mar 26 2026, 00:15)

* **Fix: AI Summarization now works** — the summarization CLI call was silently failing because the prompt was piped via stdin (unreliable); it is now passed as a positional argument to `claude -p`
* **Fix: Summarization toggle OFF reverts to originals** — toggling summarization off now triggers a refresh so conversations re-render with their original titles
* **Fix: Spawn timeout properly enforced** — replaced invalid `spawn({ timeout })` with `AbortController` + `signal` for reliable process timeout
* **Claude Code worktrees now appear on the board** — Claudine can now scan worktree sessions created under `.claude/worktrees/*` for each monitored workspace
* **Worktree label on cards** — conversations from Claude worktrees now show a small `wt` badge with the worktree name so you can tell them apart at a glance

## Version 1.2.12 (Mar 25 2026, 23:27)

* **Fix: Codex tasks placed in correct columns** — detected Codex conversations now appear in "In Progress", "Needs Input", "In Review", or "Done" instead of incorrectly landing in "To Do"
* **Fix: Clicking Codex task opens sidebar** — clicking a Codex task card now opens the Codex sidebar panel instead of the raw session file
* **Fix: Opening Codex task no longer triggers Claude Code** — fixed a bug where clicking a Codex task would also open or focus a random Claude Code conversation due to the delayed focus call using the wrong provider

## Version 1.2.11 (Mar 25 2026, 22:55)

* **Fix: Monitored Workspace shared across windows** — the workspace path setting is now stored per-workspace in `.claudine/workspace-settings.json` (gitignored) instead of globally, so each VS Code window tracks its own monitored path independently

## Version 1.2.10 (Mar 11 2026, 15:02)

* **Monitored Workspace** — see which workspace path is being monitored in Settings; switch between auto-detection (VSCode workspace), a single manually-picked path, or multiple paths with add/remove

## Version 1.2.9 (Mar 11 2026, 14:55)

* **Windows compatibility** — fixed workspace path encoding so Claudine can find conversations on Windows (backslashes and drive letter colons are now handled correctly)
* **Cross-platform CI** — GitHub Actions now runs build, lint, type check, and tests on macOS, Windows, and Linux

## Version 1.2.8 (Mar 7 2026, 00:06)

* **Fix: Context menu not visible** — right-click context menu on task cards was invisible when the board was zoomed (transform/overflow clipping); menu is now portaled to document.body to escape all CSS containment

## Version 1.2.7 (Mar 6 2026, 23:55)

* **Fix: Background agent dots** — conversations with multiple background agents now show one dot per agent instead of capping at 3 activity steps; each dot reflects the agent's latest status (running/completed/failed)
* **Fix: In Progress column** — conversations with running background agents now stay in "In Progress" even when the main thread says "All done"; previously they were incorrectly placed in "In Review"

## Version 1.2.6 (Mar 6 2026, 20:00)

* **Codex summarization** — Codex conversations now get AI-summarized titles and descriptions for compact kanban cards, using Claude CLI or Codex CLI as fallback
* **Codex icon generation** — Codex conversations now show AI-generated or placeholder icons, matching Claude Code conversations
* **Fix: Codex titles** — titles no longer show system instructions; IDE context preamble is stripped to show the actual user request
* **Fix: Codex search** — full-text search now finds Codex conversations (was silently failing due to wrong JSON path for ID extraction)
* **Fix: Clicking Codex tasks** — clicking a Codex conversation now opens its session file instead of opening an empty Claude Code tab

## Version 1.2.5 (Mar 6 2026, 12:30)

* **Enhanced filter bar** — filter conversations by AI service (Claude Code, Codex) and by problem state (Needs Attention, Question, Interrupted, Error, Rate Limited); chips are multi-select and auto-hide when not applicable
* **Fix: Codex conversations in standalone mode** — Codex conversations now appear correctly in the standalone task panel; previously they were missing because the progressive scan only included Claude Code

## Version 1.2.4 (Mar 6 2026, 09:58)

* **Task card context menu** — right-click any task card to open conversation, move to a different column, or archive immediately; draft cards show "Send idea" and "Delete idea"

## Version 1.2.3 (Mar 6 2026, 09:38)

* **Text-based question detection** — tasks now show the "?" badge and move to "Needs Input" when the agent's last response ends with a question mark, not just when using the AskUserQuestion tool

## Version 1.2.2 (Feb 24 2026, 13:00)

* **OpenAI Codex support** — Claudine now auto-detects Codex sessions in `~/.codex/sessions/` and displays them alongside Claude Code conversations on the same board
* **Multi-provider architecture** — new `CompositeConversationProvider` wraps multiple providers behind a single interface; providers don't clobber each other's data
* **Codex session parsing** — parses Codex JSONL format (standard and legacy), detects status from event types (completed, in-progress, error, aborted, rate-limited)
* **New setting: `codexPath`** — override the Codex data directory (defaults to `~/.codex`)
* Codex conversations show "Codex" as the agent name and IDs are prefixed with `codex-` to prevent collision

## Version 1.2.1 (Feb 24 2026, 10:00)

* **Provider abstraction layer** — internal refactoring to support multiple conversation sources (Claude Code, OpenAI Codex) via `IConversationProvider` and `CompositeConversationProvider`
* **Fix: projects with dots in their name** — workspaces containing dots (e.g. `molts.club`, `bu.app-game`) were not found because the path encoder didn't match Claude Code's encoding; conversations from these projects now appear correctly (BUG12)

## Version 1.2.0 (Feb 12 2026, 22:30)

* **Smart Board** — a cross-project overview section at the top of the board with three lanes: Running, Needs Input, and In Review
* **Project labels on cards** — compact task cards in the Smart Board show the project name so you can tell at a glance which project each task belongs to
* **Dismiss from Smart Board** — click the X on an "In Review" card to acknowledge it and remove it from the overview; the card stays in the In Review column
* **Collapsible Smart Board** — click the header to collapse/expand; state persists across reloads
* **Auto-acknowledge on move** — dragging a card out of the In Review column automatically dismisses it from the Smart Board

## Version 1.1.2 (Feb 12 2026, 16:08)

* **Agent integration status bar button** — a right-aligned button in the VS Code status bar shows when `CLAUDINE.AGENTS.md` is missing or not referenced in `AGENTS.md` / `CLAUDE.md`; click to scaffold the file or get a reminder
* **Auto-updating status bar** — the button reacts to file changes and hides itself once everything is wired up
* **Version number in About dialog** — the About popup now displays the current extension version
* **Standalone settings persistence** — settings changed via the UI are now saved to `~/.claudine/config.json`
* **About dialog redesign** — gradient branding, grid background, purple/blue color scheme, clickable links to website/GitHub/Marketplace/Sponsors

## Version 1.1.1 (Feb 11 2026, 17:38)

* **Fixed live monitoring in standalone mode** — the board now updates in real-time; previously chokidar v4 silently dropped file-change events for glob-pattern watchers
* **Fixed AI summarization toggle** — the toolbar button now properly toggles in standalone mode
* **Fixed stale rate-limit banner** — the banner no longer shows when the limit has already expired from an old conversation

## Version 1.1.0 (Feb 11 2026, 14:38)

* **Multiline quick idea input** — the "Quick idea" field now auto-grows as you type; Enter to submit, Shift+Enter for new lines
* **Sidechain activity dots** — colored dots show the last 3 subagent steps (gray=idle, green=completed, red=failed, yellow=running with pulse animation)
* **Rate limit detection & auto-restart** — detects "You've hit your limit" messages, shows amber banner with reset time, optional auto-restart after limit resets
* **Localization bundles** — German, Spanish, French, and Italian translations for runtime UI and extension metadata
* **VS Code-managed placement** — removed custom panel/sidebar setting; board orientation now follows VS Code's native layout via live geometry detection
* **Card layout settings** — choose which elements to display on task cards (icon, description, latest message, git branch)
* **Bug fix:** Drag-and-drop now works correctly when the board is zoomed
* **Bug fix:** Tasks no longer falsely show "needs input" while the agent is actively thinking or running tools
* **Bug fix:** Question detection no longer triggers on normal agent reasoning text

## Version 1.0.6 (Feb 8 2026, 22:30)

* **Standalone mode** — run Claudine without VS Code: `claudine standalone` starts an HTTP + WebSocket server at `http://127.0.0.1:5147`
* **Multi-project view** — in standalone mode, conversations are grouped by project with collapsible, resizable panes
* **Progressive project loading** — projects discovered instantly, conversations load incrementally with a progress bar
* **Auto-exclude temp directories** — macOS/Windows/Linux temp and system paths automatically excluded from scanning
* **Desktop notifications** — browser notifications when a conversation needs input (standalone mode)
* **Theme toggle** — cycle between auto, dark, and light themes in standalone mode
* **Platform abstraction layer** — core services decoupled from VS Code APIs via `IPlatformAdapter` interface
* **Automated release pipeline** — push a version tag to publish to VS Code Marketplace and Open VSX via GitHub Actions

## Version 1.0.5 (Feb 8 2026, 15:07)

* **Toolbar location toggle** — choose sidebar or title bar placement for toolbar buttons; all 13 actions available in both
* **Scrollable toolbar** — sidebar toolbar scrolls vertically when panel is too short
* **Zoom controls** — zoom in/out (50%–200%) via toolbar buttons or keyboard shortcuts
* **Resizable columns** — drag handles between columns to adjust widths; double-click to reset
* **Getting Started walkthrough** — 5-step guided onboarding via VS Code's walkthrough system
* **Webview security** — per-session auth token on all webview↔extension messages

## Version 1.0.4 (Feb 8 2026, 12:00)

* **Rate limit detection** — automatically detects when Claude Code hits its API limit and shows the reset time
* **Rate limit banner** — amber hourglass banner at the top of the board with "resets at X" display
* **Pause badge** — ⏸ badge on all rate-limited task cards (full, compact, and narrow views)
* **Auto-restart option** — when enabled, paused tasks automatically resume after the rate limit resets (+ 30s grace)

## Version 1.0.3 (Feb 8 2026, 09:21)

* **Sidechain activity dots** — small colored dots show the last 3 subagent steps
* **Fixed ghost cards** — Claude Code sidechain messages no longer leak into the board as "Untitled Conversation" cards
* **Workspace scoping** — only conversations from the currently opened workspace are shown
* **Empty conversation filtering** — conversations with no meaningful content are no longer displayed

## Version 1.0.2 (Feb 7 2026, 18:00)

* **Decomposed architecture** — extracted `StateManager`, `StorageService`, `ImageGenerator`, `SummaryService`, `CategoryClassifier`, `CommandProcessor`, `BoardExporter` from monolithic provider
* **Named constants** — all magic numbers extracted to `src/constants.ts`
* **Incremental JSONL parsing** — only newly appended bytes read on file change, with LRU cache
* **Diagnostics command** — `Show Diagnostics` displays extension health info in an output channel
* **Community docs** — added CONTRIBUTING.md, SECURITY.md, issue templates, PR template

## Version 1.0.1 (Feb 7 2026, 15:00)

* **Unit tests** — comprehensive test suite with vitest
* **Internationalization** — `vscode.l10n` integration for all UI strings
* **CI/CD pipeline** — GitHub Actions for build, test, and release
* **Notifications** — desktop notification when a conversation transitions to "Needs Input"
* **API key validation** — "Test Connection" button in settings panel
* **Panel/sidebar toggle** — switch board placement via command palette
* **Search filters** — in-webview search bar with fade/hide modes
* **Import/export** — CSV, JSON, and Trello-compatible export; JSON import
* **Extension API** — other extensions can query conversations and listen for changes
* **Agent integration** — Claude agents can control the board via `.claudine/commands.jsonl`

## Version 1.0.0 (Feb 7 2026, 12:00)

* **Initial release** — kanban board for Claude Code conversations
* **Auto-status detection** — conversation state inferred from JSONL message content
* **Category classification** — rule-based tagging (bug, feature, user-story, improvement, task)
* **Drag-and-drop** — move conversations between columns
* **AI-generated icons** — optional task icons via OpenAI DALL-E or Stability AI
* **AI summarization** — optional title/description summaries via Claude CLI
* **Click to open** — open conversations in Claude Code editor from the board
* **Git branch display** — shows branch associated with each conversation
* **File system watcher** — board updates in real time as JSONL files change
* **Quick ideas** — draft conversation ideas in the To Do column
