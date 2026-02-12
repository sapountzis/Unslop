import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { logger } from '../lib/logger';
import { loadRuntimeConfig } from '../config/runtime';

async function main() {
  logger.info('db_migration_start');

  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const runtime = loadRuntimeConfig();

  const client = new Client({ connectionString: runtime.db.url });
  await client.connect();

  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: './drizzle' });

  await client.end();
  logger.info('db_migration_complete');
  process.exit(0);
}

main().catch((error) => {
  logger.error('db_migration_failed', error);
  process.exit(1);
});
