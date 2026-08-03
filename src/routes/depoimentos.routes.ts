import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { readDatabase, writeDatabase } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';
import type { Depoimento } from '../types.js';

export const depoimentosRoutes = Router();

const textoSchema = z
  .string()
  .trim()
  .min(10, 'O depoimento deve ter pelo menos 10 caracteres.')
  .max(800, 'O depoimento deve ter no maximo 800 caracteres.');

const meuDepoimentoSchema = z.object({
  texto: textoSchema,
});

const adminCreateSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').optional(),
  texto: textoSchema,
  faixa: z.string().trim().optional().nullable(),
  ativo: z.boolean().optional(),
  ordem: z.number().int().min(0).max(9999).optional(),
});

const adminPatchSchema = z.object({
  nome: z.string().trim().min(1).optional(),
  texto: textoSchema.optional(),
  faixa: z.string().trim().optional().nullable(),
  ativo: z.boolean().optional(),
  ordem: z.number().int().min(0).max(9999).optional(),
});

function isAluno(tipo?: number | string): boolean {
  return tipo === 2 || tipo === 'aluno';
}

function isProfessor(tipo?: number | string): boolean {
  return tipo === 1 || tipo === 'admin' || tipo === 'professor';
}

function publicDepoimento(item: Depoimento) {
  return {
    id: item.id,
    nome: item.nome,
    texto: item.texto,
    faixa: item.faixa ?? null,
    ordem: item.ordem ?? 0,
  };
}

function fullDepoimento(item: Depoimento) {
  return {
    ...publicDepoimento(item),
    userId: item.userId ?? null,
    ativo: item.ativo === true,
    createdAt: item.createdAt,
  };
}

/** Lista publica de depoimentos aprovados (ativo) para o site de divulgacao. */
depoimentosRoutes.get('/public', async (_req, res, next) => {
  try {
    const database = await readDatabase();
    const depoimentos = database.depoimentos
      .filter((item) => item.ativo === true)
      .map(publicDepoimento)
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));

    res.json({ data: depoimentos });
  } catch (error) {
    next(error);
  }
});

depoimentosRoutes.use(authRequired);

depoimentosRoutes.get('/me', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Usuario nao autenticado.' });
      return;
    }

    const database = await readDatabase();
    const mine = database.depoimentos.find((item) => item.userId === userId) ?? null;
    res.json({ data: mine ? fullDepoimento(mine) : null });
  } catch (error) {
    next(error);
  }
});

/** Aluno ou professor deixa/atualiza o proprio depoimento. */
depoimentosRoutes.put('/me', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user?.id) {
      res.status(401).json({ message: 'Usuario nao autenticado.' });
      return;
    }

    if (!isAluno(user.tipo) && !isProfessor(user.tipo)) {
      res.status(403).json({ message: 'Sem permissao para enviar depoimento.' });
      return;
    }

    const parsed = meuDepoimentoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const linkedAluno =
      database.alunos.find((aluno) => aluno.userId === user.id) ||
      (user.alunoId ? database.alunos.find((aluno) => aluno.id === user.alunoId) : undefined);

    const nome =
      linkedAluno?.apelido?.trim() ||
      linkedAluno?.nome?.trim() ||
      user.nome?.trim() ||
      'Aluno';
    const faixa = linkedAluno?.faixaAtual?.trim() || null;

    const existing = database.depoimentos.find((item) => item.userId === user.id);
    const now = new Date().toISOString();
    // Tipo 1 publica direto; tipo 2 fica pendente ate aprovacao do professor.
    const aprovado = isProfessor(user.tipo);

    if (existing) {
      existing.nome = nome;
      existing.texto = parsed.data.texto;
      existing.faixa = faixa;
      existing.ativo = aprovado;
    } else {
      const created: Depoimento = {
        id: randomUUID(),
        nome,
        texto: parsed.data.texto,
        faixa,
        userId: user.id,
        ativo: aprovado,
        ordem: database.depoimentos.length,
        createdAt: now,
      };
      database.depoimentos.push(created);
    }

    await writeDatabase(database);
    const saved = database.depoimentos.find((item) => item.userId === user.id)!;
    res.json({
      data: fullDepoimento(saved),
      message: aprovado
        ? 'Depoimento publicado no site.'
        : 'Depoimento enviado. Aguarde a aprovacao do professor para aparecer no site.',
    });
  } catch (error) {
    next(error);
  }
});

depoimentosRoutes.get('/', requireProfessor, async (_req, res, next) => {
  try {
    const database = await readDatabase();
    const depoimentos = [...database.depoimentos]
      .map(fullDepoimento)
      .sort((a, b) => {
        // Pendentes primeiro para facilitar aprovacao.
        if (a.ativo !== b.ativo) return a.ativo ? 1 : -1;
        return a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR');
      });
    res.json({ data: depoimentos });
  } catch (error) {
    next(error);
  }
});

depoimentosRoutes.post('/', requireProfessor, async (req, res, next) => {
  try {
    const parsed = adminCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const created: Depoimento = {
      id: randomUUID(),
      nome: parsed.data.nome?.trim() || req.user?.nome || 'Equipe Paraba',
      texto: parsed.data.texto,
      faixa: parsed.data.faixa?.trim() || null,
      userId: null,
      ativo: parsed.data.ativo !== false,
      ordem: parsed.data.ordem ?? database.depoimentos.length,
      createdAt: new Date().toISOString(),
    };

    database.depoimentos.push(created);
    await writeDatabase(database);
    res.status(201).json({ data: fullDepoimento(created) });
  } catch (error) {
    next(error);
  }
});

depoimentosRoutes.patch('/:id', requireProfessor, async (req, res, next) => {
  try {
    const parsed = adminPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const item = database.depoimentos.find((depoimento) => depoimento.id === req.params.id);
    if (!item) {
      res.status(404).json({ message: 'Depoimento nao encontrado.' });
      return;
    }

    if (parsed.data.nome !== undefined) item.nome = parsed.data.nome;
    if (parsed.data.texto !== undefined) item.texto = parsed.data.texto;
    if (parsed.data.faixa !== undefined) item.faixa = parsed.data.faixa;
    if (parsed.data.ativo !== undefined) item.ativo = parsed.data.ativo;
    if (parsed.data.ordem !== undefined) item.ordem = parsed.data.ordem;

    await writeDatabase(database);
    res.json({ data: fullDepoimento(item) });
  } catch (error) {
    next(error);
  }
});

depoimentosRoutes.delete('/:id', requireProfessor, async (req, res, next) => {
  try {
    const database = await readDatabase();
    const index = database.depoimentos.findIndex((depoimento) => depoimento.id === req.params.id);
    if (index < 0) {
      res.status(404).json({ message: 'Depoimento nao encontrado.' });
      return;
    }

    const [removed] = database.depoimentos.splice(index, 1);
    await writeDatabase(database);
    res.json({ data: fullDepoimento(removed) });
  } catch (error) {
    next(error);
  }
});
