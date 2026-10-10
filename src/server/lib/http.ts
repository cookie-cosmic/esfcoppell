import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;

export const ah = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res))
    .then((out) => {
      if (!res.headersSent) res.json(out === undefined ? { ok: true } : out);
    })
    .catch(next);
};

export function notFound(msg = 'Not found') {
  return new ApiError(404, msg);
}

export const str = (v: unknown, max = 500): string => {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
};

export function requireFields(body: Record<string, unknown>, fields: string[]) {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = body[f];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      errors[f] = 'This field is required.';
    }
  }
  return errors;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v);
export const isTime = (v: unknown): v is string => typeof v === 'string' && TIME_RE.test(v);

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Duration between start and end on a single calendar date.
 * If end <= start the activity is treated as spanning midnight.
 */
export function syncDurationHours(start: string, end: string): number {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const mins = e > s ? e - s : 24 * 60 - s + e; // spans midnight
  return Math.round((mins / 60) * 100) / 100;
}

export function validReal(v: unknown, min: number, max: number): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n) && n >= min && n <= max) return n;
  }
  return null;
}

export function validUrl(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return u.toString();
    return null;
  } catch {
    return null;
  }
}
