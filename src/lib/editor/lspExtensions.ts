/**
 * LSP-like Extensions for CodeMirror
 * 
 * Provides diagnostics, autocomplete, and hover functionality
 * by integrating with the Luau WASM module.
 */

import { EditorView, hoverTooltip, ViewPlugin } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
import { linter, lintGutter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { autocompletion, CompletionContext, startCompletion } from '@codemirror/autocomplete';
import type { CompletionResult, Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { getDiagnostics, getAutocomplete, getHover, getAvailableModules, type LuauDiagnostic, type LuauCompletion } from '$lib/luau/wasm';

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
      const luauDiagnostics = await getDiagnostics(code);
      
      return luauDiagnostics.map((d: LuauDiagnostic) => {
        // Convert line/column to document positions
        const startLine = view.state.doc.line(d.startLine + 1);
        const endLine = view.state.doc.line(d.endLine + 1);
        
        const from = startLine.from + Math.min(d.startCol, startLine.length);
        const to = endLine.from + Math.min(d.endCol, endLine.length);
        
        return {
          from: Math.max(0, from),
          to: Math.max(from, to),
          severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
          message: d.message,
        };
      });
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

/**
 * Check if we're inside a require string and provide module completions.
 */
async function requireCompletionSource(context: CompletionContext): Promise<CompletionResult | null> {
  // Check if we're inside require("...") or require('...')
  const line = context.state.doc.lineAt(context.pos);
  const lineText = line.text;
  const colInLine = context.pos - line.from;
  
  // Match require("...) or require('...) where cursor is inside the quotes
  const requireMatch = lineText.match(/require\s*\(\s*(["'])([^"']*)/);
  if (!requireMatch) {
    return null;
  }
  
  const quoteChar = requireMatch[1];
  const quoteStart = lineText.indexOf(quoteChar, lineText.indexOf('require'));
  const afterQuote = quoteStart + 1;
  
  // Check if cursor is after the opening quote
  if (colInLine <= afterQuote) {
    return null;
  }
  
  // Find the closing quote (if any)
  const restOfLine = lineText.substring(afterQuote);
  const closingQuoteIdx = restOfLine.indexOf(quoteChar);
  const closePos = closingQuoteIdx >= 0 ? afterQuote + closingQuoteIdx : lineText.length;
  
  // Check if cursor is before the closing quote
  if (colInLine > closePos) {
    return null;
  }
  
  // We're inside a require string! Get available modules
  try {
    const modules = await getAvailableModules();
    
    if (modules.length === 0) {
      return null;
    }
    
    const completions: Completion[] = modules.map((mod) => ({
      label: mod,
      type: 'namespace',
      detail: 'module',
    }));
    
    return {
      from: line.from + afterQuote,
      to: line.from + closePos,
      options: completions,
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
  // Plugin to trigger completions after . and :
  const triggerOnAccessor = ViewPlugin.fromClass(class {
    constructor(readonly view: EditorView) {}
  }, {
    eventHandlers: {
      keyup: (event, view) => {
        // Trigger completion after typing . or :
        if (event.key === '.' || event.key === ':') {
          // Small delay to let the character be inserted first
          setTimeout(() => startCompletion(view), 10);
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
          
          // Parse markdown code blocks
          const codeBlockMatch = content.match(/```luau\n([\s\S]*?)\n```/);
          if (codeBlockMatch) {
            // Type info section
            const codeWrapper = document.createElement('div');
            codeWrapper.style.cssText = `
              padding: 10px 14px;
              background: var(--bg-secondary);
              // border-left: 3px solid var(--accent);
            `;
            const code = document.createElement('code');
            code.textContent = codeBlockMatch[1];
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
    lintGutter(),
    ...createLuauAutocomplete(),
    createLuauHover(),
  ];
}

// Export individual extensions for flexibility
export { createLuauLinter, createLuauAutocomplete, createLuauHover };

