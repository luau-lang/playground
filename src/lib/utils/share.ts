/**
 * Share Functionality
 * 
 * Encodes playground state into URL-safe compressed format using lz-string.
 */

import { files, activeFile } from '$lib/stores/playground';
import { settings, showBytecode, type PlaygroundSettings } from '$lib/stores/settings';
import { type ThemeMode } from '$lib/utils/theme';
import { defaultSettings, CURRENT_VERSION, DEFAULT_FILENAME } from '$lib/constants';
import { get } from 'svelte/store';
import LZString from 'lz-string';
import { type ShareState, type MinimalShareState } from '$lib/utils/decode';

/**
 * Check if settings differ from defaults.
 */
function getNonDefaultSettings(s: PlaygroundSettings): Partial<PlaygroundSettings> | null {
  const diff: Partial<PlaygroundSettings> = {};
  if (s.mode !== defaultSettings.mode) diff.mode = s.mode;
  if (s.solver !== defaultSettings.solver) diff.solver = s.solver;
  if (s.optimizationLevel !== defaultSettings.optimizationLevel) diff.optimizationLevel = s.optimizationLevel;
  if (s.debugLevel !== defaultSettings.debugLevel) diff.debugLevel = s.debugLevel;
  if (s.outputFormat !== defaultSettings.outputFormat) diff.outputFormat = s.outputFormat;
  if (s.compilerRemarks !== defaultSettings.compilerRemarks) diff.compilerRemarks = s.compilerRemarks;
  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Convert full state to minimal state (v2) for compression.
 */
function toMinimalState(state: ShareState): MinimalShareState {
  const minimal: MinimalShareState = { v: state.v };
  
  const fileNames = Object.keys(state.files);
  const isSingleDefaultFile = fileNames.length === 1 && fileNames[0] === DEFAULT_FILENAME;
  
  if (isSingleDefaultFile) {
    minimal.c = state.files[DEFAULT_FILENAME];
  } else {
    minimal.f = state.files;
    // Only include active if there are multiple files
    if (fileNames.length > 1) {
      minimal.a = state.active;
    }
  }
    
  if (state.settings) {
    const nonDefault = getNonDefaultSettings(state.settings);
    if (nonDefault) {
      minimal.s = nonDefault;
    }
  }
  
  if (state.showBytecode) {
    minimal.b = true;
  }
  
  return minimal;
}

/**
 * Encode state to a URL-safe string.
 */
export function encodeState(state: ShareState): string {
  const minimal = toMinimalState(state);
  const json = JSON.stringify(minimal);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Generate a playground URL with encoded state.
 */
export function generatePlaygroundUrl(): URL {
  const state: ShareState = {
    files: get(files),
    active: get(activeFile),
    v: CURRENT_VERSION,
    settings: get(settings),
    showBytecode: get(showBytecode),
  };
  
  const url = new URL(window.location.origin + window.location.pathname);
  const encoded = encodeState(state);
  url.hash = encoded;
  return url;
}

/**
 * Generate an embed URL for the current playground state.
 */
export function generateEmbedUrl(theme: ThemeMode = 'system'): URL {
  if (typeof window === 'undefined') return new URL('https://play.luau.org/');

  const state: ShareState = {
    files: get(files),
    active: get(activeFile),
    v: CURRENT_VERSION,
    settings: get(settings),
    showBytecode: get(showBytecode),
  };

  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('embed', 'true');
  if (theme !== 'system') url.searchParams.set('theme', theme);
  url.hash = encodeState(state);
  return url;
}

/**
 * Generate an iframe embed code snippet for the current playground state.
 */
export function generateEmbedCode(theme: ThemeMode = 'system', height = '400px'): string {
  const url = generateEmbedUrl(theme);
  return `<iframe\n  src="${url.toString()}"\n  width="100%"\n  height="${height}"\n  style="border: 1px solid #e2e8f0; border-radius: 8px;"\n  loading="lazy"\n  allow="clipboard-write"\n  title="Luau Playground"\n></iframe>`;
}

/**
 * Generate a share URL and copy it to the clipboard.
 */
export async function sharePlayground(): Promise<boolean> {
  const url = generatePlaygroundUrl();

  try {
    await navigator.clipboard.writeText(url.toString());
    return true;
  } catch {
    // Fallback: update URL in address bar
    window.history.replaceState(null, '', url.toString());
    return false;
  }
}
