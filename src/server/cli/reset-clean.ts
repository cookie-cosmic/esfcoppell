/**
 * reset:clean — removes ALL sample/demo records so the site contains only real data.
 * Keeps: site structure, homepage copy, goals, the nine leadership seats (marked vacant),
 * computed statistics, settings, admin accounts, and the hero/logo media.
 * Deletes: students, submissions, decisions, service records, access codes, events,
 * activities, gallery items, manual stats, member names/bios, and unused media files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, nowIso, UPLOAD_DIR } from '../db.js';

const DEFAULT_SEATS = [
  'President',
  'Vice President',
  'Co-Vice President',
  'Director of Fundraising',
  'Director of Operations',
  'Director of Finances',
  'Director of Marketing',
  'Director of Programs',
  'Director of Membership',
];

console.log('*** reset:clean — removing sample/demo data ***');

db.exec(`
  DELETE FROM decisions;
  DELETE FROM service_records;
  DELETE FROM submissions;
  DELETE FROM access_codes;
  DELETE FROM event_images;
  DELETE FROM events;
  DELETE FROM activities;
  DELETE FROM gallery_items;
  DELETE FROM students;
  DELETE FROM custom_stats WHERE kind = 'manual';
`);

// Vacate every leadership seat (structure stays, people go).
db.prepare(`UPDATE team_members SET name = '', bio = '', email = NULL, contact_url = NULL, photo_id = NULL, vacant = 1, updated_at = ?`).run(nowIso());

// If no seats exist yet (fresh database), create the nine required positions as vacant.
const seatCount = (db.prepare('SELECT COUNT(*) n FROM team_members').get() as { n: number }).n;
if (seatCount === 0) {
  const ins = db.prepare(
    'INSERT INTO team_members (id, position_title, position_order, name, bio, email, vacant, is_public, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)'
  );
  DEFAULT_SEATS.forEach((title, i) => {
    ins.run(`seat_${i + 1}`, title, i, '', '', null, 1, nowIso(), nowIso());
  });
  console.log(`Created ${DEFAULT_SEATS.length} vacant leadership seats.`);
}

// Remove uploaded media except the hero collage and logo; delete orphan files.
const keep = new Set<string>();
const hero = db.prepare('SELECT hero_image_id FROM site_content WHERE id = 1').get() as { hero_image_id: string | null } | undefined;
if (hero?.hero_image_id) keep.add(hero.hero_image_id);
const media = db.prepare('SELECT id, stored_name FROM media').all() as { id: string; stored_name: string }[];
for (const m of media) {
  if (keep.has(m.id) || m.stored_name.includes('logo')) continue;
  const file = path.join(UPLOAD_DIR, m.stored_name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  db.prepare('DELETE FROM media WHERE id = ?').run(m.id);
}
db.prepare('UPDATE site_content SET featured_event_id = NULL, featured_event_enabled = 0, updated_at = ?').run(nowIso());

const counts = {
  students: (db.prepare('SELECT COUNT(*) n FROM students').get() as { n: number }).n,
  submissions: (db.prepare('SELECT COUNT(*) n FROM submissions').get() as { n: number }).n,
  records: (db.prepare('SELECT COUNT(*) n FROM service_records').get() as { n: number }).n,
  events: (db.prepare('SELECT COUNT(*) n FROM events').get() as { n: number }).n,
  activities: (db.prepare('SELECT COUNT(*) n FROM activities').get() as { n: number }).n,
  gallery: (db.prepare('SELECT COUNT(*) n FROM gallery_items').get() as { n: number }).n,
  vacant_seats: (db.prepare('SELECT COUNT(*) n FROM team_members WHERE vacant = 1').get() as { n: number }).n,
};
console.log('Clean state:', counts);
console.log('Done. Add real content through the admin dashboard.');
