import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getBearerToken, jwtSecret, toPublicUser } from '../lib/auth.js';
import { readDatabase } from '../lib/db.js';
import type { PublicUser } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

type JwtPayload = {
  sub?: string;
};

export async function authRequired(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req.header('Authorization'));

  if (!token) {
    res.status(401).json({ message: 'Token de acesso nao informado.' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret()) as JwtPayload;
    const userId = payload.sub;

    if (!userId) {
      res.status(401).json({ message: 'Token de acesso invalido.' });
      return;
    }

    const database = await readDatabase();
    const user = database.users.find((item) => item.id === userId);

    if (!user) {
      res.status(401).json({ message: 'Usuario nao encontrado.' });
      return;
    }

    req.user = toPublicUser(user);
    next();
  } catch {
    res.status(401).json({ message: 'Token de acesso invalido ou expirado.' });
  }
}
