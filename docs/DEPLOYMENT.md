# Deployment & Operations

## Option A — Single Node host (recommended, simplest)

Works on Render / Railway / Fly.io / a VPS / chapter server. The Express server serves both
the API and the built SPA, so there is exactly one origin and cookies just work.

```bash
npm ci
npm run build                 # dist/ (client) + dist-server/ (server)
# first boot on a fresh database:
npm run create-admin          # interactive; or:
#   node dist-server/server/cli/create-admin.js --email you@org --role owner --password-from-stdin
NODE_ENV=production PORT=8080 COOKIE_SECURE=true MEMBER_COOKIE_SECRET="$(openssl rand -base64 32)" node dist-server/server/index.js
```

Persistent volume: point `DATA_DIR` (SQLite file + uploads) at mounted storage when using SQLite. The application also supports durable Supabase persistence through the server-only `SUPABASE_DB_URL` variable. When that variable is present, the server restores every application table and uploaded media from Supabase during startup and schedules a durable snapshot after every successful write. The server logs and `/api/health` expose the active persistence backend so a deployment can be verified. The server normalizes its file URL correctly on Windows, and uses `data/app.db` by default locally; do not place the database in a disposable build/output directory.
Health check: `GET /api/health`.

Optional env-var bootstrap instead of CLI (one-time, only while no admin exists):
set `ADMIN_SETUP_TOKEN`, then `POST /api/admin/setup {token,email,password,name}` once and
unset the variable.

## Option B — GitHub Pages (static) + external API

GitHub Pages cannot run a backend, so the SPA is hosted statically and talks to an
Option-A API (or the Supabase option below) cross-origin.

1. Deploy the API somewhere with HTTPS (Option A). Enable CORS there for the Pages origin
   and set `COOKIE_SECURE=true` + `SameSite=None` if you rely on cookies; simpler: keep the
   API as the canonical host and use Pages only as a mirror.
2. Build with the API origin baked in:
   `VITE_API_BASE=https://api.your-host.dev npm run build:client`
3. Publish `dist/` to Pages (e.g. `peaceiris/actions-gh-pages`). The included `404.html`
   preserves SPA routes by redirecting back into the app.
4. Never put secrets in the static bundle — the client only ever receives public data and
   its own session cookie.

## Option C — Supabase durability (Postgres-backed application state)

The production Express application keeps its existing SQLite-compatible query layer so the
current routes remain stable, but uses Supabase Postgres as its durable state store. This
avoids a risky synchronous-to-asynchronous rewrite while still surviving Render restarts.

Configure the following server-only Render variable:

```text
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Use the transaction pooler URL, keep the password secret, and never expose this variable to
the browser or commit it to the repository. On first boot the server creates the private
`app_persistence_snapshots` and `app_persistence_assets` tables in Supabase automatically.
The snapshot contains all application tables, including admin sessions, volunteer PINs,
submissions, approvals, settings, CMS content, audit logs, and version history. Media files
are stored in `app_persistence_assets` so profile photos also survive filesystem resets.

The existing `supabase/migrations/0001_init.sql` remains available for teams that want the
normalized Supabase Auth/RLS schema. It is not required for this Express durability bridge.
To adopt that normalized schema separately:

1. `supabase init` + copy the migration, `supabase db push`.
2. Create staff users in Supabase Auth with the `owner`/`admin`/`reviewer` role in
   `auth.users` raw_user_meta_data (or the `admin_roles` table + trigger).
3. Swap the Express data layer for `@supabase/supabase-js` using the **anon** key in the
   browser and the **service-role** key only server-side (never in the bundle).
4. Move uploads to a private Storage bucket with policies mirroring the media rules.


## Option D — Firebase Hosting + Render free API

Firebase Hosting remains the static frontend and Render runs the Express API on its free
plan. The [render.yaml](../render.yaml) Blueprint creates the service configuration.
Because Render's free filesystem is ephemeral, this is appropriate for testing/demo use;
use durable storage before keeping real student records or uploads.

1. In Render, choose **New → Blueprint**, connect the GitHub repository, and apply
   `render.yaml`.
2. Build the client with the Render service URL:

   ```bash
   $env:VITE_API_BASE = 'https://esfcoppell-api.onrender.com'
   npm run build:client
   firebase use esfcoppell
   firebase deploy --only hosting
   ```

3. Open the Render service shell and run `npm run create-admin` once to create the owner.
4. Confirm `GET https://esfcoppell-api.onrender.com/api/health` responds before signing in, and verify `persistence.backend` is `supabase-postgres-snapshot`, `persistence.supabase_configured` is `true`, and `database_exists` is `true`.

The API explicitly allows requests from `https://esfcoppell.web.app` and uses bearer
session tokens for cross-origin admin requests.

## Option E — Firebase Hosting + Cloud Run

```bash
gcloud run deploy esfcoppell-api --source . --region us-central1 --allow-unauthenticated
npm run build:client
firebase use esfcoppell
firebase deploy --only hosting
```

The Cloud Run filesystem is ephemeral. Do not use this option for production student
records without first moving the SQLite database and uploads to durable storage (or
using the Supabase option above). After the API is deployed with durable storage,
create the first owner on the API host with `npm run create-admin`.

## Administrator onboarding (production)

1. On the host: `npm run create-admin` (owner). Passwords are scrypt-hashed; nothing is
   seeded with a default password.
2. Owner signs in (hidden trigger: five clicks on the tiny footer smile icon within 3 s).
   Sign-in is **password-only** — the password is matched against active staff accounts,
   and the matched account becomes the audit identity.
3. Review **Settings** (medal targets and hour rules). Public volunteer records are disabled; volunteers use the PIN-protected Ticket Status / Self Stats Tool Box.
4. Enter real content: Homepage Editor, Team, Events & Activities, Media Library.
   Skip `npm run seed:sample` in production (it is demo data and refuses to run over real
   student records).

## Backups & retention

- SQLite: snapshot `DATA_DIR/app.db` (WAL checkpoint first: `sqlite3 app.db "PRAGMA wal_checkpoint(TRUNCATE);"`)
  plus the `uploads/` directory.
- Students are soft-deleted by default; hard delete requires the owner-enabled retention flag.
- Audit logs are append-only by design (no mutation endpoints exist).

## Remaining external setup (not code)

- Real chapter photography/profile photos (sample images currently bundled from the
  foundation's public site; replace via Media Library).
- Optional: transactional email for status notifications (currently statuses are pulled
  securely by tracking code — no email service required).
- Optional: custom domain + TLS on the API host.

## Website versions

Content versions are stored in the `content_versions` table of the same SQLite database, so back up `data/app.db` (including the `-wal` file) as usual. Restoring a version is available to owners and admins under Change History; it is transactional and audited.
