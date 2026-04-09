<script lang="ts">
  import { vscode, type Conversation, type ConversationStatus } from '../lib/vscode';
  import { getCategoryDetails, toggleCardCollapsed, settings, columns, archiveColumn, updateConversationStatus, acknowledgeReview } from '../stores/conversations';
  import AgentAvatar from './AgentAvatar.svelte';
  import PromptInput from './PromptInput.svelte';

  import { afterUpdate, createEventDispatcher } from 'svelte';
  import { activityTick } from '../stores/activityTick';

  const dispatch = createEventDispatcher<{ sendDraft: string; deleteDraft: string; updateDraft: { id: string; title: string } }>();

  export let conversation: Conversation;
  export let compact: boolean = false;
  export let narrow: boolean = false;
  export let focused: boolean = false;
  export let searchQuery: string = '';
  export let isFirst: boolean = false;
  /** Optional project name shown above the title in compact mode (Smart Board). */
  export let projectLabel: string | undefined = undefined;

  $: categoryDetails = getCategoryDetails(conversation.category);
  $: needsInteraction = conversation.status === 'needs-input' && !conversation.isInterrupted;
  $: hasMetaContent = ($settings.showTaskGitBranch && conversation.gitBranch)
    || conversation.worktreeName
    || conversation.sidechainSteps?.length
    || conversation.agents.some(a => a.isActive);

  // Status dot color: green (active/ok), red (error/interrupted), gray (idle)
  $: dotColor = conversation.hasError || conversation.isInterrupted
    ? 'red'
    : (conversation.agents.some(a => a.isActive) || conversation.lastActivity?.status === 'running')
      ? 'green'
      : conversation.lastActivity?.status === 'completed'
        ? 'green'
        : conversation.lastActivity?.status === 'failed'
          ? 'red'
          : 'gray';
  $: hasLatestContent = conversation.lastMessage || conversation.lastActivity || conversation.lastStatusText;

  // When summarization is ON, show summarized text (tooltip = original).
  // When OFF, show original text (tooltip = summary).
  $: hasSummary = !!conversation.originalTitle;
  $: displayTitle = (hasSummary && !$settings.enableSummarization) ? conversation.originalTitle! : conversation.title;
  $: titleTooltip = hasSummary
    ? ($settings.enableSummarization ? conversation.originalTitle! : conversation.title)
    : conversation.title;
  $: displayDescription = (conversation.originalDescription && !$settings.enableSummarization)
    ? conversation.originalDescription
    : conversation.description;
  $: descriptionTooltip = conversation.originalDescription
    ? ($settings.enableSummarization ? conversation.originalDescription : conversation.description)
    : conversation.description;

  let cardEl: HTMLDivElement;
  let prevFocused = false;
  let descriptionExpanded = false;
  let latestExpanded = false;
  let openMenuVisible = false;
  let openMenuEl: HTMLDivElement;
  let contextMenuVisible = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuEl: HTMLDivElement;

  /**
   * Svelte action: moves element to document.body so it escapes
   * overflow/transform containers that break position:fixed.
   */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  $: contextMoveTargets = conversation.isDraft
    ? []
    : [
        ...$columns.filter(c => c.id !== conversation.status),
        ...($archiveColumn.id !== conversation.status ? [$archiveColumn] : [])
      ];

  // Activity timer — counts while agents are actively working, pauses when awaiting user input.
  // Uses a single shared 1s tick (activityTick store) instead of per-card setInterval.
  $: isActive = conversation.agents.some(a => a.isActive)
    && !conversation.hasQuestion
    && !conversation.isInterrupted
    && conversation.status !== 'needs-input';
  let elapsedSeconds = 0;
  let timerStartTime = 0;
  let frozenElapsed: number | undefined;
  let wasActive = false;

  $: handleActiveChange(isActive);

  function handleActiveChange(active: boolean) {
    if (active === wasActive) return;
    if (active) {
      timerStartTime = Date.now();
      frozenElapsed = undefined;
      elapsedSeconds = 0;
    } else {
      frozenElapsed = elapsedSeconds;
    }
    wasActive = active;
  }

  // Recalculate elapsed time on each shared tick (only when active)
  $: if (isActive && $activityTick >= 0) {
    elapsedSeconds = Math.floor((Date.now() - timerStartTime) / 1000);
  }

  function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}\u2033`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${mins}\u2032`;
    return `${mins}\u2032\u2009${secs}\u2033`;
  }

  $: showTimer = isActive || frozenElapsed !== undefined;
  $: timerDisplay = isActive ? formatElapsed(elapsedSeconds) : (frozenElapsed !== undefined ? formatElapsed(frozenElapsed) : '');

  afterUpdate(() => {
    if (focused && !prevFocused && cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    prevFocused = focused;
  });

  function cleanTitle(text: string): string {
    return text.replace(/<[a-zA-Z_:-]+[^>]*>[\s\S]*?<\/[a-zA-Z_:-]+>/g, '').trim() || text;
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * SECURITY: Returns an HTML string safe for use with {@html}.
   * All text is escaped FIRST via escapeHtml(), then <mark> tags are injected
   * only around the already-escaped content. The $1 capture group can never
   * contain HTML because it matches against the escaped string.
   * Any changes to this function MUST preserve the escape-first-then-inject order.
   */
  function highlight(text: string): string {
    if (!searchQuery.trim() || !text) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const q = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(
      new RegExp(`(${q})`, 'gi'),
      '<mark class="search-hl">$1</mark>'
    );
  }

  function handleToggleCollapse() {
    toggleCardCollapsed(conversation.id);
  }

  function handleOpenConversation(e?: MouseEvent) {
    e?.stopPropagation();
    if (vscode.isStandalone) {
      openMenuVisible = !openMenuVisible;
    } else {
      vscode.postMessage({ type: 'openConversation', conversationId: conversation.id });
    }
  }

  function handleOpenAs(target: string) {
    openMenuVisible = false;
    vscode.postMessage({ type: 'openConversationAs', conversationId: conversation.id, target });
  }

  $: isCodex = conversation.provider === 'codex';

  function handleClickOutsideMenu(e: MouseEvent) {
    if (openMenuVisible && openMenuEl && !openMenuEl.contains(e.target as Node)) {
      openMenuVisible = false;
    }
    if (contextMenuVisible && contextMenuEl && !contextMenuEl.contains(e.target as Node)) {
      contextMenuVisible = false;
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    openMenuVisible = false;
    contextMenuVisible = true;
    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    requestAnimationFrame(() => {
      if (!contextMenuEl) return;
      const rect = contextMenuEl.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        contextMenuX = window.innerWidth - rect.width - 4;
      }
      if (rect.bottom > window.innerHeight) {
        contextMenuY = window.innerHeight - rect.height - 4;
      }
    });
  }

  function handleContextMenuClose() {
    contextMenuVisible = false;
  }

  function handleContextMenuMove(targetStatus: ConversationStatus) {
    contextMenuVisible = false;
    if (conversation.status === 'in-review' && targetStatus !== 'in-review') {
      acknowledgeReview(conversation.id);
    }
    vscode.postMessage({ type: 'moveConversation', conversationId: conversation.id, newStatus: targetStatus });
    updateConversationStatus(conversation.id, targetStatus);
  }

  function handleSendPrompt(event: CustomEvent<string>) {
    vscode.postMessage({ type: 'sendPrompt', conversationId: conversation.id, prompt: event.detail });
  }

  function handleGitBranchClick() {
    vscode.postMessage({ type: 'openGitBranch', conversationId: conversation.id, branch: conversation.gitBranch });
  }

  function toggleDescription() {
    if (window.getSelection()?.toString()) return;
    descriptionExpanded = !descriptionExpanded;
  }
  function toggleLatest() {
    if (window.getSelection()?.toString()) return;
    latestExpanded = !latestExpanded;
  }
</script>

<svelte:window on:click={handleClickOutsideMenu} on:keydown={(e) => e.key === 'Escape' && handleContextMenuClose()} />

{#if conversation.isDraft}
  <!-- Draft view: just the prompt text + send button -->
  <div class="task-card draft" role="article" on:contextmenu={handleContextMenu}>
    <div class="drag-handle" title="Drag to move">
      <svg viewBox="0 0 6 10" fill="currentColor"><circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/><circle cx="1.5" cy="5" r="1"/><circle cx="4.5" cy="5" r="1"/><circle cx="1.5" cy="8.5" r="1"/><circle cx="4.5" cy="8.5" r="1"/></svg>
    </div>
    <textarea
      class="draft-prompt-input"
      rows="1"
      on:input={(e) => {
        const ta = e.currentTarget;
        dispatch('updateDraft', { id: conversation.id, title: ta.value });
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      }}
      on:keydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dispatch('sendDraft', conversation.id); } }}
      placeholder="Describe your idea..."
    >{conversation.title}</textarea>
    <button class="draft-delete" on:click={() => dispatch('deleteDraft', conversation.id)} title="Delete idea">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
    </button>
    <button class="draft-send" on:click={() => dispatch('sendDraft', conversation.id)} title="Start conversation">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 15l-.7-.7L11.6 10H2V9h9.6L7.3 4.7 8 4l6 6-6 5z" transform="rotate(-90 8 9.5)"/></svg>
    </button>
  </div>

{:else if narrow}
  <!-- Narrow column view: icon + badges only -->
  <div
    bind:this={cardEl}
    class="task-card narrow-card"
    class:has-error={conversation.hasError}
    class:focused
    style="--category-color: {categoryDetails.color}"
    title={cleanTitle(displayTitle)}
    role="article"
    on:contextmenu={handleContextMenu}
  >
    <div class="drag-handle narrow-drag" title="Drag to move">
      <svg viewBox="0 0 6 10" fill="currentColor"><circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/><circle cx="1.5" cy="5" r="1"/><circle cx="4.5" cy="5" r="1"/><circle cx="1.5" cy="8.5" r="1"/><circle cx="4.5" cy="8.5" r="1"/></svg>
    </div>
    {#if conversation.icon}
      <img class="narrow-icon" src={conversation.icon} alt="" />
    {:else}
      <span class="narrow-cat" style="background:{categoryDetails.color}">{categoryDetails.icon}</span>
    {/if}
    {#if conversation.hasError}
      <span class="narrow-status-badge narrow-badge-error" title={conversation.errorMessage || 'Error'}>!</span>
    {:else if conversation.isRateLimited}
      <span class="narrow-status-badge narrow-badge-ratelimit" title="Rate limited">&#9208;</span>
    {:else if conversation.isInterrupted}
      <span class="narrow-status-badge narrow-badge-interrupted" title="Interrupted">ꝇ</span>
    {:else if conversation.hasQuestion}
      <span class="narrow-status-badge narrow-badge-question" title="Question">?</span>
    {/if}
    {#if focused}
      <span class="narrow-focused-eyes" title="Currently viewed">👀</span>
    {/if}
    {#if conversation.agents.some(a => a.isActive)}
      <span class="narrow-dot narrow-dot-active"></span>
    {/if}
    {#if conversation.sidechainSteps?.length}
      {@const lastStep = conversation.sidechainSteps[conversation.sidechainSteps.length - 1]}
      <span class="narrow-dot narrow-dot-sc narrow-sc-{lastStep.status}" title={lastStep.toolName || 'Subagent'}></span>
    {/if}
  </div>

{:else if compact}
  <!-- Compact view: single row -->
  <div
    bind:this={cardEl}
    class="task-card compact"
    class:has-error={conversation.hasError}
    class:focused
    style="--category-color: {categoryDetails.color}"
    role="article"
    on:contextmenu={handleContextMenu}
  >
    <div class="drag-handle" title="Drag to move">
      <svg viewBox="0 0 6 10" fill="currentColor"><circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/><circle cx="1.5" cy="5" r="1"/><circle cx="4.5" cy="5" r="1"/><circle cx="1.5" cy="8.5" r="1"/><circle cx="4.5" cy="8.5" r="1"/></svg>
    </div>
    {#if conversation.hasError}
      <span class="error-badge-inline" title={conversation.errorMessage || 'Error'}>!</span>
    {:else if conversation.isRateLimited}
      <span class="ratelimit-badge-inline" title="Rate limited">&#9208;</span>
    {:else if conversation.isInterrupted}
      <span class="interrupted-badge-inline" title="Tool interrupted">ꝇ</span>
    {:else if conversation.hasQuestion}
      <span class="question-badge-inline" title="Waiting for input">?</span>
    {/if}
    {#if focused}
      <span class="eye-icon" title="Currently viewed">👀</span>
    {/if}
    <div class="compact-icon-col">
      {#if conversation.icon}
        <div class="compact-thumb-wrap thumb-hover-trigger">
          <img class="compact-thumb" src={conversation.icon} alt="" />
          <div class="thumb-hover-popup"><img src={conversation.icon} alt="Task icon" /></div>
        </div>
      {:else}
        <span class="compact-badge" style="background:{categoryDetails.color}">{categoryDetails.icon}</span>
      {/if}
    </div>
    {#if projectLabel}
      <span class="project-label" title={projectLabel}>{projectLabel}</span>
    {/if}
    <div class="title-wrap compact-title-wrap">
      <button class="compact-title-btn" on:click={handleOpenConversation} title={titleTooltip}>{@html highlight(cleanTitle(displayTitle))}</button>
      {#if showTimer}
        <span class="compact-timer" class:paused={!isActive}>{timerDisplay}</span>
      {/if}
      {#if openMenuVisible}
        <div class="open-menu" bind:this={openMenuEl}>
          {#if isCodex}
            <button class="open-menu-item" on:click={() => handleOpenAs('codex-vscode')}>
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.94 1L6 5.63 2.36 3 1 3.87l3.5 3.12L1 10.12 2.36 13 6 10.37 10.94 15 15 13.13V2.87L10.94 1zm.56 10.76l-4-3.07v-.38l4-3.07v6.52z"/></svg>
              Open in Codex (VSCode)
            </button>
            <button class="open-menu-item" on:click={() => handleOpenAs('codex-cursor')}>
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.7 2.3a1 1 0 010 1.4L5.4 12H3v-2.4l8.3-8.3a1 1 0 011.4 0zM4 10.4V11h.6l7.3-7.3-.6-.6L4 10.4z"/></svg>
              Open in Codex (Cursor)
            </button>
          {:else}
            <button class="open-menu-item" on:click={() => handleOpenAs('terminal')}>
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 9l3-3-3-3-.7.7L7.6 6 5.3 8.3 6 9zm4 1H7v1h3v-1zM1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13.5v-11zM2.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h11a.5.5 0 00-.5-.5v-11a.5.5 0 00-.5-.5h-11z"/></svg>
              Resume in Terminal
            </button>
          {/if}
          <button class="open-menu-item" on:click={() => handleOpenAs('vscode')}>
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.94 1L6 5.63 2.36 3 1 3.87l3.5 3.12L1 10.12 2.36 13 6 10.37 10.94 15 15 13.13V2.87L10.94 1zm.56 10.76l-4-3.07v-.38l4-3.07v6.52z"/></svg>
            Open in VSCode
          </button>
          <button class="open-menu-item" on:click={() => handleOpenAs('cursor')}>
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.7 2.3a1 1 0 010 1.4L5.4 12H3v-2.4l8.3-8.3a1 1 0 011.4 0zM4 10.4V11h.6l7.3-7.3-.6-.6L4 10.4z"/></svg>
            Open in Cursor
          </button>
        </div>
      {/if}
    </div>
    {#if conversation.sidechainSteps?.length}
      <div class="sidechain-dots compact" title="Subagent activity">
        {#each conversation.sidechainSteps as step}
          <span class="sc-dot sc-dot-{step.status}" title={step.toolName || step.status}></span>
        {/each}
      </div>
    {/if}
    {#if conversation.agents.some(a => a.isActive)}
      <div class="compact-agents">
        {#each conversation.agents.filter(a => a.isActive) as agent (agent.id)}
          <AgentAvatar {agent} size="small" />
        {/each}
      </div>
    {/if}
    {#if isFirst}
      <span class="first-badge" title="This is were it all started for this project">Genesis</span>
    {/if}
    <button class="collapse-toggle" on:click={handleToggleCollapse} title="Expand card">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.7 13.7L5 13l4.6-4.6L5 3.7l.7-.7 5.3 5.3-5.3 5.4z"/></svg>
    </button>
  </div>

{:else}
  <!-- Full view -->
  <div
    bind:this={cardEl}
    class="task-card"
    class:has-error={conversation.hasError}
    class:has-question={conversation.hasQuestion}
    class:needs-input={needsInteraction}
    class:focused
    style="--category-color: {categoryDetails.color}"
    role="article"
    on:contextmenu={handleContextMenu}
  >
    {#if conversation.hasError}
      <div class="error-badge" title={conversation.errorMessage || 'Error occurred'}>!</div>
    {:else if conversation.isRateLimited}
      <div class="ratelimit-badge" title={conversation.rateLimitResetDisplay ? `Rate limited \u00b7 resets ${conversation.rateLimitResetDisplay}` : 'Rate limited'}>&#9208;</div>
    {:else if conversation.isInterrupted}
      <div class="interrupted-badge" title="Tool interrupted">ꝇ</div>
    {:else if conversation.hasQuestion}
      <div class="question-badge" title="Waiting for input">?</div>
    {/if}

    {#if focused}
      <div class="focused-indicator" class:has-badge={conversation.hasError || conversation.isInterrupted || conversation.hasQuestion} title="Currently viewing this conversation">👀</div>
    {/if}

    {#if isFirst || showTimer}
      <div class="first-badge-banner">
        {#if isFirst}
          <span class="first-badge" title="This is were it all started for this project">Genesis</span>
        {/if}
        {#if showTimer}
          <span class="activity-timer" class:paused={!isActive}>{timerDisplay}</span>
        {/if}
      </div>
    {/if}

    <!-- Header (click title to open conversation) -->
    <div class="card-header">
      <div class="drag-handle" title="Drag to move">
        <svg viewBox="0 0 6 10" fill="currentColor"><circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/><circle cx="1.5" cy="5" r="1"/><circle cx="4.5" cy="5" r="1"/><circle cx="1.5" cy="8.5" r="1"/><circle cx="4.5" cy="8.5" r="1"/></svg>
      </div>
      {#if $settings.showTaskIcon}
        {#if conversation.icon}
          <div class="icon-badge thumb-hover-trigger">
            <img src={conversation.icon} alt="" />
            <div class="thumb-hover-popup"><img src={conversation.icon} alt="Task icon" /></div>
          </div>
        {:else}
          <div class="category-badge" title={categoryDetails.label}>
            <span class="category-icon">{categoryDetails.icon}</span>
          </div>
        {/if}
      {/if}
      <div class="title-wrap">
        <button class="title-btn" on:click={handleOpenConversation} title={titleTooltip}>
          {@html highlight(cleanTitle(displayTitle))}
        </button>
        {#if openMenuVisible}
          <div class="open-menu" bind:this={openMenuEl}>
            {#if isCodex}
              <button class="open-menu-item" on:click={() => handleOpenAs('codex-vscode')}>
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.94 1L6 5.63 2.36 3 1 3.87l3.5 3.12L1 10.12 2.36 13 6 10.37 10.94 15 15 13.13V2.87L10.94 1zm.56 10.76l-4-3.07v-.38l4-3.07v6.52z"/></svg>
                Open in Codex (VSCode)
              </button>
              <button class="open-menu-item" on:click={() => handleOpenAs('codex-cursor')}>
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.7 2.3a1 1 0 010 1.4L5.4 12H3v-2.4l8.3-8.3a1 1 0 011.4 0zM4 10.4V11h.6l7.3-7.3-.6-.6L4 10.4z"/></svg>
                Open in Codex (Cursor)
              </button>
            {:else}
              <button class="open-menu-item" on:click={() => handleOpenAs('terminal')}>
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 9l3-3-3-3-.7.7L7.6 6 5.3 8.3 6 9zm4 1H7v1h3v-1zM1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13.5v-11zM2.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h11a.5.5 0 00-.5-.5v-11a.5.5 0 00-.5-.5h-11z"/></svg>
                Resume in Terminal
              </button>
            {/if}
            <button class="open-menu-item" on:click={() => handleOpenAs('vscode')}>
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.94 1L6 5.63 2.36 3 1 3.87l3.5 3.12L1 10.12 2.36 13 6 10.37 10.94 15 15 13.13V2.87L10.94 1zm.56 10.76l-4-3.07v-.38l4-3.07v6.52z"/></svg>
              Open in VSCode
            </button>
            <button class="open-menu-item" on:click={() => handleOpenAs('cursor')}>
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.7 2.3a1 1 0 010 1.4L5.4 12H3v-2.4l8.3-8.3a1 1 0 011.4 0zM4 10.4V11h.6l7.3-7.3-.6-.6L4 10.4z"/></svg>
              Open in Cursor
            </button>
          </div>
        {/if}
      </div>
      <button class="collapse-toggle" on:click={handleToggleCollapse} title="Collapse card">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.3 2.3L11 3 6.4 7.6 11 12.3l-.7.7L5 7.7l5.3-5.4z"/></svg>
      </button>
    </div>

    <!-- Description (click to expand) -->
    {#if $settings.showTaskDescription && conversation.description}
      <!-- svelte-ignore a11y-no-noninteractive-element-to-interactive-role -->
      <p
        class="description"
        class:expanded={descriptionExpanded}
        on:click={toggleDescription}
        on:keydown={(e) => e.key === 'Enter' && toggleDescription()}
        role="button"
        tabindex="0"
        title={descriptionTooltip}
      >{@html highlight(displayDescription)}</p>
    {/if}

    <!-- Latest activity / message -->
    {#if $settings.showTaskLatest && hasLatestContent}
      <div
        class="last-message"
        class:expanded={latestExpanded}
        on:click={toggleLatest}
        on:keydown={(e) => e.key === 'Enter' && toggleLatest()}
        role="button"
        tabindex="0"
      >
        <span class="status-dot status-dot-{dotColor}"></span>
        <div class="latest-content">
          {#if conversation.lastActivity}
            <div class="latest-activity">
              <span class="tool-name">{conversation.lastActivity.toolName}</span>
              {#if conversation.lastActivity.summary}
                <span class="tool-summary">{conversation.lastActivity.summary}</span>
              {/if}
            </div>
            {#if conversation.lastActivity.outputHint}
              <div class="latest-output">{conversation.lastActivity.outputHint}</div>
            {/if}
          {/if}
          {#if conversation.lastMessage}
            <div class="message-text">{@html highlight(conversation.lastMessage)}</div>
          {/if}
          {#if conversation.lastStatusText}
            <div class="latest-status">{conversation.lastStatusText}</div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Git branch + Agents on same line (#10) -->
    {#if hasMetaContent}
    <div class="meta-row">
      {#if $settings.showTaskGitBranch && conversation.gitBranch}
        <button class="git-branch" on:click={handleGitBranchClick} title="Open in source control">
          <svg class="git-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
          </svg>
          <span class="branch-name">{@html highlight(conversation.gitBranch || '')}</span>
        </button>
      {/if}
      {#if conversation.worktreeName}
        <span class="worktree-badge" title={`Claude worktree: ${conversation.worktreeName}`}>
          <span class="worktree-label">wt</span>
          <span class="worktree-name">{@html highlight(conversation.worktreeName)}</span>
        </span>
      {/if}
      {#if conversation.sidechainSteps?.length}
        <div class="sidechain-dots" title="Subagent activity">
          {#each conversation.sidechainSteps as step}
            <span class="sc-dot sc-dot-{step.status}" title={step.toolName || step.status}></span>
          {/each}
        </div>
      {/if}
      {#if conversation.agents.some(a => a.isActive)}
        <div class="agents-row">
          {#each conversation.agents.filter(a => a.isActive) as agent (agent.id)}
            <AgentAvatar {agent} />
          {/each}
        </div>
      {/if}
    </div>
    {/if}

    <div class="prompt-wrap">
      <PromptInput on:submit={handleSendPrompt} />
    </div>
  </div>
{/if}

{#if contextMenuVisible}
  <div
    class="context-menu"
    use:portal
    bind:this={contextMenuEl}
    style="left: {contextMenuX}px; top: {contextMenuY}px;"
  >
    {#if conversation.isDraft}
      <button class="context-menu-item context-menu-default" on:click={() => { contextMenuVisible = false; dispatch('sendDraft', conversation.id); }}>
        Send idea
      </button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item context-menu-danger" on:click={() => { contextMenuVisible = false; dispatch('deleteDraft', conversation.id); }}>
        Delete idea
      </button>
    {:else}
      <button class="context-menu-item context-menu-default" on:click={() => { contextMenuVisible = false; handleOpenConversation(); }}>
        Open conversation
      </button>
      {#if contextMoveTargets.length > 0}
        <div class="context-menu-separator"></div>
        {#each contextMoveTargets as target (target.id)}
          {#if target.id === 'archived'}
            <div class="context-menu-separator"></div>
            <button class="context-menu-item" on:click={() => handleContextMenuMove(target.id)}>
              <span class="context-menu-dot" style="background:{target.color}"></span>
              Archive immediately
            </button>
          {:else}
            <button class="context-menu-item" on:click={() => handleContextMenuMove(target.id)}>
              <span class="context-menu-dot" style="background:{target.color}"></span>
              Move to {target.title}
            </button>
          {/if}
        {/each}
      {/if}
    {/if}
  </div>
{/if}

<style>
  /* Search highlight injected via {@html} — must be :global to style dynamic content */
  :global(.search-hl) { background: #e2b714; color: #1e1e1e; border-radius: 2px; padding: 0 2px; }

  /* ---- Draft card ---- */
  .task-card.draft {
    display: flex; align-items: flex-start; gap: 6px;
    padding: 6px 8px; margin-bottom: 4px; border-radius: 6px;
    border-left: 2px dashed var(--vscode-disabledForeground, #6b6b6b);
    background: var(--vscode-editor-background, #1e1e1e);
    border-top: 1px dashed var(--vscode-panel-border, #404040);
    border-right: 1px dashed var(--vscode-panel-border, #404040);
    border-bottom: 1px dashed var(--vscode-panel-border, #404040);
    opacity: 0.85;
  }
  .task-card.draft:hover { opacity: 1; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
  .draft-prompt-input {
    flex: 1; min-width: 0;
    font-size: 10px;
    color: var(--vscode-input-foreground, #cccccc);
    resize: none; overflow: hidden;
    background: transparent;
    border: none; border-bottom: 1px dashed var(--vscode-panel-border, #404040);
    outline: none; padding: 2px 0;
    font-family: inherit;
  }
  .draft-prompt-input:focus { border-bottom-color: var(--vscode-focusBorder, #007acc); }
  .draft-prompt-input::placeholder { color: var(--vscode-input-placeholderForeground, #888); font-style: italic; }
  .draft-delete {
    flex-shrink: 0; width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    background: none; border: 1px solid var(--vscode-panel-border, #404040);
    color: var(--vscode-disabledForeground, #6b6b6b);
    border-radius: 4px; cursor: pointer;
    transition: all 0.15s; opacity: 0;
  }
  .task-card.draft:hover .draft-delete { opacity: 1; }
  .draft-delete:hover { color: #ef4444; border-color: #ef4444; }
  .draft-delete svg { width: 11px; height: 11px; }
  .draft-send {
    flex-shrink: 0; width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border: none; border-radius: 4px; cursor: pointer;
    transition: background-color 0.15s;
  }
  .draft-send:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .draft-send svg { width: 11px; height: 11px; }

  /* ---- Full card ---- */
  .task-card {
    position: relative;
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, #404040);
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 6px;
    transition: all 0.15s ease;
    user-select: text;
  }
  .task-card:hover { border-color: var(--vscode-focusBorder, #007acc); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .task-card.has-error { border-color: #ef4444; background: rgba(239,68,68,0.05); }
  .task-card.needs-input { border-color: #f59e0b; background: rgba(245,158,11,0.05); }
  .task-card.focused { outline: 2px solid var(--vscode-focusBorder, #007acc); outline-offset: 1px; }

  .error-badge {
    position: absolute; top: -6px; right: -6px; width: 18px; height: 18px;
    background: #ef4444; color: white; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: bold; z-index: 1;
  }
  .interrupted-badge {
    position: absolute; top: -6px; right: -6px; width: 18px; height: 18px;
    background: #6b7280; color: white; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: bold; z-index: 1;
  }
  .question-badge {
    position: absolute; top: -6px; right: -6px; width: 18px; height: 18px;
    background: #f59e0b; color: white; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: bold; z-index: 1;
  }
  .ratelimit-badge {
    position: absolute; top: -6px; right: -6px; width: 18px; height: 18px;
    background: #f59e0b; color: white; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; z-index: 1;
  }
  .task-card.has-question { border-color: #f59e0b; background: rgba(245,158,11,0.05); }

  .focused-indicator {
    position: absolute; top: -8px; right: -6px;
    font-size: 13px; line-height: 1; z-index: 2;
  }
  .focused-indicator.has-badge {
    right: 14px;
  }

  .drag-handle {
    flex-shrink: 0; width: 8px; cursor: grab;
    color: var(--vscode-disabledForeground, #6b6b6b);
    display: flex; align-items: center; opacity: 0.4; transition: opacity 0.15s;
  }
  .drag-handle:hover { opacity: 1; }
  .drag-handle:active { cursor: grabbing; }
  .drag-handle svg { width: 6px; height: 10px; }

  .card-header { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 6px; }
  .category-badge {
    flex-shrink: 0; width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    background: var(--category-color); border-radius: 4px; opacity: 0.9;
  }
  .category-icon { font-size: 12px; filter: grayscale(0.2); }
  .title-wrap { position: relative; flex: 1; min-width: 0; }
  .compact-title-wrap { display: flex; align-items: center; }
  .title-btn {
    font-size: 11px; font-weight: 600; color: var(--vscode-foreground, #cccccc); line-height: 1.3;
    flex: 1; word-break: break-word; text-align: left;
    background: none; border: none; cursor: pointer; padding: 0; font-family: inherit;
  }
  .title-btn:hover { color: var(--vscode-textLink-foreground, #3794ff); }

  /* ---- Open-in dropdown menu ---- */
  .open-menu {
    position: absolute; top: 100%; left: 0; z-index: 60;
    margin-top: 4px; min-width: 170px;
    background: var(--vscode-menu-background, #252526);
    border: 1px solid var(--vscode-menu-border, #454545);
    border-radius: 6px; padding: 4px 0;
    box-shadow: 0 4px 14px rgba(0,0,0,0.35);
  }
  .open-menu-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 6px 12px;
    font-size: 11px; font-family: inherit;
    color: var(--vscode-menu-foreground, #cccccc);
    background: none; border: none; cursor: pointer;
    text-align: left; white-space: nowrap;
  }
  .open-menu-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #ffffff);
  }
  .open-menu-item svg { width: 14px; height: 14px; flex-shrink: 0; }

  .description {
    font-size: 10px; color: var(--vscode-descriptionForeground, #8c8c8c);
    margin-bottom: 6px; line-height: 1.4; cursor: pointer;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .description.expanded { -webkit-line-clamp: unset; }

  .last-message {
    background: var(--vscode-textBlockQuote-background, #2a2a2a);
    border-radius: 4px; padding: 5px 7px; margin-bottom: 6px; font-size: 10px;
    display: flex; flex-direction: row; align-items: flex-start; gap: 6px; cursor: pointer;
  }
  .status-dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 3px;
  }
  .status-dot-green { background: #10b981; }
  .status-dot-red   { background: #ef4444; }
  .status-dot-gray  { background: #6b7280; }
  .latest-content {
    flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
  }
  .latest-activity {
    display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap;
  }
  .tool-name {
    font-weight: 700; color: var(--vscode-foreground, #cccccc);
  }
  .tool-summary {
    color: var(--vscode-descriptionForeground, #8c8c8c);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    min-width: 0;
  }
  .latest-output {
    color: var(--vscode-descriptionForeground, #8c8c8c);
    font-size: 9px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .last-message .message-text {
    color: var(--vscode-foreground, #cccccc);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; min-width: 0;
    white-space: pre-wrap;
  }
  .last-message.expanded .message-text {
    -webkit-line-clamp: unset; overflow: visible;
  }
  .latest-status {
    color: var(--vscode-descriptionForeground, #8c8c8c);
    font-style: italic; font-size: 9px;
  }

  /* Git branch + agents on same row (#10) */
  .meta-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; min-height: 24px; }
  .git-branch {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; color: var(--vscode-textLink-foreground, #3794ff);
    background: none; border: none; cursor: pointer; padding: 0;
    font-family: inherit; white-space: nowrap;
  }
  .git-branch:hover { text-decoration: underline; }
  .git-icon { width: 12px; height: 12px; opacity: 0.8; }
  .branch-name { font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace; font-size: 9px; }
  .worktree-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--vscode-badge-background, #4d4d4d) 72%, transparent);
    color: var(--vscode-badge-foreground, #ffffff);
    font-size: 9px;
    line-height: 1;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
  }
  .worktree-label {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    opacity: 0.75;
  }
  .worktree-name { font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace; }
  .agents-row { display: flex; margin-left: auto; }

  /* Hide prompt input by default; reveal on hover or when user is typing */
  .prompt-wrap { display: none; }
  .task-card:hover > .prompt-wrap,
  .task-card:focus-within > .prompt-wrap { display: block; }

  .icon-badge {
    flex-shrink: 0; width: 22px; height: 22px;
    border-radius: 4px; overflow: hidden;
  }
  .icon-badge img { width: 100%; height: 100%; object-fit: cover; }

  /* Hover popup for thumbnails */
  .thumb-hover-trigger { position: relative; }
  .thumb-hover-popup {
    display: none; position: absolute; z-index: 50;
    top: 100%; left: 50%; transform: translateX(-50%);
    margin-top: 6px; width: 120px; height: 120px;
    border-radius: 6px; overflow: hidden;
    border: 1px solid var(--vscode-panel-border, #404040);
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    background: var(--vscode-editor-background, #1e1e1e);
  }
  .thumb-hover-popup img { width: 100%; height: 100%; object-fit: cover; }
  .thumb-hover-trigger:hover .thumb-hover-popup { display: block; }

  .compact-thumb-wrap { flex-shrink: 0; position: relative; }

  .compact-icon-col {
    display: flex; flex-direction: column; align-items: center;
    flex-shrink: 0; gap: 1px;
  }

  /* ---- Compact card ---- */
  .task-card.compact {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; margin-bottom: 4px; border-radius: 6px;
    min-height: 30px;
  }
  .compact-thumb { width: 20px; height: 20px; border-radius: 3px; object-fit: cover; flex-shrink: 0; }
  .compact-badge {
    width: 20px; height: 20px; border-radius: 3px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 10px;
  }
  .project-label {
    flex-shrink: 0;
    font-size: 8px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 80px;
  }
  .compact-title-btn {
    flex: 1; font-size: 10px; font-weight: 500; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: var(--vscode-foreground, #cccccc); text-align: left;
    background: none; border: none; cursor: pointer; padding: 0; font-family: inherit;
  }
  .compact-title-btn:hover { color: var(--vscode-textLink-foreground, #3794ff); }
  .compact-timer {
    flex-shrink: 0; font-size: 9px; white-space: nowrap;
    font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
    color: #22c55e; opacity: 0.85; margin-left: 4px; align-self: center;
  }
  .compact-timer.paused { color: var(--vscode-disabledForeground, #6b6b6b); opacity: 0.5; }
  .compact-agents { display: flex; flex-shrink: 0; }

  .error-badge-inline {
    width: 14px; height: 14px; background: #ef4444; color: white;
    border-radius: 50%; font-size: 8px; font-weight: bold;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .interrupted-badge-inline {
    width: 14px; height: 14px; background: #6b7280; color: white;
    border-radius: 50%; font-size: 8px; font-weight: bold;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .question-badge-inline {
    width: 14px; height: 14px; background: #f59e0b; color: white;
    border-radius: 50%; font-size: 8px; font-weight: bold;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .ratelimit-badge-inline {
    width: 14px; height: 14px; background: #f59e0b; color: white;
    border-radius: 50%; font-size: 7px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  .eye-icon { flex-shrink: 0; font-size: 11px; line-height: 1; }

  /* Activity timer */
  .activity-timer {
    flex-shrink: 0; font-size: 9px; white-space: nowrap;
    font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
    color: #22c55e; opacity: 0.9;
  }
  .activity-timer.paused { color: var(--vscode-disabledForeground, #6b6b6b); opacity: 0.6; }
  .activity-timer-overlay {
    position: absolute; top: 2px; right: 24px;
    font-size: 8px; white-space: nowrap;
    font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
    color: #22c55e; opacity: 0.85;
    pointer-events: none; z-index: 2;
  }
  .activity-timer-overlay.paused { color: var(--vscode-disabledForeground, #6b6b6b); opacity: 0.5; }

  /* ---- First conversation badge / timer banner ---- */
  .first-badge-banner {
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 4px;
  }
  .first-badge {
    display: inline-block;
    font-size: 8px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    background: var(--vscode-badge-background, #4d4d4d);
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
  }

  /* ---- Collapse toggle ---- */
  .collapse-toggle {
    flex-shrink: 0; width: 16px; height: 16px;
    background: none; border: none; cursor: pointer; padding: 0;
    color: var(--vscode-disabledForeground, #6b6b6b);
    opacity: 0; transition: opacity 0.15s;
    display: flex; align-items: center; justify-content: center;
  }
  .collapse-toggle svg { width: 12px; height: 12px; }
  .task-card:hover .collapse-toggle { opacity: 0.6; }
  .collapse-toggle:hover { opacity: 1 !important; color: var(--vscode-foreground, #cccccc); }

  /* ---- Narrow card (column-collapsed view) ---- */
  .task-card.narrow-card {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5px 4px;
    margin-bottom: 3px;
    border-radius: 5px;
    min-height: 34px;
  }
  .task-card.narrow-card .narrow-drag {
    position: absolute;
    inset: 0;
    width: auto;
    opacity: 0;
    z-index: 1;
    cursor: grab;
  }
  .task-card.narrow-card .narrow-drag:active { cursor: grabbing; }
  .narrow-icon {
    width: 24px; height: 24px;
    border-radius: 4px;
    object-fit: cover;
  }
  .narrow-cat {
    width: 24px; height: 24px;
    border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px;
  }
  .narrow-status-badge {
    position: absolute;
    top: -3px; right: -3px;
    width: 13px; height: 13px;
    border-radius: 50%;
    font-size: 7px; font-weight: bold;
    display: flex; align-items: center; justify-content: center;
    color: white; z-index: 2;
  }
  .narrow-badge-error { background: #ef4444; }
  .narrow-badge-ratelimit { background: #f59e0b; font-size: 6px; }
  .narrow-badge-interrupted { background: #6b7280; }
  .narrow-badge-question { background: #f59e0b; }
  .narrow-dot {
    position: absolute;
    bottom: 2px;
    width: 5px; height: 5px;
    border-radius: 50%;
  }
  .narrow-focused-eyes {
    position: absolute;
    bottom: -2px; right: -4px;
    font-size: 10px; line-height: 1;
    z-index: 3;
  }
  .narrow-dot-active {
    left: 6px;
    background: #10b981;
    animation: count-pulse 2s ease-in-out infinite;
  }
  @keyframes count-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* ---- Sidechain activity dots ---- */
  .sidechain-dots { display: flex; align-items: center; gap: 3px; }
  .sidechain-dots.compact { flex-shrink: 0; }
  .sc-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .sc-dot-idle      { background: #6b7280; }
  .sc-dot-completed { background: #10b981; }
  .sc-dot-failed    { background: #ef4444; }
  .sc-dot-running   { background: #f59e0b; animation: count-pulse 2s ease-in-out infinite; }

  /* Narrow view: single summary sidechain dot */
  .narrow-dot-sc {
    right: 6px;
  }
  .narrow-sc-idle      { background: #6b7280; }
  .narrow-sc-completed { background: #10b981; }
  .narrow-sc-failed    { background: #ef4444; }
  .narrow-sc-running   { background: #f59e0b; animation: count-pulse 2s ease-in-out infinite; }

  /* ---- Context menu (right-click) ---- */
  .context-menu {
    position: fixed;
    z-index: 100;
    min-width: 180px;
    background: var(--vscode-menu-background, #252526);
    border: 1px solid var(--vscode-menu-border, #454545);
    border-radius: 6px;
    padding: 4px 0;
    box-shadow: 0 4px 14px rgba(0,0,0,0.35);
  }
  .context-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    font-size: 11px;
    font-family: inherit;
    color: var(--vscode-menu-foreground, #cccccc);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
  }
  .context-menu-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #ffffff);
  }
  .context-menu-default {
    font-weight: 600;
  }
  .context-menu-danger {
    color: #ef4444;
  }
  .context-menu-danger:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
  .context-menu-separator {
    height: 1px;
    background: var(--vscode-menu-separatorBackground, #454545);
    margin: 4px 0;
  }
  .context-menu-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

</style>
