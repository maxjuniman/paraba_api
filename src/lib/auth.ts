import jwt, { type SignOptions } from 'jsonwebtoken';
import type { PublicUser, User } from '../types.js';

const defaultExpiresIn = '7d';

export function jwtSecret(): string {
  return process.env.JWT_SECRET || 'paraba-dev-secret';
}

export function jwtExpiresIn(): SignOptions['expiresIn'] {
  return (process.env.JWT_EXPIRES_IN || defaultExpiresIn) as SignOptions['expiresIn'];
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    tipo: user.tipo,
    ativo: user.ativo ?? true,
    alunoId: user.alunoId ?? null,
  };
}

export function signAccessToken(user: User): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      tipo: user.tipo,
    },
    jwtSecret(),
    { expiresIn: jwtExpiresIn() }
  );
}

export function getBearerToken(authorization?: string): string | null {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim() || null;
}
