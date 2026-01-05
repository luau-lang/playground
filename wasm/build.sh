#!/bin/bash
# Build script for Luau Playground WASM module
#
# Prerequisites:
#   - Emscripten SDK (source emsdk_env.sh before running)
#   - CMake 3.16+
#
# Usage:
#   ./build.sh [debug|release]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_TYPE="${1:-Release}"

# Validate Emscripten is available
if ! command -v emcmake &> /dev/null; then
    echo "Error: Emscripten not found. Please install and source emsdk_env.sh"
    echo "See: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

# Check for Luau source
LUAU_DIR="$SCRIPT_DIR/luau"
if [ ! -d "$LUAU_DIR" ] || [ ! -f "$LUAU_DIR/CMakeLists.txt" ]; then
    echo "Luau source not found. Cloning..."
    git clone --depth 1 https://github.com/Roblox/luau.git "$LUAU_DIR"
fi

# Create build directory
BUILD_DIR="$SCRIPT_DIR/build"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure with CMake
echo "Configuring with CMake (Build type: $BUILD_TYPE)..."
emcmake cmake .. \
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
    -DLUAU_SOURCE_DIR="$LUAU_DIR"

# Build
echo "Building..."
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Copy WASM to public/wasm directory (served at runtime)
OUTPUT_DIR="$SCRIPT_DIR/../public/wasm"
mkdir -p "$OUTPUT_DIR"

echo "Copying output files..."
if [ -f luau.wasm ]; then
    cp luau.wasm "$OUTPUT_DIR/"
fi

# Copy JS module to src for bundling (with Vite ignore comment to suppress URL warning)
SRC_OUTPUT="$SCRIPT_DIR/../src/lib/luau/luau-module.js"
echo "// @ts-nocheck" > "$SRC_OUTPUT"
sed 's/(new URL("luau.wasm",import.meta.url))/(new URL(\/* @vite-ignore *\/ "luau.wasm",import.meta.url))/g' luau.js >> "$SRC_OUTPUT"

echo ""
echo "Build complete!"
echo "Output files:"
[ -f "$OUTPUT_DIR/luau.wasm" ] && echo "  - $OUTPUT_DIR/luau.wasm"
echo "  - $SRC_OUTPUT (bundled)"

