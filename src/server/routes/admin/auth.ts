import { Router } from 'express';
import { db, nowIso, newId, audit } from '../../db.js';
import { ah, ApiError } from '../../lib/http.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';
import { createSession, destroySession, requireAdmin, requireRole, sessionCookieOptions, sessionTokensFrom, SESSION_COOKIE } from '../../lib/auth.js';

export const adminAuthRouter = Router();

/**
 * One-time bootstrap: enabled only when ADMIN_SETUP_TOKEN is configured in the environment
 * and no admin accounts exist yet. Creates the initial OWNER account.
 */
adminAuthRouter.post(
  '/setup',
  ah((req, res) => {
    const token = process.env.ADMIN_SETUP_TOKEN;
    if (!token) throw new ApiError(403, 'Setup is disabled. Use `npm run create-admin` on the server host.');
    const existing = (db.prepare('SELECT COUNT(*) AS n FROM admin_users').get() as { n: number }).n;
    if (existing > 0) throw new ApiError(403, 'An administrator already exists; setup is closed.');
    const { token: provided, email, password, name } = req.body ?? {};
    if (provided !== token) throw new ApiError(403, 'Invalid setup token.');
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ApiError(422, 'Valid email required.');
    if (typeof password !== 'string' || password.length < 12) throw new ApiError(422, 'Password must be at least 12 characters.');
    const id = newId('adm');
    db.prepare('INSERT INTO admin_users (id, email, name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)').run(
      id,
      email.toLowerCase(),
      String(name ?? 'Chapter Administrator').slice(0, 80),
      hashPassword(password),
      'owner',
      nowIso()
    );
    audit(id, email, 'admin.bootstrap', 'admin_user', id, { via: 'setup-token' });
    const sessionId = createSession(id, req);
    res.cookie(SESSION_COOKIE, sessionId, sessionCookieOptions());
    res.status(201);
    return { ok: true, role: 'owner' };
  })
);

/**
 * Password-only staff sign-in (chapter request): no email required.
 * The password is matched against active staff accounts; the matched account
 * becomes the session identity used for roles and audit logs.
 */
adminAuthRouter.post(
  '/login',
  ah((req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';
    if (!password && !pin) throw new ApiError(401, 'Password or PIN required.');
    const rows = db.prepare('SELECT * FROM admin_users WHERE active = 1 ORDER BY created_at').all() as {
      id: string; email: string; password_hash: string; role: string; name: string;
    }[];
    let matched: typeof rows[number] | undefined;
    if (pin) {
      if (!/^\d{6}$/.test(pin)) throw new ApiError(401, 'Invalid PIN.');
      const configuredPin = process.env.ADMIN_PIN;
      if (!rows.length) throw new ApiError(503, 'No active administrator is configured. Complete administrator setup first.');
      if (configuredPin && (configuredPin === pin || verifyPassword(pin, configuredPin))) matched = rows[0];
    } else {
      for (const row of rows) {
        if (verifyPassword(password, row.password_hash)) { matched = row; break; }
      }
    }
    if (!matched) {
      // constant-ish work to keep timing uniform
      verifyPassword(pin || password, 'scrypt$00$' + '0'.repeat(128));
      audit(null, 'Unknown sign-in', pin ? 'admin.pin_failed' : 'admin.password_failed', 'admin_session', null, {
        ip: req.ip ?? null,
        method: pin ? 'pin' : 'password',
      });
      throw new ApiError(401, pin ? 'Incorrect PIN.' : 'Incorrect password.');
    }
    const sessionId = createSession(matched.id, req);
    res.cookie(SESSION_COOKIE, sessionId, sessionCookieOptions());
    audit(matched.id, matched.name, pin ? 'admin.pin_login' : 'admin.login', 'admin_user', matched.id, {
      ip: req.ip ?? null,
      method: pin ? 'pin' : 'password',
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
    const { email, name, password, role } = req.body ?? {};
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ApiError(422, 'Valid email required.');
    if (typeof password !== 'string' || password.length < 12) throw new ApiError(422, 'Password must be at least 12 characters.');
    if (!['admin', 'reviewer'].includes(String(role))) throw new ApiError(422, 'Role must be admin or reviewer.');
    const id = newId('adm');
    try {
      db.prepare('INSERT INTO admin_users (id, email, name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)').run(
        id,
        String(email).toLowerCase(),
        String(name ?? '').slice(0, 80) || String(email).split('@')[0],
        hashPassword(password),
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

adminAuthRouter.post(
  '/admins/:id/reset-password',
  ah((req) => {
    const owner = requireRole(req, 'owner');
    const { password } = req.body ?? {};
    if (typeof password !== 'string' || password.length < 12) throw new ApiError(422, 'Password must be at least 12 characters.');
    const target = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(req.params.id) as any;
    if (!target) throw new ApiError(404, 'Administrator not found.');
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hashPassword(password), target.id);
    db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(target.id);
    audit(owner.id, owner.name, 'admin.reset_password', 'admin_user', target.id, {});
    return { ok: true };
  })
);
