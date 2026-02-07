import { describe, it, expect } from 'vitest';
import { CategoryClassifier } from '../services/CategoryClassifier';
import { ParsedMessage } from '../types';

function msg(text: string, role: 'user' | 'assistant' = 'user'): ParsedMessage {
  return {
    role,
    textContent: text,
    toolUses: [],
    timestamp: new Date().toISOString(),
    hasError: false,
    isInterrupted: false,
    hasQuestion: false,
  };
}

describe('CategoryClassifier', () => {
  const classifier = new CategoryClassifier();

  describe('classify', () => {
    it('classifies bug-related conversations', () => {
      expect(classifier.classify('Fix the login bug', '', [])).toBe('bug');
      expect(classifier.classify('Error in auth module', '', [])).toBe('bug');
      expect(classifier.classify('App crashes on startup', '', [])).toBe('bug');
      expect(classifier.classify('Button not working', '', [])).toBe('bug');
    });

    it('classifies user-story conversations', () => {
      expect(classifier.classify('As a user I want to login', '', [])).toBe('user-story');
      expect(classifier.classify('User can reset password', '', [])).toBe('user-story');
      expect(classifier.classify('So that I can access the dashboard', '', [])).toBe('user-story');
    });

    it('classifies feature conversations', () => {
      expect(classifier.classify('Add new feature for dark mode', '', [])).toBe('feature');
      expect(classifier.classify('Implement authentication', '', [])).toBe('feature');
      expect(classifier.classify('Create a new dashboard', '', [])).toBe('feature');
    });

    it('classifies improvement conversations', () => {
      expect(classifier.classify('Improve performance of queries', '', [])).toBe('improvement');
      expect(classifier.classify('Optimize the database', '', [])).toBe('improvement');
      expect(classifier.classify('Refactor the auth module', '', [])).toBe('improvement');
      expect(classifier.classify('Clean up the codebase', '', [])).toBe('improvement');
    });

    it('classifies task conversations', () => {
      expect(classifier.classify('Setup CI pipeline', '', [])).toBe('task');
      expect(classifier.classify('Write the documentation', '', [])).toBe('task');
      expect(classifier.classify('Add tests for the parser', '', [])).toBe('task');
      expect(classifier.classify('Configure linting', '', [])).toBe('task');
    });

    it('defaults to task for ambiguous input', () => {
      expect(classifier.classify('Hello world', '', [])).toBe('task');
      expect(classifier.classify('', '', [])).toBe('task');
    });

    it('uses description for classification', () => {
      expect(classifier.classify('', 'Fix the bug in the login form', [])).toBe('bug');
    });

    it('uses messages for classification', () => {
      const messages = [msg('Fix the crash when clicking submit')];
      expect(classifier.classify('Untitled', '', messages)).toBe('bug');
    });

    it('considers first 5 messages only', () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        msg(i < 5 ? 'setup the config' : 'fix the critical bug crash error')
      );
      // Only first 5 ("setup the config") are used — should be task, not bug
      expect(classifier.classify('', '', messages)).toBe('task');
    });

    it('higher-weight categories win ties', () => {
      // "fix" is bug keyword (weight 10), "add" is feature keyword (weight 8)
      // Single keyword match: bug scores 1*10=10, feature scores 1*8=8
      expect(classifier.classify('fix something', '', [])).toBe('bug');
    });

    it('pattern matches score higher than keywords', () => {
      // Pattern match adds 2 per pattern vs 1 per keyword
      const result = classifier.classify('fix the bug in the login form', '', []);
      expect(result).toBe('bug');
    });
  });

  describe('getCategoryColor', () => {
    it('returns correct colors for each category', () => {
      expect(classifier.getCategoryColor('bug')).toBe('#ef4444');
      expect(classifier.getCategoryColor('user-story')).toBe('#3b82f6');
      expect(classifier.getCategoryColor('feature')).toBe('#10b981');
      expect(classifier.getCategoryColor('improvement')).toBe('#f59e0b');
      expect(classifier.getCategoryColor('task')).toBe('#6b7280');
    });
  });

  describe('getCategoryIcon', () => {
    it('returns correct icons for each category', () => {
      expect(classifier.getCategoryIcon('bug')).toBe('\u{1F41B}');
      expect(classifier.getCategoryIcon('user-story')).toBe('\u{1F464}');
      expect(classifier.getCategoryIcon('feature')).toBe('\u2728');
      expect(classifier.getCategoryIcon('improvement')).toBe('\u{1F4C8}');
      expect(classifier.getCategoryIcon('task')).toBe('\u{1F4CB}');
    });
  });
});
