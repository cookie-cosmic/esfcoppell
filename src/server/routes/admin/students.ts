import { Router } from 'express';
import { db, nowIso, newId, audit, approvedTotalFor, getSetting } from '../../db.js';
import { ah, ApiError, requireFields, validReal, isDate } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { reverseRecord, restoreRecord, correctRecord } from '../../lib/submissions.js';

export const studentsRouter = Router();

studentsRouter.get(
  '/',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner', 'reviewer');
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const level = String(req.query.level ?? '').trim();
    const includeInactive = req.query.includeInactive === 'true';
    const sort = String(req.query.sort ?? 'name').trim();
    let rows = db.prepare(`SELECT * FROM students ${includeInactive ? '' : 'WHERE active = 1'}`).all() as any[];
    const totals = new Map(
      (db.prepare(`SELECT student_id, COALESCE(SUM(hours),0) AS total FROM service_records WHERE status='active' GROUP BY student_id`).all() as any[]).map(
        (r) => [r.student_id, Math.round(r.total * 100) / 100]
      )
    );
    const pending = new Map(
      (db.prepare(`SELECT student_id, COUNT(*) AS n FROM submissions WHERE status IN ('pending','correction_requested') GROUP BY student_id`).all() as any[]).map(
        (r) => [r.student_id, r.n]
      )
    );
    rows = rows.map((r) => ({
      ...r,
      total_hours: totals.get(r.id) ?? 0,
      pending_count: pending.get(r.id) ?? 0,
    }));
    if (search) rows = rows.filter((r) => `${r.first_name} ${r.last_name} ${r.email ?? ''}`.toLowerCase().includes(search));
    if (level) rows = rows.filter((r) => r.school_level === level);
    rows.sort((a, b) =>
      sort === 'hours' ? b.total_hours - a.total_hours : `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    );
    return rows;
  })
);

/** CSV export of student totals (authorized roles only). */
studentsRouter.get(
  '/export.csv',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner');
    const rows = db
      .prepare(
        `SELECT st.first_name, st.last_name, st.email, st.school_level, st.active,
                COALESCE((SELECT SUM(sr.hours) FROM service_records sr WHERE sr.student_id = st.id AND sr.status='active'),0) AS total_hours,
                (SELECT COUNT(*) FROM submissions s WHERE s.student_id = st.id AND s.status IN ('pending','correction_requested')) AS pending_n,
                (SELECT COUNT(*) FROM submissions s WHERE s.student_id = st.id AND s.status = 'approved') AS approved_n,
                (SELECT COUNT(*) FROM submissions s WHERE s.student_id = st.id AND s.status = 'declined') AS declined_n
         FROM students st ORDER BY st.last_name, st.first_name`
      )
      .all() as any[];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const approvalStatus = (r: any) =>
      r.pending_n > 0 ? 'Pending review' : r.approved_n > 0 ? 'Approved' : r.declined_n > 0 ? 'Declined' : 'No submissions';
    const csv = [
      ['first_name', 'last_name', 'email', 'school_level', 'active', 'approval_status', 'total_approved_hours'].join(','),
      ...rows.map((r) =>
        [r.first_name, r.last_name, r.email, r.school_level, r.active ? 'yes' : 'no', approvalStatus(r), r.total_hours].map(esc).join(',')
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="volunteers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  })
);

studentsRouter.get(
  '/:id',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner', 'reviewer');
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id) as any;
    if (!student) throw new ApiError(404, 'Student not found.');
    const records = db.prepare('SELECT * FROM service_records WHERE student_id = ? ORDER BY event_date DESC, created_at DESC').all(student.id) as any[];
    const submissions = db.prepare('SELECT * FROM submissions WHERE student_id = ? ORDER BY created_at DESC').all(student.id) as any[];
    const code = db.prepare('SELECT code FROM access_codes WHERE student_id = ?').get(student.id) as { code: string } | undefined;
    const medals = getSetting<Record<string, { silver: number; gold: number }>>('medal_requirements');
    const reqs = medals[student.school_level] ?? { silver: 50, gold: 100 };
    const total = approvedTotalFor(student.id);
    return {
      student: { ...student, total_hours: total, medal_targets: reqs, access_code: code?.code ?? null },
      records,
      submissions,
    };
  })
);

studentsRouter.post(
  '/',
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    const errors = requireFields(req.body ?? {}, ['first_name', 'last_name', 'school_level']);
    if (Object.keys(errors).length) throw new ApiError(422, 'Missing fields.', errors);
    const id = newId('stu');
    const ts = nowIso();
    db.prepare('INSERT INTO students (id, first_name, last_name, email, school_level, active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)').run(
      id,
      String(req.body.first_name).trim().slice(0, 80),
      String(req.body.last_name).trim().slice(0, 80),
      req.body.email ? String(req.body.email).trim().toLowerCase().slice(0, 120) : null,
      String(req.body.school_level),
      ts,
      ts
    );
    audit(admin.id, admin.name, 'student.create', 'student', id, { email: req.body.email ?? null });
    res.status(201);
    return { id };
  })
);

studentsRouter.patch(
  '/:id',
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id) as any;
    if (!student) throw new ApiError(404, 'Student not found.');
    const { first_name, last_name, email, school_level, active } = req.body ?? {};
    db.prepare('UPDATE students SET first_name = COALESCE(?,first_name), last_name = COALESCE(?,last_name), email = COALESCE(?,email), school_level = COALESCE(?,school_level), active = COALESCE(?,active), updated_at = ? WHERE id = ?').run(
      first_name ?? null,
      last_name ?? null,
      email ?? null,
      school_level ?? null,
      active ?? null,
      nowIso(),
      student.id
    );
    audit(admin.id, admin.name, 'student.update', 'student', student.id, { first_name, last_name, school_level, active });
    return { ok: true };
  })
);

/** Soft-delete by default; hard delete only when the retention setting allows it (owner). */
studentsRouter.delete(
  '/:id',
  ah((req, res) => {
    const admin = requireRole(req, 'owner');
    const retention = getSetting<{ allow_hard_delete: boolean }>('retention');
    const hard = req.query.hard === 'true';
    if (hard && !retention.allow_hard_delete)
      throw new ApiError(403, 'Hard deletion is disabled by the retention policy. The record was deactivated instead.');
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(req.params.id) as any;
    if (!student) throw new ApiError(404, 'Student not found.');
    if (hard) {
      db.prepare('DELETE FROM students WHERE id = ?').run(student.id);
      audit(admin.id, admin.name, 'student.hard_delete', 'student', student.id, {});
    } else {
      db.prepare('UPDATE students SET active = 0, updated_at = ? WHERE id = ?').run(nowIso(), student.id);
      audit(admin.id, admin.name, 'student.deactivate', 'student', student.id, {});
    }
    return { ok: true, hard };
  })
);

/** Manual verified hours — reason required, audited, and marked source='manual'. */
studentsRouter.post(
  '/:id/hours',
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(req.params.id) as any;
    if (!student) throw new ApiError(404, 'Student not found.');
    const body = req.body ?? {};
    const errors = requireFields(body, ['event_name', 'event_date', 'reason']);
    const hours = validReal(body.hours, 0.25, 24);
    if (hours === null) errors.hours = 'Hours must be between 0.25 and 24.';
    if (!isDate(String(body.event_date ?? ''))) errors.event_date = 'Date must be YYYY-MM-DD.';
    const eventType = String(body.event_type ?? 'synchronous');
    if (!['synchronous', 'asynchronous'].includes(eventType)) errors.event_type = 'Invalid event type.';
    if (Object.keys(errors).length) throw new ApiError(422, 'Missing or invalid fields.', errors);
    const id = newId('rec');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO service_records (id, student_id, submission_id, event_name, event_date, event_type, hours, status, source, reason, created_by, created_at, updated_at)
       VALUES (?,?,NULL,?,?,?,?, 'active','manual',?,?,?,?)`
    ).run(id, student.id, String(body.event_name).trim().slice(0, 160), String(body.event_date), eventType, hours!, String(body.reason).trim(), admin.id, ts, ts);
    audit(admin.id, admin.name, 'record.manual_add', 'service_record', id, {
      student_id: student.id,
      hours,
      event_name: body.event_name,
      reason: body.reason,
      new_total: approvedTotalFor(student.id),
    });
    res.status(201);
    return { id, total_hours: approvedTotalFor(student.id) };
  })
);

/* ------------------------- service record corrections ------------------------- */
studentsRouter.post(
  '/records/:id/reverse',
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    return reverseRecord(req.params.id, admin, String(req.body?.reason ?? ''));
  })
);

studentsRouter.post(
  '/records/:id/restore',
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    return restoreRecord(req.params.id, admin, String(req.body?.reason ?? ''));
  })
);

studentsRouter.patch(
  '/records/:id',
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    const hours = validReal(req.body?.hours, 0.25, 24);
    if (hours === null) throw new ApiError(422, 'Hours must be between 0.25 and 24.');
    return correctRecord(req.params.id, admin, hours, String(req.body?.reason ?? ''));
  })
);
