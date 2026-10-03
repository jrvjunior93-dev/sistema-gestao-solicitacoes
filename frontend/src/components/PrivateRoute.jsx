import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppRouteFallback from './AppRouteFallback';

const CUSTOS_RECEBIVEIS_ALLOWED_ROUTES = [
  '/custos-recebiveis',
  '/perfil',
  '/ajuda',
  '/suporte'
];

function isCustosRecebiveisAllowedRoute(pathname) {
  return CUSTOS_RECEBIVEIS_ALLOWED_ROUTES.some((route) => (
    pathname === route || pathname.startsWith(`${route}/`)
  ));
}

export default function PrivateRoute({ children }) {
  const { isAuthenticated, authReady, authRestoreError, user } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <AppRouteFallback fullScreen />;
  }

  if (authRestoreError && !isAuthenticated) {
    return (
      <main className="min-h-screen bg-[var(--c-bg)] px-4 py-8 flex items-center justify-center">
        <section className="w-full max-w-lg rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-[var(--c-text)]">Não foi possível restaurar sua sessão</h1>
          <p className="mt-2 text-sm text-[var(--c-muted)]">
            Verifique a conexão e tente novamente. Sua sessão local não foi apagada.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => window.location.reload()}
          >
            Tentar novamente
          </button>
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.mfa_setup_pending && location.pathname !== '/perfil') {
    return <Navigate to="/perfil" replace />;
  }

  const crPending = user?.custos_recebiveis_pendencia;
  if (crPending?.bloqueado && !isCustosRecebiveisAllowedRoute(location.pathname)) {
    const params = new URLSearchParams({
      aba: 'planejamento',
      bloqueio: '1'
    });
    if (crPending.obra_id) params.set('obra', crPending.obra_id);
    if (crPending.competencia) params.set('competencia', crPending.competencia);
    return <Navigate to={`/custos-recebiveis?${params.toString()}`} replace />;
  }

  return children;
}

export {
  CUSTOS_RECEBIVEIS_ALLOWED_ROUTES,
  isCustosRecebiveisAllowedRoute
};
