# Claudine Kanban Board - Agent Integration

This project uses the Claudine VS Code extension to manage tasks as a kanban board.
Claude Code agents can read the board state and move tasks between columns.

## Reading the board

The current board state is at `.claudine/state.json`. Read it to find your task:

```bash
cat .claudine/state.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data.get('conversations', []):
    print(f\"{c['status']:15s} | {c['id'][:8]}... | {c['title']}\")
"
```

Each task has: `id`, `title`, `description`, `status`, `category`.

Valid statuses: `todo`, `needs-input`, `in-progress`, `in-review`, `done`, `cancelled`

Valid categories: `user-story`, `bug`, `feature`, `improvement`, `task`

## Writing commands

Append a JSON object (one per line) to `.claudine/commands.jsonl`. The extension watches this file and processes commands within seconds.

The `task` field accepts either:
- The full conversation ID (UUID from `state.json`)
- A title substring (case-insensitive match)

The `id` field must be unique per command. Use `cmd-<timestamp>`.

The `timestamp` must be a recent ISO 8601 datetime. Commands older than 5 minutes are ignored.

### Move a task

```bash
echo '{"id":"cmd-'$(date +%s)'","command":"move","task":"<id or title>","status":"done","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"}' >> .claudine/commands.jsonl
```

### Update a task's title or description

```bash
echo '{"id":"cmd-'$(date +%s)'","command":"update","task":"<id or title>","title":"New title","description":"New description","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"}' >> .claudine/commands.jsonl
```

### Set a task's category

```bash
echo '{"id":"cmd-'$(date +%s)'","command":"set-category","task":"<id or title>","category":"bug","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"}' >> .claudine/commands.jsonl
```

## Verifying results

After writing a command, results appear in `.claudine/command-results.json`:

```json
{
  "results": [
    { "commandId": "cmd-1738900000", "success": true, "timestamp": "..." }
  ]
}
```

You can also re-read `.claudine/state.json` to confirm the task moved.
