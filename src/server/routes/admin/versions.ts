import { Router } from 'express';
import { db } from '../../db.js';
import { ah, ApiError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { captureState, restoreVersion, TABLE_LABELS } from '../../lib/versions.js';

export const versionsRouter = Router();

/** Owners and admins can see and restore website versions. */
versionsRouter.get(
  '/',
  ah((req) => {
    requireRole(req, 'owner', 'admin');
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 60));
    const rows = db
      .prepare(
        `SELECT id, created_at, actor_label, label, hash, changed_json, counts_json
         FROM content_versions ORDER BY rowid DESC LIMIT ?`
      )
      .all(limit) as any[];
    const latestHash = rows[0]?.hash ?? null;
    const current = captureState().hash;
    return {
      current_matches_latest: current === latestHash,
      items: rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        actor_label: r.actor_label,
        label: r.label,
        changed: (JSON.parse(r.changed_json) as string[]).map((t) => ({ key: t, label: TABLE_LABELS[t] ?? t })),
        counts: JSON.parse(r.counts_json),
        is_latest: r.hash === latestHash,
      })),
    };
  })
);

versionsRouter.post(
  '/:id/restore',
  ah((req) => {
    const actor = requireRole(req, 'owner', 'admin');
    if (!db.prepare('SELECT 1 FROM content_versions WHERE id = ?').get(req.params.id)) throw new ApiError(404, 'Version not found.');
    return restoreVersion(req.params.id, actor);
  })
);
