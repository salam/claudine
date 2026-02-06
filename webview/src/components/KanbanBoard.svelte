<script lang="ts">
  import { dndzone, SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';
  import KanbanColumn from './KanbanColumn.svelte';
  import TaskCard from './TaskCard.svelte';
  import {
    conversationsByStatus, columns, updateConversationStatus,
    searchMatchIds, searchMode, searchQuery, compactView, collapsedCardIds, focusedConversationId,
    firstConversationId, drafts, addDraft, removeDraft
  } from '../stores/conversations';
  import { vscode, type Conversation, type ConversationStatus } from '../lib/vscode';

  const flipDurationMs = 200;

  // Quick idea input
  let quickIdeaText = '';

  function submitQuickIdea() {
    const text = quickIdeaText.trim();
    if (!text) return;
    addDraft(text);
    quickIdeaText = '';
  }

  function handleQuickIdeaKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuickIdea();
    }
  }

  function sendDraft(draftId: string) {
    const draft = $drafts.find(d => d.id === draftId);
    if (!draft) return;
    vscode.postMessage({ type: 'quickIdea', prompt: draft.title });
    removeDraft(draftId);
  }

  // Local board items that the DnD library owns during drag operations.
  // Synced FROM the store whenever the extension pushes new data,
  // but NOT written back to the store during drag (avoids store.set()
  // triggering re-renders of all dndzone actions mid-drag).
  let boardItems: Record<ConversationStatus, Conversation[]> = {
    'todo': [], 'needs-input': [], 'in-progress': [], 'in-review': [], 'done': [], 'cancelled': []
  };

  // Reactive sync: merge extension conversations + drafts into board items.
  $: {
    const items = { ...$conversationsByStatus };
    items['todo'] = [...$drafts, ...items['todo']];
    boardItems = items;
  }

  function handleDndConsider(columnId: ConversationStatus, e: CustomEvent<{ items: Conversation[] }>) {
    boardItems[columnId] = e.detail.items;
  }

  function handleDndFinalize(columnId: ConversationStatus, e: CustomEvent<{ items: Conversation[] }>) {
    boardItems[columnId] = e.detail.items;
    for (const item of e.detail.items) {
      if (item.id !== SHADOW_PLACEHOLDER_ITEM_ID && item.status !== columnId) {
        // Draft moved out of todo → send as new conversation
        if (item.isDraft) {
          sendDraft(item.id);
        } else {
          vscode.postMessage({ type: 'moveConversation', conversationId: item.id, newStatus: columnId });
          updateConversationStatus(item.id, columnId);
        }
      }
    }
  }

  function isVisible(id: string, matchIds: Set<string> | null, mode: string): boolean {
    if (!matchIds) return true;
    if (mode === 'hide') return matchIds.has(id);
    return true;
  }

  function isFaded(id: string, matchIds: Set<string> | null, mode: string): boolean {
    if (!matchIds) return false;
    return mode === 'fade' && !matchIds.has(id);
  }

  function isCompact(id: string, global: boolean, collapsed: Set<string>, matchIds: Set<string> | null): boolean {
    const base = global || collapsed.has(id);
    // Search matches force-expand so hits are visible
    if (base && matchIds?.has(id)) return false;
    return base;
  }
</script>

<div class="kanban-board">
  {#each columns as column (column.id)}
    <div class="column-wrapper">
      <KanbanColumn title={column.title} color={column.color} count={boardItems[column.id].filter(c => !c.isDraft).length} activeCount={boardItems[column.id].filter(c => c.agents.some(a => a.isActive)).length}>
        {#if column.id === 'todo'}
          <div class="quick-idea">
            <input
              type="text"
              class="quick-idea-input"
              placeholder="Quick idea..."
              bind:value={quickIdeaText}
              on:keydown={handleQuickIdeaKey}
            />
            <button class="quick-idea-send" on:click={submitQuickIdea} disabled={!quickIdeaText.trim()} title="Add idea">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l.7.7L4.4 6H14v1H4.4l4.3 4.3-.7.7L2.7 6.7 2 6l6-5z" transform="rotate(90 8 8)"/></svg>
            </button>
          </div>
        {/if}
        <div
          class="drop-zone"
          use:dndzone={{ items: boardItems[column.id], flipDurationMs, dragHandleSelector: '.drag-handle', dropTargetStyle: { outline: `2px dashed ${column.color}`, outlineOffset: '2px' } }}
          on:consider={(e) => handleDndConsider(column.id, e)}
          on:finalize={(e) => handleDndFinalize(column.id, e)}
        >
          {#each boardItems[column.id] as conversation (conversation.id)}
            {#if isVisible(conversation.id, $searchMatchIds, $searchMode)}
              <div class:faded={isFaded(conversation.id, $searchMatchIds, $searchMode)}>
                <TaskCard {conversation} compact={isCompact(conversation.id, $compactView, $collapsedCardIds, $searchMatchIds)} searchQuery={$searchQuery} focused={$focusedConversationId === conversation.id} isFirst={conversation.id === $firstConversationId} on:sendDraft={(e) => sendDraft(e.detail)} on:deleteDraft={(e) => removeDraft(e.detail)} />
              </div>
            {/if}
          {/each}
          {#if boardItems[column.id].filter(c => !c.isDraft).length === 0 && $drafts.length === 0}
            <div class="empty-state">No conversations</div>
          {/if}
        </div>

        {#if column.id === 'done'}
          <div class="cancelled-section">
            <div class="cancelled-header">
              <span class="cancelled-icon">⊘</span> Cancelled
              <span class="count">{boardItems['cancelled'].length}</span>
            </div>
            <div
              class="drop-zone cancelled"
              use:dndzone={{ items: boardItems['cancelled'], flipDurationMs, dragHandleSelector: '.drag-handle', dropTargetStyle: { outline: '2px dashed #6b7280', outlineOffset: '2px' } }}
              on:consider={(e) => handleDndConsider('cancelled', e)}
              on:finalize={(e) => handleDndFinalize('cancelled', e)}
            >
              {#each boardItems['cancelled'] as conversation (conversation.id)}
                {#if isVisible(conversation.id, $searchMatchIds, $searchMode)}
                  <div class:faded={isFaded(conversation.id, $searchMatchIds, $searchMode)}>
                    <TaskCard {conversation} compact={isCompact(conversation.id, $compactView, $collapsedCardIds, $searchMatchIds)} searchQuery={$searchQuery} focused={$focusedConversationId === conversation.id} isFirst={conversation.id === $firstConversationId} on:sendDraft={(e) => sendDraft(e.detail)} on:deleteDraft={(e) => removeDraft(e.detail)} />
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </KanbanColumn>
    </div>
  {/each}
</div>

<style>
  .kanban-board { display: flex; gap: 12px; padding: 12px; overflow-x: auto; flex: 1; min-height: 0; align-items: stretch; }
  .column-wrapper { flex: 1; min-width: 260px; max-width: 350px; display: flex; flex-direction: column; }
  .drop-zone { min-height: 80px; padding: 6px; border-radius: 6px; transition: all 0.2s ease; }
  .drop-zone.cancelled { min-height: 40px; opacity: 0.7; }
  .empty-state { display: flex; align-items: center; justify-content: center; height: 60px; color: var(--vscode-disabledForeground, #6b6b6b); font-size: 10px; font-style: italic; }
  .faded { opacity: 0.1; transition: opacity 0.2s ease; }
  .cancelled-section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--vscode-panel-border, #404040); }
  .cancelled-header { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 500; color: var(--vscode-disabledForeground, #6b6b6b); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-left: 8px; }
  .cancelled-icon { font-size: 13px; }
  .count { background: var(--vscode-badge-background, #4d4d4d); color: var(--vscode-badge-foreground, #ffffff); padding: 0 6px; border-radius: 10px; font-size: 9px; margin-left: auto; }

  /* Quick idea input */
  .quick-idea {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 6px; margin-bottom: 6px;
  }
  .quick-idea-input {
    flex: 1; min-width: 0;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #cccccc);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 10px;
    font-family: inherit;
    outline: none;
  }
  .quick-idea-input:focus { border-color: var(--vscode-focusBorder, #007acc); }
  .quick-idea-input::placeholder { color: var(--vscode-input-placeholderForeground, #888); }
  .quick-idea-send {
    flex-shrink: 0; width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border: none; border-radius: 4px; cursor: pointer;
    transition: background-color 0.15s;
  }
  .quick-idea-send:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, #1177bb); }
  .quick-idea-send:disabled { opacity: 0.4; cursor: default; }
  .quick-idea-send svg { width: 12px; height: 12px; }
</style>
