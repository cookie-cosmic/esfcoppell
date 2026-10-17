import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { db, nowIso, ROOT, UPLOAD_DIR, auditContext, scheduleCloudSnapshot } from './db.js';
import { attachAdmin } from './lib/auth.js';
import { ApiError } from './lib/http.js';
import { publicRouter } from './routes/public.js';
import { adminAuthRouter } from './routes/admin/auth.js';
import { approvalsRouter } from './routes/admin/approvals.js';
import { studentsRouter } from './routes/admin/students.js';
import { contentRouter } from './routes/admin/content.js';
import { mediaRouter } from './routes/admin/media.js';
import { settingsRouter } from './routes/admin/settings.js';
import { versionsRouter } from './routes/admin/versions.js';
import { recordVersionIfChanged, ensureBaselineVersion } from './lib/versions.js';

const app = express();
app.disable('x-powered-by');
const allowedOrigin = process.env.CLIENT_ORIGIN || 'https://esfcoppell.web.app';
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(origin === allowedOrigin ? 204 : 403);
    return;
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(attachAdmin);

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false, dotfiles: 'deny' }));

app.use((req, res, next) => {
  res.on('finish', () => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && res.statusCode < 400) {
      scheduleCloudSnapshot(db, UPLOAD_DIR);
    }
  });
  next();
});

app.use('/api', publicRouter);
app.use('/api/admin', adminAuthRouter);

// Version history: after every successful admin write, snapshot the website content if it changed.
app.use('/api/admin', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const store = { actions: [] as string[] };
  auditContext.run(store, () => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      try {
        recordVersionIfChanged(req.admin ? { id: req.admin.id, label: req.admin.name } : null, store.actions);
      } catch (err) {
        console.error('[versions] snapshot failed', err);
      }
    });
    next();
  });
});
app.use('/api/admin/versions', versionsRouter);
app.use('/api/admin', approvalsRouter); // auth enforced per-route (reviewer+)
app.use('/api/admin/students', studentsRouter);
app.use('/api/admin/content', contentRouter);
app.use('/api/admin/media', mediaRouter);
app.use('/api/admin/settings', settingsRouter);

app.use('/api', (_req, _res) => {
  throw new ApiError(404, 'Unknown API endpoint.');
});

/* -------- static client (SPA) -------- */
const CLIENT_DIST = path.join(ROOT, 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: 'index.html', maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res.status(200).send('API is running. Build the client (`npm run build:client`) to serve the website from this server.');
  });
}

/* -------- error handler -------- */
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, details: err.details ?? undefined });
    return;
  }
  if (err && typeof err === 'object' && 'type' in err && (err as any).type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large.' });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

/* -------- ensure a site_content row exists so the public site never 404s -------- */
const hasContent = (db.prepare('SELECT COUNT(*) AS n FROM site_content WHERE id = 1').get() as { n: number }).n;
if (!hasContent) {
  db.prepare(
    `INSERT INTO site_content (id, hero_eyebrow, hero_title, hero_subtitle, mission_title, mission_body, goals_title, stats_title, programs_title, gallery_title, join_title, join_body, cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href, sections_json, featured_event_enabled, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    'Endless Smiles Foundation · Coppell Chapter',
    'Spreading smiles, one act of service at a time.',
    'We are a student-led chapter bringing joy to children and families across Coppell through volunteering, outreach, and fundraising.',
    'Our Mission',
    'Endless Smiles Foundation empowers students to serve their community. The Coppell Chapter organizes volunteer sessions, fundraisers, and outreach programs that bring comfort and joy to children facing difficult circumstances — and we track every hour so your service counts.',
    'What We Stand For',
    'Our Impact',
    'Programs & Events',
    'Moments That Matter',
    'Join Us',
    'Whether you have one hour a month or one hour a day, there is a place for you here. Submit your volunteer hours, join an upcoming event, and work toward your silver and gold service medals.',
    'Submit Volunteer Hours',
    '/hours',
    'Explore Programs',
    '/programs',
    JSON.stringify(['hero', 'featured', 'mission', 'stats', 'goals', 'programs', 'gallery', 'join']),
    nowIso()
  );
}

ensureBaselineVersion();
scheduleCloudSnapshot(db, UPLOAD_DIR);

export default app;
