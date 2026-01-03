import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Plugin to add modulepreload for dynamic import chunks
function preloadDynamicChunks(): Plugin {
  return {
    name: 'preload-dynamic-chunks',
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html;
      
      // Find chunks that should be preloaded (e.g., setup chunk)
      const preloads: string[] = [];
      for (const [fileName] of Object.entries(ctx.bundle)) {
        if (fileName.startsWith('assets/setup-') && fileName.endsWith('.js')) {
          preloads.push(`<link rel="modulepreload" crossorigin href="/${fileName}">`);
        }
      }
      
      if (preloads.length === 0) return html;
      
      // Insert before </head>
      return html.replace('</head>', `${preloads.join('\n')}\n</head>`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss(), preloadDynamicChunks()],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
    },
  },
  build: {
    sourcemap: true,
  },
})
