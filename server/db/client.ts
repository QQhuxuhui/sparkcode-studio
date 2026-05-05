import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '../env.js';
import * as schema from './schema.js';

// Single shared connection pool. Suspended-on-import so import scripts that
// only need OSS don't open a DB connection.
const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });
export const closeDb = () => sql.end({ timeout: 5 });
