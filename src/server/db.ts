import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

// URL.pathname keeps a leading slash before the drive letter on Windows ("/C:/...").
// fileURLToPath normalizes it so the SQLite file remains in the project data directory across restarts.
export const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin','reviewer')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  school_level TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS access_codes (
  code TEXT PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  ends_at TEXT,
  location TEXT,
  online_details TEXT,
  registration_url TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','canceled','completed','archived')),
  image_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  attendance INTEGER,
  achievements TEXT,
  featured_on_home INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_images (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  mode TEXT NOT NULL DEFAULT 'in_person' CHECK (mode IN ('remote','in_person','both')),
  instructions TEXT NOT NULL DEFAULT '',
  hour_eligibility TEXT NOT NULL DEFAULT '',
  hour_limit REAL,
  start_date TEXT,
  end_date TEXT,
  submission_requirements TEXT NOT NULL DEFAULT '',
  image_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  featured_on_home INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('synchronous','asynchronous')),
  event_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  total_hours REAL NOT NULL CHECK (total_hours > 0 AND total_hours <= 24),
  computed_hours REAL,
  approver_primary TEXT NOT NULL,
  approver_secondary TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','correction_requested')),
  decline_reason TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL CHECK (action IN ('approve','decline','request_correction','reverse','restore','correct','note')),
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_decisions_single_approval
  ON decisions(submission_id) WHERE action = 'approve';
CREATE TABLE IF NOT EXISTS service_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  submission_id TEXT UNIQUE REFERENCES submissions(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  hours REAL NOT NULL CHECK (hours > 0 AND hours <= 24),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  source TEXT NOT NULL CHECK (source IN ('submission','manual')),
  reason TEXT,
  created_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_student ON service_records(student_id, status);
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  position_title TEXT NOT NULL,
  position_order INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  email TEXT,
  contact_label TEXT,
  contact_url TEXT,
  photo_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  vacant INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'heart',
  image_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS gallery_items (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  caption TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS custom_stats (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('computed','manual')),
  computed_key TEXT,
  manual_value REAL,
  suffix TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hero_eyebrow TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  hero_image_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  featured_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  featured_event_enabled INTEGER NOT NULL DEFAULT 0,
  mission_title TEXT,
  mission_body TEXT,
  goals_title TEXT,
  stats_title TEXT,
  programs_title TEXT,
  gallery_title TEXT,
  join_title TEXT,
  join_body TEXT,
  cta_primary_label TEXT,
  cta_primary_href TEXT,
  cta_secondary_label TEXT,
  cta_secondary_href TEXT,
  sections_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS content_versions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor_id TEXT,
  actor_label TEXT NOT NULL,
  label TEXT NOT NULL,
  hash TEXT NOT NULL,
  hashes_json TEXT NOT NULL,
  changed_json TEXT NOT NULL,
  counts_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_created ON content_versions(created_at DESC);
`;

db.exec(SCHEMA);
const teamColumns = db.prepare('PRAGMA table_info(team_members)').all() as { name: string }[];
if (!teamColumns.some((column) => column.name === 'photo_position')) {
  db.exec("ALTER TABLE team_members ADD COLUMN photo_position TEXT NOT NULL DEFAULT '50% 50%'");
}
const eventColumns = db.prepare('PRAGMA table_info(events)').all() as { name: string }[];
if (!eventColumns.some((column) => column.name === 'banner_size')) {
  db.exec("ALTER TABLE events ADD COLUMN banner_size TEXT NOT NULL DEFAULT 'standard'");
}

/* ------------------------- settings helpers ------------------------- */

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  medal_requirements: {
    elementary: { silver: 25, gold: 50 },
    middle: { silver: 50, gold: 100 },
    high: { silver: 50, gold: 100 },
  },
  school_levels: [
    { key: 'elementary', label: 'Elementary School' },
    { key: 'middle', label: 'Middle School' },
    { key: 'high', label: 'High School' },
  ],
  event_categories: ['Fundraiser', 'Outreach', 'Seminar', 'Volunteer Session', 'Community Service', 'General'],
  hour_rules: {
    max_hours_per_submission: 12,
    max_hours_per_day: 24,
    sync_tolerance_hours: 0.25,
    async_max_hours: 8,
    async_rule_text:
      'Asynchronous (remote / self-paced) activities are credited at the hours you report, verified by your approvers, up to 8 hours per submission. Keep documentation (photos, files, or a supervisor note) ready if requested.',
    duplicate_window_days: 365,
  },
  directory_visibility: 'public', // public | members | private
  branding: {
    org_name: 'Endless Smiles Foundation',
    chapter_name: 'Coppell Chapter',
    primary: '#C8102E',
    ink: '#15161A',
    blue: '#4BA3E3',
    pink: '#EF0A71',
    gold: '#F0822F',
    logo_url: '/assets/logo.svg',
  },
  socials: {
    enabled: false,
    instagram: '',
    tiktok: '',
    facebook: '',
    youtube: '',
    x: '',
  },
  retention: { allow_hard_delete: false },
};

const getSettingsStmt = db.prepare('SELECT value_json FROM settings WHERE key = ?');
const setSettingsStmt = db.prepare(
  `INSERT INTO settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)
   ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
);

export function getSetting<T>(key: string): T {
  const row = getSettingsStmt.get(key) as { value_json: string } | undefined;
  if (!row) return DEFAULT_SETTINGS[key] as T;
  return JSON.parse(row.value_json) as T;
}
export function setSetting(key: string, value: unknown, actorId: string | null, actorLabel: string) {
  setSettingsStmt.run(key, JSON.stringify(value), nowIso(), actorId);
  audit(actorId, actorLabel, `settings.update:${key}`, 'settings', key, { value });
}
export function allSettings() {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of db.prepare('SELECT key, value_json FROM settings').all() as { key: string; value_json: string }[]) {
    out[row.key] = JSON.parse(row.value_json);
  }
  return out;
}

/* ------------------------- audit ------------------------- */

const auditStmt = db.prepare(
  'INSERT INTO audit_logs (id, actor_id, actor_label, action, entity_type, entity_id, details_json, created_at) VALUES (?,?,?,?,?,?,?,?)'
);
/** Per-request collector so the version history can label each snapshot with the actions that caused it. */
export const auditContext = new AsyncLocalStorage<{ actions: string[] }>();

export function audit(
  actorId: string | null,
  actorLabel: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: unknown = {}
) {
  auditContext.getStore()?.actions.push(action);
  auditStmt.run(newId('aud'), actorId, actorLabel, action, entityType, entityId, JSON.stringify(details ?? {}), nowIso());
}

/* ------------------------- derived stats ------------------------- */

export interface ChapterStats {
  active_volunteers: number;
  approved_hours: number;
  completed_events: number;
  upcoming_events: number;
}

export function computeChapterStats(): ChapterStats {
  const volunteers = db
    .prepare(`SELECT COUNT(DISTINCT student_id) AS n FROM service_records WHERE status = 'active'`)
    .get() as { n: number };
  const hours = db
    .prepare(`SELECT COALESCE(SUM(hours), 0) AS n FROM service_records WHERE status = 'active'`)
    .get() as { n: number };
  const completed = db
    .prepare(`SELECT COUNT(*) AS n FROM events WHERE status IN ('completed','archived')`)
    .get() as { n: number };
  const upcoming = db
    .prepare(`SELECT COUNT(*) AS n FROM events WHERE status = 'published' AND starts_at IS NOT NULL AND starts_at >= ?`)
    .get(nowIso()) as { n: number };
  return {
    active_volunteers: volunteers.n,
    approved_hours: Math.round(hours.n * 100) / 100,
    completed_events: completed.n,
    upcoming_events: upcoming.n,
  };
}

/** Approved-hour totals per student, derived only from active service records. */
export function approvedTotalsByStudent(): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT student_id, SUM(hours) AS total FROM service_records WHERE status = 'active' GROUP BY student_id`
    )
    .all() as { student_id: string; total: number }[];
  return new Map(rows.map((r) => [r.student_id, Math.round(r.total * 100) / 100]));
}

export function approvedTotalFor(studentId: string): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(hours), 0) AS total FROM service_records WHERE student_id = ? AND status = 'active'`)
    .get(studentId) as { total: number };
  return Math.round(row.total * 100) / 100;
}
