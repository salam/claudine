"use strict";
// ── Timing constants ─────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTO_RESTART_GRACE_MS = exports.AUTO_RESTART_PROMPT = exports.RATE_LIMIT_PATTERN = exports.WEBVIEW_AUTH_TOKEN_FIELD = exports.NONCE_BYTES = exports.CATEGORY_CLASSIFICATION_MESSAGE_LIMIT = exports.MAX_COMMAND_RESULTS_HISTORY = exports.SUMMARIZATION_MESSAGE_MAX_LENGTH = exports.SUMMARIZATION_DESC_MAX_LENGTH = exports.SUMMARIZATION_TITLE_MAX_LENGTH = exports.SUMMARIZATION_BATCH_SIZE = exports.NOTIFY_COALESCE_MS = exports.SAVE_STATE_DEBOUNCE_MS = exports.MAX_PARSE_CACHE_ENTRIES = exports.MAX_IMAGE_PROMPT_LENGTH = exports.MAX_MARKUP_STRIP_LENGTH = exports.MAX_LAST_MESSAGE_LENGTH = exports.MAX_DESCRIPTION_LENGTH = exports.MAX_TITLE_LENGTH = exports.MAX_IMAGE_FILE_SIZE_BYTES = exports.CLI_CHECK_TIMEOUT_MS = exports.CLI_TIMEOUT_MS = exports.RECENTLY_ACTIVE_WINDOW_MS = exports.FOCUS_DETECTION_DEBOUNCE_MS = exports.TAB_MAPPING_DELAY_MS = exports.EDITOR_FOCUS_DELAY_MS = exports.FOCUS_SUPPRESS_DURATION_MS = exports.ARCHIVE_CHECK_INTERVAL_MS = exports.VIEW_SWITCH_DELAY_MS = void 0;
/** Delay for VS Code to re-evaluate `when` clauses after toggling panel ↔ sidebar. */
exports.VIEW_SWITCH_DELAY_MS = 300;
/** Interval between automatic checks for stale done/cancelled conversations. */
exports.ARCHIVE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
/** Duration to suppress focus detection after explicitly opening a conversation. */
exports.FOCUS_SUPPRESS_DURATION_MS = 2000;
/** Delay before focusing the Claude Code editor after opening a conversation. */
exports.EDITOR_FOCUS_DELAY_MS = 800;
/** Delay before recording a tab ↔ conversation mapping (tab needs time to settle). */
exports.TAB_MAPPING_DELAY_MS = 500;
/** Debounce delay for focus detection when switching tabs/editors. */
exports.FOCUS_DETECTION_DEBOUNCE_MS = 150;
/** Time window within which a conversation is considered "recently active". */
exports.RECENTLY_ACTIVE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
/** Timeout for Claude CLI summarization calls. */
exports.CLI_TIMEOUT_MS = 60_000; // 60 seconds
/** Timeout for checking Claude CLI availability (`which`, `--version`). */
exports.CLI_CHECK_TIMEOUT_MS = 5000;
// ── Size & length limits ─────────────────────────────────────────────
/** Maximum image file size (in bytes) for reading as a data URI. */
exports.MAX_IMAGE_FILE_SIZE_BYTES = 512 * 1024; // 512 KB
/** Maximum length for conversation titles before truncation. */
exports.MAX_TITLE_LENGTH = 80;
/** Maximum length for conversation descriptions before truncation. */
exports.MAX_DESCRIPTION_LENGTH = 200;
/** Maximum length for the "last message" preview before truncation. */
exports.MAX_LAST_MESSAGE_LENGTH = 120;
/** Input cap for `stripMarkupTags` to prevent ReDoS on crafted JSONL data. */
exports.MAX_MARKUP_STRIP_LENGTH = 10_000;
/** Maximum context string length sent to image generation APIs. */
exports.MAX_IMAGE_PROMPT_LENGTH = 1000;
/** Maximum number of files held in the incremental parse cache (LRU eviction). */
exports.MAX_PARSE_CACHE_ENTRIES = 200;
/** Debounce delay for persisting board state after mutations. */
exports.SAVE_STATE_DEBOUNCE_MS = 200;
/** Coalesce window for onConversationsChanged notifications. */
exports.NOTIFY_COALESCE_MS = 50;
// ── Batch & limit constants ──────────────────────────────────────────
/** Number of conversations per CLI summarization batch. */
exports.SUMMARIZATION_BATCH_SIZE = 10;
/** Max title length included in summarization prompts. */
exports.SUMMARIZATION_TITLE_MAX_LENGTH = 100;
/** Max description length included in summarization prompts. */
exports.SUMMARIZATION_DESC_MAX_LENGTH = 200;
/** Max last-message length included in summarization prompts. */
exports.SUMMARIZATION_MESSAGE_MAX_LENGTH = 200;
/** Maximum number of command results retained in command-results.json. */
exports.MAX_COMMAND_RESULTS_HISTORY = 50;
/** Number of initial messages analysed for category classification. */
exports.CATEGORY_CLASSIFICATION_MESSAGE_LIMIT = 5;
/** Number of random bytes used for webview CSP nonces. */
exports.NONCE_BYTES = 16;
/** Name of the auth token field included in every webview-to-extension message. */
exports.WEBVIEW_AUTH_TOKEN_FIELD = '_token';
// ── Rate limit detection ─────────────────────────────────────────────
/** Pattern to detect Claude Code's rate limit message and extract reset time + timezone. */
exports.RATE_LIMIT_PATTERN = /You['\u2019]ve hit your limit.*?resets\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*\(([^)]+)\)/i;
/** Prompt sent to auto-restart rate-limited conversations after the limit lifts. */
exports.AUTO_RESTART_PROMPT = 'continue';
/** Grace period (ms) after the advertised reset time before sending auto-restart prompts. */
exports.AUTO_RESTART_GRACE_MS = 30_000; // 30 seconds
//# sourceMappingURL=constants.js.map