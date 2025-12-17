import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Check if we're building the embed component
const isEmbedBuild = process.env.BUILD_EMBED === 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
    },
  },
  build: isEmbedBuild ? {
    // Embed build configuration - tiny JS file that creates iframes
    lib: {
      entry: path.resolve(__dirname, 'src/embed/index.ts'),
      name: 'LuauEmbed',
      formats: ['es', 'iife'],
      fileName: (format) => format === 'es' ? 'embed/luau-embed.js' : 'embed/luau-embed.iife.js',
    },
    outDir: 'dist',
    emptyOutDir: false, // Don't clear dist since main app was built first
    sourcemap: false, // No need for sourcemaps on tiny embed
    minify: 'terser',
    terserOptions: {
      format: {
        comments: false,
      },
    },
    copyPublicDir: false,
    rollupOptions: {
      external: [], // Bundle lz-string
      output: {
        // For IIFE, expose globally
        name: 'LuauEmbed',
      },
    },
  } : {
    // Main app build configuration
    sourcemap: true,
  },
})
