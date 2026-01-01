/**
 * Luau WASM Module Loader and Runner
 * 
 * Loads the bundled Luau WASM module.
 */

import { appendOutput, clearOutput, setRunning, setExecutionTime, getActiveFileContent, activeFile, getAllFiles } from '$lib/stores/playground';
import { settings, type LuauMode, type SolverMode } from '$lib/stores/settings';
import { get } from 'svelte/store';
import type { 
  LuauWasmModule, 
  ExecuteResult, 
  DiagnosticsResult, 
  AutocompleteResult, 
  HoverResult,
  LuauDiagnostic,
  LuauCompletion,
  CreateLuauModule
} from './types';
import createLuauModule from './luau-module.js';

let wasmModule: LuauWasmModule | null = null;
let modulePromise: Promise<LuauWasmModule> | null = null;

/**
 * Load the Luau WASM module.
 * Uses dynamic import with full URL for ES modules in /public.
 */
export async function loadLuauWasm(): Promise<LuauWasmModule> {
  if (wasmModule) {
    return wasmModule;
  }

  if (modulePromise) {
    return modulePromise;
  }

  modulePromise = (async (): Promise<LuauWasmModule> => {
    try {
      // Build the base URL for WASM file resolution
      // Use document.baseURI to handle both root and subdirectory deployments
      const baseUrl = new URL('./', document.baseURI).href.replace(/\/$/, '');
      
      // Create the module using the bundled factory function
      const module = await (createLuauModule as CreateLuauModule)({
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return `${baseUrl}/wasm/luau.wasm`;
          }
          return `${baseUrl}/wasm/${path}`;
        },
      });

      wasmModule = module;
      console.log('[Luau WASM] Module loaded successfully');
      
      // Sync settings to WASM module
      const currentSettings = get(settings);
      const modeNum = currentSettings.mode === 'strict' ? 1 : currentSettings.mode === 'nocheck' ? 2 : 0;
      try {
        module.ccall('luau_set_mode', null, ['number'], [modeNum]);
        module.ccall('luau_set_solver', null, ['boolean'], [currentSettings.solver === 'new']);
      } catch {
        // Ignore sync errors on load
      }
      
      // Start listening to settings changes
      initSettingsSync();
      
      return module;
    } catch (error) {
      console.warn('[Luau WASM] Failed to load module, using mock:', error);
      // Return mock module for development
      wasmModule = createMockModule();
      return wasmModule;
    }
  })();

  return modulePromise;
}

/**
 * Check if WASM module is loaded.
 */
export function isWasmLoaded(): boolean {
  return wasmModule !== null;
}

/**
 * Execute Luau code.
 */
export async function executeCode(code: string): Promise<ExecuteResult> {
  const module = await loadLuauWasm();
  
  try {
    const resultJson = module.ccall('luau_execute', 'string', ['string'], [code]);
    if (!resultJson) {
      return {
        success: false,
        output: '',
        error: 'No result returned from execution',
      };
    }
    const parsed = JSON.parse(resultJson) as ExecuteResult;
    return parsed;
  } catch (error) {
    // Try to extract more info from the error
    let errorMsg = 'Unknown execution error';
    if (error instanceof Error) {
      errorMsg = error.message;
      if (error.stack) {
        console.error('[Luau] Execution error stack:', error.stack);
      }
    } else if (typeof error === 'number') {
      // Emscripten exception pointer - this means a C++ exception wasn't caught
      errorMsg = `Uncaught Luau exception (code: ${error})`;
    } else {
      errorMsg = String(error);
    }
    
    return {
      success: false,
      output: '',
      error: errorMsg,
    };
  }
}

/**
 * Register all files with the analysis engine for cross-file type checking.
 */
async function registerAllFilesForAnalysis(): Promise<void> {
  const allFiles = getAllFiles();
  const module = await loadLuauWasm();
  
  // Register each file's source for analysis
  for (const [name, content] of Object.entries(allFiles)) {
    try {
      module.ccall('luau_set_source', null, ['string', 'string'], [name, content]);
      
      // Also register without extension for require resolution
      const nameWithoutExt = name.replace(/\.(luau|lua)$/, '');
      if (nameWithoutExt !== name) {
        module.ccall('luau_set_source', null, ['string', 'string'], [nameWithoutExt, content]);
      }
    } catch {
      // Ignore individual file registration errors
    }
  }
}

/**
 * Get diagnostics for code.
 */
export async function getDiagnostics(code: string): Promise<LuauDiagnostic[]> {
  const module = await loadLuauWasm();
  
  try {
    // Register all files for cross-file type checking
    await registerAllFilesForAnalysis();
    
    const resultJson = module.ccall('luau_get_diagnostics', 'string', ['string'], [code]);
    const result = JSON.parse(resultJson) as DiagnosticsResult;
    return result.diagnostics;
  } catch (error) {
    console.error('[Luau] Diagnostics error:', error);
    return [];
  }
}

/**
 * Get autocomplete suggestions.
 */
export async function getAutocomplete(code: string, line: number, col: number): Promise<LuauCompletion[]> {
  const module = await loadLuauWasm();
  
  try {
    const resultJson = module.ccall('luau_autocomplete', 'string', ['string', 'number', 'number'], [code, line, col]);
    const result = JSON.parse(resultJson) as AutocompleteResult;
    return result.items;
  } catch (error) {
    console.error('[Luau] Autocomplete error:', error);
    return [];
  }
}

/**
 * Get hover information.
 */
export async function getHover(code: string, line: number, col: number): Promise<string | null> {
  const module = await loadLuauWasm();
  
  try {
    const resultJson = module.ccall('luau_hover', 'string', ['string', 'number', 'number'], [code, line, col]);
    const result = JSON.parse(resultJson) as HoverResult;
    return result.content;
  } catch (error) {
    console.error('[Luau] Hover error:', error);
    return null;
  }
}

/**
 * Add a module that can be required.
 */
export async function addModule(name: string, source: string): Promise<void> {
  const module = await loadLuauWasm();
  try {
    module.ccall('luau_add_module', null, ['string', 'string'], [name, source]);
  } catch (error) {
    console.error('[Luau] Failed to add module:', error);
  }
}

/**
 * Clear all registered modules.
 */
export async function clearModules(): Promise<void> {
  const module = await loadLuauWasm();
  try {
    module.ccall('luau_clear_modules', null, [], []);
  } catch (error) {
    console.error('[Luau] Failed to clear modules:', error);
  }
}

/**
 * Get list of available modules for autocomplete.
 */
export async function getAvailableModules(): Promise<string[]> {
  const module = await loadLuauWasm();
  try {
    const resultJson = module.ccall('luau_get_modules', 'string', [], []);
    const result = JSON.parse(resultJson) as { modules: string[] };
    return result.modules;
  } catch (error) {
    console.error('[Luau] Failed to get modules:', error);
    return [];
  }
}

/**
 * Set source for a file (for analysis).
 */
export async function setSource(name: string, source: string): Promise<void> {
  const module = await loadLuauWasm();
  try {
    module.ccall('luau_set_source', null, ['string', 'string'], [name, source]);
  } catch (error) {
    console.error('[Luau] Failed to set source:', error);
  }
}

/**
 * Set the type checking mode.
 */
export async function setLuauMode(mode: LuauMode): Promise<void> {
  const module = await loadLuauWasm();
  const modeNum = mode === 'strict' ? 1 : mode === 'nocheck' ? 2 : 0;
  try {
    module.ccall('luau_set_mode', null, ['number'], [modeNum]);
  } catch (error) {
    console.error('[Luau] Failed to set mode:', error);
  }
}

/**
 * Set the solver mode.
 */
export async function setLuauSolver(solver: SolverMode): Promise<void> {
  const module = await loadLuauWasm();
  try {
    module.ccall('luau_set_solver', null, ['boolean'], [solver === 'new']);
  } catch (error) {
    console.error('[Luau] Failed to set solver:', error);
  }
}

/**
 * Sync settings from store to WASM module.
 */
export async function syncSettings(): Promise<void> {
  const currentSettings = get(settings);
  await setLuauMode(currentSettings.mode);
  await setLuauSolver(currentSettings.solver);
}

// Subscribe to settings changes and sync to WASM
let settingsUnsubscribe: (() => void) | null = null;

export function initSettingsSync(): void {
  if (settingsUnsubscribe) return;
  
  settingsUnsubscribe = settings.subscribe(async (newSettings) => {
    if (wasmModule) {
      await setLuauMode(newSettings.mode);
      await setLuauSolver(newSettings.solver);
    }
  });
}

/**
 * Register all files as modules (for require support).
 */
async function registerAllModules(): Promise<void> {
  const allFiles = getAllFiles();
  const module = await loadLuauWasm();
  
  // Clear existing modules first
  try {
    module.ccall('luau_clear_modules', null, [], []);
  } catch {
    // Ignore clear errors
  }
  
  // Register each file as a module
  for (const [name, content] of Object.entries(allFiles)) {
    try {
      // Register with the file name (with extension)
      module.ccall('luau_add_module', null, ['string', 'string'], [name, content]);
      
      // Also register without extension for convenience
      const nameWithoutExt = name.replace(/\.(luau|lua)$/, '');
      if (nameWithoutExt !== name) {
        module.ccall('luau_add_module', null, ['string', 'string'], [nameWithoutExt, content]);
      }
    } catch {
      // Ignore individual module registration errors
    }
  }
}

/**
 * Run the active file and display output.
 */
export async function runCode(): Promise<void> {
  setRunning(true);
  clearOutput();
  setExecutionTime(null);

  try {
    const code = getActiveFileContent();
    const fileName = get(activeFile);
    
    appendOutput({ type: 'log', text: `Running ${fileName}...` });
    
    // Register all files as modules for require support
    await registerAllModules();
    
    // Measure execution time
    const startTime = performance.now();
    const result = await executeCode(code);
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    setExecutionTime(elapsed);
    
    if (result.prints && result.prints.length > 0) {
      result.prints.forEach((values) => {
        appendOutput({ type: 'log', text: '', values });
      });
    } else if (result.output) {
      result.output.split('\n').forEach((line) => {
        appendOutput({ type: 'log', text: line });
      });
    }
    
    if (!result.success && result.error) {
      // Split error by newlines to format stack traces nicely
      result.error.split('\n').forEach((line) => {
        appendOutput({ type: 'error', text: line });
      });
    }
  } catch (error) {
    appendOutput({
      type: 'error',
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    setRunning(false);
  }
}

/**
 * Run type checking on the active file and display diagnostics.
 */
export async function checkCode(): Promise<void> {
  setRunning(true);
  clearOutput();
  setExecutionTime(null);

  try {
    const code = getActiveFileContent();
    const fileName = get(activeFile);
    
    appendOutput({ type: 'log', text: `Type checking ${fileName}...` });
    
    // Measure check time
    const startTime = performance.now();
    const diagnostics = await getDiagnostics(code);
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    setExecutionTime(elapsed);
    
    if (diagnostics.length === 0) {
      appendOutput({ type: 'log', text: '✓ No type errors found' });
    } else {
      const errorCount = diagnostics.filter(d => d.severity === 'error').length;
      const warningCount = diagnostics.filter(d => d.severity === 'warning').length;
      
      const summary = [];
      if (errorCount > 0) summary.push(`${errorCount} error${errorCount !== 1 ? 's' : ''}`);
      if (warningCount > 0) summary.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`);
      
      appendOutput({ type: 'log', text: `Found ${summary.join(', ')}:` });
      appendOutput({ type: 'log', text: '' });
      
      for (const diag of diagnostics) {
        const location = `${fileName}:${diag.startLine + 1}:${diag.startCol + 1}`;
        const type = diag.severity === 'error' ? 'error' : diag.severity === 'warning' ? 'warn' : 'log';
        appendOutput({ type, text: `${location}: ${diag.message}` });
      }
    }
  } catch (error) {
    appendOutput({
      type: 'error',
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    setRunning(false);
  }
}

// ============================================================================
// Mock Module for Development (when WASM isn't built yet)
// ============================================================================

function createMockModule(): LuauWasmModule {
  const mockExecute = (code: string): string => {
    // Simple mock that extracts print statements
    const printRegex = /print\s*\(([^)]+)\)/g;
    const outputs: string[] = [];
    let match;
    
    while ((match = printRegex.exec(code)) !== null) {
      const args = match[1];
      // Handle string literals
      const stringMatch = args.match(/"([^"]*)"|'([^']*)'/);
      if (stringMatch) {
        outputs.push(stringMatch[1] || stringMatch[2]);
      } else {
        // Handle simple expressions
        outputs.push(`[${args.trim()}]`);
      }
    }

    if (outputs.length === 0) {
      return JSON.stringify({ 
        success: true, 
        output: '[Mock mode - WASM not loaded]\nTip: Build the WASM module with ./wasm/build.sh' 
      });
    }

    return JSON.stringify({ success: true, output: outputs.join('\n') });
  };

  const mockDiagnostics = (): string => {
    return JSON.stringify({ diagnostics: [] });
  };

  const mockAutocomplete = (): string => {
    // Return some basic Luau globals
    const items: LuauCompletion[] = [
      { label: 'print', kind: 'function', detail: '(...any) -> ()', deprecated: false },
      { label: 'pairs', kind: 'function', detail: '<K, V>(t: {[K]: V}) -> ((t: {[K]: V}, k: K?) -> (K, V), {[K]: V}, nil)', deprecated: false },
      { label: 'ipairs', kind: 'function', detail: '<V>(t: {V}) -> ((t: {V}, i: number) -> (number, V), {V}, number)', deprecated: false },
      { label: 'type', kind: 'function', detail: '(any) -> string', deprecated: false },
      { label: 'tostring', kind: 'function', detail: '(any) -> string', deprecated: false },
      { label: 'tonumber', kind: 'function', detail: '(any, number?) -> number?', deprecated: false },
      { label: 'local', kind: 'keyword', deprecated: false },
      { label: 'function', kind: 'keyword', deprecated: false },
      { label: 'if', kind: 'keyword', deprecated: false },
      { label: 'then', kind: 'keyword', deprecated: false },
      { label: 'else', kind: 'keyword', deprecated: false },
      { label: 'for', kind: 'keyword', deprecated: false },
      { label: 'while', kind: 'keyword', deprecated: false },
      { label: 'return', kind: 'keyword', deprecated: false },
    ];
    return JSON.stringify({ items });
  };

  const mockHover = (): string => {
    return JSON.stringify({ content: null });
  };

  // Create a mock ccall that routes to the appropriate mock function
  const ccall = (name: string, _returnType: string | null, _argTypes: string[], args: unknown[]): unknown => {
    switch (name) {
      case 'luau_execute':
        return mockExecute(args[0] as string);
      case 'luau_compile_check':
        return JSON.stringify({ success: true, size: 100 });
      case 'luau_reset':
        return undefined;
      case 'luau_add_module':
        return undefined;
      case 'luau_clear_modules':
        return undefined;
      case 'luau_get_modules':
        return JSON.stringify({ modules: [] });
      case 'luau_set_source':
        return undefined;
      case 'luau_get_diagnostics':
        return mockDiagnostics();
      case 'luau_autocomplete':
        return mockAutocomplete();
      case 'luau_hover':
        return mockHover();
      case 'luau_signature_help':
        return JSON.stringify({ signatures: [] });
      case 'luau_version':
        return 'mock-1.0.0';
      case 'luau_set_mode':
        return undefined;
      case 'luau_set_solver':
        return undefined;
      case 'luau_get_config':
        return JSON.stringify({ mode: 'nonstrict', solver: 'new' });
      case 'luau_dump_bytecode':
        return JSON.stringify({ success: true, bytecode: '-- Mock bytecode output\n-- Build WASM to see real bytecode' });
      default:
        return '';
    }
  };

  return {
    ccall: ccall as unknown as LuauWasmModule['ccall'],
    _malloc: () => 0,
    _free: () => {},
    UTF8ToString: () => '',
    stringToUTF8: () => {},
    lengthBytesUTF8: () => 0,
  };
}

/**
 * Get bytecode dump for code.
 */
export async function getBytecode(
  code: string,
  optimizationLevel: number = 2,
  debugLevel: number = 2,
  outputFormat: number = 0,
  showRemarks: boolean = false
): Promise<{ success: boolean; bytecode: string; error?: string }> {
  const module = await loadLuauWasm();
  
  try {
    const resultJson = module.ccall(
      'luau_dump_bytecode',
      'string',
      ['string', 'number', 'number', 'number', 'number'],
      [code, optimizationLevel, debugLevel, outputFormat, showRemarks ? 1 : 0]
    );
    return JSON.parse(resultJson);
  } catch (error) {
    return {
      success: false,
      bytecode: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Export types
export type { LuauDiagnostic, LuauCompletion, ExecuteResult };
