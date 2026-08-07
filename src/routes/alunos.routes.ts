import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { insertAluno, readDatabase, updateAluno, updateUser, deleteAluno } from '../lib/db.js';
import { isValidBrazilMobile, phonesMatch } from '../lib/phone.js';
import { MAX_ALUNOS_POR_USER } from '../lib/vinculos.js';
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
  nomeResponsavel: z.string().trim().optional(),
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

const senhaAlunoSchema = z
  .object({
    senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
    confirmacao_senha: z.string().min(6, 'Confirme a senha.'),
  })
  .refine((body) => body.senha === body.confirmacao_senha, {
    message: 'A confirmacao de senha nao confere.',
    path: ['confirmacao_senha'],
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

function findAlunoByCelular(
  alunos: Aluno[],
  celular: string,
  excludeAlunoId?: string
): Aluno | undefined {
  return alunos.find(
    (item) => item.id !== excludeAlunoId && phonesMatch(item.celular, celular)
  );
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

    const database = await readDatabase();
    const duplicate = findAlunoByCelular(database.alunos, parsed.data.celular);
    if (duplicate) {
      res.status(409).json({
        message: `Ja existe um aluno com este celular (${duplicate.nome}).`,
      });
      return;
    }

    const now = new Date().toISOString();
    const aluno = await insertAluno({
      id: randomUUID(),
      nome: parsed.data.nome,
      apelido: parsed.data.apelido || null,
      foto: parsed.data.foto || null,
      emailResponsavel: parsed.data.emailResponsavel || undefined,
      nomeResponsavel: parsed.data.nomeResponsavel || null,
      celular: parsed.data.celular,
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

    const duplicate = findAlunoByCelular(database.alunos, parsed.data.celular, existing.id);
    if (duplicate) {
      res.status(409).json({
        message: `Ja existe um aluno com este celular (${duplicate.nome}).`,
      });
      return;
    }

    const aluno = await updateAluno({
      ...existing,
      nome: parsed.data.nome,
      apelido: parsed.data.apelido || null,
      foto: parsed.data.foto !== undefined ? parsed.data.foto || null : existing.foto,
      emailResponsavel:
        parsed.data.emailResponsavel !== undefined
          ? parsed.data.emailResponsavel || undefined
          : existing.emailResponsavel,
      nomeResponsavel:
        parsed.data.nomeResponsavel !== undefined
          ? parsed.data.nomeResponsavel || null
          : existing.nomeResponsavel,
      celular: parsed.data.celular,
      dataNascimento: parsed.data.dataNascimento,
      dataPagamento:
        parsed.data.dataPagamento !== undefined
          ? parsed.data.dataPagamento || null
          : existing.dataPagamento,
      faixaAtual:
        parsed.data.faixaAtual !== undefined ? parsed.data.faixaAtual || null : existing.faixaAtual,
      graus: parsed.data.graus !== undefined ? parsed.data.graus : (existing.graus ?? 0),
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

    if (user.tipo !== 2) {
      res.status(400).json({ message: 'Apenas usuarios alunos podem ser vinculados a cadastros de aluno.' });
      return;
    }

    if (aluno.userId && aluno.userId !== user.id) {
      res.status(409).json({ message: 'Este aluno ja esta vinculado a outro usuario.' });
      return;
    }

    if (aluno.userId === user.id) {
      res.json({ data: { ...alunoWithDetails(database, aluno), user: userPreview(user) } });
      return;
    }

    const vinculados = database.alunos.filter((item) => item.userId === user.id);
    if (vinculados.length >= MAX_ALUNOS_POR_USER) {
      res.status(400).json({
        message: `Cada usuario pode ter no maximo ${MAX_ALUNOS_POR_USER} alunos vinculados.`,
      });
      return;
    }

    const updatedAluno = await updateAluno({ ...aluno, userId: user.id });
    const updatedUser = await updateUser({
      ...user,
      ativo: true,
      alunoId: user.alunoId || aluno.id,
    });

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

alunosRoutes.patch('/:alunoId/senha', async (req, res, next) => {
  try {
    const parsed = senhaAlunoSchema.safeParse(req.body);
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

    const user = findLinkedUser(database, aluno);
    if (!user || !aluno.userId) {
      res.status(400).json({ message: 'Este aluno nao possui usuario vinculado.' });
      return;
    }

    await updateUser({
      ...user,
      passwordHash: await bcrypt.hash(parsed.data.senha, 10),
    });

    res.json({
      message: 'Senha atualizada com sucesso.',
      data: {
        alunoId: aluno.id,
        userId: user.id,
        email: user.email,
      },
    });
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

    const refreshed = await readDatabase();
    const user = findLinkedUser(refreshed, updatedAluno);

    if (user) {
      if (parsed.data.ativo) {
        await updateUser({ ...user, ativo: true });
      } else {
        const outrosAtivos = refreshed.alunos.some(
          (item) => item.id !== updatedAluno.id && item.userId === user.id && item.ativo !== false
        );
        if (!outrosAtivos) {
          await updateUser({ ...user, ativo: false });
        } else if (user.alunoId === updatedAluno.id) {
          const nextPrimary = refreshed.alunos.find(
            (item) => item.id !== updatedAluno.id && item.userId === user.id && item.ativo !== false
          );
          if (nextPrimary) {
            await updateUser({ ...user, alunoId: nextPrimary.id });
          }
        }
      }
    }

    res.json({ data: alunoWithDetails(await readDatabase(), updatedAluno) });
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

    const linkedUserId = aluno.userId;
    const user = database.users.find((item) => item.id === linkedUserId);
    const updatedAluno = await updateAluno({ ...aluno, userId: null, user: null });

    if (!user) {
      res.json({ data: alunoWithDetails(await readDatabase(), updatedAluno) });
      return;
    }

    const remaining = (await readDatabase()).alunos.filter((item) => item.userId === linkedUserId);

    if (remaining.length === 0) {
      await updateUser({ ...user, ativo: false, alunoId: null });
    } else {
      const nextPrimary =
        user.alunoId && remaining.some((item) => item.id === user.alunoId)
          ? user.alunoId
          : remaining[0]?.id ?? null;
      await updateUser({ ...user, alunoId: nextPrimary });
    }

    const refreshed = await readDatabase();
    res.json({ data: alunoWithDetails(refreshed, updatedAluno) });
  } catch (error) {
    next(error);
  }
});

alunosRoutes.delete('/:alunoId', async (req, res, next) => {
  try {
    const database = await readDatabase();
    const aluno = database.alunos.find((item) => item.id === req.params.alunoId);

    if (!aluno) {
      res.status(404).json({ message: 'Aluno nao encontrado.' });
      return;
    }

    if (aluno.ativo !== false) {
      res.status(400).json({ message: 'Desative o aluno antes de excluir.' });
      return;
    }

    await deleteAluno(aluno.id);
    res.json({
      data: {
        id: aluno.id,
        nome: aluno.nome,
      },
      message: 'Aluno excluido com sucesso.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Aluno nao encontrado.') {
      res.status(404).json({ message: error.message });
      return;
    }
    next(error);
  }
});
