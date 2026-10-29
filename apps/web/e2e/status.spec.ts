import { expect, test } from '@playwright/test';

/**
 * Acceptance case 8: the frontend fetches and displays backend status.
 *
 * This is the one test that proves the whole stack is wired together —
 * browser → Next.js → NestJS → PostgreSQL — rather than four pieces that each
 * work alone.
 */
test.describe('status page', () => {
  test('displays live backend status in Arabic', async ({ page }) => {
    await page.goto('/ar/status');

    await expect(page.getByTestId('status-ok')).toBeVisible();
    await expect(page.getByTestId('api-status')).toHaveText('جاهز');
    await expect(page.getByTestId('db-status')).toHaveText('متصلة');
  });

  test('displays live backend status in English', async ({ page }) => {
    await page.goto('/en/status');

    await expect(page.getByTestId('status-ok')).toBeVisible();
    await expect(page.getByTestId('api-status')).toHaveText('Ready');
    await expect(page.getByTestId('db-status')).toHaveText('Connected');
  });

  test('is served fresh on every request, never cached', async ({ page }) => {
    // Readiness is live state. A cached status page reports a condition that was
    // true some time ago, which is worse than reporting nothing.
    const response = await page.goto('/en/status');

    expect(response?.headers()['cache-control']).toContain('no-store');
  });
});

test.describe('localisation', () => {
  test('Arabic is right-to-left at the document level', async ({ page }) => {
    await page.goto('/ar');

    // On <html>, not a wrapper: direction set lower down flips after first
    // paint and breaks native form-control and scrollbar behaviour.
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  });

  test('English is left-to-right at the document level', async ({ page }) => {
    await page.goto('/en');

    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the root path redirects to the default locale', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/ar$/);
  });

  test('an unsupported locale is 404, not a silent fallback', async ({ page }) => {
    // Quietly serving English at /fr would leave a broken link looking fine.
    const response = await page.goto('/fr');

    expect(response?.status()).toBe(404);
  });
});

test.describe('layout', () => {
  test('does not scroll horizontally on a narrow viewport', async ({ page }) => {
    // NFR-09. In RTL, a horizontally overflowing page is the single most common
    // layout defect and the easiest to miss when developing in English.
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/ar/status');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(overflows).toBe(false);
  });

  test('the status link is reachable by keyboard', async ({ page }) => {
    await page.goto('/en');

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);

    expect(focused).toBe('A');
  });
});
