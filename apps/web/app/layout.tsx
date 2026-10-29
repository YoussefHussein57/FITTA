import type { ReactNode } from 'react';

/**
 * Pass-through root.
 *
 * `<html>` and `<body>` are rendered by `app/[locale]/layout.tsx` instead,
 * because `lang` and `dir` depend on the locale segment and this layout cannot
 * see route params. Arabic RTL is a document-level attribute, not a class —
 * putting it anywhere else would mean the first paint is LTR and then flips.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
