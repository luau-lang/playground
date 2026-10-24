<script lang="ts">
  import { 
    settings, 
    setMode, 
    setSolver, 
    enableLint,
    disableLint,
    setOptimizationLevel,
    setDebugLevel,
    setCompilerRemarks,
    setOutputFormat,
    keybindings,
    setKeybindings,
    type LuauMode, 
    type SolverMode,
    type OptimizationLevel,
    type DebugLevel,
    type OutputFormat,
    type KeybindingMode
  } from '$lib/stores/settings';
  import { onMount } from 'svelte';
  import { getLints } from "$lib/luau/wasm";
  import Button from '$lib/components/Button.svelte';
  import { Icon } from '$lib/icons';

  const modeOptions: { value: LuauMode; label: string; description: string }[] = [
    { value: 'strict', label: 'Strict', description: 'Full type checking' },
    { value: 'nonstrict', label: 'Nonstrict', description: 'Relaxed type checking' },
    { value: 'nocheck', label: 'No Check', description: 'Disable type checking' },
  ];

  const solverOptions: { value: SolverMode; label: string }[] = [
    { value: 'new', label: 'New' },
    { value: 'old', label: 'Old' },
  ];

  const optimizationOptions: { value: OptimizationLevel; label: string; description: string }[] = [
    { value: 0, label: 'O0', description: 'No optimization' },
    { value: 1, label: 'O1', description: 'Baseline (debuggable)' },
    { value: 2, label: 'O2', description: 'Full (includes inlining)' },
  ];

  const debugOptions: { value: DebugLevel; label: string; description: string }[] = [
    { value: 0, label: 'None', description: 'No debug info' },
    { value: 1, label: 'Lines', description: 'Line info & names' },
    { value: 2, label: 'Full', description: 'Full debug info' },
  ];

  const outputFormat: { value: OutputFormat; label: string; description: string }[] = [
    { value: 0, label: 'VM', description: 'VM bytecode' },
    { value: 1, label: 'IR', description: 'IR bytecode' },
    { value: 2, label: 'x64', description: 'x64 native code' },
    { value: 3, label: 'arm64', description: 'arm64 native code' },
  ];

  const keybindingOptions: { value: KeybindingMode; label: string }[] = [
    { value: 'default', label: 'Default' },
    { value: 'vim', label: 'Vim' },
  ];

  async function handleModeChange(mode: LuauMode) {
    setMode(mode);
    const { refreshDiagnostics } = await import('$lib/editor/setup');
    setTimeout(() => refreshDiagnostics(), 50);
  }

  async function handleSolverChange(solver: SolverMode) {
    setSolver(solver);
    const { refreshDiagnostics } = await import('$lib/editor/setup');
    setTimeout(() => refreshDiagnostics(), 50);
  }

  // Handle lints
  let allLintOptions: Promise<{ label: string, code: number }[]> | null = null;

  async function getAllLintOptions(): Promise<{ label: string, code: number }[]> {
    if (!allLintOptions) {
      const lintOptions: { label: string, code: number }[] = [];
      const response = await getLints();

      response.forEach((lintName, index) => {
        const lintCode = index + 1;
        lintOptions.push({
          label: lintName,
          code: lintCode,
        });
      })

      return lintOptions;
    }

    return allLintOptions;
  }

  async function handleSetLintEnabled(lintCode: number, setEnabled: boolean) {
    if (setEnabled) enableLint(lintCode);
    else disableLint(lintCode);

    const { refreshDiagnostics } = await import('$lib/editor/setup');
    setTimeout(() => refreshDiagnostics(), 50);
  }

  async function handleSetAllLintsEnabled(setEnabled: boolean) {
    if (!allLintOptions) return;
    const options = await allLintOptions;
    const lintSetter = setEnabled ? enableLint : disableLint;
    for (const { code } of options) {
      lintSetter(code);
    }

    const { refreshDiagnostics } = await import('$lib/editor/setup');
    setTimeout(() => refreshDiagnostics(), 50);
  }

  onMount(() => {
    allLintOptions = getAllLintOptions();
  });

  let popoverEl: HTMLElement;
</script>

<Button 
  size="sm" 
  variant="ghost" 
  class="config-trigger w-8 sm:w-9 px-0" 
  title="Settings"
  popovertarget="config-popover"
>
  <Icon name="gear" size={16} />
</Button>

<div
  bind:this={popoverEl}
  popover="auto"
  id="config-popover"
  class="config-popover m-0 w-80 max-h-[80vh] overflow-y-auto rounded-lg border border-(--border-color) bg-(--bg-secondary) p-4 shadow-xl"
>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-(--text-primary) mb-1">Settings</h3>
      <p class="text-xs text-(--text-muted)">Configure editor, type checking, lints, and compiler</p>
    </div>

    <!-- Type Checking Section -->
    <div class="space-y-3">
      <span class="text-xs font-semibold text-(--text-secondary) uppercase tracking-wide">Type Checking</span>
      
      <!-- Mode Selection -->
      <div class="space-y-1.5">
        <span class="text-xs text-(--text-muted)">Mode</span>
        <div class="flex gap-1">
          {#each modeOptions as option}
            {@const isSelected = $settings.mode === option.value}
            <button
              type="button"
              class="flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border
                {isSelected 
                  ? 'bg-(--bg-tertiary) border-(--accent) text-(--text-primary)' 
                  : 'hover:bg-(--bg-tertiary) border-transparent text-(--text-secondary)'}"
              title={option.description}
              onclick={() => handleModeChange(option.value)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Solver Selection -->
      <div class="space-y-1.5">
        <span class="text-xs text-(--text-muted)">Solver</span>
        <div class="flex gap-1">
          {#each solverOptions as option}
            {@const isSelected = $settings.solver === option.value}
            <button
              type="button"
              class="flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border
                {isSelected 
                  ? 'bg-(--bg-tertiary) border-(--accent) text-(--text-primary)' 
                  : 'hover:bg-(--bg-tertiary) border-transparent text-(--text-secondary)'}"
              title="{option.label} type solver"
              onclick={() => handleSolverChange(option.value)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <div class="border-t border-(--border-color)"></div>

    <!-- Compiler Section -->
    <div class="space-y-3">
      <span class="text-xs font-semibold text-(--text-secondary) uppercase tracking-wide">Compiler</span>
      
      <!-- Optimization Level -->
      <div class="space-y-1.5">
        <span class="text-xs text-(--text-muted)">Optimization</span>
        <div class="flex gap-1">
          {#each optimizationOptions as option}
            {@const isSelected = $settings.optimizationLevel === option.value}
            <button
              type="button"
              class="flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border
                {isSelected 
                  ? 'bg-(--bg-tertiary) border-(--accent) text-(--text-primary)' 
                  : 'hover:bg-(--bg-tertiary) border-transparent text-(--text-secondary)'}"
              title={option.description}
              onclick={() => setOptimizationLevel(option.value)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Debug Level -->
      <div class="space-y-1.5">
        <span class="text-xs text-(--text-muted)">Debug Info</span>
        <div class="flex gap-1">
          {#each debugOptions as option}
            {@const isSelected = $settings.debugLevel === option.value}
            <button
              type="button"
              class="flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border
                {isSelected 
                  ? 'bg-(--bg-tertiary) border-(--accent) text-(--text-primary)' 
                  : 'hover:bg-(--bg-tertiary) border-transparent text-(--text-secondary)'}"
              title={option.description}
              onclick={() => setDebugLevel(option.value)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Output Format -->
      <div class="space-y-1.5">
        <span class="text-xs text-(--text-muted)">Output Format</span>
        <div class="flex gap-1">
          {#each outputFormat as option}
            {@const isSelected = $settings.outputFormat === option.value}
            <button
              type="button"
              class="flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border
                {isSelected 
                  ? 'bg-(--bg-tertiary) border-(--accent) text-(--text-primary)' 
                  : 'hover:bg-(--bg-tertiary) border-transparent text-(--text-secondary)'}"
              title={option.description}
              onclick={() => setOutputFormat(option.value)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Compiler Remarks -->
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={$settings.compilerRemarks}
          onchange={(e) => setCompilerRemarks(e.currentTarget.checked)}
          class="w-4 h-4 rounded border-(--border-color) bg-(--bg-tertiary) accent-(--accent)"
        />
        <span class="text-xs text-(--text-secondary)">Show compiler remarks</span>
      </label>
    </div>

    <div class="border-t border-(--border-color)"></div>

    <!-- Lints Section -->
    <div class="space-y-3">
      <span class="text-xs font-semibold text-(--text-secondary) uppercase tracking-wide">Lints</span>

      <!-- Enabled Lints -->
      <div class="space-y-1.5">
        <span class="text-xs text-(--text-muted)">Enabled Lints</span>

        <div class="flex flex-col p-2 bg-(--bg-tertiary) max-h-[30vh] border-(--border-color) border rounded-md space-y-1">
          {#if allLintOptions}
            {#await allLintOptions}
              <p class="text-xs text-(--text-secondary)">Loading lint options...</p>
            {:then lintOptions}
              {@const currentLints = $settings.lints}

              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lintOptions.every((l) => (currentLints.includes(l.code)))}
                  onchange={(e) => handleSetAllLintsEnabled(e.currentTarget.checked)}
                  class="w-4 h-4 rounded border-(--border-color) bg-(--bg-tertiary) accent-(--accent)"
                />
                <span class="text-xs text-(--text-secondary)">All lints enabled</span>
              </label>

              <div class="border-t border-(--border-color)"></div>

              <div class="overflow-y-auto space-y-1">
                {#each lintOptions as option (option.code)}
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentLints.includes(option.code)}
                      onchange={(e) => handleSetLintEnabled(option.code, e.currentTarget.checked)}
                      class="w-4 h-4 rounded border-(--border-color) bg-(--bg-tertiary) accent-(--accent)"
                    />
                    <span class="text-xs text-(--text-secondary)">
                      {option.label} (<a class="text-link" href={`https://luau.org/lint/#${option.label.toLowerCase()}-${option.code}`}>{option.code}</a>)
                    </span>
                  </label>
                {/each}
              </div>
            {:catch getError}
              <p class="text-xs text-red-500">Failed to load options. {getError}</p>
            {/await}
          {:else}
            <p class="text-xs text-red-500">Failed to load options.</p>
          {/if}
        </div>
      </div>
    </div>

    <div class="border-t border-(--border-color)"></div>

    <!-- Editor Section -->
    <div class="space-y-3">
      <span class="text-xs font-semibold text-(--text-secondary) uppercase tracking-wide">Editor</span>

      <!-- Keybindings -->
      <div class="space-y-1.5">
        <label for="keybindings-select" class="text-xs text-(--text-muted)">Keybindings</label>
        <select
          id="keybindings-select"
          value={$keybindings}
          onchange={(e) => setKeybindings(e.currentTarget.value as KeybindingMode)}
          class="w-full px-2 py-1.5 text-xs rounded-md border border-(--border-color) bg-(--bg-tertiary) text-(--text-primary) focus:outline-none focus:border-(--accent) cursor-pointer"
        >
          {#each keybindingOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>
</div>

<style>
  :global(.config-trigger) {
    anchor-name: --config-trigger;
  }

  .text-link {
    color: var(--color-accent-500);
    text-decoration: underline;
  }

  .config-popover {
    position-anchor: --config-trigger;
    position-area: bottom span-left;
    position-try-fallbacks: flip-block;
    margin-top: 8px;
  }

  .config-popover::backdrop {
    background: transparent;
  }
</style>
