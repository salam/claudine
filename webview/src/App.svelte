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
        {#if $settings.enableSummarization}
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.465 9.83a.921.921 0 0 0 1.07 0 .98.98 0 0 0 .341-.46l.347-1.067c.085-.251.226-.48.413-.668.187-.186.415-.327.665-.41l1.086-.354a.923.923 0 0 0-.037-1.75l-1.069-.346a1.7 1.7 0 0 1-1.08-1.078l-.353-1.084a.917.917 0 0 0-.869-.61.92.92 0 0 0-.875.624l-.356 1.09A1.71 1.71 0 0 1 3.7 4.775l-1.084.351a.923.923 0 0 0 .013 1.745l1.067.347a1.712 1.712 0 0 1 1.081 1.083l.352 1.08c.063.181.181.338.337.449ZM10.534 13.851A.806.806 0 0 0 11 14a.813.813 0 0 0 .759-.55l.248-.761c.053-.159.143-.303.26-.421.118-.119.262-.208.42-.26l.772-.252a.8.8 0 0 0-.023-1.52l-.764-.25a1.075 1.075 0 0 1-.68-.678l-.252-.774a.8.8 0 0 0-1.518.011l-.247.762a1.073 1.073 0 0 1-.664.679l-.776.253a.8.8 0 0 0-.388 1.222c.099.14.239.244.4.3l.763.247a1.055 1.055 0 0 1 .68.683l.253.774a.8.8 0 0 0 .292.387Z"/></svg>
        {:else}
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.465 9.83a.921.921 0 0 0 1.07 0 .98.98 0 0 0 .341-.46l.347-1.067c.085-.251.226-.48.413-.668.187-.186.415-.327.665-.41l1.086-.354a.923.923 0 0 0-.037-1.75l-1.069-.346a1.7 1.7 0 0 1-1.08-1.078l-.353-1.084a.917.917 0 0 0-.869-.61.92.92 0 0 0-.875.624l-.356 1.09A1.71 1.71 0 0 1 3.7 4.775l-1.084.351a.923.923 0 0 0 .013 1.745l1.067.347a1.712 1.712 0 0 1 1.081 1.083l.352 1.08c.063.181.181.338.337.449ZM4.007 6.264 3.152 6l.864-.28a2.721 2.721 0 0 0 1.045-.66c.292-.299.512-.66.644-1.056l.265-.859.28.862a2.706 2.706 0 0 0 1.718 1.715l.88.27-.86.28A2.7 2.7 0 0 0 6.27 7.986l-.265.857-.279-.859a2.7 2.7 0 0 0-1.719-1.72Zm6.527 7.587A.806.806 0 0 0 11 14a.813.813 0 0 0 .759-.55l.248-.761c.053-.159.143-.303.26-.421.118-.119.262-.208.42-.26l.772-.252a.8.8 0 0 0-.023-1.52l-.764-.25a1.075 1.075 0 0 1-.68-.678l-.252-.774a.8.8 0 0 0-1.518.011l-.247.762a1.073 1.073 0 0 1-.664.679l-.776.253a.8.8 0 0 0-.388 1.222c.099.14.239.244.4.3l.763.247a1.055 1.055 0 0 1 .68.683l.253.774a.8.8 0 0 0 .292.387Zm-.914-2.793L9.442 11l.184-.064a2.09 2.09 0 0 0 1.3-1.317l.058-.178.06.181a2.076 2.076 0 0 0 1.316 1.316l.195.064-.18.059a2.077 2.077 0 0 0-1.317 1.32l-.059.181-.058-.18a2.074 2.074 0 0 0-1.32-1.322Z"/></svg>
        {/if}
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
      <div class="about-bg-grid"></div>
      <div class="about-logo">
        <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" class="about-logo-svg">
          <defs>
            <linearGradient id="about-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#c4b5fd" />
              <stop offset="50%" stop-color="#a78bfa" />
              <stop offset="100%" stop-color="#60a5fa" />
            </linearGradient>
          </defs>
          <path d="M0 0 C8.683143 6.24568485 16.96561216 14.75792703 19.9140625 25.25390625 C20.68288377 28.12948337 20.68288377 28.12948337 22.953125 28.8828125 C23.71109375 28.96273437 24.4690625 29.04265625 25.25 29.125 C32.86350632 30.37770152 38.18918118 35.16411567 43 41 C48.01605137 48.25194524 47.89952575 56.47768905 47 65 C45.33566819 71.76565651 41.13334184 77.35976243 36 82 C35.34 82 34.68 82 34 82 C34.33 86.62 34.66 91.24 35 96 C40.08115251 93.55132186 40.08115251 93.55132186 44.25 90.375 C47.58304499 87.49646114 48.90489665 86.77502749 53.1875 87.0625 C58.37476808 87.70672523 61.75280644 89.93426181 65 94 C67.8758432 99.84786845 68.07926988 106.26047571 66.27734375 112.50390625 C61.92312408 122.9223023 53.86695691 129.65499154 43.81640625 134.55078125 C30.72574373 139.87819373 17.81352393 141.48509677 4.0625 138.25 C3.27907227 138.07315674 2.49564453 137.89631348 1.68847656 137.71411133 C-2.63697748 136.69728008 -6.66425617 135.46687554 -10.75 133.6875 C-14.66660109 132.00229579 -16.82114875 131.60704958 -21 133 C-22.56416863 133.64178145 -24.12648053 134.2880963 -25.6875 134.9375 C-40.28549376 140.92028433 -58.51816052 141.14602154 -73.17089844 135.10498047 C-78.98891509 132.45358708 -84.67612667 129.54924889 -90 126 C-92.34221495 126.26378906 -94.67543145 126.61020954 -97 127 C-115.26457217 128.4053081 -132.97009073 124.90850782 -147.3125 112.8125 C-159.25891307 101.38382875 -164.86639798 86.39948516 -165.28540039 70.13012695 C-165.45480135 54.47045791 -162.228124 41.78187274 -151.36328125 30.078125 C-140.35336515 20.39667812 -126.97603289 19.44286885 -113 20 C-109.6533047 20.24743737 -106.32811468 20.57056585 -103 21 C-102.75507812 20.45085937 -102.51015625 19.90171875 -102.2578125 19.3359375 C-97.99196031 11.41364058 -91.52934612 4.82105024 -84 0 C-82.89591797 -0.75023437 -82.89591797 -0.75023437 -81.76953125 -1.515625 C-56.99545357 -17.51976001 -24.43320745 -15.62395579 0 0 Z M-94.29296875 18.56640625 C-96.56554167 21.80625277 -96.30316628 24.13462996 -96 28 C-99.86626018 29.00158552 -102.60900364 28.88025061 -106.5 28.0625 C-118.92102174 25.84011131 -131.82256202 25.90448204 -142.875 32.6875 C-150.9063455 38.5984541 -155.10911917 46.73701403 -157.58984375 56.265625 C-160.09196212 72.94641414 -157.18512418 88.34799365 -147.44140625 102.21875 C-138.86217949 112.91706635 -126.26391086 118.13839848 -113 120 C-107.94476347 120.36434137 -102.96685255 120.01364338 -98 119 C-97.67 118.34 -97.34 117.68 -97 117 C-97.74647802 114.93328047 -98.57275101 112.89509114 -99.4375 110.875 C-101.58328737 105.53424193 -102.5590511 101.70232126 -102 96 C-100.68 96 -99.36 96 -98 96 C-97.78085938 96.83402344 -97.56171875 97.66804688 -97.3359375 98.52734375 C-93.66995056 111.53712667 -88.71152512 118.96351148 -77 126 C-73.73618994 127.64164775 -70.48475968 128.9110126 -67 130 C-66.319375 130.22429687 -65.63875 130.44859375 -64.9375 130.6796875 C-54.60213232 133.53757326 -43.42003472 132.70237132 -33.125 130.1875 C-32.44107178 130.02233887 -31.75714355 129.85717773 -31.05249023 129.68701172 C-27.34064302 128.6834015 -26.20699697 128.31049545 -24 125 C-24.50789062 124.59910156 -25.01578125 124.19820312 -25.5390625 123.78515625 C-30.62586583 119.58425687 -35.18976104 115.06729415 -38 109 C-37.505 107.515 -37.505 107.515 -37 106 C-34.13021217 106.3413404 -33.14969169 106.8293907 -31.2109375 109.0390625 C-30.30214844 110.31910156 -30.30214844 110.31910156 -29.375 111.625 C-19.82248385 124.02558115 -5.46282282 129.74837409 9.5 132.6875 C25.65542107 134.12994831 39.71140486 131.01104675 52.4375 120.5625 C56.94039224 116.3825611 60.68264385 111.34712291 61 105 C60.2755473 100.87061963 59.54888474 98.59338891 56.6875 95.5 C54.154435 93.76073586 54.154435 93.76073586 51.5546875 94.19140625 C48.61693878 95.12124415 47.51525466 96.20170583 45.4375 98.4375 C40.50486521 102.94282556 35.58275216 103.92325807 29 104 C20.43794224 103.20205675 14.53991577 98.30934852 9 92 C7.83749389 90.00240247 6.93905292 88.02860559 6.05078125 85.8984375 C4.34889859 82.82366065 1.66296399 80.98843713 -1.03125 78.796875 C-8.11249327 72.3338355 -9.15300908 64.98881739 -9.71875 55.8359375 C-9.68740332 53.10130637 -9.68740332 53.10130637 -11 52 C-12.87321948 51.83946185 -12.87321948 51.83946185 -15 51.875 C-15.721875 51.87242188 -16.44375 51.86984375 -17.1875 51.8671875 C-19.02089415 51.80304724 -19.02089415 51.80304724 -20 53 C-20.13382784 55.16503701 -20.23144455 57.3323457 -20.3125 59.5 C-20.91723139 68.65470282 -23.33456282 75.48268365 -30 82 C-38.56575023 87.66444773 -45.75878817 88.82685678 -56 88 C-63.94845576 86.15462426 -70.45853167 81.78519828 -75.3125 75.2265625 C-78.71139222 69.30349297 -79.16541812 62.67665506 -80 56 C-87.59 55.67 -95.18 55.34 -103 55 C-103.33 53.35 -103.66 51.7 -104 50 C-103.3294458 49.99589111 -102.6588916 49.99178223 -101.96801758 49.98754883 C-98.91529609 49.95455357 -95.8645547 49.8839038 -92.8125 49.8125 C-91.75740234 49.80669922 -90.70230469 49.80089844 -89.61523438 49.79492188 C-83.28472423 49.66473919 -83.28472423 49.66473919 -77.87109375 46.6328125 C-75.94539327 43.99795905 -75.94539327 43.99795905 -74.25 41.0625 C-69.98333255 35.25509152 -63.9013175 31.86591177 -57 30 C-47.50106694 28.99733484 -39.99764356 29.62682588 -32 35 C-31.071875 35.61875 -30.14375 36.2375 -29.1875 36.875 C-27 39 -27 39 -26.0859375 40.83984375 C-24.89721095 43.1310915 -24.08675866 44.45033956 -22 46 C-17.12150643 46.64892076 -12.75043295 46.26328915 -8 45 C-5.28713581 42.38961127 -5.28713581 42.38961127 -4 39 C1.31115892 33.29050416 5.71903568 30.54833751 13 28 C11.57152773 22.28611091 8.70890117 18.43511959 5 14 C4.51917969 13.41089844 4.03835937 12.82179688 3.54296875 12.21484375 C-5.35965153 2.32053918 -19.60419861 -4.16744386 -32.73144531 -5.21875 C-57.6241328 -6.51735776 -77.22631019 -0.53545861 -94.29296875 18.56640625 Z M0 43.375 C-3.76426515 49.52019611 -5.08519449 56.15901518 -3.5 63.23046875 C-1.55586313 69.82506939 1.49597323 74.74730382 7.5 78.375 C13.64214137 81.13198391 21.05787948 81.3909596 27.40234375 79.15234375 C32.75583812 76.12109454 37.66617903 70.99332987 39.640625 65.08203125 C40.97985994 57.32320272 40.58849665 50.54009749 36 44 C31.45400681 38.75462324 26.86972489 35.66319211 19.9921875 34.7265625 C12.1761661 34.3516242 4.86783315 37.03249975 0 43.375 Z M-67.52734375 42.21484375 C-72.2359754 47.92265452 -73.70205918 53.97892586 -73.375 61.296875 C-72.31115718 68.96540865 -68.94139044 73.6755305 -63.09765625 78.58984375 C-56.80305674 82.82140878 -50.35855778 82.69571819 -43 82 C-36.35837268 80.27688487 -31.7211903 75.61262405 -28 70 C-25.0114419 63.63973533 -25.57935334 56.35459085 -27.71875 49.796875 C-30.3860974 43.77234898 -34.65758082 39.84712639 -40.375 36.6875 C-50.34073722 34.07742597 -59.76466027 34.74578423 -67.52734375 42.21484375 Z M15 87 C16.14798774 91.59195094 16.73528573 91.87820524 20.5625 94.25 C21.38878906 94.77078125 22.21507812 95.2915625 23.06640625 95.828125 C24.02353516 96.40820312 24.02353516 96.40820312 25 97 C25.66 96.67 26.32 96.34 27 96 C27 93.03 27 90.06 27 87 C23.04 87 19.08 87 15 87 Z" fill="url(#about-grad)" transform="translate(178,64)"/>
          <path d="M0 0 C1.051875 -0.02126953 1.051875 -0.02126953 2.125 -0.04296875 C4 0.1875 4 0.1875 6 2.1875 C4.02 2.8475 2.04 3.5075 0 4.1875 C0 6.1675 0 8.1475 0 10.1875 C2.31 10.1875 4.62 10.1875 7 10.1875 C7 7.5475 7 4.9075 7 2.1875 C10.15617637 5.20645131 11.17090274 7.05543735 11.3125 11.4375 C11.2671928 17.06465444 8.91655989 20.27094011 5 24.1875 C0.76026507 24.82887444 -2.99291244 24.6160479 -6.9375 22.9375 C-9.74388138 20.55632792 -10.80092749 18.45737309 -11.37109375 14.8203125 C-11.489301 10.3562503 -11.54314445 7.18014353 -8.625 3.625 C-5.49884633 0.72214302 -4.13070933 0.03796608 0 0 Z" fill="url(#about-grad)" transform="translate(197,111.8125)"/>
          <path d="M0 0 C-1.98 0.99 -1.98 0.99 -4 2 C-4.04254356 3.99954746 -4.04080783 6.00041636 -4 8 C-2.93354885 9.29633621 -2.93354885 9.29633621 -0.4375 9.0625 C0.366875 9.041875 1.17125 9.02125 2 9 C2.33 7.02 2.66 5.04 3 3 C5.52377347 4.86539778 6.02967981 6.10811932 6.875 9.1875 C7.0512753 14.56389672 5.91550496 18.95239125 2.1875 22.9375 C-1.9343583 24.93954546 -4.7384802 25.42891673 -9.125 23.9375 C-12.97620488 21.3421228 -15.46504192 18.73483673 -16.3828125 14.04296875 C-16.67406952 8.96538801 -15.36535765 5.92625059 -12 2 C-8.43030146 -0.80476313 -4.34004512 -0.14466817 0 0 Z" fill="url(#about-grad)" transform="translate(136,113)"/>
        </svg>
      </div>
      <div class="about-title">Claudine</div>
      <div class="about-subtitle">A kanban board for Claude Code</div>
      <div class="about-nav-links">
        <button class="about-link" on:click={() => vscode.openLink('https://claudine.pro')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          claudine.pro
        </button>
        <button class="about-link" on:click={() => vscode.openLink('https://github.com/salam/claudine')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub
        </button>
        <button class="about-link" on:click={() => vscode.openLink('https://marketplace.visualstudio.com/items?itemName=claudine.claudine')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Marketplace
        </button>
        <button class="about-link" on:click={() => vscode.openLink('https://github.com/sponsors/salam')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          Sponsor
        </button>
      </div>
      <div class="about-credit">
        Built by <button class="about-link-inline" on:click={() => vscode.openLink('https://matthias.sala.ch')}>Matthias Sala</button> &amp; <button class="about-link-inline" on:click={() => vscode.openLink('https://github.com/salam/claudine#community')}>community</button>
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
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
  }
  .about-popup {
    background: #0a0a0b;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 28px 32px 20px;
    text-align: center;
    min-width: 260px;
    max-width: 300px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 60px -12px rgba(167,139,250,0.15);
    position: relative;
    overflow: hidden;
  }
  .about-bg-grid {
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(167,139,250,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(167,139,250,0.04) 1px, transparent 1px);
    background-size: 48px 48px;
  }
  .about-logo {
    position: relative;
    margin-bottom: 12px;
    filter: drop-shadow(0 0 18px rgba(167,139,250,0.35));
  }
  .about-logo-svg {
    width: 48px; height: 48px;
  }
  .about-title {
    position: relative;
    font-size: 16px; font-weight: 700; margin-bottom: 2px;
    background: linear-gradient(135deg, #c4b5fd, #a78bfa, #60a5fa);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .about-subtitle {
    position: relative;
    font-size: 11px; color: #a1a1aa; margin-bottom: 16px;
  }
  .about-nav-links {
    position: relative;
    display: flex; flex-direction: column; gap: 2px;
    margin-bottom: 14px;
  }
  .about-link {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; border-radius: 6px;
    background: transparent; border: none;
    color: #fafafa; font-size: 12px;
    cursor: pointer; transition: all 0.15s ease;
    text-align: left;
  }
  .about-link:hover {
    background: #18181b;
    color: #c4b5fd;
  }
  .about-link svg { color: #71717a; flex-shrink: 0; transition: color 0.15s ease; }
  .about-link:hover svg { color: #a78bfa; }
  .about-credit {
    position: relative;
    font-size: 11px; color: #71717a; margin-bottom: 14px;
    padding-top: 12px;
    border-top: 1px solid #27272a;
  }
  .about-link-inline {
    background: none; border: none; padding: 0;
    color: #a1a1aa; cursor: pointer; font-size: 11px;
    transition: color 0.15s ease;
  }
  .about-link-inline:hover { color: #c4b5fd; }
  .about-close {
    position: relative;
    padding: 5px 20px;
    border-radius: 6px;
    border: 1px solid #3f3f46;
    background: transparent;
    color: #a1a1aa;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s ease;
  }
  .about-close:hover { background: #18181b; color: #fafafa; border-color: #a78bfa; }
</style>
