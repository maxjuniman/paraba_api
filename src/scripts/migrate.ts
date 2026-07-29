import { createPgPool } from '../lib/pgPool.js';
import { runMigrations } from '../lib/migrations.js';

async function migrate() {
  const pool = createPgPool();

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
