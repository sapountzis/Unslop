// Database connection for Unslop backend
// Supports both local PostgreSQL (via postgres.js) and Neon (via serverless driver)

import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { logger } from '../lib/logger';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Detect if we're connecting to Neon (production) or local PostgreSQL (development)
// Neon URLs contain "neon.tech" or start with postgres:// on their infrastructure
const isNeonDatabase = DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('neon.com');

function createDb() {
  if (isNeonDatabase) {
    logger.info('db_connect', { provider: 'neon-http', mode: 'serverless' });
    return drizzleNeon(DATABASE_URL!, { schema });
  } else {
    logger.info('db_connect', { provider: 'postgres-js', mode: 'standard' });
    return drizzlePostgres(DATABASE_URL!, { schema });
  }
}

export const db = createDb();
