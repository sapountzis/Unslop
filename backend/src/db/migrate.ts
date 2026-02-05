import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { logger } from '../lib/logger';
import { runtime } from '../config/runtime';

async function main() {
  logger.info('db_migration_start', { driver: runtime.db.driver });

  if (runtime.db.driver === 'neon') {
    const { migrate } = await import('drizzle-orm/neon-http/migrator');
    const db = drizzleNeon(runtime.db.url);
    await migrate(db, { migrationsFolder: './drizzle' });
  } else {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const db = drizzlePostgres(runtime.db.url);
    await migrate(db, { migrationsFolder: './drizzle' });
  }

  logger.info('db_migration_complete');
  process.exit(0);
}

main().catch((error) => {
  logger.error('db_migration_failed', error);
  process.exit(1);
});
