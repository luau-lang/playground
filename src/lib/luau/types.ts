/**
 * Luau WASM Module Types
 */

import type { LuauValue } from '$lib/utils/output';

export interface LuauDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface LuauCompletion {
  label: string;
  kind: 'function' | 'variable' | 'property' | 'keyword' | 'constant' | 'type' | 'module';
  detail?: string;
  deprecated: boolean;
}

export interface ExecuteResult {
  success: boolean;
  output: string;
  prints?: LuauValue[][];
  error?: string;
}

export interface DiagnosticsResult {
  diagnostics: LuauDiagnostic[];
}

export interface AutocompleteResult {
  items: LuauCompletion[];
}

export interface HoverResult {
  content: string | null;
}

export interface SignatureResult {
  signatures: Array<{
    label: string;
    documentation?: string;
    parameters?: Array<{
      label: string;
      documentation?: string;
    }>;
  }>;
}

/** The Emscripten module interface */
export interface LuauWasmModule {
  // Execution
  ccall(name: 'luau_execute', returnType: 'string', argTypes: ['string'], args: [string]): string;
  
  // Module management (for require support)
  ccall(name: 'luau_add_module', returnType: null, argTypes: ['string', 'string'], args: [string, string]): void;
  ccall(name: 'luau_clear_modules', returnType: null, argTypes: [], args: []): void;
  ccall(name: 'luau_get_modules', returnType: 'string', argTypes: [], args: []): string;
  ccall(name: 'luau_set_source', returnType: null, argTypes: ['string', 'string'], args: [string, string]): void;
  
  // Analysis
  ccall(name: 'luau_get_diagnostics', returnType: 'string', argTypes: ['string'], args: [string]): string;
  ccall(name: 'luau_autocomplete', returnType: 'string', argTypes: ['string', 'number', 'number'], args: [string, number, number]): string;
  ccall(name: 'luau_hover', returnType: 'string', argTypes: ['string', 'number', 'number'], args: [string, number, number]): string;
  ccall(name: 'luau_signature_help', returnType: 'string', argTypes: ['string', 'number', 'number'], args: [string, number, number]): string;
    
  // Configuration
  ccall(name: 'luau_set_mode', returnType: null, argTypes: ['number'], args: [number]): void;
  ccall(name: 'luau_set_solver', returnType: null, argTypes: ['boolean'], args: [boolean]): void;
  
  // Bytecode
  ccall(name: 'luau_dump_bytecode', returnType: 'string', argTypes: ['string', 'number', 'number', 'number', 'number'], args: [string, number, number, number, number]): string;
  
  // Memory
  _malloc(size: number): number;
  _free(ptr: number): void;
  
  // String helpers
  UTF8ToString(ptr: number): string;
  stringToUTF8(str: string, outPtr: number, maxBytes: number): void;
  lengthBytesUTF8(str: string): number;
}

export type CreateLuauModule = (options?: {
  /** Use pre-compiled WebAssembly.Module for instantiation (avoids recompilation) */
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    successCallback: (instance: WebAssembly.Instance) => void
  ) => WebAssembly.Exports | Record<string, never>;
}) => Promise<LuauWasmModule>;

declare global {
  interface Window {
    createLuauModule?: CreateLuauModule;
  }
}

