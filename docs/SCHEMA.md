# Database Schema & Security Policies

Source of truth: SQLite (`data/app.db`) created from `src/server/db.ts`.
A Supabase/Postgres equivalent with RLS lives in `supabase/migrations/0001_init.sql`.

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `admin_users` | Administrators | `role IN (owner, admin, reviewer)`, unique email, scrypt hash |
| `sessions` | Server-side admin sessions | FK→admin_users CASCADE, `expires_at` enforced on read |
| `students` | Volunteer records | stable `id` PK; `active` soft-delete flag |
| `access_codes` | Non-guessable per-student lookup codes | unique code, unique student |
| `submissions` | Hour submissions | `status IN (pending, approved, declined, correction_requested)` default pending; `total_hours CHECK (>0, <=24)`; approved rows retain approver first/last name and decision timestamp |
| `decisions` | Reviewer decision history | `action IN (approve, decline, request_correction, reverse, restore, correct, note)`; **partial unique index** `(submission_id) WHERE action='approve'` |
| `service_records` | Authoritative approved hours | `status IN (active, reversed)`; **unique** `submission_id`; `hours CHECK (>0, <=24)`; `source IN (submission, manual)`; reason required by app logic for manual/reverse/restore/correct |
| `events` | Chapter events | `status IN (draft, published, canceled, completed, archived)` |
| `event_images` | Multi-photo event galleries | FK CASCADE both sides |
| `activities` | Ongoing hour-earning activities | `mode IN (remote, in_person, both)` |
| `media` | Uploaded images | magic-byte validated types, 8 MB cap |
| `team_members` | Nine leadership positions | `position_order`, `vacant`, `is_public` |
| `goals`, `gallery_items`, `custom_stats` | Homepage CMS blocks | ordered + visibility flags |
| `site_content` | Single-row homepage copy/hero/CTAs/section order | `sections_json` |
| `settings` | Key/value config (medals, levels, categories, hour rules, visibility, branding, retention) | JSON values, validated per key |
| `audit_logs` | Append-only admin activity | actor, action, entity, details, timestamp; **no update/delete endpoints exist** |

## Integrity rules

- **Totals are derived, never stored.** Every total = `SUM(hours)` over `service_records`
  with `status='active'`. There is no counter column to drift.
- **Approval is atomic + idempotent.** One transaction updates the submission, inserts exactly
  one `decisions(approve)` row (partial unique index) and one `service_records` row
  (unique `submission_id`). Re-approving returns `idempotent: true` and changes nothing.
- **Reversal ≠ deletion.** Reversed records keep history, stop counting, and return the
  submission to `pending`; restoring is an audited correction.
- **Duplicates prevented** at submission time (same student + event + date + hours → 409) and
  at approval time by the constraints above.
- **Time math server-side.** Synchronous durations are recomputed from start/end (midnight
  crossing supported) and compared to reported hours within a configurable tolerance.
- Timestamps stored as ISO-8601 UTC; displayed in the visitor's local timezone client-side.
- Stable IDs (`stu_…`, `sub_…`, `rec_…`) are used everywhere; names are display-only.

## Authorization matrix (enforced server-side per route)

| Capability | anon | member cookie | reviewer | admin | owner |
|---|---|---|---|---|---|
| Public content, team, activities, events, stats | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit hours | ✅ (rate-limited) | ✅ | ✅ | ✅ | ✅ |
| Own submission status via tracking code | ✅ (code required) | ✅ | ✅ | ✅ | ✅ |
| Directory of approved totals | per setting | per setting | ✅ | ✅ | ✅ |
| Detailed approved records sheet | ✅ | ✅ | ✅ | ✅ | ✅ |
| Any student's private submission details | ❌ | ❌ | ✅ | ✅ | ✅ |
| Approve / decline / request correction | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manual hours, corrections, reversals | ❌ | ❌ | ❌ | ✅ | ✅ |
| Student create/edit; CSV export | ❌ | ❌ | ❌ | ✅ | ✅ |
| Hard-delete student (retention) | ❌ | ❌ | ❌ | ❌ | only if retention allows |
| Events/activities/team/homepage/media CRUD | ❌ | ❌ | ❌ | ✅ | ✅ |
| Settings (medals, rules, visibility, branding) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Retention policy, admin management, password resets | ❌ | ❌ | ❌ | ❌ | ✅ |
| Read audit log | ❌ | ❌ | ❌ | ✅ | ✅ |
| Modify audit log | ❌ | ❌ | ❌ | ❌ | ❌ (no endpoints) |

## Additional protections

- Passwords: scrypt with per-user salt; constant-work comparison for unknown emails.
- Sessions: 256-bit random IDs, httpOnly + SameSite=Lax (+Secure in prod), 12 h expiry,
  revoked on logout/password reset. Login rate-limited (8/10 min per IP+email); submissions
  (12/h/IP) and lookups (60/h/IP) rate-limited.
- Uploads: size cap, magic-byte sniffing (JPEG/PNG/WebP/GIF), random stored names, static
  serving with `dotfiles: deny`; in-use images cannot be deleted accidentally.
- Input: allow-list validation on every write; JSON body cap 1 MB; security headers
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
- Privacy: directory exposes names/levels/hours only (no emails, approvers, notes);
  pending/declined submissions visible only via the student's own code or to staff;
  member-mode directory requires a signed proof cookie obtained through a valid lookup.
- The hidden logo easter egg only opens the login screen — authentication and authorization
  are unchanged.
