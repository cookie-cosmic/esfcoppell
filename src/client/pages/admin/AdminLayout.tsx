import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, staffToken } from '../../lib/api';
import type { SessionState } from '../../App';
import { useToast } from '../../components/ui';
import { usePrefs, ACCENTS } from '../../lib/prefs';
import { STAFF_BASE } from '../../lib/paths';
import {
  IconChart, IconCheck, IconUsers, IconCalendar, IconHeart, IconHome, IconImage,
  IconSettings, IconFile, IconLogout, SmileMark, IconMenu, IconChevronLeft,
} from '../../components/icons';
import Overview from './Overview';
import Approvals from './Approvals';
import Volunteers from './Volunteers';
import EventsAdmin from './EventsAdmin';
import TeamAdmin from './TeamAdmin';
import HomeEditor from './HomeEditor';
import MediaLibrary from './MediaLibrary';
import SettingsAdmin from './SettingsAdmin';
import ChangeHistory from './ChangeHistory';

type Role = 'owner' | 'admin' | 'reviewer';
const ALL: Role[] = ['owner', 'admin', 'reviewer'];
const MANAGERS: Role[] = ['owner', 'admin'];

const SECTIONS: { group: string; items: { path: string; label: string; icon: any; end?: boolean; roles: Role[] }[] }[] = [
  {
    group: 'Operations',
    items: [
      { path: '', label: 'Overview', icon: IconChart, end: true, roles: ALL },
      { path: 'approvals', label: 'Approval Center', icon: IconCheck, roles: ALL },
      { path: 'volunteers', label: 'Volunteers', icon: IconUsers, roles: ALL },
      { path: 'events', label: 'Events & Activities', icon: IconCalendar, roles: ALL },
      { path: 'team', label: 'Team', icon: IconHeart, roles: ALL },
    ],
  },
  {
    group: 'Website',
    items: [
      { path: 'homepage', label: 'Homepage Editor', icon: IconHome, roles: MANAGERS },
      { path: 'media', label: 'Media Library', icon: IconImage, roles: ALL },
    ],
  },
  {
    group: 'System',
    items: [
      { path: 'settings', label: 'Settings', icon: IconSettings, roles: MANAGERS },
      { path: 'changes', label: 'Change History', icon: IconFile, roles: MANAGERS },
    ],
  },
];

const SECTION_OPTIONS = SECTIONS.flatMap((g) => g.items.filter((i) => i.path));

/** Stored preference may be a bare section key or a legacy path; normalise to a route. */
const targetFor = (value: string) => (value ? `${STAFF_BASE}/${value.replace(/^\/?(admin\/)?/, '')}` : '');

function PreferencesPanel({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = usePrefs();
  return (
    <div className="pop-panel glass card card-pad" role="dialog" aria-label="Dashboard preferences">
      <div className="row" style={{ marginBottom: 10 }}>
        <h4 style={{ margin: 0, flex: 1 }}>Customize workspace</h4>
        <button className="icon-btn" aria-label="Close preferences" onClick={onClose}>✕</button>
      </div>
      <div className="field">
        <label className="tiny muted">Table density</label>
        <div className="seg" role="radiogroup" aria-label="Table density">
          {(['comfortable', 'compact'] as const).map((d) => (
            <button key={d} role="radio" aria-checked={prefs.density === d} className={prefs.density === d ? 'on' : ''} onClick={() => setPrefs({ density: d })}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="tiny muted">Accent color</label>
        <div className="row" style={{ gap: 10 }}>
          {(Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]).map((a) => (
            <button
              key={a}
              aria-label={`Accent ${a}`}
              onClick={() => setPrefs({ accent: a })}
              className="swatch"
              style={{ background: ACCENTS[a], boxShadow: prefs.accent === a ? `0 0 0 3px #fff, 0 0 0 5px ${ACCENTS[a]}` : 'none' }}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <label className="tiny muted" htmlFor="default-section">Open this section after sign-in</label>
        <select id="default-section" className="input" value={prefs.defaultSection.replace(/^\/?(admin\/)?/, '')} onChange={(e) => setPrefs({ defaultSection: e.target.value })}>
          <option value="">Overview (default)</option>
          {SECTION_OPTIONS.map((s) => (
            <option key={s.path} value={s.path}>{s.label}</option>
          ))}
        </select>
      </div>
      <label className="row small" style={{ gap: 8 }}>
        <input type="checkbox" checked={prefs.sidebarCollapsed} onChange={(e) => setPrefs({ sidebarCollapsed: e.target.checked })} /> Start with sidebar collapsed
      </label>
      <p className="tiny muted" style={{ margin: '12px 0 0' }}>
        Saved on this device. Summary cards are chosen from the <strong>Cards</strong> menu on the Overview page.
      </p>
    </div>
  );
}

export default function AdminLayout({ session, setSession }: { session: SessionState; setSession: (s: SessionState) => void }) {
  const role = session.admin!.role;
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [prefs, setPrefs] = usePrefs();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsClosing, setPrefsClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const collapsed = prefs.sidebarCollapsed;

  useEffect(() => {
    document.documentElement.style.setProperty('--admin-accent', ACCENTS[prefs.accent]);
  }, [prefs.accent]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const closePrefs = () => {
    if (!prefsOpen || prefsClosing) return;
    setPrefsClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setPrefsOpen(false);
      setPrefsClosing(false);
    }, 180);
  };

  const logout = async () => {
    await api.post('/api/admin/logout').catch(() => undefined);
    staffToken.set(null);
    setSession({ loaded: true, admin: null });
    toast('info', 'Signed out.');
    navigate('/');
  };

  const current = SECTIONS.flatMap((g) => g.items).find((i) =>
    i.path ? location.pathname === `${STAFF_BASE}/${i.path}` || location.pathname.startsWith(`${STAFF_BASE}/${i.path}/`) : location.pathname === STAFF_BASE
  );
  const pageKey = current?.path ?? 'overview';
  const initials = session.admin!.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`admin-shell ${collapsed ? 'side-collapsed' : ''} density-${prefs.density}`}>
      <aside className="admin-side" aria-label="Admin navigation">
        <div className="side-brand">
          <SmileMark size={30} />
          {!collapsed && (
            <span className="side-title">
              Admin Dashboard
              <span className="side-sub">Coppell Chapter</span>
            </span>
          )}
        </div>

        <nav className="side-nav">
          {SECTIONS.map((g) => {
            const items = g.items.filter((l) => l.roles.includes(role));
            if (!items.length) return null;
            return (
              <div className="side-group" key={g.group}>
                {!collapsed && <span className="side-group-label">{g.group}</span>}
                {items.map((l) => (
                  <NavLink key={l.path || 'overview'} to={l.path ? `${STAFF_BASE}/${l.path}` : STAFF_BASE} end={l.end} title={l.label}>
                    <l.icon width={17} height={17} />
                    {!collapsed && <span className="side-label">{l.label}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="side-foot">
          <button onClick={logout} className="side-logout" title="Sign out">
            <IconLogout width={17} height={17} />
            {!collapsed && <span className="side-label">Sign out</span>}
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-bar">
          <button className="icon-btn" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={() => setPrefs({ sidebarCollapsed: !collapsed })}>
            <IconMenu width={18} height={18} />
          </button>
          <Link to="/" className="btn btn-outline btn-sm back-btn">
            <IconChevronLeft width={15} height={15} /> Back to Home
          </Link>
          <span className="bar-title">Coppell Chapter Admin</span>
          <span className="spacer" />
          <div className="bar-user">
            <span className="avatar-chip" aria-hidden="true">{initials || 'ES'}</span>
            <div className="bar-id">
              <strong>{session.admin!.name}</strong>
              <span className={`role-pill role-${role}`}>{role}</span>
            </div>
          </div>
          <div className="pop-anchor">
            <button className="btn btn-outline btn-sm" onClick={() => (prefsOpen ? closePrefs() : setPrefsOpen(true))} aria-expanded={prefsOpen}>
              <IconSettings width={15} height={15} /> Customize
            </button>
            {prefsOpen ? (
              <>
                <div className="pop-scrim" onClick={closePrefs} />
                <div className={prefsClosing ? 'pop-wrap out' : 'pop-wrap'}>
                  <PreferencesPanel onClose={closePrefs} />
                </div>
              </>
            ) : null}
          </div>
        </header>

        <div key={pageKey} className="admin-page">
          <Routes>
            <Route
              index
              element={prefs.defaultSection && location.pathname === STAFF_BASE ? <Navigate to={targetFor(prefs.defaultSection)} replace /> : <Overview />}
            />
            <Route path="approvals" element={<Approvals />} />
            <Route path="volunteers" element={<Volunteers />} />
            <Route path="events" element={<EventsAdmin />} />
            <Route path="team" element={<TeamAdmin />} />
            <Route path="homepage" element={<HomeEditor />} />
            <Route path="media" element={<MediaLibrary />} />
            <Route path="settings" element={<SettingsAdmin session={session} />} />
            <Route path="changes" element={<ChangeHistory />} />
            <Route path="audit" element={<Navigate to="../changes" replace />} />
            <Route path="*" element={<Navigate to={STAFF_BASE} replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
