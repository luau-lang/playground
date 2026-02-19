/**
 * LSP-like Extensions for CodeMirror
 * 
 * Provides diagnostics, autocomplete, and hover functionality
 * by integrating with the Luau WASM module.
 */

import { EditorView, hoverTooltip, ViewPlugin } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { autocompletion, startCompletion, type CompletionContext } from '@codemirror/autocomplete';
import type { CompletionResult, Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { getDiagnostics, getAutocomplete, getHover, getAvailableModules, type LuauCompletion } from '$lib/luau/wasm';
import { highlightLuauHtml } from './textmate';
import { activeFile } from '$lib/stores/playground';
import { get } from 'svelte/store';

// ============================================================================
// Diagnostics (Linter)
// ============================================================================

/**
 * Create a linter extension that fetches diagnostics from the WASM module.
 */
function createLuauLinter() {
  return linter(async (view): Promise<Diagnostic[]> => {
    const code = view.state.doc.toString();
    
    try {
      const { diagnostics: luauDiagnostics } = await getDiagnostics(code);

      const lineCount = view.state.doc.lines;
      const diagnostics: Diagnostic[] = [];

      for (const d of luauDiagnostics) {
        const startLineNumber = Math.min(Math.max(d.startLine + 1, 1), lineCount);
        const endLineNumber = Math.min(Math.max(d.endLine + 1, 1), lineCount);
        const startLine = view.state.doc.line(startLineNumber);
        const endLine = view.state.doc.line(endLineNumber);

        const from = startLine.from + Math.min(Math.max(d.startCol, 0), startLine.length);
        const to = endLine.from + Math.min(Math.max(d.endCol, 0), endLine.length);

        diagnostics.push({
          from: Math.max(0, from),
          to: Math.max(from, to),
          severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
          message: d.message,
        });
      }

      return diagnostics;
    } catch (error) {
      console.error('[Luau Linter] Error:', error);
      return [];
    }
  }, {
    delay: 300, // Debounce diagnostics by 300ms
  });
}

// ============================================================================
// Autocomplete
// ============================================================================

/**
 * Map Luau completion kinds to CodeMirror completion types.
 */
function mapCompletionKind(kind: LuauCompletion['kind']): string {
  switch (kind) {
    case 'function': return 'function';
    case 'variable': return 'variable';
    case 'property': return 'property';
    case 'keyword': return 'keyword';
    case 'constant': return 'constant';
    case 'type': return 'type';
    case 'module': return 'namespace';
    default: return 'text';
  }
}

function toRequirePathCompletions(modules: string[], currentFile: string): string[] {
  type VariantInfo = { exact: boolean; luau: boolean; lua: boolean };
  const variants = new Map<string, VariantInfo>();
  const currentBase = currentFile.replace(/\.(luau|lua)$/, '');

  const ensure = (base: string): VariantInfo => {
    const existing = variants.get(base);
    if (existing) return existing;
    const created: VariantInfo = { exact: false, luau: false, lua: false };
    variants.set(base, created);
    return created;
  };

  for (const mod of modules) {
    if (!mod || mod === 'main' || mod === 'main.luau' || mod.includes('/')) continue;
    if (mod === currentFile) continue;
    if (mod.replace(/\.(luau|lua)$/, '') === currentBase) continue;

    if (mod.endsWith('.luau')) {
      ensure(mod.slice(0, -5)).luau = true;
    } else if (mod.endsWith('.lua')) {
      ensure(mod.slice(0, -4)).lua = true;
    } else {
      ensure(mod).exact = true;
    }
  }

  const completions: string[] = [];
  for (const [base, info] of variants) {
    const count = Number(info.exact) + Number(info.luau) + Number(info.lua);

    // Prefer extensionless ./path only when it resolves unambiguously.
    if (count === 1) {
      completions.push(`./${base}`);
      continue;
    }

    if (info.exact) completions.push(`./${base}`);
    if (info.luau) completions.push(`./${base}.luau`);
    if (info.lua) completions.push(`./${base}.lua`);
  }

  return completions.sort((a, b) => a.localeCompare(b));
}

function getRequireStringBounds(lineText: string, colInLine: number): { from: number; to: number } | null {
  const requireMatch = lineText.match(/require\s*\(\s*(["'])([^"']*)/);
  if (!requireMatch) return null;

  const quoteChar = requireMatch[1];
  const quoteStart = lineText.indexOf(quoteChar, lineText.indexOf('require'));
  const afterQuote = quoteStart + 1;
  if (colInLine < afterQuote) return null;

  const restOfLine = lineText.substring(afterQuote);
  const closingQuoteIdx = restOfLine.indexOf(quoteChar);
  const closePos = closingQuoteIdx >= 0 ? afterQuote + closingQuoteIdx : lineText.length;
  if (colInLine > closePos) return null;

  return { from: afterQuote, to: closePos };
}

/**
 * Check if we're inside a require string and provide module completions.
 */
async function requireCompletionSource(context: CompletionContext): Promise<CompletionResult | null> {
  // Check if we're inside require("...") or require('...')
  const line = context.state.doc.lineAt(context.pos);
  const lineText = line.text;
  const colInLine = context.pos - line.from;
  const bounds = getRequireStringBounds(lineText, colInLine);
  if (!bounds) {
    return null;
  }
  
  // We're inside a require string! Get available modules
  try {
    const modules = await getAvailableModules();
    const requirePaths = toRequirePathCompletions(modules, get(activeFile));

    if (requirePaths.length === 0) {
      return null;
    }

    const options = requirePaths.map((path) => ({
      label: path,
      type: 'namespace',
      detail: 'module',
    }));
    
    return {
      from: line.from + bounds.from,
      to: line.from + bounds.to,
      options,
      validFor: /^[^"']*$/,
    };
  } catch (error) {
    console.error('[Luau Require Autocomplete] Error:', error);
    return null;
  }
}

/**
 * Create an autocomplete source that fetches completions from the WASM module.
 */
async function luauCompletionSource(context: CompletionContext): Promise<CompletionResult | null> {
  // First check if we're inside a require statement
  const requireResult = await requireCompletionSource(context);
  if (requireResult) {
    return requireResult;
  }
  
  // Check for property access (table. or table:)
  const beforeDot = context.matchBefore(/[\w.:]+[.:]/);
  const word = context.matchBefore(/[\w]*/);
  
  // Determine if we should trigger autocomplete
  const afterDotOrColon = beforeDot !== null;
  const hasWord = word && word.from !== word.to;
  
  // Only trigger if:
  // - Explicit activation (Ctrl+Space)
  // - After . or : (property access)
  // - Has a word being typed
  if (!context.explicit && !afterDotOrColon && !hasWord) {
    return null;
  }
  
  const code = context.state.doc.toString();
  const pos = context.pos;
  
  // Convert position to line/column
  const line = context.state.doc.lineAt(pos);
  const lineNum = line.number - 1; // 0-indexed
  const col = pos - line.from;
  
  try {
    const items = await getAutocomplete(code, lineNum, col);
    
    if (items.length === 0) {
      return null;
    }
    
    const completions: Completion[] = items.map((item) => ({
      label: item.label,
      type: mapCompletionKind(item.kind),
      detail: item.detail,
      deprecated: item.deprecated,
    }));
    
    // Calculate the correct 'from' position
    // If we're after a . or :, start from the current word (after the accessor)
    // Otherwise, start from the beginning of the word being typed
    const from = word ? word.from : pos;
    
    return {
      from,
      options: completions,
      validFor: /^[\w]*$/,
    };
  } catch (error) {
    console.error('[Luau Autocomplete] Error:', error);
    return null;
  }
}

/**
 * Create an autocomplete extension.
 */
function createLuauAutocomplete(): Extension[] {
  // Plugin to trigger completions after ./: and while typing inside require("...").
  const triggerOnAccessor = ViewPlugin.fromClass(class {
    constructor(readonly view: EditorView) {}
  }, {
    eventHandlers: {
      keyup: (event, view) => {
        if (event.key === '.' || event.key === ':') {
          // Small delay to let the character be inserted first
          setTimeout(() => startCompletion(view), 10);
          return;
        }

        // Trigger completion as soon as require string editing starts/continues.
        if (event.key === '"' || event.key === "'" || event.key === 'Backspace' || event.key.length === 1) {
          const head = view.state.selection.main.head;
          const line = view.state.doc.lineAt(head);
          const colInLine = head - line.from;
          if (getRequireStringBounds(line.text, colInLine)) {
            setTimeout(() => startCompletion(view), 10);
          }
        }
      }
    }
  });

  return [
    autocompletion({
      override: [luauCompletionSource],
      activateOnTyping: true,
      activateOnTypingDelay: 100,
      icons: true,
      closeOnBlur: true,
    }),
    triggerOnAccessor,
  ];
}

// ============================================================================
// Hover Tooltips
// ============================================================================

/**
 * Create a hover tooltip extension that shows type information.
 */
function createLuauHover() {
  return hoverTooltip(async (view, pos, side): Promise<Tooltip | null> => {
    const code = view.state.doc.toString();
    
    // Convert position to line/column
    const line = view.state.doc.lineAt(pos);
    const lineNum = line.number - 1; // 0-indexed
    const col = pos - line.from;
    
    try {
      const content = await getHover(code, lineNum, col);
      
      if (!content) {
        return null;
      }
      
      // Precompute highlighted HTML if the content is a fenced luau block
      let highlighted: string | null = null;
      const codeBlockMatch = content ? content.match(/```luau\n([\s\S]*?)\n```/) : null;
      if (codeBlockMatch) {
        highlighted = await highlightLuauHtml(codeBlockMatch[1]);
      }

      return {
        pos,
        above: true,
        create(): { dom: HTMLElement } {
          const dom = document.createElement('div');
          dom.className = 'cm-luau-hover';
          dom.style.cssText = `
            background: transparent;
            border: none;
            padding: 0;
            max-width: 450px;
            font-size: 13px;
            font-family: var(--font-mono);
            line-height: 1.5;
            overflow: hidden;
          `;
          
          // Render code block with syntax highlighting
          if (highlighted) {
            // Type info section
            const codeWrapper = document.createElement('div');
            codeWrapper.style.cssText = `
              padding: 10px 14px;
              background: var(--bg-secondary);
              // border-left: 3px solid var(--accent);
            `;
            const code = document.createElement('code');
            code.innerHTML = highlighted;
            code.style.cssText = `
              color: var(--text-primary);
              white-space: pre-wrap;
            `;
            codeWrapper.appendChild(code);
            dom.appendChild(codeWrapper);
          } else {
            const textWrapper = document.createElement('div');
            textWrapper.style.cssText = `
              padding: 10px 14px;
              background: var(--bg-secondary);
              // border-left: 3px solid var(--accent);
              color: var(--text-primary);
              white-space: pre-wrap;
            `;
            textWrapper.textContent = content;
            dom.appendChild(textWrapper);
          }
          
          return { dom };
        },
      };
    } catch (error) {
      console.error('[Luau Hover] Error:', error);
      return null;
    }
  }, {
    hoverTime: 150,
  });
}

// ============================================================================
// Combined Extension
// ============================================================================

/**
 * Create all LSP-like extensions for Luau.
 */
export function luauLspExtensions(): Extension[] {
  return [
    createLuauLinter(),
    ...createLuauAutocomplete(),
    createLuauHover(),
  ];
}

// Export individual extensions for flexibility
export { createLuauLinter, createLuauAutocomplete, createLuauHover };
