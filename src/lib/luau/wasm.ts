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

// Worker instance and state
let worker: Worker | null = null;
let workerReady = false;
let workerReadyPromise: Promise<void> | null = null;
let initAbortController: AbortController | null = null;

// Run ID to track and cancel specific runs (only incremented by runCode/checkCode)
let currentRunId = 0;

// Pending requests waiting for responses
const pendingRequests = new Map<string, {
  resolve: (value: WorkerResponse) => void;
  reject: (error: Error) => void;
}>();

let requestIdCounter = 0;

/**
 * Reject all pending requests with the given error.
 */
function rejectAllPending(error: Error): void {
  for (const { reject } of pendingRequests.values()) {
    reject(error);
  }
  pendingRequests.clear();
}

/**
 * Create and initialize the worker with message handlers.
 */
function createWorker(): Worker {
  const newWorker = new LuauWorker();
  
  newWorker.onmessage = (e: MessageEvent<WorkerResponse & { requestId: string }>) => {
    const { requestId, ...response } = e.data;
    
    if (pendingRequests.has(requestId)) {
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
    rejectAllPending(new Error('Worker error'));
  };
  
  return newWorker;
}

// Type mapping from request type to response type
type ResponseForRequest<T extends WorkerRequest['type']> = Extract<WorkerResponse, { type: T }>;

/**
 * Send a request to the worker and wait for a typed response.
 */
async function sendRequest<K extends WorkerRequest['type']>(
  type: K,
  params: Omit<Extract<WorkerRequest, { type: K }>, 'type'>
): Promise<ResponseForRequest<K>> {
  await loadLuauWasm();
  
  if (!worker) {
    throw new Error('Execution stopped');
  }
  
  const requestId = `req_${requestIdCounter++}`;
  const request = { type, ...params } as WorkerRequest;
  
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('Execution stopped'));
      return;
    }
    
    pendingRequests.set(requestId, { 
      resolve: resolve as (value: WorkerResponse) => void, 
      reject 
    });
    worker.postMessage({ ...request, requestId });
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

  // Create abort controller for this initialization
  initAbortController = new AbortController();
  const { signal } = initAbortController;

  workerReadyPromise = (async () => {
    try {
      // Start WASM download and worker creation in parallel
      const binaryPromise = getWasmBinary();
      worker = createWorker();
      
      const wasmBinary = await binaryPromise;
      
      if (signal.aborted || !worker) {
        throw new Error('Execution stopped');
      }
      
      // Wait for worker to initialize with WASM
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, 10000);
        
        // Listen for abort
        const onAbort = () => {
          clearTimeout(timeout);
          reject(new Error('Execution stopped'));
        };
        signal.addEventListener('abort', onAbort);
        
        const requestId = `init_${requestIdCounter++}`;
        pendingRequests.set(requestId, {
          resolve: () => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', onAbort);
            resolve();
          },
          reject: (err) => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', onAbort);
            reject(err);
          }
        });
        
        // Use Transferable to avoid copying the ArrayBuffer
        worker!.postMessage(
          { type: 'init', wasmBinary, requestId } satisfies WorkerRequest & { requestId: string },
          [wasmBinary]
        );
      });
      
      if (signal.aborted || !worker) {
        throw new Error('Execution stopped');
      }
      
      workerReady = true;
      initAbortController = null;
      console.log('[Luau WASM] Worker ready');
      
      // Sync settings to worker
      const currentSettings = get(settings);
      const modeNum = currentSettings.mode === 'strict' ? 1 : currentSettings.mode === 'nocheck' ? 2 : 0;
      await sendRequest('setMode', { mode: modeNum });
      await sendRequest('setSolver', { isNew: currentSettings.solver === 'new' });
      
      // Start listening to settings changes
      initSettingsSync();
    } catch (error) {
      workerReadyPromise = null;
      workerReady = false;
      initAbortController = null;
      
      if (error instanceof Error && error.message === 'Execution stopped') {
        throw error;
      }
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
 * Stop any running execution by terminating the worker.
 */
export function stopExecution(): void {
  console.log('[Luau WASM] Stopping execution...');
  
  // Abort any in-progress initialization
  if (initAbortController) {
    initAbortController.abort();
    initAbortController = null;
  }
  
  // Reset initialization state
  workerReadyPromise = null;
  workerReady = false;
  
  // Terminate worker if it exists
  if (worker) {
    worker.terminate();
    worker = null;
  }
  
  // Reject all pending requests
  rejectAllPending(new Error('Execution stopped'));
  
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
    const response = await sendRequest('execute', { code });
    return { result: response.result, elapsed: response.elapsed };
  } catch (error) {
    // Check if this was a stop - don't return an error for that
    if (error instanceof Error && error.message === 'Execution stopped') {
      return { result: { success: false, output: '', error: undefined }, elapsed: 0 };
    }
    
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      result: { success: false, output: '', error: errorMsg },
      elapsed: 0,
    };
  }
}

/**
 * Get diagnostics for code.
 * Returns both diagnostics and elapsed time from the worker.
 */
export async function getDiagnostics(code: string): Promise<{ diagnostics: LuauDiagnostic[]; elapsed: number }> {
  try {
    // Register all files for cross-file type checking
    const allFiles = getAllFiles();
    await sendRequest('registerSources', { sources: allFiles });
    
    const response = await sendRequest('getDiagnostics', { code });
    return { diagnostics: response.result.diagnostics, elapsed: response.elapsed };
  } catch (error) {
    console.error('[Luau] Diagnostics error:', error);
    return { diagnostics: [], elapsed: 0 };
  }
}

/**
 * Get autocomplete suggestions.
 */
export async function getAutocomplete(code: string, line: number, col: number): Promise<LuauCompletion[]> {
  try {
    const response = await sendRequest('autocomplete', { code, line, col });
    return response.result.items;
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
    const response = await sendRequest('hover', { code, line, col });
    return response.result.content;
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
    await sendRequest('addModule', { name, source });
  } catch (error) {
    console.error('[Luau] Failed to add module:', error);
  }
}

/**
 * Clear all registered modules.
 */
export async function clearModules(): Promise<void> {
  try {
    await sendRequest('clearModules', {});
  } catch (error) {
    console.error('[Luau] Failed to clear modules:', error);
  }
}

/**
 * Get list of available modules for autocomplete.
 */
export async function getAvailableModules(): Promise<string[]> {
  try {
    const response = await sendRequest('getModules', {});
    return response.result.modules;
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
    await sendRequest('setSource', { name, source });
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
    await sendRequest('setMode', { mode: modeNum });
  } catch (error) {
    console.error('[Luau] Failed to set mode:', error);
  }
}

/**
 * Set the solver mode.
 */
export async function setLuauSolver(solver: SolverMode): Promise<void> {
  try {
    await sendRequest('setSolver', { isNew: solver === 'new' });
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
  // Capture run ID for this execution
  const myRunId = ++currentRunId;
  
  setRunning(true);
  clearOutput();
  setExecutionTime(null);

  try {
    const code = getActiveFileContent();
    const fileName = get(activeFile);
    
    appendOutput({ type: 'log', text: `Running ${fileName}...` });
    
    // Register all files as modules for require support
    const allFiles = getAllFiles();
    await sendRequest('registerModules', { modules: allFiles });
    
    // Check if this run was cancelled
    if (currentRunId !== myRunId) return;
    
    const { result, elapsed } = await executeCode(code);
    
    // Check if this run was cancelled
    if (currentRunId !== myRunId) return;
    
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
    // Only show error if this run wasn't cancelled and not a "stopped" error
    if (currentRunId === myRunId && error instanceof Error && error.message !== 'Execution stopped') {
      appendOutput({
        type: 'error',
        text: `Error: ${error.message}`,
      });
    }
  } finally {
    // Only update state if this is still the current run
    if (currentRunId === myRunId) {
      setRunning(false);
    }
  }
}

/**
 * Run type checking on the active file and display diagnostics.
 */
export async function checkCode(): Promise<void> {
  const myRunId = ++currentRunId;
  
  setRunning(true);
  clearOutput();
  setExecutionTime(null);

  try {
    const code = getActiveFileContent();
    const fileName = get(activeFile);
    
    appendOutput({ type: 'log', text: `Type checking ${fileName}...` });
    
    // Get diagnostics with timing from worker
    const { diagnostics, elapsed } = await getDiagnostics(code);
    
    // Check if this run was cancelled
    if (currentRunId !== myRunId) return;
    
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
    // Only show error if this run wasn't cancelled and not a "stopped" error
    if (currentRunId === myRunId && error instanceof Error && error.message !== 'Execution stopped') {
      appendOutput({
        type: 'error',
        text: `Error: ${error.message}`,
      });
    }
  } finally {
    if (currentRunId === myRunId) {
      setRunning(false);
    }
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
    const response = await sendRequest('getBytecode', { 
      code, 
      optimizationLevel, 
      debugLevel, 
      outputFormat, 
      showRemarks 
    });
    return response.result;
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
