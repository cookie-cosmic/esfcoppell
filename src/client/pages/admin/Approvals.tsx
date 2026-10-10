import { useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { LEVEL_LABEL, STATUS_LABEL, fmtDate, fmtHours } from '../../lib/format';
import { ConfirmDialog, EmptyState, ErrorNote, Field, Loading, Modal, useToast } from '../../components/ui';
import { IconCheck, IconEdit, IconX } from '../../components/icons';

export default function Approvals() {
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [event, setEvent] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useMemo(
    () => `/api/admin/submissions?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}&level=${encodeURIComponent(level)}&event=${encodeURIComponent(event)}&from=${from}&to=${to}`,
    [status, search, level, event, from, to]
  );
  const { data, loading, error, reload } = useApi<any[]>(query);

  return (
    <>
      <div className="admin-topbar">
        <h1>Approval Center</h1>
        <span className="spacer" />
        <span className="muted small">Approvals are atomic, idempotent, and audited.</span>
      </div>
      <div className="toolbar">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="pending">Pending + corrections</option>
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="correction_requested">Correction requested</option>
        </select>
        <input className="input" placeholder="Search student…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search student" />
        <input className="input" placeholder="Event name…" value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Filter by event" />
        <select className="input" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by level">
          <option value="">All levels</option>
          {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="tiny muted">From <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="tiny muted">To <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {loading ? <Loading /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      {data ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Student</th><th>Level</th><th>Event</th><th>Date</th><th>Times</th><th>Hours</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.first_name} {s.last_name}</strong><div className="tiny muted">{s.email}</div></td>
                    <td>{LEVEL_LABEL[s.school_level] ?? s.school_level}</td>
                    <td>{s.event_name}<div className="tiny muted">{s.event_type}</div></td>
                    <td>{fmtDate(s.event_date)}</td>
                    <td className="small">{s.start_time ?? '—'} → {s.end_time ?? '—'}</td>
                    <td><strong>{fmtHours(s.total_hours)}</strong>{s.computed_hours !== null && s.computed_hours !== s.total_hours ? <div className="tiny" style={{ color: 'var(--amber)' }}>computed {fmtHours(s.computed_hours)}</div> : null}</td>
                    <td><span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span></td>
                    <td><button className="btn btn-sm btn-outline" onClick={() => setOpenId(s.id)}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.length ? <EmptyState glyph="✅" title="Queue is clear" body="No submissions match the current filters." /> : null}
        </>
      ) : null}
      {openId ? <ReviewModal id={openId} onClose={() => setOpenId(null)} onChanged={reload} /> : null}
    </>
  );
}

function ReviewModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<any>(`/api/admin/submissions/${id}`);
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | 'approve' | 'decline' | 'correct'>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (kind: 'approve' | 'decline' | 'correct' | 'note') => {
    setBusy(true);
    try {
      if (kind === 'approve') {
        const res = await api.post(`/api/admin/submissions/${id}/approve`, { note: note || undefined });
        toast('success', res.idempotent ? 'Already approved earlier — no hours were double-counted.' : 'Submission approved; hours added to official totals.');
      } else if (kind === 'decline') {
        await api.post(`/api/admin/submissions/${id}/decline`, { reason });
        toast('success', 'Submission declined with reason.');
      } else if (kind === 'correct') {
        await api.post(`/api/admin/submissions/${id}/request-correction`, { reason });
        toast('info', 'Correction requested — student will see your feedback via their tracking code.');
      } else {
        await api.post(`/api/admin/submissions/${id}/note`, { note });
        toast('success', 'Internal note recorded.');
      }
      setConfirm(null);
      setReason('');
      setNote('');
      reload();
      onChanged();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const s = data?.submission;
  return (
    <Modal title={s ? `Review: ${s.first_name} ${s.last_name}` : 'Review submission'} onClose={onClose} wide>
      {loading ? <Loading /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      {s ? (
        <>
          <dl className="kv">
            <dt>Status</dt><dd><span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span></dd>
            <dt>Student</dt><dd>{s.first_name} {s.last_name} · {LEVEL_LABEL[s.school_level]} · {s.email}</dd>
            <dt>Event</dt><dd>{s.event_name} ({s.event_type})</dd>
            <dt>Event date</dt><dd>{fmtDate(s.event_date)}</dd>
            <dt>Times</dt><dd>{s.start_time ?? '—'} → {s.end_time ?? '—'} {s.computed_hours !== null ? `(server-computed ${fmtHours(s.computed_hours)}h)` : ''}</dd>
            <dt>Reported hours</dt><dd><strong>{fmtHours(s.total_hours)}</strong></dd>
            <dt>Approvers</dt><dd>{s.approver_primary}{s.approver_secondary ? ` · ${s.approver_secondary}` : ''}</dd>
            <dt>Submitted</dt><dd>{new Date(s.created_at).toLocaleString()}</dd>
            {s.decline_reason ? <><dt>Feedback</dt><dd>{s.decline_reason}</dd></> : null}
          </dl>
          <div className="split" style={{ marginTop: 18 }}>
            <div>
              <Field label="Internal review note (optional)">
                <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to admins only; stored with an approve decision or as a standalone note." />
              </Field>
              <div className="btn-row">
                {(s.status === 'pending' || s.status === 'correction_requested') ? (
                  <>
                    <button className="btn btn-primary" onClick={() => setConfirm('approve')}><IconCheck width={16} height={16} /> Approve hours</button>
                    <button className="btn btn-danger" onClick={() => setConfirm('decline')}><IconX width={16} height={16} /> Decline</button>
                    <button className="btn btn-outline" onClick={() => setConfirm('correct')}><IconEdit width={16} height={16} /> Request correction</button>
                  </>
                ) : (
                  <p className="muted small">This submission is already {STATUS_LABEL[s.status].toLowerCase()}. Use Volunteers → service records to correct or reverse hours.</p>
                )}
                <button className="btn btn-ghost" onClick={() => act('note')}>Save note only</button>
              </div>
              {confirm === 'decline' || confirm === 'correct' ? (
                <div className="card card-pad" style={{ marginTop: 14, background: 'var(--crimson-soft)' }}>
                  <Field label={confirm === 'decline' ? 'Decline reason (shared with student)' : 'What needs correcting? (shared with student)'} required>
                    <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
                  </Field>
                  <div className="btn-row">
                    <button className="btn btn-sm btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
                    <button className="btn btn-sm btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => act(confirm)}>
                      {confirm === 'decline' ? 'Confirm decline' : 'Confirm request'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <h4>Decision history</h4>
              <div className="stack" style={{ gap: 8 }}>
                {data.decisions.map((d: any) => (
                  <div key={d.id} className="card card-pad" style={{ padding: '10px 14px' }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className={`badge ${d.action === 'approve' ? 'approved' : d.action === 'decline' || d.action === 'reverse' ? 'declined' : 'gray'}`}>{d.action}</span>
                      <span className="small">{d.admin_name}</span>
                      <span className="tiny muted" style={{ marginLeft: 'auto' }}>{new Date(d.created_at).toLocaleString()}</span>
                    </div>
                    {d.reason ? <p className="tiny muted" style={{ margin: '6px 0 0' }}>{d.reason}</p> : null}
                  </div>
                ))}
                {!data.decisions.length ? <p className="muted small">No decisions yet.</p> : null}
              </div>
              <h4 style={{ marginTop: 16 }}>Resulting service records</h4>
              {data.records.map((r: any) => (
                <p key={r.id} className="small" style={{ margin: '4px 0' }}>
                  <span className={`badge ${r.status === 'active' ? 'approved' : 'declined'}`}>{r.status}</span> {fmtHours(r.hours)}h · {r.event_name} · {fmtDate(r.event_date)}
                </p>
              ))}
              {!data.records.length ? <p className="muted small">None yet — created atomically on approval.</p> : null}
            </div>
          </div>
        </>
      ) : null}
      {confirm === 'approve' ? (
        <ConfirmDialog
          title="Approve these hours?"
          body={<>This will add <strong>{fmtHours(s?.total_hours ?? 0)} hours</strong> to {s?.first_name} {s?.last_name}’s official total and create a service record. The operation is idempotent — approving twice never double-counts.</>}
          confirmLabel="Approve hours"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => act('approve')}
        />
      ) : null}
    </Modal>
  );
}
