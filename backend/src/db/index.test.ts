import { describe, expect, it, mock } from 'bun:test';
import { createDb } from './index';

describe('db factory', () => {
  it('creates a postgres connection and logs provider', () => {
    const infoSpy = mock((_event: string, _ctx?: Record<string, unknown>) => undefined);

    const db = createDb({
      url: 'postgresql://user:pw@localhost:5432/db',
      logger: { info: infoSpy },
    });

    expect(db).toBeDefined();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0]?.[0]).toBe('db_connect');
  });
});

