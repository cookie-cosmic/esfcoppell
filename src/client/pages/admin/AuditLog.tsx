import { useMemo, useState } from 'react';
import { useApi } from '../../lib/hooks';
import { ErrorNote, Loading } from '../../components/ui';

export default function AuditLog() {
  const [action, setAction] = useState('');
  const query = useMemo(() => `/api/admin/audit?limit=300${action ? `&action=${encodeURIComponent(action)}` : ''}`, [action]);
  const { data, loading, error, reload } = useApi<any[]>(query);

  return (
    <>
      <div className="admin-topbar">
        <span className="spacer" />
        <select className="input" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>
          <option value="submission.">Submission decisions</option>
          <option value="record.">Service record changes</option>
          <option value="student.">Student records</option>
          <option value="event.">Events</option>
          <option value="activity.">Activities</option>
          <option value="team.">Team</option>
          <option value="content.">Homepage content</option>
          <option value="settings.">Settings</option>
          <option value="admin.">Administrators</option>
          <option value="media.">Media</option>
        </select>
      </div>
      <p className="muted small">Every staff action is recorded here. Entries cannot be edited or deleted by ordinary administrators.</p>
      {loading ? <Loading /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      {data ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td className="tiny">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="small">{a.actor_label}</td>
                  <td><span className={`badge ${a.action.includes('approve') ? 'approved' : a.action.includes('decline') || a.action.includes('reverse') || a.action.includes('delete') ? 'declined' : 'gray'}`}>{a.action}</span></td>
                  <td className="tiny muted">{a.entity_type} {a.entity_id ? `#${a.entity_id.slice(-6)}` : ''}</td>
                  <td className="tiny muted" style={{ maxWidth: 380 }}>{(() => { try { const d = JSON.parse(a.details_json); const keys = Object.keys(d); return keys.length ? keys.map((k) => `${k}: ${typeof d[k] === 'object' ? JSON.stringify(d[k]) : d[k]}`).join(' · ') : '—'; } catch { return a.details_json; } })()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
