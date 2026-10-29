import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests. Require a running PostgreSQL test instance.
 *
 * Separated from unit tests by directory rather than by tag, so `pnpm test`
 * stays runnable with nothing installed but Node — and so a missing database
 * can never be mistaken for a passing unit suite.
 *
 * `fileParallelism: false`: these share one database. Parallel files produce
 * failures that depend on scheduling, which is the worst kind of flake to chase.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
