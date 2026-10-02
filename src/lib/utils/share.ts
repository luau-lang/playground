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
import { copyText } from '$lib/utils/clipboard';
import { buildEmbedSnippet } from '$lib/utils/embedSnippet';

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

function currentState(): ShareState {
  return {
    files: get(files),
    active: get(activeFile),
    v: CURRENT_VERSION,
    settings: get(settings),
    showBytecode: get(showBytecode),
  };
}

/**
 * Generate a playground URL with encoded state.
 */
export function generatePlaygroundUrl(): URL {
  const url = new URL(window.location.origin + window.location.pathname);
  url.hash = encodeState(currentState());
  return url;
}

/**
 * Generate an embed URL for the current playground state.
 */
export function generateEmbedUrl(theme: ThemeMode = 'system', icons = false): URL {
  if (typeof window === 'undefined') return new URL('https://play.luau.org/');

  const state = currentState();
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('embed', 'true');
  if (theme !== 'system') url.searchParams.set('theme', theme);
  if (icons) url.searchParams.set('icons', 'true');
  url.hash = encodeState(state);
  return url;
}

// Editor metrics, mirroring the CodeMirror theme in `editor/setup.ts`: a 14px
// font at CodeMirror's 1.4 line height, inside 12px of vertical padding.
const LINE_HEIGHT = 19.6;
const EDITOR_PADDING = 24;
const TAB_BAR_HEIGHT = 44;

/** Height an embed of this state needs before its code starts scrolling. */
function fullEmbedHeight(state: ShareState): number {
  const contents = Object.values(state.files);
  const longest = Math.max(...contents.map((content) => content.split('\n').length));
  const tabBar = contents.length > 1 ? TAB_BAR_HEIGHT : 0;
  return Math.ceil(longest * LINE_HEIGHT + EDITOR_PADDING + tabBar);
}

/**
 * Generate an iframe embed code snippet for the current playground state.
 *
 * The playground owns what happens inside the frame; the host page owns the
 * frame's size. When the code does not fit in `height`, the snippet carries its
 * own expand toggle — a checkbox and a label, so no script is involved.
 */
export function generateEmbedCode(theme: ThemeMode = 'system', icons = false, height = 400): string {
  const url = generateEmbedUrl(theme, icons);
  return buildEmbedSnippet(url, height, fullEmbedHeight(currentState()));
}

/**
 * Generate a share URL and copy it to the clipboard.
 */
export async function sharePlayground(): Promise<boolean> {
  const url = generatePlaygroundUrl();

  if (await copyText(url.toString())) return true;

  // Fallback: update URL in address bar
  window.history.replaceState(null, '', url.toString());
  return false;
}
