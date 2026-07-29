import { Router } from 'express';
import { readDatabase } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';

export const equipeRoutes = Router();

equipeRoutes.use(authRequired);

equipeRoutes.get('/', async (req, res) => {
  if (req.user?.tipo !== 2) {
    res.status(403).json({ message: 'A equipe esta disponivel apenas para usuarios tipo 2.' });
    return;
  }

  const database = await readDatabase();
  const alunos = database.alunos
    .map((aluno) => ({
      id: aluno.id,
      nome: aluno.nome,
      apelido: aluno.apelido ?? null,
      foto: aluno.foto ?? null,
      faixaAtual: aluno.faixaAtual ?? null,
      graus: aluno.graus ?? 0,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  res.json({ data: alunos });
});
