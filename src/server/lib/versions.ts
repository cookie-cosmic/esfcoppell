/**
 * Website version history.
 *
 * A version is a snapshot of everything the public website is built from (homepage text,
 * team, events, activities, gallery, impact stats, goals, settings). Students, hours,
 * submissions and admin accounts are NOT part of a version, so restoring never touches them.
 * Media files are kept on disk; a snapshot only references them by id.
 */
import crypto from 'node:crypto';
import { db, newId, nowIso, audit } from '../db.js';
import { ApiError } from './http.js';

export const SCOPE_TABLES = [
  'events', 'event_images', 'activities', 'team_members', 'gallery_items', 'custom_stats', 'goals', 'site_content', 'settings',
] as const;

/** Children are removed before parents; parents are re-inserted before children. */
const DELETE_ORDER = ['site_content', 'settings', 'event_images', 'gallery_items', 'custom_stats', 'goals', 'team_members', 'activities', 'events'];
const INSERT_ORDER = ['events', 'event_images', 'activities', 'team_members', 'gallery_items', 'custom_stats', 'goals', 'site_content', 'settings'];
const MEDIA_COLUMNS = ['image_id', 'photo_id', 'hero_image_id', 'media_id'];

export const TABLE_LABELS: Record<string, string> = {
  events: 'Events',
  event_images: 'Event photos',
  activities: 'Activities',
  team_members: 'Team',
  gallery_items: 'Gallery',
  custom_stats: 'Impact stats',
  goals: 'Goals',
  site_content: 'Homepage text',
  settings: 'Settings',
};

type Snapshot = { tables: Record<string, Record<string, unknown>[]> };
type Actor = { id: string; label: string } | null;

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function captureState() {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const hashes: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const t of SCOPE_TABLES) {
    const rows = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all() as Record<string, unknown>[];
    tables[t] = rows;
    counts[t] = rows.length;
    hashes[t] = sha(JSON.stringify(rows));
  }
  return { tables, hashes, counts, hash: sha(JSON.stringify(hashes)) };
}

/** Stores a new version only when the website content actually differs from the latest version. */
export function recordVersionIfChanged(actor: Actor, actions: string[]): string | null {
  const state = captureState();
  const latest = db.prepare('SELECT hash, hashes_json FROM content_versions ORDER BY rowid DESC LIMIT 1').get() as
    | { hash: string; hashes_json: string }
    | undefined;
  if (latest && latest.hash === state.hash) return null;

  const prevHashes: Record<string, string> = latest ? JSON.parse(latest.hashes_json) : {};
  const changed = SCOPE_TABLES.filter((t) => prevHashes[t] !== state.hashes[t]);
  const label = [...new Set(actions)].join('; ').slice(0, 300) || (latest ? 'Website change' : 'Initial version');

  const id = newId('ver');
  db.prepare(
    `INSERT INTO content_versions (id, created_at, actor_id, actor_label, label, hash, hashes_json, changed_json, counts_json, snapshot_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    nowIso(),
    actor?.id ?? null,
    actor?.label ?? 'System',
    label,
    state.hash,
    JSON.stringify(state.hashes),
    JSON.stringify(changed),
    JSON.stringify(state.counts),
    JSON.stringify({ tables: state.tables } satisfies Snapshot)
  );
  return id;
}

/** Ensures there is always a starting point to roll back to. */
export function ensureBaselineVersion() {
  const n = (db.prepare('SELECT COUNT(*) AS n FROM content_versions').get() as { n: number }).n;
  if (n === 0) recordVersionIfChanged(null, ['Initial version (current website)']);
}

function validateSnapshot(snap: unknown): Snapshot {
  const tables = (snap as Snapshot)?.tables;
  if (!tables || typeof tables !== 'object') throw new ApiError(422, 'This version is damaged and cannot be restored.');
  if (!Array.isArray(tables.site_content) || tables.site_content.length !== 1) {
    throw new ApiError(422, 'This version is missing the homepage content and cannot be restored.');
  }
  return snap as Snapshot;
}

/** Replaces the website content with a stored version, atomically. Returns rows skipped because a referenced image was deleted. */
export function applySnapshot(raw: unknown): Record<string, number> {
  const snap = validateSnapshot(raw);
  const skipped: Record<string, number> = {};
  const mediaIds = new Set((db.prepare('SELECT id FROM media').all() as { id: string }[]).map((r) => r.id));

  db.transaction(() => {
    db.prepare('PRAGMA defer_foreign_keys = ON').run();
    for (const t of DELETE_ORDER) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of INSERT_ORDER) {
      const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
      for (const source of snap.tables[t] ?? []) {
        const row: Record<string, unknown> = {};
        for (const c of cols) if (c in source) row[c] = source[c];
        let drop = false;
        for (const c of MEDIA_COLUMNS) {
          if (row[c] && !mediaIds.has(String(row[c]))) {
            if (c === 'media_id') drop = true;
            else row[c] = null;
          }
        }
        if (drop) {
          skipped[t] = (skipped[t] ?? 0) + 1;
          continue;
        }
        const keys = Object.keys(row);
        db.prepare(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => row[k] as any));
      }
    }
  })();
  return skipped;
}

export function restoreVersion(versionId: string, actor: { id: string; name: string }) {
  const row = db.prepare('SELECT * FROM content_versions WHERE id = ?').get(versionId) as
    | { id: string; created_at: string; label: string; snapshot_json: string }
    | undefined;
  if (!row) throw new ApiError(404, 'Version not found.');
  // Keep the current state as a version first, so the restore itself can be undone.
  recordVersionIfChanged({ id: actor.id, label: actor.name }, ['Saved before restore']);
  const skipped = applySnapshot(JSON.parse(row.snapshot_json));
  audit(actor.id, actor.name, 'version.restore', 'content_version', versionId, {
    restored_created_at: row.created_at,
    restored_label: row.label,
    skipped_rows: skipped,
  });
  return { ok: true, restored_from: versionId, skipped };
}
