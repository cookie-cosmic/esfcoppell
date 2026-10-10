import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading, ToastProvider } from './components/ui';
import { api, SESSION_EXPIRED_EVENT } from './lib/api';
import { STAFF_BASE } from './lib/paths';
import Home from './pages/Home';
import Team from './pages/Team';
import Programs from './pages/Programs';
import Hours from './pages/Hours';
import NotFound from './pages/NotFound';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';

export interface SessionState {
  loaded: boolean;
  admin: { id: string; email: string; name: string; role: 'owner' | 'admin' | 'reviewer' } | null;
}

function useSession() {
  const [session, setSession] = useState<SessionState>({ loaded: false, admin: null });
  useEffect(() => {
    api
      .get('/api/admin/session')
      .then((d) => setSession({ loaded: true, admin: d.admin }))
      .catch(() => setSession({ loaded: true, admin: null }));
  }, []);
  // If any staff request comes back 401 (session expired or revoked), drop back to sign-in.
  useEffect(() => {
    const expired = () => setSession((s) => (s.admin ? { loaded: true, admin: null } : s));
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, []);
  return [session, setSession] as const;
}

export default function App() {
  const [session, setSession] = useSession();
  const location = useLocation();

  return (
    <ToastProvider>
      <Routes>
        <Route path={`${STAFF_BASE}/login`} element={<AdminLogin session={session} setSession={setSession} />} />
        <Route
          path={`${STAFF_BASE}/*`}
          element={
            !session.loaded ? <div className="auth-wrap"><Loading label="Checking staff access…" /></div> : session.admin ? (
              <AdminLayout session={session} setSession={setSession} />
            ) : (
              <Navigate to={`${STAFF_BASE}/login`} replace state={{ from: location.pathname }} />
            )
          }
        />
        <Route
          path="*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/team" element={<Team />} />
                <Route path="/programs" element={<Programs />} />
                <Route path="/hours" element={<Hours />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </ToastProvider>
  );
}
