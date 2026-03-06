// ── Timing constants ─────────────────────────────────────────────────

/** Interval between automatic checks for stale done/cancelled conversations. */
export const ARCHIVE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Duration to suppress focus detection after explicitly opening a conversation. */
export const FOCUS_SUPPRESS_DURATION_MS = 2000;

/** Delay before focusing the Claude Code editor after opening a conversation. */
export const EDITOR_FOCUS_DELAY_MS = 800;

/** Delay before recording a tab ↔ conversation mapping (tab needs time to settle). */
export const TAB_MAPPING_DELAY_MS = 500;

/** Debounce delay for focus detection when switching tabs/editors. */
export const FOCUS_DETECTION_DEBOUNCE_MS = 150;

/** Safety timeout (ms) for the restored-tab replacement guard. Prevents the
 *  guard from being held indefinitely if recordActiveTabMapping is never called. */
export const REPLACEMENT_GUARD_TIMEOUT_MS = 3000;

/** Time window within which a conversation is considered "recently active". */
export const RECENTLY_ACTIVE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

/** Timeout for Claude CLI summarization calls. */
export const CLI_TIMEOUT_MS = 60_000; // 60 seconds

/** Timeout for checking Claude CLI availability (`which`, `--version`). */
export const CLI_CHECK_TIMEOUT_MS = 5000;

// ── Size & length limits ─────────────────────────────────────────────

/** Maximum image file size (in bytes) for reading as a data URI. */
export const MAX_IMAGE_FILE_SIZE_BYTES = 512 * 1024; // 512 KB

/** Maximum length for conversation titles before truncation. */
export const MAX_TITLE_LENGTH = 80;

/** Maximum length for conversation descriptions before truncation. */
export const MAX_DESCRIPTION_LENGTH = 200;

/** Maximum length for the "last message" preview before truncation. */
export const MAX_LAST_MESSAGE_LENGTH = 120;

/** Input cap for `stripMarkupTags` to prevent ReDoS on crafted JSONL data. */
export const MAX_MARKUP_STRIP_LENGTH = 10_000;

/** Maximum context string length sent to image generation APIs. */
export const MAX_IMAGE_PROMPT_LENGTH = 1000;

/** Maximum number of files held in the incremental parse cache (LRU eviction). */
export const MAX_PARSE_CACHE_ENTRIES = 200;

/** Debounce delay for persisting board state after mutations. */
export const SAVE_STATE_DEBOUNCE_MS = 200;

/** Coalesce window for onConversationsChanged notifications. */
export const NOTIFY_COALESCE_MS = 50;

// ── Batch & limit constants ──────────────────────────────────────────

/** Number of conversations per CLI summarization batch. */
export const SUMMARIZATION_BATCH_SIZE = 10;

/** Max title length included in summarization prompts. */
export const SUMMARIZATION_TITLE_MAX_LENGTH = 100;

/** Max description length included in summarization prompts. */
export const SUMMARIZATION_DESC_MAX_LENGTH = 200;

/** Max last-message length included in summarization prompts. */
export const SUMMARIZATION_MESSAGE_MAX_LENGTH = 200;

/** Maximum number of command results retained in command-results.json. */
export const MAX_COMMAND_RESULTS_HISTORY = 50;

/** Number of initial messages analysed for category classification. */
export const CATEGORY_CLASSIFICATION_MESSAGE_LIMIT = 5;

/** Number of random bytes used for webview CSP nonces. */
export const NONCE_BYTES = 16;

/** Name of the auth token field included in every webview-to-extension message. */
export const WEBVIEW_AUTH_TOKEN_FIELD = '_token';

// ── Rate limit detection ─────────────────────────────────────────────

/** Pattern to detect Claude Code's rate limit message and extract reset time + timezone. */
export const RATE_LIMIT_PATTERN = /You['\u2019]ve hit your limit.*?resets\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*\(([^)]+)\)/i;

/** Prompt sent to auto-restart rate-limited conversations after the limit lifts. */
export const AUTO_RESTART_PROMPT = 'continue';

/** Grace period (ms) after the advertised reset time before sending auto-restart prompts. */
export const AUTO_RESTART_GRACE_MS = 30_000; // 30 seconds
