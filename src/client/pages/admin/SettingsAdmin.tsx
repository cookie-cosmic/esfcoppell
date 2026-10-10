import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { ErrorNote, Field, Loading, useToast } from '../../components/ui';
import type { SessionState } from '../../App';

export default function SettingsAdmin({ session }: { session: SessionState }) {
  const { data, loading, error, reload } = useApi<any>('/api/admin/settings');
  const toast = useToast();
  const [draft, setDraft] = useState<any | null>(null);
  const isOwner = session.admin?.role === 'owner';

  useEffect(() => {
    if (data && !draft) setDraft(JSON.parse(JSON.stringify(data)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading || !draft) return <Loading label="Loading settings…" />;
  if (error) return <ErrorNote message={error} retry={reload} />;

  const save = async (key: string) => {
    try {
      await api.put(`/api/admin/settings/${key}`, { value: draft[key] });
      toast('success', `${key.replace(/_/g, ' ')} saved.`);
      reload();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Save failed.');
    }
  };

  const setMedal = (lvl: string, medal: 'silver' | 'gold', v: string) =>
    setDraft((d: any) => ({ ...d, medal_requirements: { ...d.medal_requirements, [lvl]: { ...d.medal_requirements[lvl], [medal]: Number(v) } } }));

  return (
    <>
      <div className="admin-topbar"><h1>Settings</h1><span className="spacer" /><span className="muted small">Changes apply immediately to the public site and validation rules.</span></div>
      <div className="grid grid-2">
        <section className="card card-pad">
          <h3>Medal requirements</h3>
          <p className="muted small">Hours needed per school level. Medal progress recalculates automatically.</p>
          {(draft.school_levels ?? []).map((l: any) => (
            <div className="row" key={l.key} style={{ gap: 12, marginBottom: 10 }}>
              <strong style={{ width: 150 }}>{l.label}</strong>
              <label className="tiny muted">Silver <input className="input" style={{ width: 90 }} type="number" value={draft.medal_requirements[l.key]?.silver ?? ''} onChange={(e) => setMedal(l.key, 'silver', e.target.value)} /></label>
              <label className="tiny muted">Gold <input className="input" style={{ width: 90 }} type="number" value={draft.medal_requirements[l.key]?.gold ?? ''} onChange={(e) => setMedal(l.key, 'gold', e.target.value)} /></label>
            </div>
          ))}
          <button className="btn btn-sm btn-primary" onClick={() => save('medal_requirements')}>Save medals</button>
        </section>

        <section className="card card-pad">
          <h3>Volunteer-hour rules</h3>
          <div className="form-grid">
            <Field label="Max hours / submission"><input className="input" type="number" value={draft.hour_rules.max_hours_per_submission} onChange={(e) => setDraft((d: any) => ({ ...d, hour_rules: { ...d.hour_rules, max_hours_per_submission: Number(e.target.value) } }))} /></Field>
            <Field label="Max hours / day"><input className="input" type="number" value={draft.hour_rules.max_hours_per_day} onChange={(e) => setDraft((d: any) => ({ ...d, hour_rules: { ...d.hour_rules, max_hours_per_day: Number(e.target.value) } }))} /></Field>
            <Field label="Sync tolerance (hours)"><input className="input" type="number" step="0.05" value={draft.hour_rules.sync_tolerance_hours} onChange={(e) => setDraft((d: any) => ({ ...d, hour_rules: { ...d.hour_rules, sync_tolerance_hours: Number(e.target.value) } }))} /></Field>
            <Field label="Async cap (hours)"><input className="input" type="number" value={draft.hour_rules.async_max_hours} onChange={(e) => setDraft((d: any) => ({ ...d, hour_rules: { ...d.hour_rules, async_max_hours: Number(e.target.value) } }))} /></Field>
            <Field label="Async rule text (shown to students)" className="full"><textarea className="input" value={draft.hour_rules.async_rule_text} onChange={(e) => setDraft((d: any) => ({ ...d, hour_rules: { ...d.hour_rules, async_rule_text: e.target.value } }))} /></Field>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => save('hour_rules')}>Save hour rules</button>
        </section>

        <section className="card card-pad">
          <h3>Directory visibility</h3>
          <p className="muted small">Who can see the approved-hours directory on the Volunteer Hours page.</p>
          <select className="input" value={draft.directory_visibility} onChange={(e) => setDraft((d: any) => ({ ...d, directory_visibility: e.target.value }))}>
            <option value="public">Public — anyone</option>
            <option value="members">Members — students who looked up their code</option>
            <option value="private">Private — administrators only</option>
          </select>
          <button className="btn btn-sm btn-primary" style={{ marginTop: 12 }} onClick={() => save('directory_visibility')}>Save visibility</button>
        </section>

        <section className="card card-pad">
          <h3>Event categories</h3>
          <textarea className="input" rows={5} value={(draft.event_categories ?? []).join('\n')} onChange={(e) => setDraft((d: any) => ({ ...d, event_categories: e.target.value.split('\n').map((s: string) => s.trim()).filter(Boolean) }))} />
          <p className="tiny muted">One category per line.</p>
          <button className="btn btn-sm btn-primary" onClick={() => save('event_categories')}>Save categories</button>
        </section>

        <section className="card card-pad">
          <h3>Branding</h3>
          <div className="form-grid">
            <Field label="Organization name"><input className="input" value={draft.branding.org_name} onChange={(e) => setDraft((d: any) => ({ ...d, branding: { ...d.branding, org_name: e.target.value } }))} /></Field>
            <Field label="Chapter name"><input className="input" value={draft.branding.chapter_name} onChange={(e) => setDraft((d: any) => ({ ...d, branding: { ...d.branding, chapter_name: e.target.value } }))} /></Field>
            <Field label="Logo URL"><input className="input" value={draft.branding.logo_url} onChange={(e) => setDraft((d: any) => ({ ...d, branding: { ...d.branding, logo_url: e.target.value } }))} /></Field>
            <Field label="Primary color"><input className="input" type="color" value={draft.branding.primary} onChange={(e) => setDraft((d: any) => ({ ...d, branding: { ...d.branding, primary: e.target.value } }))} /></Field>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => save('branding')}>Save branding</button>
        </section>

        <section className="card card-pad" style={isOwner ? undefined : { opacity: 0.6 }}>
          <h3>Retention policy {isOwner ? '' : <span className="badge gray">owner only</span>}</h3>
          <p className="muted small">Hard-deleting student records is disabled by default so historical accountability is preserved.</p>
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" disabled={!isOwner} checked={!!draft.retention.allow_hard_delete} onChange={(e) => setDraft((d: any) => ({ ...d, retention: { ...d.retention, allow_hard_delete: e.target.checked } }))} />
            Allow owners to hard-delete student records
          </label>
          <button className="btn btn-sm btn-primary" style={{ marginTop: 12 }} disabled={!isOwner} onClick={() => save('retention')}>Save retention</button>
        </section>
      </div>
    </>
  );
}
