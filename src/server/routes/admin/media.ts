import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { db, nowIso, newId, audit, UPLOAD_DIR } from '../../db.js';
import { ah, ApiError, str } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export const mediaRouter = Router();

const MAX_BYTES = 8 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

const MAGIC: { test: (b: Buffer) => boolean; mime: string; ext: string }[] = [
  { test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, mime: 'image/jpeg', ext: 'jpg' },
  { test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, mime: 'image/png', ext: 'png' },
  { test: (b) => b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP', mime: 'image/webp', ext: 'webp' },
  { test: (b) => b.length > 6 && b.subarray(0, 6).toString() === 'GIF87a' || (b?.length ?? 0) > 6 && b.subarray(0, 6).toString() === 'GIF89a', mime: 'image/gif', ext: 'gif' },
];

function sniff(buf: Buffer) {
  for (const m of MAGIC) if (m.test(buf)) return m;
  return null;
}

function usages(mediaId: string): string[] {
  const uses: string[] = [];
  if ((db.prepare('SELECT COUNT(*) n FROM events WHERE image_id = ?').get(mediaId) as { n: number }).n) uses.push('events');
  if ((db.prepare('SELECT COUNT(*) n FROM activities WHERE image_id = ?').get(mediaId) as { n: number }).n) uses.push('activities');
  if ((db.prepare('SELECT COUNT(*) n FROM team_members WHERE photo_id = ?').get(mediaId) as { n: number }).n) uses.push('team');
  if ((db.prepare('SELECT COUNT(*) n FROM gallery_items WHERE media_id = ?').get(mediaId) as { n: number }).n) uses.push('homepage gallery');
  if ((db.prepare('SELECT COUNT(*) n FROM event_images WHERE media_id = ?').get(mediaId) as { n: number }).n) uses.push('event galleries');
  if ((db.prepare('SELECT COUNT(*) n FROM goals WHERE image_id = ?').get(mediaId) as { n: number }).n) uses.push('goal cards');
  if ((db.prepare('SELECT COUNT(*) n FROM site_content WHERE hero_image_id = ?').get(mediaId) as { n: number }).n) uses.push('homepage hero');
  return uses;
}

mediaRouter.get(
  '/',
  ah((req, res) => {
    requireRole(req, 'admin', 'owner', 'reviewer');
    const rows = db.prepare('SELECT * FROM media ORDER BY created_at DESC LIMIT 400').all() as any[];
    return rows.map((r) => ({ ...r, url: `/uploads/${r.stored_name}`, usages: usages(r.id) }));
  })
);

mediaRouter.post(
  '/',
  upload.single('file'),
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    const file = req.file;
    if (!file) throw new ApiError(400, 'No file uploaded (field name must be "file").');
    const kind = sniff(file.buffer);
    if (!kind) throw new ApiError(415, 'Only JPEG, PNG, WebP, or GIF images are allowed.');
    if (file.size > MAX_BYTES) throw new ApiError(413, 'Image exceeds the 8 MB limit.');
    const id = newId('med');
    const stored = `${id}.${kind.ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, stored), file.buffer);
    db.prepare('INSERT INTO media (id, filename, stored_name, mime, size, alt, created_at) VALUES (?,?,?,?,?,?,?)').run(
      id,
      file.originalname.slice(0, 120),
      stored,
      kind.mime,
      file.size,
      str(req.body?.alt ?? '', 200),
      nowIso()
    );
    audit(admin.id, admin.name, 'media.upload', 'media', id, { filename: file.originalname, size: file.size });
    res.status(201);
    return { id, url: `/uploads/${stored}` };
  })
);

mediaRouter.patch(
  '/:id',
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id) as any;
    if (!media) throw new ApiError(404, 'Image not found.');
    db.prepare('UPDATE media SET alt = COALESCE(?, alt), filename = COALESCE(?, filename) WHERE id = ?').run(
      req.body?.alt !== undefined ? str(req.body.alt, 200) : null,
      req.body?.filename !== undefined ? str(req.body.filename, 120) : null,
      media.id
    );
    audit(admin.id, admin.name, 'media.update', 'media', media.id, {});
    return { ok: true };
  })
);

/** Replace the stored file (keeps the same id/URL references). */
mediaRouter.post(
  '/:id/replace',
  upload.single('file'),
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id) as any;
    if (!media) throw new ApiError(404, 'Image not found.');
    const file = req.file;
    if (!file) throw new ApiError(400, 'No file uploaded.');
    const kind = sniff(file.buffer);
    if (!kind) throw new ApiError(415, 'Only JPEG, PNG, WebP, or GIF images are allowed.');
    const oldPath = path.join(UPLOAD_DIR, media.stored_name);
    const newPath = path.join(UPLOAD_DIR, `${media.id}.${kind.ext}`);
    fs.writeFileSync(newPath, file.buffer);
    if (oldPath !== newPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    db.prepare('UPDATE media SET stored_name = ?, mime = ?, size = ?, filename = ? WHERE id = ?').run(
      `${media.id}.${kind.ext}`,
      kind.mime,
      file.size,
      file.originalname.slice(0, 120),
      media.id
    );
    audit(admin.id, admin.name, 'media.replace', 'media', media.id, {});
    return { ok: true, url: `/uploads/${media.id}.${kind.ext}` };
  })
);

mediaRouter.delete(
  '/:id',
  ah((req, res) => {
    const admin = requireRole(req, 'admin', 'owner');
    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id) as any;
    if (!media) throw new ApiError(404, 'Image not found.');
    const uses = usages(media.id);
    if (uses.length && req.query.force !== 'true') {
      throw new ApiError(409, `This image is still used by: ${uses.join(', ')}. Remove those references first.`, { usages: uses });
    }
    if (uses.length && req.query.force === 'true' && admin.role !== 'owner') {
      throw new ApiError(403, 'Force-deleting an in-use image requires the owner role.');
    }
    const filePath = path.join(UPLOAD_DIR, media.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM media WHERE id = ?').run(media.id);
    audit(admin.id, admin.name, 'media.delete', 'media', media.id, { forced: req.query.force === 'true', usages: uses });
    return { ok: true };
  })
);

