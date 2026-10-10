import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks';
import { fmtHours } from '../../lib/format';
import { ErrorNote, Loading } from '../../components/ui';
import { usePrefs } from '../../lib/prefs';
import { IconSettings } from '../../components/icons';
import { STAFF_BASE } from '../../lib/paths';

const CARDS: { key: string; label: string; color: string }[] = [
  { key: 'active_volunteers', label: 'Active volunteers', color: 'var(--crimson)' },
  { key: 'approved_hours', label: 'Approved hours', color: 'var(--blue)' },
  { key: 'pending_submissions', label: 'Pending submissions', color: 'var(--gold)' },
  { key: 'approved_submissions', label: 'Approved submissions', color: 'var(--green)' },
  { key: 'declined_submissions', label: 'Declined submissions', color: 'var(--pink)' },
  { key: 'upcoming_events', label: 'Upcoming events', color: 'var(--blue)' },
  { key: 'completed_events', label: 'Completed events', color: 'var(--green)' },
  { key: 'total_students', label: 'Student records', color: 'var(--gold)' },
];

export default function Overview() {
  const { data, loading, error, reload } = useApi<any>('/api/admin/overview');
  const [prefs, setPrefs] = usePrefs();
  const [cardMenu, setCardMenu] = useState(false);
  const visibleCards = CARDS.filter((c) => !prefs.hiddenCards.includes(c.key));

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Dashboard Overview</h1>
          <p className="tiny muted" style={{ margin: '2px 0 0' }}>Every number below is derived live from the database.</p>
        </div>
        <span className="spacer" />
        <div style={{ position: 'relative' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setCardMenu((v) => !v)} aria-expanded={cardMenu}>
            <IconSettings width={15} height={15} /> Cards
          </button>
          {cardMenu ? (
            <div className="pop-panel glass card card-pad" style={{ position: 'absolute', right: 0, top: 40, width: 250, zIndex: 70 }}>
              <h4 style={{ margin: '0 0 8px' }}>Show summary cards</h4>
              {CARDS.map((c) => (
                <label key={c.key} className="row small" style={{ gap: 8, padding: '3px 0' }}>
                  <input
                    type="checkbox"
                    checked={!prefs.hiddenCards.includes(c.key)}
                    onChange={(e) =>
                      setPrefs({
                        hiddenCards: e.target.checked
                          ? prefs.hiddenCards.filter((k) => k !== c.key)
                          : [...prefs.hiddenCards, c.key],
                      })
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <Link className="btn btn-primary btn-sm" to={`${STAFF_BASE}/approvals`}>Open Approval Center</Link>
      </div>
      {loading ? <Loading label="Crunching chapter numbers…" /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      {data ? (
        <>
          <div className="summary-grid">
            {visibleCards.map((c) => (
              <div className="card stat-card" key={c.key}>
                <span className="accent" style={{ background: c.color }} />
                <span className="value">{c.key === 'approved_hours' ? fmtHours(data[c.key]) : data[c.key]}</span>
                <span className="label">{c.label}</span>
              </div>
            ))}
            {!visibleCards.length ? <p className="muted small">All summary cards hidden — re-enable them from the Cards menu.</p> : null}
          </div>
          <div className="split">
            <div className="card card-pad">
              <h3>Recent administrative activity</h3>
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="table" style={{ minWidth: 0 }}>
                  <tbody>
                    {data.recent_activity.map((a: any) => (
                      <tr key={a.id}>
                        <td><span className={`badge ${a.action.includes('approve') ? 'approved' : a.action.includes('decline') || a.action.includes('reverse') ? 'declined' : 'gray'}`}>{a.action}</span></td>
                        <td className="small">{a.actor_label}</td>
                        <td className="tiny muted">{new Date(a.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.recent_activity.length ? <p className="muted small">No admin activity recorded yet.</p> : null}
            </div>
            <div className="card card-pad">
              <h3>How totals are calculated</h3>
              <ul className="muted small" style={{ paddingLeft: 18, lineHeight: 1.9 }}>
                <li><strong>Approved hours</strong> = sum of <em>active</em> service records (pending/declined never count).</li>
                <li><strong>Active volunteers</strong> = distinct students with ≥1 active approved record.</li>
                <li><strong>Pending</strong> includes correction-requested submissions awaiting review.</li>
                <li>Reversed records are excluded; restoring them re-includes them — totals never drift.</li>
              </ul>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
