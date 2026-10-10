import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db, nowIso } from '../db.js';
import { ApiError } from './http.js';
import { randomToken } from './passwords.js';

export const SESSION_COOKIE = 'es_session';
export const MEMBER_COOKIE = 'es_member';
const SESSION_HOURS = 12;

export interface AdminPrincipal {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'reviewer';
}

export function createSession(adminId: string, req: Request): string {
  const id = randomToken(32);
  const expires = new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString();
  db.prepare('INSERT INTO sessions (id, admin_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)').run(
    id,
    adminId,
    nowIso(),
    expires,
    req.ip ?? null,
    (req.get('user-agent') ?? '').slice(0, 200)
  );
  return id;
}

export function destroySession(id: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_HOURS * 3_600_000,
  };
}

/**
 * Candidate session tokens: the httpOnly cookie and/or an `Authorization: Bearer` header.
 * The header fallback exists because browsers often withhold cookies inside embedded
 * previews. Either may be stale, so each candidate is validated in turn (see attachAdmin).
 */
export function sessionTokensFrom(req: Request): string[] {
  const out: string[] = [];
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (typeof cookie === 'string' && cookie.length >= 20) out.push(cookie);
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(req.get('authorization') ?? '');
  if (m && !out.includes(m[1])) out.push(m[1]);
  return out;
}

/** The token that identifies this request's session, if any (used for logout). */
export function sessionTokenFrom(req: Request): string | null {
  return sessionTokensFrom(req)[0] ?? null;
}

function loadPrincipal(id: string): AdminPrincipal | null {
  const row = db
    .prepare(
      `SELECT a.id, a.email, a.name, a.role, s.expires_at
       FROM sessions s JOIN admin_users a ON a.id = s.admin_id
       WHERE s.id = ? AND a.active = 1`
    )
    .get(id) as { id: string; email: string; name: string; role: AdminPrincipal['role']; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(id);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Attaches req.admin when a valid session exists (never rejects). */
export function attachAdmin(req: Request, _res: Response, next: NextFunction) {
  req.admin = null;
  for (const token of sessionTokensFrom(req)) {
    const principal = loadPrincipal(token);
    if (principal) {
      req.admin = principal;
      break;
    }
  }
  next();
}

export function requireAdmin(req: Request): AdminPrincipal {
  if (!req.admin) throw new ApiError(401, 'Authentication required.');
  return req.admin;
}

const ROLE_RANK: Record<AdminPrincipal['role'], number> = { reviewer: 1, admin: 2, owner: 3 };

export function requireRole(req: Request, ...roles: AdminPrincipal['role'][]): AdminPrincipal {
  const admin = requireAdmin(req);
  if (!roles.includes(admin.role)) {
    throw new ApiError(403, `Your role (${admin.role}) is not authorized for this operation.`);
  }
  return admin;
}

/** Reviewers+ can decide submissions; admins+ manage content; owners manage security/admins. */
export const canReview = (a: AdminPrincipal) => ROLE_RANK[a.role] >= 1;

export function memberCookieValue(req: Request): string | null {
  const v = req.cookies?.[MEMBER_COOKIE];
  return typeof v === 'string' && v.length > 10 ? v : null;
}

export function signMember(studentId: string): string {
  // Opaque, non-guessable member proof tied to a student id (used only for "members" directory mode).
  const hmac = crypto.createHmac('sha256', memberSecret());
  hmac.update(studentId);
  return `${studentId}.${hmac.digest('base64url')}`;
}

export function verifyMember(value: string): string | null {
  const [studentId, sig] = value.split('.');
  if (!studentId || !sig) return null;
  const hmac = crypto.createHmac('sha256', memberSecret());
  hmac.update(studentId);
  const expected = hmac.digest('base64url');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? studentId : null;
  } catch {
    return null;
  }
}

let cachedSecret: string | null = null;
function memberSecret(): string {
  if (cachedSecret) return cachedSecret;
  cachedSecret = process.env.MEMBER_COOKIE_SECRET || 'dev-member-secret-change-me';
  return cachedSecret;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminPrincipal | null;
    }
  }
}
