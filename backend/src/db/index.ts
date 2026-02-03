// Database connection for Unslop backend
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL;

// Only throw error if not in test mode
if (!DATABASE_URL && !process.env.TEST_MODE) {
  throw new Error('DATABASE_URL environment variable is required');
}

// In test mode, export a placeholder db that will be mocked by tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = DATABASE_URL
  ? drizzle(neon(DATABASE_URL), { schema })
  : null;
