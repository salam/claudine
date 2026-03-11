import { writable, derived, get } from 'svelte/store';
import { vscode } from '../lib/vscode';
import type { Conversation, ConversationStatus, ConversationCategory, ClaudineSettings, ProjectGroup, IndexingPhase, ProjectManifestEntry } from '../lib/vscode';
import { t } from './locale';

// Main conversations store
export const conversations = writable<Conversation[]>([]);

// ── Indexing progress (standalone progressive loading) ────────────────

export interface IndexingProgress {
  phase: IndexingPhase;
  totalProjects: number;
  scannedProjects: number;
  totalFiles: number;
  scannedFiles: number;
  currentProject?: string;
}

export const indexingProgress = writable<IndexingProgress>({
  phase: 'idle', totalProjects: 0, scannedProjects: 0,
  totalFiles: 0, scannedFiles: 0
});

export const projectManifest = writable<ProjectManifestEntry[]>([]);

export const indexingPercent = derived(indexingProgress, ($p) => {
  if ($p.totalFiles === 0) return 0;
  return Math.round(($p.scannedFiles / $p.totalFiles) * 100);
});

// Settings store
export const settings = writable<ClaudineSettings>({
  imageGenerationApi: 'none',
  claudeCodePath: '~/.claude',
  enableSummarization: false,
  hasApiKey: false,
  toolbarLocation: 'sidebar',
  autoRestartAfterRateLimit: false,
  showTaskIcon: true,
  showTaskDescription: true,
  showTaskLatest: true,
  showTaskGitBranch: true,
  monitoredWorkspace: { mode: 'auto' as const },
  detectedWorkspacePaths: [] as string[],
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

// Provider filter: empty set = show all, non-empty = show only selected providers
export const activeProviders = writable<Set<string>>(new Set());

export function toggleProvider(provider: string) {
  activeProviders.update(set => {
    const next = new Set(set);
    if (next.has(provider)) next.delete(provider);
    else next.add(provider);
    return next;
  });
}

export function clearProviderFilter() {
  activeProviders.set(new Set());
}

// State/problem filter: empty set = show all, non-empty = show only matching states
export type StateFilterKey = 'needs-attention' | 'hasQuestion' | 'isInterrupted' | 'hasError' | 'isRateLimited';

export const activeStateFilters = writable<Set<StateFilterKey>>(new Set());

export function toggleStateFilter(key: StateFilterKey) {
  activeStateFilters.update(set => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
}

export function clearStateFilter() {
  activeStateFilters.set(new Set());
}

/** Clear ALL filter groups at once. */
export function clearAllFilters() {
  clearCategoryFilter();
  clearProviderFilter();
  clearStateFilter();
}

/** Whether any filter is active across all groups. */
export const hasActiveFilters = derived(
  [activeCategories, activeProviders, activeStateFilters],
  ([$cats, $provs, $states]) => $cats.size > 0 || $provs.size > 0 || $states.size > 0
);

/** Available providers derived from current conversations (only shown when >1). */
export const availableProviders = derived(conversations, ($conversations) => {
  const providers = new Set<string>();
  for (const c of $conversations) {
    if (c.provider) providers.add(c.provider);
  }
  return providers;
});

/** Available state/problem filters derived from current conversations. */
export const availableStateFilters = derived(conversations, ($conversations) => {
  const available = new Set<StateFilterKey>();
  for (const c of $conversations) {
    if (c.hasQuestion) available.add('hasQuestion');
    if (c.isInterrupted) available.add('isInterrupted');
    if (c.hasError) available.add('hasError');
    if (c.isRateLimited) available.add('isRateLimited');
  }
  // Show "needs-attention" when any problem state exists
  if (available.size > 0) available.add('needs-attention');
  return available;
});

// ── Smart Board ───────────────────────────────────────────────────────

/** IDs of in-review conversations the user has acknowledged (dismissed from Smart Board). */
export const acknowledgedReviewIds = writable<Set<string>>(new Set());

export function acknowledgeReview(id: string) {
  acknowledgedReviewIds.update(set => {
    const next = new Set(set);
    next.add(id);
    return next;
  });
  vscode.mergeState({ acknowledgedReviewIds: Array.from(get(acknowledgedReviewIds)) });
}

export function restoreAcknowledgedReviews() {
  const state = vscode.getState<{ acknowledgedReviewIds?: string[] }>();
  if (state?.acknowledgedReviewIds) {
    acknowledgedReviewIds.set(new Set(state.acknowledgedReviewIds));
  }
}

/** Collapsed state of the Smart Board section. */
export const smartBoardCollapsed = writable(false);

export function toggleSmartBoard() {
  smartBoardCollapsed.update(v => {
    const next = !v;
    vscode.mergeState({ smartBoardCollapsed: next });
    return next;
  });
}

export function restoreSmartBoardState() {
  const state = vscode.getState<{ smartBoardCollapsed?: boolean }>();
  if (state?.smartBoardCollapsed !== undefined) {
    smartBoardCollapsed.set(state.smartBoardCollapsed);
  }
}

// Cleanup: remove acknowledged IDs when the conversation leaves in-review
// (so it reappears on the smart board if it returns to in-review later).
conversations.subscribe($conversations => {
  const inReviewIds = new Set($conversations.filter(c => c.status === 'in-review').map(c => c.id));
  acknowledgedReviewIds.update(set => {
    let changed = false;
    const next = new Set(set);
    for (const id of set) {
      if (!inReviewIds.has(id)) {
        next.delete(id);
        changed = true;
      }
    }
    if (changed) {
      vscode.mergeState({ acknowledgedReviewIds: Array.from(next) });
    }
    return changed ? next : set;
  });
});

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

// ── Multi-project grouping (standalone mode) ─────────────────────────

/** Extract a short display name from a workspace path. */
function projectDisplayName(wsPath: string): string {
  const parts = wsPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || wsPath;
}

/** Conversations grouped by workspace path, sorted by most recently active. */
export const projectGroups = derived(conversations, ($conversations) => {
  const map = new Map<string, Conversation[]>();

  for (const c of $conversations) {
    const key = c.workspacePath || '(unknown)';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }

  const groups: ProjectGroup[] = [];
  for (const [wsPath, convs] of map) {
    const nonArchived = convs.filter(c => c.status !== 'archived');
    groups.push({
      name: projectDisplayName(wsPath),
      path: wsPath,
      conversations: convs,
      activeCount: nonArchived.length,
      inProgressCount: convs.filter(c => c.status === 'in-progress').length,
      needsAttention: convs.some(c => c.hasError || c.hasQuestion || c.isInterrupted || c.status === 'needs-input'),
    });
  }

  // Sort: projects with in-progress work first, then by most recent activity
  groups.sort((a, b) => {
    if (a.inProgressCount !== b.inProgressCount) return b.inProgressCount - a.inProgressCount;
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    const aLatest = Math.max(...a.conversations.map(c => new Date(c.updatedAt).getTime()));
    const bLatest = Math.max(...b.conversations.map(c => new Date(c.updatedAt).getTime()));
    return bLatest - aLatest;
  });

  return groups;
});

/** Which project paths are currently expanded in the multi-project view. */
export const expandedProjects = writable<Set<string>>(new Set());

export function toggleProjectExpanded(path: string) {
  expandedProjects.update(set => {
    const next = new Set(set);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
  });
}

export function expandAllProjects() {
  const groups = get(projectGroups);
  expandedProjects.set(new Set(groups.map(g => g.path)));
}

export function collapseAllProjects() {
  expandedProjects.set(new Set());
}

/** The currently selected/focused project in single-project navigation mode. */
export const selectedProjectPath = writable<string | null>(null);

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

/** Append conversations from one project (progressive loading). */
export function appendProjectConversations(projectPath: string, newConvs: Conversation[]) {
  let all: Conversation[] = [];
  conversations.update(existing => {
    // Remove any previous conversations for this project (in case of re-scan)
    const filtered = existing.filter(c => c.workspacePath !== projectPath);
    all = [...filtered, ...newConvs];
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

// ── Smart Board derived stores ────────────────────────────────────────

export interface SmartBoardLanes {
  running: Conversation[];
  needsInput: Conversation[];
  inReview: Conversation[];
}

/** Conversations bucketed into the three Smart Board lanes. */
export const smartBoardLanes = derived(
  [conversations, acknowledgedReviewIds],
  ([$conversations, $acked]) => {
    const running: Conversation[] = [];
    const needsInput: Conversation[] = [];
    const inReview: Conversation[] = [];
    for (const c of $conversations) {
      if (c.status === 'in-progress') running.push(c);
      else if (c.status === 'needs-input') needsInput.push(c);
      else if (c.status === 'in-review' && !$acked.has(c.id)) inReview.push(c);
    }
    return { running, needsInput, inReview } as SmartBoardLanes;
  }
);

/** True when the Smart Board has at least one item to show. */
export const smartBoardHasContent = derived(smartBoardLanes, ($lanes) =>
  $lanes.running.length > 0 || $lanes.needsInput.length > 0 || $lanes.inReview.length > 0
);

/** Extract a short display name from a workspace path (exported for Smart Board). */
export { projectDisplayName };

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

// ── Pane Heights (standalone multi-project view) ──────────────────────

/** Persisted pane heights (px) keyed by project path. null = auto/default flex layout. */
export const paneHeights = writable<Record<string, number | null>>({});

export function setPaneHeight(path: string, height: number | null) {
  paneHeights.update(h => ({ ...h, [path]: height }));
  vscode.mergeState({ paneHeights: get(paneHeights) });
}

export function resetAllPaneHeights() {
  paneHeights.set({});
  vscode.mergeState({ paneHeights: {} });
}

export function restorePaneHeights() {
  const state = vscode.getState<{ paneHeights?: Record<string, number | null> }>();
  if (state?.paneHeights) {
    paneHeights.set(state.paneHeights);
  }
}
