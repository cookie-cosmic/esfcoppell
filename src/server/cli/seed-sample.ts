/**
 * SAMPLE DATA SEED — development/demo only.
 * Inserts clearly-labeled sample content, team placeholders, events, students and
 * volunteer-hour records so every feature can be exercised end-to-end.
 * Refuses to run on a database that already contains student records (use --force to override).
 * Production chapters should NOT run this; add real content through the admin dashboard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, nowIso, newId, ROOT, UPLOAD_DIR } from '../db.js';
import { newAccessCode } from '../lib/passwords.js';

const force = process.argv.includes('--force');
const students = (db.prepare('SELECT COUNT(*) n FROM students').get() as { n: number }).n;
if (students > 0 && !force) {
  console.error('Database already contains student records. Refusing to seed sample data (use --force to override).');
  process.exit(1);
}

console.log('*** Seeding SAMPLE DATA (demo only — do not use in production) ***');

const day = 86_400_000;
const iso = (offsetDays: number, hour = 17, min = 0) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setUTCHours(hour, min, 0, 0);
  return d.toISOString();
};
const dateOnly = (offsetDays: number) => iso(offsetDays).slice(0, 10);

/* ---------- media from bundled chapter assets ---------- */
function mediaFromAsset(asset: string, alt: string): string {
  const src = path.join(ROOT, 'public', 'assets', asset);
  if (!fs.existsSync(src)) throw new Error(`Missing asset ${asset}`);
  const ext = path.extname(asset).slice(1);
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const id = newId('med');
  const stored = `${id}.${ext}`;
  fs.copyFileSync(src, path.join(UPLOAD_DIR, stored));
  const buf = fs.statSync(src);
  db.prepare('INSERT INTO media (id, filename, stored_name, mime, size, alt, created_at) VALUES (?,?,?,?,?,?,?)').run(
    id, asset, stored, mime, buf.size, alt, nowIso()
  );
  return id;
}

const M = {
  hero: mediaFromAsset('hero-collage.jpg', 'Coppell chapter volunteers smiling together at a service event'),
  wishes: mediaFromAsset('photo-wishes.jpg', 'Volunteer presenting a wish gift to a child'),
  session1: mediaFromAsset('photo-smile-session-1.jpg', 'Kids and volunteers during a Smile Session craft workshop'),
  session2: mediaFromAsset('photo-smile-session-2.jpg', 'Volunteers leading an activity with children'),
  cards: mediaFromAsset('photo-cards.jpg', 'Handmade cards and bracelets prepared for hospital patients'),
  portraits: mediaFromAsset('photo-portraits.jpg', 'Framed portrait artwork delivered to a family'),
  seminar: mediaFromAsset('photo-seminar.jpg', 'Chapter members presenting at a volunteer training seminar'),
  about: mediaFromAsset('photo-about.jpg', 'Chapter leadership team at a community outreach day'),
  logo: mediaFromAsset('logo.png', 'Endless Smiles Foundation logo — three smiling figures in blue, pink and gold'),
};

/* ---------- homepage content ---------- */
db.prepare(
  `INSERT OR IGNORE INTO site_content (id, hero_eyebrow, hero_title, hero_subtitle, mission_title, mission_body, goals_title, stats_title, programs_title, gallery_title, join_title, join_body, cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href, sections_json, featured_event_enabled, updated_at)
   VALUES (1, 'Endless Smiles Foundation · Coppell Chapter', 'Spreading smiles, one act of service at a time.', 'We are a student-led chapter bringing joy to children and families across Coppell through volunteering, outreach, and fundraising.', 'Our Mission', 'Endless Smiles Foundation empowers students to serve their community.', 'What We Stand For', 'Our Impact', 'Programs & Events', 'Moments That Matter', 'Join Us', 'There is a place for you here.', 'Submit Volunteer Hours', '/hours', 'Explore Programs', '/programs', ?, 0, ?)`
).run(JSON.stringify(['hero', 'featured', 'mission', 'stats', 'goals', 'programs', 'gallery', 'join']), nowIso());
db.prepare('UPDATE site_content SET hero_image_id = ?, featured_event_enabled = 1, updated_at = ? WHERE id = 1').run(M.hero, nowIso());

/* ---------- goals ---------- */
const goals: [string, string, string][] = [
  ['Bring Joy to Children', 'Organize monthly Smile Sessions, card drives, and gift programs for children facing health challenges.', 'heart'],
  ['Serve Our Community', 'Partner with local hospitals, food banks, and senior centers so Coppell students can serve where it matters most.', 'hands'],
  ['Grow Student Leaders', 'Give every member a real role — planning events, leading teams, and logging verified service hours.', 'star'],
  ['Reach 5,000 Hours', 'Work together toward 5,000 approved volunteer hours this school year, earning silver and gold medals along the way.', 'medal'],
];
goals.forEach(([title, description, icon], i) => {
  db.prepare('INSERT INTO goals (id, title, description, icon, position, visible) VALUES (?,?,?,?,?,1)').run(newId('goal'), title, description, icon, i);
});

/* ---------- gallery ---------- */
const gallery: [string, string][] = [
  [M.session1, 'Smile Session craft workshop'],
  [M.cards, 'Cards & bracelets for hospital patients'],
  [M.wishes, 'Wishes for Warriors gift delivery'],
  [M.seminar, 'Volunteer training seminar'],
  [M.portraits, 'Portraits of Hope delivery'],
  [M.session2, 'Storytime at the children’s library'],
];
gallery.forEach(([media_id, caption], i) => {
  db.prepare('INSERT INTO gallery_items (id, media_id, caption, position, visible) VALUES (?,?,?,?,1)').run(newId('gal'), media_id, caption, i);
});

/* ---------- computed stats ---------- */
const stats: [string, string, string | null, number | null, string][] = [
  ['Active Volunteers', 'computed', 'active_volunteers', null, ''],
  ['Approved Hours', 'computed', 'approved_hours', null, ' hrs'],
  ['Events Completed', 'computed', 'completed_events', null, ''],
  ['Upcoming Events', 'computed', 'upcoming_events', null, ''],
  ['Chapters Inspired', 'manual', null, 12, ''],
];
stats.forEach(([label, kind, key, val, suffix], i) => {
  db.prepare('INSERT INTO custom_stats (id, label, kind, computed_key, manual_value, suffix, position, visible) VALUES (?,?,?,?,?,?,?,1)').run(
    newId('stat'), label, kind, key, val, suffix, i
  );
});

/* ---------- leadership team (nine positions, default order) ---------- */
const team: [string, string, string, string, string, number, number][] = [
  ['President', 'Priya Raman', 'Hi! I’m Priya — a Coppell High senior who believes service is the best way to lead. I started our chapter’s hospital pen-pal program and I’m excited to grow our impact this year.', 'president@endlesssmiles-coppell.org', '', 0, 0],
  ['Vice President', 'Daniel Okafor', 'I coordinate our volunteer calendar and keep every event running on time. If you see a clipboard at an event, it’s probably mine.', 'vp@endlesssmiles-coppell.org', '', 1, 0],
  ['Co-Vice President', 'Sofia Martinez', 'As Co-VP I focus on member experience — onboarding new volunteers, planning socials, and making sure every voice is heard.', 'covp@endlesssmiles-coppell.org', '', 2, 0],
  ['Director of Fundraising', 'Ethan Zhao', 'I lead bake sales, charity runs, and donor outreach. Last year our fundraisers covered gifts for 40 wish recipients.', 'fundraising@endlesssmiles-coppell.org', '', 3, 0],
  ['Director of Operations', 'Ava Thompson', 'Logistics, supplies, schedules — I make sure every service kit is packed and every room is booked before event day.', 'operations@endlesssmiles-coppell.org', '', 4, 0],
  ['Director of Finances', 'Noah Patel', 'I track every dollar raised and spent, publish our quarterly budget summary, and keep us transparent and accountable.', 'finances@endlesssmiles-coppell.org', '', 5, 0],
  ['Director of Marketing', 'Maya Krishnan', 'I run our social media, design posters, and photograph our events so the whole community can see the smiles we make.', 'marketing@endlesssmiles-coppell.org', '', 6, 0],
  ['Director of Programs', 'Lucas Nguyen', 'From Smile Sessions to STEAM camps, I design the programs where our volunteers earn hours and make memories.', 'programs@endlesssmiles-coppell.org', '', 7, 0],
  ['Director of Membership', 'Grace Kim', 'New members are my favorite people. I handle applications, school-level groups, and the silver & gold medal track.', 'membership@endlesssmiles-coppell.org', '', 8, 0],
];
for (const [position_title, name, bio, email, , order, vacant] of team) {
  db.prepare(
    'INSERT INTO team_members (id, position_title, position_order, name, bio, email, contact_label, contact_url, photo_id, vacant, is_public, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?, ?,1,?,?)'
  ).run(newId('team'), position_title, order, name, bio, email, 'Email me', `mailto:${email}`, null, vacant, nowIso(), nowIso());
}

/* ---------- activities ---------- */
const activities: [string, string, string, string, string, string, number | null][] = [
  ['Cards for Courage', 'Handmake encouragement cards for children in local hospitals. Supplies available at chapter meetings or bring your own.', 'Outreach', 'remote', 'Decorate at least 5 cards per session. Write a kind, age-appropriate message in each. Photograph your finished cards and submit with your hours.', 'Up to 4 hours per month; 1 hour per 5 cards.', 4],
  ['Letters of Encouragement', 'Write letters of encouragement for patients and seniors in long-term care.', 'Outreach', 'both', 'Write a minimum of 3 letters per submission. Letters must be original and handwritten or neatly printed.', 'Up to 3 hours per month.', 3],
  ['Event Supply Prep', 'Help pack service kits, assemble care bags, and prep materials before chapter events.', 'Volunteer Session', 'in_person', 'Sign in at the prep table, log your start and end times on the sheet, and have the lead initial your line.', 'Hours equal signed-in time, up to 6 hours per event.', 6],
  ['Community Outreach Walks', 'Join tabling and outreach walks at local libraries and farmers markets to share our mission.', 'Community Service', 'in_person', 'Attend the 15-minute briefing, wear your chapter badge, and get your hours initialed by the event lead.', 'Up to 4 hours per walk.', 4],
  ['Fundraiser Crew', 'Staff bake sales, donation drives, and charity runs — setup, sales, and teardown.', 'Fundraiser', 'in_person', 'Check in with the Fundraising Director at your shift start and end. Shifts are posted at each event.', 'Shift hours only; max 8 hours per day.', 8],
  ['Design & Media Studio', 'Create posters, social graphics, or photo edits for upcoming chapter events (remote-friendly).', 'General', 'remote', 'Submit finished files to the Marketing Director with a short description of the task and time spent.', 'Up to 6 hours per month; approvals verify delivered files.', 6],
];
for (const [title, description, category, mode, instructions, hour_eligibility, limit] of activities) {
  db.prepare(
    `INSERT INTO activities (id, title, description, category, mode, instructions, hour_eligibility, hour_limit, submission_requirements, image_id, active, featured_on_home, position, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,1,?, ?, ?, ?)`
  ).run(newId('act'), title, description, category, mode, instructions, hour_eligibility, limit, 'Submit through the Volunteer Hours form with an approver name.', M.cards, 0, 0, nowIso(), nowIso());
}
db.prepare('UPDATE activities SET featured_on_home = 1, image_id = ? WHERE title IN (?, ?)').run(M.cards, 'Cards for Courage', 'Fundraiser Crew');
db.prepare('UPDATE activities SET image_id = ? WHERE title = ?').run(M.session1, 'Letters of Encouragement');
db.prepare('UPDATE activities SET image_id = ? WHERE title = ?').run(M.seminar, 'Design & Media Studio');

/* ---------- events ---------- */
function event(e: Partial<Record<string, any>> & { title: string }): string {
  const id = newId('evt');
  db.prepare(
    `INSERT INTO events (id, title, description, starts_at, ends_at, location, online_details, registration_url, category, status, image_id, attendance, achievements, featured_on_home, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, e.title, e.description ?? '', e.starts_at ?? null, e.ends_at ?? null, e.location ?? null, e.online_details ?? null,
    e.registration_url ?? null, e.category ?? 'General', e.status ?? 'draft', e.image_id ?? null, e.attendance ?? null,
    e.achievements ?? null, e.featured_on_home ?? 0, nowIso(), nowIso()
  );
  return id;
}
const featuredUpcoming = event({
  title: 'Fall Smile Festival',
  description: 'Our biggest fundraiser of the season! Games, bake sale, and a charity fun run — all proceeds fund wishes for children at Medical City. Volunteers needed for setup, booths, and teardown.',
  starts_at: iso(12, 15), ends_at: iso(12, 20), location: 'Coppell West Park Pavilion', category: 'Fundraiser', status: 'published', image_id: M.session1, featured_on_home: 1,
});
event({
  title: 'Hospital Card-Making Night',
  description: 'An evening of card-making for patients at Cook Children’s. All supplies provided; beginners welcome.',
  starts_at: iso(20, 23), ends_at: iso(21, 1), location: 'Coppell High School, Room B104', category: 'Volunteer Session', status: 'published', image_id: M.cards,
});
event({
  title: 'Volunteer Training Seminar',
  description: 'Required orientation for new members: hour tracking, medal requirements, and how our approval workflow works.',
  starts_at: iso(27, 14), location: 'Online — Zoom link after registration', online_details: 'Zoom (link emailed after registration)', registration_url: 'https://example.org/register/training', category: 'Seminar', status: 'published', image_id: M.seminar,
});
const past1 = event({
  title: 'Summer STEAM Camp',
  description: 'Two weeks of hands-on science and art camps for 50 kids, run by 15 chapter volunteers.',
  starts_at: iso(-75, 14), ends_at: iso(-75, 19), location: 'Coppell Middle School', category: 'Volunteer Session', status: 'completed', image_id: M.session2, attendance: 65,
  achievements: 'Raised $1,000 for children facing life-threatening health challenges; 50 kids served.',
});
const past2 = event({
  title: 'Wishes for Warriors Delivery Day',
  description: 'Delivered surprise wish gifts to five children recovering at home and in hospital.',
  starts_at: iso(-40, 15), location: 'Medical City Children’s Hospital', category: 'Outreach', status: 'completed', image_id: M.wishes, attendance: 12,
  achievements: 'Five wishes granted in a single day — a chapter record.',
});
const past3 = event({
  title: 'Portraits of Hope Exhibition',
  description: 'Framed personalized artwork created with local artists and delivered to families.',
  starts_at: iso(-100, 16), location: 'Coppell Library Gallery', category: 'Community Service', status: 'completed', image_id: M.portraits, attendance: 40,
  achievements: '12 families received keepsake portraits.',
});
for (const [eid, mids] of [[past1, [M.session2, M.session1]], [past2, [M.wishes]], [past3, [M.portraits, M.about]]] as [string, string[]][]) {
  mids.forEach((mid, i) => db.prepare('INSERT INTO event_images (id, event_id, media_id, position, featured) VALUES (?,?,?,?,?)').run(newId('evi'), eid, mid, i, i === 0 ? 1 : 0));
}
db.prepare('UPDATE site_content SET featured_event_id = ? WHERE id = 1').run(featuredUpcoming);

/* ---------- students + approved records + pending submissions ---------- */
type Level = 'elementary' | 'middle' | 'high';
const roster: [string, string, Level][] = [
  ['Emma', 'Alvarez', 'elementary'], ['Liam', 'Brooks', 'elementary'], ['Zoe', 'Chen', 'elementary'], ['Owen', 'Davis', 'middle'],
  ['Aria', 'Foster', 'middle'], ['Kian', 'Garcia', 'middle'], ['Lila', 'Hassan', 'middle'], ['Miles', 'Ito', 'high'],
  ['Nora', 'Jensen', 'high'], ['Ravi', 'Kapoor', 'high'], ['Isla', 'Lennon', 'high'], ['Theo', 'Mbeki', 'high'],
];
const studentIds: string[] = [];
for (const [first, last, level] of roster) {
  const id = newId('stu');
  studentIds.push(id);
  db.prepare('INSERT INTO students (id, first_name, last_name, email, school_level, active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)').run(
    id, first, last, `${first.toLowerCase()}.${last.toLowerCase()}@example.org`, level, nowIso(), nowIso()
  );
  db.prepare('INSERT INTO access_codes (code, student_id, created_at) VALUES (?,?,?)').run(newAccessCode(), id, nowIso());
}

function approvedRecord(studentId: string, eventName: string, eventId: string | null, daysAgo: number, hours: number, type: 'synchronous' | 'asynchronous' = 'synchronous') {
  const ts = nowIso();
  const rid = newId('rec');
  db.prepare(
    `INSERT INTO service_records (id, student_id, submission_id, event_name, event_date, event_type, hours, status, source, reason, created_by, created_at, updated_at)
     VALUES (?,?,NULL,?,?,?,?, 'active','manual','Sample data seed (demo)',NULL,?,?)`
  ).run(rid, studentId, eventName, dateOnly(-daysAgo), type, hours, ts, ts);
}
// Deterministic-ish spread of approved hours so medal progress varies by level.
const plan: Record<number, [string, number, number][]> = {
  0: [['Cards for Courage', 45, 4], ['Summer STEAM Camp', 75, 6], ['Event Supply Prep', 20, 3]],          // elem ~13
  1: [['Letters of Encouragement', 50, 3], ['Fall Bake Sale Crew', 30, 5]],                               // elem 8
  2: [['Cards for Courage', 60, 5], ['Wishes for Warriors Delivery Day', 40, 4], ['Community Outreach Walk', 15, 3]], // elem 12
  3: [['Summer STEAM Camp', 75, 8], ['Event Supply Prep', 25, 4]],                                       // middle 12
  4: [['Cards for Courage', 55, 6], ['Letters of Encouragement', 35, 4], ['Design & Media Studio', 10, 6]], // middle 16
  5: [['Fundraiser Crew', 30, 7], ['Summer STEAM Camp', 75, 9]],                                          // middle 16
  6: [['Portraits of Hope Exhibition', 100, 5], ['Cards for Courage', 65, 6]],                            // middle 11
  7: [['Summer STEAM Camp', 75, 10], ['Wishes for Warriors Delivery Day', 40, 6], ['Fundraiser Crew', 20, 8]], // high 24
  8: [['Design & Media Studio', 15, 9], ['Letters of Encouragement', 40, 5]],                             // high 14
  9: [['Cards for Courage', 70, 7], ['Summer STEAM Camp', 75, 12], ['Community Outreach Walk', 12, 4], ['Event Supply Prep', 18, 5]], // high 36
  10: [['Fundraiser Crew', 25, 6], ['Portraits of Hope Exhibition', 100, 4]],                             // high 10
  11: [['Summer STEAM Camp', 75, 11], ['Cards for Courage', 50, 8], ['Letters of Encouragement', 30, 6], ['Wishes for Warriors Delivery Day', 40, 5]], // high 28
};
for (const [idx, recs] of Object.entries(plan)) {
  for (const [name, daysAgo, hours] of recs as [string, number, number][]) {
    const eventId = name === 'Summer STEAM Camp' ? past1 : name === 'Wishes for Warriors Delivery Day' ? past2 : name === 'Portraits of Hope Exhibition' ? past3 : null;
    approvedRecord(studentIds[Number(idx)], name, eventId, daysAgo, hours);
  }
}

/* pending / declined / correction submissions for the approval center demo */
function submission(studentIdx: number, eventName: string, daysAgo: number, hours: number, status: 'pending' | 'declined' | 'correction_requested', type: 'synchronous' | 'asynchronous' = 'synchronous', start = '15:00', end = '18:00', reason?: string) {
  const id = newId('sub');
  db.prepare(
    `INSERT INTO submissions (id, student_id, event_id, event_name, event_type, event_date, start_time, end_time, total_hours, computed_hours, approver_primary, approver_secondary, status, decline_reason, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, studentIds[studentIdx], null, eventName, type, dateOnly(-daysAgo), type === 'synchronous' ? start : null, type === 'synchronous' ? end : null, hours, type === 'synchronous' ? hours : null, 'Ms. Whitfield (CHS)', 'Mr. Adeyemi (CISD)', status, reason ?? null, iso(-daysAgo + 1, 20));
  return id;
}
submission(0, 'Fall Smile Festival — setup shift', 1, 3, 'pending');
submission(3, 'Cards for Courage', 2, 4, 'pending', 'asynchronous');
submission(7, 'Community Outreach Walk', 3, 4, 'pending', 'synchronous', '09:00', '13:00');
submission(9, 'Design & Media Studio — poster set', 4, 6, 'pending', 'asynchronous');
submission(5, 'Fundraiser Crew', 6, 9, 'correction_requested', 'synchronous', '10:00', '19:00', 'Reported hours exceed the shift sheet (sheet shows 7h). Please correct and resubmit.');
submission(10, 'Letters of Encouragement', 8, 3, 'declined', 'asynchronous', undefined, undefined, 'No documentation attached and approver could not be reached. Resubmit with photos.');

const codes = db.prepare(`SELECT ac.code, st.first_name, st.last_name FROM access_codes ac JOIN students st ON st.id = ac.student_id ORDER BY st.last_name LIMIT 3`).all() as any[];
console.log('\nSample data ready.');
console.log('Demo tracking codes (for the Volunteer Hours lookup):');
for (const c of codes) console.log(`  ${c.first_name} ${c.last_name}: ${c.code}`);
console.log('\nNext: create an administrator with `npm run create-admin`.');
