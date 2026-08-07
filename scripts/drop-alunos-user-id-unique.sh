#!/usr/bin/env bash
set -euo pipefail
cd /opt/paraba-api
set -a
# shellcheck disable=SC1091
. ./.env
set +a

node <<'NODE'
const fs = require('fs');
const { Pool } = require('pg');

function loadEnv() {
  const raw = fs.readFileSync('/opt/paraba-api/.env', 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const sql = `
ALTER TABLE alunos DROP CONSTRAINT IF EXISTS alunos_user_id_key;
DROP INDEX IF EXISTS alunos_user_id_key;
CREATE INDEX IF NOT EXISTS alunos_user_id_idx ON alunos (user_id);
`;

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql);
    console.log('Constraint alunos_user_id_key removida com sucesso.');
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
