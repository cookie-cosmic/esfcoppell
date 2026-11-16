const DEFAULT_TAB = 'Submissions';
// For a standalone Apps Script project, set this to the destination spreadsheet ID
// or add a Script Property named SPREADSHEET_ID. Leave blank when bound to the sheet.
const SPREADSHEET_ID = '';

function getSpreadsheet() {
  const configuredId = SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return configuredId ? SpreadsheetApp.openById(configuredId) : SpreadsheetApp.getActiveSpreadsheet();
}

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (request.action !== 'upsert' || !request.submission || !request.submission.id) {
      return json({ ok: false, error: 'Expected action=upsert and a submission with an id.' });
    }

    const spreadsheet = getSpreadsheet();
    if (!spreadsheet) return json({ ok: false, error: 'Set SPREADSHEET_ID in this script or bind it to the destination spreadsheet.' });
    const sheetName = request.sheet || DEFAULT_TAB;
    const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);

    const submission = request.submission;
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
    const existingHeaders = sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
      : [];
    if (existingHeaders.slice(0, headers.length).join('|') !== headers.join('|')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    const idColumn = headers.indexOf('submission_id') + 1;
    const ids = sheet.getLastRow() > 1
      ? sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getValues()
      : [];
    const existingIndex = ids.findIndex((row) => String(row[0]) === String(submission.id));
    if (existingIndex >= 0) {
      sheet.getRange(existingIndex + 2, 1, 1, headers.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
    return json({ ok: true, submission_id: submission.id, status: submission.status });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function doGet() {
  const spreadsheet = getSpreadsheet();
  return json({ ok: Boolean(spreadsheet), service: 'endless-smiles-google-sheets', sheet: spreadsheet ? spreadsheet.getName() : null });
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
