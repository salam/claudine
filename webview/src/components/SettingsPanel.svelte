<script lang="ts">
  import { vscode } from '../lib/vscode';
  import { settings } from '../stores/conversations';

  export let visible = false;

  let apiKeyValue = '';
  let saved = false;
  let testing = false;
  let testResult: 'success' | 'error' | null = null;

  function updateSetting(key: string, value: unknown) {
    vscode.postMessage({ type: 'updateSetting', key, value });
  }

  function testConnection() {
    testing = true;
    testResult = null;
    vscode.postMessage({ type: 'testApiConnection' });
  }

  // Listen for test result from extension
  function handleTestResult(event: MessageEvent) {
    const msg = event.data;
    if (msg.type === 'apiTestResult') {
      testing = false;
      testResult = msg.success ? 'success' : 'error';
      setTimeout(() => { testResult = null; }, 3000);
    }
  }

  import { onMount, onDestroy } from 'svelte';
  onMount(() => window.addEventListener('message', handleTestResult));
  onDestroy(() => window.removeEventListener('message', handleTestResult));

  function handleApiChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    updateSetting('imageGenerationApi', val);
    apiKeyValue = '';
    saved = false;
  }

  function saveApiKey() {
    if (!apiKeyValue.trim()) return;
    updateSetting('imageGenerationApiKey', apiKeyValue.trim());
    saved = true;
    setTimeout(() => { saved = false; }, 2000);
  }

  function handleKeyKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveApiKey();
  }

  function regenerateIcons() {
    vscode.postMessage({ type: 'regenerateIcons' });
  }
</script>

{#if visible}
  <div class="settings-panel">
    <div class="settings-header">
      <span>Settings</span>
    </div>

    <label class="field">
      <span class="field-label">Image Generation</span>
      <select value={$settings.imageGenerationApi} on:change={handleApiChange}>
        <option value="none">None</option>
        <option value="openai">OpenAI (DALL-E 3)</option>
        <option value="stability">Stability AI</option>
      </select>
    </label>

    {#if $settings.imageGenerationApi !== 'none'}
      <div class="field">
        <span class="field-label">API Key</span>
        <div class="key-row">
          <input
            type="password"
            bind:value={apiKeyValue}
            on:keydown={handleKeyKeydown}
            placeholder={$settings.hasApiKey ? '••••••••  (key saved)' : 'sk-...'}
          />
          <button class="save-btn" class:saved on:click={saveApiKey}>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
        <div class="key-actions">
          <span class="field-hint">
            {#if $settings.imageGenerationApi === 'openai'}
              From platform.openai.com
            {:else}
              From platform.stability.ai
            {/if}
          </span>
          {#if $settings.hasApiKey}
            <button
              class="test-btn"
              class:testing
              class:success={testResult === 'success'}
              class:error={testResult === 'error'}
              on:click={testConnection}
              disabled={testing}
            >
              {#if testing}
                Testing...
              {:else if testResult === 'success'}
                Connected
              {:else if testResult === 'error'}
                Failed
              {:else}
                Test Connection
              {/if}
            </button>
          {/if}
        </div>
      </div>
    {/if}

    <button class="regen-btn" on:click={regenerateIcons}>Regenerate Thumbnails</button>
  </div>
{/if}

<style>
  .settings-panel {
    padding: 8px 12px;
    background: var(--vscode-sideBar-background, #252526);
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .settings-header {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .field-label {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }
  .field select,
  .field input {
    background: var(--vscode-input-background, #3c3c3c);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    padding: 4px 8px;
    color: var(--vscode-input-foreground, #cccccc);
    font-size: 11px;
    font-family: inherit;
    outline: none;
  }
  .field select:focus,
  .field input:focus {
    border-color: var(--vscode-focusBorder, #007acc);
  }
  .key-row {
    display: flex;
    gap: 4px;
  }
  .key-row input { flex: 1; min-width: 0; }
  .save-btn {
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #cccccc);
    font-size: 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .save-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .save-btn.saved {
    background: var(--vscode-testing-iconPassed, #10b981);
    color: #fff;
    border-color: transparent;
  }
  .field-hint {
    font-size: 9px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    opacity: 0.8;
  }
  .key-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .test-btn {
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #cccccc);
    font-size: 9px;
    cursor: pointer;
    white-space: nowrap;
  }
  .test-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .test-btn:disabled { opacity: 0.6; cursor: default; }
  .test-btn.success {
    background: var(--vscode-testing-iconPassed, #10b981);
    color: #fff;
    border-color: transparent;
  }
  .test-btn.error {
    background: var(--vscode-testing-iconFailed, #ef4444);
    color: #fff;
    border-color: transparent;
  }
  .regen-btn {
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #cccccc);
    font-size: 10px;
    cursor: pointer;
    align-self: flex-start;
  }
  .regen-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
</style>
