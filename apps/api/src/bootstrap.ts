import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { type Env } from './config/env';

/** Max JSON body size (docs/PRD.md NFR-16). */
export const BODY_LIMIT = '256kb';

/** Route prefix for every endpoint (docs/API_CONTRACTS.md §1). */
export const GLOBAL_PREFIX = 'api/v1';

/**
 * Applies the full middleware, pipe, and filter pipeline.
 *
 * Extracted from `main.ts` so that **tests exercise the same application the
 * server runs.** A test that builds its own Nest app with its own middleware
 * proves only that the test's configuration works; the first production-only
 * setting to go wrong — a body limit, a security header, a validation flag —
 * would pass every test and fail in the wild.
 *
 * Order is load-bearing and is asserted by the integration tests:
 *
 *  1. request id — before anything that can reject a request
 *  2. helmet     — security headers on every response, including errors
 *  3. CORS       — explicit allowlist
 *  4. body parse — the single parser, with the single limit
 *  5. validation — whitelist + forbidNonWhitelisted
 *  6. filter     — one error envelope for everything
 */
export function configureApp(app: INestApplication, env: Env): void {
  // FIRST in the chain, before any parser. A request rejected for an oversized
  // body must still carry a correlation id.
  app.use(requestIdMiddleware());

  app.use(
    helmet({
      // helmet defaults to SAMEORIGIN; docs/SECURITY.md §4 specifies DENY. The
      // API serves JSON and is never legitimately framed.
      frameguard: { action: 'deny' },
    }),
  );

  // Explicit allowlist. Never reflect the request's Origin header back — that
  // turns CORS into a no-op while looking configured (docs/SECURITY.md §4).
  app.enableCors({
    origin: [env.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

  app.useGlobalPipes(
    new ValidationPipe({
      // Strips properties with no decorator...
      whitelist: true,
      // ...and rejects the request if any were present. This is what makes a
      // stray `userId` in a request body a 400 rather than a silent ignore —
      // a mass-assignment defence, not just tidiness (docs/SECURITY.md §4).
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableShutdownHooks();
}

export function logStartup(env: Env): void {
  const logger = new Logger('Bootstrap');
  logger.log(`FITTA API listening on port ${String(env.PORT)} (${env.NODE_ENV})`);
  logger.log(`Liveness  GET /${GLOBAL_PREFIX}/health`);
  logger.log(`Readiness GET /${GLOBAL_PREFIX}/ready`);
}
