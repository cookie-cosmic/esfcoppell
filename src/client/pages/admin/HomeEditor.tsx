import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { ConfirmDialog, ErrorNote, Field, Loading, Modal, SmartImage, Tabs, useToast } from '../../components/ui';
import { IconEdit, IconPlus, IconTrash } from '../../components/icons';

const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero', featured: 'Featured event strip', mission: 'Mission', stats: 'Statistics',
  goals: 'Goals', programs: 'Featured programs & events', gallery: 'Photo gallery', join: 'Join us CTA',
};

export default function HomeEditor() {
  const { data, loading, error, reload } = useApi<any>('/api/admin/content');
  const toast = useToast();
  const [tab, setTab] = useState('content');
  const [form, setForm] = useState<any | null>(null);
  const [goalEdit, setGoalEdit] = useState<any | null>(null);
  const [statEdit, setStatEdit] = useState<any | null>(null);
  const [galleryPick, setGalleryPick] = useState(false);
  const [deleting, setDeleting] = useState<null | { kind: 'goal' | 'stat' | 'gallery'; id: string }>(null);

  useEffect(() => {
    if (data && !form) setForm({ ...data.content });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading || !form) return <Loading label="Loading homepage content…" />;
  if (error) return <ErrorNote message={error} retry={reload} />;

  const saveContent = async () => {
    try {
      await api.put('/api/admin/content', form);
      toast('success', 'Homepage content saved — live on the public site.');
      reload();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Save failed.');
    }
  };

  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const moveSection = (key: string, dir: -1 | 1) => {
    const sections: string[] = [...(form.sections_json ? JSON.parse(form.sections_json) : [])];
    const i = sections.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sections.length) return;
    [sections[i], sections[j]] = [sections[j], sections[i]];
    setForm((f: any) => ({ ...f, sections_json: JSON.stringify(sections) }));
  };

  const del = async () => {
    if (!deleting) return;
    const path = deleting.kind === 'goal' ? 'goals' : deleting.kind === 'stat' ? 'stats' : 'gallery';
    await api.del(`/api/admin/content/${path}/${deleting.id}`);
    toast('success', 'Removed.');
    setDeleting(null);
    reload();
  };

  const sections: string[] = form?.sections_json ? JSON.parse(form.sections_json) : [];

  return (
    <>
      <div className="admin-topbar">
        <h1>Homepage Editor</h1>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={saveContent}>Save content</button>
      </div>
      <Tabs tabs={[{ key: 'content', label: 'Copy & hero' }, { key: 'sections', label: 'Section order' }, { key: 'goals', label: 'Goals' }, { key: 'stats', label: 'Statistics' }, { key: 'gallery', label: 'Gallery' }]} active={tab} onChange={setTab} />

      {tab === 'content' ? (
        <div className="split">
          <div className="card card-pad">
            <h3>Hero</h3>
            <Field label="Eyebrow"><input className="input" value={form.hero_eyebrow ?? ''} onChange={set('hero_eyebrow')} /></Field>
            <Field label="Headline"><input className="input" value={form.hero_title ?? ''} onChange={set('hero_title')} /></Field>
            <Field label="Description"><textarea className="input" value={form.hero_subtitle ?? ''} onChange={set('hero_subtitle')} /></Field>
            <Field label="Hero image">
              <select className="input" value={form.hero_image_id ?? ''} onChange={set('hero_image_id')}>
                <option value="">No image</option>
                {(data.media ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.alt || m.filename}</option>)}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Primary button label"><input className="input" value={form.cta_primary_label ?? ''} onChange={set('cta_primary_label')} /></Field>
              <Field label="Primary button link"><input className="input" value={form.cta_primary_href ?? ''} onChange={set('cta_primary_href')} /></Field>
              <Field label="Secondary button label"><input className="input" value={form.cta_secondary_label ?? ''} onChange={set('cta_secondary_label')} /></Field>
              <Field label="Secondary button link"><input className="input" value={form.cta_secondary_href ?? ''} onChange={set('cta_secondary_href')} /></Field>
            </div>
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={!!form.featured_event_enabled} onChange={set('featured_event_enabled')} /> Show featured event strip</label>
            <Field label="Featured event">
              <select className="input" value={form.featured_event_id ?? ''} onChange={set('featured_event_id')}>
                <option value="">None</option>
                {(data.events ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </Field>
          </div>
          <div className="card card-pad">
            <h3>Mission & section copy</h3>
            <Field label="Mission title"><input className="input" value={form.mission_title ?? ''} onChange={set('mission_title')} /></Field>
            <Field label="Mission body"><textarea className="input" style={{ minHeight: 150 }} value={form.mission_body ?? ''} onChange={set('mission_body')} /></Field>
            <div className="form-grid">
              <Field label="Goals section title"><input className="input" value={form.goals_title ?? ''} onChange={set('goals_title')} /></Field>
              <Field label="Stats section title"><input className="input" value={form.stats_title ?? ''} onChange={set('stats_title')} /></Field>
              <Field label="Programs section title"><input className="input" value={form.programs_title ?? ''} onChange={set('programs_title')} /></Field>
              <Field label="Gallery section title"><input className="input" value={form.gallery_title ?? ''} onChange={set('gallery_title')} /></Field>
              <Field label="Join title"><input className="input" value={form.join_title ?? ''} onChange={set('join_title')} /></Field>
            </div>
            <Field label="Join body"><textarea className="input" value={form.join_body ?? ''} onChange={set('join_body')} /></Field>
          </div>
        </div>
      ) : null}

      {tab === 'sections' ? (
        <div className="card card-pad stack">
          <p className="muted small">Control which homepage sections appear and in what order.</p>
          {sections.map((key: string, i: number) => (
            <div className="row card card-pad" key={key} style={{ padding: '10px 16px' }}>
              <strong style={{ flex: 1 }}>{SECTION_LABELS[key] ?? key}</strong>
              <button className="btn btn-sm btn-outline" disabled={i === 0} onClick={() => moveSection(key, -1)}>↑</button>
              <button className="btn btn-sm btn-outline" disabled={i === sections.length - 1} onClick={() => moveSection(key, 1)}>↓</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setForm((f: any) => ({ ...f, sections_json: JSON.stringify(sections.filter((s) => s !== key)) }))}>Hide</button>
            </div>
          ))}
          <div className="row">
            <span className="muted small">Hidden:</span>
            {Object.keys(SECTION_LABELS).filter((k) => !sections.includes(k)).map((k) => (
              <button key={k} className="btn btn-sm btn-outline" onClick={() => setForm((f: any) => ({ ...f, sections_json: JSON.stringify([...sections, k]) }))}>+ {SECTION_LABELS[k]}</button>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'goals' ? (
        <>
          <div className="admin-topbar" style={{ marginBottom: 14 }}><span className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setGoalEdit({ position: data.goals.length })}><IconPlus width={15} height={15} /> Add goal</button></div>
          <div className="grid grid-2">
            {data.goals.map((g: any) => (
              <div className="card card-pad row" key={g.id}>
                <div style={{ flex: 1 }}><strong>{g.title}</strong><div className="tiny muted">{g.description?.slice(0, 90)}</div><div className="tiny muted">icon: {g.icon} · pos {g.position} · {g.visible ? 'visible' : 'hidden'}</div></div>
                <button className="icon-btn" onClick={() => setGoalEdit(g)}><IconEdit /></button>
                <button className="icon-btn" onClick={() => setDeleting({ kind: 'goal', id: g.id })}><IconTrash /></button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {tab === 'stats' ? (
        <>
          <div className="admin-topbar" style={{ marginBottom: 14 }}><span className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setStatEdit({ position: data.stats.length })}><IconPlus width={15} height={15} /> Add statistic</button></div>
          <div className="grid grid-2">
            {data.stats.map((s: any) => (
              <div className="card card-pad row" key={s.id}>
                <div style={{ flex: 1 }}><strong>{s.label}</strong><div className="tiny muted">{s.kind === 'computed' ? `computed: ${s.computed_key}` : `manual: ${s.manual_value}${s.suffix}`} · pos {s.position} · {s.visible ? 'visible' : 'hidden'}</div></div>
                <button className="icon-btn" onClick={() => setStatEdit(s)}><IconEdit /></button>
                <button className="icon-btn" onClick={() => setDeleting({ kind: 'stat', id: s.id })}><IconTrash /></button>
              </div>
            ))}
          </div>
          <p className="muted tiny">Computed stats derive live from the database (active volunteers, approved hours, completed/upcoming events). Manual stats are administrator-defined values.</p>
        </>
      ) : null}

      {tab === 'gallery' ? (
        <>
          <div className="admin-topbar" style={{ marginBottom: 14 }}><span className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setGalleryPick(true)}><IconPlus width={15} height={15} /> Add photo</button></div>
          <div className="media-grid">
            {data.gallery.map((g: any) => (
              <div className="media-tile" key={g.id}>
                <SmartImage src={`/uploads/${g.stored_name}`} alt={g.alt || g.caption} />
                <div className="meta">
                  <input className="input" style={{ padding: '4px 8px', fontSize: '0.78rem' }} defaultValue={g.caption} onBlur={(e) => api.patch(`/api/admin/content/gallery/${g.id}`, { caption: e.target.value }).then(() => toast('success', 'Caption saved.'))} aria-label="Caption" />
                  <div className="row" style={{ marginTop: 6 }}>
                    <button className="btn btn-sm btn-outline" onClick={() => { const idx = data.gallery.findIndex((x: any) => x.id === g.id); const prev = data.gallery[idx - 1]; if (prev) Promise.all([api.patch(`/api/admin/content/gallery/${g.id}`, { position: prev.position }), api.patch(`/api/admin/content/gallery/${prev.id}`, { position: g.position })]).then(reload); }}>←</button>
                    <button className="btn btn-sm btn-outline" onClick={() => { const idx = data.gallery.findIndex((x: any) => x.id === g.id); const next = data.gallery[idx + 1]; if (next) Promise.all([api.patch(`/api/admin/content/gallery/${g.id}`, { position: next.position }), api.patch(`/api/admin/content/gallery/${next.id}`, { position: g.position })]).then(reload); }}>→</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleting({ kind: 'gallery', id: g.id })}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {goalEdit ? <GoalEditor initial={goalEdit} media={data.media ?? []} onClose={() => setGoalEdit(null)} onSaved={() => { setGoalEdit(null); reload(); }} /> : null}
      {statEdit ? <StatEditor initial={statEdit} onClose={() => setStatEdit(null)} onSaved={() => { setStatEdit(null); reload(); }} /> : null}
      {galleryPick ? (
        <Modal title="Add photo to gallery" onClose={() => setGalleryPick(false)}>
          <div className="media-grid">
            {(data.media ?? []).map((m: any) => (
              <button key={m.id} className="media-tile" style={{ cursor: 'pointer', border: '1px solid var(--line-2)' }} onClick={() => api.post('/api/admin/content/gallery', { media_id: m.id }).then(() => { toast('success', 'Added to gallery.'); setGalleryPick(false); reload(); })}>
                <SmartImage src={`/uploads/${m.stored_name}`} alt={m.alt || m.filename} />
                <div className="meta">{m.alt || m.filename}</div>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
      {deleting ? <ConfirmDialog title="Remove this item?" body="It will disappear from the public homepage immediately." danger confirmLabel="Remove" onCancel={() => setDeleting(null)} onConfirm={del} /> : null}
    </>
  );
}

function GoalEditor({ initial, media, onClose, onSaved }: { initial: any; media: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<any>({ title: initial.title ?? '', description: initial.description ?? '', icon: initial.icon ?? 'heart', image_id: initial.image_id ?? '', position: initial.position ?? 0, visible: initial.visible === undefined ? true : !!initial.visible });
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    const payload = { ...form, image_id: form.image_id || null };
    try {
      if (initial.id) await api.patch(`/api/admin/content/goals/${initial.id}`, payload);
      else await api.post('/api/admin/content/goals', payload);
      toast('success', 'Goal saved.');
      onSaved();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Failed.');
    }
  };
  return (
    <Modal title={initial.id ? 'Edit goal' : 'New goal'} onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!form.title}>Save</button></>}>
      <Field label="Title" required><input className="input" value={form.title} onChange={set('title')} /></Field>
      <Field label="Description"><textarea className="input" value={form.description} onChange={set('description')} /></Field>
      <div className="form-grid">
        <Field label="Icon" hint="heart · hands · star · medal · sparkle">
          <select className="input" value={form.icon} onChange={set('icon')}>
            {['heart', 'hands', 'star', 'medal', 'sparkle'].map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Optional image">
          <select className="input" value={form.image_id} onChange={set('image_id')}>
            <option value="">None</option>
            {media.map((m: any) => <option key={m.id} value={m.id}>{m.alt || m.filename}</option>)}
          </select>
        </Field>
        <Field label="Order"><input className="input" type="number" value={form.position} onChange={set('position')} /></Field>
        <label className="row small" style={{ gap: 8, alignSelf: 'end' }}><input type="checkbox" checked={form.visible} onChange={set('visible')} /> Visible</label>
      </div>
    </Modal>
  );
}

function StatEditor({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<any>({ label: initial.label ?? '', kind: initial.kind ?? 'manual', computed_key: initial.computed_key ?? 'active_volunteers', manual_value: initial.manual_value ?? 0, suffix: initial.suffix ?? '', position: initial.position ?? 0, visible: initial.visible === undefined ? true : !!initial.visible });
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    try {
      if (initial.id) await api.patch(`/api/admin/content/stats/${initial.id}`, form);
      else await api.post('/api/admin/content/stats', form);
      toast('success', 'Statistic saved.');
      onSaved();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Failed.');
    }
  };
  return (
    <Modal title={initial.id ? 'Edit statistic' : 'New statistic'} onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!form.label}>Save</button></>}>
      <Field label="Label" required><input className="input" value={form.label} onChange={set('label')} /></Field>
      <div className="form-grid">
        <Field label="Kind">
          <select className="input" value={form.kind} onChange={set('kind')}>
            <option value="computed">Computed (live from database)</option>
            <option value="manual">Manual value</option>
          </select>
        </Field>
        {form.kind === 'computed' ? (
          <Field label="Metric">
            <select className="input" value={form.computed_key} onChange={set('computed_key')}>
              <option value="active_volunteers">Active volunteers</option>
              <option value="approved_hours">Approved hours</option>
              <option value="completed_events">Completed events</option>
              <option value="upcoming_events">Upcoming events</option>
            </select>
          </Field>
        ) : (
          <Field label="Value"><input className="input" type="number" value={form.manual_value} onChange={set('manual_value')} /></Field>
        )}
        <Field label="Suffix"><input className="input" value={form.suffix} onChange={set('suffix')} placeholder="e.g. hrs, +, %" /></Field>
        <Field label="Order"><input className="input" type="number" value={form.position} onChange={set('position')} /></Field>
      </div>
      <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={form.visible} onChange={set('visible')} /> Visible on homepage</label>
    </Modal>
  );
}
