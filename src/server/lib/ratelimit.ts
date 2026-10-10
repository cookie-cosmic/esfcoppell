/** Simple in-memory fixed-window rate limiter (per key). */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, maxHits: number, windowMs: number): { ok: boolean; retryInSec: number } {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryInSec: 0 };
  }
  entry.count += 1;
  if (entry.count > maxHits) {
    return { ok: false, retryInSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true, retryInSec: 0 };
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
