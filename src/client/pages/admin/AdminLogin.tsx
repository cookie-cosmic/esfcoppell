import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, staffToken } from '../../lib/api';
import { Field, useToast } from '../../components/ui';
import { SmileMark } from '../../components/icons';
import type { SessionState } from '../../App';
import { STAFF_BASE } from '../../lib/paths';

export default function AdminLogin({ session, setSession }: { session: SessionState; setSession: (s: SessionState) => void }) {
  const [pin, setPin] = useState('');
  const [loginName, setLoginName] = useState('');
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
      const res = await api.post('/api/admin/login', { pin, login_name: loginName.trim() });
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
          Enter the six-digit staff PIN to continue.
        </p>
        <Field label="Your name for the login log" required>
          <input className="input" value={loginName} onChange={(e) => setLoginName(e.target.value.slice(0, 80))} autoComplete="name" required autoFocus aria-label="Your name for the login log" />
        </Field>
        {error ? <p role="alert" className="small" style={{ color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 10, padding: '8px 12px' }}>{error}</p> : null}
        <Field label="Staff PIN" required>
          <input className="input" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} required aria-label="Staff PIN" />
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button key={digit} className="btn btn-outline" type="button" onClick={() => setPin((value) => (value + digit).slice(0, 6))}>{digit}</button>
            ))}
            <button className="btn btn-outline" type="button" onClick={() => setPin('')}>Clear</button>
            <button className="btn btn-outline" type="button" onClick={() => setPin((value) => (value + '0').slice(0, 6))}>0</button>
            <button className="btn btn-outline" type="button" onClick={() => setPin((value) => value.slice(0, -1))}>Delete</button>
          </div>
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy || pin.length !== 6} type="submit">
          {busy ? <span className="spinner" /> : null} Sign in
        </button>
        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 14 }}>
          Logins are audited. <Link to="/">← Back to the public site</Link>
        </p>
      </form>
    </div>
  );
}
