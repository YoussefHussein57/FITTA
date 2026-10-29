import { type DynamicModule, Global, Module } from '@nestjs/common';

import { type Env } from './env';

/** DI token for validated configuration. */
export const ENV = Symbol('FITTA_ENV');

/**
 * Supplies the already-validated {@link Env} to the injector.
 *
 * Validation happens in `main.ts` *before* the Nest application is created, not
 * in a provider factory here. If it ran inside DI, a missing DATABASE_URL would
 * surface as a dependency-resolution error wrapped in Nest's startup output —
 * technically a failure, but not the clear one acceptance case 6 asks for.
 *
 * Global because configuration is genuinely cross-cutting; this is one of the few
 * places where `@Global()` is the right call rather than a shortcut around
 * thinking about module boundaries.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
