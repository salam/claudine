<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ submit: string }>();

  let prompt = '';
  let isExpanded = false;

  function handleSubmit() {
    if (prompt.trim()) {
      dispatch('submit', prompt.trim());
      prompt = '';
      isExpanded = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    } else if (event.key === 'Escape') {
      isExpanded = false;
      prompt = '';
    }
  }

  function handleFocus() {
    isExpanded = true;
  }

  function handleBlur() {
    if (!prompt.trim()) {
      isExpanded = false;
    }
  }
</script>

<div class="prompt-input" class:expanded={isExpanded}>
  <input
    type="text"
    bind:value={prompt}
    placeholder="Send a message..."
    on:keydown={handleKeyDown}
    on:focus={handleFocus}
    on:blur={handleBlur}
  />
  {#if isExpanded || prompt}
    <button
      class="send-btn"
      on:click={handleSubmit}
      disabled={!prompt.trim()}
      title="Send message"
    >
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.724 1.053a.5.5 0 0 0-.714.545l1.403 4.85a.5.5 0 0 0 .397.354l5.69.953c.268.053.268.437 0 .49l-5.69.953a.5.5 0 0 0-.397.354l-1.403 4.85a.5.5 0 0 0 .714.545l13-6.5a.5.5 0 0 0 0-.894l-13-6.5z"/>
      </svg>
    </button>
  {/if}
</div>

<style>
  .prompt-input {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--vscode-input-background, #3c3c3c);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 4px;
    padding: 4px 8px;
    transition: all 0.15s ease;
  }

  .prompt-input:focus-within {
    border-color: var(--vscode-focusBorder, #007acc);
  }

  .prompt-input.expanded {
    padding: 6px 8px;
  }

  input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--vscode-input-foreground, #cccccc);
    font-size: 10px;
    font-family: inherit;
    min-width: 0;
  }

  input::placeholder {
    color: var(--vscode-input-placeholderForeground, #8c8c8c);
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-btn svg {
    width: 12px;
    height: 12px;
  }
</style>
