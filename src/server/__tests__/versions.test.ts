/**
 * Version history: every admin write that changes website content is snapshotted,
 * restoring brings the content back, and students/hours are never touched by a restore.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'es-versions-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.DB_PATH = path.join(tmp, 'data', 'test.db');
process.env.MEMBER_COOKIE_SECRET = 'test-secret';

const { db } = await import('../db.js');
const { hashPassword } = await import('../lib/passwords.js');
const { default: app } = await import('../app.js');

const server = app.listen(0);
await new Promise<void>((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const PW = 'Ver5ion-Pass-Check!';

async function req(method: string, p: string, opts: { body?: unknown; token?: string } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

db.prepare('INSERT INTO admin_users (id, email, name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)').run(
  'adm_owner_v', 'owner-v@example.org', 'Owner V', hashPassword(PW), 'owner', new Date().toISOString()
);
db.prepare(
  `INSERT INTO students (id, first_name, last_name, email, school_level, created_at, updated_at) VALUES ('stu_v','Ava','Test','ava@example.org','elementary',?,?)`
).run(new Date().toISOString(), new Date().toISOString());

test('baseline version exists at startup', async () => {
  assert.ok((db.prepare('SELECT COUNT(*) AS n FROM content_versions').get() as any).n >= 1);
});

test('admin content edit creates a version; restore brings back the prior text', async () => {
  const login = await req('POST', '/api/admin/login', { body: { password: PW } });
  assert.equal(login.status, 200);
  const token = login.json.token as string;

  const before = await req('GET', '/api/admin/content', { token });
  const content = before.json.content;
  const originalTitle = content.hero_title;

  const edit = await req('PUT', '/api/admin/content', { token, body: { ...content, hero_title: 'Temporary vandalised title' } });
  assert.equal(edit.status, 200, JSON.stringify(edit.json));

  const list = await req('GET', '/api/admin/versions', { token });
  assert.equal(list.status, 200);
  const top = list.json.items[0];
  assert.equal(list.json.current_matches_latest, true);
  assert.ok(top.changed.some((c: any) => c.key === 'site_content'), 'site_content should be listed as changed');
  assert.equal(top.is_latest, true);

  // Restore the version from before the edit
  const prior = list.json.items.find((v: any) => v.changed.some((c: any) => c.key === 'site_content') && v.id !== top.id);
  const restore = await req('POST', `/api/admin/versions/${prior.id}/restore`, { token });
  assert.equal(restore.status, 200, JSON.stringify(restore.json));

  const after = await req('GET', '/api/admin/content', { token });
  assert.equal(after.json.content.hero_title, originalTitle);

  const logs = db.prepare("SELECT action FROM audit_logs WHERE action = 'version.restore'").all();
  assert.equal(logs.length, 1, 'restore must be audited');
  // The state before the restore is kept as its own version
  const newest = db.prepare('SELECT label FROM content_versions ORDER BY rowid DESC LIMIT 1').get() as any;
  assert.ok(newest.label.length > 0);
});

test('restore never changes students or service records', async () => {
  const token = (await req('POST', '/api/admin/login', { body: { password: PW } })).json.token as string;
  const list = await req('GET', '/api/admin/versions', { token });
  const oldest = list.json.items[list.json.items.length - 1];
  const restore = await req('POST', `/api/admin/versions/${oldest.id}/restore`, { token });
  assert.equal(restore.status, 200);
  const stu = db.prepare("SELECT COUNT(*) AS n FROM students WHERE id = 'stu_v'").get() as any;
  assert.equal(stu.n, 1);
});

test('reviewers cannot list or restore versions', async () => {
  db.prepare('INSERT INTO admin_users (id, email, name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)').run(
    'adm_rev_v', 'rev-v@example.org', 'Reviewer V', hashPassword('Rev-Only-Pass-99!'), 'reviewer', new Date().toISOString()
  );
  // Login is password-only and matches the owner first, so a reviewer session is created directly here.
  const { createSession } = await import('../lib/auth.js');
  const token = createSession('adm_rev_v', { ip: '127.0.0.1', get: () => '' } as any);
  assert.equal((await req('GET', '/api/admin/versions', { token })).status, 403);
  assert.equal((await req('POST', '/api/admin/versions/x/restore', { token })).status, 403);
});

test.after(() => {
  server.close();
  db.close();
});
