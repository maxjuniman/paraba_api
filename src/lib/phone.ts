/** Digitos locais do celular BR (sem codigo do pais). */
export function normalizePhoneDigits(value?: string | null): string {
  let digits = String(value ?? '').replace(/\D/g, '');

  // Remove codigo do Brasil quando presente (55 + DDD + numero).
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  return digits;
}

export function isValidBrazilMobile(value?: string | null): boolean {
  const digits = normalizePhoneDigits(value);
  return digits.length === 10 || digits.length === 11;
}

export function phonesMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizePhoneDigits(a);
  const right = normalizePhoneDigits(b);
  if (!left || !right) return false;
  return left === right;
}
