// =====================================================================
// FONTE ÚNICA DE NAVEGAÇÃO
// ---------------------------------------------------------------------
// Toda a navegação do sistema (hub principal, hubs de módulo, breadcrumb
// e busca global Ctrl+K) lê desta árvore. NUNCA duplique esta lista em
// outro lugar: para adicionar uma tela nova, inclua o nó aqui e a rota
// correspondente no App.jsx (ver docs/DESIGN-SYSTEM.md).
//
// Cada nó tem:
//   id     - identificador estável (usado na rota /hub/:moduleId)
//   label  - rótulo exibido (ou getLabel(user) quando varia por perfil)
//   desc   - uma linha do que se faz na tela/módulo
//   icon   - componente react-icons/hi2 (associação literal com a função)
//   to     - rota de destino (apenas folhas)
//   can    - predicado de permissão; reutiliza as MESMAS funções de
//            utils/acessoProduto.js usadas pelas rotas do App.jsx.
//            Módulo sem nenhum filho visível não aparece no hub.
//   ordem  - posição do card no hub (10, 20, 30…). Critério: tela
//            principal do módulo primeiro, ação de criação em seguida,
//            depois operação diária, consultas/relatórios e por último
//            o raro/arquivo/configuração. A ordem dos cards vem SÓ
//            daqui — nunca da antiga sidebar.
//   secaoConfig / ordemConfig
//          - quando o destino também é uma porta do HUB DE CONFIGURAÇÕES
//            (/configuracoes), declara AQUI em que seção dele o card
//            aparece (id de SECOES_CONFIGURACOES) e em que posição.
//            O hub não tem lista própria: ele lê estes dois campos.
//            Destino sem `secaoConfig` simplesmente não aparece lá.
//   fixavel- todo destino com rota é fixável como atalho (estrela no
//            topo da tela). Marque `fixavel: 'acao'` quando o destino
//            abre PRONTO PARA USO (formulários "Novo/Nova", upload):
//            esses aparecem com selo de ação no painel de atalhos.
//            `fixavel: false` desabilita a estrela para o destino.
// =====================================================================
import {
  HiOutlineSquares2X2,
  HiOutlinePlusCircle,
  HiOutlineClipboardDocumentList,
  HiOutlineClipboardDocumentCheck,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCloudArrowUp,
  HiOutlineReceiptRefund,
  HiOutlineReceiptPercent,
  HiOutlineUsers,
  HiOutlineUserGroup,
  HiOutlineUserCircle,
  HiOutlineUserPlus,
  HiOutlineWallet,
  HiOutlineBuildingOffice2,
  HiOutlineBuildingStorefront,
  HiOutlineBuildingLibrary,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineCog6Tooth,
  HiOutlineBanknotes,
  HiOutlineFolderOpen,
  HiOutlineArchiveBox,
  HiOutlineDocumentText,
  HiOutlineDocumentCheck,
  HiOutlineExclamationTriangle,
  HiOutlineShieldCheck,
  HiOutlineInboxStack,
  HiOutlinePaperAirplane,
  HiOutlineSparkles,
  HiOutlineKey,
  HiOutlineCreditCard,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineBell,
  HiOutlineAcademicCap,
  HiOutlineBookOpen,
  HiOutlineShoppingCart,
  HiOutlineScale,
  HiOutlineTruck,
  HiOutlineChartBar,
  HiOutlineCalendarDays,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowDownCircle,
  HiOutlineArrowUpCircle,
  HiOutlineIdentification,
  HiOutlineMapPin,
  HiOutlineTableCells,
  HiOutlineStar,
  HiOutlinePresentationChartLine,
  HiOutlineRectangleGroup
} from 'react-icons/hi2';
import {
  canAccessBiblioteca,
  canAccessBoletos,
  canAccessComercial,
  canAccessCadastroObras,
  canAccessComunicacao,
  canAccessConfiguracoes,
  canAccessCompras,
  canAccessDashboard,
  canAccessContratos,
  canAccessFinanceiro,
  canAccessFinanceiroDda,
  canAccessBancosEnterprise,
  canAccessFiscal,
  canAccessPagamentos,
  canAccessProvisoes,
  canAccessPrioridadesDiretoria,
  canAccessRhDp,
  canAccessRhDpDashboard,
  canAccessSst,
  canAccessTreinamento,
  canCreateProvisionamentos,
  canExecuteRhDpImportacoes,
  canManageProvisionamentoCategorias,
  canManageSstArea,
  canViewProvisionamentos,
  canViewProvisionamentosDashboard,
  canViewFinanceiroRelatorios,
  hasPermissao,
  canViewRhDpColaboradores,
  canAccessRhDpCadastroColaboradores,
  canViewRhDpDocumentos,
  canViewRhDpObrigacoes,
  canViewSolicitacoesRelatorios,
  canViewSstArea,
  canViewSstDashboard,
  canAccessCrm,
  canCreateCrmLeads,
  canManageFiscalConfig,
  canManageUsers,
  canViewCrmAtendimento,
  canViewCrmAutomacoes,
  canViewCrmConfiguracoes,
  canViewCrmDashboard,
  canViewCrmLeads,
  canViewFiscalDocuments,
  canViewFiscalLogs,
  canViewSystemGovernance,
  canViewOperationalAudit,
  canCreateCompraSolicitacao,
  canManageComprasConfiguracoes,
  canManageConfiguracoesArea,
  canViewCompraSolicitacoes,
  canViewComprasCotacoes,
  canViewComprasDelegacao,
  canViewComprasFornecedores,
  canViewComprasPedidos,
  canViewComprasRelatorios,
  canViewComercialContratos,
  canViewComercialEmpreendimentos,
  hasEnabledModule,
  isBusinessAdmin,
  isSuperadmin
} from '../utils/acessoProduto';
import {
  SST_NAV,
  SST_SIMPLIFIED_MODE
} from '../modules/sst/constants/sstResources';
import { canAccessCustosRecebiveis } from '../modules/custosRecebiveis/utils/access';

const SEMPRE = () => true;

const perfilDe = (user) => String(user?.perfil || '').trim().toUpperCase();

const SST_ICONS = {
  pgr: HiOutlineExclamationTriangle,
  pcmso: HiOutlineClipboardDocumentCheck,
  aso: HiOutlineClipboardDocumentCheck,
  exames: HiOutlineDocumentText,
  epi: HiOutlineShieldCheck,
  treinamentos: HiOutlineAcademicCap,
  documentos: HiOutlineFolderOpen,
  ltcat: HiOutlineBuildingOffice2,
  avaliacoes_quantitativas: HiOutlineAdjustmentsHorizontal
};

const SST_DESCS = {
  pgr: 'Programa de gerenciamento de riscos por empresa e obra.',
  pcmso: 'Controle médico de saúde ocupacional.',
  aso: 'Atestados de saúde ocupacional dos colaboradores.',
  exames: 'Exames ocupacionais e periodicidades.',
  epi: 'Entrega e controle de equipamentos de proteção.',
  treinamentos: 'Treinamentos obrigatórios de segurança.',
  documentos: 'Documentos de SST por empresa e obra.',
  ltcat: 'Laudo técnico das condições do ambiente de trabalho.',
  avaliacoes_quantitativas: 'Medições quantitativas de agentes.'
};

function sstChildrenSimplified() {
  return SST_NAV.map(([resource, label], idx) => ({
      id: `sst-${resource}`,
      ordem: (idx + 1) * 10,
      label,
      desc: SST_DESCS[resource] || `Gestão de ${label.toLowerCase()} em SST.`,
      icon: SST_ICONS[resource] || HiOutlineShieldCheck,
      to: `/sst/${resource}`,
      can: (user) => canViewSstArea(user, resource)
  }));
}

function sstChildrenFull() {
  const view = (resource) => (user) => canViewSstArea(user, resource);
  const manage = (resource) => (user) => canManageSstArea(user, resource);
  const dash = (user) => canViewSstDashboard(user);
  return [
    { id: 'sst-dashboard', ordem: 10, label: 'Dashboard SST', desc: 'Visão geral dos indicadores de segurança.', icon: HiOutlineSquares2X2, to: '/sst', can: dash },
    { id: 'sst-centro-operacional', ordem: 150, label: 'Centro Operacional SST', desc: 'Acompanhamento operacional consolidado.', icon: HiOutlineSquares2X2, to: '/sst/relatorios/centro-operacional', can: dash },
    { id: 'sst-executivo', ordem: 160, label: 'Executivo SST', desc: 'Relatório executivo de segurança do trabalho.', icon: HiOutlineSparkles, to: '/sst/relatorios/executivo', can: dash },
    { id: 'sst-heatmap', ordem: 170, label: 'Heatmap SST', desc: 'Mapa de calor de riscos e ocorrências.', icon: HiOutlineTableCells, to: '/sst/relatorios/heatmap', can: dash },
    { id: 'sst-observabilidade', ordem: 220, label: 'Observabilidade SST', desc: 'Monitoramento dos eventos do módulo.', icon: HiOutlineClipboardDocumentList, to: '/sst/observabilidade', can: dash },
    { id: 'sst-producao', ordem: 230, label: 'Produção SST', desc: 'Monitoramento de produção do módulo.', icon: HiOutlineAdjustmentsHorizontal, to: '/sst/producao', can: dash },
    { id: 'sst-enterprise', ordem: 240, label: 'SST Enterprise', desc: 'Observabilidade avançada do módulo.', icon: HiOutlineAdjustmentsHorizontal, to: '/sst/observabilidade-avancada', can: dash },
    { id: 'sst-timeline', ordem: 180, label: 'Timeline SST', desc: 'Linha do tempo de eventos de segurança.', icon: HiOutlineClipboardDocumentList, to: '/sst/timeline', can: dash },
    { id: 'sst-relatorios', ordem: 190, label: 'Relatórios SST', desc: 'Central de relatórios de segurança.', icon: HiOutlineChartBar, to: '/sst/relatorios', can: dash },
    { id: 'sst-riscos', ordem: 20, label: 'Riscos', desc: 'Riscos ocupacionais por empresa, obra e função.', icon: HiOutlineExclamationTriangle, to: '/sst/riscos', can: view('riscos') },
    { id: 'sst-ambientes', ordem: 30, label: 'Ambientes', desc: 'Ambientes de trabalho e locais operacionais.', icon: HiOutlineBuildingOffice2, to: '/sst/ambientes', can: view('riscos') },
    { id: 'sst-exposicoes', ordem: 40, label: 'Exposições', desc: 'Exposições de colaboradores a riscos.', icon: HiOutlineAdjustmentsHorizontal, to: '/sst/exposicoes', can: view('riscos') },
    { id: 'sst-aso', ordem: 50, label: 'ASO', desc: SST_DESCS.aso, icon: HiOutlineClipboardDocumentCheck, to: '/sst/aso', can: view('aso') },
    { id: 'sst-exames', ordem: 60, label: 'Exames', desc: SST_DESCS.exames, icon: HiOutlineDocumentText, to: '/sst/exames', can: view('exames') },
    { id: 'sst-epi', ordem: 70, label: 'EPI', desc: SST_DESCS.epi, icon: HiOutlineShieldCheck, to: '/sst/epi', can: view('epi') },
    { id: 'sst-treinamentos', ordem: 80, label: 'Treinamentos', desc: SST_DESCS.treinamentos, icon: HiOutlineAcademicCap, to: '/sst/treinamentos', can: view('treinamentos') },
    { id: 'sst-acidentes', ordem: 90, label: 'Acidentes', desc: 'Registro e acompanhamento de acidentes.', icon: HiOutlineExclamationTriangle, to: '/sst/acidentes', can: view('acidentes') },
    { id: 'sst-documentos', ordem: 100, label: 'Documentos', desc: SST_DESCS.documentos, icon: HiOutlineFolderOpen, to: '/sst/documentos', can: view('documentos') },
    { id: 'sst-esocial', ordem: 110, label: 'eSocial', desc: 'Eventos de SST para o eSocial.', icon: HiOutlineAdjustmentsHorizontal, to: '/sst/esocial', can: view('esocial') },
    { id: 'sst-eventos', ordem: 250, label: 'Eventos', desc: 'Eventos operacionais do módulo.', icon: HiOutlineClipboardDocumentList, to: '/sst/eventos', can: view('analytics') },
    { id: 'sst-pendencias', ordem: 120, label: 'Pendências SST', desc: 'Pendências abertas de segurança.', icon: HiOutlineInboxStack, to: '/sst/pendencias', can: view('analytics') },
    { id: 'sst-bloqueios', ordem: 130, label: 'Bloqueios SST', desc: 'Bloqueios ativos por regra de segurança.', icon: HiOutlineKey, to: '/sst/bloqueios', can: view('analytics') },
    { id: 'sst-notificacoes', ordem: 260, label: 'Notificações SST', desc: 'Notificações emitidas pelo módulo.', icon: HiOutlineChatBubbleOvalLeft, to: '/sst/notificacoes', can: view('analytics') },
    { id: 'sst-scores', ordem: 200, label: 'Scores SST', desc: 'Scores de conformidade por empresa e obra.', icon: HiOutlineRectangleGroup, to: '/sst/scores', can: view('analytics') },
    { id: 'sst-recomendacoes', ordem: 210, label: 'Recomendações SST', desc: 'Recomendações geradas pelas análises.', icon: HiOutlineSparkles, to: '/sst/recomendacoes', can: view('analytics') },
    { id: 'sst-telemetria', ordem: 270, label: 'Telemetria SST', desc: 'Telemetria técnica do módulo.', icon: HiOutlineAdjustmentsHorizontal, to: '/sst/telemetria', can: view('analytics') },
    { id: 'sst-alertas', ordem: 140, label: 'Alertas SST', desc: 'Alertas operacionais de segurança.', icon: HiOutlineExclamationTriangle, to: '/sst/alertas_operacionais', can: view('analytics') },
    { id: 'sst-workflow-execucoes', ordem: 280, label: 'Execuções Workflow', desc: 'Execuções dos workflows de SST.', icon: HiOutlineClipboardDocumentList, to: '/sst/workflow_execucoes', can: view('analytics') },
    { id: 'sst-politicas-bloqueio', ordem: 290, label: 'Políticas de bloqueio', desc: 'Regras que bloqueiam operações por SST.', icon: HiOutlineCog6Tooth, to: '/sst/politicas_bloqueio', can: manage('configuracoes') },
    { id: 'sst-workflows', ordem: 300, label: 'Workflows SST', desc: 'Workflows automáticos de segurança.', icon: HiOutlineAdjustmentsHorizontal, to: '/sst/workflows', can: manage('configuracoes') },
    { id: 'sst-workflow-acoes', ordem: 310, label: 'Ações Workflow', desc: 'Ações executadas pelos workflows.', icon: HiOutlineAdjustmentsHorizontal, to: '/sst/workflow_acoes', can: manage('configuracoes') },
    { id: 'sst-rollout', ordem: 320, label: 'Rollout SST', desc: 'Planos de rollout do módulo.', icon: HiOutlineAdjustmentsHorizontal, to: '/sst/rollout_planos', can: manage('configuracoes') },
    { id: 'sst-hardening', ordem: 330, label: 'Hardening SST', desc: 'Políticas de hardening do módulo.', icon: HiOutlineCog6Tooth, to: '/sst/hardening_policies', can: manage('configuracoes') },
    { id: 'sst-criticidades', ordem: 340, label: 'Criticidades SST', desc: 'Níveis de criticidade configurados.', icon: HiOutlineAdjustmentsHorizontal, to: '/sst/criticidades', can: manage('configuracoes') },
    { id: 'sst-configuracoes', ordem: 350, label: 'Configurações', desc: 'Configurações gerais do módulo SST.', icon: HiOutlineCog6Tooth, to: '/sst/configuracoes', can: manage('configuracoes') }
  ];
}

/*
  SEÇÕES DO HUB DE CONFIGURAÇÕES (05/09)
  ---------------------------------------------------------------------
  O agrupamento do /configuracoes mora AQUI, e não na tela. Até 05/09 o
  `Configuracoes.jsx` carregava as oito seções e os 45 destinos escritos à
  mão, e por isso: reavaliava permissão com regra PRÓPRIA (que já divergia
  da rota em quatro destinos), envelhecia sozinho quando um rótulo mudava
  aqui, e — o que o trinco mediu — fazia com que TODA porta nova aberta
  pelo responsável aumentasse a dívida da fonte única. Foi o que aconteceu
  na rodada 1: abrir duas portas subiu o trinco de 43 para 45.

  Seção é só rótulo e ordem; QUEM pertence a ela é declarado no próprio
  destino (`secaoConfig`), porque o destino já mora no módulo dele — as
  telas de cadastro continuam sendo filhas de `cadastros`, e não ganham
  uma segunda cópia aqui só para aparecer no hub.
*/
export const SECOES_CONFIGURACOES = [
  { id: 'cadastros', label: 'Cadastros', ordem: 10 },
  { id: 'usuarios', label: 'Usuários', ordem: 20 },
  { id: 'suporte', label: 'Suporte', ordem: 30 },
  { id: 'compras', label: 'Compras', ordem: 40 },
  { id: 'comercial', label: 'Comercial', ordem: 50 },
  { id: 'provisionamento', label: 'Provisionamento', ordem: 60 },
  { id: 'status-vinculos', label: 'Status e Vínculos', ordem: 70 },
  { id: 'instalacao', label: 'Instalacao', ordem: 80 }
];

// ---------------------------------------------------------------------
// Árvore de módulos (nível 1) e subitens (nível 2)
// ---------------------------------------------------------------------
export const NAV_MODULES = [
  {
    id: 'painel',
    label: 'Painel',
    desc: 'Visão executiva com indicadores do grupo.',
    icon: HiOutlineSquares2X2,
    gate: (user) => canAccessDashboard(user),
    children: [
      {
        id: 'dashboard', ordem: 10,
        label: 'Dashboard',
        desc: 'Indicadores executivos de solicitações e financeiro.',
        icon: HiOutlinePresentationChartLine,
        to: '/dashboard',
        can: (user) => canAccessDashboard(user)
      }
    ]
  },
  {
    id: 'solicitacoes',
    label: 'Solicitações',
    desc: 'Fluxo de solicitações entre setores.',
    icon: HiOutlineClipboardDocumentList,
    gate: SEMPRE,
    children: [
      {
        id: 'solicitacoes-lista', ordem: 10,
        label: 'Solicitações',
        getLabel: (user) => {
          const perfil = perfilDe(user);
          if (perfil === 'USUARIO') return 'Minhas Solicitações';
          if (perfil === 'SETOR' || perfil === 'FINANCEIRO') return 'Solicitações do Setor';
          return 'Solicitações';
        },
        desc: 'Acompanhe e movimente as solicitações ativas.',
        icon: HiOutlineClipboardDocumentList,
        to: '/solicitacoes',
        can: SEMPRE
      },
      { id: 'solicitacoes-relatorios', ordem: 40, label: 'Relatórios', desc: 'Relatórios operacionais de solicitações.', icon: HiOutlineChartBar, to: '/solicitacoes/relatorios', can: (user) => canViewSolicitacoesRelatorios(user) },
      { id: 'solicitacoes-arquivadas', ordem: 50, label: 'Arquivadas', desc: 'Solicitações que você arquivou.', icon: HiOutlineArchiveBox, to: '/solicitacoes-arquivadas', can: SEMPRE },
      { id: 'prioridades-diretoria', ordem: 30, label: 'Prioridades Diretoria', desc: 'Lotes de prioridade definidos pela diretoria.', icon: HiOutlineStar, to: '/prioridades-diretoria', can: (user) => canAccessPrioridadesDiretoria(user) },
      { id: 'nova-solicitacao', fixavel: 'acao', ordem: 20, label: 'Nova Solicitação', desc: 'Abra uma nova solicitação para um setor.', icon: HiOutlinePlusCircle, to: '/nova-solicitacao', can: (user) => !['SETOR', 'FINANCEIRO'].includes(perfilDe(user)) }
    ]
  },
  {
    id: 'comunicacao',
    label: 'Comunicação',
    desc: 'Conversas internas entre usuários e setores.',
    icon: HiOutlineChatBubbleLeftRight,
    gate: (user) => canAccessComunicacao(user),
    children: [
      { id: 'comunicacao-interna', ordem: 10, label: 'Comunicação Interna', desc: 'Converse com usuários e setores do grupo.', icon: HiOutlineChatBubbleLeftRight, to: '/comunicacao-interna', can: SEMPRE }
    ]
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca',
    desc: 'Arquivos e modelos padronizados do grupo.',
    icon: HiOutlineBookOpen,
    gate: (user) => canAccessBiblioteca(user),
    children: [
      { id: 'arquivos-modelos', ordem: 10, label: 'Arquivos Modelos', desc: 'Baixe modelos e documentos padronizados.', icon: HiOutlineFolderOpen, to: '/arquivos-modelos', can: SEMPRE }
    ]
  },
  {
    id: 'treinamento',
    label: 'Treinamento',
    desc: 'Central de treinamento do sistema.',
    icon: HiOutlineAcademicCap,
    gate: (user) => canAccessTreinamento(user),
    children: [
      { id: 'treinamento-central', ordem: 10, label: 'Central de Treinamento', desc: 'Conteúdos de treinamento por módulo.', icon: HiOutlineAcademicCap, to: '/treinamento', can: SEMPRE }
    ]
  },
  {
    id: 'compras',
    label: 'Compras',
    desc: 'Solicitações, cotações e pedidos de compra.',
    icon: HiOutlineShoppingCart,
    gate: (user) => canAccessCompras(user),
    children: [
      { id: 'compras-solicitacoes', ordem: 10, label: 'Solicitações de Compra', desc: 'Solicitações de compra em andamento.', icon: HiOutlineClipboardDocumentList, to: '/solicitacoes-compra', can: (user) => canViewCompraSolicitacoes(user) },
      { id: 'compras-nova', fixavel: 'acao', ordem: 20, label: 'Nova Solicitação de Compra', desc: 'Abra uma solicitação de compra de insumos.', icon: HiOutlinePlusCircle, to: '/solicitacoes-compra/nova', can: (user) => canCreateCompraSolicitacao(user) },
      { id: 'compras-nova-direta', fixavel: 'acao', ordem: 30, label: 'Nova Compra Direta', desc: 'Registre uma compra direta de insumos.', icon: HiOutlinePlusCircle, to: '/solicitacoes-compra-direta/nova', can: (user) => canCreateCompraSolicitacao(user) },
      { id: 'compras-pedidos', ordem: 50, label: 'Pedidos de Compra', desc: 'Pedidos emitidos aos fornecedores.', icon: HiOutlineTruck, to: '/pedidos-compra', can: (user) => canViewComprasPedidos(user) },
      { id: 'compras-delegacao', ordem: 60, label: 'Delegação de Compras', desc: 'Distribua solicitações entre compradores.', icon: HiOutlineUserPlus, to: '/compras/delegacao', can: (user) => canViewComprasDelegacao(user) },
      { id: 'compras-relatorios', ordem: 80, label: 'Relatórios de Compras', desc: 'Relatórios e indicadores de compras.', icon: HiOutlineChartBar, to: '/compras/relatorios', can: (user) => canViewComprasRelatorios(user) },
      { id: 'compras-cotacoes', ordem: 40, label: 'Cotações', desc: 'Cotações abertas com fornecedores.', icon: HiOutlineScale, to: '/cotacoes', can: (user) => hasEnabledModule(user, 'COTACOES') && canViewComprasCotacoes(user) },
      { id: 'compras-fornecedores', ordem: 70, label: 'Fornecedores', desc: 'Cadastro de fornecedores para cotação.', icon: HiOutlineBuildingStorefront, to: '/gestao-fornecedores', can: (user) => hasEnabledModule(user, 'COTACOES') && canViewComprasFornecedores(user) },
      { id: 'compras-config-cotacao', ordem: 90, label: 'Config. Cotações', desc: 'Parâmetros do fluxo de cotação.', icon: HiOutlineAdjustmentsHorizontal, to: '/configuracoes-cotacao', can: (user) => hasEnabledModule(user, 'COTACOES') && canManageComprasConfiguracoes(user) },
      { id: 'compras-insumos', ordem: 100, label: 'Gestão de Insumos', desc: 'Catálogo de insumos compráveis.', icon: HiOutlineRectangleGroup, to: '/gestao-insumos', can: (user) => canManageComprasConfiguracoes(user) },
      { id: 'compras-unidades', ordem: 110, label: 'Gestão de Unidades', desc: 'Unidades de medida dos insumos.', icon: HiOutlineScale, to: '/gestao-unidades', can: (user) => canManageComprasConfiguracoes(user) },
      { id: 'compras-categorias', ordem: 120, label: 'Gestão de Categorias', desc: 'Categorias de insumos e serviços.', icon: HiOutlineFolderOpen, to: '/gestao-categorias', can: (user) => canManageComprasConfiguracoes(user) }
    ]
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    desc: 'Títulos, pagamentos, bancos e conciliação.',
    icon: HiOutlineBanknotes,
    gate: (user) => (
      canAccessFinanceiro(user)
      || canAccessFinanceiroDda(user)
      || canViewFinanceiroRelatorios(user)
      || canAccessBancosEnterprise(user)
      || canAccessPagamentos(user)
      || canAccessBoletos(user)
    ),
    children: [
      /*
        D2 (financeiro): o recorte da carteira passou a viver na URL. Os dois
        itens continuam sendo dois destinos distintos no menu — só que agora
        apontam para a porta única com o recorte declarado no endereço. Os
        endereços antigos seguem alcançáveis por redirecionamento (App.jsx).

        O `id` NÃO muda de propósito: a tela inicial e o atalho fixado são
        gravados por ID (usuario_lista_preferencias) e o `to` é resolvido na
        leitura, pela fonte única. Trocar o `id` apagaria a escolha de quem
        já fixou "Contas a Pagar"; mantendo-o, a preferência passa a resolver
        sozinha para a URL nova.
      */
      { id: 'fin-receber', ordem: 20, label: 'Contas a Receber', desc: 'Títulos a receber em aberto e baixados.', icon: HiOutlineArrowDownCircle, to: '/financeiro/titulos?tipo=receber', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-titulo-novo', fixavel: 'acao', ordem: 60, label: 'Novo Título', desc: 'Cadastre um título a pagar ou a receber.', icon: HiOutlinePlusCircle, to: '/financeiro/titulos/novo', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-pagar', ordem: 10, label: 'Contas a Pagar', desc: 'Títulos a pagar por vencimento.', icon: HiOutlineArrowUpCircle, to: '/financeiro/titulos?tipo=pagar', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-cheques', ordem: 110, label: 'Cheques de Terceiros', desc: 'Custódia e movimentação de cheques.', icon: HiOutlineCreditCard, to: '/financeiro/cheques-terceiros', can: (user) => canAccessFinanceiro(user) && hasPermissao(user, 'financeiro.cheques.visualizar') },
      { id: 'fin-baixas-compostas', ordem: 100, label: 'Baixas com Múltiplas Fontes', desc: 'Baixas compostas por várias origens de fundo.', icon: HiOutlineReceiptRefund, to: '/financeiro/baixas-compostas', can: (user) => canAccessFinanceiro(user) && hasPermissao(user, 'financeiro.baixas_compostas.visualizar') },
      { id: 'fin-bancos', ordem: 160, label: 'Bancos Enterprise', desc: 'Integrações bancárias corporativas.', icon: HiOutlineBuildingLibrary, to: '/financeiro/bancos', can: (user) => canAccessBancosEnterprise(user) },
      { id: 'fin-financiamentos', ordem: 130, label: 'Financiamentos Bancários', desc: 'Contratos de financiamento e parcelas.', icon: HiOutlineBanknotes, to: '/financeiro/financiamentos-bancarios', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-pagamentos', ordem: 70, label: 'Pagamentos em Massa', desc: 'Lotes de pagamento enviados ao banco.', icon: HiOutlinePaperAirplane, to: '/financeiro/pagamentos', can: (user) => canAccessPagamentos(user) },
      { id: 'fin-dda', ordem: 80, label: 'DDA Bancário', desc: 'Boletos recebidos via DDA.', icon: HiOutlineClipboardDocumentCheck, to: '/financeiro/dda', can: (user) => canAccessFinanceiroDda(user) },
      { id: 'fin-boletos', ordem: 90, label: 'Boletos', desc: 'Emissão e retorno de boletos.', icon: HiOutlineDocumentText, to: '/financeiro/boletos', can: (user) => canAccessBoletos(user) },
      { id: 'fin-faturas-cartao', ordem: 120, label: 'Faturas de Cartão', desc: 'Faturas de cartão corporativo.', icon: HiOutlineCreditCard, to: '/financeiro/faturas-cartao', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-relatorios', ordem: 170, label: 'Relatórios Financeiros', desc: 'DRE, fluxo consolidado e análises.', icon: HiOutlineChartBar, to: '/financeiro/relatorios', can: (user) => canViewFinanceiroRelatorios(user) },
      { id: 'fin-baixas', ordem: 30, label: 'Baixas Realizadas', desc: 'Histórico de baixas de títulos.', icon: HiOutlineBanknotes, to: '/financeiro/baixas', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-conciliacao', ordem: 40, label: 'Conciliação OFX', desc: 'Conciliação de extratos bancários.', icon: HiOutlineScale, to: '/financeiro/conciliacao', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-caixas', ordem: 50, label: 'Caixas e Contas', desc: 'Caixas operacionais e contas bancárias.', icon: HiOutlineWallet, to: '/financeiro/caixas', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-cadastros', ordem: 190, label: 'Cadastros Financeiros', desc: 'Categorias, formas de pagamento e afins.', icon: HiOutlineRectangleGroup, to: '/financeiro/cadastros', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-upload-comprovantes', fixavel: 'acao', ordem: 140, label: 'Upload Comprovantes', desc: 'Envio de comprovantes de pagamento.', icon: HiOutlineCloudArrowUp, to: '/comprovantes/upload', can: (user) => canAccessFinanceiro(user) },
      { id: 'fin-comprovantes-pendentes', ordem: 150, label: 'Comprovantes Pendentes', desc: 'Comprovantes aguardando conferência.', icon: HiOutlineReceiptRefund, to: '/comprovantes/pendentes', can: (user) => canAccessFinanceiro(user) }
    ]
  },
  {
    id: 'custos-recebiveis',
    label: 'Custos e Recebíveis',
    desc: 'Planejamento, custos realizados e recebíveis por obra.',
    icon: HiOutlineArrowTrendingUp,
    gate: (user) => canAccessCustosRecebiveis(user),
    children: [
      { id: 'custos-recebiveis', ordem: 10, label: 'Custos e Recebíveis', desc: 'Planejamento, custos realizados e recebíveis por obra.', icon: HiOutlineArrowTrendingUp, to: '/custos-recebiveis', can: (user) => canAccessCustosRecebiveis(user) }
    ]
  },
  {
    id: 'fiscal',
    label: 'Fiscal',
    desc: 'Documentos fiscais e exportação contábil.',
    icon: HiOutlineReceiptPercent,
    gate: (user) => canAccessFiscal(user),
    children: [
      { id: 'fiscal-painel', ordem: 10, label: 'Painel Fiscal', desc: 'Visão geral dos documentos fiscais.', icon: HiOutlineSquares2X2, to: '/fiscal', can: SEMPRE },
      { id: 'fiscal-relatorios', ordem: 50, label: 'Relatórios Fiscais', desc: 'Relatórios do módulo fiscal.', icon: HiOutlineChartBar, to: '/fiscal/relatorios', can: SEMPRE },
      { id: 'fiscal-empresas', ordem: 60, label: 'Empresas Fiscais', desc: 'Empresas monitoradas pelo módulo.', icon: HiOutlineBuildingOffice2, to: '/fiscal/empresas', can: (user) => canManageFiscalConfig(user) },
      { id: 'fiscal-certificados', ordem: 70, label: 'Certificados', desc: 'Certificados digitais das empresas.', icon: HiOutlineKey, to: '/fiscal/empresas#certificados', can: (user) => canManageFiscalConfig(user) },
      { id: 'fiscal-diagnostico', ordem: 80, label: 'Diagnóstico', desc: 'Diagnóstico das integrações fiscais.', icon: HiOutlineAdjustmentsHorizontal, to: '/fiscal/diagnostico', can: (user) => canManageFiscalConfig(user) },
      { id: 'fiscal-documentos', ordem: 20, label: 'Documentos Fiscais', desc: 'NF-e e demais documentos capturados.', icon: HiOutlineDocumentText, to: '/fiscal/documentos', can: (user) => canViewFiscalDocuments(user) },
      { id: 'fiscal-divergencias', ordem: 30, label: 'Divergências', desc: 'Divergências entre fiscal e financeiro.', icon: HiOutlineExclamationTriangle, to: '/fiscal/divergencias', can: (user) => canViewFiscalDocuments(user) },
      { id: 'fiscal-exportacao', ordem: 40, label: 'Exportação Contábil', desc: 'Lotes de exportação para a contabilidade.', icon: HiOutlineFolderOpen, to: '/fiscal/exportacao-contabil', can: (user) => canViewFiscalDocuments(user) },
      { id: 'fiscal-logs', ordem: 90, label: 'Logs de Sincronização', desc: 'Execuções das sincronizações fiscais.', icon: HiOutlineClipboardDocumentList, to: '/fiscal/logs', can: (user) => canViewFiscalLogs(user) }
    ]
  },
  {
    id: 'crm',
    label: 'CRM',
    desc: 'Leads, atendimento e funil comercial.',
    icon: HiOutlineUserGroup,
    gate: (user) => canAccessCrm(user),
    children: [
      { id: 'crm-dashboard', ordem: 10, label: 'Dashboard', desc: 'Indicadores do funil e do atendimento.', icon: HiOutlinePresentationChartLine, to: '/crm/dashboard', can: (user) => canViewCrmDashboard(user) },
      { id: 'crm-relatorios', ordem: 80, label: 'Relatórios CRM', desc: 'Relatórios executivos do CRM.', icon: HiOutlineChartBar, to: '/crm/relatorios', can: (user) => canViewCrmDashboard(user) },
      { id: 'crm-inbox', ordem: 30, label: 'Inbox', desc: 'Conversas com clientes nos canais.', icon: HiOutlineChatBubbleLeftRight, to: '/crm/inbox', can: (user) => canViewCrmAtendimento(user) },
      { id: 'crm-leads', ordem: 40, label: 'Leads', desc: 'Base de leads do grupo.', icon: HiOutlineUserGroup, to: '/crm/leads', can: (user) => canViewCrmLeads(user) },
      { id: 'crm-carteira', ordem: 60, label: 'Minha Carteira', desc: 'Leads sob sua responsabilidade.', icon: HiOutlineIdentification, to: '/crm/carteira', can: (user) => canViewCrmLeads(user) },
      { id: 'crm-novo-lead', fixavel: 'acao', ordem: 20, label: 'Novo Lead', desc: 'Cadastre um novo lead.', icon: HiOutlinePlusCircle, to: '/crm/leads/novo', can: (user) => canCreateCrmLeads(user) },
      { id: 'crm-kanban', ordem: 50, label: 'Kanban', desc: 'Funil de vendas em quadro kanban.', icon: HiOutlineTableCells, to: '/crm/kanban', can: (user) => canViewCrmLeads(user) },
      { id: 'crm-tarefas', ordem: 70, label: 'Tarefas', desc: 'Tarefas de follow-up com leads.', icon: HiOutlineClipboardDocumentList, to: '/crm/tarefas', can: (user) => canViewCrmLeads(user) },
      { id: 'crm-automacoes', ordem: 90, label: 'Automações', desc: 'Regras automáticas do CRM.', icon: HiOutlineAdjustmentsHorizontal, to: '/crm/automacoes', can: (user) => canViewCrmAutomacoes(user) },
      { id: 'crm-canais', ordem: 100, label: 'Canais', desc: 'Canais de atendimento conectados.', icon: HiOutlineChatBubbleOvalLeft, to: '/crm/admin/canais', can: (user) => canViewCrmConfiguracoes(user) },
      { id: 'crm-numeros', ordem: 110, label: 'Números', desc: 'Números de WhatsApp do atendimento.', icon: HiOutlinePaperAirplane, to: '/crm/admin/numeros', can: (user) => canViewCrmConfiguracoes(user) },
      { id: 'crm-integracoes', ordem: 120, label: 'Integrações', desc: 'Integrações externas do CRM.', icon: HiOutlineAdjustmentsHorizontal, to: '/crm/admin/integracoes', can: (user) => canViewCrmConfiguracoes(user) }
    ]
  },
  {
    id: 'comercial',
    label: 'Comercial',
    desc: 'Empreendimentos, unidades e vendas.',
    icon: HiOutlineBuildingStorefront,
    gate: (user) => canAccessComercial(user),
    children: [
      { id: 'comercial-relatorios', ordem: 60, label: 'Relatórios Comerciais', desc: 'Relatórios de vendas e estoque.', icon: HiOutlineChartBar, to: '/comercial/relatorios', can: SEMPRE },
      { id: 'comercial-empreendimentos', ordem: 30, label: 'Empreendimentos', desc: 'Cadastro de empreendimentos.', icon: HiOutlineBuildingOffice2, to: '/comercial/empreendimentos', can: (user) => canViewComercialEmpreendimentos(user) },
      { id: 'comercial-unidades', ordem: 40, label: 'Unidades', desc: 'Unidades por empreendimento.', icon: HiOutlineRectangleGroup, to: '/comercial/unidades', can: (user) => canViewComercialEmpreendimentos(user) },
      { id: 'comercial-mapa', ordem: 10, label: 'Mapa de Unidades', desc: 'Mapa de disponibilidade das unidades.', icon: HiOutlineMapPin, to: '/comercial/mapa-unidades', can: (user) => canViewComercialEmpreendimentos(user) },
      { id: 'comercial-tabelas', ordem: 50, label: 'Tabelas de Preço', desc: 'Tabelas de preço por empreendimento.', icon: HiOutlineTableCells, to: '/comercial/tabelas-preco', can: (user) => canViewComercialEmpreendimentos(user) },
      { id: 'comercial-contratos', ordem: 20, label: 'Contratos de Venda', desc: 'Contratos de venda das unidades.', icon: HiOutlineDocumentCheck, to: '/comercial/contratos', can: (user) => canViewComercialContratos(user) },
      { id: 'comercial-modelos', ordem: 70, label: 'Modelos de Contrato', desc: 'Modelos usados nos contratos de venda.', icon: HiOutlineFolderOpen, to: '/comercial/modelos-contrato', can: (user) => canViewComercialContratos(user) }
    ]
  },
  {
    id: 'provisionamento',
    label: 'Provisionamento',
    desc: 'Previsão de desembolsos futuros.',
    icon: HiOutlineCalendarDays,
    gate: (user) => canAccessProvisoes(user),
    children: [
      { id: 'prov-dashboard', ordem: 30, label: 'Dashboard de Previsão', desc: 'Previsão consolidada de desembolsos.', icon: HiOutlinePresentationChartLine, to: '/provisoes-financeiras/dashboard', can: (user) => canViewProvisionamentosDashboard(user) },
      { id: 'prov-relatorios', ordem: 40, label: 'Relatórios', desc: 'Relatórios de provisionamento.', icon: HiOutlineChartBar, to: '/provisoes-financeiras/relatorios', can: (user) => canViewProvisionamentosDashboard(user) },
      { id: 'prov-lista', ordem: 10, label: 'Provisionamentos', desc: 'Provisões financeiras registradas.', icon: HiOutlineBanknotes, to: '/provisoes-financeiras', can: (user) => canViewProvisionamentos(user) },
      { id: 'prov-nova', fixavel: 'acao', ordem: 20, label: 'Nova Provisão', desc: 'Registre uma nova provisão financeira.', icon: HiOutlinePlusCircle, to: '/provisoes-financeiras/nova', can: (user) => canCreateProvisionamentos(user) },
      { id: 'prov-categorias', ordem: 50, label: 'Categorias Macro', desc: 'Categorias macro das provisões.', icon: HiOutlineFolderOpen, to: '/provisoes-financeiras/categorias', can: (user) => canManageProvisionamentoCategorias(user) }
    ]
  },
  {
    id: 'rhdp',
    label: 'RH/DP',
    desc: 'Colaboradores, apuração e fechamentos.',
    icon: HiOutlineUsers,
    gate: (user) => canAccessRhDp(user),
    children: [
      /*
        D1 e D3 (decisões do cliente, 02/09):
        - "Visão do Módulo" saiu: era um mural de cards que repetia este
          mesmo menu. O hub do módulo (/hub/rhdp) já é o índice.
        - Jornada e Apuração saíram: são o mesmo trabalho em sequência do
          Pessoal e viraram abas de lá. As rotas antigas redirecionam para a
          aba certa (App.jsx), então link salvo e favorito continuam valendo.
        - Empresas do grupo nunca esteve aqui e agora existe uma vez só, em
          Cadastros.
        Pessoal é a porta do dia a dia; Colaboradores é o cadastro.
      */
      { id: 'rhdp-pessoal', ordem: 10, label: 'Pessoal', desc: 'Solicitações, colaboradores, jornada e apuração — o dia a dia do DP.', icon: HiOutlineUserGroup, to: '/rh-dp/pessoal', can: (user) => canViewRhDpColaboradores(user) },
      { id: 'rhdp-colaboradores', ordem: 20, label: 'Colaboradores', desc: 'Cadastro de colaboradores.', icon: HiOutlineUsers, to: '/rh-dp/colaboradores', can: (user) => canAccessRhDpCadastroColaboradores(user) },
      { id: 'rhdp-importacoes', ordem: 50, label: 'Importações', desc: 'Importações de jornada e eventos.', icon: HiOutlineCloudArrowUp, to: '/rh-dp/importacoes', can: (user) => canExecuteRhDpImportacoes(user) },
      { id: 'rhdp-documentos', ordem: 60, label: 'Documentos', desc: 'Documentos dos colaboradores.', icon: HiOutlineFolderOpen, to: '/rh-dp/documentos', can: (user) => canViewRhDpDocumentos(user) },
      { id: 'rhdp-fechamentos', ordem: 40, label: 'Fechamentos', desc: 'Fechamentos que geram títulos financeiros.', icon: HiOutlineBanknotes, to: '/rh-dp/fechamentos', can: (user) => canViewRhDpObrigacoes(user) && hasEnabledModule(user, 'FINANCEIRO') },
      { id: 'rhdp-relatorios', ordem: 70, label: 'Relatórios', desc: 'Relatórios de RH/DP.', icon: HiOutlineChartBar, to: '/rh-dp/relatorios', can: (user) => canAccessRhDpDashboard(user) }
    ]
  },
  {
    id: 'sst',
    label: 'SST',
    desc: 'Saúde e segurança do trabalho.',
    icon: HiOutlineShieldCheck,
    gate: (user) => canAccessSst(user),
    children: SST_SIMPLIFIED_MODE ? sstChildrenSimplified() : sstChildrenFull()
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    desc: 'Usuários, obras, setores e pessoas.',
    icon: HiOutlineIdentification,
    gate: (user) => canManageUsers(user) || isBusinessAdmin(user) || canManageConfiguracoesArea(user, 'cadastros'),
    children: [
      { id: 'cad-usuarios', ordem: 10, secaoConfig: 'usuarios', ordemConfig: 10, label: 'Usuários', desc: 'Usuários e perfis de acesso.', icon: HiOutlineUsers, to: '/usuarios', can: (user) => canManageUsers(user) },
      { id: 'cad-usuarios-novo', fixavel: 'acao', ordem: 20, label: 'Novo Usuário', desc: 'Cadastre um usuário com perfil e permissões.', icon: HiOutlineUserPlus, to: '/usuarios/novo', can: (user) => canManageUsers(user) },
      { id: 'cad-empresas', ordem: 80, secaoConfig: 'cadastros', ordemConfig: 50, label: 'Empresas do Grupo', desc: 'Empresas que compõem o grupo.', icon: HiOutlineBuildingOffice2, to: '/empresas-grupo', can: (user) => isSuperadmin(user) || canManageConfiguracoesArea(user, 'cadastros') },
      { id: 'cad-obras', ordem: 30, secaoConfig: 'cadastros', ordemConfig: 10, label: 'Obras', desc: 'Obras e centros de custo.', icon: HiOutlineBuildingOffice2, to: '/obras', can: (user) => (isBusinessAdmin(user) || canManageConfiguracoesArea(user, 'cadastros')) && canAccessCadastroObras(user) },
      { id: 'cad-apropriacoes', ordem: 90, label: 'Gestão de Apropriações', desc: 'Apropriações de custo por obra.', icon: HiOutlineAdjustmentsHorizontal, to: '/gestao-apropriacoes', can: (user) => isBusinessAdmin(user) && canAccessCadastroObras(user) },
      { id: 'cad-setores', ordem: 40, secaoConfig: 'cadastros', ordemConfig: 20, label: 'Setores', desc: 'Setores do fluxo de solicitações.', icon: HiOutlineRectangleGroup, to: '/setores', can: (user) => isBusinessAdmin(user) || canManageConfiguracoesArea(user, 'cadastros') },
      { id: 'cad-tipos', ordem: 50, secaoConfig: 'cadastros', ordemConfig: 30, label: 'Tipos de Solicitação', desc: 'Tipos e subtipos de solicitação.', icon: HiOutlineClipboardDocumentList, to: '/tipos-solicitacao', can: (user) => isBusinessAdmin(user) || canManageConfiguracoesArea(user, 'cadastros') },
      { id: 'cad-parceiros', ordem: 60, secaoConfig: 'cadastros', ordemConfig: 40, label: 'Cadastro de Pessoas', desc: 'Parceiros, credores e clientes.', icon: HiOutlineUsers, to: '/parceiros', can: (user) => isBusinessAdmin(user) || canManageConfiguracoesArea(user, 'cadastros') },
      { id: 'cad-parceiros-categorias', ordem: 70, secaoConfig: 'cadastros', ordemConfig: 60, label: 'Categorias de Parceiro', desc: 'Categorias para classificar pessoas.', icon: HiOutlineArchiveBox, to: '/parceiros-categorias', can: (user) => isBusinessAdmin(user) || canManageConfiguracoesArea(user, 'cadastros') }
    ]
  },
  {
    id: 'contratos',
    label: 'Contratos',
    desc: 'Contratos de obra e medições.',
    icon: HiOutlineDocumentCheck,
    gate: (user) => canAccessContratos(user),
    children: [
      { id: 'contratos-relatorios', ordem: 30, label: 'Relatórios', desc: 'Relatórios operacionais de contratos.', icon: HiOutlineChartBar, to: '/contratos/relatorios', can: SEMPRE },
      { id: 'contratos-gestao', ordem: 10, secaoConfig: 'cadastros', ordemConfig: 80, label: 'Gestão de Contratos', desc: 'Contratos, aditivos e medições.', icon: HiOutlineDocumentCheck, to: '/gestao-contratos', can: SEMPRE },
      { id: 'contratos-novo', fixavel: 'acao', ordem: 20, label: 'Novo Contrato', desc: 'Crie um contrato do fluxo com parcelas.', icon: HiOutlinePlusCircle, to: '/contratos/novo', can: SEMPRE }
    ]
  },
  {
    id: 'administracao',
    label: 'Administração',
    desc: 'Governança e auditoria do sistema.',
    icon: HiOutlineBuildingLibrary,
    gate: (user) => canViewSystemGovernance(user) || canViewOperationalAudit(user),
    children: [
      { id: 'adm-governanca', ordem: 10, label: 'Governança do Sistema', desc: 'Saúde, segurança e módulos do sistema.', icon: HiOutlineShieldCheck, to: '/governanca', can: (user) => canViewSystemGovernance(user) },
      { id: 'adm-auditoria', ordem: 20, label: 'Auditoria Operacional', desc: 'Trilha de auditoria das operações.', icon: HiOutlineClipboardDocumentList, to: '/governanca/auditoria-operacional', can: (user) => canViewOperationalAudit(user) }
    ]
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    desc: 'Parâmetros e vínculos do sistema.',
    icon: HiOutlineCog6Tooth,
    gate: (user) => canAccessConfiguracoes(user),
    children: [
      { id: 'cfg-central', ordem: 10, label: 'Configurações', desc: 'Central de configurações do sistema.', icon: HiOutlineCog6Tooth, to: '/configuracoes', can: SEMPRE },
      { id: 'cfg-acesso-prioridades', ordem: 20, secaoConfig: 'status-vinculos', ordemConfig: 160, label: 'Acesso Prioridades', desc: 'Usuários com acesso às prioridades.', icon: HiOutlineUsers, to: '/usuarios-acesso-prioridade-diretoria', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-envio-livre', ordem: 30, secaoConfig: 'status-vinculos', ordemConfig: 190, label: 'Envio Livre por Usuário', desc: 'Usuários que enviam a qualquer setor.', icon: HiOutlineUsers, to: '/usuarios-envio-qualquer-setor', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-tipos-compartilhados', ordem: 40, secaoConfig: 'status-vinculos', ordemConfig: 170, label: 'Tipos Compartilhados', desc: 'Tipos de solicitação compartilhados.', icon: HiOutlineClipboardDocumentList, to: '/tipos-compartilhados-setor', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-automacao-status', ordem: 50, secaoConfig: 'status-vinculos', ordemConfig: 180, label: 'Automação por Status', desc: 'Envio automático ao mudar status.', icon: HiOutlinePaperAirplane, to: '/automacao-status-setor', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-aprovacao-tipo', ordem: 52, secaoConfig: 'status-vinculos', ordemConfig: 185, label: 'Aprovação por Tipo', desc: 'Setor e status de chegada após aprovação do GEO.', icon: HiOutlineClipboardDocumentCheck, to: '/aprovacao-solicitacao-por-tipo', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-acoes-principais', ordem: 54, secaoConfig: 'status-vinculos', ordemConfig: 270, label: 'Ação Principal por Setor', desc: 'Ação em destaque no detalhe da solicitação.', icon: HiOutlineStar, to: '/configuracoes-acoes-principais', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-atalhos-setor', ordem: 56, secaoConfig: 'status-vinculos', ordemConfig: 280, label: 'Atalhos por Setor', desc: 'Atalhos sugeridos e obrigatórios de cada setor.', icon: HiOutlineStar, to: '/configuracoes-atalhos-setor', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-detalhe-layout', ordem: 58, secaoConfig: 'status-vinculos', ordemConfig: 290, label: 'Layout do Detalhe por Setor', desc: 'Blocos da Home e do detalhe da solicitação por setor.', icon: HiOutlineRectangleGroup, to: '/configuracoes-detalhe-layout', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-contrato-alertas-formas', ordem: 60, secaoConfig: 'status-vinculos', ordemConfig: 130, label: 'Formas da Nova Solicitação', desc: 'Alertas de contrato e formas de pagamento exibidas na Nova Solicitação.', icon: HiOutlineAdjustmentsHorizontal, to: '/configuracoes-formas-pagamento-solicitacao', can: (user) => canManageConfiguracoesArea(user, 'geral') },
      { id: 'cfg-cartoes-recarga', ordem: 62, secaoConfig: 'cadastros', ordemConfig: 90, label: 'Cartões de Recarga', desc: 'Cadastro dos cartões usados no fluxo de recarga.', icon: HiOutlineCreditCard, to: '/configuracoes-cartoes-recarga', can: (user) => isSuperadmin(user) },
      { id: 'cfg-cotacao', ordem: 70, secaoConfig: 'compras', ordemConfig: 10, label: 'Config. Cotações', desc: 'Parâmetros do fluxo de cotação.', icon: HiOutlineAdjustmentsHorizontal, to: '/configuracoes-cotacao', can: (user) => hasEnabledModule(user, 'COTACOES') && canManageComprasConfiguracoes(user) },
      { id: 'cfg-status-pedidos', ordem: 80, secaoConfig: 'compras', ordemConfig: 20, label: 'Status dos Pedidos', desc: 'Status dos pedidos de compra.', icon: HiOutlineClipboardDocumentList, to: '/configuracoes-status-pedidos-compra', can: (user) => canManageComprasConfiguracoes(user) },
      { id: 'cfg-comercial-categorias', ordem: 90, secaoConfig: 'comercial', ordemConfig: 10, label: 'Categorias Comerciais', desc: 'Categorias do módulo comercial.', icon: HiOutlineArchiveBox, to: '/configuracoes-comercial-categorias', can: (user) => canManageConfiguracoesArea(user, 'geral') && canAccessComercial(user) },
      { id: 'cfg-modulos', ordem: 100, secaoConfig: 'instalacao', ordemConfig: 10, label: 'Módulos e Planos', desc: 'Ativação de módulos do sistema.', icon: HiOutlineCog6Tooth, to: '/configuracoes-modulos', can: (user) => canManageConfiguracoesArea(user, 'modulos') },
      { id: 'cfg-notificacoes', ordem: 110, secaoConfig: 'suporte', ordemConfig: 30, label: 'Notificações Sistema', desc: 'Eventos que geram notificações.', icon: HiOutlineBell, to: '/configuracoes-notificacoes-sistema', can: (user) => canManageConfiguracoesArea(user, 'aparencia') },
      { id: 'cfg-arquivos-modelos', ordem: 120, secaoConfig: 'compras', ordemConfig: 30, label: 'Arquivos Modelos', desc: 'Gestão da biblioteca de modelos.', icon: HiOutlineFolderOpen, to: '/arquivos-modelos-config', can: (user) => isSuperadmin(user) && hasEnabledModule(user, 'BIBLIOTECA_MODELOS') },
      /*
        OS 25 DESTINOS QUE SÓ EXISTIAM NA LISTA À MÃO DO HUB (05/09).

        Todos já tinham rota e guarda no App.jsx; o que faltava era existir
        AQUI. Enquanto viviam só no `Configuracoes.jsx`, ficavam fora do
        Ctrl+K, fora dos atalhos fixáveis e fora do breadcrumb — e a
        permissão deles era reavaliada por área de configuração, o que já
        divergia da guarda da rota em quatro casos (ver o comentário do
        `cfg-sla-setor`).

        O `can` de cada um reusa a MESMA função que a rota correspondente
        usa no App.jsx, que é a regra da casa deste arquivo. `ordem` os
        coloca depois dos que já estavam no módulo (o hub do módulo não
        muda de cara); a posição dentro do hub de Configurações é o
        `ordemConfig`, que preserva a ordem que a lista à mão tinha.
      */
      { id: 'cfg-tipos-sub-contrato', ordem: 200, secaoConfig: 'cadastros', ordemConfig: 70, label: 'Subtipos de Contrato', desc: 'Cadastro de subtipos.', icon: HiOutlineDocumentCheck, to: '/tipos-sub-contrato', can: (user) => canManageConfiguracoesArea(user, 'cadastros') },
      { id: 'cfg-suporte-whatsapp', ordem: 210, secaoConfig: 'suporte', ordemConfig: 10, label: 'WhatsApp do Suporte', desc: 'Configure o número aberto pelo botão Suporte no topo do sistema.', icon: HiOutlineChatBubbleOvalLeft, to: '/configuracoes-suporte', can: (user) => canManageConfiguracoesArea(user, 'aparencia') },
      { id: 'cfg-visibilidade-ui', ordem: 220, secaoConfig: 'suporte', ordemConfig: 20, label: 'Visibilidade de Dashboards e Tabelas', desc: 'Defina quais cards, dashboards e tabelas ficam visíveis nas telas do sistema.', icon: HiOutlineRectangleGroup, to: '/configuracoes-visibilidade-ui', can: (user) => canManageConfiguracoesArea(user, 'aparencia') },
      { id: 'cfg-provisionamento-fluxo', ordem: 230, secaoConfig: 'provisionamento', ordemConfig: 10, label: 'Fluxo do Provisionamento', desc: 'Configure o modo informativo, controlado ou integrado com solicitações.', icon: HiOutlineCalendarDays, to: '/configuracoes-provisionamento-fluxo', can: (user) => hasEnabledModule(user, 'PROVISOES') && canManageConfiguracoesArea(user, 'geral') },
      { id: 'cfg-status-setor', ordem: 240, secaoConfig: 'status-vinculos', ordemConfig: 10, label: 'Status por Setor', desc: 'Cadastro de status permitidos por setor.', icon: HiOutlineClipboardDocumentList, to: '/status-setor', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-permissoes-setor', ordem: 250, secaoConfig: 'status-vinculos', ordemConfig: 20, label: 'Permissões por Setor', desc: 'Defina se usuários podem assumir e atribuir.', icon: HiOutlineShieldCheck, to: '/permissoes-setor', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-cores-sistema', ordem: 260, secaoConfig: 'status-vinculos', ordemConfig: 30, label: 'Cores do Sistema', desc: 'Defina cores de botões e status.', icon: HiOutlineSparkles, to: '/cores-sistema', can: (user) => canManageConfiguracoesArea(user, 'aparencia') },
      { id: 'cfg-areas-obra', ordem: 270, secaoConfig: 'status-vinculos', ordemConfig: 40, label: 'Áreas Visíveis para OBRA', desc: 'Controle as áreas visíveis na nova solicitação.', icon: HiOutlineBuildingOffice2, to: '/areas-obra', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-obra-tipo-apropriacao', ordem: 280, secaoConfig: 'status-vinculos', ordemConfig: 50, label: 'Apropriação Padrão por Obra', desc: 'Defina a apropriação preenchida automaticamente por obra e tipo de solicitação.', icon: HiOutlineAdjustmentsHorizontal, to: '/obra-tipo-apropriacao', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-contrato-obra-categorias', ordem: 290, secaoConfig: 'status-vinculos', ordemConfig: 60, label: 'Categorias do Contrato de Obra', desc: 'Selecione quais categorias financeiras aparecem ao criar um contrato de obra.', icon: HiOutlineArchiveBox, to: '/contrato-obra-categorias', can: (user) => canManageConfiguracoesArea(user, 'geral') },
      { id: 'cfg-areas-setor-origem', ordem: 300, secaoConfig: 'status-vinculos', ordemConfig: 70, label: 'Áreas por Setor de Origem', desc: 'Defina quais setores cada setor pode selecionar na nova solicitação.', icon: HiOutlineRectangleGroup, to: '/areas-por-setor-origem', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      /*
        A PERMISSÃO DIVERGIA, E QUEM ESTAVA ERRADO ERA O HUB (05/09).

        A lista à mão mostrava este card para quem gerencia a área
        `status_vinculos`. A ROTA é `<BusinessAdminRoute>`: quem não é
        administrador do negócio clicava e era mandado embora. Card que
        promete porta e entrega redirecionamento é pior que card ausente,
        então aqui vale a guarda da rota — que é a regra deste arquivo.
        Ninguém perde acesso: quem não passava no guarda nunca abriu a
        tela.
      */
      { id: 'cfg-sla-setor', ordem: 310, secaoConfig: 'status-vinculos', ordemConfig: 80, label: 'SLA de Solicitações por Setor', desc: 'Defina o prazo real em dias usado no relatório operacional de solicitações.', icon: HiOutlineCalendarDays, to: '/solicitacoes-sla-setor', can: (user) => isBusinessAdmin(user) },
      { id: 'cfg-setores-visiveis-usuario', ordem: 320, secaoConfig: 'status-vinculos', ordemConfig: 90, label: 'Setores Visíveis por Usuário', desc: 'Defina setores extras que cada usuário pode visualizar sem alterar regras de ação.', icon: HiOutlineUsers, to: '/setores-visiveis-usuario', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-recebimento-setor', ordem: 330, secaoConfig: 'status-vinculos', ordemConfig: 100, label: 'Recebimento por Setor', desc: 'Defina se as solicitações chegam primeiro ao admin ou ficam visíveis para todos.', icon: HiOutlineInboxStack, to: '/comportamento-recebimento-setor', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-tipos-por-setor', ordem: 340, secaoConfig: 'status-vinculos', ordemConfig: 110, label: 'Tipos por Setor (Recebimento)', desc: 'Defina tipos por setor e o modo de recebimento para admin ou todos.', icon: HiOutlineClipboardDocumentList, to: '/tipos-solicitacao-por-setor', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-tipos-por-destino', ordem: 345, secaoConfig: 'status-vinculos', ordemConfig: 115, label: 'Tipos por Obra/Centro de Custo', desc: 'Defina o catálogo comum das Obras e os tipos específicos de cada Centro de Custo.', icon: HiOutlineBuildingOffice2, to: '/tipos-solicitacao-por-destino', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-nova-solicitacao-campos', ordem: 350, secaoConfig: 'status-vinculos', ordemConfig: 120, label: 'Campos da Nova Solicitação', desc: 'Defina campos visíveis e obrigatórios por tipo de solicitação.', icon: HiOutlineTableCells, to: '/nova-solicitacao-campos', can: (user) => canManageConfiguracoesArea(user, 'solicitacoes') },
      /*
        DOIS DESTINOS, NÃO UMA ROTA SOBRANDO (04/09, vindo do hub).

        Este destino e o `cfg-contrato-alertas-formas` levam ao MESMO
        componente, e por um tempo o hub tratou um deles como duplicata a
        remover. Não é: a tela lê o pathname e anuncia assunto diferente
        conforme o caminho — título, descrição e qual bloco recebe a barra
        de cor. Se a tela muda o que diz que é conforme a porta, são duas
        portas de verdade.
      */
      { id: 'cfg-contrato-alertas', ordem: 360, secaoConfig: 'status-vinculos', ordemConfig: 140, label: 'Alertas e Limites do Contrato', desc: 'Cortes e cores do alerta de saldo do contrato e o limite para análise jurídica.', icon: HiOutlineExclamationTriangle, to: '/configuracoes-contrato-alertas', can: (user) => canManageConfiguracoesArea(user, 'geral') },
      { id: 'cfg-nova-solicitacao-automacao', ordem: 370, secaoConfig: 'status-vinculos', ordemConfig: 150, label: 'Automação da Nova Solicitação', desc: 'Redirecione tipos de solicitação para telas específicas mantendo a obra selecionada.', icon: HiOutlinePaperAirplane, to: '/nova-solicitacao-automacao-destino', can: (user) => canManageConfiguracoesArea(user, 'solicitacoes') },
      { id: 'cfg-setores-criacao-todas-obras', ordem: 380, secaoConfig: 'status-vinculos', ordemConfig: 200, label: 'Criação em Todas as Obras', desc: 'Defina quais setores podem criar solicitação em qualquer obra.', icon: HiOutlineBuildingOffice2, to: '/setores-criacao-todas-obras', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-setores-acesso-todas-obras', ordem: 390, secaoConfig: 'status-vinculos', ordemConfig: 210, label: 'Acesso em Todas as Obras', desc: 'Defina quais setores podem acessar recursos protegidos por obra sem vínculo manual.', icon: HiOutlineKey, to: '/setores-acesso-todas-obras', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-usuarios-acesso-financeiro', ordem: 400, secaoConfig: 'status-vinculos', ordemConfig: 220, label: 'Acesso ao Financeiro', desc: 'Marque usuários que devem acessar o módulo financeiro e operar todas as obras nesse módulo.', icon: HiOutlineBanknotes, to: '/usuarios-acesso-financeiro', can: (user) => hasEnabledModule(user, 'FINANCEIRO') && canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-permissoes-areas-padroes', ordem: 410, secaoConfig: 'status-vinculos', ordemConfig: 230, label: 'Permissões por Setor e Perfil', desc: 'Configure permissões padrão por setor e perfil para aplicar a todos os usuários daquele grupo.', icon: HiOutlineShieldCheck, to: '/permissoes-areas-padroes', can: (user) => canManageConfiguracoesArea(user, 'permissoes') },
      { id: 'cfg-permissoes-areas', ordem: 420, secaoConfig: 'status-vinculos', ordemConfig: 240, label: 'Permissões de Áreas por Usuário', desc: 'Adicione exceções individuais quando um usuário precisar de permissões além do padrão do setor e perfil.', icon: HiOutlineIdentification, to: '/permissoes-areas', can: (user) => canManageConfiguracoesArea(user, 'permissoes') },
      /*
        PORTA ABERTA EM 04/09 (decisão do responsável).

        Esta tela existia, tinha rota e guarda de permissão, e não tinha
        link em lugar nenhum do sistema: chegava quem sabia a URL de cor.
        Ferramenta administrativa de permissão não pode depender de quem
        lembra o endereço.
      */
      { id: 'cfg-usuarios-permissoes-rh-dp', ordem: 430, secaoConfig: 'status-vinculos', ordemConfig: 250, label: 'Permissões de RH e DP por Usuário', desc: 'Marque quais usuários podem ver e operar cada área de RH e Departamento Pessoal.', icon: HiOutlineUserGroup, to: '/usuarios-permissoes-rh-dp', can: (user) => hasEnabledModule(user, 'RH_DP') && canManageConfiguracoesArea(user, 'status_vinculos') },
      { id: 'cfg-timeout-inatividade', ordem: 440, secaoConfig: 'status-vinculos', ordemConfig: 260, label: 'Tempo de Inatividade', desc: 'Define o tempo para logout automático por inatividade.', icon: HiOutlineKey, to: '/timeout-inatividade', can: (user) => canManageConfiguracoesArea(user, 'status_vinculos') }
    ]
  },
  {
    id: 'conta',
    label: 'Conta',
    desc: 'Seus dados e preferências.',
    icon: HiOutlineUserCircle,
    gate: SEMPRE,
    children: [
      { id: 'perfil', ordem: 10, label: 'Meu Perfil', desc: 'Dados pessoais, senha e MFA.', icon: HiOutlineUserCircle, to: '/perfil', can: SEMPRE }
    ]
  }
];

// ---------------------------------------------------------------------
// Helpers — todos os consumidores (hubs, breadcrumb, busca) usam estes.
// ---------------------------------------------------------------------

export function resolveLabel(node, user) {
  return typeof node.getLabel === 'function' ? node.getLabel(user) : node.label;
}

// Módulos visíveis para o usuário, cada um já com os filhos filtrados
// por permissão. Módulo sem filho visível (permissão ou módulo
// desativado) NÃO aparece.
export function getVisibleModules(user) {
  if (!user) return [];
  return NAV_MODULES
    .map((mod) => {
      if (mod.gate && !mod.gate(user)) return null;
      const children = mod.children
        .filter((child) => !child.can || child.can(user))
        .slice()
        .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
      if (children.length === 0) return null;
      return { ...mod, children };
    })
    .filter(Boolean);
}

export function getVisibleModule(user, moduleId) {
  return getVisibleModules(user).find((mod) => mod.id === moduleId) || null;
}

// Lista plana de destinos visíveis (para a busca global).
export function getVisibleItems(user) {
  return getVisibleModules(user).flatMap((mod) => (
    mod.children.map((child) => ({
      ...child,
      label: resolveLabel(child, user),
      moduleId: mod.id,
      moduleLabel: mod.label
    }))
  ));
}

/*
  SEÇÕES DO HUB DE CONFIGURAÇÕES, JÁ FILTRADAS PELO USUÁRIO (05/09).

  É a única leitura que o `pages/Configuracoes.jsx` faz — ele não conhece
  mais destino nenhum. Sai daqui pronto: seção com rótulo e ordem
  declarados em SECOES_CONFIGURACOES, itens já com o rótulo resolvido e
  filtrados pela MESMA permissão do menu (`gate` do módulo + `can` do
  destino), na ordem declarada em `ordemConfig`. Seção sem item visível
  não volta — igual ao que o hub fazia com a lista à mão.
*/
export function getSecoesConfiguracoes(user) {
  const itens = getVisibleItems(user).filter((item) => item.secaoConfig);
  return SECOES_CONFIGURACOES
    .slice()
    .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999))
    .map((secao) => ({
      ...secao,
      itens: itens
        .filter((item) => item.secaoConfig === secao.id)
        .sort((a, b) => (a.ordemConfig ?? a.ordem ?? 999) - (b.ordemConfig ?? b.ordem ?? 999))
    }))
    .filter((secao) => secao.itens.length > 0);
}

// Todos os destinos da árvore, sem filtro de permissão e cobrindo as
// duas variantes do SST (modo simplificado e completo) — usado pelo
// script de verificação de links mortos (scripts/validarNavegacao.mjs).
export function getAllDestinations() {
  const base = NAV_MODULES.flatMap((mod) => (
    mod.children.map((child) => ({
      id: child.id,
      moduleId: mod.id,
      label: child.label,
      to: child.to
    }))
  ));
  /*
    O CATALOGO OFERECIA JUSTAMENTE O QUE O MODO ESCONDE (05/09).

    Isto aqui somava a variante OPOSTA a que o menu mostra: com o modo
    simplificado ligado, ele acrescentava `sstChildrenFull()` — as 12 telas
    que o proprio modo redireciona. O menu (linha ~487) sempre esteve certo;
    quem vazava era o catalogo, e e dele que saem os atalhos fixaveis e o
    Ctrl+K. Resultado: a pessoa via o destino, clicava, e nao acontecia
    nada — sem saber se era permissao, erro ou defeito.

    Decisao do cliente (05/09): "menu que mostra porta que nao abre e pior
    que ausencia". O catalogo passa a usar A MESMA VARIANTE do menu, pela
    MESMA constante que decide o redirecionamento — os dois nao tem como
    divergir de novo, porque agora e uma leitura so.

    Atalho salvo apontando para destino escondido simplesmente deixa de
    aparecer, que e o mesmo tratamento ja dado a destino sem permissao.
  */
  const sstDoModo = (SST_SIMPLIFIED_MODE ? sstChildrenSimplified() : sstChildrenFull())
    .map((child) => ({ id: child.id, moduleId: 'sst', label: child.label, to: child.to }));
  const vistos = new Set(base.map((d) => d.to));
  return [...base, ...sstDoModo.filter((d) => !vistos.has(d.to))];
}

// ---------------------------------------------------------------------
// Atalhos personalizados — catálogo de destinos fixáveis.
// Um atalho guarda só o ID do destino; label/ícone/rota/permissão vêm
// SEMPRE daqui (fonte única). Destino sem permissão não aparece.
// ---------------------------------------------------------------------

// Destinos fixáveis visíveis ao usuário, indexados prontos para consumo.
export function getFixableItems(user) {
  return getVisibleItems(user).filter((item) => item.fixavel !== false && item.to);
}

// Resolve uma lista de IDs de atalho em destinos visíveis, preservando a
// ordem dos IDs e descartando (sem quebrar) o que o usuário não pode ver.
export function resolverAtalhos(user, ids) {
  const porId = new Map(getFixableItems(user).map((item) => [item.id, item]));
  return (Array.isArray(ids) ? ids : [])
    .map((id) => porId.get(id))
    .filter(Boolean);
}

// Destino fixável que corresponde à rota atual (para a estrela do topo).
export function findFixableByPath(user, pathname, search = '') {
  let best = null;
  for (const item of getFixableItems(user)) {
    if (!isPathActive(pathname, item.to, search)) continue;
    // Destino COM query ganha do destino sem: é o mais específico que
    // descreve a tela atual. Sem isto, /financeiro/titulos?tipo=pagar
    // casaria também com a rota nua e a estrela ficaria ambígua.
    const especificidade = (alvo) => stripHash(alvo).length + (partesDoDestino(alvo).busca ? 1000 : 0);
    if (!best || especificidade(item.to) > especificidade(best.to)) {
      best = item;
    }
  }
  // Só considera correspondência exata de rota (a estrela fixa ESTA tela;
  // páginas de detalhe com :id não são fixáveis).
  if (best && stripHash(best.to) !== pathname) return null;
  return best;
}

/*
  DESTINO COM QUERY STRING (04/09).

  A D2 trouxe o recorte de Contas a Pagar/Receber para a URL
  (`/financeiro/titulos?tipo=pagar`), e este é o PRIMEIRO item de menu do
  sistema cujo `to` carrega query — todos os outros são só caminho.

  `stripHash` cortava apenas o `#`, então o `to` inteiro, com `?tipo=...`,
  era comparado contra um `pathname` que nunca tem query. Não casava com
  nada, e sumiam de uma vez: o breadcrumb (virava só "Início"), a ESTRELA
  da topbar — e com ela o botão de definir a tela inicial — e o título da
  aba, que caía para "Fluxy".

  Cortar o `?` e comparar só o caminho NÃO serve: `fin-receber` e
  `fin-pagar` apontam para o mesmo caminho e empatariam, e a estrela
  fixaria a carteira errada EM SILÊNCIO — defeito pior que o original,
  porque parece funcionar.

  Então a comparação passa a ser: o caminho tem de bater E, quando o
  destino declara parâmetros, a URL atual tem de trazer todos eles com o
  mesmo valor. Destino sem query segue casando como antes.
*/
function partesDoDestino(alvo) {
  const semHash = alvo.indexOf('#') >= 0 ? alvo.slice(0, alvo.indexOf('#')) : alvo;
  const corte = semHash.indexOf('?');
  return corte >= 0
    ? { caminho: semHash.slice(0, corte), busca: semHash.slice(corte + 1) }
    : { caminho: semHash, busca: '' };
}

function stripHash(path) {
  return partesDoDestino(path).caminho;
}

function isPathActive(currentPath, targetPath, currentSearch = '') {
  const { caminho, busca } = partesDoDestino(targetPath);
  const caminhoBate = currentPath === caminho || currentPath.startsWith(`${caminho}/`);
  if (!caminhoBate) return false;
  if (!busca) return true;
  const atual = new URLSearchParams(currentSearch || '');
  for (const [chave, valor] of new URLSearchParams(busca)) {
    if ((atual.get(chave) || '').toLowerCase() !== valor.toLowerCase()) return false;
  }
  return true;
}

/*
  A TRILHA DE RECUO — quando NENHUM item casa, o MÓDULO ainda casa (06/09).

  A D2 levou o recorte de Contas a Pagar/Receber para a query, e com isso o
  caminho `/financeiro/titulos` deixou de ter QUALQUER item de menu que o
  descreva sem `?tipo=`: os dois que existem exigem o parâmetro. A tela nua
  e a de DETALHE (`/financeiro/titulos/:id`) passaram a cair fora da árvore
  e o breadcrumb virava só "Início" — a tela de detalhe ficou sem caminho de
  volta nenhum, nas três larguras.

  Medido em 06/09 sobre as 205 rotas do `App.jsx`, com um usuário que
  enxerga tudo: 21 rotas sem trilha. Seis são legítimas (as quatro telas
  fora do shell, a raiz e `/hub/:id`, que o breadcrumb resolve por conta
  própria); as outras 15 são telas de dentro do sistema — as três de
  títulos financeiros, `/financeiro/contas-a-*`, os três painéis do CRM,
  as quatro do RH/DP, `/custos-recebiveis`, `/conversas/:id` e a revisão da
  compra direta.

  A REGRA DE ESPECIFICIDADE DA D2 NÃO É AFROUXADA. A primeira passada
  continua exigindo os parâmetros do destino, e é ela que faz
  `?tipo=pagar` mostrar "Contas a Pagar". Este recuo só roda quando ela não
  achou nada, e é DELIBERADAMENTE mais tímido: quando dois itens do mesmo
  módulo disputam o mesmo caminho (é o caso de `fin-pagar` e `fin-receber`),
  ele NÃO escolhe um — escolher em silêncio seria dizer "Contas a Pagar"
  numa tela que pode ser a de receber, que é o defeito que o comentário do
  `findFixableByPath` já descreve como pior que o original. Ele para no
  MÓDULO, que é verdadeiro nos dois casos e já devolve o caminho de volta.

  E ele NÃO vale para a ESTRELA (`findFixableByPath`): fixar tela é escolher
  UM destino, e no empate não há destino a fixar. A estrela continua ausente
  na rota nua — de propósito, e não por falta de conserto.
*/
function primeiroSegmento(caminho) {
  const segmento = String(caminho || '').split('/').filter(Boolean)[0];
  return segmento ? `/${segmento}` : '';
}

function soUmModulo(lista) {
  const modulos = new Set(lista.map((c) => c.mod.id));
  return modulos.size === 1 ? lista[0].mod : null;
}

function trilhaPorCaminho(user, pathname) {
  const raiz = primeiroSegmento(pathname);
  if (!raiz) return null;
  /* `prefixos`: itens cujo caminho PREFIXA a rota atual — a tela nua e o
     detalhe de um item que existe no menu. `vizinhos`: itens que só
     compartilham o primeiro segmento — a tela que o menu não lista, mas
     que mora dentro de um módulo conhecido (`/rh-dp/apuracao` ao lado de
     `/rh-dp/pessoal`). */
  const prefixos = [];
  const vizinhos = [];
  for (const mod of getVisibleModules(user)) {
    for (const item of mod.children) {
      const caminho = stripHash(item.to);
      if (pathname === caminho || pathname.startsWith(`${caminho}/`)) {
        prefixos.push({ mod, item, caminho });
      }
      if (primeiroSegmento(caminho) === raiz) vizinhos.push({ mod, item, caminho });
    }
  }
  if (prefixos.length) {
    /* O caminho mais LONGO é o que descreve melhor a rota atual: entre
       `/financeiro/titulos` e `/financeiro/titulos/novo`, quem está em
       `/financeiro/titulos/novo` pertence ao segundo. */
    const maisLongo = Math.max(...prefixos.map((c) => c.caminho.length));
    const finalistas = prefixos.filter((c) => c.caminho.length === maisLongo);
    if (finalistas.length === 1) {
      return { module: finalistas[0].mod, item: finalistas[0].item };
    }
    /* Empate dentro do mesmo módulo: a trilha para no MÓDULO. `item` É o
       módulo, e o breadcrumb já sabe não repetir o nível quando os dois
       rótulos coincidem. Empate entre módulos: nada, porque não há
       resposta verdadeira. */
    const unico = soUmModulo(finalistas);
    return unico ? { module: unico, item: unico } : null;
  }
  if (!vizinhos.length) return null;
  const unico = soUmModulo(vizinhos);
  return unico ? { module: unico, item: unico } : null;
}

// Melhor correspondência da rota atual na árvore (para o breadcrumb).
// Retorna { module, item } ou null quando a rota não pertence à árvore.
export function findActiveNode(user, pathname, search = '') {
  let best = null;
  for (const mod of getVisibleModules(user)) {
    for (const item of mod.children) {
      if (!isPathActive(pathname, item.to, search)) continue;
      const peso = (alvo) => stripHash(alvo).length + (partesDoDestino(alvo).busca ? 1000 : 0);
      if (!best || peso(item.to) > peso(best.item.to)) {
        best = { module: mod, item };
      }
    }
  }
  return best || trilhaPorCaminho(user, pathname);
}
