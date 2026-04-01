<!-- markdownlint-disable MD024 -->
# Changelog

All notable changes to the Claudine extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Custom terminal configuration: `claudine.customTerminals` config property can be used to specify a custom terminal emulator and arguments for use in Standalone mode.

### Fixed

- Summarization on Windows: `resolveExecutable` now uses `which` or `where` depending on platform, enabling Summarization on Windows
- Workspace path reconstruction (`ConversationParser`) — replaced the greedy hyphen-split + `fsp.access` existence-check approach with a filesystem walk that re-encodes each candidate path using Claude's own algorithm; paths containing dots (`user.name`), underscores (`my_project`), or Windows drive-letter colons (`C:`) are now resolved correctly on all platforms
- Windows workspace encoding (`ClaudeCodeWatcher`) — `encodeWorkspacePath` normalizes backslashes before encoding and applies case folding on case-insensitive platforms (Windows/macOS), matching Claude Code's encoding exactly; fixes conversations from Windows projects not appearing on the board
- Standalone terminal resumption on Windows — tries Windows Terminal (`wt`) before falling back to `cmd /c start`
- Standalone conversation "open in terminal" dropdown immediately closing — `stopPropagation` on the button click prevents the window-level handler from dismissing the menu before it renders

## [1.1.5]

### Added

- Monitored Workspace setting in Settings panel — see which workspace path(s) are currently being scanned; switch between Auto (VSCode workspace detection), Single path (native folder picker), or Multiple paths (add/remove list)
- `MonitoredWorkspace` discriminated union type (`auto | single | multi`) and `detectedWorkspacePaths` field on `ClaudineSettings`
- `getEffectiveWorkspaceFolders()` helper in ClaudeCodeWatcher centralizing workspace resolution for `getProjectDirsToScan()` and `isFromCurrentWorkspace()`
- `browseWorkspaceFolder` / `folderSelected` message pair for native folder picker flow between webview and extension host
- `getWorkspacePaths()` optional method on `IConversationProvider` for exposing detected workspace paths to the UI
- `claudine.monitoredWorkspace` configuration property in `package.json`
- Cross-platform CI — GitHub Actions now runs build, lint, type check, and tests on macOS, Windows, and Linux

### Fixed

- Windows workspace path encoding — `encodeWorkspacePath()` now replaces backslashes (`\`) and drive letter colons (`:`) so that project directories like `C:\Users\dev\project` are matched correctly on disk

## [1.1.4]

### Added

- Codex conversations now support AI summarization — compact kanban-friendly titles and descriptions via Claude CLI (or Codex CLI as fallback)
- Codex conversations now get generated icons (AI-generated or deterministic placeholder) like Claude Code conversations
- SummaryService auto-discovers available CLI backend: tries `claude` first, then `codex` in PATH, then Codex binary bundled in VSCode extensions

### Fixed

- Codex conversations now show the actual user request as the title instead of system instructions (permissions, AGENTS.md, environment context)
- Codex VSCode conversations strip the IDE context preamble (`# Context from my IDE setup:`) and show the real request from `## My request for Codex:`
- Codex full-text search now returns results — ID extraction was looking at the wrong JSON path (`payload.meta.id` instead of `payload.id`)

## [1.1.3]

### Added

- Text-based question detection — tasks show the "?" badge and move to "Needs Input" when the agent's last response ends with a question mark, not only when using the `AskUserQuestion` tool

### Changed

- Updated `README.md` with current feature list, screenshots, and setup instructions
- VSIX packaging switched to whitelist `.vscodeignore` — only `out/`, `resources/`, `l10n/`, `webview/dist/`, and essential metadata are included (8019 → 75 files)
- Build script (`tools/build-vsix.sh`) now auto-bumps the version when `CHANGELOG.md` contains an `[Unreleased]` section, and only upgrades — never downgrades — `package.json`

## [1.1.1] - 2026-02-12

### Added

- Agent integration status bar button — shows in VS Code when `CLAUDINE.AGENTS.md` is missing or not referenced; auto-hides once configured
- Multiline quick idea input — the "Quick idea" field auto-grows as you type; Enter to submit, Shift+Enter for new lines
- Newsletter subscription backend (`subscribe.php`) with email validation, honeypot spam guard, and SQLite persistence
- Website "Stay in the Loop" newsletter section with email signup form

### Changed

- Redesigned About window with gradient branding, grid background, and clickable links (website, GitHub, Marketplace, Sponsor)
- Cleaner task cards — removed redundant "Respond" button; prompt input appears only on hover/focus
- Standalone settings persistence — UI changes (summarization, display options, image API) now save to `~/.claudine/config.json`

### Fixed

- Live file monitoring in standalone mode — board now updates in real-time (fixed chokidar v4 glob-pattern watcher regression)
- AI summarization toggle in standalone mode no longer a no-op; config changes are properly persisted
- Stale rate-limit banner no longer appears when the limit has already expired from a prior conversation

## [1.1.0] - 2026-02-09

### Added

- Standalone mode: run Claudine without VS Code (`npm run standalone`)
- Multi-project UI with progressive loading, project picker, and per-project incremental delivery
- Desktop notifications (standalone) for conversations that need input
- Theme toggle (standalone): auto/dark/light
- Open conversation from standalone in Terminal or VS Code
- Resizable project panes in standalone; heights persist across reloads
- Card layout settings (icon, description, latest message, git branch) in the in-app Settings panel
- Localization bundles for German, Spanish, French, and Italian (runtime `vscode.l10n` + `package.nls`)
- Marketplace helper scripts:
  - `tools/build-vsix.sh` now reads the latest version from `CHANGELOG.md`, updates `package.json`, and packages a versioned VSIX
  - `tools/deploy-to-vscmarketplace.sh` publishes the latest `claudine-x.y.z.vsix` to the VS Code Marketplace
- Project website built with Astro + Tailwind CSS (dark theme, responsive)
- Quick Start guide (`QUICK_START.md`)
- Auto-exclude macOS temp directories from standalone project scanning
- Full title bar parity — all 13 toolbar buttons available in both sidebar and title bar

### Changed

- View placement is now fully managed by VS Code (removed the custom panel/sidebar placement setting and toggle command)
- Board orientation (horizontal vs vertical) now follows live view geometry so rendering matches the current dock placement
- Default toolbar behavior updated so controls can appear in both the webview sidebar and the VS Code title bar
- Consistent codicon SVG icons across sidebar and title bar

### Fixed

- Drag-and-drop stays accurate when the board is zoomed in/out (cursor alignment and drop zones)
- Moving the Claudine view between docks no longer leaves the board in the wrong column orientation
- Placement changes no longer race and snap back after drag-and-drop view moves
- Reduced false "needs input" detection while the agent is actively working; tightened question detection edge cases
- Sidebar toolbar icons rendering as broken rectangles in webview iframe (replaced CSS font icons with inline SVGs)

## [1.0.6] - 2026-02-08

### Added

- Automated release pipeline via GitHub Actions — publish to VS Code Marketplace and Open VSX on tag push
- GitHub Releases with `.vsix` artifact attached automatically

### Changed

- Migrated website URL across package.json, README, and SECURITY.md

## [1.0.5] - 2026-02-08

### Added

- Scrollable sidebar toolbar — scrolls vertically when panel height is too small to show all buttons
- Panel title bar actions — toolbar buttons can appear in the VS Code panel tab header, controlled by `claudine.toolbarLocation` setting (`sidebar`, `titlebar`, or `both`)
- New commands: `toggleSearch`, `toggleFilter`, `toggleCompactView`, `toggleExpandAll`, `toggleArchive` forwarded from title bar to webview
- View/title menu contributions with codicon icons
- Zoom controls (50%–150%) via sidebar buttons and keyboard shortcuts (`Ctrl+=`/`Ctrl+-`/`Ctrl+0`)
- Resizable columns with drag handles between columns (horizontal layout only), double-click to reset
- 5-step Getting Started walkthrough via VS Code's built-in Walkthroughs UI
- Webview origin validation with per-session auth token on every `postMessage`
- Shared `mergeState()` helper in `vscode.ts` for safe concurrent webview state persistence

### Changed

- Panel view shows only elephant icon; sidebar/sidedock shows vertical "Claudine" text to avoid redundancy with VS Code native titles

## [1.0.4] - 2026-02-08

### Added

- Rate limit detection — automatically detects when Claude Code hits its API limit and shows the reset time
- Amber hourglass banner at the top of the board with "resets at X" display
- Pause badge (⏸) on all rate-limited task cards (full, compact, and narrow views)
- Auto-restart option — paused tasks automatically resume after the rate limit resets (+30s grace period)
- Auto-restart toggle available in the banner and the settings panel

## [1.0.3] - 2026-02-08

### Added

- Sidechain activity dots — small colored dots show the last 3 subagent steps (gray=idle, green=completed, red=failed, yellow=running)
- Project filtering — only conversations from the currently opened workspace are shown
- Performance benchmarks and test fixtures for ClaudeCodeWatcher, ConversationParser, KanbanViewProvider, StateManager

### Fixed

- Ghost "Untitled Conversation" cards caused by Claude Code sidechain messages leaking into the board
- Tasks from other projects appearing on the board
- Empty conversations with no meaningful content no longer displayed

## [1.0.2] - 2026-02-07

### Added

- `claudine.showDiagnostics` command with OutputChannel for troubleshooting
- Incremental byte-offset JSONL parsing with cache in ConversationParser
- CONTRIBUTING.md, SECURITY.md, issue templates, PR template

### Changed

- Decomposed KanbanViewProvider into smaller modules — extracted TabManager (828 → 484 lines)
- Extracted named constants to `src/constants.ts` across 8 source files
- README updated with command table, sidebar controls, roadmap, feature docs

## [1.0.1] - 2026-02-07

### Added

- Unit tests for CategoryClassifier, ConversationParser, StateManager
- Internationalization (i18n) support via `package.nls.json`
- CI/CD pipeline (`.github/workflows/ci.yml`)
- Custom keybindings support
- Input notifications for user feedback
- API key validation with tests
- Switch between panel and sidebar view
- Search filters (status, category)
- Board import/export functionality (`BoardExporter`)
- Extension API for external integrations
- Activity bar and sidebar icons

### Changed

- Updated logo and icon assets

## [1.0.0] - 2026-02-07

### Added

- MCP-like API interface through JSONL (`CommandProcessor`) for external tool integration
- ESLint configuration for code quality
- `.vscodeignore` for leaner extension packaging
- esbuild bundler configuration
- LICENSE (MIT)
- AUDIT.md documenting security review findings
- TODO.md for roadmap tracking

### Changed

- Hardened input sanitization and validation based on security audit
- Improved inline prompt input and settings panel
- Filesystem access scoped to workspace

## [0.2.0] - 2026-02-07

### Added

- README documentation with feature overview and usage guide
- Enhanced tab focus management for conversation tracking

### Changed

- Improved archive behavior for stale done/cancelled conversations
- Richer card views with more conversation detail

## [0.1.1] - 2026-02-06

### Added

- Smart status transitions — auto-detect conversation state changes from JSONL message patterns
- Persistent storage service for board state across sessions
- Enhanced Kanban board interactions and card styling

## [0.1.0] - 2026-02-06

### Added

- Kanban board with columns: To Do, Needs Input, In Progress, In Review, Done, Cancelled, Archived
- Auto-status detection from Claude Code conversation message patterns
- Auto-category classification (Bug, Feature, User Story, Improvement, Task)
- Drag-and-drop between columns with manual override preservation
- Full-text search across card fields and JSONL conversation content
- Search highlighting with Fade/Hide modes
- Compact and expanded card view toggle
- Conversation focus tracking (highlights active Claude Code editor)
- Click-to-open conversations in Claude Code visual editor
- Inline prompt input for follow-up messages
- Git branch display per conversation
- Active agent pulsating indicators
- Optional AI-generated task icons via OpenAI DALL-E or Stability AI
- Optional AI-powered summaries via Claude CLI
- Real-time file system watcher for conversation updates
- Workspace-scoped conversation filtering
- Draft quick ideas in the To Do column
- Auto-archive for stale done/cancelled conversations
- Empty Claude Code tab cleanup after workspace restart
