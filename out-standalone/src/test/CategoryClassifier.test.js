"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const CategoryClassifier_1 = require("../services/CategoryClassifier");
function msg(text, role = 'user') {
    return {
        role,
        textContent: text,
        toolUses: [],
        timestamp: new Date().toISOString(),
        hasError: false,
        isInterrupted: false,
        hasQuestion: false,
        isRateLimited: false,
    };
}
(0, vitest_1.describe)('CategoryClassifier', () => {
    const classifier = new CategoryClassifier_1.CategoryClassifier();
    (0, vitest_1.describe)('classify', () => {
        (0, vitest_1.it)('classifies bug-related conversations', () => {
            (0, vitest_1.expect)(classifier.classify('Fix the login bug', '', [])).toBe('bug');
            (0, vitest_1.expect)(classifier.classify('Error in auth module', '', [])).toBe('bug');
            (0, vitest_1.expect)(classifier.classify('App crashes on startup', '', [])).toBe('bug');
            (0, vitest_1.expect)(classifier.classify('Button not working', '', [])).toBe('bug');
        });
        (0, vitest_1.it)('classifies user-story conversations', () => {
            (0, vitest_1.expect)(classifier.classify('As a user I want to login', '', [])).toBe('user-story');
            (0, vitest_1.expect)(classifier.classify('User can reset password', '', [])).toBe('user-story');
            (0, vitest_1.expect)(classifier.classify('So that I can access the dashboard', '', [])).toBe('user-story');
        });
        (0, vitest_1.it)('classifies feature conversations', () => {
            (0, vitest_1.expect)(classifier.classify('Add new feature for dark mode', '', [])).toBe('feature');
            (0, vitest_1.expect)(classifier.classify('Implement authentication', '', [])).toBe('feature');
            (0, vitest_1.expect)(classifier.classify('Create a new dashboard', '', [])).toBe('feature');
        });
        (0, vitest_1.it)('classifies improvement conversations', () => {
            (0, vitest_1.expect)(classifier.classify('Improve performance of queries', '', [])).toBe('improvement');
            (0, vitest_1.expect)(classifier.classify('Optimize the database', '', [])).toBe('improvement');
            (0, vitest_1.expect)(classifier.classify('Refactor the auth module', '', [])).toBe('improvement');
            (0, vitest_1.expect)(classifier.classify('Clean up the codebase', '', [])).toBe('improvement');
        });
        (0, vitest_1.it)('classifies task conversations', () => {
            (0, vitest_1.expect)(classifier.classify('Setup CI pipeline', '', [])).toBe('task');
            (0, vitest_1.expect)(classifier.classify('Write the documentation', '', [])).toBe('task');
            (0, vitest_1.expect)(classifier.classify('Add tests for the parser', '', [])).toBe('task');
            (0, vitest_1.expect)(classifier.classify('Configure linting', '', [])).toBe('task');
        });
        (0, vitest_1.it)('defaults to task for ambiguous input', () => {
            (0, vitest_1.expect)(classifier.classify('Hello world', '', [])).toBe('task');
            (0, vitest_1.expect)(classifier.classify('', '', [])).toBe('task');
        });
        (0, vitest_1.it)('uses description for classification', () => {
            (0, vitest_1.expect)(classifier.classify('', 'Fix the bug in the login form', [])).toBe('bug');
        });
        (0, vitest_1.it)('uses messages for classification', () => {
            const messages = [msg('Fix the crash when clicking submit')];
            (0, vitest_1.expect)(classifier.classify('Untitled', '', messages)).toBe('bug');
        });
        (0, vitest_1.it)('considers first 5 messages only', () => {
            const messages = Array.from({ length: 10 }, (_, i) => msg(i < 5 ? 'setup the config' : 'fix the critical bug crash error'));
            // Only first 5 ("setup the config") are used — should be task, not bug
            (0, vitest_1.expect)(classifier.classify('', '', messages)).toBe('task');
        });
        (0, vitest_1.it)('higher-weight categories win ties', () => {
            // "fix" is bug keyword (weight 10), "add" is feature keyword (weight 8)
            // Single keyword match: bug scores 1*10=10, feature scores 1*8=8
            (0, vitest_1.expect)(classifier.classify('fix something', '', [])).toBe('bug');
        });
        (0, vitest_1.it)('pattern matches score higher than keywords', () => {
            // Pattern match adds 2 per pattern vs 1 per keyword
            const result = classifier.classify('fix the bug in the login form', '', []);
            (0, vitest_1.expect)(result).toBe('bug');
        });
    });
    (0, vitest_1.describe)('getCategoryColor', () => {
        (0, vitest_1.it)('returns correct colors for each category', () => {
            (0, vitest_1.expect)(classifier.getCategoryColor('bug')).toBe('#ef4444');
            (0, vitest_1.expect)(classifier.getCategoryColor('user-story')).toBe('#3b82f6');
            (0, vitest_1.expect)(classifier.getCategoryColor('feature')).toBe('#10b981');
            (0, vitest_1.expect)(classifier.getCategoryColor('improvement')).toBe('#f59e0b');
            (0, vitest_1.expect)(classifier.getCategoryColor('task')).toBe('#6b7280');
        });
    });
    (0, vitest_1.describe)('getCategoryIcon', () => {
        (0, vitest_1.it)('returns correct icons for each category', () => {
            (0, vitest_1.expect)(classifier.getCategoryIcon('bug')).toBe('\u{1F41B}');
            (0, vitest_1.expect)(classifier.getCategoryIcon('user-story')).toBe('\u{1F464}');
            (0, vitest_1.expect)(classifier.getCategoryIcon('feature')).toBe('\u2728');
            (0, vitest_1.expect)(classifier.getCategoryIcon('improvement')).toBe('\u{1F4C8}');
            (0, vitest_1.expect)(classifier.getCategoryIcon('task')).toBe('\u{1F4CB}');
        });
    });
});
//# sourceMappingURL=CategoryClassifier.test.js.map