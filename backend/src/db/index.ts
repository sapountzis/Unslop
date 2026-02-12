import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from './schema';
import { logger } from '../lib/logger';
import type { AppLogger } from '../lib/logger-types';

interface DbFactoryOptions {
  client: Client;
  logger?: Pick<AppLogger, 'info'>;
}

export function createDb(options: DbFactoryOptions) {
  const dbLogger = options.logger ?? logger;
  dbLogger.info('db_connect', { provider: 'node-postgres' });
  return drizzle({ client: options.client, schema });
}

export type Database = ReturnType<typeof createDb>;
