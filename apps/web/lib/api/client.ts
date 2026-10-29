import { readinessResponseSchema, type ReadinessResponse } from '@fitta/contracts';
import type { ZodType } from 'zod';

/**
 * Typed API client.
 *
 * Responses are parsed through the Zod schemas in `@fitta/contracts`, so a
 * backend that drifts from the contract fails *here*, loudly, instead of
 * rendering `undefined` into the page. Compile-time types alone cannot catch
 * that: `fetch` returns `any` at the network boundary no matter how well the
 * types line up.
 */

/** Never throws for an expected failure — the caller renders both branches. */
export type ApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number | null; reason: string };

/**
 * Resolves the base URL for the current execution context.
 *
 * - **Server** (React Server Components, route handlers): an absolute URL
 *   straight to the API. Routing a server-side fetch through our own rewrite
 *   would mean the Next server making an HTTP call to itself purely to be
 *   forwarded — a wasted round trip.
 * - **Browser**: the relative `/api` path, which `next.config.ts` rewrites. The
 *   client never learns the API's real origin.
 */
function resolveBaseUrl(): string {
  if (typeof window === 'undefined') {
    const serverBase = process.env.API_BASE_URL ?? 'http://localhost:3001';
    return `${serverBase}/api/v1`;
  }
  return '/api';
}

async function requestJson<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const url = `${resolveBaseUrl()}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      // Liveness and readiness are live facts. Caching them would report a state
      // that was true a minute ago, which is worse than reporting nothing.
      cache: 'no-store',
      headers: { accept: 'application/json', ...init?.headers },
    });
  } catch (error) {
    // The API being unreachable is an expected state, not an exception: it is
    // exactly what /status exists to display.
    return {
      ok: false,
      status: null,
      reason: error instanceof Error ? error.message : 'Network request failed',
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, status: response.status, reason: 'Response was not valid JSON' };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: response.status,
      reason: `Response did not match the API contract: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
        .join('; ')}`,
    };
  }

  return { ok: true, status: response.status, data: parsed.data };
}

/**
 * Fetches API readiness.
 *
 * Note that an HTTP 503 is **not** treated as a transport failure: a degraded
 * API still returns a well-formed readiness body, and that body is precisely
 * what we want to show.
 */
export function fetchReadiness(): Promise<ApiResult<ReadinessResponse>> {
  return requestJson('/ready', readinessResponseSchema);
}
