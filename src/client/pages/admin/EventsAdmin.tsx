import { useState } from 'react';
import { api, ApiError, assetUrl } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { fmtDateTime, fmtHours } from '../../lib/format';
import { ConfirmDialog, EmptyState, ErrorNote, Field, Loading, Modal, SmartImage, Tabs, useToast } from '../../components/ui';
import { IconEdit, IconPlus, IconTrash, IconStar } from '../../components/icons';

const STATUS_BADGE: Record<string, string> = { draft: 'gray', published: 'approved', canceled: 'declined', completed: 'approved', archived: 'gray' };

const blankEvent = {
  title: '', description: '', starts_at: '', ends_at: '', location: '', online_details: '',
  registration_url: '', category: 'General', status: 'draft', image_id: '', attendance: '', achievements: '', featured_on_home: false, banner_size: 'standard',
};

export default function EventsAdmin() {
  const [tab, setTab] = useState('upcoming');
  const { data: events, loading: le, error: ee, reload: re } = useApi<any[]>('/api/admin/content/events');
  const { data: activities, loading: la, error: ea, reload: ra } = useApi<any[]>('/api/admin/content/activities');
  const { data: config } = useApi<any>('/api/config');
  const { data: media } = useApi<any[]>('/api/admin/media');
  const toast = useToast();
  const [editing, setEditing] = useState<null | { kind: 'event' | 'activity'; data?: any }>(null);
  const [deleting, setDeleting] = useState<null | { kind: 'event' | 'activity'; id: string; title: string }>(null);

  const upcoming = (events ?? []).filter((e) => e.status === 'published' || e.status === 'canceled' || e.status === 'draft');
  const past = (events ?? []).filter((e) => e.status === 'completed' || e.status === 'archived');

  const del = async () => {
    if (!deleting) return;
    try {
      await api.del(`/api/admin/content/${deleting.kind === 'event' ? 'events' : 'activities'}/${deleting.id}`);
      toast('success', `${deleting.kind === 'event' ? 'Event' : 'Activity'} deleted.`);
      setDeleting(null);
      re(); ra();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Delete failed.');
    }
  };

  const toggleFeatured = async (ev: any) => {
    try {
      await api.patch(`/api/admin/content/events/${ev.id}`, { featured_on_home: !ev.featured_on_home });
      toast('success', ev.featured_on_home ? 'Removed from homepage.' : 'Now featured on homepage.');
      re();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Failed.');
    }
  };

  return (
    <>
      <div className="admin-topbar">
        <h1>Events & Activities</h1>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ kind: tab === 'activities' ? 'activity' : 'event' })}>
          <IconPlus width={15} height={15} /> New {tab === 'activities' ? 'activity' : 'event'}
        </button>
      </div>
      <Tabs
        tabs={[
          { key: 'activities', label: 'Active activities', count: (activities ?? []).filter((a) => a.active).length },
          { key: 'upcoming', label: 'Upcoming & drafts', count: upcoming.length },
          { key: 'past', label: 'Past events', count: past.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab !== 'activities' ? (
        le ? <Loading /> : ee ? <ErrorNote message={ee} retry={re} /> : (
          <div className="stack">
            {(tab === 'upcoming' ? upcoming : past).map((ev) => (
              <div className="card card-pad row" key={ev.id} style={{ gap: 16 }}>
                <SmartImage src={assetUrl(ev.image_url ?? media?.find((m) => m.id === ev.image_id)?.url)} alt={ev.title} style={{ width: 92, height: 66, objectFit: 'cover', borderRadius: 10 }} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong>{ev.title}</strong>
                  <div className="tiny muted">{fmtDateTime(ev.starts_at)} · {ev.category} · {ev.location ?? ev.online_details ?? '—'}</div>
                  {tab === 'past' ? <div className="tiny muted">Attendance {ev.attendance ?? '—'} · approved hours {fmtHours(ev.approved_hours ?? 0)}</div> : null}
                </div>
                <span className={`badge ${STATUS_BADGE[ev.status]}`}>{ev.status}</span>
                <button className={`icon-btn ${ev.featured_on_home ? '' : ''}`} title="Feature on homepage" style={ev.featured_on_home ? { color: 'var(--gold)' } : undefined} onClick={() => toggleFeatured(ev)}>
                  <IconStar width={18} height={18} fill={ev.featured_on_home ? 'currentColor' : 'none'} />
                </button>
                <button className="icon-btn" title="Edit" onClick={() => setEditing({ kind: 'event', data: ev })}><IconEdit /></button>
                <button className="icon-btn" title="Delete" onClick={() => setDeleting({ kind: 'event', id: ev.id, title: ev.title })}><IconTrash /></button>
              </div>
            ))}
            {!(tab === 'upcoming' ? upcoming : past).length ? <EmptyState glyph="🗓️" title="Nothing here yet" body="Create your first event with the button above." /> : null}
          </div>
        )
      ) : la ? <Loading /> : ea ? <ErrorNote message={ea} retry={ra} /> : (
        <div className="stack">
          {(activities ?? []).map((a) => (
            <div className="card card-pad row" key={a.id} style={{ gap: 16 }}>
              <SmartImage src={assetUrl(media?.find((m) => m.id === a.image_id)?.url)} alt={a.title} style={{ width: 92, height: 66, objectFit: 'cover', borderRadius: 10 }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong>{a.title}</strong>
                <div className="tiny muted">{a.category} · {a.mode} · limit {a.hour_limit ?? '—'}h · pos {a.position}</div>
              </div>
              <span className={`badge ${a.active ? 'approved' : 'gray'}`}>{a.active ? 'active' : 'inactive'}</span>
              <button className="icon-btn" title="Edit" onClick={() => setEditing({ kind: 'activity', data: a })}><IconEdit /></button>
              <button className="icon-btn" title="Delete" onClick={() => setDeleting({ kind: 'activity', id: a.id, title: a.title })}><IconTrash /></button>
            </div>
          ))}
          {!activities?.length ? <EmptyState glyph="" title="No activities" body="Activities are the ongoing ways students earn hours." /> : null}
        </div>
      )}

      {editing ? (
        <EditorModal
          kind={editing.kind}
          initial={editing.data}
          categories={config?.event_categories ?? []}
          media={media ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); re(); ra(); }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog title={`Delete "${deleting.title}"?`} body="This permanently removes it and its gallery links. Historical service records are preserved." danger confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={del} />
      ) : null}
    </>
  );
}

function EditorModal({ kind, initial, categories, media, onClose, onSaved }: { kind: 'event' | 'activity'; initial?: any; categories: string[]; media: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<any>(initial ? { ...initial, starts_at: initial.starts_at ? initial.starts_at.slice(0, 16) : '', ends_at: initial.ends_at ? initial.ends_at.slice(0, 16) : '', featured_on_home: !!initial.featured_on_home } : { ...blankEvent });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    setBusy(true);
    const payload: any = { ...form };
    if (payload.starts_at) payload.starts_at = new Date(payload.starts_at).toISOString();
    if (payload.ends_at) payload.ends_at = new Date(payload.ends_at).toISOString();
    if (payload.attendance === '') payload.attendance = null;
    if (payload.hour_limit === '') payload.hour_limit = null;
    if (payload.image_id === '') payload.image_id = null;
    try {
      if (initial) await api.patch(`/api/admin/content/${kind === 'event' ? 'events' : 'activities'}/${initial.id}`, payload);
      else await api.post(`/api/admin/content/${kind === 'event' ? 'events' : 'activities'}`, payload);
      toast('success', `${kind === 'event' ? 'Event' : 'Activity'} saved.`);
      onSaved();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${initial ? 'Edit' : 'New'} ${kind}`} onClose={onClose} wide footer={<>
      <button className="btn btn-outline" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || !form.title} onClick={save}>{initial ? 'Save changes' : 'Create'}</button>
    </>}>
      <div className="form-grid">
        <Field label="Title" required className="full"><input className="input" value={form.title ?? ''} onChange={set('title')} /></Field>
        <Field label="Description" className="full"><textarea className="input" value={form.description ?? ''} onChange={set('description')} /></Field>
        {kind === 'event' ? (
          <>
            <Field label="Starts at"><input className="input" type="datetime-local" value={form.starts_at ?? ''} onChange={set('starts_at')} /></Field>
            <Field label="Ends at"><input className="input" type="datetime-local" value={form.ends_at ?? ''} onChange={set('ends_at')} /></Field>
            <Field label="Location"><input className="input" value={form.location ?? ''} onChange={set('location')} /></Field>
            <Field label="Online details"><input className="input" value={form.online_details ?? ''} onChange={set('online_details')} /></Field>
            <Field label="Registration link"><input className="input" value={form.registration_url ?? ''} onChange={set('registration_url')} placeholder="https://…" /></Field>
            <Field label="Attendance (past events)"><input className="input" type="number" value={form.attendance ?? ''} onChange={set('attendance')} /></Field>
            <Field label="Achievements / milestones" className="full"><textarea className="input" value={form.achievements ?? ''} onChange={set('achievements')} /></Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={set('status')}>
                {['draft', 'published', 'canceled', 'completed', 'archived'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Mode">
              <select className="input" value={form.mode} onChange={set('mode')}>
                <option value="in_person">In person</option><option value="remote">Remote</option><option value="both">Both</option>
              </select>
            </Field>
            <Field label="Hour limit (per submission)"><input className="input" type="number" step="0.25" value={form.hour_limit ?? ''} onChange={set('hour_limit')} /></Field>
            <Field label="Instructions" className="full"><textarea className="input" value={form.instructions ?? ''} onChange={set('instructions')} /></Field>
            <Field label="Hour eligibility" className="full"><textarea className="input" value={form.hour_eligibility ?? ''} onChange={set('hour_eligibility')} /></Field>
            <Field label="Submission requirements" className="full"><textarea className="input" value={form.submission_requirements ?? ''} onChange={set('submission_requirements')} /></Field>
            <Field label="Start date"><input className="input" type="date" value={form.start_date ?? ''} onChange={set('start_date')} /></Field>
            <Field label="End date"><input className="input" type="date" value={form.end_date ?? ''} onChange={set('end_date')} /></Field>
            <Field label="Order (position)"><input className="input" type="number" value={form.position ?? 0} onChange={set('position')} /></Field>
            <label className="row small" style={{ gap: 8, alignSelf: 'end' }}><input type="checkbox" checked={!!form.active} onChange={set('active')} /> Active (visible publicly)</label>
          </>
        )}
        <Field label="Category">
          <select className="input" value={form.category} onChange={set('category')}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Image">
          <select className="input" value={form.image_id ?? ''} onChange={set('image_id')}>
            <option value="">No image</option>
            {media.map((m) => <option key={m.id} value={m.id}>{m.alt || m.filename}</option>)}
          </select>
        </Field>
        {kind === 'event' ? <Field label="Event banner size">
          <select className="input" value={form.banner_size ?? 'standard'} onChange={set('banner_size')}>
            <option value="compact">Compact</option><option value="standard">Standard</option><option value="tall">Tall</option>
          </select>
        </Field> : null}
        {kind === 'event' ? (
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={!!form.featured_on_home} onChange={set('featured_on_home')} /> Featured on homepage</label>
        ) : (
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={!!form.featured_on_home} onChange={set('featured_on_home')} /> Featured on homepage</label>
        )}
      </div>
    </Modal>
  );
}
