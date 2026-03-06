# Text-Based Question Detection Design

## Problem
The `hasQuestion` flag only triggers on `AskUserQuestion`/`ExitPlanMode` tool uses. When an LLM's last text response ends with "?", it should also be detected as a question, showing the `?` badge and moving the task to "Needs Input".

## Approach: Extend `hasRecentQuestion()`

Add ~3 lines to `ConversationParser.hasRecentQuestion()` to check if the last non-empty line of the last assistant message's text ends with `?`.

### Detection Rule
- Get the last assistant message's `textContent`
- Trim trailing whitespace, split by newlines, take the last non-empty line
- If that line ends with `?`, return `hasQuestion = true`

### What Already Works (No Changes Needed)
- Badge rendering in TaskCard (full, compact, narrow views)
- Column move: `StateManager.mergeWithExisting()` routes `hasQuestion → needs-input`
- Auto-clear: existing merge logic handles activity resumption
- Badge priority: error > rate-limit > interrupted > question
- Manual override preservation: `done`/`cancelled`/`archived` statuses respected

### Files Changed
- `src/providers/ConversationParser.ts` — extend `hasRecentQuestion()`
- `src/test/ConversationParser.test.ts` — add test for text-ending-with-`?`
