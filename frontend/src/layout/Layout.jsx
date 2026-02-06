import { Link, Outlet } from 'react-router-dom';
import { useContext, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import NotificacoesBell from '../components/NotificacoesBell';

export default function Layout() {
  const { user, logout } = useContext(AuthContext);
  const [menuAberto, setMenuAberto] = useState(false);
  const isFinanceiro =
    user?.perfil === 'FINANCEIRO' ||
    user?.setor?.codigo === 'FINANCEIRO' ||
    user?.area === 'FINANCEIRO' ||
    user?.setor_id === 4;
  const setorTokens = [
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isAdminGEO =
    user?.perfil === 'ADMIN' && setorTokens.includes('GEO');
  const isSetorObra = setorTokens.includes('OBRA');

  function renderMenu() {
    switch (user?.perfil) {
      case 'USUARIO':
        return (
          <>
            <MenuItem to="/solicitacoes">Minhas Solicitacoes</MenuItem>
            <MenuItem to="/nova-solicitacao">Nova Solicitacao</MenuItem>
            <MenuItem to="/perfil">Meu Perfil</MenuItem>
            {isSetorObra && (
              <MenuItem to="/gestao-contratos">Gestao de Contratos</MenuItem>
            )}
            {isFinanceiro && (
              <>
                <MenuItem to="/comprovantes/upload">Upload Comprovantes</MenuItem>
                <MenuItem to="/comprovantes/pendentes">Comprovantes Pendentes</MenuItem>
              </>
            )}
          </>
        );

      case 'SETOR':
        return (
          <>
            <MenuItem to="/solicitacoes">Solicitacoes do Setor</MenuItem>
            <MenuItem to="/perfil">Meu Perfil</MenuItem>
            {isSetorObra && (
              <MenuItem to="/gestao-contratos">Gestao de Contratos</MenuItem>
            )}
            {isFinanceiro && (
              <>
                <MenuItem to="/comprovantes/upload">Upload Comprovantes</MenuItem>
                <MenuItem to="/comprovantes/pendentes">Comprovantes Pendentes</MenuItem>
              </>
            )}
          </>
        );

      case 'GESTOR':
        return (
          <>
            <MenuItem to="/solicitacoes">Todas as Solicitacoes</MenuItem>
            <MenuItem to="/perfil">Meu Perfil</MenuItem>
            {isSetorObra && (
              <MenuItem to="/gestao-contratos">Gestao de Contratos</MenuItem>
            )}
            {isFinanceiro && (
              <>
                <MenuItem to="/comprovantes/upload">Upload Comprovantes</MenuItem>
                <MenuItem to="/comprovantes/pendentes">Comprovantes Pendentes</MenuItem>
              </>
            )}
          </>
        );

      case 'FINANCEIRO':
        return (
          <>
            <MenuItem to="/solicitacoes">Solicitacoes do Setor</MenuItem>
            <MenuItem to="/comprovantes/upload">Upload Comprovantes</MenuItem>
            <MenuItem to="/comprovantes/pendentes">Comprovantes Pendentes</MenuItem>
            <MenuItem to="/perfil">Meu Perfil</MenuItem>
          </>
        );

      case 'ADMIN':
        return (
          <>
            <MenuItem to="/">Dashboard</MenuItem>
            <MenuItem to="/nova-solicitacao">Nova Solicitacao</MenuItem>
            <MenuItem to="/solicitacoes">Solicitacoes</MenuItem>
            <MenuItem to="/usuarios">Usuarios</MenuItem>
            {isAdminGEO && (
              <MenuItem to="/gestao-contratos">Gestao de Contratos</MenuItem>
            )}
            <MenuItem to="/perfil">Meu Perfil</MenuItem>
          </>
        );

      case 'SUPERADMIN':
        return (
          <>
            <MenuItem to="/">Dashboard</MenuItem>
            <MenuItem to="/nova-solicitacao">Nova Solicitacao</MenuItem>
            <MenuItem to="/solicitacoes">Solicitacoes</MenuItem>
            <MenuItem to="/comprovantes/upload">Upload Comprovantes</MenuItem>
            <MenuItem to="/comprovantes/pendentes">Comprovantes Pendentes</MenuItem>
            <MenuItem to="/usuarios">Usuarios</MenuItem>
            <MenuItem to="/obras">Obras</MenuItem>
            <MenuItem to="/setores">Setores</MenuItem>
            <MenuItem to="/cargos">Cargos</MenuItem>
            <MenuItem to="/tipos-solicitacao">Tipos de Solicitacao</MenuItem>
            <MenuItem to="/gestao-contratos">Gestao de Contratos</MenuItem>
            <MenuItem to="/configuracoes">Configuracoes</MenuItem>
            <MenuItem to="/perfil">Meu Perfil</MenuItem>
          </>
        );

      default:
        return null;
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-100 overflow-x-hidden">
      {!menuAberto && (
        <div
          className="fixed left-0 top-0 bottom-0 w-2 z-40"
          onMouseEnter={() => setMenuAberto(true)}
          aria-hidden="true"
        />
      )}
      {menuAberto && (
        <aside
          className="w-56 bg-slate-900 text-white flex flex-col p-4 overflow-y-auto h-screen"
          onMouseLeave={() => setMenuAberto(false)}
        >
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-base font-semibold">
              Sistema de Solicitacoes
            </h1>
            <button
              onClick={() => setMenuAberto(false)}
              className="text-white/80 hover:text-white"
              aria-label="Recolher menu"
              type="button"
            >
              &#9776;
            </button>
          </div>

          <div className="mb-4 text-xs text-gray-300">
            {user?.nome}<br />
            <span className="font-semibold">{user?.perfil}</span>
          </div>

          <button
            onClick={logout}
            className="mb-4 text-xs text-red-400 hover:text-red-300"
          >
            Sair
          </button>

          <nav>
            <ul className="space-y-0.5 text-sm">
              {renderMenu()}
            </ul>
          </nav>
        </div>
      </aside>
      )}

      <main className="flex-1 p-6 overflow-y-auto overflow-x-hidden">
        <div className="flex items-center mb-4 w-full">
          {!menuAberto && (
            <button
              onClick={() => setMenuAberto(true)}
              className="text-slate-700 hover:text-slate-900"
              aria-label="Abrir menu"
              type="button"
            >
              &#9776;
            </button>
          )}
          <div className="ml-auto flex items-center">
            <NotificacoesBell />
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

function MenuItem({ to, children }) {
  return (
    <li>
      <Link
        to={to}
        className="
          block px-3 py-1.5 rounded-md
          hover:bg-slate-700
          transition-colors
        "
      >
        {children}
      </Link>
    </li>
  );
}
