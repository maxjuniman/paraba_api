import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL nao configurado. Configure no .env para gravar users, alunos e demais dados no PostgreSQL.'
  );
}

export const env = {
  port: Number(process.env.PORT || 8000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtSecret: process.env.JWT_SECRET || 'troque-este-segredo-em-producao',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  enableStudentRegistration: process.env.ENABLE_STUDENT_REGISTRATION !== 'false',
  enableVideos: process.env.ENABLE_VIDEOS === 'true',
};
