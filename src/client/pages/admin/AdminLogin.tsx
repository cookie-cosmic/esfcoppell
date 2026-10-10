import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, staffToken } from '../../lib/api';
import { Field, useToast } from '../../components/ui';
import { SmileMark } from '../../components/icons';
import type { SessionState } from '../../App';
import { STAFF_BASE } from '../../lib/paths';

export default function AdminLogin({ session, setSession }: { session: SessionState; setSession: (s: SessionState) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation() as any;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/api/admin/login', { password });
      staffToken.set(res.token ?? null);
      setSession({ loaded: true, admin: res.admin });
      toast('success', `Welcome back, ${res.admin.name}.`);
      navigate(location.state?.from && !String(location.state.from).includes('/login') ? location.state.from : STAFF_BASE, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  if (session.admin) {
    navigate(STAFF_BASE, { replace: true });
    return null;
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand" style={{ justifyContent: 'center' }}>
          <SmileMark size={46} />
        </div>
        <h2 style={{ textAlign: 'center', fontSize: '1.5rem' }}>Chapter Staff Sign-in</h2>
        <p className="muted small" style={{ textAlign: 'center' }}>
          Restricted area for Endless Smiles Coppell administrators and reviewers.
          Enter the chapter staff password to continue.
        </p>
        {error ? <p role="alert" className="small" style={{ color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 10, padding: '8px 12px' }}>{error}</p> : null}
        <Field label="Staff password" required>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy || !password} type="submit">
          {busy ? <span className="spinner" /> : null} Sign in
        </button>
        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 14 }}>
          Logins are audited. <Link to="/">← Back to the public site</Link>
        </p>
      </form>
    </div>
  );
}
