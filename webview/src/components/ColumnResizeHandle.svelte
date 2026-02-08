<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    resize: { deltaX: number };
    resetWidths: void;
  }>();

  let dragging = false;
  let startX = 0;

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;

    const onMouseMove = (e: MouseEvent) => {
      dispatch('resize', { deltaX: e.clientX - startX });
      startX = e.clientX;
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
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onDblClick() {
    dispatch('resetWidths');
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
<div
  class="resize-handle"
  class:dragging
  on:mousedown={onMouseDown}
  on:dblclick={onDblClick}
  role="separator"
  aria-orientation="vertical"
  tabindex="0"
>
  <div class="resize-line"></div>
</div>

<style>
  .resize-handle {
    width: 12px;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    z-index: 5;
    margin: 0 -6px;
    position: relative;
  }
  .resize-line {
    width: 2px;
    height: 100%;
    background: transparent;
    border-radius: 1px;
    transition: background 0.15s;
  }
  .resize-handle:hover .resize-line,
  .resize-handle.dragging .resize-line {
    background: var(--vscode-focusBorder, #007acc);
  }
</style>
