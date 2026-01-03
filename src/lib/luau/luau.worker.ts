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
  | { type: 'init'; baseUrl: string }
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
  | { type: 'execute'; result: ExecuteResult }
  | { type: 'getDiagnostics'; result: DiagnosticsResult }
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
  | { type: 'error'; error: string; requestType?: string };

let baseUrl = '';

async function loadModule(): Promise<LuauWasmModule> {
  if (wasmModule) return wasmModule;
  if (modulePromise) return modulePromise;

  modulePromise = (async () => {
    const module = await (createLuauModuleFactory as CreateLuauModule)({
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          return `${baseUrl}/wasm/luau.wasm`;
        }
        return `${baseUrl}/wasm/${path}`;
      },
    });

    wasmModule = module;
    return module;
  })();

  return modulePromise;
}

// Helper to send response with requestId
function respond(response: WorkerResponse, requestId?: string) {
  self.postMessage(requestId ? { ...response, requestId } : response);
}

// Handle messages from main thread
self.onmessage = async (e: MessageEvent<WorkerRequest & { requestId?: string }>) => {
  const { requestId, ...request } = e.data;
  
  try {
    switch (request.type) {
      case 'init': {
        baseUrl = request.baseUrl;
        await loadModule();
        respond({ type: 'ready' }, requestId);
        break;
      }
      
      case 'execute': {
        const module = await loadModule();
        const resultJson = module.ccall('luau_execute', 'string', ['string'], [request.code]);
        if (!resultJson) {
          respond({ 
            type: 'execute', 
            result: { success: false, output: '', error: 'No result returned from execution' } 
          }, requestId);
        } else {
          const parsed = JSON.parse(resultJson) as ExecuteResult;
          respond({ type: 'execute', result: parsed }, requestId);
        }
        break;
      }
      
      case 'getDiagnostics': {
        const module = await loadModule();
        const resultJson = module.ccall('luau_get_diagnostics', 'string', ['string'], [request.code]);
        const result = JSON.parse(resultJson) as DiagnosticsResult;
        respond({ type: 'getDiagnostics', result }, requestId);
        break;
      }
      
      case 'autocomplete': {
        const module = await loadModule();
        const resultJson = module.ccall('luau_autocomplete', 'string', ['string', 'number', 'number'], [request.code, request.line, request.col]);
        const result = JSON.parse(resultJson) as AutocompleteResult;
        respond({ type: 'autocomplete', result }, requestId);
        break;
      }
      
      case 'hover': {
        const module = await loadModule();
        const resultJson = module.ccall('luau_hover', 'string', ['string', 'number', 'number'], [request.code, request.line, request.col]);
        const result = JSON.parse(resultJson) as HoverResult;
        respond({ type: 'hover', result }, requestId);
        break;
      }
      
      case 'addModule': {
        const module = await loadModule();
        module.ccall('luau_add_module', null, ['string', 'string'], [request.name, request.source]);
        respond({ type: 'addModule', success: true }, requestId);
        break;
      }
      
      case 'clearModules': {
        const module = await loadModule();
        module.ccall('luau_clear_modules', null, [], []);
        respond({ type: 'clearModules', success: true }, requestId);
        break;
      }
      
      case 'getModules': {
        const module = await loadModule();
        const resultJson = module.ccall('luau_get_modules', 'string', [], []);
        const result = JSON.parse(resultJson) as { modules: string[] };
        respond({ type: 'getModules', result }, requestId);
        break;
      }
      
      case 'setSource': {
        const module = await loadModule();
        module.ccall('luau_set_source', null, ['string', 'string'], [request.name, request.source]);
        respond({ type: 'setSource', success: true }, requestId);
        break;
      }
      
      case 'setMode': {
        const module = await loadModule();
        module.ccall('luau_set_mode', null, ['number'], [request.mode]);
        respond({ type: 'setMode', success: true }, requestId);
        break;
      }
      
      case 'setSolver': {
        const module = await loadModule();
        module.ccall('luau_set_solver', null, ['boolean'], [request.isNew]);
        respond({ type: 'setSolver', success: true }, requestId);
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
        respond({ type: 'getBytecode', result }, requestId);
        break;
      }
      
      case 'registerModules': {
        const module = await loadModule();
        // Clear existing modules first
        try {
          module.ccall('luau_clear_modules', null, [], []);
        } catch {
          // Ignore
        }
        // Register each module
        for (const [name, content] of Object.entries(request.modules)) {
          try {
            module.ccall('luau_add_module', null, ['string', 'string'], [name, content]);
            // Also register without extension
            const nameWithoutExt = name.replace(/\.(luau|lua)$/, '');
            if (nameWithoutExt !== name) {
              module.ccall('luau_add_module', null, ['string', 'string'], [nameWithoutExt, content]);
            }
          } catch {
            // Ignore individual errors
          }
        }
        respond({ type: 'registerModules', success: true }, requestId);
        break;
      }
      
      case 'registerSources': {
        const module = await loadModule();
        for (const [name, content] of Object.entries(request.sources)) {
          try {
            module.ccall('luau_set_source', null, ['string', 'string'], [name, content]);
            const nameWithoutExt = name.replace(/\.(luau|lua)$/, '');
            if (nameWithoutExt !== name) {
              module.ccall('luau_set_source', null, ['string', 'string'], [nameWithoutExt, content]);
            }
          } catch {
            // Ignore
          }
        }
        respond({ type: 'registerSources', success: true }, requestId);
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
    respond({ 
      type: 'error', 
      error: errorMsg,
      requestType: request.type
    }, requestId);
  }
};

