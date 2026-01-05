import LZString from 'lz-string';
import type { ShareState } from '$lib/utils/share';

/**
 * Encode state to a URL-safe string.
 */
export function encodeState(state: ShareState): string {
  const json = JSON.stringify(state);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decode a URL-safe string back to state.
 *
 * Note: This function does not validate any ShareState properties. It simply parses and
 * returns whatever is present as a Partial<ShareState>.
 */
export function decodeState(encoded: string): Partial<ShareState> | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;

    let state: Partial<ShareState>;
    try {
      state = JSON.parse(json);
    } catch {
      return null;
    }

    return state;
  } catch {
    return null;
  }
}
