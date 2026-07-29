import { createPgPool } from './pgPool.js';
import { runMigrations } from './migrations.js';
import type { Aluno, AulaCalendario, Database, Presenca, TipoAula, User, VideoUpdate } from '../types.js';

const pool = createPgPool();
let postgresReady: Promise<void> | null = null;

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value == null) return fallback;
  return Boolean(value);
}

async function ensurePostgres(): Promise<void> {
  postgresReady ??= (async () => {
    await pool.query('SELECT 1');
    await runMigrations(pool);
  })();

  await postgresReady;
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    nome: String(row.nome),
    email: String(row.email),
    celular: (row.celular as string | null | undefined) ?? undefined,
    passwordHash: String(row.password_hash ?? row.passwordHash ?? row.senha ?? ''),
    tipo: Number(row.tipo) as User['tipo'],
    ativo: asBoolean(row.ativo, Number(row.tipo) === 1),
    alunoId: (row.aluno_id as string | null | undefined) ?? null,
    createdAt: asIso(row.created_at),
  };
}

function mapAluno(row: Record<string, unknown>): Aluno {
  return {
    id: String(row.id),
    nome: String(row.nome),
    apelido: (row.apelido as string | null | undefined) ?? null,
    foto: (row.foto as string | null | undefined) ?? null,
    emailResponsavel: (row.email_responsavel as string | null | undefined) ?? undefined,
    celular: (row.celular as string | null | undefined) ?? undefined,
    dataNascimento: (row.data_nascimento as string | null | undefined) ?? undefined,
    dataPagamento: (row.data_pagamento as string | null | undefined) ?? null,
    pagamentoPago: (row.pagamento_pago as boolean | null | undefined) ?? null,
    pagamentoReferencia: (row.pagamento_referencia as string | null | undefined) ?? null,
    pagamentosPagos: (row.pagamentos_pagos as string[] | null | undefined) ?? [],
    faixaAtual: (row.faixa_atual as string | null | undefined) ?? null,
    graus: (row.graus as number | null | undefined) ?? 0,
    userId: (row.user_id as string | null | undefined) ?? null,
    user: null,
    createdAt: asIso(row.created_at),
  };
}

async function readPostgresDatabase(): Promise<Database> {
  await ensurePostgres();

  const [users, alunos, videos, presencas, tiposAula, aulasCalendario] = await Promise.all([
    pool.query('SELECT * FROM users ORDER BY created_at ASC'),
    pool.query('SELECT * FROM alunos ORDER BY created_at ASC'),
    pool.query('SELECT * FROM videos ORDER BY created_at ASC'),
    pool.query('SELECT * FROM presencas ORDER BY data ASC, marked_at ASC'),
    pool.query('SELECT * FROM tipos_aula ORDER BY nome ASC'),
    pool.query('SELECT * FROM aulas_calendario ORDER BY created_at ASC'),
  ]);

  return {
    users: users.rows.map((row) => mapUser(row)),
    alunos: alunos.rows.map((row) => mapAluno(row)),
    videos: videos.rows.map(
      (row): VideoUpdate => ({
        id: row.id,
        titulo: row.titulo,
        descricao: row.descricao ?? undefined,
        url: row.url,
        alunoId: row.aluno_id,
        createdAt: asIso(row.created_at),
      })
    ),
    presencas: presencas.rows.map(
      (row): Presenca => ({
        id: row.id,
        alunoId: row.aluno_id,
        data: row.data,
        presente: row.presente,
        markedAt: asIso(row.marked_at),
        markedByUserId: row.marked_by_user_id,
      })
    ),
    tiposAula: tiposAula.rows.map(
      (row): TipoAula => ({
        id: row.id,
        nome: row.nome,
        createdAt: asIso(row.created_at),
      })
    ),
    aulasCalendario: aulasCalendario.rows.map(
      (row): AulaCalendario => ({
        id: row.id,
        tipoAulaId: row.tipo_aula_id,
        tipoAulaNome: row.tipo_aula_nome,
        diasSemana: row.dias_semana ?? [],
        hora: row.hora,
        categoria: row.categoria,
        createdAt: asIso(row.created_at),
      })
    ),
  };
}

export async function insertAluno(aluno: Aluno): Promise<Aluno> {
  await ensurePostgres();

  const { rows } = await pool.query(
    `INSERT INTO alunos (
      id, nome, apelido, foto, email_responsavel, celular, data_nascimento, data_pagamento,
      pagamento_pago, pagamento_referencia, pagamentos_pagos, faixa_atual, graus, user_id, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
    RETURNING *`,
    [
      aluno.id,
      aluno.nome,
      aluno.apelido ?? null,
      aluno.foto ?? null,
      aluno.emailResponsavel ?? null,
      aluno.celular ?? null,
      aluno.dataNascimento ?? null,
      aluno.dataPagamento ?? null,
      aluno.pagamentoPago ?? false,
      aluno.pagamentoReferencia ?? null,
      JSON.stringify(aluno.pagamentosPagos ?? []),
      aluno.faixaAtual ?? null,
      aluno.graus ?? 0,
      aluno.userId ?? null,
      aluno.createdAt,
    ]
  );

  return mapAluno(rows[0]);
}

export async function updateAluno(aluno: Aluno): Promise<Aluno> {
  await ensurePostgres();

  const { rows } = await pool.query(
    `UPDATE alunos SET
      nome = $2,
      apelido = $3,
      foto = $4,
      email_responsavel = $5,
      celular = $6,
      data_nascimento = $7,
      data_pagamento = $8,
      pagamento_pago = $9,
      pagamento_referencia = $10,
      pagamentos_pagos = $11::jsonb,
      faixa_atual = $12,
      graus = $13,
      user_id = $14
    WHERE id = $1
    RETURNING *`,
    [
      aluno.id,
      aluno.nome,
      aluno.apelido ?? null,
      aluno.foto ?? null,
      aluno.emailResponsavel ?? null,
      aluno.celular ?? null,
      aluno.dataNascimento ?? null,
      aluno.dataPagamento ?? null,
      aluno.pagamentoPago ?? false,
      aluno.pagamentoReferencia ?? null,
      JSON.stringify(aluno.pagamentosPagos ?? []),
      aluno.faixaAtual ?? null,
      aluno.graus ?? 0,
      aluno.userId ?? null,
    ]
  );

  if (!rows[0]) {
    throw new Error('Aluno nao encontrado.');
  }

  return mapAluno(rows[0]);
}

export async function updateUser(user: User): Promise<User> {
  await ensurePostgres();

  const { rows } = await pool.query(
    `UPDATE users SET
      nome = $2,
      email = $3,
      celular = $4,
      password_hash = COALESCE(NULLIF($5, ''), password_hash),
      tipo = $6,
      ativo = $7,
      aluno_id = $8
    WHERE id = $1
    RETURNING *`,
    [
      user.id,
      user.nome,
      user.email,
      user.celular ?? null,
      user.passwordHash || '',
      user.tipo,
      asBoolean(user.ativo, user.tipo === 1),
      user.alunoId ?? null,
    ]
  );

  if (!rows[0]) {
    throw new Error('Usuario nao encontrado.');
  }

  return mapUser(rows[0]);
}

export async function insertUser(user: User): Promise<User> {
  await ensurePostgres();

  if (!user.passwordHash) {
    throw new Error('Usuario sem password_hash.');
  }

  const { rows } = await pool.query(
    `INSERT INTO users (id, nome, email, celular, password_hash, tipo, ativo, aluno_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      user.id,
      user.nome,
      user.email,
      user.celular ?? null,
      user.passwordHash,
      user.tipo,
      asBoolean(user.ativo, user.tipo === 1),
      user.alunoId ?? null,
      user.createdAt,
    ]
  );

  return mapUser(rows[0]);
}

async function upsertPostgresDatabase(database: Database): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const user of database.users) {
      const passwordHash = user.passwordHash?.trim() || null;
      await client.query(
        `INSERT INTO users (id, nome, email, celular, password_hash, tipo, ativo, aluno_id, created_at)
         VALUES (
           $1, $2, $3, $4,
           COALESCE($5, (SELECT password_hash FROM users WHERE id = $1), 'missing-hash'),
           $6, $7, $8, $9
         )
         ON CONFLICT (id) DO UPDATE SET
           nome = EXCLUDED.nome,
           email = EXCLUDED.email,
           celular = EXCLUDED.celular,
           password_hash = COALESCE($5, users.password_hash),
           tipo = EXCLUDED.tipo,
           ativo = EXCLUDED.ativo,
           aluno_id = EXCLUDED.aluno_id`,
        [
          user.id,
          user.nome,
          user.email,
          user.celular ?? null,
          passwordHash,
          user.tipo,
          asBoolean(user.ativo, user.tipo === 1),
          user.alunoId ?? null,
          user.createdAt,
        ]
      );
    }

    for (const aluno of database.alunos) {
      await client.query(
        `INSERT INTO alunos (
          id, nome, apelido, foto, email_responsavel, celular, data_nascimento, data_pagamento,
          pagamento_pago, pagamento_referencia, pagamentos_pagos, faixa_atual, graus, user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          apelido = EXCLUDED.apelido,
          foto = EXCLUDED.foto,
          email_responsavel = EXCLUDED.email_responsavel,
          celular = EXCLUDED.celular,
          data_nascimento = EXCLUDED.data_nascimento,
          data_pagamento = EXCLUDED.data_pagamento,
          pagamento_pago = EXCLUDED.pagamento_pago,
          pagamento_referencia = EXCLUDED.pagamento_referencia,
          pagamentos_pagos = EXCLUDED.pagamentos_pagos,
          faixa_atual = EXCLUDED.faixa_atual,
          graus = EXCLUDED.graus,
          user_id = EXCLUDED.user_id`,
        [
          aluno.id,
          aluno.nome,
          aluno.apelido ?? null,
          aluno.foto ?? null,
          aluno.emailResponsavel ?? null,
          aluno.celular ?? null,
          aluno.dataNascimento ?? null,
          aluno.dataPagamento ?? null,
          aluno.pagamentoPago ?? false,
          aluno.pagamentoReferencia ?? null,
          JSON.stringify(aluno.pagamentosPagos ?? []),
          aluno.faixaAtual ?? null,
          aluno.graus ?? 0,
          aluno.userId ?? null,
          aluno.createdAt,
        ]
      );
    }

    for (const video of database.videos) {
      await client.query(
        `INSERT INTO videos (id, titulo, descricao, url, aluno_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           titulo = EXCLUDED.titulo,
           descricao = EXCLUDED.descricao,
           url = EXCLUDED.url,
           aluno_id = EXCLUDED.aluno_id`,
        [video.id, video.titulo, video.descricao ?? null, video.url, video.alunoId ?? null, video.createdAt]
      );
    }

    for (const presenca of database.presencas) {
      await client.query(
        `INSERT INTO presencas (id, aluno_id, data, presente, marked_at, marked_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           aluno_id = EXCLUDED.aluno_id,
           data = EXCLUDED.data,
           presente = EXCLUDED.presente,
           marked_at = EXCLUDED.marked_at,
           marked_by_user_id = EXCLUDED.marked_by_user_id`,
        [
          presenca.id,
          presenca.alunoId,
          presenca.data,
          presenca.presente,
          presenca.markedAt,
          presenca.markedByUserId ?? null,
        ]
      );
    }

    for (const tipoAula of database.tiposAula) {
      await client.query(
        `INSERT INTO tipos_aula (id, nome, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome`,
        [tipoAula.id, tipoAula.nome, tipoAula.createdAt]
      );
    }

    for (const aula of database.aulasCalendario) {
      await client.query(
        `INSERT INTO aulas_calendario (id, tipo_aula_id, tipo_aula_nome, dias_semana, hora, categoria, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           tipo_aula_id = EXCLUDED.tipo_aula_id,
           tipo_aula_nome = EXCLUDED.tipo_aula_nome,
           dias_semana = EXCLUDED.dias_semana,
           hora = EXCLUDED.hora,
           categoria = EXCLUDED.categoria`,
        [
          aula.id,
          aula.tipoAulaId,
          aula.tipoAulaNome,
          JSON.stringify(aula.diasSemana),
          aula.hora,
          aula.categoria,
          aula.createdAt,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initDatabase(): Promise<void> {
  await ensurePostgres();
}

export async function readDatabase(): Promise<Database> {
  return readPostgresDatabase();
}

export async function writeDatabase(database: Database): Promise<void> {
  await ensurePostgres();
  await upsertPostgresDatabase(database);
}

export { pool };
