# Release Notes

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
