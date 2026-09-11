import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import AppRouteFallback from '../components/AppRouteFallback';
import NotificacoesBell from '../components/NotificacoesBell';
import { getResumoConversas } from '../services/conversasInternas';
import { getInstalacaoPublica } from '../services/instalacao';
import { getSuporteWhatsapp } from '../services/configuracoesSistema';
import {
  HiOutlineHome,
  HiOutlineMagnifyingGlass,
  HiOutlineMoon,
  HiOutlineSun,
  HiOutlineChevronRight,
  HiOutlineArrowRightOnRectangle,
  HiOutlineLifebuoy,
  HiOutlineChatBubbleOvalLeft
} from 'react-icons/hi2';
import { isSuperadmin } from '../utils/acessoProduto';
import { findActiveNode, getVisibleModule, resolveLabel } from '../navigation/navigationConfig';
import CommandPalette from '../navigation/CommandPalette';
import WorkspaceTabs from '../navigation/WorkspaceTabs';
import useWorkspaceTabs, { routeFromInternalAnchor } from '../navigation/useWorkspaceTabs';
import { AtalhosProvider } from '../navigation/AtalhosContext';
import AtalhosTopbar from '../navigation/AtalhosTopbar';
import { isNativeApp, registerNativeBackButtonHandler } from '../mobile/runtime';
import { getFallbackRoute, hasSafeBrowserHistory } from '../utils/navigation';
import { nomeProprio } from '../utils/texto';
import OperationalAuditTracker from '../modules/governanca/components/OperationalAuditTracker';
import cscLogo from '../assets/CSC_logo_lockup_cropped.png';
import fluxyMark from '../assets/fluxy_mark_cropped.png';

const COMPRAS_RESPONSIVE_ROUTES = [
  '/solicitacoes-compra',
  '/solicitacoes-compra-direta',
  '/pedidos-compra',
  '/compras/delegacao',
  '/compras/relatorios',
  '/gestao-apropriacoes',
  '/gestao-insumos',
  '/gestao-unidades',
  '/gestao-categorias',
  '/gestao-fornecedores',
  '/cotacoes',
  '/configuracoes-cotacao',
  '/configuracoes-status-pedidos-compra'
];

function isComprasResponsiveRoute(pathname = '') {
  return COMPRAS_RESPONSIVE_ROUTES.some((route) => (
    pathname === route || pathname.startsWith(`${route}/`)
  ));
}

// Breadcrumb clicável: Início › Módulo › Tela. Lê a mesma fonte única
// de navegação dos hubs e permite voltar a qualquer nível em um clique.
/*
  `busca` chega por PROP, não pelo `location` global.

  Ao ligar o breadcrumb à query (destino com `?tipo=`, D2) a primeira
  versão escreveu `location.search` aqui dentro — e `location` NÃO existe
  neste escopo: é outro componente que chama `useLocation()`. A expressão
  cairia no `window.location` do navegador e funcionaria POR ACIDENTE,
  fora do ciclo de renderização do router: nenhuma re-renderização ao
  mudar de rota, e nada em teste ou fixture, onde esse global não reflete
  a rota do router.
*/
function Breadcrumb({ user, pathname, busca = '', classe = '' }) {
  const hubMatch = pathname.match(/^\/hub\/([^/]+)/);
  const hubModule = hubMatch ? getVisibleModule(user, hubMatch[1]) : null;
  const active = !hubMatch && pathname !== '/' ? findActiveNode(user, pathname, busca) : null;

  return (
    <nav className={`fx-breadcrumb${classe ? ` ${classe}` : ''}`} aria-label="Trilha de navegação">
      {pathname === '/' ? (
        <span className="fx-breadcrumb-current" aria-current="page">Início</span>
      ) : (
        <Link to="/">Início</Link>
      )}

      {hubModule && (
        <>
          <HiOutlineChevronRight size={13} className="fx-breadcrumb-sep" aria-hidden="true" />
          <span className="fx-breadcrumb-current" aria-current="page">
            {resolveLabel(hubModule, user)}
          </span>
        </>
      )}

      {active && (
        <>
          <HiOutlineChevronRight size={13} className="fx-breadcrumb-sep" aria-hidden="true" />
          {active.module.children.length > 1 ? (
            <Link to={`/hub/${active.module.id}`}>{resolveLabel(active.module, user)}</Link>
          ) : (
            <span className="fx-breadcrumb-current">{resolveLabel(active.module, user)}</span>
          )}
          {resolveLabel(active.item, user) !== resolveLabel(active.module, user) && (
            <>
              <HiOutlineChevronRight size={13} className="fx-breadcrumb-sep" aria-hidden="true" />
              <span className="fx-breadcrumb-current" aria-current="page">
                {resolveLabel(active.item, user)}
              </span>
            </>
          )}
        </>
      )}
    </nav>
  );
}

export default function Layout() {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [buscaModo, setBuscaModo] = useState('navigate');
  const [comunicacaoNovasCount, setComunicacaoNovasCount] = useState(0);
  const [instalacao, setInstalacao] = useState({
    product_name: 'Fluxy',
    company_name: '',
    logo_url: ''
  });
  const [suporteWhatsappUrl, setSuporteWhatsappUrl] = useState(null);
  const nativeApp = isNativeApp();
  const superadmin = isSuperadmin(user);
  const comprasResponsiveRoute = isComprasResponsiveRoute(location.pathname);
  const custosRecebiveisResponsiveRoute = location.pathname.startsWith('/custos-recebiveis');
  const {
    tabs: workspaceTabs,
    activeId: activeWorkspaceTabId,
    canOpen: canOpenWorkspaceTab,
    activateTab: activateWorkspaceTab,
    openTab: openWorkspaceTab,
    closeTab: closeWorkspaceTab
  } = useWorkspaceTabs(user);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  // Atalho global Ctrl+K / Cmd+K para a busca de telas.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault();
        setBuscaModo('navigate');
        setBuscaAberta((atual) => !atual);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return registerNativeBackButtonHandler({
      canCloseMenu: () => buscaAberta,
      onCloseMenu: () => setBuscaAberta(false),
      canNavigateBack: () => location.pathname !== '/',
      onNavigateBack: () => {
        if (hasSafeBrowserHistory()) {
          navigate(-1);
          return;
        }
        navigate(getFallbackRoute(location.pathname), { replace: true });
      }
    });
  }, [location.pathname, buscaAberta, navigate]);

  useEffect(() => {
    const userId = Number(user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      setComunicacaoNovasCount(0);
      return undefined;
    }

    let ativo = true;

    const atualizarBadge = async () => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      try {
        const resumo = await getResumoConversas();
        if (!ativo) return;
        setComunicacaoNovasCount(Number(resumo?.nao_lidas || 0));
      } catch {
        // nao bloqueia a navegacao
      }
    };

    atualizarBadge();
    const interval = setInterval(atualizarBadge, 60000);

    return () => {
      ativo = false;
      clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    let ativo = true;

    getInstalacaoPublica()
      .then((data) => {
        if (!ativo || !data) return;
        setInstalacao((current) => ({ ...current, ...data }));
      })
      .catch(() => {});

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    let ativo = true;

    getSuporteWhatsapp()
      .then((data) => {
        if (!ativo) return;
        setSuporteWhatsappUrl(data?.url || null);
      })
      .catch(() => {
        if (ativo) setSuporteWhatsappUrl(null);
      });

    return () => {
      ativo = false;
    };
  }, []);

  const brandLabel = instalacao.product_name || 'Fluxy';
  const toggleTheme = () => setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  const fecharBusca = useCallback(() => setBuscaAberta(false), []);
  const abrirBuscaAtual = useCallback(() => {
    setBuscaModo('navigate');
    setBuscaAberta(true);
  }, []);
  const abrirBuscaNovaAba = useCallback(() => {
    if (!canOpenWorkspaceTab) return;
    setBuscaModo('new-tab');
    setBuscaAberta(true);
  }, [canOpenWorkspaceTab]);
  const navegarDaBusca = useCallback((link, { title = '' } = {}) => {
    if (buscaModo === 'new-tab') {
      openWorkspaceTab(link, title);
      return;
    }
    navigate(link);
  }, [buscaModo, navigate, openWorkspaceTab]);

  // Ctrl/Cmd+clique, clique do meio e links internos com target="_blank"
  // abrem uma aba do Fluxy. Downloads e destinos externos preservam o
  // comportamento nativo do navegador.
  const abrirLinkEmAbaInterna = useCallback((event) => {
    if (event.defaultPrevented || event.shiftKey || event.altKey) return;

    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;

    const cliqueModificado = event.ctrlKey || event.metaKey;
    const cliqueDoMeio = event.type === 'auxclick' && event.button === 1;
    const novaAbaDeclarada = anchor.getAttribute('target') === '_blank';
    if (!cliqueModificado && !cliqueDoMeio && !novaAbaDeclarada) return;

    const route = routeFromInternalAnchor(anchor);
    if (!route) return;

    const title = anchor.dataset.workspaceTitle || anchor.textContent || '';
    if (!openWorkspaceTab(route, title)) return;

    event.preventDefault();
    event.stopPropagation();
  }, [openWorkspaceTab]);

  const perfilUpper = String(user?.perfil || '').toUpperCase();
  const tituloDocumento = useMemo(() => {
    const ativo = findActiveNode(user, location.pathname, location.search);
    return ativo ? `${resolveLabel(ativo.item, user)} · ${brandLabel}` : brandLabel;
  }, [user, location.pathname, brandLabel]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = tituloDocumento;
    }
  }, [tituloDocumento]);

  return (
    <AtalhosProvider>
    <div className={theme === 'dark' ? 'dark' : ''}>
      {/* overflow-x-CLIP, não hidden: hidden acopla overflow-y:auto e o shell
          vira um scrollport que nunca rola — a topbar e o cabeçalho fixo
          (R13) "grudavam" nele em vez de grudar na janela (defeito 02/09). */}
      <div
        className={`layout-shell fluxy-app-shell flex min-h-screen overflow-x-clip ${nativeApp ? 'layout-shell-native' : ''} ${custosRecebiveisResponsiveRoute ? 'custos-recebiveis-layout-scope' : ''}`}
        onClickCapture={abrirLinkEmAbaInterna}
        onAuxClickCapture={abrirLinkEmAbaInterna}
      >
        <OperationalAuditTracker />
        <div className="layout-shell-backdrop" aria-hidden="true" />

        <main className={`layout-main flex-1 min-w-0 transition-colors duration-200 ${nativeApp ? 'layout-main-native' : ''}`}>
          <div className={`layout-content-shell ${comprasResponsiveRoute ? 'compras-responsive-scope' : ''}`}>
            <header className={`fx-topbar ${nativeApp ? 'topbar-shell-native' : ''}`}>
              <div className="fx-topbar-nav">
                {/* Marca no canto superior esquerdo — âncora visual do
                    sistema. Discreta, sem sombras (D9); clique = Início.
                    No mobile fica só o símbolo do Fluxy. */}
                <Link to="/" className="fx-brand" aria-label="CSC · Fluxy — ir para o início">
                  <img src={cscLogo} alt="CSC" width={53} height={26} className="fx-brand-csc" />
                  <img src={fluxyMark} alt="" aria-hidden="true" width={22} height={22} className="fx-brand-fluxy" />
                  <span className="fx-brand-nome">Fluxy</span>
                </Link>
                <span className="fx-brand-divisor" aria-hidden="true" />

                <Link to="/" className="fx-home-btn" aria-label="Ir para o início">
                  <HiOutlineHome size={17} aria-hidden="true" />
                  <span className="hidden sm:inline">Início</span>
                </Link>

                <button
                  type="button"
                  className="fx-search-btn"
                  onClick={abrirBuscaAtual}
                  aria-label="Buscar tela (Ctrl+K)"
                  aria-haspopup="dialog"
                >
                  <HiOutlineMagnifyingGlass size={16} aria-hidden="true" />
                  <span className="hidden md:inline">Buscar</span>
                  <kbd className="fx-search-kbd hidden md:inline">Ctrl K</kbd>
                </button>

                <Breadcrumb
                  user={user}
                  pathname={location.pathname}
                  busca={location.search}
                  classe="fx-breadcrumb--dentro"
                />

                {/* Estrela de fixar a tela atual + fileira de atalhos
                    (ícones na cor do módulo, excedente no painel »). */}
                <AtalhosTopbar />
              </div>

              {/*
                A MESMA TRILHA, NA FILEIRA DE BAIXO — e só uma das duas
                existe de cada vez (`display: none` na outra, por largura;
                o que está oculto não entra na árvore de acessibilidade).

                POR QUE DUAS E NÃO UMA QUE SE MOVE: elas moram em CAIXAS
                DIFERENTES. Abaixo de 1024px a trilha precisa da fileira
                inteira, e a única caixa que sabe abrir fileira nova é a
                própria barra (`.fx-topbar`, `flex-wrap: wrap`) — não a
                navegação, que é uma fileira só. CSS não muda um nó de
                caixa; ou ele nasce nas duas, ou a navegação passaria a
                quebrar por dentro, e isso apaga a mordida da prova da
                barra (medido: com `flex-wrap` na navegação, a folha de
                antes de 06/09 deixa de reprovar em 3 das 4 larguras).

                A ORDEM DO DOM É A ORDEM DA TELA nas duas larguras — nada
                de `order`, que inverteria o foco do teclado em relação ao
                que se vê. Aqui a trilha fica entre a navegação e a
                bandeja, que é onde ela é desenhada.
              */}
              <Breadcrumb
                user={user}
                pathname={location.pathname}
                busca={location.search}
                classe="fx-breadcrumb--fileira"
              />

              <div className="fx-topbar-tray">
                <button
                  onClick={toggleTheme}
                  className="theme-toggle"
                  type="button"
                  aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
                >
                  {theme === 'dark' ? (
                    <HiOutlineSun size={18} aria-hidden="true" />
                  ) : (
                    <HiOutlineMoon size={18} aria-hidden="true" />
                  )}
                </button>

                <button
                  className="theme-toggle topbar-support-btn"
                  type="button"
                  aria-label="Suporte"
                  title={suporteWhatsappUrl ? 'Abrir suporte no WhatsApp' : 'WhatsApp de suporte nao configurado'}
                  onClick={() => {
                    if (suporteWhatsappUrl) {
                      window.open(suporteWhatsappUrl, '_blank', 'noopener,noreferrer');
                    } else if (superadmin) {
                      navigate('/configuracoes-suporte');
                    }
                  }}
                >
                  <HiOutlineLifebuoy size={18} aria-hidden="true" />
                </button>

                <Link
                  to="/comunicacao-interna"
                  className="theme-toggle topbar-chat-btn"
                  aria-label="Chat interno"
                  title="Chat interno"
                  style={{ position: 'relative' }}
                >
                  <HiOutlineChatBubbleOvalLeft size={18} aria-hidden="true" />
                  {comunicacaoNovasCount > 0 && (
                    <span className="notification-trigger-badge">
                      {comunicacaoNovasCount > 99 ? '99+' : comunicacaoNovasCount}
                    </span>
                  )}
                </Link>

                <NotificacoesBell />

                <Link
                  to="/perfil"
                  className="theme-toggle"
                  aria-label={`Meu perfil — ${nomeProprio(user?.nome) || 'usuário'} (${perfilUpper || 'USUARIO'})`}
                  title={`${nomeProprio(user?.nome) || 'Usuário'} · ${perfilUpper || 'USUARIO'}`}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: 'var(--ui-surface-soft)',
                      // R30 (05/09): era 11px — abaixo do piso de 12. O círculo
                      // tem 22px e a letra é uma só, então o degrau de apoio cabe
                      // sem apertar. Escapou da varredura de CSS porque está
                      // escrito no JSX; o check foi estendido para alcançar isto.
                      fontSize: 'var(--fonte-detalhe)',
                      fontWeight: 700
                    }}
                  >
                    {String(user?.nome || 'U').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden lg:inline">{nomeProprio(String(user?.nome || '').split(' ')[0])}</span>
                </Link>

                <button
                  onClick={logout}
                  className="theme-toggle"
                  type="button"
                  aria-label="Sair do sistema"
                  title="Sair"
                >
                  <HiOutlineArrowRightOnRectangle size={18} aria-hidden="true" />
                  <span className="hidden lg:inline">Sair</span>
                </button>
              </div>

              <WorkspaceTabs
                tabs={workspaceTabs}
                activeId={activeWorkspaceTabId}
                canOpen={canOpenWorkspaceTab}
                onActivate={activateWorkspaceTab}
                onClose={closeWorkspaceTab}
                onNewTab={abrirBuscaNovaAba}
              />
            </header>

            <Suspense fallback={<AppRouteFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>

        <CommandPalette
          open={buscaAberta}
          onClose={fecharBusca}
          mode={buscaModo}
          onNavigate={navegarDaBusca}
        />
      </div>
    </div>
    </AtalhosProvider>
  );
}
