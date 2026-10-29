import { z } from 'zod';

/**
 * Liveness: is this process running?
 *
 * Deliberately checks no dependency. A liveness probe that fails when the
 * database is down tells an orchestrator to restart the process, which does
 * nothing to fix the database and takes the API offline for callers that do not
 * need it. Liveness answers one question: should I be killed and replaced?
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSec: z.number().nonnegative(),
  version: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * One dependency check. Carries no hostnames, driver messages, or error text —
 * `/ready` is unauthenticated, so it reports only what an operator needs
 * (docs/SECURITY.md §4).
 */
export const readinessCheckSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().nonnegative(),
});

/**
 * Readiness: can this process serve traffic right now?
 *
 * Served with HTTP 503 when `status` is `degraded`. The status code is the part
 * load balancers and orchestrators actually read; a 200 carrying
 * `{"status":"degraded"}` keeps traffic flowing to an instance that cannot serve it.
 */
export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.object({
    database: readinessCheckSchema,
  }),
});

export type ReadinessCheck = z.infer<typeof readinessCheckSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
