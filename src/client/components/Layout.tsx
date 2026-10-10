import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { IconMenu, IconX, SmileMark } from './icons';
import { STAFF_BASE } from '../lib/paths';

export const NAV = [
  { to: '/', label: 'Home' },
  { to: '/team', label: 'Meet the Team' },
  { to: '/programs', label: 'Programs & Events' },
  { to: '/hours', label: 'Volunteer Hours' },
];

/** Hidden staff entry: five clicks on the footer staff icon within 3 seconds. */
export function useEasterEgg() {
  const navigate = useNavigate();
  const clicks = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < 3000), now];
    if (clicks.current.length >= 5) {
      clicks.current = [];
      navigate(STAFF_BASE);
    }
  }, [navigate]);
}

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="container nav-bar">
        <Link to="/" className="brand" title="Endless Smiles Foundation — Coppell Chapter">
          <SmileMark size={42} />
          <span className="brand-text">
            <strong>Endless Smiles</strong>
            <span>Coppell Chapter</span>
          </span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              {n.label}
            </NavLink>
          ))}
          <Link className="btn btn-primary btn-sm nav-cta" to="/hours">Submit Hours</Link>
        </nav>
        <button className="menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <IconX /> : <IconMenu />}
        </button>
      </div>
      <nav className={`mobile-menu ${open ? 'open' : ''}`} aria-label="Mobile">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)}>
            {n.label}
          </NavLink>
        ))}
        <NavLink to="/hours" onClick={() => setOpen(false)} style={{ color: 'var(--crimson)' }}>
          Submit Volunteer Hours →
        </NavLink>
      </nav>
    </header>
  );
}

export function Footer() {
  const egg = useEasterEgg();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <img src="/assets/logo.png" alt="Endless Smiles Foundation logo" />
              <div>
                <strong style={{ color: '#fff' }}>Endless Smiles Foundation</strong>
                <div style={{ fontSize: '0.85rem' }}>Coppell Chapter · Coppell, Texas</div>
              </div>
            </div>
            <p className="small" style={{ maxWidth: 380 }}>
              A student-led chapter spreading joy to children and families through volunteering, outreach, and
              fundraising — one smile at a time.
            </p>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to}>{n.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Get Involved</h4>
            <ul>
              <li><Link to="/hours">Submit volunteer hours</Link></li>
              <li><Link to="/hours#records">Volunteer service records</Link></li>
              <li><Link to="/programs">Browse activities</Link></li>
              <li><a href="https://www.endlesssmilesfoundation.org" target="_blank" rel="noreferrer">National foundation</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Endless Smiles Foundation — Coppell Chapter. Made with ♥ by students.</span>
          <button
            className="footer-egg"
            onClick={egg}
            aria-label="Chapter staff area"
            title="Staff"
          >
            <SmileMark size={18} />
          </button>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <Header />
      <main id="main" key={location.pathname} className="page-enter">{children}</main>
      <Footer />
    </>
  );
}
