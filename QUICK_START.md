# Quick Start

Get up and running with Claudine in under 2 minutes.

## 1. Install

Open VS Code, press `Cmd+Shift+X` (or `Ctrl+Shift+X`), search for **Claudine**, and click **Install**.

> Claudine requires the [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) extension. Install it first if you haven't already.

## 2. Open the Board

Press `Cmd+Shift+K` (or `Ctrl+Shift+K`) to open the Claudine kanban board. It appears in the bottom panel alongside Terminal and Problems.

## 3. Start a Conversation

Press `Cmd+Shift+N` to start a new Claude Code conversation. It will automatically appear as a card on the board.

## 4. Watch It Work

As you and Claude talk, the card moves through columns automatically:

| Column | Meaning |
|--------|---------|
| **To Do** | Conversation created, no response yet |
| **Needs Input** | Claude asked you a question |
| **In Progress** | Claude is working (tool use, writing code) |
| **In Review** | Claude says it's done — review the result |
| **Done** | You marked it complete (drag and drop) |

## 5. Use the Toolbar

The sidebar toolbar gives you quick access to everything:

- **Search** — Full-text search across all conversations and JSONL content
- **Filter** — Filter by category (Bug, Feature, Task, etc.)
- **Compact view** — Toggle between full and compact card layouts
- **Expand all** — Expand or collapse all cards at once
- **Summarize** — AI-powered title and description summaries
- **Refresh** — Re-scan conversation files
- **Settings** — Configure API keys, view location, and more

## 6. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+K` | Open kanban board |
| `Cmd+Shift+N` | New conversation |
| `Cmd+Shift+F` | Search conversations |
| `Cmd+Shift+R` | Refresh board |
| `Cmd+Shift+I` | Show conversations needing input |
| `Cmd+Shift+C` | Focus active Claude tab |

Replace `Cmd` with `Ctrl` on Windows/Linux.

## 7. Go Further

- **Standalone mode** — Run `npm run standalone` to use Claudine in the browser without VS Code
- **Export** — Save your board as CSV, JSON, or Trello format
- **Agent integration** — Let Claude Code agents control the board automatically via `CLAUDINE.AGENTS.md`

---

Questions? Open an issue at [github.com/salam/claudine](https://github.com/salam/claudine/issues).
