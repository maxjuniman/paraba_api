import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { studentCategories } from '../config/studentCategories.js';
import { readDatabase, writeDatabase } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';
import type {
  Aluno,
  AulaCalendario,
  AulaCategoria,
  PresencaAulaDoDia,
  PresencaDiaAluno,
  PublicUser,
} from '../types.js';

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

function calculateAge(isoDate?: string | null, referenceDate = new Date()): number | null {
  if (!isoDate) return null;
  const dateOnly = isoDate.trim().slice(0, 10);
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) return null;

  let age = referenceDate.getFullYear() - year;
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function studentCategoryId(isoDate?: string | null): AulaCategoria | null {
  const age = calculateAge(isoDate);
  if (age == null) return null;

  const category = studentCategories.find((item) => {
    const afterMin = age >= item.minAge;
    const beforeMax = !('maxAge' in item) || item.maxAge == null || age <= item.maxAge;
    return afterMin && beforeMax;
  });

  return category?.id ?? null;
}

function attendanceSummary(database: Awaited<ReturnType<typeof readDatabase>>, alunoId: string) {
  const presencas = database.presencas
    .filter((presenca) => presenca.alunoId === alunoId && presenca.presente)
    .sort((a, b) => b.data.localeCompare(a.data) || b.markedAt.localeCompare(a.markedAt));

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

function weekdayFromIsoDate(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

function aulasDoDia(aulasCalendario: AulaCalendario[], isoDate: string): PresencaAulaDoDia[] {
  const weekday = weekdayFromIsoDate(isoDate);

  return aulasCalendario
    .filter((aula) => aula.diasSemana.includes(weekday))
    .map((aula) => ({
      aulaId: aula.id,
      hora: aula.hora,
      categoria: aula.categoria,
      tipoAula: {
        id: aula.tipoAulaId,
        nome: aula.tipoAulaNome,
      },
    }))
    .sort((a, b) => a.hora.localeCompare(b.hora) || a.tipoAula.nome.localeCompare(b.tipoAula.nome));
}

function alunoMatchesCategoria(aluno: Aluno, categoria: AulaCategoria): boolean {
  if (categoria === 'all') return true;
  return studentCategoryId(aluno.dataNascimento) === categoria;
}

function findPresenca(
  database: Awaited<ReturnType<typeof readDatabase>>,
  alunoId: string,
  data: string,
  aulaId: string
) {
  return database.presencas.find(
    (item) => item.alunoId === alunoId && item.data === data && item.aulaId === aulaId
  );
}

presencasRoutes.get('/', async (req, res) => {
  const parsed = dateSchema.safeParse(String(req.query.data ?? ''));

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Data invalida.' });
    return;
  }

  const database = await readDatabase();
  const aulas = aulasDoDia(database.aulasCalendario, parsed.data);
  const requestedAulaId = typeof req.query.aulaId === 'string' ? req.query.aulaId : undefined;
  const aulaSelecionada =
    aulas.find((aula) => aula.aulaId === requestedAulaId) ?? aulas[0] ?? null;

  const alunos = aulaSelecionada
    ? database.alunos
        .filter((aluno) => alunoMatchesCategoria(aluno, aulaSelecionada.categoria))
        .map((aluno): PresencaDiaAluno => {
          const presenca = findPresenca(database, aluno.id, parsed.data, aulaSelecionada.aulaId);
          return {
            ...alunoWithAttendance(database, aluno),
            presente: presenca?.presente ?? false,
            presenca: presenca ?? null,
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome))
    : [];

  res.json({
    data: {
      data: parsed.data,
      aulas,
      aulaSelecionada,
      alunos,
    },
  });
});

presencasRoutes.patch('/:data/aulas/:aulaId/alunos/:alunoId/toggle', async (req, res) => {
  const parsed = dateSchema.safeParse(req.params.data);

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Data invalida.' });
    return;
  }

  const aulaId = String(req.params.aulaId ?? '');
  if (!aulaId) {
    res.status(400).json({ message: 'Informe a aula.' });
    return;
  }

  const database = await readDatabase();
  const aula = database.aulasCalendario.find((item) => item.id === aulaId);
  const aluno = database.alunos.find((item) => item.id === req.params.alunoId);

  if (!aula) {
    res.status(404).json({ message: 'Aula nao encontrada.' });
    return;
  }

  if (!aluno) {
    res.status(404).json({ message: 'Aluno nao encontrado.' });
    return;
  }

  if (!aula.diasSemana.includes(weekdayFromIsoDate(parsed.data))) {
    res.status(400).json({ message: 'Esta aula nao ocorre na data informada.' });
    return;
  }

  let presenca = findPresenca(database, aluno.id, parsed.data, aulaId);
  const now = new Date().toISOString();

  if (!presenca) {
    // Compatibilidade: se existir presença antiga só por data, reaproveita e vincula à aula.
    const legacy = database.presencas.find(
      (item) => item.alunoId === aluno.id && item.data === parsed.data && !item.aulaId
    );

    if (legacy) {
      legacy.aulaId = aulaId;
      legacy.presente = !legacy.presente;
      legacy.markedAt = now;
      legacy.markedByUserId = req.user?.id ?? null;
      presenca = legacy;
    } else {
      presenca = {
        id: randomUUID(),
        alunoId: aluno.id,
        data: parsed.data,
        aulaId,
        presente: true,
        markedAt: now,
        markedByUserId: req.user?.id ?? null,
      };
      database.presencas.push(presenca);
    }
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
