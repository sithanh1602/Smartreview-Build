import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Preserve the browser Host so the API can validate same-origin writes.
    proxy: { '/api': { target: 'http://127.0.0.1:3100', changeOrigin: false } },
  },
});
