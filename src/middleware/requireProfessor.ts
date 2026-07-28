import type { NextFunction, Request, Response } from 'express';

export function requireProfessor(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.tipo !== 1) {
    res.status(403).json({ message: 'Acesso permitido apenas para professor.' });
    return;
  }

  next();
}
