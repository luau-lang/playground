/**
 * CodeMirror Editor Setup
 * 
 * Creates and configures the CodeMirror 6 editor with Luau language support.
 */

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';

import { luauTextMate, onGrammarReady } from './textmate';
import { darkTheme, lightTheme } from './themes';
import { luauLspExtensions } from './lspExtensions';
import { themeMode } from '$lib/utils/theme';
import { get } from 'svelte/store';

let editorView: EditorView | null = null;
let onChangeCallback: ((content: string) => void) | null = null;

// Compartment for dynamic theme switching
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
    foldGutter(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    
    // Keymaps
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    
    // Luau language support (TextMate grammar)
    luauTextMate(),
    
    // LSP-like features (diagnostics, autocomplete, hover)
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

  // Register callback to refresh highlighting when grammar loads
  onGrammarReady(() => {
    if (editorView) {
      // Force a re-parse by modifying and reverting
      // This triggers the tokenizer to re-run with the loaded grammar
      const content = editorView.state.doc.toString();
      editorView.dispatch({
        changes: { from: 0, to: content.length, insert: content + ' ' },
      });
      editorView.dispatch({
        changes: { from: content.length, to: content.length + 1 },
      });
      console.log('[Editor] Refreshed syntax highlighting after grammar load');
    }
  });

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
 * Force a refresh of diagnostics by simulating a document change.
 * This is useful when settings change and we need to re-run the linter.
 */
export function refreshDiagnostics(): void {
  if (editorView) {
    const content = editorView.state.doc.toString();
    // Insert and remove a space to trigger the linter
    editorView.dispatch({
      changes: { from: content.length, insert: ' ' },
    });
    editorView.dispatch({
      changes: { from: content.length, to: content.length + 1 },
    });
  }
}

// ============================================================================
// Standalone Editor Instance (for embeds and multiple editors)
// ============================================================================

export interface StandaloneEditorOptions {
  container: HTMLElement;
  content: string;
  onChange?: (content: string) => void;
  theme?: 'light' | 'dark' | 'auto';
  readonly?: boolean;
}

export interface StandaloneEditor {
  view: EditorView;
  getContent: () => string;
  setContent: (content: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  destroy: () => void;
}

/**
 * Create a standalone editor instance.
 * Unlike createEditor(), this doesn't use global state and can create multiple instances.
 */
export function createStandaloneEditor(options: StandaloneEditorOptions): StandaloneEditor {
  const { container, content, onChange, theme = 'auto', readonly = false } = options;
  
  const standaloneThemeCompartment = new Compartment();
  const readonlyCompartment = new Compartment();
  
  function getStandaloneTheme(themeOption: 'light' | 'dark' | 'auto'): Extension {
    const isDark = themeOption === 'dark' || 
      (themeOption === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return isDark ? darkTheme : lightTheme;
  }
  
  const extensions: Extension[] = [
    // Basic setup
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    
    // Keymaps
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    
    // Luau language support (TextMate grammar)
    luauTextMate(),
    
    // LSP-like features (diagnostics, autocomplete, hover)
    ...luauLspExtensions(),
    
    // Theme (dynamic)
    standaloneThemeCompartment.of(getStandaloneTheme(theme)),
    
    // Readonly state
    readonlyCompartment.of(EditorState.readOnly.of(readonly)),
    
    // Accessibility
    EditorView.contentAttributes.of({ 'aria-label': 'Luau code editor' }),
    
    // Base styling
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '14px',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
        overflow: 'auto',
      },
      '.cm-content': {
        padding: '12px 0',
      },
      '.cm-gutters': {
        paddingLeft: '8px',
      },
    }),
  ];
  
  // Add change listener if provided
  if (onChange) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      })
    );
  }
  
  const state = EditorState.create({
    doc: content,
    extensions,
  });
  
  const view = new EditorView({
    state,
    parent: container,
  });
  
  // Listen for system theme changes when using auto
  let mediaQueryCleanup: (() => void) | null = null;
  let currentTheme = theme;
  
  if (theme === 'auto') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      view.dispatch({
        effects: standaloneThemeCompartment.reconfigure(getStandaloneTheme('auto')),
      });
    };
    mediaQuery.addEventListener('change', handleChange);
    mediaQueryCleanup = () => mediaQuery.removeEventListener('change', handleChange);
  }
  
  // Register callback to refresh highlighting when grammar loads
  onGrammarReady(() => {
    if (view) {
      const currentContent = view.state.doc.toString();
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: currentContent + ' ' },
      });
      view.dispatch({
        changes: { from: currentContent.length, to: currentContent.length + 1 },
      });
    }
  });
  
  return {
    view,
    
    getContent(): string {
      return view.state.doc.toString();
    },
    
    setContent(newContent: string): void {
      const currentContent = view.state.doc.toString();
      if (currentContent !== newContent) {
        view.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: newContent,
          },
        });
      }
    },
    
    setTheme(newTheme: 'light' | 'dark' | 'auto'): void {
      currentTheme = newTheme;
      view.dispatch({
        effects: standaloneThemeCompartment.reconfigure(getStandaloneTheme(newTheme)),
      });
      
      // Update media query listener
      if (mediaQueryCleanup) {
        mediaQueryCleanup();
        mediaQueryCleanup = null;
      }
      
      if (newTheme === 'auto') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
          view.dispatch({
            effects: standaloneThemeCompartment.reconfigure(getStandaloneTheme('auto')),
          });
        };
        mediaQuery.addEventListener('change', handleChange);
        mediaQueryCleanup = () => mediaQuery.removeEventListener('change', handleChange);
      }
    },
    
    destroy(): void {
      if (mediaQueryCleanup) {
        mediaQueryCleanup();
      }
      view.destroy();
    },
  };
}
