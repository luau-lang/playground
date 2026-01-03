import { defineConfig, build, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { rmSync } from 'fs'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Plugin to add modulepreload for dynamic import chunks
function preloadDynamicChunks(): Plugin {
  return {
    name: 'preload-dynamic-chunks',
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html;
      
      const preloads: string[] = [];
      for (const [fileName] of Object.entries(ctx.bundle)) {
        if (fileName.startsWith('assets/setup-') && fileName.endsWith('.js')) {
          preloads.push(`<link rel="modulepreload" crossorigin href="/${fileName}">`);
        }
      }
      
      if (preloads.length === 0) return html;
      return html.replace('</head>', `${preloads.join('\n')}\n</head>`);
    },
  };
}

// Plugin to prerender the app using Svelte SSR
function prerenderPlugin(): Plugin {
  let renderedHtml: { body: string; head: string } | null = null;
  const serverOutDir = path.resolve(__dirname, 'dist/.ssr');
  
  return {
    name: 'svelte-prerender',
    apply: 'build',
    
    async buildStart() {
      console.log('⏳ Prerendering index.html...');
      
      // Build SSR version
      await build({
        configFile: false,
        plugins: [svelte(), tailwindcss()],
        resolve: {
          alias: { '$lib': path.resolve(__dirname, './src/lib') },
        },
        build: {
          ssr: true,
          outDir: serverOutDir,
          rollupOptions: {
            input: path.resolve(__dirname, 'src/entry-server.ts'),
          },
        },
        logLevel: 'warn',
      });
      
      // Import and render
      const { renderApp } = await import(path.join(serverOutDir, 'entry-server.js'));
      renderedHtml = renderApp();
      
      console.log('✅ Prerender complete!');
    },
    
    transformIndexHtml(html) {
      if (!renderedHtml) return html;
      return html
        .replace('<!--app-html-->', renderedHtml.body)
        .replace('<!--app-head-->', renderedHtml.head);
    },
    
    closeBundle() {
      // Cleanup SSR build
      rmSync(serverOutDir, { recursive: true, force: true });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss(), preloadDynamicChunks(), prerenderPlugin()],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
    },
  },
  build: {
    sourcemap: true,
  },
});
