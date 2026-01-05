/**
 * Share Functionality
 *
 * Encodes playground state into URL-safe compressed format using lz-string.
 */

import { files, activeFile } from '$lib/stores/playground';
import { settings, showBytecode, type PlaygroundSettings } from '$lib/stores/settings';
import { get } from 'svelte/store';
import { encodeState } from './state';

export interface ShareState {
  files: Record<string, string>;
  active: string; // Active file name
  v: number; // Version for future compatibility
  settings?: PlaygroundSettings;
  showBytecode?: boolean;
}

const CURRENT_VERSION = 1;
const PLAYGROUND_URL = 'https://play.luau.org';

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
  return `${baseUrl}/#code=${encoded}`;
}

/**
 * Open the code in the playground in a new tab.
 */
export function openInPlayground(filesData: Record<string, string>, activeFileName: string): void {
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
  url.hash = `code=${encoded}`;

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
