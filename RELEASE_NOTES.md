# Release Notes

## Version 1.1.1 (Feb 11 2026, 17:38)

* **Agent integration status bar button** — a small right-aligned button now appears in the VSCode status bar when `CLAUDINE.AGENTS.md` is missing or not yet referenced in your `AGENTS.md` / `CLAUDE.md`; click to scaffold the file or get a reminder to add the reference
* **Auto-updating** — the button reacts to file changes and hides itself once everything is wired up

## Version 1.1.0 (Feb 11 2026, 17:20)

* **Fixed live monitoring in standalone mode** — the kanban board now updates in real-time when Claude Code sessions write new activity; previously the board showed only a static snapshot from startup because chokidar v4 silently dropped file-change events for glob-pattern watchers
* **Fixed AI summarization toggle** — the toolbar button now properly toggles summarized titles/descriptions on and off; previously the toggle was a no-op in standalone mode because config changes were never persisted
* **Standalone settings persistence** — settings changed via the UI (summarization, display options, image API) are now saved to `~/.claudine/config.json` instead of being read-only

## Version 1.1.0 (Feb 11 2026, 17:04)

* **Fixed stale rate-limit banner** — the "You've hit your limit" banner no longer shows when the limit has already expired from an old conversation

## Version 1.1.0 (Feb 11 2026, 16:59)

* **Redesigned About window** — the About popup now features the Claudine logo with gradient branding, a subtle grid background, and the website's purple/blue color scheme
* **Clickable links in About** — links to the website, GitHub, VS Code Marketplace, and Sponsor page now open properly in your system browser (or VS Code Simple Browser) instead of being trapped in the webview
* **Author & community credit** — the About window now shows "Built by Matthias Sala & community" with clickable links

## Version 1.1.0 (Feb 11 2026, 14:38)

* **Multiline quick idea input** — the "Quick idea" field in the To Do column now auto-grows as you type, supporting multi-line text; press Enter to submit, Shift+Enter for new lines
* **Cleaner task cards** — removed the "Respond" button from task cards that need input; clicking the title already opens the conversation
* **Subtler prompt input** — the "Send a message..." placeholder now only appears on hover or focus, keeping the card minimal by default

## Version 1.1.0 (Feb 9 2026, 11:34)

* **Newsletter backend endpoint** — added `website/public/subscribe.php` to accept email subscriptions from the website form
* **Input validation + spam guard** — subscription endpoint now validates email format and includes a hidden honeypot field
* **Server-side persistence** — successful signups are stored in `website/data/newsletter-subscribers.sqlite` (SQLite) with deduplication by email
* **Hosting compatibility fix** — newsletter SQLite storage now auto-selects a writable directory fallback and explicitly creates the DB file before inserts

## Version 1.1.0 (Feb 9 2026, 11:20)

* **Website newsletter CTA** — added a new “Stay in the Loop” section with subscription copy, email field, and subscribe button
* **Footer attribution** — website footer now credits **Matthias Sala** and **community** with direct links

## Version 1.1.0 (Feb 9 2026, 08:32)

* **New deploy script** — `tools/deploy-to-vscmarketplace.sh` now publishes the latest `claudine-x.y.z.vsix` to the VS Code Marketplace
* **Smarter VSIX build script** — `tools/build-vsix.sh` now reads the newest version from `CHANGELOG.md`, updates `package.json`, and packages a correctly versioned VSIX file
* **Safer release selection** — shared release utility logic now validates changelog headings and picks the highest semantic-version VSIX automatically

## Version 1.1.0 (Feb 9 2026, 02:02)

* **Placement is now fully VS Code-managed** — Claudine no longer uses a custom panel/sidebar setting, so drag-and-drop placement no longer races or snaps back
* **No more placement toggle setting/command** — board location now follows VS Code’s native window layout behavior only
* **Orientation follows real layout** — columns switch between horizontal and vertical using live view geometry, so rendering always matches current dock placement

## Version 1.1.0 (Feb 9 2026, 01:40)

* **Bug fix:** Switching Claudine from sidebar back to bottom panel now correctly restores horizontal (left-to-right) column layout
* **Stability:** Panel and sidebar webviews now stay synchronized while toggling placement, so settings and board state update reliably in both views
* **Bug fix:** When Claudine is moved via VS Code drag-and-drop layout controls, placement is now auto-detected and `viewLocation` is synced so column orientation matches the actual dock
* **Bug fix:** Eliminated the placement sync race — Claudine now updates `viewLocation` only after drop settles, then refreshes layout state

## Version 1.1.0 (Feb 9 2026, 01:29)

* **Localization bundles added** — German, Spanish, French, and Italian translations are now included for runtime UI (`vscode.l10n`) and extension metadata (`package.nls`)
* **More translatable metadata** — walkthrough labels, configuration descriptions, and view titles now use localization keys in `package.json`
* **Safety check** — new unit test ensures locale files stay in sync with base key sets

## Version 1.1.0 (Feb 9 2026, 16:48)

* **Bug fix:** Tasks no longer falsely show "needs input" while the agent is actively thinking, running tools, or dispatching sub-agents — only genuine questions and permission prompts trigger the "needs input" status now
* **Bug fix:** Question detection no longer triggers on normal agent reasoning text (e.g. "I should implement..." no longer matches the "should I" question pattern)

## Version 1.1.0 (Feb 9 2026, 12:48)

* **Open conversation from standalone** — clicking a task title in standalone mode now shows a dropdown menu letting you choose to open the Claude Code conversation in a **Terminal** or in **VSCode**

## Version 1.1.0 (Feb 9 2026, 08:46)

* **Resizable project panes** — drag the handle between project panes in standalone mode to adjust their heights; double-click a handle to reset all heights to equal distribution; heights are persisted across reloads

## Version 1.1.0 (Feb 9 2026, 04:33)

* **Toolbar location toggle** — choose where to display the toolbar (sidebar or title bar) via a new toggle in Settings; only one is shown at a time for a clean layout
* **Full titlebar parity** — the title bar now shows all 13 toolbar buttons in the exact same order as the sidebar (zoom, settings, and about were previously missing)
* **Consistent icons** — sidebar icons use the same codicon SVG paths as the title bar for a unified, pixel-perfect look across both toolbar locations
* **Bug fix:** Sidebar icons previously rendered as broken rectangles when using the codicon CSS font (not supported in VS Code webview iframes) — replaced with inline SVGs

## Version 1.1.0 (Feb 9 2026, 00:33)

* **Progressive project loading** — standalone mode no longer freezes on startup; projects are discovered instantly and conversations load incrementally with a progress bar
* **Loading screen with project picker** — see all discovered projects, their conversation counts, and toggle which ones to load; preferences are persisted across restarts
* **Auto-exclude temp directories** — macOS temp folders (`/var/folders/...`) and other OS system paths are automatically excluded from scanning, eliminating thousands of junk conversations
* **Per-project incremental delivery** — conversations appear in the UI as each project finishes scanning, instead of waiting for all projects to complete

## Version 1.1.0 (Feb 9 2026, 00:18)

* **Card layout settings** — choose which elements to display on task cards (icon, description, latest message, git branch) via checkboxes in Settings
* **Bug fix:** Drag-and-drop now works correctly when the board is zoomed in or out — cards follow the cursor and land in the right column

## Version 1.1.0 (Feb 9 2026, 00:10)

* Draft notes are now multi-line — the text field auto-grows as you type; press Shift+Enter for new lines, Enter to send
* **Project website** — one-page landing site at claudine.pro built with Astro + Tailwind CSS (Space Grotesk font, dark theme, responsive)
* **Quick Start guide** — new QUICK_START.md with step-by-step setup in under 2 minutes

## Version 1.1.0 (Feb 8 2026, 21:20)

* **Standalone mode** — run Claudine without VS Code: `npm run standalone` starts an HTTP + WebSocket server on `http://localhost:5147`
* Monitors all Claude Code instances across every project on your machine (scans all `~/.claude/projects/` directories)
* **Multi-project view** — in standalone mode, conversations are grouped by project with a sidebar navigator and collapsible project panes
* Project navigator shows activity indicators (blue dot = in-progress, amber dot = needs attention)
* Collapsible project panes with per-project kanban boards and status badges
* Click any project in the navigator to zoom into a full-screen board for that project
* WebSocket transport with automatic reconnection (exponential backoff) for the browser UI
* **Theme toggle** — click the moon/sun icon in the sidebar to cycle between auto, dark, and light themes; auto-detects your system preference
* **Desktop notifications** — browser notifications alert you when a conversation needs input (standalone mode)
* Stale project collapsing — projects with no activity in the last 24 hours start collapsed to reduce noise
* CLI flags: `--port`, `--host`, `--no-open`, `--help`
* Platform abstraction layer (Phase 1) — all core services decoupled from VS Code APIs via `IPlatformAdapter` interface
* New `StandaloneAdapter` for Node.js: uses `chokidar` for file watching, JSON config files for settings, localStorage-backed webview state

## Version 1.0.6 (Feb 8 2026, 22:30)

* Automated release pipeline — push a version tag (`git tag v1.0.6 && git push origin v1.0.6`) to publish to both the VS Code Marketplace and Open VSX automatically via GitHub Actions
* GitHub Releases — each tag automatically creates a GitHub Release with the `.vsix` file attached

## Version 1.0.5 (Feb 8 2026, 18:48)

* Scrollable toolbar — the sidebar toolbar now scrolls vertically when the panel is too short to show all buttons
* Panel title bar actions — toolbar buttons can now appear in the VS Code panel tab header (like Debug Console), controlled by the new `claudine.toolbarLocation` setting (`sidebar`, `titlebar`, or `both`)

## Version 1.0.5 (Feb 8 2026, 15:07)

* Zoom controls — zoom in/out (50%–150%) via sidebar buttons or Ctrl+=/Ctrl+- shortcuts, with Ctrl+0 to reset
* Resizable columns — drag the handles between columns to adjust widths, double-click to reset
* Getting Started walkthrough — guided onboarding via VSCode's built-in Walkthroughs UI (5 steps)
* Webview security — messages between the board UI and extension are now authenticated with a per-session token

## Version 1.0.4 (Feb 8 2026, 12:00)

* Rate limit detection — automatically detects when Claude Code hits its API limit and shows the reset time
* Amber hourglass banner at the top of the board with "resets at X" display
* Pause badge (⏸) on all rate-limited task cards (full, compact, and narrow views)
* Auto-restart option — when enabled, paused tasks automatically resume after the rate limit resets (+ 30s grace)
* Auto-restart toggle available in the banner and the settings panel

## Version 1.0.3 (Feb 8 2026, 09:21)

* Added sidechain activity dots — small colored dots show the last 3 subagent steps (gray=idle, green=completed, red=failed, yellow=running)
* Fixed ghost "Untitled Conversation" cards caused by Claude Code sidechain messages leaking into the board
* Fixed tasks from other projects appearing — only conversations from the currently opened workspace are shown now
* Empty conversations with no meaningful content are no longer displayed
