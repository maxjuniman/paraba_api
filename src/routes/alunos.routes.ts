import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { insertAluno, readDatabase, updateAluno, updateUser } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';
import type { Aluno } from '../types.js';

export const alunosRoutes = Router();

alunosRoutes.use(authRequired, requireProfessor);

const paymentDaySchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}$/, 'Informe o dia de pagamento entre 1 e 31.')
  .refine((value) => {
    const day = Number(value);
    return Number.isInteger(day) && day >= 1 && day <= 31;
  }, 'Informe o dia de pagamento entre 1 e 31.');

const birthDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de nascimento no formato AAAA-MM-DD.');

const alunoSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do aluno.'),
  apelido: z.string().trim().optional(),
  foto: z.string().trim().optional(),
  emailResponsavel: z.string().trim().email().optional().or(z.literal('')),
  celular: z.string().trim().optional(),
  dataNascimento: birthDateSchema,
  dataPagamento: paymentDaySchema.optional(),
  faixaAtual: z.string().trim().optional(),
  graus: z.number().int().min(0).max(10).optional(),
});

const vincularUserSchema = z.object({
  user_id: z.string().trim().min(1, 'Informe o usuario.'),
});

const pagamentoSchema = z.object({
  data_pagamento: paymentDaySchema,
});

const pagamentoStatusSchema = z.object({
  pago: z.boolean(),
  referencia: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Informe a referencia no formato AAAA-MM.'),
});

const ativoSchema = z.object({
  ativo: z.boolean(),
});

function userPreview(user?: { id: string; nome: string; email: string; ativo?: boolean } | null) {
  if (!user) return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    ativo: user.ativo ?? true,
  };
}

function findLinkedUser(database: Awaited<ReturnType<typeof readDatabase>>, aluno: Aluno) {
  if (aluno.userId) {
    const byId = database.users.find((item) => item.id === aluno.userId);
    if (byId) return byId;
  }

  return database.users.find((item) => item.alunoId === aluno.id);
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

function alunoWithDetails(database: Awaited<ReturnType<typeof readDatabase>>, aluno: Aluno): Aluno {
  const user = findLinkedUser(database, aluno);
  return {
    ...aluno,
    user: userPreview(user),
    cadastroAppAt: user?.createdAt ?? null,
    ...attendanceSummary(database, aluno.id),
  };
}

async function alunosWithUsers(): Promise<Aluno[]> {
  const database = await readDatabase();
  return database.alunos
    .map((aluno) => alunoWithDetails(database, aluno))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

alunosRoutes.get('/', async (_req, res, next) => {
  try {
    res.json({ data: await alunosWithUsers() });
  } catch (error) {
    next(error);
  }
});

alunosRoutes.post('/', async (req, res, next) => {
  try {
    const parsed = alunoSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const now = new Date().toISOString();
    const aluno = await insertAluno({
      id: randomUUID(),
      nome: parsed.data.nome,
      apelido: parsed.data.apelido || null,
      foto: parsed.data.foto || null,
      emailResponsavel: parsed.data.emailResponsavel || undefined,
      celular: parsed.data.celular || undefined,
      dataNascimento: parsed.data.dataNascimento,
      dataPagamento: parsed.data.dataPagamento || null,
      pagamentoPago: false,
      pagamentoReferencia: null,
      pagamentosPagos: [],
      faixaAtual: parsed.data.faixaAtual || null,
      graus: parsed.data.graus ?? 0,
      ativo: true,
      userId: null,
      user: null,
      createdAt: now,
    });

    res.status(201).json({ data: aluno });
  } catch (error) {
    next(error);
  }
});

alunosRoutes.patch('/:alunoId', async (req, res, next) => {
  try {
    const parsed = alunoSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const existing = database.alunos.find((item) => item.id === req.params.alunoId);

    if (!existing) {
      res.status(404).json({ message: 'Aluno nao encontrado.' });
      return;
    }

    const aluno = await updateAluno({
      ...existing,
      nome: parsed.data.nome,
      apelido: parsed.data.apelido || null,
      foto: parsed.data.foto || null,
      emailResponsavel: parsed.data.emailResponsavel || undefined,
      celular: parsed.data.celular || undefined,
      dataNascimento: parsed.data.dataNascimento,
      dataPagamento: parsed.data.dataPagamento || null,
      faixaAtual: parsed.data.faixaAtual || null,
      graus: parsed.data.graus ?? 0,
    });

    const refreshed = await readDatabase();
    res.json({ data: alunoWithDetails(refreshed, aluno) });
  } catch (error) {
    next(error);
  }
});

alunosRoutes.post('/:alunoId/vincular-user', async (req, res, next) => {
  try {
    const parsed = vincularUserSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const aluno = database.alunos.find((item) => item.id === req.params.alunoId);
    const user = database.users.find((item) => item.id === parsed.data.user_id);

    if (!aluno) {
      res.status(404).json({ message: 'Aluno nao encontrado.' });
      return;
    }

    if (!user) {
      res.status(404).json({ message: 'Usuario nao encontrado.' });
      return;
    }

    const updatedAluno = await updateAluno({ ...aluno, userId: user.id });
    const updatedUser = await updateUser({ ...user, alunoId: aluno.id });

    res.json({ data: { ...updatedAluno, user: userPreview(updatedUser) } });
  } catch (error) {
    next(error);
  }
});

alunosRoutes.patch('/:alunoId/pagamento', async (req, res, next) => {
  try {
    const parsed = pagamentoSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const aluno = database.alunos.find((item) => item.id === req.params.alunoId);

    if (!aluno) {
      res.status(404).json({ message: 'Aluno nao encontrado.' });
      return;
    }

    const updatedAluno = await updateAluno({
      ...aluno,
      dataPagamento: parsed.data.data_pagamento,
    });
    res.json({ data: alunoWithDetails(database, updatedAluno) });
  } catch (error) {
    next(error);
  }
});

alunosRoutes.patch('/:alunoId/pagamento-status', async (req, res, next) => {
  try {
    const parsed = pagamentoStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const aluno = database.alunos.find((item) => item.id === req.params.alunoId);

    if (!aluno) {
      res.status(404).json({ message: 'Aluno nao encontrado.' });
      return;
    }

    const pagamentosPagos = new Set(
      aluno.pagamentosPagos ??
        (aluno.pagamentoPago && aluno.pagamentoReferencia ? [aluno.pagamentoReferencia] : [])
    );

    if (parsed.data.pago) {
      pagamentosPagos.add(parsed.data.referencia);
    } else {
      pagamentosPagos.delete(parsed.data.referencia);
    }

    const updatedAluno = await updateAluno({
      ...aluno,
      pagamentosPagos: [...pagamentosPagos].sort(),
      pagamentoPago: parsed.data.pago,
      pagamentoReferencia: parsed.data.referencia,
    });
    res.json({ data: alunoWithDetails(database, updatedAluno) });
  } catch (error) {
    next(error);
  }
});

alunosRoutes.patch('/:alunoId/ativo', async (req, res, next) => {
  try {
    const parsed = ativoSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const aluno = database.alunos.find((item) => item.id === req.params.alunoId);

    if (!aluno) {
      res.status(404).json({ message: 'Aluno nao encontrado.' });
      return;
    }

    const updatedAluno = await updateAluno({
      ...aluno,
      ativo: parsed.data.ativo,
    });

    const user = findLinkedUser(await readDatabase(), updatedAluno);
    if (user) {
      await updateUser({ ...user, ativo: parsed.data.ativo });
    }

    const refreshed = await readDatabase();
    res.json({ data: alunoWithDetails(refreshed, updatedAluno) });
  } catch (error) {
    next(error);
  }
});

alunosRoutes.patch('/:alunoId/desativar-user', async (req, res, next) => {
  try {
    const database = await readDatabase();
    const aluno = database.alunos.find((item) => item.id === req.params.alunoId);

    if (!aluno) {
      res.status(404).json({ message: 'Aluno nao encontrado.' });
      return;
    }

    const updatedAluno = await updateAluno({
      ...aluno,
      ativo: false,
    });

    const user = findLinkedUser(await readDatabase(), updatedAluno);
    if (user) {
      await updateUser({ ...user, ativo: false });
    }

    const refreshed = await readDatabase();
    res.json({ data: alunoWithDetails(refreshed, updatedAluno) });
  } catch (error) {
    next(error);
  }
});

alunosRoutes.post('/:alunoId/desvincular-user', async (req, res, next) => {
  try {
    const database = await readDatabase();
    const aluno = database.alunos.find((item) => item.id === req.params.alunoId);

    if (!aluno) {
      res.status(404).json({ message: 'Aluno nao encontrado.' });
      return;
    }

    if (!aluno.userId) {
      res.status(400).json({ message: 'Aluno nao possui usuario vinculado.' });
      return;
    }

    const user = database.users.find((item) => item.id === aluno.userId);

    if (!user) {
      const updatedAluno = await updateAluno({ ...aluno, userId: null, user: null });
      res.json({ data: alunoWithDetails(await readDatabase(), updatedAluno) });
      return;
    }

    await updateUser({ ...user, ativo: false, alunoId: null });
    const updatedAluno = await updateAluno({ ...aluno, userId: null, user: null });
    const refreshed = await readDatabase();

    res.json({ data: alunoWithDetails(refreshed, updatedAluno) });
  } catch (error) {
    next(error);
  }
});
