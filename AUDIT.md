# Security Audit

**Date:** 2026-02-07
**Scope:** Full codebase review prior to open-source release
**Status:** All identified issues have been fixed

---

## Findings and Fixes

### CRITICAL

#### 1. Predictable CSP nonce (`Math.random`)

**File:** `src/providers/KanbanViewProvider.ts`

The CSP nonce was generated with `Math.random()`, which is not cryptographically secure. V8's xorshift128+ PRNG is fully reversible given a few observed outputs. Since the nonce is the sole defense against script injection in the webview, a predictable nonce defeats the entire CSP.

**Fix:** Replaced with `crypto.randomBytes(16).toString('hex')`.

---

#### 2. Shell execution in process spawn

**File:** `src/services/SummaryService.ts`

`spawn('claude', [...], { shell: true })` was used in two places. `shell: true` routes execution through `/bin/sh -c`, enabling PATH hijacking and shell metacharacter attacks. The comment cited macOS PATH resolution as the reason, but shell mode is the wrong fix for that problem.

**Fix:** Removed `shell: true`. The `claude` binary path is now resolved once at startup via `execFile('which', ['claude'])` and cached for subsequent calls.

---

#### 3. Full environment leaked to child process

**File:** `src/services/SummaryService.ts`

`env: { ...process.env }` passed every environment variable to the spawned `claude` process, including any secrets the user has in their environment (`AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, database credentials, etc.).

**Fix:** Replaced with a minimal environment containing only `PATH`, `HOME`, `LANG`, and `TERM`.

---

### HIGH

#### 4. API key in plaintext settings

**Files:** `src/services/ImageGenerator.ts`, `src/providers/KanbanViewProvider.ts`, `package.json`

API keys were stored via `vscode.workspace.getConfiguration().update()`, writing them in plaintext to `settings.json` where they are readable by any process and visible in the Settings UI.

**Fix:** Migrated to VS Code's encrypted Secret Storage API (`context.secrets`). Removed the `imageGenerationApiKey` configuration property from `package.json`. Added a one-time migration in `extension.ts` that moves any existing plaintext key to secret storage and clears the setting.

---

#### 5. Unrestricted setting key update from webview

**File:** `src/providers/KanbanViewProvider.ts`

The `updateSetting` message handler accepted any `message.key` and passed it directly to `config.update()`. An attacker who compromised the webview could modify any `claudine.*` setting, including `claudeCodePath` (redirecting the extension to read attacker-controlled files).

**Fix:** Added an allowlist of permitted setting keys. API key updates are now routed through the secret storage path separately.

---

#### 6. Fragile XSS protection in search highlighting

**File:** `webview/src/components/TaskCard.svelte`

The `highlight()` function used `{@html}` to inject `<mark>` tags. While the current implementation escapes HTML before injection (making it safe today), the pattern is fragile:
- The `escapeHtml()` function didn't escape single quotes
- No documentation warned future contributors about the security-critical escape-first order

**Fix:** Added single-quote escaping (`'` -> `&#39;`) to `escapeHtml()`. Added a security comment documenting the invariant that escaping must always happen before tag injection.

---

### MEDIUM

#### 7. Inline styles in injected HTML

**File:** `webview/src/components/TaskCard.svelte`

The `<mark>` tag injected by `highlight()` used an inline `style` attribute, contributing to the need for `'unsafe-inline'` in the CSP `style-src` directive.

**Fix:** Replaced inline style with a CSS class (`.search-hl`) using Svelte's `:global()` modifier. Note: `'unsafe-inline'` is still required in the CSP because Svelte uses inline styles for dynamic CSS custom properties and conditional backgrounds throughout the codebase. This is a framework-level constraint.

---

#### 8. Overly permissive CSP `img-src`

**File:** `src/providers/KanbanViewProvider.ts`

The CSP allowed `img-src ... https: data:`, permitting image loads from any HTTPS origin. This enables data exfiltration via beacon images if an XSS vulnerability exists.

**Fix:** Removed `https:` from `img-src`. All generated images are stored as `data:` URIs, so external image loading is unnecessary.

---

#### 9. Arbitrary image loading in AgentAvatar

**File:** `webview/src/components/AgentAvatar.svelte`

The component allowed loading images from any `http://` or `https://` URL based on data parsed from JSONL files. A malicious JSONL file could set an avatar URL to a tracking pixel.

**Fix:** Restricted to `data:` URIs only, which is all the parser currently produces.

---

#### 10. ReDoS in markup tag stripping

**File:** `src/providers/ConversationParser.ts`

The regex `/<[a-zA-Z_:-]+[^>]*>[\s\S]*?<\/[a-zA-Z_:-]+>/g` could cause catastrophic backtracking on crafted input from malicious JSONL files.

**Fix:** Added a 10,000 character input cap and simplified the regex to `/<[^>]+>[^<]*<\/[^>]+>/g` which has linear-time complexity.

---

#### 11. Unvalidated JSON from Claude CLI

**File:** `src/services/SummaryService.ts`

The JSON array parsed from the Claude CLI response was used directly without type validation. A prompt injection in the LLM response could return unexpected types or prototype pollution payloads.

**Fix:** Added explicit type checking for each field (`typeof r.title === 'string'`), defaulting to `undefined` for non-string values.

---

### LOW

#### 12. Error messages leaking internals

**File:** `src/services/SummaryService.ts`

Error messages included raw stderr from child processes, potentially exposing file paths and system configuration.

**Fix:** Removed stderr content from error messages.

---

#### 13. Missing `.gitignore` patterns

**File:** `.gitignore`

The `.gitignore` was missing `.env*` and `.vscode/settings.json`, which could lead to accidental credential commits by contributors.

**Fix:** Added both patterns.

---

## Confirmed Safe

The following areas were audited and found to be secure:

- **No hardcoded credentials** in the source code
- **No telemetry or tracking** — the extension is fully local by default
- **No runtime npm dependencies** in the extension bundle (only `svelte-dnd-action` in the webview)
- **No dynamic code execution** (no Function constructor, no dynamic script loading)
- **No service workers, web workers, or permissions API usage**
- **Conversation IDs** derived from filenames via `path.basename()` — cannot contain path separators, preventing path traversal in `saveIcon()`
- **Webview message passing** uses VS Code's sandboxed channel with type-discriminated messages
- **All external API calls** (OpenAI, Stability AI) are opt-in, use HTTPS, and require user-configured keys
- **JSONL parsing** is wrapped in try-catch with graceful error handling
