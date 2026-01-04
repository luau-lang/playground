/**
 * Luau WASM Module Loader and Runner
 * 
 * Uses a Web Worker to run WASM execution off the main thread.
 * This prevents infinite loops from freezing the UI and allows stopping execution.
 */

import { appendOutput, clearOutput, setRunning, setExecutionTime, getActiveFileContent, activeFile, getAllFiles } from '$lib/stores/playground';
import { settings, type LuauMode, type SolverMode } from '$lib/stores/settings';
import { get } from 'svelte/store';
import type { 
  ExecuteResult, 
  LuauDiagnostic,
  LuauCompletion,
} from './types';
import type { WorkerRequest, WorkerResponse } from './luau.worker';
import LuauWorker from './luau.worker?worker';

declare const __wasmPromises: { luau: Promise<ArrayBuffer> } | undefined;

// Cached WASM binary promise - survives worker restarts
let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;

/**
 * Get the WASM binary, using preloaded promise from index.html or fetching once.
 */
function getWasmBinary(): Promise<ArrayBuffer> {
  if (!wasmBinaryPromise) {
    if (typeof __wasmPromises !== 'undefined') {
      wasmBinaryPromise = __wasmPromises.luau;
    } else {
      const baseUrl = new URL('./', document.baseURI).href.replace(/\/$/, '');
      wasmBinaryPromise = fetch(`${baseUrl}/wasm/luau.wasm`).then(r => r.arrayBuffer());
    }
  }
  return wasmBinaryPromise;
}

// Worker instance
let worker: Worker | null = null;
let workerReady = false;
let workerReadyPromise: Promise<void> | null = null;

// Pending requests waiting for responses
const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}>();

let requestIdCounter = 0;

/**
 * Create and initialize the worker.
 */
function createWorker(): Worker {
  const newWorker = new LuauWorker();
  
  newWorker.onmessage = (e: MessageEvent<WorkerResponse & { requestId?: string }>) => {
    const response = e.data;
    
    // Handle ready message
    if (response.type === 'ready') {
      workerReady = true;
      console.log('[Luau WASM] Worker ready');
      return;
    }
    
    // Handle response with requestId
    const requestId = response.requestId;
    if (requestId && pendingRequests.has(requestId)) {
      const { resolve, reject } = pendingRequests.get(requestId)!;
      pendingRequests.delete(requestId);
      
      if (response.type === 'error') {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    }
  };
  
  newWorker.onerror = (e) => {
    console.error('[Luau WASM] Worker error:', e);
    // Reject all pending requests
    for (const [id, { reject }] of pendingRequests) {
      reject(new Error('Worker error'));
      pendingRequests.delete(id);
    }
  };
  
  return newWorker;
}

/**
 * Send a request to the worker and wait for a response.
 */
async function sendRequest<T extends WorkerRequest>(request: T): Promise<WorkerResponse> {
  await loadLuauWasm();
  
  const requestId = `req_${requestIdCounter++}`;
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { 
      resolve: resolve as (value: unknown) => void, 
      reject 
    });
    worker!.postMessage({ ...request, requestId });
  });
}

/**
 * Load/initialize the Luau WASM worker.
 */
export async function loadLuauWasm(): Promise<void> {
  if (workerReady && worker) {
    return;
  }

  if (workerReadyPromise) {
    return workerReadyPromise;
  }

  workerReadyPromise = (async () => {
    try {
      // Start WASM download (uses cached promise, survives worker restarts)
      const wasmBinary = await getWasmBinary();
      
      worker = createWorker();
      
      // Wait for worker to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, 30000);
        
        const currentWorker = worker!;
        const originalOnMessage = currentWorker.onmessage;
        currentWorker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          if (e.data.type === 'ready') {
            clearTimeout(timeout);
            currentWorker.onmessage = originalOnMessage;
            resolve();
          }
          // Also call original handler
          originalOnMessage?.call(currentWorker, e);
        };
        
        // Send init message with WASM binary (cloned, not transferred, so original stays cached)
        currentWorker.postMessage({ type: 'init', wasmBinary } satisfies WorkerRequest);
      });
      
      workerReady = true;
      console.log('[Luau WASM] Module loaded successfully via worker');
      
      // Sync settings to worker
      const currentSettings = get(settings);
      const modeNum = currentSettings.mode === 'strict' ? 1 : currentSettings.mode === 'nocheck' ? 2 : 0;
      await sendRequest({ type: 'setMode', mode: modeNum });
      await sendRequest({ type: 'setSolver', isNew: currentSettings.solver === 'new' });
      
      // Start listening to settings changes
      initSettingsSync();
    } catch (error) {
      workerReadyPromise = null;
      workerReady = false;
      throw new Error('Failed to load Luau WASM module', { cause: error });
    }
  })();

  return workerReadyPromise;
}

/**
 * Check if WASM module is loaded.
 */
export function isWasmLoaded(): boolean {
  return workerReady;
}

/**
 * Stop any running execution by terminating and recreating the worker.
 */
export async function stopExecution(): Promise<void> {
  if (!worker) return;
  
  console.log('[Luau WASM] Stopping execution...');
  
  // Terminate the worker
  worker.terminate();
  worker = null;
  workerReady = false;
  workerReadyPromise = null;
  
  // Reject all pending requests
  for (const [id, { reject }] of pendingRequests) {
    reject(new Error('Execution stopped'));
    pendingRequests.delete(id);
  }
  
  // Update running state
  setRunning(false);
  appendOutput({ type: 'warn', text: 'Execution stopped' });
}

/**
 * Execute Luau code.
 * Returns both the result and the execution time measured inside the worker.
 */
export async function executeCode(code: string): Promise<{ result: ExecuteResult; elapsed: number }> {
  try {
    const response = await sendRequest({ type: 'execute', code });
    if (response.type === 'execute') {
      return { result: response.result, elapsed: response.elapsed };
    }
    return { result: { success: false, output: '', error: 'Unexpected response type' }, elapsed: 0 };
  } catch (error) {
    // Check if this was a stop - don't return an error for that
    if (error instanceof Error && error.message === 'Execution stopped') {
      return { result: { success: false, output: '', error: undefined }, elapsed: 0 };
    }
    
    let errorMsg = 'Unknown execution error';
    if (error instanceof Error) {
      errorMsg = error.message;
    } else {
      errorMsg = String(error);
    }
    
    return {
      result: { success: false, output: '', error: errorMsg },
      elapsed: 0,
    };
  }
}

/**
 * Get diagnostics for code.
 */
export async function getDiagnostics(code: string): Promise<LuauDiagnostic[]> {
  try {
    // Register all files for cross-file type checking
    const allFiles = getAllFiles();
    await sendRequest({ type: 'registerSources', sources: allFiles });
    
    const response = await sendRequest({ type: 'getDiagnostics', code });
    if (response.type === 'getDiagnostics') {
      return response.result.diagnostics;
    }
    return [];
  } catch (error) {
    console.error('[Luau] Diagnostics error:', error);
    return [];
  }
}

/**
 * Get autocomplete suggestions.
 */
export async function getAutocomplete(code: string, line: number, col: number): Promise<LuauCompletion[]> {
  try {
    const response = await sendRequest({ type: 'autocomplete', code, line, col });
    if (response.type === 'autocomplete') {
      return response.result.items;
    }
    return [];
  } catch (error) {
    console.error('[Luau] Autocomplete error:', error);
    return [];
  }
}

/**
 * Get hover information.
 */
export async function getHover(code: string, line: number, col: number): Promise<string | null> {
  try {
    const response = await sendRequest({ type: 'hover', code, line, col });
    if (response.type === 'hover') {
      return response.result.content;
    }
    return null;
  } catch (error) {
    console.error('[Luau] Hover error:', error);
    return null;
  }
}

/**
 * Add a module that can be required.
 */
export async function addModule(name: string, source: string): Promise<void> {
  try {
    await sendRequest({ type: 'addModule', name, source });
  } catch (error) {
    console.error('[Luau] Failed to add module:', error);
  }
}

/**
 * Clear all registered modules.
 */
export async function clearModules(): Promise<void> {
  try {
    await sendRequest({ type: 'clearModules' });
  } catch (error) {
    console.error('[Luau] Failed to clear modules:', error);
  }
}

/**
 * Get list of available modules for autocomplete.
 */
export async function getAvailableModules(): Promise<string[]> {
  try {
    const response = await sendRequest({ type: 'getModules' });
    if (response.type === 'getModules') {
      return response.result.modules;
    }
    return [];
  } catch (error) {
    console.error('[Luau] Failed to get modules:', error);
    return [];
  }
}

/**
 * Set source for a file (for analysis).
 */
export async function setSource(name: string, source: string): Promise<void> {
  try {
    await sendRequest({ type: 'setSource', name, source });
  } catch (error) {
    console.error('[Luau] Failed to set source:', error);
  }
}

/**
 * Set the type checking mode.
 */
export async function setLuauMode(mode: LuauMode): Promise<void> {
  const modeNum = mode === 'strict' ? 1 : mode === 'nocheck' ? 2 : 0;
  try {
    await sendRequest({ type: 'setMode', mode: modeNum });
  } catch (error) {
    console.error('[Luau] Failed to set mode:', error);
  }
}

/**
 * Set the solver mode.
 */
export async function setLuauSolver(solver: SolverMode): Promise<void> {
  try {
    await sendRequest({ type: 'setSolver', isNew: solver === 'new' });
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
    if (workerReady) {
      await setLuauMode(newSettings.mode);
      await setLuauSolver(newSettings.solver);
    }
  });
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
    const allFiles = getAllFiles();
    await sendRequest({ type: 'registerModules', modules: allFiles });
    
    const { result, elapsed } = await executeCode(code);
    
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
    // Only show error if not a "stopped" error
    if (error instanceof Error && error.message !== 'Execution stopped') {
      appendOutput({
        type: 'error',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
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
  try {
    const response = await sendRequest({ 
      type: 'getBytecode', 
      code, 
      optimizationLevel, 
      debugLevel, 
      outputFormat, 
      showRemarks 
    });
    if (response.type === 'getBytecode') {
      return response.result;
    }
    return { success: false, bytecode: '', error: 'Unexpected response type' };
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
