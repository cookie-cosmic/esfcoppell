import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { ConfirmDialog, EmptyState, ErrorNote, Loading, Tabs, useToast } from '../../components/ui';
import AuditLog from './AuditLog';

type Version = {
  id: string;
  created_at: string;
  actor_label: string;
  label: string;
  changed: { key: string; label: string }[];
  counts: Record<string, number>;
  is_latest: boolean;
};

type VersionList = { current_matches_latest: boolean; items: Version[] };

/** Turns raw action names such as "team.update; content.update" into readable text. */
export function describeChange(label: string) {
  return label
    .split('; ')
    .map((part) => {
      const m = part.match(/^([a-z_]+)\.([a-z_.]+)$/i);
      return m ? `${m[1].replace(/_/g, ' ')} · ${m[2].replace(/[._]/g, ' ')}` : part;
    })
    .join(' · ');
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function VersionHistory() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<VersionList>('/api/admin/versions?limit=60');
  const [target, setTarget] = useState<Version | null>(null);
  const [busy, setBusy] = useState(false);

  async function restore() {
    if (!target) return;
    setBusy(true);
    try {
      const res = await api.post<{ skipped: Record<string, number> }>(`/api/admin/versions/${target.id}/restore`);
      const skipped = Object.values(res.skipped ?? {}).reduce((a, b) => a + b, 0);
      toast('success', skipped ? `Website restored. ${skipped} item(s) were skipped because their images no longer exist.` : 'Website restored to that version.');
      setTarget(null);
      reload();
    } catch (err: any) {
      toast('error', err?.message || 'Restore failed.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} retry={reload} />;
  const items = data?.items ?? [];

  return (
    <>
      <p className="muted small" style={{ margin: '4px 0 14px' }}>
        A snapshot is saved after every change to the website text, team, events, gallery, stats, goals, and settings.
        Students, hours, submissions, and staff accounts are not part of a version and are never changed by a restore.
        Restoring first saves the current site as a new version, so a restore can be undone.
      </p>
      {items.length === 0 ? (
        <EmptyState title="No versions yet" body="The first version is created automatically when the site starts." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                <th>What changed</th>
                <th>Details</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td className="tiny">{when(v.created_at)}</td>
                  <td className="small">{v.actor_label}</td>
                  <td>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {v.changed.length ? v.changed.map((c) => <span key={c.key} className="badge gray">{c.label}</span>) : <span className="tiny muted">No content change</span>}
                    </span>
                  </td>
                  <td className="tiny muted" style={{ maxWidth: 340 }}>{describeChange(v.label)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {v.is_latest ? (
                      <span className="badge approved">Live now</span>
                    ) : (
                      <button className="btn btn-dark btn-sm" onClick={() => setTarget(v)}>Restore</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target ? (
        <ConfirmDialog
          title="Restore this version?"
          body={
            <>
              <p>The public website will go back to how it looked on <strong>{when(target.created_at)}</strong> (saved by {target.actor_label}).</p>
              <p className="muted small">The current site is saved first as a new version. Students, hours, and submissions are not affected.</p>
            </>
          }
          confirmLabel="Restore version"
          danger
          busy={busy}
          onConfirm={restore}
          onCancel={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}

export default function ChangeHistory() {
  const [tab, setTab] = useState<'versions' | 'activity'>('versions');
  return (
    <>
      <div className="admin-topbar">
        <h1>Change History</h1>
      </div>
      <Tabs
        tabs={[
          { key: 'versions', label: 'Version history' },
          { key: 'activity', label: 'Activity log' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as 'versions' | 'activity')}
      />
      {tab === 'versions' ? <VersionHistory /> : <AuditLog />}
    </>
  );
}
