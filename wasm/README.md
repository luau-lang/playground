# Luau Playground WASM Module

This directory contains the WebAssembly build of Luau for the playground. It includes both **code execution** (VM) and **analysis** (type checking, autocomplete, hover) capabilities.

## Prerequisites

1. **Emscripten SDK**: Install from https://emscripten.org/docs/getting_started/downloads.html
2. **CMake 3.16+**

## Building

```bash
# Activate Emscripten (adjust path as needed)
source ~/emsdk/emsdk_env.sh

# Build release version
./build.sh release

# Or debug version
./build.sh debug
```

The build script will:
1. Clone the Luau source if not present
2. Configure with CMake using Emscripten
3. Build the WASM module
4. Copy output to `../public/wasm/`

## Exported Functions

### Execution

- `luau_execute(code: string)` - Execute Luau code, returns JSON with output and any errors

### Analysis

- `luau_get_diagnostics(code: string)` - Get type errors and lint warnings
- `luau_autocomplete(code: string, line: number, col: number)` - Get completion suggestions
- `luau_hover(code: string, line: number, col: number)` - Get type info for hover
- `luau_signature_help(code: string, line: number, col: number)` - Get function signatures
- `luau_get_lints()` - Get a list of all lints

### Configuration

- `luau_set_solver(useNew: boolean)` - Switch between the old or new solver
- `luau_set_mode(mode: number)` - Set the type checking mode between non-strict (0), strict (1) and no-check (2)
- `luau_set_lints(serializedLints: string)` - Enable lints serialized as lint codes seperated by commas
- `luau_set_fflags(serializedFlags: string)` - Apply Luau fast flags/ints serialized as newline-delimited `"Name=Value"` entries

### Modules

- `luau_add_module(name: string, source: string)` - Add a module that can be required
- `luau_clear_modules()` - Clear all modules
- `luau_get_modules()` - Get list of available modules for autocomplete
- `luau_set_source(name: string, source: string)` - Set source for a file
- `luau_clear_sources()` - Clear all analysis sources and analysis-side module names

### Bytecode

- `luau_dump_bytecode(code: string, optimizationLevel: number, debugLevel: number, outputFormat: number, showRemarks: boolean)` - Dump bytecode as human-readable text, is able to dump VM, IR, x64 and arm64 bytecode depending on `outputFormat`

## Output Format

All functions return JSON strings. Example responses:

```json
// luau_execute
{ "success": true, "output": "Hello, World!" }
{ "success": false, "output": "", "error": "attempt to call nil" }

// luau_get_diagnostics
{ "diagnostics": [
  { "type": "SyntaxError", "severity": "error", "moduleName": "main", "code": 1014, "message": "...", "startLine": 0, "startCol": 0, "endLine": 0, "endCol": 5 }
]}

// luau_autocomplete
{ "items": [
  { "label": "print", "kind": "function", "detail": "(string) -> ()", "deprecated": false }
]}

// luau_hover
{ "content": "```luau\nprint: (string) -> ()\n```" }

// luau_get_lints
{ "lints": [ "UknownGlobal", "DeprecatedGlobal", "..." ] }

// luau_get_modules
{ "modules": ["module1", "module2", "someModule"] }

// luau_dump_bytecode
{ "success": true, "bytecode": "..." }
{ "success": false, "bytecode": "", "error": "Incomplete statement: ..." }
```
