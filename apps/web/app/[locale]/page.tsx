import Link from 'next/link';

import { DICTIONARIES, isLocale } from '@/lib/i18n/locales';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = isLocale(locale) ? DICTIONARIES[locale] : DICTIONARIES.en;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">{dictionary.appName}</h1>
      <p className="text-lg text-slate-600 dark:text-slate-400">{dictionary.tagline}</p>

      <Link
        href={`/${locale}/status`}
        className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-slate-700 dark:hover:bg-slate-900"
      >
        {dictionary.viewStatus}
      </Link>
    </main>
  );
}
