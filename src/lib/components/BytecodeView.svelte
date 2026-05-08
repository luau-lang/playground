<script lang="ts">
  import { tick } from 'svelte';
  import { files, activeFile, cursorLine } from '$lib/stores/playground';
  import { settings, showBytecode, toggleBytecode } from '$lib/stores/settings';
  import { getBytecode } from '$lib/luau/wasm';
  import Button from '$lib/components/Button.svelte';
  import { Icon } from '$lib/icons';

  interface ParsedLine {
    raw: string;
    sourceLine: number | null;  // For highlighting
    type: 'empty' | 'func-header' | 'bytecode' | 'ir-comment' | 'asm' | 'comment' | 'other';
  }

  const ROW_HEIGHT = 20;
  const VERTICAL_PADDING = 24;
  const VERTICAL_PADDING_TOP = VERTICAL_PADDING / 2;
  const OVERSCAN_ROWS = 30;
  const AUTO_SCROLL_MAX_DISTANCE_VIEWPORTS = 5;

  let bytecodeContent = $state('');
  let parsedLines = $state<ParsedLine[]>([]);
  let sourceLineIndexes = $state<Record<number, number>>({});
  let highlightedLineCache = new Map<number, string>();
  let outputFormat = $state(0);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let scrollTop = $state(0);
  let viewportHeight = $state(0);

  let visibleStart = $derived(
    Math.max(0, Math.floor(Math.max(0, scrollTop - VERTICAL_PADDING_TOP) / ROW_HEIGHT) - OVERSCAN_ROWS)
  );
  let visibleEnd = $derived(
    Math.min(
      parsedLines.length,
      Math.ceil(Math.max(0, scrollTop - VERTICAL_PADDING_TOP + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS
    )
  );
  let visibleLines = $derived(parsedLines.slice(visibleStart, visibleEnd));
  let visibleOffset = $derived(VERTICAL_PADDING_TOP + visibleStart * ROW_HEIGHT);
  let virtualContentHeight = $derived(parsedLines.length * ROW_HEIGHT + VERTICAL_PADDING);

  // Refresh bytecode when file content or settings change
  $effect(() => {
    if ($showBytecode) {
      const code = $files[$activeFile] || '';
      const opts = $settings;
      outputFormat = opts.outputFormat;
      refreshBytecode(code, opts.optimizationLevel, opts.debugLevel, opts.compilerRemarks, opts.outputFormat);
    }
  });

  function makeLine(raw: string, sourceLine: number | null, type: ParsedLine['type']): ParsedLine {
    return { raw, sourceLine, type };
  }

  function getHighlightedLine(index: number, line: ParsedLine): string {
    const cached = highlightedLineCache.get(index);
    if (cached != null) {
      return cached;
    }

    const highlighted = highlightLine(line.raw, line.type);
    highlightedLineCache.set(index, highlighted);
    return highlighted;
  }

  function parseLines(raw: string): ParsedLine[] {
    const lines = raw.split('\n');
    const result: ParsedLine[] = [];
    let currentSourceLine: number | null = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Empty line - reset context
      if (!trimmed) {
        result.push(makeLine(line, null, 'empty'));
        continue;
      }

      // VM bytecode line: starts with "N: " where N is line number
      // e.g., "5: LOADK R2 K0 ['Hello']" or "14: L0: ADD R2 R2 R7"
      const bytecodeMatch = trimmed.match(/^(\d+):\s/);
      if (bytecodeMatch) {
        currentSourceLine = parseInt(bytecodeMatch[1], 10);
        result.push(makeLine(line, currentSourceLine, 'bytecode'));
        continue;
      }

      // Function header (VM format): "Function N (name):" - reset context
      if (trimmed.match(/^Function\s+\d+\s*\([^)]*\)\s*:?$/)) {
        currentSourceLine = null;
        result.push(makeLine(line, null, 'func-header'));
        continue;
      }

      // IR/ASM function header: "; function name() line N" - reset context
      if (trimmed.match(/^;\s*function\s/)) {
        currentSourceLine = null;
        result.push(makeLine(line, null, 'func-header'));
        continue;
      }

      // Block header: "# bb_name:" - reset context (new block)
      if (trimmed.match(/^#\s*bb_\w+:/)) {
        currentSourceLine = null;
        result.push(makeLine(line, null, 'ir-comment'));
        continue;
      }

      // IR comment lines starting with # - inherit current source line
      if (trimmed.startsWith('#')) {
        result.push(makeLine(line, currentSourceLine, 'ir-comment'));
        continue;
      }

      // Block metadata comments (successors, predecessors, in/out regs) - no source line
      if (trimmed.match(/^;\s*(successors|predecessors|in regs|out regs):/)) {
        result.push(makeLine(line, null, 'comment'));
        continue;
      }

      // Comment lines starting with ; - no source line context
      if (trimmed.startsWith(';')) {
        result.push(makeLine(line, null, 'comment'));
        continue;
      }

      // Assembly labels (.L11:) and instructions - inherit current source line
      // Labels are just internal jump targets, not boundaries between source lines
      if (trimmed.startsWith('.') || trimmed.match(/^[a-z]/i)) {
        result.push(makeLine(line, currentSourceLine, 'asm'));
        continue;
      }

      result.push(makeLine(line, currentSourceLine, 'other'));
    }
    
    return result;
  }

  function buildSourceLineIndexes(lines: ParsedLine[]): Record<number, number> {
    const indexes: Record<number, number> = {};
    for (let i = 0; i < lines.length; i += 1) {
      const sourceLine = lines[i].sourceLine;
      if (sourceLine != null && indexes[sourceLine] == null) {
        indexes[sourceLine] = i;
      }
    }
    return indexes;
  }

  // Highlight IR instruction arguments
  function highlightIrArgs(args: string): string {
    return args
      // %N variables
      .replace(/(%\d+)\b/g, '<span class="hl-ir-var">$1</span>')
      // Registers R0-R99
      .replace(/\b(R\d+)\b/g, '<span class="hl-constant">$1</span>')
      // Constants K0-K99
      .replace(/\b(K\d+)\b/g, '<span class="hl-constant">$1</span>')
      // String literals in parens like ('Hello')
      .replace(/\('([^']+)'\)/g, '(<span class="hl-string">\'$1\'</span>)')
      // Numbers with suffixes like 0i, 4u, tstring
      .replace(/\b(\d+[iu]?)\b/g, '<span class="hl-constant">$1</span>')
      // Type names like tstring, tany
      .replace(/\b(t[a-z]+)\b/g, '<span class="hl-type">$1</span>');
  }

  // Highlight assembly instruction arguments
  function highlightAsmArgs(args: string): string {
    return args
      // x86 registers: rax, rbx, r12, xmm0, etc.
      .replace(/\b(r[0-9]{1,2}[dwb]?|[re]?[abcd]x|[re]?[sd]i|[re]?[sb]p|[re]?ip|xmm\d+|ymm\d+|zmm\d+)\b/gi, '<span class="hl-constant">$1</span>')
      // ARM registers: x0-x30, w0-w30, q0-q31, v0-v31, sp, lr, etc.
      .replace(/\b([xwqvsd]\d{1,2}|sp|lr|pc|fp)\b/gi, '<span class="hl-constant">$1</span>')
      // ARM immediate values: #32, #1700, #0x10
      .replace(/#(0x[0-9a-fA-F]+|\d+)/g, '#<span class="hl-constant">$1</span>')
      // Memory operands with brackets [...]
      .replace(/\[([^\]]+)\]/g, (match, inner) => {
        // Highlight registers and numbers inside brackets
        const highlighted = inner
          .replace(/\b(r[0-9]{1,2}[dwb]?|[re]?[abcd]x|[re]?[sd]i|[re]?[sb]p|[re]?ip|[xwqvsd]\d{1,2}|sp|lr|pc|fp)\b/gi, '<span class="hl-constant">$1</span>')
          .replace(/\b(0x[0-9a-fA-F]+|\d+h?)\b/g, '<span class="hl-constant">$1</span>')
          // ARM immediates inside brackets
          .replace(/#(0x[0-9a-fA-F]+|\d+)/g, '#<span class="hl-constant">$1</span>');
        return `[${highlighted}]`;
      })
      // Hex numbers and plain numbers
      .replace(/\b(0x[0-9a-fA-F]+)\b/g, '<span class="hl-constant">$1</span>')
      // Labels like .L14
      .replace(/(\.[A-Za-z0-9_]+)\b/g, '<span class="hl-label">$1</span>');
  }

  // Syntax highlight a line based on its content
  function highlightLine(line: string, type: string): string {
    // Escape HTML
    let escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (type === 'func-header') {
      // VM: "Function N (name):"
      escaped = escaped.replace(
        /^(Function\s+)(\d+)(\s*\()([^)]*)(\)\s*:?)$/,
        '<span class="hl-keyword">$1</span><span class="hl-number">$2</span>$3<span class="hl-func">$4</span>$5'
      );
      // IR/ASM: "; function name() line N"
      escaped = escaped.replace(
        /^(;\s*)(function\s+)(\w*)(\([^)]*\))(\s*line\s+)(\d+)$/,
        '<span class="hl-comment">$1</span><span class="hl-keyword">$2</span><span class="hl-func">$3</span>$4<span class="hl-comment">$5</span><span class="hl-number">$6</span>'
      );
      return escaped;
    }

    if (type === 'bytecode') {
      // Highlight: "N: [L0: ]OPCODE operands [comment]"
      escaped = escaped.replace(
        /^(\s*)(\d+)(:\s*)(?:(L\d+)(:\s*))?(\w+)(\s+)([^\[]*?)(\s*\[([^\]]+)\])?$/,
        (_, indent, lineNum, colon1, label, colon2, opcode, space1, operands, bracketPart, comment) => {
          let result = `${indent}<span class="hl-linenum">${lineNum}</span>${colon1}`;
          if (label) {
            result += `<span class="hl-label">${label}</span>${colon2}`;
          }
          result += `<span class="hl-opcode">${opcode}</span>${space1}`;
          // Highlight registers (R0-R99), constants (K0-K99), labels (L0-L99), and plain numbers
          const highlightedOperands = operands
            .replace(/\b(R\d+)\b/g, '<span class="hl-constant">$1</span>')
            .replace(/\b(K\d+)\b/g, '<span class="hl-constant">$1</span>')
            .replace(/\b(L\d+)\b/g, '<span class="hl-label">$1</span>')
            .replace(/\b(-?\d+)\b/g, '<span class="hl-constant">$1</span>');
          result += highlightedOperands;
          if (comment) {
            // Highlight string literals in comments (e.g., 'Hello')
            const highlightedComment = comment.replace(
              /^'(.+)'$/,
              '<span class="hl-string">\'$1\'</span>'
            );
            result += `<span class="hl-comment"> [</span>${highlightedComment}<span class="hl-comment">]</span>`;
          }
          return result;
        }
      );
      return escaped;
    }

    if (type === 'ir-comment') {
      // Block headers: "# bb_name:" - highlight block name
      escaped = escaped.replace(
        /^(#\s*)(bb_\w+)(:.*)?$/,
        '<span class="hl-ir-prefix">$1</span><span class="hl-block">$2</span><span class="hl-comment">$3</span>'
      );
      // IR instructions with assignment: "#   %N = OP args"
      escaped = escaped.replace(
        /^(#\s+)(%\d+)(\s*=\s*)(\w+)(.*)$/,
        (_, prefix, varName, eq, op, args) => {
          const highlightedArgs = highlightIrArgs(args);
          return `<span class="hl-ir-prefix">${prefix}</span><span class="hl-ir-var">${varName}</span>${eq}<span class="hl-ir-op">${op}</span>${highlightedArgs}`;
        }
      );
      // IR instructions without assignment: "#   OP args"
      if (!escaped.includes('hl-ir-op')) {
        escaped = escaped.replace(
          /^(#\s+)(\w+)(\s+.*)$/,
          (_, prefix, op, args) => {
            const highlightedArgs = highlightIrArgs(args);
            return `<span class="hl-ir-prefix">${prefix}</span><span class="hl-ir-op">${op}</span>${highlightedArgs}`;
          }
        );
      }
      // Standalone # line
      if (!escaped.includes('hl-')) {
        escaped = escaped.replace(/^(#.*)$/, '<span class="hl-ir-prefix">$1</span>');
      }
      return escaped;
    }

    if (type === 'comment') {
      return `<span class="hl-comment">${escaped}</span>`;
    }

    if (type === 'asm') {
      // Assembly label: ".L11:"
      escaped = escaped.replace(
        /^(\s*)(\.[A-Za-z0-9_]+)(:)$/,
        '$1<span class="hl-label">$2</span>$3'
      );
      // Assembly instruction: "op args"
      if (!escaped.includes('hl-label')) {
        escaped = escaped.replace(
          /^(\s*)([a-z][a-z0-9.]*)(\s+)(.*)$/i,
          (_, indent, op, space, args) => {
            const highlightedArgs = highlightAsmArgs(args);
            return `${indent}<span class="hl-asm-op">${op}</span>${space}${highlightedArgs}`;
          }
        );
      }
      return escaped;
    }

    // Type annotations: "type <- type, type" (the <- is HTML-escaped as &lt;-)
    escaped = escaped.replace(
      /^(\w+)(\s*&lt;-\s*)(.+)$/,
      (_, left, arrow, right) => {
        // Highlight type names on the right side too
        const highlightedRight = right.replace(/\b(\w+)\b/g, '<span class="hl-type">$1</span>');
        return `<span class="hl-type">${left}</span><span class="hl-comment"> ← </span>${highlightedRight}`;
      }
    );

    return escaped;
  }

  async function refreshBytecode(
    code: string,
    optimizationLevel: number,
    debugLevel: number,
    showRemarks: boolean,
    format: number
  ) {
    isLoading = true;
    error = null;
    
    try {
      const result = await getBytecode(code, optimizationLevel, debugLevel, format, showRemarks);
      if (result.success) {
        const lines = parseLines(result.bytecode);
        highlightedLineCache = new Map();
        bytecodeContent = result.bytecode;
        parsedLines = lines;
        sourceLineIndexes = buildSourceLineIndexes(lines);
      } else {
        highlightedLineCache = new Map();
        error = result.error || 'Compilation failed';
        bytecodeContent = '';
        parsedLines = [];
        sourceLineIndexes = {};
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes('is not a function') || errMsg.includes('undefined')) {
        error = 'WASM module needs to be rebuilt.\nRun: cd wasm && ./build.sh';
      } else {
        error = errMsg;
      }
      highlightedLineCache = new Map();
      bytecodeContent = '';
      parsedLines = [];
      sourceLineIndexes = {};
    } finally {
      isLoading = false;
    }
  }

  function getFormatLabel(format: number): string {
    switch (format) {
      case 0: return 'VM Bytecode';
      case 1: return 'IR';
      case 2: return 'x64 Assembly';
      case 3: return 'ARM64 Assembly';
      default: return 'Bytecode';
    }
  }

  let bytecodeContainer: HTMLElement | undefined = $state();
  let cursorScrollToken = 0;

  function handleBytecodeScroll(event: Event) {
    scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  }

  async function scrollToCursorLine(line: number, index: number) {
    const token = ++cursorScrollToken;

    await tick();
    await new Promise(requestAnimationFrame);

    if (token !== cursorScrollToken || !bytecodeContainer || $cursorLine !== line) {
      return;
    }

    const lineTop = VERTICAL_PADDING_TOP + index * ROW_HEIGHT;
    const lineBottom = lineTop + ROW_HEIGHT;
    const currentScrollTop = bytecodeContainer.scrollTop;
    const viewport = bytecodeContainer.clientHeight;
    const currentScrollBottom = currentScrollTop + viewport;

    let targetScrollTop: number | null = null;
    let distance = 0;
    if (lineTop < currentScrollTop) {
      distance = currentScrollTop - lineTop;
      targetScrollTop = Math.max(0, lineTop - ROW_HEIGHT * 3);
    } else if (lineBottom > currentScrollBottom) {
      distance = lineBottom - currentScrollBottom;
      targetScrollTop = Math.max(0, lineTop - ROW_HEIGHT * 3);
    }

    if (targetScrollTop != null) {
      // Long smooth scrolls force the virtual list through many intermediate windows.
      const behavior = distance <= viewport * AUTO_SCROLL_MAX_DISTANCE_VIEWPORTS ? 'smooth' : 'auto';
      bytecodeContainer.scrollTo({
        top: targetScrollTop,
        behavior
      });

      if (behavior === 'auto') {
        scrollTop = bytecodeContainer.scrollTop;
      }
    }
  }

  // Scroll the first highlighted line into view when cursorLine changes
  $effect(() => {
    const line = $cursorLine;
    if (line == null || !bytecodeContainer) return;
    const index = sourceLineIndexes[line];
    if (index == null) return;

    void scrollToCursorLine(line, index);
  });
</script>

{#if $showBytecode}
  <div class="flex flex-col h-full border-t sm:border-t-0 sm:border-l border-(--border-color) bg-(--bg-editor)">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-(--border-color) bg-(--bg-secondary) shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-(--text-primary)">{getFormatLabel(outputFormat)}</span>
        {#if isLoading}
          <span class="text-xs text-(--text-muted) animate-pulse">compiling...</span>
        {/if}
      </div>
      <Button size="none" variant="ghost" onclick={toggleBytecode} class="h-6 w-6 p-0 min-w-0" title="Close bytecode view">
        <Icon name="x" size={16} />
      </Button>
    </div>

    <!-- Content -->
    <div
      class="flex-1 overflow-auto font-mono text-xs min-h-0 bytecode-view"
      bind:this={bytecodeContainer}
      bind:clientHeight={viewportHeight}
      onscroll={handleBytecodeScroll}
    >
      {#if error}
        <div class="text-error-500 p-3">
          <div class="font-semibold mb-1">Compilation Error:</div>
          <pre class="whitespace-pre-wrap">{error}</pre>
        </div>
      {:else if parsedLines.length > 0}
        <div class="bytecode-content" style={`height: ${virtualContentHeight}px;`}>
          <div class="virtual-lines" style={`transform: translateY(${visibleOffset}px);`}>
            {#each visibleLines as line, i (visibleStart + i)}
              <div 
                class="line" 
                class:highlighted={line.sourceLine === $cursorLine}
                class:empty={line.type === 'empty'}
              >
                {@html getHighlightedLine(visibleStart + i, line)}
              </div>
            {/each}
          </div>
        </div>
      {:else if bytecodeContent}
        <pre class="text-(--text-primary) whitespace-pre p-3">{bytecodeContent}</pre>
      {:else if !isLoading}
        <span class="text-(--text-muted) italic p-3">No bytecode generated</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Syntax colors using shared CSS variables from app.css (matches editor theme) */
  .bytecode-view {
    /* Light mode */
    --hl-keyword: var(--color-blue-1000);
    --hl-func: var(--color-carmine-900);
    --hl-opcode: var(--color-blue-1000);
    --hl-register: var(--color-blue-900);
    --hl-constant: var(--color-purple-1000);
    --hl-string: var(--color-green-900);
    --hl-comment: var(--color-extended-gray-600);
    --hl-linenum: var(--color-extended-gray-600);
    --hl-label: var(--color-carmine-900);
    --hl-number: var(--color-purple-1000);
    --hl-block: var(--color-carmine-900);
    --hl-type: var(--color-blue-900);
    --hl-ir-prefix: var(--color-extended-gray-600);
    --hl-ir-var: var(--color-purple-1000);
    --hl-ir-op: var(--color-blue-1000);
    --hl-ir-args: var(--color-extended-gray-900);
    --hl-asm-op: var(--color-blue-1000);
    --hl-asm-args: var(--color-extended-gray-900);
    --hl-highlight-bg: color-mix(in srgb, var(--color-blue-1000) 8%, transparent);
  }

  /* Dark mode */
  :global(.dark) .bytecode-view {
    --hl-keyword: var(--color-blue-500);
    --hl-func: var(--color-carmine-400);
    --hl-opcode: var(--color-blue-500);
    --hl-register: var(--color-blue-400);
    --hl-constant: var(--color-purple-500);
    --hl-string: var(--color-green-400);
    --hl-comment: var(--color-extended-gray-600);
    --hl-linenum: var(--color-extended-gray-600);
    --hl-label: var(--color-carmine-400);
    --hl-number: var(--color-purple-500);
    --hl-block: var(--color-carmine-400);
    --hl-type: var(--color-blue-400);
    --hl-ir-prefix: var(--color-extended-gray-600);
    --hl-ir-var: var(--color-purple-500);
    --hl-ir-op: var(--color-blue-500);
    --hl-ir-args: var(--color-extended-gray-300);
    --hl-asm-op: var(--color-blue-500);
    --hl-asm-args: var(--color-extended-gray-300);
    --hl-highlight-bg: color-mix(in srgb, var(--color-blue-500) 15%, transparent);
  }

  .bytecode-content {
    min-width: 100%;
    position: relative;
  }

  .virtual-lines {
    left: 0;
    min-width: 100%;
    position: absolute;
    right: 0;
    top: 0;
    will-change: transform;
  }

  .line {
    box-sizing: border-box;
    height: 20px;
    line-height: 20px;
    min-width: 100%;
    padding: 0 0.75rem;
    white-space: pre;
    width: max-content;
  }

  .line.empty {
    height: 20px;
  }

  .line.highlighted {
    background: var(--hl-highlight-bg);
  }

  /* Syntax highlighting classes */
  :global(.hl-keyword) {
    color: var(--hl-keyword);
    font-weight: 500;
  }

  :global(.hl-func) {
    color: var(--hl-func);
  }

  :global(.hl-opcode) {
    color: var(--hl-opcode);
    font-weight: 500;
  }

  :global(.hl-register) {
    color: var(--hl-register);
  }

  :global(.hl-constant) {
    color: var(--hl-constant);
  }

  :global(.hl-string) {
    color: var(--hl-string);
  }

  :global(.hl-comment) {
    color: var(--hl-comment);
  }

  :global(.hl-linenum) {
    color: var(--hl-linenum);
  }

  :global(.hl-label) {
    color: var(--hl-label);
    font-weight: 500;
  }

  :global(.hl-number) {
    color: var(--hl-number);
  }

  :global(.hl-block) {
    color: var(--hl-block);
    font-weight: 600;
  }

  :global(.hl-type) {
    color: var(--hl-type);
  }

  :global(.hl-ir-prefix) {
    color: var(--hl-ir-prefix);
  }

  :global(.hl-ir-var) {
    color: var(--hl-ir-var);
  }

  :global(.hl-ir-op) {
    color: var(--hl-ir-op);
    font-weight: 500;
  }

  :global(.hl-ir-args) {
    color: var(--hl-ir-args);
  }

  :global(.hl-asm-op) {
    color: var(--hl-asm-op);
    font-weight: 500;
  }

  :global(.hl-asm-args) {
    color: var(--hl-asm-args);
  }
</style>
