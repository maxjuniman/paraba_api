import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { readDatabase, writeDatabase } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import type { Aluno, PublicUser } from '../types.js';

export const alunosRoutes = Router();

alunosRoutes.use(authRequired);

const alunoSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do aluno.'),
  emailResponsavel: z.string().trim().email().optional().or(z.literal('')),
  celular: z.string().trim().optional(),
  dataNascimento: z.string().trim().optional(),
  dataPagamento: z.string().trim().optional(),
});

const vincularUserSchema = z.object({
  user_id: z.string().trim().min(1, 'Informe o usuario.'),
});

const pagamentoSchema = z.object({
  data_pagamento: z.string().trim().min(1, 'Informe a data de pagamento.'),
});

function userPreview(user?: PublicUser | null) {
  if (!user) return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
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
    emailResponsavel: parsed.data.emailResponsavel || undefined,
    celular: parsed.data.celular || undefined,
    dataNascimento: parsed.data.dataNascimento || undefined,
    dataPagamento: parsed.data.dataPagamento || null,
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
