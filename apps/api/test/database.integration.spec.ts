import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL } from './test-database';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

afterAll(async () => {
  await prisma.$disconnect();
});

describe('database provisioning', () => {
  it('has applied migration 0001 (acceptance case 9)', async () => {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;

    expect(rows.map((row) => row.migration_name)).toContain('0001_init_extensions');
  });

  it('has the extensions Phase 04 depends on', async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension
    `;
    const installed = rows.map((row) => row.extname);

    expect(installed).toContain('pg_trgm');
    expect(installed).toContain('unaccent');
  });
});

/**
 * Guards ADR-012a.
 *
 * A database created with `--locale=C` makes `pg_trgm` discard every non-ASCII
 * character, so Arabic similarity collapses to 0 while Latin similarity is
 * unaffected. Nothing errors. Every query still "works" and returns nothing —
 * the Egyptian food search simply never finds anything (RISK-03).
 *
 * This suite exists so that a differently-provisioned environment fails here,
 * in CI, instead of silently in Phase 04.
 */
describe('ADR-012a — Arabic trigram similarity', () => {
  it('was created with a UTF-8 ctype', async () => {
    const rows = await prisma.$queryRaw<{ datctype: string }[]>`
      SELECT datctype FROM pg_database WHERE datname = current_database()
    `;

    expect(rows[0]?.datctype.toUpperCase()).toContain('UTF');
  });

  it.each([
    // [label, a, b] — orthographic variants that must not score zero
    ['ya vs alef maqsura', 'كشري', 'كشرى'],
    ['definite article', 'كشري', 'الكشري'],
    ['ta marbuta vs ha', 'طعمية', 'طعميه'],
  ])('scores %s above zero', async (_label, a, b) => {
    const rows = await prisma.$queryRaw<{ score: number }[]>`
      SELECT similarity(${a}, ${b})::float8 AS score
    `;

    expect(rows[0]?.score).toBeGreaterThan(0);
  });

  it('still scores unrelated Arabic words at zero (no false positives)', async () => {
    const rows = await prisma.$queryRaw<{ score: number }[]>`
      SELECT similarity('كشري', 'ملوخية')::float8 AS score
    `;

    expect(rows[0]?.score).toBe(0);
  });

  it('matches transliterated Latin spellings of the same dish', async () => {
    const rows = await prisma.$queryRaw<{ score: number }[]>`
      SELECT similarity('koshary', 'koshari')::float8 AS score
    `;

    expect(rows[0]?.score).toBeGreaterThan(0.3);
  });

  /**
   * Documents a real limitation rather than asserting a convenient fiction:
   * `unaccent` is Latin-oriented and leaves Arabic diacritics untouched. The
   * harakat-stripping half of the ADR-012 pipeline is entirely our own code.
   */
  it('confirms unaccent handles Latin diacritics but not Arabic harakat', async () => {
    const rows = await prisma.$queryRaw<{ latin: string; arabic: string }[]>`
      SELECT unaccent('Koshári') AS latin, unaccent('كُشَرِي') AS arabic
    `;

    expect(rows[0]?.latin).toBe('Koshari');
    expect(rows[0]?.arabic).toBe('كُشَرِي');
  });
});
