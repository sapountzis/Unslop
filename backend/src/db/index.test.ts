import { describe, expect, it, mock } from 'bun:test';
import { createDb } from './index';

describe('db driver selection', () => {
  it('uses explicit postgres driver', () => {
    const neonFactory = mock(() => ({ provider: 'neon' }));
    const postgresFactory = mock(() => ({ provider: 'postgres' }));

    const db = createDb({
      url: 'postgresql://local',
      driver: 'postgres',
      logger: { info: mock(() => undefined) },
      factories: {
        neon: neonFactory,
        postgres: postgresFactory,
      },
    });

    expect(db).toEqual({ provider: 'postgres' });
    expect(postgresFactory).toHaveBeenCalledTimes(1);
    expect(neonFactory).toHaveBeenCalledTimes(0);
  });

  it('uses explicit neon driver', () => {
    const neonFactory = mock(() => ({ provider: 'neon' }));
    const postgresFactory = mock(() => ({ provider: 'postgres' }));

    const db = createDb({
      url: 'postgresql://local',
      driver: 'neon',
      logger: { info: mock(() => undefined) },
      factories: {
        neon: neonFactory,
        postgres: postgresFactory,
      },
    });

    expect(db).toEqual({ provider: 'neon' });
    expect(neonFactory).toHaveBeenCalledTimes(1);
    expect(postgresFactory).toHaveBeenCalledTimes(0);
  });
});
