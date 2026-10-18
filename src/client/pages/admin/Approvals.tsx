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
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkPrompt, setBulkPrompt] = useState(false);
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const query = useMemo(
    () => `/api/admin/submissions?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}&level=${encodeURIComponent(level)}&event=${encodeURIComponent(event)}&from=${from}&to=${to}`,
    [status, search, level, event, from, to]
  );
  const { data, loading, error, reload } = useApi<any[]>(query);
  const pending = (data ?? []).filter((s) => s.status === 'pending' || s.status === 'correction_requested');
  const eventNames = [...new Set(pending.map((s) => s.event_name as string))].sort();
  const approverSummary = Object.values((data ?? []).filter((s) => s.status === 'approved' && s.approval_first_name).reduce((groups: Record<string, { name: string; count: number; hours: number; latest: string }>, s) => {
    const name = `${s.approval_first_name} ${s.approval_last_name}`;
    const current = groups[name] ?? { name, count: 0, hours: 0, latest: s.decided_at };
    current.count += 1;
    current.hours += Number(s.total_hours) || 0;
    if (s.decided_at > current.latest) current.latest = s.decided_at;
    groups[name] = current;
    return groups;
  }, {})).sort((a, b) => b.latest.localeCompare(a.latest));
  const allSelected = pending.length > 0 && pending.every((s) => selected.includes(s.id));
  const toggleAll = () => setSelected(allSelected ? [] : pending.map((s) => s.id));
  const toggleSelected = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const onChanged = () => {
    setSelected([]);
    reload();
  };
  const exportUrl = `/api/admin/submissions/export.csv${tab === 'history' ? '?status=approved' : ''}`;

  return (
    <>
      <div className="admin-topbar">
        <h1>Approval Center</h1>
        <div className="tabs" role="tablist">
          <button className={tab === 'queue' ? 'active' : ''} onClick={() => { setTab('queue'); setStatus('pending'); }}>Approval queue</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => { setTab('history'); setStatus('approved'); }}>Approver sheet</button>
        </div>
        <button className="btn btn-primary" onClick={() => { setTab('queue'); setStatus('pending'); setBulkPrompt(true); }}><IconCheck width={16} height={16} /> Mass approval</button>
        <a className="btn btn-outline" href={exportUrl}>Export CSV</a>
        <span className="muted small">Approvals are atomic, idempotent, and audited.</span>
      </div>
      <section className="card card-pad" style={{ marginBottom: 16, border: '2px solid var(--crimson)' }}>
        <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ margin: 0 }}>Mass approval</h3>
            <p className="muted small" style={{ margin: '5px 0 0' }}>
              Select submissions below, approve all visible pending hours, or approve every pending submission for an event.
              You will enter the approver’s first and last name in the next window.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => { setTab('queue'); setStatus('pending'); setBulkPrompt(true); }}>
            <IconCheck width={18} height={18} /> MASS APPROVE
          </button>
        </div>
      </section>
      <div className="toolbar">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="pending">Pending + corrections</option>
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="correction_requested">Correction requested</option>
        </select>
        <input className="input" placeholder="Search student…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search student" />
        <select className="input" value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Filter by event">
          <option value="">All events</option>
          {eventNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select className="input" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by level">
          <option value="">All levels</option>
          {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="tiny muted">From <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="tiny muted">To <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {tab === 'queue' && pending.length ? (
        <div className="btn-row" style={{ marginBottom: 14 }}>
          <label className="small row" style={{ gap: 8 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all visible pending hours
          </label>
          <button className="btn btn-primary btn-sm" disabled={!selected.length} onClick={() => setBulkPrompt(true)}>
            <IconCheck width={15} height={15} /> Approve selected ({selected.length})
          </button>
          {event ? <button className="btn btn-outline btn-sm" onClick={() => setBulkPrompt(true)}>Approve all for “{event}”</button> : null}
        </div>
      ) : null}
      {loading ? <Loading /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      {data ? (
        <>
          {tab === 'history' && approverSummary.length ? (
            <section className="card card-pad" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Approver sheet — Hours approved by</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Approver</th><th>People / submissions</th><th>Hours</th><th>Most recent approval</th></tr></thead>
                  <tbody>{approverSummary.map((summary) => <tr key={summary.name}><td><strong>{summary.name}</strong></td><td>{summary.count}</td><td>{fmtHours(summary.hours)}h</td><td>{new Date(summary.latest).toLocaleString()}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          ) : null}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Student</th><th>Level</th><th>Event</th><th>Date</th><th>Times</th><th>Hours</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {(s.status === 'pending' || s.status === 'correction_requested') ? <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelected(s.id)} aria-label={`Select ${s.first_name} ${s.last_name}`} /> : null}
                      {' '}<strong>{s.first_name} {s.last_name}</strong><div className="tiny muted">{s.email}</div>
                    </td>
                    <td>{LEVEL_LABEL[s.school_level] ?? s.school_level}</td>
                    <td>{s.event_name}<div className="tiny muted">{s.event_type}</div></td>
                    <td>{fmtDate(s.event_date)}</td>
                    <td className="small">{s.start_time ?? '—'} → {s.end_time ?? '—'}</td>
                    <td><strong>{fmtHours(s.total_hours)}</strong>{s.computed_hours !== null && s.computed_hours !== s.total_hours ? <div className="tiny" style={{ color: 'var(--amber)' }}>computed {fmtHours(s.computed_hours)}</div> : null}</td>
                    <td>
                      <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                      {s.status === 'approved' && s.approval_first_name ? <div className="tiny muted">Approved by {s.approval_first_name} {s.approval_last_name}<br />{new Date(s.decided_at).toLocaleString()}</div> : null}
                    </td>
                    <td><button className="btn btn-sm btn-outline" onClick={() => setOpenId(s.id)}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.length ? <EmptyState glyph="✅" title="Queue is clear" body="No submissions match the current filters." /> : null}
        </>
      ) : null}
      {openId ? <ReviewModal id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} /> : null}
      {bulkPrompt ? <BulkApprovalModal selectedIds={selected} visibleIds={pending.map((s) => s.id)} eventNames={eventNames} defaultEvent={event} onClose={() => setBulkPrompt(false)} onChanged={onChanged} /> : null}
    </>
  );
}

function BulkApprovalModal({ selectedIds, visibleIds, eventNames, defaultEvent, onClose, onChanged }: { selectedIds: string[]; visibleIds: string[]; eventNames: string[]; defaultEvent: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [scope, setScope] = useState<'selected' | 'visible' | 'event'>(selectedIds.length ? 'selected' : defaultEvent ? 'event' : 'visible');
  const [eventName, setEventName] = useState(defaultEvent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const approve = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter the approver’s first and last name.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.post('/api/admin/submissions/bulk-approve', {
        submission_ids: scope === 'selected' ? selectedIds : scope === 'visible' ? visibleIds : [],
        event_name: scope === 'event' ? eventName : undefined,
        approval_first_name: firstName,
        approval_last_name: lastName,
      });
      toast('success', `${result.approved} submission${result.approved === 1 ? '' : 's'} approved.`);
      onClose();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Bulk approval failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Who approved these hours?" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={approve}>{busy ? <span className="spinner" /> : null} Approve hours</button></>}>
      <p className="muted small">Choose which pending hours to approve. The approver name is stored with every approved submission and shown in the approval history.</p>
      <Field label="Mass approval scope">
        <select className="input" value={scope} onChange={(e) => setScope(e.target.value as 'selected' | 'visible' | 'event')}>
          <option value="selected" disabled={!selectedIds.length}>Selected submissions ({selectedIds.length})</option>
          <option value="visible">All visible pending submissions ({visibleIds.length})</option>
          <option value="event">All pending submissions for one event</option>
        </select>
      </Field>
      {scope === 'event' ? <Field label="Event" required><select className="input" value={eventName} onChange={(e) => setEventName(e.target.value)}><option value="">Select an event…</option>{eventNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></Field> : null}
      <div className="split">
        <Field label="First name" required><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus /></Field>
        <Field label="Last name" required><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </Modal>
  );
}

function ReviewModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<any>(`/api/admin/submissions/${id}`);
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | 'approve' | 'decline' | 'correct'>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [approvalFirstName, setApprovalFirstName] = useState('');
  const [approvalLastName, setApprovalLastName] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (kind: 'approve' | 'decline' | 'correct' | 'note') => {
    setBusy(true);
    try {
      if (kind === 'approve') {
        const res = await api.post(`/api/admin/submissions/${id}/approve`, {
          note: note || undefined,
          approval_first_name: approvalFirstName,
          approval_last_name: approvalLastName,
        });
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
      setApprovalFirstName('');
      setApprovalLastName('');
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
            {s.approval_first_name ? <><dt>Hours approved by</dt><dd>{s.approval_first_name} {s.approval_last_name} · {s.decided_at ? new Date(s.decided_at).toLocaleString() : '—'}</dd></> : null}
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
        <Modal title="Who approved these hours?" onClose={() => setConfirm(null)} footer={<><button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => act('approve')}>{busy ? <span className="spinner" /> : null} Approve hours</button></>}>
          <p className="muted small">This will add <strong>{fmtHours(s?.total_hours ?? 0)} hours</strong> to {s?.first_name} {s?.last_name} and store the approver in the approval history.</p>
          <div className="split">
            <Field label="First name" required><input className="input" value={approvalFirstName} onChange={(e) => setApprovalFirstName(e.target.value)} autoFocus /></Field>
            <Field label="Last name" required><input className="input" value={approvalLastName} onChange={(e) => setApprovalLastName(e.target.value)} /></Field>
          </div>
        </Modal>
      ) : null}
    </Modal>
  );
}
