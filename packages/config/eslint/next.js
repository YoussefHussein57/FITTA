import nextPlugin from '@next/eslint-plugin-next';

/**
 * Next.js-specific lint rules, scoped to the web app.
 *
 * These catch mistakes that typecheck cannot: an `<img>` where `next/image`
 * belongs, an `<a href>` to an internal route that forces a full page reload,
 * a synchronous script that blocks first paint. All three degrade the
 * mobile-first experience NFR-09 commits to.
 *
 * Kept in the shared config rather than a second config file inside `apps/web`,
 * so the repository has exactly one lint entry point and one source of rules.
 *
 * @param {{ files?: string[] }} [options]
 */
export function createNextConfig({ files = ['apps/web/**/*.{ts,tsx,js,jsx}'] } = {}) {
  return [
    {
      files,
      plugins: { '@next/next': nextPlugin },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,

        // Pages Router only. FITTA uses the App Router, so this rule scans for a
        // `pages/` directory that will never exist and warns on every run.
        '@next/next/no-html-link-for-pages': 'off',
      },
    },
  ];
}

export default createNextConfig;
