- When interacting with the user, print ▸ before answering anything else.
- Keep the project folder clean.
- Never commit secrets.
- Never touch, edit or move CLAUDE.md, AGENT.md and AGENTS.md files.
- Place shell scripts, if not necessary otherwise, in the folder ./tools/
- Create a ./RELEASE_NOTES.md file for each new feature implemented. Use user-targeted language, short and brief bullet points. Create a new section ## Release 1.2 (Mon, Jan 19 09:39) for every 4 hours. E.g.

> # Version 1.0.3 (Feb 7 2025, 17:53)
> 
> * Feature 1
> * Feature 2

- Always compile and run tests before considering a prompted task as done.
- Keep a .GIT_NEXT_COMMIT_MESSAGE.md file that contains a summary and diff of staged changes since the last commit and is used to prefill the commit message.
- Use plain english when explaining (technical) concepts, and still refer to the professional computer science terminology in brackets.

- Before attempting to delete a file to resolve a local type/lint failure, stop and ask the user. Other agents are often editing adjacent files; deleting their work to silence an error is never acceptable without explicit approval.
- NEVER edit .env or any environment variable files—only the user may change them.
- Coordinate with other agents before removing their in-progress edits—don't revert or delete work you didn't author unless everyone agrees.
- Moving/renaming and restoring files is allowed.

# ATOMIC COMMITS

- Keep commits atomic: commit only the files you touched and list each path explicitly. For tracked files run `git commit -m "<scoped message>" -- path/to/file1 path/to/file2`. For brand-new files, use the one-liner `git restore --staged :/ && git add "path/to/file1" "path/to/file2" && git commit -m "<scoped message>" -- path/to/file1 path/to/file2`

# SPECS

- When a new specification is given, check for contradictions and highlight them to the prompting user.
- If a given specification is incomplete, ask for clarifications if necessary.
- For a given specification, write a short todo list in the FEATURES.md file.
- For a given specification, write a unit test that covers different scenarios.

# ISSUE AND BUG REPORTING AND FIXING

When a bug is reported, before fixing, do the following:
- Give the bug a unique id.
- Add it with the bug id to the BUGFIXES.md file, if not already inserted. 
- Try to group similiar bugs.
- Similar bugs should have an appendix to the other similar bug's id, e.g. BUG1b (where b is the appendix)
- Keep an [ ] unticked check box while it's not solved, in BUGFIXES.md.
- Create a unit test that reproduces the bug, in code comment, add the unique bug id.
- When the bug is successfully fixed (unit test passed), tick the checkbox [✔️]

# IMPLEMENTATION

- Create tests before implementing.
- Make sure that it works with a linter program, compiles, runs, passes all tests and works before concluding the implementation of a feature.
- Once that works, do a test in target environment, e.g. on-device testing.

# MISC

Don't add "Co-Authored-By" tags to git commits.