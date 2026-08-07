import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { readDatabase, writeDatabase } from '../lib/db.js';
import {
  absoluteVideoFilePath,
  ensureVideoUploadDir,
  toPublicVideoPath,
  VIDEOS_UPLOAD_DIR,
} from '../lib/videoStorage.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';
import type { VideoUpdate } from '../types.js';

export const videosRoutes = Router();

ensureVideoUploadDir();

const ALLOWED_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/mpeg',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureVideoUploadDir();
    cb(null, VIDEOS_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || mimeToExt(file.mimetype);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Formato de video nao suportado. Use MP4, WebM ou MOV.'));
      return;
    }
    cb(null, true);
  },
});

const metaSchema = z.object({
  titulo: z.string().trim().min(1, 'Informe o titulo do video.'),
  descricao: z
    .string()
    .trim()
    .max(2000, 'A descricao deve ter no maximo 2000 caracteres.')
    .optional()
    .or(z.literal('')),
});

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'video/webm':
      return '.webm';
    case 'video/quicktime':
      return '.mov';
    case 'video/mpeg':
      return '.mpeg';
    case 'video/x-m4v':
      return '.m4v';
    default:
      return '.mp4';
  }
}

function toPublicVideo(video: VideoUpdate) {
  return {
    id: video.id,
    titulo: video.titulo,
    descricao: video.descricao ?? null,
    url: toPublicVideoPath(video.url),
    createdAt: video.createdAt,
  };
}

async function removeStoredFile(storedUrl: string): Promise<void> {
  const absolute = absoluteVideoFilePath(storedUrl);
  if (!absolute) return;
  try {
    await unlink(absolute);
  } catch {
    // Arquivo ja ausente — ignora.
  }
}

videosRoutes.use(authRequired);

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

/** Apenas professor (tipo 1) publica — multipart: titulo, descricao?, video. */
videosRoutes.post('/', requireProfessor, (req, res, next) => {
  upload.single('video')(req, res, (err: unknown) => {
    if (err) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : 'Falha no upload do video.';
      res.status(400).json({ message });
      return;
    }
    void (async () => {
      try {
        const parsed = metaSchema.safeParse({
          titulo: req.body?.titulo,
          descricao: req.body?.descricao,
        });
        if (!parsed.success) {
          if (req.file?.path) await removeStoredFile(req.file.filename);
          res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
          return;
        }

        if (!req.file) {
          res.status(400).json({ message: 'Envie o arquivo de video.' });
          return;
        }

        const database = await readDatabase();
        const relativeUrl = `/uploads/videos/${req.file.filename}`;
        const video: VideoUpdate = {
          id: randomUUID(),
          titulo: parsed.data.titulo,
          descricao: parsed.data.descricao?.trim() || undefined,
          url: relativeUrl,
          alunoId: null,
          createdAt: new Date().toISOString(),
        };

        database.videos.push(video);
        await writeDatabase(database);
        res.status(201).json({ data: toPublicVideo(video) });
      } catch (error) {
        if (req.file?.filename) await removeStoredFile(req.file.filename);
        next(error);
      }
    })();
  });
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
    await removeStoredFile(removed.url);
    res.json({ data: toPublicVideo(removed) });
  } catch (error) {
    next(error);
  }
});
