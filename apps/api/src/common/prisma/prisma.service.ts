import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client as an injectable provider.
 *
 * **This service deliberately does not call `$connect()` on startup.**
 *
 * Eager connection is the common pattern and it is wrong here: if PostgreSQL is
 * unreachable at boot, `$connect()` rejects, Nest aborts, and the process dies.
 * A dead process cannot report that it is unhealthy — `/ready` would return a
 * connection-refused error from the operator's probe rather than a 503 with a
 * reason, and `/health` could not say "the process is fine, its database is not".
 *
 * Prisma opens connections lazily on first query, so the readiness probe's
 * `SELECT 1` *is* the connectivity test. That is what makes acceptance case 7
 * ("readiness fails when PostgreSQL is inaccessible") observable at all.
 *
 * Disconnection on shutdown is still explicit: leaking a pool across a restart
 * exhausts PostgreSQL's connection slots.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
