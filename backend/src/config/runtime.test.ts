import { describe, expect, it } from 'bun:test';

process.env.VLM_MODEL ??= 'test-vlm-model';

const { loadRuntimeConfig } = await import('./runtime');

function baseEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    DATABASE_URL: 'postgresql://user:pw@localhost:5432/db',
    APP_URL: 'http://localhost:3000',
    JWT_SECRET: 'jwt-secret',
    MAGIC_LINK_BASE_URL: 'http://localhost:3000/v1/auth/callback',
    LLM_API_KEY: 'llm-key',
    LLM_MODEL: 'model-1',
    VLM_MODEL: 'vlm-1',
    POLAR_API_KEY: 'polar-key',
    POLAR_WEBHOOK_SECRET: 'whsec',
    POLAR_PRODUCT_ID: 'product-id',
    ...overrides,
  };
}

describe('runtime config', () => {
  it('enforces required env vars', () => {
    const env = baseEnv({ APP_URL: undefined });

    expect(() => loadRuntimeConfig(env, { allowMissingSecrets: false })).toThrow(
      'Missing required environment variable: APP_URL',
    );
  });

  it('allows missing DATABASE_URL for Hyperdrive', () => {
    const env = baseEnv({ DATABASE_URL: undefined });

    // Should not throw - DATABASE_URL is optional for Hyperdrive
    const config = loadRuntimeConfig(env, { allowMissingSecrets: false });
    expect(config.db.url).toBe('');
  });

  it('parses numeric values with defaults', () => {
    const config = loadRuntimeConfig(baseEnv({ PORT: undefined, FREE_MONTHLY_LLM_CALLS: undefined }));

    expect(config.server.port).toBe(3000);
    expect(config.quotas.freeMonthlyLlmCalls).toBe(300);
    expect(config.llm.textModel).toBe('model-1');
    expect(config.llm.vlmModel).toBe('vlm-1');
  });

  it('does not expose duplicated llm.batchConcurrency runtime surface', () => {
    const config = loadRuntimeConfig(baseEnv({ BATCH_LLM_CONCURRENCY: '8' }));

    expect('batchConcurrency' in config.llm).toBe(false);
    expect(config.classification.batchConcurrency).toBe(8);
  });

  it('does not expose POST_CACHE_TTL_DAYS in runtime config surface', () => {
    const config = loadRuntimeConfig(baseEnv({ POST_CACHE_TTL_DAYS: '999' }));

    expect('postCacheTtlDays' in config.llm).toBe(false);
    expect('postCacheTtlDays' in config.classification).toBe(false);
  });

  it('fails fast for invalid numeric values', () => {
    const env = baseEnv({ BATCH_LLM_CONCURRENCY: 'abc' });

    expect(() => loadRuntimeConfig(env)).toThrow('Invalid integer env var BATCH_LLM_CONCURRENCY');
  });

  it('requires both LLM_MODEL and VLM_MODEL with no cross-fallback', () => {
    expect(() =>
      loadRuntimeConfig(baseEnv({ VLM_MODEL: undefined }), { allowMissingSecrets: false }),
    ).toThrow('Missing required environment variable: VLM_MODEL');

    expect(() =>
      loadRuntimeConfig(baseEnv({ LLM_MODEL: undefined }), { allowMissingSecrets: false }),
    ).toThrow('Missing required environment variable: LLM_MODEL');
  });


  it('allows missing secrets in test mode', () => {
    const config = loadRuntimeConfig(
      baseEnv({
        TEST_MODE: 'true',
        POLAR_API_KEY: undefined,
        POLAR_WEBHOOK_SECRET: undefined,
        LLM_API_KEY: undefined,
        LLM_MODEL: undefined,
        VLM_MODEL: undefined,
        JWT_SECRET: undefined,
      }),
    );

    expect(config.testMode).toBe(true);
    expect(config.billing.polarApiKey).toBe('');
    expect(config.llm.apiKey).toBe('');
    expect(config.llm.textModel).toBe('');
    expect(config.llm.vlmModel).toBe('');
    expect(config.auth.jwtSecret).toBe('');
  });
});
