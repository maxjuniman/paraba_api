import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { PublicUser, User } from '../types.js';

export function jwtSecret(): string {
  return env.jwtSecret;
}

export function jwtExpiresIn(): SignOptions['expiresIn'] {
  return env.jwtExpiresIn as SignOptions['expiresIn'];
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    celular: user.celular ?? undefined,
    tipo: user.tipo,
    ativo: user.ativo ?? true,
    alunoId: user.alunoId ?? null,
    foto: user.foto ?? null,
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
