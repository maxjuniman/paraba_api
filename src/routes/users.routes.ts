import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { toPublicUser } from '../lib/auth.js';
import { insertAluno, insertUser, readDatabase, updateAluno, updateUser } from '../lib/db.js';
import { isValidBrazilMobile, phonesMatch } from '../lib/phone.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';

export const usersRoutes = Router();

usersRoutes.use(authRequired, requireProfessor);

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
  celular: z
    .string()
    .trim()
    .min(1, 'Informe o celular do aluno.')
    .refine((value) => isValidBrazilMobile(value), 'Informe um celular valido com DDD.'),
  dataNascimento: birthDateSchema,
  dataPagamento: paymentDaySchema.optional(),
  faixaAtual: z.string().trim().optional(),
  graus: z.number().int().min(0).max(10).optional(),
});

const autorizarSchema = z
  .object({
    aluno_id: z.string().trim().optional(),
    aluno: alunoSchema.optional(),
  })
  .refine((body) => body.aluno_id || body.aluno, {
    message: 'Informe um aluno existente ou os dados para cadastrar um novo aluno.',
  });

const professorSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do professor.'),
  email: z.string().trim().email('Informe um e-mail valido.'),
  celular: z.string().trim().optional().default(''),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
  confirmacao_senha: z.string().min(6),
});

usersRoutes.get('/pendentes', async (_req, res, next) => {
  try {
    const database = await readDatabase();
    const users = database.users
      .filter((user) => user.tipo === 2 && user.ativo === false)
      .map(toPublicUser)
      .sort((a, b) => a.nome.localeCompare(b.nome));

    res.json({ data: users });
  } catch (error) {
    next(error);
  }
});

usersRoutes.post('/professores', async (req, res, next) => {
  try {
    const parsed = professorSchema.safeParse(req.body);

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
      tipo: 1,
      ativo: true,
      alunoId: null,
      createdAt: now,
    });

    res.status(201).json({
      message: 'Professor cadastrado com sucesso.',
      data: toPublicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

usersRoutes.post('/:userId/autorizar', async (req, res, next) => {
  try {
    const parsed = autorizarSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const user = database.users.find((item) => item.id === req.params.userId);

    if (!user) {
      res.status(404).json({ message: 'Usuario nao encontrado.' });
      return;
    }

    if (user.tipo !== 2) {
      res.status(400).json({ message: 'Apenas usuarios alunos podem ser autorizados por este fluxo.' });
      return;
    }

    let aluno = parsed.data.aluno_id
      ? database.alunos.find((item) => item.id === parsed.data.aluno_id)
      : undefined;

    if (parsed.data.aluno_id && !aluno) {
      res.status(404).json({ message: 'Aluno nao encontrado.' });
      return;
    }

    if (!aluno && parsed.data.aluno) {
      const duplicate = database.alunos.find((item) =>
        phonesMatch(item.celular, parsed.data.aluno?.celular)
      );
      if (duplicate) {
        res.status(409).json({
          message: `Ja existe um aluno com este celular (${duplicate.nome}).`,
        });
        return;
      }

      const now = new Date().toISOString();
      aluno = await insertAluno({
        id: randomUUID(),
        nome: parsed.data.aluno.nome,
        apelido: parsed.data.aluno.apelido || null,
        foto: parsed.data.aluno.foto || null,
        emailResponsavel: parsed.data.aluno.emailResponsavel || undefined,
        celular: parsed.data.aluno.celular,
        dataNascimento: parsed.data.aluno.dataNascimento,
        dataPagamento: parsed.data.aluno.dataPagamento || null,
        pagamentoPago: false,
        pagamentoReferencia: null,
        pagamentosPagos: [],
        faixaAtual: parsed.data.aluno.faixaAtual || null,
        graus: parsed.data.aluno.graus ?? 0,
        ativo: true,
        userId: null,
        user: null,
        createdAt: now,
      });
    }

    if (!aluno) {
      res.status(400).json({ message: 'Informe o aluno para vincular.' });
      return;
    }

    if (aluno.userId && aluno.userId !== user.id) {
      res.status(409).json({ message: 'Este aluno ja esta vinculado a outro usuario.' });
      return;
    }

    const updatedAluno = await updateAluno({ ...aluno, userId: user.id });
    const updatedUser = await updateUser({ ...user, ativo: true, alunoId: aluno.id });

    res.json({
      data: {
        user: toPublicUser(updatedUser),
        aluno: updatedAluno,
      },
    });
  } catch (error) {
    next(error);
  }
});
