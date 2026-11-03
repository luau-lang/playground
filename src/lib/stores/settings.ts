// NOTE: This module imports values from 'lib/luau/wasm.ts' which creates a *cyclic dependency*.

import { writable, get } from 'svelte/store';
import { parseStateFromHash } from '$lib/utils/decode';
import { STORAGE_KEY, UI_STORAGE_KEY, KEYBINDINGS_STORAGE_KEY, defaultSettings } from '$lib/constants';
import { detectEmbedMode } from '$lib/stores/embed';
import { getAllLints } from '$lib/luau/wasm';

export type LuauMode = "strict" | "nonstrict" | "nocheck";
export type SolverMode = "new" | "old";
export type OptimizationLevel = 0 | 1 | 2;
export type DebugLevel = 0 | 1 | 2;
export type OutputFormat = 0 | 1 | 2 | 3;
export type KeybindingMode = "default" | "vim";

const keybindingModes: readonly KeybindingMode[] = ["default", "vim"];

export interface PlaygroundSettings {
  // Type checking
  mode: LuauMode;
  solver: SolverMode;
  // Lints
  lints: number[] | "all";
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

function loadKeybindingsFromStorage(): KeybindingMode {
  if ((typeof window === 'undefined') || detectEmbedMode()) {
    return 'default';
  }

  try {
    const stored = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
    return keybindingModes.find((mode) => mode === stored) ?? 'default';
  } catch {
    return 'default';
  }
}

function saveKeybindingsToStorage(value: KeybindingMode): void {
  if ((typeof window === 'undefined') || detectEmbedMode()) return;

  try {
    localStorage.setItem(KEYBINDINGS_STORAGE_KEY, value);
  } catch {
    // Ignore storage errors
  }
}

function mergeSettings(partial: Partial<PlaygroundSettings>): PlaygroundSettings {
  return {
    mode: partial.mode ?? defaultSettings.mode,
    solver: partial.solver ?? defaultSettings.solver,
    lints: partial.lints ?? defaultSettings.lints,
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

// Editor preference, intentionally kept out of shared links
export const keybindings = writable<KeybindingMode>(loadKeybindingsFromStorage());

if (typeof window !== 'undefined' && !detectEmbedMode()) {
  // Auto-save settings when they change
  settings.subscribe((value) => {
    saveSettings(value);
  });

  // Auto-save UI state when it changes
  showBytecode.subscribe((value) => {
    saveShowBytecodeToStorage(value);
  });

  keybindings.subscribe((value) => {
    saveKeybindingsToStorage(value);
  });
}

export function setMode(mode: LuauMode): void {
  settings.update((s) => ({ ...s, mode }));
}

export function setSolver(solver: SolverMode): void {
  settings.update((s) => ({ ...s, solver }));
}

export async function enableLint(lint: number | 'all'): Promise<void> {
  const allLints = await getAllLints;
  settings.update((s) => {
    if (lint === 'all') return { ...s, lints: 'all' }; // Enable all

    // Guard clause against duplicates
    if (s.lints === 'all' || s.lints.includes(lint)) return s;

    // Set to 'all' if all lints have been individually enabled
    return { ...s, lints: s.lints.length + 1 >= allLints.length ? 'all' : [...s.lints, lint] };
  });
}

export async function disableLint(lint: number | 'all'): Promise<void> {
  const allLints = await getAllLints;
  settings.update((s) => {
    if (lint === 'all') return { ...s, lints: [] }; // Disable all

    // Get desired lints array
    const lintsArray = s.lints === 'all' ? allLints.map(v => v.code) : s.lints;

    return { ...s, lints: lintsArray.filter(v => v !== lint) };
  });
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

export function setKeybindings(mode: KeybindingMode): void {
  keybindings.set(mode);
}

export function toggleBytecode(): void {
  showBytecode.update((v) => !v);
}

export function getSettings(): PlaygroundSettings {
  return get(settings);
}
