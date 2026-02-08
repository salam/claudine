<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import KanbanBoard from './components/KanbanBoard.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import { vscode, type ExtensionMessage } from './lib/vscode';
  import {
    settings, addError, setConversations, upsertConversation, removeConversations,
    focusedConversationId, searchQuery, searchMode, compactView,
    extensionSearchMatchIds, loadDraftsFromExtension,
    expandAllCards, collapseAllCards,
    activeCategories, toggleCategory, clearCategoryFilter, getCategoryDetails,
    rateLimitInfo,
    zoomLevel, zoomIn, zoomOut, zoomReset, restoreZoom, ZOOM_MIN, ZOOM_MAX,
    restoreColumnWidths
  } from './stores/conversations';
  import type { ConversationCategory } from './lib/vscode';
  import { localeStrings, t } from './stores/locale';

  let searchOpen = false;
  let filterOpen = false;
  let settingsOpen = false;
  let aboutOpen = false;
  let showArchive = false;

  const allCategories: ConversationCategory[] = ['bug', 'user-story', 'feature', 'improvement', 'task'];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Debounce search queries → extension for JSONL full-text search
  const unsubSearch = searchQuery.subscribe(q => {
    clearTimeout(debounceTimer);
    if (!q.trim()) {
      extensionSearchMatchIds.set(null);
      return;
    }
    debounceTimer = setTimeout(() => {
      vscode.postMessage({ type: 'search', query: q });
    }, 300);
  });

  function handleKeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
    else if (e.key === '-') { e.preventDefault(); zoomOut(); }
    else if (e.key === '0') { e.preventDefault(); zoomReset(); }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    window.addEventListener('keydown', handleKeydown);
    restoreZoom();
    restoreColumnWidths();
    vscode.postMessage({ type: 'ready' });
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  onDestroy(() => {
    unsubSearch();
    clearTimeout(debounceTimer);
  });

  function handleMessage(event: MessageEvent<ExtensionMessage>) {
    const message = event.data;
    switch (message.type) {
      case 'updateConversations':
        setConversations(message.conversations);
        break;
      case 'updateSettings':
        settings.set(message.settings);
        break;
      case 'conversationUpdated':
        upsertConversation(message.conversation);
        break;
      case 'removeConversations':
        removeConversations(message.ids);
        break;
      case 'focusedConversation':
        focusedConversationId.set(message.conversationId);
        break;
      case 'searchResults':
        extensionSearchMatchIds.set(new Set(message.ids));
        break;
      case 'draftsLoaded':
        loadDraftsFromExtension(message.drafts);
        break;
      case 'updateLocale':
        localeStrings.set(message.strings);
        break;
      case 'error':
        addError(message.message);
        break;
      case 'toolbarAction':
        handleToolbarAction(message.action);
        break;
    }
  }

  function handleToolbarAction(action: string) {
    switch (action) {
      case 'toggleSearch': toggleSearch(); break;
      case 'toggleFilter': toggleFilter(); break;
      case 'toggleCompactView': toggleCompact(); break;
      case 'toggleExpandAll': toggleAllCards(); break;
      case 'toggleArchive': toggleArchive(); break;
    }
  }

  function handleRefresh() {
    vscode.postMessage({ type: 'refreshConversations' });
  }

  function toggleSearch() {
    searchOpen = !searchOpen;
    if (!searchOpen) $searchQuery = '';
  }

  function toggleFilter() {
    filterOpen = !filterOpen;
    if (!filterOpen) clearCategoryFilter();
  }

  function toggleCompact() {
    $compactView = !$compactView;
  }

  function toggleSummarization() {
    vscode.postMessage({ type: 'toggleSummarization' });
  }

  function toggleSearchMode() {
    $searchMode = $searchMode === 'fade' ? 'hide' : 'fade';
  }

  function handleSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      searchOpen = false;
      $searchQuery = '';
    }
  }

  function toggleSettings() {
    settingsOpen = !settingsOpen;
  }

  function toggleAbout() {
    aboutOpen = !aboutOpen;
  }

  function toggleArchive() {
    showArchive = !showArchive;
  }

  function handleCleanSweep() {
    vscode.postMessage({ type: 'closeEmptyClaudeTabs' });
  }

  function handleToggleAutoRestart() {
    vscode.postMessage({ type: 'toggleAutoRestart' });
  }

  let allExpanded = false;

  function toggleAllCards() {
    allExpanded = !allExpanded;
    if (allExpanded) {
      expandAllCards();
    } else {
      collapseAllCards();
    }
  }
</script>

<div class="layout">
  {#if $settings.toolbarLocation !== 'titlebar'}
  <aside class="sidebar">
    <div class="sidebar-brand">
      {#if $settings.viewLocation === 'panel'}
        <span class="brand-icon">🐘</span>
      {:else}
        <span class="brand-text">Claudine</span>
      {/if}
    </div>
    <div class="sidebar-actions">
      <button class="sidebar-btn" class:active={searchOpen} on:click={toggleSearch} title="Search conversations" aria-label="Search conversations" aria-pressed={searchOpen}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
      </button>
      <button class="sidebar-btn" class:active={filterOpen || $activeCategories.size > 0} on:click={toggleFilter} title="Filter by category" aria-label="Filter by category" aria-pressed={filterOpen}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z"/></svg>
      </button>
      <button class="sidebar-btn" class:active={$compactView} on:click={toggleCompact} title="Toggle compact / full view" aria-label="Toggle compact or full view" aria-pressed={$compactView}>
        {#if $compactView}
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v1.5H2V3zm0 4h12v1.5H2V7zm0 4h12v1.5H2V11z"/></svg>
        {:else}
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg>
        {/if}
      </button>
      <button class="sidebar-btn" on:click={toggleAllCards} title="Expand / Collapse all" aria-label={allExpanded ? 'Collapse all cards' : 'Expand all cards'}>
        {#if allExpanded}
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zm3 3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm3 3a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5z"/></svg>
        {:else}
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M7 3.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5zm-3 3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-3 3a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"/></svg>
        {/if}
      </button>
      <button class="sidebar-btn" class:active={$settings.enableSummarization} on:click={toggleSummarization} title={$settings.enableSummarization ? 'Summarization ON (click to disable)' : 'Summarization OFF (click to enable)'} aria-label="Toggle summarization" aria-pressed={$settings.enableSummarization}>
        {#if $settings.enableSummarization}
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.545 4.753h4.999l-4.044 2.94 1.545 4.753L8 10.506l-4.045 2.94 1.545-4.753L1.456 5.753h4.999z"/></svg>
        {:else}
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M8 1l1.545 4.753h4.999l-4.044 2.94 1.545 4.753L8 10.506l-4.045 2.94 1.545-4.753L1.456 5.753h4.999z"/></svg>
        {/if}
      </button>
      <button class="sidebar-btn" on:click={handleRefresh} title="Refresh conversations" aria-label="Refresh conversations">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
      </button>
      <button class="sidebar-btn" on:click={handleCleanSweep} title="Close empty & duplicate Claude tabs" aria-label="Close empty and duplicate Claude tabs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 22-1-4"/><path d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1"/><path d="M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z"/><path d="m8 22 1-4"/></svg>
      </button>
      <button class="sidebar-btn" class:active={showArchive} on:click={toggleArchive} title={showArchive ? 'Hide archived conversations' : 'Show archived conversations'} aria-label="Toggle archive" aria-pressed={showArchive}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M0 2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1v7.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 1 12.5V5a1 1 0 0 1-1-1V2zm2 3v7.5A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5V5H2zm13-3H1v2h14V2zM5 7.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/></svg>
      </button>
      <div class="sidebar-zoom">
        <button class="sidebar-btn" on:click={zoomOut} title="Zoom out (Ctrl+-)" aria-label="Zoom out" disabled={$zoomLevel <= ZOOM_MIN}>
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="7" width="10" height="2" rx="1"/></svg>
        </button>
        <button class="sidebar-btn zoom-indicator" on:click={zoomReset} title="Reset zoom (Ctrl+0)" aria-label="Reset zoom to 100%">
          <span class="zoom-text">{Math.round($zoomLevel * 100)}</span>
        </button>
        <button class="sidebar-btn" on:click={zoomIn} title="Zoom in (Ctrl+=)" aria-label="Zoom in" disabled={$zoomLevel >= ZOOM_MAX}>
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
        </button>
      </div>
      <button class="sidebar-btn" class:active={settingsOpen} on:click={toggleSettings} title="Settings" aria-label="Settings" aria-pressed={settingsOpen}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.902 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116l.094-.318z"/></svg>
      </button>
      <button class="sidebar-btn" class:active={aboutOpen} on:click={toggleAbout} title="About Claudine" aria-label="About Claudine" aria-pressed={aboutOpen}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM7.25 5a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zM7.25 7h1.5v4.5h-1.5V7z"/></svg>
      </button>
    </div>
  </aside>
  {/if}

  <main>
    {#if $rateLimitInfo.active}
      <div class="rate-limit-banner">
        <span class="rl-icon">&#9203;</span>
        <span class="rl-text">
          You've hit your limit &middot; resets {$rateLimitInfo.resetDisplay}.
        </span>
        <button class="rl-auto-restart" class:active={$settings.autoRestartAfterRateLimit} on:click={handleToggleAutoRestart}>
          {#if $settings.autoRestartAfterRateLimit}
            Auto-restart enabled
          {:else}
            Automatically restart all paused tasks when limit is lifted
          {/if}
        </button>
      </div>
    {/if}
    {#if searchOpen}
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
        <!-- svelte-ignore a11y-autofocus -->
        <input type="text" bind:value={$searchQuery} on:keydown={handleSearchKey} placeholder="Search conversations..." autofocus />
        <button class="mode-toggle" class:hide-mode={$searchMode === 'hide'} on:click={toggleSearchMode} title={$searchMode === 'fade' ? 'Fading non-matches (click to hide)' : 'Hiding non-matches (click to fade)'}>
          {$searchMode === 'fade' ? 'Fade' : 'Hide'}
        </button>
        <button class="search-close" on:click={toggleSearch}>
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
        </button>
      </div>
    {/if}
    {#if filterOpen}
      <div class="filter-bar">
        <svg class="filter-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z"/></svg>
        <div class="filter-chips">
          {#each allCategories as cat}
            {@const details = getCategoryDetails(cat)}
            <button
              class="filter-chip"
              class:active={$activeCategories.has(cat)}
              style:--chip-color={details.color}
              on:click={() => toggleCategory(cat)}
              aria-pressed={$activeCategories.has(cat)}
            >
              <span class="chip-icon">{details.icon}</span>
              <span class="chip-label">{details.label}</span>
            </button>
          {/each}
        </div>
        {#if $activeCategories.size > 0}
          <button class="filter-clear" on:click={clearCategoryFilter} title="Clear filter">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
          </button>
        {/if}
        <button class="filter-close" on:click={toggleFilter}>
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
        </button>
      </div>
    {/if}
    <SettingsPanel visible={settingsOpen} />
    <KanbanBoard {showArchive} vertical={$settings.viewLocation === 'sidebar'} />
  </main>
</div>

{#if aboutOpen}
  <div class="about-overlay" on:click={toggleAbout} on:keydown={(e) => e.key === 'Escape' && toggleAbout()} role="button" tabindex="-1">
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="about-popup" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-label="About Claudine">
      <div class="about-icon">🐘</div>
      <div class="about-title">Claudine</div>
      <div class="about-links">
        <a href="https://claudine.pro" target="_blank" rel="noopener">claudine.pro</a>
      </div>
      <div class="about-credit">
        Developed by <a href="https://github.com/salam" target="_blank" rel="noopener">@salam</a>
      </div>
      <button class="about-close" on:click={toggleAbout}>Close</button>
    </div>
  </div>
{/if}

<style>
  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(html), :global(body) { height: 100%; overflow: hidden; }
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background-color: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #cccccc);
    font-size: 12px;
    line-height: 1.5;
  }
  .layout { display: flex; height: 100vh; }
  .sidebar {
    width: 32px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    gap: 8px;
    background: var(--vscode-sideBar-background, #252526);
    border-right: 1px solid var(--vscode-panel-border, #404040);
    overflow: hidden;
  }
  .sidebar-brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
    width: 100%;
  }
  .brand-icon { font-size: 13px; opacity: 0.8; line-height: 1; }
  .brand-text {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    user-select: none;
  }
  .sidebar-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px 0;
  }
  .sidebar-actions::-webkit-scrollbar { width: 4px; }
  .sidebar-actions::-webkit-scrollbar-track { background: transparent; }
  .sidebar-actions::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, #4a4a4a);
    border-radius: 2px;
  }
  .sidebar-actions::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-hoverBackground, #5a5a5a);
  }
  .sidebar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }
  .sidebar-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, #383838);
    color: var(--vscode-foreground, #cccccc);
  }
  .sidebar-btn.active {
    background: var(--vscode-toolbar-hoverBackground, #383838);
    color: var(--vscode-foreground, #cccccc);
  }
  .sidebar-btn:disabled { opacity: 0.3; cursor: default; }
  .sidebar-btn:disabled:hover { background: transparent; color: var(--vscode-descriptionForeground, #8c8c8c); }
  .sidebar-btn svg { width: 14px; height: 14px; }
  .sidebar-zoom {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 4px 0;
    border-top: 1px solid var(--vscode-panel-border, #404040);
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
  }
  .zoom-indicator { font-size: 8px; width: 24px; height: 16px; }
  .zoom-text { font-size: 8px; font-weight: 600; color: var(--vscode-descriptionForeground, #8c8c8c); }
  main { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
  .search-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--vscode-sideBar-background, #252526);
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
  }
  .search-icon { width: 13px; height: 13px; flex-shrink: 0; color: var(--vscode-descriptionForeground, #8c8c8c); }
  .search-bar input {
    flex: 1;
    background: var(--vscode-input-background, #3c3c3c);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    padding: 3px 8px;
    color: var(--vscode-input-foreground, #cccccc);
    font-size: 11px;
    outline: none;
    font-family: inherit;
  }
  .search-bar input:focus { border-color: var(--vscode-focusBorder, #007acc); }
  .mode-toggle {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: transparent;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    cursor: pointer;
    white-space: nowrap;
  }
  .mode-toggle.hide-mode {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
  }
  .search-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    cursor: pointer;
    border-radius: 3px;
  }
  .search-close:hover { background: var(--vscode-toolbar-hoverBackground, #383838); }
  .search-close svg { width: 14px; height: 14px; }

  .filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--vscode-sideBar-background, #252526);
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
  }
  .filter-icon { width: 13px; height: 13px; flex-shrink: 0; color: var(--vscode-descriptionForeground, #8c8c8c); }
  .filter-chips { display: flex; gap: 4px; flex: 1; flex-wrap: wrap; }
  .filter-chip {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: transparent;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    cursor: pointer;
    font-size: 10px;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .filter-chip:hover {
    border-color: var(--chip-color, #8c8c8c);
    color: var(--vscode-foreground, #cccccc);
  }
  .filter-chip.active {
    background: color-mix(in srgb, var(--chip-color, #8c8c8c) 20%, transparent);
    border-color: var(--chip-color, #8c8c8c);
    color: var(--vscode-foreground, #cccccc);
  }
  .chip-icon { font-size: 11px; line-height: 1; }
  .chip-label { font-size: 10px; }
  .filter-clear, .filter-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    cursor: pointer;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .filter-clear:hover, .filter-close:hover { background: var(--vscode-toolbar-hoverBackground, #383838); }
  .filter-clear svg, .filter-close svg { width: 14px; height: 14px; }

  /* ---- Rate limit banner ---- */
  .rate-limit-banner {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: rgba(245, 158, 11, 0.12);
    border-bottom: 1px solid rgba(245, 158, 11, 0.3);
    font-size: 11px;
    color: var(--vscode-foreground, #cccccc);
  }
  .rl-icon { font-size: 13px; flex-shrink: 0; }
  .rl-text { flex-shrink: 0; }
  .rl-auto-restart {
    font-size: 10px;
    font-style: italic;
    color: var(--vscode-textLink-foreground, #3794ff);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  .rl-auto-restart:hover { text-decoration-style: solid; }
  .rl-auto-restart.active {
    color: #10b981;
    font-style: normal;
    font-weight: 500;
    text-decoration: none;
  }

  .about-overlay {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
  }
  .about-popup {
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, #404040);
    border-radius: 8px;
    padding: 24px 32px;
    text-align: center;
    min-width: 200px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .about-icon { font-size: 28px; margin-bottom: 8px; }
  .about-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
  .about-links { margin-bottom: 8px; }
  .about-links a, .about-credit a {
    color: var(--vscode-textLink-foreground, #3794ff);
    text-decoration: none;
  }
  .about-links a:hover, .about-credit a:hover { text-decoration: underline; }
  .about-credit { font-size: 11px; color: var(--vscode-descriptionForeground, #8c8c8c); margin-bottom: 16px; }
  .about-close {
    padding: 4px 16px;
    border-radius: 4px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: transparent;
    color: var(--vscode-foreground, #cccccc);
    cursor: pointer;
    font-size: 11px;
  }
  .about-close:hover { background: var(--vscode-toolbar-hoverBackground, #383838); }
</style>
