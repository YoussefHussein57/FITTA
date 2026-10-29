import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests. Fast, no database, no network.
 *
 * The SWC plugin is required, not optional: NestJS resolves constructor
 * dependencies from `emitDecoratorMetadata` output, and esbuild — Vite's default
 * transformer — does not emit it. Without SWC, every injected dependency
 * resolves to `undefined` and the failure looks like a DI bug rather than a
 * build-tool gap.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
