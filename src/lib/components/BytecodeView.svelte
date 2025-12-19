<script lang="ts">
  import { files, activeFile } from '$lib/stores/playground';
  import { settings, showBytecode, toggleBytecode } from '$lib/stores/settings';
  import { getBytecode } from '$lib/luau/wasm';
  import { Button } from '$lib/components/ui/button';
  import { Icon } from '$lib/icons';

  interface ParsedInstruction {
    lineNum: string;
    label: string;
    opcode: string;
    operands: string;
    comment: string;
  }

  interface ParsedFunction {
    name: string;
    params: string;
    instructions: ParsedInstruction[];
  }

  let bytecodeContent = $state('');
  let parsedFunctions = $state<ParsedFunction[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Refresh bytecode when file content or settings change
  $effect(() => {
    if ($showBytecode) {
      const code = $files[$activeFile] || '';
      const opts = $settings;
      refreshBytecode(code, opts.optimizationLevel, opts.debugLevel, opts.compilerRemarks, opts.outputFormat);
    }
  });

  function parseBytecode(raw: string): ParsedFunction[] {
    const functions: ParsedFunction[] = [];
    const lines = raw.split('\n');
    let currentFunc: ParsedFunction | null = null;
    let instructionNum = 0;

    for (const line of lines) {
      // Match function header: "Function 0 (name):" or "Function 0 (??):"
      const funcMatch = line.match(/^Function\s+(\d+)\s*\(([^)]*)\)\s*:?\s*$/);
      if (funcMatch) {
        if (currentFunc) {
          functions.push(currentFunc);
        }
        currentFunc = {
          name: funcMatch[2] || `anon_${funcMatch[1]}`,
          params: '??',
          instructions: [],
        };
        instructionNum = 0;
        continue;
      }

      // Skip empty lines
      if (!line.trim()) continue;

      // Match instruction line: "5: LOADK R2 K0 ['Hello, ']" or "5: L0: ADD R2 R2 R7"
      const instrMatch = line.match(/^(\d+):\s*(?:(L\d+):\s*)?(\w+)\s+(.*)$/);
      if (instrMatch && currentFunc) {
        instructionNum++;
        const [, srcLine, label, opcode, rest] = instrMatch;
        
        // Parse operands and comment from rest
        // Comments are in brackets like ['Hello'] or [print] or [1]
        let operands = rest;
        let comment = '';
        
        const commentMatch = rest.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
        if (commentMatch) {
          operands = commentMatch[1].trim();
          comment = commentMatch[2];
        }

        currentFunc.instructions.push({
          lineNum: String(instructionNum),
          label: label || '',
          opcode,
          operands,
          comment,
        });
      }
    }

    if (currentFunc) {
      functions.push(currentFunc);
    }

    return functions;
  }

  async function refreshBytecode(
    code: string,
    optimizationLevel: number,
    debugLevel: number,
    showRemarks: boolean,
    outputFormat: number
  ) {
    isLoading = true;
    error = null;
    
    try {
      const result = await getBytecode(code, optimizationLevel, debugLevel, outputFormat, showRemarks);
      if (result.success) {
        bytecodeContent = result.bytecode;
        parsedFunctions = parseBytecode(result.bytecode);
      } else {
        error = result.error || 'Compilation failed';
        bytecodeContent = '';
        parsedFunctions = [];
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes('is not a function') || errMsg.includes('undefined')) {
        error = 'WASM module needs to be rebuilt.\nRun: cd wasm && ./build.sh';
      } else {
        error = errMsg;
      }
      bytecodeContent = '';
      parsedFunctions = [];
    } finally {
      isLoading = false;
    }
  }
</script>

{#if $showBytecode}
  <div class="flex flex-col h-full border-t sm:border-t-0 sm:border-l border-[var(--border-color)] bg-[var(--bg-editor)]">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-[var(--text-primary)]">Bytecode</span>
        {#if isLoading}
          <span class="text-xs text-[var(--text-muted)] animate-pulse">compiling...</span>
        {/if}
      </div>
      <Button size="sm" variant="ghost" onclick={toggleBytecode} class="h-6 w-6 p-0 min-w-0">
        <Icon name="x" size={16} />
      </Button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed min-h-0 bytecode-view">
      {#if error}
        <div class="text-[var(--color-error-500)]">
          <div class="font-semibold mb-1">Compilation Error:</div>
          <pre class="whitespace-pre-wrap">{error}</pre>
        </div>
      {:else if parsedFunctions.length > 0}
        {#each parsedFunctions as func, funcIdx}
          <div class="mb-4">
            <!-- Function header -->
            <div class="func-header">
              <span class="keyword">function</span>
              <span class="func-name">{func.name}</span>
              <span class="params">({func.params})</span>
            </div>
            
            <!-- Instructions table -->
            <table class="bytecode-table">
              <tbody>
                {#each func.instructions as instr}
                  <tr>
                    <td class="line-num">{instr.lineNum}</td>
                    <td class="label">{instr.label}</td>
                    <td class="opcode">{instr.opcode}</td>
                    <td class="operands">{instr.operands}</td>
                    <td class="comment">{#if instr.comment}; {instr.comment}{/if}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            
            <!-- Function end -->
            <div class="func-end">
              <span class="keyword">end</span>
            </div>
          </div>
        {/each}
      {:else if bytecodeContent}
        <!-- Fallback to raw output if parsing failed -->
        <pre class="text-[var(--text-primary)] whitespace-pre">{bytecodeContent}</pre>
      {:else if !isLoading}
        <span class="text-[var(--text-muted)] italic">No bytecode generated</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Light mode colors */
  .bytecode-view {
    --bc-keyword: oklch(0.45 0.2 25);
    --bc-func-name: oklch(0.45 0.2 25);
    --bc-opcode: oklch(0.45 0.18 85);
    --bc-register: oklch(0.45 0.22 250);
    --bc-constant: oklch(0.45 0.18 145);
    --bc-comment: oklch(0.5 0.05 250);
    --bc-line-num: oklch(0.55 0.02 250);
    --bc-label: oklch(0.5 0.22 30);
  }

  /* Dark mode colors */
  :global(.dark) .bytecode-view {
    --bc-keyword: oklch(0.7 0.18 25);
    --bc-func-name: oklch(0.7 0.18 25);
    --bc-opcode: oklch(0.78 0.15 85);
    --bc-register: oklch(0.72 0.18 250);
    --bc-constant: oklch(0.7 0.15 145);
    --bc-comment: oklch(0.55 0.02 250);
    --bc-line-num: oklch(0.5 0.02 250);
    --bc-label: oklch(0.68 0.2 30);
  }

  .func-header, .func-end {
    padding: 2px 0;
  }

  .keyword {
    color: var(--bc-keyword);
  }

  .func-name {
    color: var(--bc-func-name);
    margin-left: 0.5em;
  }

  .params {
    color: var(--text-secondary);
  }

  .bytecode-table {
    border-collapse: collapse;
    margin: 0.25em 0;
  }

  .bytecode-table td {
    padding: 1px 0;
    white-space: pre;
    vertical-align: top;
  }

  .bytecode-table .line-num {
    color: var(--bc-line-num);
    text-align: right;
    padding-right: 1.5em;
    min-width: 3em;
    user-select: none;
  }

  .bytecode-table .label {
    color: var(--bc-label);
    min-width: 3em;
    padding-right: 0.5em;
  }

  .bytecode-table .opcode {
    color: var(--bc-opcode);
    min-width: 10em;
    padding-right: 1em;
    font-weight: 500;
  }

  .bytecode-table .operands {
    color: var(--bc-register);
    min-width: 10em;
    padding-right: 1em;
  }

  .bytecode-table .comment {
    color: var(--bc-comment);
  }

  .func-end {
    margin-top: 2px;
  }
</style>
