/**
 * Luau Playground WASM Bindings
 *
 * Provides both CODE EXECUTION and ANALYSIS capabilities for the playground.
 * - Execution: compile and run Luau code, capturing print() output
 * - Analysis: type checking, diagnostics, autocomplete, hover
 */

#include <string>
#include <vector>
#include <sstream>
#include <memory>
#include <optional>
#include <unordered_map>
#include <cmath>

// Luau headers
#include "Luau/Ast.h"
#include "Luau/AstQuery.h"
#include "Luau/Autocomplete.h"
#include "Luau/BuiltinDefinitions.h"
#include "Luau/BytecodeBuilder.h"
#include "Luau/CodeGen.h"
#include "Luau/Common.h"
#include "Luau/Compiler.h"
#include "Luau/Config.h"
#include "Luau/Frontend.h"
#include "Luau/Linter.h"
#include "Luau/Module.h"
#include "Luau/ModuleResolver.h"
#include "Luau/Parser.h"
#include "Luau/Scope.h"
#include "Luau/ToString.h"
#include "Luau/TypeInfer.h"

// Feature flags for new solver
LUAU_FASTFLAG(LuauSolverV2)
LUAU_FASTFLAG(LuauUseWorkspacePropToChooseSolver)

// Luau VM headers
#include "lua.h"
#include "lualib.h"
#include "luacode.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

// ============================================================================
// JSON Helpers
// ============================================================================

namespace json {
    std::string escape(const std::string& s) {
        std::string result;
        result.reserve(s.size());
        for (char c : s) {
            switch (c) {
                case '"': result += "\\\""; break;
                case '\\': result += "\\\\"; break;
                case '\n': result += "\\n"; break;
                case '\r': result += "\\r"; break;
                case '\t': result += "\\t"; break;
                default:
                    if (static_cast<unsigned char>(c) < 32) {
                        char buf[8];
                        snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned char>(c));
                        result += buf;
                    } else {
                        result += c;
                    }
            }
        }
        return result;
    }

    std::string string(const std::string& s) {
        return "\"" + escape(s) + "\"";
    }

    std::string number(int n) {
        return std::to_string(n);
    }

    std::string boolean(bool b) {
        return b ? "true" : "false";
    }
}

// ============================================================================
// Global State
// ============================================================================

static std::string g_resultBuffer;
static std::string g_outputBuffer;

// Module storage for require support
static std::unordered_map<std::string, std::string> g_modules;

const char* setResult(std::string result) {
    g_resultBuffer = std::move(result);
    return g_resultBuffer.c_str();
}

// ============================================================================
// Execution: Luau VM
// ============================================================================

static void serializeValueToJson(lua_State* L, int idx, std::string& out, std::vector<const void*>& seen);

static void serializeTableToJson(lua_State* L, int idx, std::string& out, std::vector<const void*>& seen) {
    if (idx < 0) idx = lua_gettop(L) + idx + 1;
    
    const void* ptr = lua_topointer(L, idx);
    for (const void* seenPtr : seen) {
        if (seenPtr == ptr) {
            out += "{\"type\":\"circular\"}";
            return;
        }
    }
    seen.push_back(ptr);
    
    bool hasElements = false;
    bool isArray = true;
    int arrayIndex = 1;
    
    lua_pushnil(L);
    while (lua_next(L, idx) != 0) {
        hasElements = true;
        if (!lua_isnumber(L, -2) || lua_tonumber(L, -2) != arrayIndex) {
            isArray = false;
        }
        arrayIndex++;
        lua_pop(L, 1);
    }
    
    out += "{\"type\":\"table\",\"isArray\":";
    out += isArray ? "true" : "false";
    out += ",\"value\":";
    
    if (!hasElements) {
        out += isArray ? "[]" : "{}";
        out += "}";
        seen.pop_back();
        return;
    }
    
    if (isArray) {
        out += "[";
        bool first = true;
        lua_pushnil(L);
        while (lua_next(L, idx) != 0) {
            if (!first) out += ",";
            first = false;
            serializeValueToJson(L, -1, out, seen);
            lua_pop(L, 1);
        }
        out += "]";
    } else {
        out += "{";
        bool first = true;
        lua_pushnil(L);
        while (lua_next(L, idx) != 0) {
            if (!first) out += ",";
            first = false;
            
            int keyType = lua_type(L, -2);
            std::string keyStr;
            if (keyType == LUA_TSTRING) {
                keyStr = lua_tostring(L, -2);
            } else if (keyType == LUA_TNUMBER) {
                keyStr = std::to_string(static_cast<long long>(lua_tonumber(L, -2)));
            } else {
                size_t len;
                const char* s = luaL_tolstring(L, -2, &len);
                if (s) keyStr = std::string(s, len);
                lua_pop(L, 1);
            }
            
            out += json::string(keyStr);
            out += ":";
            serializeValueToJson(L, -1, out, seen);
            lua_pop(L, 1);
        }
        out += "}";
    }
    
    out += "}";
    seen.pop_back();
}

static void serializeValueToJson(lua_State* L, int idx, std::string& out, std::vector<const void*>& seen) {
    switch (lua_type(L, idx)) {
        case LUA_TNIL:
            out += "{\"type\":\"nil\"}";
            break;
        case LUA_TBOOLEAN:
            out += "{\"type\":\"boolean\",\"value\":";
            out += lua_toboolean(L, idx) ? "true" : "false";
            out += "}";
            break;
        case LUA_TNUMBER: {
            double num = lua_tonumber(L, idx);
            out += "{\"type\":\"number\",\"value\":";
            // Handle special float values that aren't valid JSON
            if (std::isnan(num)) {
                out += "\"nan\"";
            } else if (std::isinf(num)) {
                out += num > 0 ? "\"inf\"" : "\"-inf\"";
            } else if (num == static_cast<double>(static_cast<long long>(num))) {
                out += std::to_string(static_cast<long long>(num));
            } else {
                char buf[64];
                snprintf(buf, sizeof(buf), "%.14g", num);
                out += buf;
            }
            out += "}";
            break;
        }
        case LUA_TSTRING: {
            size_t len;
            const char* s = lua_tolstring(L, idx, &len);
            out += "{\"type\":\"string\",\"value\":";
            out += json::string(std::string(s, len));
            out += "}";
            break;
        }
        case LUA_TTABLE:
            serializeTableToJson(L, idx, out, seen);
            break;
        case LUA_TFUNCTION:
            out += "{\"type\":\"function\"}";
            break;
        case LUA_TUSERDATA:
        case LUA_TLIGHTUSERDATA:
            out += "{\"type\":\"userdata\"}";
            break;
        case LUA_TTHREAD:
            out += "{\"type\":\"thread\"}";
            break;
        case LUA_TVECTOR: {
            const float* v = lua_tovector(L, idx);
            if (v) {
                out += "{\"type\":\"vector\",\"value\":[";
                char buf[64];
                for (int i = 0; i < LUA_VECTOR_SIZE; i++) {
                    if (i > 0) out += ",";
                    if (std::isnan(v[i])) {
                        out += "\"nan\"";
                    } else if (std::isinf(v[i])) {
                        out += v[i] > 0 ? "\"inf\"" : "\"-inf\"";
                    } else {
                        snprintf(buf, sizeof(buf), "%.7g", v[i]);
                        out += buf;
                    }
                }
                out += "]}";
            } else {
                out += "{\"type\":\"vector\",\"value\":[0,0,0]}";
            }
            break;
        }
        case LUA_TBUFFER: {
            size_t len = 0;
            lua_tobuffer(L, idx, &len);
            out += "{\"type\":\"buffer\",\"size\":";
            out += std::to_string(len);
            out += "}";
            break;
        }
        default:
            out += "{\"type\":\"nil\"}";
            break;
    }
}

static std::vector<std::string> g_printCalls;

static int playgroundPrint(lua_State* L) {
    int n = lua_gettop(L);
    
    std::string valuesJson = "[";
    for (int i = 1; i <= n; i++) {
        if (i > 1) valuesJson += ",";
        std::vector<const void*> seen;
        serializeValueToJson(L, i, valuesJson, seen);
    }
    valuesJson += "]";
    g_printCalls.push_back(valuesJson);
    
    // Plain text fallback
    std::string line;
    
    for (int i = 1; i <= n; i++) {
        size_t len;
        const char* s = luaL_tolstring(L, i, &len);
        if (s) {
            if (i > 1) line += "\t";
            line += std::string(s, len);
        }
        lua_pop(L, 1);
    }
    
    if (!g_outputBuffer.empty()) {
        g_outputBuffer += "\n";
    }
    g_outputBuffer += line;
    
    return 0;
}

// Normalize a module path by removing ./ prefix and handling extensions
static std::string normalizeModulePath(const std::string& path) {
    std::string result = path;
    
    // Remove leading ./
    while (result.length() >= 2 && result[0] == '.' && result[1] == '/') {
        result = result.substr(2);
    }
    
    // Remove leading /
    while (!result.empty() && result[0] == '/') {
        result = result.substr(1);
    }
    
    return result;
}

// Try to find a module with various path variations
static std::unordered_map<std::string, std::string>::iterator findModule(const std::string& moduleName) {
    std::string normalized = normalizeModulePath(moduleName);
    
    // Try exact match first
    auto it = g_modules.find(normalized);
    if (it != g_modules.end()) return it;
    
    // Try with .luau extension
    it = g_modules.find(normalized + ".luau");
    if (it != g_modules.end()) return it;
    
    // Try with .lua extension
    it = g_modules.find(normalized + ".lua");
    if (it != g_modules.end()) return it;
    
    // Try without extension if it has one
    size_t dotPos = normalized.rfind('.');
    if (dotPos != std::string::npos) {
        std::string withoutExt = normalized.substr(0, dotPos);
        it = g_modules.find(withoutExt);
        if (it != g_modules.end()) return it;
        
        it = g_modules.find(withoutExt + ".luau");
        if (it != g_modules.end()) return it;
        
        it = g_modules.find(withoutExt + ".lua");
        if (it != g_modules.end()) return it;
    }
    
    return g_modules.end();
}

// Custom require function that loads from g_modules
static int playgroundRequire(lua_State* L) {
    const char* moduleName = luaL_checkstring(L, 1);
    
    // Find the module with path normalization
    auto it = findModule(moduleName);
    
    if (it == g_modules.end()) {
        // List available modules for debugging
        std::string available;
        for (const auto& [name, _] : g_modules) {
            if (!available.empty()) available += ", ";
            available += "'" + name + "'";
        }
        luaL_error(L, "module '%s' not found\navailable modules: %s", moduleName, available.c_str());
        return 0;
    }
    
    const std::string& source = it->second;
    
    // Compile the module
    size_t bytecodeSize = 0;
    char* bytecode = luau_compile(source.c_str(), source.size(), nullptr, &bytecodeSize);
    
    if (!bytecode) {
        luaL_error(L, "failed to compile module '%s'", moduleName);
        return 0;
    }
    
    // Load and execute the module
    std::string chunkName = std::string("=") + moduleName;
    int loadResult = luau_load(L, chunkName.c_str(), bytecode, bytecodeSize, 0);
    free(bytecode);
    
    if (loadResult != 0) {
        lua_error(L);
        return 0;
    }
    
    // Execute the module
    lua_call(L, 0, 1);
    
    return 1;
}

// Error handler that generates stack traces
static int errorHandler(lua_State* L) {
    // Get the error message
    std::string errorMsg;
    
    if (lua_isstring(L, 1)) {
        const char* msg = lua_tostring(L, 1);
        errorMsg = msg ? msg : "unknown error";
    } else {
        // Try to convert to string
        const char* typeName = lua_typename(L, lua_type(L, 1));
        errorMsg = std::string("(error object is a ") + typeName + " value)";
    }
    
    // Build stack trace manually since Luau doesn't have luaL_traceback
    std::string trace = errorMsg;
    trace += "\nstack traceback:";
    
    lua_Debug ar;
    int level = 1;
    while (lua_getinfo(L, level, "sln", &ar)) {
        trace += "\n\t";
        if (ar.source) {
            trace += ar.source;
        }
        if (ar.currentline > 0) {
            trace += ":";
            trace += std::to_string(ar.currentline);
        }
        if (ar.name) {
            trace += " in function '";
            trace += ar.name;
            trace += "'";
        } else if (ar.what && strcmp(ar.what, "main") == 0) {
            trace += " in main chunk";
        } else if (ar.what && strcmp(ar.what, "C") == 0) {
            trace += " in C function";
        } else {
            trace += " in ?";
        }
        level++;
    }
    
    lua_pushstring(L, trace.c_str());
    return 1;
}

// Register sandbox globals
static void registerPlaygroundGlobals(lua_State* L) {
    // Open standard libraries FIRST
    luaL_openlibs(L);
    
    // THEN override print with our custom version that captures output
    lua_pushcfunction(L, playgroundPrint, "print");
    lua_setglobal(L, "print");
    
    // Override require with our custom version
    lua_pushcfunction(L, playgroundRequire, "require");
    lua_setglobal(L, "require");
}

static std::string getCodegenAssembly(
    const char* name,
    const std::string& bytecode,
    Luau::CodeGen::AssemblyOptions options,
    Luau::CodeGen::LoweringStats* stats
) {
    std::unique_ptr<lua_State, void (*)(lua_State*)> globalState(luaL_newstate(), lua_close);
    lua_State* L = globalState.get();

    if (luau_load(L, name, bytecode.data(), bytecode.size(), 0) == 0)
        return Luau::CodeGen::getAssembly(L, -1, options, stats);

    return "Error loading bytecode";
}

static void annotateInstruction(void* context, std::string& text, int fid, int instpos)
{
    Luau::BytecodeBuilder& bcb = *(Luau::BytecodeBuilder*)context;

    bcb.annotateInstruction(text, fid, instpos);
}

/**
 * Add a module that can be required.
 * Call this before luau_execute to set up modules.
 */
EXPORT void luau_add_module(const char* name, const char* source) {
    g_modules[name] = source;
}

/**
 * Clear all modules.
 */
EXPORT void luau_clear_modules() {
    g_modules.clear();
}

/**
 * Get list of available modules for autocomplete.
 * Returns: { "modules": ["name1", "name2", ...] }
 */
EXPORT const char* luau_get_modules() {
    std::ostringstream json;
    json << "{\"modules\":[";
    
    bool first = true;
    for (const auto& [name, _] : g_modules) {
        // Skip the main file
        if (name == "main" || name == "main.luau") continue;
        
        if (!first) json << ",";
        first = false;
        json << ::json::string(name);
    }
    
    json << "]}";
    return setResult(json.str());
}

static std::string buildPrintsJson() {
    std::string prints = "[";
    for (size_t i = 0; i < g_printCalls.size(); i++) {
        if (i > 0) prints += ",";
        prints += g_printCalls[i];
    }
    prints += "]";
    return prints;
}

/**
 * Execute Luau code and return the output as JSON.
 * Returns: { "success": bool, "output": string, "prints": [[LuauValue]], "error": string? }
 */
EXPORT const char* luau_execute(const char* code) {
    g_outputBuffer.clear();
    g_printCalls.clear();
    
    // Create a new Lua state
    std::unique_ptr<lua_State, decltype(&lua_close)> L(luaL_newstate(), lua_close);
    if (!L) {
        return setResult("{\"success\":false,\"output\":\"\",\"prints\":[],\"error\":\"Failed to create Lua state\"}");
    }
    
    // Set up sandbox
    registerPlaygroundGlobals(L.get());
    
    // Push error handler FIRST (so it's at a fixed position)
    lua_pushcfunction(L.get(), errorHandler, "errorHandler");
    int errHandlerIdx = lua_gettop(L.get());  // Should be 1
    
    // Compile the code
    size_t bytecodeSize = 0;
    char* bytecode = luau_compile(code, strlen(code), nullptr, &bytecodeSize);
    
    if (!bytecode) {
        return setResult("{\"success\":false,\"output\":\"\",\"prints\":[],\"error\":\"Compilation failed\"}");
    }
    
    // Load the bytecode (function goes on top of error handler)
    int loadResult = luau_load(L.get(), "=main", bytecode, bytecodeSize, 0);
    free(bytecode);
    
    if (loadResult != 0) {
        const char* errMsg = lua_tostring(L.get(), -1);
        std::string error = errMsg ? errMsg : "Failed to load bytecode";
        std::ostringstream result;
        result << "{\"success\":false,\"output\":" << json::string(g_outputBuffer);
        result << ",\"prints\":" << buildPrintsJson();
        result << ",\"error\":" << json::string(error) << "}";
        return setResult(result.str());
    }
    
    // Stack: [errorHandler, function]
    // Execute with error handler at position 1
    int callResult = 0;
    try {
        callResult = lua_pcall(L.get(), 0, 0, errHandlerIdx);
    } catch (const std::exception& e) {
        std::ostringstream result;
        result << "{\"success\":false,\"output\":" << json::string(g_outputBuffer);
        result << ",\"prints\":" << buildPrintsJson();
        result << ",\"error\":" << json::string(std::string("C++ exception: ") + e.what()) << "}";
        return setResult(result.str());
    } catch (...) {
        std::ostringstream result;
        result << "{\"success\":false,\"output\":" << json::string(g_outputBuffer);
        result << ",\"prints\":" << buildPrintsJson();
        result << ",\"error\":\"Unknown C++ exception\"}";
        return setResult(result.str());
    }
    
    if (callResult != 0) {
        const char* errMsg = lua_tostring(L.get(), -1);
        std::string error = errMsg ? errMsg : "Unknown runtime error";
        std::ostringstream result;
        result << "{\"success\":false,\"output\":" << json::string(g_outputBuffer);
        result << ",\"prints\":" << buildPrintsJson();
        result << ",\"error\":" << json::string(error) << "}";
        return setResult(result.str());
    }
    
    std::ostringstream result;
    result << "{\"success\":true,\"output\":" << json::string(g_outputBuffer);
    result << ",\"prints\":" << buildPrintsJson() << "}";
    return setResult(result.str());
}

/**
 * Dump bytecode as human-readable text.
 * @param code The Luau source code
 * @param optimizationLevel 0-2 (default 2)
 * @param debugLevel 0-2 (default 2)
 * @param outputFormat 0-3 (VM, IR, x64, arm64)
 * @param showRemarks Whether to include compiler remarks
 * Returns: { "success": bool, "bytecode": string, "error": string? }
 */
EXPORT const char* luau_dump_bytecode(const char* code, int optimizationLevel, int debugLevel, int outputFormat, bool showRemarks) {
    try {
        Luau::CompileOptions options;
        options.optimizationLevel = std::max(0, std::min(2, optimizationLevel));
        options.debugLevel = std::max(0, std::min(2, debugLevel));
        
        // Set up dump flags
        uint32_t dumpFlags = Luau::BytecodeBuilder::Dump_Code | Luau::BytecodeBuilder::Dump_Lines;
        if (options.debugLevel >= 2) {
            dumpFlags |= Luau::BytecodeBuilder::Dump_Locals;
        }
        if (showRemarks) {
            dumpFlags |= Luau::BytecodeBuilder::Dump_Remarks;
        }

        Luau::BytecodeBuilder bytecode;
        bytecode.setDumpFlags(dumpFlags);
        bytecode.setDumpSource(code);
        
        Luau::ParseOptions parseOptions;
        parseOptions.captureComments = true;
        
        Luau::compileOrThrow(bytecode, std::string(code), options, parseOptions);
        
        Luau::CodeGen::AssemblyOptions asmOptions;
        asmOptions.annotator = annotateInstruction;
        asmOptions.annotatorContext = &bytecode;

        std::string dump;

        switch (outputFormat)
        {
        case 0:
            dump = bytecode.dumpEverything();
            break;
        case 1:
            // Use X64_SystemV for IR since we're in WASM (Host won't work)
            asmOptions.target = Luau::CodeGen::AssemblyOptions::X64_SystemV;
            asmOptions.outputBinary = false;
            asmOptions.includeAssembly = false;
            asmOptions.includeIr = true;
            asmOptions.includeIrTypes = false;
            asmOptions.includeOutlinedCode = false;
            dump = getCodegenAssembly("main", bytecode.getBytecode(), asmOptions, nullptr);
            break;
        case 2:
            asmOptions.target = Luau::CodeGen::AssemblyOptions::X64_SystemV;
            asmOptions.outputBinary = false;
            asmOptions.includeAssembly = true;
            asmOptions.includeIr = true;
            asmOptions.includeIrTypes = false;
            asmOptions.includeOutlinedCode = false;
            dump = getCodegenAssembly("main", bytecode.getBytecode(), asmOptions, nullptr);
            break;
        case 3:
            asmOptions.target = Luau::CodeGen::AssemblyOptions::A64;
            asmOptions.outputBinary = false;
            asmOptions.includeAssembly = true;
            asmOptions.includeIr = true;
            asmOptions.includeIrTypes = false;
            asmOptions.includeOutlinedCode = false;
            dump = getCodegenAssembly("main", bytecode.getBytecode(), asmOptions, nullptr);
            break;

        default:
            break;
        }

        std::ostringstream result;
        result << "{\"success\":true,\"bytecode\":" << json::string(dump) << "}";
        return setResult(result.str());
    } catch (const Luau::CompileError& e) {
        std::ostringstream result;
        result << "{\"success\":false,\"bytecode\":\"\",\"error\":" << json::string(e.what()) << "}";
        return setResult(result.str());
    } catch (const std::exception& e) {
        std::ostringstream result;
        result << "{\"success\":false,\"bytecode\":\"\",\"error\":" << json::string(e.what()) << "}";
        return setResult(result.str());
    }
}

// ============================================================================
// Analysis: Type Checking and IDE Features
// ============================================================================

// Simple multi-file resolver for the playground
class PlaygroundFileResolver : public Luau::FileResolver {
public:
    std::unordered_map<std::string, std::string> sources;
    
    // Find a source with path normalization
    std::pair<bool, std::string> findSource(const std::string& path) const {
        std::string normalized = normalizeModulePath(path);
        
        // Try exact match
        if (sources.count(normalized)) {
            return {true, normalized};
        }
        
        // Try with .luau extension
        if (sources.count(normalized + ".luau")) {
            return {true, normalized + ".luau"};
        }
        
        // Try with .lua extension
        if (sources.count(normalized + ".lua")) {
            return {true, normalized + ".lua"};
        }
        
        // Try without extension if it has one
        size_t dotPos = normalized.rfind('.');
        if (dotPos != std::string::npos) {
            std::string withoutExt = normalized.substr(0, dotPos);
            if (sources.count(withoutExt)) {
                return {true, withoutExt};
            }
            if (sources.count(withoutExt + ".luau")) {
                return {true, withoutExt + ".luau"};
            }
            if (sources.count(withoutExt + ".lua")) {
                return {true, withoutExt + ".lua"};
            }
        }
        
        return {false, ""};
    }
    
    std::optional<Luau::SourceCode> readSource(const Luau::ModuleName& name) override {
        auto [found, resolvedName] = findSource(name);
        if (found) {
            auto it = sources.find(resolvedName);
            if (it != sources.end()) {
                return Luau::SourceCode{it->second, Luau::SourceCode::Module};
            }
        }
        return std::nullopt;
    }

    std::optional<Luau::ModuleInfo> resolveModule(
        const Luau::ModuleInfo* context, 
        Luau::AstExpr* node,
        const Luau::TypeCheckLimits& limits
    ) override {
        if (auto* expr = node->as<Luau::AstExprConstantString>()) {
            std::string path(expr->value.data, expr->value.size);
            
            auto [found, resolvedName] = findSource(path);
            if (found) {
                return Luau::ModuleInfo{resolvedName};
            }
        }
        return std::nullopt;
    }

    std::string getHumanReadableModuleName(const Luau::ModuleName& name) const override {
        return name;
    }
};

class PlaygroundConfigResolver : public Luau::ConfigResolver {
public:
    Luau::Config config;

    const Luau::Config& getConfig(
        const Luau::ModuleName& name,
        const Luau::TypeCheckLimits& limits
    ) const override {
        return config;
    }
};

// Global analysis state
static std::unique_ptr<PlaygroundFileResolver> g_fileResolver;
static std::unique_ptr<PlaygroundConfigResolver> g_configResolver;
static std::unique_ptr<Luau::Frontend> g_frontend;

// Global configuration
static Luau::Mode g_mode = Luau::Mode::Nonstrict;
static bool g_useNewSolver = true;

static void ensureAnalysisInit() {
    if (g_frontend) return;
    
    // Set feature flags for the new solver before any initialization
    FFlag::LuauSolverV2.value = g_useNewSolver;
    FFlag::LuauUseWorkspacePropToChooseSolver.value = true;
    
    g_fileResolver = std::make_unique<PlaygroundFileResolver>();
    g_configResolver = std::make_unique<PlaygroundConfigResolver>();
    
    // Apply mode setting
    g_configResolver->config.mode = g_mode;
    
    Luau::FrontendOptions options;
    options.retainFullTypeGraphs = true;
    options.runLintChecks = true;
    
    g_frontend = std::make_unique<Luau::Frontend>(
        g_fileResolver.get(),
        g_configResolver.get(),
        options
    );
    
    // Set solver mode
    if (g_useNewSolver) {
        g_frontend->useNewLuauSolver.store(Luau::SolverMode::New);
    } else {
        g_frontend->useNewLuauSolver.store(Luau::SolverMode::Old);
    }
    
    // Register built-in types
    Luau::registerBuiltinGlobals(*g_frontend, g_frontend->globals, false);
    Luau::freeze(g_frontend->globals.globalTypes);
    
    Luau::registerBuiltinGlobals(*g_frontend, g_frontend->globalsForAutocomplete, true);
    Luau::freeze(g_frontend->globalsForAutocomplete.globalTypes);
}

/**
 * Set the type checking mode.
 * @param mode 0 = Nonstrict, 1 = Strict, 2 = NoCheck
 */
EXPORT void luau_set_mode(int mode) {
    switch (mode) {
        case 0:
            g_mode = Luau::Mode::Nonstrict;
            break;
        case 1:
            g_mode = Luau::Mode::Strict;
            break;
        case 2:
            g_mode = Luau::Mode::NoCheck;
            break;
        default:
            g_mode = Luau::Mode::Nonstrict;
            break;
    }
    
    // Update existing config resolver if initialized
    if (g_configResolver) {
        g_configResolver->config.mode = g_mode;
    }
    
    // Mark all files dirty to re-analyze with new mode
    if (g_frontend && g_fileResolver) {
        for (const auto& [name, _] : g_fileResolver->sources) {
            g_frontend->markDirty(name);
        }
    }
}

/**
 * Set the solver mode.
 * @param useNew true = New solver, false = Old solver
 */
EXPORT void luau_set_solver(bool useNew) {
    g_useNewSolver = useNew;
    
    // Set feature flags for the new solver
    // Both flags are needed: LuauSolverV2 enables the new solver globally,
    // LuauUseWorkspacePropToChooseSolver allows per-frontend solver selection
    FFlag::LuauSolverV2.value = useNew;
    FFlag::LuauUseWorkspacePropToChooseSolver.value = true;
    
    // Reset frontend to apply new solver (solver mode is set at initialization)
    if (g_frontend) {
        if (g_useNewSolver) {
            g_frontend->useNewLuauSolver.store(Luau::SolverMode::New);
        } else {
            g_frontend->useNewLuauSolver.store(Luau::SolverMode::Old);
        }
        
        // Mark all files dirty to re-analyze with new solver
        if (g_fileResolver) {
            for (const auto& [name, _] : g_fileResolver->sources) {
                g_frontend->markDirty(name);
            }
        }
    }
}

/**
 * Set source for a file (for multi-file analysis).
 */
EXPORT void luau_set_source(const char* name, const char* source) {
    ensureAnalysisInit();
    g_fileResolver->sources[name] = source;
    g_frontend->markDirty(name);
    
    // Also add to modules for require
    g_modules[name] = source;
}

/**
 * Get diagnostics (type errors and lint warnings) for code.
 * Returns: { "diagnostics": [...] }
 */
EXPORT const char* luau_get_diagnostics(const char* code) {
    ensureAnalysisInit();
    
    g_fileResolver->sources["main"] = code;
    g_frontend->markDirty("main");
    
    // Check all dependency modules first so their types are available
    for (const auto& [name, _] : g_fileResolver->sources) {
        if (name != "main") {
            g_frontend->check(name);
        }
    }
    
    Luau::CheckResult result = g_frontend->check("main");
    
    std::ostringstream json;
    json << "{\"diagnostics\":[";
    
    bool first = true;
    for (const auto& error : result.errors) {
        if (!first) json << ",";
        first = false;
        
        json << "{";
        json << "\"severity\":\"error\",";
        json << "\"message\":" << ::json::string(Luau::toString(error)) << ",";
        json << "\"startLine\":" << error.location.begin.line << ",";
        json << "\"startCol\":" << error.location.begin.column << ",";
        json << "\"endLine\":" << error.location.end.line << ",";
        json << "\"endCol\":" << error.location.end.column;
        json << "}";
    }
    
    json << "]}";
    return setResult(json.str());
}

/**
 * Get autocomplete suggestions at position.
 * Returns: { "items": [...] }
 */
EXPORT const char* luau_autocomplete(const char* code, int line, int col) {
    ensureAnalysisInit();
    
    g_fileResolver->sources["main"] = code;
    g_frontend->markDirty("main");
    
    Luau::FrontendOptions opts;
    opts.retainFullTypeGraphs = true;
    opts.forAutocomplete = true;
    opts.runLintChecks = false;
    g_frontend->check("main", opts);
    
    Luau::Position position{static_cast<unsigned int>(line), static_cast<unsigned int>(col)};
    Luau::AutocompleteResult result = Luau::autocomplete(*g_frontend, "main", position, nullptr);
    
    std::ostringstream json;
    json << "{\"items\":[";
    
    bool first = true;
    for (const auto& [name, entry] : result.entryMap) {
        if (!first) json << ",";
        first = false;
        
        // Determine kind
        std::string kind = "variable";
        switch (entry.kind) {
            case Luau::AutocompleteEntryKind::Property: kind = "property"; break;
            case Luau::AutocompleteEntryKind::Keyword: kind = "keyword"; break;
            case Luau::AutocompleteEntryKind::String: kind = "constant"; break;
            case Luau::AutocompleteEntryKind::Type: kind = "type"; break;
            case Luau::AutocompleteEntryKind::Module: kind = "module"; break;
            default: break;
        }
        
        if (entry.type && Luau::get<Luau::FunctionType>(Luau::follow(*entry.type))) {
            kind = "function";
        }
        
        json << "{";
        json << "\"label\":" << ::json::string(name) << ",";
        json << "\"kind\":" << ::json::string(kind);
        
        if (entry.type) {
            json << ",\"detail\":" << ::json::string(Luau::toString(*entry.type));
        }
        
        json << ",\"deprecated\":" << ::json::boolean(entry.deprecated);
        json << "}";
    }
    
    json << "]}";
    return setResult(json.str());
}

/**
 * Get hover information at position.
 * Returns: { "content": string | null }
 */
EXPORT const char* luau_hover(const char* code, int line, int col) {
    ensureAnalysisInit();
    
    g_fileResolver->sources["main"] = code;
    g_frontend->markDirty("main");
    
    Luau::FrontendOptions opts;
    opts.retainFullTypeGraphs = true;
    opts.forAutocomplete = true;
    g_frontend->check("main", opts);
    
    Luau::SourceModule* sourceModule = g_frontend->getSourceModule("main");
    
    // With the new solver, forAutocomplete is disabled internally, so modules
    // are stored in moduleResolver instead of moduleResolverForAutocomplete
    Luau::ModulePtr module = g_useNewSolver 
        ? g_frontend->moduleResolver.getModule("main")
        : g_frontend->moduleResolverForAutocomplete.getModule("main");
    
    if (!sourceModule || !module) {
        return setResult("{\"content\":null}");
    }
    
    Luau::Position position{static_cast<unsigned int>(line), static_cast<unsigned int>(col)};
    Luau::ExprOrLocal exprOrLocal = Luau::findExprOrLocalAtPosition(*sourceModule, position);
    
    std::string typeStr;
    std::string name;
    
    if (exprOrLocal.getExpr()) {
        Luau::AstExpr* expr = exprOrLocal.getExpr();
        
        if (auto* localExpr = expr->as<Luau::AstExprLocal>()) {
            name = std::string(localExpr->local->name.value);
        } else if (auto* globalExpr = expr->as<Luau::AstExprGlobal>()) {
            name = std::string(globalExpr->name.value);
        }
        
        if (auto type = module->astTypes.find(expr)) {
            typeStr = Luau::toString(*type);
        }
    }
    
    if (typeStr.empty()) {
        return setResult("{\"content\":null}");
    }
    
    std::string markdown = "```luau\n";
    if (!name.empty()) {
        markdown += name + ": ";
    }
    markdown += typeStr + "\n```";
    
    std::ostringstream json;
    json << "{\"content\":" << ::json::string(markdown) << "}";
    return setResult(json.str());
}

/**
 * Get signature help at position.
 * Returns: { "signatures": [...] }
 */
EXPORT const char* luau_signature_help(const char* code, int line, int col) {
    // Simplified implementation - return empty for now
    return setResult("{\"signatures\":[]}");
}
