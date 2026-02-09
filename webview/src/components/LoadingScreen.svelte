<script lang="ts">
  import { vscode } from '../lib/vscode';
  import type { ProjectManifestEntry } from '../lib/vscode';
  import {
    indexingProgress,
    indexingPercent,
    projectManifest,
  } from '../stores/conversations';

  function toggleProject(entry: ProjectManifestEntry) {
    vscode.postMessage({
      type: 'setProjectEnabled',
      projectPath: entry.encodedPath,
      enabled: !entry.enabled,
    });
  }

  function enableAll() {
    vscode.postMessage({ type: 'setAllProjectsEnabled', enabled: true });
  }

  function disableAll() {
    vscode.postMessage({ type: 'setAllProjectsEnabled', enabled: false });
  }

  $: phase = $indexingProgress.phase;
  $: percent = $indexingPercent;
  $: currentProject = $indexingProgress.currentProject || '';
  $: scannedProjects = $indexingProgress.scannedProjects;
  $: totalProjects = $indexingProgress.totalProjects;
  $: scannedFiles = $indexingProgress.scannedFiles;
  $: totalFiles = $indexingProgress.totalFiles;
  $: manifest = $projectManifest;

  $: enabledCount = manifest.filter(p => p.enabled).length;
  $: totalConvCount = manifest.reduce((s, p) => s + p.fileCount, 0);
  $: enabledConvCount = manifest.filter(p => p.enabled).reduce((s, p) => s + p.fileCount, 0);

  // Sort manifest: enabled first, then by file count descending
  $: sortedManifest = [...manifest].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return b.fileCount - a.fileCount;
  });
</script>

<div class="loading-screen">
  <div class="loading-header">
    <div class="loading-icon">&#128024;</div>
    <div class="loading-title">Claudine</div>
  </div>

  {#if phase === 'discovery'}
    <div class="loading-status">Discovering projects...</div>
  {:else if phase === 'scanning'}
    <div class="loading-status">
      Scanning: <strong>{currentProject}</strong>
      <span class="loading-count">({scannedProjects}/{totalProjects} projects)</span>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar" style="width: {percent}%"></div>
    </div>
    <div class="progress-label">{scannedFiles} / {totalFiles} files &middot; {percent}%</div>
  {/if}

  {#if manifest.length > 0}
    <div class="project-list-header">
      <span class="project-list-title">Projects</span>
      <span class="project-list-summary">
        {enabledCount} of {manifest.length} enabled &middot; {enabledConvCount.toLocaleString()} conversations
      </span>
    </div>

    <div class="project-list">
      {#each sortedManifest as entry (entry.encodedPath)}
        <label class="project-item" class:excluded={entry.autoExcluded} class:disabled={!entry.enabled}>
          <input
            type="checkbox"
            checked={entry.enabled}
            on:change={() => toggleProject(entry)}
          />
          <span class="project-name">{entry.name}</span>
          <span class="project-count">{entry.fileCount.toLocaleString()}</span>
          {#if entry.autoExcluded}
            <span class="project-badge excluded-badge" title={entry.excludeReason || 'Auto-excluded'}>temp</span>
          {/if}
        </label>
      {/each}
    </div>

    <div class="project-actions">
      <button class="action-btn" on:click={enableAll}>Enable all</button>
      <button class="action-btn" on:click={disableAll}>Disable all</button>
    </div>
  {/if}
</div>

<style>
  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 24px;
    gap: 12px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .loading-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
  }

  .loading-icon { font-size: 28px; }

  .loading-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--vscode-foreground, #cccccc);
  }

  .loading-status {
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    text-align: center;
  }

  .loading-status strong {
    color: var(--vscode-foreground, #cccccc);
  }

  .loading-count {
    opacity: 0.7;
  }

  .progress-bar-container {
    width: 100%;
    max-width: 400px;
    height: 6px;
    border-radius: 3px;
    background: var(--vscode-input-background, #3c3c3c);
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    border-radius: 3px;
    background: var(--vscode-progressBar-background, #0078d4);
    transition: width 0.2s ease-out;
  }

  .progress-label {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }

  .project-list-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    max-width: 400px;
    margin-top: 12px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
  }

  .project-list-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-foreground, #cccccc);
  }

  .project-list-summary {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    margin-left: auto;
  }

  .project-list {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 300px;
    overflow-y: auto;
  }

  .project-list::-webkit-scrollbar { width: 4px; }
  .project-list::-webkit-scrollbar-track { background: transparent; }
  .project-list::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, #4a4a4a);
    border-radius: 2px;
  }

  .project-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    color: var(--vscode-foreground, #cccccc);
    transition: background 0.1s;
  }

  .project-item:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
  }

  .project-item.disabled {
    opacity: 0.5;
  }

  .project-item.excluded {
    opacity: 0.4;
  }

  .project-item input[type="checkbox"] {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    accent-color: var(--vscode-progressBar-background, #0078d4);
  }

  .project-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-count {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    flex-shrink: 0;
  }

  .project-badge {
    font-size: 9px;
    padding: 0 4px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .excluded-badge {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }

  .project-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .action-btn {
    font-size: 10px;
    padding: 3px 10px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: transparent;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, #383838);
    color: var(--vscode-foreground, #cccccc);
  }
</style>
