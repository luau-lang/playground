<script lang="ts">
  import TabBar from '$lib/components/TabBar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import Output from '$lib/components/Output.svelte';
  import BytecodeView from '$lib/components/BytecodeView.svelte';
  import { settings, showBytecode } from '$lib/stores/settings';
  import { files, activeFile } from '$lib/stores/playground';
  import { isEmbed, embedTheme } from '$lib/stores/embed';
  import { initTheme, setTheme } from '$lib/utils/theme';
  import { loadLuauWasm } from '$lib/luau/wasm';
  import { parseStateFromHash } from '$lib/utils/decode';
  import type { Readable } from 'svelte/store';
  import { onMount } from 'svelte';

  let mounted = $state(false);

  function clearUrlHash(): void {
    if (typeof window === 'undefined') return;
    if (!window.location.hash || window.location.hash.length <= 1) return;
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(null, '', url.toString());
  }

  onMount(() => {
    const hadUrlState = parseStateFromHash(window.location.hash) !== null;
    if (!hadUrlState) return;

    let cleared = false;
    const unsubs: Array<() => void> = [];

    const watch = <T,>(store: Readable<T>) => {
      let first = true;
      unsubs.push(
        store.subscribe(() => {
          if (first) {
            first = false;
            return;
          }
          if (cleared) return;
          cleared = true;
          clearUrlHash();
          // Stop watching after we've cleared once
          for (const u of unsubs) u();
        })
      );
    };

    watch(files);
    watch(activeFile);
    watch(settings);
    watch(showBytecode);

    return () => {
      for (const u of unsubs) u();
    };
  });

  // Initialize on mount
  $effect(() => {
    if (!mounted) {
      mounted = true;
      
      // In embed mode, apply the embed theme and add body class
      if ($isEmbed) {
        document.body.classList.add('embed-mode');
        const theme = $embedTheme;
        if (theme === 'light' || theme === 'dark') {
          setTheme(theme);
        } else {
          initTheme();
        }
      } else {
        initTheme();
      }
            
      loadLuauWasm().catch(console.error);
    }
  });
</script>

<div class="flex flex-col h-full bg-(--bg-primary) overflow-hidden">
  <TabBar />
  
  <main class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <!-- Editor area (split when bytecode view is open) -->
    <!-- Vertical split on mobile, horizontal on desktop -->
    <div class="flex-1 min-h-0 overflow-hidden flex {$showBytecode ? 'flex-col md:flex-row' : ''}">
      <!-- Editor - takes remaining space -->
      <div class="min-w-0 min-h-0 overflow-hidden {$showBytecode ? 'h-1/2 md:h-full md:flex-1' : 'h-full w-full'}">
        <Editor />
      </div>
      
      <!-- Bytecode panel (when visible) - max min(50%, 64ch) on desktop -->
      {#if $showBytecode}
        <div class="h-1/2 md:h-full md:w-[min(50%,64ch)] md:shrink-0 min-w-0 min-h-0 overflow-hidden">
          <BytecodeView />
        </div>
      {/if}
    </div>
    
    <!-- Output panel -->
    <Output />
  </main>
</div>

<style>
  /* Ensure the app fills the viewport on mobile */
  :global(html), :global(body), :global(#app) {
    height: 100%;
    overflow: hidden;
  }
  
  /* iOS safe area support */
  @supports (padding-top: env(safe-area-inset-top)) {
    :global(body) {
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }
  }
</style>
