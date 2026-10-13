import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { signAccessToken, toPublicUser } from '../lib/auth.js';
import { insertAluno, insertUser, readDatabase, updateUser } from '../lib/db.js';
import { isValidBrazilMobile, phonesMatch } from '../lib/phone.js';
import { authRequired } from '../middleware/authRequired.js';
import type { User } from '../types.js';

export const authRoutes = Router();

const studentRegistrationEnabled = env.enableStudentRegistration;

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

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

const FAIXAS = ['Branca', 'Cinza', 'Amarela', 'Laranja', 'Verde', 'Azul', 'Roxa', 'Marrom', 'Preta'] as const;

const registerSchema = z.object({
  nome: z.string().trim().min(1, 'Informe seu nome.'),
  email: z.string().trim().email('Informe um e-mail valido.'),
  celular: z
    .string()
    .trim()
    .min(1, 'Informe o celular com DDD.')
    .refine((value) => isValidBrazilMobile(value), 'Informe um celular valido com DDD.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
  confirmacao_senha: z.string().min(6),
  apelido: z.string().trim().optional(),
  nomeResponsavel: z.string().trim().optional(),
  emailResponsavel: z.string().trim().email().optional().or(z.literal('')),
  dataNascimento: birthDateSchema,
  dataPagamento: paymentDaySchema.optional(),
  faixaAtual: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || FAIXAS.includes(value as (typeof FAIXAS)[number]), {
      message: 'Faixa invalida.',
    }),
  graus: z.number().int().min(0).max(4).optional(),
  tiposAulaIds: z.array(z.string().trim().min(1)).min(1, 'Selecione ao menos um tipo de aula.'),
});

const updateMeSchema = z.object({
  nome: z.string().trim().min(1, 'Informe seu nome.'),
  celular: z.string().trim().optional().default(''),
  foto: z.string().max(8_000_000).nullable().optional(),
  faixaAtual: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((value) => value == null || value === '' || FAIXAS.includes(value as (typeof FAIXAS)[number]), {
      message: 'Faixa invalida.',
    }),
  graus: z.number().int().min(0).max(4).optional(),
  novaSenha: z.string().min(6, 'A nova senha deve ter pelo menos 6 caracteres.').optional(),
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

authRoutes.post('/register', async (req, res, next) => {
  try {
    if (!studentRegistrationEnabled) {
      res.status(403).json({ message: 'Cadastro de usuario tipo 2 ainda nao esta disponivel.' });
      return;
    }

    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const {
      nome,
      senha,
      confirmacao_senha,
      celular,
      apelido,
      nomeResponsavel,
      emailResponsavel,
      dataNascimento,
      dataPagamento,
      faixaAtual,
      graus,
      tiposAulaIds,
    } = parsed.data;
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

    const knownTipos = new Set(database.tiposAula.map((tipo) => tipo.id));
    const tiposValidos = [...new Set(tiposAulaIds)].filter((id) => knownTipos.has(id));
    if (tiposValidos.length === 0) {
      res.status(400).json({ message: 'Selecione ao menos um tipo de aula valido.' });
      return;
    }

    const duplicateAluno = database.alunos.find((item) => phonesMatch(item.celular, celular));
    if (duplicateAluno) {
      res.status(409).json({
        message: `Ja existe um aluno com este celular (${duplicateAluno.nome}). Fale com o professor.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const userId = randomUUID();
    const alunoId = randomUUID();

    const user = await insertUser({
      id: userId,
      nome,
      email,
      celular,
      passwordHash: await bcrypt.hash(senha, 10),
      tipo: 2,
      ativo: false,
      alunoId,
      createdAt: now,
    });

    const aluno = await insertAluno({
      id: alunoId,
      nome,
      apelido: apelido || null,
      foto: null,
      emailResponsavel: emailResponsavel || undefined,
      nomeResponsavel: nomeResponsavel || null,
      celular,
      dataNascimento,
      dataPagamento: dataPagamento || null,
      pagamentoPago: false,
      pagamentoReferencia: null,
      pagamentosPagos: [],
      faixaAtual: faixaAtual || null,
      graus: graus ?? 0,
      tiposAulaIds: tiposValidos,
      ativo: true,
      userId,
      user: null,
      createdAt: now,
    });

    res.status(201).json({
      message: 'Cadastro enviado. Aguarde a autorizacao do professor para acessar o aplicativo.',
      user: toPublicUser(user),
      aluno: {
        id: aluno.id,
        nome: aluno.nome,
        tiposAulaIds: aluno.tiposAulaIds ?? [],
      },
    });
  } catch (error) {
    next(error);
  }
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
      passwordHash = await bcrypt.hash(parsed.data.novaSenha, 10);
    }

    const updated = await updateUser({
      ...user,
      nome: parsed.data.nome,
      celular: parsed.data.celular || undefined,
      passwordHash,
      ...(parsed.data.foto !== undefined ? { foto: parsed.data.foto } : {}),
      ...(parsed.data.faixaAtual !== undefined
        ? { faixaAtual: parsed.data.faixaAtual?.trim() || null }
        : {}),
      ...(parsed.data.graus !== undefined ? { graus: parsed.data.graus } : {}),
    });

    res.json({ data: toPublicUser(updated) });
  } catch (error) {
    next(error);
  }
});
