import { Link } from 'react-router-dom';
import { useApi, usePageTitle, useReveal } from '../lib/hooks';
import { fmtDate, fmtDateTime } from '../lib/format';
import { CountUp, EmptyState, ErrorNote, Loading, Marquee, SmartImage } from '../components/ui';
import { IconArrow, IconCalendar, IconHeart, IconHands, IconStar, IconMedal, IconSparkle } from '../components/icons';

const GOAL_ICONS: Record<string, React.ComponentType<any>> = {
  heart: IconHeart,
  hands: IconHands,
  star: IconStar,
  medal: IconMedal,
  sparkle: IconSparkle,
};

export default function Home() {
  usePageTitle('Home');
  const { data: content, loading, error, reload } = useApi<any>('/api/site/content');
  const { data: programs } = useApi<any[]>('/api/activities');
  const { data: events } = useApi<any[]>('/api/events?scope=upcoming');
  const heroRef = useReveal<HTMLDivElement>();
  const statsRef = useReveal<HTMLDivElement>();
  const goalsRef = useReveal<HTMLDivElement>();
  const programsRef = useReveal<HTMLDivElement>();
  const galleryRef = useReveal<HTMLDivElement>();

  if (loading) return <div className="container section"><Loading label="Loading the chapter homepage…" /></div>;
  if (error || !content) return <div className="container section"><ErrorNote message={error ?? 'No content'} retry={reload} /></div>;

  const sections: string[] = Array.isArray(content.sections) && content.sections.length
    ? content.sections
    : ['hero', 'featured', 'mission', 'stats', 'goals', 'programs', 'gallery', 'join'];
  const featuredPrograms = (Array.isArray(programs) ? programs : []).filter((p) => p.featured_on_home).slice(0, 3);
  const upcoming = (Array.isArray(events) ? events : []).slice(0, 3);

  const render: Record<string, () => JSX.Element | null> = {
    hero: () => (
      <section className="hero" key="hero">
        <div className="container hero-inner" ref={heroRef}>
          <div className="reveal in">
            {content.hero.eyebrow ? <span className="eyebrow">{content.hero.eyebrow}</span> : null}
            <h1>{content.hero.title}</h1>
            <p className="lede">{content.hero.subtitle}</p>
            <div className="btn-row">
              <Link className="btn btn-primary" to={content.hero.cta_primary_href || '/hours'}>{content.hero.cta_primary_label || 'Join Us'}</Link>
              <Link className="btn btn-outline" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }} to={content.hero.cta_secondary_href || '/programs'}>
                {content.hero.cta_secondary_label || 'Explore Our Programs'}
              </Link>
            </div>
          </div>
          <div className="hero-art">
            <SmartImage src={content.hero.image_url} alt={content.hero.image_alt || 'Coppell chapter volunteers'} style={{ aspectRatio: '4/3', borderRadius: 'var(--r-xl)' }} />
            <div className="hero-chip"><span className="dot" aria-hidden="true" /> Student-led · Coppell, TX</div>
          </div>
        </div>
        <Marquee items={['Volunteer', 'Mentor', 'Fundraise', 'Advocate', 'Serve Coppell', 'Spread Smiles']} />
      </section>
    ),
    featured: () =>
      content.featured_event ? (
        <div className="container" key="featured">
          <div className="featured-strip">
            <span className="tag">Next up</span>
            <div>
              <strong>{content.featured_event.title}</strong>
              <div className="small" style={{ opacity: 0.9 }}>{fmtDateTime(content.featured_event.starts_at)}{content.featured_event.location ? ` · ${content.featured_event.location}` : ''}</div>
            </div>
            <Link to="/programs">Details & registration <IconArrow width={16} height={16} /></Link>
          </div>
        </div>
      ) : null,
    mission: () => (
      <section className="section" key="mission">
        <div className="container split" style={{ alignItems: 'center' }}>
          <div>
            <span className="eyebrow">Why we exist</span>
            <h2>{content.mission.title}</h2>
            {String(content.mission.body ?? '').split('\n').filter(Boolean).map((p: string, i: number) => (
              <p className="muted" key={i} style={{ fontSize: '1.05rem' }}>{p}</p>
            ))}
          </div>
          <div className="card card-pad" style={{ background: 'linear-gradient(150deg, #fff, var(--crimson-soft))' }}>
            <IconHeart width={30} height={30} style={{ color: 'var(--crimson)' }} />
            <h3 style={{ marginTop: 12 }}>Smiles are serious business</h3>
            <p className="muted small">
              Every card, every shift, every fundraiser is verified, logged, and celebrated. Our chapter pairs the
              national foundation’s mission with real opportunities right here in Coppell.
            </p>
            <Link className="card-link" to="/team">Meet the students behind it →</Link>
          </div>
        </div>
      </section>
    ),
    stats: () => (
      <section className="section-tight" key="stats" style={{ background: '#fff', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="container" ref={statsRef}>
          <div className="section-head"><span className="eyebrow">Live from our records</span><h2>{content.titles.stats || 'Our Impact'}</h2>
            <p className="section-sub small">Updated automatically from approved volunteer-hour records and the chapter event calendar.</p></div>
          <div className="grid grid-4 reveal in">
            {(content.stats ?? []).map((s: any, i: number) => (
              <div className="card stat-card" key={s.id}>
                <span className="accent" style={{ background: ['var(--crimson)', 'var(--blue)', 'var(--pink)', 'var(--gold)'][i % 4] }} />
                <span className="value"><CountUp value={s.value} suffix={s.suffix ?? ''} /></span>
                <span className="label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    ),
    goals: () => (
      <section className="section" key="goals">
        <div className="container" ref={goalsRef}>
          <div className="section-head"><span className="eyebrow">Our goals</span><h2>{content.titles.goals || 'What We Stand For'}</h2></div>
          <div className="grid grid-4 reveal in">
            {(content.goals ?? []).map((g: any, i: number) => {
              const Icon = GOAL_ICONS[g.icon] ?? IconStar;
              return (
                <div className="card card-pad" key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ width: 46, height: 46, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: ['var(--crimson-soft)', 'var(--blue-soft)', 'var(--pink-soft)', 'var(--gold-soft)'][i % 4], color: ['var(--crimson)', '#1c6ea4', 'var(--pink)', '#9c5312'][i % 4] }}>
                    <Icon width={22} height={22} />
                  </span>
                  <h3>{g.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{g.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    ),
    programs: () => (
      <section className="section" key="programs" style={{ background: '#fff', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="container" ref={programsRef}>
          <div className="section-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, maxWidth: 'none' }}>
            <div style={{ flex: 1 }}><span className="eyebrow">Get involved</span><h2 style={{ margin: 0 }}>{content.titles.programs || 'Programs & Events'}</h2></div>
            <Link className="btn btn-outline btn-sm" to="/programs">View all</Link>
          </div>
          <div className="grid grid-3 reveal in">
            {featuredPrograms.map((p: any) => (
              <article className="card activity-card" key={p.id}>
                <SmartImage className="thumb" src={p.image_url} alt={p.image_alt || p.title} />
                <div className="body">
                  <div className="event-meta">
                    <span className="pill">{p.category}</span>
                    <span className="pill blue">{p.mode === 'remote' ? 'Remote' : p.mode === 'both' ? 'Remote + In person' : 'In person'}</span>
                  </div>
                  <h3>{p.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{p.description}</p>
                  <Link className="card-link" to="/programs">How to participate <IconArrow width={15} height={15} /></Link>
                </div>
              </article>
            ))}
            {upcoming.slice(0, 3 - featuredPrograms.length).map((e: any) => (
              <article className="card event-card" key={e.id}>
                <SmartImage className="thumb" src={e.image_url} alt={e.image_alt || e.title} />
                <div className="body">
                  <div className="event-meta"><span className="pill gold">Upcoming event</span><span><IconCalendar width={14} height={14} style={{ verticalAlign: '-2px' }} /> {fmtDate(e.starts_at)}</span></div>
                  <h3>{e.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{e.description?.slice(0, 150)}</p>
                  <Link className="card-link" to="/programs">Event details <IconArrow width={15} height={15} /></Link>
                </div>
              </article>
            ))}
          </div>
          {!featuredPrograms.length && !upcoming.length ? <EmptyState title="Nothing featured yet" body="Programs and events published by chapter admins will appear here." /> : null}
        </div>
      </section>
    ),
    gallery: () => (
      <section className="section" key="gallery">
        <div className="container" ref={galleryRef}>
          <div className="section-head"><span className="eyebrow">Photo gallery</span><h2>{content.titles.gallery || 'Moments That Matter'}</h2>
            <p className="section-sub">Volunteering, fundraisers, seminars, and the accomplishments of our members.</p></div>
          <div className="gallery reveal in">
            {(content.gallery ?? []).map((g: any) => (
              <figure key={g.id}>
                <SmartImage src={g.url} alt={g.alt || g.caption} style={{ width: '100%', height: '100%' }} />
                {g.caption ? <figcaption>{g.caption}</figcaption> : null}
              </figure>
            ))}
          </div>
          {!(content.gallery ?? []).length ? <EmptyState glyph="📷" title="No photos yet" body="The chapter gallery will appear here once admins upload photos." /> : null}
        </div>
      </section>
    ),
    join: () => (
      <section className="section" key="join">
        <div className="container">
          <div className="card card-pad" style={{ background: 'var(--ink)', color: '#fff', border: 0, textAlign: 'center', padding: '56px 28px' }}>
            <span className="eyebrow" style={{ color: '#ffb3c0', justifyContent: 'center' }}>Join us</span>
            <h2 style={{ color: '#fff', maxWidth: 640, margin: '0 auto 12px' }}>{content.join.title}</h2>
            <p style={{ color: '#cfd1d6', maxWidth: 620, margin: '0 auto 26px' }}>{content.join.body}</p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link className="btn btn-primary" to="/hours">Submit Volunteer Hours</Link>
              <Link className="btn btn-outline" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.45)' }} to="/programs">See Upcoming Events</Link>
            </div>
          </div>
        </div>
      </section>
    ),
  };

  return <>{sections.map((key) => render[key]?.() ?? null)}</>;
}
