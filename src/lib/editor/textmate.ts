/**
 * TextMate Grammar Integration for CodeMirror 6
 * 
 * Uses vscode-textmate with the official Luau.tmLanguage grammar
 * from https://github.com/JohnnyMorganz/Luau.tmLanguage
 * 
 * Regex patterns are pre-compiled by compile-grammar.ts vite plugin
 * This eliminates the need for oniguruma WASM at runtime.
 */

import { StreamLanguage, LanguageSupport, type StringStream } from '@codemirror/language';
import * as vsctm from 'vscode-textmate';
import { createJsOnigLib } from './js-regex-engine';
import luauGrammar from './Luau.tmLanguage.json';

// Singleton state
let registry: vsctm.Registry | null = null;
let grammar: vsctm.IGrammar | null = null;
let initPromise: Promise<void> | null = null;

// Callbacks to notify when grammar is ready
const onReadyCallbacks: Array<() => void> = [];

/**
 * Register a callback to be called when the grammar is ready.
 */
export function onGrammarReady(callback: () => void): void {
  if (grammar) {
    // Already ready, call immediately
    callback();
  } else {
    onReadyCallbacks.push(callback);
  }
}

/**
 * Initialize the TextMate registry and load the Luau grammar.
 */
async function initTextMate(): Promise<void> {
  if (grammar) return;
  
  if (initPromise) {
    await initPromise;
    return;
  }
  
  initPromise = (async () => {
    // Grammar is bundled - convert to string for parsing
    const grammarJson = JSON.stringify(luauGrammar);
    
    // Create the registry with JS-based regex engine (no WASM needed)
    registry = new vsctm.Registry({
      onigLib: createJsOnigLib(),
      loadGrammar: async (scopeName) => {
        if (scopeName === 'source.luau') {
          return vsctm.parseRawGrammar(grammarJson, 'Luau.tmLanguage.json');
        }
        return null;
      },
    });
    
    // Load the grammar
    grammar = await registry.loadGrammar('source.luau');
    
    if (!grammar) {
      throw new Error('Failed to load Luau grammar');
    }
    
    console.log('[TextMate] Luau grammar loaded successfully (JS regex engine)');
    
    // Notify all callbacks
    for (const callback of onReadyCallbacks) {
      try {
        callback();
      } catch (e) {
        console.error('[TextMate] Callback error:', e);
      }
    }
    onReadyCallbacks.length = 0;
  })();
  
  await initPromise;
}

/**
 * Map TextMate scopes to CodeMirror token types.
 */
function scopeToToken(scopes: string[]): string | null {
  // Check scopes from most specific to least specific
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i];
    
    // Comments
    if (scope.startsWith('comment')) return 'comment';
    
    // Strings
    if (scope.startsWith('string')) return 'string';
    
    // Numbers
    if (scope.startsWith('constant.numeric')) return 'number';
    
    // Booleans and nil
    if (scope.includes('constant.language.boolean')) return 'bool';
    if (scope.includes('constant.language.nil')) return 'null';
    if (scope.startsWith('constant.language')) return 'atom';
    if (scope.startsWith('constant')) return 'atom';
    
    // Keywords
    if (scope.startsWith('keyword.control')) return 'keyword';
    if (scope.startsWith('keyword.operator')) return 'operator';
    if (scope.startsWith('keyword')) return 'keyword';
    
    // Storage (local, function, etc.)
    if (scope.startsWith('storage')) return 'keyword';
    
    // Types
    if (scope.startsWith('entity.name.type')) return 'typeName';
    if (scope.startsWith('support.type')) return 'typeName';
    
    // Functions
    if (scope.startsWith('entity.name.function')) return 'variableName.function';
    if (scope.startsWith('support.function')) return 'variableName.function';
    if (scope.includes('function-call')) return 'variableName.function';
    
    // Variables
    if (scope.startsWith('variable.parameter')) return 'variableName.definition';
    if (scope.startsWith('variable')) return 'variableName';
    
    // Operators
    if (scope.startsWith('keyword.operator')) return 'operator';
    
    // Punctuation
    if (scope.startsWith('punctuation')) return 'punctuation';
    
    // Support (built-in functions/types)
    if (scope.startsWith('support')) return 'variableName.standard';
  }
  
  return null;
}

/**
 * TextMate tokenizer state for CodeMirror.
 */
interface TMState {
  ruleStack: vsctm.StateStack;
  lineTokens: Array<{ startIndex: number; endIndex: number; scopes: string[] }> | null;
  lineText: string;
}

/**
 * Create a CodeMirror StreamLanguage that uses TextMate tokenization.
 */
function createTextMateLanguage(): StreamLanguage<TMState> {
  return StreamLanguage.define<TMState>({
    name: 'luau',
    
    startState: (): TMState => ({
      ruleStack: vsctm.INITIAL,
      lineTokens: null,
      lineText: '',
    }),
    
    copyState: (state: TMState): TMState => ({
      ruleStack: state.ruleStack,
      lineTokens: state.lineTokens,
      lineText: state.lineText,
    }),
    
    token: (stream: StringStream, state: TMState): string | null => {
      if (!grammar) {
        // Grammar not loaded yet, consume the line
        stream.skipToEnd();
        return null;
      }
      
      // At the start of a line, tokenize the entire line
      if (stream.sol()) {
        const lineText = stream.string;
        const result = grammar.tokenizeLine(lineText, state.ruleStack);
        
        state.ruleStack = result.ruleStack;
        state.lineText = lineText;
        
        // Convert tokens to our format
        state.lineTokens = result.tokens.map((t, i, arr) => ({
          startIndex: t.startIndex,
          endIndex: i < arr.length - 1 ? arr[i + 1].startIndex : lineText.length,
          scopes: t.scopes,
        }));
      }
      
      // Find the token at the current position
      const pos = stream.pos;
      const tokens = state.lineTokens || [];
      
      for (const token of tokens) {
        if (pos >= token.startIndex && pos < token.endIndex) {
          // Consume this token
          stream.pos = token.endIndex;
          return scopeToToken(token.scopes);
        }
      }
      
      // No token found, consume one character
      stream.next();
      return null;
    },
    
    languageData: {
      commentTokens: { line: '--', block: { open: '--[[', close: ']]' } },
      closeBrackets: { brackets: ['(', '[', '{', '"', "'"] },
      indentOnInput: /^\s*(end|else|elseif|until|\}|\])$/,
    },
  });
}

// Cached language instance
let textMateLanguage: StreamLanguage<TMState> | null = null;

/**
 * Get or create the TextMate-based Luau language.
 * Returns a fallback if TextMate isn't loaded yet.
 */
export function luauTextMate(): LanguageSupport {
  if (!textMateLanguage) {
    textMateLanguage = createTextMateLanguage();
  }
  return new LanguageSupport(textMateLanguage);
}

/**
 * Initialize TextMate. Call this early to preload the grammar.
 */
export async function initLuauTextMate(): Promise<void> {
  try {
    await initTextMate();
  } catch (error) {
    console.error('[TextMate] Failed to initialize:', error);
  }
}

/**
 * Check if TextMate is ready.
 */
export function isTextMateReady(): boolean {
  return grammar !== null;
}
