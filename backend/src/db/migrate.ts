// Migration runner for Unslop backend
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { logger } from '../lib/logger';

const DATABASE_URL = process.env.DATABASE_URL!;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const isNeon = DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('neon.com');

async function main() {
  logger.info('db_migration_start');

  if (isNeon) {
    const { migrate } = await import('drizzle-orm/neon-http/migrator');
    const db = drizzleNeon(DATABASE_URL);
    await migrate(db, { migrationsFolder: './drizzle' });
  } else {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const db = drizzlePostgres(DATABASE_URL);
    await migrate(db, { migrationsFolder: './drizzle' });
  }

  logger.info('db_migration_complete');
  process.exit(0);
}

main().catch((err) => {
  logger.error('db_migration_failed', err);
  process.exit(1);
});
