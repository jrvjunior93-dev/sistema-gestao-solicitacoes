import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import NotificacoesBell from '../components/NotificacoesBell';
import { getCaixaEntrada, getCaixaSaida } from '../services/conversasInternas';
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
import { isGeoSetor } from '../utils/setor';

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
  const [inboxNovasCount, setInboxNovasCount] = useState(0);
  const [saidaNovasCount, setSaidaNovasCount] = useState(0);

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

  useEffect(() => {
    const userId = Number(user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      setInboxNovasCount(0);
      setSaidaNovasCount(0);
      return undefined;
    }

    const storageKeyEntrada = `conversas_entrada_last_seen_${userId}`;
    const storageKeySaida = `conversas_saida_last_seen_${userId}`;
    let ativo = true;

    const atualizarBadge = async () => {
      try {
        const [listaEntrada, listaSaida] = await Promise.all([
          getCaixaEntrada({ arquivadas: false }),
          getCaixaSaida({ arquivadas: false })
        ]);
        if (!ativo) return;
        const seenEntradaValue = localStorage.getItem(storageKeyEntrada);
        const seenEntradaMs = seenEntradaValue ? new Date(seenEntradaValue).getTime() : 0;
        const seenSaidaValue = localStorage.getItem(storageKeySaida);
        const seenSaidaMs = seenSaidaValue ? new Date(seenSaidaValue).getTime() : 0;

        const totalEntrada = (Array.isArray(listaEntrada) ? listaEntrada : []).filter(item => {
          const updatedMs = new Date(item?.updatedAt || item?.createdAt).getTime();
          const autorId = Number(item?.ultima_mensagem?.autor?.id || 0);
          const autorEhOutroUsuario = !autorId || autorId !== userId;
          return updatedMs > seenEntradaMs && autorEhOutroUsuario;
        }).length;

        const totalSaida = (Array.isArray(listaSaida) ? listaSaida : []).filter(item => {
          const updatedMs = new Date(item?.updatedAt || item?.createdAt).getTime();
          const autorId = Number(item?.ultima_mensagem?.autor?.id || 0);
          const autorEhOutroUsuario = !autorId || autorId !== userId;
          return updatedMs > seenSaidaMs && autorEhOutroUsuario;
        }).length;

        setInboxNovasCount(totalEntrada);
        setSaidaNovasCount(totalSaida);
      } catch {
        // sem bloqueio visual em caso de falha temporaria
      }
    };

    const handleSeenEvent = () => {
      atualizarBadge();
    };

    window.addEventListener('conversas:entrada:seen', handleSeenEvent);
    window.addEventListener('conversas:saida:seen', handleSeenEvent);
    atualizarBadge();
    const interval = setInterval(atualizarBadge, 20000);

    return () => {
      ativo = false;
      window.removeEventListener('conversas:entrada:seen', handleSeenEvent);
      window.removeEventListener('conversas:saida:seen', handleSeenEvent);
      clearInterval(interval);
    };
  }, [user?.id]);

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
    user?.perfil === 'ADMIN' && setorTokens.some(isGeoSetor);
  const isSetorObra = setorTokens.includes('OBRA');

  const menuGroups = useMemo(() => {
    const groups = [];
    const item = (to, label, icon) => ({ to, label, icon });
    const normalizeMenuLabel = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
    const groupIcons = {
      Painel: HiOutlineSquares2X2,
      Solicitações: HiOutlineClipboardDocumentList,
      Comunicação: HiOutlineChatBubbleLeftRight,
      Compras: HiOutlineWallet,
      Financeiro: HiOutlineWallet,
      Cadastros: HiOutlineRectangleGroup,
      Contratos: HiOutlineBanknotes,
      Configurações: HiOutlineCog6Tooth,
      Biblioteca: HiOutlineFolderOpen,
      Conta: HiOutlineUserCircle
    };
    const addGroup = (label, entries) => {
      const items = entries.filter(Boolean);
      if (items.length) groups.push({ label, icon: groupIcons[label] || HiOutlineFolderOpen, items });
    };
    const hasModuloComprasAccess =
      ['SUPERADMIN', 'ADMIN'].includes(String(user?.perfil || '').toUpperCase()) ||
      Boolean(user?.pode_criar_solicitacao_compra);

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
        addGroup('Biblioteca', [
          item('/arquivos-modelos', 'Arquivos Modelos', HiOutlineFolderOpen)
        ]);
        if (hasModuloComprasAccess) {
          addGroup('Compras', [
            item('/solicitacoes-compra', 'Solicitações de Compra', HiOutlineClipboardDocumentList),
            item('/solicitacoes-compra/nova', 'Nova Solicitação de Compra', HiOutlinePlusCircle)
          ]);
        }
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
        addGroup('Biblioteca', [
          item('/arquivos-modelos', 'Arquivos Modelos', HiOutlineFolderOpen)
        ]);
        if (hasModuloComprasAccess) {
          addGroup('Compras', [
            item('/solicitacoes-compra', 'Solicitações de Compra', HiOutlineClipboardDocumentList),
            item('/solicitacoes-compra/nova', 'Nova Solicitação de Compra', HiOutlinePlusCircle)
          ]);
        }
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
        addGroup('Biblioteca', [
          item('/arquivos-modelos', 'Arquivos Modelos', HiOutlineFolderOpen)
        ]);
        if (hasModuloComprasAccess) {
          addGroup('Compras', [
            item('/solicitacoes-compra', 'Solicitações de Compra', HiOutlineClipboardDocumentList),
            item('/solicitacoes-compra/nova', 'Nova Solicitação de Compra', HiOutlinePlusCircle)
          ]);
        }
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
        addGroup('Biblioteca', [
          item('/arquivos-modelos', 'Arquivos Modelos', HiOutlineFolderOpen)
        ]);
        if (hasModuloComprasAccess) {
          addGroup('Compras', [
            item('/solicitacoes-compra', 'Solicitações de Compra', HiOutlineClipboardDocumentList),
            item('/solicitacoes-compra/nova', 'Nova Solicitação de Compra', HiOutlinePlusCircle)
          ]);
        }
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
        addGroup('Biblioteca', [
          item('/arquivos-modelos', 'Arquivos Modelos', HiOutlineFolderOpen)
        ]);
        if (hasModuloComprasAccess) {
          addGroup('Compras', [
            item('/solicitacoes-compra', 'Solicitações de Compra', HiOutlineClipboardDocumentList),
            item('/solicitacoes-compra/nova', 'Nova Solicitação de Compra', HiOutlinePlusCircle)
          ]);
        }
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
        addGroup('Biblioteca', [
          item('/arquivos-modelos', 'Arquivos Modelos', HiOutlineFolderOpen)
        ]);
        addGroup('Compras', [
          item('/solicitacoes-compra', 'Solicitações de Compra', HiOutlineClipboardDocumentList),
          item('/solicitacoes-compra/nova', 'Nova Solicitação de Compra', HiOutlinePlusCircle),
          item('/gestao-apropriacoes', 'Gestão de Apropriações', HiOutlineAdjustmentsHorizontal),
          item('/gestao-insumos', 'Gestão de Insumos', HiOutlineRectangleGroup),
          item('/gestao-unidades', 'Gestão de Unidades', HiOutlineBuildingOffice2),
          item('/gestao-categorias', 'Gestão de Categorias', HiOutlineFolderOpen)
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

    if (hasModuloComprasAccess) {
      const grupoSolicitacoes = groups.find(
        (group) => normalizeMenuLabel(group.label) === 'SOLICITACOES'
      );

      if (
        grupoSolicitacoes &&
        !grupoSolicitacoes.items.some((entry) => entry.to === '/solicitacoes-compra/nova')
      ) {
        grupoSolicitacoes.items.push(
          item('/solicitacoes-compra/nova', 'Nova Solicitação de Compra', HiOutlineWallet)
        );
      }

      const indiceCompras = groups.findIndex(
        (group) => normalizeMenuLabel(group.label) === 'COMPRAS'
      );

      if (indiceCompras >= 0) {
        groups[indiceCompras].items = groups[indiceCompras].items.filter(
          (entry) =>
            entry.to !== '/solicitacoes-compra' &&
            entry.to !== '/solicitacoes-compra/nova'
        );

        if (!groups[indiceCompras].items.length) {
          groups.splice(indiceCompras, 1);
        }
      }
    }

    return groups;
  }, [user?.perfil, user?.pode_criar_solicitacao_compra, isFinanceiro, isAdminGEO, isSetorObra]);

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
                              inboxNovasCount={inboxNovasCount}
                              saidaNovasCount={saidaNovasCount}
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
                            {group.label === 'Comunicação' && (inboxNovasCount + saidaNovasCount) > 0 && (
                              <span className="inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-semibold bg-red-600 text-white">
                                {(inboxNovasCount + saidaNovasCount) > 99 ? '99+' : (inboxNovasCount + saidaNovasCount)}
                              </span>
                            )}
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
                                inboxNovasCount={inboxNovasCount}
                                saidaNovasCount={saidaNovasCount}
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

function MenuItem({ to, label, icon: Icon, active, onSelect, collapsed, subItem = false, inboxNovasCount = 0, saidaNovasCount = 0 }) {
  const mostrarBadgeInbox = to === '/conversas/entrada';
  const mostrarBadgeSaida = to === '/conversas/saida';
  const inboxCount = Number(inboxNovasCount || 0);
  const saidaCount = Number(saidaNovasCount || 0);
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
        {!collapsed && mostrarBadgeInbox && inboxCount > 0 && (
          <span className="ml-auto inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-semibold bg-red-600 text-white">
            {inboxCount > 99 ? '99+' : inboxCount}
          </span>
        )}
        {!collapsed && mostrarBadgeSaida && saidaCount > 0 && (
          <span className="ml-auto inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-semibold bg-red-600 text-white">
            {saidaCount > 99 ? '99+' : saidaCount}
          </span>
        )}
      </Link>
    </li>
  );
}
