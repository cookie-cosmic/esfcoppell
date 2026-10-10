import crypto from 'node:crypto';

/** scrypt-based password hashing (Node built-in, no native deps). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, salt, hash] = stored.split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Human-friendly, non-guessable submission tracking code, e.g. ES-7K2M-Q9XD-44TA */
export function newAccessCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const block = (n: number) =>
    Array.from(crypto.randomBytes(n))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
  return `ES-${block(4)}-${block(4)}-${block(4)}`;
}
