<script lang="ts">
  import { output, isRunning, clearOutput, executionTime } from '$lib/stores/playground';
  import { isEmbed } from '$lib/stores/embed';
  import Button from '$lib/components/Button.svelte';
  import { Icon } from '$lib/icons';
  import { formatTime, isStackTraceLine, formatStackLine } from '$lib/utils/output';
  import ObjectView from './ObjectView.svelte';

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
  
  // Resizable height state
  const defaultHeight = $isEmbed ? 120 : 200;
  const minHeight = 80;
  const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.7 : 500;
  let outputHeight = $state(defaultHeight);
  let isResizing = $state(false);
  
  function handleResizeStart(e: MouseEvent) {
    if (!isExpanded) return;
    e.preventDefault();
    isResizing = true;
    const startY = e.clientY;
    const startHeight = outputHeight;
    
    function onMouseMove(e: MouseEvent) {
      const delta = startY - e.clientY;
      const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + delta));
      outputHeight = newHeight;
    }
    
    function onMouseUp() {
      isResizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
</script>

{#if shouldShow}
<div 
  class="relative flex flex-col border-t border-(--border-color) bg-(--bg-secondary)"
  class:transitioning={!isResizing}
  style="height: {isExpanded ? `${outputHeight}px` : '32px'}"
>
  {#if isExpanded}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="resize-handle"
      class:resizing={isResizing}
      onmousedown={handleResizeStart}
    ></div>
  {/if}
  
  <!-- Header -->
  <div class="flex items-center justify-between px-2 sm:px-3 py-1.5 border-b border-(--border-color) bg-(--bg-tertiary) shrink-0">
    <button 
      class="flex items-center gap-2 text-sm font-medium text-(--text-secondary) hover:text-(--text-primary) transition-colors"
      onclick={() => isExpanded = !isExpanded}
      aria-label={isExpanded ? 'Collapse output panel' : 'Expand output panel'}
      aria-expanded={isExpanded}
    >
      <span 
        class="transition-transform duration-200" 
        style="transform: rotate({isExpanded ? 90 : 0}deg)"
      >
        <Icon name="chevronRight" size={16} />
      </span>
      <span>Output</span>
      {#if $isRunning}
        <span class="animate-pulse text-(--accent)">●</span>
      {:else if $executionTime !== null}
        <span class="text-xs text-(--text-muted) font-mono">
          {formatTime($executionTime)}
        </span>
      {/if}
      {#if !isExpanded && $output.length > 0}
        <span class="text-xs text-(--text-muted)">
          ({$output.length} line{$output.length !== 1 ? 's' : ''})
        </span>
      {/if}
    </button>
    <!-- Always render button container to prevent layout shift, but hide when not needed -->
    <div class="-my-1">
      {#if isExpanded && $output.length > 0}
        <Button size="none" variant="ghost" onclick={clearOutput} class="h-7 px-2 text-xs" title="Clear output">
          Clear
        </Button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  {#if isExpanded}
    <div class="flex-1 overflow-auto p-1 py-0 sm:p-2 sm:py-1 lg:p-3 lg:py-2 font-mono text-xs sm:text-sm min-h-0">
      {#if $output.length === 0}
        <span class="text-(--text-muted) italic">
          Run your code to see output here...
        </span>
      {:else}
        {#each $output as line, i}
          {@const isStack = line.type === 'error' && isStackTraceLine(line.text)}
          {#if line.values && line.values.length > 0}
            <!-- Structured output with interactive object view -->
            <div class="leading-relaxed flex flex-wrap gap-x-4 gap-y-1">
              {#each line.values as value, j}
                <ObjectView {value} isTopLevel={true} />
              {/each}
            </div>
          {:else}
            <div 
              class="leading-relaxed break-all
                {isStack ? 'pl-4 opacity-80 text-error-500' : ''}
                {line.type === 'error' && !isStack ? 'text-error-500' : ''}
                {line.type === 'warn' ? 'text-warning-500' : ''}
                {line.type === 'log' ? 'text-(--text-primary)' : ''}"
            >
              {isStack ? formatStackLine(line.text) : line.text}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
</div>
{/if}

<style>
  .transitioning {
    transition: height 200ms ease;
  }
  
  .resize-handle {
    position: absolute;
    top: -3px;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
    z-index: 10;
    background: transparent;
  }
  
  .resize-handle::after {
    content: '';
    position: absolute;
    top: 1px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 3px;
    border-radius: 2px;
    background: var(--border-color);
    opacity: 0;
    transition: opacity 150ms ease;
  }
  
  .resize-handle:hover::after,
  .resize-handle.resizing::after {
    opacity: 1;
  }
  
  .resize-handle.resizing {
    background: linear-gradient(to bottom, var(--accent) 0%, transparent 100%);
    opacity: 0.3;
  }
</style>
