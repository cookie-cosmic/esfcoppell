import { Router } from 'express';
import {
  db,
  nowIso,
  getSetting,
  allSettings,
  computeChapterStats,
  approvedTotalsByStudent,
  approvedTotalFor,
} from '../db.js';
import { ah, ApiError } from '../lib/http.js';
import { MEMBER_COOKIE, memberCookieValue, verifyMember, sessionCookieOptions, signMember } from '../lib/auth.js';
import { rateLimit, HOUR } from '../lib/ratelimit.js';
import { validateSubmission, createSubmission, hourRules } from '../lib/submissions.js';

export const publicRouter = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;
const mediaUrl = (m: { stored_name: string } | null) => (m ? `/uploads/${m.stored_name}` : null);

function mediaById(id: string | null) {
  if (!id) return null;
  return (db.prepare('SELECT id, stored_name, alt FROM media WHERE id = ?').get(id) as
    | { id: string; stored_name: string; alt: string }
    | undefined) ?? null;
}

/* ---------------- homepage content ---------------- */
publicRouter.get(
  '/site/content',
  ah(() => {
    const row = db.prepare('SELECT * FROM site_content WHERE id = 1').get() as Record<string, any> | undefined;
    if (!row) throw new ApiError(404, 'Site content not initialized.');
    const goals = db.prepare('SELECT * FROM goals WHERE visible = 1 ORDER BY position').all() as any[];
    const gallery = db.prepare(
      `SELECT g.id, g.caption, g.position, m.stored_name, m.alt FROM gallery_items g JOIN media m ON m.id = g.media_id
       WHERE g.visible = 1 ORDER BY g.position`
    ).all() as any[];
    const stats = db.prepare('SELECT * FROM custom_stats WHERE visible = 1 ORDER BY position').all() as any[];
    const computed = computeChapterStats() as unknown as Record<string, number>;
    const statPayload = stats.map((s) => ({
      id: s.id,
      label: s.label,
      suffix: s.suffix,
      value: s.kind === 'computed' ? computed[s.computed_key] ?? 0 : s.manual_value ?? 0,
    }));
    let featured: any = null;
    if (row.featured_event_enabled && row.featured_event_id) {
      featured = db
        .prepare(`SELECT id, title, description, starts_at, location, category, status, image_id FROM events WHERE id = ? AND status = 'published'`)
        .get(row.featured_event_id) as any;
      if (featured) featured.image_url = mediaUrl(mediaById(featured.image_id));
    }
    return {
      hero: {
        eyebrow: row.hero_eyebrow,
        title: row.hero_title,
        subtitle: row.hero_subtitle,
        image_url: mediaUrl(mediaById(row.hero_image_id)),
        image_alt: mediaById(row.hero_image_id)?.alt ?? '',
        cta_primary_label: row.cta_primary_label,
        cta_primary_href: row.cta_primary_href,
        cta_secondary_label: row.cta_secondary_label,
        cta_secondary_href: row.cta_secondary_href,
      },
      featured_event: featured,
      mission: { title: row.mission_title, body: row.mission_body },
      titles: {
        goals: row.goals_title,
        stats: row.stats_title,
        programs: row.programs_title,
        gallery: row.gallery_title,
        join: row.join_title,
      },
      join: { title: row.join_title, body: row.join_body },
      goals: goals.map((g) => ({ ...g, image_url: mediaUrl(mediaById(g.image_id)) })),
      gallery: gallery.map((g) => ({ id: g.id, caption: g.caption, url: `/uploads/${g.stored_name}`, alt: g.alt })),
      stats: statPayload,
      sections: JSON.parse(row.sections_json || '[]'),
    };
  })
);

/* ---------------- team ---------------- */
publicRouter.get(
  '/team',
  ah(() => {
    const rows = db.prepare('SELECT * FROM team_members WHERE is_public = 1 ORDER BY position_order').all() as any[];
    return rows.map((r) => {
      const photo = mediaById(r.photo_id);
      return {
        id: r.id,
        position: r.position_title,
        order: r.position_order,
        name: r.vacant ? null : r.name || null,
        bio: r.vacant ? null : r.bio,
        email: r.vacant ? null : r.email,
        contact_label: r.vacant ? null : r.contact_label,
        contact_url: r.vacant ? null : r.contact_url,
        photo_url: mediaUrl(photo),
        photo_alt: photo?.alt || r.name || r.position_title,
        photo_position: r.photo_position || '50% 50%',
        vacant: !!r.vacant,
      };
    });
  })
);

/* ---------------- activities & events ---------------- */
publicRouter.get(
  '/activities',
  ah(() => {
    const rows = db.prepare('SELECT * FROM activities WHERE active = 1 ORDER BY position').all() as any[];
    return rows.map((r) => {
      const img = mediaById(r.image_id);
      return { ...r, image_url: mediaUrl(img), image_alt: img?.alt ?? r.title };
    });
  })
);

publicRouter.get(
  '/events',
  ah((req) => {
    const scope = req.query.scope === 'past' ? 'past' : 'upcoming';
    const now = nowIso();
    const rows =
      scope === 'past'
        ? (db
            .prepare(
              `SELECT * FROM events WHERE status IN ('completed','archived') OR (status = 'published' AND starts_at IS NOT NULL AND starts_at < ?)
               ORDER BY starts_at DESC, created_at DESC`
            )
            .all(now) as any[])
        : (db
            .prepare(
              `SELECT * FROM events WHERE status IN ('published','canceled') AND (starts_at IS NULL OR starts_at >= ?)
               ORDER BY starts_at ASC`
            )
            .all(now) as any[]);
    return rows.map((r) => {
      const images = db
        .prepare(
          `SELECT ei.position, m.stored_name, m.alt FROM event_images ei JOIN media m ON m.id = ei.media_id WHERE ei.event_id = ? ORDER BY ei.position`
        )
        .all(r.id) as any[];
      const hours = db
        .prepare(
          `SELECT COALESCE(SUM(sr.hours),0) AS h FROM service_records sr JOIN submissions s ON s.id = sr.submission_id
           WHERE s.event_id = ? AND sr.status = 'active'`
        )
        .get(r.id) as { h: number };
      const img = mediaById(r.image_id);
      return {
        ...r,
        image_url: mediaUrl(img),
        image_alt: img?.alt ?? r.title,
        photos: images.map((i) => ({ url: `/uploads/${i.stored_name}`, alt: i.alt })),
        approved_hours: round2(hours.h),
      };
    });
  })
);

/* ---------------- config, stats ---------------- */
publicRouter.get(
  '/config',
  ah(() => ({
    medal_requirements: getSetting('medal_requirements'),
    school_levels: getSetting('school_levels'),
    event_categories: getSetting('event_categories'),
    hour_rules: hourRules(),
    branding: getSetting('branding'),
    socials: getSetting('socials'),
    directory_visibility: getSetting('directory_visibility'),
  }))
);

publicRouter.get('/stats', ah(() => computeChapterStats()));

/* ---------------- directory (approved totals only) ---------------- */
publicRouter.get(
  '/directory',
  ah((req) => {
    const visibility = getSetting<string>('directory_visibility');
    const isAdmin = !!req.admin;
    const memberRaw = memberCookieValue(req);
    const isMember = memberRaw ? verifyMember(memberRaw) !== null : false;
    if (visibility === 'private' && !isAdmin) throw new ApiError(403, 'The volunteer directory is currently private.');
    if (visibility === 'members' && !isAdmin && !isMember)
      throw new ApiError(403, 'The volunteer directory is member-only. Look up your submissions with your tracking code to unlock it.');
    const medals = getSetting<Record<string, { silver: number; gold: number }>>('medal_requirements');
    const totals = approvedTotalsByStudent();
    const rows = db
      .prepare(`SELECT id, first_name, last_name, school_level FROM students WHERE active = 1 ORDER BY last_name, first_name`)
      .all() as any[];
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const level = String(req.query.level ?? '').trim();
    const out = rows
      .map((r) => {
        const total = totals.get(r.id) ?? 0;
        const reqs = medals[r.school_level] ?? { silver: 50, gold: 100 };
        return {
          first_name: r.first_name,
          last_name: r.last_name,
          school_level: r.school_level,
          total_hours: total,
          silver_target: reqs.silver,
          gold_target: reqs.gold,
          silver_remaining: Math.max(0, round2(reqs.silver - total)),
          gold_remaining: Math.max(0, round2(reqs.gold - total)),
          silver_complete: total >= reqs.silver,
          gold_complete: total >= reqs.gold,
        };
      })
      .filter((r) => r.total_hours > 0)
      .filter((r) => !search || `${r.first_name} ${r.last_name}`.toLowerCase().includes(search))
      .filter((r) => !level || r.school_level === level)
      .sort((a, b) => b.total_hours - a.total_hours);
    return { visibility, count: out.length, students: out };
  })
);

/* ---------------- detailed approved service records (public sheet) ---------------- */
publicRouter.get(
  '/records',
  ah((req) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(50, Math.max(5, parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const level = String(req.query.level ?? '').trim();
    const where: string[] = ["sr.status = 'active'"];
    const params: unknown[] = [];
    if (level) {
      where.push('st.school_level = ?');
      params.push(level);
    }
    if (search) {
      where.push("(LOWER(st.first_name || ' ' || st.last_name) LIKE ? OR LOWER(sr.event_name) LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    const total = (db
      .prepare(`SELECT COUNT(*) AS n FROM service_records sr JOIN students st ON st.id = sr.student_id WHERE ${where.join(' AND ')}`)
      .get(...params) as { n: number }).n;
    const records = db
      .prepare(
        `SELECT sr.id, st.first_name, st.last_name, st.school_level, sr.event_name, sr.event_date, sr.hours, sr.event_type
         FROM service_records sr JOIN students st ON st.id = sr.student_id
         WHERE ${where.join(' AND ')}
         ORDER BY sr.event_date DESC, st.last_name ASC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, (page - 1) * pageSize) as any[];
    return { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)), records };
  })
);

/* ---------------- student submission flow ---------------- */
publicRouter.post(
  '/submissions',
  ah((req, res) => {
    const rl = rateLimit(`submit:${req.ip}`, 12, HOUR);
    if (!rl.ok) throw new ApiError(429, `Too many submissions from this network. Try again in ${rl.retryInSec}s.`);
    const { errors, normalized, computedHours } = validateSubmission(req.body ?? {});
    if (!normalized) throw new ApiError(422, 'Please fix the highlighted fields.', errors);
    const created = createSubmission(normalized, computedHours);
    res.status(201);
    return created;
  })
);

/** Lookup by non-guessable tracking code: returns ONLY that student's own submissions. */
publicRouter.get(
  '/lookup/:code',
  ah((req, res) => {
    const rl = rateLimit(`lookup:${req.ip}`, 60, HOUR);
    if (!rl.ok) throw new ApiError(429, `Too many lookups. Try again in ${rl.retryInSec}s.`);
    const code = String(req.params.code ?? '').trim().toUpperCase();
    if (!code) throw new ApiError(400, 'Tracking code required.');
    const link = db.prepare('SELECT student_id FROM access_codes WHERE code = ?').get(code) as { student_id: string } | undefined;
    if (!link) throw new ApiError(404, 'No submissions found for that tracking code. Check the code from your confirmation screen.');
    const student = db.prepare('SELECT id, first_name, last_name, school_level FROM students WHERE id = ?').get(link.student_id) as any;
    const submissions = db.prepare('SELECT * FROM submissions WHERE student_id = ? ORDER BY created_at DESC').all(link.student_id) as any[];
    const medals = getSetting<Record<string, { silver: number; gold: number }>>('medal_requirements');
    const total = approvedTotalFor(student.id);
    const reqs = medals[student.school_level] ?? { silver: 50, gold: 100 };
    res.cookie(MEMBER_COOKIE, signMember(student.id), { ...sessionCookieOptions(), maxAge: 30 * 24 * 3_600_000 });
    return {
      student: { first_name: student.first_name, last_name: student.last_name, school_level: student.school_level },
      access_code: code,
      total_approved_hours: total,
      medals: {
        silver: { target: reqs.silver, remaining: Math.max(0, round2(reqs.silver - total)), complete: total >= reqs.silver },
        gold: { target: reqs.gold, remaining: Math.max(0, round2(reqs.gold - total)), complete: total >= reqs.gold },
      },
      submissions: submissions.map((s) => ({
        id: s.id,
        event_name: s.event_name,
        event_type: s.event_type,
        event_date: s.event_date,
        start_time: s.start_time,
        end_time: s.end_time,
        total_hours: s.total_hours,
        status: s.status,
        feedback: s.status === 'declined' || s.status === 'correction_requested' ? s.decline_reason : null,
        submitted_at: s.created_at,
        decided_at: s.decided_at,
      })),
    };
  })
);

publicRouter.get('/health', (_req, res) =>
  res.json({ ok: true, time: nowIso(), settings_loaded: Object.keys(allSettings()).length })
);
