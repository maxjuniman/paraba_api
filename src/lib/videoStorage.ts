import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Pasta raiz de uploads da API (Api/uploads). */
export const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');
export const VIDEOS_UPLOAD_DIR = path.join(UPLOADS_ROOT, 'videos');

export function ensureVideoUploadDir(): void {
  mkdirSync(VIDEOS_UPLOAD_DIR, { recursive: true });
}

/** Converte caminho relativo salvo no banco em URL publica. */
export function toPublicVideoPath(relativeOrAbsolute: string): string {
  const value = relativeOrAbsolute.trim();
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('uploads/')) return `/${value}`;
  return `/uploads/videos/${path.basename(value)}`;
}

export function absoluteVideoFilePath(storedUrl: string): string | null {
  const publicPath = toPublicVideoPath(storedUrl);
  if (!publicPath.startsWith('/uploads/')) return null;
  return path.join(UPLOADS_ROOT, publicPath.replace(/^\/uploads\//, ''));
}
