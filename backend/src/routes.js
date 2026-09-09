// src/routes.js

const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const permit = require('./middlewares/permissions');
const csrfProtection = require('./middlewares/csrf');
const requireMfaCompletion = require('./middlewares/requireMfaCompletion');
const requireCustosRecebiveisCompletion = require('./modules/custosRecebiveis/middlewares/requireCustosRecebiveisCompletion');
const { auditSuccess } = require('./middlewares/audit');
const { createRateLimit } = require('./middlewares/rateLimit');
const { getRequestIp } = require('./services/securityLogService');
const {
  requireCompraAccess,
  requireCompraBodyObraAccess,
  requireContratoAccess,
  requireContratoBodyObraAccess,
  requireContratoOptionalBodyObraAccess,
  requirePedidoCompraAccess,
  scopeCompraListAccess
} = require('./middlewares/resourceAccess');
const { requireAnyEnabledModule, requireEnabledModule } = require('./middlewares/moduleAccess');
const { validateRequest } = require('./middlewares/validation');
const {
  validateLoginBody,
  validateForgotPasswordBody,
  validateMfaCodeBody,
  validateMfaLoginBody,
  validateNumericIdAndSlugParams,
  validateNumericIdParam,
  validatePasswordChangeBody,
  validateResetPasswordBody,
  validatePresignQuery
} = require('./validators/securityValidators');
const {
  validateCargoCreateBody,
  validateCargoUpdateBody,
  validateSetorCreateBody,
  validateSetorPermissaoBody,
  validateSetorUpdateBody,
  validateStatusSetorCreateBody,
  validateStatusSetorQuery,
  validateStatusSetorUpdateBody
} = require('./validators/adminValidators');
const {
  validateCompraCreateBody,
  validateCompraDiretaCreateBody,
  validateCompraEncerrarBody,
  validateCompraEncerrarSemPedidoBody,
  validateCompraCotacaoCancelBody,
  validateCompraCotacaoRespostaInternaBody,
  validateCompraCotacaoRespostaInternaParams,
  validateCompraEnviarBody,
  validateCompraIntegrarBody,
  validateCompraPedidoCreateBody,
  validateCompraPedidoFreteParams,
  validateCompraPedidoItemAddBody,
  validateCompraPedidoItemParams,
  validateSolicitacaoPedidoCompraPdfParams,
  validateCompraPedidoCancelBody,
  validateCompraSolicitacaoCancelBody,
  validateCompraCotacaoComentarioBody,
  validateCompraPedidoComentarioBody,
  validateCompraPedidoEspelhoBody,
  validateCompraPedidoFreteCancelBody,
  validateCompraPedidoFreteBody,
  validateCompraPedidoRemanejarBody,
  validateCompraPedidoReabrirBody,
  validateCompraPedidoPrevisoesBody,
  validateCompraPedidoDocumentoFinanceiroBody,
  validateCompraPedidoLiberarTitulosBody,
  validateCompraPedidoReaberturaParams,
  validateCompraPedidoDecisaoReaberturaBody,
  validateCompraPedidoStatusBody,
  validateCompraPedidoStatusBatchBody,
  validateCompraCatalogarItemManualBody,
  validateCompraSolicitacaoItemApropriacoesBody,
  validateCompraSolicitacaoItemQuantidadeBody,
  validateCompraSolicitacaoItemQuantidadeParams,
  validateCompraSolicitacaoInativarMassaBody,
  validateCompraSolicitacaoEncaminharComprasMassaBody,
  validateCompraPedidoItemUpdateBody,
  validateCompraDelegacaoBody,
  validateCompraPedidoAuditoriaQuery,
  validateCompraPedidoQuery,
  validateCompraQuery,
  validateCompraRelatorioCategoriasInsumosQuery,
  validateCompraRelatorioCicloQuery,
  validateCompraRelatorioComprasDiretasQuery,
  validateCompraRelatorioComprasFornecedorQuery,
  validateCompraRelatorioDemandaPedidosQuery,
  validateCompraRelatorioEconomiaCotacoesQuery,
  validateCompraRelatorioEvolucaoQuery,
  validateCompraRelatorioFornecedoresQuery,
  validateCompraRelatorioPendenciasCotacoesQuery,
  validateCompraRelatorioPrecosInsumosQuery,
  validateContratoCreateBody,
  validateContratoQuery,
  validateContratoRelatorioOperacionalQuery,
  validateContratoUpdateBody,
  validateSolicitacaoArquivarMassaBody,
  validateSolicitacaoApropriacoesBody,
  validateSolicitacaoComentarioBody,
  validateSolicitacaoCreateBody,
  validateSolicitacaoCredorCreateBody,
  validateSolicitacaoCredorBody,
  validateSolicitacaoDataVencimentoBody,
  validateSolicitacaoEnviarSetorBody,
  validateSolicitacaoEnviarSetorMassaBody,
  validateSolicitacaoFavorecidoCreateBody,
  validateSolicitacaoPedidoBody,
  validateSolicitacaoRefContratoBody,
  validateSolicitacaoResponsavelBody,
  validateSolicitacaoStatusBody,
  validateSolicitacaoValorBody
} = require('./validators/operationalValidators');
const {
  validateComercialContratoCreateBody,
  validateComercialContratoDistratoBody,
  validateComercialContratoQuery,
  validateComercialRelatorioOperacionalQuery,
  validateComercialContratoTrocaUnidadeBody,
  validateComercialContratoUpdateBody,
  validateComercialEmpreendimentoCreateBody,
  validateComercialEmpreendimentoQuery,
  validateComercialEmpreendimentoUpdateBody,
  validateComercialTabelaPrecoCreateBody,
  validateComercialTabelaPrecoQuery,
  validateComercialTabelaPrecoUpdateBody,
  validateComercialUnidadeCreateBody,
  validateComercialUnidadeQuery,
  validateComercialUnidadeUpdateBody
} = require('./validators/commercialValidators');
const {
  validateRhApuracaoCreateBody,
  validateRhApuracaoItemParams,
  validateRhApuracaoItemUpdateBody,
  validateRhApuracaoQuery,
  validateRhColaboradorCreateBody,
  validateRhColaboradorQuery,
  validateRhColaboradorUpdateBody,
  validateRhDocumentoCreateBody,
  validateRhDocumentoQuery,
  validateRhDocumentoTipoQuery,
  validateRhDocumentoUpdateBody,
  validateRhFechamentoQuery,
  validateRhFecharApuracaoBody,
  validateRhRelatorioOperacionalQuery,
  validateRhReabrirFechamentoBody,
  validateRhImportacaoCreateBody,
  validateRhImportacaoQuery,
  validateRhEmpresaGrupoCreateBody,
  validateRhEmpresaGrupoQuery,
  validateRhEmpresaGrupoUpdateBody
} = require('./validators/rhValidators');
const {
  validateProvisaoAnexoLinkParams,
  validateProvisaoCategoriaCreateBody,
  validateProvisaoCategoriaQuery,
  validateProvisaoCategoriaUpdateBody,
  validateProvisaoComentarioBody,
  validateProvisaoDashboardQuery,
  validateProvisaoFinanceiraCreateBody,
  validateProvisaoFinanceiraQuery,
  validateProvisaoFinanceiraUpdateBody,
  validateProvisaoIdParams,
  validateProvisionamentoFluxoConfigBody
} = require('./validators/provisaoValidators');
const {
  validateSiengeConfigBody,
  validateSiengeCredorBuscaBody,
  validateSiengeCredorCreateBody,
  validateSiengeCredorMapeamentoBody,
  validateSiengeFilaCreateBody,
  validateSiengeFilaQuery,
  validateSiengeFilaRetryBody,
  validateSiengeLogQuery
} = require('./validators/integrationValidators');
const {
  validateFinanceConciliacaoConciliarSugeridosBody,
  validateFinanceConciliacaoCriarTituloBody,
  validateFinanceConciliacaoConfirmBody,
  validateFinanceConciliacaoCorrigirContaBody,
  validateFinanceConciliacaoCreditoRotativoBody,
  validateFinanceConciliacaoEstornoBancarioBody,
  validateFinanceConciliacaoEstornoTarifaBody,
  validateFinanceConciliacaoImportBody,
  validateFinanceConciliacaoImportacoesQuery,
  validateFinanceConciliacaoMovimentosQuery,
  validateFinanceConciliacaoQuery,
  validateFinanceConciliacaoTarifaBody,
  validateFinanceConciliacaoTransferenciaBody,
  validateFinanceConciliacaoEstornoTransferenciaBody,
  validateFinanceCaixaAberturaBody,
  validateFinanceCaixaFechamentoBody,
  validateFinanceCaixaMovimentoBody,
  validateFinanceCaixaMovimentoEstornoBody,
  validateFinanceCaixaMovimentoParams,
  validateFinanceCaixaQuery,
  validateFinanceBoletoTituloQuery,
  validateFinanceBaixasQuery,
  validateFinanceCadastroCategoriaBody,
  validateFinanceCadastroContaBody,
  validateFinanceDreComparativoQuery,
  validateFinanceDreQuery,
  validateFinanceEndividamentoQuery,
  validateFinanceFinanciamentoBancarioCreateBody,
  validateFinanceFinanciamentoBancarioQuery,
  validateFinanceFluxoCaixaQuery,
  validateFinanceFluxoConsolidadoQuery,
  validateFinanceiroObrasQuery,
  validateFinanceIntercompanyQuery,
  validateFinanceRelatorioAnaliticoQuery,
  validateFinanceRelatorioConciliacaoQuery,
  validateFinanceTituloBaixaBody,
  validateFinanceTituloBaixaParceladaBody,
  validateFinanceTituloBaixaConciliacoesBody,
  validateFinanceTituloCobrancaBody,
  validateFinanceTituloCreateBody,
  validateFinanceTituloCreateFromSolicitacaoBody,
  validateFinanceTituloEstornoBody,
  validateFinanceTituloMovimentoParams,
  validateFinanceTituloQuery,
  validateFinanceTituloUpdateBody,
  validateFinanceTarifasBancariasConfigBody,
  validateFinanceTransferenciaBody,
  validateFinanceTransferenciaCancelBody,
  validateFinanceTransferenciaQuery
} = require('./validators/financialValidators');
const {
  validatePaymentAccountBody,
  validatePaymentBatchItemParams,
  validatePaymentBatchCreateBody,
  validatePaymentBeneficiaryCreateBody,
  validatePaymentBeneficiaryUpdateBody,
  validatePaymentCancelBody,
  validatePaymentRejectBody,
  validatePaymentMfaBody
} = require('./validators/paymentValidators');
const {
  validateDdaIgnoreBody,
  validateDdaLinkBody,
  validateDdaListQuery,
  validateDdaSyncBody
} = require('./validators/ddaValidators');
const { env } = require('./config/env');
const {
  canAccessBoletos,
    canAccessPagamentos,
    canAccessProvisoes,
    canAlterarQuantidadeSolicitacaoCompra,
    canAlterarStatusComprasPedidos,
    canAnexarDocumentoPedidoCompraFinanceiro,
    canAprovarReaberturaPedidoCompraFinanceiro,
    canApprovePagamentos,
    canRejectPagamentos,
    canAuditPaymentBeneficiaries,
  canAuditPagamentos,
  canConfigurePagamentos,
  canCancelarComprasPedidos,
  canCancelarComprasCotacoes,
  canCancelarFreteComprasPedidos,
  canAnexarEspelhoComprasPedidos,
  canCatalogarItensManuaisCompras,
  canConfirmarBaixaPagamento,
  canCreateCompraSolicitacao,
  canCreateProvisoes,
  canAccessFinanceiro,
  canAccessFinanceiroRelatorio,
  canImportTitulosFinanceiros,
  canImportComercialContratos,
  userHasAreaPermission,
  canViewSolicitacaoFinanceiro,
  canAccessTreinamento,
  canAccessComprovantes,
  canCancelPagamentos,
  canCreateComercialContratos,
  canCreateCrmLeads,
  canEditarItensComprasPedidos,
  canGerarPrevisaoPedidoCompraFinanceiro,
  canEncerrarSemPedidoComprasCotacoes,
  canFecharComprasCotacoes,
  canExportCrmLeads,
  canGenerateBoletos,
  canManagePaymentBeneficiaries,
  canManageComercialContratos,
  canManageComercialEmpreendimentos,
  canManageConfiguracoesArea,
  canManageCadastroObras,
  canManageGestaoObrasApropriacoes,
  canManageBiblioteca,
  canManageComprasConfiguracoes,
  canManageComprasDelegacao,
  canManageComprasFornecedores,
  canEncaminharCompraSolicitacoes,
  canDeleteCompraSolicitacoes,
  canManageCrmAutomacoes,
  canManageCrmConfiguracoes,
  canRedistributeCrmLeads,
  canReprocessPagamentos,
  canSendCrmAtendimento,
  canEditProvisoes,
  canEditRhDpApuracao,
  canExecuteRhDpFechamento,
  canExecuteRhDpImportacoes,
  canManageProvisoesCategorias,
  canManageIntegracaoSiengeConfig,
  canManageRhDpColaboradores,
  canManageRhDpDocumentos,
  canManageRhDpEmpresas,
  canManageUsers,
  canManageTreinamento,
  canReopenRhDpFechamento,
  canRetryIntegracaoSienge,
  canReadComercialBaseData,
  canManageCompraSolicitacoes,
  canManageComprasCotacoes,
  canOperateComprasCotacoes,
  canManageComprasPedidos,
  canLiberarPedidoCompraFinanceiro,
  canReabrirComprasCotacoes,
  canReabrirComprasPedidos,
  canRegistrarFreteComprasPedidos,
  canRemanejarComprasPedidos,
  canPreparePagamentos,
  canSendPagamentosBanco,
  canSyncPagamentosBanco,
  canViewProvisoes,
  canViewPaymentBeneficiaries,
  canViewProvisoesDashboard,
  canViewComercialContratos,
  canViewComercialEmpreendimentos,
  canViewCompraSolicitacoes,
  canViewComprasDelegacao,
  canViewComprasFornecedores,
  canViewComprasCotacoes,
  canViewComprasPedidos,
  canViewComprasRelatorios,
  canViewCadastroObras,
  canViewGestaoObras,
  canViewBiblioteca,
  canViewComunicacao,
  canSendComunicacao,
  canViewCrmAtendimento,
  canViewCrmAutomacoes,
  canViewCrmConfiguracoes,
  canViewCrmDashboard,
  canViewCrmLeads,
  canViewIntegracaoSienge,
  canViewRhDpApuracao,
  canViewRhDpColaboradores,
  canViewRhDpDashboard,
  userHasStrictAreaPermission,
  canViewRhDpDocumentos,
  canViewRhDpObrigacoes,
  canViewSolicitacoesRelatorioOperacional
} = require('./services/authorizationService');

const uploadComprovantes = require('./config/uploadComprovantes');
const uploadNegociacaoContrato = require('./config/uploadNegociacaoContrato');
const uploadDocumentacaoJuridica = require('./config/uploadDocumentacaoJuridica');
const uploadOfx = require('./config/uploadOfx');
const uploadCnab = require('./config/uploadCnab');
const uploadTreinamentoFile = require('./config/uploadTreinamentoFile');

// Controllers
const SolicitacaoController = require('./controllers/SolicitacaoController');
const RecargaCartaoController = require('./controllers/RecargaCartaoController');
const SolicitacaoRetornoController = require('./controllers/SolicitacaoRetornoController');
const RelatorioSolicitacoesController = require('./controllers/RelatorioSolicitacoesController');
const PrioridadeDiretoriaController = require('./controllers/PrioridadeDiretoriaController');
const UsuarioController = require('./controllers/UsuarioController');
const CargoController = require('./controllers/CargoController');
const SetorController = require('./controllers/SetorController');
const ObraController = require('./controllers/ObraController');
const TipoSolicitacaoController = require('./controllers/TipoSolicitacaoController');
const TipoSolicitacaoDisponibilidadeController = require('./controllers/TipoSolicitacaoDisponibilidadeController');
const ListaPreferenciasController = require('./controllers/ListaPreferenciasController');
const BuscaController = require('./controllers/BuscaController');
const TelaInicialController = require('./controllers/TelaInicialController');
const AtalhoSetorController = require('./controllers/AtalhoSetorController');
const DetalheLayoutController = require('./controllers/DetalheLayoutController');
const AcaoPrincipalSetorController = require('./controllers/AcaoPrincipalSetorController');
const DashboardController = require('./controllers/DashboardController');
const DashboardPendenciasController = require('./controllers/DashboardPendenciasController');
const HomeBlocosController = require('./controllers/HomeBlocosController');
const AuthController = require('./controllers/AuthController');
const LiveUpdatesController = require('./controllers/LiveUpdatesController');
const InstalacaoController = require('./controllers/InstalacaoController');
const ContratoController = require('./controllers/ContratoController');
const TipoMacroContratoController = require('./controllers/TipoMacroContratoController');
const TipoSubContratoController = require('./controllers/TipoSubContratoController');
const StatusSetorController = require('./controllers/StatusSetorController');
const ComprovanteController = require('./controllers/ComprovanteController');
const AnexoController = require('./controllers/AnexoController');
const NotificacaoController = require('./controllers/NotificacaoController');
const SetorPermissaoController = require('./controllers/SetorPermissaoController');
const ConfiguracaoSistemaController = require('./controllers/ConfiguracaoSistemaController');
const ObraTipoApropriacaoController = require('./controllers/ObraTipoApropriacaoController');
const ContratoFluxoNovoController = require('./controllers/ContratoFluxoNovoController');
const UiVisibilityConfigController = require('./controllers/UiVisibilityConfigController');
const ConversaInternaController = require('./controllers/ConversaInternaController');
const ArquivoModeloController = require('./controllers/ArquivoModeloController');
const TreinamentoController = require('./controllers/TreinamentoController');
const UnidadeController = require('./controllers/UnidadeController');
const CategoriaController = require('./controllers/CategoriaController');
const InsumoController = require('./controllers/InsumoController');
const InsumoManualCatalogacaoController = require('./controllers/InsumoManualCatalogacaoController');
const ApropriacaoController = require('./controllers/ApropriacaoController');
const SolicitacaoCompraController = require('./controllers/SolicitacaoCompraController');
const FornecedorCompraController = require('./controllers/FornecedorCompraController');
const CotacaoFornecedorController = require('./controllers/CotacaoFornecedorController');
const PedidoCompraController = require('./controllers/PedidoCompraController');
const PedidoCompraFinanceiroController = require('./controllers/PedidoCompraFinanceiroController');
const RelatorioComprasController = require('./controllers/RelatorioComprasController');
const ParceiroController = require('./controllers/ParceiroController');
const ParceiroCategoriaController = require('./controllers/ParceiroCategoriaController');
const ComercialEmpreendimentoController = require('./controllers/ComercialEmpreendimentoController');
const ComercialUnidadeController = require('./controllers/ComercialUnidadeController');
const ComercialContratoController = require('./controllers/ComercialContratoController');
const ComercialContratoImportacaoController = require('./controllers/ComercialContratoImportacaoController');
const ComercialContratoDocumentoController = require('./controllers/ComercialContratoDocumentoController');
const ComercialTabelaPrecoController = require('./controllers/ComercialTabelaPrecoController');
const ComercialRelatorioController = require('./controllers/ComercialRelatorioController');
const ProvisaoFinanceiraController = require('./controllers/ProvisaoFinanceiraController');
const ProvisaoCategoriaMacroController = require('./controllers/ProvisaoCategoriaMacroController');
const ProvisaoFinanceiraDashboardController = require('./controllers/ProvisaoFinanceiraDashboardController');
const RhEmpresaGrupoController = require('./controllers/RhEmpresaGrupoController');
const RhColaboradorController = require('./controllers/RhColaboradorController');
const RhSolicitacaoController = require('./controllers/RhSolicitacaoController');
const RhJornadaController = require('./controllers/RhJornadaController');
const RhDocumentoController = require('./controllers/RhDocumentoController');
const RhImportacaoController = require('./controllers/RhImportacaoController');
const RhApuracaoController = require('./controllers/RhApuracaoController');
const RhFechamentoController = require('./controllers/RhFechamentoController');
const RhRelatorioController = require('./controllers/RhRelatorioController');
const IntegracaoSiengeController = require('./controllers/IntegracaoSiengeController');
const ContaBancariaController = require('./controllers/ContaBancariaController');
const CategoriaFinanceiraController = require('./controllers/CategoriaFinanceiraController');
const FormaPagamentoFinanceiraController = require('./controllers/FormaPagamentoFinanceiraController');
const CartaoFinanceiroController = require('./controllers/CartaoFinanceiroController');
const FaturaCartaoFinanceiroController = require('./controllers/FaturaCartaoFinanceiroController');
const TituloFinanceiroController = require('./controllers/TituloFinanceiroController');
const TituloFinanceiroImportacaoController = require('./controllers/TituloFinanceiroImportacaoController');
const ChequeTerceiroController = require('./controllers/ChequeTerceiroController');
const FinanciamentoBancarioController = require('./controllers/FinanciamentoBancarioController');
const RelatorioFinanceiroController = require('./controllers/RelatorioFinanceiroController');
const ConciliacaoBancariaController = require('./controllers/ConciliacaoBancariaController');
const ObraCustoHistoricoController = require('./controllers/ObraCustoHistoricoController');
const CaixaFinanceiroController = require('./controllers/CaixaFinanceiroController');
const TransferenciaFinanceiraController = require('./controllers/TransferenciaFinanceiraController');
const TarifaBancariaConfigController = require('./controllers/TarifaBancariaConfigController');
const ResultadoObrasController = require('./controllers/ResultadoObrasController');
const ResultadoCentrosCustoController = require('./controllers/ResultadoCentrosCustoController');
const PermissoesAreasController = require('./controllers/PermissoesAreasController');
const BoletoController = require('./controllers/BoletoController');
const BoletoCaixaCnabController = require('./controllers/BoletoCaixaCnabController');
const PaymentBeneficiaryController = require('./controllers/PaymentBeneficiaryController');
const PaymentController = require('./controllers/PaymentController');
const FinanceiroDdaController = require('./controllers/FinanceiroDdaController');
const CrmLeadsController = require('./controllers/CrmLeadsController');
const CrmPipelineController = require('./controllers/CrmPipelineController');
const CrmTasksController = require('./controllers/CrmTasksController');
const CrmDashboardController = require('./controllers/CrmDashboardController');
const CrmAdminController = require('./controllers/CrmAdminController');
const CrmWebhookMetaController = require('./controllers/CrmWebhookMetaController');
const CrmWebhookGoogleController = require('./controllers/CrmWebhookGoogleController');
const CrmConversationsController = require('./controllers/CrmConversationsController');
const CrmAutomationController = require('./controllers/CrmAutomationController');
const { requireCrmModule } = require('./middlewares/crmAccess');
const fiscalRoutes = require('./modules/fiscal/routes');
const sstRoutes = require('./modules/sst/routes');
const governancaRoutes = require('./modules/governanca/routes');
const custosRecebiveisRoutes = require('./modules/custosRecebiveis/routes');
//console.log('AnexoController =>', AnexoController);

function hashRateLimitValue(value, fallback = 'anon') {
  const normalized = String(value || fallback).trim().toLowerCase() || fallback;
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 24);
}

function rateLimitRouteKey(req) {
  return `${req.method}:${req.baseUrl || ''}${req.path || ''}`;
}

function authIdentifierFromRequest(req) {
  return (
    req.body?.email ||
    req.body?.login ||
    req.body?.usuario ||
    req.body?.username ||
    req.body?.cpf ||
    'sem-identificador'
  );
}

function authRateLimitKey(scope, req, identifier) {
  const ip = getRequestIp(req) || 'unknown';
  return `${scope}:${rateLimitRouteKey(req)}:${hashRateLimitValue(identifier)}:${ip}`;
}

const loginRateLimit = createRateLimit({
  windowMs: Math.max(1, env.loginRateLimitWindowMinutes) * 60 * 1000,
  max: Math.max(1, env.loginRateLimitMaxAttempts),
  message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
  eventType: 'AUTH_RATE_LIMIT',
  resource: 'AUTH',
  keyGenerator: (req) => authRateLimitKey('login', req, authIdentifierFromRequest(req))
});

const uploadRateLimit = createRateLimit({
  windowMs: Math.max(1, env.uploadRateLimitWindowMinutes) * 60 * 1000,
  max: Math.max(1, env.uploadRateLimitMaxAttempts),
  message: 'Muitos uploads em pouco tempo. Aguarde antes de tentar novamente.',
  eventType: 'UPLOAD_RATE_LIMIT',
  resource: 'UPLOAD'
});

const criticalRateLimit = createRateLimit({
  windowMs: Math.max(1, env.criticalRateLimitWindowMinutes) * 60 * 1000,
  max: Math.max(1, env.criticalRateLimitMaxAttempts),
  message: 'Muitas operacoes sensiveis em pouco tempo. Aguarde antes de tentar novamente.',
  eventType: 'CRITICAL_RATE_LIMIT',
  resource: 'ROUTE'
});

const crmWebhookRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Muitos eventos CRM recebidos em pouco tempo.',
  eventType: 'CRM_WEBHOOK_RATE_LIMIT',
  resource: 'CRM_WEBHOOK'
});

const d4signWebhookRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Muitos eventos D4Sign recebidos em pouco tempo.',
  eventType: 'D4SIGN_WEBHOOK_RATE_LIMIT',
  resource: 'D4SIGN_WEBHOOK'
});

const bbWebhookRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Muitos eventos BB recebidos em pouco tempo.',
  eventType: 'BB_WEBHOOK_RATE_LIMIT',
  resource: 'BB_WEBHOOK'
});

const passwordChangeRateLimit = createRateLimit({
  windowMs: Math.max(1, env.passwordRateLimitWindowMinutes) * 60 * 1000,
  max: Math.max(1, env.passwordRateLimitMaxAttempts),
  message: 'Muitas tentativas de troca de senha. Aguarde antes de tentar novamente.',
  eventType: 'PASSWORD_CHANGE_RATE_LIMIT',
  resource: 'USER_PASSWORD',
  keyGenerator: (req) => {
    if (req.user?.id) {
      return authRateLimitKey('password-change', req, `user:${req.user.id}`);
    }

    if (req.body?.token) {
      return authRateLimitKey('password-change', req, `token:${req.body.token}`);
    }

    return authRateLimitKey('password-change', req, authIdentifierFromRequest(req));
  }
});


// -------------------------------------------------------------------
// AUTH
// -------------------------------------------------------------------
router.post('/login', loginRateLimit, validateRequest({ body: validateLoginBody }), AuthController.login);
router.post('/login/mfa', loginRateLimit, validateRequest({ body: validateMfaLoginBody }), AuthController.loginMfa);
router.post('/auth/forgot-password', passwordChangeRateLimit, validateRequest({ body: validateForgotPasswordBody }), AuthController.forgotPassword);
router.post('/auth/reset-password', passwordChangeRateLimit, validateRequest({ body: validateResetPasswordBody }), AuthController.resetPassword);
router.get('/instalacao/publica', InstalacaoController.publica);
router.get('/configuracoes/tema', ConfiguracaoSistemaController.getTema);
router.post('/cotacoes/upload', requireEnabledModule('COTACOES', { allowSuperadminBypass: false }), uploadRateLimit, uploadComprovantes.fields([{ name: 'files', maxCount: 10 }, { name: 'file', maxCount: 1 }]), CotacaoFornecedorController.upload);
router.get('/cotacoes/:token/modelo', requireEnabledModule('COTACOES', { allowSuperadminBypass: false }), CotacaoFornecedorController.modelo);
router.get('/cotacoes/:token/modelo-xlsx', requireEnabledModule('COTACOES', { allowSuperadminBypass: false }), CotacaoFornecedorController.modeloXlsx);
router.get('/cotacoes/:token/pdf', requireEnabledModule('COTACOES', { allowSuperadminBypass: false }), CotacaoFornecedorController.pdf);
router.get('/cotacoes/:token', requireEnabledModule('COTACOES', { allowSuperadminBypass: false }), CotacaoFornecedorController.show);
router.post('/cotacoes/:token/rascunho', requireEnabledModule('COTACOES', { allowSuperadminBypass: false }), CotacaoFornecedorController.salvarRascunho);
router.post('/cotacoes/:token', requireEnabledModule('COTACOES', { allowSuperadminBypass: false }), CotacaoFornecedorController.responder);
router.get('/crm/webhooks/meta', requireEnabledModule('CRM', { allowSuperadminBypass: false }), CrmWebhookMetaController.verify);
router.post('/crm/webhooks/meta', crmWebhookRateLimit, requireEnabledModule('CRM', { allowSuperadminBypass: false }), CrmWebhookMetaController.receive);
router.post('/crm/webhooks/google', crmWebhookRateLimit, requireEnabledModule('CRM', { allowSuperadminBypass: false }), CrmWebhookGoogleController.receive);
router.post('/webhooks/d4sign', d4signWebhookRateLimit, uploadComprovantes.none(), ComercialContratoDocumentoController.webhookD4Sign);
router.post('/payments/bb/webhook', bbWebhookRateLimit, PaymentController.bbWebhook);
const auth = require('./middlewares/auth');
const auditoriaOperacional = require('./middlewares/auditoriaOperacional');
router.use(auth);
router.use(csrfProtection);
router.use(auditoriaOperacional);
router.get('/auth/me', AuthController.me);
router.post('/auth/logout', AuthController.logout);
router.post('/auth/heartbeat', AuthController.heartbeat);
router.post('/auth/mfa/setup', AuthController.mfaSetup);
router.post('/auth/mfa/enable', validateRequest({ body: validateMfaCodeBody }), AuthController.mfaEnable);
router.post('/auth/mfa/disable', validateRequest({ body: validateMfaCodeBody }), AuthController.mfaDisable);
router.use(requireMfaCompletion);
router.use(requireCustosRecebiveisCompletion);
router.get('/live-updates', LiveUpdatesController.stream);
router.get('/instalacao', permit(['SUPERADMIN']), InstalacaoController.show);
router.patch('/instalacao', permit(['SUPERADMIN']), InstalacaoController.update);
router.get('/usuarios-lista', UsuarioController.listaPublica);
router.use('/solicitacoes', requireEnabledModule('SOLICITACOES'));
router.use('/compras', requireEnabledModule('COMPRAS'));
router.use('/financeiro', requireEnabledModule('FINANCEIRO'));
router.use('/comprovantes', requireEnabledModule('FINANCEIRO'));
router.use('/contratos', requireEnabledModule('CONTRATOS'));
router.use('/comercial', requireEnabledModule('COMERCIAL'));
router.use('/provisoes-financeiras', requireEnabledModule('PROVISOES'));
router.use('/rh', requireEnabledModule('RH_DP'));
router.use('/integracoes/sienge', requireEnabledModule('INTEGRACAO_SIENGE'));
router.use('/boletos', requireEnabledModule('BOLETOS'));
router.use('/fiscal', requireEnabledModule('FISCAL'));
router.use('/fiscal', fiscalRoutes);
router.use(
  '/custos-recebiveis',
  requireEnabledModule('CUSTOS_RECEBIVEIS', { allowSuperadminBypass: false })
);
router.use('/custos-recebiveis', custosRecebiveisRoutes);
router.use('/sst', requireEnabledModule('SST'));
router.use('/sst', sstRoutes);
router.use('/governanca', governancaRoutes);
router.use('/treinamento', requireEnabledModule('TREINAMENTO'));
router.use('/arquivos-modelos', requireEnabledModule('BIBLIOTECA_MODELOS'));
router.use('/conversas-internas', requireEnabledModule('COMUNICACAO_INTERNA'));

// -------------------------------------------------------------------
// ARQUIVOS MODELOS
// -------------------------------------------------------------------
const allowBibliotecaRead = permit({
  resource: 'BIBLIOTECA_MODELOS_READ',
  custom: async (req) => (
    (await canViewBiblioteca(req.user)) ? true : 'Acesso negado para visualizar a biblioteca de modelos'
  )
});
const allowBibliotecaManage = permit({
  resource: 'BIBLIOTECA_MODELOS_MANAGE',
  custom: async (req) => (
    (await canManageBiblioteca(req.user)) ? true : 'Acesso negado para gerenciar a biblioteca de modelos'
  )
});

router.get('/arquivos-modelos/contexto', allowBibliotecaRead, ArquivoModeloController.contexto);
router.get('/arquivos-modelos/admins', allowBibliotecaRead, ArquivoModeloController.listarAdmins);
router.get('/arquivos-modelos', allowBibliotecaRead, ArquivoModeloController.listarArquivos);
router.post('/arquivos-modelos/upload', allowBibliotecaManage, uploadRateLimit, uploadComprovantes.single('file'), ArquivoModeloController.upload);
router.get('/arquivos-modelos/:id/link', allowBibliotecaRead, validateRequest({ params: validateNumericIdParam('id', 'Arquivo modelo') }), ArquivoModeloController.obterLink);
router.delete('/arquivos-modelos/:id', allowBibliotecaManage, validateRequest({ params: validateNumericIdParam('id', 'Arquivo modelo') }), ArquivoModeloController.remover);
router.post('/arquivos-modelos/paginas', permit(['SUPERADMIN']), ArquivoModeloController.criarPagina);
router.patch('/arquivos-modelos/paginas', permit(['SUPERADMIN']), ArquivoModeloController.salvarPaginas);
router.patch('/arquivos-modelos/paginas/:codigo/ativar', permit(['SUPERADMIN']), ArquivoModeloController.ativarPagina);
router.patch('/arquivos-modelos/paginas/:codigo/desativar', permit(['SUPERADMIN']), ArquivoModeloController.desativarPagina);
router.patch('/arquivos-modelos/uploaders', permit(['SUPERADMIN']), ArquivoModeloController.salvarUploaders);

const allowGestaoUsuarios = permit({
  resource: 'USER_ADMIN',
  custom: async (req) => (
    (await canManageUsers(req.user))
      ? true
      : 'Acesso negado para gestao de usuarios'
  )
});

const allowFinanceiro = permit({
  resource: 'FINANCEIRO',
  custom: async (req) => (
    (await canAccessFinanceiro(req.user))
      ? true
      : 'Acesso negado para o modulo financeiro'
  )
});

const allowTituloImportar = permit({
  resource: 'FINANCEIRO_TITULOS_IMPORTAR',
  custom: async (req) => (
    (await canImportTitulosFinanceiros(req.user))
      ? true
      : 'Acesso negado para importar titulos financeiros'
  )
});

const allowTituloImportarCodigos = permit({
  resource: 'FINANCEIRO_TITULOS_IMPORTAR_CODIGOS',
  custom: async (req) => (
    (await canAccessFinanceiro(req.user))
      && (await userHasAreaPermission(req.user, ['financeiro.titulos.importar_codigos']))
      ? true
      : 'Acesso negado para importar codigos de boleto dos titulos'
  )
});

function allowFinanceiroArea(resource, permissionKeys = []) {
  return permit({
    resource,
    custom: async (req) => (
      (await canAccessFinanceiro(req.user))
      && (await userHasAreaPermission(req.user, permissionKeys))
        ? true
        : 'Acesso negado para esta operacao financeira'
    )
  });
}

const allowChequesVisualizar = allowFinanceiroArea(
  'FINANCEIRO_CHEQUES_VISUALIZAR',
  ['financeiro.cheques.visualizar']
);
const allowChequesCadastrar = allowFinanceiroArea(
  'FINANCEIRO_CHEQUES_CADASTRAR',
  ['financeiro.cheques.cadastrar']
);
const allowChequesImportar = allowFinanceiroArea(
  'FINANCEIRO_CHEQUES_IMPORTAR',
  ['financeiro.cheques.importar']
);
const allowChequesMovimentar = allowFinanceiroArea(
  'FINANCEIRO_CHEQUES_MOVIMENTAR',
  [
    'financeiro.cheques.depositar',
    'financeiro.cheques.devolver',
    'financeiro.cheques.cancelar',
    'financeiro.cheques.transferir'
  ]
);
const allowBaixaCompostaVisualizar = allowFinanceiroArea(
  'FINANCEIRO_BAIXAS_COMPOSTAS_VISUALIZAR',
  ['financeiro.baixas_compostas.visualizar']
);
const allowBaixaCompostaCriar = allowFinanceiroArea(
  'FINANCEIRO_BAIXAS_COMPOSTAS_CRIAR',
  ['financeiro.baixas_compostas.criar']
);
const allowBaixaCompostaConfirmar = allowFinanceiroArea(
  'FINANCEIRO_BAIXAS_COMPOSTAS_CONFIRMAR',
  ['financeiro.baixas_compostas.confirmar']
);
const allowBaixaCompostaEstornar = allowFinanceiroArea(
  'FINANCEIRO_BAIXAS_COMPOSTAS_ESTORNAR',
  ['financeiro.baixas_compostas.estornar']
);
const allowConciliacaoCorrigirConta = allowFinanceiroArea(
  'FINANCEIRO_CONCILIACAO_CORRIGIR_CONTA',
  ['financeiro.conciliacao.conciliar']
);
const allowConciliacaoEstornar = allowFinanceiroArea(
  'FINANCEIRO_CONCILIACAO_ESTORNAR',
  ['financeiro.conciliacao.estornar']
);
const allowDdaVisualizar = allowFinanceiroArea(
  'FINANCEIRO_DDA_VISUALIZAR',
  ['financeiro.dda.visualizar']
);
const allowDdaSincronizar = allowFinanceiroArea(
  'FINANCEIRO_DDA_SINCRONIZAR',
  ['financeiro.dda.sincronizar']
);
const allowDdaVincular = allowFinanceiroArea(
  'FINANCEIRO_DDA_VINCULAR',
  ['financeiro.dda.vincular']
);
const allowDdaIgnorar = allowFinanceiroArea(
  'FINANCEIRO_DDA_IGNORAR',
  ['financeiro.dda.ignorar']
);
const allowDdaAuditar = allowFinanceiroArea(
  'FINANCEIRO_DDA_AUDITAR',
  ['financeiro.dda.auditar']
);

function allowFinanceiroRelatorio(permissionKeys = []) {
  return permit({
    resource: 'FINANCEIRO_RELATORIO',
    custom: async (req) => (
      (await canAccessFinanceiroRelatorio(req.user, permissionKeys))
        ? true
        : 'Acesso negado para este relatorio financeiro'
    )
  });
}

const allowSolicitacaoFinanceiro = permit({
  resource: 'SOLICITACAO_FINANCEIRO',
  custom: async (req) => (
    (await canViewSolicitacaoFinanceiro(req.user))
      ? true
      : 'Acesso negado para a aba financeira da solicitacao'
  )
});

const allowTreinamentoRead = permit({
  resource: 'TREINAMENTO',
  custom: async (req) => (
    (await canAccessTreinamento(req.user))
      ? true
      : 'Acesso negado para a central de treinamento'
  )
});

const allowTreinamentoManage = permit({
  resource: 'TREINAMENTO',
  custom: async (req) => (
    (await canManageTreinamento(req.user))
      ? true
      : 'Acesso negado para gerenciar treinamentos'
  )
});

function allowPaymentAction(resource, checker, message) {
  return permit({
    resource,
    custom: async (req) => (
      (await checker(req.user))
        ? true
        : message
    )
  });
}

const allowPagamentosRead = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS',
  canAccessPagamentos,
  'Acesso negado para pagamentos bancarios'
);
const allowPagamentosPrepare = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_PREPARE',
  canPreparePagamentos,
  'Acesso negado para preparar pagamentos bancarios'
);
const allowPagamentosApprove = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_APPROVE',
  canApprovePagamentos,
  'Acesso negado para aprovar pagamentos bancarios'
);
const allowPagamentosReject = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_REJECT',
  canRejectPagamentos,
  'Acesso negado para rejeitar pagamentos bancarios'
);
const allowPagamentosSend = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_SEND',
  canSendPagamentosBanco,
  'Acesso negado para enviar pagamentos ao banco'
);
const allowPagamentosSync = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_SYNC',
  canSyncPagamentosBanco,
  'Acesso negado para sincronizar pagamentos bancarios'
);
const allowPagamentosCancel = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_CANCEL',
  canCancelPagamentos,
  'Acesso negado para cancelar pagamentos bancarios'
);
const allowPagamentosReprocess = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_REPROCESS',
  canReprocessPagamentos,
  'Acesso negado para reprocessar pagamentos bancarios'
);
const allowPagamentosConfirmBaixa = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_BAIXA',
  canConfirmarBaixaPagamento,
  'Acesso negado para confirmar baixa de pagamento'
);
const allowPagamentosConfig = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_CONFIG',
  canConfigurePagamentos,
  'Acesso negado para configurar pagamentos bancarios'
);
const allowPagamentosAudit = allowPaymentAction(
  'FINANCEIRO_PAGAMENTOS_AUDIT',
  canAuditPagamentos,
  'Acesso negado para auditar pagamentos bancarios'
);
const allowFavorecidosRead = allowPaymentAction(
  'FINANCEIRO_FAVORECIDOS',
  canViewPaymentBeneficiaries,
  'Acesso negado para favorecidos bancarios'
);
const allowFavorecidosManage = allowPaymentAction(
  'FINANCEIRO_FAVORECIDOS_MANAGE',
  canManagePaymentBeneficiaries,
  'Acesso negado para gerenciar favorecidos bancarios'
);
const allowFavorecidosAudit = allowPaymentAction(
  'FINANCEIRO_FAVORECIDOS_AUDIT',
  canAuditPaymentBeneficiaries,
  'Acesso negado para auditar favorecidos bancarios'
);

const allowCompraSolicitacoesRead = allowPaymentAction(
  'COMPRAS_SOLICITACOES_READ',
  canViewCompraSolicitacoes,
  'Acesso negado para solicitacoes de compra'
);
function allowCompraSolicitacoesOrDelegacaoRead(req, res, next) {
  const contexto = String(req.query?.contexto || '').trim().toLowerCase();
  if (contexto === 'delegacao') {
    return allowComprasDelegacaoRead(req, res, next);
  }
  return allowCompraSolicitacoesRead(req, res, next);
}
const allowCompraSolicitacoesCreateFlowRead = allowPaymentAction(
  'COMPRAS_SOLICITACOES_CREATE_FLOW_READ',
  async (user) => (
    await canViewCompraSolicitacoes(user)
    || await canCreateCompraSolicitacao(user)
  ),
  'Acesso negado para revisar solicitacao de compra'
);
const allowCompraSolicitacoesCreate = allowPaymentAction(
  'COMPRAS_SOLICITACOES_CREATE',
  canCreateCompraSolicitacao,
  'Acesso negado para criar solicitacao de compra'
);
const allowCompraSolicitacoesManage = allowPaymentAction(
  'COMPRAS_SOLICITACOES_MANAGE',
  canManageCompraSolicitacoes,
  'Acesso negado para gerenciar solicitacoes de compra'
);
const allowCompraSolicitacoesAlterarQuantidade = allowPaymentAction(
  'COMPRAS_SOLICITACOES_EDIT_QUANTIDADE',
  canAlterarQuantidadeSolicitacaoCompra,
  'Acesso negado para alterar quantidade de itens da solicitacao de compra'
);
const allowComprasCatalogarItensManuais = allowPaymentAction(
  'COMPRAS_INSUMOS_CATALOGAR_MANUAIS',
  canCatalogarItensManuaisCompras,
  'Acesso negado para catalogar itens manuais de compras'
);
const allowCompraSolicitacoesEncaminhar = allowPaymentAction(
  'COMPRAS_SOLICITACOES_ENCAMINHAR',
  canEncaminharCompraSolicitacoes,
  'Acesso negado para enviar solicitacoes ao setor de compras'
);
const allowCompraSolicitacoesDelete = allowPaymentAction(
  'COMPRAS_SOLICITACOES_DELETE',
  canDeleteCompraSolicitacoes,
  'Acesso negado para inativar solicitacoes de compra'
);
const allowCompraSolicitacoesUpload = allowPaymentAction(
  'COMPRAS_SOLICITACOES_UPLOAD',
  async (user) => (
    await canCreateCompraSolicitacao(user)
    || await canManageCompraSolicitacoes(user)
    || await canManageComprasPedidos(user)
    || await canAnexarDocumentoPedidoCompraFinanceiro(user)
  ),
  'Acesso negado para enviar anexos de compras'
);
const allowComprasPedidosRead = allowPaymentAction(
  'COMPRAS_PEDIDOS_READ',
  canViewComprasPedidos,
  'Acesso negado para pedidos de compra'
);
const allowComprasPedidosManage = allowPaymentAction(
  'COMPRAS_PEDIDOS_MANAGE',
  canManageComprasPedidos,
  'Acesso negado para gerenciar pedidos de compra'
);
const allowComprasPedidosFinanceiroPrevisao = allowPaymentAction(
  'COMPRAS_PEDIDOS_FINANCEIRO_PREVISAO',
  canGerarPrevisaoPedidoCompraFinanceiro,
  'Acesso negado para gerar previsoes financeiras do pedido'
);
const allowComprasPedidosFinanceiroDocumento = allowPaymentAction(
  'COMPRAS_PEDIDOS_FINANCEIRO_DOCUMENTO',
  canAnexarDocumentoPedidoCompraFinanceiro,
  'Acesso negado para anexar documentos financeiros do pedido'
);
const allowComprasPedidosFinanceiroLiberar = allowPaymentAction(
  'COMPRAS_PEDIDOS_FINANCEIRO_LIBERAR',
  canLiberarPedidoCompraFinanceiro,
  'Acesso negado para liberar titulos do pedido'
);
const allowComprasPedidosFinanceiroReabertura = allowPaymentAction(
  'COMPRAS_PEDIDOS_FINANCEIRO_REABERTURA',
  canAprovarReaberturaPedidoCompraFinanceiro,
  'Acesso negado para decidir a reabertura financeira do pedido'
);
const allowComprasPedidosAnexarEspelho = allowPaymentAction(
  'COMPRAS_PEDIDOS_ANEXAR_ESPELHO',
  canAnexarEspelhoComprasPedidos,
  'Acesso negado para anexar o espelho do pedido de compra'
);
const allowComprasPedidosAlterarStatus = allowPaymentAction(
  'COMPRAS_PEDIDOS_ALTERAR_STATUS',
  canAlterarStatusComprasPedidos,
  'Acesso negado para alterar status de pedidos de compra'
);
const allowComprasPedidosEditarItens = allowPaymentAction(
  'COMPRAS_PEDIDOS_EDITAR_ITENS',
  canEditarItensComprasPedidos,
  'Acesso negado para editar itens de pedidos de compra'
);
const allowComprasPedidosRemanejar = allowPaymentAction(
  'COMPRAS_PEDIDOS_REMANEJAR',
  canRemanejarComprasPedidos,
  'Acesso negado para remanejar itens de pedidos de compra'
);
const allowComprasPedidosCancelar = allowPaymentAction(
  'COMPRAS_PEDIDOS_CANCELAR',
  canCancelarComprasPedidos,
  'Acesso negado para cancelar pedidos de compra'
);
const allowComprasPedidosReabrir = allowPaymentAction(
  'COMPRAS_PEDIDOS_REABRIR',
  canReabrirComprasPedidos,
  'Acesso negado para reabrir pedidos de compra'
);
const allowComprasPedidosFrete = allowPaymentAction(
  'COMPRAS_PEDIDOS_FRETE',
  canRegistrarFreteComprasPedidos,
  'Acesso negado para registrar frete de pedidos de compra'
);
const allowObrasCadastroManage = allowPaymentAction(
  'OBRAS_CADASTRO_MANAGE',
  canManageCadastroObras,
  'Acesso negado para criar ou editar obras'
);
const allowObrasGestaoRead = allowPaymentAction(
  'OBRAS_GESTAO_READ',
  canViewGestaoObras,
  'Acesso negado para a gestao de obras'
);
const allowObrasGestaoApropriacoes = allowPaymentAction(
  'OBRAS_GESTAO_APROPRIACOES',
  canManageGestaoObrasApropriacoes,
  'Acesso negado para alterar apropriacoes da gestao de obras'
);
const allowComprasPedidosCancelarFrete = allowPaymentAction(
  'COMPRAS_PEDIDOS_CANCELAR_FRETE',
  canCancelarFreteComprasPedidos,
  'Acesso negado para cancelar frete de pedidos de compra'
);
const allowComprasCotacoesRead = allowPaymentAction(
  'COMPRAS_COTACOES_READ',
  canViewComprasCotacoes,
  'Acesso negado para cotacoes de compra'
);
const allowComprasCotacoesManage = allowPaymentAction(
  'COMPRAS_COTACOES_MANAGE',
  canManageComprasCotacoes,
  'Acesso negado para gerenciar cotacoes de compra'
);
const allowComprasCotacoesEncerrar = allowPaymentAction(
  'COMPRAS_COTACOES_ENCERRAR',
  canFecharComprasCotacoes,
  'Acesso negado para gerar pedidos da cotacao de compra'
);
const allowComprasCotacoesEncerrarSemPedido = allowPaymentAction(
  'COMPRAS_COTACOES_ENCERRAR_SEM_PEDIDO',
  canEncerrarSemPedidoComprasCotacoes,
  'Acesso negado para encerrar a cotacao sem gerar pedido'
);
const allowComprasCotacoesReabrir = allowPaymentAction(
  'COMPRAS_COTACOES_REABRIR',
  canReabrirComprasCotacoes,
  'Acesso negado para reabrir cotacoes de compra'
);
const allowComprasCotacoesCancelar = allowPaymentAction(
  'COMPRAS_COTACOES_CANCELAR',
  canCancelarComprasCotacoes,
  'Acesso negado para cancelar cotacoes de compra'
);
const allowComprasCotacoesOperate = allowPaymentAction(
  'COMPRAS_COTACOES_OPERATE',
  canOperateComprasCotacoes,
  'Acesso negado para editar respostas de cotacoes de compra'
);
const allowComprasDelegacaoRead = allowPaymentAction(
  'COMPRAS_DELEGACAO_READ',
  canViewComprasDelegacao,
  'Acesso negado para delegacao de compras'
);
const allowComprasDelegacaoManage = allowPaymentAction(
  'COMPRAS_DELEGACAO_MANAGE',
  canManageComprasDelegacao,
  'Acesso negado para delegar compras'
);
const allowComprasFornecedoresRead = allowPaymentAction(
  'COMPRAS_FORNECEDORES_READ',
  canViewComprasFornecedores,
  'Acesso negado para fornecedores de compras'
);
const allowComprasFornecedoresManage = allowPaymentAction(
  'COMPRAS_FORNECEDORES_MANAGE',
  canManageComprasFornecedores,
  'Acesso negado para gerenciar fornecedores de compras'
);
const allowComprasRelatoriosRead = allowPaymentAction(
  'COMPRAS_RELATORIOS_READ',
  canViewComprasRelatorios,
  'Acesso negado para relatorios de compras'
);
const allowComprasConfiguracoesManage = allowPaymentAction(
  'COMPRAS_CONFIGURACOES_MANAGE',
  canManageComprasConfiguracoes,
  'Acesso negado para configurar compras'
);

const allowBoletosRead = permit({
  resource: 'BOLETOS',
  custom: async (req) => (
    (await canAccessBoletos(req.user))
      ? true
      : 'Acesso negado para boletos'
  )
});

const allowBoletosGenerate = permit({
  resource: 'BOLETOS',
  custom: async (req) => (
    (await canGenerateBoletos(req.user))
      ? true
      : 'Acesso negado para gerar boletos'
  )
});

const allowComercialEmpreendimentosRead = permit({
  resource: 'COMERCIAL',
  custom: async (req) => (
    (await canReadComercialBaseData(req.user))
      ? true
      : 'Acesso negado para empreendimentos comerciais'
  )
});

const allowComercialObrasRead = permit({
  resource: 'COMERCIAL',
  custom: async (req) => (
    (await canReadComercialBaseData(req.user))
      || (await canViewComercialContratos(req.user))
      || (await canCreateComercialContratos(req.user))
      || (await canManageComercialContratos(req.user))
      ? true
      : 'Acesso negado para obras comerciais'
  )
});

const allowComercialEmpreendimentosManage = permit({
  resource: 'COMERCIAL',
  custom: async (req) => (
    (await canManageComercialEmpreendimentos(req.user))
      ? true
      : 'Acesso negado para gerenciar empreendimentos comerciais'
  )
});

const allowComercialContratosRead = permit({
  resource: 'COMERCIAL',
  custom: async (req) => (
    (await canViewComercialContratos(req.user))
      ? true
      : 'Acesso negado para contratos comerciais'
  )
});

const allowComercialContratosCreate = permit({
  resource: 'COMERCIAL',
  custom: async (req) => (
    (await canCreateComercialContratos(req.user))
      ? true
      : 'Acesso negado para criar contratos comerciais'
  )
});

const allowComercialContratosManage = permit({
  resource: 'COMERCIAL',
  custom: async (req) => (
    (await canManageComercialContratos(req.user))
      ? true
      : 'Acesso negado para gerenciar contratos comerciais'
  )
});

const allowComercialContratosImport = permit({
  resource: 'COMERCIAL_CONTRATO_IMPORTACAO',
  custom: async (req) => (
    (await canImportComercialContratos(req.user))
      ? true
      : 'Acesso negado para importar contratos comerciais'
  )
});

const allowComercialContratosCategorias = permit({
  resource: 'COMERCIAL',
  custom: async (req) => (
    (await canViewComercialContratos(req.user))
      || (await canCreateComercialContratos(req.user))
      || (await canManageComercialContratos(req.user))
      ? true
      : 'Acesso negado para categorias financeiras comerciais'
  )
});

function allowConfiguracoesArea(area, errorMessage = 'Acesso negado para configuracoes') {
  return permit({
    resource: 'CONFIGURACOES',
    custom: async (req) => (
      (await canManageConfiguracoesArea(req.user, area))
        ? true
        : errorMessage
    )
  });
}

const allowBusinessAdmin = permit(['SUPERADMIN', 'ADMINISTRADOR']);
const allowConfiguracoesGeral = allowConfiguracoesArea('geral', 'Acesso negado para configuracoes administrativas');
const allowConfiguracoesCadastros = allowConfiguracoesArea('cadastros', 'Acesso negado para cadastros administrativos');
const allowConfiguracoesUsuarios = allowConfiguracoesArea('usuarios', 'Acesso negado para gerenciar usuarios');
const allowConfiguracoesStatusVinculos = allowConfiguracoesArea('status_vinculos', 'Acesso negado para status, vinculos e acessos');
const allowConfiguracoesSolicitacoes = allowConfiguracoesArea('solicitacoes', 'Acesso negado para configurar solicitacoes');
const allowConfiguracoesAparencia = allowConfiguracoesArea('aparencia', 'Acesso negado para configurar aparencia e suporte');
const allowConfiguracoesPermissoes = allowConfiguracoesArea('permissoes', 'Acesso negado para permissoes granulares');
const allowConfiguracoesModulos = allowConfiguracoesArea('modulos', 'Acesso negado para configurar modulos');
const allowSolicitacoesRelatorioOperacional = permit({
  resource: 'SOLICITACOES_RELATORIOS',
  custom: async (req) => (
    (await canViewSolicitacoesRelatorioOperacional(req.user))
      ? true
      : 'Acesso negado ao relatorio operacional de solicitacoes'
  )
});
const allowEmpresasGrupoRead = permit({
  resource: 'EMPRESAS_GRUPO',
  custom: async (req) => (
    ['SUPERADMIN', 'ADMINISTRADOR'].includes(String(req.user?.perfil || '').toUpperCase()) ||
    (await canAccessFinanceiro(req.user)) ||
    (await canManageRhDpEmpresas(req.user))
      ? true
      : 'Acesso negado para consultar empresas do grupo'
  )
});

router.get('/treinamento/resumo', allowTreinamentoRead, TreinamentoController.resumo);
router.get('/treinamento', allowTreinamentoRead, TreinamentoController.index);
router.post('/treinamento', allowTreinamentoManage, criticalRateLimit, TreinamentoController.create);
router.get('/treinamento/:id', allowTreinamentoRead, validateRequest({ params: validateNumericIdParam('id', 'Conteudo de treinamento') }), TreinamentoController.show);
router.patch('/treinamento/:id', allowTreinamentoManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conteudo de treinamento') }), TreinamentoController.update);
router.delete('/treinamento/:id', allowTreinamentoManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conteudo de treinamento') }), TreinamentoController.destroy);
router.post('/treinamento/:id/publicar', allowTreinamentoManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conteudo de treinamento') }), TreinamentoController.publicar);
router.post('/treinamento/:id/leitura', allowTreinamentoRead, validateRequest({ params: validateNumericIdParam('id', 'Conteudo de treinamento') }), TreinamentoController.leitura);
router.post('/treinamento/:id/upload', allowTreinamentoManage, uploadRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conteudo de treinamento') }), uploadTreinamentoFile.single('file'), TreinamentoController.upload);
router.get('/treinamento/:id/arquivo', allowTreinamentoRead, validateRequest({ params: validateNumericIdParam('id', 'Conteudo de treinamento') }), TreinamentoController.arquivoUrl);

router.get('/apropriacoes', requireAnyEnabledModule(['OBRAS', 'SOLICITACOES', 'COMPRAS', 'FINANCEIRO']), ApropriacaoController.index);
router.get('/apropriacoes/modelo-xlsx', requireEnabledModule('OBRAS'), permit(['SUPERADMIN']), ApropriacaoController.modeloXlsx);
router.post('/apropriacoes/importar-xlsx', requireEnabledModule('OBRAS'), allowBusinessAdmin, uploadRateLimit, uploadComprovantes.single('file'), ApropriacaoController.importarXlsx);
router.post('/apropriacoes', requireEnabledModule('OBRAS'), allowObrasGestaoApropriacoes, ApropriacaoController.create);
router.put('/apropriacoes/:id', requireEnabledModule('OBRAS'), allowObrasGestaoApropriacoes, ApropriacaoController.update);
router.delete('/apropriacoes/:id', requireEnabledModule('OBRAS'), allowObrasGestaoApropriacoes, ApropriacaoController.destroy);
const allowProvisoesModule = permit({
  resource: 'PROVISOES',
  custom: async (req) => (
    (await canAccessProvisoes(req.user))
      ? true
      : 'Acesso negado para o modulo de provisionamento'
  )
});
const allowProvisoesRead = permit({
  resource: 'PROVISOES',
  custom: async (req) => (
    (await canViewProvisoes(req.user))
      ? true
      : 'Acesso negado para o modulo de provisionamento'
  )
});
const allowProvisoesCreate = permit({
  resource: 'PROVISOES',
  custom: async (req) => (
    (await canCreateProvisoes(req.user))
      ? true
      : 'Acesso negado para criar provisionamentos'
  )
});
const allowProvisoesEdit = permit({
  resource: 'PROVISOES',
  custom: async (req) => (
    (await canEditProvisoes(req.user))
      ? true
      : 'Acesso negado para editar provisionamentos'
  )
});
const allowProvisoesDashboard = permit({
  resource: 'PROVISOES',
  custom: async (req) => (
    (await canViewProvisoesDashboard(req.user))
      ? true
      : 'Acesso negado para o dashboard de provisionamentos'
  )
});
const allowProvisoesCategorias = permit({
  resource: 'PROVISOES',
  custom: async (req) => (
    (await canManageProvisoesCategorias(req.user))
      ? true
      : 'Acesso negado para gerenciar categorias macro de provisionamento'
  )
});
const allowCrmLeadExport = permit({
  resource: 'CRM_LEADS_EXPORT',
  custom: async (req) => (
    (await canExportCrmLeads(req.user))
      ? true
      : 'Acesso negado para exportar leads do CRM'
  )
});
const allowCrmLeadRedistribute = permit({
  resource: 'CRM_LEADS_REDISTRIBUTE',
  custom: async (req) => (
    (await canRedistributeCrmLeads(req.user))
      ? true
      : 'Acesso negado para redistribuir leads do CRM'
  )
});
const allowCrmDashboardRead = permit({
  resource: 'CRM_DASHBOARD',
  custom: async (req) => (
    (await canViewCrmDashboard(req.user))
      ? true
      : 'Acesso negado para dashboards do CRM'
  )
});
const allowCrmLeadsRead = permit({
  resource: 'CRM_LEADS',
  custom: async (req) => (
    (await canViewCrmLeads(req.user))
      ? true
      : 'Acesso negado para leads do CRM'
  )
});
const allowCrmLeadsWrite = permit({
  resource: 'CRM_LEADS',
  custom: async (req) => (
    (await canCreateCrmLeads(req.user))
      ? true
      : 'Acesso negado para criar ou editar leads do CRM'
  )
});
const allowCrmAtendimentoRead = permit({
  resource: 'CRM_ATENDIMENTO',
  custom: async (req) => (
    (await canViewCrmAtendimento(req.user))
      ? true
      : 'Acesso negado para atendimento do CRM'
  )
});
const allowCrmAtendimentoSend = permit({
  resource: 'CRM_ATENDIMENTO',
  custom: async (req) => (
    (await canSendCrmAtendimento(req.user))
      ? true
      : 'Acesso negado para enviar mensagens no atendimento do CRM'
  )
});
const allowCrmAutomacoesRead = permit({
  resource: 'CRM_AUTOMACOES',
  custom: async (req) => (
    (await canViewCrmAutomacoes(req.user))
      ? true
      : 'Acesso negado para automacoes do CRM'
  )
});
const allowCrmAutomacoesManage = permit({
  resource: 'CRM_AUTOMACOES',
  custom: async (req) => (
    (await canManageCrmAutomacoes(req.user))
      ? true
      : 'Acesso negado para gerenciar automacoes do CRM'
  )
});
const allowCrmConfiguracoesRead = permit({
  resource: 'CRM_CONFIGURACOES',
  custom: async (req) => (
    (await canViewCrmConfiguracoes(req.user))
      ? true
      : 'Acesso negado para configuracoes do CRM'
  )
});
const allowCrmConfiguracoesManage = permit({
  resource: 'CRM_CONFIGURACOES',
  custom: async (req) => (
    (await canManageCrmConfiguracoes(req.user))
      ? true
      : 'Acesso negado para gerenciar configuracoes do CRM'
  )
});
const allowRhDpEmpresasManage = permit({
  resource: 'RH_DP_EMPRESAS',
  custom: async (req) => (
    (await canManageRhDpEmpresas(req.user))
      ? true
      : 'Acesso negado para empresas do RH/DP'
  )
});
const allowRhDpColaboradoresRead = permit({
  resource: 'RH_DP_COLABORADORES',
  custom: async (req) => (
    (await canViewRhDpColaboradores(req.user))
      ? true
      : 'Acesso negado para colaboradores do RH/DP'
  )
});
const allowRhDpDashboardRead = permit({
  resource: 'RH_DP_RELATORIOS',
  custom: async (req) => (
    (await canViewRhDpDashboard(req.user))
      ? true
      : 'Acesso negado para relatorios do RH/DP'
  )
});
const allowRhDpColaboradoresWrite = permit({
  resource: 'RH_DP_COLABORADORES',
  custom: async (req) => (
    (await canManageRhDpColaboradores(req.user))
      ? true
      : 'Acesso negado para edicao de colaboradores do RH/DP'
  )
});
/**
 * PEDIDO DE PESSOAL (Fase 6 do modulo DP, 26/08).
 *
 * ONDE E ESTRITO E ONDE NAO E — a distincao foi corrigida em 26/08 depois de um SUPERADMIN levar
 * "Acesso negado" numa tela que mostrava o botao para ele.
 *
 * `userHasStrictAreaPermission` tira o atalho por perfil: nem SUPERADMIN passa sem a permissao
 * marcada. Isso e o certo para UMA acao aqui — aprovar alteracao salarial, que o cliente definiu
 * como decisao de Diretoria concedida nominalmente. Aumento de salario nao pode ser consequencia
 * de alguem ser administrador do sistema.
 *
 * Para abrir, decidir e anexar, estrito era ERRADO por dois motivos:
 *
 * 1. sao operacoes ordinarias do modulo. Trancar o administrador fora delas nao protege nada —
 *    ele consegue conceder a permissao a si mesmo em dois cliques. So atrapalha a operacao;
 * 2. o FRONTEND usa `hasAnyExplicitPermissao`, que libera para administrador. Backend estrito com
 *    frontend permissivo produz o pior resultado possivel: o botao aparece e a acao falha. Quem
 *    clica conclui que o sistema esta quebrado, e nao que lhe falta permissao.
 *
 * Entao: `userHasAreaPermission` (com atalho de perfil) nas ordinarias, estrito so no salario.
 */
const allowRhDpSolicitacaoAbrir = permit({
  resource: 'RH_DP_SOLICITACOES',
  custom: async (req) => (
    (await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.abrir']))
      ? true
      : 'Acesso negado: abrir solicitacao de pessoal exige permissao especifica'
  )
});
const allowRhDpSolicitacaoDecidir = permit({
  resource: 'RH_DP_SOLICITACOES',
  custom: async (req) => (
    (await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.decidir']))
      ? true
      : 'Acesso negado: decidir solicitacao de pessoal exige permissao especifica'
  )
});
const allowRhDpSolicitacaoAnexar = permit({
  resource: 'RH_DP_SOLICITACOES',
  custom: async (req) => (
    (await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.anexar', 'rh_dp.solicitacoes.abrir']))
      ? true
      : 'Acesso negado: anexar na solicitacao de pessoal exige permissao especifica'
  )
});
// Ver a lista exige apenas poder ver colaborador: a visibilidade por obra e aplicada no controller.
const allowRhDpSolicitacaoVer = permit({
  resource: 'RH_DP_SOLICITACOES',
  custom: async (req) => (
    (await canViewRhDpColaboradores(req.user))
      ? true
      : 'Acesso negado para solicitacoes de pessoal'
  )
});

const allowRhDpDocumentosRead = permit({
  resource: 'RH_DP_DOCUMENTOS',
  custom: async (req) => (
    (await canViewRhDpDocumentos(req.user))
      ? true
      : 'Acesso negado para documentos do RH/DP'
  )
});
const allowRhDpDocumentosWrite = permit({
  resource: 'RH_DP_DOCUMENTOS',
  custom: async (req) => (
    (await canManageRhDpDocumentos(req.user))
      ? true
      : 'Acesso negado para gestao de documentos do RH/DP'
  )
});
const allowRhDpImportacoes = permit({
  resource: 'RH_DP_IMPORTACOES',
  custom: async (req) => (
    (await canExecuteRhDpImportacoes(req.user))
      ? true
      : 'Acesso negado para importacoes do RH/DP'
  )
});
const allowRhDpApuracaoRead = permit({
  resource: 'RH_DP_APURACAO',
  custom: async (req) => (
    (await canViewRhDpApuracao(req.user))
      ? true
      : 'Acesso negado para apuracao do RH/DP'
  )
});
const allowRhDpApuracaoWrite = permit({
  resource: 'RH_DP_APURACAO',
  custom: async (req) => (
    (await canEditRhDpApuracao(req.user))
      ? true
      : 'Acesso negado para ajuste da apuracao do RH/DP'
  )
});
const allowRhDpObrigacoesRead = permit({
  resource: 'RH_DP_FECHAMENTOS',
  custom: async (req) => (
    (await canViewRhDpObrigacoes(req.user))
      ? true
      : 'Acesso negado para obrigacoes do RH/DP'
  )
});
const allowRhDpFechamentoExecute = permit({
  resource: 'RH_DP_FECHAMENTOS',
  custom: async (req) => (
    (await canExecuteRhDpFechamento(req.user))
      ? true
      : 'Acesso negado para fechamento da competencia do RH/DP'
  )
});
const allowRhDpFechamentoReopen = permit({
  resource: 'RH_DP_FECHAMENTOS',
  custom: async (req) => (
    (await canReopenRhDpFechamento(req.user))
      ? true
      : 'Acesso negado para reabrir fechamento do RH/DP'
  )
});
const allowIntegracaoSiengeRead = permit({
  resource: 'INTEGRACAO_SIENGE',
  custom: async (req) => (
    (await canViewIntegracaoSienge(req.user))
      ? true
      : 'Acesso negado para a Integracao SIENGE'
  )
});
const allowIntegracaoSiengeRetry = permit({
  resource: 'INTEGRACAO_SIENGE',
  custom: async (req) => (
    (await canRetryIntegracaoSienge(req.user))
      ? true
      : 'Acesso negado para operar a fila da Integracao SIENGE'
  )
});
const allowIntegracaoSiengeConfigManage = permit({
  resource: 'INTEGRACAO_SIENGE',
  custom: async (req) => (
    (await canManageIntegracaoSiengeConfig(req.user))
      ? true
      : 'Acesso negado para configurar a Integracao SIENGE'
  )
});


// -------------------------------------------------------------------
// SOLICITAÇÕES
// -------------------------------------------------------------------

router.post('/solicitacoes', validateRequest({ body: validateSolicitacaoCreateBody }), SolicitacaoController.create);
router.get('/recargas-cartao/meus-cartoes', RecargaCartaoController.meusCartoes);
router.get('/recargas-cartao/cartoes/:id/contexto', validateRequest({ params: validateNumericIdParam('id', 'Cartao de recarga') }), RecargaCartaoController.contextoCartao);
router.get('/recargas-cartao/solicitacoes/:id', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), RecargaCartaoController.contextoSolicitacao);
router.patch('/recargas-cartao/solicitacoes/:id', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), RecargaCartaoController.editarPendente);
router.post('/recargas-cartao/solicitacoes/:id/prestacao', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), RecargaCartaoController.enviarPrestacao);
router.patch('/recargas-cartao/solicitacoes/:id/prestacao/rateios', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), RecargaCartaoController.editarRateiosPrestacao);
router.post('/recargas-cartao/solicitacoes/:id/prestacao/decisao', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), RecargaCartaoController.decidirPrestacao);
router.get('/configuracoes/cartoes-recarga', RecargaCartaoController.adminIndex);
router.post('/configuracoes/cartoes-recarga', criticalRateLimit, RecargaCartaoController.adminCreate);
router.patch('/configuracoes/cartoes-recarga/:id', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Cartao de recarga') }), RecargaCartaoController.adminUpdate);
router.get('/solicitacoes/filtros/obras', SolicitacaoController.obrasVisiveis);
router.get('/solicitacoes/apropriacao-padrao', ObraTipoApropriacaoController.resolverParaSolicitacao);
router.get('/solicitacoes/despesa-eventual/saldo', SolicitacaoController.saldoDespesaEventual);
router.get('/solicitacoes/filtros/status', SolicitacaoController.statusVisiveis);
router.get('/solicitacoes', SolicitacaoController.index);
// Contadores das visoes da lista — MESMO escopo da listagem (pacote B3).
// Registrada antes de /solicitacoes/:id para nao casar como id.
router.get('/solicitacoes/contadores', SolicitacaoController.contadores);
router.get('/solicitacoes/resumo', SolicitacaoController.resumo);
router.get('/solicitacoes/relatorios/operacional', allowSolicitacoesRelatorioOperacional, RelatorioSolicitacoesController.operacional);
router.get('/solicitacoes/:id/resumo-lista', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), SolicitacaoController.resumoLista);
router.get('/solicitacoes/:id', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), SolicitacaoController.show);
router.patch('/solicitacoes/:id/status', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoStatusBody }), auditSuccess({ eventType: 'SOLICITACAO_STATUS_UPDATED', resourceType: 'SOLICITACAO', description: 'Status da solicitacao atualizado', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.updateStatus);
router.post('/solicitacoes/:id/aprovar-diretoria', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_DIRETORIA_APPROVED', resourceType: 'SOLICITACAO', description: 'Solicitacao aprovada pela diretoria', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.aprovarDiretoria);
router.post('/solicitacoes/:id/aprovar', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_APPROVED', resourceType: 'SOLICITACAO', description: 'Solicitacao aprovada e encaminhada conforme o tipo', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.aprovarPorTipo);
router.post('/solicitacoes/:id/pagamentos', requireEnabledModule('FINANCEIRO'), validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_PAYMENT_ADDED', resourceType: 'SOLICITACAO', description: 'Pagamento informado na solicitacao', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.adicionarPagamento);
router.patch('/solicitacoes/:id/pedido', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoPedidoBody }), auditSuccess({ eventType: 'SOLICITACAO_PEDIDO_UPDATED', resourceType: 'SOLICITACAO', description: 'Numero do pedido atualizado', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.atualizarNumeroPedido);
router.patch('/solicitacoes/:id/ref-contrato', requireEnabledModule('CONTRATOS'), validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoRefContratoBody }), auditSuccess({ eventType: 'SOLICITACAO_CONTRATO_UPDATED', resourceType: 'SOLICITACAO', description: 'Referencia de contrato atualizada', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.atualizarRefContrato);
router.patch('/solicitacoes/:id/valor', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoValorBody }), auditSuccess({ eventType: 'SOLICITACAO_VALOR_UPDATED', resourceType: 'SOLICITACAO', description: 'Valor da solicitacao atualizado', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.atualizarValor);
router.patch('/solicitacoes/:id/data-vencimento', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoDataVencimentoBody }), auditSuccess({ eventType: 'SOLICITACAO_DUE_DATE_UPDATED', resourceType: 'SOLICITACAO', description: 'Data de vencimento da solicitacao atualizada', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.atualizarDataVencimento);
router.patch('/solicitacoes/:id/apropriacoes', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoApropriacoesBody }), auditSuccess({ eventType: 'SOLICITACAO_APROPRIACOES_UPDATED', resourceType: 'SOLICITACAO', description: 'Apropriacoes da solicitacao atualizadas', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.atualizarApropriacoes);
router.patch('/solicitacoes/:id/credor', requireEnabledModule('FINANCEIRO'), allowSolicitacaoFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoCredorBody }), auditSuccess({ eventType: 'SOLICITACAO_CREDOR_UPDATED', resourceType: 'SOLICITACAO', description: 'Credor da solicitacao atualizado', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.atualizarCredor);
router.post('/solicitacoes/:id/credor/cadastrar', requireEnabledModule('FINANCEIRO'), allowSolicitacaoFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoCredorCreateBody }), auditSuccess({ eventType: 'SOLICITACAO_CREDOR_CREATED_AND_LINKED', resourceType: 'SOLICITACAO', description: 'Credor cadastrado e vinculado a solicitacao', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.cadastrarCredorFinanceiro);
router.post('/solicitacoes/credores', auditSuccess({ eventType: 'SOLICITACAO_CREDOR_CREATED', resourceType: 'PARCEIRO', description: 'Credor criado durante abertura de solicitacao' }), ParceiroController.createCredorNovaSolicitacao);
router.post('/solicitacoes/favorecidos', criticalRateLimit, validateRequest({ body: validateSolicitacaoFavorecidoCreateBody }), auditSuccess({ eventType: 'SOLICITACAO_FAVORECIDO_CREATED', resourceType: 'PARCEIRO', description: 'Favorecido cadastrado durante abertura de solicitacao' }), ParceiroController.createFavorecidoNovaSolicitacao);
router.patch('/solicitacoes/arquivar-massa', validateRequest({ body: validateSolicitacaoArquivarMassaBody }), auditSuccess({ eventType: 'SOLICITACAO_ARCHIVED_BATCH', resourceType: 'SOLICITACAO', description: 'Solicitacoes arquivadas em massa', metadataResolver: (req) => ({ solicitacao_ids: req.body?.solicitacao_ids || [] }) }), SolicitacaoController.arquivarEmMassa);
router.post('/solicitacoes/enviar-setor-massa', validateRequest({ body: validateSolicitacaoEnviarSetorMassaBody }), auditSuccess({ eventType: 'SOLICITACAO_SENT_BATCH', resourceType: 'SOLICITACAO', description: 'Solicitacoes enviadas em massa para outro setor', metadataResolver: (req) => ({ solicitacao_ids: req.body?.solicitacao_ids || [], setor_destino: req.body?.setor_destino || null }) }), SolicitacaoController.enviarParaSetorEmMassa);
router.post('/solicitacoes/:id/comentarios', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoComentarioBody }), auditSuccess({ eventType: 'SOLICITACAO_COMMENTED', resourceType: 'SOLICITACAO', description: 'Comentario adicionado na solicitacao', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.adicionarComentario);
router.post('/solicitacoes/:id/retorno', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_RETURN_REQUESTED', resourceType: 'SOLICITACAO', description: 'Retorno da solicitacao solicitado', resourceIdResolver: (req) => req.params.id }), SolicitacaoRetornoController.solicitar);
router.post('/solicitacoes/retornos/:pedidoId/decisao', criticalRateLimit, validateRequest({ params: validateNumericIdParam('pedidoId', 'Pedido de retorno') }), auditSuccess({ eventType: 'SOLICITACAO_RETURN_DECIDED', resourceType: 'SOLICITACAO_RETORNO', description: 'Pedido de retorno decidido', resourceIdResolver: (req) => req.params.pedidoId }), SolicitacaoRetornoController.decidir);
router.post('/solicitacoes/retornos/:pedidoId/cancelar', criticalRateLimit, validateRequest({ params: validateNumericIdParam('pedidoId', 'Pedido de retorno') }), auditSuccess({ eventType: 'SOLICITACAO_RETURN_CANCELLED', resourceType: 'SOLICITACAO_RETORNO', description: 'Pedido de retorno cancelado', resourceIdResolver: (req) => req.params.pedidoId }), SolicitacaoRetornoController.cancelar);
router.delete('/solicitacoes/:id/comentarios/:historicoId', auditSuccess({ eventType: 'SOLICITACAO_COMMENT_REMOVED', resourceType: 'SOLICITACAO', description: 'Comentario removido da solicitacao', resourceIdResolver: (req) => req.params.id, metadataResolver: (req) => ({ historico_id: req.params.historicoId }) }), SolicitacaoController.removerComentario);
router.patch('/solicitacoes/:id/pendencia-financeira', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_FINANCIAL_DEADLINE_FLAG_UPDATED', resourceType: 'SOLICITACAO', description: 'Pendencia financeira da solicitacao atualizada', resourceIdResolver: (req) => req.params.id, metadataResolver: (req) => ({ marcar: Boolean(req.body?.marcar), tipo: req.body?.tipo || null }) }), SolicitacaoController.atualizarPendenciaFinanceira);
router.post('/solicitacoes/:id/enviar-setor', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoEnviarSetorBody }), auditSuccess({ eventType: 'SOLICITACAO_SENT_TO_SECTOR', resourceType: 'SOLICITACAO', description: 'Solicitacao enviada para outro setor', resourceIdResolver: (req) => req.params.id, metadataResolver: (req) => ({ setor_destino: req.body?.setor_destino || null }) }), SolicitacaoController.enviarParaSetor);
router.post('/solicitacoes/:id/assumir', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_ASSUMED', resourceType: 'SOLICITACAO', description: 'Solicitacao assumida', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.assumirSolicitacao);
router.patch('/solicitacoes/:id/ocultar', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_HIDDEN', resourceType: 'SOLICITACAO', description: 'Solicitacao ocultada pelo usuario', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.ocultarDaMinhaLista);
router.patch('/solicitacoes/:id/arquivar', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_HIDDEN', resourceType: 'SOLICITACAO', description: 'Solicitacao arquivada pelo usuario', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.ocultarDaMinhaLista);
router.patch('/solicitacoes/:id/desarquivar', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_UNHIDDEN', resourceType: 'SOLICITACAO', description: 'Solicitacao desarquivada pelo usuario', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.desarquivarDaMinhaLista);
router.delete('/solicitacoes/:id', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), auditSuccess({ eventType: 'SOLICITACAO_DELETED', resourceType: 'SOLICITACAO', description: 'Solicitacao excluida', resourceIdResolver: (req) => req.params.id }), SolicitacaoController.excluir);

router.get('/prioridades-diretoria/contexto', requireEnabledModule('SOLICITACOES'), PrioridadeDiretoriaController.contexto);
router.get('/prioridades-diretoria/lotes', requireEnabledModule('SOLICITACOES'), PrioridadeDiretoriaController.index);
router.post('/prioridades-diretoria/lotes', requireEnabledModule('SOLICITACOES'), auditSuccess({ eventType: 'DIRETORIA_PRIORITY_BATCH_CREATED', resourceType: 'PRIORIDADE_DIRETORIA', description: 'Lote de prioridade da diretoria criado' }), PrioridadeDiretoriaController.create);
router.post('/prioridades-diretoria/lotes/solicitar-urgencia', requireEnabledModule('SOLICITACOES'), auditSuccess({ eventType: 'DIRETORIA_PRIORITY_BATCH_URGENT_REQUESTED', resourceType: 'PRIORIDADE_DIRETORIA', description: 'Pedido de prioridade financeira criado pela diretoria' }), PrioridadeDiretoriaController.solicitarUrgencia);
router.post('/prioridades-diretoria/titulos-por-solicitacoes', requireEnabledModule('SOLICITACOES'), PrioridadeDiretoriaController.titulosPorSolicitacoes);
router.get('/prioridades-diretoria/lotes/:id', requireEnabledModule('SOLICITACOES'), validateRequest({ params: validateNumericIdParam('id', 'Lote de prioridade') }), PrioridadeDiretoriaController.show);
router.get('/prioridades-diretoria/lotes/:id/solicitacoes-disponiveis', requireEnabledModule('SOLICITACOES'), validateRequest({ params: validateNumericIdParam('id', 'Lote de prioridade') }), PrioridadeDiretoriaController.solicitacoesDisponiveis);
router.post('/prioridades-diretoria/lotes/:id/salvar-selecao', requireEnabledModule('SOLICITACOES'), validateRequest({ params: validateNumericIdParam('id', 'Lote de prioridade') }), (req, res) => {
  req.body = { ...(req.body || {}), rascunho: true };
  return PrioridadeDiretoriaController.finalizar(req, res);
});
router.post('/prioridades-diretoria/lotes/:id/reabrir', requireEnabledModule('SOLICITACOES'), validateRequest({ params: validateNumericIdParam('id', 'Lote de prioridade') }), (req, res) => {
  req.body = { ...(req.body || {}), reabrir: true };
  return PrioridadeDiretoriaController.finalizar(req, res);
});
router.post('/prioridades-diretoria/lotes/:id/finalizar', requireEnabledModule('SOLICITACOES'), validateRequest({ params: validateNumericIdParam('id', 'Lote de prioridade') }), auditSuccess({ eventType: 'DIRETORIA_PRIORITY_BATCH_CLOSED', resourceType: 'PRIORIDADE_DIRETORIA', description: 'Lote de prioridade da diretoria finalizado', resourceIdResolver: (req) => req.params.id }), PrioridadeDiretoriaController.finalizar);
router.post('/prioridades-diretoria/lotes/:id/cancelar', requireEnabledModule('SOLICITACOES'), validateRequest({ params: validateNumericIdParam('id', 'Lote de prioridade') }), PrioridadeDiretoriaController.cancelar);
router.delete('/prioridades-diretoria/lotes/:id', requireEnabledModule('SOLICITACOES'), validateRequest({ params: validateNumericIdParam('id', 'Lote de prioridade') }), PrioridadeDiretoriaController.excluir);
router.get('/solicitacoes/:id/titulos-financeiros', allowSolicitacaoFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao') }), TituloFinanceiroController.listarPorSolicitacao);
router.post('/solicitacoes/:id/gerar-conta', requireEnabledModule('FINANCEIRO'), allowSolicitacaoFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateFinanceTituloCreateFromSolicitacaoBody }), TituloFinanceiroController.criarPorSolicitacao);

// -------------------------------------------------------------------
// NOTIFICACOES
// -------------------------------------------------------------------
router.get('/notificacoes', NotificacaoController.index);
router.patch('/notificacoes/:id/lida', NotificacaoController.marcarLida);
router.patch('/notificacoes/lidas', NotificacaoController.marcarTodasLidas);



// -------------------------------------------------------------------
// ANEXOS (UPLOAD DENTRO DA SOLICITAÇÃO)
// -------------------------------------------------------------------

router.post(
  '/anexos/upload',
  uploadRateLimit,
  uploadComprovantes.array('files'),
  AnexoController.upload
);

router.get(
  '/anexos/presign',
  validateRequest({ query: validatePresignQuery }),
  AnexoController.presign
);

router.delete(
  '/anexos/historico/:historicoId',
  validateRequest({ params: validateNumericIdParam('historicoId', 'Historico') }),
  AnexoController.remover
);

router.get(
  '/solicitacoes/:id/anexos',
  AnexoController.listarPorSolicitacao
);

router.get(
  '/solicitacoes/:id/pedidos-compra/:pedidoId/pdf',
  requireEnabledModule('SOLICITACOES'),
  validateRequest({ params: validateSolicitacaoPedidoCompraPdfParams }),
  PedidoCompraController.pdfPorSolicitacao
);
// -------------------------------------------------------------------
// COMPROVANTES
// -------------------------------------------------------------------
const allowComprovantes = permit({
  resource: 'COMPROVANTE',
  custom: async (req) => (
    (await canAccessComprovantes(req.user))
      ? true
      : 'Acesso negado para comprovantes'
  )
});

router.post(
  '/comprovantes/upload-massa',
  allowComprovantes,
  uploadRateLimit,
  uploadComprovantes.array('files'),
  ComprovanteController.uploadMassa
);

router.get(
  '/comprovantes/solicitacoes',
  allowComprovantes,
  ComprovanteController.solicitacoes
);

router.get(
  '/comprovantes/pendentes',
  allowComprovantes,
  ComprovanteController.pendentes
);

router.post(
  '/comprovantes/:id/vincular',
  allowComprovantes,
  validateRequest({ params: validateNumericIdParam('id', 'Comprovante') }),
  ComprovanteController.vincular
);

router.delete(
  '/comprovantes/:id',
  allowComprovantes,
  validateRequest({ params: validateNumericIdParam('id', 'Comprovante') }),
  ComprovanteController.remover
);
// -------------------------------------------------------------------
// USUÁRIOS
// -------------------------------------------------------------------

router.get('/usuarios', allowGestaoUsuarios, UsuarioController.index);
router.get('/usuarios/opcoes-atribuicao', UsuarioController.opcoesAtribuicao);
router.get('/usuarios/:id', allowGestaoUsuarios, validateRequest({ params: validateNumericIdParam('id', 'Usuario') }), UsuarioController.show);
router.post('/usuarios', allowGestaoUsuarios, UsuarioController.create);
router.post('/usuarios/importar-massa', allowGestaoUsuarios, uploadRateLimit, uploadComprovantes.single('file'), UsuarioController.importarMassa);
router.post('/usuarios/forcar-reset-senhas', allowGestaoUsuarios, UsuarioController.forcarResetSenhas);
router.post('/usuarios/:id/enviar-convite', allowGestaoUsuarios, validateRequest({ params: validateNumericIdParam('id', 'Usuario') }), UsuarioController.enviarConvite);
router.put('/usuarios/:id', allowGestaoUsuarios, validateRequest({ params: validateNumericIdParam('id', 'Usuario') }), UsuarioController.update);
router.patch('/usuarios/me/senha', passwordChangeRateLimit, validateRequest({ body: validatePasswordChangeBody }), UsuarioController.alterarSenha);
router.patch('/usuarios/:id/ativar', allowGestaoUsuarios, validateRequest({ params: validateNumericIdParam('id', 'Usuario') }), UsuarioController.ativar);
router.patch('/usuarios/:id/desativar', allowGestaoUsuarios, validateRequest({ params: validateNumericIdParam('id', 'Usuario') }), UsuarioController.desativar);
router.post('/solicitacoes/:id/atribuir', validateRequest({ params: validateNumericIdParam('id', 'Solicitacao'), body: validateSolicitacaoResponsavelBody }), auditSuccess({ eventType: 'SOLICITACAO_ASSIGNED', resourceType: 'SOLICITACAO', description: 'Responsavel atribuido a solicitacao', resourceIdResolver: (req) => req.params.id, metadataResolver: (req) => ({ usuario_responsavel_id: req.body?.usuario_responsavel_id || null }) }), SolicitacaoController.atribuirResponsavel);




// -------------------------------------------------------------------
// CARGOS
// -------------------------------------------------------------------

router.get('/cargos', CargoController.index);
router.post('/cargos', allowConfiguracoesCadastros, validateRequest({ body: validateCargoCreateBody }), CargoController.create);
router.patch('/cargos/:id', allowConfiguracoesCadastros, validateRequest({ params: validateNumericIdParam('id', 'Cargo'), body: validateCargoUpdateBody }), CargoController.update);
router.patch('/cargos/:id/ativar', allowConfiguracoesCadastros, validateRequest({ params: validateNumericIdParam('id', 'Cargo') }), CargoController.ativar);
router.patch('/cargos/:id/desativar', allowConfiguracoesCadastros, validateRequest({ params: validateNumericIdParam('id', 'Cargo') }), CargoController.desativar);

// -------------------------------------------------------------------
// SETORES
// -------------------------------------------------------------------

router.get('/setores', SetorController.index);
router.post('/setores', allowConfiguracoesCadastros, validateRequest({ body: validateSetorCreateBody }), SetorController.create);
router.patch('/setores/:id', allowConfiguracoesCadastros, validateRequest({ params: validateNumericIdParam('id', 'Setor'), body: validateSetorUpdateBody }), SetorController.update);
router.patch('/setores/:id/ativar', allowConfiguracoesCadastros, validateRequest({ params: validateNumericIdParam('id', 'Setor') }), SetorController.ativar);
router.patch('/setores/:id/desativar', allowConfiguracoesCadastros, validateRequest({ params: validateNumericIdParam('id', 'Setor') }), SetorController.desativar);

// -------------------------------------------------------------------
// OBRAS
// -------------------------------------------------------------------

router.get('/obras', ObraController.index);
router.get('/obras/minhas', ObraController.minhas);
router.get('/obras/gestao', requireEnabledModule('OBRAS'), allowObrasGestaoRead, ObraController.gestaoIndex);
router.get('/obras/:id/gestao', requireEnabledModule('OBRAS'), allowObrasGestaoRead, validateRequest({ params: validateNumericIdParam('id', 'Obra') }), ObraController.gestaoShow);
router.post('/obras', allowObrasCadastroManage, ObraController.create);
router.patch('/obras/:id', allowObrasCadastroManage, ObraController.update);
router.patch('/obras/:id/ativar', allowObrasCadastroManage, ObraController.ativar);
router.patch('/obras/:id/desativar', allowObrasCadastroManage, ObraController.desativar);

// -------------------------------------------------------------------
// PARCEIROS
// -------------------------------------------------------------------

router.get('/parceiros/categorias', ParceiroCategoriaController.index);
router.post('/parceiros/categorias', allowConfiguracoesCadastros, ParceiroCategoriaController.create);
router.patch('/parceiros/categorias/:id', allowConfiguracoesCadastros, validateRequest({ params: validateNumericIdParam('id', 'Categoria de parceiro') }), ParceiroCategoriaController.update);
router.delete('/parceiros/categorias/:id', allowConfiguracoesCadastros, validateRequest({ params: validateNumericIdParam('id', 'Categoria de parceiro') }), ParceiroCategoriaController.destroy);
router.get('/parceiros/modelo-xlsx', allowConfiguracoesCadastros, ParceiroController.modeloXlsx);
router.get('/parceiros/exportar-xlsx', allowConfiguracoesCadastros, ParceiroController.exportarXlsx);
router.post('/parceiros/importar-xlsx', allowConfiguracoesCadastros, uploadRateLimit, uploadComprovantes.single('file'), ParceiroController.importarXlsx);
router.get('/parceiros', ParceiroController.index);
router.get('/parceiros/:id', validateRequest({ params: validateNumericIdParam('id', 'Parceiro') }), ParceiroController.show);
router.post('/parceiros', allowConfiguracoesCadastros, ParceiroController.create);
router.patch('/parceiros/:id', allowConfiguracoesCadastros, validateRequest({ params: validateNumericIdParam('id', 'Parceiro') }), ParceiroController.update);

// -------------------------------------------------------------------
// COMERCIAL
// -------------------------------------------------------------------
router.get('/comercial/obras', allowComercialObrasRead, ComercialEmpreendimentoController.obras);
router.get('/comercial/empreendimentos', allowComercialEmpreendimentosRead, validateRequest({ query: validateComercialEmpreendimentoQuery }), ComercialEmpreendimentoController.index);
router.post('/comercial/empreendimentos', allowComercialEmpreendimentosManage, criticalRateLimit, validateRequest({ body: validateComercialEmpreendimentoCreateBody }), ComercialEmpreendimentoController.create);
router.patch('/comercial/empreendimentos/:id', allowComercialEmpreendimentosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Empreendimento'), body: validateComercialEmpreendimentoUpdateBody }), ComercialEmpreendimentoController.update);
router.get('/comercial/unidades', allowComercialEmpreendimentosRead, validateRequest({ query: validateComercialUnidadeQuery }), ComercialUnidadeController.index);
router.get('/comercial/unidades-configuracao', allowComercialEmpreendimentosRead, ComercialUnidadeController.configuracao);
router.patch('/comercial/unidades-configuracao', allowComercialEmpreendimentosManage, criticalRateLimit, ComercialUnidadeController.atualizarConfiguracao);
router.post('/comercial/unidades', allowComercialEmpreendimentosManage, criticalRateLimit, validateRequest({ body: validateComercialUnidadeCreateBody }), ComercialUnidadeController.create);
router.patch('/comercial/unidades/:id', allowComercialEmpreendimentosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Unidade comercial'), body: validateComercialUnidadeUpdateBody }), ComercialUnidadeController.update);
router.get('/comercial/tabelas-preco', allowComercialEmpreendimentosRead, validateRequest({ query: validateComercialTabelaPrecoQuery }), ComercialTabelaPrecoController.index);
router.post('/comercial/tabelas-preco', allowComercialEmpreendimentosManage, criticalRateLimit, validateRequest({ body: validateComercialTabelaPrecoCreateBody }), ComercialTabelaPrecoController.create);
router.patch('/comercial/tabelas-preco/:id', allowComercialEmpreendimentosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Tabela de preco comercial'), body: validateComercialTabelaPrecoUpdateBody }), ComercialTabelaPrecoController.update);
router.post('/comercial/tabelas-preco/:id/ativar', allowComercialEmpreendimentosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Tabela de preco comercial') }), ComercialTabelaPrecoController.ativar);
router.get('/comercial/relatorios/operacional', allowComercialContratosRead, validateRequest({ query: validateComercialRelatorioOperacionalQuery }), ComercialRelatorioController.operacional);
router.get('/comercial/contratos-variaveis', allowComercialContratosRead, ComercialContratoDocumentoController.variaveis);
router.get('/comercial/contratos-modelos', allowComercialContratosRead, ComercialContratoDocumentoController.listarModelos);
router.post('/comercial/contratos-modelos', allowComercialContratosManage, uploadRateLimit, uploadComprovantes.single('file'), ComercialContratoDocumentoController.criarModelo);
router.get('/comercial/contratos-documentos/:documentoId/link', allowComercialContratosRead, validateRequest({ params: validateNumericIdParam('documentoId', 'Documento comercial') }), ComercialContratoDocumentoController.obterLink);
router.post('/comercial/contratos-documentos/:documentoId/enviar-d4sign', allowComercialContratosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('documentoId', 'Documento comercial') }), ComercialContratoDocumentoController.enviarD4Sign);
router.delete('/comercial/contratos-documentos/:documentoId', allowComercialContratosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('documentoId', 'Documento comercial') }), ComercialContratoDocumentoController.excluirDocumento);
router.get('/comercial/contratos-importacao/modelo', allowComercialContratosImport, ComercialContratoImportacaoController.modelo);
router.post('/comercial/contratos-importacao/preview', allowComercialContratosImport, uploadRateLimit, uploadComprovantes.single('file'), ComercialContratoImportacaoController.preview);
router.get('/comercial/contratos-importacao/:id', allowComercialContratosImport, validateRequest({ params: validateNumericIdParam('id', 'Importacao Sienge') }), ComercialContratoImportacaoController.show);
router.post('/comercial/contratos-importacao/:id/confirmar', allowComercialContratosImport, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Importacao Sienge') }), ComercialContratoImportacaoController.confirmar);
router.get('/comercial/categorias-financeiras', allowComercialContratosCategorias, ComercialContratoController.categoriasFinanceiras);
router.get('/comercial/contratos', allowComercialContratosRead, validateRequest({ query: validateComercialContratoQuery }), ComercialContratoController.index);
router.get('/comercial/contratos/:id', allowComercialContratosRead, validateRequest({ params: validateNumericIdParam('id', 'Contrato comercial') }), ComercialContratoController.show);
router.post('/comercial/contratos', allowComercialContratosCreate, criticalRateLimit, validateRequest({ body: validateComercialContratoCreateBody }), ComercialContratoController.create);
router.patch('/comercial/contratos/:id', allowComercialContratosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Contrato comercial'), body: validateComercialContratoUpdateBody }), ComercialContratoController.update);
router.delete('/comercial/contratos/:id', allowComercialContratosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Contrato comercial') }), ComercialContratoController.destroy);
router.post('/comercial/contratos/:id/distrato', allowComercialContratosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Contrato comercial'), body: validateComercialContratoDistratoBody }), ComercialContratoController.distratar);
router.post('/comercial/contratos/:id/troca-unidade', allowComercialContratosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Contrato comercial'), body: validateComercialContratoTrocaUnidadeBody }), ComercialContratoController.trocarUnidade);
router.post('/comercial/contratos/:id/sincronizar-status-financeiro', allowComercialContratosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Contrato comercial') }), ComercialContratoController.sincronizarStatusFinanceiro);
router.get('/comercial/contratos/:id/documentos', allowComercialContratosRead, validateRequest({ params: validateNumericIdParam('id', 'Contrato comercial') }), ComercialContratoDocumentoController.listarDocumentosContrato);
router.post('/comercial/contratos/:id/documentos/assinado', allowComercialContratosManage, uploadRateLimit, uploadComprovantes.single('file'), validateRequest({ params: validateNumericIdParam('id', 'Contrato comercial') }), ComercialContratoDocumentoController.anexarAssinado);
router.post('/comercial/contratos/:id/documentos/gerar', allowComercialContratosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Contrato comercial') }), ComercialContratoDocumentoController.gerarDocumento);

// -------------------------------------------------------------------
// PROVISIONAMENTO FINANCEIRO
// -------------------------------------------------------------------
router.get('/provisoes-financeiras/contexto', allowProvisoesModule, ProvisaoFinanceiraController.contexto);
router.get('/provisoes-financeiras/dashboard/resumo', allowProvisoesDashboard, validateRequest({ query: validateProvisaoDashboardQuery }), ProvisaoFinanceiraDashboardController.resumo);
router.get('/provisoes-financeiras/categorias', allowProvisoesModule, validateRequest({ query: validateProvisaoCategoriaQuery }), ProvisaoCategoriaMacroController.index);
router.post('/provisoes-financeiras/categorias', allowProvisoesCategorias, criticalRateLimit, validateRequest({ body: validateProvisaoCategoriaCreateBody }), ProvisaoCategoriaMacroController.create);
router.put('/provisoes-financeiras/categorias/:id', allowProvisoesCategorias, criticalRateLimit, validateRequest({ params: validateProvisaoIdParams, body: validateProvisaoCategoriaUpdateBody }), ProvisaoCategoriaMacroController.update);
router.patch('/provisoes-financeiras/categorias/:id/ativar', allowProvisoesCategorias, criticalRateLimit, validateRequest({ params: validateProvisaoIdParams }), ProvisaoCategoriaMacroController.ativar);
router.patch('/provisoes-financeiras/categorias/:id/desativar', allowProvisoesCategorias, criticalRateLimit, validateRequest({ params: validateProvisaoIdParams }), ProvisaoCategoriaMacroController.desativar);
router.get('/provisoes-financeiras/anexos/:anexoId/link', allowProvisoesRead, validateRequest({ params: validateProvisaoAnexoLinkParams }), ProvisaoFinanceiraController.obterLinkAnexo);
router.get('/provisoes-financeiras', allowProvisoesRead, validateRequest({ query: validateProvisaoFinanceiraQuery }), ProvisaoFinanceiraController.index);
router.post('/provisoes-financeiras', allowProvisoesCreate, criticalRateLimit, validateRequest({ body: validateProvisaoFinanceiraCreateBody }), ProvisaoFinanceiraController.create);
router.get('/provisoes-financeiras/:id', allowProvisoesRead, validateRequest({ params: validateProvisaoIdParams }), ProvisaoFinanceiraController.show);
router.put('/provisoes-financeiras/:id', allowProvisoesEdit, criticalRateLimit, validateRequest({ params: validateProvisaoIdParams, body: validateProvisaoFinanceiraUpdateBody }), ProvisaoFinanceiraController.update);
router.get('/provisoes-financeiras/:id/anexos', allowProvisoesRead, validateRequest({ params: validateProvisaoIdParams }), ProvisaoFinanceiraController.listarAnexos);
router.post('/provisoes-financeiras/:id/anexos', allowProvisoesEdit, uploadRateLimit, uploadComprovantes.array('files'), validateRequest({ params: validateProvisaoIdParams }), ProvisaoFinanceiraController.uploadAnexos);
router.post('/provisoes-financeiras/:id/comentarios', allowProvisoesEdit, criticalRateLimit, validateRequest({ params: validateProvisaoIdParams, body: validateProvisaoComentarioBody }), ProvisaoFinanceiraController.adicionarComentario);

// -------------------------------------------------------------------
// RH/DP - BLOCO 2
// -------------------------------------------------------------------
router.get('/empresas-grupo', allowEmpresasGrupoRead, validateRequest({ query: validateRhEmpresaGrupoQuery }), RhEmpresaGrupoController.index);
router.post('/empresas-grupo', allowConfiguracoesCadastros, criticalRateLimit, validateRequest({ body: validateRhEmpresaGrupoCreateBody }), RhEmpresaGrupoController.create);
router.patch('/empresas-grupo/:id', allowConfiguracoesCadastros, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Empresa do grupo'), body: validateRhEmpresaGrupoUpdateBody }), RhEmpresaGrupoController.update);
router.get('/rh/empresas-grupo', allowRhDpEmpresasManage, validateRequest({ query: validateRhEmpresaGrupoQuery }), RhEmpresaGrupoController.index);
router.post('/rh/empresas-grupo', allowRhDpEmpresasManage, criticalRateLimit, validateRequest({ body: validateRhEmpresaGrupoCreateBody }), RhEmpresaGrupoController.create);
router.patch('/rh/empresas-grupo/:id', allowRhDpEmpresasManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Empresa do grupo RH/DP'), body: validateRhEmpresaGrupoUpdateBody }), RhEmpresaGrupoController.update);
router.get('/rh/relatorios/operacional', allowRhDpDashboardRead, validateRequest({ query: validateRhRelatorioOperacionalQuery }), RhRelatorioController.operacional);
router.get('/rh/colaboradores', allowRhDpColaboradoresRead, validateRequest({ query: validateRhColaboradorQuery }), RhColaboradorController.index);
router.get('/rh/colaboradores/:id', allowRhDpColaboradoresRead, validateRequest({ params: validateNumericIdParam('id', 'Colaborador RH/DP') }), RhColaboradorController.show);
router.post('/rh/colaboradores', allowRhDpColaboradoresWrite, criticalRateLimit, validateRequest({ body: validateRhColaboradorCreateBody }), RhColaboradorController.create);
router.patch('/rh/colaboradores/:id', allowRhDpColaboradoresWrite, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Colaborador RH/DP'), body: validateRhColaboradorUpdateBody }), RhColaboradorController.update);
router.post('/rh/colaboradores/importar-massa', allowRhDpColaboradoresWrite, uploadRateLimit, uploadComprovantes.single('file'), RhColaboradorController.importarMassa);

// --- Pedido de pessoal: a Obra pede, o DP decide (Fase 6 do modulo DP, 26/08) ---
router.get('/rh/solicitacoes', allowRhDpSolicitacaoVer, RhSolicitacaoController.index);
router.get('/rh/solicitacoes/checklist', allowRhDpSolicitacaoVer, RhSolicitacaoController.checklistDoTipo);
router.get('/rh/solicitacoes/:id', allowRhDpSolicitacaoVer, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.show);
router.get('/rh/solicitacoes/:id/conferencia', allowRhDpSolicitacaoVer, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.conferencia);
router.post('/rh/solicitacoes', allowRhDpSolicitacaoAbrir, criticalRateLimit, RhSolicitacaoController.create);
router.post('/rh/solicitacoes/:id/anexos', allowRhDpSolicitacaoAnexar, uploadRateLimit, uploadComprovantes.single('file'), validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.anexar);
router.post('/rh/solicitacoes/:id/aprovar', allowRhDpSolicitacaoDecidir, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.aprovar);
router.post('/rh/solicitacoes/:id/rejeitar', allowRhDpSolicitacaoDecidir, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.rejeitar);
router.post('/rh/solicitacoes/:id/reenviar', allowRhDpSolicitacaoAbrir, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.reenviar);
router.post('/rh/solicitacoes/:id/cancelar', allowRhDpSolicitacaoAbrir, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.cancelar);
// --- Fases 9 a 11 do DP (27/08). O checklist do TIPO vem antes do `:id` de proposito: sem barra
// numerica, `/rh/solicitacoes/checklist` seria capturado por `/rh/solicitacoes/:id` se viesse depois.
router.post('/rh/solicitacoes/:id/enviar', allowRhDpSolicitacaoAbrir, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.enviar);
router.post('/rh/solicitacoes/:id/checklist', allowRhDpSolicitacaoAbrir, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.marcarChecklist);
router.get('/rh/cargos', allowRhDpSolicitacaoVer, RhSolicitacaoController.cargos);
router.get('/rh/colaboradores/:colaboradorId/apontamentos', allowRhDpSolicitacaoVer, validateRequest({ params: validateNumericIdParam('colaboradorId', 'Colaborador') }), RhSolicitacaoController.apontamentos);

// Anexos: a obra manda, o DP ATESTA antes de virar documento do colaborador (26/08).
router.get('/rh/solicitacoes/:id/anexos', allowRhDpSolicitacaoVer, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.listarAnexos);
router.post('/rh/solicitacoes/:id/anexos/:anexoId/validar', allowRhDpSolicitacaoDecidir, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de pessoal') }), RhSolicitacaoController.validar);

// --- Jornada por formulario, pagamento individual e historicos (Fases 4 e 5) ---
router.get('/rh/jornada/colaboradores', allowRhDpSolicitacaoVer, RhJornadaController.colaboradoresDaCompetencia);
router.get('/rh/jornada/edicoes/pendentes', allowRhDpSolicitacaoDecidir, RhJornadaController.listarEdicoesPendentes);
router.post('/rh/jornada', allowRhDpSolicitacaoAbrir, criticalRateLimit, RhJornadaController.registrar);
router.post('/rh/jornada/individual', allowRhDpSolicitacaoAbrir, criticalRateLimit, RhJornadaController.pagamentoIndividual);
router.post('/rh/jornada/edicoes/solicitar', allowRhDpSolicitacaoAbrir, criticalRateLimit, RhJornadaController.solicitarEdicao);
router.post('/rh/jornada/edicoes/:id/decidir', allowRhDpSolicitacaoDecidir, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de edicao da jornada') }), RhJornadaController.decidirEdicao);
router.get('/rh/colaboradores/:id/eventos-recorrentes', allowRhDpSolicitacaoVer, validateRequest({ params: validateNumericIdParam('id', 'Colaborador RH/DP') }), RhJornadaController.eventosDoColaborador);
router.post('/rh/eventos-recorrentes/:id/desativar', allowRhDpSolicitacaoDecidir, validateRequest({ params: validateNumericIdParam('id', 'Evento recorrente') }), RhJornadaController.desativarEvento);
router.get('/rh/apuracao-eventos/:id/itens', allowRhDpSolicitacaoVer, validateRequest({ params: validateNumericIdParam('id', 'Linha da folha') }), RhJornadaController.itensDaFolha);
router.get('/rh/colaboradores/:id/historico-vinculo', allowRhDpSolicitacaoVer, validateRequest({ params: validateNumericIdParam('id', 'Colaborador RH/DP') }), RhJornadaController.historicoDeVinculo);
router.get('/rh/colaboradores/:id/historico-salario', allowRhDpSolicitacaoVer, validateRequest({ params: validateNumericIdParam('id', 'Colaborador RH/DP') }), RhJornadaController.historicoDeSalario);
router.get('/rh/documentos/tipos', allowRhDpDocumentosRead, validateRequest({ query: validateRhDocumentoTipoQuery }), RhDocumentoController.listarTipos);
router.get('/rh/documentos', allowRhDpDocumentosRead, validateRequest({ query: validateRhDocumentoQuery }), RhDocumentoController.index);
router.get('/rh/documentos/:id', allowRhDpDocumentosRead, validateRequest({ params: validateNumericIdParam('id', 'Documento RH/DP') }), RhDocumentoController.show);
router.get('/rh/documentos/:id/link', allowRhDpDocumentosRead, validateRequest({ params: validateNumericIdParam('id', 'Documento RH/DP') }), RhDocumentoController.obterLink);
router.post('/rh/documentos', allowRhDpDocumentosWrite, uploadRateLimit, uploadComprovantes.single('file'), validateRequest({ body: validateRhDocumentoCreateBody }), RhDocumentoController.create);
router.patch('/rh/documentos/:id', allowRhDpDocumentosWrite, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Documento RH/DP'), body: validateRhDocumentoUpdateBody }), RhDocumentoController.update);
router.post('/rh/documentos/:id/substituir', allowRhDpDocumentosWrite, uploadRateLimit, uploadComprovantes.single('file'), validateRequest({ params: validateNumericIdParam('id', 'Documento RH/DP'), body: validateRhDocumentoUpdateBody }), RhDocumentoController.substituir);
router.get('/rh/importacoes', allowRhDpImportacoes, validateRequest({ query: validateRhImportacaoQuery }), RhImportacaoController.index);
router.get('/rh/importacoes/:id', allowRhDpImportacoes, validateRequest({ params: validateNumericIdParam('id', 'Importacao RH/DP') }), RhImportacaoController.show);
router.post('/rh/importacoes/preview', allowRhDpImportacoes, uploadRateLimit, uploadComprovantes.single('file'), validateRequest({ body: validateRhImportacaoCreateBody }), RhImportacaoController.createPreview);
router.post('/rh/importacoes/:id/confirmar', allowRhDpImportacoes, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Importacao RH/DP') }), RhImportacaoController.confirmar);
router.get('/rh/apuracoes', allowRhDpApuracaoRead, validateRequest({ query: validateRhApuracaoQuery }), RhApuracaoController.index);
router.get('/rh/apuracoes/:id', allowRhDpApuracaoRead, validateRequest({ params: validateNumericIdParam('id', 'Apuracao RH/DP') }), RhApuracaoController.show);
router.post('/rh/apuracoes', allowRhDpApuracaoWrite, criticalRateLimit, validateRequest({ body: validateRhApuracaoCreateBody }), RhApuracaoController.create);
router.patch('/rh/apuracoes/:id/itens/:itemId', allowRhDpApuracaoWrite, criticalRateLimit, validateRequest({ params: validateRhApuracaoItemParams, body: validateRhApuracaoItemUpdateBody }), RhApuracaoController.updateItem);
router.post('/rh/apuracoes/:id/conferir', allowRhDpApuracaoWrite, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Apuracao RH/DP') }), RhApuracaoController.conferir);
router.get('/rh/fechamentos', requireEnabledModule('FINANCEIRO'), allowRhDpObrigacoesRead, validateRequest({ query: validateRhFechamentoQuery }), RhFechamentoController.index);
router.get('/rh/fechamentos/:id', requireEnabledModule('FINANCEIRO'), allowRhDpObrigacoesRead, validateRequest({ params: validateNumericIdParam('id', 'Fechamento RH/DP') }), RhFechamentoController.show);
router.post('/rh/fechamentos/:id/reabrir', requireEnabledModule('FINANCEIRO'), allowRhDpFechamentoReopen, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Fechamento RH/DP'), body: validateRhReabrirFechamentoBody }), RhFechamentoController.reabrir);
router.post('/rh/apuracoes/:id/fechar', requireEnabledModule('FINANCEIRO'), allowRhDpFechamentoExecute, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Apuracao RH/DP'), body: validateRhFecharApuracaoBody }), RhFechamentoController.fecharApuracao);

// -------------------------------------------------------------------
// INTEGRACAO SIENGE
// -------------------------------------------------------------------
router.get('/integracoes/sienge/config', allowIntegracaoSiengeRead, IntegracaoSiengeController.config);
router.patch('/integracoes/sienge/config', allowIntegracaoSiengeConfigManage, criticalRateLimit, validateRequest({ body: validateSiengeConfigBody }), IntegracaoSiengeController.atualizarConfig);
router.get('/integracoes/sienge/saude', allowIntegracaoSiengeRead, IntegracaoSiengeController.saude);
router.get('/integracoes/sienge/credores/parceiros/:parceiroId/contexto', allowIntegracaoSiengeRead, validateRequest({ params: validateNumericIdParam('parceiroId', 'Parceiro') }), IntegracaoSiengeController.credorParceiroContexto);
router.post('/integracoes/sienge/credores/parceiros/:parceiroId/buscar', allowIntegracaoSiengeRetry, criticalRateLimit, validateRequest({ params: validateNumericIdParam('parceiroId', 'Parceiro'), body: validateSiengeCredorBuscaBody }), IntegracaoSiengeController.credorParceiroBuscar);
router.post('/integracoes/sienge/credores/parceiros/:parceiroId/cadastrar', allowIntegracaoSiengeConfigManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('parceiroId', 'Parceiro'), body: validateSiengeCredorCreateBody }), IntegracaoSiengeController.credorParceiroCadastrar);
router.patch('/integracoes/sienge/credores/parceiros/:parceiroId/mapeamento', allowIntegracaoSiengeConfigManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('parceiroId', 'Parceiro'), body: validateSiengeCredorMapeamentoBody }), IntegracaoSiengeController.credorParceiroMapeamento);
router.get('/integracoes/sienge/fila', allowIntegracaoSiengeRead, validateRequest({ query: validateSiengeFilaQuery }), IntegracaoSiengeController.fila);
router.get('/integracoes/sienge/fila/:id', allowIntegracaoSiengeRead, validateRequest({ params: validateNumericIdParam('id', 'Fila SIENGE') }), IntegracaoSiengeController.filaShow);
router.post('/integracoes/sienge/fila', allowIntegracaoSiengeRetry, criticalRateLimit, validateRequest({ body: validateSiengeFilaCreateBody }), IntegracaoSiengeController.filaCreate);
router.post('/integracoes/sienge/fila/:id/reprocessar', allowIntegracaoSiengeRetry, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Fila SIENGE'), body: validateSiengeFilaRetryBody }), IntegracaoSiengeController.filaRetry);
router.get('/integracoes/sienge/logs', allowIntegracaoSiengeRead, validateRequest({ query: validateSiengeLogQuery }), IntegracaoSiengeController.logs);
router.get('/integracoes/sienge/carga-inicial/modelo', allowIntegracaoSiengeRead, IntegracaoSiengeController.modeloCargaInicial);
router.post('/integracoes/sienge/carga-inicial', allowIntegracaoSiengeConfigManage, uploadRateLimit, uploadComprovantes.single('file'), IntegracaoSiengeController.importarCargaInicial);

// -------------------------------------------------------------------
// FINANCEIRO
// -------------------------------------------------------------------
router.get('/financeiro/favorecidos', allowFavorecidosRead, PaymentBeneficiaryController.index);
router.post('/financeiro/favorecidos', allowFavorecidosManage, criticalRateLimit, validateRequest({ body: validatePaymentBeneficiaryCreateBody }), PaymentBeneficiaryController.create);
router.put('/financeiro/favorecidos/:id', allowFavorecidosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Favorecido bancario'), body: validatePaymentBeneficiaryUpdateBody }), PaymentBeneficiaryController.update);
router.delete('/financeiro/favorecidos/:id', allowFavorecidosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Favorecido bancario') }), PaymentBeneficiaryController.destroy);
router.post('/financeiro/favorecidos/:id/validar', allowFavorecidosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Favorecido bancario') }), PaymentBeneficiaryController.validate);
router.get('/financeiro/favorecidos/:id/auditoria', allowFavorecidosAudit, validateRequest({ params: validateNumericIdParam('id', 'Favorecido bancario') }), PaymentBeneficiaryController.auditoria);
router.get('/financeiro/pagamentos/titulos-elegiveis', allowPagamentosPrepare, PaymentController.titulosElegiveis);
router.get('/financeiro/pagamentos/bb/health', allowPagamentosRead, PaymentController.bbHealth);
router.post('/financeiro/pagamentos/lotes', allowPagamentosPrepare, criticalRateLimit, validateRequest({ body: validatePaymentBatchCreateBody }), PaymentController.criarLote);
router.get('/financeiro/pagamentos/lotes', allowPagamentosRead, PaymentController.lotes);
router.get('/financeiro/pagamentos/lotes/:id', allowPagamentosRead, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento') }), PaymentController.loteDetalhe);
router.post('/financeiro/pagamentos/lotes/:id/submeter-aprovacao', allowPagamentosPrepare, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento') }), PaymentController.submeterAprovacao);
router.post('/financeiro/pagamentos/lotes/:id/aprovar', allowPagamentosApprove, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento'), body: validatePaymentMfaBody }), PaymentController.aprovarLote);
router.post('/financeiro/pagamentos/lotes/:id/rejeitar', allowPagamentosReject, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento'), body: validatePaymentRejectBody }), PaymentController.rejeitarLote);
router.post('/financeiro/pagamentos/lotes/:id/cancelar', allowPagamentosCancel, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento'), body: validatePaymentCancelBody }), PaymentController.cancelarLote);
router.post('/financeiro/pagamentos/lotes/:id/enviar-banco', allowPagamentosSend, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento'), body: validatePaymentMfaBody }), PaymentController.enviarBanco);
router.post('/financeiro/pagamentos/lotes/:id/enviar-bb', allowPagamentosSend, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento'), body: validatePaymentMfaBody }), PaymentController.enviarBbSandbox);
router.post('/financeiro/pagamentos/lotes/:id/enviar-bb-sandbox', allowPagamentosSend, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento'), body: validatePaymentMfaBody }), PaymentController.enviarBbSandbox);
router.post('/financeiro/pagamentos/lotes/:id/sincronizar-status-bb', allowPagamentosSync, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento') }), PaymentController.sincronizarStatusBb);
router.get('/financeiro/pagamentos/lotes/:id/transacoes-bb', allowPagamentosAudit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento') }), PaymentController.transacoesBb);
router.post('/financeiro/pagamentos/lotes/:id/itens/:itemId/comprovante', allowPagamentosAudit, criticalRateLimit, validateRequest({ params: validatePaymentBatchItemParams }), PaymentController.comprovanteItemBb);
router.get('/financeiro/pagamentos/eventos', allowPagamentosAudit, PaymentController.eventos);
router.post('/financeiro/pagamentos/lotes/:id/reprocessar', allowPagamentosReprocess, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Lote de pagamento'), body: validatePaymentMfaBody }), PaymentController.reprocessarLote);
router.get('/financeiro/pagamentos/aguardando-baixa', allowPagamentosConfirmBaixa, PaymentController.aguardandoBaixa);
router.post('/financeiro/pagamentos/intents/:id/confirmar-baixa', allowPagamentosConfirmBaixa, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Intencao de pagamento') }), PaymentController.confirmarBaixa);
router.get('/financeiro/pagamentos/providers', allowPagamentosRead, PaymentController.providers);
router.get('/financeiro/pagamentos/accounts', allowPagamentosRead, PaymentController.accounts);
router.post('/financeiro/pagamentos/accounts', allowPagamentosConfig, criticalRateLimit, validateRequest({ body: validatePaymentAccountBody }), PaymentController.criarAccount);
router.put('/financeiro/pagamentos/accounts/:id', allowPagamentosConfig, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conta pagadora'), body: validatePaymentAccountBody }), PaymentController.atualizarAccount);
router.get('/financeiro/dda/resumo', allowDdaVisualizar, validateRequest({ query: validateDdaListQuery }), FinanceiroDdaController.resumo);
router.get('/financeiro/dda/boletos', allowDdaVisualizar, validateRequest({ query: validateDdaListQuery }), FinanceiroDdaController.index);
router.get('/financeiro/dda/boletos/:id', allowDdaVisualizar, validateRequest({ params: validateNumericIdParam('id', 'Boleto DDA') }), FinanceiroDdaController.show);
router.get('/financeiro/dda/boletos/:id/candidatos', allowDdaVisualizar, validateRequest({ params: validateNumericIdParam('id', 'Boleto DDA') }), FinanceiroDdaController.candidatos);
router.get('/financeiro/dda/sincronizacoes', allowDdaAuditar, validateRequest({ query: validateDdaListQuery }), FinanceiroDdaController.sincronizacoes);
router.post('/financeiro/dda/sincronizar', allowDdaSincronizar, criticalRateLimit, validateRequest({ body: validateDdaSyncBody }), FinanceiroDdaController.sincronizar);
router.post('/financeiro/dda/boletos/:id/reprocessar-match', allowDdaVincular, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Boleto DDA') }), FinanceiroDdaController.reprocessarMatch);
router.post('/financeiro/dda/boletos/:id/vincular', allowDdaVincular, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Boleto DDA'), body: validateDdaLinkBody }), FinanceiroDdaController.vincular);
router.post('/financeiro/dda/boletos/:id/confirmar-sugestao', allowDdaVincular, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Boleto DDA') }), FinanceiroDdaController.confirmarSugestao);
router.post('/financeiro/dda/boletos/:id/ignorar', allowDdaIgnorar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Boleto DDA'), body: validateDdaIgnoreBody }), FinanceiroDdaController.ignorar);
router.use('/financeiro/bancos', allowFinanceiro, require('./modules/banking/routes'));
router.get('/financeiro/conciliacoes', allowFinanceiro, validateRequest({ query: validateFinanceConciliacaoQuery }), ConciliacaoBancariaController.index);
router.get('/financeiro/conciliacoes/importacoes', allowFinanceiro, validateRequest({ query: validateFinanceConciliacaoImportacoesQuery }), ConciliacaoBancariaController.importacoes);
router.post('/financeiro/conciliacoes/importar-ofx', allowFinanceiro, criticalRateLimit, uploadOfx.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 20 }]), validateRequest({ body: validateFinanceConciliacaoImportBody }), ConciliacaoBancariaController.importarOfx);
router.post('/financeiro/conciliacoes/conciliar-sugeridos', allowFinanceiro, criticalRateLimit, validateRequest({ body: validateFinanceConciliacaoConciliarSugeridosBody }), ConciliacaoBancariaController.conciliarSugeridos);
router.get('/financeiro/conciliacoes/:id/movimentos', allowFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), query: validateFinanceConciliacaoMovimentosQuery }), ConciliacaoBancariaController.movimentos);
router.post('/financeiro/conciliacoes/:id/criar-titulo', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoCriarTituloBody }), ConciliacaoBancariaController.criarTitulo);
router.post('/financeiro/conciliacoes/:id/confirmar', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoConfirmBody }), ConciliacaoBancariaController.confirmar);
router.patch('/financeiro/conciliacoes/:id/conta', allowConciliacaoCorrigirConta, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoCorrigirContaBody }), ConciliacaoBancariaController.corrigirConta);
router.post('/financeiro/conciliacoes/:id/ignorar', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria') }), ConciliacaoBancariaController.ignorar);
router.post('/financeiro/conciliacoes/:id/remover', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria') }), ConciliacaoBancariaController.remover);
router.get('/financeiro/conciliacoes/:id/faturas-cartao', allowFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), query: validateFinanceConciliacaoMovimentosQuery }), ConciliacaoBancariaController.faturas);
router.post('/financeiro/conciliacoes/:id/confirmar-fatura', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria') }), ConciliacaoBancariaController.confirmarFatura);
router.post('/financeiro/conciliacoes/:id/confirmar-transferencia', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoTransferenciaBody }), ConciliacaoBancariaController.confirmarTransferencia);
router.post('/financeiro/conciliacoes/:id/estornar-transferencia', allowConciliacaoEstornar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoEstornoTransferenciaBody }), ConciliacaoBancariaController.estornarTransferencia);
router.post('/financeiro/conciliacoes/:id/estornar', allowConciliacaoEstornar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoEstornoTransferenciaBody }), ConciliacaoBancariaController.estornar);
router.post('/financeiro/conciliacoes/:id/confirmar-tarifa', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoTarifaBody }), ConciliacaoBancariaController.confirmarTarifa);
router.get('/financeiro/conciliacoes/:id/tarifas-estorno', allowFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria') }), ConciliacaoBancariaController.tarifasEstorno);
router.post('/financeiro/conciliacoes/:id/confirmar-estorno-tarifa', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoEstornoTarifaBody }), ConciliacaoBancariaController.confirmarEstornoTarifa);
router.post('/financeiro/conciliacoes/:id/confirmar-estorno-bancario', allowConciliacaoEstornar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoEstornoBancarioBody }), ConciliacaoBancariaController.confirmarEstornoBancario);
router.post('/financeiro/conciliacoes/:id/confirmar-credito-rotativo', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conciliacao bancaria'), body: validateFinanceConciliacaoCreditoRotativoBody }), ConciliacaoBancariaController.confirmarCreditoRotativo);
router.get('/financeiro/caixas', allowFinanceiro, validateRequest({ query: validateFinanceCaixaQuery }), CaixaFinanceiroController.index);
router.post('/financeiro/caixas/confirmar-conciliacao-dia', allowFinanceiro, criticalRateLimit, CaixaFinanceiroController.confirmarConciliacaoDia);
router.post('/financeiro/caixas/abrir', allowFinanceiro, criticalRateLimit, validateRequest({ body: validateFinanceCaixaAberturaBody }), CaixaFinanceiroController.abrir);
router.get('/financeiro/caixas/:id', allowFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Caixa financeiro') }), CaixaFinanceiroController.show);
router.post('/financeiro/caixas/:id/movimentos', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Caixa financeiro'), body: validateFinanceCaixaMovimentoBody }), CaixaFinanceiroController.registrarMovimento);
router.post('/financeiro/caixas/:id/movimentos/:movimentoId/estornar', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateFinanceCaixaMovimentoParams, body: validateFinanceCaixaMovimentoEstornoBody }), CaixaFinanceiroController.estornarMovimento);
router.post('/financeiro/caixas/:id/fechar', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Caixa financeiro'), body: validateFinanceCaixaFechamentoBody }), CaixaFinanceiroController.fechar);
router.get('/financeiro/transferencias', allowFinanceiro, validateRequest({ query: validateFinanceTransferenciaQuery }), TransferenciaFinanceiraController.index);
router.post('/financeiro/transferencias', allowFinanceiro, criticalRateLimit, validateRequest({ body: validateFinanceTransferenciaBody }), TransferenciaFinanceiraController.create);
router.post('/financeiro/transferencias/:id/cancelar', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Transferencia financeira'), body: validateFinanceTransferenciaCancelBody }), TransferenciaFinanceiraController.cancelar);
router.get('/financeiro/relatorios/grupo-consolidado', allowFinanceiroRelatorio(['financeiro.relatorios.grupo_consolidado']), validateRequest({ query: validateFinanceDreQuery }), RelatorioFinanceiroController.grupoConsolidado);
router.get('/financeiro/relatorios/fluxo-caixa', allowFinanceiroRelatorio(['financeiro.relatorios.visualizar']), validateRequest({ query: validateFinanceFluxoCaixaQuery }), RelatorioFinanceiroController.fluxoCaixa);
router.get('/financeiro/relatorios/fluxo-consolidado', allowFinanceiroRelatorio(['financeiro.relatorios.fluxo_consolidado']), validateRequest({ query: validateFinanceFluxoConsolidadoQuery }), RelatorioFinanceiroController.fluxoConsolidado);
router.get('/financeiro/relatorios/analitico', allowFinanceiroRelatorio(['financeiro.relatorios.analitico']), validateRequest({ query: validateFinanceRelatorioAnaliticoQuery }), RelatorioFinanceiroController.analitico);
router.get('/financeiro/relatorios/financeiro-obras', allowFinanceiroRelatorio(['financeiro.relatorios.financeiro_obras']), validateRequest({ query: validateFinanceiroObrasQuery }), RelatorioFinanceiroController.financeiroObras);
// Item 22 (23/08): os arquivos da linha. MESMA permissao do relatorio — quem le o relatorio pode
// nao ter acesso ao modulo de solicitacoes, e tomaria 403 clicando numa linha do proprio relatorio.
router.get('/financeiro/relatorios/financeiro-obras/titulos/:id/arquivos', allowFinanceiroRelatorio(['financeiro.relatorios.financeiro_obras']), validateRequest({ params: validateNumericIdParam('id', 'Titulo') }), RelatorioFinanceiroController.arquivosDoTitulo);
router.get('/financeiro/relatorios/financeiro-obras/importacoes-historicas', allowFinanceiroRelatorio(['financeiro.relatorios.financeiro_obras']), ObraCustoHistoricoController.importacoes);
router.post('/financeiro/relatorios/financeiro-obras/importacoes-historicas/preview', allowFinanceiroRelatorio(['financeiro.relatorios.financeiro_obras']), uploadRateLimit, uploadComprovantes.single('file'), ObraCustoHistoricoController.preview);
router.post('/financeiro/relatorios/financeiro-obras/importacoes-historicas/confirmar', allowFinanceiroRelatorio(['financeiro.relatorios.financeiro_obras']), criticalRateLimit, ObraCustoHistoricoController.confirmar);
router.get('/financeiro/relatorios/dre/comparativo', allowFinanceiroRelatorio(['financeiro.relatorios.dre']), validateRequest({ query: validateFinanceDreComparativoQuery }), RelatorioFinanceiroController.dreComparativo);
router.get('/financeiro/relatorios/dre/empresas', allowFinanceiroRelatorio(['financeiro.relatorios.dre']), validateRequest({ query: validateFinanceDreQuery }), RelatorioFinanceiroController.dreComparativoEmpresas);
router.get('/financeiro/relatorios/dre', allowFinanceiroRelatorio(['financeiro.relatorios.dre']), validateRequest({ query: validateFinanceDreQuery }), RelatorioFinanceiroController.dre);
router.get('/financeiro/relatorios/dre/diagnostico', allowFinanceiroRelatorio(['financeiro.relatorios.diagnostico_dre']), RelatorioFinanceiroController.diagnosticoDre);
router.get('/financeiro/relatorios/intercompany', allowFinanceiroRelatorio(['financeiro.relatorios.intercompany']), validateRequest({ query: validateFinanceIntercompanyQuery }), RelatorioFinanceiroController.intercompany);
router.get('/financeiro/relatorios/endividamento', allowFinanceiroRelatorio(['financeiro.relatorios.endividamento']), validateRequest({ query: validateFinanceEndividamentoQuery }), RelatorioFinanceiroController.endividamento);
router.get('/financeiro/relatorios/movimentacao-contas', allowFinanceiroRelatorio(['financeiro.relatorios.movimentacao_contas']), RelatorioFinanceiroController.movimentacaoContas);
router.get('/financeiro/relatorios/conciliacao-contas', allowFinanceiroRelatorio(['financeiro.relatorios.conciliacao_contas']), validateRequest({ query: validateFinanceRelatorioConciliacaoQuery }), RelatorioFinanceiroController.conciliacaoContas);
router.get('/financeiro/relatorios/resultado-obras', allowFinanceiroRelatorio(['financeiro.relatorios.resultado_obras']), ResultadoObrasController.index);
router.get('/financeiro/relatorios/centros-custo', allowFinanceiroRelatorio(['financeiro.relatorios.centros_custo']), ResultadoCentrosCustoController.index);
router.get('/financeiro/baixas', allowFinanceiro, validateRequest({ query: validateFinanceBaixasQuery }), TituloFinanceiroController.baixas);
router.get('/financeiro/financiamentos-bancarios', allowFinanceiro, validateRequest({ query: validateFinanceFinanciamentoBancarioQuery }), FinanciamentoBancarioController.index);
router.post('/financeiro/financiamentos-bancarios', allowFinanceiro, criticalRateLimit, validateRequest({ body: validateFinanceFinanciamentoBancarioCreateBody }), FinanciamentoBancarioController.create);
router.get('/financeiro/financiamentos-bancarios/:id', allowFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Financiamento bancario') }), FinanciamentoBancarioController.show);
router.get('/financeiro/financiamentos-bancarios/:id/auditoria', allowFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Financiamento bancario') }), FinanciamentoBancarioController.auditoria);
router.post('/financeiro/financiamentos-bancarios/:id/gerar-titulos', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Financiamento bancario') }), FinanciamentoBancarioController.gerarTitulos);
router.patch('/financeiro/financiamentos-bancarios/parcelas/:id', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Parcela do financiamento bancario') }), FinanciamentoBancarioController.atualizarParcela);
router.get('/financeiro/titulos', allowFinanceiro, validateRequest({ query: validateFinanceTituloQuery }), TituloFinanceiroController.index);
router.get('/financeiro/titulos/relatorio.pdf', allowFinanceiro, validateRequest({ query: validateFinanceTituloQuery }), TituloFinanceiroController.relatorioPdf);
router.post('/financeiro/titulos', allowFinanceiro, criticalRateLimit, validateRequest({ body: validateFinanceTituloCreateBody }), TituloFinanceiroController.create);
router.get('/financeiro/titulos/importacoes/modelo', allowTituloImportar, TituloFinanceiroImportacaoController.modelo);
router.post('/financeiro/titulos/importacoes/preview', allowTituloImportar, uploadRateLimit, uploadComprovantes.single('file'), TituloFinanceiroImportacaoController.preview);
router.get('/financeiro/titulos/importacoes/:id', allowTituloImportar, validateRequest({ params: validateNumericIdParam('id', 'Importacao de titulos') }), TituloFinanceiroImportacaoController.show);
router.post('/financeiro/titulos/importacoes/:id/confirmar', allowTituloImportar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Importacao de titulos') }), TituloFinanceiroImportacaoController.confirmar);
router.get('/financeiro/cheques-terceiros/modelo.xlsx', allowChequesImportar, ChequeTerceiroController.modelo);
router.post('/financeiro/cheques-terceiros/importacoes/preview', allowChequesImportar, uploadRateLimit, uploadComprovantes.single('file'), ChequeTerceiroController.importPreview);
router.post('/financeiro/cheques-terceiros/importacoes/confirmar', allowChequesImportar, criticalRateLimit, ChequeTerceiroController.importConfirm);
router.get('/financeiro/cheques-terceiros', allowChequesVisualizar, ChequeTerceiroController.index);
router.post('/financeiro/cheques-terceiros/clientes', allowChequesCadastrar, criticalRateLimit, auditSuccess({ eventType: 'FINANCEIRO_CHEQUE_CLIENTE_CREATED', resourceType: 'PARCEIRO', description: 'Cliente criado no cadastro de cheque de terceiro' }), ChequeTerceiroController.criarCliente);
router.post('/financeiro/cheques-terceiros', allowChequesCadastrar, criticalRateLimit, ChequeTerceiroController.create);
router.post('/financeiro/cheques-terceiros/:id/movimentar', allowChequesMovimentar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Cheque de terceiro') }), ChequeTerceiroController.movimentar);
router.get('/financeiro/cheques-terceiros/:id', allowChequesVisualizar, validateRequest({ params: validateNumericIdParam('id', 'Cheque de terceiro') }), ChequeTerceiroController.show);
router.post('/financeiro/baixas-compostas/preview', allowBaixaCompostaCriar, ChequeTerceiroController.baixaPreview);
router.post('/financeiro/baixas-compostas/confirmar', allowBaixaCompostaConfirmar, criticalRateLimit, ChequeTerceiroController.baixaConfirm);
router.get('/financeiro/baixas-compostas', allowBaixaCompostaVisualizar, ChequeTerceiroController.baixas);
router.post('/financeiro/baixas-compostas/:id/estornar', allowBaixaCompostaEstornar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Baixa composta') }), ChequeTerceiroController.baixaEstornar);
router.get('/financeiro/baixas-compostas/:id', allowBaixaCompostaVisualizar, validateRequest({ params: validateNumericIdParam('id', 'Baixa composta') }), ChequeTerceiroController.baixaShow);
router.get('/financeiro/fretes-pedidos/pendentes', allowFinanceiro, PedidoCompraController.fretesPendentesFinanceiro);
router.post('/financeiro/titulos/importar-codigos-barras', allowTituloImportarCodigos, criticalRateLimit, TituloFinanceiroController.importarCodigosBarras);
router.post('/financeiro/titulos/excluir-em-massa', allowFinanceiro, criticalRateLimit, TituloFinanceiroController.excluirEmMassa);
router.post('/financeiro/titulos/baixas/parceladas', allowFinanceiro, criticalRateLimit, validateRequest({ body: validateFinanceTituloBaixaParceladaBody }), TituloFinanceiroController.baixarParcelado);
router.get('/financeiro/cheques-terceiros/disponiveis', allowFinanceiro, TituloFinanceiroController.chequesTerceirosDisponiveis);
router.get('/financeiro/titulos/:id', allowFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro') }), TituloFinanceiroController.show);
router.get('/financeiro/titulos/:id/auditoria', allowFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro') }), TituloFinanceiroController.auditoria);
router.patch('/financeiro/titulos/:id', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro'), body: validateFinanceTituloUpdateBody }), TituloFinanceiroController.update);
router.patch('/financeiro/titulos/:id/cobranca', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro'), body: validateFinanceTituloCobrancaBody }), TituloFinanceiroController.atualizarCobranca);
router.post('/financeiro/titulos/:id/baixas/conciliacoes', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro'), body: validateFinanceTituloBaixaConciliacoesBody }), TituloFinanceiroController.baixarPorConciliacoes);
router.post('/financeiro/titulos/:id/baixas', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro'), body: validateFinanceTituloBaixaBody }), TituloFinanceiroController.baixar);
router.post('/financeiro/titulos/:id/movimentos/:movimentoId/estornar', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateFinanceTituloMovimentoParams, body: validateFinanceTituloEstornoBody }), TituloFinanceiroController.estornarMovimento);
router.get('/boletos/config', allowBoletosRead, BoletoController.config);
router.get('/boletos/titulos', allowBoletosRead, validateRequest({ query: validateFinanceBoletoTituloQuery }), BoletoController.titulos);
router.get('/boletos/titulos/:id', allowBoletosRead, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro') }), BoletoController.show);
router.get('/boletos/titulos/:id/pdf', allowBoletosRead, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro') }), BoletoController.pdf);
router.post('/boletos/titulos/:id/amostra', allowBoletosGenerate, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro') }), BoletoController.amostra);
router.post('/boletos/titulos/:id/gerar', allowBoletosGenerate, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Titulo financeiro') }), BoletoController.gerar);
router.get('/boletos/caixa/convenios', allowBoletosRead, BoletoCaixaCnabController.convenios);
router.get('/boletos/caixa/remessas', allowBoletosRead, BoletoCaixaCnabController.remessas);
router.post('/boletos/caixa/remessas', allowBoletosGenerate, criticalRateLimit, BoletoCaixaCnabController.gerarRemessa);
router.get('/boletos/caixa/remessas/:id/download', allowBoletosRead, validateRequest({ params: validateNumericIdParam('id', 'Remessa Caixa') }), BoletoCaixaCnabController.downloadRemessa);
router.get('/boletos/caixa/remessas/:id/homologacao', allowBoletosRead, validateRequest({ params: validateNumericIdParam('id', 'Remessa Caixa') }), BoletoCaixaCnabController.homologacaoRemessa);
router.get('/boletos/caixa/remessas/:id/homologacao-pacote', allowBoletosRead, validateRequest({ params: validateNumericIdParam('id', 'Remessa Caixa') }), BoletoCaixaCnabController.pacoteHomologacaoRemessa);
router.get('/boletos/caixa/retornos', allowBoletosRead, BoletoCaixaCnabController.retornos);
router.post('/boletos/caixa/retornos/validar', allowBoletosRead, uploadRateLimit, uploadCnab.single('file'), BoletoCaixaCnabController.validarRetorno);
router.post('/boletos/caixa/retornos', allowBoletosGenerate, criticalRateLimit, uploadCnab.single('file'), BoletoCaixaCnabController.importarRetorno);
router.get('/boletos/caixa/ocorrencias', allowBoletosRead, BoletoCaixaCnabController.ocorrencias);
router.get('/financeiro/contas-bancarias', allowFinanceiro, ContaBancariaController.index);
router.post('/financeiro/contas-bancarias', allowFinanceiro, criticalRateLimit, validateRequest({ body: validateFinanceCadastroContaBody }), ContaBancariaController.create);
router.patch('/financeiro/contas-bancarias/:id', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Conta bancaria'), body: validateFinanceCadastroContaBody }), ContaBancariaController.update);
router.get('/financeiro/categorias', allowFinanceiro, CategoriaFinanceiraController.index);
router.post('/financeiro/categorias', allowFinanceiro, criticalRateLimit, validateRequest({ body: validateFinanceCadastroCategoriaBody }), CategoriaFinanceiraController.create);
router.patch('/financeiro/categorias/:id', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Categoria financeira'), body: validateFinanceCadastroCategoriaBody }), CategoriaFinanceiraController.update);
router.get('/financeiro/formas-pagamento', allowFinanceiro, FormaPagamentoFinanceiraController.index);
router.post('/financeiro/formas-pagamento', allowFinanceiro, criticalRateLimit, FormaPagamentoFinanceiraController.create);
router.patch('/financeiro/formas-pagamento/:id', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Forma de pagamento') }), FormaPagamentoFinanceiraController.update);
router.get('/financeiro/tarifas-bancarias-atalhos', allowFinanceiro, TarifaBancariaConfigController.index);
router.patch('/financeiro/tarifas-bancarias-atalhos', permit(['SUPERADMIN']), criticalRateLimit, validateRequest({ body: validateFinanceTarifasBancariasConfigBody }), TarifaBancariaConfigController.update);
router.get('/financeiro/cartoes', allowFinanceiro, CartaoFinanceiroController.index);
router.post('/financeiro/cartoes', allowFinanceiro, criticalRateLimit, CartaoFinanceiroController.create);
router.patch('/financeiro/cartoes/:id', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Cartao financeiro') }), CartaoFinanceiroController.update);
router.get('/financeiro/faturas-cartao', allowFinanceiro, FaturaCartaoFinanceiroController.index);
router.get('/financeiro/faturas-cartao/:id', allowFinanceiro, validateRequest({ params: validateNumericIdParam('id', 'Fatura de cartao') }), FaturaCartaoFinanceiroController.show);
router.post('/financeiro/faturas-cartao/:id/baixar', allowFinanceiro, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Fatura de cartao') }), FaturaCartaoFinanceiroController.baixar);

// -------------------------------------------------------------------
// COMPRAS - CADASTROS BASICOS
// -------------------------------------------------------------------

router.get('/compras/unidades', UnidadeController.index);
router.post('/compras/unidades', allowComprasConfiguracoesManage, UnidadeController.create);
router.put('/compras/unidades/:id', allowComprasConfiguracoesManage, UnidadeController.update);
router.delete('/compras/unidades/:id', allowComprasConfiguracoesManage, UnidadeController.destroy);

router.get('/compras/categorias', CategoriaController.index);
router.post('/compras/categorias', allowComprasConfiguracoesManage, CategoriaController.create);
router.put('/compras/categorias/:id', allowComprasConfiguracoesManage, CategoriaController.update);
router.delete('/compras/categorias/:id', allowComprasConfiguracoesManage, CategoriaController.destroy);

router.get('/compras/insumos', InsumoController.index);
router.get('/compras/insumos/:id/ultimo-preco', InsumoController.ultimoPreco);
router.post('/compras/insumos/importar-massa', allowComprasConfiguracoesManage, InsumoController.importarEmMassa);
router.post('/compras/insumos', allowComprasConfiguracoesManage, InsumoController.create);
router.put('/compras/insumos/:id', allowComprasConfiguracoesManage, InsumoController.update);
router.delete('/compras/insumos/:id', allowComprasConfiguracoesManage, InsumoController.destroy);

router.get('/compras/apropriacoes', ApropriacaoController.index);
router.post('/compras/apropriacoes', allowComprasConfiguracoesManage, ApropriacaoController.create);
router.put('/compras/apropriacoes/:id', allowComprasConfiguracoesManage, ApropriacaoController.update);
router.delete('/compras/apropriacoes/:id', allowComprasConfiguracoesManage, ApropriacaoController.destroy);
router.get('/compras/fornecedores', requireEnabledModule('COTACOES'), allowComprasFornecedoresRead, FornecedorCompraController.index);
router.post('/compras/fornecedores', requireEnabledModule('COTACOES'), allowComprasFornecedoresManage, FornecedorCompraController.create);
router.get('/compras/fornecedores/:id', requireEnabledModule('COTACOES'), allowComprasFornecedoresRead, FornecedorCompraController.show);
router.put('/compras/fornecedores/:id', requireEnabledModule('COTACOES'), allowComprasFornecedoresManage, FornecedorCompraController.update);
router.delete('/compras/fornecedores/:id', requireEnabledModule('COTACOES'), allowComprasFornecedoresManage, FornecedorCompraController.destroy);
router.post('/compras/anexos-temporarios', allowCompraSolicitacoesUpload, uploadRateLimit, uploadComprovantes.single('file'), SolicitacaoCompraController.uploadTemporario);
router.get('/compras/formas-pagamento-ativas', allowCompraSolicitacoesCreate, SolicitacaoCompraController.formasPagamentoAtivas);
router.get('/compras/solicitacoes/modelo-itens-xlsx', allowCompraSolicitacoesCreate, scopeCompraListAccess, SolicitacaoCompraController.modeloSolicitacaoCompraXlsx);
router.post(
  '/compras/solicitacoes/importar-itens-xlsx',
  allowCompraSolicitacoesCreate,
  uploadRateLimit,
  uploadComprovantes.single('file'),
  requireCompraBodyObraAccess,
  SolicitacaoCompraController.importarSolicitacaoCompraXlsx
);
router.post(
  '/compras/solicitacoes-diretas/credores',
  allowCompraSolicitacoesCreate,
  criticalRateLimit,
  validateRequest({ body: validateSolicitacaoCredorCreateBody }),
  auditSuccess({
    eventType: 'COMPRA_DIRETA_CREDOR_CREATED',
    resourceType: 'PARCEIRO',
    description: 'Credor criado durante abertura de compra direta'
  }),
  ParceiroController.createCredorCompraDireta
);
router.get('/compras/solicitacoes-diretas/modelo-itens-xlsx', allowCompraSolicitacoesCreate, SolicitacaoCompraController.modeloCompraDiretaXlsx);
router.post('/compras/solicitacoes-diretas/importar-itens-xlsx', allowCompraSolicitacoesCreate, uploadRateLimit, uploadComprovantes.single('file'), SolicitacaoCompraController.importarCompraDiretaXlsx);
router.get('/compras/solicitacoes-diretas/por-solicitacao/:solicitacaoId', allowCompraSolicitacoesCreateFlowRead, validateRequest({ params: validateNumericIdParam('solicitacaoId', 'Solicitacao principal') }), SolicitacaoCompraController.showCompraDiretaPorSolicitacao);
router.get('/compras/solicitacoes/por-solicitacao/:solicitacaoId', allowCompraSolicitacoesCreateFlowRead, validateRequest({ params: validateNumericIdParam('solicitacaoId', 'Solicitacao principal') }), SolicitacaoCompraController.showPorSolicitacaoPrincipal);
router.get('/compras/solicitacoes', allowCompraSolicitacoesOrDelegacaoRead, validateRequest({ query: validateCompraQuery }), scopeCompraListAccess, SolicitacaoCompraController.index);
router.post('/compras/solicitacoes/inativar-massa', allowCompraSolicitacoesDelete, criticalRateLimit, validateRequest({ body: validateCompraSolicitacaoInativarMassaBody }), scopeCompraListAccess, SolicitacaoCompraController.inativar);
router.post('/compras/solicitacoes/encaminhar-compras-massa', allowCompraSolicitacoesEncaminhar, criticalRateLimit, validateRequest({ body: validateCompraSolicitacaoEncaminharComprasMassaBody }), scopeCompraListAccess, SolicitacaoCompraController.encaminharParaCompras);
router.get('/compras/solicitacoes/:id', allowCompraSolicitacoesCreateFlowRead, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra') }), requireCompraAccess, SolicitacaoCompraController.show);
router.get('/compras/solicitacoes/:id/comparativo', allowCompraSolicitacoesRead, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra') }), requireCompraAccess, SolicitacaoCompraController.comparativo);
router.get('/compras/solicitacoes/:id/workspace-cotacao', allowCompraSolicitacoesRead, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra') }), requireCompraAccess, SolicitacaoCompraController.workspaceCotacao);
router.get('/compras/solicitacoes/:id/pdf', allowCompraSolicitacoesCreateFlowRead, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra') }), requireCompraAccess, SolicitacaoCompraController.pdf);
router.post('/compras/solicitacoes', allowCompraSolicitacoesCreate, validateRequest({ body: validateCompraCreateBody }), requireCompraBodyObraAccess, SolicitacaoCompraController.create);
router.post('/compras/solicitacoes-diretas', allowCompraSolicitacoesCreate, validateRequest({ body: validateCompraDiretaCreateBody }), requireCompraBodyObraAccess, SolicitacaoCompraController.create);
router.delete('/compras/solicitacoes/:id', allowCompraSolicitacoesDelete, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra') }), requireCompraAccess, SolicitacaoCompraController.inativar);
router.patch('/compras/solicitacoes/:id/cancelar', allowCompraSolicitacoesDelete, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraSolicitacaoCancelBody }), requireCompraAccess, SolicitacaoCompraController.cancelar);
router.get('/compras/cotacoes', requireEnabledModule('COTACOES'), allowComprasCotacoesRead, scopeCompraListAccess, CotacaoFornecedorController.index);
router.post('/compras/cotacoes/avulsa', requireEnabledModule('COTACOES'), allowComprasCotacoesManage, SolicitacaoCompraController.createAvulsa);
router.patch('/compras/cotacoes/:id/reabrir', requireEnabledModule('COTACOES'), allowComprasCotacoesReabrir, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Cotacao') }), CotacaoFornecedorController.reabrir);
router.patch('/compras/solicitacoes/:id/cotacao/cancelar', requireEnabledModule('COTACOES'), allowComprasCotacoesCancelar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraCotacaoCancelBody }), requireCompraAccess, CotacaoFornecedorController.cancelarFluxo);
router.patch('/compras/solicitacoes/:id/cotacoes/:cotacaoId/resposta-interna', requireEnabledModule('COTACOES'), allowComprasCotacoesOperate, criticalRateLimit, validateRequest({ params: validateCompraCotacaoRespostaInternaParams, body: validateCompraCotacaoRespostaInternaBody }), requireCompraAccess, CotacaoFornecedorController.responderInternamente);
router.post('/compras/solicitacoes/:id/cotacoes/:cotacaoId/arquivos-resposta', requireEnabledModule('COTACOES'), allowComprasCotacoesOperate, uploadRateLimit, validateRequest({ params: validateCompraCotacaoRespostaInternaParams }), requireCompraAccess, uploadComprovantes.fields([{ name: 'files', maxCount: 10 }]), CotacaoFornecedorController.uploadInterno);
router.patch('/compras/solicitacoes/:id/encaminhar-compras', allowCompraSolicitacoesEncaminhar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra') }), requireCompraAccess, SolicitacaoCompraController.encaminharParaCompras);
router.patch('/compras/solicitacoes/:id/integrar', allowCompraSolicitacoesManage, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraIntegrarBody }), requireCompraAccess, SolicitacaoCompraController.integrar);
router.patch('/compras/solicitacoes/:id/liberar', allowCompraSolicitacoesManage, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra') }), requireCompraAccess, SolicitacaoCompraController.liberar);
router.post('/compras/solicitacoes/:id/enviar', allowCompraSolicitacoesManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraEnviarBody }), requireCompraAccess, SolicitacaoCompraController.enviarParaFornecedores);
router.patch('/compras/solicitacoes/:id/recusar', allowCompraSolicitacoesManage, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra') }), requireCompraAccess, SolicitacaoCompraController.recusar);
router.patch('/compras/solicitacoes/:id/encerrar', allowComprasCotacoesEncerrar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraEncerrarBody }), requireCompraAccess, SolicitacaoCompraController.encerrar);
router.patch('/compras/solicitacoes/:id/encerrar-sem-pedido', requireEnabledModule('COTACOES'), allowComprasCotacoesEncerrarSemPedido, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraEncerrarSemPedidoBody }), requireCompraAccess, SolicitacaoCompraController.encerrarSemPedido);
router.patch('/compras/solicitacoes/:id/itens/:itemId/quantidade', allowCompraSolicitacoesAlterarQuantidade, criticalRateLimit, validateRequest({ params: validateCompraSolicitacaoItemQuantidadeParams, body: validateCompraSolicitacaoItemQuantidadeBody }), requireCompraAccess, SolicitacaoCompraController.atualizarQuantidadeItem);
router.post('/compras/solicitacoes/:id/itens/:itemId/cadastrar-unidade', allowCompraSolicitacoesCreateFlowRead, criticalRateLimit, validateRequest({ params: validateCompraSolicitacaoItemQuantidadeParams }), requireCompraAccess, SolicitacaoCompraController.cadastrarUnidadeItem);
router.patch('/compras/solicitacoes/:id/itens/:itemId/apropriacoes', allowCompraSolicitacoesCreateFlowRead, criticalRateLimit, validateRequest({ params: validateCompraSolicitacaoItemQuantidadeParams, body: validateCompraSolicitacaoItemApropriacoesBody }), requireCompraAccess, SolicitacaoCompraController.atualizarApropriacoesItem);
router.post(
  '/compras/solicitacoes/:id/itens-manuais/:itemId/catalogar',
  allowComprasCatalogarItensManuais,
  criticalRateLimit,
  validateRequest({ params: validateCompraSolicitacaoItemQuantidadeParams, body: validateCompraCatalogarItemManualBody }),
  requireCompraAccess,
  auditSuccess({
    eventType: 'COMPRA_ITEM_MANUAL_CATALOGADO',
    resourceType: 'SOLICITACAO_COMPRA',
    description: 'Item manual vinculado ao cadastro oficial de insumos'
  }),
  InsumoManualCatalogacaoController.catalogar
);
router.post('/compras/solicitacoes/:id/comentarios', allowCompraSolicitacoesManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraCotacaoComentarioBody }), requireCompraAccess, SolicitacaoCompraController.comentar);
router.get('/compras/delegacao/usuarios', allowComprasDelegacaoManage, PedidoCompraController.usuariosDelegacao);
router.patch('/compras/solicitacoes/:id/delegar', allowComprasDelegacaoRead, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraDelegacaoBody }), requireCompraAccess, PedidoCompraController.delegarSolicitacao);
router.post('/compras/solicitacoes/:id/pedidos', allowCompraSolicitacoesManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraPedidoCreateBody }), requireCompraAccess, PedidoCompraController.createFromSolicitacao);
router.get('/compras/pedidos', allowComprasPedidosRead, validateRequest({ query: validateCompraPedidoQuery }), scopeCompraListAccess, PedidoCompraController.index);
router.patch('/compras/pedidos/status-lote', allowComprasPedidosAlterarStatus, criticalRateLimit, validateRequest({ body: validateCompraPedidoStatusBatchBody }), scopeCompraListAccess, PedidoCompraController.updateStatusBatch);
router.get('/compras/relatorios/auditoria-itens-pedido', allowComprasRelatoriosRead, validateRequest({ query: validateCompraPedidoAuditoriaQuery }), scopeCompraListAccess, PedidoCompraController.auditoria);
router.get('/compras/relatorios/categorias-insumos', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioCategoriasInsumosQuery }), scopeCompraListAccess, RelatorioComprasController.categoriasInsumos);
router.get('/compras/relatorios/compras-diretas', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioComprasDiretasQuery }), scopeCompraListAccess, RelatorioComprasController.comprasDiretas);
router.get('/compras/relatorios/compras-fornecedor', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioComprasFornecedorQuery }), scopeCompraListAccess, RelatorioComprasController.comprasPorFornecedor);
router.get('/compras/relatorios/demanda-pedidos', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioDemandaPedidosQuery }), scopeCompraListAccess, RelatorioComprasController.demandaPedidos);
router.get('/compras/relatorios/evolucao', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioEvolucaoQuery }), scopeCompraListAccess, RelatorioComprasController.evolucaoCompras);
router.get('/compras/relatorios/pendencias-cotacoes', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioPendenciasCotacoesQuery }), scopeCompraListAccess, RelatorioComprasController.pendenciasCotacoes);
router.get('/compras/relatorios/precos-insumos', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioPrecosInsumosQuery }), scopeCompraListAccess, RelatorioComprasController.precosInsumosFornecedores);
router.get('/compras/relatorios/ciclo', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioCicloQuery }), scopeCompraListAccess, RelatorioComprasController.ciclo);
router.get('/compras/relatorios/economia-cotacoes', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioEconomiaCotacoesQuery }), scopeCompraListAccess, RelatorioComprasController.economiaCotacoes);
router.get('/compras/relatorios/fornecedores', allowComprasRelatoriosRead, validateRequest({ query: validateCompraRelatorioFornecedoresQuery }), scopeCompraListAccess, RelatorioComprasController.fornecedores);
router.get('/compras/pedidos/:id', allowComprasPedidosRead, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra') }), requirePedidoCompraAccess, PedidoCompraController.show);
router.post('/compras/pedidos/:id/itens', allowComprasPedidosEditarItens, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoItemAddBody }), requirePedidoCompraAccess, PedidoCompraController.addItem);
router.patch('/compras/pedidos/:id/status', allowComprasPedidosAlterarStatus, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoStatusBody }), requirePedidoCompraAccess, PedidoCompraController.updateStatus);
router.patch('/compras/pedidos/:id/reabrir-cotacao', allowComprasPedidosReabrir, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoReabrirBody }), requirePedidoCompraAccess, PedidoCompraController.reabrirCotacao);
router.post('/compras/pedidos/:id/financeiro/adotar-legado', allowComprasPedidosFinanceiroPrevisao, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra') }), requirePedidoCompraAccess, PedidoCompraFinanceiroController.adotarLegado);
router.post('/compras/pedidos/:id/financeiro/previsoes', allowComprasPedidosFinanceiroPrevisao, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoPrevisoesBody }), requirePedidoCompraAccess, PedidoCompraFinanceiroController.criarPrevisoes);
router.post('/compras/pedidos/:id/financeiro/previsoes/reparcelar', allowComprasPedidosFinanceiroPrevisao, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoPrevisoesBody }), requirePedidoCompraAccess, PedidoCompraFinanceiroController.reparcelarPrevisoes);
router.post('/compras/pedidos/:id/financeiro/documentos', allowComprasPedidosFinanceiroDocumento, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoDocumentoFinanceiroBody }), requirePedidoCompraAccess, PedidoCompraFinanceiroController.registrarDocumento);
router.patch('/compras/pedidos/:id/financeiro/liberar', allowComprasPedidosFinanceiroLiberar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoLiberarTitulosBody }), requirePedidoCompraAccess, PedidoCompraFinanceiroController.liberarTitulos);
router.post('/compras/pedidos/:id/reaberturas', allowComprasPedidosReabrir, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoReabrirBody }), requirePedidoCompraAccess, PedidoCompraFinanceiroController.solicitarReabertura);
router.patch('/compras/pedidos/:id/reaberturas/:reaberturaId/decisao', allowComprasPedidosFinanceiroReabertura, criticalRateLimit, validateRequest({ params: validateCompraPedidoReaberturaParams, body: validateCompraPedidoDecisaoReaberturaBody }), requirePedidoCompraAccess, PedidoCompraFinanceiroController.decidirReabertura);
router.patch('/compras/pedidos/:id/cancelar', allowComprasPedidosCancelar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoCancelBody }), requirePedidoCompraAccess, PedidoCompraController.cancel);
router.patch('/compras/pedidos/:id/itens-cancelar', allowComprasPedidosCancelar, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoCancelBody }), requirePedidoCompraAccess, PedidoCompraController.cancelItems);
router.post('/compras/pedidos/:id/comentarios', allowComprasPedidosManage, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoComentarioBody }), requirePedidoCompraAccess, PedidoCompraController.comentar);
router.patch('/compras/pedidos/:id/espelho', allowComprasPedidosAnexarEspelho, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoEspelhoBody }), requirePedidoCompraAccess, PedidoCompraController.anexarEspelho);
router.post('/compras/pedidos/:id/fretes', allowComprasPedidosFrete, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra'), body: validateCompraPedidoFreteBody }), requirePedidoCompraAccess, PedidoCompraController.registrarFrete);
router.patch('/compras/pedidos/:id/fretes/:freteId', allowComprasPedidosFrete, criticalRateLimit, validateRequest({ params: validateCompraPedidoFreteParams, body: validateCompraPedidoFreteBody }), requirePedidoCompraAccess, PedidoCompraController.atualizarFrete);
router.post('/compras/pedidos/:id/fretes/:freteId/cancelar', allowComprasPedidosCancelarFrete, criticalRateLimit, validateRequest({ params: validateCompraPedidoFreteParams, body: validateCompraPedidoFreteCancelBody }), requirePedidoCompraAccess, PedidoCompraController.cancelarFrete);
router.patch('/compras/pedidos/:id/itens/:itemId', allowComprasPedidosEditarItens, criticalRateLimit, validateRequest({ params: validateCompraPedidoItemParams, body: validateCompraPedidoItemUpdateBody }), requirePedidoCompraAccess, PedidoCompraController.updateItem);
router.patch('/compras/pedidos/:id/itens/:itemId/remanejar', allowComprasPedidosRemanejar, criticalRateLimit, validateRequest({ params: validateCompraPedidoItemParams, body: validateCompraPedidoRemanejarBody }), requirePedidoCompraAccess, PedidoCompraController.remanejarItem);
router.delete('/compras/pedidos/:id/itens/:itemId', allowComprasPedidosEditarItens, criticalRateLimit, validateRequest({ params: validateCompraPedidoItemParams }), requirePedidoCompraAccess, PedidoCompraController.removeItem);
router.get('/compras/pedidos/:id/pdf', allowComprasPedidosRead, validateRequest({ params: validateNumericIdParam('id', 'Pedido de compra') }), requirePedidoCompraAccess, PedidoCompraController.pdf);

// -------------------------------------------------------------------
// TIPOS DE SOLICITAÇÃO
// -------------------------------------------------------------------

router.get('/tipos-solicitacao', TipoSolicitacaoController.index);
router.get('/tipos-solicitacao/disponiveis', TipoSolicitacaoDisponibilidadeController.disponiveis);
router.get('/configuracoes/tipos-solicitacao-por-destino', allowConfiguracoesStatusVinculos, TipoSolicitacaoDisponibilidadeController.configuracao);
router.patch('/configuracoes/tipos-solicitacao-por-destino', allowConfiguracoesStatusVinculos, TipoSolicitacaoDisponibilidadeController.atualizarConfiguracao);
router.post('/tipos-solicitacao', allowConfiguracoesCadastros, TipoSolicitacaoController.create);
router.patch('/tipos-solicitacao/:id', allowConfiguracoesCadastros, TipoSolicitacaoController.update);
router.patch('/tipos-solicitacao/:id/ativar', allowConfiguracoesCadastros, TipoSolicitacaoController.ativar);
router.patch('/tipos-solicitacao/:id/desativar', allowConfiguracoesCadastros, TipoSolicitacaoController.desativar);
router.delete('/tipos-solicitacao/:id', allowConfiguracoesCadastros, TipoSolicitacaoController.excluir);

// -------------------------------------------------------------------
// TIPOS MACRO E SUB DE CONTRATO
// -------------------------------------------------------------------

router.get('/tipos-macro-contrato', TipoMacroContratoController.index);
router.post('/tipos-macro-contrato', allowConfiguracoesCadastros, TipoMacroContratoController.create);
router.patch('/tipos-macro-contrato/:id', allowConfiguracoesCadastros, TipoMacroContratoController.update);
router.patch('/tipos-macro-contrato/:id/ativar', allowConfiguracoesCadastros, TipoMacroContratoController.ativar);
router.patch('/tipos-macro-contrato/:id/desativar', allowConfiguracoesCadastros, TipoMacroContratoController.desativar);

router.get('/tipos-sub-contrato', TipoSubContratoController.index);
router.post('/tipos-sub-contrato', allowConfiguracoesCadastros, TipoSubContratoController.create);
router.patch('/tipos-sub-contrato/:id', allowConfiguracoesCadastros, TipoSubContratoController.update);
router.patch('/tipos-sub-contrato/:id/ativar', allowConfiguracoesCadastros, TipoSubContratoController.ativar);
router.patch('/tipos-sub-contrato/:id/desativar', allowConfiguracoesCadastros, TipoSubContratoController.desativar);
router.delete('/tipos-sub-contrato/:id', allowConfiguracoesCadastros, TipoSubContratoController.excluir);

// -------------------------------------------------------------------
// STATUS POR SETOR (SUPERADMIN)
// -------------------------------------------------------------------

router.get('/status-setor', validateRequest({ query: validateStatusSetorQuery }), StatusSetorController.index);
router.post('/status-setor', allowConfiguracoesStatusVinculos, validateRequest({ body: validateStatusSetorCreateBody }), StatusSetorController.create);
router.patch('/status-setor/:id', allowConfiguracoesStatusVinculos, validateRequest({ params: validateNumericIdParam('id', 'Status do setor'), body: validateStatusSetorUpdateBody }), StatusSetorController.update);
router.patch('/status-setor/:id/ativar', allowConfiguracoesStatusVinculos, validateRequest({ params: validateNumericIdParam('id', 'Status do setor') }), StatusSetorController.ativar);
router.patch('/status-setor/:id/desativar', allowConfiguracoesStatusVinculos, validateRequest({ params: validateNumericIdParam('id', 'Status do setor') }), StatusSetorController.desativar);

// -------------------------------------------------------------------
// PERMISSOES POR SETOR (SUPERADMIN)
// -------------------------------------------------------------------

router.get('/setor-permissoes', SetorPermissaoController.index);
router.patch('/setor-permissoes', allowConfiguracoesStatusVinculos, validateRequest({ body: validateSetorPermissaoBody }), SetorPermissaoController.upsert);

// -------------------------------------------------------------------
// CONFIGURACOES DO SISTEMA (SUPERADMIN)
// -------------------------------------------------------------------

router.patch('/configuracoes/tema', allowConfiguracoesAparencia, ConfiguracaoSistemaController.updateTema);
router.get('/configuracoes/suporte-whatsapp', ConfiguracaoSistemaController.getSuporteWhatsapp);
router.patch('/configuracoes/suporte-whatsapp', allowConfiguracoesAparencia, ConfiguracaoSistemaController.updateSuporteWhatsapp);
router.get('/configuracoes/timeout-inatividade', ConfiguracaoSistemaController.getTimeoutInatividade);
router.patch('/configuracoes/timeout-inatividade', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateTimeoutInatividade);
router.get('/configuracoes/areas-obra', ConfiguracaoSistemaController.getAreasObra);
router.patch('/configuracoes/areas-obra', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateAreasObra);
router.get('/configuracoes/areas-por-setor-origem', ConfiguracaoSistemaController.getAreasPorSetorOrigem);
router.patch('/configuracoes/areas-por-setor-origem', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateAreasPorSetorOrigem);
router.get('/configuracoes/solicitacoes-sla-setor', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.getSlaSolicitacoesSetor);
router.patch('/configuracoes/solicitacoes-sla-setor', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateSlaSolicitacoesSetor);
router.get('/configuracoes/setores-visiveis-usuario', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.getSetoresVisiveisPorUsuario);
router.patch('/configuracoes/setores-visiveis-usuario', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateSetoresVisiveisPorUsuario);
router.get('/configuracoes/tipos-solicitacao-por-setor', ConfiguracaoSistemaController.getTiposSolicitacaoPorSetor);
router.patch('/configuracoes/tipos-solicitacao-por-setor', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateTiposSolicitacaoPorSetor);
router.get('/configuracoes/obra-tipo-apropriacao', allowConfiguracoesStatusVinculos, ObraTipoApropriacaoController.index);
router.get('/configuracoes/obra-tipo-apropriacao/obras/:obraId/apropriacoes', allowConfiguracoesStatusVinculos, ObraTipoApropriacaoController.apropriacoesDaObra);
router.patch('/configuracoes/obra-tipo-apropriacao', allowConfiguracoesStatusVinculos, ObraTipoApropriacaoController.salvar);
router.get('/configuracoes/nova-solicitacao-campos', ConfiguracaoSistemaController.getCamposNovaSolicitacao);
router.patch('/configuracoes/nova-solicitacao-campos', allowConfiguracoesSolicitacoes, ConfiguracaoSistemaController.updateCamposNovaSolicitacao);
router.get('/configuracoes/nova-solicitacao-automacao-destino', ConfiguracaoSistemaController.getAutomacaoDestinoNovaSolicitacao);
router.patch('/configuracoes/nova-solicitacao-automacao-destino', allowConfiguracoesSolicitacoes, ConfiguracaoSistemaController.updateAutomacaoDestinoNovaSolicitacao);
router.get('/configuracoes/aprovacao-diretoria', ConfiguracaoSistemaController.getAprovacaoDiretoria);
router.patch('/configuracoes/aprovacao-diretoria', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateAprovacaoDiretoria);
router.get('/configuracoes/usuarios-acesso-prioridade-diretoria', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.getUsuariosAcessoPrioridadeDiretoria);
router.patch('/configuracoes/usuarios-acesso-prioridade-diretoria', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateUsuariosAcessoPrioridadeDiretoria);
router.get('/configuracoes/tipos-compartilhados-setor', ConfiguracaoSistemaController.getTiposCompartilhadosSetor);
router.patch('/configuracoes/tipos-compartilhados-setor', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateTiposCompartilhadosSetor);
router.get('/configuracoes/automacao-status-setor', ConfiguracaoSistemaController.getAutomacaoStatusSetor);
router.patch('/configuracoes/automacao-status-setor', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateAutomacaoStatusSetor);
router.get('/configuracoes/aprovacao-solicitacao-por-tipo', ConfiguracaoSistemaController.getAprovacaoSolicitacaoPorTipo);
router.patch('/configuracoes/aprovacao-solicitacao-por-tipo', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateAprovacaoSolicitacaoPorTipo);

// Preferencias e filtros salvos das listas (ListaAvancada) — sempre do
// proprio usuario autenticado; nao ha como ler ou escrever registro de
// outra pessoa (pacote B1 de docs/PROPOSTA-BACKEND.md).
// Rotas legadas (sem tipo no caminho): continuam valendo e caem no tipo
// 'geral', que e onde as linhas ja gravadas estao. Aceitam ?tipo= para o
// front migrar sem trocar de caminho.
router.get('/listas/:lista/preferencias', ListaPreferenciasController.getPreferencias);
router.put('/listas/:lista/preferencias', ListaPreferenciasController.putPreferencias);
// Reset da tela inteira (todos os tipos da lista). 204 mesmo sem linha.
router.delete('/listas/:lista/preferencias', ListaPreferenciasController.resetPreferenciasLista);
// Um tipo por vez: colunas, larguras, filtros, blocos, visual, geral.
router.get('/listas/:lista/preferencias/:tipo', ListaPreferenciasController.getPreferencias);
router.put('/listas/:lista/preferencias/:tipo', ListaPreferenciasController.putPreferencias);
router.delete('/listas/:lista/preferencias/:tipo', ListaPreferenciasController.resetPreferenciaTipo);
router.get('/listas/:lista/filtros', ListaPreferenciasController.listarFiltros);
router.post('/listas/:lista/filtros', ListaPreferenciasController.salvarFiltro);
router.delete('/listas/:lista/filtros/:id', ListaPreferenciasController.excluirFiltro);

// Preferencias do PROPRIO usuario, em bloco. Nenhuma destas rotas aceita
// id de usuario no caminho, na query ou no corpo — o dono e sempre
// req.user.id. Nao existe rota administrativa para resetar preferencia
// de terceiro; se um dia for pedida, nasce com gate de permissao.
//
// GET: carga unica, todas as listas do usuario numa consulta so, para a
// tela com varias tabelas nao fazer uma chamada de rede por tabela.
router.get('/me/preferencias', ListaPreferenciasController.getMinhasPreferencias);
// DELETE: reset de tudo. 204 mesmo quando nao havia linha.
router.delete('/me/preferencias', ListaPreferenciasController.resetMinhasPreferencias);
// POST: adocao em lote do que hoje esta no localStorage do usuario; cada
// entrada passa pela MESMA validacao do caminho unitario.
router.post('/me/preferencias/adotar', ListaPreferenciasController.adotarPreferencias);

// Busca universal (Ctrl+K): grupos gateados pela permissao da tela
// correspondente; grupo sem permissao nem e consultado (pacote B2).
router.get('/busca', BuscaController.index);

// Blocos opcionais da Home (pacote B6): dados sob demanda, um bloco por
// chamada, cada um gateado pelas permissoes e escopos da tela de origem.
router.get('/home/blocos/:bloco', HomeBlocosController.show);

// Pendencias do usuario no Hub (pacote B3): consultas nomeadas, gateadas
// pelas permissoes das telas de destino; contador e lista compartilham o
// mesmo recorte (pendenciasVisoes + escopo da listagem). Somente leitura.
router.get('/dashboard/pendencias', DashboardPendenciasController.index);

// Tela inicial escolhida pelo usuario (pacote B5) — validada no backend
// contra a fonte unica de navegacao compilada (mesmas regras do
// frontend); fail-closed: sem permissao/rota, limpa e cai na Home.
router.get('/me/tela-inicial', TelaInicialController.get);
router.put('/me/tela-inicial', TelaInicialController.put);
router.delete('/me/tela-inicial', TelaInicialController.delete);

// Configuracao por setor (pacote B4): leitura aberta a autenticados
// (metadado de interface); escrita gateada pelo MESMO gate de
// configuracoes dos demais vinculos de status — nenhuma permissao nova.
router.get('/configuracoes/atalhos-setor', AtalhoSetorController.index);
router.post('/configuracoes/atalhos-setor', allowConfiguracoesStatusVinculos, AtalhoSetorController.store);
router.put('/configuracoes/atalhos-setor/:id', allowConfiguracoesStatusVinculos, AtalhoSetorController.update);
router.delete('/configuracoes/atalhos-setor/:id', allowConfiguracoesStatusVinculos, AtalhoSetorController.destroy);
router.get('/configuracoes/detalhe-layout', DetalheLayoutController.index);
router.put('/configuracoes/detalhe-layout/:setor', allowConfiguracoesStatusVinculos, DetalheLayoutController.upsert);
router.delete('/configuracoes/detalhe-layout/:setor', allowConfiguracoesStatusVinculos, DetalheLayoutController.destroy);
router.get('/configuracoes/acoes-principais', AcaoPrincipalSetorController.index);
router.post('/configuracoes/acoes-principais', allowConfiguracoesStatusVinculos, AcaoPrincipalSetorController.store);
router.put('/configuracoes/acoes-principais/:id', allowConfiguracoesStatusVinculos, AcaoPrincipalSetorController.update);
router.delete('/configuracoes/acoes-principais/:id', allowConfiguracoesStatusVinculos, AcaoPrincipalSetorController.destroy);
router.get('/configuracoes/setores-criacao-todas-obras', ConfiguracaoSistemaController.getSetoresCriacaoTodasObras);
router.patch('/configuracoes/setores-criacao-todas-obras', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateSetoresCriacaoTodasObras);
router.get('/configuracoes/setores-acesso-todas-obras', ConfiguracaoSistemaController.getSetoresAcessoTodasObras);
router.patch('/configuracoes/setores-acesso-todas-obras', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateSetoresAcessoTodasObras);
router.get('/configuracoes/usuarios-acesso-financeiro', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.getUsuariosAcessoFinanceiro);
router.patch('/configuracoes/usuarios-acesso-financeiro', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateUsuariosAcessoFinanceiro);
router.get('/configuracoes/usuarios-envio-qualquer-setor', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.getUsuariosEnvioQualquerSetor);
router.patch('/configuracoes/usuarios-envio-qualquer-setor', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateUsuariosEnvioQualquerSetor);
router.get('/configuracoes/usuarios-permissoes-rh-dp', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.getUsuariosPermissoesRhDp);
router.patch('/configuracoes/usuarios-permissoes-rh-dp', allowConfiguracoesStatusVinculos, ConfiguracaoSistemaController.updateUsuariosPermissoesRhDp);
router.get('/configuracoes/permissoes-areas/registry', allowConfiguracoesPermissoes, PermissoesAreasController.registry);
router.get('/configuracoes/permissoes-areas', allowConfiguracoesPermissoes, PermissoesAreasController.get);
router.put('/configuracoes/permissoes-areas', allowConfiguracoesPermissoes, PermissoesAreasController.save);
router.get('/configuracoes/visibilidade-ui', UiVisibilityConfigController.show);
router.patch('/configuracoes/visibilidade-ui', allowConfiguracoesAparencia, UiVisibilityConfigController.update);
router.get('/configuracoes/cotacoes', requireEnabledModule('COTACOES'), allowComprasConfiguracoesManage, ConfiguracaoSistemaController.getCotacoesConfig);
router.patch('/configuracoes/cotacoes', requireEnabledModule('COTACOES'), allowComprasConfiguracoesManage, ConfiguracaoSistemaController.setCotacoesConfig);
router.get('/configuracoes/status-pedidos-compra', allowComprasPedidosRead, ConfiguracaoSistemaController.getStatusPedidosCompra);
router.patch('/configuracoes/status-pedidos-compra', allowComprasConfiguracoesManage, ConfiguracaoSistemaController.setStatusPedidosCompra);
// Limite que decide se o contrato passa pelo JURIDICO (PI-1). Configuravel pela Diretoria.
// Formas de pagamento que a medicao oferece (item 9, 23/08). A configuracao cura a lista; o cadastro
// financeiro continua sendo a fonte.
router.get('/configuracoes/formas-pagamento-medicao', allowConfiguracoesGeral, ConfiguracaoSistemaController.getFormasPagamentoMedicao);
router.patch('/configuracoes/formas-pagamento-medicao', allowConfiguracoesGeral, criticalRateLimit, ConfiguracaoSistemaController.setFormasPagamentoMedicao);
router.get('/configuracoes/despesa-eventual-limites', allowConfiguracoesGeral, ConfiguracaoSistemaController.getDespesaEventualLimites);
router.patch('/configuracoes/despesa-eventual-limites', allowConfiguracoesGeral, criticalRateLimit, ConfiguracaoSistemaController.setDespesaEventualLimites);
// Item 21 (23/08): cortes e cores do alerta de saldo do contrato.
router.get('/configuracoes/alerta-saldo-contrato', allowConfiguracoesGeral, ConfiguracaoSistemaController.getAlertaSaldoContrato);
router.patch('/configuracoes/alerta-saldo-contrato', allowConfiguracoesGeral, criticalRateLimit, ConfiguracaoSistemaController.setAlertaSaldoContrato);
// A tela da medicao le a lista JA filtrada — sem permissao de configuracao, que quem mede nao tem.
router.get('/contratos/medicoes/formas-pagamento', ContratoFluxoNovoController.formasPagamentoDaMedicao);
router.get('/configuracoes/contrato-limite-juridico', allowConfiguracoesGeral, ConfiguracaoSistemaController.getContratoLimiteJuridico);
router.patch('/configuracoes/contrato-limite-juridico', allowConfiguracoesGeral, ConfiguracaoSistemaController.setContratoLimiteJuridico);
router.get('/configuracoes/contrato-obra-categorias', allowConfiguracoesGeral, ConfiguracaoSistemaController.getContratoObraCategorias);
router.patch('/configuracoes/contrato-obra-categorias', allowConfiguracoesGeral, ConfiguracaoSistemaController.setContratoObraCategorias);
router.get('/configuracoes/comercial-categorias-contrato', allowConfiguracoesGeral, ConfiguracaoSistemaController.getComercialCategoriasContrato);
router.patch('/configuracoes/comercial-categorias-contrato', allowConfiguracoesGeral, ConfiguracaoSistemaController.setComercialCategoriasContrato);
router.get('/configuracoes/provisionamento-fluxo', requireEnabledModule('PROVISOES'), allowConfiguracoesGeral, ConfiguracaoSistemaController.getProvisionamentoFluxo);
router.patch('/configuracoes/provisionamento-fluxo', requireEnabledModule('PROVISOES'), allowConfiguracoesGeral, validateRequest({ body: validateProvisionamentoFluxoConfigBody }), ConfiguracaoSistemaController.setProvisionamentoFluxo);
router.get('/configuracoes/notificacoes-sistema', allowConfiguracoesAparencia, ConfiguracaoSistemaController.getNotificacoesSistema);
router.patch('/configuracoes/notificacoes-sistema', allowConfiguracoesAparencia, ConfiguracaoSistemaController.setNotificacoesSistema);
router.get('/configuracoes/modulos', ConfiguracaoSistemaController.getModulos);
router.patch('/configuracoes/modulos', allowConfiguracoesModulos, ConfiguracaoSistemaController.setModulos);

// -------------------------------------------------------------------
// CONTRATOS
// -------------------------------------------------------------------

router.get('/contratos', validateRequest({ query: validateContratoQuery }), ContratoController.index);
router.get('/contratos/resumo', validateRequest({ query: validateContratoQuery }), ContratoController.resumo);
router.get('/contratos/relatorios/operacional', validateRequest({ query: validateContratoRelatorioOperacionalQuery }), ContratoController.relatorioOperacional);
router.get('/contratos/exportar-csv', validateRequest({ query: validateContratoQuery }), ContratoController.exportarCsv);
router.get('/contratos/:id/solicitacoes', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, ContratoController.solicitacoes);
router.get('/contratos/:id/anexos', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, ContratoController.listarAnexos);
// Parcelas do contrato (leitura) — usada pela Medicao para decidir a trilha e montar a lista.
router.get('/contratos/:id/parcelas', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, ContratoFluxoNovoController.listarParcelas);
router.post('/contratos', validateRequest({ body: validateContratoCreateBody }), requireContratoBodyObraAccess, ContratoController.create);
// Fluxo novo de contratos (wireframe 1). Permissoes e regras no servico, auditadas.
// Opcoes do formulario de contrato (responsaveis e condicoes de pagamento). Sem permissao
// administrativa de proposito: quem abre contrato e o usuario da OBRA, e as rotas antigas
// (`/usuarios` e `/financeiro/formas-pagamento`) exigiam acessos que ele nao tem — os selects
// vinham vazios, em silencio.
router.get('/contratos/fluxo-novo/opcoes', ContratoFluxoNovoController.opcoesDoFormulario);
router.get('/contratos/fluxo-novo/limite-juridico', ContratoFluxoNovoController.limiteJuridico);
router.get('/contratos/fluxo-novo/categorias', ContratoFluxoNovoController.categorias);
// Conferencia e correcao do cadastro do contratado, exigido acima do limite (20/08).
router.get('/contratos/credores/conferencia', ContratoFluxoNovoController.conferirCredores);
router.patch('/contratos/credores/:id/cadastro', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Parceiro') }), ContratoFluxoNovoController.completarCredor);
// Consulta externa de CNPJ. Desligada por padrao (`CNPJ_LOOKUP_URL` vazia => 501).
router.get('/contratos/credores/cnpj/:cnpj', ContratoFluxoNovoController.consultarCnpj);
router.post('/contratos/fluxo-novo', criticalRateLimit, requireContratoBodyObraAccess, ContratoFluxoNovoController.criar);
router.post('/contratos/fluxo-novo/:id/aprovar', criticalRateLimit, ContratoFluxoNovoController.aprovar);
router.post('/contratos/fluxo-novo/:id/reenviar', criticalRateLimit, ContratoFluxoNovoController.reenviar);
router.post('/contratos/fluxo-novo/:id/rejeitar', criticalRateLimit, ContratoFluxoNovoController.rejeitar);
// Quebra de contrato: zera o saldo e exclui titulos em aberto. Permissao propria no servico.
// Etapas do JURIDICO acima do limite (minuta / assinado). Permissao propria no servico.
router.post('/contratos/fluxo-novo/:id/juridico', criticalRateLimit, ContratoFluxoNovoController.juridico);
// Editar uma medicao ja criada (valor e vencimento). `contratos.medicao.editar_valor` e conferida
// no servico, junto da regra de redistribuicao — a rota nao duplica a decisao.
// Aprovar a medicao: leva a solicitacao a LIBERADO e a encaminha ao Financeiro (item 25, 23/08).
router.post('/contratos/medicoes/:id/aprovar', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Medicao') }), ContratoFluxoNovoController.aprovarMedicao);
router.put('/contratos/medicoes/:id', criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Medicao') }), ContratoFluxoNovoController.atualizarMedicao);
// Termo aditivo: teto de 25% sobre o valor original, acumulando os aprovados (PI-12).
// Termo aditivo (PI-15): vale para contrato do fluxo ANTIGO e do NOVO, entao as rotas nao ficam
// sob o prefixo `fluxo-novo` — o prefixo seria uma mentira sobre o alcance. As tres rotas antigas
// seguem logo abaixo apenas por compatibilidade, apontando para os mesmos handlers.
router.get('/contratos/:id/aditivos/teto', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, ContratoFluxoNovoController.tetoAditivo);
router.post('/contratos/:id/aditivos', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), criticalRateLimit, requireContratoAccess, ContratoFluxoNovoController.criarAditivo);
router.post('/contratos/aditivos/:aditivoId/decisao', validateRequest({ params: validateNumericIdParam('aditivoId', 'Aditivo') }), criticalRateLimit, ContratoFluxoNovoController.decidirAditivo);
// Listar e cancelar (item 26, 23/08). A listagem nao existia — o aditivo era pedido e sumia da tela.
router.get('/contratos/:id/aditivos', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, ContratoFluxoNovoController.listarAditivos);
router.post('/contratos/aditivos/:aditivoId/cancelar', validateRequest({ params: validateNumericIdParam('aditivoId', 'Aditivo') }), criticalRateLimit, ContratoFluxoNovoController.cancelarAditivo);

router.get('/contratos/fluxo-novo/:id/aditivos/teto', requireContratoAccess, ContratoFluxoNovoController.tetoAditivo);
router.post('/contratos/fluxo-novo/:id/aditivos', criticalRateLimit, requireContratoAccess, ContratoFluxoNovoController.criarAditivo);
router.post('/contratos/fluxo-novo/aditivos/:aditivoId/decisao', criticalRateLimit, ContratoFluxoNovoController.decidirAditivo);
router.get('/contratos/fluxo-novo/:id/aditivos', requireContratoAccess, ContratoFluxoNovoController.listarAditivos);
router.post('/contratos/fluxo-novo/aditivos/:aditivoId/cancelar', criticalRateLimit, ContratoFluxoNovoController.cancelarAditivo);
// PI-16: cancelar a solicitacao do contrato e TERMINAL, por permissao granular
// (`contratos.solicitacao.cancelar`). Rejeitar, que devolve para ajuste, e a rota de rejeicao.
router.patch('/contratos/:id/apropriacoes', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), criticalRateLimit, requireContratoAccess, ContratoFluxoNovoController.atualizarApropriacoes);
router.post('/contratos/:id/solicitacao/cancelar', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), criticalRateLimit, requireContratoAccess, ContratoFluxoNovoController.cancelarSolicitacao);
router.post('/contratos/fluxo-novo/:id/encerrar', criticalRateLimit, ContratoFluxoNovoController.encerrar);
router.post('/contratos/importar-massa', permit(['SUPERADMIN']), uploadRateLimit, uploadComprovantes.single('file'), ContratoController.importarMassa);
router.post('/contratos/importar-apropriacoes', permit(['SUPERADMIN']), uploadRateLimit, uploadComprovantes.single('file'), ContratoController.importarApropriacoes);
router.post('/contratos/:id/minuta', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, uploadRateLimit, uploadNegociacaoContrato.single('file'), auditSuccess({ eventType: 'CONTRACT_DRAFT_UPLOADED', resourceType: 'CONTRATO', description: 'Minuta do contrato enviada', resourceIdResolver: (req) => req.params.id }), ContratoController.uploadMinuta);
router.post('/contratos/:id/negociacao', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, uploadRateLimit, uploadNegociacaoContrato.single('file'), auditSuccess({ eventType: 'CONTRACT_NEGOTIATION_UPLOADED', resourceType: 'CONTRATO', description: 'Documento de negociacao detalhada enviado', resourceIdResolver: (req) => req.params.id }), ContratoController.uploadNegociacao);
router.post('/contratos/:id/documentacao-juridica/:tipo', validateRequest({ params: validateNumericIdAndSlugParams('id', 'tipo', ['cartao-cnpj', 'ato-constitutivo', 'representante-legal'], 'Documento juridico') }), requireContratoAccess, uploadRateLimit, uploadDocumentacaoJuridica.single('file'), auditSuccess({ eventType: 'CONTRACT_LEGAL_DOCUMENT_UPLOADED', resourceType: 'CONTRATO', description: 'Documento juridico de abertura enviado', resourceIdResolver: (req) => req.params.id }), ContratoController.uploadDocumentacaoJuridica);
router.post('/contratos/:id/anexos', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, uploadRateLimit, uploadComprovantes.array('files'), auditSuccess({ eventType: 'CONTRACT_FILE_UPLOADED', resourceType: 'CONTRATO', description: 'Anexo de contrato enviado', resourceIdResolver: (req) => req.params.id }), ContratoController.uploadAnexos);
router.patch('/contratos/:id', validateRequest({ params: validateNumericIdParam('id', 'Contrato'), body: validateContratoUpdateBody }), requireContratoAccess, requireContratoOptionalBodyObraAccess, auditSuccess({ eventType: 'CONTRACT_UPDATED', resourceType: 'CONTRATO', description: 'Contrato atualizado', resourceIdResolver: (req) => req.params.id }), ContratoController.update);
router.delete('/contratos/:id', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, auditSuccess({ eventType: 'CONTRACT_DELETED', resourceType: 'CONTRATO', description: 'Contrato excluido', resourceIdResolver: (req) => req.params.id }), ContratoController.excluir);
router.patch('/contratos/:id/ativar', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, auditSuccess({ eventType: 'CONTRACT_ACTIVATED', resourceType: 'CONTRATO', description: 'Contrato ativado', resourceIdResolver: (req) => req.params.id }), ContratoController.ativar);
router.patch('/contratos/:id/desativar', validateRequest({ params: validateNumericIdParam('id', 'Contrato') }), requireContratoAccess, auditSuccess({ eventType: 'CONTRACT_DEACTIVATED', resourceType: 'CONTRATO', description: 'Contrato desativado', resourceIdResolver: (req) => req.params.id }), ContratoController.desativar);

// -------------------------------------------------------------------
// CRM
// -------------------------------------------------------------------

router.get('/crm/pipelines', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsRead, CrmPipelineController.index);
router.get('/crm/pipelines/:id/kanban', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsRead, CrmPipelineController.kanban);
router.post('/crm/pipelines/:id/stages', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmPipelineController.createStage);
router.patch('/crm/pipeline-stages/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmPipelineController.updateStage);
router.delete('/crm/pipeline-stages/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmPipelineController.deleteStage);
router.get('/crm/loss-reasons', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsRead, CrmPipelineController.lossReasons);

router.get('/crm/leads', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsRead, CrmLeadsController.index);
router.get('/crm/leads/export', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadExport, CrmLeadsController.export);
router.get('/crm/leads/redistribution-candidates', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadRedistribute, CrmLeadsController.redistributionCandidates);
router.post('/crm/leads', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmLeadsController.create);
router.get('/crm/leads/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsRead, CrmLeadsController.show);
router.patch('/crm/leads/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmLeadsController.update);
router.patch('/crm/leads/:id/stage', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmLeadsController.changeStage);
router.patch('/crm/leads/:id/loss', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmLeadsController.registerLoss);
router.patch('/crm/leads/:id/convert', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmLeadsController.registerConversion);
router.patch('/crm/leads/:id/archive', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmLeadsController.archive);
router.post('/crm/leads/:id/redistribute', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadRedistribute, CrmLeadsController.redistribute);
router.get('/crm/leads/:id/interactions', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsRead, CrmLeadsController.listInteractions);
router.post('/crm/leads/:id/interactions', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmLeadsController.createInteraction);

router.get('/crm/tasks', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsRead, CrmTasksController.index);
router.post('/crm/tasks', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmTasksController.create);
router.patch('/crm/tasks/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmTasksController.update);
router.patch('/crm/tasks/:id/complete', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmTasksController.complete);
router.patch('/crm/tasks/:id/cancel', requireEnabledModule('CRM'), requireCrmModule(), allowCrmLeadsWrite, CrmTasksController.cancel);

router.get('/crm/dashboard/operacional', requireEnabledModule('CRM'), requireCrmModule(), allowCrmDashboardRead, CrmDashboardController.operacional);
router.get('/crm/dashboard/gerencial', requireEnabledModule('CRM'), requireCrmModule(), allowCrmDashboardRead, CrmDashboardController.gerencial);
router.get('/crm/dashboard/sla', requireEnabledModule('CRM'), requireCrmModule(), allowCrmDashboardRead, CrmDashboardController.sla);
router.get('/crm/dashboard/distribuicao', requireEnabledModule('CRM'), requireCrmModule(), allowCrmDashboardRead, CrmDashboardController.distribuicao);

router.get('/crm/conversations', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAtendimentoRead, CrmConversationsController.index);
router.post('/crm/conversations', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAtendimentoSend, CrmConversationsController.create);
router.get('/crm/conversations/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAtendimentoRead, CrmConversationsController.show);
router.patch('/crm/conversations/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAtendimentoSend, CrmConversationsController.update);
router.post('/crm/conversations/:id/messages', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAtendimentoSend, CrmConversationsController.createMessage);
router.post('/crm/conversations/:id/read', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAtendimentoRead, CrmConversationsController.markRead);

router.get('/crm/message-templates', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAtendimentoRead, CrmConversationsController.templates);
router.post('/crm/message-templates', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAtendimentoSend, CrmConversationsController.createTemplate);
router.patch('/crm/message-templates/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAtendimentoSend, CrmConversationsController.updateTemplate);

router.get('/crm/automation-rules', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAutomacoesRead, CrmAutomationController.index);
router.post('/crm/automation-rules', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAutomacoesManage, CrmAutomationController.create);
router.patch('/crm/automation-rules/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAutomacoesManage, CrmAutomationController.update);
router.post('/crm/automation-rules/:id/activate', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAutomacoesManage, CrmAutomationController.activate);
router.post('/crm/automation-rules/:id/deactivate', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAutomacoesManage, CrmAutomationController.deactivate);
router.post('/crm/automation-rules/run-cycle', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAutomacoesManage, CrmAutomationController.runCycle);
router.get('/crm/automation-executions', requireEnabledModule('CRM'), requireCrmModule(), allowCrmAutomacoesRead, CrmAutomationController.executions);

router.get('/crm/channels', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesRead, CrmAdminController.listarCanais);
router.post('/crm/channels', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesManage, CrmAdminController.criarCanal);
router.get('/crm/channels/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesRead, CrmAdminController.obterCanal);
router.patch('/crm/channels/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesManage, CrmAdminController.atualizarCanal);
router.delete('/crm/channels/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesManage, CrmAdminController.excluirCanal);

router.get('/crm/phone-assets', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesRead, CrmAdminController.listarNumeros);
router.post('/crm/phone-assets', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesManage, CrmAdminController.criarNumero);
router.get('/crm/phone-assets/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesRead, CrmAdminController.obterNumero);
router.patch('/crm/phone-assets/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesManage, CrmAdminController.atualizarNumero);
router.delete('/crm/phone-assets/:id', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesManage, CrmAdminController.excluirNumero);

router.get('/crm/integrations/config', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesRead, CrmAdminController.obterIntegracoes);
router.patch('/crm/integrations/config', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesManage, CrmAdminController.atualizarIntegracoes);
router.get('/crm/integrations/meta/events', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesRead, CrmAdminController.listarEventosMeta);
router.post('/crm/integrations/meta/events/:id/reprocess', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesManage, CrmAdminController.reprocessarEventoMeta);
router.get('/crm/integrations/google/events', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesRead, CrmAdminController.listarEventosGoogle);
router.post('/crm/integrations/google/events/:id/reprocess', requireEnabledModule('CRM'), requireCrmModule(), allowCrmConfiguracoesManage, CrmAdminController.reprocessarEventoGoogle);

// -------------------------------------------------------------------
// DASHBOARD
// -------------------------------------------------------------------

router.get('/dashboard/executivo', DashboardController.executivo);

// -------------------------------------------------------------------
// CONVERSAS INTERNAS (CHAT UNIFICADO)
// -------------------------------------------------------------------
const allowComunicacaoRead = allowPaymentAction(
  'COMUNICACAO_INTERNA_READ',
  canViewComunicacao,
  'Acesso negado para visualizar a comunicacao interna'
);
const allowComunicacaoSend = allowPaymentAction(
  'COMUNICACAO_INTERNA_SEND',
  canSendComunicacao,
  'Acesso negado para enviar ou alterar mensagens internas'
);

router.get('/conversas-internas/destinatarios', allowComunicacaoRead, ConversaInternaController.opcoesDestinatario);
router.get('/conversas-internas/resumo', allowComunicacaoRead, ConversaInternaController.resumo);
router.get('/conversas-internas/entrada', allowComunicacaoRead, ConversaInternaController.listar);
router.get('/conversas-internas/saida', allowComunicacaoRead, ConversaInternaController.listar);
router.get('/conversas-internas', allowComunicacaoRead, ConversaInternaController.listar);
router.get('/conversas-internas/:id/mensagens', allowComunicacaoRead, ConversaInternaController.listarMensagens);
router.post('/conversas-internas/:id/lida', allowComunicacaoRead, ConversaInternaController.marcarLida);
router.get('/conversas-internas/:id', allowComunicacaoRead, ConversaInternaController.detalhar);
router.post('/conversas-internas', allowComunicacaoSend, uploadRateLimit, uploadComprovantes.array('files'), ConversaInternaController.criar);
router.post('/conversas-internas/massa', allowComunicacaoSend, uploadRateLimit, uploadComprovantes.array('files'), ConversaInternaController.criarEmMassa);
router.post('/conversas-internas/:id/mensagens', allowComunicacaoSend, uploadRateLimit, uploadComprovantes.array('files'), ConversaInternaController.responder);
router.post('/conversas-internas/:id/participantes', allowComunicacaoSend, ConversaInternaController.adicionarParticipantes);
router.patch('/conversas-internas/arquivar-massa', allowComunicacaoRead, ConversaInternaController.arquivarMassa);
router.patch('/conversas-internas/desarquivar-massa', allowComunicacaoRead, ConversaInternaController.desarquivarMassa);
router.patch('/conversas-internas/:id/concluir', allowComunicacaoSend, ConversaInternaController.concluir);
router.patch('/conversas-internas/:id/reabrir', allowComunicacaoSend, ConversaInternaController.reabrir);
router.patch('/conversas-internas/mensagens/:mensagemId', allowComunicacaoSend, ConversaInternaController.editarMensagem);
router.delete('/conversas-internas/mensagens/:mensagemId', allowComunicacaoSend, ConversaInternaController.deletarMensagem);

module.exports = router;
