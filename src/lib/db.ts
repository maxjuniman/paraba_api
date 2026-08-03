import { createPgPool } from './pgPool.js';
import { runMigrations } from './migrations.js';
import type {
  Aluno,
  AulaCalendario,
  Database,
  Depoimento,
  Presenca,
  TipoAula,
  User,
  VideoUpdate,
} from '../types.js';

const pool = createPgPool();
let postgresReady: Promise<void> | null = null;

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

/** Normaliza data de nascimento para AAAA-MM-DD (evita Date/ISO com horario do pg). */
function asDateOnly(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoMatch) return isoMatch[1];

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  return undefined;
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
    pushToken: (row.push_token as string | null | undefined) ?? null,
    createdAt: asIso(row.created_at),
  };
}

function asPaymentDay(value: unknown): string | null {
  if (value == null || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const day = Math.trunc(value);
    return day >= 1 && day <= 31 ? String(day) : null;
  }

  const text = String(value).trim();
  if (/^\d{1,2}$/.test(text)) {
    const day = Number(text);
    return day >= 1 && day <= 31 ? String(day) : null;
  }

  // Legado: data completa — extrai o dia.
  const isoMatch = text.match(/^\d{4}-\d{2}-(\d{2})/);
  if (isoMatch) {
    const day = Number(isoMatch[1]);
    return day >= 1 && day <= 31 ? String(day) : null;
  }

  const asNumber = Number(text);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 31) {
    return String(asNumber);
  }

  return null;
}

function mapAluno(row: Record<string, unknown>): Aluno {
  return {
    id: String(row.id),
    nome: String(row.nome),
    apelido: (row.apelido as string | null | undefined) ?? null,
    foto: (row.foto as string | null | undefined) ?? null,
    emailResponsavel: (row.email_responsavel as string | null | undefined) ?? undefined,
    nomeResponsavel: (row.nome_responsavel as string | null | undefined) ?? null,
    celular: (row.celular as string | null | undefined) ?? undefined,
    dataNascimento: asDateOnly(row.data_nascimento),
    dataPagamento: asPaymentDay(row.data_pagamento),
    pagamentoPago: (row.pagamento_pago as boolean | null | undefined) ?? null,
    pagamentoReferencia: (row.pagamento_referencia as string | null | undefined) ?? null,
    pagamentosPagos: (row.pagamentos_pagos as string[] | null | undefined) ?? [],
    faixaAtual: (row.faixa_atual as string | null | undefined) ?? null,
    graus: (row.graus as number | null | undefined) ?? 0,
    ativo: asBoolean(row.ativo, true),
    userId: (row.user_id as string | null | undefined) ?? null,
    user: null,
    createdAt: asIso(row.created_at),
  };
}

async function readPostgresDatabase(): Promise<Database> {
  await ensurePostgres();

  const [users, alunos, videos, depoimentos, presencas, tiposAula, aulasCalendario] = await Promise.all([
    pool.query('SELECT * FROM users ORDER BY created_at ASC'),
    pool.query('SELECT * FROM alunos ORDER BY created_at ASC'),
    pool.query('SELECT * FROM videos ORDER BY created_at ASC'),
    pool.query('SELECT * FROM depoimentos ORDER BY ordem ASC, created_at ASC'),
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
    depoimentos: depoimentos.rows.map(
      (row): Depoimento => ({
        id: row.id,
        nome: row.nome,
        texto: row.texto,
        faixa: row.faixa ?? null,
        userId: row.user_id ?? null,
        ativo: row.ativo !== false,
        ordem: Number(row.ordem ?? 0) || 0,
        createdAt: asIso(row.created_at),
      })
    ),
    presencas: presencas.rows.map(
      (row): Presenca => ({
        id: row.id,
        alunoId: row.aluno_id,
        data: row.data,
        aulaId: row.aula_id ?? null,
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
      (row): AulaCalendario => {
        const legacyCategoria = row.categoria as string | null | undefined;
        const rawCategorias = row.categorias;
        let categorias: AulaCalendario['categorias'] = [];

        if (Array.isArray(rawCategorias) && rawCategorias.length > 0) {
          categorias = rawCategorias.filter(
            (item): item is AulaCalendario['categorias'][number] =>
              item === 'kids' || item === 'juvenil' || item === 'adulto'
          );
        } else if (legacyCategoria === 'all' || !legacyCategoria) {
          categorias = ['kids', 'juvenil', 'adulto'];
        } else if (legacyCategoria === 'kids' || legacyCategoria === 'juvenil' || legacyCategoria === 'adulto') {
          categorias = [legacyCategoria];
        }

        if (categorias.length === 0) {
          categorias = ['kids', 'juvenil', 'adulto'];
        }

        const recorrencia = row.recorrencia === 'avulsa' ? 'avulsa' : 'recorrente';

        return {
          id: row.id,
          tipoAulaId: row.tipo_aula_id,
          tipoAulaNome: row.tipo_aula_nome,
          diasSemana: row.dias_semana ?? [],
          hora: row.hora,
          categorias,
          recorrencia,
          dataUnica: (row.data_unica as string | null | undefined) ?? null,
          createdAt: asIso(row.created_at),
        };
      }
    ),
  };
}

export async function insertAluno(aluno: Aluno): Promise<Aluno> {
  await ensurePostgres();

  const { rows } = await pool.query(
    `INSERT INTO alunos (
      id, nome, apelido, foto, email_responsavel, nome_responsavel, celular, data_nascimento, data_pagamento,
      pagamento_pago, pagamento_referencia, pagamentos_pagos, faixa_atual, graus, ativo, user_id, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      aluno.id,
      aluno.nome,
      aluno.apelido ?? null,
      aluno.foto ?? null,
      aluno.emailResponsavel ?? null,
      aluno.nomeResponsavel ?? null,
      aluno.celular ?? null,
      asDateOnly(aluno.dataNascimento) ?? null,
      aluno.dataPagamento == null ? null : String(aluno.dataPagamento),
      aluno.pagamentoPago ?? false,
      aluno.pagamentoReferencia ?? null,
      JSON.stringify(aluno.pagamentosPagos ?? []),
      aluno.faixaAtual ?? null,
      aluno.graus ?? 0,
      asBoolean(aluno.ativo, true),
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
      nome_responsavel = $6,
      celular = $7,
      data_nascimento = $8,
      data_pagamento = $9,
      pagamento_pago = $10,
      pagamento_referencia = $11,
      pagamentos_pagos = $12::jsonb,
      faixa_atual = $13,
      graus = $14,
      ativo = $15,
      user_id = $16
    WHERE id = $1
    RETURNING *`,
    [
      aluno.id,
      aluno.nome,
      aluno.apelido ?? null,
      aluno.foto ?? null,
      aluno.emailResponsavel ?? null,
      aluno.nomeResponsavel ?? null,
      aluno.celular ?? null,
      asDateOnly(aluno.dataNascimento) ?? null,
      aluno.dataPagamento == null ? null : String(aluno.dataPagamento),
      aluno.pagamentoPago ?? false,
      aluno.pagamentoReferencia ?? null,
      JSON.stringify(aluno.pagamentosPagos ?? []),
      aluno.faixaAtual ?? null,
      aluno.graus ?? 0,
      asBoolean(aluno.ativo, true),
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
      aluno_id = $8,
      push_token = COALESCE($9, push_token)
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
      user.pushToken ?? null,
    ]
  );

  if (!rows[0]) {
    throw new Error('Usuario nao encontrado.');
  }

  return mapUser(rows[0]);
}

export async function updateUserPushToken(userId: string, pushToken: string | null): Promise<User> {
  await ensurePostgres();

  const { rows } = await pool.query(
    `UPDATE users
     SET push_token = $2
     WHERE id = $1
     RETURNING *`,
    [userId, pushToken]
  );

  if (!rows[0]) {
    throw new Error('Usuario nao encontrado.');
  }

  return mapUser(rows[0]);
}

export async function listActivePushTokens(): Promise<string[]> {
  await ensurePostgres();

  const { rows } = await pool.query<{ push_token: string }>(
    `SELECT push_token
     FROM users
     WHERE ativo = TRUE
       AND push_token IS NOT NULL
       AND TRIM(push_token) <> ''`
  );

  return [...new Set(rows.map((row) => row.push_token.trim()))];
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
          id, nome, apelido, foto, email_responsavel, nome_responsavel, celular, data_nascimento, data_pagamento,
          pagamento_pago, pagamento_referencia, pagamentos_pagos, faixa_atual, graus, user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          apelido = EXCLUDED.apelido,
          foto = EXCLUDED.foto,
          email_responsavel = EXCLUDED.email_responsavel,
          nome_responsavel = EXCLUDED.nome_responsavel,
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
          aluno.nomeResponsavel ?? null,
          aluno.celular ?? null,
          asDateOnly(aluno.dataNascimento) ?? null,
          aluno.dataPagamento == null ? null : String(aluno.dataPagamento),
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

    for (const depoimento of database.depoimentos) {
      await client.query(
        `INSERT INTO depoimentos (id, nome, texto, faixa, user_id, ativo, ordem, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           nome = EXCLUDED.nome,
           texto = EXCLUDED.texto,
           faixa = EXCLUDED.faixa,
           user_id = EXCLUDED.user_id,
           ativo = EXCLUDED.ativo,
           ordem = EXCLUDED.ordem`,
        [
          depoimento.id,
          depoimento.nome,
          depoimento.texto,
          depoimento.faixa ?? null,
          depoimento.userId ?? null,
          depoimento.ativo !== false,
          depoimento.ordem ?? 0,
          depoimento.createdAt,
        ]
      );
    }

    for (const presenca of database.presencas) {
      await client.query(
        `INSERT INTO presencas (id, aluno_id, data, aula_id, presente, marked_at, marked_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           aluno_id = EXCLUDED.aluno_id,
           data = EXCLUDED.data,
           aula_id = EXCLUDED.aula_id,
           presente = EXCLUDED.presente,
           marked_at = EXCLUDED.marked_at,
           marked_by_user_id = EXCLUDED.marked_by_user_id`,
        [
          presenca.id,
          presenca.alunoId,
          presenca.data,
          presenca.aulaId ?? null,
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
      const legacyCategoria =
        aula.categorias.length === 3 ? 'all' : aula.categorias[0] ?? 'all';
      await client.query(
        `INSERT INTO aulas_calendario (
          id, tipo_aula_id, tipo_aula_nome, dias_semana, hora, categoria, categorias, recorrencia, data_unica, created_at
        )
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           tipo_aula_id = EXCLUDED.tipo_aula_id,
           tipo_aula_nome = EXCLUDED.tipo_aula_nome,
           dias_semana = EXCLUDED.dias_semana,
           hora = EXCLUDED.hora,
           categoria = EXCLUDED.categoria,
           categorias = EXCLUDED.categorias,
           recorrencia = EXCLUDED.recorrencia,
           data_unica = EXCLUDED.data_unica`,
        [
          aula.id,
          aula.tipoAulaId,
          aula.tipoAulaNome,
          JSON.stringify(aula.diasSemana),
          aula.hora,
          legacyCategoria,
          JSON.stringify(aula.categorias),
          aula.recorrencia,
          aula.dataUnica ?? null,
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
