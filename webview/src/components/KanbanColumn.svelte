<script lang="ts">
  export let title: string;
  export let color: string;
  export let count: number;
  export let activeCount: number = 0;
</script>

<div class="column" class:has-active={activeCount > 0}>
  <div class="column-header">
    <span class="color-indicator" style="background-color: {color}"></span>
    <h2>{title}</h2>
    {#if activeCount > 0}
      <span class="active-count">{activeCount}</span>
    {/if}
    <span class="count">{count}</span>
  </div>
  <div class="column-content">
    <slot />
  </div>
</div>

<style>
  .column {
    background: var(--vscode-sideBar-background, #252526);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    border: 1px solid transparent;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .column.has-active {
    animation: widget-pulse 3s ease-in-out infinite;
    border-color: rgba(16, 185, 129, 0.3);
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.15);
  }

  @keyframes widget-pulse {
    0%, 100% {
      background: var(--vscode-sideBar-background, #252526);
      border-color: rgba(16, 185, 129, 0.3);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.15);
    }
    50% {
      background: color-mix(in srgb, var(--vscode-sideBar-background, #252526) 96%, #10b981);
      border-color: rgba(16, 185, 129, 0.5);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.25), 0 0 40px rgba(16, 185, 129, 0.1);
    }
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 8px;
    position: sticky;
    top: 0;
    background: inherit;
    z-index: 1;
    border-radius: 8px 8px 0 0;
  }

  .color-indicator {
    width: 4px;
    height: 16px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  h2 {
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-foreground, #cccccc);
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .active-count {
    background: #10b981;
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    animation: count-pulse 2s ease-in-out infinite;
  }

  @keyframes count-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .count {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 500;
  }

  .column-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 4px 8px;
  }

  .column-content::-webkit-scrollbar {
    width: 6px;
  }

  .column-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .column-content::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, #4a4a4a);
    border-radius: 3px;
  }

  .column-content::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-hoverBackground, #5a5a5a);
  }
</style>
