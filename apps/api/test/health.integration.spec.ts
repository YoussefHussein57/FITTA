import { afterAll, describe, expect, it } from 'vitest';
import { readinessResponseSchema } from '@fitta/contracts';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { HealthService } from '../src/modules/health/health.service';
import { TEST_DATABASE_URL, UNREACHABLE_DATABASE_URL } from './test-database';

const reachable = new PrismaService({ datasourceUrl: TEST_DATABASE_URL });
const unreachable = new PrismaService({ datasourceUrl: UNREACHABLE_DATABASE_URL });

afterAll(async () => {
  await reachable.$disconnect();
  await unreachable.$disconnect();
});

describe('HealthService — liveness', () => {
  it('reports ok without touching the database', () => {
    // Constructed against the *unreachable* client on purpose: if liveness ever
    // starts querying, this test fails — which is the point. A liveness probe
    // that depends on the database tells an orchestrator to restart a healthy
    // process because something else is broken.
    const service = new HealthService(unreachable);
    const result = service.getLiveness();

    expect(result.status).toBe('ok');
    expect(result.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(result.version).toBeTruthy();
  });
});

describe('HealthService — readiness', () => {
  it('reports ready when PostgreSQL is reachable', async () => {
    const result = await new HealthService(reachable).getReadiness();

    // Parsed through the shared contract, so a drift between the service and
    // packages/contracts fails here rather than in the browser.
    expect(readinessResponseSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.checks.database.ok).toBe(true);
    expect(result.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  /** Acceptance case 7, automated. */
  it('reports degraded when PostgreSQL is unreachable', async () => {
    const result = await new HealthService(unreachable).getReadiness();

    expect(readinessResponseSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe('degraded');
    expect(result.checks.database.ok).toBe(false);
  });

  it('fails within the probe timeout rather than hanging', async () => {
    // A probe that hangs is worse than one that fails: the orchestrator holds
    // the instance in an unknown state instead of replacing it.
    const startedAt = Date.now();
    await new HealthService(unreachable).getReadiness();

    expect(Date.now() - startedAt).toBeLessThan(5000);
  });
});
