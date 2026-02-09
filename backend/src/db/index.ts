import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { logger } from '../lib/logger';
import { runtime, type DbDriver } from '../config/runtime';
import type { AppLogger } from '../lib/logger-types';

interface DbFactoryOptions {
  url: string;
  driver: DbDriver;
  logger?: Pick<AppLogger, 'info'>;
  factories?: {
    neon: (url: string) => unknown;
    postgres: (url: string) => unknown;
  };
}

const defaultFactories = {
  neon: (url: string) => drizzleNeon(url, { schema }),
  postgres: (url: string) => drizzlePostgres(url, { schema }),
};

export function createDb(options: DbFactoryOptions): unknown {
  const dbLogger = options.logger ?? logger;
  const factories = options.factories ?? defaultFactories;

  if (options.driver === 'neon') {
    dbLogger.info('db_connect', { provider: 'neon-http', mode: 'serverless' });
    return factories.neon(options.url);
  }

  dbLogger.info('db_connect', { provider: 'postgres-js', mode: 'standard' });
  return factories.postgres(options.url);
}

export const db = createDb({
  url: runtime.db.url,
  driver: runtime.db.driver,
  logger,
}) as ReturnType<typeof drizzlePostgres<typeof schema>>;

export type Database = typeof db;
