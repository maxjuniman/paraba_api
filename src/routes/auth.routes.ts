import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { signAccessToken, toPublicUser } from '../lib/auth.js';
import { readDatabase, writeDatabase } from '../lib/db.js';
import type { User, UserType } from '../types.js';

export const authRoutes = Router();

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

const registerSchema = z.object({
  nome: z.string().trim().min(1, 'Informe seu nome.'),
  email: z.string().trim().email('Informe um e-mail valido.'),
  celular: z.string().trim().optional().default(''),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
  confirmacao_senha: z.string().min(6),
  aluno_id: z.string().trim().optional(),
});

function sessionPayload(user: User) {
  return {
    accessToken: signAccessToken(user),
    user: toPublicUser(user),
  };
}

authRoutes.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: 'Informe e-mail e senha validos.' });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const database = await readDatabase();
  const user = database.users.find((item) => item.email.toLowerCase() === email);

  if (!user || !(await bcrypt.compare(parsed.data.senha, user.passwordHash))) {
    res.status(401).json({ message: 'E-mail ou senha invalidos.' });
    return;
  }

  res.json(sessionPayload(user));
});

authRoutes.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
    return;
  }

  const { nome, senha, confirmacao_senha, aluno_id } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  if (senha !== confirmacao_senha) {
    res.status(400).json({ message: 'A confirmacao de senha nao confere.' });
    return;
  }

  const database = await readDatabase();

  if (database.users.some((user) => user.email.toLowerCase() === email)) {
    res.status(409).json({ message: 'Ja existe um usuario com este e-mail.' });
    return;
  }

  const aluno = aluno_id ? database.alunos.find((item) => item.id === aluno_id) : null;

  if (aluno_id && !aluno) {
    res.status(404).json({ message: 'Aluno nao encontrado para vinculo.' });
    return;
  }

  if (aluno?.userId) {
    res.status(409).json({ message: 'Este aluno ja esta vinculado a outro usuario.' });
    return;
  }

  const tipo: UserType = database.users.length === 0 ? 1 : 2;
  const now = new Date().toISOString();
  const user: User = {
    id: randomUUID(),
    nome,
    email,
    celular: parsed.data.celular || undefined,
    passwordHash: await bcrypt.hash(senha, 10),
    tipo,
    alunoId: aluno?.id ?? null,
    createdAt: now,
  };

  database.users.push(user);

  if (aluno) {
    aluno.userId = user.id;
  }

  await writeDatabase(database);

  res.status(201).json(sessionPayload(user));
});
