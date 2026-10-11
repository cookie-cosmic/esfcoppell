import { Router } from 'express';
import { db, nowIso, newId, audit } from '../../db.js';
import { ah, ApiError, requireFields, str, validUrl, validReal } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export const contentRouter = Router();
const adminOnly = (req: any) => requireRole(req, 'admin', 'owner');

/* ============================== EVENTS ============================== */

contentRouter.get(
  '/events',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner', 'reviewer');
    return db.prepare('SELECT * FROM events ORDER BY starts_at DESC NULLS LAST, created_at DESC').all();
  })
);

contentRouter.get(
  '/events/:id',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner', 'reviewer');
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    if (!event) throw new ApiError(404, 'Event not found.');
    event.images = db.prepare('SELECT ei.*, m.stored_name, m.alt FROM event_images ei JOIN media m ON m.id = ei.media_id WHERE ei.event_id = ? ORDER BY ei.position').all(event.id);
    return event;
  })
);

function eventPayload(body: Record<string, unknown>, existing?: any) {
  const errors = requireFields(body, ['title']);
  const status = String(body.status ?? existing?.status ?? 'draft');
  const bannerSize = String(body.banner_size ?? existing?.banner_size ?? 'standard');
  if (!['compact', 'standard', 'tall'].includes(bannerSize)) errors.banner_size = 'Invalid banner size.';
  if (!['draft', 'published', 'canceled', 'completed', 'archived'].includes(status)) errors.status = 'Invalid status.';
  const startsAt = body.starts_at ? String(body.starts_at) : existing?.starts_at ?? null;
  if (body.starts_at !== undefined && body.starts_at && Number.isNaN(Date.parse(String(body.starts_at)))) errors.starts_at = 'Invalid date-time.';
  if (Object.keys(errors).length) throw new ApiError(422, 'Fix the highlighted fields.', errors);
  return {
    title: str(body.title ?? existing?.title, 160),
    description: str(body.description ?? existing?.description ?? '', 5000),
    starts_at: startsAt,
    ends_at: body.ends_at ? String(body.ends_at) : existing?.ends_at ?? null,
    location: str(body.location ?? existing?.location ?? '', 200) || null,
    online_details: str(body.online_details ?? existing?.online_details ?? '', 1000) || null,
    registration_url: body.registration_url !== undefined ? validUrl(body.registration_url) : existing?.registration_url ?? null,
    category: str(body.category ?? existing?.category ?? 'General', 60),
    status,
    image_id: body.image_id !== undefined ? String(body.image_id) || null : existing?.image_id ?? null,
    attendance: body.attendance !== undefined ? validReal(body.attendance, 0, 100000) : existing?.attendance ?? null,
    achievements: str(body.achievements ?? existing?.achievements ?? '', 2000) || null,
    featured_on_home: body.featured_on_home !== undefined ? (body.featured_on_home ? 1 : 0) : existing?.featured_on_home ?? 0,
    banner_size: bannerSize,
  };
}

contentRouter.post(
  '/events',
  ah((req, res) => {
    const admin = adminOnly(req);
    const payload = eventPayload(req.body ?? {});
    const id = newId('evt');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO events (id, title, description, starts_at, ends_at, location, online_details, registration_url, category, status, image_id, attendance, achievements, featured_on_home, banner_size, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, payload.title, payload.description, payload.starts_at, payload.ends_at, payload.location, payload.online_details, payload.registration_url, payload.category, payload.status, payload.image_id, payload.attendance, payload.achievements, payload.featured_on_home, payload.banner_size, ts, ts);
    audit(admin.id, admin.name, 'event.create', 'event', id, { title: payload.title, status: payload.status });
    res.status(201);
    return { id };
  })
);

contentRouter.patch(
  '/events/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new ApiError(404, 'Event not found.');
    const payload = eventPayload(req.body ?? {}, existing);
    db.prepare(
      `UPDATE events SET title=?, description=?, starts_at=?, ends_at=?, location=?, online_details=?, registration_url=?, category=?, status=?, image_id=?, attendance=?, achievements=?, featured_on_home=?, banner_size=?, updated_at=? WHERE id=?`
    ).run(payload.title, payload.description, payload.starts_at, payload.ends_at, payload.location, payload.online_details, payload.registration_url, payload.category, payload.status, payload.image_id, payload.attendance, payload.achievements, payload.featured_on_home, payload.banner_size, nowIso(), existing.id);
    audit(admin.id, admin.name, 'event.update', 'event', existing.id, { status: payload.status });
    return { ok: true };
  })
);

contentRouter.delete(
  '/events/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new ApiError(404, 'Event not found.');
    db.prepare('DELETE FROM events WHERE id = ?').run(existing.id);
    audit(admin.id, admin.name, 'event.delete', 'event', existing.id, {});
    return { ok: true };
  })
);

contentRouter.post(
  '/events/:id/images',
  ah((req, res) => {
    const admin = adminOnly(req);
    const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id) as any;
    if (!event) throw new ApiError(404, 'Event not found.');
    const media = db.prepare('SELECT id FROM media WHERE id = ?').get(String(req.body?.media_id ?? '')) as any;
    if (!media) throw new ApiError(422, 'Unknown media item.');
    const pos = (db.prepare('SELECT COALESCE(MAX(position),0)+1 AS p FROM event_images WHERE event_id = ?').get(event.id) as { p: number }).p;
    const id = newId('evi');
    db.prepare('INSERT INTO event_images (id, event_id, media_id, position, featured) VALUES (?,?,?,?,?)').run(id, event.id, media.id, pos, req.body?.featured ? 1 : 0);
    audit(admin.id, admin.name, 'event.image_add', 'event', event.id, { media_id: media.id });
    res.status(201);
    return { id };
  })
);

contentRouter.delete(
  '/events/:id/images/:imageId',
  ah((req, res) => {
    const admin = adminOnly(req);
    db.prepare('DELETE FROM event_images WHERE id = ? AND event_id = ?').run(req.params.imageId, req.params.id);
    audit(admin.id, admin.name, 'event.image_remove', 'event', req.params.id, { link: req.params.imageId });
    return { ok: true };
  })
);

/* ============================== ACTIVITIES ============================== */

contentRouter.get(
  '/activities',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner', 'reviewer');
    return db.prepare('SELECT * FROM activities ORDER BY position').all();
  })
);

function activityPayload(body: Record<string, unknown>, existing?: any) {
  const errors = requireFields(body, ['title']);
  const mode = String(body.mode ?? existing?.mode ?? 'in_person');
  if (!['remote', 'in_person', 'both'].includes(mode)) errors.mode = 'Invalid mode.';
  if (Object.keys(errors).length) throw new ApiError(422, 'Fix the highlighted fields.', errors);
  return {
    title: str(body.title ?? existing?.title, 160),
    description: str(body.description ?? existing?.description ?? '', 4000),
    category: str(body.category ?? existing?.category ?? 'General', 60),
    mode,
    instructions: str(body.instructions ?? existing?.instructions ?? '', 4000),
    hour_eligibility: str(body.hour_eligibility ?? existing?.hour_eligibility ?? '', 2000),
    hour_limit: body.hour_limit !== undefined ? validReal(body.hour_limit, 0.25, 24) : existing?.hour_limit ?? null,
    start_date: body.start_date ? String(body.start_date) : existing?.start_date ?? null,
    end_date: body.end_date ? String(body.end_date) : existing?.end_date ?? null,
    submission_requirements: str(body.submission_requirements ?? existing?.submission_requirements ?? '', 2000),
    image_id: body.image_id !== undefined ? String(body.image_id) || null : existing?.image_id ?? null,
    active: body.active !== undefined ? (body.active ? 1 : 0) : existing?.active ?? 1,
    featured_on_home: body.featured_on_home !== undefined ? (body.featured_on_home ? 1 : 0) : existing?.featured_on_home ?? 0,
    position: body.position !== undefined ? Number(body.position) || 0 : existing?.position ?? 0,
  };
}

contentRouter.post(
  '/activities',
  ah((req, res) => {
    const admin = adminOnly(req);
    const payload = activityPayload(req.body ?? {});
    const id = newId('act');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO activities (id, title, description, category, mode, instructions, hour_eligibility, hour_limit, start_date, end_date, submission_requirements, image_id, active, featured_on_home, position, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, payload.title, payload.description, payload.category, payload.mode, payload.instructions, payload.hour_eligibility, payload.hour_limit, payload.start_date, payload.end_date, payload.submission_requirements, payload.image_id, payload.active, payload.featured_on_home, payload.position, ts, ts);
    audit(admin.id, admin.name, 'activity.create', 'activity', id, { title: payload.title });
    res.status(201);
    return { id };
  })
);

contentRouter.patch(
  '/activities/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    const existing = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new ApiError(404, 'Activity not found.');
    const payload = activityPayload(req.body ?? {}, existing);
    db.prepare(
      `UPDATE activities SET title=?, description=?, category=?, mode=?, instructions=?, hour_eligibility=?, hour_limit=?, start_date=?, end_date=?, submission_requirements=?, image_id=?, active=?, featured_on_home=?, position=?, updated_at=? WHERE id=?`
    ).run(payload.title, payload.description, payload.category, payload.mode, payload.instructions, payload.hour_eligibility, payload.hour_limit, payload.start_date, payload.end_date, payload.submission_requirements, payload.image_id, payload.active, payload.featured_on_home, payload.position, nowIso(), existing.id);
    audit(admin.id, admin.name, 'activity.update', 'activity', existing.id, {});
    return { ok: true };
  })
);

contentRouter.delete(
  '/activities/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    const existing = db.prepare('SELECT id FROM activities WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new ApiError(404, 'Activity not found.');
    db.prepare('DELETE FROM activities WHERE id = ?').run(existing.id);
    audit(admin.id, admin.name, 'activity.delete', 'activity', existing.id, {});
    return { ok: true };
  })
);

/* ============================== TEAM ============================== */

contentRouter.get(
  '/team',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner', 'reviewer');
    return db.prepare('SELECT * FROM team_members ORDER BY position_order').all();
  })
);

function teamPayload(body: Record<string, unknown>, existing?: any) {
  const errors = requireFields(body, ['position_title']);
  if (Object.keys(errors).length) throw new ApiError(422, 'Position title is required.', errors);
  return {
    position_title: str(body.position_title ?? existing?.position_title, 120),
    position_order: Number(body.position_order ?? existing?.position_order ?? 0) || 0,
    name: str(body.name ?? existing?.name ?? '', 80),
    bio: str(body.bio ?? existing?.bio ?? '', 2000),
    email: body.email ? str(body.email, 120) : existing?.email ?? null,
    contact_label: str(body.contact_label ?? existing?.contact_label ?? '', 60) || null,
    contact_url: body.contact_url !== undefined ? validUrl(body.contact_url) : existing?.contact_url ?? null,
    photo_id: body.photo_id !== undefined ? String(body.photo_id) || null : existing?.photo_id ?? null,
    photo_position: str(body.photo_position ?? existing?.photo_position ?? '50% 50%', 30),
    vacant: body.vacant !== undefined ? (body.vacant ? 1 : 0) : existing?.vacant ?? 0,
    is_public: body.is_public !== undefined ? (body.is_public ? 1 : 0) : existing?.is_public ?? 1,
  };
}

contentRouter.post(
  '/team',
  ah((req, res) => {
    const admin = adminOnly(req);
    const payload = teamPayload(req.body ?? {});
    const id = newId('team');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO team_members (id, position_title, position_order, name, bio, email, contact_label, contact_url, photo_id, photo_position, vacant, is_public, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, payload.position_title, payload.position_order, payload.name, payload.bio, payload.email, payload.contact_label, payload.contact_url, payload.photo_id, payload.photo_position, payload.vacant, payload.is_public, ts, ts);
    audit(admin.id, admin.name, 'team.create', 'team_member', id, { position: payload.position_title });
    res.status(201);
    return { id };
  })
);

contentRouter.patch(
  '/team/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    const existing = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new ApiError(404, 'Team member not found.');
    const payload = teamPayload(req.body ?? {}, existing);
    db.prepare(
      `UPDATE team_members SET position_title=?, position_order=?, name=?, bio=?, email=?, contact_label=?, contact_url=?, photo_id=?, photo_position=?, vacant=?, is_public=?, updated_at=? WHERE id=?`
    ).run(payload.position_title, payload.position_order, payload.name, payload.bio, payload.email, payload.contact_label, payload.contact_url, payload.photo_id, payload.photo_position, payload.vacant, payload.is_public, nowIso(), existing.id);
    audit(admin.id, admin.name, 'team.update', 'team_member', existing.id, {});
    return { ok: true };
  })
);

contentRouter.delete(
  '/team/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    const existing = db.prepare('SELECT id FROM team_members WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new ApiError(404, 'Team member not found.');
    db.prepare('DELETE FROM team_members WHERE id = ?').run(existing.id);
    audit(admin.id, admin.name, 'team.delete', 'team_member', existing.id, {});
    return { ok: true };
  })
);

/* ============================== HOMEPAGE CONTENT ============================== */

const CONTENT_FIELDS = [
  'hero_eyebrow', 'hero_title', 'hero_subtitle', 'hero_image_id', 'featured_event_id', 'featured_event_enabled',
  'mission_title', 'mission_body', 'goals_title', 'stats_title', 'programs_title', 'gallery_title',
  'join_title', 'join_body', 'cta_primary_label', 'cta_primary_href', 'cta_secondary_label', 'cta_secondary_href', 'sections_json',
] as const;

contentRouter.get(
  '/',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner', 'reviewer');
    const row = db.prepare('SELECT * FROM site_content WHERE id = 1').get() as any;
    return {
      content: row,
      goals: db.prepare('SELECT * FROM goals ORDER BY position').all(),
      gallery: db.prepare('SELECT g.*, m.stored_name, m.alt FROM gallery_items g JOIN media m ON m.id = g.media_id ORDER BY g.position').all(),
      stats: db.prepare('SELECT * FROM custom_stats ORDER BY position').all(),
      events: db.prepare(`SELECT id, title, status, starts_at FROM events WHERE status = 'published' ORDER BY starts_at`).all(),
      media: db.prepare('SELECT id, stored_name, alt FROM media ORDER BY created_at DESC LIMIT 100').all(),
    };
  })
);

contentRouter.put(
  '/',
  ah((req, res) => {
    const admin = adminOnly(req);
    const body = req.body ?? {};
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const field of CONTENT_FIELDS) {
      if (body[field] === undefined) continue;
      let value = body[field];
      if (typeof value === 'string') value = value.slice(0, field.endsWith('body') || field === 'sections_json' ? 8000 : 300);
      if (field === 'featured_event_enabled') value = value ? 1 : 0;
      if ((field === 'hero_image_id' || field === 'featured_event_id') && value === '') value = null;
      sets.push(`${field} = ?`);
      params.push(value);
    }
    if (!sets.length) return { ok: true };
    sets.push('updated_at = ?');
    params.push(nowIso());
    db.prepare(`UPDATE site_content SET ${sets.join(', ')} WHERE id = 1`).run(...params);
    audit(admin.id, admin.name, 'content.update', 'site_content', '1', { fields: Object.keys(body) });
    return { ok: true };
  })
);

/* ---- goals ---- */
contentRouter.post(
  '/goals',
  ah((req, res) => {
    const admin = adminOnly(req);
    const errors = requireFields(req.body ?? {}, ['title']);
    if (Object.keys(errors).length) throw new ApiError(422, 'Title is required.', errors);
    const id = newId('goal');
    db.prepare('INSERT INTO goals (id, title, description, icon, image_id, position, visible) VALUES (?,?,?,?,?,?,?)').run(
      id, str(req.body.title, 120), str(req.body.description ?? '', 1000), str(req.body.icon ?? 'heart', 30),
      req.body.image_id ? String(req.body.image_id) : null, Number(req.body.position) || 0, req.body.visible === false ? 0 : 1
    );
    audit(admin.id, admin.name, 'goal.create', 'goal', id, {});
    res.status(201);
    return { id };
  })
);

contentRouter.patch(
  '/goals/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    const existing = db.prepare('SELECT id FROM goals WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw new ApiError(404, 'Goal not found.');
    const b = req.body ?? {};
    db.prepare('UPDATE goals SET title = COALESCE(?,title), description = COALESCE(?,description), icon = COALESCE(?,icon), image_id = COALESCE(?,image_id), position = COALESCE(?,position), visible = COALESCE(?,visible) WHERE id = ?').run(
      b.title !== undefined ? str(b.title, 120) : null,
      b.description !== undefined ? str(b.description, 1000) : null,
      b.icon !== undefined ? str(b.icon, 30) : null,
      b.image_id !== undefined ? (String(b.image_id) || null) : null,
      b.position !== undefined ? Number(b.position) || 0 : null,
      b.visible !== undefined ? (b.visible ? 1 : 0) : null,
      existing.id
    );
    audit(admin.id, admin.name, 'goal.update', 'goal', existing.id, {});
    return { ok: true };
  })
);

contentRouter.delete(
  '/goals/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
    audit(admin.id, admin.name, 'goal.delete', 'goal', req.params.id, {});
    return { ok: true };
  })
);

/* ---- gallery ---- */
contentRouter.post(
  '/gallery',
  ah((req, res) => {
    const admin = adminOnly(req);
    const media = db.prepare('SELECT id FROM media WHERE id = ?').get(String(req.body?.media_id ?? '')) as any;
    if (!media) throw new ApiError(422, 'Unknown media item.');
    const id = newId('gal');
    const pos = (db.prepare('SELECT COALESCE(MAX(position),0)+1 AS p FROM gallery_items').get() as { p: number }).p;
    db.prepare('INSERT INTO gallery_items (id, media_id, caption, position, visible) VALUES (?,?,?,?,1)').run(id, media.id, str(req.body?.caption ?? '', 200), pos);
    audit(admin.id, admin.name, 'gallery.add', 'gallery_item', id, {});
    res.status(201);
    return { id };
  })
);

contentRouter.patch(
  '/gallery/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    const b = req.body ?? {};
    db.prepare('UPDATE gallery_items SET caption = COALESCE(?,caption), position = COALESCE(?,position), visible = COALESCE(?,visible) WHERE id = ?').run(
      b.caption !== undefined ? str(b.caption, 200) : null,
      b.position !== undefined ? Number(b.position) || 0 : null,
      b.visible !== undefined ? (b.visible ? 1 : 0) : null,
      req.params.id
    );
    audit(admin.id, admin.name, 'gallery.update', 'gallery_item', req.params.id, {});
    return { ok: true };
  })
);

contentRouter.delete(
  '/gallery/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    db.prepare('DELETE FROM gallery_items WHERE id = ?').run(req.params.id);
    audit(admin.id, admin.name, 'gallery.remove', 'gallery_item', req.params.id, {});
    return { ok: true };
  })
);

/* ---- custom stats ---- */
contentRouter.post(
  '/stats',
  ah((req, res) => {
    const admin = adminOnly(req);
    const errors = requireFields(req.body ?? {}, ['label']);
    const kind = String(req.body?.kind ?? 'manual');
    if (!['computed', 'manual'].includes(kind)) errors.kind = 'Invalid kind.';
    if (kind === 'computed' && !['active_volunteers', 'approved_hours', 'completed_events', 'upcoming_events'].includes(String(req.body?.computed_key)))
      errors.computed_key = 'Unknown computed metric.';
    if (Object.keys(errors).length) throw new ApiError(422, 'Fix the highlighted fields.', errors);
    const id = newId('stat');
    db.prepare('INSERT INTO custom_stats (id, label, kind, computed_key, manual_value, suffix, position, visible) VALUES (?,?,?,?,?,?,?,1)').run(
      id, str(req.body.label, 80), kind, req.body.computed_key ?? null, validReal(req.body.manual_value, -1e9, 1e9), str(req.body.suffix ?? '', 10), Number(req.body.position) || 0
    );
    audit(admin.id, admin.name, 'stat.create', 'custom_stat', id, {});
    res.status(201);
    return { id };
  })
);

contentRouter.patch(
  '/stats/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    const b = req.body ?? {};
    db.prepare('UPDATE custom_stats SET label = COALESCE(?,label), kind = COALESCE(?,kind), computed_key = COALESCE(?,computed_key), manual_value = COALESCE(?,manual_value), suffix = COALESCE(?,suffix), position = COALESCE(?,position), visible = COALESCE(?,visible) WHERE id = ?').run(
      b.label !== undefined ? str(b.label, 80) : null,
      b.kind !== undefined ? String(b.kind) : null,
      b.computed_key !== undefined ? String(b.computed_key) : null,
      b.manual_value !== undefined ? validReal(b.manual_value, -1e9, 1e9) : null,
      b.suffix !== undefined ? str(b.suffix, 10) : null,
      b.position !== undefined ? Number(b.position) || 0 : null,
      b.visible !== undefined ? (b.visible ? 1 : 0) : null,
      req.params.id
    );
    audit(admin.id, admin.name, 'stat.update', 'custom_stat', req.params.id, {});
    return { ok: true };
  })
);

contentRouter.delete(
  '/stats/:id',
  ah((req, res) => {
    const admin = adminOnly(req);
    db.prepare('DELETE FROM custom_stats WHERE id = ?').run(req.params.id);
    audit(admin.id, admin.name, 'stat.delete', 'custom_stat', req.params.id, {});
    return { ok: true };
  })
);
