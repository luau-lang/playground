/**
 * Embed Mode Store
 * 
 * Detects if the playground is running in embed mode (via ?embed=true URL param).
 * In embed mode, certain UI elements are hidden (settings, bytecode, share).
 */

import { readable } from 'svelte/store';

function detectEmbedMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('embed') === 'true';
}

function detectEmbedTheme(): 'light' | 'dark' | 'auto' {
  if (typeof window === 'undefined') return 'auto';
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme');
  if (theme === 'light' || theme === 'dark') return theme;
  return 'auto';
}

/**
 * Whether the playground is in embed mode.
 */
export const isEmbed = readable(detectEmbedMode());

/**
 * Theme preference from embed URL param.
 */
export const embedTheme = readable(detectEmbedTheme());

