// Shared constants used across the playground
import type { PlaygroundSettings } from '$lib/stores/settings';
import type {
  LuauFlagRecord
} from '$lib/luau/types';

// Default settings used when nothing is provided via URL or storage
export const defaultSettings: PlaygroundSettings = {
  mode: 'strict',
  solver: 'new',
  lints: 'all',
  optimizationLevel: 1,
  debugLevel: 1,
  outputFormat: 0,
  compilerRemarks: false,
  overloadedFlags: {},
};

// A set of experimental Luau features that are considerable additions to the language
export const luauExperimentalFeatures: readonly Readonly<{
  label: string;
  description: string;
  referenceURL: string; // A URL that links to an RFC, feature document or something relevant to the feature
  overloads: LuauFlagRecord;
}>[] = [
  {
    label: 'Classes',
    description: 'Enables the user-defined classes feature. Classes allows Luau to afford a more refined way to write object-orientated code.',
    referenceURL: 'https://github.com/luau-lang/rfcs/pull/242',
    overloads: {
      'DebugLuauUserDefinedClassesRuntime': true,
      'DebugLuauUserDefinedClasses': true,
    },
  },
  {
    label: 'Conditional Bindings',
    description: 'Enables the conditional bindings feature, which covers if-local and while-local bindings.',
    referenceURL: 'https://github.com/luau-lang/rfcs/pull/238',
    overloads: {
      'LuauExperimentalIfLocalSyntax': true,
      'LuauExperimentalIfLocalAnalysis': true,
      'LuauExperimentalWhileLocalSyntax': true,
      'LuauExperimentalWhileLocalAnalysis': true,
    },
  },
  {
    label: 'Export by Value',
    description: 'Enables the mechanism of exporting values, similar to how types can be exported via "export type" today.',
    referenceURL: 'https://rfcs.luau.org/export-keyword.html',
    overloads: {
      'LuauExportValueSyntax': true,
      'LuauExportValueTypecheck': true,
    },
  },
  {
    label: 'Cyclic Requires',
    description: 'Enables Luau modules to be able to import each other cyclically.',
    referenceURL: 'https://github.com/luau-lang/rfcs/pull/237',
    overloads: {
      'LuauCyclicRequireTypeInference': true,
      'LuauCyclicRequireTopLevelAccessError': true,
      'LuauCyclicRequireShortCircuit': true,
    },
  },
  {
    label: 'Buffer readvector & writevector Methods',
    description: 'Introduces new extensions to the buffer library for reading and writing two, three and four dimensional vectors.',
    referenceURL: 'https://github.com/luau-lang/rfcs/pull/198',
    overloads: {
      'DebugLuauBufferVectorLibrary': true,
      'DebugLuauBufferVectorFastcalls': true,
    },
  },
];

// Key for localStorage persistence of settings
export const STORAGE_KEY = 'luau-playground-settings';

// Key for localStorage persistence of editor/files state
export const PLAYGROUND_STORAGE_KEY = 'luau-playground-state';

// Key for localStorage persistence of small UI state (panels, etc)
export const UI_STORAGE_KEY = 'luau-playground-ui';

// Key for localStorage persistence of the editor keybindings preference
export const KEYBINDINGS_STORAGE_KEY = 'luau-playground-keybindings';

// Filename used when working with a single default file
export const DEFAULT_FILENAME = 'main.luau';

// Current share-state format version
export const CURRENT_VERSION = 2;
