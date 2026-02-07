<script lang="ts">
  import type { Agent } from '../lib/vscode';

  export let agent: Agent;
  export let size: 'normal' | 'small' = 'normal';

  $: tooltipText = buildTooltip(agent);

  function buildTooltip(a: Agent): string {
    const parts = [a.name];
    if (a.id !== 'claude-main') parts.push(`(${a.id.replace('agent-', '')} agent)`);
    if (a.isActive) parts.push('- Currently active');
    return parts.join(' ');
  }
</script>

<div
  class="agent-avatar"
  class:active={agent.isActive}
  class:small={size === 'small'}
  title={tooltipText}
>
  {#if agent.avatar && agent.avatar.startsWith('data:')}
    <img src={agent.avatar} alt={agent.name} />
  {:else}
    <span class="initials">{agent.name.slice(0, 2).toUpperCase()}</span>
  {/if}
</div>

<style>
  .agent-avatar {
    width: 22px; height: 22px; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: var(--vscode-badge-background, #4d4d4d);
    border: 2px solid transparent;
    margin-left: -4px; transition: all 0.15s ease; cursor: default;
    flex-shrink: 0;
  }
  .agent-avatar:first-child { margin-left: 0; }
  .agent-avatar.active { border-color: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,0.3); animation: pulse-outline 2s ease-in-out infinite; }
  @keyframes pulse-outline {
    0%, 100% { border-color: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,0.3); }
    50% { border-color: #34d399; box-shadow: 0 0 0 4px rgba(16,185,129,0.15), 0 0 8px rgba(16,185,129,0.2); }
  }
  .agent-avatar.small { width: 18px; height: 18px; border-width: 1.5px; margin-left: -3px; }
  .agent-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .initials { font-size: 8px; font-weight: 600; color: var(--vscode-badge-foreground, #ffffff); letter-spacing: -0.5px; }
  .small .initials { font-size: 7px; }
</style>
