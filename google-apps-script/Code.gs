const DEFAULT_SUBMISSION_TAB = 'Submissions';
const DEFAULT_VOLUNTEER_TAB = 'Volunteers';

// Optional for standalone Apps Script projects. Leave blank when the script is bound to the sheet.
// In Project Settings, a Script Property named SPREADSHEET_ID can also be used.
const SPREADSHEET_ID = '';

function getSpreadsheet() {
  const configuredId = SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (configuredId) return SpreadsheetApp.openById(configuredId);
  const bound = SpreadsheetApp.getActiveSpreadsheet();
  if (bound) return bound;

  const matches = DriveApp.getFilesByName('Endless Smiles BACKUP Responses Sheet');
  if (matches.hasNext()) return SpreadsheetApp.openById(matches.next().getId());
  return null;
}

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const spreadsheet = getSpreadsheet();
    if (!spreadsheet) return json({ ok: false, error: 'Set SPREADSHEET_ID or bind this script to the destination spreadsheet.' });

    if (request.action === 'upsert_submission') {
      if (!request.submission || !request.submission.id) return json({ ok: false, error: 'Submission with an id is required.' });
      upsertSubmission(spreadsheet, request.sheet || DEFAULT_SUBMISSION_TAB, request.submission);
      return json({ ok: true, submission_id: request.submission.id, status: request.submission.status });
    }

    if (request.action === 'upsert_volunteer') {
      if (!request.volunteer || !request.volunteer.id) return json({ ok: false, error: 'Volunteer with an id is required.' });
      upsertVolunteer(spreadsheet, request.sheet || DEFAULT_VOLUNTEER_TAB, request.volunteer);
      return json({ ok: true, volunteer_id: request.volunteer.id });
    }

    if (request.action === 'delete_submission' && request.submission_id) {
      deleteRow(spreadsheet, request.sheet || DEFAULT_SUBMISSION_TAB, 'submission_id', request.submission_id);
      return json({ ok: true, deleted_submission_id: request.submission_id });
    }

    if (request.action === 'delete_volunteer' && request.volunteer_id) {
      deleteRow(spreadsheet, request.sheet || DEFAULT_VOLUNTEER_TAB, 'volunteer_id', request.volunteer_id);
      return json({ ok: true, deleted_volunteer_id: request.volunteer_id });
    }

    // Backward-compatible payload from the original integration.
    if (request.action === 'upsert' && request.submission) {
      upsertSubmission(spreadsheet, request.sheet || DEFAULT_SUBMISSION_TAB, request.submission);
      return json({ ok: true, submission_id: request.submission.id, status: request.submission.status });
    }

    return json({ ok: false, error: 'Unsupported action.' });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function upsertSubmission(spreadsheet, sheetName, submission) {
  const headers = [
    'submission_id', 'first_name', 'last_name', 'email', 'school_level',
    'event_name', 'event_type', 'event_date', 'start_time', 'end_time',
    'total_hours', 'approval_status', 'approver_primary', 'approver_secondary',
    'decline_reason', 'admin_note', 'submitted_at', 'decided_at',
    'approval_first_name', 'approval_last_name'
  ];
  const values = headers.map((header) => {
    const value = submission[header === 'approval_status' ? 'status' : header];
    return value == null ? '' : value;
  });
  upsertRow(spreadsheet, sheetName, 'submission_id', submission.id, headers, values);
}

function upsertVolunteer(spreadsheet, sheetName, volunteer) {
  const headers = [
    'volunteer_id', 'first_name', 'last_name', 'email', 'school_level',
    'active', 'total_approved_hours', 'pending_submission_count',
    'approved_submission_count', 'declined_submission_count', 'tracking_pin',
    'created_at', 'updated_at'
  ];
  const values = headers.map((header) => volunteer[header] == null ? '' : volunteer[header]);
  upsertRow(spreadsheet, sheetName, 'volunteer_id', volunteer.id, headers, values);
}

function upsertRow(spreadsheet, sheetName, idHeader, id, headers, values) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const existingHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
    : [];
  if (existingHeaders.slice(0, headers.length).join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const idColumn = headers.indexOf(idHeader) + 1;
  const ids = sheet.getLastRow() > 1
    ? sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getValues()
    : [];
  const existingIndex = ids.findIndex((row) => String(row[0]) === String(id));
  if (existingIndex >= 0) {
    sheet.getRange(existingIndex + 2, 1, 1, headers.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
}

function deleteRow(spreadsheet, sheetName, idHeader, id) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idColumn = headers.indexOf(idHeader) + 1;
  if (!idColumn) return;
  const ids = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getValues();
  for (let index = ids.length - 1; index >= 0; index--) {
    if (String(ids[index][0]) === String(id)) sheet.deleteRow(index + 2);
  }
}

function doGet() {
  const spreadsheet = getSpreadsheet();
  return json({
    ok: Boolean(spreadsheet),
    service: 'endless-smiles-google-sheets',
    sheet: spreadsheet ? spreadsheet.getName() : null,
  });
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
