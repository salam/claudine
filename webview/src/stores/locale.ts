import { writable, derived } from 'svelte/store';

/** Raw string map sent from the extension host via vscode.l10n */
export const localeStrings = writable<Record<string, string>>({});

/**
 * Get a localized string by key, falling back to the key itself.
 * Usage in Svelte: $t('column.todo')
 */
export const t = derived(localeStrings, ($strings) => {
  return (key: string, fallback?: string): string => {
    return $strings[key] || fallback || key;
  };
});
