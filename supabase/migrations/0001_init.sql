-- ============================================================================
-- Endless Smiles Foundation — Coppell Chapter
-- Supabase / PostgreSQL schema with Row-Level Security (production option).
-- Mirrors the SQLite schema in src/server/db.ts and docs/SCHEMA.md.
-- The Express+SQLite backend in this repo remains the default until this is adopted.
-- ============================================================================

create extension if not exists pgcrypto;

create type admin_role     as enum ('owner', 'admin', 'reviewer');
create type submit_status  as enum ('pending', 'approved', 'declined', 'correction_requested');
create type decision_kind  as enum ('approve', 'decline', 'request_correction', 'reverse', 'restore', 'correct', 'note');
create type record_status  as enum ('active', 'reversed');
create type event_status   as enum ('draft', 'published', 'canceled', 'completed', 'archived');
create type activity_mode  as enum ('remote', 'in_person', 'both');
create type event_type_t   as enum ('synchronous', 'asynchronous');

-- ---------- staff ----------
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  auth_user uuid not null references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  role admin_role not null default 'reviewer',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- helper: current staff role (null for anonymous / non-staff)
create or replace function public.current_admin_role() returns admin_role
language sql stable security definer set search_path = public as $$
  select role from public.admin_roles
  where auth_user = auth.uid() and active limit 1
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_admin_role() is not null, false)
$$;

create or replace function public.role_at_least(r admin_role) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.current_admin_role()
    when 'owner'    then true
    when 'admin'    then r in ('admin', 'reviewer')
    when 'reviewer' then r = 'reviewer'
    else false end
$$;

-- ---------- media ----------
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  mime text not null check (mime in ('image/jpeg','image/png','image/webp','image/gif')),
  size int not null check (size > 0 and size <= 8388608),
  alt text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- students & submissions ----------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  school_level text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_codes (
  code text primary key,
  student_id uuid not null unique references public.students (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  online_details text,
  registration_url text,
  category text not null default 'General',
  status event_status not null default 'draft',
  image_id uuid references public.media (id) on delete set null,
  attendance int check (attendance is null or attendance >= 0),
  achievements text,
  featured_on_home boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_images (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  position int not null default 0,
  featured boolean not null default false
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default 'General',
  mode activity_mode not null default 'in_person',
  instructions text not null default '',
  hour_eligibility text not null default '',
  hour_limit numeric(5,2),
  start_date date,
  end_date date,
  submission_requirements text not null default '',
  image_id uuid references public.media (id) on delete set null,
  active boolean not null default true,
  featured_on_home boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  event_name text not null,
  event_type event_type_t not null,
  event_date date not null,
  start_time time,
  end_time time,
  total_hours numeric(5,2) not null check (total_hours > 0 and total_hours <= 24),
  computed_hours numeric(5,2),
  approver_primary text not null,
  approver_secondary text,
  status submit_status not null default 'pending',
  decline_reason text,
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.admin_roles (id) on delete set null
);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  admin_id uuid not null references public.admin_roles (id),
  action decision_kind not null,
  reason text,
  created_at timestamptz not null default now()
);
-- idempotent approvals: at most one approve decision per submission
create unique index if not exists uq_decisions_single_approval
  on public.decisions (submission_id) where action = 'approve';

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  submission_id uuid unique references public.submissions (id) on delete set null,
  event_name text not null,
  event_date date not null,
  event_type event_type_t not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  status record_status not null default 'active',
  source text not null check (source in ('submission', 'manual')),
  reason text,
  created_by uuid references public.admin_roles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- atomic approval helper: approve exactly once, create the record in one transaction
create or replace function public.approve_submission(p_submission uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_sub public.submissions%rowtype; v_rec uuid; v_admin uuid;
begin
  if not public.role_at_least('reviewer') then raise exception 'not authorized'; end if;
  select * into v_sub from public.submissions where id = p_submission for update;
  if not found then raise exception 'submission not found'; end if;
  if v_sub.status = 'approved' then
    select id into v_rec from public.service_records where submission_id = p_submission;
    return v_rec; -- idempotent
  end if;
  if v_sub.status not in ('pending', 'correction_requested') then
    raise exception 'cannot approve status %', v_sub.status;
  end if;
  select id into v_admin from public.admin_roles where auth_user = auth.uid();
  update public.submissions set status = 'approved', decided_at = now(), decided_by = v_admin,
    admin_note = coalesce(p_note, admin_note) where id = p_submission;
  insert into public.decisions (submission_id, admin_id, action, reason)
    values (p_submission, v_admin, 'approve', p_note);
  insert into public.service_records (student_id, submission_id, event_name, event_date, event_type, hours, source, created_by)
    values (v_sub.student_id, p_submission, v_sub.event_name, v_sub.event_date, v_sub.event_type, v_sub.total_hours, 'submission', v_admin)
  returning id into v_rec;
  insert into public.audit_logs (actor_id, actor_label, action, entity_type, entity_id, details_json)
    values (v_admin, (select name from public.admin_roles where id = v_admin), 'submission.approve', 'submission', p_submission, jsonb_build_object('hours', v_sub.total_hours));
  return v_rec;
end $$;

-- ---------- content ----------
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  position_title text not null,
  position_order int not null,
  name text not null default '',
  bio text not null default '',
  email text,
  contact_label text,
  contact_url text,
  photo_id uuid references public.media (id) on delete set null,
  vacant boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text not null default '', icon text not null default 'heart',
  image_id uuid references public.media (id) on delete set null,
  position int not null default 0, visible boolean not null default true
);

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media (id) on delete cascade,
  caption text not null default '', position int not null default 0, visible boolean not null default true
);

create table if not exists public.custom_stats (
  id uuid primary key default gen_random_uuid(),
  label text not null, kind text not null default 'manual' check (kind in ('computed','manual')),
  computed_key text, manual_value numeric, suffix text not null default '',
  position int not null default 0, visible boolean not null default true
);

create table if not exists public.site_content (
  id int primary key default 1 check (id = 1),
  hero_eyebrow text, hero_title text, hero_subtitle text,
  hero_image_id uuid references public.media (id) on delete set null,
  featured_event_id uuid references public.events (id) on delete set null,
  featured_event_enabled boolean not null default false,
  mission_title text, mission_body text,
  goals_title text, stats_title text, programs_title text, gallery_title text,
  join_title text, join_body text,
  cta_primary_label text, cta_primary_href text, cta_secondary_label text, cta_secondary_href text,
  sections_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_roles (id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_label text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
alter table public.admin_roles    enable row level security;
alter table public.media          enable row level security;
alter table public.students       enable row level security;
alter table public.access_codes   enable row level security;
alter table public.events         enable row level security;
alter table public.event_images   enable row level security;
alter table public.activities     enable row level security;
alter table public.submissions    enable row level security;
alter table public.decisions      enable row level security;
alter table public.service_records enable row level security;
alter table public.team_members   enable row level security;
alter table public.goals          enable row level security;
alter table public.gallery_items  enable row level security;
alter table public.custom_stats   enable row level security;
alter table public.site_content   enable row level security;
alter table public.settings       enable row level security;
alter table public.audit_logs     enable row level security;

-- published content: readable by everyone
drop policy if exists pub_media on public.media;
create policy pub_media on public.media for select using (true);
drop policy if exists pub_events on public.events;
create policy pub_events on public.events for select using (status in ('published','completed','archived','canceled') or public.is_staff());
drop policy if exists pub_activities on public.activities;
create policy pub_activities on public.activities for select using (active or public.is_staff());
drop policy if exists pub_team on public.team_members;
create policy pub_team on public.team_members for select using (is_public or public.is_staff());
drop policy if exists pub_goals on public.goals;
create policy pub_goals on public.goals for select using (visible or public.is_staff());
drop policy if exists pub_gallery on public.gallery_items;
create policy pub_gallery on public.gallery_items for select using (visible or public.is_staff());
drop policy if exists pub_stats on public.custom_stats;
create policy pub_stats on public.custom_stats for select using (visible or public.is_staff());
drop policy if exists pub_content on public.site_content;
create policy pub_content on public.site_content for select using (true);
drop policy if exists pub_settings on public.settings;
create policy pub_settings on public.settings for select using (true); -- medal rules & hour rules are public-facing

-- approved totals: public sheet (only active records, no private fields)
drop policy if exists pub_records on public.service_records;
create policy pub_records on public.service_records for select using (status = 'active' or public.is_staff());

-- students: anonymous may insert (submission flow creates/links via RPC below); staff full access
drop policy if exists stu_insert on public.students;
create policy stu_insert on public.students for insert with check (true);
drop policy if exists stu_staff on public.students;
create policy stu_staff on public.students for select using (public.is_staff());
drop policy if exists stu_upd on public.students;
create policy stu_upd on public.students for update using (public.role_at_least('admin'));

-- submissions: a student sees ONLY their own rows, and only via their access code session claim;
-- staff see everything. (Client passes the code; the API layer resolves it server-side.)
drop policy if exists sub_select on public.submissions;
create policy sub_select on public.submissions for select using (public.is_staff());
drop policy if exists sub_insert on public.submissions;
create policy sub_insert on public.submissions for insert with check (status = 'pending');
drop policy if exists sub_update on public.submissions;
create policy sub_update on public.submissions for update using (public.role_at_least('reviewer'));

drop policy if exists dec_sel on public.decisions;
create policy dec_sel on public.decisions for select using (public.is_staff());
drop policy if exists dec_ins on public.decisions;
create policy dec_ins on public.decisions for insert using (public.role_at_least('reviewer')) with check (public.role_at_least('reviewer'));

-- access codes: only staff read them server-side; lookup happens through a security-definer RPC
drop policy if exists codes_staff on public.access_codes;
create policy codes_staff on public.access_codes for select using (public.is_staff());

create or replace function public.lookup_by_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_student uuid;
begin
  select student_id into v_student from public.access_codes where code = upper(btrim(p_code));
  if v_student is null then return null; end if;
  return jsonb_build_object(
    'student', (select jsonb_build_object('first_name', first_name, 'last_name', last_name, 'school_level', school_level) from public.students where id = v_student),
    'total_approved_hours', (select coalesce(sum(hours),0) from public.service_records where student_id = v_student and status = 'active'),
    'submissions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'event_name', event_name, 'event_date', event_date, 'total_hours', total_hours, 'status', status, 'feedback', decline_reason, 'submitted_at', created_at)), '[]'::jsonb) from public.submissions where student_id = v_student)
  );
end $$;

-- staff-only tables
drop policy if exists staff_admin on public.admin_roles;
create policy staff_admin on public.admin_roles for select using (public.is_staff());
drop policy if exists owner_admin on public.admin_roles;
create policy owner_admin on public.admin_roles for all using (public.current_admin_role() = 'owner') with check (public.current_admin_role() = 'owner');

drop policy if exists media_staff_w on public.media;
create policy media_staff_w on public.media for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));
drop policy if exists events_staff_w on public.events;
create policy events_staff_w on public.events for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));
drop policy if exists acts_staff_w on public.activities;
create policy acts_staff_w on public.activities for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));
drop policy if exists team_staff_w on public.team_members;
create policy team_staff_w on public.team_members for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));
drop policy if exists cms_staff_w on public.goals;
create policy cms_staff_w on public.goals for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));
drop policy if exists gal_staff_w on public.gallery_items;
create policy gal_staff_w on public.gallery_items for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));
drop policy if exists stats_staff_w on public.custom_stats;
create policy stats_staff_w on public.custom_stats for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));
drop policy if exists content_staff_w on public.site_content;
create policy content_staff_w on public.site_content for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));
drop policy if exists settings_staff_w on public.settings;
create policy settings_staff_w on public.settings for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));
drop policy if exists records_staff_w on public.service_records;
create policy records_staff_w on public.service_records for all using (public.role_at_least('admin')) with check (public.role_at_least('admin'));

-- audit: staff read; insert via definer functions; NEVER update/delete
drop policy if exists audit_sel on public.audit_logs;
create policy audit_sel on public.audit_logs for select using (public.role_at_least('admin'));
drop policy if exists audit_ins on public.audit_logs;
create policy audit_ins on public.audit_logs for insert with check (public.is_staff());
revoke update, delete on public.audit_logs from authenticated, anon, service_role;

-- default seed settings (medal requirements per spec)
insert into public.settings (key, value_json) values
  ('medal_requirements', '{"elementary":{"silver":25,"gold":50},"middle":{"silver":50,"gold":100},"high":{"silver":50,"gold":100}}'),
  ('directory_visibility', '"public"'),
  ('hour_rules', '{"max_hours_per_submission":12,"max_hours_per_day":24,"sync_tolerance_hours":0.25,"async_max_hours":8,"async_rule_text":"Asynchronous activities are credited at reported hours up to 8 per submission, verified by approvers.","duplicate_window_days":365}')
on conflict (key) do nothing;
