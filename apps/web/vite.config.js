import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '../..');

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4123',
        changeOrigin: true
      },
      '/assets': {
        target: 'http://127.0.0.1:4123',
        changeOrigin: true
      }
    },
    fs: {
      allow: [repoRoot]
    }
  },
  publicDir: 'public'
});
