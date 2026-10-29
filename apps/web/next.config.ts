import type { NextConfig } from 'next';

/**
 * Server-only. Deliberately **not** `NEXT_PUBLIC_` prefixed: anything with that
 * prefix is inlined into the browser bundle and is public by definition
 * (docs/SECURITY.md §5).
 */
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Fail the build on type errors rather than shipping them.
  typescript: { ignoreBuildErrors: false },

  /**
   * Linting runs once, from the repository root (`pnpm lint`), using the shared
   * flat config — which now includes Next's own rules via
   * `@fitta/config/eslint/next`.
   *
   * Letting `next build` lint as well would mean two linters with two config
   * resolutions over the same files: slower builds, and the standing risk that
   * one passes while the other fails.
   */
  eslint: { ignoreDuringBuilds: true },

  /**
   * Same-origin proxy (docs/DECISIONS.md ADR-007).
   *
   * The browser only ever calls `/api/...` on its own origin; Next forwards it
   * to the API server-side. Three consequences, all of which matter:
   *
   *  1. CORS disappears from the browser path entirely.
   *  2. In Phase 02 the session cookie is first-party, so `SameSite=Lax` works
   *     with no `SameSite=None` and no credentialed cross-origin requests.
   *  3. The API's real origin never reaches the client bundle.
   *
   * The API's `/api/v1` prefix is applied here, so callers write `/api/health`.
   */
  // Not `async`: the body awaits nothing. Next only requires a Promise, which
  // `Promise.resolve` supplies without claiming asynchronous work that is not
  // happening.
  rewrites() {
    return Promise.resolve([
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/v1/:path*`,
      },
    ]);
  },
};

export default nextConfig;
