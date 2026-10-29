/**
 * Supported locales.
 *
 * Arabic is first and is the default (docs/PRD.md §8 Q1). "Egyptian-first"
 * should be true on first paint, not a setting the user has to find — and
 * making RTL the default path means RTL defects surface during development
 * instead of after launch (RISK-16).
 */
export const LOCALES = ['ar', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Text direction for the document element. */
export function directionOf(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

interface Dictionary {
  readonly appName: string;
  readonly tagline: string;
  readonly statusTitle: string;
  readonly statusIntro: string;
  readonly apiStatus: string;
  readonly database: string;
  readonly latency: string;
  readonly ready: string;
  readonly degraded: string;
  readonly unreachable: string;
  readonly reachable: string;
  readonly notReachable: string;
  readonly viewStatus: string;
}

export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = {
  ar: {
    appName: 'فيتا',
    tagline: 'تتبع التغذية واللياقة — مصري أولًا',
    statusTitle: 'حالة النظام',
    statusIntro: 'بيانات حية من الخادم. لا يتم تخزينها مؤقتًا.',
    apiStatus: 'حالة الواجهة البرمجية',
    database: 'قاعدة البيانات',
    latency: 'زمن الاستجابة',
    ready: 'جاهز',
    degraded: 'متدهور',
    unreachable: 'تعذر الوصول',
    reachable: 'متصلة',
    notReachable: 'غير متصلة',
    viewStatus: 'عرض حالة النظام',
  },
  en: {
    appName: 'FITTA',
    tagline: 'Egyptian-first nutrition and fitness tracking',
    statusTitle: 'System status',
    statusIntro: 'Live data from the server. Not cached.',
    apiStatus: 'API status',
    database: 'Database',
    latency: 'Latency',
    ready: 'Ready',
    degraded: 'Degraded',
    unreachable: 'Unreachable',
    reachable: 'Connected',
    notReachable: 'Not connected',
    viewStatus: 'View system status',
  },
};
