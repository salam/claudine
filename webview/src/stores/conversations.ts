import { writable, derived, get } from 'svelte/store';
import { vscode } from '../lib/vscode';
import type { Conversation, ConversationStatus, ClaudineSettings } from '../lib/vscode';

// Main conversations store
export const conversations = writable<Conversation[]>([]);

// Settings store
export const settings = writable<ClaudineSettings>({
  imageGenerationApi: 'none',
  claudeCodePath: '~/.claude',
  enableSummarization: false,
  hasApiKey: false
});

// Error messages store
export const errors = writable<string[]>([]);

// UI state stores
export const searchQuery = writable('');
export const searchMode = writable<'fade' | 'hide'>('fade');
export const focusedConversationId = writable<string | null>(null);
export const compactView = writable(false);
export const collapsedCardIds = writable<Set<string>>(new Set());

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
    'cancelled': []
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

// Column definitions
export const columns: Array<{
  id: ConversationStatus;
  title: string;
  color: string;
  description: string;
}> = [
  {
    id: 'todo',
    title: 'To Do',
    color: '#6b7280',
    description: 'Conversations opened but not started'
  },
  {
    id: 'needs-input',
    title: 'Needs Input',
    color: '#f59e0b',
    description: 'Waiting for user response or approval'
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    color: '#3b82f6',
    description: 'Currently processing or working'
  },
  {
    id: 'in-review',
    title: 'In Review',
    color: '#8b5cf6',
    description: 'Task completed, ready for review'
  },
  {
    id: 'done',
    title: 'Done',
    color: '#10b981',
    description: 'Completed and approved'
  }
];

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

export function updateConversationStatus(id: string, newStatus: ConversationStatus) {
  conversations.update(convs =>
    convs.map(c => c.id === id ? { ...c, status: newStatus } : c)
  );
}
