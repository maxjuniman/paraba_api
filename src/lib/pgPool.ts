import { Pool, type PoolConfig } from 'pg';
import { env } from '../config/env.js';

/**
 * Node pode resolver "localhost" para IPv6 (::1). Em muitos servidores
 * o PostgreSQL escuta apenas em 127.0.0.1, causando ECONNREFUSED ::1:5432.
 */
export function normalizeDatabaseUrl(databaseUrl: string): string {
  return databaseUrl
    .replace('://localhost/', '://127.0.0.1/')
    .replace('://localhost:', '://127.0.0.1:')
    .replace('@localhost/', '@127.0.0.1/')
    .replace('@localhost:', '@127.0.0.1:');
}

export function createPgPool(overrides: PoolConfig = {}): Pool {
  return new Pool({
    connectionString: normalizeDatabaseUrl(env.databaseUrl),
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
    ...overrides,
  });
}
