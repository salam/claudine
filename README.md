<p align="center">
  <img src="resources/icons/claudine.svg" width="128" height="128" alt="Claudine logo">
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
  <a href="https://claudine.tools">Website</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#development">Development</a>
</p>

---

Claudine is a Visual Studio Code extension that gives you a kanban-style overview of all your [Claude Code](https://docs.anthropic.com/en/docs/claude-code) conversations. It reads Claude Code's native JSONL session files, auto-detects status and category, and renders an interactive board directly in the VS Code panel area.

![Claudine kanban board screenshot](resources/screenshot.png)

## Features

- **Kanban board** — Conversations organized into columns: To Do, Needs Input, In Progress, In Review, and Done
- **Auto-status detection** — Conversation state is inferred from message content (questions, completions, errors, tool use)
- **Category classification** — Automatically tagged as Bug, Feature, User Story, Improvement, or Task
- **Drag and drop** — Move conversations between columns; manual overrides are preserved until new activity
- **Full-text search** — Search across visible card text and full JSONL conversation content
- **Search highlighting** — Matched terms are highlighted in card fields
- **Compact view** — Toggle between full and compact card layouts, individually or globally
- **Conversation focus tracking** — Detects which Claude Code editor is active and highlights the corresponding card
- **Click to open** — Click a card title to open the conversation in the Claude Code visual editor
- **Inline prompts** — Send follow-up messages directly from the kanban card
- **Git branch display** — Shows the branch associated with each conversation
- **Active agent indicators** — Pulsating badges when Claude is actively working
- **AI-generated icons** — Optional task icons via OpenAI DALL-E or Stability AI
- **Conversation summarization** — Optional AI-powered title and description summaries
- **File system watcher** — Board updates in real time as JSONL files change
- **Workspace scoping** — Only shows conversations belonging to the current workspace

## Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/) v1.85.0 or later
- [Claude Code VS Code extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) installed and configured

## Installation

### From the VS Code Marketplace

1. Open VS Code
2. Go to the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **Claudine**
4. Click **Install**

### From VSIX

```bash
code --install-extension claudine-0.1.0.vsix
```

### From source

See [Development](#development) below.

## Usage

After installation, Claudine appears as a panel tab (alongside Terminal, Problems, etc.) labeled **🐘 Claudine**.

### Sidebar Controls

| Icon | Action |
|------|--------|
| 🔍 | Toggle full-text search |
| ☐/☰ | Toggle compact/expanded view |
| ★ | Toggle AI summarization |
| ⟳ | Refresh conversations |
| ⚙ | Settings |
| ⓘ | About |

### Card Interactions

- **Click title** — Opens the conversation in the Claude Code editor
- **Drag handle** (dots) — Drag to reorder or move between columns
- **Chevron** — Collapse/expand individual cards
- **Description / Latest** — Click to expand truncated text
- **Git branch** — Click to open Source Control view
- **Respond button** — Appears on cards needing input; opens a prompt field

### Search

- Search matches across card titles, descriptions, last messages, git branches, agent names, and **full JSONL conversation content**
- Toggle between **Fade** (dim non-matches) and **Hide** (remove non-matches) modes
- Matching cards auto-expand when in compact view
- Press `Escape` to close search

### Status Detection

Claudine infers conversation status from message patterns:

| Status | Detection |
|--------|-----------|
| **To Do** | No assistant response yet |
| **Needs Input** | Contains `AskUserQuestion`, question patterns, or recent errors |
| **In Progress** | Last message is from user, or assistant is using tools |
| **In Review** | Assistant indicates completion ("all done", "completed", etc.) |
| **Done** | Manually set via drag-and-drop (preserved until new activity) |
| **Cancelled** | Manually set via drag-and-drop |

## Configuration

Open VS Code Settings (`Ctrl+,` / `Cmd+,`) and search for **Claudine**.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claudine.claudeCodePath` | `string` | `~/.claude` | Path to the Claude Code data directory |
| `claudine.imageGenerationApi` | `string` | `none` | API for task icons: `openai`, `stability`, or `none` |
| `claudine.imageGenerationApiKey` | `string` | `""` | API key for the selected image generation service |
| `claudine.enableSummarization` | `boolean` | `false` | Generate short summaries for card titles and descriptions |

### Icon Generation

When `imageGenerationApi` is set to `openai` or `stability`, Claudine generates a small icon for each conversation card using the conversation's title and description as a prompt.

- **OpenAI** — Uses DALL-E 3 (requires an OpenAI API key)
- **Stability** — Uses Stability AI (requires a Stability API key)
- **None** — Shows emoji category badges instead

### Summarization

When enabled, Claudine uses the Claude Code CLI to generate concise titles and descriptions for conversation cards. Summaries are cached and applied non-blocking. Toggle between original and summarized text using the star button in the sidebar.

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Claudine: Open Kanban Board` | Focus the Claudine panel |
| `Claudine: Refresh Conversations` | Re-scan JSONL files and update the board |

## Architecture

```
claudine/
├── src/                          # Extension backend (Node.js)
│   ├── extension.ts              # Activation, service wiring
│   ├── providers/
│   │   ├── KanbanViewProvider.ts # Webview host, message routing
│   │   ├── ClaudeCodeWatcher.ts  # File system watcher, JSONL search
│   │   └── ConversationParser.ts # JSONL → Conversation parsing
│   ├── services/
│   │   ├── StateManager.ts       # In-memory state, merge logic
│   │   ├── StorageService.ts     # Persistent storage (global + workspace)
│   │   ├── ImageGenerator.ts     # Icon generation (OpenAI / Stability)
│   │   ├── SummaryService.ts     # AI summarization via Claude CLI
│   │   └── CategoryClassifier.ts # Rule-based category detection
│   └── types/
│       └── index.ts              # Shared TypeScript interfaces
├── webview/                      # Frontend (Svelte + Vite)
│   └── src/
│       ├── App.svelte            # Root component, sidebar, search
│       ├── components/
│       │   ├── KanbanBoard.svelte    # Board layout, DnD zones
│       │   ├── KanbanColumn.svelte   # Column header, active counts
│       │   ├── TaskCard.svelte       # Card rendering, highlights
│       │   ├── AgentAvatar.svelte    # Agent circles with pulse
│       │   ├── PromptInput.svelte    # Inline message input
│       │   └── SettingsPanel.svelte  # Settings UI
│       ├── stores/
│       │   └── conversations.ts  # Svelte stores, derived search
│       └── lib/
│           └── vscode.ts         # VS Code webview API bridge
├── resources/
│   └── icons/
│       └── claudine.svg          # Extension icon
└── package.json
```

### Data Flow

```
~/.claude/projects/**/*.jsonl
        │
        ▼
  ClaudeCodeWatcher (fs.watch)
        │
        ▼
  ConversationParser (JSONL → Conversation)
        │
        ▼
  StateManager (merge, persist)
        │
        ▼
  KanbanViewProvider (postMessage)
        │
        ▼
  Svelte Webview (render board)
```

The extension and webview communicate via `postMessage`. All message types are defined in `src/types/index.ts`.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [npm](https://www.npmjs.com/) 9+

### Setup

```bash
git clone https://github.com/salam/claudine.git
cd claudine
npm install
cd webview && npm install && cd ..
```

### Build

```bash
# Compile extension TypeScript
npm run compile

# Build webview (Svelte → static assets)
npm run build:webview
```

### Watch Mode

```bash
# Terminal 1: Watch extension source
npm run watch

# Terminal 2: Watch webview source
npm run dev:webview
```

### Debug

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. The Claudine panel appears in the bottom panel area
4. Changes to the extension require restarting the debug session
5. Changes to the webview require rebuilding (`npm run build:webview`) and reloading the webview

### Lint

```bash
npm run lint
```

### Package

```bash
npx @vscode/vsce package
```

This produces a `.vsix` file you can install or distribute.

## How It Works

Claudine reads Claude Code's native conversation files stored at `~/.claude/projects/<encoded-workspace-path>/*.jsonl`. Each file is a newline-delimited JSON log of a single conversation session, containing user messages, assistant responses, tool calls, and metadata.

The `ConversationParser` extracts:
- **Title** — First user message (cleaned of markup tags)
- **Description** — First assistant response paragraph
- **Last message** — Most recent assistant text
- **Status** — Inferred from message patterns and tool usage
- **Category** — Classified by keyword analysis of title and content
- **Agents** — Detected from `Task` tool invocations (subagents)
- **Git branch** — From entry metadata or message content
- **Error state** — From API errors or tool failures in the latest exchange

The `StateManager` merges parsed data with saved state, preserving manual overrides (like marking a conversation as "Done") until new activity is detected.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

See [LICENSE](LICENSE) for details.

## Credits

Developed by [@salam](https://github.com/salam)

---

<p align="center">
  <a href="https://claudine.tools">claudine.tools</a>
</p>
