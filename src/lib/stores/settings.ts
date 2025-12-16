import { writable, get } from 'svelte/store';

export type LuauMode = 'strict' | 'nonstrict' | 'nocheck';
export type SolverMode = 'new' | 'old';
export type OptimizationLevel = 0 | 1 | 2;
export type DebugLevel = 0 | 1 | 2;

export interface PlaygroundSettings {
  // Type checking
  mode: LuauMode;
  solver: SolverMode;
  // Compiler options
  optimizationLevel: OptimizationLevel;
  debugLevel: DebugLevel;
  compilerRemarks: boolean;
}

const STORAGE_KEY = 'luau-playground-settings';

const defaultSettings: PlaygroundSettings = {
  mode: 'strict',
  solver: 'new',
  optimizationLevel: 1,
  debugLevel: 1,
  compilerRemarks: false,
};

function loadSettings(): PlaygroundSettings {
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
        compilerRemarks: parsed.compilerRemarks ?? defaultSettings.compilerRemarks,
      };
    }
  } catch {
    // Ignore parse errors
  }
  
  return { ...defaultSettings };
}

function saveSettings(settings: PlaygroundSettings): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

const initialSettings = loadSettings();

export const settings = writable<PlaygroundSettings>(initialSettings);

// Separate store for bytecode panel visibility (not persisted)
export const showBytecode = writable<boolean>(false);

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

export function setCompilerRemarks(enabled: boolean): void {
  settings.update((s) => ({ ...s, compilerRemarks: enabled }));
}

export function toggleBytecode(): void {
  showBytecode.update((v) => !v);
}

export function getSettings(): PlaygroundSettings {
  return get(settings);
}

