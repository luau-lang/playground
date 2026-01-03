import type { Plugin } from 'vite';

/**
 * Adds modulepreload links for dynamically imported chunks.
 * This improves loading performance by preloading chunks that will be needed.
 */
export function preloadDynamicChunks(): Plugin {
  return {
    name: 'preload-dynamic-chunks',
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html;

      const preloads: string[] = [];
      for (const [fileName] of Object.entries(ctx.bundle)) {
        if (fileName.startsWith('assets/') && !fileName.startsWith('assets/index-') && fileName.endsWith('.js')) {
          preloads.push(`<link rel="modulepreload" crossorigin href="/${fileName}">`);
        }
      }

      if (preloads.length === 0) return html;
      return html.replace('</head>', `${preloads.join('\n')}\n</head>`);
    },
  };
}

