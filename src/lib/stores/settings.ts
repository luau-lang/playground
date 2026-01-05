import { writable, get } from 'svelte/store';
import { parseStateFromHash } from '$lib/utils/decode';
import { STORAGE_KEY, defaultSettings } from '$lib/constants';

export type LuauMode = "strict" | "nonstrict" | "nocheck";
export type SolverMode = "new" | "old";
export type OptimizationLevel = 0 | 1 | 2;
export type DebugLevel = 0 | 1 | 2;
export type OutputFormat = 0 | 1 | 2 | 3;

export interface PlaygroundSettings {
  // Type checking
  mode: LuauMode;
  solver: SolverMode;
  // Compiler options
  optimizationLevel: OptimizationLevel;
  debugLevel: DebugLevel;
  outputFormat: OutputFormat;
  compilerRemarks: boolean;
}

// Try to load settings from URL hash
function loadSettingsFromUrl(): { settings: PlaygroundSettings | null; showBytecode: boolean | null } {
  if (typeof window === 'undefined') {
    return { settings: null, showBytecode: null };
  }
  
  const state = parseStateFromHash(window.location.hash);
  if (!state) {
    return { settings: null, showBytecode: null };
  }
  
  return {
    settings: state.settings ?? null,
    showBytecode: state.showBytecode ?? null,
  };
}

function loadSettingsFromStorage(): PlaygroundSettings {
  if (typeof window === 'undefined') {
    return { ...defaultSettings };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<PlaygroundSettings>;
      return {
        mode: parsed.mode ?? defaultSettings.mode,
        solver: parsed.solver ?? defaultSettings.solver,
        optimizationLevel: parsed.optimizationLevel ?? defaultSettings.optimizationLevel,
        debugLevel: parsed.debugLevel ?? defaultSettings.debugLevel,
        outputFormat: parsed.outputFormat ?? defaultSettings.outputFormat,
        compilerRemarks: parsed.compilerRemarks ?? defaultSettings.compilerRemarks,
      };
    }
  } catch {
    // Ignore parse errors
  }
  
  return { ...defaultSettings };
}

function mergeSettings(partial: Partial<PlaygroundSettings>): PlaygroundSettings {
  return {
    mode: partial.mode ?? defaultSettings.mode,
    solver: partial.solver ?? defaultSettings.solver,
    optimizationLevel: partial.optimizationLevel ?? defaultSettings.optimizationLevel,
    debugLevel: partial.debugLevel ?? defaultSettings.debugLevel,
    outputFormat: partial.outputFormat ?? defaultSettings.outputFormat,
    compilerRemarks: partial.compilerRemarks ?? defaultSettings.compilerRemarks,
  };
}

function loadSettings(): { settings: PlaygroundSettings; showBytecode: boolean } {
  // First try to load from URL (takes priority for shared links)
  const urlState = loadSettingsFromUrl();

  const settingsFromUrl = urlState.settings;
  const showFromUrl = urlState.showBytecode;

  const settings = settingsFromUrl
    ? mergeSettings(settingsFromUrl)
    : loadSettingsFromStorage();

  const showBytecode = showFromUrl ?? false;

  return {
    settings,
    showBytecode,
  };
}

function saveSettings(settings: PlaygroundSettings): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

const initialState = loadSettings();

export const settings = writable<PlaygroundSettings>(initialState.settings);

// Separate store for bytecode panel visibility
export const showBytecode = writable<boolean>(initialState.showBytecode);

// Auto-save settings when they change
settings.subscribe((value) => {
  saveSettings(value);
});

export function setMode(mode: LuauMode): void {
  settings.update((s) => ({ ...s, mode }));
}

export function setSolver(solver: SolverMode): void {
  settings.update((s) => ({ ...s, solver }));
}

export function setOptimizationLevel(level: OptimizationLevel): void {
  settings.update((s) => ({ ...s, optimizationLevel: level }));
}

export function setDebugLevel(level: DebugLevel): void {
  settings.update((s) => ({ ...s, debugLevel: level }));
}

export function setOutputFormat(level: OutputFormat): void {
  settings.update((s) => ({ ...s, outputFormat: level }));
}

export function setCompilerRemarks(enabled: boolean): void {
  settings.update((s) => ({ ...s, compilerRemarks: enabled }));
}

export function toggleBytecode(): void {
  showBytecode.update((v) => !v);
}

export function getSettings(): PlaygroundSettings {
  return get(settings);
}

