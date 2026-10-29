import { describe, expect, it } from 'vitest';

import { errorEnvelopeSchema } from '../common/error';
import { healthResponseSchema, readinessResponseSchema } from './health';

/**
 * These schemas are the contract between `apps/api` and `apps/web`. They are
 * tested here — not in either app — because the point is that one definition
 * governs both. A schema that silently accepts a malformed payload turns a
 * backend bug into a rendering bug somewhere far away.
 */
describe('healthResponseSchema', () => {
  it('accepts a well-formed liveness response', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'ok', uptimeSec: 12, version: '0.0.0' }).success,
    ).toBe(true);
  });

  it('rejects a status other than "ok"', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'degraded', uptimeSec: 1, version: '1' }).success,
    ).toBe(false);
  });

  it('rejects a negative uptime', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'ok', uptimeSec: -1, version: '1' }).success,
    ).toBe(false);
  });
});

describe('readinessResponseSchema', () => {
  it('accepts a ready response', () => {
    expect(
      readinessResponseSchema.safeParse({
        status: 'ready',
        checks: { database: { ok: true, latencyMs: 3 } },
      }).success,
    ).toBe(true);
  });

  it('accepts a degraded response — a 503 still carries a valid body', () => {
    expect(
      readinessResponseSchema.safeParse({
        status: 'degraded',
        checks: { database: { ok: false, latencyMs: 2006 } },
      }).success,
    ).toBe(true);
  });

  it('rejects a response missing the database check', () => {
    expect(readinessResponseSchema.safeParse({ status: 'ready', checks: {} }).success).toBe(false);
  });

  it('rejects a non-boolean ok flag rather than coercing it', () => {
    // Coercion here would turn the string "false" into `true`, and the page
    // would report a dead database as healthy.
    expect(
      readinessResponseSchema.safeParse({
        status: 'degraded',
        checks: { database: { ok: 'false', latencyMs: 1 } },
      }).success,
    ).toBe(false);
  });
});

describe('errorEnvelopeSchema', () => {
  it('requires a code, message, and requestId', () => {
    expect(
      errorEnvelopeSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'abc' },
      }).success,
    ).toBe(true);
  });

  it('rejects an envelope without a requestId', () => {
    // Without it, "something broke, here is the id" stops being a supportable
    // answer (docs/API_CONTRACTS.md §1).
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Not found' } }).success,
    ).toBe(false);
  });
});
