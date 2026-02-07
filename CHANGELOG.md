# Changelog

All notable changes to the Claudine extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2025-02-06

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
