import { redirect } from 'next/navigation';

import { DEFAULT_LOCALE } from '@/lib/i18n/locales';

/** `/` has no locale, so send it to the default one (Arabic). */
export default function RootPage() {
  redirect(`/${DEFAULT_LOCALE}`);
}
