import { Pool } from 'pg';
import { env } from '../config/env.js';
import { runMigrations } from '../lib/migrations.js';

async function migrate() {
  const pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    console.log('Rodando migrations no PostgreSQL...');
    await runMigrations(pool);
    console.log('Migrations concluidas com sucesso.');
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('Falha ao rodar migrations:', error);
  process.exit(1);
});
