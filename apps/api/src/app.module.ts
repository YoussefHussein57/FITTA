import { type DynamicModule, Module } from '@nestjs/common';

import { PrismaModule } from './common/prisma/prisma.module';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env';
import { HealthModule } from './modules/health/health.module';

/**
 * Application root.
 *
 * `register(env)` takes configuration that `main.ts` has already validated, so
 * this module never reads `process.env` itself. That keeps the whole tree
 * testable: a test supplies its own `Env` object and needs no global state.
 *
 * Request-id assignment is deliberately *not* configured here. It must run
 * before the body parser, and module middleware registers after the `app.use`
 * calls in `main.ts` — see request-id.middleware.ts.
 *
 * Feature modules are added here as phases land — see docs/PHASE_STATUS.md §2.
 */
@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(env), PrismaModule, HealthModule],
    };
  }
}
