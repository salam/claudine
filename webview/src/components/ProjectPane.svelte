<script lang="ts">
  import KanbanBoard from './KanbanBoard.svelte';
  import { setConversations, conversationsByStatus } from '../stores/conversations';
  import type { ProjectGroup, Conversation, ConversationStatus } from '../lib/vscode';
  import { vscode } from '../lib/vscode';

  export let group: ProjectGroup;
  export let expanded = true;
  export let showArchive = false;
  /** When set (px), the pane uses a fixed height instead of flex distribution. */
  export let height: number | null = null;

  function toggle() {
    expanded = !expanded;
  }

  $: statusCounts = {
    inProgress: group.conversations.filter(c => c.status === 'in-progress').length,
    needsInput: group.conversations.filter(c => c.status === 'needs-input').length,
    done: group.conversations.filter(c => c.status === 'done').length,
    total: group.conversations.filter(c => c.status !== 'archived').length,
  };
</script>

<section
  class="project-pane"
  class:collapsed={!expanded}
  data-pane-path={group.path}
  style:height={height ? `${height}px` : undefined}
  style:flex={height ? '0 0 auto' : undefined}
>
  <button class="pane-header" on:click={toggle}>
    <span class="chevron" class:rotated={expanded}>
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>
    </span>
    <span class="pane-name">{group.name}</span>
    <span class="pane-path" title={group.path}>{group.path}</span>
    <div class="pane-badges">
      {#if statusCounts.inProgress > 0}
        <span class="badge in-progress" title="In progress">{statusCounts.inProgress}</span>
      {/if}
      {#if statusCounts.needsInput > 0}
        <span class="badge needs-input" title="Needs input">{statusCounts.needsInput}</span>
      {/if}
      {#if group.needsAttention}
        <span class="attention-dot" title="Needs attention"></span>
      {/if}
      <span class="badge total">{statusCounts.total}</span>
    </div>
  </button>

  {#if expanded}
    <div class="pane-content">
      <KanbanBoard {showArchive} projectFilter={group.path} />
    </div>
  {/if}
</section>

<style>
  .project-pane {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
    min-height: 0;
  }

  .project-pane.collapsed {
    flex: 0 0 auto;
  }

  .project-pane:not(.collapsed) {
    flex: 1 1 0;
    min-height: 120px;
  }

  .pane-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--vscode-sideBar-background, #252526);
    border: none;
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
    cursor: pointer;
    color: var(--vscode-foreground, #cccccc);
    font-family: inherit;
    font-size: 12px;
    text-align: left;
    width: 100%;
    flex-shrink: 0;
  }

  .pane-header:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
  }

  .chevron {
    display: flex;
    align-items: center;
    transition: transform 0.15s;
  }

  .chevron svg {
    width: 12px;
    height: 12px;
  }

  .chevron.rotated {
    transform: rotate(90deg);
  }

  .pane-name {
    font-weight: 600;
    font-size: 12px;
  }

  .pane-path {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .pane-badges {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .badge {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 6px;
    font-weight: 500;
  }

  .badge.in-progress {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .badge.needs-input {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
  }

  .badge.total {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
  }

  .attention-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f59e0b;
    box-shadow: 0 0 4px #f59e0b;
  }

  .pane-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
