<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import ConfigPopover from '$lib/components/ConfigPopover.svelte';
  import { files, activeFile, addFile, removeFile, setActiveFile } from '$lib/stores/playground';
  import { showBytecode, toggleBytecode } from '$lib/stores/settings';
  import { toggleTheme, themeMode } from '$lib/utils/theme';
  import { runCode, checkCode } from '$lib/luau/wasm';
  import { sharePlayground, generatePlaygroundUrl } from '$lib/utils/share';
  import { isEmbed } from '$lib/stores/embed';

  let newFileName = $state('');
  let showNewFileInput = $state(false);
  let shareSuccess = $state<boolean | null>(null);

  function handleAddFile() {
    if (newFileName.trim()) {
      const name = newFileName.endsWith('.luau') ? newFileName : `${newFileName}.luau`;
      addFile(name, '-- New file\n');
      newFileName = '';
      showNewFileInput = false;
    }
  }

  function handleRun() {
    runCode();
  }

  function handleCheck() {
    checkCode();
  }

  async function handleShare() {
    const success = await sharePlayground();
    shareSuccess = success;
    setTimeout(() => {
      shareSuccess = null;
    }, 2000);
  }

  function getThemeIcon(mode: string): string {
    if (mode === 'system') return '◐';
    if (mode === 'light') return '☀';
    return '☾';
  }

  function handleOpenInPlayground() {
    const url = generatePlaygroundUrl($files, $activeFile);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
</script>

<header class="relative flex items-end gap-1 px-2 pt-1.5 pb-0 bg-[var(--bg-secondary)] min-h-[44px]">
  <!-- Bottom border line -->
  <div class="absolute bottom-0 left-0 right-0 h-px bg-[var(--border-color)]"></div>
  
  <!-- File tabs - scrollable on mobile -->
  <div class="flex items-end gap-0.5 flex-1 overflow-x-auto scrollbar-hide">
    {#each Object.keys($files) as fileName}
      <div
        class="group relative flex items-center gap-1 px-2 sm:px-3 py-1.5 text-sm rounded-t-md transition-colors cursor-pointer shrink-0
          {$activeFile === fileName 
            ? 'bg-[var(--bg-editor)] text-[var(--text-primary)] border-t border-x border-[var(--border-color)] z-10' 
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] mb-px'}"
        role="button"
        tabindex="0"
        onclick={() => setActiveFile(fileName)}
        onkeydown={(e) => e.key === 'Enter' && setActiveFile(fileName)}
      >
        <span class="truncate max-w-[80px] sm:max-w-[120px]">{fileName}</span>
        {#if Object.keys($files).length > 1 && !$isEmbed}
          <button
            class="opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[var(--color-error-500)] ml-1 text-xs p-1 -m-1"
            onclick={(e) => { e.stopPropagation(); removeFile(fileName); }}
            aria-label="Close tab"
          >
            ×
          </button>
        {/if}
      </div>
    {/each}

    <!-- Add file button (hidden in embed mode) -->
    {#if !$isEmbed}
      {#if showNewFileInput}
        <form class="flex items-center gap-1 ml-1 shrink-0 mb-1" onsubmit={(e) => { e.preventDefault(); handleAddFile(); }}>
          <input
            type="text"
            class="w-20 sm:w-24 px-2 py-1 text-sm bg-[var(--bg-editor)] border border-[var(--border-color)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            placeholder="filename"
            bind:value={newFileName}
            autofocus
          />
          <Button size="sm" variant="ghost" type="submit">✓</Button>
          <Button size="sm" variant="ghost" onclick={() => showNewFileInput = false}>×</Button>
        </form>
      {:else}
        <Button size="sm" variant="ghost" onclick={() => showNewFileInput = true} class="shrink-0 mb-1">+</Button>
      {/if}
    {/if}
  </div>

  <!-- Actions - responsive sizing -->
  <div class="flex items-center gap-0.5 sm:gap-1 shrink-0 mb-1">
    {#if !$isEmbed}
      <ConfigPopover />
      <Button size="sm" variant="ghost" onclick={toggleTheme} class="w-8 sm:w-9">
        {getThemeIcon($themeMode)}
      </Button>
      <Button 
        size="sm" 
        variant={$showBytecode ? 'default' : 'secondary'} 
        onclick={toggleBytecode} 
        class="px-2 sm:px-3"
      >
        <span class="hidden sm:inline">Bytecode</span>
        <span class="sm:hidden font-mono">{'{}'}</span>
      </Button>
      <Button size="sm" variant="secondary" onclick={handleShare} class="px-2 sm:px-3">
        {#if shareSuccess === true}
          ✓
        {:else if shareSuccess === false}
          URL ↗
        {:else}
          <span class="hidden sm:inline">Share</span>
          <span class="sm:hidden">↗</span>
        {/if}
      </Button>
    {/if}
    <Button size="sm" variant="secondary" onclick={handleCheck} class="px-2 sm:px-3">
      <span class="hidden sm:inline">Check</span>
      <span class="sm:hidden">✓</span>
    </Button>
    <Button size="sm" onclick={handleRun} class="px-2 sm:px-3">
      <span class="sm:mr-1">▶</span>
      <span class="hidden sm:inline">Run</span>
    </Button>
    {#if $isEmbed}
      <Button size="sm" variant="secondary" onclick={handleOpenInPlayground} class="px-2 sm:px-3">
        <span class="hidden sm:inline">Open ↗</span>
        <span class="sm:hidden">↗</span>
      </Button>
    {/if}
  </div>
</header>

<style>
  /* Hide scrollbar but allow scrolling */
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
