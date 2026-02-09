<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    resize: { deltaY: number };
    resetHeights: void;
  }>();

  let dragging = false;
  let startY = 0;

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;

    const onMouseMove = (e: MouseEvent) => {
      dispatch('resize', { deltaY: e.clientY - startY });
      startY = e.clientY;
    };

    const onMouseUp = () => {
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  function onDblClick() {
    dispatch('resetHeights');
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
<div
  class="pane-resize-handle"
  class:dragging
  on:mousedown={onMouseDown}
  on:dblclick={onDblClick}
  role="separator"
  aria-orientation="horizontal"
  tabindex="0"
>
  <div class="resize-line"></div>
</div>

<style>
  .pane-resize-handle {
    height: 12px;
    cursor: row-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    z-index: 5;
    margin: -6px 0;
    position: relative;
  }
  .resize-line {
    height: 2px;
    width: 100%;
    background: transparent;
    border-radius: 1px;
    transition: background 0.15s;
  }
  .pane-resize-handle:hover .resize-line,
  .pane-resize-handle.dragging .resize-line {
    background: var(--vscode-focusBorder, #007acc);
  }
</style>
