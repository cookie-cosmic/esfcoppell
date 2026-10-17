import { db, getSetting, newId, nowIso, audit, approvedTotalFor } from '../db.js';
import { ApiError, isDate, isTime, syncDurationHours, validReal } from './http.js';
import { newAccessCode } from './passwords.js';
import type { AdminPrincipal } from './auth.js';

export interface HourRules {
  max_hours_per_submission: number;
  max_hours_per_day: number;
  sync_tolerance_hours: number;
  async_max_hours: number;
  async_rule_text: string;
  duplicate_window_days: number;
}
export const hourRules = () => getSetting<HourRules>('hour_rules');

export interface SubmissionInput {
  first_name: string;
  last_name: string;
  email: string;
  school_level: string;
  event_type: 'synchronous' | 'asynchronous';
  event_name: string;
  event_id?: string | null;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  total_hours: number;
  approver_primary: string;
  approver_secondary?: string | null;
  access_code?: string | null;
}

export interface ValidationResult {
  errors: Record<string, string>;
  normalized: SubmissionInput | null;
  computedHours: number | null;
}

/** Full server-side validation of a volunteer-hour submission. Never trusts client hours blindly. */
export function validateSubmission(raw: Record<string, unknown>): ValidationResult {
  const rules = hourRules();
  const levels = getSetting<{ key: string; label: string }[]>('school_levels').map((l) => l.key);
  const errors: Record<string, string> = {};
  const s = (k: string, max = 200) => (typeof raw[k] === 'string' ? (raw[k] as string).trim().slice(0, max) : '');

  const first_name = s('first_name', 80);
  const last_name = s('last_name', 80);
  const email = s('email', 120).toLowerCase();
  const school_level = s('school_level', 40);
  const event_type = s('event_type', 20);
  const event_name = s('event_name', 160);
  const event_date = s('event_date', 10);
  const start_time = s('start_time', 5) || null;
  const end_time = s('end_time', 5) || null;
  const approver_primary = s('approver_primary', 120);
  const approver_secondary = s('approver_secondary', 120) || null;
  const access_code = s('access_code', 30).toUpperCase() || null;

  if (!first_name) errors.first_name = 'First name is required.';
  if (!last_name) errors.last_name = 'Last name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'A valid email is required so you can track your submission.';
  if (!levels.includes(school_level)) errors.school_level = 'Select a school level.';
  if (event_type !== 'synchronous' && event_type !== 'asynchronous') errors.event_type = 'Select an event type.';
  if (!event_name) errors.event_name = 'Event or activity name is required.';
  if (!isDate(event_date)) errors.event_date = 'Event date is required (YYYY-MM-DD).';
  else {
    const d = new Date(`${event_date}T00:00:00Z`).getTime();
    if (Number.isNaN(d)) errors.event_date = 'Invalid date.';
    else if (d > Date.now() + 24 * 3_600_000) errors.event_date = 'Event date cannot be in the future.';
    else if (d < Date.now() - 400 * 24 * 3_600_000) errors.event_date = 'Event date is too far in the past.';
  }
  if (!approver_primary) errors.approver_primary = 'A primary approver (supervisor/teacher) is required.';

  const maxForType = event_type === 'asynchronous' ? rules.async_max_hours : rules.max_hours_per_submission;
  const hours = validReal(raw.total_hours, 0.25, rules.max_hours_per_submission);
  if (hours === null) {
    errors.total_hours = `Total hours must be a number between 0.25 and ${rules.max_hours_per_submission}.`;
  } else if (hours > maxForType) {
    errors.total_hours =
      event_type === 'asynchronous'
        ? `Asynchronous submissions are capped at ${rules.async_max_hours} hours. See the hour rules below the form.`
        : `A single submission cannot exceed ${rules.max_hours_per_submission} hours.`;
  }

  let computedHours: number | null = null;
  if (event_type === 'synchronous') {
    if (!isTime(start_time ?? '')) errors.start_time = 'Start time (HH:MM) is required for synchronous activities.';
    if (!isTime(end_time ?? '')) errors.end_time = 'End time (HH:MM) is required for synchronous activities.';
    if (!errors.start_time && !errors.end_time && start_time && end_time) {
      computedHours = syncDurationHours(start_time, end_time);
      if (computedHours > rules.max_hours_per_day) {
        errors.end_time = 'Computed duration exceeds 24 hours; check the start/end times.';
      } else if (hours !== null && Math.abs(computedHours - hours) > rules.sync_tolerance_hours) {
        errors.total_hours = `Reported hours (${hours}) do not match the start/end times (computed ${computedHours}h${
          computedHours !== null && end_time! <= start_time! ? ', spanning midnight' : ''
        }). Adjust times or hours, or ask an administrator if the activity spanned multiple days.`;
      }
    }
  } else if (start_time || end_time) {
    // Optional times on async work: still sanity-check them if provided.
    if (start_time && !isTime(start_time)) errors.start_time = 'Invalid time format (HH:MM).';
    if (end_time && !isTime(end_time)) errors.end_time = 'Invalid time format (HH:MM).';
    if (start_time && end_time && !errors.start_time && !errors.end_time) {
      computedHours = syncDurationHours(start_time, end_time);
    }
  }

  const normalized: SubmissionInput = {
    first_name,
    last_name,
    email,
    school_level,
    event_type: event_type as 'synchronous' | 'asynchronous',
    event_name,
    event_id: typeof raw.event_id === 'string' ? raw.event_id : null,
    event_date,
    start_time,
    end_time,
    total_hours: hours ?? 0,
    approver_primary,
    approver_secondary,
    access_code,
  };

  return { errors, normalized: Object.keys(errors).length ? null : normalized, computedHours };
}

export interface CreatedSubmission {
  submission_id: string;
  access_code: string | null;
  is_new_access_code: boolean;
  status: 'pending';
}

/** Creates student (or links by email), issues/reuses a tracking code, stores a PENDING submission. */
export function createSubmission(input: SubmissionInput, computedHours: number | null): CreatedSubmission {
  return db.transaction(() => {
    let student = db.prepare('SELECT id FROM students WHERE email = ?').get(input.email) as { id: string } | undefined;
    if (input.access_code) {
      const linked = db.prepare('SELECT student_id FROM access_codes WHERE code = ?').get(input.access_code) as { student_id: string } | undefined;
      if (!linked) throw new ApiError(422, 'That dedicated PIN was not found. Check it and try again.');
      const linkedStudent = db.prepare('SELECT id, email FROM students WHERE id = ?').get(linked.student_id) as { id: string; email: string | null } | undefined;
      if (!linkedStudent || linkedStudent.email !== input.email) {
        throw new ApiError(422, 'That dedicated PIN does not match the email on this submission.');
      }
      student = { id: linked.student_id };
    }
    let studentId: string;
    if (student) {
      studentId = student.id;
      db.prepare('UPDATE students SET first_name = ?, last_name = ?, school_level = ?, updated_at = ? WHERE id = ?').run(
        input.first_name,
        input.last_name,
        input.school_level,
        nowIso(),
        studentId
      );
    } else {
      studentId = newId('stu');
      db.prepare(
        'INSERT INTO students (id, first_name, last_name, email, school_level, active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)'
      ).run(studentId, input.first_name, input.last_name, input.email, input.school_level, nowIso(), nowIso());
    }

    // Duplicate guard: same student + event + date + hours recently submitted.
    const dup = db
      .prepare(
        `SELECT id, status FROM submissions
         WHERE student_id = ? AND event_name = ? AND event_date = ? AND total_hours = ?`
      )
      .get(studentId, input.event_name, input.event_date, input.total_hours) as { id: string; status: string } | undefined;
    if (dup) {
      throw new ApiError(
        409,
        `A submission for "${input.event_name}" on ${input.event_date} with ${input.total_hours} hours already exists (status: ${dup.status}). Use your tracking code to check its status instead of resubmitting.`
      );
    }

    let codeRow = db.prepare('SELECT code FROM access_codes WHERE student_id = ?').get(studentId) as { code: string } | undefined;
    if (codeRow && !input.access_code) {
      throw new ApiError(422, 'Enter the dedicated PIN tied to this account before submitting again.');
    }
    let code: string | null;
    let isNewAccessCode = false;
    if (codeRow) {
      code = codeRow.code;
    } else {
      code = newAccessCode();
      db.prepare('INSERT INTO access_codes (code, student_id, created_at) VALUES (?,?,?)').run(code, studentId, nowIso());
      isNewAccessCode = true;
    }

    const id = newId('sub');
    db.prepare(
      `INSERT INTO submissions
        (id, student_id, event_id, event_name, event_type, event_date, start_time, end_time, total_hours, computed_hours,
         approver_primary, approver_secondary, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?)`
    ).run(
      id,
      studentId,
      input.event_id,
      input.event_name,
      input.event_type,
      input.event_date,
      input.start_time,
      input.end_time,
      input.total_hours,
      computedHours,
      input.approver_primary,
      input.approver_secondary,
      nowIso()
    );
    return { submission_id: id, access_code: isNewAccessCode ? code : null, is_new_access_code: isNewAccessCode, status: 'pending' as const };
  })();
}

/** Replace the data on a correction-requested submission and return it to review. */
export function correctSubmission(submissionId: string, accessCode: string, input: SubmissionInput, computedHours: number | null) {
  return db.transaction(() => {
    const link = db.prepare('SELECT student_id FROM access_codes WHERE code = ?').get(accessCode) as { student_id: string } | undefined;
    if (!link) throw new ApiError(404, 'Dedicated PIN not found.');
    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(submissionId, link.student_id) as { id: string; status: string } | undefined;
    if (!sub) throw new ApiError(404, 'Submission not found for that PIN.');
    if (sub.status !== 'correction_requested') throw new ApiError(409, 'This submission is not waiting for a correction.');
    const ts = nowIso();
    db.prepare(
      `UPDATE submissions SET event_id=?, event_name=?, event_type=?, event_date=?, start_time=?, end_time=?,
       total_hours=?, computed_hours=?, approver_primary=?, approver_secondary=?, status='pending',
       decline_reason=NULL, decided_at=NULL, decided_by=NULL, admin_note=NULL WHERE id=?`
    ).run(
      input.event_id,
      input.event_name,
      input.event_type,
      input.event_date,
      input.start_time,
      input.end_time,
      input.total_hours,
      computedHours,
      input.approver_primary,
      input.approver_secondary,
      submissionId
    );
    audit(null, `Student ${link.student_id}`, 'submission.correction_submitted', 'submission', submissionId, { submitted_at: ts });
    return { submission_id: submissionId, status: 'pending' as const };
  })();
}

export interface DecisionResult {
  idempotent: boolean;
  submission_id: string;
  status: string;
  record_id?: string;
}

/**
 * Approve a pending submission. Atomic + idempotent:
 *  - unique partial index on decisions(action='approve') and UNIQUE(service_records.submission_id)
 *    guarantee hours can never be counted twice, even under repeated/concurrent requests.
 */
export function approveSubmission(submissionId: string, admin: AdminPrincipal, note?: string): DecisionResult {
  return db.transaction(() => {
    const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) as
      | { id: string; status: string; student_id: string; event_name: string; event_date: string; event_type: string; total_hours: number }
      | undefined;
    if (!sub) throw new ApiError(404, 'Submission not found.');
    if (sub.status === 'approved') {
      const existing = db.prepare('SELECT id FROM service_records WHERE submission_id = ?').get(submissionId) as { id: string };
      return { idempotent: true, submission_id: sub.id, status: 'approved', record_id: existing?.id };
    }
    if (sub.status !== 'pending' && sub.status !== 'correction_requested') {
      throw new ApiError(409, `Cannot approve a submission with status "${sub.status}".`);
    }
    const ts = nowIso();
    db.prepare('UPDATE submissions SET status = ?, decided_at = ?, decided_by = ?, admin_note = COALESCE(?, admin_note) WHERE id = ?')
      .run('approved', ts, admin.id, note ?? null, submissionId);
    db.prepare('INSERT INTO decisions (id, submission_id, admin_id, action, reason, created_at) VALUES (?,?,?,?,?,?)').run(
      newId('dec'),
      submissionId,
      admin.id,
      'approve',
      note ?? null,
      ts
    );
    const recordId = newId('rec');
    db.prepare(
      `INSERT INTO service_records (id, student_id, submission_id, event_name, event_date, event_type, hours, status, source, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?, 'active', 'submission', ?, ?, ?)`
    ).run(recordId, sub.student_id, submissionId, sub.event_name, sub.event_date, sub.event_type, sub.total_hours, admin.id, ts, ts);
    audit(admin.id, admin.name, 'submission.approve', 'submission', submissionId, {
      student_id: sub.student_id,
      hours: sub.total_hours,
      record_id: recordId,
    });
    return { idempotent: false, submission_id: sub.id, status: 'approved', record_id: recordId };
  })();
}

export function declineSubmission(submissionId: string, admin: AdminPrincipal, reason: string): DecisionResult {
  if (!reason || reason.trim().length < 3) throw new ApiError(400, 'A decline reason is required.');
  return db.transaction(() => {
    const sub = db.prepare('SELECT id, status, student_id FROM submissions WHERE id = ?').get(submissionId) as
      | { id: string; status: string; student_id: string }
      | undefined;
    if (!sub) throw new ApiError(404, 'Submission not found.');
    if (sub.status === 'declined') return { idempotent: true, submission_id: sub.id, status: 'declined' };
    if (sub.status === 'approved') throw new ApiError(409, 'Submission already approved; reverse the service record instead.');
    const ts = nowIso();
    db.prepare('UPDATE submissions SET status = ?, decline_reason = ?, decided_at = ?, decided_by = ? WHERE id = ?').run(
      'declined',
      reason.trim(),
      ts,
      admin.id,
      submissionId
    );
    db.prepare('INSERT INTO decisions (id, submission_id, admin_id, action, reason, created_at) VALUES (?,?,?,?,?,?)').run(
      newId('dec'),
      submissionId,
      admin.id,
      'decline',
      reason.trim(),
      ts
    );
    audit(admin.id, admin.name, 'submission.decline', 'submission', submissionId, { reason: reason.trim() });
    return { idempotent: false, submission_id: sub.id, status: 'declined' };
  })();
}

export function requestCorrection(submissionId: string, admin: AdminPrincipal, reason: string): DecisionResult {
  if (!reason || reason.trim().length < 3) throw new ApiError(400, 'Explain what needs to be corrected.');
  const sub = db.prepare('SELECT id, status FROM submissions WHERE id = ?').get(submissionId) as { id: string; status: string } | undefined;
  if (!sub) throw new ApiError(404, 'Submission not found.');
  if (sub.status === 'approved') throw new ApiError(409, 'Approved submissions are corrected via the service record.');
  const ts = nowIso();
  db.prepare('UPDATE submissions SET status = ?, decline_reason = ?, decided_at = ?, decided_by = ? WHERE id = ?').run(
    'correction_requested',
    reason.trim(),
    ts,
    admin.id,
    submissionId
  );
  db.prepare('INSERT INTO decisions (id, submission_id, admin_id, action, reason, created_at) VALUES (?,?,?,?,?,?)').run(
    newId('dec'),
    submissionId,
    admin.id,
    'request_correction',
    reason.trim(),
    ts
  );
  audit(admin.id, admin.name, 'submission.request_correction', 'submission', submissionId, { reason: reason.trim() });
  return { idempotent: false, submission_id: sub.id, status: 'correction_requested' };
}

export function addReviewNote(submissionId: string, admin: AdminPrincipal, note: string) {
  if (!note.trim()) throw new ApiError(400, 'Note is empty.');
  const sub = db.prepare('SELECT id FROM submissions WHERE id = ?').get(submissionId) as { id: string } | undefined;
  if (!sub) throw new ApiError(404, 'Submission not found.');
  db.prepare('INSERT INTO decisions (id, submission_id, admin_id, action, reason, created_at) VALUES (?,?,?,?,?,?)').run(
    newId('dec'),
    submissionId,
    admin.id,
    'note',
    note.trim(),
    nowIso()
  );
  audit(admin.id, admin.name, 'submission.note', 'submission', submissionId, {});
  return { ok: true };
}

/** Reverse an incorrect approval: record stops counting; history preserved. */
export function reverseRecord(recordId: string, admin: AdminPrincipal, reason: string) {
  if (!reason || reason.trim().length < 3) throw new ApiError(400, 'A reason is required to reverse a record.');
  return db.transaction(() => {
    const rec = db.prepare('SELECT * FROM service_records WHERE id = ?').get(recordId) as
      | { id: string; status: string; submission_id: string | null; student_id: string; hours: number }
      | undefined;
    if (!rec) throw new ApiError(404, 'Record not found.');
    if (rec.status === 'reversed') return { idempotent: true, record_id: rec.id, status: 'reversed' };
    const ts = nowIso();
    db.prepare('UPDATE service_records SET status = ?, reason = ?, updated_at = ? WHERE id = ?').run('reversed', reason.trim(), ts, recordId);
    if (rec.submission_id) {
      db.prepare('UPDATE submissions SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?').run('pending', ts, admin.id, rec.submission_id);
      db.prepare('INSERT INTO decisions (id, submission_id, admin_id, action, reason, created_at) VALUES (?,?,?,?,?,?)').run(
        newId('dec'),
        rec.submission_id,
        admin.id,
        'reverse',
        reason.trim(),
        ts
      );
    }
    audit(admin.id, admin.name, 'record.reverse', 'service_record', recordId, {
      student_id: rec.student_id,
      hours: rec.hours,
      reason: reason.trim(),
      new_total: approvedTotalFor(rec.student_id),
    });
    return { idempotent: false, record_id: rec.id, status: 'reversed' };
  })();
}

/** Restore a reversed record (a correction), with reason + audit. */
export function restoreRecord(recordId: string, admin: AdminPrincipal, reason: string) {
  if (!reason || reason.trim().length < 3) throw new ApiError(400, 'A reason is required to restore a record.');
  return db.transaction(() => {
    const rec = db.prepare('SELECT * FROM service_records WHERE id = ?').get(recordId) as
      | { id: string; status: string; submission_id: string | null; student_id: string; hours: number }
      | undefined;
    if (!rec) throw new ApiError(404, 'Record not found.');
    if (rec.status === 'active') return { idempotent: true, record_id: rec.id, status: 'active' };
    const ts = nowIso();
    db.prepare('UPDATE service_records SET status = ?, updated_at = ? WHERE id = ?').run('active', ts, recordId);
    if (rec.submission_id) {
      db.prepare('UPDATE submissions SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?').run('approved', ts, admin.id, rec.submission_id);
      db.prepare('INSERT INTO decisions (id, submission_id, admin_id, action, reason, created_at) VALUES (?,?,?,?,?,?)').run(
        newId('dec'),
        rec.submission_id,
        admin.id,
        'restore',
        reason.trim(),
        ts
      );
    }
    audit(admin.id, admin.name, 'record.restore', 'service_record', recordId, { reason: reason.trim(), new_total: approvedTotalFor(rec.student_id) });
    return { idempotent: false, record_id: rec.id, status: 'active' };
  })();
}

/** Correct approved hours on a record (audit + decision trail). */
export function correctRecord(recordId: string, admin: AdminPrincipal, hours: number, reason: string) {
  if (!reason || reason.trim().length < 3) throw new ApiError(400, 'A reason is required to correct hours.');
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new ApiError(400, 'Hours must be between 0 and 24.');
  return db.transaction(() => {
    const rec = db.prepare('SELECT * FROM service_records WHERE id = ?').get(recordId) as
      | { id: string; status: string; submission_id: string | null; student_id: string; hours: number }
      | undefined;
    if (!rec) throw new ApiError(404, 'Record not found.');
    const ts = nowIso();
    db.prepare('UPDATE service_records SET hours = ?, updated_at = ? WHERE id = ?').run(hours, ts, recordId);
    if (rec.submission_id) {
      db.prepare('UPDATE submissions SET total_hours = ? WHERE id = ?').run(hours, rec.submission_id);
      db.prepare('INSERT INTO decisions (id, submission_id, admin_id, action, reason, created_at) VALUES (?,?,?,?,?,?)').run(
        newId('dec'),
        rec.submission_id,
        admin.id,
        'correct',
        `${rec.hours}h → ${hours}h. ${reason.trim()}`,
        ts
      );
    }
    audit(admin.id, admin.name, 'record.correct', 'service_record', recordId, {
      from: rec.hours,
      to: hours,
      reason: reason.trim(),
      new_total: approvedTotalFor(rec.student_id),
    });
    return { record_id: rec.id, hours };
  })();
}
