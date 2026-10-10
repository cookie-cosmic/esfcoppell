import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { colorFor, initials } from '../../lib/format';
import { ConfirmDialog, ErrorNote, Field, Loading, Modal, SmartImage, useToast } from '../../components/ui';
import { IconEdit, IconPlus, IconTrash, IconChevron } from '../../components/icons';

export default function TeamAdmin() {
  const { data, loading, error, reload } = useApi<any[]>('/api/admin/content/team');
  const { data: media } = useApi<any[]>('/api/admin/media');
  const toast = useToast();
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const move = async (item: any, dir: -1 | 1) => {
    const list = [...(data ?? [])].sort((a, b) => a.position_order - b.position_order);
    const idx = list.findIndex((x) => x.id === item.id);
    const swap = list[idx + dir];
    if (!swap) return;
    await api.patch(`/api/admin/content/team/${item.id}`, { position_order: swap.position_order });
    await api.patch(`/api/admin/content/team/${swap.id}`, { position_order: item.position_order });
    reload();
  };

  const del = async () => {
    try {
      await api.del(`/api/admin/content/team/${deleting.id}`);
      toast('success', 'Position removed.');
      setDeleting(null);
      reload();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Failed.');
    }
  };

  return (
    <>
      <div className="admin-topbar">
        <h1>Team Management</h1>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ position_order: (data?.length ?? 0) })}><IconPlus width={15} height={15} /> Add position</button>
      </div>
      <p className="muted small">The public page renders these in order. Default order: President, Vice President, Co-Vice President, then the six Directors.</p>
      {loading ? <Loading /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      <div className="stack">
        {[...(data ?? [])].sort((a, b) => a.position_order - b.position_order).map((m, i) => (
          <div className="card card-pad row" key={m.id} style={{ gap: 16 }}>
            <div className="row" style={{ gap: 4 }}>
              <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(m, -1)}><IconChevron style={{ transform: 'rotate(-90deg)' }} /></button>
              <button className="icon-btn" aria-label="Move down" disabled={i === (data?.length ?? 0) - 1} onClick={() => move(m, 1)}><IconChevron style={{ transform: 'rotate(90deg)' }} /></button>
            </div>
            {m.photo_id ? (
              <SmartImage src={`/uploads/${media?.find((x) => x.id === m.photo_id)?.stored_name ?? ''}`} alt={m.name || m.position_title} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div className="avatar-initials" style={{ width: 56, height: 56, fontSize: '1.1rem', background: m.vacant ? '#e6e1dd' : colorFor(m.name || m.position_title) }}>
                {m.vacant ? '?' : initials(m.name || m.position_title)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 180 }}>
              <strong>{m.position_title}</strong>
              <div className="tiny muted">{m.vacant ? 'Vacant' : m.name} · {m.email ?? 'no email'} {m.is_public ? '' : '· hidden'}</div>
            </div>
            {m.vacant ? <span className="badge gray">vacant</span> : <span className="badge approved">occupied</span>}
            {!m.is_public ? <span className="badge declined">hidden</span> : null}
            <button className="icon-btn" title="Edit" onClick={() => setEditing(m)}><IconEdit /></button>
            <button className="icon-btn" title="Remove" onClick={() => setDeleting(m)}><IconTrash /></button>
          </div>
        ))}
      </div>
      {editing ? <TeamEditor initial={editing} media={media ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
      {deleting ? <ConfirmDialog title={`Remove "${deleting.position_title}"?`} body="The position and its public card will be removed." danger confirmLabel="Remove" onCancel={() => setDeleting(null)} onConfirm={del} /> : null}
    </>
  );
}

function TeamEditor({ initial, media, onClose, onSaved }: { initial: any; media: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<any>({
    position_title: initial.position_title ?? '',
    position_order: initial.position_order ?? 0,
    name: initial.name ?? '',
    bio: initial.bio ?? '',
    email: initial.email ?? '',
    contact_label: initial.contact_label ?? 'Contact Me',
    contact_url: initial.contact_url ?? '',
    photo_id: initial.photo_id ?? '',
    vacant: !!initial.vacant,
    is_public: initial.is_public === undefined ? true : !!initial.is_public,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    setBusy(true);
    const payload = { ...form, photo_id: form.photo_id || null, email: form.email || null, contact_url: form.contact_url || null };
    try {
      if (initial.id) await api.patch(`/api/admin/content/team/${initial.id}`, payload);
      else await api.post('/api/admin/content/team', payload);
      toast('success', 'Team profile saved.');
      onSaved();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial.id ? `Edit: ${initial.position_title}` : 'New leadership position'} onClose={onClose} wide footer={<>
      <button className="btn btn-outline" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || !form.position_title} onClick={save}>Save</button>
    </>}>
      <div className="form-grid">
        <Field label="Position title" required><input className="input" value={form.position_title} onChange={set('position_title')} /></Field>
        <Field label="Order"><input className="input" type="number" value={form.position_order} onChange={set('position_order')} /></Field>
        <Field label="Full name"><input className="input" value={form.name} onChange={set('name')} disabled={form.vacant} /></Field>
        <Field label="Email (shown publicly)"><input className="input" type="email" value={form.email} onChange={set('email')} disabled={form.vacant} /></Field>
        <Field label="Bio / About me" className="full"><textarea className="input" value={form.bio} onChange={set('bio')} disabled={form.vacant} /></Field>
        <Field label="Contact button label"><input className="input" value={form.contact_label} onChange={set('contact_label')} /></Field>
        <Field label="Contact link" hint="Leave empty to mailto: the email above."><input className="input" value={form.contact_url} onChange={set('contact_url')} placeholder="https://… or mailto:…" /></Field>
        <Field label="Profile photo">
          <select className="input" value={form.photo_id} onChange={set('photo_id')}>
            <option value="">No photo (initials shown)</option>
            {media.map((m) => <option key={m.id} value={m.id}>{m.alt || m.filename}</option>)}
          </select>
        </Field>
        <div className="row" style={{ gap: 18, alignSelf: 'end' }}>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={form.vacant} onChange={set('vacant')} /> Position vacant</label>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={form.is_public} onChange={set('is_public')} /> Publicly displayed</label>
        </div>
      </div>
    </Modal>
  );
}
