import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');
const dbPath = path.join(dataDir, 'db.json');

const emptyDatabase: Database = {
  users: [],
  alunos: [],
  videos: [],
  presencas: [],
};

async function ensureDatabase(): Promise<void> {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dbPath, 'utf8');
  } catch {
    await writeFile(dbPath, JSON.stringify(emptyDatabase, null, 2));
  }
}

export async function readDatabase(): Promise<Database> {
  await ensureDatabase();
  const raw = await readFile(dbPath, 'utf8');
  const database = JSON.parse(raw) as Partial<Database>;

  return {
    users: database.users ?? [],
    alunos: database.alunos ?? [],
    videos: database.videos ?? [],
    presencas: database.presencas ?? [],
  };
}

export async function writeDatabase(database: Database): Promise<void> {
  await ensureDatabase();
  await writeFile(dbPath, JSON.stringify(database, null, 2));
}
