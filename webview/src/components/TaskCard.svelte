<script lang="ts">
  import { vscode, type Conversation } from '../lib/vscode';
  import { getCategoryDetails, toggleCardCollapsed, settings } from '../stores/conversations';
  import AgentAvatar from './AgentAvatar.svelte';
  import PromptInput from './PromptInput.svelte';

  import { afterUpdate, onDestroy, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ sendDraft: string; deleteDraft: string }>();

  export let conversation: Conversation;
  export let compact: boolean = false;
  export let focused: boolean = false;
  export let searchQuery: string = '';
  export let isFirst: boolean = false;

  $: categoryDetails = getCategoryDetails(conversation.category);
  $: needsInteraction = conversation.status === 'needs-input';

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

  // Activity timer — counts while agents are actively working, pauses when awaiting user input
  $: isActive = conversation.agents.some(a => a.isActive)
    && !conversation.hasQuestion
    && !conversation.isInterrupted
    && conversation.status !== 'needs-input';
  let timerInterval: ReturnType<typeof setInterval> | undefined;
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
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        elapsedSeconds = Math.floor((Date.now() - timerStartTime) / 1000);
      }, 1000);
    } else {
      clearInterval(timerInterval);
      timerInterval = undefined;
      frozenElapsed = elapsedSeconds;
    }
    wasActive = active;
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

  onDestroy(() => {
    clearInterval(timerInterval);
  });

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
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function highlight(text: string): string {
    if (!searchQuery.trim() || !text) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const q = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(
      new RegExp(`(${q})`, 'gi'),
      '<mark style="background:#e2b714;color:#1e1e1e;border-radius:2px;padding:0 2px">$1</mark>'
    );
  }

  function handleToggleCollapse() {
    toggleCardCollapsed(conversation.id);
  }

  function handleOpenConversation() {
    vscode.postMessage({ type: 'openConversation', conversationId: conversation.id });
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

{#if conversation.isDraft}
  <!-- Draft view: just the prompt text + send button -->
  <div class="task-card draft">
    <div class="drag-handle" title="Drag to move">
      <svg viewBox="0 0 6 10" fill="currentColor"><circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/><circle cx="1.5" cy="5" r="1"/><circle cx="4.5" cy="5" r="1"/><circle cx="1.5" cy="8.5" r="1"/><circle cx="4.5" cy="8.5" r="1"/></svg>
    </div>
    <span class="draft-prompt">{conversation.title}</span>
    <button class="draft-delete" on:click={() => dispatch('deleteDraft', conversation.id)} title="Delete idea">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
    </button>
    <button class="draft-send" on:click={() => dispatch('sendDraft', conversation.id)} title="Start conversation">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 15l-.7-.7L11.6 10H2V9h9.6L7.3 4.7 8 4l6 6-6 5z" transform="rotate(-90 8 9.5)"/></svg>
    </button>
  </div>

{:else if compact}
  <!-- Compact view: single row -->
  <div
    bind:this={cardEl}
    class="task-card compact"
    class:has-error={conversation.hasError}
    class:focused
    style="--category-color: {categoryDetails.color}"
  >
    <div class="drag-handle" title="Drag to move">
      <svg viewBox="0 0 6 10" fill="currentColor"><circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/><circle cx="1.5" cy="5" r="1"/><circle cx="4.5" cy="5" r="1"/><circle cx="1.5" cy="8.5" r="1"/><circle cx="4.5" cy="8.5" r="1"/></svg>
    </div>
    {#if conversation.hasError}
      <span class="error-badge-inline" title={conversation.errorMessage || 'Error'}>!</span>
    {:else if conversation.isInterrupted}
      <span class="interrupted-badge-inline" title="Tool interrupted">ꝇ</span>
    {:else if conversation.hasQuestion}
      <span class="question-badge-inline" title="Waiting for input">?</span>
    {/if}
    {#if focused}
      <span class="eye-icon" title="Currently viewed">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5C4.136 3.5 1.04 6.074.13 7.625a.75.75 0 0 0 0 .75C1.04 9.926 4.136 12.5 8 12.5s6.96-2.574 7.87-4.125a.75.75 0 0 0 0-.75C14.96 6.074 11.864 3.5 8 3.5zM8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/><circle cx="8" cy="8" r="1.5"/></svg>
      </span>
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
      {#if showTimer}
        <span class="activity-timer-inline" class:paused={!isActive}>{timerDisplay}</span>
      {/if}
    </div>
    <button class="compact-title-btn" on:click={handleOpenConversation} title={titleTooltip}>{@html highlight(cleanTitle(displayTitle))}</button>
    {#if conversation.agents.some(a => a.isActive)}
      <div class="compact-agents">
        {#each conversation.agents.filter(a => a.isActive) as agent (agent.id)}
          <AgentAvatar {agent} size="small" />
        {/each}
      </div>
    {/if}
    {#if isFirst}
      <span class="first-badge">Genesis</span>
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
  >
    {#if conversation.hasError}
      <div class="error-badge" title={conversation.errorMessage || 'Error occurred'}>!</div>
    {:else if conversation.isInterrupted}
      <div class="interrupted-badge" title="Tool interrupted">ꝇ</div>
    {:else if conversation.hasQuestion}
      <div class="question-badge" title="Waiting for input">?</div>
    {/if}

    {#if focused}
      <div class="focused-indicator" title="Currently viewing this conversation">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5C4.136 3.5 1.04 6.074.13 7.625a.75.75 0 0 0 0 .75C1.04 9.926 4.136 12.5 8 12.5s6.96-2.574 7.87-4.125a.75.75 0 0 0 0-.75C14.96 6.074 11.864 3.5 8 3.5zM8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/><circle cx="8" cy="8" r="1.5"/></svg>
      </div>
    {/if}

    <!-- Header (click title to open conversation) -->
    <div class="card-header">
      <div class="drag-handle" title="Drag to move">
        <svg viewBox="0 0 6 10" fill="currentColor"><circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/><circle cx="1.5" cy="5" r="1"/><circle cx="4.5" cy="5" r="1"/><circle cx="1.5" cy="8.5" r="1"/><circle cx="4.5" cy="8.5" r="1"/></svg>
      </div>
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
      <button class="title-btn" on:click={handleOpenConversation} title={titleTooltip}>
        {@html highlight(cleanTitle(displayTitle))}
      </button>
      {#if isFirst}
        <span class="first-badge">Genesis</span>
      {/if}
      {#if showTimer}
        <span class="activity-timer" class:paused={!isActive}>{timerDisplay}</span>
      {/if}
      <button class="collapse-toggle" on:click={handleToggleCollapse} title="Collapse card">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.3 2.3L11 3 6.4 7.6 11 12.3l-.7.7L5 7.7l5.3-5.4z"/></svg>
      </button>
    </div>

    <!-- Description (click to expand) -->
    {#if conversation.description}
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

    <!-- Latest message (click to expand) -->
    {#if conversation.lastMessage}
      <div
        class="last-message"
        class:expanded={latestExpanded}
        on:click={toggleLatest}
        on:keydown={(e) => e.key === 'Enter' && toggleLatest()}
        role="button"
        tabindex="0"
      >
        <span class="message-label">Latest:</span>
        <span class="message-text">{@html highlight(conversation.lastMessage)}</span>
      </div>
    {/if}

    <!-- Git branch + Agents on same line (#10) -->
    <div class="meta-row">
      {#if conversation.gitBranch}
        <button class="git-branch" on:click={handleGitBranchClick} title="Open in source control">
          <svg class="git-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
          </svg>
          <span class="branch-name">{@html highlight(conversation.gitBranch || '')}</span>
        </button>
      {/if}
      {#if conversation.agents.some(a => a.isActive)}
        <div class="agents-row">
          {#each conversation.agents.filter(a => a.isActive) as agent (agent.id)}
            <AgentAvatar {agent} />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Respond button for needs-input -->
    {#if needsInteraction}
      <button class="action-btn" on:click={handleOpenConversation}>
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0zM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm.5 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .471.696l2 .75a.75.75 0 1 0 .558-1.392L8.5 7.648V4.75z"/>
        </svg>
        Respond
      </button>
    {/if}

    <PromptInput on:submit={handleSendPrompt} />
  </div>
{/if}

<style>
  /* ---- Draft card ---- */
  .task-card.draft {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 8px; margin-bottom: 4px; border-radius: 6px;
    border-left: 2px dashed var(--vscode-disabledForeground, #6b6b6b);
    background: var(--vscode-editor-background, #1e1e1e);
    border-top: 1px dashed var(--vscode-panel-border, #404040);
    border-right: 1px dashed var(--vscode-panel-border, #404040);
    border-bottom: 1px dashed var(--vscode-panel-border, #404040);
    opacity: 0.85;
  }
  .task-card.draft:hover { opacity: 1; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
  .draft-prompt {
    flex: 1; min-width: 0;
    font-size: 10px; font-style: italic;
    color: var(--vscode-foreground, #cccccc);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
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
    border-left: 3px solid var(--category-color);
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
  .task-card.has-question { border-color: #f59e0b; background: rgba(245,158,11,0.05); }

  .focused-indicator {
    position: absolute; top: 6px; right: 6px; width: 16px; height: 16px;
    color: var(--vscode-focusBorder, #007acc); opacity: 0.8;
  }
  .focused-indicator svg { width: 16px; height: 16px; }

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
  .title-btn {
    font-size: 11px; font-weight: 600; color: var(--vscode-foreground, #cccccc); line-height: 1.3;
    flex: 1; word-break: break-word; text-align: left;
    background: none; border: none; cursor: pointer; padding: 0; font-family: inherit;
  }
  .title-btn:hover { color: var(--vscode-textLink-foreground, #3794ff); }

  .description {
    font-size: 10px; color: var(--vscode-descriptionForeground, #8c8c8c);
    margin-bottom: 6px; line-height: 1.4; cursor: pointer;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .description.expanded { -webkit-line-clamp: unset; }

  .last-message {
    background: var(--vscode-textBlockQuote-background, #2a2a2a);
    border-radius: 4px; padding: 5px 7px; margin-bottom: 6px; font-size: 10px;
    display: flex; flex-direction: row; align-items: baseline; gap: 4px; cursor: pointer;
  }
  .last-message .message-text {
    color: var(--vscode-foreground, #cccccc);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex: 1; min-width: 0;
  }
  .last-message.expanded .message-text { white-space: pre-wrap; overflow: visible; }
  .message-label { color: var(--vscode-descriptionForeground, #8c8c8c); font-size: 10px; font-weight: 600; flex-shrink: 0; }

  /* Git branch + agents on same row (#10) */
  .meta-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; min-height: 24px; }
  .git-branch {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; color: var(--vscode-textLink-foreground, #3794ff);
    background: none; border: none; cursor: pointer; padding: 0;
    font-family: inherit; white-space: nowrap;
  }
  .git-branch:hover { text-decoration: underline; }
  .git-icon { width: 12px; height: 12px; opacity: 0.8; }
  .branch-name { font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace; font-size: 9px; }
  .agents-row { display: flex; margin-left: auto; }

  .action-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%;
    padding: 6px 10px; background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff); border: none; border-radius: 4px;
    font-size: 10px; font-weight: 500; cursor: pointer; transition: background-color 0.15s; margin-bottom: 6px;
  }
  .action-btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .action-btn svg { width: 13px; height: 13px; }

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
    border-left-width: 2px; min-height: 30px;
  }
  .compact-thumb { width: 20px; height: 20px; border-radius: 3px; object-fit: cover; flex-shrink: 0; }
  .compact-badge {
    width: 20px; height: 20px; border-radius: 3px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 10px;
  }
  .compact-title-btn {
    flex: 1; font-size: 10px; font-weight: 500; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: var(--vscode-foreground, #cccccc); text-align: left;
    background: none; border: none; cursor: pointer; padding: 0; font-family: inherit;
  }
  .compact-title-btn:hover { color: var(--vscode-textLink-foreground, #3794ff); }
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

  .eye-icon { width: 14px; height: 14px; flex-shrink: 0; color: var(--vscode-focusBorder, #007acc); opacity: 0.8; }
  .eye-icon svg { width: 14px; height: 14px; }

  /* Activity timer */
  .activity-timer {
    flex-shrink: 0; font-size: 9px; white-space: nowrap;
    font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
    color: #22c55e; opacity: 0.9;
  }
  .activity-timer.paused { color: var(--vscode-disabledForeground, #6b6b6b); opacity: 0.6; }
  .activity-timer-inline {
    flex-shrink: 0; font-size: 8px; white-space: nowrap;
    font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
    color: #22c55e; opacity: 0.9;
  }
  .activity-timer-inline.paused { color: var(--vscode-disabledForeground, #6b6b6b); opacity: 0.6; }

  /* ---- First conversation badge ---- */
  .first-badge {
    flex-shrink: 0;
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


</style>
