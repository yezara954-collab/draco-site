import { defineConfig } from 'vite';

// Relative build URLs support both an account site and a repository subdirectory.
export default defineConfig({
  base: './',
  build: { assetsInlineLimit: 0 },
});
