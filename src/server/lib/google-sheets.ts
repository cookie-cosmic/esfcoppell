import { db } from '../db.js';

const SHEETS_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB?.trim() || 'Submissions';

async function post(payload: Record<string, unknown>, label: string): Promise<boolean> {
  if (!SHEETS_URL) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.text();
    let result: { ok?: boolean; error?: string } | null = null;
    try { result = JSON.parse(body) as { ok?: boolean; error?: string }; } catch { result = null; }
    if (!response.ok || !result?.ok) {
      console.error(`[google-sheets] ${label} failed: HTTP ${response.status} ${result?.error ?? body.slice(0, 240)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[google-sheets] ${label} failed`, error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncSubmissionToGoogleSheet(submissionId: string): Promise<void> {
  const row = db.prepare(`
    SELECT s.id, st.first_name, st.last_name, st.email, st.school_level,
           s.event_name, s.event_type, s.event_date, s.start_time, s.end_time,
           s.total_hours, s.status, s.approver_primary, s.approver_secondary,
           s.decline_reason, s.admin_note, s.created_at, s.decided_at,
           s.approval_first_name, s.approval_last_name
    FROM submissions s
    JOIN students st ON st.id = s.student_id
    WHERE s.id = ?
  `).get(submissionId) as Record<string, unknown> | undefined;
  if (!row) {
    console.error(`[google-sheets] submission ${submissionId} was not found`);
    return;
  }
  await post({ action: 'upsert_submission', sheet: SHEET_TAB, submission: row }, `submission ${submissionId}`);
  const studentId = db.prepare('SELECT student_id FROM submissions WHERE id = ?').get(submissionId) as { student_id: string } | undefined;
  if (studentId) await syncVolunteerToGoogleSheet(studentId.student_id);
}

export async function syncVolunteerToGoogleSheet(studentId: string): Promise<void> {
  const row = db.prepare(`
    SELECT st.id, st.first_name, st.last_name, st.email, st.school_level, st.active, st.created_at, st.updated_at,
      COALESCE((SELECT SUM(sr.hours) FROM service_records sr WHERE sr.student_id = st.id AND sr.status = 'active'), 0) AS total_approved_hours,
      COALESCE((SELECT COUNT(*) FROM submissions s WHERE s.student_id = st.id AND s.status IN ('pending','correction_requested')), 0) AS pending_submission_count,
      COALESCE((SELECT COUNT(*) FROM submissions s WHERE s.student_id = st.id AND s.status = 'approved'), 0) AS approved_submission_count,
      COALESCE((SELECT COUNT(*) FROM submissions s WHERE s.student_id = st.id AND s.status = 'declined'), 0) AS declined_submission_count
    FROM students st
    WHERE st.id = ?
  `).get(studentId) as Record<string, unknown> | undefined;
  if (!row) return;
  const code = db.prepare('SELECT code FROM access_codes WHERE student_id = ?').get(studentId) as { code: string } | undefined;
  const volunteer = { ...row, volunteer_id: row.id, tracking_pin: code?.code ?? '' };
  await post({ action: 'upsert_volunteer', sheet: 'Volunteers', volunteer }, `volunteer ${studentId}`);
}

export async function deleteSubmissionFromGoogleSheet(submissionId: string): Promise<void> {
  await post({ action: 'delete_submission', sheet: SHEET_TAB, submission_id: submissionId }, `delete submission ${submissionId}`);
}

export async function deleteVolunteerFromGoogleSheet(studentId: string): Promise<void> {
  await post({ action: 'delete_volunteer', sheet: 'Volunteers', volunteer_id: studentId }, `delete volunteer ${studentId}`);
}

export async function syncAllGoogleSheets(): Promise<void> {
  if (!SHEETS_URL) return;
  const submissions = db.prepare(`
    SELECT s.id, st.first_name, st.last_name, st.email, st.school_level,
      s.event_name, s.event_type, s.event_date, s.start_time, s.end_time,
      s.total_hours, s.status, s.approver_primary, s.approver_secondary,
      s.decline_reason, s.admin_note, s.created_at, s.decided_at,
      s.approval_first_name, s.approval_last_name
    FROM submissions s JOIN students st ON st.id = s.student_id
  `).all() as { id: string }[];
  for (const submission of submissions) await post({
    action: 'upsert_submission',
    sheet: SHEET_TAB,
    submission,
  }, `initial submission ${submission.id}`);
  const volunteers = db.prepare('SELECT id FROM students').all() as { id: string }[];
  for (const volunteer of volunteers) await syncVolunteerToGoogleSheet(volunteer.id);
}
