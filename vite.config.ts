import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:8080',
      '/uploads': 'http://localhost:8080',
    },
  },
});
