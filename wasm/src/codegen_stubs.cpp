/**
 * Stub implementations for CodeGen symbols that are not available in WASM.
 * These provide minimal implementations to satisfy the linker while allowing
 * the assembly text generation functionality to work.
 */

#include "Luau/Common.h"
#include <cstdint>

// Fast flags used by CodeGen - provide default values
LUAU_FASTFLAGVARIABLE(DebugCodegenOptSize)
LUAU_FASTINTVARIABLE(CodegenHeuristicsInstructionLimit, 25000)
LUAU_FASTINTVARIABLE(CodegenHeuristicsBlockLimit, 25000)
LUAU_FASTINTVARIABLE(CodegenHeuristicsBlockInstructionLimit, 25000)
LUAU_FASTFLAGVARIABLE(LuauCodegenCounterSupport)
LUAU_FASTFLAGVARIABLE(LuauCodegenInteger3)

namespace Luau
{
namespace CodeGen
{

// Stub for CPU feature detection - not used when targeting specific architectures
// (only used for AssemblyOptions::Host which we avoid in WASM)
unsigned int getCpuFeaturesX64()
{
    return 0;
}

// Defined in CodeGenContext.cpp which is excluded from the WASM build
uint64_t jitRngSeed(uintptr_t ptr)
{
    uint64_t state = 0;
    state = state * 6364136223846793005ULL + (105 | 1);
    state += uint64_t(ptr);
    state = state * 6364136223846793005ULL + (105 | 1);
    return state;
}

uint32_t jitRngRandom(uint64_t& state)
{
    uint64_t oldstate = state;
    state = oldstate * 6364136223846793005ULL + (105 | 1);
    uint32_t xorshifted = uint32_t(((oldstate >> 18u) ^ oldstate) >> 27u);
    uint32_t rot = uint32_t(oldstate >> 59u);
    return (xorshifted >> rot) | (xorshifted << ((-int32_t(rot)) & 31));
}

} // namespace CodeGen
} // namespace Luau

