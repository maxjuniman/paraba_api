import { createPgPool } from '../lib/pgPool.js';
import { runMigrations } from '../lib/migrations.js';

async function migrate() {
  const pool = createPgPool();

  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('Falha ao rodar migrations:', error);
  process.exit(1);
});
