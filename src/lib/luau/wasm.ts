/**
 * Luau WASM Module Loader and Runner
 * 
 * Uses two workers:
 * - Analysis worker (long-lived): LSP, bytecode, type checking - shared when available
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
import LuauSharedWorker from './luau.worker?sharedworker';

declare const __wasmPromises: { luau: Promise<ArrayBuffer> } | undefined;

// Error messages for termination
const STOPPED_ERROR = 'Execution stopped';
const CANCELLED_ERROR = 'Cancelled';

// Convert LuauMode to numeric value for WASM
const modeToNum = (mode: LuauMode): number =>
  mode === 'strict' ? 1 : mode === 'nocheck' ? 2 : 0;

// Compiled WASM module - shared with workers to avoid recompilation
// WebAssembly.Module is structured-clonable, so workers get the same compiled code
let wasmBinary: ArrayBuffer | null = null;
let wasmBinaryLoading: Promise<ArrayBuffer> | null = null;
let compiledWasmModule: WebAssembly.Module | null = null;
let wasmModuleLoading: Promise<WebAssembly.Module> | null = null;

async function getWasmBinary(): Promise<ArrayBuffer> {
  if (!wasmBinary) {
    if (!wasmBinaryLoading) {
      wasmBinaryLoading = (async () => {
        if (typeof __wasmPromises !== 'undefined') {
          wasmBinary = await __wasmPromises.luau;
        } else {
          const baseUrl = new URL('./', document.baseURI).href.replace(/\/$/, '');
          wasmBinary = await fetch(`${baseUrl}/wasm/luau.wasm`).then(r => r.arrayBuffer());
        }
        return wasmBinary;
      })();
    }
    await wasmBinaryLoading;
  }
  return wasmBinary!;
}

/**
 * Get the compiled WASM module, using preloaded promise from index.html or fetching once.
 * WebAssembly.Module is structured-clonable and can be sent to workers without copying
 * the entire compiled code - workers can instantiate directly from the shared module.
 */
async function getCompiledWasmModule(): Promise<WebAssembly.Module> {
  if (!compiledWasmModule) {
    if (!wasmModuleLoading) {
      wasmModuleLoading = (async () => {
        const buffer = await getWasmBinary();
        // Compile once - the compiled module can be shared with workers
        compiledWasmModule = await WebAssembly.compile(buffer);
        return compiledWasmModule;
      })();
    }
    await wasmModuleLoading;
  }
  return compiledWasmModule!;
}

// ============================================================================
// Worker Manager - Encapsulates worker lifecycle and request handling
// ============================================================================

interface WorkerManager {
  worker: Worker | SharedWorker | null;
  port: MessagePort | null;
  isShared: boolean;
  lastIsShared: boolean;
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
    port: null,
    isShared: false,
    lastIsShared: false,
    ready: false,
    readyPromise: null,
    pendingRequests: new Map(),
    requestIdCounter: 0,
  };
}

function isSharedWorker(worker: Worker | SharedWorker): worker is SharedWorker {
  return 'port' in worker;
}

function getMessageTarget(manager: WorkerManager): Worker | MessagePort {
  if (manager.port) {
    return manager.port;
  }
  if (!manager.worker) {
    throw new Error('Worker not initialized');
  }
  return manager.worker;
}

function setupWorkerHandlers(manager: WorkerManager, name: string): void {
  if (!manager.worker) return;
  const target = getMessageTarget(manager);
  
  target.onmessage = (e: MessageEvent<WorkerResponse & { requestId: string }>) => {
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
  
  target.onmessageerror = (e) => {
    console.error(`[Luau ${name}] Worker message error:`, e);
    terminateWorker(manager, 'Worker message error');
  };
  
  manager.worker.onerror = (e) => {
    console.error(`[Luau ${name}] Worker error:`, e);
    // Reset state so future requests trigger a new worker
    terminateWorker(manager, 'Worker error');
  };
}

function rejectAllPending(manager: WorkerManager, error: Error): void {
  for (const { reject } of manager.pendingRequests.values()) {
    reject(error);
  }
  manager.pendingRequests.clear();
}

async function initializeWorker(
  manager: WorkerManager,
  initData: { wasmModule?: WebAssembly.Module; wasmBytes?: ArrayBuffer }
): Promise<void> {
  const requestId = `init_${manager.requestIdCounter++}`;
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      manager.pendingRequests.delete(requestId);
      reject(new Error('Worker initialization timeout'));
    }, 10000);
    
    manager.pendingRequests.set(requestId, {
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
    
    getMessageTarget(manager).postMessage({
      type: 'init',
      requestId,
      ...initData,
    } satisfies WorkerRequest & { requestId: string });
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
    getMessageTarget(manager).postMessage({ ...request, requestId });
  });
}

function terminateWorker(manager: WorkerManager, errorMessage: string = STOPPED_ERROR): void {
  manager.readyPromise = null;
  manager.ready = false;
  
  if (manager.worker) {
    manager.lastIsShared = manager.isShared;
    if (manager.isShared) {
      manager.port?.close();
    } else {
      manager.worker.terminate();
    }
    manager.worker = null;
    manager.port = null;
    manager.isShared = false;
  }
  
  rejectAllPending(manager, new Error(errorMessage));
}

// ============================================================================
// Worker Loading
// ============================================================================

async function loadWorker(
  manager: WorkerManager,
  name: string,
  options?: { 
    checkTerminated?: boolean;
    postInit?: () => Promise<void>;
    createWorker?: () => Worker | SharedWorker;
  }
): Promise<void> {
  if (manager.ready && manager.worker) {
    return;
  }

  if (manager.readyPromise) {
    return manager.readyPromise;
  }

  const { checkTerminated = false, postInit, createWorker } = options ?? {};

  manager.readyPromise = (async () => {
    try {
      manager.worker = createWorker?.() ?? new LuauWorker();
      manager.isShared = isSharedWorker(manager.worker);
      manager.lastIsShared = manager.isShared;
      manager.port = manager.isShared ? manager.worker.port : null;
      manager.port?.start();
      setupWorkerHandlers(manager, name);
      
      const initData = manager.isShared
        ? { wasmBytes: await getWasmBinary() }
        : { wasmModule: await getCompiledWasmModule() };
      
      if (checkTerminated && !manager.worker) {
        throw new Error(STOPPED_ERROR);
      }
      
      await initializeWorker(manager, initData);
      
      if (checkTerminated && !manager.worker) {
        throw new Error(STOPPED_ERROR);
      }
      
      manager.ready = true;
      
      await postInit?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Worker error';
      terminateWorker(manager, errorMessage);
      manager.readyPromise = null;
      manager.ready = false;
      
      if (error instanceof Error && error.message === STOPPED_ERROR) {
        throw error;
      }
      throw new Error(`Failed to load ${name.toLowerCase()} worker`, { cause: error });
    }
  })();

  return manager.readyPromise;
}

// ============================================================================
// Analysis Worker - Long-lived for LSP, bytecode, type checking
// ============================================================================

const analysis = createWorkerManager();
let analysisSharedFailed = false;
let analysisFallbackPromise: Promise<void> | null = null;

async function loadAnalysisWorker(): Promise<void> {
  const postInit = async () => {
    const currentSettings = get(settings);
    await sendToWorker(analysis, 'setMode', { mode: modeToNum(currentSettings.mode) });
    await sendToWorker(analysis, 'setSolver', { isNew: currentSettings.solver === 'new' });
    initSettingsSync();
  };
  const createWorker = () => {
    if (!analysisSharedFailed && typeof SharedWorker !== 'undefined') {
      try {
        return new LuauSharedWorker();
      } catch (error) {
        console.warn('[Luau] SharedWorker unavailable, falling back to Web Worker.', error);
      }
    }
    return new LuauWorker();
  };

  try {
    await loadWorker(analysis, 'Analysis', {
      createWorker,
      postInit,
    });
  } catch (error) {
    if (!analysisSharedFailed && analysis.lastIsShared) {
      if (!analysisFallbackPromise) {
        analysisSharedFailed = true;
        analysisFallbackPromise = (async () => {
          console.warn('[Luau] SharedWorker failed to initialize, falling back to Web Worker.', error);
          await loadWorker(analysis, 'Analysis', {
            createWorker: () => new LuauWorker(),
            postInit,
          });
        })();
      }
      try {
        await analysisFallbackPromise;
      } finally {
        analysisFallbackPromise = null;
      }
      return;
    }
    throw error;
  }
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
  return loadWorker(execution, 'Execution', {
    checkTerminated: true,
    postInit: async () => {
      const currentSettings = get(settings);
      await sendToWorker(execution, 'setMode', { mode: modeToNum(currentSettings.mode) });
    }
  });
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
 * Stop any running execution by terminating the execution worker.
 * The analysis worker stays alive for LSP/bytecode operations.
 */
export function stopExecution(): void {
  if (!execution.worker && !execution.readyPromise) {
    return; // Nothing to stop
  }
  
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
 * Set the type checking mode on the analysis worker.
 */
export async function setLuauMode(mode: LuauMode): Promise<void> {
  try {
    await sendAnalysisRequest('setMode', { mode: modeToNum(mode) });
    // Also update execution worker if it's running
    if (execution.ready) {
      await sendToWorker(execution, 'setMode', { mode: modeToNum(mode) });
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

/**
 * Run the active file and display output.
 */
export async function runCode(): Promise<void> {
  const myRunId = ++currentRunId;
  
  // Set running state before termination to avoid brief isRunning=false gap
  setRunning(true);
  clearOutput();
  setExecutionTime(null);
  
  // Stop any existing execution silently (not user-initiated)
  if (execution.worker) {
    terminateWorker(execution, CANCELLED_ERROR);
  }

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
      // Terminate execution worker to free memory when not running
      // Worker startup is fast enough (~20-50ms) to recreate on demand
      if (execution.worker) {
        terminateWorker(execution, 'Execution complete');
      }
    }
  }
}

/**
 * Run type checking on the active file and display diagnostics.
 * Uses the analysis worker so it works even during execution.
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
