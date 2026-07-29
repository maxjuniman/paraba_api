import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { readDatabase, writeDatabase } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';
import type { Aluno, PublicUser } from '../types.js';

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

const alunoSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do aluno.'),
  apelido: z.string().trim().optional(),
  emailResponsavel: z.string().trim().email().optional().or(z.literal('')),
  celular: z.string().trim().optional(),
  dataNascimento: z.string().trim().optional(),
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

function userPreview(user?: PublicUser | null) {
  if (!user) return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    ativo: user.ativo ?? true,
  };
}

async function alunosWithUsers(): Promise<Aluno[]> {
  const database = await readDatabase();
  return database.alunos
    .map((aluno) => {
      const user = database.users.find((item) => item.id === aluno.userId);
      return {
        ...aluno,
        user: userPreview(user),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

alunosRoutes.get('/', async (_req, res) => {
  res.json({ data: await alunosWithUsers() });
});

alunosRoutes.post('/', async (req, res) => {
  const parsed = alunoSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
    return;
  }

  const now = new Date().toISOString();
  const aluno: Aluno = {
    id: randomUUID(),
    nome: parsed.data.nome,
    apelido: parsed.data.apelido || null,
    emailResponsavel: parsed.data.emailResponsavel || undefined,
    celular: parsed.data.celular || undefined,
    dataNascimento: parsed.data.dataNascimento || undefined,
    dataPagamento: parsed.data.dataPagamento || null,
    pagamentoPago: false,
    pagamentoReferencia: null,
    faixaAtual: parsed.data.faixaAtual || null,
    graus: parsed.data.graus ?? 0,
    userId: null,
    user: null,
    createdAt: now,
  };

  const database = await readDatabase();
  database.alunos.push(aluno);
  await writeDatabase(database);

  res.status(201).json({ data: aluno });
});

alunosRoutes.post('/:alunoId/vincular-user', async (req, res) => {
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

  aluno.userId = user.id;
  user.alunoId = aluno.id;
  await writeDatabase(database);

  res.json({ data: { ...aluno, user: userPreview(user) } });
});

alunosRoutes.patch('/:alunoId/pagamento', async (req, res) => {
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

  aluno.dataPagamento = parsed.data.data_pagamento;
  await writeDatabase(database);

  const user = database.users.find((item) => item.id === aluno.userId);
  res.json({ data: { ...aluno, user: userPreview(user) } });
});

alunosRoutes.patch('/:alunoId/pagamento-status', async (req, res) => {
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

  aluno.pagamentoPago = parsed.data.pago;
  aluno.pagamentoReferencia = parsed.data.referencia;
  await writeDatabase(database);

  const user = database.users.find((item) => item.id === aluno.userId);
  res.json({ data: { ...aluno, user: userPreview(user) } });
});

alunosRoutes.patch('/:alunoId/desativar-user', async (req, res) => {
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
    res.status(404).json({ message: 'Usuario vinculado nao encontrado.' });
    return;
  }

  user.ativo = false;
  await writeDatabase(database);

  res.json({ data: { ...aluno, user: userPreview(user) } });
});
