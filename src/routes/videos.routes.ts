import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { readDatabase, writeDatabase } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';
import type { VideoUpdate } from '../types.js';

export const videosRoutes = Router();

videosRoutes.use(authRequired);

const videoSchema = z.object({
  titulo: z.string().trim().min(1, 'Informe o titulo do video.'),
  descricao: z.string().trim().max(2000, 'A descricao deve ter no maximo 2000 caracteres.').optional(),
  url: z.string().trim().url('Informe uma URL valida do video.'),
});

function toPublicVideo(video: VideoUpdate) {
  return {
    id: video.id,
    titulo: video.titulo,
    descricao: video.descricao ?? null,
    url: video.url,
    createdAt: video.createdAt,
  };
}

/** Tipo 1 e tipo 2 podem listar os videos. */
videosRoutes.get('/', async (_req, res, next) => {
  try {
    const database = await readDatabase();
    const videos = [...database.videos]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toPublicVideo);

    res.json({ data: videos });
  } catch (error) {
    next(error);
  }
});

/** Apenas professor (tipo 1) publica. */
videosRoutes.post('/', requireProfessor, async (req, res, next) => {
  try {
    const parsed = videoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const database = await readDatabase();
    const video: VideoUpdate = {
      id: randomUUID(),
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao || undefined,
      url: parsed.data.url,
      alunoId: null,
      createdAt: new Date().toISOString(),
    };

    database.videos.push(video);
    await writeDatabase(database);
    res.status(201).json({ data: toPublicVideo(video) });
  } catch (error) {
    next(error);
  }
});

videosRoutes.delete('/:id', requireProfessor, async (req, res, next) => {
  try {
    const database = await readDatabase();
    const index = database.videos.findIndex((item) => item.id === req.params.id);
    if (index < 0) {
      res.status(404).json({ message: 'Video nao encontrado.' });
      return;
    }

    const [removed] = database.videos.splice(index, 1);
    await writeDatabase(database);
    res.json({ data: toPublicVideo(removed) });
  } catch (error) {
    next(error);
  }
});
