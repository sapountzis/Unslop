import { describe, expect, it, mock } from 'bun:test';
import { createDb } from './index';
import { Client } from 'pg';

describe('db factory', () => {
  it('creates a postgres connection and logs provider', () => {
    const infoSpy = mock((_event: string, _ctx?: Record<string, unknown>) => undefined);

    const client = new Client({ connectionString: 'postgresql://user:pw@localhost:5432/db' });
    const db = createDb({
      client,
      logger: { info: infoSpy },
    });

    expect(db).toBeDefined();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0]?.[0]).toBe('db_connect');
  });
});

