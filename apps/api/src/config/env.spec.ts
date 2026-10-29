import { describe, expect, it } from 'vitest';

import { EnvValidationError, loadEnv } from './env';

const VALID: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '3002',
  DATABASE_URL: 'postgresql://fitta:secret@localhost:5435/fitta_test?schema=public',
  WEB_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'warn',
};

describe('loadEnv', () => {
  it('accepts a valid environment and coerces PORT to a number', () => {
    const env = loadEnv(VALID);

    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(3002);
    expect(typeof env.PORT).toBe('number');
  });

  it('applies the documented defaults when optional keys are absent', () => {
    const env = loadEnv({ DATABASE_URL: VALID.DATABASE_URL });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('refuses to start without DATABASE_URL — no silent localhost fallback', () => {
    // The whole point of fail-fast config: a server that quietly starts against
    // the wrong database is worse than one that refuses to start at all.
    expect(() => loadEnv({})).toThrow(EnvValidationError);
  });

  it('rejects a connection string that is not PostgreSQL', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'mysql://user@localhost/db' })).toThrow(
      EnvValidationError,
    );
  });

  it('rejects a WEB_ORIGIN that is not an http(s) origin', () => {
    expect(() => loadEnv({ ...VALID, WEB_ORIGIN: 'localhost:3000' })).toThrow(EnvValidationError);
  });

  it('reports every invalid key at once, not just the first', () => {
    // Fixing configuration one restart at a time is miserable, and the extra
    // information costs nothing.
    try {
      loadEnv({ NODE_ENV: 'staging', PORT: 'not-a-number', DATABASE_URL: 'mysql://nope' });
      expect.unreachable('loadEnv should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const invalidKeys = (error as EnvValidationError).invalidKeys;

      expect(invalidKeys).toContain('NODE_ENV');
      expect(invalidKeys).toContain('PORT');
      expect(invalidKeys).toContain('DATABASE_URL');
    }
  });

  /**
   * docs/SECURITY.md §6: connection strings carry passwords, and an error
   * message is a log line. The report names the key and the reason; never the
   * value.
   */
  it('never leaks the offending value into the error message', () => {
    const secretBearingUrl = 'mysql://admin:sup3r-s3cret-password@db.internal:3306/prod';

    try {
      loadEnv({ ...VALID, DATABASE_URL: secretBearingUrl });
      expect.unreachable('loadEnv should have thrown');
    } catch (error) {
      const message = (error as EnvValidationError).message;

      expect(message).toContain('DATABASE_URL');
      expect(message).not.toContain('sup3r-s3cret-password');
      expect(message).not.toContain(secretBearingUrl);
      expect(message).not.toContain('db.internal');
    }
  });

  it('rejects a port outside the valid TCP range', () => {
    expect(() => loadEnv({ ...VALID, PORT: '70000' })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...VALID, PORT: '0' })).toThrow(EnvValidationError);
  });
});
