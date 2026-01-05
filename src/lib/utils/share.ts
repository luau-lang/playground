/**
 * Share Functionality
 * 
 * Encodes playground state into URL-safe compressed format using lz-string.
 */

import { files, activeFile } from '$lib/stores/playground';
import { settings, showBytecode, type PlaygroundSettings } from '$lib/stores/settings';
import { get } from 'svelte/store';
import LZString from 'lz-string';

export interface ShareState {
  files: Record<string, string>;
  active: string;
  v: number; // Version for future compatibility
  settings?: PlaygroundSettings;
  showBytecode?: boolean;
}

const CURRENT_VERSION = 1;
const PLAYGROUND_URL = 'https://play.luau.org';

/**
 * Encode state to a URL-safe string.
 */
export function encodeState(state: ShareState): string {
  const json = JSON.stringify(state);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decode a URL-safe string back to state.
 */
export function decodeState(encoded: string): ShareState | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    
    const state = JSON.parse(json) as ShareState;
    
    // Validate the state
    if (!state.files || typeof state.files !== 'object') return null;
    if (!state.active || typeof state.active !== 'string') return null;
    
    return state;
  } catch {
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

/**
 * Generate a playground URL with encoded state.
 * This is a pure function that doesn't depend on stores.
 */
export function generatePlaygroundUrl(
  filesData: Record<string, string>,
  activeFileName: string,
  baseUrl: string = PLAYGROUND_URL
): string {
  const state: ShareState = {
    files: filesData,
    active: activeFileName,
    v: CURRENT_VERSION,
  };
  
  const encoded = encodeState(state);
  return `${baseUrl}/#${encoded}`;
}

/**
 * Open the code in the playground in a new tab.
 */
export function openInPlayground(
  filesData: Record<string, string>,
  activeFileName: string
): void {
  const url = generatePlaygroundUrl(filesData, activeFileName);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Generate a share URL and copy it to the clipboard.
 */
export async function sharePlayground(): Promise<boolean> {
  const state: ShareState = {
    files: get(files),
    active: get(activeFile),
    v: CURRENT_VERSION,
    settings: get(settings),
    showBytecode: get(showBytecode),
  };

  const encoded = encodeState(state);
  const url = new URL(window.location.href);
  url.hash = encoded;

  try {
    await navigator.clipboard.writeText(url.toString());
    return true;
  } catch {
    // Fallback: update URL in address bar
    window.history.replaceState(null, '', url.toString());
    return false;
  }
}

/**
 * Initialize share functionality.
 * Note: URL state is now loaded during store initialization to avoid race conditions.
 */
export function initShare(): void {
  // URL state is loaded during store initialization in playground.ts
  // This function is kept for potential future initialization needs
}
