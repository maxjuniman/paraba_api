import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { readDatabase, writeDatabase } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';
import type { Aluno, PresencaDiaAluno, PublicUser } from '../types.js';

export const presencasRoutes = Router();

presencasRoutes.use(authRequired, requireProfessor);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

function userPreview(user?: PublicUser | null) {
  if (!user) return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    ativo: user.ativo ?? true,
  };
}

function attendanceSummary(database: Awaited<ReturnType<typeof readDatabase>>, alunoId: string) {
  const presencas = database.presencas
    .filter((presenca) => presenca.alunoId === alunoId && presenca.presente)
    .sort((a, b) => b.data.localeCompare(a.data));

  return {
    presencas,
    totalPresencas: presencas.length,
    ultimaPresenca: presencas[0]?.data ?? null,
  };
}

function alunoWithAttendance(database: Awaited<ReturnType<typeof readDatabase>>, aluno: Aluno): Aluno {
  const user = database.users.find((item) => item.id === aluno.userId);
  return {
    ...aluno,
    user: userPreview(user),
    ...attendanceSummary(database, aluno.id),
  };
}

presencasRoutes.get('/', async (req, res) => {
  const parsed = dateSchema.safeParse(String(req.query.data ?? ''));

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Data invalida.' });
    return;
  }

  const database = await readDatabase();
  const alunos = database.alunos
    .map((aluno): PresencaDiaAluno => {
      const presenca = database.presencas.find(
        (item) => item.alunoId === aluno.id && item.data === parsed.data
      );

      return {
        ...alunoWithAttendance(database, aluno),
        presente: presenca?.presente ?? false,
        presenca: presenca ?? null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  res.json({ data: { data: parsed.data, alunos } });
});

presencasRoutes.patch('/:data/alunos/:alunoId/toggle', async (req, res) => {
  const parsed = dateSchema.safeParse(req.params.data);

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Data invalida.' });
    return;
  }

  const database = await readDatabase();
  const aluno = database.alunos.find((item) => item.id === req.params.alunoId);

  if (!aluno) {
    res.status(404).json({ message: 'Aluno nao encontrado.' });
    return;
  }

  let presenca = database.presencas.find(
    (item) => item.alunoId === aluno.id && item.data === parsed.data
  );

  const now = new Date().toISOString();
  if (!presenca) {
    presenca = {
      id: randomUUID(),
      alunoId: aluno.id,
      data: parsed.data,
      presente: true,
      markedAt: now,
      markedByUserId: req.user?.id ?? null,
    };
    database.presencas.push(presenca);
  } else {
    presenca.presente = !presenca.presente;
    presenca.markedAt = now;
    presenca.markedByUserId = req.user?.id ?? null;
  }

  await writeDatabase(database);

  res.json({
    data: {
      aluno: {
        ...alunoWithAttendance(database, aluno),
        presente: presenca.presente,
        presenca,
      },
      presenca,
    },
  });
});
