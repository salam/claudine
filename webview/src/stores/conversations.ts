import { writable, derived, get } from 'svelte/store';
import { vscode } from '../lib/vscode';
import type { Conversation, ConversationStatus, ConversationCategory, ClaudineSettings } from '../lib/vscode';
import { t } from './locale';

// Main conversations store
export const conversations = writable<Conversation[]>([]);

// Settings store
export const settings = writable<ClaudineSettings>({
  imageGenerationApi: 'none',
  claudeCodePath: '~/.claude',
  enableSummarization: false,
  hasApiKey: false,
  viewLocation: 'panel',
  autoRestartAfterRateLimit: false
});

// Error messages store
export const errors = writable<string[]>([]);

// UI state stores
export const searchQuery = writable('');
export const searchMode = writable<'fade' | 'hide'>('fade');
export const focusedConversationId = writable<string | null>(null);
export const compactView = writable(false);
export const collapsedCardIds = writable<Set<string>>(new Set());

// Category filter: empty set = show all, non-empty = show only selected categories
export const activeCategories = writable<Set<ConversationCategory>>(new Set());

export function toggleCategory(cat: ConversationCategory) {
  activeCategories.update(set => {
    const next = new Set(set);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    return next;
  });
}

export function clearCategoryFilter() {
  activeCategories.set(new Set());
}

export function toggleCardCollapsed(id: string) {
  collapsedCardIds.update(set => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

// Draft ideas (webview-only, not backed by JSONL files)
export const drafts = writable<Conversation[]>([]);

let draftCounter = 0;

function syncDraftsToExtension() {
  const current = get(drafts);
  vscode.postMessage({
    type: 'saveDrafts',
    drafts: current.map(d => ({ id: d.id, title: d.title }))
  });
}

function makeDraftConversation(id: string, title: string): Conversation {
  return {
    id, title,
    description: '',
    category: 'task',
    status: 'todo',
    lastMessage: '',
    agents: [],
    hasError: false,
    isInterrupted: false,
    hasQuestion: false,
    isRateLimited: false,
    isDraft: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function addDraft(title: string) {
  const draft = makeDraftConversation(`draft-${Date.now()}-${++draftCounter}`, title);
  drafts.update(d => [...d, draft]);
  syncDraftsToExtension();
}

export function removeDraft(id: string) {
  drafts.update(d => d.filter(draft => draft.id !== id));
  syncDraftsToExtension();
}

export function updateDraft(id: string, title: string) {
  drafts.update(d => d.map(draft => draft.id === id ? { ...draft, title } : draft));
  syncDraftsToExtension();
}

export function loadDraftsFromExtension(items: Array<{ id: string; title: string }>) {
  drafts.set(items.map(item => makeDraftConversation(item.id, item.title)));
}

// ID of the earliest conversation in the workspace (by createdAt)
export const firstConversationId = derived(conversations, ($conversations) => {
  if ($conversations.length === 0) return null;
  let earliest = $conversations[0];
  for (const c of $conversations) {
    if (new Date(c.createdAt) < new Date(earliest.createdAt)) {
      earliest = c;
    }
  }
  return earliest.id;
});

/** Derived rate-limit banner state: active when any conversation is rate-limited. */
export const rateLimitInfo = derived(conversations, ($conversations) => {
  const limited = $conversations.filter(c => c.isRateLimited);
  if (limited.length === 0) return { active: false, resetDisplay: '', conversationCount: 0 };
  // Use the first rate-limited conversation's display info
  const first = limited.find(c => c.rateLimitResetDisplay) || limited[0];
  return {
    active: true,
    resetDisplay: first.rateLimitResetDisplay || 'soon',
    conversationCount: limited.length
  };
});

// IDs returned by extension-side JSONL full-text search
export const extensionSearchMatchIds = writable<Set<string> | null>(null);

// Derived: which conversation IDs match the search (local fields + extension JSONL results)
export const searchMatchIds = derived(
  [conversations, searchQuery, extensionSearchMatchIds],
  ([$conversations, $searchQuery, $extIds]) => {
    if (!$searchQuery.trim()) return null; // null = no active filter
    const q = $searchQuery.toLowerCase();
    const ids = new Set<string>();
    // Local field-level matches (visible card text)
    for (const c of $conversations) {
      const hay = `${c.title} ${c.description} ${c.lastMessage} ${c.gitBranch || ''} ${c.agents.map(a => a.name).join(' ')}`.toLowerCase();
      if (hay.includes(q)) ids.add(c.id);
    }
    // Merge extension-side JSONL matches
    if ($extIds) {
      for (const id of $extIds) ids.add(id);
    }
    return ids;
  }
);

function groupByStatus(convs: Conversation[]): Record<ConversationStatus, Conversation[]> {
  const grouped: Record<ConversationStatus, Conversation[]> = {
    'todo': [],
    'needs-input': [],
    'in-progress': [],
    'in-review': [],
    'done': [],
    'cancelled': [],
    'archived': []
  };
  for (const conv of convs) {
    grouped[conv.status].push(conv);
  }
  return grouped;
}

// Writable store for conversations grouped by status.
// svelte-dnd-action needs to mutate the item arrays directly during drag
// operations, so this cannot be a derived (read-only) store.
// We sync it EXPLICITLY (not via subscription) to avoid overwriting DnD state.
export const conversationsByStatus = writable<Record<ConversationStatus, Conversation[]>>(
  groupByStatus([])
);

/** Set conversations from extension messages and sync the board columns. */
export function setConversations(convs: Conversation[]) {
  conversations.set(convs);
  conversationsByStatus.set(groupByStatus(convs));
}

/** Update a single conversation from the extension and sync the board columns. */
export function upsertConversation(conv: Conversation) {
  let all: Conversation[] = [];
  conversations.update(convs => {
    const idx = convs.findIndex(c => c.id === conv.id);
    if (idx !== -1) { convs[idx] = conv; }
    else { convs.push(conv); }
    all = convs;
    return convs;
  });
  conversationsByStatus.set(groupByStatus(all));
}

/** Remove conversations by ID and sync the board columns. */
export function removeConversations(ids: string[]) {
  const idSet = new Set(ids);
  let all: Conversation[] = [];
  conversations.update(convs => {
    all = convs.filter(c => !idSet.has(c.id));
    return all;
  });
  conversationsByStatus.set(groupByStatus(all));
}

// Column definitions (reactive — titles update when locale strings arrive)
export interface ColumnDef {
  id: ConversationStatus;
  title: string;
  color: string;
}

export const columns = derived(t, ($t) => [
  { id: 'todo' as ConversationStatus, title: $t('column.todo', 'To Do'), color: '#6b7280' },
  { id: 'needs-input' as ConversationStatus, title: $t('column.needsInput', 'Needs Input'), color: '#f59e0b' },
  { id: 'in-progress' as ConversationStatus, title: $t('column.inProgress', 'In Progress'), color: '#3b82f6' },
  { id: 'in-review' as ConversationStatus, title: $t('column.inReview', 'In Review'), color: '#8b5cf6' },
  { id: 'done' as ConversationStatus, title: $t('column.done', 'Done'), color: '#10b981' },
]);

// Archive column (rendered separately, togglable)
export const archiveColumn = derived(t, ($t) => ({
  id: 'archived' as ConversationStatus,
  title: $t('column.archived', 'Archived'),
  color: '#4b5563',
}));

// Helper function to get category details
export function getCategoryDetails(category: Conversation['category']): {
  icon: string;
  color: string;
  label: string;
} {
  const categories: Record<Conversation['category'], { icon: string; color: string; label: string }> = {
    'bug': { icon: '🐛', color: '#ef4444', label: 'Bug' },
    'user-story': { icon: '👤', color: '#3b82f6', label: 'User Story' },
    'feature': { icon: '✨', color: '#10b981', label: 'Feature' },
    'improvement': { icon: '📈', color: '#f59e0b', label: 'Improvement' },
    'task': { icon: '📋', color: '#6b7280', label: 'Task' }
  };

  return categories[category];
}

// Actions
export function addError(message: string) {
  errors.update(e => [...e, message]);
  // Auto-clear after 5 seconds
  setTimeout(() => {
    errors.update(e => e.filter(err => err !== message));
  }, 5000);
}

export function expandAllCards() {
  const convs = get(conversations);
  // XOR: add auto-compact IDs so they flip to expanded
  collapsedCardIds.set(new Set(
    convs.filter(c => c.status === 'done' || c.status === 'cancelled' || c.status === 'archived')
      .map(c => c.id)
  ));
}

export function collapseAllCards() {
  const convs = get(conversations);
  // XOR: add non-auto-compact IDs so they flip to collapsed
  collapsedCardIds.set(new Set(
    convs.filter(c => c.status !== 'done' && c.status !== 'cancelled' && c.status !== 'archived')
      .map(c => c.id)
  ));
}

export function updateConversationStatus(id: string, newStatus: ConversationStatus) {
  conversations.update(convs =>
    convs.map(c => c.id === id ? { ...c, status: newStatus } : c)
  );
}

// ── Zoom ──────────────────────────────────────────────────────────────

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1.5;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1.0;

export const zoomLevel = writable<number>(ZOOM_DEFAULT);

export function zoomIn() {
  zoomLevel.update(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10));
  vscode.mergeState({ zoomLevel: get(zoomLevel) });
}

export function zoomOut() {
  zoomLevel.update(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10));
  vscode.mergeState({ zoomLevel: get(zoomLevel) });
}

export function zoomReset() {
  zoomLevel.set(ZOOM_DEFAULT);
  vscode.mergeState({ zoomLevel: ZOOM_DEFAULT });
}

export function restoreZoom() {
  const state = vscode.getState<{ zoomLevel?: number }>();
  if (state?.zoomLevel !== undefined) {
    zoomLevel.set(state.zoomLevel);
  }
}

// ── Column Widths ─────────────────────────────────────────────────────

/** Persisted column widths (px). null = auto/default flex layout. */
export const columnWidths = writable<Record<string, number | null>>({});

export function setColumnWidth(id: string, width: number | null) {
  columnWidths.update(w => ({ ...w, [id]: width }));
  vscode.mergeState({ columnWidths: get(columnWidths) });
}

export function resetAllColumnWidths() {
  columnWidths.set({});
  vscode.mergeState({ columnWidths: {} });
}

export function restoreColumnWidths() {
  const state = vscode.getState<{ columnWidths?: Record<string, number | null> }>();
  if (state?.columnWidths) {
    columnWidths.set(state.columnWidths);
  }
}
