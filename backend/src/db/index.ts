// Database connection for Unslop backend
// Supports both local PostgreSQL (via postgres.js) and Neon (via serverless driver)

import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Detect if we're connecting to Neon (production) or local PostgreSQL (development)
// Neon URLs contain "neon.tech" or start with postgres:// on their infrastructure
const isNeonDatabase = DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('neon.com');

function createDb() {
  if (isNeonDatabase) {
    // Production: Use Neon serverless driver (HTTP-based)
    console.log('📡 Connecting to Neon PostgreSQL (serverless mode)');
    return drizzleNeon(DATABASE_URL!);
  } else {
    // Development: Use postgres.js for standard PostgreSQL connection
    console.log('🐘 Connecting to local PostgreSQL (standard mode)');
    return drizzlePostgres(DATABASE_URL!);
  }
}

export const db = createDb();
