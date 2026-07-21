import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment — this is a backend API, no DOM.
    environment: 'node',
    globals: true,
    // Populate the env vars that config/env.ts validates at import time, BEFORE
    // any src module is loaded (env.ts calls process.exit(1) on missing vars).
    setupFiles: ['./tests/setup/env.setup.ts'],
    // Integration tests spin up mongodb-memory-server (first run downloads a
    // binary) — give them headroom.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/server.ts', // process-level bootstrap, exercised via integration
        'src/scripts/**',
        'src/types/**',
      ],
    },
  },
});
