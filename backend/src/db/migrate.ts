import { drizzle } from 'drizzle-orm/postgres-js';
import { logger } from '../lib/logger';
import { loadRuntimeConfig } from '../config/runtime';

async function main() {
  logger.info('db_migration_start');

  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const runtime = loadRuntimeConfig();
  const db = drizzle(runtime.db.url);
  await migrate(db, { migrationsFolder: './drizzle' });

  logger.info('db_migration_complete');
  process.exit(0);
}

main().catch((error) => {
  logger.error('db_migration_failed', error);
  process.exit(1);
});
