function iframeTag(url: URL, sizing: string[] = [], indent = ''): string {
  return [
    '<iframe',
    `  src="${url.toString()}"`,
    ...sizing,
    '  loading="lazy"',
    '  allow="clipboard-write"',
    '  title="Luau Playground"',
    '></iframe>',
  ].map((line) => indent + line).join('\n');
}

/**
 * HTML for an embed of `url`.
 *
 * `collapsed` is the height the host asked for. When `expanded` is taller, the
 * snippet adds a checkbox toggle and a stylesheet that grows the frame. The
 * iframe still carries width and height attributes: hosts that strip `<style>`
 * (common in CMS and markdown sanitizers) would otherwise fall back to the
 * browser default of 300×150. `height: var(--luau-collapsed)` wins when the
 * stylesheet survives.
 */
export function buildEmbedSnippet(url: URL, collapsed: number, expanded: number): string {
  if (expanded <= collapsed) {
    return iframeTag(url, [
      '  width="100%"',
      `  height="${collapsed}"`,
      '  style="border: 1px solid #e2e8f0; border-radius: 8px;"',
    ]);
  }

  const id = `luau-embed-${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="luau-embed" style="--luau-collapsed: ${collapsed}px; --luau-expanded: ${expanded}px;">
  <input class="luau-embed-toggle" id="${id}" type="checkbox">
${iframeTag(url, ['  width="100%"', `  height="${collapsed}"`], '  ')}
  <label class="luau-embed-label" for="${id}">
    <span class="luau-embed-more">Expand \u25be</span>
    <span class="luau-embed-less">Collapse \u25b4</span>
  </label>
</div>
<style>
  .luau-embed { position: relative; }
  .luau-embed iframe {
    display: block;
    width: 100%;
    height: var(--luau-collapsed);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    transition: height 150ms ease;
  }
  .luau-embed-toggle { position: absolute; opacity: 0; pointer-events: none; }
  .luau-embed-toggle:checked ~ iframe { height: min(var(--luau-expanded), 80vh); }
  .luau-embed-label { display: inline-block; margin-top: 6px; font-size: 13px; cursor: pointer; }
  .luau-embed-toggle:focus-visible ~ .luau-embed-label { outline: 2px solid currentColor; outline-offset: 2px; }
  .luau-embed-toggle:checked ~ .luau-embed-label .luau-embed-more,
  .luau-embed-toggle:not(:checked) ~ .luau-embed-label .luau-embed-less { display: none; }
</style>`;
}
