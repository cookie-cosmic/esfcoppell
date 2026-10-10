import { useState } from 'react';
import { Link } from 'react-router-dom';
import { asArray, useApi, usePageTitle, useReveal } from '../lib/hooks';
import { fmtDate, fmtDateTime, fmtHours } from '../lib/format';
import { EmptyState, ErrorNote, Loading, SmartImage } from '../components/ui';
import { IconCalendar, IconChevron, IconClock, IconPin, IconUsers, IconMedal } from '../components/icons';

function ActivityCard({ a }: { a: any }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="card activity-card">
      <SmartImage className="thumb" src={a.image_url} alt={a.image_alt || a.title} />
      <div className="body">
        <div className="event-meta">
          <span className="pill">{a.category}</span>
          <span className="pill blue">{a.mode === 'remote' ? 'Remote' : a.mode === 'both' ? 'Remote + In person' : 'In person'}</span>
          {a.hour_limit ? <span className="pill gold">≤ {fmtHours(a.hour_limit)}h</span> : null}
        </div>
        <h3>{a.title}</h3>
        <p className="muted small" style={{ margin: 0 }}>{a.description}</p>
        {(a.start_date || a.end_date) ? (
          <span className="tiny muted">{fmtDate(a.start_date)} – {fmtDate(a.end_date)}</span>
        ) : null}
        <button className="card-link btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', padding: '6px 0' }} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide details' : 'How to participate'} <IconChevron width={15} height={15} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
        </button>
        {open ? (
          <div className="stack" style={{ gap: 8, borderTop: '1px dashed var(--line-2)', paddingTop: 12 }}>
            {a.instructions ? <div><strong className="tiny">Instructions</strong><p className="small muted" style={{ margin: '2px 0 0' }}>{a.instructions}</p></div> : null}
            {a.hour_eligibility ? <div><strong className="tiny">Hour eligibility</strong><p className="small muted" style={{ margin: '2px 0 0' }}>{a.hour_eligibility}</p></div> : null}
            {a.submission_requirements ? <div><strong className="tiny">Documentation</strong><p className="small muted" style={{ margin: '2px 0 0' }}>{a.submission_requirements}</p></div> : null}
            <p className="tiny muted" style={{ margin: 0 }}>Hours are credited only after an administrator verifies and approves your submission.</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function Programs() {
  usePageTitle('Programs & Events');
  const { data: activities, loading: l1, error: e1, reload: r1 } = useApi<any[]>('/api/activities');
  const { data: upcoming, loading: l2, error: e2, reload: r2 } = useApi<any[]>('/api/events?scope=upcoming');
  const { data: past, loading: l3, error: e3, reload: r3 } = useApi<any[]>('/api/events?scope=past');
  const aRef = useReveal<HTMLDivElement>();
  const uRef = useReveal<HTMLDivElement>();
  const pRef = useReveal<HTMLDivElement>();
  const loading = l1 || l2 || l3;
  const activityList = asArray(activities);
  const upcomingList = asArray(upcoming);
  const pastList = asArray(past);

  return (
    <>
      <section className="section-tight" style={{ background: 'var(--ink)', color: '#fff', paddingTop: 54, paddingBottom: 54 }}>
        <div className="container">
          <span className="eyebrow" style={{ color: '#ffb3c0' }}>Three ways in</span>
          <h1 style={{ color: '#fff' }}>Programs & Events</h1>
          <p style={{ color: '#cfd1d6', maxWidth: 660, margin: 0 }}>
            Ongoing activities where you can earn hours, upcoming events to join, and a look back at what our
            chapter has accomplished together.
          </p>
        </div>
      </section>

      {/* Section A */}
      <section className="section" id="activities">
        <div className="container" ref={aRef}>
          <div className="section-head">
            <span className="eyebrow">Section A</span>
            <h2>Active Activities</h2>
            <p className="section-sub">Ongoing opportunities that qualify for volunteer hours. Follow each activity’s instructions, then submit your hours for verification.</p>
          </div>
          {loading ? <Loading /> : null}
          {e1 ? <ErrorNote message={e1} retry={r1} /> : null}
          <div className="grid grid-3 reveal in">
            {activityList.map((a) => <ActivityCard key={a.id} a={a} />)}
          </div>
          {!activityList.length && !loading ? <EmptyState title="No active activities right now" body="Check back soon — new activities are published here by chapter admins." /> : null}
        </div>
      </section>

      {/* Section B */}
      <section className="section" id="events" style={{ background: '#fff', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="container" ref={uRef}>
          <div className="section-head">
            <span className="eyebrow">Section B</span>
            <h2>Upcoming Events</h2>
            <p className="section-sub">Fundraisers, seminars, volunteer sessions and more — in chronological order.</p>
          </div>
          {e2 ? <ErrorNote message={e2} retry={r2} /> : null}
          <div className="grid grid-3 reveal in">
            {upcomingList.map((ev) => (
              <article className="card event-card" key={ev.id}>
                <SmartImage className="thumb" src={ev.image_url} alt={ev.image_alt || ev.title} />
                <div className="body">
                  <div className="event-meta">
                    <span className={`pill ${ev.status === 'canceled' ? 'gray' : 'gold'}`}>{ev.status === 'canceled' ? 'Canceled' : ev.category}</span>
                    <span><IconCalendar width={14} height={14} style={{ verticalAlign: '-2px' }} /> {fmtDateTime(ev.starts_at)}</span>
                  </div>
                  <h3 style={{ textDecoration: ev.status === 'canceled' ? 'line-through' : 'none' }}>{ev.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{ev.description}</p>
                  <div className="stack" style={{ gap: 4 }}>
                    {ev.location ? <span className="tiny muted"><IconPin width={13} height={13} style={{ verticalAlign: '-2px' }} /> {ev.location}</span> : null}
                    {ev.online_details ? <span className="tiny muted">💻 {ev.online_details}</span> : null}
                  </div>
                  <div className="row" style={{ marginTop: 'auto', gap: 10 }}>
                    {ev.registration_url ? (
                      <a className="btn btn-sm btn-primary" href={ev.registration_url} target="_blank" rel="noreferrer">Register</a>
                    ) : null}
                    <Link className="btn btn-sm btn-ghost" to="/hours">Log hours after</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!upcomingList.length && !l2 ? <EmptyState glyph="🗓️" title="No upcoming events published" body="When the chapter publishes events, they’ll appear here in date order." /> : null}
        </div>
      </section>

      {/* Section C */}
      <section className="section" id="past">
        <div className="container" ref={pRef}>
          <div className="section-head">
            <span className="eyebrow">Section C</span>
            <h2>Past Events & Achievements</h2>
            <p className="section-sub">Completed events, participation stats, and the volunteer hours our members generated.</p>
          </div>
          {e3 ? <ErrorNote message={e3} retry={r3} /> : null}
          <div className="stack reveal in" style={{ gap: 22 }}>
            {pastList.map((ev) => (
              <article className="card" key={ev.id} style={{ overflow: 'hidden' }}>
                <div className="split" style={{ gap: 0 }}>
                  <SmartImage src={ev.image_url} alt={ev.image_alt || ev.title} style={{ width: '100%', height: '100%', minHeight: 220, objectFit: 'cover' }} />
                  <div className="card-pad">
                    <div className="event-meta">
                      <span className="pill green">Completed</span>
                      <span>{fmtDate(ev.starts_at)}</span>
                      <span className="pill gray">{ev.category}</span>
                    </div>
                    <h3 style={{ marginTop: 8 }}>{ev.title}</h3>
                    <p className="muted small">{ev.description}</p>
                    <div className="row" style={{ gap: 18 }}>
                      {ev.attendance ? <span className="small"><IconUsers width={15} height={15} style={{ verticalAlign: '-3px', color: 'var(--blue)' }} /> <strong>{ev.attendance}</strong> participants</span> : null}
                      <span className="small"><IconClock width={15} height={15} style={{ verticalAlign: '-3px', color: 'var(--crimson)' }} /> <strong>{fmtHours(ev.approved_hours ?? 0)}</strong> approved hours</span>
                    </div>
                    {ev.achievements ? (
                      <p className="small" style={{ margin: '10px 0 0', background: 'var(--gold-soft)', borderRadius: 10, padding: '8px 12px' }}>
                        <IconMedal width={14} height={14} style={{ verticalAlign: '-2px', color: '#9c5312' }} /> {ev.achievements}
                      </p>
                    ) : null}
                    {ev.photos?.length ? (
                      <div className="row" style={{ marginTop: 12 }}>
                        {ev.photos.slice(0, 4).map((p: any, i: number) => (
                          <SmartImage key={i} src={p.url} alt={p.alt || ev.title} style={{ width: 74, height: 74, objectFit: 'cover', borderRadius: 10 }} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!pastList.length && !l3 ? <EmptyState glyph="🏆" title="No completed events yet" body="After events wrap up, admins archive them here with photos and results." /> : null}
        </div>
      </section>
    </>
  );
}
