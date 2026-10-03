/**
 * Editor layout for the CodeMirror theme and the embed height estimate.
 */

/** Tailwind's default spacing step, in px (`--spacing` is 0.25rem). */
const SPACING = 4;

/** `text-sm` (0.875rem). Mobile non-embed CSS bumps `.cm-content` to 16px. */
export const EDITOR_FONT_SIZE = 14;

/** CodeMirror's `.cm-scroller` line height. The skeleton uses `leading-[1.4]`. */
export const EDITOR_LINE_HEIGHT = 1.4;

/** `py-3`, applied to each side of `.cm-content`. */
export const EDITOR_PADDING_Y = SPACING * 3;

/** Pixel size of the tab bar's `min-h-11`. */
export const TAB_BAR_HEIGHT = SPACING * 11;

/** Collapsed embed height in px. Code taller than this gets an expand toggle. */
export const DEFAULT_EMBED_HEIGHT = 400;

const LINE_HEIGHT = EDITOR_FONT_SIZE * EDITOR_LINE_HEIGHT;
const EDITOR_PADDING = EDITOR_PADDING_Y * 2;

/** Height an embed of these files needs before the code starts scrolling. */
export function fullEmbedHeight(files: Record<string, string>): number {
  const contents = Object.values(files);
  const longest = Math.max(...contents.map((content) => content.split('\n').length));
  const tabBar = contents.length > 1 ? TAB_BAR_HEIGHT : 0;
  return Math.ceil(longest * LINE_HEIGHT + EDITOR_PADDING + tabBar);
}
