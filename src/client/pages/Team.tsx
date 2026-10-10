import { useApi, usePageTitle, useReveal } from '../lib/hooks';
import { initials } from '../lib/format';
import { ErrorNote, Loading, SmartImage } from '../components/ui';
import { IconMail, IconArrow, SmileMark } from '../components/icons';

/** One accent colour per leadership seat, in position order (1 → 9). */
const SEAT_COLORS = ['#c8102e', '#4ba3e3', '#ef0a71', '#f0822f', '#7b5ea7', '#1d9e6c', '#e5484d', '#2f80c9', '#b0175a'];

function Seat({ m, index, lead }: { m: any; index: number; lead?: boolean }) {
  const accent = SEAT_COLORS[index % SEAT_COLORS.length];
  const contactHref = m.contact_url || (m.email ? `mailto:${m.email}` : null);
  const num = String((m.order ?? index) + 1).padStart(2, '0');
  const style = { '--accent': accent } as React.CSSProperties;

  if (m.vacant) {
    return (
      <article className={`seat seat-vacant ${lead ? 'seat-lead' : ''}`} style={style}>
        <div className="seat-avatar seat-avatar-open" aria-hidden="true">?</div>
        <p className="seat-name">Position open</p>
        <h3 className="seat-role">{m.position}</h3>
        <span className="seat-tag">Seat {num}</span>
        <p className="seat-bio">This seat is open. Ask any officer how to run for it next term.</p>
      </article>
    );
  }

  return (
    <article className={`seat ${lead ? 'seat-lead' : ''}`} style={style}>
      <div className="seat-avatar">
        {m.photo_url ? (
          <SmartImage className="seat-photo" src={m.photo_url} alt={m.photo_alt || m.name} />
        ) : (
          <div className="seat-initials" aria-hidden="true">{initials(m.name || m.position)}</div>
        )}
      </div>
      <p className="seat-name">{m.name}</p>
      <h3 className="seat-role">{m.position}</h3>
      <span className="seat-tag">Seat {num}</span>
      {m.email ? (
        <span className="seat-mail">
          <IconMail width={13} height={13} /> <span>{m.email}</span>
        </span>
      ) : null}
      {m.bio ? <p className="seat-bio">{m.bio}</p> : null}
      {contactHref ? (
        <a className="seat-btn" href={contactHref}>
          {m.contact_label || 'Contact Me'} <IconArrow width={14} height={14} />
        </a>
      ) : null}
    </article>
  );
}

export default function Team() {
  usePageTitle('Meet the Team');
  const { data, loading, error, reload } = useApi<any[]>('/api/team');
  const ref = useReveal<HTMLDivElement>();

  const members = [...(data ?? [])].sort((a, b) => a.order - b.order);
  const tier1 = members.slice(0, 1);
  const tier2 = members.slice(1, 3);
  const tier3 = members.slice(3, 6);
  const tier4 = members.slice(6);

  return (
    <>
      <section className="team-hero">
        <div className="container team-hero-inner">
          <span className="hand note-left" aria-hidden="true">Together we make<br />a bigger impact ♥</span>
          <span className="pill-eyebrow">Meet the Team</span>
          <h1 className="serif">Meet Our Team</h1>
          <p className="team-lede">
            Our leadership team is made up of passionate students who are committed to spreading smiles and making a
            difference in our community.
          </p>
          <div className="hero-brandmark" aria-hidden="true">
            <SmileMark size={70} />
            <span className="hand">Endless Smiles<br />Coppell Chapter ♥</span>
          </div>
        </div>
      </section>

      <section className="section pyramid-section">
        <div className="container" ref={ref}>
          {loading ? <Loading label="Loading leadership team…" /> : null}
          {error ? <ErrorNote message={error} retry={reload} /> : null}
          {data ? (
            <div className="pyramid reveal in">
              <div className="pyr-tier t1">
                <div className="pyr-row one">{tier1.map((m, i) => <Seat key={m.id} m={m} index={i} lead />)}</div>
              </div>
              <div className="pyr-tier t2">
                <div className="pyr-row two">{tier2.map((m, i) => <Seat key={m.id} m={m} index={i + 1} />)}</div>
              </div>
              <div className="pyr-tier t3">
                <div className="pyr-row three">{tier3.map((m, i) => <Seat key={m.id} m={m} index={i + 3} />)}</div>
              </div>
              {tier4.length ? (
                <div className="pyr-tier t4">
                  <div className="pyr-row three">{tier4.map((m, i) => <Seat key={m.id} m={m} index={i + 6} />)}</div>
                </div>
              ) : null}
              {!members.length ? (
                <p className="muted" style={{ textAlign: 'center' }}>Leadership profiles will appear here once the chapter publishes them.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="team-wave" aria-hidden="true">
          <svg viewBox="0 0 1440 140" preserveAspectRatio="none">
            <path d="M0,70 C240,130 480,10 720,60 C960,110 1200,20 1440,80 L1440,140 L0,140 Z" />
          </svg>
          <span className="hand wave-note">Small acts. Big smiles. ♥</span>
        </div>
      </section>
    </>
  );
}
