import { DICTIONARIES, isLocale } from '@/lib/i18n/locales';
import { fetchReadiness } from '@/lib/api/client';

/**
 * Readiness is live state, so this page is never prerendered.
 *
 * Without this, `next build` would attempt to render the page at build time,
 * call an API that is not running in CI, and fail the build — turning a
 * deliberately dynamic page into a build-time dependency on infrastructure.
 */
export const dynamic = 'force-dynamic';

export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = isLocale(locale) ? DICTIONARIES[locale] : DICTIONARIES.en;

  // Server-side fetch: this goes straight to the API, not through the rewrite.
  const result = await fetchReadiness();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t.statusTitle}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t.statusIntro}</p>
      </header>

      {result.ok ? (
        <dl
          className="grid gap-3 rounded-lg border border-slate-200 p-5 dark:border-slate-800"
          data-testid="status-ok"
        >
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm text-slate-600 dark:text-slate-400">{t.apiStatus}</dt>
            <dd data-testid="api-status" className="font-mono text-sm font-semibold">
              {result.data.status === 'ready' ? t.ready : t.degraded}
            </dd>
          </div>

          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm text-slate-600 dark:text-slate-400">{t.database}</dt>
            <dd data-testid="db-status" className="font-mono text-sm font-semibold">
              {result.data.checks.database.ok ? t.reachable : t.notReachable}
            </dd>
          </div>

          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm text-slate-600 dark:text-slate-400">{t.latency}</dt>
            {/* Latin digits and the unit are kept LTR even inside an RTL
                document; a bidi-reordered number is a real legibility bug. */}
            <dd className="font-mono text-sm" dir="ltr">
              {result.data.checks.database.latencyMs} ms
            </dd>
          </div>
        </dl>
      ) : (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950"
          data-testid="status-error"
        >
          <p className="font-semibold">{t.unreachable}</p>
          {/* The reason is a transport or contract error, never user data. */}
          <p className="mt-1 font-mono text-xs break-words opacity-80" dir="ltr">
            {result.status !== null ? `HTTP ${result.status.toString()} — ` : ''}
            {result.reason}
          </p>
        </div>
      )}
    </main>
  );
}
