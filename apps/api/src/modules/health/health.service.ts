import { Injectable, Logger } from '@nestjs/common';
import { type HealthResponse, type ReadinessResponse } from '@fitta/contracts';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class HealthService {
  /**
   * A probe that can hang is worse than one that fails: an orchestrator waiting
   * on a response holds the instance in an unknown state instead of replacing it.
   */
  private static readonly DB_TIMEOUT_MS = 2000;

  private readonly logger = new Logger(HealthService.name);
  private readonly startedAt = Date.now();
  private readonly version = process.env.npm_package_version ?? '0.0.0';

  constructor(private readonly prisma: PrismaService) {}

  /** Liveness. Touches no dependency — see the contract schema for why. */
  getLiveness(): HealthResponse {
    return {
      status: 'ok',
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      version: this.version,
    };
  }

  /** Readiness. Genuinely exercises PostgreSQL. */
  async getReadiness(): Promise<ReadinessResponse> {
    const database = await this.checkDatabase();

    return {
      status: database.ok ? 'ready' : 'degraded',
      checks: { database },
    };
  }

  private async checkDatabase(): Promise<ReadinessResponse['checks']['database']> {
    const startedAt = Date.now();

    try {
      // Tagged template — parameterised by construction (docs/SECURITY.md §4).
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`, HealthService.DB_TIMEOUT_MS);
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      // Logged in full here; the response says only `ok: false`. The connection
      // string and driver error are not an unauthenticated caller's business.
      this.logger.warn(
        `Database readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, latencyMs: Date.now() - startedAt };
    }
  }

  private async withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Timed out after ${String(ms)}ms`));
          }, ms);
        }),
      ]);
    } finally {
      // Without this the timer keeps the event loop alive and delays shutdown.
      if (timer) clearTimeout(timer);
    }
  }
}
