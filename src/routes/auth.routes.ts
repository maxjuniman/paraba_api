import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { signAccessToken, toPublicUser } from '../lib/auth.js';
import { insertUser, readDatabase, updateUser } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import type { User } from '../types.js';

export const authRoutes = Router();

const studentRegistrationEnabled = env.enableStudentRegistration;

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
});

const updateMeSchema = z
  .object({
    nome: z.string().trim().min(1, 'Informe seu nome.'),
    celular: z.string().trim().optional().default(''),
    senhaAtual: z.string().optional(),
    novaSenha: z.string().min(6, 'A nova senha deve ter pelo menos 6 caracteres.').optional(),
  })
  .superRefine((body, ctx) => {
    if (body.novaSenha && !body.senhaAtual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe a senha atual para alterar a senha.',
        path: ['senhaAtual'],
      });
    }
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

  if (user.ativo === false) {
    res.status(403).json({ message: 'Seu cadastro ainda precisa ser autorizado pelo professor.' });
    return;
  }

  res.json(sessionPayload(user));
});

authRoutes.post('/register', async (req, res) => {
  if (!studentRegistrationEnabled) {
    res.status(403).json({ message: 'Cadastro de usuario tipo 2 ainda nao esta disponivel.' });
    return;
  }

  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
    return;
  }

  const { nome, senha, confirmacao_senha } = parsed.data;
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

  const now = new Date().toISOString();
  const user = await insertUser({
    id: randomUUID(),
    nome,
    email,
    celular: parsed.data.celular || undefined,
    passwordHash: await bcrypt.hash(senha, 10),
    tipo: 2,
    ativo: false,
    alunoId: null,
    createdAt: now,
  });

  res.status(201).json({
    message: 'Cadastro enviado. Aguarde a autorizacao do professor para acessar o aplicativo.',
    user: toPublicUser(user),
  });
});

authRoutes.get('/me', authRequired, async (req, res) => {
  const database = await readDatabase();
  const user = database.users.find((item) => item.id === req.user?.id);

  if (!user) {
    res.status(404).json({ message: 'Usuario nao encontrado.' });
    return;
  }

  res.json({ data: toPublicUser(user) });
});

authRoutes.patch('/me', authRequired, async (req, res, next) => {
  try {
    const parsed = updateMeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const user = database.users.find((item) => item.id === req.user?.id);

    if (!user) {
      res.status(404).json({ message: 'Usuario nao encontrado.' });
      return;
    }

    let passwordHash = user.passwordHash;

    if (parsed.data.novaSenha) {
      const matches = await bcrypt.compare(parsed.data.senhaAtual ?? '', user.passwordHash);
      if (!matches) {
        res.status(400).json({ message: 'Senha atual incorreta.' });
        return;
      }
      passwordHash = await bcrypt.hash(parsed.data.novaSenha, 10);
    }

    const updated = await updateUser({
      ...user,
      nome: parsed.data.nome,
      celular: parsed.data.celular || undefined,
      passwordHash,
    });

    res.json({ data: toPublicUser(updated) });
  } catch (error) {
    next(error);
  }
});
