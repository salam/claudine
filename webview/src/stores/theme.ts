import { writable, derived } from 'svelte/store';

export type ThemePreference = 'auto' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'claudine-theme-pref';

function loadPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'auto') return saved;
  } catch { /* localStorage unavailable */ }
  return 'auto';
}

function detectSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

/** User's preference: 'auto', 'dark', or 'light'. */
export const themePreference = writable<ThemePreference>(loadPreference());

/** Resolved effective theme ('dark' or 'light'). */
export const resolvedTheme = derived(themePreference, ($pref) => {
  if ($pref === 'auto') return detectSystemTheme();
  return $pref;
});

/** Cycle through auto → dark → light → auto. */
export function cycleTheme() {
  themePreference.update(current => {
    if (current === 'auto') return 'dark';
    if (current === 'dark') return 'light';
    return 'auto';
  });
}

// Side-effect: sync to DOM and localStorage whenever preference changes
themePreference.subscribe(pref => {
  try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }

  const resolved = pref === 'auto' ? detectSystemTheme() : pref;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
});

// Listen for system theme changes when in 'auto' mode
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    // Re-trigger the subscription by setting the same value
    themePreference.update(p => p);
  });
}
