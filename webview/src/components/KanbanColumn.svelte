<script lang="ts">
  export let title: string;
  export let color: string;
  export let count: number;
  export let activeCount: number = 0;
  export let narrow: boolean = false;
  export let onToggleNarrow: (() => void) | null = null;
</script>

<div class="column" class:has-active={activeCount > 0} class:narrow>
  {#if narrow}
    <button class="column-header narrow-header" on:click={() => onToggleNarrow?.()} title="Click to expand {title}">
      <span class="color-indicator narrow-indicator-dot" style="background-color: {color}"></span>
      <span class="narrow-title">{title}</span>
      <span class="count">{count}</span>
    </button>
  {:else}
    <div class="column-header">
      <span class="color-indicator" style="background-color: {color}"></span>
      <h2>{title}</h2>
      {#if activeCount > 0}
        <span class="active-count">{activeCount}</span>
      {/if}
      <span class="count">{count}</span>
      {#if onToggleNarrow}
        <button class="collapse-column-btn" on:click={onToggleNarrow} title="Collapse column">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.3 2.3L11 3 6.4 7.6 11 12.3l-.7.7L5 7.7l5.3-5.4z"/></svg>
        </button>
      {/if}
    </div>
  {/if}
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

  /* Narrow column */
  .column.narrow .column-content { padding: 0 2px 4px; }

  .narrow-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px;
    background: inherit;
    border: none;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    border-radius: 8px 8px 0 0;
    transition: background 0.15s;
  }
  .narrow-header:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
  }
  .narrow-indicator-dot {
    width: 8px !important;
    height: 8px !important;
    border-radius: 50% !important;
  }
  .narrow-title {
    writing-mode: vertical-lr;
    text-orientation: mixed;
    font-size: 9px;
    font-weight: 600;
    color: var(--vscode-foreground, #cccccc);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .collapse-column-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-disabledForeground, #6b6b6b);
    opacity: 0;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px; height: 16px;
    padding: 0;
    flex-shrink: 0;
  }
  .collapse-column-btn svg { width: 12px; height: 12px; }
  .column-header:hover .collapse-column-btn { opacity: 0.6; }
  .collapse-column-btn:hover { opacity: 1 !important; color: var(--vscode-foreground, #cccccc); }
</style>
