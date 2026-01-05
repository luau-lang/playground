<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  import { Icon, type IconName } from '$lib/icons';
  import ConfigPopover from '$lib/components/ConfigPopover.svelte';
  import { files, activeFile, addFile, removeFile, setActiveFile, renameFile } from '$lib/stores/playground';
  import { showBytecode, toggleBytecode } from '$lib/stores/settings';
  import { toggleTheme, themeMode } from '$lib/utils/theme';
  import { runCode, checkCode, stopExecution } from '$lib/luau/wasm';
  import { isRunning } from '$lib/stores/playground';
  import { sharePlayground, generatePlaygroundUrl } from '$lib/utils/share';
  import { isEmbed } from '$lib/stores/embed';

  let newFileName = $state('');
  let isCreatingFile = $state(false);
  let editingFileName = $state<string | null>(null);
  let editValue = $state('');
  let shareSuccess = $state<boolean | null>(null);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  
  // Delay before showing stop button to avoid flash on fast scripts
  let showStopButton = $state(false);
  
  $effect(() => {
    if (!$isRunning) {
      showStopButton = false;
      return;
    }
    const timer = setTimeout(() => showStopButton = true, 150);
    return () => clearTimeout(timer);
  });

  function focusInput(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function handleAddFile() {
    if (!isCreatingFile) return;
    const trimmed = newFileName.trim();
    if (trimmed) {
      const name = trimmed.endsWith('.luau') ? trimmed : `${trimmed}.luau`;
      addFile(name, '-- New file\n');
    }
    newFileName = '';
    isCreatingFile = false;
  }

  function startCreatingFile() {
    if (isCreatingFile) return;
    isCreatingFile = true;
    newFileName = '';
  }

  function startEditing(fileName: string) {
    editingFileName = fileName;
    // Remove .luau extension for editing
    editValue = fileName.endsWith('.luau') ? fileName.slice(0, -5) : fileName;
  }

  function finishEditing(originalName: string) {
    if (editingFileName !== originalName) return;
    
    const trimmed = editValue.trim();
    if (trimmed) {
      const newName = trimmed.endsWith('.luau') ? trimmed : `${trimmed}.luau`;
      if (newName !== originalName) {
        renameFile(originalName, newName);
      }
    }
    editingFileName = null;
    editValue = '';
  }

  function handleTabPointerDown(fileName: string, e: PointerEvent) {
    // Start long press timer for editing
    longPressTimer = setTimeout(() => {
      startEditing(fileName);
      longPressTimer = null;
    }, 500);
  }

  function handleTabPointerUp() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleTabDblClick(fileName: string, e: MouseEvent) {
    e.stopPropagation();
    startEditing(fileName);
  }

  function handleRun() {
    if ($isRunning) {
      stopExecution();
    } else {
      runCode();
    }
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

  function getThemeIcon(mode: string): IconName {
    if (mode === 'system') return 'auto';
    if (mode === 'light') return 'sun';
    return 'moon';
  }

  function handleOpenInPlayground() {
    window.open(generatePlaygroundUrl(), '_blank', 'noopener,noreferrer');
  }
</script>

<header class="relative flex items-end gap-1 px-2 pt-1.5 pb-0 bg-(--bg-secondary) min-h-11">
  <!-- Bottom border line -->
  <div class="absolute bottom-0 left-0 right-0 h-px bg-(--border-color)"></div>
  
  <!-- File tabs - scrollable on mobile -->
  <div class="flex items-end gap-0.5 flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide">
    {#each Object.keys($files) as fileName}
      <div
        class="group relative flex items-center gap-1 px-2 sm:px-3 py-1.5 text-sm leading-5 rounded-t-md transition-colors cursor-pointer shrink-0 select-none border-t border-x
          {$activeFile === fileName 
            ? 'bg-(--bg-editor) text-(--text-primary) border-(--border-color) z-10 -mb-px' 
            : 'text-(--text-secondary) hover:bg-(--bg-tertiary) border-transparent -mb-px'}"
        role="button"
        tabindex="0"
        aria-label="Switch to {fileName}"
        onclick={() => editingFileName !== fileName && setActiveFile(fileName)}
        onkeydown={(e) => e.key === 'Enter' && editingFileName !== fileName && setActiveFile(fileName)}
        ondblclick={(e) => !$isEmbed && handleTabDblClick(fileName, e)}
        onpointerdown={(e) => !$isEmbed && handleTabPointerDown(fileName, e)}
        onpointerup={handleTabPointerUp}
        onpointerleave={handleTabPointerUp}
      >
        {#if editingFileName === fileName}
          <input
            type="text"
            class="w-20 sm:w-24 text-sm bg-transparent text-inherit focus:outline-none caret-(--accent)"
            bind:value={editValue}
            use:focusInput
            onblur={() => finishEditing(fileName)}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
            onclick={(e) => e.stopPropagation()}
          />
        {:else}
          <span class="truncate max-w-20 sm:max-w-30">{fileName}</span>
        {/if}
        {#if Object.keys($files).length > 1 && !$isEmbed && editingFileName !== fileName}
          <button
            class="opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-error-500 ml-1 p-1 -m-1 cursor-pointer"
            onclick={(e) => { e.stopPropagation(); removeFile(fileName); }}
            aria-label="Close tab"
          >
            <Icon name="x" size={16} />
          </button>
        {/if}
      </div>
    {/each}

    <!-- Add file tab (hidden in embed mode) -->
    {#if !$isEmbed}
      <div
        class="group relative flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 text-sm leading-5 rounded-t-md transition-colors cursor-pointer shrink-0 border-t border-x
          {isCreatingFile 
            ? 'bg-(--bg-editor) text-(--text-primary) border-(--border-color) z-10 -mb-px' 
            : 'text-(--text-secondary) hover:bg-(--bg-tertiary) border-transparent -mb-px'}"
        role="button"
        tabindex="0"
        aria-label="Add new file"
        onclick={(e) => { e.stopPropagation(); startCreatingFile(); }}
        onkeydown={(e) => { if (e.key === 'Enter' && !isCreatingFile) startCreatingFile(); }}
      >
        {#if isCreatingFile}
          <input
            type="text"
            class="w-20 sm:w-24 text-sm bg-transparent text-inherit placeholder:opacity-50 focus:outline-none caret-(--accent)"
            placeholder="filename"
            bind:value={newFileName}
            use:focusInput
            onblur={handleAddFile}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
            onclick={(e) => e.stopPropagation()}
          />
        {:else}
          <span class="h-5 flex items-center"><Icon name="plus" size={16} /></span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Actions - responsive sizing -->
  <div class="flex items-center gap-0.5 sm:gap-1 shrink-0 mb-1">
    {#if !$isEmbed}
      <ConfigPopover />
      <Button size="sm" variant="ghost" onclick={toggleTheme} class="w-8 sm:w-9 px-0" title="Toggle theme">
        <Icon name={getThemeIcon($themeMode)} size={16} />
      </Button>
      <Button 
        size="sm" 
        variant={$showBytecode ? 'default' : 'secondary'} 
        onclick={toggleBytecode} 
        class="px-2 sm:px-3"
        title="Toggle bytecode view"
      >
        <span class="hidden sm:inline">Bytecode</span>
        <span class="sm:hidden"><Icon name="binary" size={16} /></span>
      </Button>
      <Button size="sm" variant="secondary" onclick={handleShare} class="px-2 sm:px-3 sm:min-w-14" title="Share playground">
        {#if shareSuccess === true}
          <Icon name="check" size={16} />
        {:else if shareSuccess === false}
          <span class="flex items-center gap-1">URL <Icon name="external" size={16} /></span>
        {:else}
          <span class="hidden sm:inline-flex items-center gap-1">Share</span>
          <span class="sm:hidden"><Icon name="share" size={16} /></span>
        {/if}
      </Button>
    {/if}
    <Button size="sm" variant="secondary" onclick={handleCheck} class="px-2 sm:px-3" title="Check code for errors">
      <span class="hidden sm:inline">Check</span>
      <span class="sm:hidden"><Icon name="check"size={16} /></span>
    </Button>
    <Button 
      size="sm" 
      variant={showStopButton ? 'secondary' : 'default'} 
      onclick={handleRun} 
      class="px-2 sm:px-3" 
      title={showStopButton ? 'Stop execution' : 'Run code'}
    >
      <span class="sm:mr-1"><Icon name={showStopButton ? 'stop' : 'play'} size={16} /></span>
      <span class="hidden sm:inline">{showStopButton ? 'Stop' : 'Run'}</span>
    </Button>
    {#if $isEmbed}
      <Button size="sm" variant="secondary" onclick={handleOpenInPlayground} class="px-2 sm:px-3" title="Open in playground">
        <span class="hidden sm:inline items-center gap-1">Open</span>
        <span class="sm:hidden"><Icon name="external"size={16} /></span>
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
