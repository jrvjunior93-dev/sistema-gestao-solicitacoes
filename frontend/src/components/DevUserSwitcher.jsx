import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowsRightLeft,
  HiOutlineChevronDown,
  HiOutlineCog6Tooth,
  HiOutlineUserCircle
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import { nomeProprio } from '../utils/texto';

export default function DevUserSwitcher() {
  const {
    devUserSwitch,
    loadDevUserSwitch,
    assumeDevUser,
    restoreDevUser
  } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (devUserSwitch !== null) return;
    loadDevUserSwitch().catch(() => {});
  }, [devUserSwitch, loadDevUserSwitch]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!devUserSwitch?.enabled) return null;

  async function selectUser(userId) {
    setBusy(true);
    setError('');
    try {
      await assumeDevUser(userId);
      setOpen(false);
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(requestError?.message || 'Nao foi possivel trocar o usuario.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError('');
    try {
      await restoreDevUser();
      setOpen(false);
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(requestError?.message || 'Nao foi possivel retornar ao SUPERADMIN.');
    } finally {
      setBusy(false);
    }
  }

  const current = (devUserSwitch.users || []).find((item) => (
    Number(item.id) === Number(devUserSwitch.current_user_id)
  ));
  const label = devUserSwitch.impersonating
    ? `Testando: ${nomeProprio(current?.nome || 'usuario')}`
    : 'Testar usuário';

  return (
    <div className="dev-user-switcher" ref={containerRef}>
      <button
        type="button"
        className={`theme-toggle dev-user-switcher-trigger${devUserSwitch.impersonating ? ' is-active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        title="Troca rápida exclusiva do ambiente de desenvolvimento"
      >
        <HiOutlineArrowsRightLeft size={18} aria-hidden="true" />
        <span className="dev-user-switcher-label">{label}</span>
        <HiOutlineChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <div className="dev-user-switcher-menu" role="menu" aria-label="Usuários configurados para teste">
          <div className="dev-user-switcher-head">
            <strong>Ambiente de desenvolvimento</strong>
            <span>Visualize o sistema com as permissões reais de outro usuário.</span>
          </div>

          {error && <p className="dev-user-switcher-error" role="alert">{error}</p>}

          <div className="dev-user-switcher-list">
            {(devUserSwitch.users || []).map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={Number(item.id) === Number(devUserSwitch.current_user_id) ? 'is-current' : ''}
                onClick={() => selectUser(item.id)}
                disabled={busy || Number(item.id) === Number(devUserSwitch.current_user_id)}
              >
                <HiOutlineUserCircle size={20} aria-hidden="true" />
                <span>
                  <strong>{nomeProprio(item.nome)}</strong>
                  <small>{item.setor?.nome || item.setor?.codigo || 'Sem setor'} · {item.perfil}</small>
                </span>
              </button>
            ))}
            {!devUserSwitch.users?.length && (
              <p className="dev-user-switcher-empty">Nenhum usuário de teste configurado.</p>
            )}
          </div>

          <div className="dev-user-switcher-actions">
            {devUserSwitch.impersonating ? (
              <button type="button" className="btn btn-primary" onClick={restore} disabled={busy}>
                Voltar ao SUPERADMIN
              </button>
            ) : (
              <Link to="/configuracoes-usuarios-teste" className="btn btn-outline" onClick={() => setOpen(false)}>
                <HiOutlineCog6Tooth size={17} aria-hidden="true" />
                Configurar usuários
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
