// Shared constants used across the playground
import { type PlaygroundSettings } from '$lib/stores/settings';

// Default settings used when nothing is provided via URL or storage
export const defaultSettings: PlaygroundSettings = {
  mode: 'strict',
  solver: 'new',
  optimizationLevel: 1,
  debugLevel: 1,
  outputFormat: 0,
  compilerRemarks: false,
};

// Key for localStorage persistence of settings
export const STORAGE_KEY = 'luau-playground-settings';

// Filename used when working with a single default file
export const DEFAULT_FILENAME = 'main.luau';

// Current share-state format version
export const CURRENT_VERSION = 2;
