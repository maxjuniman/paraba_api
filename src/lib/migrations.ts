import type { Pool, PoolClient } from 'pg';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  celular TEXT,
  password_hash TEXT NOT NULL,
  tipo INTEGER NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  aluno_id TEXT,
  foto TEXT,
  faixa_atual TEXT,
  graus INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alunos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  apelido TEXT,
  foto TEXT,
  email_responsavel TEXT,
  nome_responsavel TEXT,
  celular TEXT,
  data_nascimento TEXT,
  data_pagamento TEXT,
  pagamento_pago BOOLEAN,
  pagamento_referencia TEXT,
  pagamentos_pagos JSONB DEFAULT '[]'::jsonb,
  faixa_atual TEXT,
  graus INTEGER DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  url TEXT NOT NULL,
  aluno_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS depoimentos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  texto TEXT NOT NULL,
  faixa TEXT,
  foto TEXT,
  user_id TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presencas (
  id TEXT PRIMARY KEY,
  aluno_id TEXT NOT NULL,
  data TEXT NOT NULL,
  aula_id TEXT,
  presente BOOLEAN NOT NULL DEFAULT FALSE,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS tipos_aula (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aulas_calendario (
  id TEXT PRIMARY KEY,
  tipo_aula_id TEXT NOT NULL,
  tipo_aula_nome TEXT NOT NULL,
  dias_semana JSONB NOT NULL DEFAULT '[]'::jsonb,
  hora TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'all',
  categorias JSONB NOT NULL DEFAULT '["kids","juvenil","adulto"]'::jsonb,
  recorrencia TEXT NOT NULL DEFAULT 'recorrente',
  data_unica TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS celular TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tipo INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS aluno_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS foto TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS faixa_atual TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS graus INTEGER NOT NULL DEFAULT 0;

ALTER TABLE alunos ADD COLUMN IF NOT EXISTS apelido TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS foto TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS email_responsavel TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS nome_responsavel TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS celular TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS data_nascimento TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS data_pagamento TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pagamento_pago BOOLEAN;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pagamento_referencia TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pagamentos_pagos JSONB DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'alunos'
      AND column_name = 'data_nascimento'
      AND data_type IN ('date', 'timestamp without time zone', 'timestamp with time zone')
  ) THEN
    ALTER TABLE alunos
      ALTER COLUMN data_nascimento TYPE TEXT
      USING to_char(data_nascimento::timestamp, 'YYYY-MM-DD');
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'alunos'
      AND column_name = 'data_nascimento'
      AND data_type = 'text'
  ) THEN
    UPDATE alunos
    SET data_nascimento = LEFT(data_nascimento, 10)
    WHERE data_nascimento ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'alunos'
      AND column_name = 'data_pagamento'
      AND data_type IN ('date', 'timestamp without time zone', 'timestamp with time zone')
  ) THEN
    ALTER TABLE alunos
      ALTER COLUMN data_pagamento TYPE TEXT
      USING EXTRACT(DAY FROM data_pagamento)::integer::text;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'alunos'
      AND column_name = 'data_pagamento'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE alunos
      ALTER COLUMN data_pagamento TYPE TEXT
      USING TRIM(data_pagamento::text);
  END IF;
END $$;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS faixa_atual TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS graus INTEGER DEFAULT 0;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  ALTER TABLE alunos ALTER COLUMN foto TYPE TEXT;
EXCEPTION
  WHEN others THEN NULL;
END $$;

ALTER TABLE videos ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS aluno_id TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS texto TEXT;
ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS faixa TEXT;
ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS foto TEXT;
ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0;
ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE presencas ADD COLUMN IF NOT EXISTS presente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE presencas ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE presencas ADD COLUMN IF NOT EXISTS marked_by_user_id TEXT;
ALTER TABLE presencas ADD COLUMN IF NOT EXISTS aula_id TEXT;

ALTER TABLE tipos_aula ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE aulas_calendario ADD COLUMN IF NOT EXISTS tipo_aula_id TEXT;
ALTER TABLE aulas_calendario ADD COLUMN IF NOT EXISTS tipo_aula_nome TEXT;
ALTER TABLE aulas_calendario ADD COLUMN IF NOT EXISTS dias_semana JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE aulas_calendario ADD COLUMN IF NOT EXISTS hora TEXT;
ALTER TABLE aulas_calendario ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'all';
ALTER TABLE aulas_calendario ADD COLUMN IF NOT EXISTS categorias JSONB;
ALTER TABLE aulas_calendario ADD COLUMN IF NOT EXISTS recorrencia TEXT NOT NULL DEFAULT 'recorrente';
ALTER TABLE aulas_calendario ADD COLUMN IF NOT EXISTS data_unica TEXT;
ALTER TABLE aulas_calendario ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE aulas_calendario
SET categorias = CASE
  WHEN categoria IS NULL OR categoria = 'all' THEN '["kids","juvenil","adulto"]'::jsonb
  ELSE jsonb_build_array(categoria)
END
WHERE categorias IS NULL;

DELETE FROM tipos_aula WHERE id = 'aula-avulsa' OR lower(trim(nome)) = 'aula avulsa';

UPDATE users
SET ativo = TRUE
WHERE tipo = 1 AND ativo IS DISTINCT FROM TRUE;

ALTER TABLE alunos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

-- Permite 1 usuario vinculado a ate 2 alunos (remove UNIQUE legado em user_id).
ALTER TABLE alunos DROP CONSTRAINT IF EXISTS alunos_user_id_key;
DROP INDEX IF EXISTS alunos_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (email);
CREATE INDEX IF NOT EXISTS alunos_user_id_idx ON alunos (user_id);
CREATE INDEX IF NOT EXISTS presencas_aluno_id_idx ON presencas (aluno_id);
CREATE INDEX IF NOT EXISTS presencas_data_idx ON presencas (data);
CREATE INDEX IF NOT EXISTS presencas_aula_id_idx ON presencas (aula_id);
CREATE UNIQUE INDEX IF NOT EXISTS presencas_aluno_data_aula_unique_idx
  ON presencas (aluno_id, data, aula_id)
  WHERE aula_id IS NOT NULL;
`;

export async function runMigrations(pool: Pool | PoolClient): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
