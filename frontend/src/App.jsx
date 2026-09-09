import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import AppRouteFallback from './components/AppRouteFallback';
import Layout from './layout/Layout';
import { useAuth } from './contexts/AuthContext';
import {
  canAccessBiblioteca,
  canAccessBoletos,
  canAccessCadastroObras,
  canAccessComercial,
  canAccessComunicacao,
  canAccessCompras,
  canAccessDashboard,
  canAccessContratos,
  canAccessFinanceiro,
  canAccessFinanceiroDda,
  canAccessFiscal,
  canAccessConfiguracoes,
  canAccessPagamentos,
  canAccessGestaoObras,
  canAccessPrioridadesDiretoria,
  canCreateCompraSolicitacao,
  canCreateProvisionamentos,
  canAccessRhDpDashboard,
  canAccessRhDpEmpresas,
  canExecuteRhDpImportacoes,
  canManageComprasConfiguracoes,
  canManageComprasCotacoes,
  canManageCompraSolicitacoes,
  canManageConfiguracoesArea,
  canManageProvisionamentoCategorias,
  canViewCompraSolicitacoes,
  canViewComprasCotacoes,
  canViewComprasDelegacao,
  canViewComprasFornecedores,
  canViewComprasPedidos,
  canViewComprasRelatorios,
  canViewComercialContratos,
  canViewComercialEmpreendimentos,
  canViewProvisionamentos,
  canViewProvisionamentosDashboard,
  canViewRhDpColaboradores,
  canAccessRhDpCadastroColaboradores,
  canViewRhDpDocumentos,
  canViewRhDpObrigacoes,
  canViewFinanceiroRelatorio,
  canViewFinanceiroRelatorios,
  canViewSolicitacoesRelatorioOperacional,
  canViewSolicitacoesRelatorios,
  canAccessSst,
  canAccessTreinamento,
  canManageSstArea,
  canViewSstArea,
  canViewSstDashboard,
  canCreateCrmLeads,
  canManageFiscalConfig,
  canViewSystemGovernance,
  canViewOperationalAudit,
  canManageUsers,
  canViewCrmAtendimento,
  canViewCrmAutomacoes,
  canViewCrmConfiguracoes,
  canViewCrmDashboard,
  canViewCrmLeads,
  canViewFiscalDocuments,
  canViewFiscalLogs,
  hasEnabledModule,
  isBusinessAdmin,
  isSuperadmin
} from './utils/acessoProduto';
import {
  SST_NAV,
  SST_SIMPLIFIED_MODE
} from './modules/sst/constants/sstResources';
import { canAccessCustosRecebiveis } from './modules/custosRecebiveis/utils/access';

const HomeHub = lazy(() => import('./navigation/HomeHub'));
const ModuleHub = lazy(() => import('./navigation/ModuleHub'));
const Login = lazy(() => import('./pages/Login'));
const RecuperarSenha = lazy(() => import('./pages/RecuperarSenha'));
const DefinirSenha = lazy(() => import('./pages/DefinirSenha'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Solicitacoes = lazy(() => import('./pages/Solicitacoes'));
const SolicitacaoDetalhe = lazy(() => import('./pages/SolicitacaoDetalhe'));
const SolicitacoesArquivadas = lazy(() => import('./pages/SolicitacoesArquivadas'));
const SolicitacoesRelatorioOperacional = lazy(() => import('./pages/SolicitacoesRelatorioOperacional'));
const SolicitacoesSlaSetor = lazy(() => import('./pages/SolicitacoesSlaSetor'));
const Usuarios = lazy(() => import('./pages/Usuarios'));
const UsuarioNovo = lazy(() => import('./pages/UsuarioNovo'));
const NovaSolicitacao = lazy(() => import('./pages/NovaSolicitacao'));
const UploadComprovantes = lazy(() => import('./pages/UploadComprovantes'));
const ComprovantesPendentes = lazy(() => import('./pages/ComprovantesPendentes'));
const FinanceiroTitulos = lazy(() => import('./pages/FinanceiroTitulos'));
const FinanceiroTituloNovo = lazy(() => import('./pages/FinanceiroTituloNovo'));
const FinanceiroTituloDetalhe = lazy(() => import('./pages/FinanceiroTituloDetalhe'));
const FinanceiroTituloEditar = lazy(() => import('./pages/FinanceiroTituloEditar'));
const FinanceiroChequesTerceiros = lazy(() => import('./pages/FinanceiroChequesTerceiros'));
const FinanceiroBaixasCompostas = lazy(() => import('./pages/FinanceiroBaixasCompostas'));
const FinanceiroPagamentos = lazy(() => import('./pages/FinanceiroPagamentos'));
const FinanceiroDda = lazy(() => import('./pages/FinanceiroDda'));
const FinanceiroBoletos = lazy(() => import('./pages/FinanceiroBoletos'));
const FinanceiroFaturasCartao = lazy(() => import('./pages/FinanceiroFaturasCartao'));
const FinanceiroFaturaCartaoDetalhe = lazy(() => import('./pages/FinanceiroFaturaCartaoDetalhe'));
const FinanceiroCadastros = lazy(() => import('./pages/FinanceiroCadastros'));
const FinanceiroRelatorios = lazy(() => import('./pages/FinanceiroRelatorios'));
const FinanceiroExecutivoGrupo = lazy(() => import('./pages/FinanceiroExecutivoGrupo'));
const FinanceiroFluxoConsolidado = lazy(() => import('./pages/FinanceiroFluxoConsolidado'));
const FinanceiroDre = lazy(() => import('./pages/FinanceiroDre'));
const FinanceiroDiagnosticoDre = lazy(() => import('./pages/FinanceiroDiagnosticoDre'));
const FinanceiroIntercompany = lazy(() => import('./pages/FinanceiroIntercompany'));
const FinanceiroEndividamento = lazy(() => import('./pages/FinanceiroEndividamento'));
const FinanceiroFinanciamentosBancarios = lazy(() => import('./pages/FinanceiroFinanciamentosBancarios'));
const FinanceiroRelatorioAnalitico = lazy(() => import('./pages/FinanceiroRelatorioAnalitico'));
const FinanceiroObras = lazy(() => import('./pages/FinanceiroObras'));
const FinanceiroBaixas = lazy(() => import('./pages/FinanceiroBaixas'));
const FinanceiroConciliacao = lazy(() => import('./pages/FinanceiroConciliacao'));
const FinanceiroBancos = lazy(() => import('./pages/FinanceiroBancos'));
const FinanceiroCaixas = lazy(() => import('./pages/FinanceiroCaixas'));
const FinanceiroResultadoObras = lazy(() => import('./pages/FinanceiroResultadoObras'));
const FinanceiroResultadoCentrosCusto = lazy(() => import('./pages/FinanceiroResultadoCentrosCusto'));
const CustosRecebiveis = lazy(() => import('./modules/custosRecebiveis/pages/CustosRecebiveis'));
  const ModuloRelatorios = lazy(() => import('./pages/ModuloRelatorios'));
  const ComprasRelatorioCategoriasInsumos = lazy(() => import('./pages/ComprasRelatorioCategoriasInsumos'));
  const ComprasRelatorioComprasDiretas = lazy(() => import('./pages/ComprasRelatorioComprasDiretas'));
  const ComprasRelatorioComprasFornecedor = lazy(() => import('./pages/ComprasRelatorioComprasFornecedor'));
  const ComprasRelatorioDemandaPedidos = lazy(() => import('./pages/ComprasRelatorioDemandaPedidos'));
  const ComprasRelatorioEvolucao = lazy(() => import('./pages/ComprasRelatorioEvolucao'));
  const ComprasRelatorioPendenciasCotacoes = lazy(() => import('./pages/ComprasRelatorioPendenciasCotacoes'));
  const ComprasRelatorioPrecosInsumos = lazy(() => import('./pages/ComprasRelatorioPrecosInsumos'));
  const ComprasRelatorioCiclo = lazy(() => import('./pages/ComprasRelatorioCiclo'));
const ComprasRelatorioEconomiaCotacoes = lazy(() => import('./pages/ComprasRelatorioEconomiaCotacoes'));
const ComprasRelatorioFornecedores = lazy(() => import('./pages/ComprasRelatorioFornecedores'));
const Obras = lazy(() => import('./pages/Obras'));
const ObraGestao = lazy(() => import('./pages/ObraGestao'));
const RelatoriosAdministrativos = lazy(() => import('./pages/RelatoriosAdministrativos'));
const Setores = lazy(() => import('./pages/Setores'));
const TiposSolicitacao = lazy(() => import('./pages/TiposSolicitacao'));
const GestaoContratos = lazy(() => import('./pages/GestaoContratos'));
const ContratosRelatorioOperacional = lazy(() => import('./pages/ContratosRelatorioOperacional'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const ConfiguracoesSuporte = lazy(() => import('./pages/ConfiguracoesSuporte'));
const ConfiguracoesVisibilidadeUi = lazy(() => import('./pages/ConfiguracoesVisibilidadeUi'));
const EmpresasGrupo = lazy(() => import('./pages/EmpresasGrupo'));
const TiposSubContrato = lazy(() => import('./pages/TiposSubContrato'));
const StatusSetor = lazy(() => import('./pages/StatusSetor'));
const Perfil = lazy(() => import('./pages/Perfil'));
const PermissoesSetor = lazy(() => import('./pages/PermissoesSetor'));
const CoresSistema = lazy(() => import('./pages/CoresSistema'));
const AreasObra = lazy(() => import('./pages/AreasObra'));
const ObraTipoApropriacao = lazy(() => import('./pages/ObraTipoApropriacao'));
const ContratoObraCategorias = lazy(() => import('./pages/ContratoObraCategorias'));
const ContratoFluxoNovo = lazy(() => import('./pages/ContratoFluxoNovo'));
const AreasPorSetorOrigem = lazy(() => import('./pages/AreasPorSetorOrigem'));
const SetoresVisiveisUsuario = lazy(() => import('./pages/SetoresVisiveisUsuario'));
const ComportamentoRecebimentoSetor = lazy(() => import('./pages/ComportamentoRecebimentoSetor'));
const TimeoutInatividade = lazy(() => import('./pages/TimeoutInatividade'));
const TiposSolicitacaoPorSetor = lazy(() => import('./pages/TiposSolicitacaoPorSetor'));
const TiposSolicitacaoPorDestino = lazy(() => import('./pages/TiposSolicitacaoPorDestino'));
const NovaSolicitacaoCamposConfig = lazy(() => import('./pages/NovaSolicitacaoCamposConfig'));
const NovaSolicitacaoAutomacaoDestinoConfig = lazy(() => import('./pages/NovaSolicitacaoAutomacaoDestinoConfig'));
const TiposCompartilhadosSetor = lazy(() => import('./pages/TiposCompartilhadosSetor'));
const AutomacaoStatusSetor = lazy(() => import('./pages/AutomacaoStatusSetor'));
const AprovacaoSolicitacaoPorTipo = lazy(() => import('./pages/AprovacaoSolicitacaoPorTipo'));
const SetoresCriacaoTodasObras = lazy(() => import('./pages/SetoresCriacaoTodasObras'));
const SetoresAcessoTodasObras = lazy(() => import('./pages/SetoresAcessoTodasObras'));
const UsuariosEnvioQualquerSetor = lazy(() => import('./pages/UsuariosEnvioQualquerSetor'));
const UsuariosAcessoFinanceiro = lazy(() => import('./pages/UsuariosAcessoFinanceiro'));
const UsuariosAcessoPrioridadeDiretoria = lazy(() => import('./pages/UsuariosAcessoPrioridadeDiretoria'));
const UsuariosPermissoesRhDp = lazy(() => import('./pages/UsuariosPermissoesRhDp'));
const PermissoesAreas = lazy(() => import('./pages/PermissoesAreas'));
const PermissoesAreasPadroes = lazy(() => import('./pages/PermissoesAreasPadroes'));
const ComunicacaoInterna = lazy(() => import('./pages/ComunicacaoInterna'));
const PrioridadesDiretoria = lazy(() => import('./pages/PrioridadesDiretoria'));
const ArquivosModelos = lazy(() => import('./pages/ArquivosModelos'));
const ArquivosModelosConfig = lazy(() => import('./pages/ArquivosModelosConfig'));
const Treinamento = lazy(() => import('./pages/Treinamento'));
const ConfiguracoesCotacao = lazy(() => import('./pages/ConfiguracoesCotacao'));
const ConfiguracoesStatusPedidoCompra = lazy(() => import('./pages/ConfiguracoesStatusPedidoCompra'));
const ConfiguracoesComercialCategorias = lazy(() => import('./pages/ConfiguracoesComercialCategorias'));
const ConfiguracoesProvisionamentoFluxo = lazy(() => import('./pages/ConfiguracoesProvisionamentoFluxo'));
const ConfiguracoesModulos = lazy(() => import('./pages/ConfiguracoesModulos'));
const ConfiguracoesNotificacoesSistema = lazy(() => import('./pages/ConfiguracoesNotificacoesSistema'));
const ConfiguracoesContratoAlertasEFormas = lazy(() => import('./pages/ConfiguracoesContratoAlertasEFormas'));
const CartoesRecarga = lazy(() => import('./pages/CartoesRecarga'));
const ConfiguracoesAcoesPrincipais = lazy(() => import('./pages/ConfiguracoesAcoesPrincipais'));
const ConfiguracoesAtalhosSetor = lazy(() => import('./pages/ConfiguracoesAtalhosSetor'));
const ConfiguracoesDetalheLayout = lazy(() => import('./pages/ConfiguracoesDetalheLayout'));
const Parceiros = lazy(() => import('./pages/Parceiros'));
const ParceiroCategorias = lazy(() => import('./pages/ParceiroCategorias'));
const ComercialEmpreendimentos = lazy(() => import('./pages/ComercialEmpreendimentos'));
const ComercialUnidades = lazy(() => import('./pages/ComercialUnidades'));
const ComercialContratos = lazy(() => import('./pages/ComercialContratos'));
const ComercialModelosContrato = lazy(() => import('./pages/ComercialModelosContrato'));
const ComercialTabelasPreco = lazy(() => import('./pages/ComercialTabelasPreco'));
const ComercialMapaUnidades = lazy(() => import('./pages/ComercialMapaUnidades'));
const ComercialRelatorioOperacional = lazy(() => import('./pages/ComercialRelatorioOperacional'));
const DashboardProvisionamentoFinanceiro = lazy(() => import('./modules/provisionamento-financeiro/pages/DashboardProvisionamentoFinanceiro'));
const ProvisionamentoRelatorioOperacional = lazy(() => import('./modules/provisionamento-financeiro/pages/ProvisionamentoRelatorioOperacional'));
const ProvisionamentosFinanceiros = lazy(() => import('./modules/provisionamento-financeiro/pages/ProvisionamentosFinanceiros'));
const NovaProvisaoFinanceira = lazy(() => import('./modules/provisionamento-financeiro/pages/NovaProvisaoFinanceira'));
const ProvisionamentoFinanceiroDetalhe = lazy(() => import('./modules/provisionamento-financeiro/pages/ProvisionamentoFinanceiroDetalhe'));
const GestaoCategoriasMacro = lazy(() => import('./modules/provisionamento-financeiro/pages/GestaoCategoriasMacro'));
const RhDpColaboradores = lazy(() => import('./pages/RhDpColaboradores'));
const RhDpPessoal = lazy(() => import('./pages/RhDpPessoal'));
const RhDpDocumentos = lazy(() => import('./pages/RhDpDocumentos'));
const RhDpImportacoes = lazy(() => import('./pages/RhDpImportacoes'));
const RhDpFechamentos = lazy(() => import('./pages/RhDpFechamentos'));
const RhDpRelatorioOperacional = lazy(() => import('./pages/RhDpRelatorioOperacional'));
const SolicitacoesCompra = lazy(() => import('./modules/solicitacao-compra/pages/SolicitacoesCompra'));
const CotacaoFornecedorPublica = lazy(() => import('./modules/solicitacao-compra/pages/CotacaoFornecedorPublica'));
const SolicitacaoCompraDetalhe = lazy(() => import('./modules/solicitacao-compra/pages/SolicitacaoCompraDetalheView'));
const GerenciarCotacaoSolicitacao = lazy(() => import('./modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao'));
const NovaSolicitacaoCompra = lazy(() => import('./modules/solicitacao-compra/pages/NovaSolicitacaoCompra'));
const RevisarSolicitacaoCompra = lazy(() => import('./modules/solicitacao-compra/pages/RevisarSolicitacaoCompra'));
const RevisarSolicitacaoCompraFinal = lazy(() => import('./modules/solicitacao-compra/pages/RevisarSolicitacaoCompraFinal'));
const NovaCompraDireta = lazy(() => import('./modules/solicitacao-compra/pages/NovaCompraDireta'));
const RevisarCompraDireta = lazy(() => import('./modules/solicitacao-compra/pages/RevisarCompraDireta'));
const GestaoApropriacoes = lazy(() => import('./modules/solicitacao-compra/pages/GestaoApropriacoes'));
const GestaoInsumos = lazy(() => import('./modules/solicitacao-compra/pages/GestaoInsumos'));
const GestaoCategorias = lazy(() => import('./modules/solicitacao-compra/pages/GestaoCategorias'));
const GestaoUnidades = lazy(() => import('./modules/solicitacao-compra/pages/GestaoUnidades'));
const PedidosCompra = lazy(() => import('./modules/solicitacao-compra/pages/PedidosCompra'));
const PedidoCompraDetalhe = lazy(() => import('./modules/solicitacao-compra/pages/PedidoCompraDetalhe'));
const ComprasDelegacao = lazy(() => import('./modules/solicitacao-compra/pages/ComprasDelegacao'));
const GestaoFornecedores = lazy(() => import('./modules/solicitacao-compra/pages/GestaoFornecedores'));
const ListaCotacoes = lazy(() => import('./modules/solicitacao-compra/pages/ListaCotacoes'));
const CrmLeads = lazy(() => import('./modules/crm/pages/CrmLeads'));
const CrmKanban = lazy(() => import('./modules/crm/pages/CrmKanban'));
const CrmLeadDetalhe = lazy(() => import('./modules/crm/pages/CrmLeadDetalhe'));
const CrmNovoLead = lazy(() => import('./modules/crm/pages/CrmNovoLead'));
const CrmDashboard = lazy(() => import('./modules/crm/pages/CrmDashboard'));
const CrmDashboardGerencial = lazy(() => import('./modules/crm/pages/CrmDashboardGerencial'));
const CrmDashboardSla = lazy(() => import('./modules/crm/pages/CrmDashboardSla'));
const CrmDashboardDistribuicao = lazy(() => import('./modules/crm/pages/CrmDashboardDistribuicao'));
const CrmRelatorioExecutivo = lazy(() => import('./pages/CrmRelatorioExecutivo'));
const CrmTarefas = lazy(() => import('./modules/crm/pages/CrmTarefas'));
const CrmCarteira = lazy(() => import('./modules/crm/pages/CrmCarteira'));
const CrmInbox = lazy(() => import('./modules/crm/pages/CrmInbox'));
const CrmAutomacoes = lazy(() => import('./modules/crm/pages/CrmAutomacoes'));
const CrmAdminCanais = lazy(() => import('./modules/crm/pages/CrmAdminCanais'));
const CrmAdminNumeros = lazy(() => import('./modules/crm/pages/CrmAdminNumeros'));
const CrmAdminIntegracoes = lazy(() => import('./modules/crm/pages/CrmAdminIntegracoes'));
const FiscalDashboard = lazy(() => import('./modules/fiscal/pages/FiscalDashboard'));
const FiscalCompanies = lazy(() => import('./modules/fiscal/pages/FiscalCompanies'));
const FiscalDiagnostics = lazy(() => import('./modules/fiscal/pages/FiscalDiagnostics'));
const FiscalDocuments = lazy(() => import('./modules/fiscal/pages/FiscalDocuments'));
const FiscalDocumentDetail = lazy(() => import('./modules/fiscal/pages/FiscalDocumentDetail'));
const FiscalDivergences = lazy(() => import('./modules/fiscal/pages/FiscalDivergences'));
const FiscalAccountingBatches = lazy(() => import('./modules/fiscal/pages/FiscalAccountingBatches'));
const FiscalLogs = lazy(() => import('./modules/fiscal/pages/FiscalLogs'));
const FiscalOperationalReport = lazy(() => import('./modules/fiscal/pages/FiscalOperationalReport'));
const SstDashboard = lazy(() => import('./modules/sst/pages/SstDashboard'));
const SstCrudPage = lazy(() => import('./modules/sst/pages/SstCrudPage'));
const SstConfiguracoes = lazy(() => import('./modules/sst/pages/SstConfiguracoes'));
const SstExecutivo = lazy(() => import('./modules/sst/pages/SstExecutivo'));
const SstCentroOperacional = lazy(() => import('./modules/sst/pages/SstCentroOperacional'));
const SstHeatmap = lazy(() => import('./modules/sst/pages/SstHeatmap'));
const SstRelatorioOperacional = lazy(() => import('./modules/sst/pages/SstRelatorioOperacional'));
const SstTimeline = lazy(() => import('./modules/sst/pages/SstTimeline'));
const SstObservabilidade = lazy(() => import('./modules/sst/pages/SstObservabilidade'));
const SstProducaoMonitoramento = lazy(() => import('./modules/sst/pages/SstProducaoMonitoramento'));
const SstObservabilidadeAvancada = lazy(() => import('./modules/sst/pages/SstObservabilidadeAvancada'));
const SstEsocial = lazy(() => import('./modules/sst/pages/SstEsocial'));
const GovernancaSistema = lazy(() => import('./modules/governanca/pages/GovernancaSistema'));
const AuditoriaOperacional = lazy(() => import('./modules/governanca/pages/AuditoriaOperacional'));

function PublicPage({ children }) {
  return (
    <Suspense fallback={<AppRouteFallback fullScreen />}>
      {children}
    </Suspense>
  );
}

function GestaoUsuariosRoute({ children }) {
  const { user } = useAuth();
  if (!canManageUsers(user)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function SuperadminRoute({ children }) {
  const { user } = useAuth();
  if (!isSuperadmin(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function BusinessAdminRoute({ children }) {
  const { user } = useAuth();
  if (!isBusinessAdmin(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ConfiguracoesRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessConfiguracoes(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function EmpresasGrupoRoute({ children }) {
  const { user } = useAuth();
  if (!canManageConfiguracoesArea(user, 'cadastros') && !canAccessRhDpEmpresas(user)) {
    return <Navigate to="/configuracoes" replace />;
  }
  return children;
}

function ConfiguracoesAreaRoute({ area, children }) {
  const { user } = useAuth();
  if (!canManageConfiguracoesArea(user, area)) {
    return <Navigate to="/configuracoes" replace />;
  }
  return children;
}

function EnabledModuleRoute({ moduleKey, children }) {
  const { user } = useAuth();
  if (!hasEnabledModule(user, moduleKey)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CustosRecebiveisRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessCustosRecebiveis(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function DashboardRoute() {
  const { user } = useAuth();
  if (!canAccessDashboard(user)) {
    return <Navigate to="/" replace />;
  }
  return <Dashboard />;
}

function SolicitacoesRelatoriosRoute({ children }) {
  const { user } = useAuth();
  if (!canViewSolicitacoesRelatorios(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function SolicitacoesRelatorioOperacionalRoute({ children }) {
  const { user } = useAuth();
  if (!canViewSolicitacoesRelatorioOperacional(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ModuloComprasRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessCompras(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CompraSolicitacoesRoute({ children }) {
  const { user } = useAuth();
  if (!canViewCompraSolicitacoes(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CompraSolicitacaoCreateRoute({ children }) {
  const { user } = useAuth();
  if (!canCreateCompraSolicitacao(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CompraSolicitacaoCreateFlowRoute({ children }) {
  const { user } = useAuth();
  if (!canCreateCompraSolicitacao(user) && !canViewCompraSolicitacoes(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CompraSolicitacoesManageRoute({ children }) {
  const { user } = useAuth();
  if (!canManageCompraSolicitacoes(user)) {
    return <Navigate to="/solicitacoes-compra" replace />;
  }
  return children;
}

function ComprasPedidosRoute({ children }) {
  const { user } = useAuth();
  if (!canViewComprasPedidos(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComprasDelegacaoRoute({ children }) {
  const { user } = useAuth();
  if (!canViewComprasDelegacao(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComprasFornecedoresRoute({ children }) {
  const { user } = useAuth();
  if (!canViewComprasFornecedores(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComprasRelatoriosRoute({ children }) {
  const { user } = useAuth();
  if (!canViewComprasRelatorios(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComprasConfiguracoesRoute({ children }) {
  const { user } = useAuth();
  if (!canManageComprasConfiguracoes(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComprasCotacoesRoute({ children }) {
  const { user } = useAuth();
  if (!canViewComprasCotacoes(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComprasCotacoesManageRoute({ children }) {
  const { user } = useAuth();
  if (!canManageComprasCotacoes(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function FinanceiroRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessFinanceiro(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function FinanceiroPagamentosRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessPagamentos(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function FinanceiroDdaRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessFinanceiroDda(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function FinanceiroRelatoriosRoute({ children }) {
  const { user } = useAuth();
  if (!canViewFinanceiroRelatorios(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function FinanceiroRelatorioRoute({ children, permissionKey }) {
  const { user } = useAuth();
  if (!canViewFinanceiroRelatorio(user, permissionKey)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function BoletosRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessBoletos(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComunicacaoRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessComunicacao(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function BibliotecaRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessBiblioteca(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function TreinamentoRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessTreinamento(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CadastroObrasRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessCadastroObras(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CrmDashboardRoute({ children }) {
  const { user } = useAuth();
  if (!canViewCrmDashboard(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CrmLeadsRoute({ children }) {
  const { user } = useAuth();
  if (!canViewCrmLeads(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CrmLeadsCreateRoute({ children }) {
  const { user } = useAuth();
  if (!canCreateCrmLeads(user)) {
    return <Navigate to="/crm/leads" replace />;
  }
  return children;
}

function CrmAtendimentoRoute({ children }) {
  const { user } = useAuth();
  if (!canViewCrmAtendimento(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CrmAutomacoesRoute({ children }) {
  const { user } = useAuth();
  if (!canViewCrmAutomacoes(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function CrmConfiguracoesRoute({ children }) {
  const { user } = useAuth();
  if (!canViewCrmConfiguracoes(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function FiscalRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessFiscal(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function FiscalConfigRoute({ children }) {
  const { user } = useAuth();
  if (!canManageFiscalConfig(user)) {
    return <Navigate to="/fiscal" replace />;
  }
  return children;
}

function FiscalDocumentsRoute({ children }) {
  const { user } = useAuth();
  if (!canViewFiscalDocuments(user)) {
    return <Navigate to="/fiscal" replace />;
  }
  return children;
}

function FiscalLogsRoute({ children }) {
  const { user } = useAuth();
  if (!canViewFiscalLogs(user)) {
    return <Navigate to="/fiscal" replace />;
  }
  return children;
}

function SstRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessSst(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function getSstSimplifiedEntry(user) {
  const firstResource = SST_NAV.find(([resource]) => canViewSstArea(user, resource));
  return firstResource ? `/sst/${firstResource[0]}` : '/';
}

function SstDashboardRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessSst(user)) {
    return <Navigate to="/" replace />;
  }
  if (SST_SIMPLIFIED_MODE) {
    return <Navigate to={getSstSimplifiedEntry(user)} replace />;
  }
  if (!canViewSstDashboard(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function SstAreaRoute({ area, children }) {
  const { user } = useAuth();
  if (!canAccessSst(user)) {
    return <Navigate to="/" replace />;
  }
  if (!canViewSstArea(user, area)) {
    return <Navigate to={SST_SIMPLIFIED_MODE ? getSstSimplifiedEntry(user) : '/sst'} replace />;
  }
  return children;
}

function SstLegacyRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessSst(user)) {
    return <Navigate to="/" replace />;
  }
  if (SST_SIMPLIFIED_MODE) {
    return <Navigate to={getSstSimplifiedEntry(user)} replace />;
  }
  return children;
}

function SstConfigRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessSst(user)) {
    return <Navigate to="/" replace />;
  }
  if (SST_SIMPLIFIED_MODE) {
    return <Navigate to={getSstSimplifiedEntry(user)} replace />;
  }
  if (!canManageSstArea(user, 'configuracoes')) {
    return <Navigate to="/sst" replace />;
  }
  return children;
}

function GovernancaSistemaRoute({ children }) {
  const { user } = useAuth();
  if (!canViewSystemGovernance(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AuditoriaOperacionalRoute({ children }) {
  const { user } = useAuth();
  if (!canViewOperationalAudit(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function PrioridadesDiretoriaRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessPrioridadesDiretoria(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function GestaoObrasRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessGestaoObras(user)) {
    return <Navigate to="/obras" replace />;
  }
  return children;
}

function ContratosRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessContratos(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComercialRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessComercial(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComercialEmpreendimentosRoute({ children }) {
  const { user } = useAuth();
  if (!canViewComercialEmpreendimentos(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ComercialContratosRoute({ children }) {
  const { user } = useAuth();
  if (!canViewComercialContratos(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ProvisionamentosRoute({ children }) {
  const { user } = useAuth();
  if (!canViewProvisionamentos(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ProvisionamentosCreateRoute({ children }) {
  const { user } = useAuth();
  if (!canCreateProvisionamentos(user)) {
    return <Navigate to="/provisoes-financeiras" replace />;
  }
  return children;
}

function ProvisionamentosDashboardRoute({ children }) {
  const { user } = useAuth();
  if (!canViewProvisionamentosDashboard(user)) {
    return <Navigate to="/provisoes-financeiras" replace />;
  }
  return children;
}

function ProvisionamentosCategoriasRoute({ children }) {
  const { user } = useAuth();
  if (!canManageProvisionamentoCategorias(user)) {
    return <Navigate to="/provisoes-financeiras" replace />;
  }
  return children;
}

function RhDpDashboardRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessRhDpDashboard(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function RhDpColaboradoresRoute({ children }) {
  const { user } = useAuth();
  if (!canViewRhDpColaboradores(user)) {
    return <Navigate to="/hub/rhdp" replace />;
  }
  return children;
}

function RhDpCadastroColaboradoresRoute({ children }) {
  const { user } = useAuth();
  if (!canAccessRhDpCadastroColaboradores(user)) {
    return <Navigate to="/rh-dp/pessoal?aba=colaboradores" replace />;
  }
  return children;
}

function RhDpDocumentosRoute({ children }) {
  const { user } = useAuth();
  if (!canViewRhDpDocumentos(user)) {
    return <Navigate to="/hub/rhdp" replace />;
  }
  return children;
}

function RhDpImportacoesRoute({ children }) {
  const { user } = useAuth();
  if (!canExecuteRhDpImportacoes(user)) {
    return <Navigate to="/hub/rhdp" replace />;
  }
  return children;
}

function RhDpFinanceiroRoute({ children }) {
  const { user } = useAuth();
  if (!canViewRhDpObrigacoes(user)) {
    return <Navigate to="/hub/rhdp" replace />;
  }
  if (!hasEnabledModule(user, 'FINANCEIRO')) {
    return <Navigate to="/hub/rhdp" replace />;
  }
  return children;
}


export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={(
          <PublicPage>
            <Login />
          </PublicPage>
        )}
      />
      <Route
        path="/recuperar-senha"
        element={(
          <PublicPage>
            <RecuperarSenha />
          </PublicPage>
        )}
      />
      <Route
        path="/definir-senha"
        element={(
          <PublicPage>
            <DefinirSenha />
          </PublicPage>
        )}
      />
      <Route
        path="/cotacao/:token"
        element={(
          <PublicPage>
            <CotacaoFornecedorPublica />
          </PublicPage>
        )}
      />

      <Route
        path="/"
        element={(
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        )}
      >
        {/* Hub Principal (nível 1) e hubs de módulo (nível 2). O
            Dashboard executivo, antes na raiz, vive agora em /dashboard. */}
        <Route index element={<HomeHub />} />
        <Route path="hub/:moduleId" element={<ModuleHub />} />
        <Route path="dashboard" element={<DashboardRoute />} />

        <Route path="solicitacoes" element={<Solicitacoes />} />
        <Route path="solicitacoes/relatorios" element={<SolicitacoesRelatoriosRoute><ModuloRelatorios modulo="solicitacoes" /></SolicitacoesRelatoriosRoute>} />
        <Route path="solicitacoes/relatorios/operacional" element={<SolicitacoesRelatorioOperacionalRoute><SolicitacoesRelatorioOperacional /></SolicitacoesRelatorioOperacionalRoute>} />
        <Route path="solicitacoes-sla-setor" element={<BusinessAdminRoute><SolicitacoesSlaSetor /></BusinessAdminRoute>} />
        <Route path="solicitacoes-arquivadas" element={<SolicitacoesArquivadas />} />
        <Route path="solicitacoes/:id" element={<SolicitacaoDetalhe />} />
        <Route path="prioridades-diretoria" element={<PrioridadesDiretoriaRoute><PrioridadesDiretoria /></PrioridadesDiretoriaRoute>} />
        <Route path="comunicacao-interna" element={<ComunicacaoRoute><ComunicacaoInterna /></ComunicacaoRoute>} />
        <Route path="conversas/:id" element={<ComunicacaoRoute><ComunicacaoInterna /></ComunicacaoRoute>} />
        <Route path="arquivos-modelos" element={<BibliotecaRoute><ArquivosModelos /></BibliotecaRoute>} />
        <Route path="treinamento" element={<EnabledModuleRoute moduleKey="TREINAMENTO"><TreinamentoRoute><Treinamento /></TreinamentoRoute></EnabledModuleRoute>} />

        <Route path="nova-solicitacao" element={<NovaSolicitacao />} />

        <Route path="usuarios" element={<GestaoUsuariosRoute><Usuarios /></GestaoUsuariosRoute>} />
        <Route path="usuarios/novo" element={<GestaoUsuariosRoute><UsuarioNovo /></GestaoUsuariosRoute>} />
        <Route path="usuarios/:id" element={<GestaoUsuariosRoute><UsuarioNovo /></GestaoUsuariosRoute>} />
        <Route path="usuarios/:id/editar" element={<GestaoUsuariosRoute><UsuarioNovo /></GestaoUsuariosRoute>} />

        <Route path="obras" element={<CadastroObrasRoute><Obras /></CadastroObrasRoute>} />
        <Route path="obras/:id" element={<GestaoObrasRoute><ObraGestao /></GestaoObrasRoute>} />
        <Route path="setores" element={<ConfiguracoesAreaRoute area="cadastros"><Setores /></ConfiguracoesAreaRoute>} />
        <Route path="tipos-solicitacao" element={<ConfiguracoesAreaRoute area="cadastros"><TiposSolicitacao /></ConfiguracoesAreaRoute>} />
        <Route path="gestao-contratos" element={<ContratosRoute><GestaoContratos /></ContratosRoute>} />
        <Route path="configuracoes" element={<ConfiguracoesRoute><Configuracoes /></ConfiguracoesRoute>} />
        <Route path="configuracoes-suporte" element={<ConfiguracoesAreaRoute area="aparencia"><ConfiguracoesSuporte /></ConfiguracoesAreaRoute>} />
        <Route path="configuracoes-visibilidade-ui" element={<ConfiguracoesAreaRoute area="aparencia"><ConfiguracoesVisibilidadeUi /></ConfiguracoesAreaRoute>} />
        {/*
          D2 (02/09): com o RH/DP apontando para ca, quem tinha acesso APENAS
          por rh_dp.empresas.gerenciar perderia a tela na unificacao. O guarda
          soma as duas permissoes — redirecionar nao pode tirar acesso de
          ninguem.
        */}
        <Route path="empresas-grupo" element={<EmpresasGrupoRoute><EmpresasGrupo /></EmpresasGrupoRoute>} />
        <Route path="tipos-sub-contrato" element={<ConfiguracoesAreaRoute area="cadastros"><TiposSubContrato /></ConfiguracoesAreaRoute>} />
        <Route path="status-setor" element={<ConfiguracoesAreaRoute area="status_vinculos"><StatusSetor /></ConfiguracoesAreaRoute>} />
        <Route path="permissoes-setor" element={<ConfiguracoesAreaRoute area="status_vinculos"><PermissoesSetor /></ConfiguracoesAreaRoute>} />
        <Route path="cores-sistema" element={<ConfiguracoesAreaRoute area="aparencia"><CoresSistema /></ConfiguracoesAreaRoute>} />
        <Route path="areas-obra" element={<ConfiguracoesAreaRoute area="status_vinculos"><AreasObra /></ConfiguracoesAreaRoute>} />
        <Route path="obra-tipo-apropriacao" element={<ConfiguracoesAreaRoute area="status_vinculos"><ObraTipoApropriacao /></ConfiguracoesAreaRoute>} />
        <Route path="contrato-obra-categorias" element={<ConfiguracoesAreaRoute area="geral"><ContratoObraCategorias /></ConfiguracoesAreaRoute>} />
        <Route path="contratos/novo" element={<ContratoFluxoNovo />} />
        <Route path="areas-por-setor-origem" element={<ConfiguracoesAreaRoute area="status_vinculos"><AreasPorSetorOrigem /></ConfiguracoesAreaRoute>} />
        <Route path="setores-visiveis-usuario" element={<ConfiguracoesAreaRoute area="status_vinculos"><SetoresVisiveisUsuario /></ConfiguracoesAreaRoute>} />
        <Route path="comportamento-recebimento-setor" element={<ConfiguracoesAreaRoute area="status_vinculos"><ComportamentoRecebimentoSetor /></ConfiguracoesAreaRoute>} />
        <Route path="timeout-inatividade" element={<ConfiguracoesAreaRoute area="status_vinculos"><TimeoutInatividade /></ConfiguracoesAreaRoute>} />
        <Route path="tipos-solicitacao-por-setor" element={<ConfiguracoesAreaRoute area="status_vinculos"><TiposSolicitacaoPorSetor /></ConfiguracoesAreaRoute>} />
        <Route path="tipos-solicitacao-por-destino" element={<ConfiguracoesAreaRoute area="status_vinculos"><TiposSolicitacaoPorDestino /></ConfiguracoesAreaRoute>} />
        <Route path="nova-solicitacao-campos" element={<ConfiguracoesAreaRoute area="solicitacoes"><NovaSolicitacaoCamposConfig /></ConfiguracoesAreaRoute>} />
        <Route path="nova-solicitacao-automacao-destino" element={<ConfiguracoesAreaRoute area="solicitacoes"><NovaSolicitacaoAutomacaoDestinoConfig /></ConfiguracoesAreaRoute>} />
        <Route path="tipos-compartilhados-setor" element={<ConfiguracoesAreaRoute area="status_vinculos"><TiposCompartilhadosSetor /></ConfiguracoesAreaRoute>} />
        <Route path="automacao-status-setor" element={<ConfiguracoesAreaRoute area="status_vinculos"><AutomacaoStatusSetor /></ConfiguracoesAreaRoute>} />
        <Route path="aprovacao-solicitacao-por-tipo" element={<ConfiguracoesAreaRoute area="status_vinculos"><AprovacaoSolicitacaoPorTipo /></ConfiguracoesAreaRoute>} />
        <Route path="configuracoes-acoes-principais" element={<ConfiguracoesAreaRoute area="status_vinculos"><ConfiguracoesAcoesPrincipais /></ConfiguracoesAreaRoute>} />
        <Route path="configuracoes-atalhos-setor" element={<ConfiguracoesAreaRoute area="status_vinculos"><ConfiguracoesAtalhosSetor /></ConfiguracoesAreaRoute>} />
        <Route path="configuracoes-detalhe-layout" element={<ConfiguracoesAreaRoute area="status_vinculos"><ConfiguracoesDetalheLayout /></ConfiguracoesAreaRoute>} />
        <Route path="setores-criacao-todas-obras" element={<ConfiguracoesAreaRoute area="status_vinculos"><SetoresCriacaoTodasObras /></ConfiguracoesAreaRoute>} />
        <Route path="setores-acesso-todas-obras" element={<ConfiguracoesAreaRoute area="status_vinculos"><SetoresAcessoTodasObras /></ConfiguracoesAreaRoute>} />
        <Route path="usuarios-envio-qualquer-setor" element={<ConfiguracoesAreaRoute area="status_vinculos"><UsuariosEnvioQualquerSetor /></ConfiguracoesAreaRoute>} />
        <Route path="usuarios-acesso-financeiro" element={<ConfiguracoesAreaRoute area="status_vinculos"><UsuariosAcessoFinanceiro /></ConfiguracoesAreaRoute>} />
        <Route path="usuarios-acesso-prioridade-diretoria" element={<ConfiguracoesAreaRoute area="status_vinculos"><UsuariosAcessoPrioridadeDiretoria /></ConfiguracoesAreaRoute>} />
        <Route path="usuarios-permissoes-rh-dp" element={<ConfiguracoesAreaRoute area="status_vinculos"><UsuariosPermissoesRhDp /></ConfiguracoesAreaRoute>} />
        <Route path="permissoes-areas" element={<ConfiguracoesAreaRoute area="permissoes"><PermissoesAreas /></ConfiguracoesAreaRoute>} />
        <Route path="permissoes-areas-padroes" element={<ConfiguracoesAreaRoute area="permissoes"><PermissoesAreasPadroes /></ConfiguracoesAreaRoute>} />
        <Route path="governanca" element={<GovernancaSistemaRoute><GovernancaSistema /></GovernancaSistemaRoute>} />
        <Route path="governanca/auditoria-operacional" element={<AuditoriaOperacionalRoute><AuditoriaOperacional /></AuditoriaOperacionalRoute>} />
        <Route path="arquivos-modelos-config" element={<SuperadminRoute><ArquivosModelosConfig /></SuperadminRoute>} />
        <Route path="configuracoes-cotacao" element={<EnabledModuleRoute moduleKey="COMPRAS"><EnabledModuleRoute moduleKey="COTACOES"><ComprasConfiguracoesRoute><ConfiguracoesCotacao /></ComprasConfiguracoesRoute></EnabledModuleRoute></EnabledModuleRoute>} />
        <Route path="configuracoes-status-pedidos-compra" element={<EnabledModuleRoute moduleKey="COMPRAS"><ComprasConfiguracoesRoute><ConfiguracoesStatusPedidoCompra /></ComprasConfiguracoesRoute></EnabledModuleRoute>} />
        <Route path="configuracoes-comercial-categorias" element={<EnabledModuleRoute moduleKey="COMERCIAL"><ConfiguracoesAreaRoute area="geral"><ConfiguracoesComercialCategorias /></ConfiguracoesAreaRoute></EnabledModuleRoute>} />
        <Route path="configuracoes-provisionamento-fluxo" element={<EnabledModuleRoute moduleKey="PROVISOES"><ConfiguracoesAreaRoute area="geral"><ConfiguracoesProvisionamentoFluxo /></ConfiguracoesAreaRoute></EnabledModuleRoute>} />
        <Route path="configuracoes-modulos" element={<ConfiguracoesAreaRoute area="modulos"><ConfiguracoesModulos /></ConfiguracoesAreaRoute>} />
        <Route path="configuracoes-notificacoes-sistema" element={<ConfiguracoesAreaRoute area="aparencia"><ConfiguracoesNotificacoesSistema /></ConfiguracoesAreaRoute>} />
        <Route path="configuracoes-contrato-alertas" element={<ConfiguracoesAreaRoute area="geral"><ConfiguracoesContratoAlertasEFormas /></ConfiguracoesAreaRoute>} />
        <Route path="configuracoes-formas-pagamento-solicitacao" element={<ConfiguracoesAreaRoute area="geral"><ConfiguracoesContratoAlertasEFormas /></ConfiguracoesAreaRoute>} />
        <Route path="configuracoes-cartoes-recarga" element={<SuperadminRoute><CartoesRecarga /></SuperadminRoute>} />
        <Route path="parceiros" element={<ConfiguracoesAreaRoute area="cadastros"><Parceiros /></ConfiguracoesAreaRoute>} />
        <Route path="parceiros-categorias" element={<ConfiguracoesAreaRoute area="cadastros"><ParceiroCategorias /></ConfiguracoesAreaRoute>} />
        <Route path="crm/dashboard" element={<CrmDashboardRoute><CrmDashboard /></CrmDashboardRoute>} />
        <Route path="crm/relatorios" element={<CrmDashboardRoute><ModuloRelatorios modulo="crm" /></CrmDashboardRoute>} />
        <Route path="crm/relatorios/executivo" element={<CrmDashboardRoute><CrmRelatorioExecutivo /></CrmDashboardRoute>} />
        <Route path="crm/dashboard-gerencial" element={<CrmDashboardRoute><CrmDashboardGerencial /></CrmDashboardRoute>} />
        <Route path="crm/dashboard-sla" element={<CrmDashboardRoute><CrmDashboardSla /></CrmDashboardRoute>} />
        <Route path="crm/dashboard-distribuicao" element={<CrmDashboardRoute><CrmDashboardDistribuicao /></CrmDashboardRoute>} />
        <Route path="crm/leads" element={<CrmLeadsRoute><CrmLeads /></CrmLeadsRoute>} />
        <Route path="crm/leads/novo" element={<CrmLeadsCreateRoute><CrmNovoLead /></CrmLeadsCreateRoute>} />
        <Route path="crm/leads/:id" element={<CrmLeadsRoute><CrmLeadDetalhe /></CrmLeadsRoute>} />
        <Route path="crm/kanban" element={<CrmLeadsRoute><CrmKanban /></CrmLeadsRoute>} />
        <Route path="crm/tarefas" element={<CrmLeadsRoute><CrmTarefas /></CrmLeadsRoute>} />
        <Route path="crm/carteira" element={<CrmLeadsRoute><CrmCarteira /></CrmLeadsRoute>} />
        <Route path="crm/inbox" element={<CrmAtendimentoRoute><CrmInbox /></CrmAtendimentoRoute>} />
        <Route path="crm/automacoes" element={<CrmAutomacoesRoute><CrmAutomacoes /></CrmAutomacoesRoute>} />
        <Route path="crm/admin/canais" element={<CrmConfiguracoesRoute><CrmAdminCanais /></CrmConfiguracoesRoute>} />
        <Route path="crm/admin/numeros" element={<CrmConfiguracoesRoute><CrmAdminNumeros /></CrmConfiguracoesRoute>} />
        <Route path="crm/admin/integracoes" element={<CrmConfiguracoesRoute><CrmAdminIntegracoes /></CrmConfiguracoesRoute>} />
        <Route path="fiscal" element={<FiscalRoute><FiscalDashboard /></FiscalRoute>} />
        <Route path="fiscal/relatorios" element={<FiscalRoute><ModuloRelatorios modulo="fiscal" /></FiscalRoute>} />
        <Route path="fiscal/relatorios/operacional" element={<FiscalDocumentsRoute><FiscalOperationalReport /></FiscalDocumentsRoute>} />
        <Route path="fiscal/empresas" element={<FiscalConfigRoute><FiscalCompanies /></FiscalConfigRoute>} />
        <Route path="fiscal/diagnostico" element={<FiscalConfigRoute><FiscalDiagnostics /></FiscalConfigRoute>} />
        <Route path="fiscal/documentos" element={<FiscalDocumentsRoute><FiscalDocuments /></FiscalDocumentsRoute>} />
        <Route path="fiscal/documentos/:id" element={<FiscalDocumentsRoute><FiscalDocumentDetail /></FiscalDocumentsRoute>} />
        <Route path="fiscal/divergencias" element={<FiscalDocumentsRoute><FiscalDivergences /></FiscalDocumentsRoute>} />
        <Route path="fiscal/exportacao-contabil" element={<FiscalDocumentsRoute><FiscalAccountingBatches /></FiscalDocumentsRoute>} />
        <Route path="fiscal/logs" element={<FiscalLogsRoute><FiscalLogs /></FiscalLogsRoute>} />
        <Route path="comercial/empreendimentos" element={<ComercialEmpreendimentosRoute><ComercialEmpreendimentos /></ComercialEmpreendimentosRoute>} />
        <Route path="comercial/relatorios" element={<ComercialRoute><ModuloRelatorios modulo="comercial" /></ComercialRoute>} />
        <Route path="comercial/relatorios/operacional" element={<ComercialContratosRoute><ComercialRelatorioOperacional /></ComercialContratosRoute>} />
        <Route path="comercial/unidades" element={<ComercialEmpreendimentosRoute><ComercialUnidades /></ComercialEmpreendimentosRoute>} />
        <Route path="comercial/tabelas-preco" element={<ComercialEmpreendimentosRoute><ComercialTabelasPreco /></ComercialEmpreendimentosRoute>} />
        <Route path="comercial/mapa-unidades" element={<ComercialEmpreendimentosRoute><ComercialMapaUnidades /></ComercialEmpreendimentosRoute>} />
        <Route path="comercial/contratos" element={<ComercialContratosRoute><ComercialContratos /></ComercialContratosRoute>} />
        <Route path="comercial/modelos-contrato" element={<ComercialContratosRoute><ComercialModelosContrato /></ComercialContratosRoute>} />
        <Route path="provisoes-financeiras" element={<ProvisionamentosRoute><ProvisionamentosFinanceiros /></ProvisionamentosRoute>} />
        <Route path="provisoes-financeiras/relatorios" element={<ProvisionamentosDashboardRoute><ModuloRelatorios modulo="provisionamento" /></ProvisionamentosDashboardRoute>} />
        <Route path="provisoes-financeiras/relatorios/operacional" element={<ProvisionamentosDashboardRoute><ProvisionamentoRelatorioOperacional /></ProvisionamentosDashboardRoute>} />
        <Route path="provisoes-financeiras/nova" element={<ProvisionamentosCreateRoute><NovaProvisaoFinanceira /></ProvisionamentosCreateRoute>} />
        <Route path="provisoes-financeiras/:id" element={<ProvisionamentosRoute><ProvisionamentoFinanceiroDetalhe /></ProvisionamentosRoute>} />
        <Route path="provisoes-financeiras/dashboard" element={<ProvisionamentosDashboardRoute><DashboardProvisionamentoFinanceiro /></ProvisionamentosDashboardRoute>} />
        <Route path="provisoes-financeiras/categorias" element={<ProvisionamentosCategoriasRoute><GestaoCategoriasMacro /></ProvisionamentosCategoriasRoute>} />
        {/*
          D3 (02/09): o RH/DP nao tem mais tela de "Inicio" propria — era um
          mural de sete cards que repetia o menu. O hub do modulo (/hub/rhdp)
          ja e o indice, e vale para todos os modulos. A rota antiga fica como
          redirecionamento: link salvo, favorito e atalho continuam chegando.
        */}
        <Route path="rh-dp" element={<Navigate to="/hub/rhdp" replace />} />
        <Route path="rh-dp/relatorios" element={<RhDpDashboardRoute><ModuloRelatorios modulo="rhdp" /></RhDpDashboardRoute>} />
        <Route path="rh-dp/relatorios/operacional" element={<RhDpDashboardRoute><RhDpRelatorioOperacional /></RhDpDashboardRoute>} />
        {/*
          D2 (02/09): Empresas do grupo passa a existir uma vez so, em
          Cadastros. Redirecionamento em vez de rota morta.
        */}
        <Route path="rh-dp/empresas" element={<Navigate to="/empresas-grupo" replace />} />
        <Route path="rh-dp/pessoal" element={<RhDpColaboradoresRoute><RhDpPessoal /></RhDpColaboradoresRoute>} />
        {/*
          D1 (02/09): Pessoal e a porta unica do dia a dia. Jornada e Apuracao
          sao o mesmo trabalho em sequencia e viraram abas de la — as rotas
          antigas levam a aba certa em vez de quebrar.
        */}
        <Route path="rh-dp/jornada" element={<Navigate to="/rh-dp/pessoal?aba=jornada" replace />} />
        <Route path="rh-dp/colaboradores" element={<RhDpCadastroColaboradoresRoute><RhDpColaboradores /></RhDpCadastroColaboradoresRoute>} />
        <Route path="rh-dp/documentos" element={<RhDpDocumentosRoute><RhDpDocumentos /></RhDpDocumentosRoute>} />
        <Route path="rh-dp/importacoes" element={<RhDpImportacoesRoute><RhDpImportacoes /></RhDpImportacoesRoute>} />
        <Route path="rh-dp/apuracao" element={<Navigate to="/rh-dp/pessoal?aba=apuracao" replace />} />
        <Route path="rh-dp/fechamentos" element={<RhDpFinanceiroRoute><RhDpFechamentos /></RhDpFinanceiroRoute>} />
        <Route path="sst" element={<SstDashboardRoute><SstDashboard /></SstDashboardRoute>} />
        <Route path="sst/relatorios" element={<SstDashboardRoute><ModuloRelatorios modulo="sst" /></SstDashboardRoute>} />
        <Route path="sst/relatorios/operacional" element={<SstDashboardRoute><SstRelatorioOperacional /></SstDashboardRoute>} />
        <Route path="sst/relatorios/executivo" element={<SstDashboardRoute><SstExecutivo /></SstDashboardRoute>} />
        <Route path="sst/relatorios/centro-operacional" element={<SstDashboardRoute><SstCentroOperacional /></SstDashboardRoute>} />
        <Route path="sst/relatorios/heatmap" element={<SstDashboardRoute><SstHeatmap /></SstDashboardRoute>} />
        <Route path="sst/observabilidade" element={<SstDashboardRoute><SstObservabilidade /></SstDashboardRoute>} />
        <Route path="sst/producao" element={<SstDashboardRoute><SstProducaoMonitoramento /></SstDashboardRoute>} />
        <Route path="sst/observabilidade-avancada" element={<SstDashboardRoute><SstObservabilidadeAvancada /></SstDashboardRoute>} />
        <Route path="sst/timeline" element={<SstDashboardRoute><SstTimeline /></SstDashboardRoute>} />
        <Route path="sst/esocial" element={<SstLegacyRoute><SstEsocial /></SstLegacyRoute>} />
        <Route path="sst/configuracoes" element={<SstConfigRoute><SstConfiguracoes /></SstConfigRoute>} />
        <Route path="sst/:resource" element={<SstRoute><SstCrudPage /></SstRoute>} />

        <Route path="comprovantes/upload" element={<FinanceiroRoute><UploadComprovantes /></FinanceiroRoute>} />
        <Route path="comprovantes/pendentes" element={<FinanceiroRoute><ComprovantesPendentes /></FinanceiroRoute>} />
        {/*
          D2 (financeiro): PORTA ÚNICA COM O RECORTE NA URL.

          Havia três rotas para o MESMO componente e o recorte chegava por
          uma prop invisível (tipoFixo). Prop de rota não é endereço: não dá
          para favoritar "só a pagar" nem mandar o link. Agora é
          /financeiro/titulos?tipo=receber|pagar, e a tela lê o recorte da
          própria URL.

          R20 — as duas rotas antigas REDIRECIONAM preservando o recorte:
          favorito, atalho fixado e tela inicial continuam chegando à mesma
          lista, com a mesma carteira.

          `replace` é OBRIGATÓRIO aqui, não estilo: o `Navigate` do router
          empurra uma entrada no histórico por padrão, então sem ele o
          "Voltar" do navegador cairia de novo no endereço antigo, que
          redirecionaria de novo — a pessoa ficaria presa na tela sem
          conseguir sair pelo Voltar.

          PERMISSÃO: os três endereços eram guardados pelo MESMO
          FinanceiroRoute (canAccessFinanceiro) — nenhum recorte exigia mais
          que o outro, então não há permissão a preservar por recorte. O
          destino continua sob esse guarda, e é ele que barra: quem não podia
          ver "a pagar" segue sem ver, agora barrado na porta única.
        */}
        <Route path="financeiro/contas-a-receber" element={<Navigate to="/financeiro/titulos?tipo=receber" replace />} />
        <Route path="financeiro/contas-a-pagar" element={<Navigate to="/financeiro/titulos?tipo=pagar" replace />} />
        <Route path="financeiro/titulos" element={<FinanceiroRoute><FinanceiroTitulos /></FinanceiroRoute>} />
        <Route path="financeiro/titulos/novo" element={<FinanceiroRoute><FinanceiroTituloNovo /></FinanceiroRoute>} />
        <Route path="financeiro/titulos/:id/editar" element={<FinanceiroRoute><FinanceiroTituloEditar /></FinanceiroRoute>} />
        <Route path="financeiro/titulos/:id" element={<FinanceiroRoute><FinanceiroTituloDetalhe /></FinanceiroRoute>} />
        <Route path="financeiro/cheques-terceiros" element={<FinanceiroRoute><FinanceiroChequesTerceiros /></FinanceiroRoute>} />
        <Route path="financeiro/baixas-compostas" element={<FinanceiroRoute><FinanceiroBaixasCompostas /></FinanceiroRoute>} />
        <Route path="financeiro/pagamentos" element={<FinanceiroPagamentosRoute><FinanceiroPagamentos /></FinanceiroPagamentosRoute>} />
        <Route path="financeiro/dda" element={<FinanceiroDdaRoute><FinanceiroDda /></FinanceiroDdaRoute>} />
        <Route path="financeiro/boletos" element={<BoletosRoute><FinanceiroBoletos /></BoletosRoute>} />
        <Route path="financeiro/faturas-cartao" element={<FinanceiroRoute><FinanceiroFaturasCartao /></FinanceiroRoute>} />
        <Route path="financeiro/faturas-cartao/:id" element={<FinanceiroRoute><FinanceiroFaturaCartaoDetalhe /></FinanceiroRoute>} />
        <Route path="financeiro/relatorios" element={<FinanceiroRelatoriosRoute><FinanceiroRelatorios /></FinanceiroRelatoriosRoute>} />
        <Route path="financeiro/relatorios/grupo-consolidado" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.grupo_consolidado"><FinanceiroExecutivoGrupo /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/relatorios/fluxo-consolidado" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.fluxo_consolidado"><FinanceiroFluxoConsolidado /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/relatorios/dre" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.dre"><FinanceiroDre /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/relatorios/dre/diagnostico" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.diagnostico_dre"><FinanceiroDiagnosticoDre /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/relatorios/intercompany" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.intercompany"><FinanceiroIntercompany /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/relatorios/endividamento" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.endividamento"><FinanceiroEndividamento /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/relatorios/analitico" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.analitico"><FinanceiroRelatorioAnalitico /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/relatorios/financeiro-obras" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.financeiro_obras"><FinanceiroObras /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/relatorios/resultado-obras" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.resultado_obras"><FinanceiroResultadoObras /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/relatorios/centros-custo" element={<FinanceiroRelatorioRoute permissionKey="financeiro.relatorios.centros_custo"><FinanceiroResultadoCentrosCusto /></FinanceiroRelatorioRoute>} />
        <Route path="financeiro/baixas" element={<FinanceiroRoute><FinanceiroBaixas /></FinanceiroRoute>} />
        <Route path="financeiro/financiamentos-bancarios" element={<FinanceiroRoute><FinanceiroFinanciamentosBancarios /></FinanceiroRoute>} />
        <Route path="financeiro/bancos" element={<FinanceiroRoute><FinanceiroBancos /></FinanceiroRoute>} />
        <Route path="financeiro/conciliacao" element={<FinanceiroRoute><FinanceiroConciliacao /></FinanceiroRoute>} />
        <Route path="financeiro/caixas" element={<FinanceiroRoute><FinanceiroCaixas /></FinanceiroRoute>} />
        <Route path="financeiro/cadastros" element={<FinanceiroRoute><FinanceiroCadastros /></FinanceiroRoute>} />
        <Route path="custos-recebiveis" element={<CustosRecebiveisRoute><CustosRecebiveis /></CustosRecebiveisRoute>} />
        <Route path="compras/relatorios" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ModuloRelatorios modulo="compras" /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/auditoria" element={<ModuloComprasRoute><ComprasRelatoriosRoute><RelatoriosAdministrativos /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/categorias-insumos" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioCategoriasInsumos /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/compras-diretas" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioComprasDiretas /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/compras-fornecedor" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioComprasFornecedor /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/demanda-pedidos" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioDemandaPedidos /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/evolucao" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioEvolucao /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/pendencias-cotacoes" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioPendenciasCotacoes /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/precos-insumos" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioPrecosInsumos /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/ciclo" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioCiclo /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/economia-cotacoes" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioEconomiaCotacoes /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="compras/relatorios/fornecedores" element={<ModuloComprasRoute><ComprasRelatoriosRoute><ComprasRelatorioFornecedores /></ComprasRelatoriosRoute></ModuloComprasRoute>} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="contratos/relatorios" element={<ContratosRoute><ModuloRelatorios modulo="contratos" /></ContratosRoute>} />
        <Route path="contratos/relatorios/operacional" element={<ContratosRoute><ContratosRelatorioOperacional /></ContratosRoute>} />
        <Route path="solicitacoes-compra" element={<ModuloComprasRoute><CompraSolicitacoesRoute><SolicitacoesCompra /></CompraSolicitacoesRoute></ModuloComprasRoute>} />
        <Route path="solicitacoes-compra/:id/cotacao" element={<ModuloComprasRoute><EnabledModuleRoute moduleKey="COTACOES"><CompraSolicitacoesManageRoute><GerenciarCotacaoSolicitacao /></CompraSolicitacoesManageRoute></EnabledModuleRoute></ModuloComprasRoute>} />
        <Route path="solicitacoes-compra/:id" element={<ModuloComprasRoute><CompraSolicitacoesRoute><SolicitacaoCompraDetalhe /></CompraSolicitacoesRoute></ModuloComprasRoute>} />
        <Route path="solicitacoes-compra/nova" element={<CompraSolicitacaoCreateRoute><NovaSolicitacaoCompra /></CompraSolicitacaoCreateRoute>} />
        <Route path="solicitacoes-compra/revisar" element={<CompraSolicitacaoCreateFlowRoute><RevisarSolicitacaoCompra /></CompraSolicitacaoCreateFlowRoute>} />
        <Route path="solicitacoes-compra/finalizada/:id" element={<CompraSolicitacaoCreateFlowRoute><RevisarSolicitacaoCompraFinal /></CompraSolicitacaoCreateFlowRoute>} />
        <Route path="solicitacoes-compra-direta/nova" element={<CompraSolicitacaoCreateRoute><NovaCompraDireta /></CompraSolicitacaoCreateRoute>} />
        <Route path="solicitacoes-compra-direta/revisar" element={<CompraSolicitacaoCreateFlowRoute><RevisarCompraDireta /></CompraSolicitacaoCreateFlowRoute>} />
        <Route path="pedidos-compra" element={<ComprasPedidosRoute><PedidosCompra /></ComprasPedidosRoute>} />
        <Route path="pedidos-compra/:id" element={<ComprasPedidosRoute><PedidoCompraDetalhe /></ComprasPedidosRoute>} />
        <Route path="compras/delegacao" element={<ComprasDelegacaoRoute><ComprasDelegacao /></ComprasDelegacaoRoute>} />
        <Route path="gestao-apropriacoes" element={<GestaoObrasRoute><BusinessAdminRoute><GestaoApropriacoes /></BusinessAdminRoute></GestaoObrasRoute>} />
        <Route path="gestao-insumos" element={<ModuloComprasRoute><ComprasConfiguracoesRoute><GestaoInsumos /></ComprasConfiguracoesRoute></ModuloComprasRoute>} />
        <Route path="gestao-unidades" element={<ModuloComprasRoute><ComprasConfiguracoesRoute><GestaoUnidades /></ComprasConfiguracoesRoute></ModuloComprasRoute>} />
        <Route path="gestao-categorias" element={<ModuloComprasRoute><ComprasConfiguracoesRoute><GestaoCategorias /></ComprasConfiguracoesRoute></ModuloComprasRoute>} />
        <Route path="gestao-fornecedores" element={<EnabledModuleRoute moduleKey="COTACOES"><ComprasFornecedoresRoute><GestaoFornecedores /></ComprasFornecedoresRoute></EnabledModuleRoute>} />
        <Route path="cotacoes" element={<EnabledModuleRoute moduleKey="COTACOES"><ComprasCotacoesRoute><ListaCotacoes /></ComprasCotacoesRoute></EnabledModuleRoute>} />
      </Route>
    </Routes>
  );
}
