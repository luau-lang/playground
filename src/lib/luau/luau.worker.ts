/**
 * Luau WASM Web Worker
 * 
 * Runs Luau WASM execution in a separate thread to prevent UI blocking.
 * Allows for termination of infinite loops by killing the worker.
 */

import type { 
  LuauWasmModule, 
  ExecuteResult, 
  DiagnosticsResult, 
  AutocompleteResult, 
  HoverResult,
  CreateLuauModule 
} from './types';
import createLuauModuleFactory from './luau-module.js';

// The WASM module singleton within this worker
let wasmModule: LuauWasmModule | null = null;
let modulePromise: Promise<LuauWasmModule> | null = null;

// Message types for worker communication
export type WorkerRequest = 
  | { type: 'init'; wasmBinary: ArrayBuffer }
  | { type: 'execute'; code: string }
  | { type: 'getDiagnostics'; code: string }
  | { type: 'autocomplete'; code: string; line: number; col: number }
  | { type: 'hover'; code: string; line: number; col: number }
  | { type: 'addModule'; name: string; source: string }
  | { type: 'clearModules' }
  | { type: 'getModules' }
  | { type: 'setSource'; name: string; source: string }
  | { type: 'setMode'; mode: number }
  | { type: 'setSolver'; isNew: boolean }
  | { type: 'getBytecode'; code: string; optimizationLevel: number; debugLevel: number; outputFormat: number; showRemarks: boolean }
  | { type: 'registerModules'; modules: Record<string, string> }
  | { type: 'registerSources'; sources: Record<string, string> };

export type WorkerResponse = 
  | { type: 'ready' }
  | { type: 'execute'; result: ExecuteResult; elapsed: number }
  | { type: 'getDiagnostics'; result: DiagnosticsResult; elapsed: number }
  | { type: 'autocomplete'; result: AutocompleteResult }
  | { type: 'hover'; result: HoverResult }
  | { type: 'addModule'; success: boolean }
  | { type: 'clearModules'; success: boolean }
  | { type: 'getModules'; result: { modules: string[] } }
  | { type: 'setSource'; success: boolean }
  | { type: 'setMode'; success: boolean }
  | { type: 'setSolver'; success: boolean }
  | { type: 'getBytecode'; result: { success: boolean; bytecode: string; error?: string } }
  | { type: 'registerModules'; success: boolean }
  | { type: 'registerSources'; success: boolean }
  | { type: 'error'; error: string };

let cachedWasmBinary: Uint8Array | null = null;

async function loadModule(): Promise<LuauWasmModule> {
  if (wasmModule) return wasmModule;
  if (modulePromise) return modulePromise;

  if (!cachedWasmBinary) {
    throw new Error('WASM binary not initialized - call init first');
  }

  modulePromise = (async () => {
    const module = await (createLuauModuleFactory as CreateLuauModule)({
      wasmBinary: cachedWasmBinary!,
    });

    wasmModule = module;
    // Free the buffer now that module is loaded - it's held internally by WASM
    cachedWasmBinary = null;
    return module;
  })();

  return modulePromise;
}

/**
 * Register a file with both its original name and without extension.
 * This allows require("foo") to work for "foo.luau".
 */
function registerFile(
  module: LuauWasmModule,
  name: string,
  content: string,
  fn: 'luau_add_module' | 'luau_set_source'
): void {
  // Use type assertion since ccall has strict overloads but we know these are valid
  type CCall = (fn: string, ret: null, types: string[], args: string[]) => void;
  const call = module.ccall as unknown as CCall;
  call(fn, null, ['string', 'string'], [name, content]);
  const nameWithoutExt = name.replace(/\.(luau|lua)$/, '');
  if (nameWithoutExt !== name) {
    call(fn, null, ['string', 'string'], [nameWithoutExt, content]);
  }
}

// Helper to send response with requestId
function respond(requestId: string, response: WorkerResponse): void {
  self.postMessage({ ...response, requestId });
}

// Handle messages from main thread
self.onmessage = async (e: MessageEvent<WorkerRequest & { requestId: string }>) => {
  const { requestId, ...request } = e.data;
  
  try {
    switch (request.type) {
      case 'init': {
        // Convert transferred ArrayBuffer to Uint8Array for Emscripten
        cachedWasmBinary = new Uint8Array(request.wasmBinary);
        await loadModule();
        respond(requestId, { type: 'ready' });
        break;
      }
      
      case 'execute': {
        const module = await loadModule();
        const startTime = performance.now();
        const resultJson = module.ccall('luau_execute', 'string', ['string'], [request.code]);
        const elapsed = performance.now() - startTime;
        if (!resultJson) {
          respond(requestId, { 
            type: 'execute', 
            result: { success: false, output: '', error: 'No result returned from execution' },
            elapsed
          });
        } else {
          const parsed = JSON.parse(resultJson) as ExecuteResult;
          respond(requestId, { type: 'execute', result: parsed, elapsed });
        }
        break;
      }
      
      case 'getDiagnostics': {
        const module = await loadModule();
        const startTime = performance.now();
        const resultJson = module.ccall('luau_get_diagnostics', 'string', ['string'], [request.code]);
        const elapsed = performance.now() - startTime;
        const result = JSON.parse(resultJson) as DiagnosticsResult;
        respond(requestId, { type: 'getDiagnostics', result, elapsed });
        break;
      }
      
      case 'autocomplete': {
        const module = await loadModule();
        const resultJson = module.ccall('luau_autocomplete', 'string', ['string', 'number', 'number'], [request.code, request.line, request.col]);
        const result = JSON.parse(resultJson) as AutocompleteResult;
        respond(requestId, { type: 'autocomplete', result });
        break;
      }
      
      case 'hover': {
        const module = await loadModule();
        const resultJson = module.ccall('luau_hover', 'string', ['string', 'number', 'number'], [request.code, request.line, request.col]);
        const result = JSON.parse(resultJson) as HoverResult;
        respond(requestId, { type: 'hover', result });
        break;
      }
      
      case 'addModule': {
        const module = await loadModule();
        module.ccall('luau_add_module', null, ['string', 'string'], [request.name, request.source]);
        respond(requestId, { type: 'addModule', success: true });
        break;
      }
      
      case 'clearModules': {
        const module = await loadModule();
        module.ccall('luau_clear_modules', null, [], []);
        respond(requestId, { type: 'clearModules', success: true });
        break;
      }
      
      case 'getModules': {
        const module = await loadModule();
        const resultJson = module.ccall('luau_get_modules', 'string', [], []);
        const result = JSON.parse(resultJson) as { modules: string[] };
        respond(requestId, { type: 'getModules', result });
        break;
      }
      
      case 'setSource': {
        const module = await loadModule();
        module.ccall('luau_set_source', null, ['string', 'string'], [request.name, request.source]);
        respond(requestId, { type: 'setSource', success: true });
        break;
      }
      
      case 'setMode': {
        const module = await loadModule();
        module.ccall('luau_set_mode', null, ['number'], [request.mode]);
        respond(requestId, { type: 'setMode', success: true });
        break;
      }
      
      case 'setSolver': {
        const module = await loadModule();
        module.ccall('luau_set_solver', null, ['boolean'], [request.isNew]);
        respond(requestId, { type: 'setSolver', success: true });
        break;
      }
      
      case 'getBytecode': {
        const module = await loadModule();
        const resultJson = module.ccall(
          'luau_dump_bytecode',
          'string',
          ['string', 'number', 'number', 'number', 'number'],
          [request.code, request.optimizationLevel, request.debugLevel, request.outputFormat, request.showRemarks ? 1 : 0]
        );
        const result = JSON.parse(resultJson);
        respond(requestId, { type: 'getBytecode', result });
        break;
      }
      
      case 'registerModules': {
        const module = await loadModule();
        // Clear existing modules first
        module.ccall('luau_clear_modules', null, [], []);
        // Register each module
        for (const [name, content] of Object.entries(request.modules)) {
          registerFile(module, name, content, 'luau_add_module');
        }
        respond(requestId, { type: 'registerModules', success: true });
        break;
      }
      
      case 'registerSources': {
        const module = await loadModule();
        for (const [name, content] of Object.entries(request.sources)) {
          registerFile(module, name, content, 'luau_set_source');
        }
        respond(requestId, { type: 'registerSources', success: true });
        break;
      }
      
      default: {
        const exhaustiveCheck: never = request;
        respond(requestId, { type: 'error', error: `Unknown request type: ${(exhaustiveCheck as WorkerRequest).type}` });
        break;
      }
    }
  } catch (error) {
    let errorMsg = 'Unknown error';
    if (error instanceof Error) {
      errorMsg = error.message;
    } else if (typeof error === 'number') {
      errorMsg = `Uncaught exception (code: ${error})`;
    } else {
      errorMsg = String(error);
    }
    respond(requestId, { type: 'error', error: errorMsg });
  }
};

