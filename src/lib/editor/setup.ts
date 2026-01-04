/**
 * CodeMirror Editor Setup
 * 
 * Creates and configures the CodeMirror 6 editor with Luau language support.
 */

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';

import { luauTextMate, initLuauTextMate } from './textmate';
export { initLuauTextMate };
import { darkTheme, lightTheme } from './themes';
import { luauLspExtensions } from './lspExtensions';
import { forceLinting, lintGutter } from '@codemirror/lint';
import { themeMode } from '$lib/utils/theme';
import { cursorLine } from '$lib/stores/playground';
import { get } from 'svelte/store';

let editorView: EditorView | null = null;
let onChangeCallback: ((content: string) => void) | null = null;

// Compartments for dynamic reconfiguration
const themeCompartment = new Compartment();

// Subscribe to theme changes
let unsubscribeTheme: (() => void) | null = null;

function getThemeExtension(): Extension {
  const mode = get(themeMode);
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return isDark ? darkTheme : lightTheme;
}

/**
 * Create base extensions for the editor.
 */
function createExtensions(onChange: (content: string) => void): Extension[] {
  return [
    // Basic setup
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    lintGutter(),
    
    // Keymaps
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    
    // Luau language + LSP extensions
    luauTextMate(),
    ...luauLspExtensions(),
    
    // Theme (dynamic)
    themeCompartment.of(getThemeExtension()),
    
    // Accessibility
    EditorView.contentAttributes.of({ 'aria-label': 'Luau code editor' }),
    
    // Base styling
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '14px',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        overflow: 'auto',
      },
      '.cm-content': {
        padding: '12px 0',
      },
      '.cm-gutters': {
        paddingLeft: '8px',
      },
    }),
    
    // Update listener
    EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }
      
      // Track cursor line changes for bytecode highlighting
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos).number;
        cursorLine.set(line);
      }
    }),
  ];
}

/**
 * Create the editor instance.
 */
export function createEditor(
  container: HTMLElement,
  initialContent: string,
  onChange: (content: string) => void
): EditorView {
  onChangeCallback = onChange;

  const state = EditorState.create({
    doc: initialContent,
    extensions: createExtensions(onChange),
  });

  editorView = new EditorView({
    state,
    parent: container,
  });

  // Subscribe to theme changes
  unsubscribeTheme = themeMode.subscribe(() => {
    if (editorView) {
      editorView.dispatch({
        effects: themeCompartment.reconfigure(getThemeExtension()),
      });
    }
  });

  // Also listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleMediaChange = () => {
    if (get(themeMode) === 'system' && editorView) {
      editorView.dispatch({
        effects: themeCompartment.reconfigure(getThemeExtension()),
      });
    }
  };
  mediaQuery.addEventListener('change', handleMediaChange);

  return editorView;
}

/**
 * Destroy the editor instance.
 */
export function destroyEditor(): void {
  if (unsubscribeTheme) {
    unsubscribeTheme();
    unsubscribeTheme = null;
  }
  
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  onChangeCallback = null;
}

/**
 * Update the editor content.
 */
export function updateEditorContent(content: string): void {
  if (editorView) {
    const currentContent = editorView.state.doc.toString();
    if (currentContent !== content) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
      });
    }
  }
}

/**
 * Get the current editor content.
 */
export function getEditorContent(): string {
  return editorView?.state.doc.toString() || '';
}

/**
 * Get the editor view instance.
 */
export function getEditorView(): EditorView | null {
  return editorView;
}

/**
 * Focus the editor.
 */
export function focusEditor(): void {
  editorView?.focus();
}

/**
 * Force a refresh of diagnostics.
 * This is useful when settings change and we need to re-run the linter.
 */
export function refreshDiagnostics(): void {
  if (editorView) {
    forceLinting(editorView);
  }
}
