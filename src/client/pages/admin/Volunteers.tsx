import { useMemo, useState } from 'react';
import { api, ApiError, staffToken } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { LEVEL_LABEL, STATUS_LABEL, fmtDate, fmtHours, medalProgress } from '../../lib/format';
import { ConfirmDialog, EmptyState, ErrorNote, Field, Loading, Modal, ProgressBar, useToast } from '../../components/ui';
import { IconPlus } from '../../components/icons';

export default function Volunteers() {
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [sort, setSort] = useState('name');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { data: config } = useApi<any>('/api/config');
  const query = useMemo(
    () => `/api/admin/students?search=${encodeURIComponent(search)}&level=${encodeURIComponent(level)}&sort=${sort}&includeInactive=${includeInactive}`,
    [search, level, sort, includeInactive]
  );
  const { data, loading, error, reload } = useApi<any[]>(query);
  const toast = useToast();

  const exportCsv = async () => {
    const base = (import.meta as any).env?.VITE_API_BASE ?? '';
    const res = await fetch(`${base}/api/admin/students/export.csv`, {
      headers: staffToken.get() ? { Authorization: `Bearer ${staffToken.get()}` } : undefined,
    });
    if (!res.ok) return toast('error', 'Export failed.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'volunteers.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('success', 'CSV export downloaded.');
  };

  return (
    <>
      <div className="admin-topbar">
        <h1>Volunteer Management</h1>
        <span className="spacer" />
        <button className="btn btn-outline btn-sm" onClick={exportCsv}>Export CSV</button>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><IconPlus width={15} height={15} /> Add student</button>
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
        <select className="input" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by level">
          <option value="">All levels</option>
          {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="name">Sort: name</option>
          <option value="hours">Sort: approved hours</option>
        </select>
        <label className="row tiny muted" style={{ gap: 6 }}><input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} /> include inactive</label>
      </div>
      {loading ? <Loading /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      {data ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Student</th><th>Level</th><th>Approved hours</th><th>Pending</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} style={{ opacity: s.active ? 1 : 0.55 }}>
                    <td><strong>{s.first_name} {s.last_name}</strong><div className="tiny muted">{s.email}</div></td>
                    <td>{LEVEL_LABEL[s.school_level] ?? s.school_level}</td>
                    <td><strong>{fmtHours(s.total_hours)}</strong></td>
                    <td>{s.pending_count ? <span className="badge pending">{s.pending_count}</span> : <span className="muted tiny">—</span>}</td>
                    <td>{s.active ? <span className="badge approved">active</span> : <span className="badge gray">inactive</span>}</td>
                    <td><button className="btn btn-sm btn-outline" onClick={() => setOpenId(s.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.length ? <EmptyState glyph="🧑‍🎓" title="No students match" body="Add a student record or adjust filters." action={<button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>Add student</button>} /> : null}
        </>
      ) : null}
      {openId ? <StudentModal id={openId} onClose={() => setOpenId(null)} onChanged={reload} config={config} /> : null}
      {adding ? <AddStudentModal onClose={() => setAdding(false)} onAdded={() => { setAdding(false); reload(); }} config={config} /> : null}
    </>
  );
}

function AddStudentModal({ onClose, onAdded, config }: { onClose: () => void; onAdded: () => void; config: any }) {
  const toast = useToast();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', school_level: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/api/admin/students', form);
      toast('success', 'Student record created.');
      onAdded();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Add student record" onClose={onClose} footer={<>
      <button className="btn btn-outline" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || !form.first_name || !form.last_name || !form.school_level} onClick={submit}>Create</button>
    </>}>
      <div className="form-grid">
        <Field label="First name" required><input className="input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
        <Field label="Last name" required><input className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="School level" required>
          <select className="input" value={form.school_level} onChange={(e) => setForm({ ...form, school_level: e.target.value })}>
            <option value="">Select…</option>
            {(config?.school_levels ?? []).map((l: any) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function StudentModal({ id, onClose, onChanged, config }: { id: string; onClose: () => void; onChanged: () => void; config: any }) {
  const { data, loading, error, reload } = useApi<any>(`/api/admin/students/${id}`);
  const toast = useToast();
  const [tab, setTab] = useState<'records' | 'submissions' | 'edit'>('records');
  const [manual, setManual] = useState({ event_name: '', event_date: '', hours: '', event_type: 'synchronous', reason: '' });
  const [recordAction, setRecordAction] = useState<null | { kind: 'reverse' | 'restore' | 'correct'; record: any }>(null);
  const [reason, setReason] = useState('');
  const [correctHours, setCorrectHours] = useState('');
  const [deactivate, setDeactivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const s = data?.student;
  const progress = s ? medalProgress(s.total_hours, s.medal_targets) : null;

  const addManual = async () => {
    setBusy(true);
    try {
      await api.post(`/api/admin/students/${id}/hours`, { ...manual, hours: Number(manual.hours) });
      toast('success', 'Manual hours added with reason (audited).');
      setManual({ event_name: '', event_date: '', hours: '', event_type: 'synchronous', reason: '' });
      reload();
      onChanged();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  const runRecordAction = async () => {
    if (!recordAction) return;
    if (reason.trim().length < 3) {
      toast('error', 'A reason (at least 3 characters) is required for the audit log.');
      return;
    }
    setBusy(true);
    try {
      if (recordAction.kind === 'reverse') await api.post(`/api/admin/students/records/${recordAction.record.id}/reverse`, { reason });
      if (recordAction.kind === 'restore') await api.post(`/api/admin/students/records/${recordAction.record.id}/restore`, { reason });
      if (recordAction.kind === 'correct') await api.patch(`/api/admin/students/records/${recordAction.record.id}`, { hours: Number(correctHours), reason });
      toast('success', `Record ${recordAction.kind === 'correct' ? 'corrected' : recordAction.kind === 'reverse' ? 'reversed' : 'restored'} — medal progress recalculated.`);
      setRecordAction(null);
      setReason('');
      reload();
      onChanged();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (patch: any) => {
    try {
      await api.patch(`/api/admin/students/${id}`, patch);
      toast('success', 'Student updated.');
      reload();
      onChanged();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Failed.');
    }
  };

  return (
    <Modal title={s ? `${s.first_name} ${s.last_name}` : 'Student'} onClose={onClose} wide>
      {loading ? <Loading /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      {s ? (
        <>
          <div className="row" style={{ marginBottom: 14 }}>
            <span className="badge gray">{LEVEL_LABEL[s.school_level]}</span>
            <span className="badge approved">{fmtHours(s.total_hours)} approved hours</span>
            {s.access_code ? <span className="tiny muted">tracking code {s.access_code}</span> : null}
            <span className="spacer" />
            <div className="tabs" style={{ margin: 0, border: 0 }}>
              {(['records', 'submissions', 'edit'] as const).map((t) => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} style={{ border: '1px solid var(--line-2)', borderRadius: 999, padding: '6px 14px' }}>
                  {t === 'records' ? 'Service records' : t === 'submissions' ? 'Submissions' : 'Edit'}
                </button>
              ))}
            </div>
          </div>
          {progress ? (
            <div className="row" style={{ gap: 20, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="tiny muted">Silver {fmtHours(progress.silver.hours)}/{progress.silver.target}h {progress.silver.complete ? '· earned 🥈' : `· ${fmtHours(progress.silver.remaining)}h left`}</div>
                <ProgressBar percent={progress.silver.percent} kind="silver" label="Silver progress" />
              </div>
              <div style={{ flex: 1 }}>
                <div className="tiny muted">Gold {fmtHours(progress.gold.hours)}/{progress.gold.target}h {progress.gold.complete ? '· earned 🥇' : `· ${fmtHours(progress.gold.remaining)}h left`}</div>
                <ProgressBar percent={progress.gold.percent} kind="gold" label="Gold progress" />
              </div>
            </div>
          ) : null}

          {tab === 'records' ? (
            <>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 0 }}>
                  <thead><tr><th>Event</th><th>Date</th><th>Hours</th><th>Source</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {data.records.map((r: any) => (
                      <tr key={r.id}>
                        <td>{r.event_name}</td>
                        <td>{fmtDate(r.event_date)}</td>
                        <td><strong>{fmtHours(r.hours)}</strong></td>
                        <td className="tiny muted">{r.source}{r.reason ? ` · ${r.reason}` : ''}</td>
                        <td><span className={`badge ${r.status === 'active' ? 'approved' : 'declined'}`}>{r.status}</span></td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <button className="btn btn-sm btn-outline" onClick={() => { setRecordAction({ kind: 'correct', record: r }); setCorrectHours(String(r.hours)); }}>Correct</button>
                            {r.status === 'active'
                              ? <button className="btn btn-sm btn-danger" onClick={() => setRecordAction({ kind: 'reverse', record: r })}>Reverse</button>
                              : <button className="btn btn-sm btn-outline" onClick={() => setRecordAction({ kind: 'restore', record: r })}>Restore</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 style={{ marginTop: 18 }}>Add verified hours manually</h4>
              <div className="form-grid">
                <Field label="Event name" required><input className="input" value={manual.event_name} onChange={(e) => setManual({ ...manual, event_name: e.target.value })} /></Field>
                <Field label="Event date" required><input className="input" type="date" value={manual.event_date} onChange={(e) => setManual({ ...manual, event_date: e.target.value })} /></Field>
                <Field label="Hours" required><input className="input" type="number" step="0.25" min="0.25" max="24" value={manual.hours} onChange={(e) => setManual({ ...manual, hours: e.target.value })} /></Field>
                <Field label="Type">
                  <select className="input" value={manual.event_type} onChange={(e) => setManual({ ...manual, event_type: e.target.value })}>
                    <option value="synchronous">Synchronous</option><option value="asynchronous">Asynchronous</option>
                  </select>
                </Field>
                <Field label="Reason (required, audited)" className="full"><input className="input" value={manual.reason} onChange={(e) => setManual({ ...manual, reason: e.target.value })} placeholder="e.g. Verified via school counselor letter dated …" /></Field>
              </div>
              <button className="btn btn-primary btn-sm" disabled={busy || !manual.event_name || !manual.event_date || !manual.hours || manual.reason.trim().length < 3} onClick={addManual}>Add hours</button>
            </>
          ) : null}

          {tab === 'submissions' ? (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 0 }}>
                <thead><tr><th>Event</th><th>Date</th><th>Hours</th><th>Status</th><th>Submitted</th></tr></thead>
                <tbody>
                  {data.submissions.map((sub: any) => (
                    <tr key={sub.id}>
                      <td>{sub.event_name}</td>
                      <td>{fmtDate(sub.event_date)}</td>
                      <td>{fmtHours(sub.total_hours)}</td>
                      <td><span className={`badge ${sub.status}`}>{STATUS_LABEL[sub.status]}</span></td>
                      <td className="tiny muted">{new Date(sub.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === 'edit' ? (
            <div className="form-grid">
              <Field label="First name"><input className="input" defaultValue={s.first_name} onBlur={(e) => e.target.value !== s.first_name && saveEdit({ first_name: e.target.value })} /></Field>
              <Field label="Last name"><input className="input" defaultValue={s.last_name} onBlur={(e) => e.target.value !== s.last_name && saveEdit({ last_name: e.target.value })} /></Field>
              <Field label="Email"><input className="input" defaultValue={s.email ?? ''} onBlur={(e) => saveEdit({ email: e.target.value || null })} /></Field>
              <Field label="School level" hint="Changing level recalculates medal requirements automatically.">
                <select className="input" defaultValue={s.school_level} onChange={(e) => saveEdit({ school_level: e.target.value })}>
                  {(config?.school_levels ?? []).map((l: any) => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
              </Field>
              <div className="full">
                <button className="btn btn-danger btn-sm" onClick={() => setDeactivate(true)} disabled={!s.active}>Deactivate record</button>
                {s.active ? <span className="tiny muted" style={{ marginLeft: 10 }}>Soft-deletes: history is preserved for accountability.</span> : <span className="badge gray">inactive</span>}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {recordAction ? (
        <ConfirmDialog
          title={recordAction.kind === 'correct' ? 'Correct approved hours' : recordAction.kind === 'reverse' ? 'Reverse this approval?' : 'Restore this record?'}
          body={
            <>
              {recordAction.kind === 'reverse' ? (
                <p>The hours will stop counting toward totals and medal progress. The submission returns to pending. This is recorded in the audit log.</p>
              ) : recordAction.kind === 'restore' ? (
                <p>The record becomes active again and its hours count toward totals once more.</p>
              ) : null}
              {recordAction.kind === 'correct' ? (
                <Field label="Corrected hours" required>
                  <input className="input" type="number" step="0.25" min="0.25" max="24" value={correctHours} onChange={(e) => setCorrectHours(e.target.value)} />
                </Field>
              ) : null}
              <Field label="Reason (required, audited)" required>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the change for the audit log" />
              </Field>
            </>
          }
          confirmLabel={recordAction.kind === 'reverse' ? 'Reverse record' : recordAction.kind === 'restore' ? 'Restore record' : 'Save correction'}
          danger={recordAction.kind === 'reverse'}
          busy={busy}
          onCancel={() => setRecordAction(null)}
          onConfirm={runRecordAction}
        />
      ) : null}
      {deactivate ? (
        <ConfirmDialog
          title="Deactivate this student?"
          body="The record and all history stay in the database (retention policy) but the student leaves public directories."
          confirmLabel="Deactivate"
          danger
          onCancel={() => setDeactivate(false)}
          onConfirm={async () => { await saveEdit({ active: 0 }); setDeactivate(false); }}
        />
      ) : null}
    </Modal>
  );
}
