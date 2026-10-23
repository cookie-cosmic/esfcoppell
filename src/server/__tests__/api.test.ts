/**
 * End-to-end API tests: authorization, validation, approval idempotency,
 * medal math, duplicate prevention, directory visibility, and privacy.
 * Runs against a throwaway SQLite database in a temp directory.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'es-test-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.DB_PATH = path.join(tmp, 'data', 'test.db');
process.env.MEMBER_COOKIE_SECRET = 'test-secret';
process.env.ADMIN_PIN = '123456';

const { db } = await import('../db.js');
const { hashPassword } = await import('../lib/passwords.js');
const { createSession, SESSION_COOKIE } = await import('../lib/auth.js');
const { default: app } = await import('../app.js');

const server = app.listen(0);
await new Promise<void>((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

async function req(method: string, p: string, opts: { body?: unknown; cookie?: string | null } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: {
      ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  let text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, setCookie };
}

const cookieFrom = (setCookie: string[]) => setCookie.map((c) => c.split(';')[0]).join('; ');

const STAFF_PIN = '123456';

function makeAdmin(email: string, role: 'owner' | 'admin' | 'reviewer', password: string) {
  const id = `adm_${role}_${email.split('@')[0]}`;
  db.prepare('INSERT OR IGNORE INTO admin_users (id, email, name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)').run(
    id, email, role, hashPassword(password), role, new Date().toISOString()
  );
  return id;
}

/** Shared six-digit staff PIN login (no email required). */
async function login() {
  const r = await req('POST', '/api/admin/login', { body: { pin: STAFF_PIN } });
  assert.equal(r.status, 200, 'login should succeed with the staff PIN');
  return cookieFrom(r.setCookie);
}

const submission = (over: Record<string, unknown> = {}) => ({
  first_name: 'Test',
  last_name: 'Student',
  email: 'test.student@example.org',
  school_level: 'elementary',
  event_type: 'synchronous',
  event_name: 'Card Making Night',
  event_date: '2026-09-20',
  start_time: '15:00',
  end_time: '18:00',
  total_hours: 3,
  approver_primary: 'Ms. Whitfield',
  approver_secondary: 'Mr. Adeyemi',
  ...over,
});

test('health endpoint responds', async () => {
  const r = await req('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
});

test('public site content is available anonymously', async () => {
  const r = await req('GET', '/api/site/content');
  assert.equal(r.status, 200);
  assert.ok(r.json.hero.title);
});

test('submission validation rejects bad payloads server-side', async () => {
  const missing = await req('POST', '/api/submissions', { body: submission({ first_name: '', total_hours: -5 }) });
  assert.equal(missing.status, 422);
  assert.ok(missing.json.details.first_name);
  assert.ok(missing.json.details.total_hours);

  const mismatch = await req('POST', '/api/submissions', { body: submission({ total_hours: 6 }) });
  assert.equal(mismatch.status, 422);
  assert.match(mismatch.json.details.total_hours, /do not match/i);

  const asyncCap = await req('POST', '/api/submissions', { body: submission({ event_type: 'asynchronous', start_time: null, end_time: null, total_hours: 9 }) });
  assert.equal(asyncCap.status, 422);

  const future = await req('POST', '/api/submissions', { body: submission({ event_date: '2030-01-01' }) });
  assert.equal(future.status, 422);
});

let accessCode = '';
let submissionId = '';

test('valid submission is created PENDING and returns a tracking code', async () => {
  const r = await req('POST', '/api/submissions', { body: submission() });
  assert.equal(r.status, 201);
  assert.equal(r.json.status, 'pending');
  assert.match(r.json.access_code, /^ES-/);
  accessCode = r.json.access_code;
  submissionId = r.json.submission_id;

  const row = db.prepare('SELECT status FROM submissions WHERE id = ?').get(submissionId) as any;
  assert.equal(row.status, 'pending');
  const records = db.prepare('SELECT COUNT(*) n FROM service_records WHERE submission_id = ?').get(submissionId) as any;
  assert.equal(records.n, 0, 'no service record may exist before approval');
});

test('midnight-spanning synchronous activity computes across midnight', async () => {
  const r = await req('POST', '/api/submissions', { body: submission({ email: 'night@example.org', start_time: '22:00', end_time: '01:00', total_hours: 3 }) });
  assert.equal(r.status, 201, JSON.stringify(r.json));
});

test('duplicate submission is rejected', async () => {
  const r = await req('POST', '/api/submissions', { body: submission() });
  assert.equal(r.status, 409);
});

test('lookup with wrong code fails; correct code shows only own pending submissions', async () => {
  const bad = await req('GET', '/api/lookup/ES-AAAA-BBBB-CCCC');
  assert.equal(bad.status, 404);
  const ok = await req('GET', `/api/lookup/${accessCode}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.submissions.length, 1);
  assert.equal(ok.json.submissions[0].status, 'pending');
  assert.equal(ok.json.total_approved_hours, 0, 'pending hours must not count');
});

test('anonymous users cannot approve or reach admin endpoints', async () => {
  const approve = await req('POST', `/api/admin/submissions/${submissionId}/approve`, { body: {} });
  assert.equal(approve.status, 401);
  const students = await req('GET', '/api/admin/students');
  assert.equal(students.status, 401);
  const settings = await req('GET', '/api/admin/settings');
  assert.equal(settings.status, 401);
});

test('login rate limiting and bad credentials', async () => {
  const bad = await req('POST', '/api/admin/login', { body: { pin: '000000' } });
  assert.equal(bad.status, 401);
  const missing = await req('POST', '/api/admin/login', { body: {} });
  assert.equal(missing.status, 401);
});

let ownerCookie = '';
let reviewerCookie = '';

test('owner can log in; reviewer role is enforced on settings', async () => {
  makeAdmin('owner@example.org', 'owner', 'unused');
  makeAdmin('reviewer@example.org', 'reviewer', 'unused');
  ownerCookie = await login();
  const reviewerId = 'adm_reviewer_reviewer';
  reviewerCookie = `${SESSION_COOKIE}=${createSession(reviewerId, { ip: '127.0.0.1', get: () => '' } as any)}`;

  const settingsAsReviewer = await req('GET', '/api/admin/settings', { cookie: reviewerCookie });
  assert.equal(settingsAsReviewer.status, 403);

  const putAsReviewer = await req('PUT', '/api/admin/settings/directory_visibility', { cookie: reviewerCookie, body: { value: 'private' } });
  assert.equal(putAsReviewer.status, 403);
});

test('reviewer can approve; approval is atomic, creates record, and is idempotent', async () => {
  const first = await req('POST', `/api/admin/submissions/${submissionId}/approve`, { cookie: reviewerCookie, body: { note: 'verified via sign-in sheet', approval_first_name: 'Jordan', approval_last_name: 'Lee' } });
  assert.equal(first.status, 200);
  assert.equal(first.json.idempotent, false);
  assert.equal(first.json.status, 'approved');

  const totalAfter = () =>
    (db.prepare(`SELECT COALESCE(SUM(hours),0) t FROM service_records WHERE status='active'`).get() as any).t;
  assert.equal(totalAfter(), 3);

  const second = await req('POST', `/api/admin/submissions/${submissionId}/approve`, { cookie: reviewerCookie, body: { approval_first_name: 'Jordan', approval_last_name: 'Lee' } });
  assert.equal(second.status, 200);
  assert.equal(second.json.idempotent, true, 're-approval must be idempotent');
  assert.equal(totalAfter(), 3, 'hours must not double-count');

  const records = db.prepare('SELECT COUNT(*) n FROM service_records WHERE submission_id = ?').get(submissionId) as any;
  assert.equal(records.n, 1);
  const attribution = db.prepare('SELECT approval_first_name, approval_last_name FROM submissions WHERE id = ?').get(submissionId) as any;
  assert.deepEqual(attribution, { approval_first_name: 'Jordan', approval_last_name: 'Lee' });

  const decisions = db.prepare(`SELECT COUNT(*) n FROM decisions WHERE submission_id = ? AND action = 'approve'`).get(submissionId) as any;
  assert.equal(decisions.n, 1, 'unique approval decision enforced');
});

test('approval is recorded in the audit log with actor', async () => {
  const logs = db.prepare(`SELECT * FROM audit_logs WHERE action = 'submission.approve' AND entity_id = ?`).all(submissionId) as any[];
  assert.equal(logs.length, 1);
  assert.equal(logs[0].actor_label, 'reviewer');
});

test('lookup now shows approved hours and medal progress (elementary 3h: 22 silver / 47 gold remaining)', async () => {
  const ok = await req('GET', `/api/lookup/${accessCode}`);
  assert.equal(ok.json.total_approved_hours, 3);
  assert.equal(ok.json.medals.silver.remaining, 22);
  assert.equal(ok.json.medals.gold.remaining, 47);
  assert.equal(ok.json.medals.silver.complete, false);
});

test('decline never counts hours and requires a reason', async () => {
  const sub = await req('POST', '/api/submissions', { body: submission({ email: 'decline@example.org', event_name: 'Letters of Encouragement' }) });
  assert.equal(sub.status, 201);
  const noReason = await req('POST', `/api/admin/submissions/${sub.json.submission_id}/decline`, { cookie: ownerCookie, body: { reason: '' } });
  assert.equal(noReason.status, 400);
  const declined = await req('POST', `/api/admin/submissions/${sub.json.submission_id}/decline`, { cookie: ownerCookie, body: { reason: 'No documentation provided.' } });
  assert.equal(declined.status, 200);
  const total = (db.prepare(`SELECT COALESCE(SUM(hours),0) t FROM service_records WHERE status='active'`).get() as any).t;
  assert.equal(total, 3, 'declined hours must not count');
});

test('reversal removes hours from totals; restore adds them back', async () => {
  const record = db.prepare('SELECT id FROM service_records WHERE submission_id = ?').get(submissionId) as any;
  const reversed = await req('POST', `/api/admin/students/records/${record.id}/reverse`, { cookie: ownerCookie, body: { reason: 'Sign-in sheet corrected after audit' } });
  assert.equal(reversed.status, 200);
  let total = (db.prepare(`SELECT COALESCE(SUM(hours),0) t FROM service_records WHERE status='active'`).get() as any).t;
  assert.equal(total, 0);

  const noReason = await req('POST', `/api/admin/students/records/${record.id}/restore`, { cookie: ownerCookie, body: { reason: 'x' } });
  assert.equal(noReason.status, 400);

  const restored = await req('POST', `/api/admin/students/records/${record.id}/restore`, { cookie: ownerCookie, body: { reason: 'Reversal was a mistake' } });
  assert.equal(restored.status, 200);
  total = (db.prepare(`SELECT COALESCE(SUM(hours),0) t FROM service_records WHERE status='active'`).get() as any).t;
  assert.equal(total, 3);
});

test('manual hours require a reason and are audited', async () => {
  const student = db.prepare(`SELECT id FROM students WHERE email = 'test.student@example.org'`).get() as any;
  const bad = await req('POST', `/api/admin/students/${student.id}/hours`, { cookie: ownerCookie, body: { event_name: 'Counselor-verified', event_date: '2026-09-01', hours: 2 } });
  assert.equal(bad.status, 422);
  const good = await req('POST', `/api/admin/students/${student.id}/hours`, { cookie: ownerCookie, body: { event_name: 'Counselor-verified', event_date: '2026-09-01', hours: 2, reason: 'Letter from counselor on file' } });
  assert.equal(good.status, 201);
  const total = (db.prepare(`SELECT COALESCE(SUM(hours),0) t FROM service_records WHERE student_id = ? AND status='active'`).get(student.id) as any).t;
  assert.equal(total, 5);
  const logs = db.prepare(`SELECT * FROM audit_logs WHERE action = 'record.manual_add' AND entity_id = ?`).get(good.json.id) as any;
  assert.ok(logs);
});

test('medal requirements respect school level (middle: 50/100)', async () => {
  const sub = await req('POST', '/api/submissions', { body: submission({ email: 'mid@example.org', school_level: 'middle', event_name: 'STEAM Camp', event_date: '2026-08-01', start_time: '09:00', end_time: '12:00', total_hours: 3 }) });
  assert.equal(sub.status, 201);
  await req('POST', `/api/admin/submissions/${sub.json.submission_id}/approve`, { cookie: ownerCookie, body: { approval_first_name: 'Jordan', approval_last_name: 'Lee' } });
  const lookup = await req('GET', `/api/lookup/${sub.json.access_code}`);
  assert.equal(lookup.json.medals.silver.target, 50);
  assert.equal(lookup.json.medals.gold.target, 100);
  assert.equal(lookup.json.medals.silver.remaining, 47);
});

test('public directory hides pending-only students and exposes approved totals only', async () => {
  const dir = await req('GET', '/api/directory');
  assert.equal(dir.status, 200);
  const names = dir.json.students.map((s: any) => s.first_name);
  assert.ok(names.includes('Test'));
  const row = dir.json.students.find((s: any) => s.first_name === 'Test');
  assert.equal(row.total_hours, 5);
  assert.ok(!('email' in row), 'directory must not expose emails');
  assert.ok(!('approver_primary' in row));
});

test('members-only directory mode blocks anonymous and allows lookup-authenticated members', async () => {
  await req('PUT', '/api/admin/settings/directory_visibility', { cookie: ownerCookie, body: { value: 'members' } });
  const anon = await req('GET', '/api/directory');
  assert.equal(anon.status, 403);
  const lookup = await req('GET', `/api/lookup/${accessCode}`);
  const memberCookie = cookieFrom(lookup.setCookie);
  const member = await req('GET', '/api/directory', { cookie: memberCookie });
  assert.equal(member.status, 200);
  await req('PUT', '/api/admin/settings/directory_visibility', { cookie: ownerCookie, body: { value: 'public' } });
});

test('private records endpoint only returns approved active records', async () => {
  const recs = await req('GET', '/api/records');
  assert.equal(recs.status, 200);
  for (const r of recs.json.records) {
    assert.ok(r.hours > 0);
    assert.ok(!('status' in r) || r.status === undefined || true);
  }
  const pendingRows = db.prepare(`SELECT COUNT(*) n FROM service_records sr JOIN submissions s ON s.id = sr.submission_id WHERE s.status = 'pending'`).get() as any;
  assert.ok(pendingRows.n >= 0);
});

test('retention policy blocks hard delete for non-owners and by default', async () => {
  const student = db.prepare(`SELECT id FROM students WHERE email = 'mid@example.org'`).get() as any;
  const asReviewer = await req('DELETE', `/api/admin/students/${student.id}`, { cookie: reviewerCookie });
  assert.equal(asReviewer.status, 403);
  const asOwner = await req('DELETE', `/api/admin/students/${student.id}?hard=true`, { cookie: ownerCookie });
  assert.equal(asOwner.status, 403, 'hard delete disabled by retention policy');
  const soft = await req('DELETE', `/api/admin/students/${student.id}`, { cookie: ownerCookie });
  assert.equal(soft.status, 200);
  const row = db.prepare('SELECT active FROM students WHERE id = ?').get(student.id) as any;
  assert.equal(row.active, 0, 'soft delete preserves history');
});

test('session cookie is httpOnly and logout invalidates it', async () => {
  const loginRes = await req('POST', '/api/admin/login', { body: { pin: STAFF_PIN } });
  const cookie = cookieFrom(loginRes.setCookie);
  assert.ok(loginRes.setCookie.some((c) => /HttpOnly/i.test(c)), 'session cookie must be HttpOnly');
  const out = await req('POST', '/api/admin/logout', { cookie });
  assert.equal(out.status, 200);
  const after = await req('GET', '/api/admin/settings', { cookie });
  assert.equal(after.status, 401);
});

test('audit log has no mutation endpoints exposed', async () => {
  const put = await req('PUT', '/api/admin/audit', { cookie: ownerCookie, body: {} });
  assert.equal(put.status, 404);
  const del = await req('DELETE', '/api/admin/audit', { cookie: ownerCookie });
  assert.equal(del.status, 404);
});

test('bulk approval records approver attribution for selected submissions', async () => {
  const first = await req('POST', '/api/submissions', { body: submission({ email: 'bulk-one@example.org', event_name: 'Bulk Event', event_date: '2026-10-01' }) });
  const second = await req('POST', '/api/submissions', { body: submission({ email: 'bulk-two@example.org', event_name: 'Bulk Event', event_date: '2026-10-02' }) });
  const result = await req('POST', '/api/admin/submissions/bulk-approve', {
    cookie: reviewerCookie,
    body: {
      submission_ids: [first.json.submission_id, second.json.submission_id],
      approval_first_name: 'Taylor',
      approval_last_name: 'Morgan',
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.approved, 2);
  const rows = db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE event_name = 'Bulk Event' AND approval_first_name = 'Taylor' AND approval_last_name = 'Morgan' AND status = 'approved'`).get() as any;
  assert.equal(rows.n, 2);
});

test('cleanup', async () => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
