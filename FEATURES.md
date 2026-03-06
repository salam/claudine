# Features

## Text-Based Question Detection

- [x] Detect when last assistant text response ends with "?" (not just AskUserQuestion tool use)
- [x] Show "?" badge and move task to "Needs Input" column
- [x] Respect manual overrides (done/cancelled/archived not re-opened)
- [x] Auto-clear when agent resumes activity (existing merge logic)

## Smart Board (Cross-Project Overview)

- [x] Show a collapsible "Smart Board" section at the top of the board
- [x] Three lanes: Running (in-progress), Needs Input, In Review (unacknowledged)
- [x] Compact task cards with project name label
- [x] Dismiss button on In Review cards to acknowledge
- [x] Auto-acknowledge when user drags card out of in-review column
- [x] Persist collapsed state and acknowledged IDs via webview state
- [x] Cleanup acknowledged IDs when conversation leaves in-review
- [x] Auto-hide when all lanes are empty

## Rate Limit Detection & Auto-Restart

- [x] Detect "You've hit your limit" messages in Claude Code assistant output
- [x] Parse reset time and timezone (e.g. "10am (Europe/Zurich)") into absolute ISO timestamp
- [x] Show amber hourglass banner at the top of the board with reset time display
- [x] Badge rate-limited task cards with a pause icon (⏸) in all view modes
- [x] Auto-restart toggle: clickable link in banner + checkbox in settings panel
- [x] Schedule auto-restart timer with 30s grace period after limit resets
- [x] Send "continue" prompt to all rate-limited conversations on timer fire
- [x] VS Code notification on rate limit detection
- [x] `autoRestartAfterRateLimit` setting in VS Code configuration

## Sidechain Activity Dots

- [x] Collect sidechain step status from JSONL entries (`isSidechain: true`)
- [x] Determine step status: running (yellow), completed (green), failed (red), idle (gray)
- [x] Keep only the last 3 sidechain steps (ring buffer)
- [x] Render colored dots in TaskCard full view (meta-row, between git branch and agents)
- [x] Render colored dots in TaskCard compact view (before agent avatars)
- [x] Render single summary dot in TaskCard narrow view
- [x] Running dots pulse with 2s animation
- [x] Tooltip shows tool name on hover

## Localization Bundles (DE/ES/FR/IT)

- [x] Audit current localization coverage and identify hardcoded non-localized UI strings
- [x] Tokenize remaining localizable `package.json` metadata strings into `package.nls.json`
- [x] Add `package.nls.de.json`, `package.nls.es.json`, `package.nls.fr.json`, `package.nls.it.json`
- [x] Add runtime translation bundles in `l10n/` for `de`, `es`, `fr`, `it`
- [x] Add a unit test to enforce locale key parity across all translation bundles

## VS Code Placement Ownership

- [x] Remove user-facing `claudine.viewLocation` configuration
- [x] Remove placement toggle command and dual-view contribution wiring
- [x] Keep `claudine.kanbanView` as a single view ID so VS Code stores/moves placement natively
- [x] Drive board orientation from live layout geometry instead of persisted setting
- [x] Add regression tests that stale/deprecated placement writes are ignored

## Marketplace Packaging & Deploy Scripts

- [x] Add a deploy script in `tools/` to publish the latest `claudine-x.y.z.vsix` to VS Code Marketplace
- [x] Update `tools/build-vsix.sh` to read the latest version from `CHANGELOG.md`
- [x] Update `package.json` version automatically before packaging
- [x] Package the VSIX with the resolved release version (`claudine-x.y.z.vsix`)
- [x] Add unit tests for changelog version extraction and latest-vsix selection

## Website Newsletter + Footer Attribution

- [x] Add a "Stay in the Loop" section with descriptive copy
- [x] Add email input with `your@email.com` placeholder and subscribe button
- [x] Add footer attribution linking Matthias Sala and community

## Website Newsletter Backend (PHP)

- [x] Add a server-side PHP endpoint to accept newsletter form submissions
- [x] Validate the submitted email address and reject invalid input
- [x] Persist successful submissions to a server-side SQLite database file

## Agent Integration Status Bar Button

- [x] Show a status bar button (right-aligned) when `CLAUDINE.AGENTS.md` is missing — clicking runs the setup scaffold command
- [x] Show a warning status bar button when `CLAUDINE.AGENTS.md` exists but is not referenced in `AGENTS.md` or `CLAUDE.md` — clicking opens the file and shows a reminder popup
- [x] Hide the button when everything is wired up correctly
- [x] File watcher reacts to create/change/delete of `CLAUDINE.AGENTS.md`, `AGENTS.md`, and `CLAUDE.md`
- [x] Extracted pure `getAgentIntegrationState()` helper with unit tests

## Multiline Quick Idea Input

- [x] Replace single-line `<input>` with a `<textarea>` in the To Do column's "Quick idea" field
- [x] Auto-grow the textarea height as the user types (up to a max height)
- [x] Reset height back to single-line after submitting
- [x] Keep Enter to submit, Shift+Enter for new lines

## OpenAI Codex Provider (Phase 1)

- [x] Codex JSONL types (`CodexJsonlEnvelope`, `CodexSessionMetaPayload`, `CodexEventMsgPayload`)
- [x] `CodexSessionParser` with LRU cache and incremental parsing (same pattern as `ConversationParser`)
- [x] Handles standard envelope format and legacy bare-object format
- [x] Status detection from event types (task_complete, error, turn_aborted, rate_limit)
- [x] Conversation IDs prefixed with `codex-` to prevent collision with Claude IDs
- [x] Provider-scoped deletion in `StateManager.setConversations(convs, providerTag?)` — prevents two providers from clobbering each other
- [x] `CodexWatcher` implementing `IConversationProvider` — auto-detects `~/.codex/sessions/`
- [x] Workspace filtering: matches `session_meta.cwd` against open workspace folders
- [x] Recursive date-tree walker for `sessions/YYYY/MM/DD/*.jsonl`
- [x] `CodexEditorCommands` stub (Codex VS Code extension API not yet documented)
- [x] `CompositeConversationProvider` wrapping N children behind single interface
- [x] Conditional wiring in `extension.ts` and `standalone/server.ts`
- [x] `codexPath` setting with localized descriptions (EN/DE/FR/ES/IT)

## Task Card Context Menu

- [ ] Right-click context menu on all card modes (full, compact, narrow, draft)
- [ ] "Open conversation" as bold default action
- [ ] "Move to X" items for each column (current column omitted, with color dots)
- [ ] "Archive immediately" action
- [ ] Draft cards: only "Open conversation" + "Delete idea" (no move options)
- [ ] Viewport edge clamping, Escape to close, click-outside to close
