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

async function ensurePostgres(): Promise<void> {
  postgresReady ??= (async () => {
    await pool.query('SELECT 1');
    await runMigrations(pool);
  })();

  await postgresReady;
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
    users: users.rows.map(
      (row): User => ({
        id: row.id,
        nome: row.nome,
        email: row.email,
        celular: row.celular ?? undefined,
        passwordHash: row.password_hash,
        tipo: row.tipo,
        ativo: row.ativo,
        alunoId: row.aluno_id,
        createdAt: asIso(row.created_at),
      })
    ),
    alunos: alunos.rows.map(
      (row): Aluno => ({
        id: row.id,
        nome: row.nome,
        apelido: row.apelido,
        foto: row.foto,
        emailResponsavel: row.email_responsavel ?? undefined,
        celular: row.celular ?? undefined,
        dataNascimento: row.data_nascimento ?? undefined,
        dataPagamento: row.data_pagamento,
        pagamentoPago: row.pagamento_pago,
        pagamentoReferencia: row.pagamento_referencia,
        pagamentosPagos: row.pagamentos_pagos ?? [],
        faixaAtual: row.faixa_atual,
        graus: row.graus,
        userId: row.user_id,
        user: null,
        createdAt: asIso(row.created_at),
      })
    ),
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

async function replacePostgresDatabase(database: Database): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM aulas_calendario; DELETE FROM tipos_aula; DELETE FROM presencas; DELETE FROM videos; DELETE FROM alunos; DELETE FROM users;'
    );

    for (const user of database.users) {
      await client.query(
        `INSERT INTO users (id, nome, email, celular, password_hash, tipo, ativo, aluno_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          user.id,
          user.nome,
          user.email,
          user.celular ?? null,
          user.passwordHash,
          user.tipo,
          user.ativo,
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)`,
        [
          aluno.id,
          aluno.nome,
          aluno.apelido ?? null,
          aluno.foto ?? null,
          aluno.emailResponsavel ?? null,
          aluno.celular ?? null,
          aluno.dataNascimento ?? null,
          aluno.dataPagamento ?? null,
          aluno.pagamentoPago ?? null,
          aluno.pagamentoReferencia ?? null,
          JSON.stringify(aluno.pagamentosPagos ?? []),
          aluno.faixaAtual ?? null,
          aluno.graus ?? null,
          aluno.userId ?? null,
          aluno.createdAt,
        ]
      );
    }

    for (const video of database.videos) {
      await client.query(
        `INSERT INTO videos (id, titulo, descricao, url, aluno_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [video.id, video.titulo, video.descricao ?? null, video.url, video.alunoId ?? null, video.createdAt]
      );
    }

    for (const presenca of database.presencas) {
      await client.query(
        `INSERT INTO presencas (id, aluno_id, data, presente, marked_at, marked_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
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
         VALUES ($1, $2, $3)`,
        [tipoAula.id, tipoAula.nome, tipoAula.createdAt]
      );
    }

    for (const aula of database.aulasCalendario) {
      await client.query(
        `INSERT INTO aulas_calendario (id, tipo_aula_id, tipo_aula_nome, dias_semana, hora, categoria, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
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
  await replacePostgresDatabase(database);
}
