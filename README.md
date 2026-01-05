# Luau Playground

A browser-based Luau code playground with execution and IDE features.

![Luau Playground](https://img.shields.io/badge/Luau-Playground-blue)

## Features

- **Code Execution**: Run Luau code directly in the browser via WebAssembly
- **Type Checking**: Type check Luau code directly in the browser via WebAssembly
- **Syntax Highlighting**: Full Luau syntax support with light/dark themes
- **IDE Features**: 
  - Real-time diagnostics (type errors, lint warnings)
  - Autocomplete with type information
  - Hover tooltips for type inspection
- **Multi-file Support**: Create and manage multiple files with tabs
- **Sharing**: Compress and share playground state via URL
- **Mobile Friendly**: Responsive design that works on phones and tablets
- **Bytecode View**: View the bytecode of the compiled code

## Stack

- **Frontend**: Svelte 5 + Vite
- **Editor**: CodeMirror 6 with custom Luau language mode
- **Runtime**: Luau compiled to WebAssembly

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Building the WASM Module

The Luau WASM module needs to be built separately using Emscripten:

```bash
cd wasm

# Install Emscripten if not already installed
# See: https://emscripten.org/docs/getting_started/downloads.html

# Activate Emscripten
source ~/emsdk/emsdk_env.sh  # Adjust path as needed

# Build
./build.sh release
```

The built WASM file will be copied to `public/wasm/`.

## API

### URL Parameters

#### Share State (Hash)

Share playground state via URL hash:

```
https://play.luau.org/#<compressed-state>
```

The state is LZ-String compressed and versioned JSON:

v2:
- `c`: Optional single file code contents, mutually exclusive with `f`
- `f`: Optional object mapping filenames to content, mutually exclusive with `c`
- `a`: Currently active filename, optional if only one file exists
- `v: 2`: Version number for compatibility
- `s`: Optional and partial (all properties are optional) compiler/type-checking settings
  - `mode`: `"strict"` | `"nonstrict"` | `"nocheck"`
  - `solver`: `"new"` | `"old"`
  - `optimizationLevel`: `0` | `1` | `2`
  - `debugLevel`: `0` | `1` | `2`
  - `compilerRemarks`: `boolean`
- `b`: Optional boolean to show bytecode panel, default false

v1:
- `files`: Object mapping filenames to content
- `active`: Currently active filename
- `v: 1`: Version number for compatibility
- `settings`: Optional compiler/type-checking settings
  - `mode`: `"strict"` | `"nonstrict"` | `"nocheck"`
  - `solver`: `"new"` | `"old"`
  - `optimizationLevel`: `0` | `1` | `2`
  - `debugLevel`: `0` | `1` | `2`
  - `compilerRemarks`: `boolean`
- `showBytecode`: Optional boolean to show bytecode panel

#### Embed Mode (Query Parameters)

Embed the playground in an iframe with a minimal UI:

```
https://play.luau.org/?embed=true#<compressed-state>
```

Query parameters:
- `embed=true`: Enables embed mode (hides settings, bytecode toggle, share button)
- `theme=light|dark`: Force a specific theme (defaults to `auto` which follows system preference)
