import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: 'index.html',
        playcanvas: 'playcanvas.html',
      },
    },
  },
});
