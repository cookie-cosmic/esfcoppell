import { Router } from 'express';
import { db, nowIso, newId, audit } from '../../db.js';
import { ah, ApiError } from '../../lib/http.js';
import { hashPassword, randomToken } from '../../lib/passwords.js';
import { createSession, destroySession, requireAdmin, requireRole, sessionCookieOptions, sessionTokensFrom, SESSION_COOKIE } from '../../lib/auth.js';

export const adminAuthRouter = Router();

/**
 * PIN-only staff sign-in. The configured PIN is the sole administrator
 * authentication method; passwords are not accepted by this endpoint.
 */
adminAuthRouter.post(
  '/login',
  ah((req, res) => {
    const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';
    const loginName = typeof req.body?.login_name === 'string' ? req.body.login_name.trim().slice(0, 80) : '';
    if (!pin) throw new ApiError(401, 'Staff PIN required.');
    const configuredPin = process.env.ADMIN_PIN;
    if (!configuredPin || !/^\d{6}$/.test(configuredPin)) throw new ApiError(503, 'Configure a six-digit ADMIN_PIN in the deployment environment.');
    let rows = db.prepare('SELECT * FROM admin_users WHERE active = 1 ORDER BY created_at').all() as {
      id: string; email: string; password_hash: string; role: string; name: string;
    }[];
    if (!rows.length && configuredPin === pin) {
        const id = 'adm_env_owner';
        db.prepare(
          'INSERT OR IGNORE INTO admin_users (id, email, name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)'
        ).run(id, 'admin@configured.local', 'Configured Administrator', hashPassword(randomToken(32)), 'owner', nowIso());
        rows = db.prepare('SELECT * FROM admin_users WHERE active = 1 ORDER BY created_at').all() as typeof rows;
    }
    let matched: typeof rows[number] | undefined;
    if (!/^\d{6}$/.test(pin)) throw new ApiError(401, 'Invalid PIN.');
    if (configuredPin === pin && rows.length) matched = rows[0];
    if (!matched) {
      // constant-ish work to keep timing uniform
      audit(null, 'Unknown sign-in', 'admin.pin_failed', 'admin_session', null, {
        ip: req.ip ?? null,
        method: 'pin',
      });
      throw new ApiError(401, 'Incorrect PIN.');
    }
    const sessionId = createSession(matched.id, req);
    res.cookie(SESSION_COOKIE, sessionId, sessionCookieOptions());
    audit(matched.id, loginName || matched.name, 'admin.pin_login', 'admin_user', matched.id, {
      ip: req.ip ?? null,
      method: 'pin',
      account_name: matched.name,
      entered_name: loginName || matched.name,
    });
    return { ok: true, token: sessionId, admin: { id: matched.id, email: matched.email, name: matched.name, role: matched.role } };
  })
);

adminAuthRouter.post(
  '/logout',
  ah((req, res) => {
    for (const token of sessionTokensFrom(req)) destroySession(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  })
);

adminAuthRouter.get(
  '/session',
  ah((req) => {
    const admin = requireAdmin(req);
    return { admin };
  })
);

/* -------------------- administrator management (owner only) -------------------- */
adminAuthRouter.get(
  '/admins',
  ah((req) => {
    requireRole(req, 'owner');
    return db.prepare('SELECT id, email, name, role, active, created_at FROM admin_users ORDER BY created_at').all();
  })
);

adminAuthRouter.post(
  '/admins',
  ah((req, res) => {
    const owner = requireRole(req, 'owner');
    const { email, name, role } = req.body ?? {};
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ApiError(422, 'Valid email required.');
    if (!['admin', 'reviewer'].includes(String(role))) throw new ApiError(422, 'Role must be admin or reviewer.');
    const id = newId('adm');
    try {
      db.prepare('INSERT INTO admin_users (id, email, name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)').run(
        id,
        String(email).toLowerCase(),
        String(name ?? '').slice(0, 80) || String(email).split('@')[0],
        hashPassword(randomToken(32)),
        String(role),
        nowIso()
      );
    } catch {
      throw new ApiError(409, 'An administrator with that email already exists.');
    }
    audit(owner.id, owner.name, 'admin.create', 'admin_user', id, { email, role });
    res.status(201);
    return { id };
  })
);

adminAuthRouter.patch(
  '/admins/:id',
  ah((req) => {
    const owner = requireRole(req, 'owner');
    const target = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id) as any;
    if (!target) throw new ApiError(404, 'Administrator not found.');
    const { role, active, name } = req.body ?? {};
    if (target.id === owner.id && (role !== undefined && role !== 'owner')) throw new ApiError(400, 'You cannot demote your own owner account.');
    if (target.id === owner.id && active === 0) throw new ApiError(400, 'You cannot deactivate your own account.');
    if (role !== undefined && !['owner', 'admin', 'reviewer'].includes(String(role))) throw new ApiError(422, 'Invalid role.');
    db.prepare('UPDATE admin_users SET role = COALESCE(?, role), active = COALESCE(?, active), name = COALESCE(?, name) WHERE id = ?').run(
      role ?? null,
      active ?? null,
      name ?? null,
      target.id
    );
    audit(owner.id, owner.name, 'admin.update', 'admin_user', target.id, { role, active, name });
    return { ok: true };
  })
);
