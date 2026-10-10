import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// JSX compiles against the app's own runtime, which translates text in English mode.
const jsx = (name: string) => fileURLToPath(new URL(`./src/lib/jsx/${name}.ts`, import.meta.url));

export default defineConfig({
  plugins: [react({ jsxImportSource: 'smartreview-jsx' }), tailwindcss()],
  // The runtime is app source: pre-bundling it would freeze the dictionaries until the cache is cleared.
  optimizeDeps: { exclude: ['smartreview-jsx/jsx-runtime', 'smartreview-jsx/jsx-dev-runtime'] },
  resolve: {
    alias: {
      'smartreview-jsx/jsx-runtime': jsx('jsx-runtime'),
      'smartreview-jsx/jsx-dev-runtime': jsx('jsx-dev-runtime'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Preserve the browser Host so the API can validate same-origin writes.
    proxy: { '/api': { target: 'http://127.0.0.1:3100', changeOrigin: false } },
  },
});
