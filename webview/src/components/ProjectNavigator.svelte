<script lang="ts">
  import { projectGroups, selectedProjectPath, expandedProjects, toggleProjectExpanded } from '../stores/conversations';
  import type { ProjectGroup } from '../lib/vscode';

  export let onSelectProject: (path: string | null) => void = () => {};

  function selectProject(path: string | null) {
    $selectedProjectPath = path;
    onSelectProject(path);
  }

  function statusDot(group: ProjectGroup): string {
    if (group.needsAttention) return 'attention';
    if (group.inProgressCount > 0) return 'active';
    return 'idle';
  }
</script>

<nav class="project-nav">
  <div class="nav-header">
    <span class="nav-title">Projects</span>
    <span class="nav-count">{$projectGroups.length}</span>
  </div>

  <button
    class="nav-item"
    class:selected={$selectedProjectPath === null}
    on:click={() => selectProject(null)}
  >
    <span class="nav-item-icon">&#128193;</span>
    <span class="nav-item-label">All Projects</span>
  </button>

  <div class="nav-divider"></div>

  <div class="nav-list">
    {#each $projectGroups as group (group.path)}
      <button
        class="nav-item"
        class:selected={$selectedProjectPath === group.path}
        on:click={() => selectProject(group.path)}
        title={group.path}
      >
        <span class="status-dot {statusDot(group)}"></span>
        <span class="nav-item-label">{group.name}</span>
        <span class="nav-item-badge">{group.activeCount}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  .project-nav {
    width: 180px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--vscode-sideBar-background, #252526);
    border-right: 1px solid var(--vscode-panel-border, #404040);
    overflow: hidden;
  }

  .nav-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
  }

  .nav-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }

  .nav-count {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 8px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
  }

  .nav-divider {
    height: 1px;
    background: var(--vscode-panel-border, #404040);
    margin: 2px 0;
  }

  .nav-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .nav-list::-webkit-scrollbar { width: 4px; }
  .nav-list::-webkit-scrollbar-track { background: transparent; }
  .nav-list::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, #4a4a4a);
    border-radius: 2px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 12px;
    border: none;
    background: transparent;
    color: var(--vscode-foreground, #cccccc);
    cursor: pointer;
    font-size: 11px;
    text-align: left;
    font-family: inherit;
    transition: background 0.1s;
  }

  .nav-item:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
  }

  .nav-item.selected {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
    font-weight: 500;
  }

  .nav-item-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .nav-item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-item-badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 6px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
    flex-shrink: 0;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.active {
    background: #3b82f6;
    box-shadow: 0 0 4px #3b82f6;
  }

  .status-dot.attention {
    background: #f59e0b;
    box-shadow: 0 0 4px #f59e0b;
  }

  .status-dot.idle {
    background: var(--vscode-descriptionForeground, #6b6b6b);
  }
</style>
