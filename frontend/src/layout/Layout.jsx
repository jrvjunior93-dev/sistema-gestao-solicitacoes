import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import NotificacoesBell from '../components/NotificacoesBell';
import {
  HiOutlineSquares2X2,
  HiOutlinePlusCircle,
  HiOutlineClipboardDocumentList,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCloudArrowUp,
  HiOutlineReceiptRefund,
  HiOutlineUsers,
  HiOutlineRectangleGroup,
  HiOutlineUserCircle,
  HiOutlineWallet,
  HiOutlineBuildingOffice2,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineCog6Tooth,
  HiOutlineBanknotes,
  HiOutlineFolderOpen,
  HiOutlineArrowRightOnRectangle,
  HiOutlineBars3,
  HiOutlineMoon,
  HiOutlineSun,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineChevronLeft,
  HiOutlineArchiveBox,
  HiOutlineDocumentText,
  HiOutlineInboxStack,
  HiOutlinePaperAirplane
} from 'react-icons/hi2';
import { BsBuildingsFill } from 'react-icons/bs';

export default function Layout() {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop collapse
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );

  const sidebarWidth = isMobileViewport ? 292 : (collapsed ? 76 : 236);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 767px)');
    const listener = (event) => setIsMobileViewport(event.matches);
    setIsMobileViewport(media.matches);

    if (media.addEventListener) {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    media.addListener(listener);
    return () => media.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      document.body.style.overflow = '';
      return undefined;
    }

    document.body.style.overflow = menuAberto ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuAberto, isMobileViewport]);

  useEffect(() => {
    if (isMobileViewport) setMenuAberto(false);
  }, [location.pathname, isMobileViewport]);

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

  const menuGroups = useMemo(() => {
    const groups = [];
    const item = (to, label, icon) => ({ to, label, icon });
    const groupIcons = {
      Painel: HiOutlineSquares2X2,
      Solicitações: HiOutlineClipboardDocumentList,
      Comunicação: HiOutlineChatBubbleLeftRight,
      Financeiro: HiOutlineWallet,
      Cadastros: HiOutlineRectangleGroup,
      Contratos: HiOutlineBanknotes,
      Configurações: HiOutlineCog6Tooth,
      Conta: HiOutlineUserCircle
    };
    const addGroup = (label, entries) => {
      const items = entries.filter(Boolean);
      if (items.length) groups.push({ label, icon: groupIcons[label] || HiOutlineFolderOpen, items });
    };

    switch (user?.perfil) {
      case 'USUARIO':
        addGroup('Solicitações', [
          item('/solicitacoes', 'Minhas Solicitações', HiOutlineDocumentText),
          item('/solicitacoes-arquivadas', 'Arquivadas', HiOutlineArchiveBox),
          item('/nova-solicitacao', 'Nova Solicitação', HiOutlinePlusCircle)
        ]);
        addGroup('Comunicação', [
          item('/conversas/entrada', 'Caixa de Entrada', HiOutlineInboxStack),
          item('/conversas/saida', 'Caixa de Saída', HiOutlinePaperAirplane)
        ]);
        if (isSetorObra) {
          addGroup('Contratos', [
            item('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes)
          ]);
        }
        if (isFinanceiro) {
          addGroup('Financeiro', [
            item('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp),
            item('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund)
          ]);
        }
        addGroup('Conta', [
          item('/perfil', 'Meu Perfil', HiOutlineUserCircle)
        ]);
        break;

      case 'SETOR':
        addGroup('Solicitações', [
          item('/solicitacoes', 'Solicitações do Setor', HiOutlineDocumentText),
          item('/solicitacoes-arquivadas', 'Arquivadas', HiOutlineArchiveBox)
        ]);
        addGroup('Comunicação', [
          item('/conversas/entrada', 'Caixa de Entrada', HiOutlineInboxStack),
          item('/conversas/saida', 'Caixa de Saída', HiOutlinePaperAirplane)
        ]);
        if (isSetorObra) {
          addGroup('Contratos', [
            item('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes)
          ]);
        }
        if (isFinanceiro) {
          addGroup('Financeiro', [
            item('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp),
            item('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund)
          ]);
        }
        addGroup('Conta', [
          item('/perfil', 'Meu Perfil', HiOutlineUserCircle)
        ]);
        break;

      case 'GESTOR':
        addGroup('Solicitações', [
          item('/solicitacoes', 'Todas as Solicitações', HiOutlineDocumentText),
          item('/solicitacoes-arquivadas', 'Arquivadas', HiOutlineArchiveBox)
        ]);
        addGroup('Comunicação', [
          item('/conversas/entrada', 'Caixa de Entrada', HiOutlineInboxStack),
          item('/conversas/saida', 'Caixa de Saída', HiOutlinePaperAirplane)
        ]);
        if (isSetorObra) {
          addGroup('Contratos', [
            item('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes)
          ]);
        }
        if (isFinanceiro) {
          addGroup('Financeiro', [
            item('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp),
            item('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund)
          ]);
        }
        addGroup('Conta', [
          item('/perfil', 'Meu Perfil', HiOutlineUserCircle)
        ]);
        break;

      case 'FINANCEIRO':
        addGroup('Solicitações', [
          item('/solicitacoes', 'Solicitações do Setor', HiOutlineDocumentText),
          item('/solicitacoes-arquivadas', 'Arquivadas', HiOutlineArchiveBox)
        ]);
        addGroup('Comunicação', [
          item('/conversas/entrada', 'Caixa de Entrada', HiOutlineInboxStack),
          item('/conversas/saida', 'Caixa de Saída', HiOutlinePaperAirplane)
        ]);
        addGroup('Financeiro', [
          item('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp),
          item('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund)
        ]);
        addGroup('Conta', [
          item('/perfil', 'Meu Perfil', HiOutlineUserCircle)
        ]);
        break;

      case 'ADMIN':
        addGroup('Painel', [
          item('/', 'Dashboard', HiOutlineSquares2X2)
        ]);
        addGroup('Solicitações', [
          item('/solicitacoes', 'Solicitações', HiOutlineDocumentText),
          item('/solicitacoes-arquivadas', 'Arquivadas', HiOutlineArchiveBox),
          item('/nova-solicitacao', 'Nova Solicitação', HiOutlinePlusCircle)
        ]);
        addGroup('Comunicação', [
          item('/conversas/entrada', 'Caixa de Entrada', HiOutlineInboxStack),
          item('/conversas/saida', 'Caixa de Saída', HiOutlinePaperAirplane)
        ]);
        if (isFinanceiro) {
          addGroup('Financeiro', [
            item('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp),
            item('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund)
          ]);
        }
        if (isAdminGEO) {
          addGroup('Cadastros', [
            item('/usuarios', 'Usuários', HiOutlineUsers)
          ]);
          addGroup('Contratos', [
            item('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes)
          ]);
        }
        addGroup('Conta', [
          item('/perfil', 'Meu Perfil', HiOutlineUserCircle)
        ]);
        break;

      case 'SUPERADMIN':
        addGroup('Painel', [
          item('/', 'Dashboard', HiOutlineSquares2X2)
        ]);
        addGroup('Solicitações', [
          item('/solicitacoes', 'Solicitações', HiOutlineDocumentText),
          item('/solicitacoes-arquivadas', 'Arquivadas', HiOutlineArchiveBox),
          item('/nova-solicitacao', 'Nova Solicitação', HiOutlinePlusCircle)
        ]);
        addGroup('Comunicação', [
          item('/conversas/entrada', 'Caixa de Entrada', HiOutlineInboxStack),
          item('/conversas/saida', 'Caixa de Saída', HiOutlinePaperAirplane)
        ]);
        addGroup('Financeiro', [
          item('/comprovantes/upload', 'Upload Comprovantes', HiOutlineCloudArrowUp),
          item('/comprovantes/pendentes', 'Comprovantes Pendentes', HiOutlineReceiptRefund)
        ]);
        addGroup('Cadastros', [
          item('/usuarios', 'Usuários', HiOutlineUsers),
          item('/obras', 'Obras', HiOutlineBuildingOffice2),
          item('/setores', 'Setores', HiOutlineAdjustmentsHorizontal),
          item('/cargos', 'Cargos', HiOutlineFolderOpen),
          item('/tipos-solicitacao', 'Tipos de Solicitação', HiOutlineClipboardDocumentList)
        ]);
        addGroup('Contratos', [
          item('/gestao-contratos', 'Gestão de Contratos', HiOutlineBanknotes)
        ]);
        addGroup('Configurações', [
          item('/configuracoes', 'Configurações', HiOutlineCog6Tooth)
        ]);
        addGroup('Conta', [
          item('/perfil', 'Meu Perfil', HiOutlineUserCircle)
        ]);
        break;

      default:
        break;
    }

    return groups;
  }, [user?.perfil, isFinanceiro, isAdminGEO, isSetorObra]);

  const flatMenuItems = useMemo(
    () => menuGroups.flatMap(group => group.items),
    [menuGroups]
  );

  useEffect(() => {
    setExpandedGroups(prev => {
      const validLabels = new Set(menuGroups.map(group => group.label));
      const filtered = prev.filter(label => validLabels.has(label));
      const activeGroup = menuGroups.find(group =>
        group.items.some(item => isPathActive(location.pathname, item.to))
      )?.label;

      if (filtered.length === 0) {
        if (activeGroup) return [activeGroup];
        return menuGroups.length > 0 ? [menuGroups[0].label] : [];
      }

      if (activeGroup && !filtered.includes(activeGroup)) {
        return [...filtered, activeGroup];
      }

      return filtered;
    });
  }, [menuGroups, location.pathname]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  const isActive = path => isPathActive(location.pathname, path);
  const toggleGroup = (label) => {
    setExpandedGroups(prev =>
      prev.includes(label)
        ? prev.filter(item => item !== label)
        : [...prev, label]
    );
  };

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
          <div className="flex flex-col h-full px-3 md:px-4 py-3 md:py-4 gap-3">
            <div className={`brand ${collapsed ? 'justify-center' : 'justify-between'}`}>
              <img
                src="/CSC_logo_colorida.png"
                alt="CSC"
                className="h-7 w-auto"
              />
              <div className="flex items-center gap-2 brand-text">
                <div className="leading-tight">
                  <p className="brand-title inline-flex items-center gap-1.5">
                    <BsBuildingsFill size={14} />
                    <span>Fluxy</span>
                  </p>
                  {!collapsed && <p className="brand-subtitle">Gestão de solicitações</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
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
              {collapsed ? (
                <ul className="nav-list">
                  {flatMenuItems.map(item => (
                    <MenuItem
                      key={item.to}
                      to={item.to}
                      label={item.label}
                      icon={item.icon}
                      active={isActive(item.to)}
                      onSelect={() => {
                        navigate(item.to);
                        if (isMobileViewport) setMenuAberto(false);
                      }}
                      collapsed={collapsed}
                    />
                  ))}
                </ul>
              ) : (
                <ul className="nav-list nav-list-grouped">
                  {menuGroups.map(group => {
                    const isOpen = expandedGroups.includes(group.label);
                    const groupId = `submenu-${String(group.label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                    const GroupIcon = group.icon;

                    return (
                      <li key={group.label} className="nav-group">
                        <button
                          type="button"
                          className={`nav-group-toggle ${isOpen ? 'open' : ''}`}
                          onClick={() => toggleGroup(group.label)}
                          aria-expanded={isOpen}
                          aria-controls={groupId}
                        >
                          <span className="nav-group-heading">
                            {GroupIcon && <GroupIcon className="nav-group-icon" />}
                            <span className="nav-group-title">{group.label}</span>
                          </span>
                          {isOpen ? (
                            <HiOutlineChevronDown className="nav-group-chevron" />
                          ) : (
                            <HiOutlineChevronRight className="nav-group-chevron" />
                          )}
                        </button>
                        <div
                          id={groupId}
                          className={`nav-sublist-wrap ${isOpen ? 'open' : ''}`}
                        >
                          <ul className="nav-sublist">
                            {group.items.map(item => (
                              <MenuItem
                                key={item.to}
                                to={item.to}
                                label={item.label}
                                icon={item.icon}
                                active={isActive(item.to)}
                                onSelect={() => {
                                  navigate(item.to);
                                  if (isMobileViewport) setMenuAberto(false);
                                }}
                                collapsed={false}
                                subItem
                              />
                            ))}
                          </ul>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>

            <div className="flex flex-col gap-3">
              <button
                onClick={logout}
                className="nav-btn text-blue-300 hover:text-white"
                type="button"
              >
                <HiOutlineArrowRightOnRectangle className="nav-icon" />
                {!collapsed && 'Sair'}
              </button>
            </div>
          </div>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="sidebar-toggle-rail hidden md:inline-flex"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!collapsed}
            type="button"
          >
            <HiOutlineChevronLeft
              className={`sidebar-toggle-icon ${collapsed ? 'is-collapsed' : ''}`}
            />
          </button>
        </aside>

        {menuAberto && (
          <div
            className="fixed inset-0 bg-black/30 md:hidden z-30"
            onClick={() => setMenuAberto(false)}
            aria-hidden="true"
          />
        )}

        <main className="layout-main flex-1 min-w-0 bg-[var(--c-bg)] transition-colors duration-200">
          <div className="mx-auto w-full max-w-none px-3 sm:px-4 md:px-5 lg:px-6 xl:px-8 pb-6 md:pb-9">
            <div className="topbar-shell flex flex-wrap items-center justify-between gap-4 md:gap-6 mb-5 md:mb-7 w-full py-4 md:py-5 min-h-[76px]">
              <button
                onClick={() => setMenuAberto(true)}
                className="md:hidden inline-flex items-center justify-center h-11 w-11 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text)]"
                aria-label="Abrir menu"
                type="button"
              >
                <HiOutlineBars3 size={20} />
              </button>

              <div className="min-w-0 flex-1">
                <p className="brand-title truncate inline-flex items-center gap-2" style={{ fontSize: '1.1rem' }}>
                  <BsBuildingsFill size={16} />
                  <span>Fluxy</span>
                </p>
                <p className="text-xs text-[var(--c-muted)] truncate">
                  {user?.nome} · {perfilUpper || 'USUARIO'}
                </p>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={toggleTheme}
                  className="theme-toggle"
                  type="button"
                >
                  {theme === 'dark' ? (
                    <>
                      <HiOutlineSun size={18} /> <span className="hidden sm:inline">Claro</span>
                    </>
                  ) : (
                    <>
                      <HiOutlineMoon size={18} /> <span className="hidden sm:inline">Escuro</span>
                    </>
                  )}
                </button>
                <NotificacoesBell />
              </div>
            </div>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function isPathActive(currentPath, targetPath) {
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function MenuItem({ to, label, icon: Icon, active, onSelect, collapsed, subItem = false }) {
  return (
    <li>
      <Link
        to={to}
        onClick={() => onSelect()}
        className={`nav-btn ${subItem ? 'nav-btn-sub' : ''} ${active ? 'active' : ''}`}
        title={label}
        aria-label={label}
      >
        {Icon && <Icon className="nav-icon" />}
        {!collapsed && <span>{label}</span>}
      </Link>
    </li>
  );
}
