<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { files, activeFile, updateFile } from '$lib/stores/playground';
  import { get } from 'svelte/store';

  let editorContainer: HTMLDivElement;
  let currentFile = $state('');
  let isLoading = $state(true);
  
  // Editor module (dynamically imported)
  let editorModule: typeof import('$lib/editor/setup') | null = null;

  onMount(async () => {    
    editorModule = await import('$lib/editor/setup');
    
    // Initialize TextMate grammar (no WASM, resolves immediately)
    await editorModule.initLuauTextMate();
    
    editorModule.createEditor(editorContainer, $files[$activeFile] || '', (content) => {
      if ($activeFile) {
        updateFile($activeFile, content);
      }
    });
    
    isLoading = false;
  });

  onDestroy(() => {
    editorModule?.destroyEditor();
  });

  // React to active file changes
  $effect(() => {
    const file = $activeFile;
    if (file && file !== currentFile && editorModule) {
      currentFile = file;
      const content = $files[file] || '';
      editorModule.updateEditorContent(content);
    }
  });

  // Snapshot for skeleton - computed once, not reactive
  const initialContent = get(files)[get(activeFile)] ?? '';
  const defaultCodeLines = initialContent.split('\n').map(line => {
    const leading = line.match(/^ */)?.[0]?.length ?? 0;
    return { leading, length: line.length };
  });
</script>

<div class="h-full w-full bg-(--bg-editor) relative" bind:this={editorContainer}>
  {#if isLoading}
    <div class="absolute inset-0 flex flex-col py-3 px-2 font-mono md:text-sm text-extended-gray-600 animate-pulse">
      <!-- Fake line numbers + code skeleton -->
      <div class="flex gap-5">
        <div class="flex flex-col items-end opacity-50 select-none">
          {#each defaultCodeLines as _, i}
            <span class="leading-[1.4] pl-[5px] pr-[3px]">{i + 1}</span>
          {/each}
        </div>
        <div class="flex-1 flex flex-col gap-1 pt-0.5">
          {#each defaultCodeLines as line}
            <div
              class="h-[18.4px] md:h-[15.6px] bg-extended-gray-600/10 rounded"
              style="
                margin-left: {line.leading}ch;
                width: {line.length - line.leading}ch;
              "
            ></div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

