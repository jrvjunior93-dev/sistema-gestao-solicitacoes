import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import NotificacoesBell from '../components/NotificacoesBell';
import {
  HiOutlineSquares2X2,
  HiOutlinePlusCircle,
  HiOutlineClipboardDocumentList,
  HiOutlineCloudArrowUp,
  HiOutlineReceiptRefund,
  HiOutlineUsers,
  HiOutlineBuildingOffice2,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineCog6Tooth,
  HiOutlineBanknotes,
  HiOutlineFolderOpen,
  HiOutlineArrowRightOnRectangle,
  HiOutlineBars3,
  HiOutlineMoon,
  HiOutlineSun,
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight
} from 'react-icons/hi2';

export default function Layout() {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop collapse
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
  const sidebarWidth = collapsed ? 72 : 228;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const perfilUpper = String(user?.perfil || '').toUpperCase();
  const areaUpper = String(user?.area || '').toUpperCase();
  const setorCodigoUpper = String(user?.setor?.codigo || '').toUpperCase();
  const setorNomeUpper = String(user?.setor?.nome || '').toUpperCase();
  const isFinanceiro =
    perfilUpper === 'FINANCEIRO' ||
    setorCodigoUpper === 'FINANCEIRO' ||
    setorNomeUpper === 'FINANCEIRO' ||
    areaUpper === 'FINANCEIRO' ||
    user?.setor_id === 4;
  const setorTokens = [
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isAdminGEO =
    user?.perfil === 'ADMIN' && setorTokens.includes('GEO');
  const isSetorObra = setorTokens.includes('OBRA');

  const menuItems = useMemo(() => {
    const base = [];
    const add = (to, label, icon) => base.push({ to, label, icon });

    switch (user?.perfil) {
      case 'USUARIO':
        add('/solicitacoes', 'Minhas Solicitações', HiOutlineClipboardDocumentList);
        add('/nova-solicitacao', 'Nova Solicitação', HiOutlinePlusCircle);
        add('/perfil', 'Meu Perfil', HiOutlineCog6Tooth);
        if (isSetorObra) add('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes);
        if (isFinanceiro) {
          add('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp);
          add('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund);
        }
        break;

      case 'SETOR':
        add('/solicitacoes', 'Solicitações do Setor', HiOutlineClipboardDocumentList);
        add('/perfil', 'Meu Perfil', HiOutlineCog6Tooth);
        if (isSetorObra) add('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes);
        if (isFinanceiro) {
          add('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp);
          add('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund);
        }
        break;

      case 'GESTOR':
        add('/solicitacoes', 'Todas as Solicitações', HiOutlineClipboardDocumentList);
        add('/perfil', 'Meu Perfil', HiOutlineCog6Tooth);
        if (isSetorObra) add('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes);
        if (isFinanceiro) {
          add('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp);
          add('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund);
        }
        break;

      case 'FINANCEIRO':
        add('/solicitacoes', 'Solicitações do Setor', HiOutlineClipboardDocumentList);
        add('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp);
        add('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund);
        add('/perfil', 'Meu Perfil', HiOutlineCog6Tooth);
        break;

      case 'ADMIN':
        add('/', 'Dashboard', HiOutlineSquares2X2);
        add('/nova-solicitacao', 'Nova Solicitação', HiOutlinePlusCircle);
        add('/solicitacoes', 'Solicitações', HiOutlineClipboardDocumentList);
        if (isFinanceiro) {
          add('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp);
          add('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund);
        }
        add('/usuarios', 'Usuários', HiOutlineUsers);
        if (isAdminGEO) add('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes);
        add('/perfil', 'Meu Perfil', HiOutlineCog6Tooth);
        break;

      case 'SUPERADMIN':
        add('/', 'Dashboard', HiOutlineSquares2X2);
        add('/nova-solicitacao', 'Nova Solicitação', HiOutlinePlusCircle);
        add('/solicitacoes', 'Solicitações', HiOutlineClipboardDocumentList);
        add('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp);
        add('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund);
        add('/usuarios', 'Usuários', HiOutlineUsers);
        add('/obras', 'Obras', HiOutlineBuildingOffice2);
        add('/setores', 'Setores', HiOutlineAdjustmentsHorizontal);
        add('/cargos', 'Cargos', HiOutlineFolderOpen);
        add('/tipos-solicitacao', 'Tipos de Solicitação', HiOutlineClipboardDocumentList);
        add('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes);
        add('/configuracoes', 'Configurações', HiOutlineCog6Tooth);
        add('/perfil', 'Meu Perfil', HiOutlineCog6Tooth);
        break;

      default:
        break;
    }

    return base;
  }, [user?.perfil, isFinanceiro, isAdminGEO, isSetorObra]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  const isActive = path =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="layout-shell flex min-h-screen overflow-x-hidden">
        <aside
          className={`sidebar ${collapsed ? 'collapsed' : ''} fixed md:static top-0 left-0 h-full md:h-auto z-40 transform transition-all duration-200 ${
            menuAberto ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
          style={{ width: `${sidebarWidth}px`, transition: 'width 0.25s ease' }}
          role="navigation"
          aria-label="Menu lateral"
        >
          <div className="flex flex-col h-full px-4 py-4 gap-3">
            <div className={`brand ${collapsed ? 'justify-center' : 'justify-between'}`}>
              <img
                src="/CSC_logo_colorida.png"
                alt="CSC"
                className="h-7 w-auto"
              />
              <div className="flex items-center gap-2 brand-text">
                <div className="leading-tight">
                  <p className="text-sm font-semibold" style={{ color: 'var(--nav-text)' }}>
                    Sistema de Solicitações
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCollapsed(c => !c)}
                  className="chevron-btn hidden md:inline-flex"
                  aria-label="Alternar menu"
                  aria-expanded={!collapsed}
                  type="button"
                >
                  {collapsed ? <HiOutlineChevronDoubleRight size={20} /> : <HiOutlineChevronDoubleLeft size={20} />}
                </button>
                <button
                  onClick={() => setMenuAberto(false)}
                  className="chevron-btn md:hidden"
                  aria-label="Fechar menu"
                  type="button"
                >
                  <HiOutlineBars3 size={22} />
                </button>
              </div>
            </div>

            {!collapsed && (
              <div className="user-block mt-1 mb-2">
                <span className="font-semibold" style={{ color: 'var(--nav-text)' }}>{user?.nome}</span>
                <span className="user-role">{perfilUpper || 'USUARIO'}</span>
              </div>
            )}

            <nav className="flex-1">
              <ul className="nav-list">
                {menuItems.map(item => (
                  <li key={item.to}>
                    <MenuItem
                      to={item.to}
                      label={item.label}
                      icon={item.icon}
                      active={isActive(item.to)}
                      onSelect={() => {
                        navigate(item.to);
                        if (isMobile()) setMenuAberto(false);
                      }}
                      collapsed={collapsed}
                    />
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex flex-col gap-3">
              <button
                onClick={logout}
                className="nav-btn text-red-300 hover:text-white"
                type="button"
              >
                <HiOutlineArrowRightOnRectangle className="nav-icon" />
                {!collapsed && 'Sair'}
              </button>
            </div>
          </div>
        </aside>

        {menuAberto && (
          <div
            className="fixed inset-0 bg-black/30 md:hidden z-30"
            onClick={() => setMenuAberto(false)}
            aria-hidden="true"
          />
        )}

        <main className="flex-1 p-6 md:ml-0 bg-[var(--c-bg)] transition-colors duration-200">
          <div className="flex items-center gap-3 mb-6 w-full">
            <button
              onClick={() => setMenuAberto(true)}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-md border border-[var(--c-border)] text-[var(--c-text)]"
              aria-label="Abrir menu"
              type="button"
            >
              <HiOutlineBars3 size={20} />
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="theme-toggle"
                type="button"
              >
                {theme === 'dark' ? (
                  <>
                    <HiOutlineSun size={18} /> Claro
                  </>
                ) : (
                  <>
                    <HiOutlineMoon size={18} /> Escuro
                  </>
                )}
              </button>
              <NotificacoesBell />
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function MenuItem({ to, label, icon: Icon, active, onSelect, collapsed }) {
  return (
    <li>
      <Link
        to={to}
        onClick={() => onSelect()}
        className={`nav-btn ${active ? 'active' : ''}`}
        title={label}
        aria-label={label}
      >
        {Icon && <Icon className="nav-icon" />}
        {!collapsed && <span>{label}</span>}
      </Link>
    </li>
  );
}
