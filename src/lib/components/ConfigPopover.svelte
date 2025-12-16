<script lang="ts">
  import { Popover } from 'bits-ui';
  import { 
    settings, 
    setMode, 
    setSolver, 
    setOptimizationLevel,
    setDebugLevel,
    setCompilerRemarks,
    type LuauMode, 
    type SolverMode,
    type OptimizationLevel,
    type DebugLevel
  } from '$lib/stores/settings';
  import { Button } from '$lib/components/ui/button';
  import { refreshDiagnostics } from '$lib/editor/setup';

  let open = $state(false);

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

  function handleModeChange(mode: LuauMode) {
    setMode(mode);
    setTimeout(() => refreshDiagnostics(), 50);
  }

  function handleSolverChange(solver: SolverMode) {
    setSolver(solver);
    setTimeout(() => refreshDiagnostics(), 50);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} size="sm" variant="ghost" class="w-8 sm:w-9 text-lg">
        ⚙
      </Button>
    {/snippet}
  </Popover.Trigger>
  
  <Popover.Portal>
    <Popover.Content
      class="config-popover z-50 w-80 max-h-[80vh] overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 shadow-xl"
      sideOffset={8}
      align="end"
    >
      <div class="space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-[var(--text-primary)] mb-1">Settings</h3>
          <p class="text-xs text-[var(--text-muted)]">Configure type checking and compiler</p>
        </div>

        <!-- Type Checking Section -->
        <div class="space-y-3">
          <span class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Type Checking</span>
          
          <!-- Mode Selection -->
          <div class="space-y-1.5">
            <span class="text-xs text-[var(--text-muted)]">Mode</span>
            <div class="flex gap-1">
              {#each modeOptions as option}
                {@const isSelected = $settings.mode === option.value}
                <button
                  type="button"
                  class="flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border
                    {isSelected 
                      ? 'bg-[var(--bg-tertiary)] border-[var(--accent)] text-[var(--text-primary)]' 
                      : 'hover:bg-[var(--bg-tertiary)] border-transparent text-[var(--text-secondary)]'}"
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
            <span class="text-xs text-[var(--text-muted)]">Solver</span>
            <div class="flex gap-1">
              {#each solverOptions as option}
                {@const isSelected = $settings.solver === option.value}
                <button
                  type="button"
                  class="flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border
                    {isSelected 
                      ? 'bg-[var(--bg-tertiary)] border-[var(--accent)] text-[var(--text-primary)]' 
                      : 'hover:bg-[var(--bg-tertiary)] border-transparent text-[var(--text-secondary)]'}"
                  onclick={() => handleSolverChange(option.value)}
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>
        </div>

        <div class="border-t border-[var(--border-color)]"></div>

        <!-- Compiler Section -->
        <div class="space-y-3">
          <span class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Compiler</span>
          
          <!-- Optimization Level -->
          <div class="space-y-1.5">
            <span class="text-xs text-[var(--text-muted)]">Optimization</span>
            <div class="flex gap-1">
              {#each optimizationOptions as option}
                {@const isSelected = $settings.optimizationLevel === option.value}
                <button
                  type="button"
                  class="flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border
                    {isSelected 
                      ? 'bg-[var(--bg-tertiary)] border-[var(--accent)] text-[var(--text-primary)]' 
                      : 'hover:bg-[var(--bg-tertiary)] border-transparent text-[var(--text-secondary)]'}"
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
            <span class="text-xs text-[var(--text-muted)]">Debug Info</span>
            <div class="flex gap-1">
              {#each debugOptions as option}
                {@const isSelected = $settings.debugLevel === option.value}
                <button
                  type="button"
                  class="flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border
                    {isSelected 
                      ? 'bg-[var(--bg-tertiary)] border-[var(--accent)] text-[var(--text-primary)]' 
                      : 'hover:bg-[var(--bg-tertiary)] border-transparent text-[var(--text-secondary)]'}"
                  title={option.description}
                  onclick={() => setDebugLevel(option.value)}
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
              class="w-4 h-4 rounded border-[var(--border-color)] bg-[var(--bg-tertiary)] accent-[var(--accent)]"
            />
            <span class="text-xs text-[var(--text-secondary)]">Show compiler remarks</span>
          </label>
        </div>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
