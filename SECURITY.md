# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | Yes                |

## Reporting a Vulnerability

If you discover a security vulnerability in Claudine, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email **security@claudine.pro** with:
   - A description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Security Considerations

### Data Handling

- Claudine reads Claude Code JSONL session files from `~/.claude/projects/` (read-only)
- Board state is stored in `.claudine/state.json` within each workspace
- No conversation data is sent to external servers by the extension itself

### API Keys

- Image generation API keys are stored in VS Code's encrypted `SecretStorage` (not in plaintext settings)
- Keys are never logged or exposed in the webview

### Webview Security

- Content Security Policy restricts script sources to nonce-validated scripts only
- `style-src` currently allows `'unsafe-inline'` (Svelte requirement) — tracked for improvement
- Webview has no access to the Node.js runtime or file system

### Child Processes

- The Claude CLI is invoked via `spawn()` without `shell: true`
- A minimal environment (`PATH`, `HOME`, `LANG`, `TERM`) is passed to child processes
- CLI calls have timeouts to prevent hanging

## Scope

This policy covers the Claudine VS Code extension (`claudine.claudine`). Vulnerabilities in dependencies should be reported to the respective maintainers.
