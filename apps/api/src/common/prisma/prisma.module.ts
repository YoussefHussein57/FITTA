import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Database access is cross-cutting, so the client is provided once and exported
 * globally rather than re-imported by every feature module.
 *
 * Note what this module is *not*: a generic repository layer. Prisma already is
 * the data-access abstraction (docs/DECISIONS.md ADR-004). A repository class is
 * introduced only where one earns its keep — raw SQL for Arabic search in
 * Phase 04 being the first real case.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
