import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { readDatabase, writeDatabase } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';
import type { VideoUpdate } from '../types.js';

export const videosRoutes = Router();
const videosEnabled = process.env.ENABLE_VIDEOS === 'true';

videosRoutes.use(authRequired, requireProfessor);

videosRoutes.use((_req, res, next) => {
  if (!videosEnabled) {
    res.status(503).json({ message: 'Videos estao desabilitados no momento.' });
    return;
  }

  next();
});

const videoSchema = z.object({
  titulo: z.string().trim().min(1, 'Informe o titulo do video.'),
  descricao: z.string().trim().optional(),
  url: z.string().trim().url('Informe uma URL valida do video.'),
  aluno_id: z.string().trim().optional(),
  alunoId: z.string().trim().optional(),
});

videosRoutes.get('/', async (_req, res) => {
  const database = await readDatabase();
  const videos = [...database.videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ data: videos });
});

videosRoutes.post('/', async (req, res) => {
  const parsed = videoSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
    return;
  }

  const database = await readDatabase();
  const alunoId = parsed.data.aluno_id || parsed.data.alunoId || null;

  if (alunoId && !database.alunos.some((aluno) => aluno.id === alunoId)) {
    res.status(404).json({ message: 'Aluno nao encontrado para vincular o video.' });
    return;
  }

  const video: VideoUpdate = {
    id: randomUUID(),
    titulo: parsed.data.titulo,
    descricao: parsed.data.descricao || undefined,
    url: parsed.data.url,
    alunoId,
    createdAt: new Date().toISOString(),
  };

  database.videos.push(video);
  await writeDatabase(database);

  res.status(201).json({ data: video });
});
