import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const TABLES = [
  'admin_users',
  'sessions',
  'media',
  'students',
  'access_codes',
  'events',
  'event_images',
  'activities',
  'submissions',
  'decisions',
  'service_records',
  'team_members',
  'goals',
  'gallery_items',
  'custom_stats',
  'site_content',
  'settings',
  'audit_logs',
  'content_versions',
] as const;

type SqliteDatabase = {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown };
  exec(sql: string): void;
  pragma(statement: string): unknown;
};

type Snapshot = Record<string, unknown[]>;

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DATABASE_URL ||
  '';
const enabled = Boolean(connectionString);
const pool = enabled
  ? new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  : null;

let syncTimer: NodeJS.Timeout | null = null;
let syncInFlight: Promise<void> | null = null;

function readSnapshot(db: SqliteDatabase): Snapshot {
  return Object.fromEntries(TABLES.map((table) => [table, db.prepare(`SELECT * FROM "${table}"`).all()])) as Snapshot;
}

function insertRows(db: SqliteDatabase, table: string, rows: unknown[]) {
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const values = Object.values(row as Record<string, unknown>);
    const columns = Object.keys(row as Record<string, unknown>);
    const placeholders = columns.map(() => '?').join(',');
    db.prepare(`INSERT INTO "${table}" ("${columns.join('","')}") VALUES (${placeholders})`).run(...values);
  }
}

async function ensureTables() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.app_persistence_snapshots (
      id integer primary key check (id = 1),
      payload jsonb not null,
      updated_at timestamptz not null default now()
    );
    CREATE TABLE IF NOT EXISTS public.app_persistence_assets (
      stored_name text primary key,
      mime text not null,
      content bytea not null,
      updated_at timestamptz not null default now()
    );
  `);
}

async function restoreAssets(uploadDir: string) {
  if (!pool) return;
  const result = await pool.query<{ stored_name: string; content: Buffer }>(
    'SELECT stored_name, content FROM public.app_persistence_assets'
  );
  for (const asset of result.rows) {
    const target = path.join(uploadDir, path.basename(asset.stored_name));
    fs.writeFileSync(target, asset.content);
  }
}

export async function restoreCloudState(db: SqliteDatabase, uploadDir: string) {
  if (!pool) return;
  await ensureTables();
  const result = await pool.query<{ payload: Snapshot }>(
    'SELECT payload FROM public.app_persistence_snapshots WHERE id = 1'
  );
  if (!result.rows[0]) return;

  db.pragma('foreign_keys = OFF');
  try {
    for (const table of [...TABLES].reverse()) db.prepare(`DELETE FROM "${table}"`).run();
    for (const table of TABLES) insertRows(db, table, result.rows[0].payload[table] ?? []);
  } finally {
    db.pragma('foreign_keys = ON');
  }
  await restoreAssets(uploadDir);
  console.log('[db] restored application state from Supabase');
}

async function writeCloudState(db: SqliteDatabase, uploadDir: string) {
  if (!pool) return;
  await ensureTables();
  const snapshot = readSnapshot(db);
  await pool.query(
    `INSERT INTO public.app_persistence_snapshots (id, payload, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, updated_at = now()`,
    [JSON.stringify(snapshot)]
  );

  const assets = fs.existsSync(uploadDir)
    ? fs
        .readdirSync(uploadDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
    : [];
  for (const storedName of assets) {
    const content = fs.readFileSync(path.join(uploadDir, storedName));
    const mime = storedName.endsWith('.png')
      ? 'image/png'
      : storedName.endsWith('.webp')
        ? 'image/webp'
        : storedName.endsWith('.gif')
          ? 'image/gif'
          : 'image/jpeg';
    await pool.query(
      `INSERT INTO public.app_persistence_assets (stored_name, mime, content, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (stored_name) DO UPDATE SET mime = excluded.mime, content = excluded.content, updated_at = now()`,
      [storedName, mime, content]
    );
  }
}

export function cloudPersistenceEnabled() {
  return enabled;
}

export function scheduleCloudSnapshot(db: SqliteDatabase, uploadDir: string) {
  if (!pool) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncInFlight = writeCloudState(db, uploadDir)
      .catch((error) => console.error('[db] Supabase persistence sync failed', error))
      .finally(() => {
        syncInFlight = null;
      });
  }, 250);
}

export async function flushCloudSnapshot() {
  if (syncInFlight) await syncInFlight;
}
