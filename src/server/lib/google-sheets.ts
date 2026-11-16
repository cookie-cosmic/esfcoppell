import { db } from '../db.js';

const SHEETS_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB?.trim() || 'Submissions';

export async function syncSubmissionToGoogleSheet(submissionId: string): Promise<void> {
  if (!SHEETS_URL) return;

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', sheet: SHEET_TAB, submission: row }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`[google-sheets] sync failed for ${submissionId}: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`[google-sheets] sync failed for ${submissionId}`, error);
  } finally {
    clearTimeout(timeout);
  }
}
