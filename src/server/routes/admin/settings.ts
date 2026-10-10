import { Router } from 'express';
import { getSetting, setSetting, allSettings } from '../../db.js';
import { ah, ApiError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export const settingsRouter = Router();

/** Keys that only the OWNER may change (security / retention / admin policy). */
const OWNER_ONLY = new Set(['retention']);
/** Keys any signed-in admin may change. Reviewers: none. */
const ADMIN_KEYS = new Set([
  'medal_requirements',
  'school_levels',
  'event_categories',
  'hour_rules',
  'directory_visibility',
  'branding',
]);

settingsRouter.get(
  '/',
  ah((req) => {
    requireRole(req, 'admin', 'owner');
    return allSettings();
  })
);

settingsRouter.put(
  '/:key',
  ah((req) => {
    const admin = requireRole(req, 'admin', 'owner');
    const key = String(req.params.key);
    if (!(key in allSettings())) throw new ApiError(404, `Unknown setting "${key}".`);
    if (OWNER_ONLY.has(key) && admin.role !== 'owner') throw new ApiError(403, 'This setting can only be changed by the chapter owner.');
    if (!OWNER_ONLY.has(key) && !ADMIN_KEYS.has(key)) throw new ApiError(403, 'This setting is not editable through the dashboard.');
    if (admin.role === 'reviewer') throw new ApiError(403, 'Reviewers cannot change settings.');
    const value = req.body?.value;
    if (value === undefined) throw new ApiError(422, 'Provide { value } in the request body.');
    // Light structural validation per key.
    if (key === 'directory_visibility' && !['public', 'members', 'private'].includes(String(value)))
      throw new ApiError(422, 'directory_visibility must be public, members, or private.');
    if (key === 'medal_requirements') {
      const levels = getSetting<{ key: string }[]>('school_levels').map((l) => l.key);
      if (typeof value !== 'object' || value === null) throw new ApiError(422, 'medal_requirements must be an object.');
      for (const lvl of levels) {
        const v = (value as any)[lvl];
        if (!v || typeof v.silver !== 'number' || typeof v.gold !== 'number' || v.silver <= 0 || v.gold < v.silver)
          throw new ApiError(422, `Invalid medal targets for "${lvl}": gold must be >= silver > 0.`);
      }
    }
    if (key === 'hour_rules') {
      const v = value as any;
      if (typeof v !== 'object' || v === null) throw new ApiError(422, 'hour_rules must be an object.');
      for (const k of ['max_hours_per_submission', 'max_hours_per_day', 'sync_tolerance_hours', 'async_max_hours']) {
        if (typeof v[k] !== 'number' || v[k] <= 0 || v[k] > 24) throw new ApiError(422, `hour_rules.${k} must be a number between 0 and 24.`);
      }
    }
    setSetting(key, value, admin.id, admin.name);
    return { ok: true, value };
  })
);

