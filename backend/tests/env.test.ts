import { describe, it, expect } from 'bun:test';

describe('Test environment', () => {
  it('loads required environment variables from .env', () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
  });
});
