<script lang="ts">
  import { get } from 'svelte/store';
  import { dndzone, SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';
  import KanbanColumn from './KanbanColumn.svelte';
  import ColumnResizeHandle from './ColumnResizeHandle.svelte';
  import TaskCard from './TaskCard.svelte';
  import {
    conversations,
    conversationsByStatus, columns, archiveColumn, updateConversationStatus,
    searchMatchIds, searchMode, searchQuery, compactView, collapsedCardIds, focusedConversationId,
    firstConversationId, drafts, addDraft, removeDraft, updateDraft,
    activeCategories, activeProviders, activeStateFilters, zoomLevel, columnWidths, setColumnWidth, resetAllColumnWidths,
    acknowledgeReview
  } from '../stores/conversations';
  import { vscode, type Conversation, type ConversationStatus, type ConversationCategory } from '../lib/vscode';

  export let showArchive: boolean = false;
  /** When set, only show conversations from this workspace path. */
  export let projectFilter: string | undefined = undefined;

  // Infer placement from board geometry so orientation follows VS Code-managed placement.
  let boardWidth = 0;
  let inferredPlacement: 'panel' | 'sidebar' = 'panel';
  $: isVertical = inferredPlacement === 'sidebar';

  function inferPlacement(width: number, height: number): 'panel' | 'sidebar' {
    if (height > 0) {
      const aspectRatio = width / height;
      // Sidebar is typically tall/narrow, panel is typically wide/short.
      if (aspectRatio <= 1.05) return 'sidebar';
      if (aspectRatio >= 1.35) return 'panel';
    }
    // Fallback for ambiguous geometry during transitions.
    return width < 560 ? 'sidebar' : 'panel';
  }

  function watchWidth(node: HTMLElement) {
    const observer = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      inferredPlacement = inferPlacement(w, h);
      boardWidth = w;
      clampStoredWidths();
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  const flipDurationMs = 200;

  // Quick idea input
  let quickIdeaText = '';
  let quickIdeaEl: HTMLTextAreaElement;

  function submitQuickIdea() {
    const text = quickIdeaText.trim();
    if (!text) return;
    addDraft(text);
    quickIdeaText = '';
    if (quickIdeaEl) {
      quickIdeaEl.style.height = 'auto';
    }
  }

  function handleQuickIdeaKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuickIdea();
    }
  }

  function resizeQuickIdea(e: Event) {
    const ta = e.currentTarget as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
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
    'todo': [], 'needs-input': [], 'in-progress': [], 'in-review': [], 'done': [], 'cancelled': [], 'archived': []
  };

  // Reactive sync: merge extension conversations + drafts into board items.
  // When projectFilter is set, only include conversations matching that workspace path.
  $: {
    const items = { ...$conversationsByStatus };
    if (projectFilter) {
      for (const key of Object.keys(items) as ConversationStatus[]) {
        items[key] = items[key].filter(c => c.workspacePath === projectFilter);
      }
    }
    items['todo'] = [...(projectFilter ? [] : $drafts), ...items['todo']];
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
          // Acknowledge review when user moves a card away from in-review
          if (item.status === 'in-review' && columnId !== 'in-review') {
            acknowledgeReview(item.id);
          }
          vscode.postMessage({ type: 'moveConversation', conversationId: item.id, newStatus: columnId });
          updateConversationStatus(item.id, columnId);
        }
      }
    }
  }

  function isVisible(
    conv: Conversation,
    matchIds: Set<string> | null,
    mode: string,
    catFilter: Set<ConversationCategory>,
    provFilter: Set<string>,
    stateFilter: Set<string>
  ): boolean {
    // Provider filter
    if (provFilter.size > 0 && conv.provider && !provFilter.has(conv.provider)) return false;

    // State/problem filter
    if (stateFilter.size > 0) {
      const hasNeedsAttention = stateFilter.has('needs-attention');
      const hasSpecific = stateFilter.has('hasQuestion') || stateFilter.has('isInterrupted') || stateFilter.has('hasError') || stateFilter.has('isRateLimited');

      if (hasNeedsAttention && hasSpecific) {
        // Intersection: must be "needs attention" AND match a specific filter
        const isAttention = conv.hasQuestion || conv.isInterrupted || conv.hasError || conv.isRateLimited;
        const matchesSpecific =
          (stateFilter.has('hasQuestion') && conv.hasQuestion) ||
          (stateFilter.has('isInterrupted') && conv.isInterrupted) ||
          (stateFilter.has('hasError') && conv.hasError) ||
          (stateFilter.has('isRateLimited') && conv.isRateLimited);
        if (!isAttention || !matchesSpecific) return false;
      } else if (hasNeedsAttention) {
        if (!conv.hasQuestion && !conv.isInterrupted && !conv.hasError && !conv.isRateLimited) return false;
      } else {
        // Only specific filters active — match ANY
        const matchesAny =
          (stateFilter.has('hasQuestion') && conv.hasQuestion) ||
          (stateFilter.has('isInterrupted') && conv.isInterrupted) ||
          (stateFilter.has('hasError') && conv.hasError) ||
          (stateFilter.has('isRateLimited') && conv.isRateLimited);
        if (!matchesAny) return false;
      }
    }

    // Category filter
    if (catFilter.size > 0 && !catFilter.has(conv.category)) return false;

    // Search filter
    if (!matchIds) return true;
    if (mode === 'hide') return matchIds.has(conv.id);
    return true;
  }

  function isFaded(id: string, matchIds: Set<string> | null, mode: string): boolean {
    if (!matchIds) return false;
    return mode === 'fade' && !matchIds.has(id);
  }

  function isCompact(id: string, status: ConversationStatus, global: boolean, collapsed: Set<string>, matchIds: Set<string> | null): boolean {
    const autoCompact = status === 'done' || status === 'cancelled' || status === 'archived';
    const toggled = collapsed.has(id);
    // XOR: toggled flips the default — expands auto-compact cards, collapses active cards
    const base = global || (autoCompact ? !toggled : toggled);
    // Search matches force-expand so hits are visible
    if (base && matchIds?.has(id)) return false;
    return base;
  }

  // Narrow (collapsed) columns — done starts narrow
  let narrowColumns: Record<string, boolean> = { done: true };

  function toggleColumnNarrow(columnId: ConversationStatus) {
    narrowColumns = { ...narrowColumns, [columnId]: !narrowColumns[columnId] };
  }

  const MIN_COLUMN_WIDTH = 160;

  /** No single column may exceed 80% of the visible board width. */
  function maxColumnWidth(): number {
    return boardWidth > 0 ? Math.floor(boardWidth * 0.8) : Infinity;
  }

  function handleColumnResize(leftId: string, rightId: string, deltaX: number) {
    if (!leftId || !rightId) return;
    const leftEl = document.querySelector(`[data-column-id="${leftId}"]`) as HTMLElement;
    const rightEl = document.querySelector(`[data-column-id="${rightId}"]`) as HTMLElement;
    if (!leftEl || !rightEl) return;

    // Adjust delta for CSS zoom level
    const zoom = get(zoomLevel);
    const adjustedDelta = deltaX / zoom;

    // Read current widths: prefer stored values to avoid rounding drift
    const widths = get(columnWidths);
    const leftWidth = widths[leftId] ?? Math.round(leftEl.getBoundingClientRect().width / zoom);
    const rightWidth = widths[rightId] ?? Math.round(rightEl.getBoundingClientRect().width / zoom);

    // Fix the total so independent rounding can't accumulate growth
    const total = leftWidth + rightWidth;
    const cap = maxColumnWidth();
    const newLeftWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(total - MIN_COLUMN_WIDTH, cap, Math.round(leftWidth + adjustedDelta)));
    const newRightWidth = Math.min(cap, total - newLeftWidth);

    setColumnWidth(leftId, newLeftWidth);
    setColumnWidth(rightId, newRightWidth);
  }

  // Shrink any column that exceeds the board width (e.g. after window resize)
  function clampStoredWidths() {
    const cap = maxColumnWidth();
    if (cap === Infinity) return;
    const widths = get(columnWidths);
    let changed = false;
    for (const [id, w] of Object.entries(widths)) {
      if (w != null && w > cap) {
        widths[id] = cap;
        changed = true;
      }
    }
    if (changed) {
      columnWidths.set({ ...widths });
      vscode.mergeState({ columnWidths: get(columnWidths) });
    }
  }


</script>

{#if $conversations.length === 0 && $drafts.length === 0}
  <div class="empty-board">
    <div class="empty-icon">🐘</div>
    <div class="empty-title">No conversations yet</div>
    <div class="empty-description">
      Start a Claude Code conversation in this workspace and it will appear here automatically.
    </div>
    <div class="empty-steps">
      <div class="empty-step">
        <span class="step-num">1</span>
        <span>Open a Claude Code editor (<kbd>Cmd+Shift+P</kbd> &rarr; "Claude Code")</span>
      </div>
      <div class="empty-step">
        <span class="step-num">2</span>
        <span>Start a conversation — Claudine will pick it up in real time</span>
      </div>
      <div class="empty-step">
        <span class="step-num">3</span>
        <span>Drag cards between columns to track progress</span>
      </div>
    </div>
    <button class="setup-agent-btn" on:click={() => vscode.postMessage({ type: 'setupAgentIntegration' })}>
      Set up Agent Integration
    </button>
    <div class="setup-agent-hint">
      Let Claude Code agents move tasks on the board automatically
    </div>
  </div>
{:else}
<div class="zoom-wrapper">
<div class="kanban-board" class:vertical={isVertical} use:watchWidth
     style:transform={$zoomLevel !== 1 ? `scale(${$zoomLevel})` : undefined}
     style:transform-origin="top left"
     style:width={$zoomLevel !== 1 ? `${100 / $zoomLevel}%` : undefined}
     style:height={$zoomLevel !== 1 ? `${100 / $zoomLevel}%` : undefined}>
  {#each $columns as column, i (column.id)}
    {#if !isVertical && i > 0}
      <ColumnResizeHandle
        on:resize={(e) => handleColumnResize($columns[i - 1].id, column.id, e.detail.deltaX)}
        on:resetWidths={resetAllColumnWidths}
      />
    {/if}
    <div class="column-wrapper" class:narrow={narrowColumns[column.id]} class:custom-width={!isVertical && $columnWidths[column.id] != null && !narrowColumns[column.id]} data-column-id={column.id} style:width={!isVertical && $columnWidths[column.id] && !narrowColumns[column.id] ? `${$columnWidths[column.id]}px` : undefined} style:flex={!isVertical && $columnWidths[column.id] && !narrowColumns[column.id] ? '0 0 auto' : undefined}>
      <KanbanColumn title={column.title} color={column.color} count={boardItems[column.id].filter(c => !c.isDraft).length} activeCount={boardItems[column.id].filter(c => c.agents.some(a => a.isActive)).length} narrow={narrowColumns[column.id] || false} onToggleNarrow={column.id === 'done' ? () => toggleColumnNarrow(column.id) : null}>
        {#if column.id === 'todo'}
          <div class="quick-idea">
            <textarea
              class="quick-idea-input"
              rows="1"
              placeholder="Quick idea..."
              bind:value={quickIdeaText}
              bind:this={quickIdeaEl}
              on:keydown={handleQuickIdeaKey}
              on:input={resizeQuickIdea}
              on:focus={resizeQuickIdea}
            />
            <button class="quick-idea-send" on:click={submitQuickIdea} disabled={!quickIdeaText.trim()} title="Add idea">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l.7.7L4.4 6H14v1H4.4l4.3 4.3-.7.7L2.7 6.7 2 6l6-5z" transform="rotate(90 8 8)"/></svg>
            </button>
          </div>
        {/if}
        <div
          class="drop-zone"
          class:empty-zone={boardItems[column.id].length === 0}
          use:dndzone={{ items: boardItems[column.id], flipDurationMs, dragHandleSelector: '.drag-handle', useCursorForDetection: true, dropTargetStyle: { outline: `2px dashed ${column.color}`, outlineOffset: '2px' } }}
          on:consider={(e) => handleDndConsider(column.id, e)}
          on:finalize={(e) => handleDndFinalize(column.id, e)}
        >
          {#each boardItems[column.id] as conversation (conversation.id)}
            {#if isVisible(conversation, $searchMatchIds, $searchMode, $activeCategories, $activeProviders, $activeStateFilters)}
              <div class:faded={isFaded(conversation.id, $searchMatchIds, $searchMode)}>
                <TaskCard {conversation} compact={isCompact(conversation.id, conversation.status, $compactView, $collapsedCardIds, $searchMatchIds)} narrow={narrowColumns[column.id] || false} searchQuery={$searchQuery} focused={$focusedConversationId === conversation.id} isFirst={conversation.id === $firstConversationId} on:sendDraft={(e) => sendDraft(e.detail)} on:deleteDraft={(e) => removeDraft(e.detail)} on:updateDraft={(e) => updateDraft(e.detail.id, e.detail.title)} />
              </div>
            {/if}
          {/each}
        </div>

        {#if column.id === 'done'}
          <div class="cancelled-section">
            <div class="cancelled-header">
              <span class="cancelled-icon">⊘</span> <span class="cancelled-label">Cancelled</span>
              <span class="count">{boardItems['cancelled'].length}</span>
            </div>
            <div
              class="drop-zone cancelled"
              class:empty-zone={boardItems['cancelled'].length === 0}
              use:dndzone={{ items: boardItems['cancelled'], flipDurationMs, dragHandleSelector: '.drag-handle', useCursorForDetection: true, dropTargetStyle: { outline: '2px dashed #6b7280', outlineOffset: '2px' } }}
              on:consider={(e) => handleDndConsider('cancelled', e)}
              on:finalize={(e) => handleDndFinalize('cancelled', e)}
            >
              {#each boardItems['cancelled'] as conversation (conversation.id)}
                {#if isVisible(conversation, $searchMatchIds, $searchMode, $activeCategories, $activeProviders, $activeStateFilters)}
                  <div class:faded={isFaded(conversation.id, $searchMatchIds, $searchMode)}>
                    <TaskCard {conversation} compact={isCompact(conversation.id, conversation.status, $compactView, $collapsedCardIds, $searchMatchIds)} narrow={narrowColumns[column.id] || false} searchQuery={$searchQuery} focused={$focusedConversationId === conversation.id} isFirst={conversation.id === $firstConversationId} on:sendDraft={(e) => sendDraft(e.detail)} on:deleteDraft={(e) => removeDraft(e.detail)} on:updateDraft={(e) => updateDraft(e.detail.id, e.detail.title)} />
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </KanbanColumn>
    </div>
  {/each}
  {#if showArchive}
    {#if !isVertical}
      <ColumnResizeHandle
        on:resize={(e) => handleColumnResize($columns[$columns.length - 1].id, 'archived', e.detail.deltaX)}
        on:resetWidths={resetAllColumnWidths}
      />
    {/if}
    <div class="column-wrapper archive-column" data-column-id="archived" style:width={$columnWidths['archived'] ? `${$columnWidths['archived']}px` : undefined} style:flex={$columnWidths['archived'] ? '0 0 auto' : undefined}>
      <KanbanColumn title={$archiveColumn.title} color={$archiveColumn.color} count={boardItems['archived'].length} activeCount={0}>
        <div
          class="drop-zone"
          class:empty-zone={boardItems['archived'].length === 0}
          use:dndzone={{ items: boardItems['archived'], flipDurationMs, dragHandleSelector: '.drag-handle', useCursorForDetection: true, dropTargetStyle: { outline: `2px dashed ${$archiveColumn.color}`, outlineOffset: '2px' } }}
          on:consider={(e) => handleDndConsider('archived', e)}
          on:finalize={(e) => handleDndFinalize('archived', e)}
        >
          {#each boardItems['archived'] as conversation (conversation.id)}
            {#if isVisible(conversation, $searchMatchIds, $searchMode, $activeCategories, $activeProviders, $activeStateFilters)}
              <div class:faded={isFaded(conversation.id, $searchMatchIds, $searchMode)}>
                <TaskCard {conversation} compact={isCompact(conversation.id, conversation.status, $compactView, $collapsedCardIds, $searchMatchIds)} searchQuery={$searchQuery} focused={$focusedConversationId === conversation.id} isFirst={conversation.id === $firstConversationId} on:sendDraft={(e) => sendDraft(e.detail)} on:deleteDraft={(e) => removeDraft(e.detail)} on:updateDraft={(e) => updateDraft(e.detail.id, e.detail.title)} />
              </div>
            {/if}
          {/each}
        </div>
      </KanbanColumn>
    </div>
  {/if}
</div>
</div>
{/if}

<style>
  /* BUG2b: zoom-wrapper isolates CSS transform from svelte-dnd-action's
     position:fixed clone so drag coordinates stay consistent. */
  .zoom-wrapper { flex: 1; min-height: 0; overflow: hidden; }
  .kanban-board { display: flex; gap: 6px; padding: 6px; overflow-x: auto; width: 100%; height: 100%; align-items: stretch; }
  .column-wrapper { flex: 1; min-width: 160px; max-width: 350px; display: flex; flex-direction: column; transition: min-width 0.25s ease, max-width 0.25s ease; }
  .column-wrapper.custom-width { max-width: unset; min-width: unset; }
  .column-wrapper.narrow { flex: 0 0 auto; min-width: 60px; max-width: 60px; }

  /* Vertical (sidebar) layout: stack columns top-to-bottom */
  .kanban-board.vertical { flex-direction: column; overflow-x: hidden; overflow-y: auto; }
  .kanban-board.vertical .column-wrapper { min-width: unset; max-width: unset; width: 100%; flex: none; }
  .kanban-board.vertical .column-wrapper.narrow { min-width: unset; max-width: unset; width: 100%; }
  .drop-zone { min-height: 80px; padding: 6px; border-radius: 6px; }
  /* Empty-state via ::after so it is NOT a real DOM child (svelte-dnd-action
     treats every direct child element as an item — a stray child when the zone
     is empty breaks drop detection). */
  .drop-zone.empty-zone::after { content: "No conversations"; display: flex; align-items: center; justify-content: center; height: 60px; color: var(--vscode-disabledForeground, #6b6b6b); font-size: 10px; font-style: italic; pointer-events: none; }
  .column-wrapper.narrow .drop-zone { padding: 3px; min-height: 40px; }
  .column-wrapper.narrow .drop-zone.empty-zone::after { display: none; }
  .drop-zone.cancelled { min-height: 40px; opacity: 0.7; }
  .faded { opacity: 0.1; transition: opacity 0.2s ease; }
  .cancelled-section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--vscode-panel-border, #404040); }
  .cancelled-header { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 500; color: var(--vscode-disabledForeground, #6b6b6b); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-left: 8px; }
  .cancelled-icon { font-size: 13px; }
  .cancelled-label { /* visible by default */ }
  .count { background: var(--vscode-badge-background, #4d4d4d); color: var(--vscode-badge-foreground, #ffffff); padding: 0 6px; border-radius: 10px; font-size: 9px; margin-left: auto; }

  /* Narrow overrides for cancelled sub-section */
  .column-wrapper.narrow .cancelled-section { margin-top: 6px; padding-top: 6px; }
  .column-wrapper.narrow .cancelled-header { padding-left: 0; justify-content: center; gap: 3px; margin-bottom: 4px; }
  .column-wrapper.narrow .cancelled-label { display: none; }
  .column-wrapper.narrow .cancelled-icon { font-size: 10px; }
  .column-wrapper.narrow .count { margin-left: 0; }

  /* Quick idea input */
  .quick-idea {
    display: flex; align-items: flex-start; gap: 4px;
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
    resize: none;
    overflow: hidden;
    max-height: 120px;
    line-height: 1.4;
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

  /* Archive column */
  .archive-column { opacity: 0.75; }
  .archive-column:hover { opacity: 1; }

  /* Empty board state */
  .empty-board {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 48px 24px;
    text-align: center;
    gap: 12px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }
  .empty-icon { font-size: 40px; opacity: 0.6; }
  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground, #cccccc);
  }
  .empty-description {
    font-size: 11px;
    max-width: 320px;
    line-height: 1.6;
  }
  .empty-steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
    text-align: left;
  }
  .empty-step {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
  }
  .step-num {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .empty-step kbd {
    background: var(--vscode-keybindingLabel-background, #333);
    border: 1px solid var(--vscode-keybindingLabel-border, #555);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 10px;
    font-family: inherit;
  }
  .setup-agent-btn {
    margin-top: 20px;
    padding: 8px 20px;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s;
  }
  .setup-agent-btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .setup-agent-hint {
    font-size: 10px;
    margin-top: 6px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }
</style>
