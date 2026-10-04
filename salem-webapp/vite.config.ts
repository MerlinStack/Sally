/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // The default 'forks' pool intermittently fails to spawn workers on
    // Windows ("Failed to start forks worker"). These tests are pure
    // jsdom + React and need no process isolation, so 'threads' is both
    // more reliable and faster here.
    pool: 'threads',
    // Keep worker count modest so constrained CI runners do not thrash.
    maxWorkers: 2,
  },
});