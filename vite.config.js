// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  resolve: {
    alias: {
      '@shared': '../shared',
    },
  },
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../dist',
  },
});
