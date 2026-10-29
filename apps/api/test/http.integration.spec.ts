import 'reflect-metadata';
import { type Server } from 'node:http';

import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { errorEnvelopeSchema, healthResponseSchema } from '@fitta/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { type Env } from '../src/config/env';
import { TEST_DATABASE_URL } from './test-database';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: TEST_DATABASE_URL,
  WEB_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'warn',
};

let app: INestApplication;

/**
 * `getHttpServer()` is typed `any`, which would spread through every assertion
 * in this file. Narrowing it once here keeps the tests type-checked rather than
 * silently unverified.
 */
const server = (): Server => app.getHttpServer() as Server;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env)],
  }).compile();

  app = moduleRef.createNestApplication({ bodyParser: false });

  // The same function main.ts calls. Tests that build their own pipeline only
  // prove the test's configuration works.
  configureApp(app, env);

  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/health', () => {
  it('returns 200 with a contract-valid body', async () => {
    const response = await request(server()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it('carries the security headers from docs/SECURITY.md §4', async () => {
    const response = await request(server()).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('assigns a correlation id to every response', async () => {
    const response = await request(server()).get('/api/v1/health');

    expect(response.headers['x-request-id']).toBeTruthy();
  });
});

describe('CORS', () => {
  it('allows the configured origin', async () => {
    const response = await request(server()).get('/api/v1/health').set('Origin', env.WEB_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(env.WEB_ORIGIN);
  });

  it('does not reflect an unlisted origin', async () => {
    // Reflecting the request's Origin is the failure mode where CORS looks
    // configured and permits everything.
    const response = await request(server())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('error envelope', () => {
  it('returns the standard envelope for an unknown route', async () => {
    const response = await request(server()).get('/api/v1/definitely-not-a-route');

    expect(response.status).toBe(404);

    // Parsing rather than casting: this asserts contract conformance and gives
    // the assertions below real types in one step.
    const envelope = errorEnvelopeSchema.parse(response.body);
    expect(envelope.error.code).toBe('NOT_FOUND');
    expect(envelope.error.requestId).toBeTruthy();
  });

  /**
   * Regression guard for two Slice 3 defects found by hand:
   *
   *  1. `NestFactory` installed its own 100 kB body parser, so the configured
   *     256 kB limit was never in effect.
   *  2. The oversized request was rejected before the request-id middleware ran,
   *     producing `requestId: "unknown"` — on exactly the request someone would
   *     later need to find in the logs.
   */
  it('rejects an oversized body as 413 with a real correlation id', async () => {
    const oversized = { payload: 'a'.repeat(1_000_000) };

    const response = await request(server())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(oversized);

    expect(response.status).toBe(413);

    const envelope = errorEnvelopeSchema.parse(response.body);
    expect(envelope.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(envelope.error.requestId).toBeTruthy();
    expect(envelope.error.requestId).not.toBe('unknown');
  });

  it('accepts a body under the limit — the cap is 256 kB, not Nest default 100 kB', async () => {
    // Under Nest's default this would be a 413. Reaching the router (404, since
    // there is no POST /health) proves the configured limit is the live one.
    const underLimit = { payload: 'a'.repeat(200_000) };

    const response = await request(server())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(underLimit);

    expect(response.status).toBe(404);
  });

  it('never exposes a stack trace to the client', async () => {
    const response = await request(server()).get('/api/v1/definitely-not-a-route');

    const envelope = errorEnvelopeSchema.parse(response.body);
    expect(JSON.stringify(envelope)).not.toContain('at ');
    expect(envelope.error).not.toHaveProperty('stack');
  });
});
