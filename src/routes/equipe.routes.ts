import { Router } from 'express';
import { z } from 'zod';
import { toPublicUser } from '../lib/auth.js';
import { readDatabase, updateAluno, updateUser } from '../lib/db.js';
import { MAX_ALUNOS_POR_USER } from '../lib/vinculos.js';
import { authRequired } from '../middleware/authRequired.js';
import type { Aluno } from '../types.js';

export const equipeRoutes = Router();

/** Ordem do jiu-jitsu: faixa mais alta primeiro (preta -> branca). */
const FAIXA_RANK: Record<string, number> = {
  preta: 0,
  marrom: 1,
  roxa: 2,
  azul: 3,
  verde: 4,
  laranja: 5,
  amarela: 6,
  cinza: 7,
  branca: 8,
};

function faixaRank(faixa?: string | null): number {
  if (!faixa) return 99;
  const key = faixa.trim().toLowerCase();
  return FAIXA_RANK[key] ?? 98;
}

function compareByFaixaThenGrausThenNome(
  a: { nome: string; faixaAtual?: string | null; graus?: number | null },
  b: { nome: string; faixaAtual?: string | null; graus?: number | null }
): number {
  const byFaixa = faixaRank(a.faixaAtual) - faixaRank(b.faixaAtual);
  if (byFaixa !== 0) return byFaixa;

  const byGraus = (b.graus ?? 0) - (a.graus ?? 0);
  if (byGraus !== 0) return byGraus;

  return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
}

/** Lista publica da equipe (ativos) para o site de divulgacao. */
equipeRoutes.get('/public', async (_req, res, next) => {
  try {
    const database = await readDatabase();
    const alunos = database.alunos
      .filter((aluno) => aluno.ativo !== false)
      .map((aluno) => ({
        id: aluno.id,
        nome: aluno.nome,
        apelido: aluno.apelido ?? null,
        foto: aluno.foto ?? null,
        faixaAtual: normalizeFaixa(aluno),
        graus: normalizeGraus(aluno),
      }))
      .sort(compareByFaixaThenGrausThenNome);

    res.json({ data: alunos });
  } catch (error) {
    next(error);
  }
});

equipeRoutes.use(authRequired);

type AlunoWithLegacyFields = {
  dataNascimento?: string | Date | null;
  data_nascimento?: string | Date | null;
  nascimento?: string | Date | null;
  faixaAtual?: string | null;
  faixa_atual?: string | null;
  faixa?: string | null;
  graus?: number | string | null;
};

const fotoSchema = z.object({
  foto: z
    .string()
    .trim()
    .min(1, 'Informe a foto.')
    .max(8_000_000, 'A foto enviada e muito grande.')
    .nullable(),
  aluno_id: z.string().trim().min(1).optional(),
});

function normalizeBirthDate(aluno: AlunoWithLegacyFields): string | null {
  const rawDate = aluno.dataNascimento ?? aluno.data_nascimento ?? aluno.nascimento ?? null;
  if (rawDate == null || rawDate === '') return null;

  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    const year = rawDate.getUTCFullYear();
    const month = String(rawDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(rawDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const value = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoMatch) return isoMatch[1];

  const brDateMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDateMatch) {
    const [, day, month, year] = brDateMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function normalizeFaixa(aluno: AlunoWithLegacyFields): string | null {
  return aluno.faixaAtual ?? aluno.faixa_atual ?? aluno.faixa ?? null;
}

function normalizeGraus(aluno: AlunoWithLegacyFields): number {
  const graus = Number(aluno.graus ?? 0);
  return Number.isFinite(graus) ? graus : 0;
}

function isAlunoUser(tipo?: number | string): boolean {
  return tipo === 2 || tipo === 'aluno';
}

function toEquipeAluno(
  aluno: Aluno,
  currentUserId?: string,
  currentAlunoId?: string | null,
  cadastroAppAt?: string | null
) {
  const isMe = Boolean(
    (currentUserId && aluno.userId === currentUserId) || (currentAlunoId && aluno.id === currentAlunoId)
  );

  return {
    id: aluno.id,
    nome: aluno.nome,
    apelido: aluno.apelido ?? null,
    foto: aluno.foto ?? null,
    dataNascimento: normalizeBirthDate(aluno),
    faixaAtual: normalizeFaixa(aluno),
    graus: normalizeGraus(aluno),
    isMe,
    ...(isMe
      ? {
          dataPagamento:
            aluno.dataPagamento == null || aluno.dataPagamento === ''
              ? null
              : String(aluno.dataPagamento).trim(),
          data_pagamento:
            aluno.dataPagamento == null || aluno.dataPagamento === ''
              ? null
              : String(aluno.dataPagamento).trim(),
          pagamentoPago: aluno.pagamentoPago ?? false,
          pagamentoReferencia: aluno.pagamentoReferencia ?? null,
          pagamentosPagos: aluno.pagamentosPagos ?? [],
          createdAt: aluno.createdAt,
          cadastroAppAt: cadastroAppAt ?? null,
        }
      : {}),
  };
}

function toMeuAluno(aluno: Aluno, cadastroAppAt?: string | null) {
  const dataPagamento =
    aluno.dataPagamento == null || aluno.dataPagamento === ''
      ? null
      : String(aluno.dataPagamento).trim();

  return {
    id: aluno.id,
    nome: aluno.nome,
    apelido: aluno.apelido ?? null,
    foto: aluno.foto ?? null,
    dataNascimento: normalizeBirthDate(aluno),
    faixaAtual: normalizeFaixa(aluno),
    graus: normalizeGraus(aluno),
    isMe: true,
    // Campos do cadastro do aluno (obrigatorios neste endpoint).
    dataPagamento,
    data_pagamento: dataPagamento,
    pagamentoPago: aluno.pagamentoPago ?? false,
    pagamentoReferencia: aluno.pagamentoReferencia ?? null,
    pagamentosPagos: aluno.pagamentosPagos ?? [],
    createdAt: aluno.createdAt,
    cadastroAppAt: cadastroAppAt ?? null,
  };
}

function findLinkedAluno(alunos: Aluno[], userId: string, alunoId?: string | null): Aluno | undefined {
  // Prioriza o aluno primario do usuario quando houver mais de um vinculo.
  if (alunoId) {
    const primary = alunos.find((aluno) => aluno.id === alunoId && (!aluno.userId || aluno.userId === userId));
    if (primary) return primary;
  }

  return alunos.find((aluno) => aluno.userId === userId);
}

function findLinkedUser(
  users: Array<{ id: string; alunoId?: string | null; createdAt: string }>,
  aluno: Aluno,
  currentUserId?: string
) {
  if (currentUserId) {
    const byCurrent = users.find((user) => user.id === currentUserId);
    if (byCurrent) return byCurrent;
  }

  if (aluno.userId) {
    const byId = users.find((user) => user.id === aluno.userId);
    if (byId) return byId;
  }

  return users.find((user) => user.alunoId === aluno.id);
}

equipeRoutes.get('/', async (req, res) => {
  if (!isAlunoUser(req.user?.tipo)) {
    res.status(403).json({ message: 'A equipe esta disponivel apenas para usuarios tipo 2.' });
    return;
  }

  const database = await readDatabase();
  const alunos = database.alunos
    .filter((aluno) => aluno.ativo !== false)
    .map((aluno) => {
      const linkedUser = findLinkedUser(database.users, aluno, req.user?.id);
      return toEquipeAluno(aluno, req.user?.id, req.user?.alunoId, linkedUser?.createdAt ?? null);
    })
    .sort(compareByFaixaThenGrausThenNome);

  res.json({ data: alunos });
});

equipeRoutes.get('/me', async (req, res, next) => {
  try {
    const currentUser = req.user;
    if (!currentUser || !isAlunoUser(currentUser.tipo)) {
      res.status(403).json({ message: 'Apenas usuarios alunos podem consultar o proprio cadastro.' });
      return;
    }

    const database = await readDatabase();
    let aluno = findLinkedAluno(database.alunos, currentUser.id, currentUser.alunoId);

    if (!aluno) {
      res.status(404).json({ message: 'Nenhum aluno vinculado ao seu usuario.' });
      return;
    }

    // Garante o vinculo user_id no cadastro do aluno (fonte da verdade do pagamento).
    if (aluno.userId !== currentUser.id) {
      aluno = await updateAluno({
        ...aluno,
        userId: currentUser.id,
      });
    }

    const linkedUser = findLinkedUser(database.users, aluno, currentUser.id);

    res.json({
      data: toMeuAluno(aluno, linkedUser?.createdAt ?? null),
    });
  } catch (error) {
    next(error);
  }
});

equipeRoutes.get('/meus-alunos', async (req, res, next) => {
  try {
    const currentUser = req.user;
    if (!currentUser || !isAlunoUser(currentUser.tipo)) {
      res.status(403).json({ message: 'Apenas usuarios alunos podem consultar os proprios vinculos.' });
      return;
    }

    const database = await readDatabase();
    const user = database.users.find((item) => item.id === currentUser.id);
    if (!user) {
      res.status(404).json({ message: 'Usuario nao encontrado.' });
      return;
    }

    const alunos = database.alunos
      .filter((aluno) => aluno.userId === user.id)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((aluno) => ({
        id: aluno.id,
        nome: aluno.nome,
        apelido: aluno.apelido ?? null,
        celular: aluno.celular ?? '',
        ativo: aluno.ativo !== false,
        faixaAtual: aluno.faixaAtual ?? null,
        primario: user.alunoId === aluno.id,
      }));

    res.json({
      data: {
        user: toPublicUser(user),
        alunos,
        alunoPrimarioId: user.alunoId ?? null,
        maxAlunos: MAX_ALUNOS_POR_USER,
      },
    });
  } catch (error) {
    next(error);
  }
});

const alunoPrimarioSchema = z.object({
  aluno_id: z.string().trim().min(1, 'Informe o aluno primario.'),
});

equipeRoutes.patch('/me/aluno-primario', async (req, res, next) => {
  try {
    const currentUser = req.user;
    if (!currentUser || !isAlunoUser(currentUser.tipo)) {
      res.status(403).json({ message: 'Apenas usuarios alunos podem definir o aluno primario.' });
      return;
    }

    const parsed = alunoPrimarioSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const user = database.users.find((item) => item.id === currentUser.id);
    if (!user) {
      res.status(404).json({ message: 'Usuario nao encontrado.' });
      return;
    }

    const aluno = database.alunos.find((item) => item.id === parsed.data.aluno_id);
    if (!aluno || aluno.userId !== user.id) {
      res.status(400).json({ message: 'Aluno nao esta vinculado ao seu usuario.' });
      return;
    }

    const updatedUser = await updateUser({ ...user, alunoId: aluno.id });
    const alunos = (await readDatabase()).alunos
      .filter((item) => item.userId === updatedUser.id)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((item) => ({
        id: item.id,
        nome: item.nome,
        apelido: item.apelido ?? null,
        celular: item.celular ?? '',
        ativo: item.ativo !== false,
        faixaAtual: item.faixaAtual ?? null,
        primario: updatedUser.alunoId === item.id,
      }));

    res.json({
      data: {
        user: toPublicUser(updatedUser),
        alunos,
        alunoPrimarioId: updatedUser.alunoId ?? null,
        maxAlunos: MAX_ALUNOS_POR_USER,
      },
    });
  } catch (error) {
    next(error);
  }
});

equipeRoutes.patch('/me/foto', async (req, res, next) => {
  try {
    const currentUser = req.user;
    if (!currentUser || !isAlunoUser(currentUser.tipo)) {
      res.status(403).json({ message: 'Apenas usuarios alunos podem editar a propria foto.' });
      return;
    }

    const parsed = fotoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    let aluno: Aluno | undefined;

    if (parsed.data.aluno_id) {
      aluno = database.alunos.find(
        (item) => item.id === parsed.data.aluno_id && item.userId === currentUser.id
      );
      if (!aluno) {
        res.status(400).json({ message: 'Aluno nao esta vinculado ao seu usuario.' });
        return;
      }
    } else {
      aluno = findLinkedAluno(database.alunos, currentUser.id, currentUser.alunoId);
    }

    if (!aluno) {
      res.status(404).json({ message: 'Nenhum aluno vinculado ao seu usuario.' });
      return;
    }

    const updated = await updateAluno({
      ...aluno,
      foto: parsed.data.foto,
      userId: currentUser.id,
    });

    const linkedUser = findLinkedUser(database.users, updated, currentUser.id);
    res.json({
      data: toEquipeAluno(updated, currentUser.id, currentUser.alunoId ?? updated.id, linkedUser?.createdAt ?? null),
    });
  } catch (error) {
    next(error);
  }
});
