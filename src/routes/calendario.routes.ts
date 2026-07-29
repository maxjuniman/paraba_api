import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { readDatabase, writeDatabase, listActivePushTokens } from '../lib/db.js';
import { notifyAulaAvulsaCriada } from '../lib/pushNotifications.js';
import { authRequired } from '../middleware/authRequired.js';
import type { AulaCalendario, AulaCategoria, TipoAula } from '../types.js';

export const calendarioRoutes = Router();

const DEFAULT_TIPO_AULA: TipoAula = {
  id: 'aula-avulsa',
  nome: 'Aula avulsa',
  createdAt: '2026-01-01T00:00:00.000Z',
};

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
    diasSemana: z.array(z.number().int().min(0).max(6)).min(1, 'Selecione ao menos um dia da semana.'),
    hora: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Informe a hora no formato HH:mm.'),
    categoria: z.enum(['all', 'kids', 'juvenil', 'adulto']),
  })
  .refine((body) => body.tipoAulaId || body.novoTipoAula, {
    message: 'Informe o tipo de aula.',
  });

function isProfessor(tipo?: number | string): boolean {
  return tipo === 1 || tipo === 'admin' || tipo === 'professor';
}

function allTiposAula(database: Awaited<ReturnType<typeof readDatabase>>): TipoAula[] {
  const customTipos = database.tiposAula.filter((tipo) => tipo.id !== DEFAULT_TIPO_AULA.id);
  return [DEFAULT_TIPO_AULA, ...customTipos].sort((a, b) => a.nome.localeCompare(b.nome));
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

  return Array.from({ length: range.daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(range.year, range.monthIndex, day);
    const diaSemana = date.getDay();

    if (!aula.diasSemana.includes(diaSemana)) return null;

    const data = `${range.month}-${String(day).padStart(2, '0')}`;
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
      categoria: aula.categoria,
      tipoAula: {
        id: aula.tipoAulaId,
        nome: aula.tipoAulaNome,
      },
      presentes,
      totalPresentes: presentes.length,
    };
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
  const aulas = database.aulasCalendario
    .flatMap((aula) => expandMonth(aula, range.month, database))
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

    if (tipoAula.id !== DEFAULT_TIPO_AULA.id && !database.tiposAula.some((tipo) => tipo.id === tipoAula?.id)) {
      database.tiposAula.push(tipoAula);
    }
  }

  if (!tipoAula) {
    res.status(404).json({ message: 'Tipo de aula nao encontrado.' });
    return;
  }

  const aula: AulaCalendario = {
    id: randomUUID(),
    tipoAulaId: tipoAula.id,
    tipoAulaNome: tipoAula.nome,
    diasSemana: [...new Set(parsed.data.diasSemana)].sort((a, b) => a - b),
    hora: parsed.data.hora,
    categoria: parsed.data.categoria as AulaCategoria,
    createdAt: new Date().toISOString(),
  };

  database.aulasCalendario.push(aula);
  await writeDatabase(database);

  const isAulaAvulsa =
    tipoAula.id === DEFAULT_TIPO_AULA.id || tipoAula.nome.trim().toLowerCase() === 'aula avulsa';

  if (isAulaAvulsa) {
    void listActivePushTokens()
      .then((tokens) => notifyAulaAvulsaCriada(tokens))
      .catch((error) => {
        console.error('Falha ao notificar aula avulsa:', error);
      });
  }

  res.status(201).json({ data: aula });
});
