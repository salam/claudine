<script lang="ts">
  import ProjectNavigator from './ProjectNavigator.svelte';
  import ProjectPane from './ProjectPane.svelte';
  import PaneResizeHandle from './PaneResizeHandle.svelte';
  import KanbanBoard from './KanbanBoard.svelte';
  import LoadingScreen from './LoadingScreen.svelte';
  import { get } from 'svelte/store';
  import {
    projectGroups,
    selectedProjectPath,
    expandedProjects,
    indexingProgress,
    paneHeights,
    setPaneHeight,
    resetAllPaneHeights,
    zoomLevel,
  } from '../stores/conversations';

  export let showArchive = false;

  const MIN_PANE_HEIGHT = 80;

  // On first load, expand only active projects (in-progress, needs attention,
  // or updated in the last 24 hours). Stale projects start collapsed.
  const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
  let initialized = false;
  $: if (!initialized && $projectGroups.length > 0) {
    const now = Date.now();
    const activePaths = new Set<string>();
    for (const g of $projectGroups) {
      if (g.inProgressCount > 0 || g.needsAttention) {
        activePaths.add(g.path);
        continue;
      }
      const latest = Math.max(...g.conversations.map(c => new Date(c.updatedAt).getTime()));
      if (now - latest < STALE_THRESHOLD_MS) {
        activePaths.add(g.path);
      }
    }
    expandedProjects.set(activePaths);
    initialized = true;
  }

  function handleSelectProject(path: string | null) {
    // Just update the store — the reactive blocks handle the rest
  }

  $: filteredGroups = $selectedProjectPath
    ? $projectGroups.filter(g => g.path === $selectedProjectPath)
    : $projectGroups;

  $: isIndexing = $indexingProgress.phase !== 'idle' && $indexingProgress.phase !== 'complete';

  // Which groups are currently expanded (used for resize logic)
  $: expandedGroups = filteredGroups.filter(g => $expandedProjects.has(g.path));

  /**
   * Handle vertical drag between two adjacent expanded panes.
   * topPath/bottomPath identify the panes above/below the handle.
   */
  function handlePaneResize(topPath: string, bottomPath: string, deltaY: number) {
    const zoom = get(zoomLevel);
    const adjustedDelta = deltaY / zoom;

    const topEl = document.querySelector(`[data-pane-path="${CSS.escape(topPath)}"]`) as HTMLElement | null;
    const bottomEl = document.querySelector(`[data-pane-path="${CSS.escape(bottomPath)}"]`) as HTMLElement | null;
    if (!topEl || !bottomEl) return;

    const heights = get(paneHeights);
    const topHeight = heights[topPath] ?? Math.round(topEl.getBoundingClientRect().height / zoom);
    const bottomHeight = heights[bottomPath] ?? Math.round(bottomEl.getBoundingClientRect().height / zoom);

    const total = topHeight + bottomHeight;
    let newTop = Math.max(MIN_PANE_HEIGHT, Math.min(total - MIN_PANE_HEIGHT, Math.round(topHeight + adjustedDelta)));
    const newBottom = total - newTop;

    setPaneHeight(topPath, newTop);
    setPaneHeight(bottomPath, newBottom);
  }

  function handleResetHeights() {
    resetAllPaneHeights();
  }
</script>

<div class="multi-project-layout">
  {#if !isIndexing}
    <ProjectNavigator onSelectProject={handleSelectProject} />
  {/if}

  <div class="project-content">
    {#if isIndexing}
      <LoadingScreen />
    {:else if $selectedProjectPath}
      <!-- Single project selected — show full board -->
      <KanbanBoard {showArchive} projectFilter={$selectedProjectPath} />
    {:else}
      <!-- All projects — vertical split panes -->
      <div class="split-panes">
        {#each filteredGroups as group, i (group.path)}
          {@const isExpanded = $expandedProjects.has(group.path)}
          {@const storedHeight = $paneHeights[group.path]}
          <ProjectPane
            {group}
            expanded={isExpanded}
            height={isExpanded && storedHeight ? storedHeight : null}
            {showArchive}
            on:toggle={() => {
              expandedProjects.update(set => {
                const next = new Set(set);
                if (next.has(group.path)) next.delete(group.path);
                else next.add(group.path);
                return next;
              });
            }}
          />
          {#if i < filteredGroups.length - 1}
            {@const nextGroup = filteredGroups[i + 1]}
            {#if isExpanded && $expandedProjects.has(nextGroup.path)}
              <PaneResizeHandle
                on:resize={(e) => handlePaneResize(group.path, nextGroup.path, e.detail.deltaY)}
                on:resetHeights={handleResetHeights}
              />
            {/if}
          {/if}
        {/each}
      </div>

      {#if filteredGroups.length === 0}
        <div class="empty-state">
          <div class="empty-icon">&#128193;</div>
          <div class="empty-title">No projects found</div>
          <div class="empty-hint">Start a Claude Code session in any project directory to see it here.</div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .multi-project-layout {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }

  .project-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .split-panes {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }

  .split-panes::-webkit-scrollbar { width: 6px; }
  .split-panes::-webkit-scrollbar-track { background: transparent; }
  .split-panes::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, #4a4a4a);
    border-radius: 3px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }

  .empty-icon {
    font-size: 32px;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--vscode-foreground, #cccccc);
  }

  .empty-hint {
    font-size: 11px;
    max-width: 300px;
    text-align: center;
  }
</style>
