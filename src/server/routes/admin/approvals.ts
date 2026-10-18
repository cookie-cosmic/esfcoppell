import { Router } from 'express';
import { db, computeChapterStats } from '../../db.js';
import { ah, ApiError } from '../../lib/http.js';
import { requireAdmin, requireRole } from '../../lib/auth.js';
import { approveSubmission, approveSubmissions, declineSubmission, requestCorrection, addReviewNote } from '../../lib/submissions.js';

export const approvalsRouter = Router();

/** Overview cards — all derived from the database. */
approvalsRouter.get(
  '/overview',
  ah((req, res) => {
    requireAdmin(req);
    const c = (q: string, ...p: unknown[]) => (db.prepare(q).get(...p) as { n: number }).n;
    const stats = computeChapterStats();
    return {
      active_volunteers: stats.active_volunteers,
      approved_hours: stats.approved_hours,
      pending_submissions: c(`SELECT COUNT(*) AS n FROM submissions WHERE status IN ('pending','correction_requested')`),
      approved_submissions: c(`SELECT COUNT(*) AS n FROM submissions WHERE status = 'approved'`),
      declined_submissions: c(`SELECT COUNT(*) AS n FROM submissions WHERE status = 'declined'`),
      upcoming_events: stats.upcoming_events,
      completed_events: stats.completed_events,
      total_students: c(`SELECT COUNT(*) AS n FROM students WHERE active = 1`),
      recent_activity: db.prepare('SELECT id, actor_label, action, entity_type, entity_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 12').all(),
    };
  })
);

approvalsRouter.get(
  '/submissions',
  ah((req, res) => {
    requireAdmin(req);
    const status = String(req.query.status ?? '').trim();
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const level = String(req.query.level ?? '').trim();
    const event = String(req.query.event ?? '').trim().toLowerCase();
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const where: string[] = [];
    const params: unknown[] = [];
    if (status) {
      where.push('s.status = ?');
      params.push(status);
    }
    if (level) {
      where.push('st.school_level = ?');
      params.push(level);
    }
    if (search) {
      where.push("(LOWER(st.first_name || ' ' || st.last_name) LIKE ? OR LOWER(st.email) LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (event) {
      where.push('LOWER(s.event_name) LIKE ?');
      params.push(`%${event}%`);
    }
    if (from) {
      where.push('s.event_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('s.event_date <= ?');
      params.push(to);
    }
    const sql = `
      SELECT s.*, st.first_name, st.last_name, st.email, st.school_level,
        s.approval_first_name, s.approval_last_name
      FROM submissions s JOIN students st ON st.id = s.student_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'correction_requested' THEN 1 ELSE 2 END, s.created_at DESC
      LIMIT 300`;
    return db.prepare(sql).all(...params);
  })
);

approvalsRouter.post(
  '/submissions/bulk-approve',
  ah((req, res) => {
    const admin = requireRole(req, 'reviewer', 'admin', 'owner');
    const firstName = typeof req.body?.approval_first_name === 'string' ? req.body.approval_first_name.trim().slice(0, 80) : '';
    const lastName = typeof req.body?.approval_last_name === 'string' ? req.body.approval_last_name.trim().slice(0, 80) : '';
    if (!firstName || !lastName) throw new ApiError(422, 'Approver first and last name are required.');
    const ids = Array.isArray(req.body?.submission_ids) ? req.body.submission_ids.filter((id: unknown): id is string => typeof id === 'string') : [];
    const eventName = typeof req.body?.event_name === 'string' && req.body.event_name.trim() ? req.body.event_name.trim() : undefined;
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : undefined;
    return approveSubmissions(ids, eventName, admin, { first_name: firstName, last_name: lastName }, note);
  })
);

approvalsRouter.get(
  '/submissions/:id',
  ah((req, res) => {
    requireAdmin(req);
    const sub = db.prepare('SELECT s.*, st.first_name, st.last_name, st.email, st.school_level FROM submissions s JOIN students st ON st.id = s.student_id WHERE s.id = ?').get(req.params.id) as any;
    if (!sub) throw new ApiError(404, 'Submission not found.');
    const decisions = db
      .prepare(`SELECT d.*, a.name AS admin_name, a.email AS admin_email FROM decisions d JOIN admin_users a ON a.id = d.admin_id WHERE d.submission_id = ? ORDER BY d.created_at`)
      .all(sub.id) as any[];
    const records = db.prepare('SELECT * FROM service_records WHERE submission_id = ?').all(sub.id) as any[];
    const history = db
      .prepare(`SELECT s2.id, s2.status, s2.total_hours, s2.event_date, s2.created_at FROM submissions s2 WHERE s2.student_id = ? ORDER BY s2.created_at DESC LIMIT 25`)
      .all(sub.student_id) as any[];
    return { submission: sub, decisions, records, student_history: history };
  })
);

approvalsRouter.post(
  '/submissions/:id/approve',
  ah((req, res) => {
    const admin = requireRole(req, 'reviewer', 'admin', 'owner');
    const firstName = typeof req.body?.approval_first_name === 'string' ? req.body.approval_first_name.trim().slice(0, 80) : '';
    const lastName = typeof req.body?.approval_last_name === 'string' ? req.body.approval_last_name.trim().slice(0, 80) : '';
    if (!firstName || !lastName) throw new ApiError(422, 'Approver first and last name are required.');
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : undefined;
    return approveSubmission(req.params.id, admin, { first_name: firstName, last_name: lastName }, note);
  })
);

approvalsRouter.post(
  '/submissions/:id/decline',
  ah((req, res) => {
    const admin = requireRole(req, 'reviewer', 'admin', 'owner');
    return declineSubmission(req.params.id, admin, String(req.body?.reason ?? ''));
  })
);

approvalsRouter.post(
  '/submissions/:id/request-correction',
  ah((req, res) => {
    const admin = requireRole(req, 'reviewer', 'admin', 'owner');
    return requestCorrection(req.params.id, admin, String(req.body?.reason ?? ''));
  })
);

approvalsRouter.post(
  '/submissions/:id/note',
  ah((req, res) => {
    const admin = requireRole(req, 'reviewer', 'admin', 'owner');
    return addReviewNote(req.params.id, admin, String(req.body?.note ?? ''));
  })
);

/* ------------------------- audit log (read-only) ------------------------- */
approvalsRouter.get(
  '/audit',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner');
    const action = String(req.query.action ?? '').trim();
    const limit = Math.min(300, parseInt(String(req.query.limit ?? '100'), 10) || 100);
    if (action) return db.prepare('SELECT * FROM audit_logs WHERE action LIKE ? ORDER BY created_at DESC LIMIT ?').all(`${action}%`, limit);
    return db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  })
);
