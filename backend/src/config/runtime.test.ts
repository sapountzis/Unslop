import { describe, expect, it } from 'bun:test';
import { loadRuntimeConfig } from './runtime';

function baseEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    DATABASE_URL: 'postgresql://user:pw@localhost:5432/db',
    APP_URL: 'http://localhost:3000',
    JWT_SECRET: 'jwt-secret',
    MAGIC_LINK_BASE_URL: 'http://localhost:3000/v1/auth/callback',
    LLM_API_KEY: 'llm-key',
    LLM_MODEL: 'model-1',
    POLAR_API_KEY: 'polar-key',
    POLAR_WEBHOOK_SECRET: 'whsec',
    POLAR_PRODUCT_ID: 'product-id',
    ...overrides,
  };
}

describe('runtime config', () => {
  it('enforces required env vars', () => {
    const env = baseEnv({ DATABASE_URL: undefined });

    expect(() => loadRuntimeConfig(env, { allowMissingSecrets: false })).toThrow(
      'Missing required environment variable: DATABASE_URL',
    );
  });

  it('parses numeric values with defaults', () => {
    const config = loadRuntimeConfig(baseEnv({ PORT: undefined, FREE_MONTHLY_LLM_CALLS: undefined }));

    expect(config.server.port).toBe(3000);
    expect(config.quotas.freeMonthlyLlmCalls).toBe(300);
  });

  it('fails fast for invalid numeric values', () => {
    const env = baseEnv({ BATCH_LLM_CONCURRENCY: 'abc' });

    expect(() => loadRuntimeConfig(env)).toThrow('Invalid integer env var BATCH_LLM_CONCURRENCY');
  });

  it('supports explicit DB_DRIVER values and defaults when omitted', () => {
    const postgresConfig = loadRuntimeConfig(baseEnv({ DB_DRIVER: 'postgres' }));
    expect(postgresConfig.db.driver).toBe('postgres');

    const neonConfig = loadRuntimeConfig(baseEnv({ DB_DRIVER: 'neon' }));
    expect(neonConfig.db.driver).toBe('neon');

    const inferredNeon = loadRuntimeConfig(
      baseEnv({ DATABASE_URL: 'postgresql://x:y@ep-test.neon.tech/db', DB_DRIVER: undefined }),
    );
    expect(inferredNeon.db.driver).toBe('neon');
  });

  it('allows missing secrets in test mode', () => {
    const config = loadRuntimeConfig(
      baseEnv({
        TEST_MODE: 'true',
        POLAR_API_KEY: undefined,
        POLAR_WEBHOOK_SECRET: undefined,
        LLM_API_KEY: undefined,
        LLM_MODEL: undefined,
        JWT_SECRET: undefined,
      }),
    );

    expect(config.testMode).toBe(true);
    expect(config.billing.polarApiKey).toBe('');
    expect(config.llm.apiKey).toBe('');
    expect(config.auth.jwtSecret).toBe('');
  });
});
