import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { logger } from '../lib/logger';
import type { AppLogger } from '../lib/logger-types';

interface DbFactoryOptions {
  url: string;
  logger?: Pick<AppLogger, 'info'>;
}

export function createDb(options: DbFactoryOptions) {
  const dbLogger = options.logger ?? logger;
  dbLogger.info('db_connect', { provider: 'postgres-js' });
  return drizzle(options.url, { schema });
}

export type Database = ReturnType<typeof createDb>;
