import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import path from 'path';

import { preloadDynamicChunks } from './vite/preload-chunks';
import { prerenderPlugin } from './vite/prerender';
import { inlineCss } from './vite/inline-css';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss(), preloadDynamicChunks(), prerenderPlugin(), inlineCss()],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
    },
  },
  build: {
    sourcemap: true,
  },
});
