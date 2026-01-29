import { Link, Outlet } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export default function Layout() {

  const { user, logout } = useContext(AuthContext);

  function renderMenu() {
    switch (user?.perfil) {

      case 'USUARIO':
        return (
          <>
            <MenuItem to="/">Dashboard</MenuItem>
            <MenuItem to="/solicitacoes">Minhas Solicitações</MenuItem>
            <MenuItem to="/nova-solicitacao">Nova Solicitação</MenuItem>
          </>
        );

      case 'SETOR':
        return (
          <>
            <MenuItem to="/">Dashboard</MenuItem>
            <MenuItem to="/solicitacoes">Solicitações do Setor</MenuItem>
          </>
        );

      case 'GESTOR':
        return (
          <>
            <MenuItem to="/">Dashboard</MenuItem>
            <MenuItem to="/solicitacoes">Todas as Solicitações</MenuItem>
          </>
        );

      case 'ADMIN':
        return (
          <>
            <MenuItem to="/">Dashboard</MenuItem>
            <MenuItem to="/nova-solicitacao">Nova Solicitação</MenuItem>
            <MenuItem to="/solicitacoes">Solicitações</MenuItem>
            <MenuItem to="/usuarios">Usuários</MenuItem>
            <MenuItem to="/obras">Obras</MenuItem>
            <MenuItem to="/setores">Setores</MenuItem>
            <MenuItem to="/cargos">Cargos</MenuItem>
            <MenuItem to="/tipos-solicitacao">Tipos de Solicitação</MenuItem>
          </>
        );

      default:
        return null;
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col p-5">

        <h1 className="text-lg font-semibold mb-6">
          Sistema de Solicitações
        </h1>
        <button
          onClick={logout}
          className="mt-3 text-sm text-red-400 hover:text-red-300"
        >
          Sair
        </button>

        <div className="mb-6 text-sm text-gray-300">
          {user?.nome}<br />
          <span className="font-semibold">{user?.perfil}</span>
        </div>

        

        <nav>
          <ul className="space-y-1">
            {renderMenu()}
          </ul>
        </nav>

      </aside>

      {/* CONTEÚDO */}
      <main className="flex-1 p-6 overflow-y-auto">
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
          block px-3 py-2 rounded-md
          hover:bg-slate-700
          transition-colors
        "
      >
        {children}
      </Link>
    </li>
    
  );
}
