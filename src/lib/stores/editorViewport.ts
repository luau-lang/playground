/**
 * Editor Viewport
 *
 * Publishes CodeMirror's scroll container once the editor is mounted, so other
 * components can tell whether the code is clipped without importing the editor
 * bundle (which is loaded lazily).
 */

import { writable } from 'svelte/store';

export const editorScroller = writable<HTMLElement | null>(null);
