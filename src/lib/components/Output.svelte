<script lang="ts">
  import { output, isRunning, clearOutput, executionTime } from '$lib/stores/playground';
  import { isEmbed } from '$lib/stores/embed';
  import { Button } from '$lib/components/ui/button';
  import { formatTime, isStackTraceLine, formatStackLine } from '$lib/utils/output';

  // In embed mode: collapsed by default, smaller when expanded
  // In normal mode: expanded by default
  let isExpanded = $state(!$isEmbed);
  let hasEverRun = $state(false);
  
  // Track when code has been run (to show output panel in embed mode)
  $effect(() => {
    if ($output.length > 0) {
      hasEverRun = true;
      isExpanded = true; // Auto-expand when output arrives
    }
  });
  
  // In embed mode, hide entirely until first run
  const shouldShow = $derived(!$isEmbed || hasEverRun);
  
  // Smaller height in embed mode, but ensure minimum height for content visibility
  const expandedHeight = $derived($isEmbed ? 'max(100px, min(120px, 30vh))' : 'max(120px, min(200px, 40vh))');
</script>

{#if shouldShow}
<div 
  class="flex flex-col border-t border-[var(--border-color)] bg-[var(--bg-secondary)] transition-[height] duration-200"
  style="height: {isExpanded ? expandedHeight : '32px'}"
>
  <!-- Header -->
  <div class="flex items-center justify-between px-2 sm:px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] shrink-0">
    <button 
      class="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      onclick={() => isExpanded = !isExpanded}
    >
      <span 
        class="text-xs transition-transform duration-200" 
        style="transform: rotate({isExpanded ? 90 : 0}deg)"
      >
        ▶
      </span>
      <span>Output</span>
      {#if $isRunning}
        <span class="animate-pulse text-[var(--accent)]">●</span>
      {:else if $executionTime !== null}
        <span class="text-xs text-[var(--text-muted)] font-mono">
          {formatTime($executionTime)}
        </span>
      {/if}
      {#if !isExpanded && $output.length > 0}
        <span class="text-xs text-[var(--text-muted)]">
          ({$output.length} line{$output.length !== 1 ? 's' : ''})
        </span>
      {/if}
    </button>
    <!-- Always render button container to prevent layout shift, but hide when not needed -->
    <div class="-my-1">
      {#if isExpanded && $output.length > 0}
        <Button size="sm" variant="ghost" onclick={clearOutput} class="h-7 px-2">
          Clear
        </Button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  {#if isExpanded}
    <div class="flex-1 overflow-auto p-2 sm:p-3 font-mono text-xs sm:text-sm min-h-0">
      {#if $output.length === 0}
        <span class="text-[var(--text-muted)] italic">
          Run your code to see output here...
        </span>
      {:else}
        {#each $output as line, i}
          {@const isStack = line.type === 'error' && isStackTraceLine(line.text)}
          <div 
            class="leading-relaxed break-all
              {isStack ? 'pl-4 py-0 opacity-80 text-[var(--color-error-400)]' : 'py-0.5'}
              {line.type === 'error' && !isStack ? 'text-[var(--color-error-500)]' : ''}
              {line.type === 'warn' ? 'text-[var(--color-warning-500)]' : ''}
              {line.type === 'log' ? 'text-[var(--text-primary)]' : ''}"
          >
            {isStack ? formatStackLine(line.text) : line.text}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
{/if}
