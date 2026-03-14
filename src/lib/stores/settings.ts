import { writable, get } from 'svelte/store';
import { parseStateFromHash } from '$lib/utils/decode';
import { STORAGE_KEY, UI_STORAGE_KEY, defaultSettings } from '$lib/constants';
import { detectEmbedMode } from '$lib/stores/embed';

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
  if (detectEmbedMode()) {
    return { ...defaultSettings };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...defaultSettings };
    return mergeSettings(JSON.parse(stored) as Partial<PlaygroundSettings>);
  } catch {
    // Ignore parse errors
    return { ...defaultSettings };
  }
}

function loadShowBytecodeFromStorage(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (detectEmbedMode()) {
    return false;
  }

  try {
    return localStorage.getItem(UI_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveShowBytecodeToStorage(value: boolean): void {
  if (typeof window === 'undefined') return;
  if (detectEmbedMode()) return;

  try {
    localStorage.setItem(UI_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
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

  const showBytecode = showFromUrl ?? loadShowBytecodeFromStorage();

  return {
    settings,
    showBytecode,
  };
}

function saveSettings(settings: PlaygroundSettings): void {
  if (typeof window === 'undefined') return;
  if (detectEmbedMode()) return;
  
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

if (typeof window !== 'undefined' && !detectEmbedMode()) {
  // Auto-save settings when they change
  settings.subscribe((value) => {
    saveSettings(value);
  });

  // Auto-save UI state when it changes
  showBytecode.subscribe((value) => {
    saveShowBytecodeToStorage(value);
  });
}

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
