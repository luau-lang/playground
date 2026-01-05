import { defaultSettings, DEFAULT_FILENAME } from '$lib/constants';
import { type PlaygroundSettings } from '$lib/stores/settings';
import LZString from 'lz-string';

export interface ShareState {
  files: Record<string, string>;
  active: string;
  v: number; // Version for future compatibility
  settings?: PlaygroundSettings;
  showBytecode?: boolean;
}

// Minimal share state (for URL compression)
export interface MinimalShareState {
  c?: string; // Single file content (when using default filename)
  f?: Record<string, string>; // Files (when multiple or non-default name)
  a?: string; // Active file (only if multiple files)
  v: number;
  s?: Partial<PlaygroundSettings>; // Only non-default settings
  b?: boolean; // showBytecode (only if true)
}

// Version history:
// v1: Original format with full keys (files, active, settings, showBytecode)
// v2: Minimal format with short keys (c, f, a, s, b) omitting default values

/**
 * Convert minimal state (v2) back to full state.
 */
function fromMinimalState(minimal: MinimalShareState): ShareState | null {
  let files: Record<string, string>;
  let active: string;
  
  if (minimal.c !== undefined) {
    // Single file with default name
    files = { [DEFAULT_FILENAME]: minimal.c };
    active = DEFAULT_FILENAME;
  } else if (minimal.f) {
    files = minimal.f;
    const fileNames = Object.keys(files);
    active = minimal.a ?? fileNames[0];
  } else {
    // Invalid state - no content provided
    return null;
  }
  
  return {
    files,
    active,
    v: minimal.v,
    settings: minimal.s ? { ...defaultSettings, ...minimal.s } : undefined,
    showBytecode: minimal.b ?? false,
  };
}


/**
 * Decode a URL-safe string back to state.
 */
function decodeState(encoded: string): ShareState | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    
    const parsed = JSON.parse(json);
    const version = parsed.v ?? 1;
    
    if (version >= 2) {
      // v2+: Minimal format
      return fromMinimalState(parsed as MinimalShareState);
    }
    
    // v1: Legacy format with full keys
    const state = parsed as ShareState;
    
    // Validate the legacy state
    if (!state.files || typeof state.files !== 'object') return null;
    if (!state.active || typeof state.active !== 'string') return null;
    
    return state;
  } catch (error) {
    console.error('Error decoding state:', error);
    return null;
  }
}

/**
 * Parse state from URL hash.
 * Handles both new format (#encoded) and legacy format (#code=encoded).
 */
export function parseStateFromHash(hash: string): ShareState | null {
  if (!hash || hash.length <= 1) return null;
  
  let encoded: string;
  if (hash.startsWith('#code=')) {
    // Legacy format: #code=encoded
    encoded = hash.slice(6);
  } else {
    // New format: #encoded
    encoded = hash.slice(1);
  }
  
  if (!encoded) return null;
  return decodeState(encoded);
}
