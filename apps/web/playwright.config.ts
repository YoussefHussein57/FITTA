import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * Both servers are started from their **built** output, not dev mode. A dev
 * server renders everything dynamically, which would make a static-rendering
 * mistake invisible — exactly the trap that made `/status` look broken during
 * Slice 4.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // NFR-09: mobile-first, usable one-handed at 360px.
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],

  webServer: [
    {
      // `pnpm --filter` resolves the workspace root from any directory inside
      // it, so no cwd juggling is needed — and Playwright transpiles this config
      // to CommonJS, where `import.meta` does not exist.
      command: 'pnpm --filter @fitta/api run start',
      url: 'http://localhost:3001/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @fitta/web run start',
      url: 'http://localhost:3000/ar',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
