import './config/env.js';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { initDatabase } from './lib/db.js';
import { UPLOADS_ROOT, ensureVideoUploadDir } from './lib/videoStorage.js';
import { alunosRoutes } from './routes/alunos.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { calendarioRoutes } from './routes/calendario.routes.js';
import { depoimentosRoutes } from './routes/depoimentos.routes.js';
import { devicesRoutes } from './routes/devices.routes.js';
import { equipeRoutes } from './routes/equipe.routes.js';
import { presencasRoutes } from './routes/presencas.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { videosRoutes } from './routes/videos.routes.js';

const app = express();

function resolveCorsOrigin(): boolean | string | RegExp | (string | RegExp)[] | ((
  requestOrigin: string | undefined,
  callback: (err: Error | null, origin?: boolean | string) => void
) => void) {
  const raw = env.corsOrigin.trim();
  if (!raw || raw === '*') return true;

  const fromEnv = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  // Origins do site de divulgacao (sempre liberados junto com CORS_ORIGIN).
  const defaults = [
    'https://equipeparaba.com.br',
    'https://www.equipeparaba.com.br',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  const allowed = [...new Set([...fromEnv, ...defaults])];

  if (allowed.length === 1) return allowed[0];

  return (requestOrigin, callback) => {
    if (!requestOrigin || allowed.includes(requestOrigin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

ensureVideoUploadDir();

app.use(
  cors({
    origin: resolveCorsOrigin(),
  })
);
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_ROOT, { fallthrough: true, maxAge: '7d' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', database: 'postgres' });
});

app.use('/api/auth', authRoutes);
app.use('/api/alunos', alunosRoutes);
app.use('/api/calendario', calendarioRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/depoimentos', depoimentosRoutes);
app.use('/api/equipe', equipeRoutes);
app.use('/api/presencas', presencasRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/videos', videosRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Rota nao encontrada.' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const message =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Erro interno do servidor.';
  res.status(500).json({ message });
});

async function start() {
  await initDatabase();
  app.listen(env.port, () => {
    console.log(`API Paraba rodando em http://localhost:${env.port}`);
    console.log('Persistencia: PostgreSQL');
  });
}

start().catch((error) => {
  console.error('Falha ao iniciar a API:', error);
  process.exit(1);
});
