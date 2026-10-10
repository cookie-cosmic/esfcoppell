import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { asArray, useApi, usePageTitle } from '../lib/hooks';
import { LEVEL_LABEL, fmtDate, fmtHours } from '../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Pagination, ProgressBar, useToast } from '../components/ui';
import { IconCheck, IconClock, IconMedal } from '../components/icons';


const emptyForm = {
  first_name: '', last_name: '', email: '', school_level: '', event_type: 'synchronous',
  event_pick: '', event_other: '', event_date: '', start_time: '', end_time: '',
  total_hours: '', approver_primary: '', approver_secondary: '',
};

function clientValidate(f: typeof emptyForm, hourRules: any): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!f.first_name.trim()) errors.first_name = 'First name is required.';
  if (!f.last_name.trim()) errors.last_name = 'Last name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errors.email = 'A valid email is required to track your submission.';
  if (!f.school_level) errors.school_level = 'Select your school level.';
  const eventName = f.event_pick === '__other' ? f.event_other.trim() : f.event_pick;
  if (!eventName) errors.event_pick = 'Choose an event or activity, or pick “Other”.';
  if (!f.event_date) errors.event_date = 'Event date is required.';
  else if (new Date(`${f.event_date}T12:00:00`).getTime() > Date.now() + 86400000) errors.event_date = 'Event date cannot be in the future.';
  const hours = Number(f.total_hours);
  if (!f.total_hours || !Number.isFinite(hours) || hours <= 0) errors.total_hours = 'Enter total hours greater than zero.';
  else if (hours > (hourRules?.max_hours_per_submission ?? 12)) errors.total_hours = `Maximum ${hourRules?.max_hours_per_submission ?? 12} hours per submission.`;
  else if (f.event_type === 'asynchronous' && hours > (hourRules?.async_max_hours ?? 8)) errors.total_hours = `Asynchronous activities are capped at ${hourRules?.async_max_hours ?? 8} hours.`;
  if (!f.approver_primary.trim()) errors.approver_primary = 'A primary approver is required.';
  if (f.event_type === 'synchronous') {
    if (!f.start_time) errors.start_time = 'Required for synchronous activities.';
    if (!f.end_time) errors.end_time = 'Required for synchronous activities.';
    if (f.start_time && f.end_time && f.total_hours && Number.isFinite(hours)) {
      const [sh, sm] = f.start_time.split(':').map(Number);
      const [eh, em] = f.end_time.split(':').map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      const spansMidnight = mins <= 0;
      if (spansMidnight) mins += 24 * 60;
      const computed = mins / 60;
      if (Math.abs(computed - hours) > (hourRules?.sync_tolerance_hours ?? 0.25)) {
        errors.total_hours = `Hours don’t match the start/end times (${fmtHours(Math.round(computed * 100) / 100)}h${spansMidnight ? ', spanning midnight' : ''}).`;
      }
    }
  }
  return errors;
}

export default function Hours() {
  usePageTitle('Volunteer Hours');
  const toast = useToast();
  const { data: config } = useApi<any>('/api/config');
  const { data: events } = useApi<any[]>('/api/events?scope=upcoming');
  const { data: activities } = useApi<any[]>('/api/activities');
  const [form, setForm] = useState({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ access_code: string } | null>(null);
  const eventList = asArray(events);
  const activityList = asArray(activities);

  const set = (k: keyof typeof emptyForm) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = clientValidate(form, config?.hour_rules);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast('error', 'Please fix the highlighted fields before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const eventName = form.event_pick === '__other' ? form.event_other.trim() : form.event_pick;
      const pickedEvent = eventList.find((ev) => ev.title === form.event_pick);
      const res = await api.post('/api/submissions', {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        school_level: form.school_level,
        event_type: form.event_type,
        event_name: eventName,
        event_id: pickedEvent?.id ?? null,
        event_date: form.event_date,
        start_time: form.event_type === 'synchronous' ? form.start_time : form.start_time || null,
        end_time: form.event_type === 'synchronous' ? form.end_time : form.end_time || null,
        total_hours: Number(form.total_hours),
        approver_primary: form.approver_primary.trim(),
        approver_secondary: form.approver_secondary.trim() || null,
      });
      setCreated(res);
      setForm({ ...emptyForm });
      toast('success', 'Submission received — it is pending review. See it below in Detailed Service Records.');
      setTimeout(() => document.getElementById('records')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 422 && err.details) setErrors(err.details);
      toast('error', err instanceof ApiError ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="section-tight" style={{ background: 'var(--ink)', color: '#fff', paddingTop: 54, paddingBottom: 54 }}>
        <div className="container">
          <span className="eyebrow" style={{ color: '#ffb3c0' }}>Service hour tracking</span>
          <h1 style={{ color: '#fff' }}>Volunteer Hours</h1>
          <p style={{ color: '#cfd1d6', maxWidth: 680, margin: 0 }}>
            Submit your hours, then watch your submission move from Pending to Approved right in the
            service records below — and track your progress toward silver and gold medals.
          </p>
        </div>
      </section>

      <div className="section">
        <div className="container">
          <div className="split" style={{ alignItems: 'start' }}>
            {/* submission form */}
            <section className="card card-pad" id="submit" aria-labelledby="submit-h">
              <h2 id="submit-h" style={{ fontSize: '1.5rem' }}>Submit Volunteer Hours</h2>
              <p className="muted small">
                New submissions start as <strong>Pending</strong>. Hours only count after an administrator approves them —
                viewing or joining an activity never awards hours automatically.
              </p>
              {created ? (
                <div className="card card-pad" style={{ background: 'var(--green-soft)', borderColor: 'var(--green)', marginBottom: 18 }}>
                  <strong style={{ display: 'flex', gap: 8, alignItems: 'center' }}><IconCheck style={{ color: 'var(--green)' }} /> Submission received!</strong>
                  <p className="small muted" style={{ margin: '8px 0' }}>
                    Your tracking code (saved on this device so your statuses appear in the records below):
                  </p>
                  <span className="code-chip">{created.access_code}</span>
                </div>
              ) : null}
              <form onSubmit={onSubmit} noValidate>
                <div className="form-grid">
                  <Field label="First name" required error={errors.first_name}>
                    <input className={`input ${errors.first_name ? 'invalid' : ''}`} value={form.first_name} onChange={set('first_name')} autoComplete="given-name" />
                  </Field>
                  <Field label="Last name" required error={errors.last_name}>
                    <input className={`input ${errors.last_name ? 'invalid' : ''}`} value={form.last_name} onChange={set('last_name')} autoComplete="family-name" />
                  </Field>
                  <Field label="Email (links your submissions)" required error={errors.email} className="full"
                    hint="Used to match your future submissions to your record.">
                    <input className={`input ${errors.email ? 'invalid' : ''}`} type="email" value={form.email} onChange={set('email')} autoComplete="email" />
                  </Field>
                  <Field label="School level" required error={errors.school_level}>
                    <select className="input" value={form.school_level} onChange={set('school_level')}>
                      <option value="">Select…</option>
                      {(config?.school_levels ?? []).map((l: any) => <option key={l.key} value={l.key}>{l.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Event type" required>
                    <div className="row" style={{ gap: 16 }}>
                      {['synchronous', 'asynchronous'].map((t) => (
                        <label key={t} className="row" style={{ gap: 6, cursor: 'pointer' }}>
                          <input type="radio" name="event_type" value={t} checked={form.event_type === t} onChange={set('event_type')} />
                          <span className="small"><strong>{t === 'synchronous' ? 'Synchronous' : 'Asynchronous'}</strong>{t === 'synchronous' ? ' (in real time)' : ' (self-paced)'}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Event name" required error={errors.event_pick} className="full"
                    hint="Pick a chapter event/activity, or “Other approved activity”.">
                    <select className="input" value={form.event_pick} onChange={set('event_pick')}>
                      <option value="">Select…</option>
                      <optgroup label="Upcoming / recent chapter events">
                        {eventList.filter((e) => e.status === 'published').map((e) => <option key={e.id} value={e.title}>{e.title}</option>)}
                      </optgroup>
                      <optgroup label="Ongoing activities">
                        {activityList.map((a) => <option key={a.id} value={a.title}>{a.title}</option>)}
                      </optgroup>
                      <option value="__other">Other approved activity…</option>
                    </select>
                  </Field>
                  {form.event_pick === '__other' ? (
                    <Field label="Other approved activity" required error={errors.event_pick} className="full">
                      <input className="input" value={form.event_other} onChange={set('event_other')} placeholder="e.g. Nursing home visit with family (pre-approved)" />
                    </Field>
                  ) : null}
                  <Field label="Event date" required error={errors.event_date}>
                    <input className="input" type="date" value={form.event_date} onChange={set('event_date')} max={new Date().toISOString().slice(0, 10)} />
                  </Field>
                  <Field label="Total hours spent" required error={errors.total_hours}
                    hint={form.event_type === 'asynchronous' ? config?.hour_rules?.async_rule_text : 'Must match your start/end times (activities spanning midnight are handled).'}>
                    <input className="input" type="number" min="0.25" max="24" step="0.25" value={form.total_hours} onChange={set('total_hours')} />
                  </Field>
                  <Field label="Start time" required={form.event_type === 'synchronous'} error={errors.start_time}>
                    <input className="input" type="time" value={form.start_time} onChange={set('start_time')} />
                  </Field>
                  <Field label="End time" required={form.event_type === 'synchronous'} error={errors.end_time}
                    hint="If the activity ran past midnight, enter the actual end time — we’ll compute across midnight.">
                    <input className="input" type="time" value={form.end_time} onChange={set('end_time')} />
                  </Field>
                  <Field label="Primary approver’s name" required error={errors.approver_primary}
                    hint="Teacher, supervisor, or chapter officer who can verify your hours.">
                    <input className="input" value={form.approver_primary} onChange={set('approver_primary')} />
                  </Field>
                  <Field label="Secondary approver’s name" error={errors.approver_secondary}>
                    <input className="input" value={form.approver_secondary} onChange={set('approver_secondary')} />
                  </Field>
                </div>
                <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : null} Submit for approval
                </button>
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  Submissions are rate-limited and validated on the server. Duplicate submissions for the same event,
                  date, and hours are rejected.
                </p>
              </form>
            </section>

            {/* medal info */}
            <section className="card card-pad" id="medals" aria-labelledby="medals-h" style={{ position: 'sticky', top: 90 }}>
              <h2 id="medals-h" style={{ fontSize: '1.5rem', display: 'flex', gap: 10, alignItems: 'center' }}>
                <IconMedal style={{ color: 'var(--gold)' }} /> Medal Requirements
              </h2>
              <MedalTable config={config} />
            </section>
          </div>

          {/* directory */}
          <section id="directory" style={{ marginTop: 56 }}>
            <Directory />
          </section>

          {/* detailed records incl. submission statuses */}
          <section id="records" style={{ marginTop: 56, scrollMarginTop: 90 }}>
            <Records />
          </section>
        </div>
      </div>
    </>
  );
}

function MedalTable({ config }: { config: any }) {
  const reqs = config?.medal_requirements;
  if (!reqs) return <Loading label="Loading medal requirements…" />;
  return (
    <div>
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 0 }}>
          <thead><tr><th>School level</th><th>Silver medal</th><th>Gold medal</th></tr></thead>
          <tbody>
            {(config.school_levels ?? []).map((l: any) => (
              <tr key={l.key}>
                <td>{l.label}</td>
                <td>{reqs[l.key]?.silver} hours</td>
                <td>{reqs[l.key]?.gold} hours</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginTop: 10 }}>
        Progress is calculated from <strong>approved hours only</strong> — pending and declined submissions never count.
        Example: an elementary student with 18 approved hours shows silver 18/25 (7 remaining) and gold 18/50 (32 remaining).
        Progress caps at 100% and recalculates automatically if your school level changes.
      </p>
    </div>
  );
}

function Directory() {
  const { data: config } = useApi<any>('/api/config');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const query = useMemo(() => `/api/directory?search=${encodeURIComponent(search)}&level=${encodeURIComponent(level)}`, [search, level]);
  const { data, loading, error, reload } = useApi<any>(query);

  return (
    <div>
      <div className="section-head" style={{ marginBottom: 18 }}>
        <span className="eyebrow">Approved totals</span>
        <h2>Volunteer Hours Overview</h2>
        <p className="section-sub small">Approved service hours per student with medal progress. Search by name or filter by school level.</p>
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
        <select className="input" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by school level">
          <option value="">All school levels</option>
          {(config?.school_levels ?? []).map((l: any) => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
      </div>
      {loading ? <Loading /> : null}
      {error ? <div style={{ maxWidth: 620 }}><ErrorNote message={error} retry={reload} /></div> : null}
      {data ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Student</th><th>School level</th><th>Approved hours</th><th style={{ minWidth: 170 }}>Silver progress</th><th style={{ minWidth: 170 }}>Gold progress</th></tr>
              </thead>
              <tbody>
                {asArray(data.students).map((s: any, i: number) => (
                  <tr key={i}>
                    <td><strong>{s.first_name} {s.last_name}</strong></td>
                    <td>{LEVEL_LABEL[s.school_level] ?? s.school_level}</td>
                    <td><strong>{fmtHours(s.total_hours)}</strong></td>
                    <td>
                      <div className="tiny muted">{s.silver_complete ? '🥈 Earned' : `${fmtHours(s.silver_remaining)}h remaining`}</div>
                      <ProgressBar percent={(Math.min(s.total_hours, s.silver_target) / s.silver_target) * 100} kind="silver" label={`${s.first_name} silver progress`} />
                    </td>
                    <td>
                      <div className="tiny muted">{s.gold_complete ? '🥇 Earned' : `${fmtHours(s.gold_remaining)}h remaining`}</div>
                      <ProgressBar percent={(Math.min(s.total_hours, s.gold_target) / s.gold_target) * 100} kind="gold" label={`${s.first_name} gold progress`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!asArray(data.students).length ? <EmptyState glyph="🔍" title="No matching volunteers yet" body="Approved totals appear here once hours are approved." /> : null}
          <p className="tiny muted" style={{ marginTop: 10 }}>Showing {data.count} student(s) with approved hours.</p>
        </>
      ) : null}
    </div>
  );
}

function Records() {
  const { data: config } = useApi<any>('/api/config');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const query = useMemo(() => `/api/records?page=${page}&search=${encodeURIComponent(search)}&level=${encodeURIComponent(level)}`, [page, search, level]);
  const { data, loading, error, reload } = useApi<any>(query);
  return (
    <div>
      <div className="section-head" style={{ marginBottom: 18 }}>
        <span className="eyebrow">Official service sheet</span>
        <h2>Detailed Volunteer Service Records</h2>
        <p className="section-sub small">
          Every submission with its approval status. Approved rows are the official hours sheet.
        </p>
      </div>

      <div className="toolbar">
        <input className="input" placeholder="Search student or event…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search records" />
        <select className="input" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} aria-label="Filter by school level">
          <option value="">All school levels</option>
          {(config?.school_levels ?? []).map((l: any) => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
      </div>
      {loading ? <Loading /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      {data ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Student</th><th>School level</th><th>Event</th><th>Date</th><th>Type</th><th>Approval status</th><th>Approved hours</th></tr>
              </thead>
              <tbody>
                {asArray(data.records).map((r: any) => (
                  <tr key={r.id}>
                    <td><strong>{r.first_name} {r.last_name}</strong></td>
                    <td>{LEVEL_LABEL[r.school_level] ?? r.school_level}</td>
                    <td>{r.event_name}</td>
                    <td>{fmtDate(r.event_date)}</td>
                    <td><span className={`badge ${r.event_type === 'asynchronous' ? 'correction_requested' : 'gray'}`}>{r.event_type === 'asynchronous' ? 'Asynchronous' : 'Synchronous'}</span></td>
                    <td><span className="badge approved">Approved</span></td>
                    <td><strong>{fmtHours(r.hours)}</strong> <IconClock width={13} height={13} style={{ verticalAlign: '-2px', color: 'var(--green)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} onPage={setPage} />
          {!asArray(data.records).length ? <EmptyState glyph="📄" title="No approved records yet" body="Once administrators approve submissions, the official service sheet fills in here." /> : null}
        </>
      ) : null}
    </div>
  );
}
