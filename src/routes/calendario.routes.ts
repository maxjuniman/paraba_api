import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { studentCategories } from '../config/studentCategories.js';
import { readDatabase, writeDatabase, listActivePushTokens } from '../lib/db.js';
import { notifyAulaAvulsaCriada } from '../lib/pushNotifications.js';
import { authRequired } from '../middleware/authRequired.js';
import type { Aluno, AulaCalendario, AulaCategoria, AulaRecorrencia, TipoAula } from '../types.js';

export const calendarioRoutes = Router();

const CATEGORIA_OPTIONS = ['kids', 'juvenil', 'adulto'] as const;

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Informe o mes no formato AAAA-MM.')
  .optional();

const tipoAulaSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o tipo de aula.'),
});

const aulaSchema = z
  .object({
    tipoAulaId: z.string().trim().optional(),
    novoTipoAula: z.string().trim().optional(),
    recorrencia: z.enum(['avulsa', 'recorrente']),
    diasSemana: z.array(z.number().int().min(0).max(6)).optional().default([]),
    data: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.')
      .optional(),
    hora: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Informe a hora no formato HH:mm.'),
    categorias: z
      .array(z.enum(CATEGORIA_OPTIONS))
      .min(1, 'Selecione ao menos uma categoria.'),
  })
  .refine((body) => body.tipoAulaId || body.novoTipoAula, {
    message: 'Informe o tipo de aula.',
  })
  .superRefine((body, ctx) => {
    if (body.recorrencia === 'recorrente' && body.diasSemana.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecione ao menos um dia da semana.',
        path: ['diasSemana'],
      });
    }

    if (body.recorrencia === 'avulsa') {
      if (!body.data) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe a data da aula avulsa.',
          path: ['data'],
        });
      }
      if (body.diasSemana.length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Aula avulsa deve ter somente um dia.',
          path: ['diasSemana'],
        });
      }
    }
  });

function isProfessor(tipo?: number | string): boolean {
  return tipo === 1 || tipo === '1' || tipo === 'admin' || tipo === 'professor';
}

function isAluno(tipo?: number | string): boolean {
  return tipo === 2 || tipo === '2' || tipo === 'aluno';
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

  return (category?.id as AulaCategoria | undefined) ?? null;
}

function findLinkedAluno(
  alunos: Aluno[],
  userId?: string,
  alunoId?: string | null
): Aluno | undefined {
  if (!userId) return undefined;
  if (alunoId) {
    const byId = alunos.find((aluno) => aluno.id === alunoId);
    if (byId) return byId;
  }
  return alunos.find((aluno) => aluno.userId === userId);
}

function aulaMatchesStudentCategory(
  categorias: AulaCategoria[],
  studentCategory: AulaCategoria | null
): boolean {
  if (!studentCategory) return false;
  if (!categorias?.length) return true;
  return categorias.includes(studentCategory);
}

function weekdayFromIsoDate(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

function allTiposAula(database: Awaited<ReturnType<typeof readDatabase>>): TipoAula[] {
  return [...database.tiposAula]
    .filter(
      (tipo) => tipo.id !== 'aula-avulsa' && tipo.nome.trim().toLowerCase() !== 'aula avulsa'
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

function monthRange(month?: string) {
  const now = new Date();
  const [year, monthNumber] = (month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    .split('-')
    .map(Number);

  return {
    month: `${year}-${String(monthNumber).padStart(2, '0')}`,
    year,
    monthIndex: monthNumber - 1,
    daysInMonth: new Date(year, monthNumber, 0).getDate(),
  };
}

function expandMonth(
  aula: AulaCalendario,
  month: string | undefined,
  database: Awaited<ReturnType<typeof readDatabase>>
) {
  const range = monthRange(month);

  const buildOccurrence = (data: string, diaSemana: number) => {
    const presentes = database.presencas
      .filter((presenca) => presenca.aulaId === aula.id && presenca.data === data && presenca.presente)
      .map((presenca) => {
        const aluno = database.alunos.find((item) => item.id === presenca.alunoId);
        if (!aluno) return null;
        return {
          id: aluno.id,
          nome: aluno.nome,
          apelido: aluno.apelido ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null)
      .sort((a, b) => a.nome.localeCompare(b.nome));

    return {
      id: `${aula.id}-${data}`,
      aulaId: aula.id,
      data,
      diaSemana,
      hora: aula.hora,
      categorias: aula.categorias,
      recorrencia: aula.recorrencia,
      tipoAula: {
        id: aula.tipoAulaId,
        nome: aula.tipoAulaNome,
      },
      presentes,
      totalPresentes: presentes.length,
    };
  };

  if (aula.recorrencia === 'avulsa') {
    if (!aula.dataUnica || !aula.dataUnica.startsWith(`${range.month}-`)) return [];
    const diaSemana = weekdayFromIsoDate(aula.dataUnica);
    return [buildOccurrence(aula.dataUnica, diaSemana)];
  }

  return Array.from({ length: range.daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(range.year, range.monthIndex, day);
    const diaSemana = date.getDay();

    if (!aula.diasSemana.includes(diaSemana)) return null;

    const data = `${range.month}-${String(day).padStart(2, '0')}`;
    return buildOccurrence(data, diaSemana);
  }).filter((item): item is NonNullable<typeof item> => item != null);
}

calendarioRoutes.use(authRequired);

calendarioRoutes.get('/tipos', async (_req, res) => {
  const database = await readDatabase();
  res.json({ data: allTiposAula(database) });
});

calendarioRoutes.post('/tipos', async (req, res) => {
  if (!isProfessor(req.user?.tipo)) {
    res.status(403).json({ message: 'Apenas usuarios tipo 1 podem criar tipos de aula.' });
    return;
  }

  const parsed = tipoAulaSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
    return;
  }

  const database = await readDatabase();
  const nome = parsed.data.nome;
  const existing = allTiposAula(database).find((tipo) => tipo.nome.toLowerCase() === nome.toLowerCase());

  if (existing) {
    res.status(200).json({ data: existing });
    return;
  }

  const tipoAula: TipoAula = {
    id: randomUUID(),
    nome,
    createdAt: new Date().toISOString(),
  };

  database.tiposAula.push(tipoAula);
  await writeDatabase(database);

  res.status(201).json({ data: tipoAula });
});

calendarioRoutes.get('/', async (req, res) => {
  const parsedMonth = monthSchema.safeParse(req.query.mes);

  if (!parsedMonth.success) {
    res.status(400).json({ message: parsedMonth.error.issues[0]?.message || 'Mes invalido.' });
    return;
  }

  const database = await readDatabase();
  const range = monthRange(parsedMonth.data);
  const alunoViewer = isAluno(req.user?.tipo);

  let aulasCalendario = database.aulasCalendario;

  if (alunoViewer) {
    const aluno = findLinkedAluno(database.alunos, req.user?.id, req.user?.alunoId);
    if (!aluno) {
      res.json({ data: { mes: range.month, aulas: [] } });
      return;
    }

    const studentCategory = studentCategoryId(aluno.dataNascimento);
    aulasCalendario = aulasCalendario.filter((aula) =>
      aulaMatchesStudentCategory(aula.categorias, studentCategory)
    );
  }

  // Proximas/Passadas fica no app. Aluno nao recebe lista de presentes.
  const aulas = aulasCalendario
    .flatMap((aula) => expandMonth(aula, range.month, database))
    .map((aula) => {
      if (!alunoViewer) return aula;
      return {
        id: aula.id,
        aulaId: aula.aulaId,
        data: aula.data,
        diaSemana: aula.diaSemana,
        hora: aula.hora,
        categorias: aula.categorias,
        recorrencia: aula.recorrencia,
        tipoAula: aula.tipoAula,
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));

  res.json({ data: { mes: range.month, aulas } });
});

calendarioRoutes.post('/aulas', async (req, res) => {
  if (!isProfessor(req.user?.tipo)) {
    res.status(403).json({ message: 'Apenas usuarios tipo 1 podem cadastrar aulas.' });
    return;
  }

  const parsed = aulaSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
    return;
  }

  const database = await readDatabase();
  let tipoAula = parsed.data.tipoAulaId
    ? allTiposAula(database).find((tipo) => tipo.id === parsed.data.tipoAulaId)
    : undefined;

  if (!tipoAula && parsed.data.novoTipoAula) {
    tipoAula =
      allTiposAula(database).find((tipo) => tipo.nome.toLowerCase() === parsed.data.novoTipoAula?.toLowerCase()) ?? {
        id: randomUUID(),
        nome: parsed.data.novoTipoAula,
        createdAt: new Date().toISOString(),
      };

    if (!database.tiposAula.some((tipo) => tipo.id === tipoAula?.id)) {
      database.tiposAula.push(tipoAula);
    }
  }

  if (!tipoAula) {
    res.status(404).json({ message: 'Tipo de aula nao encontrado.' });
    return;
  }

  const recorrencia = parsed.data.recorrencia as AulaRecorrencia;
  const categorias = [...new Set(parsed.data.categorias)] as AulaCategoria[];
  const dataUnica = recorrencia === 'avulsa' ? parsed.data.data ?? null : null;
  const diasSemana =
    recorrencia === 'avulsa'
      ? dataUnica
        ? [weekdayFromIsoDate(dataUnica)]
        : []
      : [...new Set(parsed.data.diasSemana)].sort((a, b) => a - b);

  const aula: AulaCalendario = {
    id: randomUUID(),
    tipoAulaId: tipoAula.id,
    tipoAulaNome: tipoAula.nome,
    diasSemana,
    hora: parsed.data.hora,
    categorias,
    recorrencia,
    dataUnica,
    createdAt: new Date().toISOString(),
  };

  database.aulasCalendario.push(aula);
  await writeDatabase(database);

  if (recorrencia === 'avulsa') {
    void listActivePushTokens()
      .then((tokens) => notifyAulaAvulsaCriada(tokens))
      .catch((error) => {
        console.error('Falha ao notificar aula avulsa:', error);
      });
  }

  res.status(201).json({ data: aula });
});
