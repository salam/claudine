# Features

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
