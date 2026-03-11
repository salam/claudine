# Features

## Kanban Board

- [x] Seven-column board: To Do, Needs Input, In Progress, In Review, Done, Cancelled, Archived
- [x] Drag-and-drop between columns (manual overrides preserved until new activity)
- [x] Adaptive layout: horizontal columns in panel, vertical in sidebar (auto-detected via ResizeObserver)
- [x] Resizable columns with drag handles; widths persisted across sessions
- [x] Zoom controls (50%–200%) via toolbar buttons or Ctrl+=/Ctrl+-/Ctrl+0
- [x] Compact view toggle (hides description and latest message)
- [x] Expand/collapse all cards at once
- [x] Toggle archive column visibility
- [x] Empty-board welcome state with setup instructions

## Task Cards

- [x] Category color dot (bug=red, feature=green, user-story=blue, improvement=amber, task=gray)
- [x] AI-generated icon thumbnail (OpenAI / Stability AI) or deterministic SVG placeholder
- [x] Title with optional summarized vs. original toggle
- [x] Expandable description and "latest message" preview
- [x] Git branch badge (clickable, opens Source Control)
- [x] Agent avatars with active/idle state indication
- [x] Sidechain activity dots (last 3 subagent steps: green/yellow/red/gray, running dots pulse)
- [x] Last tool activity chip (e.g. `Read "path/to/file"`, `Bash "npm test"`)
- [x] Activity timer counting seconds/minutes while agent is actively working
- [x] Status badges: error, interruption, question/awaiting-input, rate-limit
- [x] Inline "Respond" prompt input on cards needing input
- [x] "Open" menu to open conversation in terminal or VS Code editor
- [x] Highlight when the card's conversation is the focused editor tab
- [x] Configurable display: toggle icon, description, latest message, git branch

## Auto-Status Detection

- [x] `todo` — no assistant messages yet
- [x] `in-progress` — last message from user, or assistant has pending tool calls and session recently active
- [x] `needs-input` — rate limit, error, AskUserQuestion/ExitPlanMode tool use, question patterns in last assistant message
- [x] `in-review` — completion language detected or agent transitioned from active to idle
- [x] `done` / `cancelled` / `archived` — set manually, preserved across re-parses
- [x] Text-based question detection — "?" at end of assistant message triggers needs-input

## Category Auto-Classification

- [x] Rule-based scoring of first 5 messages against keyword/regex patterns
- [x] Categories: bug, user-story, feature, improvement, task
- [x] Category filter bar with multi-select chip buttons

## Smart Board (Cross-Project Overview)

- [x] Collapsible overview section at the top of the board (standalone mode)
- [x] Three lanes: Needs Input, In Progress, In Review
- [x] Compact cards with project name labels
- [x] "Acknowledge" button on In Review cards to dismiss from Smart Board
- [x] Auto-hide when all lanes are empty
- [x] Persist collapsed state and acknowledged IDs

## Rate Limit Detection & Auto-Restart

- [x] Detect "You've hit your limit" messages in Claude Code output
- [x] Parse reset time and timezone into absolute ISO timestamp
- [x] Amber hourglass banner with reset time display
- [x] Pause badge on rate-limited cards in all view modes
- [x] Auto-restart toggle: schedule resume 30s after limit resets
- [x] Send "continue" prompt to all rate-limited conversations on timer fire
- [x] VS Code notification on detection

## Search

- [x] Command palette search (`Cmd+Shift+F`) — full-text grep across JSONL files
- [x] In-webview live search bar (debounced 300ms)
- [x] Search result display modes: Fade (dim non-matches) or Hide (remove non-matches)
- [x] Matching cards auto-expand in compact view

## Enhanced Filter Bar

- [x] Provider filter chips (Claude Code, Codex) — multi-select, shown when >1 provider
- [x] State/problem filter chips — Needs Attention, Question, Interrupted, Error, Rate Limited
- [x] "Needs Attention" meta-filter (union of all problem states)
- [x] Individual + meta intersection behavior
- [x] Chips auto-hide when no conversations match that state
- [x] Clear-all button resets all filter groups
- [x] Visual dividers between chip groups

## Conversation Actions

- [x] Click card title to open in Claude Code editor
- [x] Inline prompt input to send follow-up messages from the board
- [x] Quick Ideas / Drafts in To Do column (multi-line, persisted to `.claudine/drafts.json`)
- [x] Start new conversation from draft or command palette
- [x] Move conversation to status via command palette

## AI Features

- [x] Task icon generation: OpenAI (gpt-image-1) or Stability AI (SDXL), with SVG placeholder fallback
- [x] Referenced image detection: reads images mentioned in conversation as card icons
- [x] AI summarization via local `claude` CLI (title, description, lastMessage)
- [x] Summary cache in VS Code global state, pruned on each scan cycle
- [x] API key validation with "Test Connection" button

## Multi-Provider Support

- [x] Claude Code provider: watches `~/.claude/projects/**/*.jsonl`
- [x] OpenAI Codex provider: watches `~/.codex/sessions/**/*.jsonl` (auto-detected)
- [x] CompositeConversationProvider wrapping multiple providers
- [x] Provider-scoped state management (providers don't clobber each other)
- [x] Codex session parsing: standard and legacy envelope formats
- [x] `codexPath` setting with localized descriptions

## File Watching & Parsing

- [x] Real-time `chokidar` file watchers on JSONL directories
- [x] Incremental parsing: only newly appended bytes read on file change
- [x] LRU parse cache (200 entries max)
- [x] Workspace-scoped filtering (only shows conversations for current workspace)
- [x] Subagent JSONL files excluded

## State Persistence

- [x] Board state saved to `.claudine/state.json` (workspace) or VS Code global state (fallback)
- [x] Drafts saved to `.claudine/drafts.json`
- [x] Icons saved to `.claudine/icons/<id>.png`
- [x] Debounced saves (200ms) with synchronous flush on deactivation
- [x] Manual overrides preserved across re-parses

## Auto-Archive

- [x] Done/cancelled conversations archived after 4 hours
- [x] Timer runs every 5 minutes while webview is visible
- [x] Immediate archive via `archiveDone` command

## Tab Management

- [x] Bidirectional map: Claude Code editor tab ↔ conversation ID
- [x] Focus detection: active Claude tab highlights matching card (debounced 150ms)
- [x] Restored-tab replacement: detects empty post-restart shells and replaces with fresh sessions
- [x] Close empty/duplicate Claude tabs command

## Agent Integration

- [x] Claude agents control the board via `.claudine/commands.jsonl`
- [x] Commands: move, update, set-category (with task resolution by ID/title/substring)
- [x] Results written to `.claudine/command-results.json`
- [x] `setupAgentIntegration` command scaffolds `CLAUDINE.AGENTS.md`
- [x] Status bar button: missing → setup prompt, unreferenced → warning, ok → hidden

## Data Portability

- [x] Export: CSV, Claudine JSON (re-importable), Trello-compatible JSON
- [x] Import: merge from Claudine JSON export

## Standalone Web Server Mode

- [x] CLI: `claudine standalone [--port] [--host] [--no-open]`
- [x] HTTP + WebSocket server (default port 5147)
- [x] Per-session auth token for WebSocket messages
- [x] Multi-project view with collapsible, resizable project panes
- [x] Progressive project scanning with progress bar
- [x] Auto-exclude temp/system directories
- [x] Desktop browser notifications for needs-input
- [x] Theme toggle (system / light / dark)
- [x] Settings persistence to `~/.claudine/config.json`
- [x] Monitored Workspace setting — auto (VSCode workspace), single path, or multiple paths with native folder picker
- [x] Graceful shutdown on SIGINT/SIGTERM

## Notifications

- [x] VS Code notification on needs-input transition
- [x] Desktop notification in standalone mode (browser Notification API)

## Extension API

- [x] `getConversations()`, `getConversation(id)`, `getConversationsByStatus(status)`
- [x] `moveConversation(id, status)`
- [x] `onConversationsChanged(handler)`, `onNeedsInput(handler)`

## Diagnostics

- [x] Output channel with extension version, paths, API config, watcher status, cache stats, conversation counts

## Internationalization

- [x] `vscode.l10n` for all user-facing strings
- [x] NLS bundles: English, German, French, Spanish, Italian
- [x] Webview receives translated strings at startup

## Webview Security

- [x] Content Security Policy: `default-src 'none'`, scripts require per-load nonce
- [x] Per-session auth token on all webview↔extension messages

## Walkthrough

- [x] 5-step VS Code walkthrough: Install Claude Code → Find the Board → Start a Conversation → Key Features → Agent Integration
- [x] First-run notification with "Open Walkthrough" action

## Toolbar

- [x] Configurable location: sidebar (vertical strip) or VS Code panel title bar
- [x] All 13 actions available in both locations
- [x] Scrollable when panel is too short

## Marketplace & CI/CD

- [x] Automated VSIX packaging with version from changelog
- [x] Deploy scripts for VS Code Marketplace and Open VSX
- [x] GitHub Actions: CI pipeline and release pipeline on version tags

## Task Card Context Menu

- [x] Right-click context menu on all card modes (full, compact, narrow, draft)
- [x] "Open conversation" as bold default action
- [x] "Move to X" items for each column (current column omitted, with color dots)
- [x] "Archive immediately" action
- [x] Draft cards: only "Send idea" + "Delete idea" (no move options)
- [x] Viewport edge clamping, Escape to close, click-outside to close
