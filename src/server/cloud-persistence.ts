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
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
  exec(sql: string): void;
  pragma(statement: string): unknown;
};

type Snapshot = Record<string, unknown[]>;

type PersistenceState = 'disabled' | 'connecting' | 'ready' | 'degraded';

export type PersistenceStatus = {
  configured: boolean;
  state: PersistenceState;
  restored: boolean;
  last_sync_at: string | null;
  last_error_kind: string | null;
};

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
      keepAlive: true,
    })
  : null;

let state: PersistenceState = enabled ? 'connecting' : 'disabled';
let lastErrorKind: string | null = null;
let lastSyncedAt: string | null = null;
let snapshotLoaded = false;
let tablesReady = false;

let syncTimer: NodeJS.Timeout | null = null;
let syncInFlight: Promise<void> | null = null;
let pendingSnapshot: (() => Promise<void>) | null = null;

let restoreTimer: NodeJS.Timeout | null = null;
let restoreAttempt = 0;
const RESTORE_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];

/* ------------------------- diagnostics ------------------------- */

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Coarse error category safe to expose on the public /api/health endpoint. */
function classifyError(error: unknown): string {
  const message = messageOf(error);
  if (/tenant\/user .* not found|tenant or user not found/i.test(message)) return 'pooler_cannot_find_project';
  if (/password authentication failed|does not exist/i.test(message)) return 'authentication';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|could not translate host/i.test(message)) return 'dns';
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(message)) return 'network';
  return 'unknown';
}

/** Actionable hint for the operator logs. Never includes the password. */
function hintFor(error: unknown): string | null {
  const message = messageOf(error);
  const kind = classifyError(error);
  const hints: string[] = [];

  if (kind === 'pooler_cannot_find_project') {
    hints.push(
      'Supabase\'s pooler could not route to your project: the host and the username do not belong together. ' +
        'Open the Supabase dashboard > Connect > Shared pooler (Session or Transaction) and copy the ENTIRE string, ' +
        'then replace only the password. Do not compose the host by hand: the aws-N prefix is a cluster index, not the region. ' +
        'The shared pooler username must be postgres.<project-ref> (a direct db.<project-ref>.supabase.co connection uses plain "postgres"). ' +
        'Also confirm the project is not paused.'
    );
  }
  if (kind === 'authentication') {
    hints.push(
      'Supabase rejected the credentials: re-copy the database password from the dashboard and percent-encode special characters (@ # / ? %) in SUPABASE_DB_URL.'
    );
  }
  if (kind === 'dns' && /^db\..*\.supabase\.co$/i.test(safeHostname())) {
    hints.push(
      'db.<project-ref>.supabase.co is IPv6-only on most projects, which many hosts cannot reach. Use the shared pooler host instead (IPv4).'
    );
  }
  if (kind === 'network') {
    hints.push('Supabase was unreachable (timeout/refused). Check the project is running and that outbound Postgres connections are allowed.');
  }
  if (enabled && safeHostname().includes('pooler.supabase.com') && !safeUsername().includes('.')) {
    hints.push('The shared pooler requires the username postgres.<project-ref>, not plain "postgres".');
  }
  return hints.length ? hints.join(' ') : null;
}

function safeHostname() {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '';
  }
}

function safeUsername() {
  try {
    return decodeURIComponent(new URL(connectionString).username);
  } catch {
    return '';
  }
}

function logFailure(stage: string, error: unknown) {
  state = 'degraded';
  lastErrorKind = classifyError(error);
  console.error(`[db] Supabase persistence ${stage} failed (${lastErrorKind}): ${messageOf(error)}`);
  const hint = hintFor(error);
  if (hint) console.error(`[db] ${hint}`);
}

/* ------------------------- pool wiring ------------------------- */

if (pool) {
  // Without this listener an idle client error (pooler restarts, deploy spin-downs)
  // is an unhandled 'error' event and crashes the whole process.
  pool.on('error', (error) => {
    state = 'degraded';
    lastErrorKind = classifyError(error);
    console.error('[db] Supabase connection dropped; the pool will reconnect:', messageOf(error));
  });
}

/* ------------------------- snapshot I/O ------------------------- */

function readSnapshot(db: SqliteDatabase): Snapshot {
  return Object.fromEntries(TABLES.map((table) => [table, db.prepare(`SELECT * FROM "${table}"`).all()])) as Snapshot;
}

function insertRows(db: SqliteDatabase, table: string, rows: unknown[]) {
  let statement: { run(...params: unknown[]): unknown } | null = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const values = Object.values(row as Record<string, unknown>);
    const columns = Object.keys(row as Record<string, unknown>);
    if (!columns.length) continue;
    if (!statement) {
      const placeholders = columns.map(() => '?').join(',');
      statement = db.prepare(`INSERT INTO "${table}" ("${columns.join('","')}") VALUES (${placeholders})`);
    }
    statement.run(...values);
  }
}

async function ensureTables() {
  if (!pool) return;
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.app_persistence_snapshots (
      id integer primary key check (id = 1),
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.app_persistence_assets (
      stored_name text primary key,
      mime text not null,
      content bytea not null,
      updated_at timestamptz not null default now()
    )`);
  tablesReady = true;
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

/* ------------------------- startup restore ------------------------- */

/**
 * Restores the last durable snapshot into the local SQLite database.
 *
 * Never throws: a bad or unreachable SUPABASE_DB_URL must not stop the API from booting.
 * Failures are logged with an actionable hint, surfaced on /api/health as
 * `persistence.state = "degraded"`, and retried with backoff while it is still safe to do so.
 */
export async function restoreCloudState(db: SqliteDatabase, uploadDir: string) {
  if (!pool) return;
  restoreAttempt = 0;
  await attemptRestore(db, uploadDir);
}

async function attemptRestore(db: SqliteDatabase, uploadDir: string) {
  try {
    await ensureTables();
    const result = await pool!.query<{ payload: Snapshot }>(
      'SELECT payload FROM public.app_persistence_snapshots WHERE id = 1'
    );
    if (result.rows[0]) {
      db.pragma('foreign_keys = OFF');
      try {
        for (const table of [...TABLES].reverse()) db.prepare(`DELETE FROM "${table}"`).run();
        for (const table of TABLES) insertRows(db, table, result.rows[0].payload[table] ?? []);
      } finally {
        db.pragma('foreign_keys = ON');
      }
      await restoreAssets(uploadDir);
      console.log('[db] restored application state from Supabase');
    } else {
      console.log('[db] no Supabase snapshot yet; starting from an empty local database');
    }
    snapshotLoaded = true;
    lastErrorKind = null;
    state = 'ready';
  } catch (error) {
    logFailure('restore', error);
    scheduleRestoreRetry(db, uploadDir);
  }
}

/** True once the local database holds real records that a late restore would overwrite. */
function hasLocalRecords(db: SqliteDatabase) {
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM admin_users) + (SELECT COUNT(*) FROM students) +
              (SELECT COUNT(*) FROM submissions) + (SELECT COUNT(*) FROM service_records) +
              (SELECT COUNT(*) FROM media) + (SELECT COUNT(*) FROM events) AS n`
    )
    .get() as { n: number };
  return row.n > 0;
}

function scheduleRestoreRetry(db: SqliteDatabase, uploadDir: string) {
  // Restoring after the chapter has started writing would overwrite newer local data.
  if (hasLocalRecords(db)) {
    console.error(
      '[db] not retrying the Supabase restore: the local database already holds records that a restore would overwrite. ' +
        'Fix SUPABASE_DB_URL and redeploy to restore the durable snapshot.'
    );
    return;
  }
  const delay = RESTORE_RETRY_DELAYS_MS[restoreAttempt];
  if (delay === undefined) {
    console.error(
      '[db] giving up on the Supabase restore after repeated failures; the API keeps serving from local SQLite ' +
        'but that data will be lost on the next restart.'
    );
    return;
  }
  restoreAttempt += 1;
  console.warn(`[db] retrying the Supabase restore in ${Math.round(delay / 1000)}s`);
  if (restoreTimer) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => {
    restoreTimer = null;
    void attemptRestore(db, uploadDir);
  }, delay);
  restoreTimer.unref?.();
}

/* ------------------------- durable writes ------------------------- */

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

  lastSyncedAt = new Date().toISOString();
  lastErrorKind = null;
  state = 'ready';
  snapshotLoaded = true;
  // A successful write proves the backend works, so stop any pending restore retry.
  restoreAttempt = 0;
  if (restoreTimer) {
    clearTimeout(restoreTimer);
    restoreTimer = null;
  }
}

async function persist(db: SqliteDatabase, uploadDir: string) {
  try {
    await writeCloudState(db, uploadDir);
  } catch (error) {
    logFailure('sync', error);
  }
}

export function cloudPersistenceEnabled() {
  return enabled;
}

export function cloudPersistenceStatus(): PersistenceStatus {
  return {
    configured: enabled,
    state,
    restored: snapshotLoaded,
    last_sync_at: lastSyncedAt,
    last_error_kind: lastErrorKind,
  };
}

export function scheduleCloudSnapshot(db: SqliteDatabase, uploadDir: string) {
  if (!pool) return;
  pendingSnapshot = () => persist(db, uploadDir);
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;
    if (!snapshot) return;
    syncInFlight = snapshot().finally(() => {
      syncInFlight = null;
    });
  }, 250);
  syncTimer.unref?.();
}

export async function flushCloudSnapshot() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;
    if (snapshot) {
      syncInFlight = snapshot().finally(() => {
        syncInFlight = null;
      });
    }
  }
  if (syncInFlight) await syncInFlight;
}
