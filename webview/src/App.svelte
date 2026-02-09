<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import KanbanBoard from './components/KanbanBoard.svelte';
  import MultiProjectView from './components/MultiProjectView.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import { vscode, type ExtensionMessage } from './lib/vscode';
  import {
    settings, addError, setConversations, upsertConversation, removeConversations,
    appendProjectConversations,
    focusedConversationId, searchQuery, searchMode, compactView,
    extensionSearchMatchIds, loadDraftsFromExtension,
    expandAllCards, collapseAllCards,
    activeCategories, toggleCategory, clearCategoryFilter, getCategoryDetails,
    rateLimitInfo,
    indexingProgress, projectManifest,
    zoomLevel, zoomIn, zoomOut, zoomReset, restoreZoom, ZOOM_MIN, ZOOM_MAX,
    restoreColumnWidths,
    restorePaneHeights
  } from './stores/conversations';
  import type { Conversation, ConversationCategory } from './lib/vscode';
  import { localeStrings, t } from './stores/locale';
  import { themePreference, resolvedTheme, cycleTheme } from './stores/theme';

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
    restorePaneHeights();
    requestNotificationPermission();
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
        checkNotifications(message.conversation);
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
      case 'indexingProgress':
        indexingProgress.set({
          phase: message.phase,
          totalProjects: message.totalProjects,
          scannedProjects: message.scannedProjects,
          totalFiles: message.totalFiles,
          scannedFiles: message.scannedFiles,
          currentProject: message.currentProject,
        });
        break;
      case 'projectDiscovered':
        projectManifest.set(message.projects);
        break;
      case 'projectConversationsLoaded':
        appendProjectConversations(message.projectPath, message.conversations);
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
      case 'zoomIn': zoomIn(); break;
      case 'zoomOut': zoomOut(); break;
      case 'zoomReset': zoomReset(); break;
      case 'toggleSettingsPanel': toggleSettings(); break;
      case 'toggleAbout': toggleAbout(); break;
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

  // ── Desktop notifications (standalone only) ──────────────────────────
  const notifiedIds = new Set<string>();
  let notificationsReady = false;

  function requestNotificationPermission() {
    if (!vscode.isStandalone || typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      notificationsReady = true;
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => { notificationsReady = p === 'granted'; });
    }
  }

  function notifyNeedsInput(conv: Conversation) {
    if (!notificationsReady || !vscode.isStandalone) return;
    if (notifiedIds.has(conv.id)) return;
    notifiedIds.add(conv.id);
    const title = conv.title || 'Conversation needs input';
    new Notification('Claudine', {
      body: title,
      tag: conv.id,
      silent: false,
    });
  }

  function checkNotifications(conv: Conversation) {
    if (conv.hasQuestion || conv.status === 'needs-input') {
      notifyNeedsInput(conv);
    } else {
      // Clear notification tracking when no longer needs attention
      notifiedIds.delete(conv.id);
    }
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
  {#if $settings.toolbarLocation === 'sidebar'}
  <aside class="sidebar">
    <div class="sidebar-brand">
      <span class="brand-icon">🐘</span>
    </div>
    <div class="sidebar-actions">
      <button class="sidebar-btn" class:active={searchOpen} on:click={toggleSearch} title="Search conversations" aria-label="Search conversations" aria-pressed={searchOpen}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.02 10.727a5.5 5.5 0 1 1 .707-.707l3.127 3.126a.5.5 0 0 1-.708.708l-3.127-3.127ZM11 6.5a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/></svg>
      </button>
      <button class="sidebar-btn" class:active={filterOpen || $activeCategories.size > 0} on:click={toggleFilter} title="Filter by category" aria-label="Filter by category" aria-pressed={filterOpen}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M9.5 14h-3a.5.5 0 0 1-.5-.5V9.329c0-.401-.156-.777-.439-1.061l-4-4A1.915 1.915 0 0 1 2.914 1h10.172a1.915 1.915 0 0 1 1.353 3.267l-4 4c-.283.284-.439.66-.439 1.061v4.171a.5.5 0 0 1-.5.5V14ZM7 13h2V9.329c0-.668.26-1.296.732-1.768l4-4a.915.915 0 0 0-.646-1.56H2.914a.915.915 0 0 0-.646 1.561l4 4c.473.472.732 1.1.732 1.768v3.671V13Z"/></svg>
      </button>
      <button class="sidebar-btn" class:active={$compactView} on:click={toggleCompact} title="Toggle compact / full view" aria-label="Toggle compact or full view" aria-pressed={$compactView}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 3.5a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 0 1h-8a.5.5 0 0 1-.5-.5ZM13.5 6h-11a.5.5 0 0 0 0 1h11a.5.5 0 0 0 0-1Zm-4 3h-7a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1ZM2.5 12h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1Z"/></svg>
      </button>
      <button class="sidebar-btn" on:click={toggleAllCards} title="Expand / Collapse all" aria-label={allExpanded ? 'Collapse all cards' : 'Expand all cards'}>
        {#if allExpanded}
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M14 3.268V11a3 3 0 0 1-3 3H3.268c.346.598.992 1 1.732 1h6a4 4 0 0 0 4-4V5c0-.74-.402-1.387-1-1.732ZM9.5 7.5a.5.5 0 0 0 0-1h-5a.5.5 0 0 0 0 1h5ZM11 1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h8Zm1 2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V3Z"/></svg>
        {:else}
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M14 3.268V11a3 3 0 0 1-3 3H3.268c.346.598.992 1 1.732 1h6a4 4 0 0 0 4-4V5c0-.74-.402-1.387-1-1.732ZM9.5 7.5a.5.5 0 0 0 0-1h-2v-2a.5.5 0 0 0-1 0v2h-2a.5.5 0 0 0 0 1h2v2a.5.5 0 0 0 1 0v-2h2ZM11 1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h8Zm1 2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V3Z"/></svg>
        {/if}
      </button>
      <button class="sidebar-btn" class:active={$settings.enableSummarization} on:click={toggleSummarization} title={$settings.enableSummarization ? 'Summarization ON (click to disable)' : 'Summarization OFF (click to enable)'} aria-label="Toggle summarization" aria-pressed={$settings.enableSummarization}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.465 9.83a.921.921 0 0 0 1.07 0 .98.98 0 0 0 .341-.46l.347-1.067c.085-.251.226-.48.413-.668.187-.186.415-.327.665-.41l1.086-.354a.923.923 0 0 0-.037-1.75l-1.069-.346a1.7 1.7 0 0 1-1.08-1.078l-.353-1.084a.917.917 0 0 0-.869-.61.92.92 0 0 0-.875.624l-.356 1.09A1.71 1.71 0 0 1 3.7 4.775l-1.084.351a.923.923 0 0 0 .013 1.745l1.067.347a1.712 1.712 0 0 1 1.081 1.083l.352 1.08c.063.181.181.338.337.449ZM4.007 6.264 3.152 6l.864-.28a2.721 2.721 0 0 0 1.045-.66c.292-.299.512-.66.644-1.056l.265-.859.28.862a2.706 2.706 0 0 0 1.718 1.715l.88.27-.86.28A2.7 2.7 0 0 0 6.27 7.986l-.265.857-.279-.859a2.7 2.7 0 0 0-1.719-1.72Zm6.527 7.587A.806.806 0 0 0 11 14a.813.813 0 0 0 .759-.55l.248-.761c.053-.159.143-.303.26-.421.118-.119.262-.208.42-.26l.772-.252a.8.8 0 0 0-.023-1.52l-.764-.25a1.075 1.075 0 0 1-.68-.678l-.252-.774a.8.8 0 0 0-1.518.011l-.247.762a1.073 1.073 0 0 1-.664.679l-.776.253a.8.8 0 0 0-.388 1.222c.099.14.239.244.4.3l.763.247a1.055 1.055 0 0 1 .68.683l.253.774a.8.8 0 0 0 .292.387Zm-.914-2.793L9.442 11l.184-.064a2.09 2.09 0 0 0 1.3-1.317l.058-.178.06.181a2.076 2.076 0 0 0 1.316 1.316l.195.064-.18.059a2.077 2.077 0 0 0-1.317 1.32l-.059.181-.058-.18a2.074 2.074 0 0 0-1.32-1.322Z"/></svg>
      </button>
      <button class="sidebar-btn" on:click={handleRefresh} title="Refresh conversations" aria-label="Refresh conversations">
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 8a5 5 0 0 1 9-3h-2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-1 0v1.531a6 6 0 1 0 1.476 4.513.5.5 0 0 0-.996-.089A5 5 0 0 1 3 8Z"/></svg>
      </button>
      <button class="sidebar-btn" on:click={handleCleanSweep} title="Close empty & duplicate Claude tabs" aria-label="Close empty and duplicate Claude tabs">
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.5 12a.5.5 0 0 1 0 1h-11a.5.5 0 0 1 0-1h11ZM13.5 9a.5.5 0 0 1 0 1h-11a.5.5 0 0 1 0-1h11ZM13.5 6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1 0-1h6ZM5.5.999a.5.5 0 0 1 .354.855L3.707 4l2.147 2.146a.502.502 0 0 1-.708.708L3 4.707.854 6.854a.5.5 0 0 1-.708-.708L2.293 4 .146 1.854a.5.5 0 0 1 .708-.708L3 3.293l2.146-2.147A.502.502 0 0 1 5.5.999ZM13.5 3a.5.5 0 0 1 0 1h-6a.5.5 0 0 1 0-1h6Z"/></svg>
      </button>
      <button class="sidebar-btn" class:active={showArchive} on:click={toggleArchive} title={showArchive ? 'Hide archived conversations' : 'Show archived conversations'} aria-label="Toggle archive" aria-pressed={showArchive}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6.5 8a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3ZM1 3.5A1.5 1.5 0 0 1 2.5 2h11A1.5 1.5 0 0 1 15 3.5v1a1.5 1.5 0 0 1-1 1.415V11.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 11.5V5.915A1.5 1.5 0 0 1 1 4.5v-1ZM2.5 3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-11ZM3 6v5.5A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5V6H3Z"/></svg>
      </button>
      <div class="sidebar-zoom">
        <button class="sidebar-btn" on:click={zoomOut} title="Zoom out (Ctrl+-)" aria-label="Zoom out" disabled={$zoomLevel <= ZOOM_MIN}>
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8.5 6a.5.5 0 0 1 0 1h-4a.5.5 0 0 1 0-1h4Zm-2-5a5.5 5.5 0 0 1 4.227 9.02l3.127 3.127a.5.5 0 1 1-.707.707l-3.127-3.127A5.5 5.5 0 1 1 6.5 1Zm0 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/></svg>
        </button>
        <button class="sidebar-btn zoom-indicator" on:click={zoomReset} title="Reset zoom (Ctrl+0)" aria-label="Reset zoom to 100%">
          <span class="zoom-text">{Math.round($zoomLevel * 100)}</span>
        </button>
        <button class="sidebar-btn" on:click={zoomIn} title="Zoom in (Ctrl+=)" aria-label="Zoom in" disabled={$zoomLevel >= ZOOM_MAX}>
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6.5 4a.5.5 0 0 1 .5.5V6h1.5a.5.5 0 0 1 0 1H7v1.5a.5.5 0 0 1-1 0V7H4.5a.5.5 0 0 1 0-1H6V4.5a.5.5 0 0 1 .5-.5Zm0-3a5.5 5.5 0 0 1 4.227 9.02l3.127 3.127a.5.5 0 1 1-.707.707l-3.127-3.127A5.5 5.5 0 1 1 6.5 1Zm0 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/></svg>
        </button>
      </div>
      {#if vscode.isStandalone}
        <button class="sidebar-btn" on:click={cycleTheme} title="Theme: {$themePreference} ({$resolvedTheme})" aria-label="Toggle theme">
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.002a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 13v-12a6 6 0 1 1 0 12Z"/></svg>
        </button>
      {/if}
      <button class="sidebar-btn" class:active={settingsOpen} on:click={toggleSettings} title="Settings" aria-label="Settings" aria-pressed={settingsOpen}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 8 6Zm0 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm6.565.715-1.286-1.087a.821.821 0 0 1 0-1.256l1.286-1.087a.412.412 0 0 0 .126-.441 6.991 6.991 0 0 0-1.472-2.536.415.415 0 0 0-.446-.112l-1.587.565a.831.831 0 0 1-.279.049.826.826 0 0 1-.813-.676l-.303-1.652a.414.414 0 0 0-.321-.329 7.135 7.135 0 0 0-2.939 0 .414.414 0 0 0-.321.329l-.302 1.652a.827.827 0 0 1-1.092.628l-1.587-.565a.42.42 0 0 0-.446.112A6.994 6.994 0 0 0 1.31 5.845a.41.41 0 0 0 .126.441l1.286 1.087a.821.821 0 0 1 0 1.256L1.436 9.716a.412.412 0 0 0-.126.441 6.98 6.98 0 0 0 1.473 2.536.415.415 0 0 0 .446.112l1.587-.565a.831.831 0 0 1 .279-.048c.392 0 .74.278.813.676l.302 1.652c.03.164.157.294.321.329a7.118 7.118 0 0 0 2.939 0 .414.414 0 0 0 .321-.329l.303-1.652a.827.827 0 0 1 1.092-.628l1.586.565a.415.415 0 0 0 .446-.112 6.977 6.977 0 0 0 1.472-2.536.41.41 0 0 0-.126-.441l.001-.001Zm-1.837 2.011-1.207-.43a1.831 1.831 0 0 0-2.41 1.39l-.23 1.251a6.149 6.149 0 0 1-1.761-.001l-.229-1.251a1.825 1.825 0 0 0-2.411-1.39l-1.207.43a5.928 5.928 0 0 1-.879-1.511l.974-.823c.373-.315.6-.757.64-1.243a1.808 1.808 0 0 0-.64-1.54l-.974-.823a5.911 5.911 0 0 1 .879-1.511l1.207.43a1.831 1.831 0 0 0 2.411-1.39l.229-1.251a6.174 6.174 0 0 1 1.761-.001l.229 1.251a1.825 1.825 0 0 0 2.411 1.39l1.207-.43c.368.46.662.966.879 1.511l-.973.823a1.807 1.807 0 0 0-.64 1.243 1.807 1.807 0 0 0 .641 1.54l.974.823a5.911 5.911 0 0 1-.879 1.511l-.002.002Z"/></svg>
      </button>
      <button class="sidebar-btn" class:active={aboutOpen} on:click={toggleAbout} title="About Claudine" aria-label="About Claudine" aria-pressed={aboutOpen}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8.499 7.5a.5.5 0 1 0-1 0v3a.5.5 0 0 0 1 0v-3Zm.25-2a.749.749 0 1 1-1.499 0 .749.749 0 0 1 1.498 0ZM8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM2 8a6 6 0 1 1 12 0A6 6 0 0 1 2 8Z"/></svg>
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
    {#if vscode.isStandalone}
      <MultiProjectView {showArchive} />
    {:else}
      <KanbanBoard {showArchive} />
    {/if}
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
