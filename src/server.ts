import cors from 'cors';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { alunosRoutes } from './routes/alunos.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { equipeRoutes } from './routes/equipe.routes.js';
import { presencasRoutes } from './routes/presencas.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { videosRoutes } from './routes/videos.routes.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8000);
const corsOrigin = process.env.CORS_ORIGIN || '*';

app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin,
  })
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/alunos', alunosRoutes);
app.use('/api/equipe', equipeRoutes);
app.use('/api/presencas', presencasRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/videos', videosRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Rota nao encontrada.' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ message: 'Erro interno do servidor.' });
});

app.listen(port, () => {
  console.log(`API Paraba rodando em http://localhost:${port}`);
});
