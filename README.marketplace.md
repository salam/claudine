<p align="center">
  <img src="https://claudine.pro/logo.png" width="128" height="128" alt="Claudine logo">
</p>

<h1 align="center">Claudine</h1>

<p align="center">
  <strong>A kanban board for managing Claude Code conversations</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=claudine.claudine"><img src="https://img.shields.io/visual-studio-marketplace/v/claudine.claudine?label=VS%20Code%20Marketplace" alt="VS Code Marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=claudine.claudine"><img src="https://img.shields.io/visual-studio-marketplace/i/claudine.claudine" alt="Installs"></a>
  <a href="https://github.com/salam/claudine/blob/main/LICENSE"><img src="https://img.shields.io/github/license/salam/claudine" alt="License"></a>
</p>

<p align="center">
  <a href="https://claudine.pro">Website</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#configuration">Configuration</a>
</p>

---

Claudine is a Visual Studio Code extension that gives you a kanban-style overview of all your [Claude Code](https://docs.anthropic.com/en/docs/claude-code) conversations. It auto-detects status and category from your session files and renders an interactive board directly in VS Code.

![Claudine kanban board screenshot](https://claudine.pro/_astro/screenshot.B1SLdmVt.png)

## Installation

1. Open VS Code
2. Go to the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **Claudine**
4. Click **Install**

**Requires:** VS Code 1.85+ and the [Claude Code extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code).

## Features

- **Kanban board** — Conversations organized into columns: To Do, Needs Input, In Progress, In Review, and Done
- **Auto-status detection** — Status inferred from message content (questions, completions, errors, tool use)
- **Category classification** — Automatically tagged as Bug, Feature, User Story, Improvement, or Task
- **Drag and drop** — Move conversations between columns; manual overrides preserved until new activity
- **Full-text search** — Search across card text and full conversation content, with highlighting
- **Inline prompts** — Send follow-up messages directly from the kanban card
- **Quick ideas** — Draft conversation ideas in the To Do column and send them when ready
- **Active agent indicators** — Pulsating badges when Claude is actively working
- **Needs Input alerts** — Desktop notification when a conversation needs your attention
- **Real-time updates** — Board refreshes automatically as conversations change
- **Compact view** — Toggle between full and compact card layouts
- **Panel or sidebar** — Place the board in the bottom panel or the activity bar sidebar
- **Export / Import** — Save your board as CSV, JSON, or Trello-compatible format
- **Agent integration** — Claude Code agents can move tasks on the board via `CLAUDINE.AGENTS.md`

### AI Features (optional)

- **AI-generated icons** — Task icons via OpenAI DALL-E or Stability AI
- **Conversation summarization** — AI-powered title and description summaries

## Usage

After installation, Claudine appears as a panel tab (alongside Terminal, Problems, etc.) labeled **Claudine**.

| Icon | Action |
| ---- | ------ |
| 🔍 | Toggle full-text search |
| 🔽 | Filter by category |
| ☐/☰ | Toggle compact/expanded view |
| ★ | Toggle AI summarization |
| ⟳ | Refresh conversations |
| ⚙ | Settings |

**Card interactions:** Click a title to open the conversation. Drag cards between columns. Click the respond button on cards needing input.

## Configuration

Open VS Code Settings (`Ctrl+,` / `Cmd+,`) and search for **Claudine**.

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `claudine.claudeCodePath` | `~/.claude` | Path to the Claude Code data directory |
| `claudine.imageGenerationApi` | `none` | API for task icons: `openai`, `stability`, or `none` |
| `claudine.enableSummarization` | `false` | Generate AI summaries for card titles and descriptions |

API keys are stored securely via VS Code's Secret Storage and configured through the in-app settings panel.

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type "Claudine":

| Command | Keybinding | Description |
| ------- | ---------- | ----------- |
| Open Kanban Board | `Cmd+Shift+K` | Focus the Claudine board |
| Refresh Conversations | `Cmd+Shift+R` | Re-scan and update the board |
| Search Conversations... | `Cmd+Shift+F` | Full-text search |
| Start New Conversation... | `Cmd+Shift+N` | Start a new Claude session |
| Show Conversations Needing Input | `Cmd+Shift+I` | Filter for conversations waiting on you |
| Focus Active Claude Tab | `Cmd+Shift+C` | Switch to the active Claude Code editor |
| Export Board... | | Save as CSV, JSON, or Trello format |
| Import Board... | | Load from a Claudine JSON export |

Keybindings shown are macOS defaults. On Windows/Linux, replace `Cmd` with `Ctrl`.

## Contributing

Contributions are welcome! See the [GitHub repository](https://github.com/salam/claudine) for details.

## Credits

Developed by [@salam](https://github.com/salam)

---

<p align="center">
  <a href="https://claudine.pro">claudine.pro</a>
</p>
