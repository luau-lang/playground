import type { Plugin, Rollup } from 'vite';

/**
 * Inlines CSS into the HTML document.
 * Eliminates the render-blocking CSS request for faster first paint.
 */
export function inlineCss(): Plugin {
  return {
    name: 'inline-css',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html;

      // Find the CSS asset in the bundle
      const cssFileName = Object.keys(ctx.bundle).find(name => name.endsWith('.css'));
      if (!cssFileName) return html;

      const cssChunk = ctx.bundle[cssFileName] as Rollup.OutputAsset;
      if (cssChunk.type !== 'asset' || typeof cssChunk.source !== 'string') {
        return html;
      }

      // Remove the CSS file from bundle so it's not emitted
      delete ctx.bundle[cssFileName];

      // Replace the stylesheet link with an inline style tag
      return html.replace(
        /<link rel="stylesheet"[^>]*>/,
        `<style>${cssChunk.source}</style>`
      );
    },
  };
}

