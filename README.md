# Endless Smiles Foundation — Coppell Chapter

Website + management system for the Coppell chapter of the Endless Smiles Foundation:
a public nonprofit site (Home, Meet the Team, Programs & Events, Volunteer Hours) and a
hidden, fully authenticated admin console (approvals, volunteers, events, team, homepage CMS,
media library, settings, and Change History with version restore).

## Stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | React 18 + TypeScript + Vite (SPA, react-router) |
| Backend   | Node 20 + Express + TypeScript |
| Database  | SQLite via `better-sqlite3` (file-backed, transactions, constraints) |
| Auth      | Server-side sessions (httpOnly cookies), scrypt password hashing, role-based authorization |
| Storage   | Local disk `data/uploads/` with server-side magic-byte image validation |

A production alternative using **Supabase (Postgres + Auth + Storage + RLS)** is provided in
`supabase/migrations/0001_init.sql` with row-level-security policies; see `docs/DEPLOYMENT.md`.

## Quickstart

```bash
npm install
npm run build            # builds client (dist/) + server (dist-server/)

# one-time database setup (development/demo):
npm run seed:sample      # SAMPLE data only — refuses to run over real student records
npm run create-admin     # creates the initial administrator (password prompted)
npm run reset-admin-password -- --email you@example.org --password-from-stdin # resets an existing account

npm run serve            # serves API + built site on http://localhost:8080
```

Set the Render environment variable `ADMIN_PIN` to the six-digit keypad PIN. The
production Render service uses a persistent disk for SQLite data. Do not deploy the
API without persistent storage, or administrator accounts and password hashes can be lost
when the service restarts or redeploys.

Development with hot reload:

```bash
npm run dev:server       # API on :8080 (tsx watch)
npm run dev:client       # Vite on :5173, proxies /api and /uploads to :8080
```

Tests / checks:

```bash
npm test                 # 24 API tests: authz, validation, approvals, idempotency, medals, privacy
npm run lint             # type-checks server + client
```

## Public site

- **Home** – hero, admin-controlled featured event, editable mission, goal cards, live
  statistics (derived from the database), featured programs/events, gallery, join CTA.
- **Meet the Team** – nine leadership positions in the required default order
  (President → Vice President → Co-Vice President → six Directors), vacancy support.
- **Programs & Events** – Section A active activities, Section B upcoming events
  (chronological), Section C past events & achievements (photos, attendance, approved hours).
- **Volunteer Hours** – submission form (client + server validation), tracking-code lookup,
  public directory with medal progress, paginated approved service records, medal table.

Admin access is intentionally hidden: click the tiny smile icon at the **bottom-right of the
footer five times within 3 seconds**. The staff console lives at a private path that is not linked
anywhere on the public site. Sign-in requires
**only the chapter staff password** (no email). The egg is discovery-only — it grants
nothing without the password.

## Volunteer-hour workflow (core rules)

1. Student submits → status **Pending**, tracking code (`ES-XXXX-XXXX-XXXX`) issued once per student.
2. Hours are **never** counted while pending/declined. No hours for merely viewing/joining.
3. An authorized reviewer approves → a single `service_records` row is created **atomically**;
   approvals are idempotent (unique approval decision + unique record per submission), so a
   repeated request can never double-count.
4. Totals, medal progress, and every statistic are **derived** from active service records —
   there is no separately maintained total that can drift.
5. Corrections/reversals require a reason, update totals immediately, and are audit-logged.
6. Medal thresholds (elementary 25/50, middle 50/100, high 50/100) are admin-editable settings;
   progress caps at 100% and recalculates when a student's school level changes.

## Administrator roles

- `owner` – everything, including retention policy and administrator management.
- `admin` – content, volunteers, events, media, settings, approvals.
- `reviewer` – approval center and read-only views.

## Environment variables

See `.env.example`. No secret ever ships in frontend code; the browser only receives
public content and its own session cookie.

## Documentation

- `docs/SCHEMA.md` – database schema, integrity rules, and the server-side authorization matrix.
- `docs/DEPLOYMENT.md` – deployment (single Node host or GitHub Pages + API), Supabase option,
  admin onboarding, and remaining external setup.
- `DEMO-ACCESS.md` – credentials & tracking codes for **this sandbox demo only**.

## Sample data

`npm run seed:sample` inserts clearly-labeled demo content (team placeholders, events,
students, hour records). It refuses to run when student records exist (`--force` overrides).
Production chapters should skip it and enter real content via the dashboard.

## Change History and version restore

Change History (admin sidebar, owners and admins) has two tabs:

- **Version history**: a snapshot of the website content (homepage text, team, events, gallery, impact stats, goals, settings) is saved after every admin change that alters it. A baseline version is created at startup. Restoring a version first saves the current site as a new version, then writes a `version.restore` audit entry. Students, hours, submissions, staff accounts, and media files are never part of a version and are not changed by a restore.
- **Activity log**: the append-only audit trail of staff actions.

API: `GET /api/admin/versions`, `GET /api/admin/versions/:id`, `POST /api/admin/versions/:id/restore` (owner/admin).
