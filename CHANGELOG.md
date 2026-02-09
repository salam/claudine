<!-- markdownlint-disable MD024 -->
# Changelog

All notable changes to the Claudine extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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

### Changed

- View placement is now fully managed by VS Code (removed the custom panel/sidebar placement setting and toggle command)
- Board orientation (horizontal vs vertical) now follows live view geometry so rendering matches the current dock placement
- Default toolbar behavior updated so controls can appear in both the webview sidebar and the VS Code title bar

### Fixed

- Drag-and-drop stays accurate when the board is zoomed in/out (cursor alignment and drop zones)
- Moving the Claudine view between docks no longer leaves the board in the wrong column orientation
- Placement changes no longer race and snap back after drag-and-drop view moves
- Reduced false "needs input" detection while the agent is actively working; tightened question detection edge cases

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
