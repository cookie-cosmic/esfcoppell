import { Link } from 'react-router-dom';
import { usePageTitle } from '../lib/hooks';
import { SmileMark } from '../components/icons';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <section className="section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center' }}>
      <div className="container" style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-block', opacity: 0.9 }}><SmileMark size={72} /></div>
        <h1 style={{ marginTop: 12 }}>404 — this page lost its smile</h1>
        <p className="muted" style={{ maxWidth: 460, margin: '0 auto 22px' }}>
          The page you’re looking for doesn’t exist or was moved. Let’s get you back to spreading smiles.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" to="/">Back to Home</Link>
          <Link className="btn btn-outline" to="/programs">Programs & Events</Link>
        </div>
      </div>
    </section>
  );
}
