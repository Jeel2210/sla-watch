import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Real-Postgres tests (PGlite) insert whole sample files; next to the other packages' tests (turbo runs
    // them in parallel) that takes several seconds, well past vitest's 5 s default.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
