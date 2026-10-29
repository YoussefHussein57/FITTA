import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { DICTIONARIES, LOCALES, directionOf, isLocale } from '@/lib/i18n/locales';

import '../globals.css';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = isLocale(locale) ? DICTIONARIES[locale] : DICTIONARIES.en;

  return {
    title: dictionary.appName,
    description: dictionary.tagline,
  };
}

/**
 * Locale layout — owns `<html>`.
 *
 * `lang` and `dir` are set on the document element so the very first paint is
 * already in the right direction. Setting direction lower down (a wrapper div,
 * a CSS class) produces a visible flip and breaks native form-control and
 * scrollbar behaviour.
 *
 * `params` is a Promise in the App Router — awaiting it is required, not
 * optional ceremony.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // An unknown locale is a 404, not a silent fallback: quietly serving English
  // at /fr would leave a broken link looking like it works.
  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <html lang={locale} dir={directionOf(locale)}>
      <body className="bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
