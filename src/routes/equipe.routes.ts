import { Router } from 'express';
import { z } from 'zod';
import { readDatabase, updateAluno } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import type { Aluno } from '../types.js';

export const equipeRoutes = Router();

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

function toEquipeAluno(aluno: Aluno, currentUserId?: string) {
  return {
    id: aluno.id,
    nome: aluno.nome,
    apelido: aluno.apelido ?? null,
    foto: aluno.foto ?? null,
    dataNascimento: normalizeBirthDate(aluno),
    faixaAtual: normalizeFaixa(aluno),
    graus: normalizeGraus(aluno),
    isMe: Boolean(currentUserId && aluno.userId === currentUserId),
  };
}

function findLinkedAluno(alunos: Aluno[], userId: string, alunoId?: string | null): Aluno | undefined {
  if (alunoId) {
    const byId = alunos.find((aluno) => aluno.id === alunoId);
    if (byId) return byId;
  }

  return alunos.find((aluno) => aluno.userId === userId);
}

equipeRoutes.get('/', async (req, res) => {
  if (req.user?.tipo !== 2) {
    res.status(403).json({ message: 'A equipe esta disponivel apenas para usuarios tipo 2.' });
    return;
  }

  const database = await readDatabase();
  const alunos = database.alunos
    .map((aluno) => toEquipeAluno(aluno, req.user?.id))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  res.json({ data: alunos });
});

equipeRoutes.patch('/me/foto', async (req, res, next) => {
  try {
    if (req.user?.tipo !== 2) {
      res.status(403).json({ message: 'Apenas usuarios alunos podem editar a propria foto.' });
      return;
    }

    const parsed = fotoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const aluno = findLinkedAluno(database.alunos, req.user.id, req.user.alunoId);

    if (!aluno) {
      res.status(404).json({ message: 'Nenhum aluno vinculado ao seu usuario.' });
      return;
    }

    const updated = await updateAluno({
      ...aluno,
      foto: parsed.data.foto,
      userId: req.user.id,
    });

    res.json({ data: toEquipeAluno(updated, req.user.id) });
  } catch (error) {
    next(error);
  }
});
