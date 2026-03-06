<script lang="ts">
  import { vscode } from '../lib/vscode';
  import TaskCard from './TaskCard.svelte';
  import {
    smartBoardLanes,
    smartBoardCollapsed,
    toggleSmartBoard,
    acknowledgeReview,
    zoomLevel,
    projectDisplayName,
    compactView,
  } from '../stores/conversations';

  function getProjectLabel(wsPath: string | undefined): string {
    if (!wsPath) return '(unknown)';
    return projectDisplayName(wsPath);
  }
</script>

<div class="smart-board" style:zoom={$zoomLevel}>
  <button class="smart-board-header" on:click={toggleSmartBoard}>
    <svg class="chevron" class:collapsed={$smartBoardCollapsed} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
    </svg>
    <span class="smart-board-title">Smart Board</span>
    <span class="smart-board-count">
      {$smartBoardLanes.running.length + $smartBoardLanes.needsInput.length + $smartBoardLanes.inReview.length}
    </span>
  </button>

  {#if !$smartBoardCollapsed}
  <div class="smart-board-lanes">
    <!-- Needs Input Lane -->
    <div class="lane">
      <div class="lane-header needs-input">
        <span class="lane-dot needs-input-dot"></span>
        <span class="lane-title">Needs Input</span>
        <span class="lane-count">{$smartBoardLanes.needsInput.length}</span>
      </div>
      <div class="lane-cards">
        {#each $smartBoardLanes.needsInput as conv (conv.id)}
          <TaskCard
            conversation={conv}
            compact={$compactView}
            projectLabel={getProjectLabel(conv.workspacePath)}
          />
        {/each}
        {#if $smartBoardLanes.needsInput.length === 0}
          <div class="lane-empty">All clear</div>
        {/if}
      </div>
    </div>

    <!-- In Progress Lane -->
    <div class="lane">
      <div class="lane-header in-progress">
        <span class="lane-dot in-progress-dot"></span>
        <span class="lane-title">In Progress</span>
        <span class="lane-count">{$smartBoardLanes.running.length}</span>
      </div>
      <div class="lane-cards">
        {#each $smartBoardLanes.running as conv (conv.id)}
          <TaskCard
            conversation={conv}
            compact={$compactView}
            projectLabel={getProjectLabel(conv.workspacePath)}
          />
        {/each}
        {#if $smartBoardLanes.running.length === 0}
          <div class="lane-empty">No active tasks</div>
        {/if}
      </div>
    </div>

    <!-- Unacknowledged Review Lane -->
    <div class="lane">
      <div class="lane-header in-review">
        <span class="lane-dot in-review-dot"></span>
        <span class="lane-title">In Review</span>
        <span class="lane-count">{$smartBoardLanes.inReview.length}</span>
      </div>
      <div class="lane-cards">
        {#each $smartBoardLanes.inReview as conv (conv.id)}
          <div class="review-card-wrapper">
            <TaskCard
              conversation={conv}
              compact={$compactView}
              projectLabel={getProjectLabel(conv.workspacePath)}
            />
            <button
              class="dismiss-btn"
              on:click|stopPropagation={() => acknowledgeReview(conv.id)}
              title="Dismiss from Smart Board"
            >
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          </div>
        {/each}
        {#if $smartBoardLanes.inReview.length === 0}
          <div class="lane-empty">No new reviews</div>
        {/if}
      </div>
    </div>
  </div>
  {/if}
</div>

<style>
  .smart-board {
    background: var(--vscode-sideBar-background, #252526);
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
  }

  .smart-board-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-foreground, #cccccc);
    font-family: inherit;
  }
  .smart-board-header:hover {
    background: var(--vscode-toolbar-hoverBackground, #383838);
  }

  .chevron {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    transition: transform 0.2s;
  }
  .chevron.collapsed {
    transform: rotate(-90deg);
  }

  .smart-board-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .smart-board-count {
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
    margin-left: auto;
  }

  .smart-board-lanes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding: 0 12px 10px;
  }

  @media (max-width: 600px) {
    .smart-board-lanes {
      grid-template-columns: 1fr;
    }
  }

  .lane {
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, #404040);
    border-radius: 6px;
    padding: 8px;
    min-height: 60px;
  }

  .lane-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
  }

  .lane-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .in-progress-dot { background: #3b82f6; }
  .needs-input-dot { background: #f59e0b; }
  .in-review-dot { background: #8b5cf6; }

  .lane-header.in-progress { border-bottom-color: rgba(59, 130, 246, 0.3); }
  .lane-header.needs-input { border-bottom-color: rgba(245, 158, 11, 0.3); }
  .lane-header.in-review { border-bottom-color: rgba(139, 92, 246, 0.3); }

  .lane-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--vscode-foreground, #cccccc);
  }

  .lane-count {
    margin-left: auto;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 8px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
  }

  .lane-cards {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 250px;
    overflow-y: auto;
  }
  .lane-cards::-webkit-scrollbar { width: 5px; }
  .lane-cards::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, #4a4a4a);
    border-radius: 3px;
  }

  .lane-empty {
    font-size: 10px;
    font-style: italic;
    color: var(--vscode-disabledForeground, #6b6b6b);
    text-align: center;
    padding: 14px 0;
  }

  .review-card-wrapper {
    position: relative;
  }

  .dismiss-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 16px;
    height: 16px;
    background: var(--vscode-toolbar-hoverBackground, #383838);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 10;
  }
  .review-card-wrapper:hover .dismiss-btn {
    opacity: 0.7;
  }
  .dismiss-btn:hover {
    opacity: 1 !important;
    background: var(--vscode-button-background, #0e639c);
  }
  .dismiss-btn svg {
    width: 10px;
    height: 10px;
    color: var(--vscode-foreground, #cccccc);
  }
</style>
