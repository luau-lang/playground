/**
 * Luau WASM Module Loader and Runner
 * 
 * Uses two Web Workers:
 * - Analysis worker (long-lived): LSP, bytecode, type checking - always responsive
 * - Execution worker (on-demand): code execution - can be terminated for infinite loops
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

const STOPPED_ERROR = 'Execution stopped';

// Cached WASM binary - stored as Uint8Array so it can be cloned for transfers
let cachedWasmBinary: Uint8Array | null = null;
let wasmBinaryLoading: Promise<Uint8Array> | null = null;

/**
 * Get the WASM binary, using preloaded promise from index.html or fetching once.
 * Returns a fresh clone each time to support Transferable usage.
 */
async function getWasmBinary(): Promise<ArrayBuffer> {
  if (!cachedWasmBinary) {
    if (!wasmBinaryLoading) {
      wasmBinaryLoading = (async () => {
        let buffer: ArrayBuffer;
        if (typeof __wasmPromises !== 'undefined') {
          buffer = await __wasmPromises.luau;
        } else {
          const baseUrl = new URL('./', document.baseURI).href.replace(/\/$/, '');
          buffer = await fetch(`${baseUrl}/wasm/luau.wasm`).then(r => r.arrayBuffer());
        }
        cachedWasmBinary = new Uint8Array(buffer);
        return cachedWasmBinary;
      })();
    }
    await wasmBinaryLoading;
  }
  // Return a clone so the original survives Transferable
  return cachedWasmBinary!.slice().buffer;
}

// ============================================================================
// Worker Manager - Encapsulates worker lifecycle and request handling
// ============================================================================

interface WorkerManager {
  worker: Worker | null;
  ready: boolean;
  readyPromise: Promise<void> | null;
  pendingRequests: Map<string, {
    resolve: (value: WorkerResponse) => void;
    reject: (error: Error) => void;
  }>;
  requestIdCounter: number;
}

function createWorkerManager(): WorkerManager {
  return {
    worker: null,
    ready: false,
    readyPromise: null,
    pendingRequests: new Map(),
    requestIdCounter: 0,
  };
}

function setupWorkerHandlers(manager: WorkerManager, name: string): void {
  if (!manager.worker) return;
  
  manager.worker.onmessage = (e: MessageEvent<WorkerResponse & { requestId: string }>) => {
    const { requestId, ...response } = e.data;
    
    const pending = manager.pendingRequests.get(requestId);
    if (pending) {
      manager.pendingRequests.delete(requestId);
      if (response.type === 'error') {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response);
      }
    }
  };
  
  manager.worker.onerror = (e) => {
    console.error(`[Luau ${name}] Worker error:`, e);
    rejectAllPending(manager, new Error('Worker error'));
  };
}

function rejectAllPending(manager: WorkerManager, error: Error): void {
  for (const { reject } of manager.pendingRequests.values()) {
    reject(error);
  }
  manager.pendingRequests.clear();
}

async function initializeWorker(manager: WorkerManager, wasmBinary: ArrayBuffer): Promise<void> {
  const requestId = `init_${manager.requestIdCounter++}`;
  
  return new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(10000);
    signal.addEventListener('abort', () => reject(new Error('Worker initialization timeout')));
    
    manager.pendingRequests.set(requestId, {
      resolve: () => resolve(),
      reject,
    });
    
    manager.worker!.postMessage(
      { type: 'init', wasmBinary, requestId } satisfies WorkerRequest & { requestId: string },
      [wasmBinary]
    );
  });
}

// Type mapping from request type to response type
type ResponseForRequest<T extends WorkerRequest['type']> = Extract<WorkerResponse, { type: T }>;

async function sendToWorker<K extends WorkerRequest['type']>(
  manager: WorkerManager,
  type: K,
  params: Omit<Extract<WorkerRequest, { type: K }>, 'type'>
): Promise<ResponseForRequest<K>> {
  if (!manager.worker || !manager.ready) {
    throw new Error('Worker not ready');
  }
  
  const requestId = `req_${manager.requestIdCounter++}`;
  const request = { type, ...params } as WorkerRequest;
  
  return new Promise((resolve, reject) => {
    manager.pendingRequests.set(requestId, { 
      resolve: resolve as (value: WorkerResponse) => void, 
      reject 
    });
    manager.worker!.postMessage({ ...request, requestId });
  });
}

function terminateWorker(manager: WorkerManager, errorMessage: string = STOPPED_ERROR): void {
  manager.readyPromise = null;
  manager.ready = false;
  
  if (manager.worker) {
    manager.worker.terminate();
    manager.worker = null;
  }
  
  rejectAllPending(manager, new Error(errorMessage));
}

// ============================================================================
// Analysis Worker - Long-lived for LSP, bytecode, type checking
// ============================================================================

const analysis = createWorkerManager();

async function loadAnalysisWorker(): Promise<void> {
  if (analysis.ready && analysis.worker) {
    return;
  }

  if (analysis.readyPromise) {
    return analysis.readyPromise;
  }

  analysis.readyPromise = (async () => {
    try {
      const binaryPromise = getWasmBinary();
      analysis.worker = new LuauWorker();
      setupWorkerHandlers(analysis, 'Analysis');
      
      const wasmBinary = await binaryPromise;
      await initializeWorker(analysis, wasmBinary);
      
      analysis.ready = true;
      console.log('[Luau Analysis] Worker ready');
      
      // Sync settings
      const currentSettings = get(settings);
      const modeNum = currentSettings.mode === 'strict' ? 1 : currentSettings.mode === 'nocheck' ? 2 : 0;
      await sendToWorker(analysis, 'setMode', { mode: modeNum });
      await sendToWorker(analysis, 'setSolver', { isNew: currentSettings.solver === 'new' });
      
      // Start listening to settings changes
      initSettingsSync();
    } catch (error) {
      analysis.readyPromise = null;
      analysis.ready = false;
      throw new Error('Failed to load analysis worker', { cause: error });
    }
  })();

  return analysis.readyPromise;
}

async function sendAnalysisRequest<K extends WorkerRequest['type']>(
  type: K,
  params: Omit<Extract<WorkerRequest, { type: K }>, 'type'>
): Promise<ResponseForRequest<K>> {
  await loadAnalysisWorker();
  return sendToWorker(analysis, type, params);
}

// ============================================================================
// Execution Worker - On-demand for code execution (can be terminated)
// ============================================================================

const execution = createWorkerManager();

async function loadExecutionWorker(): Promise<void> {
  if (execution.ready && execution.worker) {
    return;
  }

  if (execution.readyPromise) {
    return execution.readyPromise;
  }

  execution.readyPromise = (async () => {
    try {
      const binaryPromise = getWasmBinary();
      execution.worker = new LuauWorker();
      setupWorkerHandlers(execution, 'Execution');
      
      const wasmBinary = await binaryPromise;
      
      if (!execution.worker) {
        throw new Error(STOPPED_ERROR);
      }
      
      await initializeWorker(execution, wasmBinary);
      
      if (!execution.worker) {
        throw new Error(STOPPED_ERROR);
      }
      
      execution.ready = true;
      console.log('[Luau Execution] Worker ready');
      
      // Sync settings (mode affects runtime behavior for some edge cases)
      const currentSettings = get(settings);
      const modeNum = currentSettings.mode === 'strict' ? 1 : currentSettings.mode === 'nocheck' ? 2 : 0;
      await sendToWorker(execution, 'setMode', { mode: modeNum });
    } catch (error) {
      execution.readyPromise = null;
      execution.ready = false;
      
      if (error instanceof Error && error.message === STOPPED_ERROR) {
        throw error;
      }
      throw new Error('Failed to load execution worker', { cause: error });
    }
  })();

  return execution.readyPromise;
}

async function sendExecutionRequest<K extends WorkerRequest['type']>(
  type: K,
  params: Omit<Extract<WorkerRequest, { type: K }>, 'type'>
): Promise<ResponseForRequest<K>> {
  await loadExecutionWorker();
  
  if (!execution.worker) {
    throw new Error(STOPPED_ERROR);
  }
  
  return sendToWorker(execution, type, params);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load/initialize the Luau WASM workers.
 * Starts the analysis worker (long-lived).
 */
export async function loadLuauWasm(): Promise<void> {
  await loadAnalysisWorker();
}

/**
 * Check if analysis worker is loaded (LSP ready).
 */
export function isWasmLoaded(): boolean {
  return analysis.ready;
}

/**
 * Stop any running execution by terminating the execution worker.
 * The analysis worker stays alive for LSP/bytecode operations.
 */
export function stopExecution(): void {
  if (!execution.worker && !execution.readyPromise) {
    return; // Nothing to stop
  }
  
  console.log('[Luau Execution] Stopping...');
  terminateWorker(execution);
  setRunning(false);
  appendOutput({ type: 'warn', text: STOPPED_ERROR });
}

/**
 * Execute Luau code using the execution worker.
 */
export async function executeCode(code: string): Promise<{ result: ExecuteResult; elapsed: number }> {
  try {
    const response = await sendExecutionRequest('execute', { code });
    return { result: response.result, elapsed: response.elapsed };
  } catch (error) {
    // Silently handle stopped/cancelled - no error to report
    if (error instanceof Error && (error.message === STOPPED_ERROR || error.message === CANCELLED_ERROR)) {
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
 * Get diagnostics for code using the analysis worker.
 */
export async function getDiagnostics(code: string): Promise<{ diagnostics: LuauDiagnostic[]; elapsed: number }> {
  try {
    const allFiles = getAllFiles();
    await sendAnalysisRequest('registerSources', { sources: allFiles });
    
    const response = await sendAnalysisRequest('getDiagnostics', { code });
    return { diagnostics: response.result.diagnostics, elapsed: response.elapsed };
  } catch (error) {
    console.error('[Luau] Diagnostics error:', error);
    return { diagnostics: [], elapsed: 0 };
  }
}

/**
 * Get autocomplete suggestions using the analysis worker.
 */
export async function getAutocomplete(code: string, line: number, col: number): Promise<LuauCompletion[]> {
  try {
    const response = await sendAnalysisRequest('autocomplete', { code, line, col });
    return response.result.items;
  } catch (error) {
    console.error('[Luau] Autocomplete error:', error);
    return [];
  }
}

/**
 * Get hover information using the analysis worker.
 */
export async function getHover(code: string, line: number, col: number): Promise<string | null> {
  try {
    const response = await sendAnalysisRequest('hover', { code, line, col });
    return response.result.content;
  } catch (error) {
    console.error('[Luau] Hover error:', error);
    return null;
  }
}

/**
 * Add a module that can be required (for analysis).
 */
export async function addModule(name: string, source: string): Promise<void> {
  try {
    await sendAnalysisRequest('addModule', { name, source });
  } catch (error) {
    console.error('[Luau] Failed to add module:', error);
  }
}

/**
 * Clear all registered modules.
 */
export async function clearModules(): Promise<void> {
  try {
    await sendAnalysisRequest('clearModules', {});
  } catch (error) {
    console.error('[Luau] Failed to clear modules:', error);
  }
}

/**
 * Get list of available modules for autocomplete.
 */
export async function getAvailableModules(): Promise<string[]> {
  try {
    const response = await sendAnalysisRequest('getModules', {});
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
    await sendAnalysisRequest('setSource', { name, source });
  } catch (error) {
    console.error('[Luau] Failed to set source:', error);
  }
}

/**
 * Set the type checking mode on the analysis worker.
 */
export async function setLuauMode(mode: LuauMode): Promise<void> {
  const modeNum = mode === 'strict' ? 1 : mode === 'nocheck' ? 2 : 0;
  try {
    await sendAnalysisRequest('setMode', { mode: modeNum });
    // Also update execution worker if it's running
    if (execution.ready) {
      await sendToWorker(execution, 'setMode', { mode: modeNum });
    }
  } catch (error) {
    console.error('[Luau] Failed to set mode:', error);
  }
}

/**
 * Set the solver mode on the analysis worker.
 */
export async function setLuauSolver(solver: SolverMode): Promise<void> {
  try {
    await sendAnalysisRequest('setSolver', { isNew: solver === 'new' });
    // Also update execution worker if it's running
    if (execution.ready) {
      await sendToWorker(execution, 'setSolver', { isNew: solver === 'new' });
    }
  } catch (error) {
    console.error('[Luau] Failed to set solver:', error);
  }
}

/**
 * Sync settings from store to WASM workers.
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
    if (analysis.ready) {
      await setLuauMode(newSettings.mode);
      await setLuauSolver(newSettings.solver);
    }
  });
}

// Run ID to track and cancel specific runs
let currentRunId = 0;

// Used for silent termination when switching actions (not user-initiated stop)
const CANCELLED_ERROR = 'Cancelled';

/**
 * Run the active file and display output.
 */
export async function runCode(): Promise<void> {
  const myRunId = ++currentRunId;
  
  // Stop any existing execution silently (not user-initiated)
  if (execution.worker) {
    terminateWorker(execution, CANCELLED_ERROR);
  }
  
  setRunning(true);
  clearOutput();
  setExecutionTime(null);

  try {
    const code = getActiveFileContent();
    const fileName = get(activeFile);
    
    appendOutput({ type: 'log', text: `Running ${fileName}...` });
    
    // Register all files as modules for require support
    const allFiles = getAllFiles();
    await sendExecutionRequest('registerModules', { modules: allFiles });
    
    if (currentRunId !== myRunId) return;
    
    const { result, elapsed } = await executeCode(code);
    
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
      result.error.split('\n').forEach((line) => {
        appendOutput({ type: 'error', text: line });
      });
    }
  } catch (error) {
    if (currentRunId === myRunId && error instanceof Error && 
        error.message !== STOPPED_ERROR && error.message !== CANCELLED_ERROR) {
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
 * Run type checking on the active file and display diagnostics.
 * Uses the analysis worker so it works even during execution.
 */
export async function checkCode(): Promise<void> {
  const myRunId = ++currentRunId;
  
  // Stop any running execution silently since user wants to check instead
  if (execution.worker) {
    terminateWorker(execution, CANCELLED_ERROR);
  }
  
  setRunning(true);
  clearOutput();
  setExecutionTime(null);

  try {
    const code = getActiveFileContent();
    const fileName = get(activeFile);
    
    appendOutput({ type: 'log', text: `Type checking ${fileName}...` });
    
    const { diagnostics, elapsed } = await getDiagnostics(code);
    
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
    if (currentRunId === myRunId && error instanceof Error && 
        error.message !== STOPPED_ERROR && error.message !== CANCELLED_ERROR) {
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
 * Get bytecode dump for code using the analysis worker.
 */
export async function getBytecode(
  code: string,
  optimizationLevel: number = 2,
  debugLevel: number = 2,
  outputFormat: number = 0,
  showRemarks: boolean = false
): Promise<{ success: boolean; bytecode: string; error?: string }> {
  try {
    const response = await sendAnalysisRequest('getBytecode', { 
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
