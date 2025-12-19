/**
 * Stub implementations for CodeGen symbols that are not available in WASM.
 * These provide minimal implementations to satisfy the linker while allowing
 * the assembly text generation functionality to work.
 */

#include "Luau/Common.h"

// Fast flags used by CodeGen - provide default values
LUAU_FASTFLAGVARIABLE(DebugCodegenOptSize)
LUAU_FASTINTVARIABLE(CodegenHeuristicsInstructionLimit, 25000)
LUAU_FASTINTVARIABLE(CodegenHeuristicsBlockLimit, 25000)
LUAU_FASTINTVARIABLE(CodegenHeuristicsBlockInstructionLimit, 25000)

namespace Luau
{
namespace CodeGen
{

// Stub for CPU feature detection - not used when targeting specific architectures
// (only used for AssemblyOptions::Host which we avoid in WASM)
unsigned int getCpuFeaturesX64()
{
    // Return a reasonable set of features for assembly generation
    // This doesn't affect actual execution since we're just generating text
    return 0;
}

} // namespace CodeGen
} // namespace Luau

