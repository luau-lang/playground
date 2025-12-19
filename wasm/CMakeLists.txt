# Luau Playground WASM Build Configuration
#
# This builds Luau with BOTH execution and analysis capabilities for the playground.
# Includes the VM for running code and the Analysis engine for IDE features.
#
# Prerequisites:
#   - Emscripten SDK (https://emscripten.org/docs/getting_started/downloads.html)
#   - Luau source code (git clone https://github.com/Roblox/luau.git luau)
#
# Build instructions:
#   mkdir build && cd build
#   emcmake cmake ..
#   emmake make
#
cmake_minimum_required(VERSION 3.16)
project(LuauPlayground LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Luau source directory
set(LUAU_SOURCE_DIR "${CMAKE_SOURCE_DIR}/luau" CACHE PATH "Path to Luau source")

if(NOT EXISTS "${LUAU_SOURCE_DIR}/CMakeLists.txt")
    message(FATAL_ERROR 
        "Luau source not found at ${LUAU_SOURCE_DIR}. "
        "Please clone the Luau repository: git clone https://github.com/Roblox/luau.git luau"
    )
endif()

# Collect Luau source files
file(GLOB LUAU_COMMON_SOURCES "${LUAU_SOURCE_DIR}/Common/src/*.cpp")
file(GLOB LUAU_AST_SOURCES "${LUAU_SOURCE_DIR}/Ast/src/*.cpp")
file(GLOB LUAU_COMPILER_SOURCES "${LUAU_SOURCE_DIR}/Compiler/src/*.cpp")
file(GLOB LUAU_CONFIG_SOURCES "${LUAU_SOURCE_DIR}/Config/src/*.cpp")
file(GLOB LUAU_ANALYSIS_SOURCES "${LUAU_SOURCE_DIR}/Analysis/src/*.cpp")
file(GLOB LUAU_VM_SOURCES "${LUAU_SOURCE_DIR}/VM/src/*.cpp")

# CodeGen sources - only include files needed for assembly TEXT generation
# Exclude files that require native JIT features (memory allocation, cache flush, etc.)
set(LUAU_CODEGEN_SOURCES
    "${LUAU_SOURCE_DIR}/CodeGen/src/AssemblyBuilderA64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/AssemblyBuilderX64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/BytecodeAnalysis.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/BytecodeSummary.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/CodeGenA64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/CodeGenAssembly.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/CodeGenUtils.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/CodeGenX64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/EmitCommonX64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/EmitBuiltinsX64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/EmitInstructionX64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrAnalysis.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrBuilder.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrCallWrapperX64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrDump.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrLoweringA64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrLoweringX64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrRegAllocA64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrRegAllocX64.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrTranslateBuiltins.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrTranslation.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrUtils.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/IrValueLocationTracking.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/NativeProtoExecData.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/NativeState.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/OptimizeConstProp.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/OptimizeDeadStore.cpp"
    "${LUAU_SOURCE_DIR}/CodeGen/src/OptimizeFinalX64.cpp"
)
# Excluded (require native JIT features):
# - CodeAllocator.cpp (uses __clear_cache, mprotect)
# - CodeBlockUnwind.cpp (platform-specific unwind registration)
# - CodeGen.cpp (main JIT entry with platform detection)
# - CodeGenContext.cpp (JIT context management)
# - SharedCodeAllocator.cpp (shared code allocation)
# - lcodegen.cpp (C interface to JIT)

# Create static libraries for each component
add_library(Luau.Common STATIC ${LUAU_COMMON_SOURCES})
target_compile_features(Luau.Common PUBLIC cxx_std_17)
target_include_directories(Luau.Common PUBLIC "${LUAU_SOURCE_DIR}/Common/include")

add_library(Luau.Ast STATIC ${LUAU_AST_SOURCES})
target_compile_features(Luau.Ast PUBLIC cxx_std_17)
target_include_directories(Luau.Ast PUBLIC "${LUAU_SOURCE_DIR}/Ast/include")
target_link_libraries(Luau.Ast PUBLIC Luau.Common)

add_library(Luau.VM STATIC ${LUAU_VM_SOURCES})
target_compile_features(Luau.VM PUBLIC cxx_std_11)
target_include_directories(Luau.VM PUBLIC "${LUAU_SOURCE_DIR}/VM/include")
target_include_directories(Luau.VM PRIVATE "${LUAU_SOURCE_DIR}/VM/src")
target_link_libraries(Luau.VM PUBLIC Luau.Common)

add_library(Luau.Compiler STATIC ${LUAU_COMPILER_SOURCES})
target_compile_features(Luau.Compiler PUBLIC cxx_std_17)
target_include_directories(Luau.Compiler PUBLIC "${LUAU_SOURCE_DIR}/Compiler/include")
target_link_libraries(Luau.Compiler PUBLIC Luau.Ast)

add_library(Luau.Config STATIC ${LUAU_CONFIG_SOURCES})
target_compile_features(Luau.Config PUBLIC cxx_std_17)
target_include_directories(Luau.Config PUBLIC "${LUAU_SOURCE_DIR}/Config/include")
target_link_libraries(Luau.Config PUBLIC Luau.Ast Luau.Compiler Luau.VM)

add_library(Luau.Analysis STATIC ${LUAU_ANALYSIS_SOURCES})
target_compile_features(Luau.Analysis PUBLIC cxx_std_17)
target_include_directories(Luau.Analysis PUBLIC "${LUAU_SOURCE_DIR}/Analysis/include")
target_link_libraries(Luau.Analysis PUBLIC Luau.Ast Luau.Config Luau.Compiler Luau.VM)

add_library(Luau.CodeGen STATIC ${LUAU_CODEGEN_SOURCES})
target_compile_features(Luau.CodeGen PUBLIC cxx_std_17)
target_include_directories(Luau.CodeGen PUBLIC "${LUAU_SOURCE_DIR}/CodeGen/include")
target_include_directories(Luau.CodeGen PRIVATE "${LUAU_SOURCE_DIR}/CodeGen/src")
target_include_directories(Luau.CodeGen PRIVATE "${LUAU_SOURCE_DIR}/VM/src")
target_link_libraries(Luau.CodeGen PUBLIC Luau.Ast Luau.VM Luau.Common)

# Create the WASM executable
add_executable(luau_playground
    src/playground.cpp
    src/codegen_stubs.cpp
)

target_include_directories(luau_playground PRIVATE
    ${LUAU_SOURCE_DIR}/Ast/include
    ${LUAU_SOURCE_DIR}/Analysis/include
    ${LUAU_SOURCE_DIR}/Compiler/include
    ${LUAU_SOURCE_DIR}/Config/include
    ${LUAU_SOURCE_DIR}/Common/include
    ${LUAU_SOURCE_DIR}/VM/include
    ${LUAU_SOURCE_DIR}/CodeGen/include
)

target_link_libraries(luau_playground PRIVATE
    Luau.Analysis
    Luau.Compiler
    Luau.Config
    Luau.VM
    Luau.Ast
    Luau.Common
    Luau.CodeGen
)

# Common compile options for size optimization
set(LUAU_COMPILE_OPTIONS 
    -Wno-unused-parameter 
    -Wno-unused-variable
    -fno-rtti                    # Disable RTTI (saves ~50KB+)
    -ffunction-sections          # Allow unused function removal
    -fdata-sections              # Allow unused data removal
    -fexceptions                 # Luau uses C++ exceptions for error handling
)

target_compile_options(luau_playground PRIVATE ${LUAU_COMPILE_OPTIONS})
target_compile_options(Luau.Analysis PRIVATE ${LUAU_COMPILE_OPTIONS})
target_compile_options(Luau.Compiler PRIVATE ${LUAU_COMPILE_OPTIONS})
target_compile_options(Luau.Config PRIVATE ${LUAU_COMPILE_OPTIONS})
target_compile_options(Luau.VM PRIVATE ${LUAU_COMPILE_OPTIONS})
target_compile_options(Luau.Ast PRIVATE ${LUAU_COMPILE_OPTIONS})
target_compile_options(Luau.Common PRIVATE ${LUAU_COMPILE_OPTIONS})
target_compile_options(Luau.CodeGen PRIVATE ${LUAU_COMPILE_OPTIONS})

# Emscripten-specific settings
if(EMSCRIPTEN)
    set_target_properties(luau_playground PROPERTIES
        OUTPUT_NAME "luau"
        SUFFIX ".js"
    )
    
    # Emscripten link options
    target_link_options(luau_playground PRIVATE
        # Export as ES6 module
        -sEXPORT_ES6=1
        -sMODULARIZE=1
        -sEXPORT_NAME=createLuauModule
        
        # Memory settings
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=33554432
        -sMAXIMUM_MEMORY=536870912
        -sSTACK_SIZE=1048576
        
        # Environment settings
        -sENVIRONMENT=web,worker
        -sFILESYSTEM=0
        -sNO_EXIT_RUNTIME=1
        -sUSE_WEBGL2=0
        -sUSE_GLFW=0
        -sMIN_WEBGL_VERSION=0
        -sMAX_WEBGL_VERSION=0
        
        # Exported functions - includes BOTH execution and analysis
        "-sEXPORTED_FUNCTIONS=['_malloc','_free','_luau_execute','_luau_compile_check','_luau_add_module','_luau_clear_modules','_luau_get_modules','_luau_set_source','_luau_get_diagnostics','_luau_autocomplete','_luau_hover','_luau_signature_help','_luau_version','_luau_reset','_luau_dump_bytecode']"
        "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8','getValue','setValue']"
        
        # Optimization
        -O3
        -flto
        --closure 1
        -sWASM_BIGINT=1
        
        # Dead code elimination
        -Wl,--gc-sections
        
        # Error handling - Luau requires exceptions
        -sASSERTIONS=0
        -sDISABLE_EXCEPTION_CATCHING=0
        -fexceptions
    )
    
    # Debug build settings
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        target_link_options(luau_playground PRIVATE
            -O0
            -g
            -sASSERTIONS=2
            -sSAFE_HEAP=1
        )
    endif()
endif()

