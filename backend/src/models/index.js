const Sequelize = require('sequelize');
const sequelize = require('../database');

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

/* =====================
   MODELS
===================== */
db.User = require('./User')(sequelize, Sequelize);
db.Obra = require('./Obra')(sequelize, Sequelize);
db.UsuarioObra = require('./UsuarioObra')(sequelize, Sequelize);
db.UsuarioSetor = require('./UsuarioSetor')(sequelize, Sequelize);
db.Setor = require('./Setor')(sequelize, Sequelize);
db.Parceiro = require('./Parceiro')(sequelize, Sequelize);
db.ParceiroCategoria = require('./ParceiroCategoria')(sequelize, Sequelize);
db.ParceiroCategoriaItem = require('./ParceiroCategoriaItem')(sequelize, Sequelize);
db.Solicitacao = require('./Solicitacao')(sequelize, Sequelize);
db.SolicitacaoApropriacao = require('./SolicitacaoApropriacao')(sequelize, Sequelize);
db.SolicitacaoPagamento = require('./SolicitacaoPagamento')(sequelize, Sequelize);
db.PrioridadeLote = require('./PrioridadeLote')(sequelize, Sequelize);
db.PrioridadeLoteItem = require('./PrioridadeLoteItem')(sequelize, Sequelize);
db.StatusArea = require('./StatusArea')(sequelize, Sequelize);
db.Historico = require('./Historico')(sequelize, Sequelize);
db.Anexo = require('./Anexo')(sequelize, Sequelize);
db.MensagemSetor = require('./MensagemSetor')(sequelize, Sequelize);
db.TipoSolicitacao = require('./TipoSolicitacao')(sequelize, Sequelize);
db.EtapaSetor = require('./EtapaSetor')(sequelize, Sequelize);
db.Cargo = require('./Cargo')(sequelize, Sequelize);
db.Comprovante = require('./Comprovante')(sequelize, Sequelize);
db.Contrato = require('./Contrato')(sequelize, Sequelize);
db.ContratoAnexo = require('./ContratoAnexo')(sequelize, Sequelize);
db.ContratoApropriacao = require('./ContratoApropriacao')(sequelize, Sequelize);
db.ContratoCredor = require('./ContratoCredor')(sequelize, Sequelize);
db.Empreendimento = require('./Empreendimento')(sequelize, Sequelize);
db.UnidadeComercial = require('./UnidadeComercial')(sequelize, Sequelize);
db.TabelaPrecoComercial = require('./TabelaPrecoComercial')(sequelize, Sequelize);
db.TabelaPrecoComercialItem = require('./TabelaPrecoComercialItem')(sequelize, Sequelize);
db.ContratoComercial = require('./ContratoComercial')(sequelize, Sequelize);
db.ContratoComercialUnidade = require('./ContratoComercialUnidade')(sequelize, Sequelize);
db.ContratoComercialComprador = require('./ContratoComercialComprador')(sequelize, Sequelize);
db.ContratoComercialParcela = require('./ContratoComercialParcela')(sequelize, Sequelize);
db.ContratoComercialEvento = require('./ContratoComercialEvento')(sequelize, Sequelize);
db.ContratoComercialModelo = require('./ContratoComercialModelo')(sequelize, Sequelize);
db.ContratoComercialDocumento = require('./ContratoComercialDocumento')(sequelize, Sequelize);
db.ComercialContratoImportacao = require('./ComercialContratoImportacao')(sequelize, Sequelize);
db.ComercialContratoImportacaoLinha = require('./ComercialContratoImportacaoLinha')(sequelize, Sequelize);
db.ComercialContratoImportacaoResultado = require('./ComercialContratoImportacaoResultado')(sequelize, Sequelize);
db.ProvisaoCategoriaMacro = require('./ProvisaoCategoriaMacro')(sequelize, Sequelize);
db.ProvisaoFinanceira = require('./ProvisaoFinanceira')(sequelize, Sequelize);
db.ProvisaoFinanceiraHistorico = require('./ProvisaoFinanceiraHistorico')(sequelize, Sequelize);
db.ProvisaoFinanceiraAnexo = require('./ProvisaoFinanceiraAnexo')(sequelize, Sequelize);
db.ProvisaoFinanceiraSequencia = require('./ProvisaoFinanceiraSequencia')(sequelize, Sequelize);
db.SolicitacaoProvisao = require('./SolicitacaoProvisao')(sequelize, Sequelize);
db.EmpresaGrupo = require('./EmpresaGrupo')(sequelize, Sequelize);
db.RhEmpresaGrupo = require('./RhEmpresaGrupo')(sequelize, Sequelize);
db.RhColaborador = require('./RhColaborador')(sequelize, Sequelize);
db.RhColaboradorPagamento = require('./RhColaboradorPagamento')(sequelize, Sequelize);
db.RhDocumentoTipo = require('./RhDocumentoTipo')(sequelize, Sequelize);
db.RhDocumento = require('./RhDocumento')(sequelize, Sequelize);
db.RhImportacao = require('./RhImportacao')(sequelize, Sequelize);
db.RhImportacaoLinha = require('./RhImportacaoLinha')(sequelize, Sequelize);
db.RhApuracao = require('./RhApuracao')(sequelize, Sequelize);
db.RhApuracaoEvento = require('./RhApuracaoEvento')(sequelize, Sequelize);
db.RhFechamento = require('./RhFechamento')(sequelize, Sequelize);
db.RhFechamentoTitulo = require('./RhFechamentoTitulo')(sequelize, Sequelize);
db.IntegracaoSiengeConfig = require('./IntegracaoSiengeConfig')(sequelize, Sequelize);
db.IntegracaoSiengeFila = require('./IntegracaoSiengeFila')(sequelize, Sequelize);
db.IntegracaoSiengeLog = require('./IntegracaoSiengeLog')(sequelize, Sequelize);
db.IntegracaoSiengeMapeamento = require('./IntegracaoSiengeMapeamento')(sequelize, Sequelize);
db.TipoMacroContrato = require('./TipoMacroContrato')(sequelize, Sequelize);
db.TipoSubContrato = require('./TipoSubContrato')(sequelize, Sequelize);
db.SolicitacaoVisibilidadeUsuario =
  require('./SolicitacaoVisibilidadeUsuario')(sequelize, Sequelize);
db.SetorPermissao = require('./SetorPermissao')(sequelize, Sequelize);
db.Notificacao = require('./Notificacao')(sequelize, Sequelize);
db.NotificacaoDestinatario = require('./NotificacaoDestinatario')(sequelize, Sequelize);
db.ConfiguracaoSistema = require('./ConfiguracaoSistema')(sequelize, Sequelize);
db.LogExclusao = require('./LogExclusao')(sequelize, Sequelize);
db.ConversaInterna = require('./ConversaInterna')(sequelize, Sequelize);
db.ConversaInternaMensagem = require('./ConversaInternaMensagem')(sequelize, Sequelize);
db.ConversaInternaAnexo = require('./ConversaInternaAnexo')(sequelize, Sequelize);
db.ConversaInternaParticipante = require('./ConversaInternaParticipante')(sequelize, Sequelize);
db.ConversaInternaArquivoUsuario = require('./ConversaInternaArquivoUsuario')(sequelize, Sequelize);
db.ArquivoModelo = require('./ArquivoModelo')(sequelize, Sequelize);
db.TreinamentoConteudo = require('./TreinamentoConteudo')(sequelize, Sequelize);
db.TreinamentoLeituraUsuario = require('./TreinamentoLeituraUsuario')(sequelize, Sequelize);
db.SecurityEventLog = require('./SecurityEventLog')(sequelize, Sequelize);
db.ContaBancaria = require('./ContaBancaria')(sequelize, Sequelize);
db.CategoriaFinanceira = require('./CategoriaFinanceira')(sequelize, Sequelize);
db.FormaPagamentoFinanceira = require('./FormaPagamentoFinanceira')(sequelize, Sequelize);
db.CartaoFinanceiro = require('./CartaoFinanceiro')(sequelize, Sequelize);
db.FaturaCartaoFinanceiro = require('./FaturaCartaoFinanceiro')(sequelize, Sequelize);
db.FaturaCartaoTitulo = require('./FaturaCartaoTitulo')(sequelize, Sequelize);
db.TituloFinanceiro = require('./TituloFinanceiro')(sequelize, Sequelize);
db.TituloFinanceiroRateio = require('./TituloFinanceiroRateio')(sequelize, Sequelize);
db.TituloFinanceiroImposto = require('./TituloFinanceiroImposto')(sequelize, Sequelize);
db.TituloFinanceiroSequencia = require('./TituloFinanceiroSequencia')(sequelize, Sequelize);
db.FinanceiroTituloImportacao = require('./FinanceiroTituloImportacao')(sequelize, Sequelize);
db.FinanceiroTituloImportacaoLinha = require('./FinanceiroTituloImportacaoLinha')(sequelize, Sequelize);
db.FinanceiroTituloImportacaoResultado = require('./FinanceiroTituloImportacaoResultado')(sequelize, Sequelize);
db.ChequeTerceiro = require('./ChequeTerceiro')(sequelize, Sequelize);
db.ChequeTerceiroMovimento = require('./ChequeTerceiroMovimento')(sequelize, Sequelize);
db.BaixaFinanceiraGrupo = require('./BaixaFinanceiraGrupo')(sequelize, Sequelize);
db.BaixaFinanceiraComponente = require('./BaixaFinanceiraComponente')(sequelize, Sequelize);
db.BaixaFinanceiraAlocacao = require('./BaixaFinanceiraAlocacao')(sequelize, Sequelize);
db.FinanciamentoBancario = require('./FinanciamentoBancario')(sequelize, Sequelize);
db.FinanciamentoBancarioParcela = require('./FinanciamentoBancarioParcela')(sequelize, Sequelize);
db.BoletoCaixaConvenio = require('./BoletoCaixaConvenio')(sequelize, Sequelize);
db.BoletoCaixa = require('./BoletoCaixa')(sequelize, Sequelize);
db.BoletoCaixaRemessa = require('./BoletoCaixaRemessa')(sequelize, Sequelize);
db.BoletoCaixaRemessaItem = require('./BoletoCaixaRemessaItem')(sequelize, Sequelize);
db.BoletoCaixaRetorno = require('./BoletoCaixaRetorno')(sequelize, Sequelize);
db.BoletoCaixaOcorrencia = require('./BoletoCaixaOcorrencia')(sequelize, Sequelize);
db.CaixaPagamentoConvenio = require('./CaixaPagamentoConvenio')(sequelize, Sequelize);
db.CaixaPagamentoRemessa = require('./CaixaPagamentoRemessa')(sequelize, Sequelize);
db.CaixaPagamentoRemessaItem = require('./CaixaPagamentoRemessaItem')(sequelize, Sequelize);
db.MovimentoFinanceiro = require('./MovimentoFinanceiro')(sequelize, Sequelize);
db.CaixaFinanceiroSessao = require('./CaixaFinanceiroSessao')(sequelize, Sequelize);
db.CaixaConciliacaoConfirmacao = require('./CaixaConciliacaoConfirmacao')(sequelize, Sequelize);
db.TransferenciaFinanceira = require('./TransferenciaFinanceira')(sequelize, Sequelize);
db.ConciliacaoBancaria = require('./ConciliacaoBancaria')(sequelize, Sequelize);
db.ConciliacaoBancariaImportacao = require('./ConciliacaoBancariaImportacao')(sequelize, Sequelize);
db.ObraCustoHistoricoImportacao = require('./ObraCustoHistoricoImportacao')(sequelize, Sequelize);
db.ObraCustoHistorico = require('./ObraCustoHistorico')(sequelize, Sequelize);
db.PaymentProvider = require('./PaymentProvider')(sequelize, Sequelize);
db.PaymentAccount = require('./PaymentAccount')(sequelize, Sequelize);
db.PaymentBeneficiary = require('./PaymentBeneficiary')(sequelize, Sequelize);
db.PaymentBeneficiaryAuditLog = require('./PaymentBeneficiaryAuditLog')(sequelize, Sequelize);
db.PaymentIntent = require('./PaymentIntent')(sequelize, Sequelize);
db.PaymentBatch = require('./PaymentBatch')(sequelize, Sequelize);
db.PaymentBatchItem = require('./PaymentBatchItem')(sequelize, Sequelize);
db.PaymentApproval = require('./PaymentApproval')(sequelize, Sequelize);
db.PaymentTransaction = require('./PaymentTransaction')(sequelize, Sequelize);
db.PaymentEvent = require('./PaymentEvent')(sequelize, Sequelize);
db.PaymentReconciliation = require('./PaymentReconciliation')(sequelize, Sequelize);
db.PaymentJob = require('./PaymentJob')(sequelize, Sequelize);
db.FinanceiroDdaSincronizacao = require('./FinanceiroDdaSincronizacao')(sequelize, Sequelize);
db.FinanceiroDdaBoleto = require('./FinanceiroDdaBoleto')(sequelize, Sequelize);
db.FinanceiroDdaEvento = require('./FinanceiroDdaEvento')(sequelize, Sequelize);
db.Unidade = require('./Unidade')(sequelize, Sequelize);
db.Categoria = require('./Categoria')(sequelize, Sequelize);
db.Insumo = require('./Insumo')(sequelize, Sequelize);
db.Apropriacao = require('./Apropriacao')(sequelize, Sequelize);
db.SolicitacaoCompra = require('./SolicitacaoCompra')(sequelize, Sequelize);
db.SolicitacaoCompraItem = require('./SolicitacaoCompraItem')(sequelize, Sequelize);
db.SolicitacaoCompraItemApropriacao = require('./SolicitacaoCompraItemApropriacao')(sequelize, Sequelize);
db.SolicitacaoCompraItemManual = require('./SolicitacaoCompraItemManual')(sequelize, Sequelize);
db.SolicitacaoCompraItemManualApropriacao = require('./SolicitacaoCompraItemManualApropriacao')(sequelize, Sequelize);
db.FornecedorCompra = require('./FornecedorCompra')(sequelize, Sequelize);
db.SolicitacaoCompraFornecedor = require('./SolicitacaoCompraFornecedor')(sequelize, Sequelize);
db.SolicitacaoCompraFornecedorItem = require('./SolicitacaoCompraFornecedorItem')(sequelize, Sequelize);
db.SolicitacaoCompraRespostaItem = require('./SolicitacaoCompraRespostaItem')(sequelize, Sequelize);
db.SolicitacaoCompraAlocacao = require('./SolicitacaoCompraAlocacao')(sequelize, Sequelize);
db.SolicitacaoCompraFechamento = require('./SolicitacaoCompraFechamento')(sequelize, Sequelize);
db.SolicitacaoCompraLog = require('./SolicitacaoCompraLog')(sequelize, Sequelize);
db.PedidoCompra = require('./PedidoCompra')(sequelize, Sequelize);
db.PedidoCompraItem = require('./PedidoCompraItem')(sequelize, Sequelize);
db.PedidoCompraItemLog = require('./PedidoCompraItemLog')(sequelize, Sequelize);
db.PedidoCompraFrete = require('./PedidoCompraFrete')(sequelize, Sequelize);
db.PedidoCompraFreteRateio = require('./PedidoCompraFreteRateio')(sequelize, Sequelize);

/* =====================
   CRM
===================== */
db.CrmConfig = require('./CrmConfig')(sequelize, Sequelize);
db.CrmPipeline = require('./CrmPipeline')(sequelize, Sequelize);
db.CrmPipelineStage = require('./CrmPipelineStage')(sequelize, Sequelize);
db.CrmLossReason = require('./CrmLossReason')(sequelize, Sequelize);
db.CrmLead = require('./CrmLead')(sequelize, Sequelize);
db.CrmAuditLog = require('./CrmAuditLog')(sequelize, Sequelize);
db.CrmInteraction = require('./CrmInteraction')(sequelize, Sequelize);
db.CrmTask = require('./CrmTask')(sequelize, Sequelize);
db.CrmRolloutPhase = require('./CrmRolloutPhase')(sequelize, Sequelize);
db.CrmChannel = require('./CrmChannel')(sequelize, Sequelize);
db.CrmPhoneAsset = require('./CrmPhoneAsset')(sequelize, Sequelize);
db.CrmIntegrationMetaEvent = require('./CrmIntegrationMetaEvent')(sequelize, Sequelize);
db.CrmIntegrationGoogleEvent = require('./CrmIntegrationGoogleEvent')(sequelize, Sequelize);
db.CrmConversation = require('./CrmConversation')(sequelize, Sequelize);
db.CrmMessage = require('./CrmMessage')(sequelize, Sequelize);
db.CrmMessageTemplate = require('./CrmMessageTemplate')(sequelize, Sequelize);
db.CrmConversationParticipant = require('./CrmConversationParticipant')(sequelize, Sequelize);
db.CrmAutomationRule = require('./CrmAutomationRule')(sequelize, Sequelize);
db.CrmAutomationExecution = require('./CrmAutomationExecution')(sequelize, Sequelize);

/* =====================
   FISCAL
===================== */
db.FiscalCompany = require('../modules/fiscal/models/FiscalCompany')(sequelize, Sequelize);
db.FiscalCertificate = require('../modules/fiscal/models/FiscalCertificate')(sequelize, Sequelize);
db.FiscalDfeSyncState = require('../modules/fiscal/models/FiscalDfeSyncState')(sequelize, Sequelize);
db.FiscalDfeDocument = require('../modules/fiscal/models/FiscalDfeDocument')(sequelize, Sequelize);
db.FiscalDfeEvent = require('../modules/fiscal/models/FiscalDfeEvent')(sequelize, Sequelize);
db.FiscalSyncLog = require('../modules/fiscal/models/FiscalSyncLog')(sequelize, Sequelize);
db.FiscalDocumentLink = require('../modules/fiscal/models/FiscalDocumentLink')(sequelize, Sequelize);
db.FiscalDivergence = require('../modules/fiscal/models/FiscalDivergence')(sequelize, Sequelize);
db.FiscalAccountingBatch = require('../modules/fiscal/models/FiscalAccountingBatch')(sequelize, Sequelize);
db.FiscalAccountingBatchItem = require('../modules/fiscal/models/FiscalAccountingBatchItem')(sequelize, Sequelize);

/* =====================
   CUSTOS E RECEBIVEIS
===================== */
db.CrPlanoObra = require('../modules/custosRecebiveis/models/CrPlanoObra')(sequelize, Sequelize);
db.CrPlanoItem = require('../modules/custosRecebiveis/models/CrPlanoItem')(sequelize, Sequelize);
db.CrPlanoMacroVinculo = require('../modules/custosRecebiveis/models/CrPlanoMacroVinculo')(sequelize, Sequelize);
db.CrImportacao = require('../modules/custosRecebiveis/models/CrImportacao')(sequelize, Sequelize);
db.CrCompetencia = require('../modules/custosRecebiveis/models/CrCompetencia')(sequelize, Sequelize);
db.CrPrevisaoCusto = require('../modules/custosRecebiveis/models/CrPrevisaoCusto')(sequelize, Sequelize);
db.CrPrevisaoReceita = require('../modules/custosRecebiveis/models/CrPrevisaoReceita')(sequelize, Sequelize);
db.CrMedicaoConsolidada = require('../modules/custosRecebiveis/models/CrMedicaoConsolidada')(sequelize, Sequelize);
db.CrRealizado = require('../modules/custosRecebiveis/models/CrRealizado')(sequelize, Sequelize);
db.CrResponsavelObra = require('../modules/custosRecebiveis/models/CrResponsavelObra')(sequelize, Sequelize);
db.CrObrigacaoUsuario = require('../modules/custosRecebiveis/models/CrObrigacaoUsuario')(sequelize, Sequelize);
db.CrReabertura = require('../modules/custosRecebiveis/models/CrReabertura')(sequelize, Sequelize);
db.CrGuardBypass = require('../modules/custosRecebiveis/models/CrGuardBypass')(sequelize, Sequelize);
db.CrAuditoria = require('../modules/custosRecebiveis/models/CrAuditoria')(sequelize, Sequelize);

/* =====================
   SST
===================== */
db.SstRisco = require('../modules/sst/models/SstRisco')(sequelize, Sequelize);
db.SstAgenteNocivo = require('../modules/sst/models/SstAgenteNocivo')(sequelize, Sequelize);
db.SstPgr = require('../modules/sst/models/SstPgr')(sequelize, Sequelize);
db.SstLtcat = require('../modules/sst/models/SstLtcat')(sequelize, Sequelize);
db.SstLtcatAvaliacao = require('../modules/sst/models/SstLtcatAvaliacao')(sequelize, Sequelize);
db.SstPcmso = require('../modules/sst/models/SstPcmso')(sequelize, Sequelize);
db.SstAso = require('../modules/sst/models/SstAso')(sequelize, Sequelize);
db.SstExame = require('../modules/sst/models/SstExame')(sequelize, Sequelize);
db.SstEpiEntrega = require('../modules/sst/models/SstEpiEntrega')(sequelize, Sequelize);
db.SstTreinamento = require('../modules/sst/models/SstTreinamento')(sequelize, Sequelize);
db.SstAcidente = require('../modules/sst/models/SstAcidente')(sequelize, Sequelize);
db.SstDocumento = require('../modules/sst/models/SstDocumento')(sequelize, Sequelize);
db.SstAmbienteTrabalho = require('../modules/sst/models/SstAmbienteTrabalho')(sequelize, Sequelize);
db.SstExposicao = require('../modules/sst/models/SstExposicao')(sequelize, Sequelize);
db.SstRegraConformidade = require('../modules/sst/models/SstRegraConformidade')(sequelize, Sequelize);
db.SstPoliticaBloqueio = require('../modules/sst/models/SstPoliticaBloqueio')(sequelize, Sequelize);
db.SstBloqueioOperacional = require('../modules/sst/models/SstBloqueioOperacional')(sequelize, Sequelize);
db.SstNotificacao = require('../modules/sst/models/SstNotificacao')(sequelize, Sequelize);
db.SstPendenciaOperacional = require('../modules/sst/models/SstPendenciaOperacional')(sequelize, Sequelize);
db.SstComplianceScore = require('../modules/sst/models/SstComplianceScore')(sequelize, Sequelize);
db.SstCriticidade = require('../modules/sst/models/SstCriticidade')(sequelize, Sequelize);
db.SstWorkflow = require('../modules/sst/models/SstWorkflow')(sequelize, Sequelize);
db.SstWorkflowExecucao = require('../modules/sst/models/SstWorkflowExecucao')(sequelize, Sequelize);
db.SstWorkflowAcao = require('../modules/sst/models/SstWorkflowAcao')(sequelize, Sequelize);
db.SstWorkflowEvento = require('../modules/sst/models/SstWorkflowEvento')(sequelize, Sequelize);
db.SstRecomendacaoOperacional = require('../modules/sst/models/SstRecomendacaoOperacional')(sequelize, Sequelize);
db.SstDocumentoAnaliseIa = require('../modules/sst/models/SstDocumentoAnaliseIa')(sequelize, Sequelize);
db.SstIaDocumentLog = require('../modules/sst/models/SstIaDocumentLog')(sequelize, Sequelize);
db.SstWorkflowLog = require('../modules/sst/models/SstWorkflowLog')(sequelize, Sequelize);
db.SstAutomationLog = require('../modules/sst/models/SstAutomationLog')(sequelize, Sequelize);
db.SstBlockingLog = require('../modules/sst/models/SstBlockingLog')(sequelize, Sequelize);
db.SstIntegrationLog = require('../modules/sst/models/SstIntegrationLog')(sequelize, Sequelize);
db.SstRolloutPlano = require('../modules/sst/models/SstRolloutPlano')(sequelize, Sequelize);
db.SstTelemetryMetric = require('../modules/sst/models/SstTelemetryMetric')(sequelize, Sequelize);
db.SstOperationalAlert = require('../modules/sst/models/SstOperationalAlert')(sequelize, Sequelize);
db.SstHardeningPolicy = require('../modules/sst/models/SstHardeningPolicy')(sequelize, Sequelize);
db.SstJob = require('../modules/sst/models/SstJob')(sequelize, Sequelize);
db.SstQueueMetric = require('../modules/sst/models/SstQueueMetric')(sequelize, Sequelize);
db.SstPerformanceMetric = require('../modules/sst/models/SstPerformanceMetric')(sequelize, Sequelize);
db.SstCacheEntry = require('../modules/sst/models/SstCacheEntry')(sequelize, Sequelize);
db.SstQualityIssue = require('../modules/sst/models/SstQualityIssue')(sequelize, Sequelize);
db.SstGovernanceLog = require('../modules/sst/models/SstGovernanceLog')(sequelize, Sequelize);
db.SstEventoEsocial = require('../modules/sst/models/SstEventoEsocial')(sequelize, Sequelize);
db.SstEventoOperacional = require('../modules/sst/models/SstEventoOperacional')(sequelize, Sequelize);
db.SstHistorico = require('../modules/sst/models/SstHistorico')(sequelize, Sequelize);

/* =====================
   ESOCIAL
===================== */
db.EsocialLayoutVersion = require('../modules/esocial/models/EsocialLayoutVersion')(sequelize, Sequelize);
db.EsocialLote = require('../modules/esocial/models/EsocialLote')(sequelize, Sequelize);
db.EsocialEvento = require('../modules/esocial/models/EsocialEvento')(sequelize, Sequelize);
db.EsocialRetorno = require('../modules/esocial/models/EsocialRetorno')(sequelize, Sequelize);
db.EsocialTransmissionLog = require('../modules/esocial/models/EsocialTransmissionLog')(sequelize, Sequelize);
db.EsocialCertificateLog = require('../modules/esocial/models/EsocialCertificateLog')(sequelize, Sequelize);
db.EsocialXmlValidationLog = require('../modules/esocial/models/EsocialXmlValidationLog')(sequelize, Sequelize);
db.EsocialSoapLog = require('../modules/esocial/models/EsocialSoapLog')(sequelize, Sequelize);

/* =====================
   GOVERNANCA
===================== */
db.GovernancaSnapshot = require('../modules/governanca/models/GovernancaSnapshot')(sequelize, Sequelize);
db.GovernancaAccessLog = require('../modules/governanca/models/GovernancaAccessLog')(sequelize, Sequelize);
db.GovernancaEventoOperacional = require('../modules/governanca/models/GovernancaEventoOperacional')(sequelize, Sequelize);

const TITULO_FINANCEIRO_SEQUENCE_KEY = 'GLOBAL';

function formatTituloFinanceiroCodigo(numero) {
  return `TIT-${String(numero).padStart(6, '0')}`;
}

async function obterOuCriarSequenciaTituloFinanceiro({ transaction }) {
  let sequencia = await db.TituloFinanceiroSequencia.findOne({
    where: { chave: TITULO_FINANCEIRO_SEQUENCE_KEY },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (sequencia) {
    return sequencia;
  }

  try {
    await db.TituloFinanceiroSequencia.create({
      chave: TITULO_FINANCEIRO_SEQUENCE_KEY,
      ultimo_numero: 0
    }, { transaction });
  } catch (error) {
    // Em corrida de criacao, o select com lock abaixo encontra a linha criada.
  }

  sequencia = await db.TituloFinanceiroSequencia.findOne({
    where: { chave: TITULO_FINANCEIRO_SEQUENCE_KEY },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!sequencia) {
    throw new Error('Nao foi possivel inicializar a sequencia dos titulos financeiros.');
  }

  return sequencia;
}

async function gerarCodigoTituloFinanceiro({ transaction: externalTransaction = null } = {}) {
  const executar = async (transaction) => {
    const sequencia = await obterOuCriarSequenciaTituloFinanceiro({ transaction });
    const proximoNumero = Number(sequencia.ultimo_numero || 0) + 1;
    await sequencia.update({ ultimo_numero: proximoNumero }, { transaction });
    return formatTituloFinanceiroCodigo(proximoNumero);
  };

  if (externalTransaction) {
    return executar(externalTransaction);
  }

  return db.sequelize.transaction(executar);
}

db.TituloFinanceiro.beforeValidate('gerarCodigoTituloFinanceiro', async (titulo, options = {}) => {
  if (String(titulo.codigo || '').trim()) {
    titulo.codigo = String(titulo.codigo).trim().toUpperCase();
    return;
  }

  titulo.codigo = await gerarCodigoTituloFinanceiro({
    transaction: options.transaction || null
  });
});



/* =====================
   RELACIONAMENTOS
===================== */

/* ===== Solicitação x Comprovantes ===== */
db.Solicitacao.hasMany(db.Comprovante, {
  foreignKey: 'solicitacao_id',
  as: 'comprovantes'
});

db.Comprovante.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.Comprovante.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});
/* ===== Usuário x Obra (Vínculos) ===== */
db.User.hasMany(db.UsuarioObra, {
  foreignKey: 'user_id',
  as: 'vinculos'
});

db.UsuarioObra.belongsTo(db.User, {
  foreignKey: 'user_id',
  as: 'usuario'
});

db.Obra.hasMany(db.UsuarioObra, {
  foreignKey: 'obra_id',
  as: 'usuarios'
});

db.UsuarioObra.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.User.hasMany(db.UsuarioSetor, {
  foreignKey: 'user_id',
  as: 'setoresVinculos'
});

db.UsuarioSetor.belongsTo(db.User, {
  foreignKey: 'user_id',
  as: 'usuario'
});

db.Setor.hasMany(db.UsuarioSetor, {
  foreignKey: 'setor_id',
  as: 'usuariosVinculos'
});

db.UsuarioSetor.belongsTo(db.Setor, {
  foreignKey: 'setor_id',
  as: 'setor'
});

/* ===== Obra x Solicitação ===== */
db.Obra.hasMany(db.Solicitacao, {
  foreignKey: 'obra_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Apropriacao.hasMany(db.Solicitacao, {
  foreignKey: 'apropriacao_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.Parceiro.hasMany(db.Solicitacao, {
  foreignKey: 'parceiro_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.Parceiro.belongsToMany(db.ParceiroCategoria, {
  through: db.ParceiroCategoriaItem,
  foreignKey: 'parceiro_id',
  otherKey: 'parceiro_categoria_id',
  uniqueKey: 'ux_parceiro_categoria_itens',
  as: 'categorias'
});

db.ParceiroCategoria.belongsToMany(db.Parceiro, {
  through: db.ParceiroCategoriaItem,
  foreignKey: 'parceiro_categoria_id',
  otherKey: 'parceiro_id',
  uniqueKey: 'ux_parceiro_categoria_itens',
  as: 'parceiros'
});

db.Parceiro.belongsTo(db.Parceiro, {
  foreignKey: 'conjuge_parceiro_id',
  as: 'conjuge'
});

db.Parceiro.hasMany(db.Parceiro, {
  foreignKey: 'conjuge_parceiro_id',
  as: 'parceirosVinculadosComoConjuge'
});

db.ParceiroCategoriaItem.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.ParceiroCategoriaItem.belongsTo(db.ParceiroCategoria, {
  foreignKey: 'parceiro_categoria_id',
  as: 'categoria'
});

/* ===== Usuário x Solicitação ===== */
db.User.hasMany(db.Solicitacao, {
  foreignKey: 'criado_por',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criador'
});

db.Solicitacao.hasMany(db.SolicitacaoPagamento, {
  foreignKey: 'solicitacao_id',
  as: 'pagamentos'
});

db.SolicitacaoPagamento.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.User.hasMany(db.SolicitacaoPagamento, {
  foreignKey: 'created_by',
  as: 'pagamentosSolicitacoesCriados'
});

db.SolicitacaoPagamento.belongsTo(db.User, {
  foreignKey: 'created_by',
  as: 'criadoPor'
});

db.PrioridadeLote.hasMany(db.PrioridadeLoteItem, {
  foreignKey: 'lote_id',
  as: 'itens',
  onDelete: 'RESTRICT'
});

db.PrioridadeLoteItem.belongsTo(db.PrioridadeLote, {
  foreignKey: 'lote_id',
  as: 'lote'
});

db.Solicitacao.hasMany(db.PrioridadeLoteItem, {
  foreignKey: 'solicitacao_id',
  as: 'itensPrioridadeDiretoria'
});

db.PrioridadeLoteItem.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.TituloFinanceiro.hasMany(db.PrioridadeLoteItem, {
  foreignKey: 'titulo_financeiro_id',
  as: 'itensPrioridadeDiretoria'
});

db.PrioridadeLoteItem.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'titulo'
});

db.User.hasMany(db.PrioridadeLote, {
  foreignKey: 'solicitado_por',
  as: 'prioridadeLotesSolicitados'
});

db.PrioridadeLote.belongsTo(db.User, {
  foreignKey: 'solicitado_por',
  as: 'solicitadoPor'
});

db.User.hasMany(db.PrioridadeLote, {
  foreignKey: 'finalizado_por',
  as: 'prioridadeLotesFinalizados'
});

db.PrioridadeLote.belongsTo(db.User, {
  foreignKey: 'finalizado_por',
  as: 'finalizadoPor'
});

db.User.hasMany(db.PrioridadeLoteItem, {
  foreignKey: 'autorizado_por',
  as: 'prioridadeItensAutorizados'
});

db.PrioridadeLoteItem.belongsTo(db.User, {
  foreignKey: 'autorizado_por',
  as: 'autorizadoPor'
});

/* ===== Solicitação x Status / Histórico / Anexos / Mensagens ===== */
db.Solicitacao.hasMany(db.StatusArea, {
  foreignKey: 'solicitacao_id',
  as: 'statusAreas'
});

db.StatusArea.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.Solicitacao.hasMany(db.Historico, {
  foreignKey: 'solicitacao_id',
  as: 'historicos'
});

db.Historico.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.Solicitacao.hasMany(db.Anexo, {
  foreignKey: 'solicitacao_id',
  as: 'anexos'
});

db.Anexo.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.Solicitacao.hasMany(db.MensagemSetor, {
  foreignKey: 'solicitacao_id',
  as: 'mensagens'
});

db.MensagemSetor.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

/* ===== Usuário x Cargo ===== */
db.Cargo.hasMany(db.User, {
  foreignKey: 'cargo_id',
  as: 'usuarios'
});

db.User.belongsTo(db.Cargo, {
  foreignKey: 'cargo_id',
  as: 'cargoInfo'
});

/**
 * Tipo Solicitação
 */
db.TipoSolicitacao.hasMany(db.Solicitacao, {
  foreignKey: 'tipo_solicitacao_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.TipoSolicitacao, {
  foreignKey: 'tipo_solicitacao_id',
  as: 'tipo'
});

db.TipoSolicitacao.hasMany(db.Solicitacao, {
  foreignKey: 'tipo_macro_id',
  as: 'solicitacoesMacro'
});

db.Solicitacao.belongsTo(db.TipoSolicitacao, {
  foreignKey: 'tipo_macro_id',
  as: 'tipoMacroSolicitacao'
});

db.TipoSubContrato.hasMany(db.Solicitacao, {
  foreignKey: 'tipo_sub_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.TipoSubContrato, {
  foreignKey: 'tipo_sub_id',
  as: 'tipoSubSolicitacao'
});

// =====================
// CONTRATOS
// =====================
db.Obra.hasMany(db.Contrato, {
  foreignKey: 'obra_id',
  as: 'contratos'
});

db.Contrato.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.TipoSolicitacao.hasMany(db.TipoSubContrato, {
  foreignKey: 'tipo_macro_id',
  as: 'subtipos'
});

db.TipoSubContrato.belongsTo(db.TipoSolicitacao, {
  foreignKey: 'tipo_macro_id',
  as: 'macro'
});

db.TipoSolicitacao.hasMany(db.Contrato, {
  foreignKey: 'tipo_macro_id',
  as: 'contratos'
});

db.Contrato.belongsTo(db.TipoSolicitacao, {
  foreignKey: 'tipo_macro_id',
  as: 'tipoMacro'
});

db.TipoSubContrato.hasMany(db.Contrato, {
  foreignKey: 'tipo_sub_id',
  as: 'contratos'
});

db.Contrato.belongsTo(db.TipoSubContrato, {
  foreignKey: 'tipo_sub_id',
  as: 'tipoSub'
});

db.Contrato.hasMany(db.Solicitacao, {
  foreignKey: 'contrato_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.Contrato, {
  foreignKey: 'contrato_id',
  as: 'contrato'
});

db.Contrato.hasMany(db.ContratoAnexo, {
  foreignKey: 'contrato_id',
  as: 'anexos'
});

db.ContratoAnexo.belongsTo(db.Contrato, {
  foreignKey: 'contrato_id',
  as: 'contrato'
});

db.Contrato.hasMany(db.ContratoApropriacao, {
  foreignKey: 'contrato_id',
  as: 'apropriacoes',
  onDelete: 'CASCADE'
});

db.ContratoApropriacao.belongsTo(db.Contrato, {
  foreignKey: 'contrato_id',
  as: 'contrato'
});

db.ContratoApropriacao.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.Apropriacao.hasMany(db.ContratoApropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'contratosVinculados'
});

db.Contrato.hasMany(db.ContratoCredor, {
  foreignKey: 'contrato_id',
  as: 'credoresVinculos',
  onDelete: 'CASCADE'
});

db.ContratoCredor.belongsTo(db.Contrato, {
  foreignKey: 'contrato_id',
  as: 'contrato'
});

db.ContratoCredor.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'credor'
});

db.Parceiro.hasMany(db.ContratoCredor, {
  foreignKey: 'parceiro_id',
  as: 'contratosCredorVinculos'
});

db.Contrato.belongsToMany(db.Parceiro, {
  through: db.ContratoCredor,
  foreignKey: 'contrato_id',
  otherKey: 'parceiro_id',
  as: 'credores'
});

db.Parceiro.belongsToMany(db.Contrato, {
  through: db.ContratoCredor,
  foreignKey: 'parceiro_id',
  otherKey: 'contrato_id',
  as: 'contratosComoCredor'
});

db.Solicitacao.hasMany(db.SolicitacaoApropriacao, {
  foreignKey: 'solicitacao_id',
  as: 'apropriacoes',
  onDelete: 'CASCADE'
});

db.SolicitacaoApropriacao.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.SolicitacaoApropriacao.belongsTo(db.Contrato, {
  foreignKey: 'contrato_id',
  as: 'contrato'
});

db.SolicitacaoApropriacao.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.Obra.hasMany(db.Empreendimento, {
  foreignKey: 'obra_id',
  as: 'empreendimentos'
});

db.Empreendimento.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Empreendimento.hasMany(db.UnidadeComercial, {
  foreignKey: 'empreendimento_id',
  as: 'unidadesComerciais'
});

db.UnidadeComercial.belongsTo(db.Empreendimento, {
  foreignKey: 'empreendimento_id',
  as: 'empreendimento'
});

db.Parceiro.hasMany(db.UnidadeComercial, {
  foreignKey: 'parceiro_reserva_id',
  as: 'unidadesReservadas'
});

db.UnidadeComercial.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_reserva_id',
  as: 'parceiroReserva'
});

db.Empreendimento.hasMany(db.TabelaPrecoComercial, {
  foreignKey: 'empreendimento_id',
  as: 'tabelasPreco'
});

db.TabelaPrecoComercial.belongsTo(db.Empreendimento, {
  foreignKey: 'empreendimento_id',
  as: 'empreendimento'
});

db.User.hasMany(db.TabelaPrecoComercial, {
  foreignKey: 'criado_por',
  as: 'tabelasPrecoCriadas'
});

db.TabelaPrecoComercial.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.TabelaPrecoComercial, {
  foreignKey: 'atualizado_por',
  as: 'tabelasPrecoAtualizadas'
});

db.TabelaPrecoComercial.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.TabelaPrecoComercial.hasMany(db.TabelaPrecoComercialItem, {
  foreignKey: 'tabela_preco_comercial_id',
  as: 'itens',
  onDelete: 'CASCADE'
});

db.TabelaPrecoComercialItem.belongsTo(db.TabelaPrecoComercial, {
  foreignKey: 'tabela_preco_comercial_id',
  as: 'tabelaPreco'
});

db.UnidadeComercial.hasMany(db.TabelaPrecoComercialItem, {
  foreignKey: 'unidade_comercial_id',
  as: 'itensTabelaPreco'
});

db.TabelaPrecoComercialItem.belongsTo(db.UnidadeComercial, {
  foreignKey: 'unidade_comercial_id',
  as: 'unidadeComercial'
});

db.Empreendimento.hasMany(db.ContratoComercial, {
  foreignKey: 'empreendimento_id',
  as: 'contratosComerciais'
});

db.ContratoComercial.belongsTo(db.Empreendimento, {
  foreignKey: 'empreendimento_id',
  as: 'empreendimento'
});

db.UnidadeComercial.hasMany(db.ContratoComercial, {
  foreignKey: 'unidade_comercial_id',
  as: 'contratosComerciais'
});

db.ContratoComercial.belongsTo(db.UnidadeComercial, {
  foreignKey: 'unidade_comercial_id',
  as: 'unidadeComercial'
});

db.ContratoComercial.hasMany(db.ContratoComercialUnidade, {
  foreignKey: 'contrato_comercial_id',
  as: 'unidadesContrato',
  onDelete: 'CASCADE'
});

db.ContratoComercialUnidade.belongsTo(db.ContratoComercial, {
  foreignKey: 'contrato_comercial_id',
  as: 'contrato'
});

db.UnidadeComercial.hasMany(db.ContratoComercialUnidade, {
  foreignKey: 'unidade_comercial_id',
  as: 'vinculosContratosComerciais'
});

db.ContratoComercialUnidade.belongsTo(db.UnidadeComercial, {
  foreignKey: 'unidade_comercial_id',
  as: 'unidadeComercial'
});

db.User.hasMany(db.ContratoComercialUnidade, {
  foreignKey: 'confirmado_por',
  as: 'unidadesContratosComerciaisConfirmadas'
});

db.ContratoComercialUnidade.belongsTo(db.User, {
  foreignKey: 'confirmado_por',
  as: 'confirmadoPor'
});

db.Parceiro.hasMany(db.ContratoComercial, {
  foreignKey: 'parceiro_id',
  as: 'contratosComerciais'
});

db.ContratoComercial.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'cliente'
});

db.ContratoComercial.hasMany(db.ContratoComercialComprador, {
  foreignKey: 'contrato_comercial_id',
  as: 'compradoresContrato',
  onDelete: 'CASCADE'
});

db.ContratoComercialComprador.belongsTo(db.ContratoComercial, {
  foreignKey: 'contrato_comercial_id',
  as: 'contrato'
});

db.Parceiro.hasMany(db.ContratoComercialComprador, {
  foreignKey: 'parceiro_id',
  as: 'contratosComerciaisComoComprador'
});

db.ContratoComercialComprador.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.Parceiro.hasMany(db.ContratoComercial, {
  foreignKey: 'corretor_parceiro_id',
  as: 'contratosComerciaisCorretor'
});

db.ContratoComercial.belongsTo(db.Parceiro, {
  foreignKey: 'corretor_parceiro_id',
  as: 'corretorParceiro'
});

db.Obra.hasMany(db.ContratoComercial, {
  foreignKey: 'obra_id',
  as: 'contratosComerciais'
});

db.ContratoComercial.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.CategoriaFinanceira.hasMany(db.ContratoComercial, {
  foreignKey: 'categoria_financeira_id',
  as: 'contratosComerciais'
});

db.ContratoComercial.belongsTo(db.CategoriaFinanceira, {
  foreignKey: 'categoria_financeira_id',
  as: 'categoriaFinanceira'
});

db.CategoriaFinanceira.hasMany(db.ContratoComercial, {
  foreignKey: 'categoria_financeira_comissao_id',
  as: 'contratosComerciaisComissao'
});

db.ContratoComercial.belongsTo(db.CategoriaFinanceira, {
  foreignKey: 'categoria_financeira_comissao_id',
  as: 'categoriaFinanceiraComissao'
});

db.User.hasMany(db.ContratoComercial, {
  foreignKey: 'criado_por',
  as: 'contratosComerciaisCriados'
});

db.ContratoComercial.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.ContratoComercial, {
  foreignKey: 'atualizado_por',
  as: 'contratosComerciaisAtualizados'
});

db.ContratoComercial.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.ContratoComercial.hasMany(db.ContratoComercialParcela, {
  foreignKey: 'contrato_comercial_id',
  as: 'parcelas',
  onDelete: 'CASCADE'
});

db.ContratoComercialParcela.belongsTo(db.ContratoComercial, {
  foreignKey: 'contrato_comercial_id',
  as: 'contrato'
});

db.TituloFinanceiro.hasMany(db.ContratoComercialParcela, {
  foreignKey: 'titulo_financeiro_id',
  as: 'parcelasComerciais'
});

db.ContratoComercialParcela.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.ContratoComercial.hasMany(db.ContratoComercialEvento, {
  foreignKey: 'contrato_comercial_id',
  as: 'eventos',
  onDelete: 'CASCADE'
});

db.ContratoComercialEvento.belongsTo(db.ContratoComercial, {
  foreignKey: 'contrato_comercial_id',
  as: 'contrato'
});

db.User.hasMany(db.ContratoComercialEvento, {
  foreignKey: 'criado_por',
  as: 'eventosContratosComerciais'
});

db.ContratoComercialEvento.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.Empreendimento.hasMany(db.ContratoComercialModelo, {
  foreignKey: 'empreendimento_id',
  as: 'modelosContratosComerciais',
  onDelete: 'CASCADE'
});

db.ContratoComercialModelo.belongsTo(db.Empreendimento, {
  foreignKey: 'empreendimento_id',
  as: 'empreendimento'
});

db.User.hasMany(db.ContratoComercialModelo, {
  foreignKey: 'criado_por',
  as: 'modelosContratosComerciaisCriados'
});

db.ContratoComercialModelo.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.ContratoComercialModelo, {
  foreignKey: 'atualizado_por',
  as: 'modelosContratosComerciaisAtualizados'
});

db.ContratoComercialModelo.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.ContratoComercial.hasMany(db.ContratoComercialDocumento, {
  foreignKey: 'contrato_comercial_id',
  as: 'documentos',
  onDelete: 'CASCADE'
});

db.ContratoComercialDocumento.belongsTo(db.ContratoComercial, {
  foreignKey: 'contrato_comercial_id',
  as: 'contrato'
});

db.ContratoComercialModelo.hasMany(db.ContratoComercialDocumento, {
  foreignKey: 'modelo_id',
  as: 'documentosGerados'
});

db.ContratoComercialDocumento.belongsTo(db.ContratoComercialModelo, {
  foreignKey: 'modelo_id',
  as: 'modelo'
});

db.User.hasMany(db.ContratoComercialDocumento, {
  foreignKey: 'criado_por',
  as: 'documentosContratosComerciaisCriados'
});

db.ContratoComercialDocumento.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.ContratoComercialDocumento, {
  foreignKey: 'atualizado_por',
  as: 'documentosContratosComerciaisAtualizados'
});

db.ContratoComercialDocumento.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.ComercialContratoImportacao.hasMany(db.ComercialContratoImportacaoLinha, {
  foreignKey: 'importacao_id',
  as: 'linhas',
  onDelete: 'CASCADE'
});

db.ComercialContratoImportacaoLinha.belongsTo(db.ComercialContratoImportacao, {
  foreignKey: 'importacao_id',
  as: 'importacao'
});

db.ComercialContratoImportacao.hasMany(db.ComercialContratoImportacaoResultado, {
  foreignKey: 'importacao_id',
  as: 'resultados',
  onDelete: 'CASCADE'
});

db.ComercialContratoImportacaoResultado.belongsTo(db.ComercialContratoImportacao, {
  foreignKey: 'importacao_id',
  as: 'importacao'
});

db.ContratoComercial.hasMany(db.ComercialContratoImportacaoResultado, {
  foreignKey: 'contrato_comercial_id',
  as: 'resultadosImportacao'
});

db.ComercialContratoImportacaoResultado.belongsTo(db.ContratoComercial, {
  foreignKey: 'contrato_comercial_id',
  as: 'contrato'
});

db.ProvisaoCategoriaMacro.hasMany(db.ProvisaoFinanceira, {
  foreignKey: 'categoria_macro_id',
  as: 'provisoes'
});

db.ProvisaoFinanceira.belongsTo(db.ProvisaoCategoriaMacro, {
  foreignKey: 'categoria_macro_id',
  as: 'categoriaMacro'
});

db.Obra.hasMany(db.ProvisaoFinanceira, {
  foreignKey: 'obra_id',
  as: 'provisoesFinanceiras'
});

db.ProvisaoFinanceira.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Parceiro.hasMany(db.ProvisaoFinanceira, {
  foreignKey: 'fornecedor_id',
  as: 'provisoesFinanceirasFornecedor'
});

db.ProvisaoFinanceira.belongsTo(db.Parceiro, {
  foreignKey: 'fornecedor_id',
  as: 'fornecedor'
});

db.User.hasMany(db.ProvisaoFinanceira, {
  foreignKey: 'usuario_criacao_id',
  as: 'provisoesFinanceirasCriadas'
});

db.ProvisaoFinanceira.belongsTo(db.User, {
  foreignKey: 'usuario_criacao_id',
  as: 'usuarioCriacao'
});

db.User.hasMany(db.ProvisaoFinanceira, {
  foreignKey: 'usuario_atualizacao_id',
  as: 'provisoesFinanceirasAtualizadas'
});

db.ProvisaoFinanceira.belongsTo(db.User, {
  foreignKey: 'usuario_atualizacao_id',
  as: 'usuarioAtualizacao'
});

db.User.hasMany(db.ProvisaoFinanceira, {
  foreignKey: 'aprovado_por_id',
  as: 'provisoesFinanceirasAprovadas'
});

db.ProvisaoFinanceira.belongsTo(db.User, {
  foreignKey: 'aprovado_por_id',
  as: 'aprovadoPor'
});

db.User.hasMany(db.ProvisaoFinanceira, {
  foreignKey: 'cancelado_por_id',
  as: 'provisoesFinanceirasCanceladas'
});

db.ProvisaoFinanceira.belongsTo(db.User, {
  foreignKey: 'cancelado_por_id',
  as: 'canceladoPor'
});

db.ProvisaoFinanceira.hasMany(db.ProvisaoFinanceiraHistorico, {
  foreignKey: 'provisao_financeira_id',
  as: 'historicos',
  onDelete: 'CASCADE'
});

db.ProvisaoFinanceiraHistorico.belongsTo(db.ProvisaoFinanceira, {
  foreignKey: 'provisao_financeira_id',
  as: 'provisao'
});

db.User.hasMany(db.ProvisaoFinanceiraHistorico, {
  foreignKey: 'usuario_id',
  as: 'historicosProvisionamento'
});

db.ProvisaoFinanceiraHistorico.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});

db.ProvisaoFinanceira.hasMany(db.ProvisaoFinanceiraAnexo, {
  foreignKey: 'provisao_financeira_id',
  as: 'anexos',
  onDelete: 'CASCADE'
});

db.ProvisaoFinanceiraAnexo.belongsTo(db.ProvisaoFinanceira, {
  foreignKey: 'provisao_financeira_id',
  as: 'provisao'
});

db.User.hasMany(db.ProvisaoFinanceiraAnexo, {
  foreignKey: 'uploaded_by',
  as: 'anexosProvisionamentoEnviados'
});

db.ProvisaoFinanceiraAnexo.belongsTo(db.User, {
  foreignKey: 'uploaded_by',
  as: 'uploadUser'
});

db.Obra.hasOne(db.ProvisaoFinanceiraSequencia, {
  foreignKey: 'obra_id',
  as: 'sequenciaProvisionamento'
});

db.ProvisaoFinanceiraSequencia.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Solicitacao.hasMany(db.SolicitacaoProvisao, {
  foreignKey: 'solicitacao_id',
  as: 'provisoesVinculadas'
});

db.SolicitacaoProvisao.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.ProvisaoFinanceira.hasMany(db.SolicitacaoProvisao, {
  foreignKey: 'provisao_financeira_id',
  as: 'solicitacoesVinculadas'
});

db.SolicitacaoProvisao.belongsTo(db.ProvisaoFinanceira, {
  foreignKey: 'provisao_financeira_id',
  as: 'provisao'
});

db.User.hasMany(db.SolicitacaoProvisao, {
  foreignKey: 'usuario_vinculo_id',
  as: 'vinculosSolicitacaoProvisao'
});

db.SolicitacaoProvisao.belongsTo(db.User, {
  foreignKey: 'usuario_vinculo_id',
  as: 'usuarioVinculo'
});

db.TituloFinanceiro.hasMany(db.ContratoComercial, {
  foreignKey: 'titulo_financeiro_comissao_id',
  as: 'contratosComissao'
});

db.ContratoComercial.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_comissao_id',
  as: 'tituloFinanceiroComissao'
});

db.EmpresaGrupo.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'holding_id',
  as: 'holding'
});

db.EmpresaGrupo.hasMany(db.EmpresaGrupo, {
  foreignKey: 'holding_id',
  as: 'empresasControladas'
});

db.RhEmpresaGrupo.hasMany(db.RhColaborador, {
  foreignKey: 'empresa_grupo_id',
  as: 'colaboradores'
});

db.RhColaborador.belongsTo(db.RhEmpresaGrupo, {
  foreignKey: 'empresa_grupo_id',
  as: 'empresaGrupo'
});

db.Obra.hasMany(db.RhColaborador, {
  foreignKey: 'obra_id',
  as: 'rhColaboradores'
});

db.RhColaborador.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Setor.hasMany(db.RhColaborador, {
  foreignKey: 'setor_id',
  as: 'rhColaboradores'
});

db.RhColaborador.belongsTo(db.Setor, {
  foreignKey: 'setor_id',
  as: 'setor'
});

db.Parceiro.hasMany(db.RhColaborador, {
  foreignKey: 'parceiro_id',
  as: 'rhColaboradores'
});

db.RhColaborador.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.RhColaborador.hasOne(db.RhColaboradorPagamento, {
  foreignKey: 'colaborador_id',
  as: 'pagamento',
  onDelete: 'CASCADE'
});

db.RhColaboradorPagamento.belongsTo(db.RhColaborador, {
  foreignKey: 'colaborador_id',
  as: 'colaborador'
});

db.RhDocumentoTipo.hasMany(db.RhDocumento, {
  foreignKey: 'documento_tipo_id',
  as: 'documentos'
});

db.RhDocumento.belongsTo(db.RhDocumentoTipo, {
  foreignKey: 'documento_tipo_id',
  as: 'tipoDocumento'
});

db.RhColaborador.hasMany(db.RhDocumento, {
  foreignKey: 'colaborador_id',
  as: 'documentos'
});

db.RhDocumento.belongsTo(db.RhColaborador, {
  foreignKey: 'colaborador_id',
  as: 'colaborador'
});

db.RhDocumento.hasMany(db.RhDocumento, {
  foreignKey: 'documento_anterior_id',
  as: 'substituicoes'
});

db.RhDocumento.belongsTo(db.RhDocumento, {
  foreignKey: 'documento_anterior_id',
  as: 'documentoAnterior'
});

db.User.hasMany(db.RhDocumento, {
  foreignKey: 'criado_por',
  as: 'rhDocumentosCriados'
});

db.RhDocumento.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.RhDocumento, {
  foreignKey: 'atualizado_por',
  as: 'rhDocumentosAtualizados'
});

db.RhDocumento.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.RhEmpresaGrupo.hasMany(db.RhImportacao, {
  foreignKey: 'empresa_grupo_id',
  as: 'importacoesRh'
});

db.RhImportacao.belongsTo(db.RhEmpresaGrupo, {
  foreignKey: 'empresa_grupo_id',
  as: 'empresaGrupo'
});

db.Obra.hasMany(db.RhImportacao, {
  foreignKey: 'obra_id',
  as: 'importacoesRh'
});

db.RhImportacao.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.User.hasMany(db.RhImportacao, {
  foreignKey: 'criado_por',
  as: 'importacoesRhCriadas'
});

db.RhImportacao.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.RhImportacao, {
  foreignKey: 'confirmado_por',
  as: 'importacoesRhConfirmadas'
});

db.RhImportacao.belongsTo(db.User, {
  foreignKey: 'confirmado_por',
  as: 'confirmadoPor'
});

db.RhImportacao.hasMany(db.RhImportacaoLinha, {
  foreignKey: 'importacao_id',
  as: 'linhas',
  onDelete: 'CASCADE'
});

db.RhImportacaoLinha.belongsTo(db.RhImportacao, {
  foreignKey: 'importacao_id',
  as: 'importacao'
});

db.RhColaborador.hasMany(db.RhImportacaoLinha, {
  foreignKey: 'colaborador_id',
  as: 'linhasImportacaoRh'
});

db.RhImportacaoLinha.belongsTo(db.RhColaborador, {
  foreignKey: 'colaborador_id',
  as: 'colaborador'
});

db.RhEmpresaGrupo.hasMany(db.RhApuracao, {
  foreignKey: 'empresa_grupo_id',
  as: 'apuracoesRh'
});

db.RhApuracao.belongsTo(db.RhEmpresaGrupo, {
  foreignKey: 'empresa_grupo_id',
  as: 'empresaGrupo'
});

db.Obra.hasMany(db.RhApuracao, {
  foreignKey: 'obra_id',
  as: 'apuracoesRh'
});

db.RhApuracao.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.User.hasMany(db.RhApuracao, {
  foreignKey: 'criado_por',
  as: 'apuracoesRhCriadas'
});

db.RhApuracao.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.RhApuracao, {
  foreignKey: 'atualizado_por',
  as: 'apuracoesRhAtualizadas'
});

db.RhApuracao.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.RhApuracao.hasMany(db.RhApuracaoEvento, {
  foreignKey: 'apuracao_id',
  as: 'itens',
  onDelete: 'CASCADE'
});

db.RhApuracaoEvento.belongsTo(db.RhApuracao, {
  foreignKey: 'apuracao_id',
  as: 'apuracao'
});

db.RhColaborador.hasMany(db.RhApuracaoEvento, {
  foreignKey: 'colaborador_id',
  as: 'itensApuracaoRh'
});

db.RhApuracaoEvento.belongsTo(db.RhColaborador, {
  foreignKey: 'colaborador_id',
  as: 'colaborador'
});

db.User.hasMany(db.RhApuracaoEvento, {
  foreignKey: 'ajustado_por',
  as: 'itensApuracaoRhAjustados'
});

db.RhApuracaoEvento.belongsTo(db.User, {
  foreignKey: 'ajustado_por',
  as: 'ajustadoPor'
});

db.RhApuracao.hasOne(db.RhFechamento, {
  foreignKey: 'apuracao_id',
  as: 'fechamentoRh'
});

db.RhFechamento.belongsTo(db.RhApuracao, {
  foreignKey: 'apuracao_id',
  as: 'apuracao'
});

db.CategoriaFinanceira.hasMany(db.RhFechamento, {
  foreignKey: 'categoria_financeira_id',
  as: 'fechamentosRh'
});

db.RhFechamento.belongsTo(db.CategoriaFinanceira, {
  foreignKey: 'categoria_financeira_id',
  as: 'categoriaFinanceira'
});

db.User.hasMany(db.RhFechamento, {
  foreignKey: 'criado_por',
  as: 'fechamentosRhCriados'
});

db.RhFechamento.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.RhFechamento, {
  foreignKey: 'atualizado_por',
  as: 'fechamentosRhAtualizados'
});

db.RhFechamento.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.RhFechamento.hasMany(db.RhFechamentoTitulo, {
  foreignKey: 'fechamento_id',
  as: 'titulos',
  onDelete: 'CASCADE'
});

db.RhFechamentoTitulo.belongsTo(db.RhFechamento, {
  foreignKey: 'fechamento_id',
  as: 'fechamento'
});

db.RhApuracaoEvento.hasOne(db.RhFechamentoTitulo, {
  foreignKey: 'apuracao_evento_id',
  as: 'fechamentoTituloRh'
});

db.RhFechamentoTitulo.belongsTo(db.RhApuracaoEvento, {
  foreignKey: 'apuracao_evento_id',
  as: 'itemApuracao'
});

db.TituloFinanceiro.hasOne(db.RhFechamentoTitulo, {
  foreignKey: 'titulo_financeiro_id',
  as: 'fechamentoRh'
});

db.RhFechamentoTitulo.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.Parceiro.hasMany(db.RhFechamentoTitulo, {
  foreignKey: 'parceiro_id',
  as: 'fechamentosRh'
});

db.RhFechamentoTitulo.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.User.hasMany(db.IntegracaoSiengeConfig, {
  foreignKey: 'criado_por',
  as: 'integracoesSiengeConfigCriadas'
});

db.IntegracaoSiengeConfig.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.IntegracaoSiengeConfig, {
  foreignKey: 'atualizado_por',
  as: 'integracoesSiengeConfigAtualizadas'
});

db.IntegracaoSiengeConfig.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.TituloFinanceiro.hasOne(db.IntegracaoSiengeFila, {
  foreignKey: 'titulo_financeiro_id',
  as: 'integracaoSienge'
});

db.IntegracaoSiengeFila.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.User.hasMany(db.IntegracaoSiengeFila, {
  foreignKey: 'criado_por',
  as: 'integracoesSiengeFilaCriadas'
});

db.IntegracaoSiengeFila.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.IntegracaoSiengeFila, {
  foreignKey: 'atualizado_por',
  as: 'integracoesSiengeFilaAtualizadas'
});

db.IntegracaoSiengeFila.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.IntegracaoSiengeFila.hasMany(db.IntegracaoSiengeLog, {
  foreignKey: 'fila_id',
  as: 'logs',
  onDelete: 'CASCADE'
});

db.IntegracaoSiengeLog.belongsTo(db.IntegracaoSiengeFila, {
  foreignKey: 'fila_id',
  as: 'fila'
});

db.User.hasMany(db.IntegracaoSiengeLog, {
  foreignKey: 'criado_por',
  as: 'integracoesSiengeLogsCriados'
});

db.IntegracaoSiengeLog.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.IntegracaoSiengeMapeamento, {
  foreignKey: 'criado_por',
  as: 'integracoesSiengeMapeamentosCriados'
});

db.IntegracaoSiengeMapeamento.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.IntegracaoSiengeMapeamento, {
  foreignKey: 'atualizado_por',
  as: 'integracoesSiengeMapeamentosAtualizados'
});

db.IntegracaoSiengeMapeamento.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.User.hasMany(db.ArquivoModelo, {
  foreignKey: 'criado_por_id',
  as: 'arquivosModelos'
});

db.ArquivoModelo.belongsTo(db.User, {
  foreignKey: 'criado_por_id',
  as: 'criadoPor'
});

db.User.hasMany(db.SecurityEventLog, {
  foreignKey: 'usuario_id',
  as: 'eventosSeguranca'
});

db.SecurityEventLog.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});


// =====================
// USUÁRIO x SETOR
// =====================
db.Setor.hasMany(db.User, {
  foreignKey: 'setor_id',
  as: 'usuarios'
});

db.User.belongsTo(db.Setor, {
  foreignKey: 'setor_id',
  as: 'setor' // ⚠️ ESTE alias será usado no include
});

// =====================
// HISTORICO x USUARIO
// =====================
db.User.hasMany(db.Historico, {
  foreignKey: 'usuario_responsavel_id',
  as: 'historicos'
});

db.Historico.belongsTo(db.User, {
  foreignKey: 'usuario_responsavel_id',
  as: 'usuario'
});

db.User.hasMany(db.Historico, {
  foreignKey: 'usuario_responsavel_id',
  as: 'historicosResponsavel'
});


// VISIBILIDADE DE SOLICITAÇÃO PARA USUÁRIOS

db.User.hasMany(db.SolicitacaoVisibilidadeUsuario, {
  foreignKey: 'usuario_id',
  as: 'visibilidades',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

db.SolicitacaoVisibilidadeUsuario.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

db.Solicitacao.hasMany(db.SolicitacaoVisibilidadeUsuario, {
  foreignKey: 'solicitacao_id',
  as: 'visibilidades',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

db.SolicitacaoVisibilidadeUsuario.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

// =====================
// NOTIFICACOES
// =====================
db.Notificacao.hasMany(db.NotificacaoDestinatario, {
  foreignKey: 'notificacao_id',
  as: 'destinatarios'
});

db.NotificacaoDestinatario.belongsTo(db.Notificacao, {
  foreignKey: 'notificacao_id',
  as: 'notificacao'
});

db.User.hasMany(db.NotificacaoDestinatario, {
  foreignKey: 'usuario_id',
  as: 'notificacoes'
});

db.NotificacaoDestinatario.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});

// =====================
// CONVERSAS INTERNAS
// =====================
db.User.hasMany(db.ConversaInterna, {
  foreignKey: 'criado_por_id',
  as: 'conversasCriadas'
});

db.ConversaInterna.belongsTo(db.User, {
  foreignKey: 'criado_por_id',
  as: 'criador'
});

db.User.hasMany(db.ConversaInterna, {
  foreignKey: 'destinatario_id',
  as: 'conversasRecebidas'
});

db.ConversaInterna.belongsTo(db.User, {
  foreignKey: 'destinatario_id',
  as: 'destinatario'
});

db.User.hasMany(db.ConversaInterna, {
  foreignKey: 'concluida_por_id',
  as: 'conversasConcluidas'
});

db.ConversaInterna.belongsTo(db.User, {
  foreignKey: 'concluida_por_id',
  as: 'concluidaPor'
});

db.ConversaInterna.belongsTo(db.Setor, {
  foreignKey: 'setor_id',
  as: 'setorGrupo'
});

db.Setor.hasMany(db.ConversaInterna, {
  foreignKey: 'setor_id',
  as: 'conversasGrupo'
});

db.ConversaInterna.hasMany(db.ConversaInternaMensagem, {
  foreignKey: 'conversa_id',
  as: 'mensagens'
});

db.ConversaInternaMensagem.belongsTo(db.ConversaInterna, {
  foreignKey: 'conversa_id',
  as: 'conversa'
});

db.User.hasMany(db.ConversaInternaMensagem, {
  foreignKey: 'usuario_id',
  as: 'mensagensConversaInterna'
});

db.ConversaInternaMensagem.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'autor'
});

db.ConversaInterna.hasMany(db.ConversaInternaAnexo, {
  foreignKey: 'conversa_id',
  as: 'anexos'
});

db.ConversaInternaAnexo.belongsTo(db.ConversaInterna, {
  foreignKey: 'conversa_id',
  as: 'conversa'
});

db.ConversaInternaMensagem.hasMany(db.ConversaInternaAnexo, {
  foreignKey: 'mensagem_id',
  as: 'anexos'
});

db.ConversaInternaAnexo.belongsTo(db.ConversaInternaMensagem, {
  foreignKey: 'mensagem_id',
  as: 'mensagem'
});

db.ConversaInternaMensagem.belongsTo(db.ConversaInternaMensagem, {
  foreignKey: 'citacao_id',
  as: 'citacaoMensagem'
});

db.ConversaInterna.hasMany(db.ConversaInternaParticipante, {
  foreignKey: 'conversa_id',
  as: 'participantes'
});

db.ConversaInternaParticipante.belongsTo(db.ConversaInterna, {
  foreignKey: 'conversa_id',
  as: 'conversa'
});

db.User.hasMany(db.ConversaInternaParticipante, {
  foreignKey: 'usuario_id',
  as: 'participacoesConversaInterna'
});

db.ConversaInternaParticipante.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});

db.User.hasMany(db.ConversaInternaParticipante, {
  foreignKey: 'adicionado_por_id',
  as: 'participantesAdicionadosConversaInterna'
});

db.ConversaInternaParticipante.belongsTo(db.User, {
  foreignKey: 'adicionado_por_id',
  as: 'adicionadoPor'
});

db.ConversaInterna.hasMany(db.ConversaInternaArquivoUsuario, {
  foreignKey: 'conversa_id',
  as: 'arquivamentos'
});

db.ConversaInternaArquivoUsuario.belongsTo(db.ConversaInterna, {
  foreignKey: 'conversa_id',
  as: 'conversa'
});

db.User.hasMany(db.ConversaInternaArquivoUsuario, {
  foreignKey: 'usuario_id',
  as: 'conversasArquivadas'
});

db.ConversaInternaArquivoUsuario.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});

// =====================
// MODULO DE COMPRAS
// =====================
db.Insumo.belongsTo(db.Unidade, {
  foreignKey: 'unidade_id',
  as: 'unidade'
});

db.Insumo.belongsTo(db.Categoria, {
  foreignKey: 'categoria_id',
  as: 'categoria'
});

db.Unidade.hasMany(db.Insumo, {
  foreignKey: 'unidade_id',
  as: 'insumos'
});

db.Categoria.hasMany(db.Insumo, {
  foreignKey: 'categoria_id',
  as: 'insumos'
});

db.Apropriacao.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Obra.hasMany(db.Apropriacao, {
  foreignKey: 'obra_id',
  as: 'apropriacoes'
});

db.Apropriacao.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_pai_id',
  as: 'apropriacao_pai'
});

db.Apropriacao.hasMany(db.Apropriacao, {
  foreignKey: 'apropriacao_pai_id',
  as: 'apropriacoes_filhas'
});

db.SolicitacaoCompra.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.SolicitacaoCompra.belongsTo(db.User, {
  foreignKey: 'solicitante_id',
  as: 'solicitante'
});

db.SolicitacaoCompra.belongsTo(db.User, {
  foreignKey: 'comprador_responsavel_id',
  as: 'compradorResponsavel'
});

db.SolicitacaoCompra.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_principal_id',
  as: 'solicitacaoPrincipal'
});

db.SolicitacaoCompra.belongsTo(db.Parceiro, {
  foreignKey: 'frete_parceiro_id',
  as: 'freteCredor'
});

db.SolicitacaoCompra.hasMany(db.SolicitacaoCompraItem, {
  foreignKey: 'solicitacao_compra_id',
  as: 'itens',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompra.hasMany(db.SolicitacaoCompraItemManual, {
  foreignKey: 'solicitacao_compra_id',
  as: 'itensManuais',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraItem.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacao'
});

db.SolicitacaoCompraItemManual.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacao'
});

db.SolicitacaoCompraItem.belongsTo(db.Insumo, {
  foreignKey: 'insumo_id',
  as: 'insumo'
});

db.SolicitacaoCompraItem.belongsTo(db.Unidade, {
  foreignKey: 'unidade_id',
  as: 'unidade'
});

db.SolicitacaoCompraItem.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.SolicitacaoCompraItemManual.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.SolicitacaoCompraItem.hasMany(db.SolicitacaoCompraItemApropriacao, {
  foreignKey: 'solicitacao_compra_item_id',
  as: 'apropriacoes',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraItemApropriacao.belongsTo(db.SolicitacaoCompraItem, {
  foreignKey: 'solicitacao_compra_item_id',
  as: 'item'
});

db.SolicitacaoCompraItemApropriacao.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.SolicitacaoCompraItemManual.hasMany(db.SolicitacaoCompraItemManualApropriacao, {
  foreignKey: 'solicitacao_compra_item_manual_id',
  as: 'apropriacoes',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraItemManualApropriacao.belongsTo(db.SolicitacaoCompraItemManual, {
  foreignKey: 'solicitacao_compra_item_manual_id',
  as: 'item'
});

db.SolicitacaoCompraItemManualApropriacao.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.FornecedorCompra.hasMany(db.SolicitacaoCompraFornecedor, {
  foreignKey: 'fornecedor_compra_id',
  as: 'participacoes'
});

db.Parceiro.hasMany(db.FornecedorCompra, {
  foreignKey: 'parceiro_id',
  as: 'fornecedoresCompra'
});

db.FornecedorCompra.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.SolicitacaoCompraFornecedor.belongsTo(db.FornecedorCompra, {
  foreignKey: 'fornecedor_compra_id',
  as: 'fornecedor'
});

db.SolicitacaoCompra.hasMany(db.SolicitacaoCompraFornecedor, {
  foreignKey: 'solicitacao_compra_id',
  as: 'fornecedores',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraFornecedor.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacao'
});

db.SolicitacaoCompraFornecedor.hasMany(db.SolicitacaoCompraFornecedorItem, {
  foreignKey: 'solicitacao_compra_fornecedor_id',
  as: 'itensSelecionados',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraFornecedorItem.belongsTo(db.SolicitacaoCompraFornecedor, {
  foreignKey: 'solicitacao_compra_fornecedor_id',
  as: 'cotacaoFornecedor'
});

db.SolicitacaoCompraFornecedorItem.belongsTo(db.SolicitacaoCompraItem, {
  foreignKey: 'solicitacao_compra_item_id',
  as: 'itemCadastrado'
});

db.SolicitacaoCompraFornecedorItem.belongsTo(db.SolicitacaoCompraItemManual, {
  foreignKey: 'solicitacao_compra_item_manual_id',
  as: 'itemManual'
});

db.SolicitacaoCompraFornecedor.hasMany(db.SolicitacaoCompraRespostaItem, {
  foreignKey: 'solicitacao_compra_fornecedor_id',
  as: 'respostas',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraRespostaItem.belongsTo(db.SolicitacaoCompraFornecedor, {
  foreignKey: 'solicitacao_compra_fornecedor_id',
  as: 'cotacaoFornecedor'
});

db.SolicitacaoCompraRespostaItem.belongsTo(db.SolicitacaoCompraItem, {
  foreignKey: 'solicitacao_compra_item_id',
  as: 'itemCadastrado'
});

db.SolicitacaoCompraRespostaItem.belongsTo(db.SolicitacaoCompraItemManual, {
  foreignKey: 'solicitacao_compra_item_manual_id',
  as: 'itemManual'
});

db.SolicitacaoCompra.hasMany(db.SolicitacaoCompraLog, {
  foreignKey: 'solicitacao_compra_id',
  as: 'logs',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraLog.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacao'
});

db.SolicitacaoCompraLog.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});

db.SolicitacaoCompraLog.belongsTo(db.FornecedorCompra, {
  foreignKey: 'fornecedor_compra_id',
  as: 'fornecedor'
});

db.SolicitacaoCompra.hasMany(db.SolicitacaoCompraAlocacao, {
  foreignKey: 'solicitacao_compra_id',
  as: 'alocacoes',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraAlocacao.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacao'
});

db.SolicitacaoCompra.hasMany(db.SolicitacaoCompraFechamento, {
  foreignKey: 'solicitacao_compra_id',
  as: 'fechamentos',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraFechamento.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacao'
});

db.SolicitacaoCompraFechamento.hasMany(db.SolicitacaoCompraAlocacao, {
  foreignKey: 'fechamento_id',
  as: 'alocacoes'
});

db.SolicitacaoCompraAlocacao.belongsTo(db.SolicitacaoCompraFechamento, {
  foreignKey: 'fechamento_id',
  as: 'fechamento'
});

db.SolicitacaoCompraRespostaItem.hasMany(db.SolicitacaoCompraAlocacao, {
  foreignKey: 'resposta_item_id',
  as: 'alocacoes'
});

db.SolicitacaoCompraAlocacao.belongsTo(db.SolicitacaoCompraRespostaItem, {
  foreignKey: 'resposta_item_id',
  as: 'respostaItem'
});

db.FornecedorCompra.hasMany(db.SolicitacaoCompraAlocacao, {
  foreignKey: 'fornecedor_compra_id',
  as: 'alocacoesCompra'
});

db.SolicitacaoCompraAlocacao.belongsTo(db.FornecedorCompra, {
  foreignKey: 'fornecedor_compra_id',
  as: 'fornecedor'
});

db.SolicitacaoCompraAlocacao.belongsTo(db.SolicitacaoCompraItem, {
  foreignKey: 'solicitacao_compra_item_id',
  as: 'itemCadastrado'
});

db.SolicitacaoCompraAlocacao.belongsTo(db.SolicitacaoCompraItemManual, {
  foreignKey: 'solicitacao_compra_item_manual_id',
  as: 'itemManual'
});

db.SolicitacaoCompra.hasMany(db.PedidoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'pedidos'
});

db.PedidoCompra.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacao'
});

db.SolicitacaoCompraFechamento.hasMany(db.PedidoCompra, {
  foreignKey: 'fechamento_id',
  as: 'pedidos'
});

db.PedidoCompra.belongsTo(db.SolicitacaoCompraFechamento, {
  foreignKey: 'fechamento_id',
  as: 'fechamento'
});

db.Obra.hasMany(db.PedidoCompra, {
  foreignKey: 'obra_id',
  as: 'pedidosCompra'
});

db.PedidoCompra.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.FornecedorCompra.hasMany(db.PedidoCompra, {
  foreignKey: 'fornecedor_compra_id',
  as: 'pedidosCompra'
});

db.PedidoCompra.belongsTo(db.FornecedorCompra, {
  foreignKey: 'fornecedor_compra_id',
  as: 'fornecedor'
});

db.User.hasMany(db.PedidoCompra, {
  foreignKey: 'criado_por',
  as: 'pedidosCompraCriados'
});

db.PedidoCompra.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criador'
});

db.User.hasMany(db.PedidoCompra, {
  foreignKey: 'atribuido_a',
  as: 'pedidosCompraAtribuidos'
});

db.PedidoCompra.belongsTo(db.User, {
  foreignKey: 'atribuido_a',
  as: 'responsavel'
});

db.PedidoCompra.hasMany(db.PedidoCompraItem, {
  foreignKey: 'pedido_compra_id',
  as: 'itens',
  onDelete: 'CASCADE'
});

db.PedidoCompraItem.belongsTo(db.PedidoCompra, {
  foreignKey: 'pedido_compra_id',
  as: 'pedido'
});

db.PedidoCompraItem.belongsTo(db.SolicitacaoCompraRespostaItem, {
  foreignKey: 'resposta_item_id',
  as: 'respostaItem'
});

db.PedidoCompraItem.belongsTo(db.SolicitacaoCompraItem, {
  foreignKey: 'solicitacao_compra_item_id',
  as: 'itemCadastrado'
});

db.PedidoCompraItem.belongsTo(db.SolicitacaoCompraItemManual, {
  foreignKey: 'solicitacao_compra_item_manual_id',
  as: 'itemManual'
});

db.PedidoCompra.hasMany(db.SolicitacaoCompraAlocacao, {
  foreignKey: 'pedido_compra_id',
  as: 'alocacoes'
});

db.SolicitacaoCompraAlocacao.belongsTo(db.PedidoCompra, {
  foreignKey: 'pedido_compra_id',
  as: 'pedido'
});

db.PedidoCompraItem.hasMany(db.SolicitacaoCompraAlocacao, {
  foreignKey: 'pedido_compra_item_id',
  as: 'alocacoes'
});

db.SolicitacaoCompraAlocacao.belongsTo(db.PedidoCompraItem, {
  foreignKey: 'pedido_compra_item_id',
  as: 'pedidoItem'
});

db.TituloFinanceiro.hasMany(db.SolicitacaoCompraAlocacao, {
  foreignKey: 'titulo_financeiro_id',
  as: 'alocacoesCompraRealizadas'
});

db.SolicitacaoCompraAlocacao.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.PedidoCompra.hasMany(db.PedidoCompraItemLog, {
  foreignKey: 'pedido_compra_id',
  as: 'logsItens',
  onDelete: 'CASCADE'
});

db.PedidoCompraItemLog.belongsTo(db.PedidoCompra, {
  foreignKey: 'pedido_compra_id',
  as: 'pedido'
});

db.PedidoCompraItem.hasMany(db.PedidoCompraItemLog, {
  foreignKey: 'pedido_compra_item_id',
  as: 'logs',
  onDelete: 'CASCADE'
});

db.PedidoCompraItemLog.belongsTo(db.PedidoCompraItem, {
  foreignKey: 'pedido_compra_item_id',
  as: 'item'
});

db.User.hasMany(db.PedidoCompraItemLog, {
  foreignKey: 'usuario_id',
  as: 'logsItensPedido'
});

db.PedidoCompraItemLog.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});

db.PedidoCompra.hasMany(db.PedidoCompraFrete, {
  foreignKey: 'pedido_compra_id',
  as: 'fretes',
  onDelete: 'CASCADE'
});

db.PedidoCompraFrete.belongsTo(db.PedidoCompra, {
  foreignKey: 'pedido_compra_id',
  as: 'pedido'
});

db.SolicitacaoCompra.hasMany(db.PedidoCompraFrete, {
  foreignKey: 'solicitacao_compra_id',
  as: 'fretesPedido'
});

db.PedidoCompraFrete.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacaoCompra'
});

db.Solicitacao.hasMany(db.PedidoCompraFrete, {
  foreignKey: 'solicitacao_id',
  as: 'fretesCompra'
});

db.PedidoCompraFrete.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacaoPrincipal'
});

db.Obra.hasMany(db.PedidoCompraFrete, {
  foreignKey: 'obra_id',
  as: 'fretesCompra'
});

db.PedidoCompraFrete.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.FornecedorCompra.hasMany(db.PedidoCompraFrete, {
  foreignKey: 'fornecedor_compra_id',
  as: 'fretesCompra'
});

db.PedidoCompraFrete.belongsTo(db.FornecedorCompra, {
  foreignKey: 'fornecedor_compra_id',
  as: 'fornecedor'
});

db.Parceiro.hasMany(db.PedidoCompraFrete, {
  foreignKey: 'parceiro_id',
  as: 'fretesCompra'
});

db.PedidoCompraFrete.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.User.hasMany(db.PedidoCompraFrete, {
  foreignKey: 'registrado_por',
  as: 'fretesCompraRegistrados'
});

db.PedidoCompraFrete.belongsTo(db.User, {
  foreignKey: 'registrado_por',
  as: 'registradoPor'
});

db.PedidoCompraFrete.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.PedidoCompraFrete.hasMany(db.PedidoCompraFreteRateio, {
  foreignKey: 'frete_id',
  as: 'rateios',
  onDelete: 'CASCADE'
});

db.PedidoCompraFreteRateio.belongsTo(db.PedidoCompraFrete, {
  foreignKey: 'frete_id',
  as: 'frete'
});

db.PedidoCompra.hasMany(db.PedidoCompraFreteRateio, {
  foreignKey: 'pedido_compra_id',
  as: 'rateiosFrete'
});

db.PedidoCompraFreteRateio.belongsTo(db.PedidoCompra, {
  foreignKey: 'pedido_compra_id',
  as: 'pedido'
});

db.PedidoCompraItem.hasMany(db.PedidoCompraFreteRateio, {
  foreignKey: 'pedido_compra_item_id',
  as: 'rateiosFrete'
});

db.PedidoCompraFreteRateio.belongsTo(db.PedidoCompraItem, {
  foreignKey: 'pedido_compra_item_id',
  as: 'item'
});

db.PedidoCompraFreteRateio.belongsTo(db.SolicitacaoCompraItem, {
  foreignKey: 'solicitacao_compra_item_id',
  as: 'itemCadastrado'
});

db.PedidoCompraFreteRateio.belongsTo(db.SolicitacaoCompraItemManual, {
  foreignKey: 'solicitacao_compra_item_manual_id',
  as: 'itemManual'
});

db.PedidoCompraFreteRateio.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

// =====================
// MODULO FINANCEIRO
// =====================
db.User.hasMany(db.ContaBancaria, {
  foreignKey: 'criado_por',
  as: 'contasBancariasCriadas'
});

db.ContaBancaria.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.EmpresaGrupo.hasMany(db.ContaBancaria, {
  foreignKey: 'empresa_id',
  as: 'contasFinanceiras'
});

db.ContaBancaria.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.User.hasMany(db.CategoriaFinanceira, {
  foreignKey: 'criado_por',
  as: 'categoriasFinanceirasCriadas'
});

db.CategoriaFinanceira.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.FormaPagamentoFinanceira, {
  foreignKey: 'criado_por',
  as: 'formasPagamentoFinanceirasCriadas'
});

db.FormaPagamentoFinanceira.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.CartaoFinanceiro, {
  foreignKey: 'criado_por',
  as: 'cartoesFinanceirosCriados'
});

db.CartaoFinanceiro.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.ContaBancaria.hasMany(db.CartaoFinanceiro, {
  foreignKey: 'conta_bancaria_id',
  as: 'cartoesFinanceiros'
});

db.CartaoFinanceiro.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.CartaoFinanceiro.hasMany(db.FaturaCartaoFinanceiro, {
  foreignKey: 'cartao_id',
  as: 'faturas'
});

db.FaturaCartaoFinanceiro.belongsTo(db.CartaoFinanceiro, {
  foreignKey: 'cartao_id',
  as: 'cartao'
});

db.ContaBancaria.hasMany(db.FaturaCartaoFinanceiro, {
  foreignKey: 'conta_bancaria_id',
  as: 'faturasCartao'
});

db.FaturaCartaoFinanceiro.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.Obra.hasMany(db.TituloFinanceiro, {
  foreignKey: 'obra_id',
  as: 'titulosFinanceiros'
});

db.TituloFinanceiro.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Obra.hasMany(db.ObraCustoHistorico, {
  foreignKey: 'obra_id',
  as: 'custosHistoricos'
});

db.ObraCustoHistorico.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.ObraCustoHistoricoImportacao.hasMany(db.ObraCustoHistorico, {
  foreignKey: 'importacao_id',
  as: 'itens'
});

db.ObraCustoHistorico.belongsTo(db.ObraCustoHistoricoImportacao, {
  foreignKey: 'importacao_id',
  as: 'importacao'
});

db.EmpresaGrupo.hasMany(db.Obra, {
  foreignKey: 'empresa_grupo_id',
  as: 'obrasCentrosCusto'
});

db.Obra.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_grupo_id',
  as: 'empresaGrupo'
});

db.Apropriacao.hasMany(db.TituloFinanceiro, {
  foreignKey: 'apropriacao_id',
  as: 'titulosFinanceiros'
});

db.TituloFinanceiro.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.Parceiro.hasMany(db.TituloFinanceiro, {
  foreignKey: 'parceiro_id',
  as: 'titulosFinanceiros'
});

db.TituloFinanceiro.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.Parceiro.hasMany(db.ObraCustoHistorico, {
  foreignKey: 'parceiro_id',
  as: 'custosHistoricosObra'
});

db.ObraCustoHistorico.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.CategoriaFinanceira.hasMany(db.TituloFinanceiro, {
  foreignKey: 'categoria_financeira_id',
  as: 'titulos'
});

db.TituloFinanceiro.belongsTo(db.CategoriaFinanceira, {
  foreignKey: 'categoria_financeira_id',
  as: 'categoriaFinanceira'
});

db.CategoriaFinanceira.hasMany(db.ObraCustoHistorico, {
  foreignKey: 'categoria_financeira_id',
  as: 'custosHistoricosObra'
});

db.ObraCustoHistorico.belongsTo(db.CategoriaFinanceira, {
  foreignKey: 'categoria_financeira_id',
  as: 'categoriaFinanceira'
});

db.CategoriaFinanceira.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'categoria_financeira_id',
  as: 'movimentos'
});

db.MovimentoFinanceiro.belongsTo(db.CategoriaFinanceira, {
  foreignKey: 'categoria_financeira_id',
  as: 'categoriaFinanceira'
});

db.FormaPagamentoFinanceira.hasMany(db.TituloFinanceiro, {
  foreignKey: 'forma_pagamento_id',
  as: 'titulos'
});

db.TituloFinanceiro.belongsTo(db.FormaPagamentoFinanceira, {
  foreignKey: 'forma_pagamento_id',
  as: 'formaPagamento'
});

db.FormaPagamentoFinanceira.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'forma_pagamento_id',
  as: 'movimentos'
});

db.MovimentoFinanceiro.belongsTo(db.FormaPagamentoFinanceira, {
  foreignKey: 'forma_pagamento_id',
  as: 'formaPagamento'
});

db.CartaoFinanceiro.hasMany(db.TituloFinanceiro, {
  foreignKey: 'cartao_id',
  as: 'titulos'
});

db.TituloFinanceiro.belongsTo(db.CartaoFinanceiro, {
  foreignKey: 'cartao_id',
  as: 'cartao'
});

db.FaturaCartaoFinanceiro.hasMany(db.TituloFinanceiro, {
  foreignKey: 'fatura_cartao_id',
  as: 'titulos'
});

db.TituloFinanceiro.belongsTo(db.FaturaCartaoFinanceiro, {
  foreignKey: 'fatura_cartao_id',
  as: 'faturaCartao'
});

db.FaturaCartaoFinanceiro.hasMany(db.FaturaCartaoTitulo, {
  foreignKey: 'fatura_cartao_id',
  as: 'itens'
});

db.FaturaCartaoTitulo.belongsTo(db.FaturaCartaoFinanceiro, {
  foreignKey: 'fatura_cartao_id',
  as: 'fatura'
});

db.TituloFinanceiro.hasOne(db.FaturaCartaoTitulo, {
  foreignKey: 'titulo_financeiro_id',
  as: 'faturaVinculo'
});

db.FaturaCartaoTitulo.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'titulo'
});

db.Solicitacao.hasMany(db.TituloFinanceiro, {
  foreignKey: 'solicitacao_id',
  as: 'titulosFinanceiros'
});

db.TituloFinanceiro.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.EmpresaGrupo.hasMany(db.TituloFinanceiro, {
  foreignKey: 'empresa_id',
  as: 'titulosFinanceiros'
});

db.TituloFinanceiro.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.EmpresaGrupo.hasMany(db.ObraCustoHistorico, {
  foreignKey: 'empresa_id',
  as: 'custosHistoricosObra'
});

db.ObraCustoHistorico.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.EmpresaGrupo.hasMany(db.TituloFinanceiro, {
  foreignKey: 'empresa_contraparte_id',
  as: 'titulosIntercompanyContraparte'
});

db.TituloFinanceiro.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_contraparte_id',
  as: 'empresaContraparte'
});

db.EmpresaGrupo.hasMany(db.TituloFinanceiro, {
  foreignKey: 'empresa_origem_id',
  as: 'titulosIntercompanyOrigem'
});

db.TituloFinanceiro.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_origem_id',
  as: 'empresaOrigem'
});

db.EmpresaGrupo.hasMany(db.TituloFinanceiro, {
  foreignKey: 'empresa_destino_id',
  as: 'titulosIntercompanyDestino'
});

db.TituloFinanceiro.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_destino_id',
  as: 'empresaDestino'
});

db.User.hasMany(db.TituloFinanceiro, {
  foreignKey: 'criado_por',
  as: 'titulosFinanceirosCriados'
});

db.TituloFinanceiro.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.FinanceiroTituloImportacao, {
  foreignKey: 'criado_por',
  as: 'importacoesTitulosFinanceiros'
});

db.FinanceiroTituloImportacao.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.FinanceiroTituloImportacao.hasMany(db.FinanceiroTituloImportacaoLinha, {
  foreignKey: 'importacao_id',
  as: 'linhas'
});

db.FinanceiroTituloImportacaoLinha.belongsTo(db.FinanceiroTituloImportacao, {
  foreignKey: 'importacao_id',
  as: 'importacao'
});

db.FinanceiroTituloImportacao.hasMany(db.FinanceiroTituloImportacaoResultado, {
  foreignKey: 'importacao_id',
  as: 'resultados'
});

db.FinanceiroTituloImportacaoResultado.belongsTo(db.FinanceiroTituloImportacao, {
  foreignKey: 'importacao_id',
  as: 'importacao'
});

db.FinanceiroTituloImportacaoLinha.hasMany(db.FinanceiroTituloImportacaoResultado, {
  foreignKey: 'linha_id',
  as: 'resultados'
});

db.FinanceiroTituloImportacaoResultado.belongsTo(db.FinanceiroTituloImportacaoLinha, {
  foreignKey: 'linha_id',
  as: 'linha'
});

db.TituloFinanceiro.hasOne(db.FinanceiroTituloImportacaoResultado, {
  foreignKey: 'titulo_financeiro_id',
  as: 'resultadoImportacao'
});

db.FinanceiroTituloImportacaoResultado.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.TituloFinanceiro.hasMany(db.TituloFinanceiroRateio, {
  foreignKey: 'titulo_financeiro_id',
  as: 'rateios'
});

db.TituloFinanceiroRateio.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.Obra.hasMany(db.TituloFinanceiroRateio, {
  foreignKey: 'obra_id',
  as: 'rateiosTitulosFinanceiros'
});

db.TituloFinanceiroRateio.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Apropriacao.hasMany(db.TituloFinanceiroRateio, {
  foreignKey: 'apropriacao_id',
  as: 'rateiosTitulosFinanceiros'
});

db.TituloFinanceiroRateio.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.TituloFinanceiro.hasMany(db.TituloFinanceiroImposto, {
  foreignKey: 'titulo_financeiro_id',
  as: 'impostos'
});

db.TituloFinanceiroImposto.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.TituloFinanceiro.hasMany(db.ChequeTerceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'chequesTerceiros'
});

db.ChequeTerceiro.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.MovimentoFinanceiro.hasMany(db.ChequeTerceiro, {
  foreignKey: 'movimento_financeiro_id',
  as: 'chequesTerceiros'
});

db.ChequeTerceiro.belongsTo(db.MovimentoFinanceiro, {
  foreignKey: 'movimento_financeiro_id',
  as: 'movimentoFinanceiro'
});

db.Parceiro.hasMany(db.ChequeTerceiro, {
  foreignKey: 'parceiro_entregou_id',
  as: 'chequesTerceirosEntregues'
});

db.ChequeTerceiro.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_entregou_id',
  as: 'parceiroEntregou'
});

db.Parceiro.hasMany(db.ChequeTerceiro, {
  foreignKey: 'titular_parceiro_id',
  as: 'chequesComoTitular'
});

db.ChequeTerceiro.belongsTo(db.Parceiro, {
  foreignKey: 'titular_parceiro_id',
  as: 'titularParceiro'
});

db.EmpresaGrupo.hasMany(db.ChequeTerceiro, { foreignKey: 'empresa_id', as: 'chequesTerceiros' });
db.ChequeTerceiro.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresa' });
db.Obra.hasMany(db.ChequeTerceiro, { foreignKey: 'obra_origem_id', as: 'chequesTerceirosOrigem' });
db.ChequeTerceiro.belongsTo(db.Obra, { foreignKey: 'obra_origem_id', as: 'obraOrigem' });

db.ChequeTerceiro.hasMany(db.ChequeTerceiroMovimento, { foreignKey: 'cheque_terceiro_id', as: 'historico' });
db.ChequeTerceiroMovimento.belongsTo(db.ChequeTerceiro, { foreignKey: 'cheque_terceiro_id', as: 'cheque' });

db.EmpresaGrupo.hasMany(db.BaixaFinanceiraGrupo, { foreignKey: 'empresa_id', as: 'baixasCompostas' });
db.BaixaFinanceiraGrupo.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresa' });
db.Parceiro.hasMany(db.BaixaFinanceiraGrupo, { foreignKey: 'parceiro_id', as: 'baixasCompostas' });
db.BaixaFinanceiraGrupo.belongsTo(db.Parceiro, { foreignKey: 'parceiro_id', as: 'parceiro' });
db.BaixaFinanceiraGrupo.hasMany(db.BaixaFinanceiraComponente, { foreignKey: 'baixa_grupo_id', as: 'componentes' });
db.BaixaFinanceiraComponente.belongsTo(db.BaixaFinanceiraGrupo, { foreignKey: 'baixa_grupo_id', as: 'grupo' });
db.EmpresaGrupo.hasMany(db.BaixaFinanceiraComponente, { foreignKey: 'empresa_id', as: 'componentesBaixasCompostasFonte' });
db.BaixaFinanceiraComponente.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresaFonte' });
db.FormaPagamentoFinanceira.hasMany(db.BaixaFinanceiraComponente, { foreignKey: 'forma_pagamento_id', as: 'componentesBaixasCompostas' });
db.BaixaFinanceiraComponente.belongsTo(db.FormaPagamentoFinanceira, { foreignKey: 'forma_pagamento_id', as: 'formaPagamento' });
db.ContaBancaria.hasMany(db.BaixaFinanceiraComponente, { foreignKey: 'conta_bancaria_id', as: 'componentesBaixasCompostas' });
db.BaixaFinanceiraComponente.belongsTo(db.ContaBancaria, { foreignKey: 'conta_bancaria_id', as: 'contaBancaria' });
db.CartaoFinanceiro.hasMany(db.BaixaFinanceiraComponente, { foreignKey: 'cartao_id', as: 'componentesBaixasCompostas' });
db.BaixaFinanceiraComponente.belongsTo(db.CartaoFinanceiro, { foreignKey: 'cartao_id', as: 'cartao' });
db.BaixaFinanceiraGrupo.hasMany(db.BaixaFinanceiraAlocacao, { foreignKey: 'baixa_grupo_id', as: 'alocacoes' });
db.BaixaFinanceiraAlocacao.belongsTo(db.BaixaFinanceiraGrupo, { foreignKey: 'baixa_grupo_id', as: 'grupo' });
db.BaixaFinanceiraComponente.hasMany(db.BaixaFinanceiraAlocacao, { foreignKey: 'componente_id', as: 'alocacoes' });
db.BaixaFinanceiraAlocacao.belongsTo(db.BaixaFinanceiraComponente, { foreignKey: 'componente_id', as: 'componente' });
db.TituloFinanceiro.hasMany(db.BaixaFinanceiraAlocacao, { foreignKey: 'titulo_financeiro_id', as: 'alocacoesBaixasCompostas' });
db.BaixaFinanceiraAlocacao.belongsTo(db.TituloFinanceiro, { foreignKey: 'titulo_financeiro_id', as: 'titulo' });
db.MovimentoFinanceiro.hasOne(db.BaixaFinanceiraAlocacao, { foreignKey: 'movimento_financeiro_id', as: 'alocacaoBaixaComposta' });
db.BaixaFinanceiraAlocacao.belongsTo(db.MovimentoFinanceiro, { foreignKey: 'movimento_financeiro_id', as: 'movimento' });
db.ChequeTerceiro.hasMany(db.BaixaFinanceiraComponente, { foreignKey: 'cheque_terceiro_id', as: 'componentesBaixa' });
db.BaixaFinanceiraComponente.belongsTo(db.ChequeTerceiro, { foreignKey: 'cheque_terceiro_id', as: 'chequeTerceiro' });

db.EmpresaGrupo.hasMany(db.FinanciamentoBancario, {
  foreignKey: 'empresa_id',
  as: 'financiamentosBancarios'
});

db.FinanciamentoBancario.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.ContaBancaria.hasMany(db.FinanciamentoBancario, {
  foreignKey: 'conta_bancaria_id',
  as: 'financiamentosBancarios'
});

db.FinanciamentoBancario.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.Obra.hasMany(db.FinanciamentoBancario, {
  foreignKey: 'obra_id',
  as: 'financiamentosBancarios'
});

db.FinanciamentoBancario.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Parceiro.hasMany(db.FinanciamentoBancario, {
  foreignKey: 'parceiro_id',
  as: 'financiamentosBancarios'
});

db.FinanciamentoBancario.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'instituicaoFinanceira'
});

db.CategoriaFinanceira.hasMany(db.FinanciamentoBancario, {
  foreignKey: 'categoria_financeira_id',
  as: 'financiamentosBancarios'
});

db.FinanciamentoBancario.belongsTo(db.CategoriaFinanceira, {
  foreignKey: 'categoria_financeira_id',
  as: 'categoriaFinanceira'
});

db.FinanciamentoBancario.hasMany(db.FinanciamentoBancarioParcela, {
  foreignKey: 'financiamento_bancario_id',
  as: 'parcelas'
});

db.FinanciamentoBancarioParcela.belongsTo(db.FinanciamentoBancario, {
  foreignKey: 'financiamento_bancario_id',
  as: 'financiamento'
});

db.TituloFinanceiro.hasOne(db.FinanciamentoBancarioParcela, {
  foreignKey: 'titulo_financeiro_id',
  as: 'financiamentoParcela'
});

db.FinanciamentoBancarioParcela.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'tituloFinanceiro'
});

db.FinanciamentoBancario.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.FinanciamentoBancario.belongsTo(db.User, {
  foreignKey: 'atualizado_por',
  as: 'atualizadoPor'
});

db.EmpresaGrupo.hasMany(db.BoletoCaixaConvenio, {
  foreignKey: 'empresa_id',
  as: 'conveniosBoletoCaixa'
});

db.BoletoCaixaConvenio.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.ContaBancaria.hasMany(db.BoletoCaixaConvenio, {
  foreignKey: 'conta_bancaria_id',
  as: 'conveniosBoletoCaixa'
});

db.BoletoCaixaConvenio.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.TituloFinanceiro.hasMany(db.BoletoCaixa, {
  foreignKey: 'titulo_financeiro_id',
  as: 'boletosCaixa'
});

db.BoletoCaixa.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'titulo'
});

db.BoletoCaixaConvenio.hasMany(db.BoletoCaixa, {
  foreignKey: 'convenio_id',
  as: 'boletos'
});

db.BoletoCaixa.belongsTo(db.BoletoCaixaConvenio, {
  foreignKey: 'convenio_id',
  as: 'convenio'
});

db.EmpresaGrupo.hasMany(db.BoletoCaixa, {
  foreignKey: 'empresa_id',
  as: 'boletosCaixa'
});

db.BoletoCaixa.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.Parceiro.hasMany(db.BoletoCaixa, {
  foreignKey: 'parceiro_id',
  as: 'boletosCaixa'
});

db.BoletoCaixa.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'pagador'
});

db.BoletoCaixaConvenio.hasMany(db.BoletoCaixaRemessa, {
  foreignKey: 'convenio_id',
  as: 'remessas'
});

db.BoletoCaixaRemessa.belongsTo(db.BoletoCaixaConvenio, {
  foreignKey: 'convenio_id',
  as: 'convenio'
});

db.BoletoCaixaRemessa.hasMany(db.BoletoCaixaRemessaItem, {
  foreignKey: 'remessa_id',
  as: 'itens'
});

db.BoletoCaixaRemessaItem.belongsTo(db.BoletoCaixaRemessa, {
  foreignKey: 'remessa_id',
  as: 'remessa'
});

db.BoletoCaixa.hasMany(db.BoletoCaixaRemessaItem, {
  foreignKey: 'boleto_id',
  as: 'itensRemessa'
});

db.BoletoCaixaRemessaItem.belongsTo(db.BoletoCaixa, {
  foreignKey: 'boleto_id',
  as: 'boleto'
});

db.BoletoCaixaConvenio.hasMany(db.BoletoCaixaRetorno, {
  foreignKey: 'convenio_id',
  as: 'retornos'
});

db.BoletoCaixaRetorno.belongsTo(db.BoletoCaixaConvenio, {
  foreignKey: 'convenio_id',
  as: 'convenio'
});

db.BoletoCaixaRemessa.hasMany(db.BoletoCaixaRetorno, {
  foreignKey: 'remessa_id',
  as: 'retornos'
});

db.BoletoCaixaRetorno.belongsTo(db.BoletoCaixaRemessa, {
  foreignKey: 'remessa_id',
  as: 'remessa'
});

db.BoletoCaixaRetorno.hasMany(db.BoletoCaixaOcorrencia, {
  foreignKey: 'retorno_id',
  as: 'ocorrencias'
});

db.BoletoCaixaOcorrencia.belongsTo(db.BoletoCaixaRetorno, {
  foreignKey: 'retorno_id',
  as: 'retorno'
});

db.BoletoCaixa.hasMany(db.BoletoCaixaOcorrencia, {
  foreignKey: 'boleto_id',
  as: 'ocorrencias'
});

db.BoletoCaixaOcorrencia.belongsTo(db.BoletoCaixa, {
  foreignKey: 'boleto_id',
  as: 'boleto'
});

db.TituloFinanceiro.hasMany(db.BoletoCaixaOcorrencia, {
  foreignKey: 'titulo_financeiro_id',
  as: 'ocorrenciasBoletoCaixa'
});

db.BoletoCaixaOcorrencia.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'titulo'
});

db.TituloFinanceiro.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'movimentos',
  onDelete: 'RESTRICT'
});

db.MovimentoFinanceiro.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'titulo'
});

db.MovimentoFinanceiro.hasMany(db.BoletoCaixaOcorrencia, {
  foreignKey: 'movimento_financeiro_id',
  as: 'ocorrenciasBoletoCaixa'
});

db.BoletoCaixaOcorrencia.belongsTo(db.MovimentoFinanceiro, {
  foreignKey: 'movimento_financeiro_id',
  as: 'movimentoFinanceiro'
});

db.EmpresaGrupo.hasMany(db.CaixaPagamentoConvenio, {
  foreignKey: 'empresa_id',
  as: 'conveniosCaixaPagamento'
});

db.CaixaPagamentoConvenio.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.ContaBancaria.hasMany(db.CaixaPagamentoConvenio, {
  foreignKey: 'conta_bancaria_id',
  as: 'conveniosCaixaPagamento'
});

db.CaixaPagamentoConvenio.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.CaixaPagamentoConvenio.hasMany(db.CaixaPagamentoRemessa, {
  foreignKey: 'convenio_id',
  as: 'remessasPagamento'
});

db.CaixaPagamentoRemessa.belongsTo(db.CaixaPagamentoConvenio, {
  foreignKey: 'convenio_id',
  as: 'convenio'
});

db.EmpresaGrupo.hasMany(db.CaixaPagamentoRemessa, {
  foreignKey: 'empresa_id',
  as: 'remessasCaixaPagamento'
});

db.CaixaPagamentoRemessa.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.ContaBancaria.hasMany(db.CaixaPagamentoRemessa, {
  foreignKey: 'conta_bancaria_id',
  as: 'remessasCaixaPagamento'
});

db.CaixaPagamentoRemessa.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.CaixaPagamentoRemessa.hasMany(db.CaixaPagamentoRemessaItem, {
  foreignKey: 'remessa_id',
  as: 'itens'
});

db.CaixaPagamentoRemessaItem.belongsTo(db.CaixaPagamentoRemessa, {
  foreignKey: 'remessa_id',
  as: 'remessa'
});

db.TituloFinanceiro.hasMany(db.CaixaPagamentoRemessaItem, {
  foreignKey: 'titulo_financeiro_id',
  as: 'itensRemessaCaixaPagamento'
});

db.CaixaPagamentoRemessaItem.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'titulo'
});

db.Parceiro.hasMany(db.CaixaPagamentoRemessaItem, {
  foreignKey: 'parceiro_id',
  as: 'itensRemessaCaixaPagamento'
});

db.CaixaPagamentoRemessaItem.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.ContaBancaria.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'conta_bancaria_id',
  as: 'movimentos'
});

db.MovimentoFinanceiro.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.EmpresaGrupo.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'empresa_id',
  as: 'movimentosFinanceiros'
});

db.MovimentoFinanceiro.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.EmpresaGrupo.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'empresa_origem_id',
  as: 'movimentosIntercompanyOrigem'
});

db.MovimentoFinanceiro.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_origem_id',
  as: 'empresaOrigem'
});

db.EmpresaGrupo.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'empresa_destino_id',
  as: 'movimentosIntercompanyDestino'
});

db.MovimentoFinanceiro.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_destino_id',
  as: 'empresaDestino'
});

db.EmpresaGrupo.hasMany(db.CaixaFinanceiroSessao, {
  foreignKey: 'empresa_id',
  as: 'sessoesCaixa'
});

db.CaixaFinanceiroSessao.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.ContaBancaria.hasMany(db.CaixaFinanceiroSessao, {
  foreignKey: 'conta_bancaria_id',
  as: 'sessoesCaixa'
});

db.CaixaFinanceiroSessao.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.User.hasMany(db.CaixaFinanceiroSessao, {
  foreignKey: 'aberto_por',
  as: 'sessoesCaixaAbertas'
});

db.CaixaFinanceiroSessao.belongsTo(db.User, {
  foreignKey: 'aberto_por',
  as: 'abertoPor'
});

db.User.hasMany(db.CaixaFinanceiroSessao, {
  foreignKey: 'fechado_por',
  as: 'sessoesCaixaFechadas'
});

db.CaixaFinanceiroSessao.belongsTo(db.User, {
  foreignKey: 'fechado_por',
  as: 'fechadoPor'
});

db.CaixaFinanceiroSessao.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'caixa_sessao_id',
  as: 'movimentos'
});

db.MovimentoFinanceiro.belongsTo(db.CaixaFinanceiroSessao, {
  foreignKey: 'caixa_sessao_id',
  as: 'caixaSessao'
});

db.ContaBancaria.hasMany(db.CaixaConciliacaoConfirmacao, {
  foreignKey: 'conta_bancaria_id',
  as: 'confirmacoesConciliacaoCaixa'
});

db.CaixaConciliacaoConfirmacao.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.EmpresaGrupo.hasMany(db.CaixaConciliacaoConfirmacao, {
  foreignKey: 'empresa_id',
  as: 'confirmacoesConciliacaoCaixa'
});

db.CaixaConciliacaoConfirmacao.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.User.hasMany(db.CaixaConciliacaoConfirmacao, {
  foreignKey: 'confirmado_por',
  as: 'confirmacoesConciliacaoCaixa'
});

db.CaixaConciliacaoConfirmacao.belongsTo(db.User, {
  foreignKey: 'confirmado_por',
  as: 'confirmadoPor'
});

db.EmpresaGrupo.hasMany(db.TransferenciaFinanceira, {
  foreignKey: 'empresa_id',
  as: 'transferenciasFinanceiras'
});

db.TransferenciaFinanceira.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.EmpresaGrupo.hasMany(db.TransferenciaFinanceira, {
  foreignKey: 'empresa_origem_id',
  as: 'transferenciasIntercompanyOrigem'
});

db.TransferenciaFinanceira.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_origem_id',
  as: 'empresaOrigem'
});

db.EmpresaGrupo.hasMany(db.TransferenciaFinanceira, {
  foreignKey: 'empresa_destino_id',
  as: 'transferenciasIntercompanyDestino'
});

db.TransferenciaFinanceira.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_destino_id',
  as: 'empresaDestino'
});

db.ContaBancaria.hasMany(db.TransferenciaFinanceira, {
  foreignKey: 'conta_origem_id',
  as: 'transferenciasSaida'
});

db.TransferenciaFinanceira.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_origem_id',
  as: 'contaOrigem'
});

db.ContaBancaria.hasMany(db.TransferenciaFinanceira, {
  foreignKey: 'conta_destino_id',
  as: 'transferenciasEntrada'
});

db.TransferenciaFinanceira.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_destino_id',
  as: 'contaDestino'
});

db.CaixaFinanceiroSessao.hasMany(db.TransferenciaFinanceira, {
  foreignKey: 'caixa_sessao_origem_id',
  as: 'transferenciasSaida'
});

db.TransferenciaFinanceira.belongsTo(db.CaixaFinanceiroSessao, {
  foreignKey: 'caixa_sessao_origem_id',
  as: 'caixaSessaoOrigem'
});

db.CaixaFinanceiroSessao.hasMany(db.TransferenciaFinanceira, {
  foreignKey: 'caixa_sessao_destino_id',
  as: 'transferenciasEntrada'
});

db.TransferenciaFinanceira.belongsTo(db.CaixaFinanceiroSessao, {
  foreignKey: 'caixa_sessao_destino_id',
  as: 'caixaSessaoDestino'
});

db.User.hasMany(db.TransferenciaFinanceira, {
  foreignKey: 'criado_por',
  as: 'transferenciasFinanceirasCriadas'
});

db.TransferenciaFinanceira.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.TransferenciaFinanceira, {
  foreignKey: 'cancelado_por',
  as: 'transferenciasFinanceirasCanceladas'
});

db.TransferenciaFinanceira.belongsTo(db.User, {
  foreignKey: 'cancelado_por',
  as: 'canceladoPor'
});

db.FaturaCartaoFinanceiro.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'fatura_cartao_id',
  as: 'movimentos'
});

db.MovimentoFinanceiro.belongsTo(db.FaturaCartaoFinanceiro, {
  foreignKey: 'fatura_cartao_id',
  as: 'faturaCartao'
});

db.CartaoFinanceiro.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'cartao_id',
  as: 'movimentos'
});

db.MovimentoFinanceiro.belongsTo(db.CartaoFinanceiro, {
  foreignKey: 'cartao_id',
  as: 'cartao'
});

db.User.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'criado_por',
  as: 'movimentosFinanceirosCriados'
});

db.MovimentoFinanceiro.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'estornado_por',
  as: 'movimentosFinanceirosEstornados'
});

db.MovimentoFinanceiro.belongsTo(db.User, {
  foreignKey: 'estornado_por',
  as: 'estornadoPor'
});

db.TituloFinanceiro.hasMany(db.ConciliacaoBancaria, {
  foreignKey: 'titulo_financeiro_id',
  as: 'conciliacoes'
});

db.ConciliacaoBancaria.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'titulo'
});

db.MovimentoFinanceiro.hasMany(db.ConciliacaoBancaria, {
  foreignKey: 'movimento_financeiro_id',
  as: 'conciliacoes'
});

db.ConciliacaoBancaria.belongsTo(db.MovimentoFinanceiro, {
  foreignKey: 'movimento_financeiro_id',
  as: 'movimento'
});

db.FaturaCartaoFinanceiro.hasMany(db.ConciliacaoBancaria, {
  foreignKey: 'fatura_cartao_id',
  as: 'conciliacoes'
});

db.ConciliacaoBancaria.belongsTo(db.FaturaCartaoFinanceiro, {
  foreignKey: 'fatura_cartao_id',
  as: 'faturaCartao'
});

db.ContaBancaria.hasMany(db.ConciliacaoBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'conciliacoes'
});

db.ConciliacaoBancaria.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.EmpresaGrupo.hasMany(db.ConciliacaoBancaria, {
  foreignKey: 'empresa_id',
  as: 'conciliacoesBancarias'
});

db.ConciliacaoBancaria.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.CaixaFinanceiroSessao.hasMany(db.ConciliacaoBancaria, {
  foreignKey: 'caixa_sessao_id',
  as: 'conciliacoes'
});

db.ConciliacaoBancaria.belongsTo(db.CaixaFinanceiroSessao, {
  foreignKey: 'caixa_sessao_id',
  as: 'caixaSessao'
});

db.TransferenciaFinanceira.hasMany(db.ConciliacaoBancaria, {
  foreignKey: 'transferencia_financeira_id',
  as: 'conciliacoes'
});

db.ConciliacaoBancaria.belongsTo(db.TransferenciaFinanceira, {
  foreignKey: 'transferencia_financeira_id',
  as: 'transferencia'
});

db.ConciliacaoBancaria.hasOne(db.TransferenciaFinanceira, {
  foreignKey: 'conciliacao_origem_id',
  as: 'transferenciaOrigem'
});

db.TransferenciaFinanceira.belongsTo(db.ConciliacaoBancaria, {
  foreignKey: 'conciliacao_origem_id',
  as: 'conciliacaoOrigem'
});

db.ConciliacaoBancaria.hasOne(db.TransferenciaFinanceira, {
  foreignKey: 'conciliacao_destino_id',
  as: 'transferenciaDestino'
});

db.TransferenciaFinanceira.belongsTo(db.ConciliacaoBancaria, {
  foreignKey: 'conciliacao_destino_id',
  as: 'conciliacaoDestino'
});

db.ContaBancaria.hasMany(db.ConciliacaoBancariaImportacao, {
  foreignKey: 'conta_bancaria_id',
  as: 'importacoesConciliacao'
});

db.ConciliacaoBancariaImportacao.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.EmpresaGrupo.hasMany(db.ConciliacaoBancariaImportacao, {
  foreignKey: 'empresa_id',
  as: 'importacoesConciliacao'
});

db.ConciliacaoBancariaImportacao.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.User.hasMany(db.ConciliacaoBancaria, {
  foreignKey: 'confirmado_por',
  as: 'conciliacoesConfirmadas'
});

db.ConciliacaoBancaria.belongsTo(db.User, {
  foreignKey: 'confirmado_por',
  as: 'confirmadoPor'
});

db.User.hasMany(db.ConciliacaoBancaria, {
  foreignKey: 'criado_por',
  as: 'conciliacoesCriadas'
});

db.ConciliacaoBancaria.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

db.User.hasMany(db.ConciliacaoBancariaImportacao, {
  foreignKey: 'criado_por',
  as: 'importacoesConciliacaoCriadas'
});

db.ConciliacaoBancariaImportacao.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criadoPor'
});

// =====================
// MOTOR DE PAGAMENTOS
// =====================
db.EmpresaGrupo.hasMany(db.FinanceiroDdaBoleto, { foreignKey: 'empresa_id', as: 'ddaBoletos' });
db.FinanceiroDdaBoleto.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresa' });
db.EmpresaGrupo.hasMany(db.FinanceiroDdaSincronizacao, { foreignKey: 'empresa_id', as: 'ddaSincronizacoes' });
db.FinanceiroDdaSincronizacao.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresa' });
db.User.hasMany(db.FinanceiroDdaSincronizacao, { foreignKey: 'criado_por', as: 'ddaSincronizacoesCriadas' });
db.FinanceiroDdaSincronizacao.belongsTo(db.User, { foreignKey: 'criado_por', as: 'criadoPor' });
db.PaymentAccount.hasMany(db.FinanceiroDdaBoleto, { foreignKey: 'payment_account_id', as: 'ddaBoletos' });
db.FinanceiroDdaBoleto.belongsTo(db.PaymentAccount, { foreignKey: 'payment_account_id', as: 'paymentAccount' });
db.FinanceiroDdaSincronizacao.hasMany(db.FinanceiroDdaBoleto, { foreignKey: 'sincronizacao_id', as: 'boletos' });
db.FinanceiroDdaBoleto.belongsTo(db.FinanceiroDdaSincronizacao, { foreignKey: 'sincronizacao_id', as: 'sincronizacao' });
db.TituloFinanceiro.hasMany(db.FinanceiroDdaBoleto, { foreignKey: 'titulo_financeiro_id', as: 'ddaBoletosVinculados' });
db.FinanceiroDdaBoleto.belongsTo(db.TituloFinanceiro, { foreignKey: 'titulo_financeiro_id', as: 'titulo' });
db.FinanceiroDdaBoleto.belongsTo(db.TituloFinanceiro, { foreignKey: 'titulo_sugerido_id', as: 'tituloSugerido' });
db.FinanceiroDdaBoleto.hasMany(db.FinanceiroDdaEvento, { foreignKey: 'boleto_id', as: 'eventos' });
db.FinanceiroDdaEvento.belongsTo(db.FinanceiroDdaBoleto, { foreignKey: 'boleto_id', as: 'boleto' });
db.FinanceiroDdaSincronizacao.hasMany(db.FinanceiroDdaEvento, { foreignKey: 'sincronizacao_id', as: 'eventos' });
db.FinanceiroDdaEvento.belongsTo(db.FinanceiroDdaSincronizacao, { foreignKey: 'sincronizacao_id', as: 'sincronizacao' });

db.PaymentProvider.hasMany(db.PaymentAccount, {
  foreignKey: 'provider_id',
  as: 'accounts'
});

db.PaymentAccount.belongsTo(db.PaymentProvider, {
  foreignKey: 'provider_id',
  as: 'provider'
});

db.ContaBancaria.hasMany(db.PaymentAccount, {
  foreignKey: 'conta_bancaria_id',
  as: 'paymentAccounts'
});

db.PaymentAccount.belongsTo(db.ContaBancaria, {
  foreignKey: 'conta_bancaria_id',
  as: 'contaBancaria'
});

db.EmpresaGrupo.hasMany(db.PaymentAccount, {
  foreignKey: 'empresa_id',
  as: 'paymentAccounts'
});

db.PaymentAccount.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.Parceiro.hasMany(db.PaymentBeneficiary, {
  foreignKey: 'parceiro_id',
  as: 'paymentBeneficiaries'
});

db.PaymentBeneficiary.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.PaymentBeneficiary.hasMany(db.PaymentBeneficiaryAuditLog, {
  foreignKey: 'payment_beneficiary_id',
  as: 'auditLogs'
});

db.PaymentBeneficiaryAuditLog.belongsTo(db.PaymentBeneficiary, {
  foreignKey: 'payment_beneficiary_id',
  as: 'beneficiary'
});

db.Parceiro.hasMany(db.PaymentBeneficiaryAuditLog, {
  foreignKey: 'parceiro_id',
  as: 'paymentBeneficiaryAuditLogs'
});

db.PaymentBeneficiaryAuditLog.belongsTo(db.Parceiro, {
  foreignKey: 'parceiro_id',
  as: 'parceiro'
});

db.TituloFinanceiro.hasMany(db.PaymentIntent, {
  foreignKey: 'titulo_financeiro_id',
  as: 'paymentIntents'
});

db.PaymentIntent.belongsTo(db.TituloFinanceiro, {
  foreignKey: 'titulo_financeiro_id',
  as: 'titulo'
});

db.PaymentAccount.hasMany(db.PaymentIntent, {
  foreignKey: 'payment_account_id',
  as: 'intents'
});

db.PaymentIntent.belongsTo(db.PaymentAccount, {
  foreignKey: 'payment_account_id',
  as: 'paymentAccount'
});

db.PaymentBeneficiary.hasMany(db.PaymentIntent, {
  foreignKey: 'payment_beneficiary_id',
  as: 'intents'
});

db.PaymentIntent.belongsTo(db.PaymentBeneficiary, {
  foreignKey: 'payment_beneficiary_id',
  as: 'beneficiary'
});

db.PaymentProvider.hasMany(db.PaymentIntent, {
  foreignKey: 'provider_id',
  as: 'intents'
});

db.PaymentIntent.belongsTo(db.PaymentProvider, {
  foreignKey: 'provider_id',
  as: 'provider'
});

db.PaymentProvider.hasMany(db.PaymentBatch, {
  foreignKey: 'provider_id',
  as: 'batches'
});

db.PaymentBatch.belongsTo(db.PaymentProvider, {
  foreignKey: 'provider_id',
  as: 'provider'
});

db.PaymentAccount.hasMany(db.PaymentBatch, {
  foreignKey: 'payment_account_id',
  as: 'batches'
});

db.PaymentBatch.belongsTo(db.PaymentAccount, {
  foreignKey: 'payment_account_id',
  as: 'paymentAccount'
});

db.EmpresaGrupo.hasMany(db.PaymentBatch, {
  foreignKey: 'empresa_id',
  as: 'paymentBatches'
});

db.PaymentBatch.belongsTo(db.EmpresaGrupo, {
  foreignKey: 'empresa_id',
  as: 'empresa'
});

db.PaymentBatch.hasMany(db.PaymentBatchItem, {
  foreignKey: 'payment_batch_id',
  as: 'items',
  onDelete: 'CASCADE'
});

db.PaymentBatchItem.belongsTo(db.PaymentBatch, {
  foreignKey: 'payment_batch_id',
  as: 'batch'
});

db.PaymentIntent.hasMany(db.PaymentBatchItem, {
  foreignKey: 'payment_intent_id',
  as: 'batchItems'
});

db.PaymentBatchItem.belongsTo(db.PaymentIntent, {
  foreignKey: 'payment_intent_id',
  as: 'intent'
});

db.PaymentBatch.hasMany(db.PaymentTransaction, {
  foreignKey: 'payment_batch_id',
  as: 'transactions'
});

db.PaymentTransaction.belongsTo(db.PaymentBatch, {
  foreignKey: 'payment_batch_id',
  as: 'batch'
});

db.PaymentIntent.hasMany(db.PaymentTransaction, {
  foreignKey: 'payment_intent_id',
  as: 'transactions'
});

db.PaymentTransaction.belongsTo(db.PaymentIntent, {
  foreignKey: 'payment_intent_id',
  as: 'intent'
});

db.PaymentProvider.hasMany(db.PaymentTransaction, {
  foreignKey: 'provider_id',
  as: 'transactions'
});

db.PaymentTransaction.belongsTo(db.PaymentProvider, {
  foreignKey: 'provider_id',
  as: 'provider'
});

db.PaymentProvider.hasMany(db.PaymentEvent, {
  foreignKey: 'provider_id',
  as: 'events'
});

db.PaymentEvent.belongsTo(db.PaymentProvider, {
  foreignKey: 'provider_id',
  as: 'provider'
});

db.PaymentBatch.hasMany(db.PaymentEvent, {
  foreignKey: 'payment_batch_id',
  as: 'events'
});

db.PaymentEvent.belongsTo(db.PaymentBatch, {
  foreignKey: 'payment_batch_id',
  as: 'batch'
});

db.PaymentIntent.hasMany(db.PaymentEvent, {
  foreignKey: 'payment_intent_id',
  as: 'events'
});

db.PaymentEvent.belongsTo(db.PaymentIntent, {
  foreignKey: 'payment_intent_id',
  as: 'intent'
});

db.PaymentIntent.hasOne(db.PaymentReconciliation, {
  foreignKey: 'payment_intent_id',
  as: 'reconciliation'
});

db.PaymentReconciliation.belongsTo(db.PaymentIntent, {
  foreignKey: 'payment_intent_id',
  as: 'intent'
});

db.MovimentoFinanceiro.hasMany(db.PaymentReconciliation, {
  foreignKey: 'movimento_financeiro_id',
  as: 'paymentReconciliations'
});

db.PaymentReconciliation.belongsTo(db.MovimentoFinanceiro, {
  foreignKey: 'movimento_financeiro_id',
  as: 'movimento'
});

db.ConciliacaoBancaria.hasMany(db.PaymentReconciliation, {
  foreignKey: 'conciliacao_bancaria_id',
  as: 'paymentReconciliations'
});

db.PaymentReconciliation.belongsTo(db.ConciliacaoBancaria, {
  foreignKey: 'conciliacao_bancaria_id',
  as: 'conciliacao'
});

db.ConciliacaoBancaria.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'conciliacao_bancaria_id',
  as: 'movimentosAssociados'
});

db.MovimentoFinanceiro.belongsTo(db.ConciliacaoBancaria, {
  foreignKey: 'conciliacao_bancaria_id',
  as: 'conciliacaoBancaria'
});

db.MovimentoFinanceiro.belongsTo(db.MovimentoFinanceiro, {
  foreignKey: 'movimento_origem_id',
  as: 'movimentoOrigem'
});

db.MovimentoFinanceiro.hasMany(db.MovimentoFinanceiro, {
  foreignKey: 'movimento_origem_id',
  as: 'movimentosDerivados'
});

/* ===== CRM ===== */
db.CrmPipeline.hasMany(db.CrmPipelineStage, { foreignKey: 'pipeline_id', as: 'etapas' });
db.CrmPipelineStage.belongsTo(db.CrmPipeline, { foreignKey: 'pipeline_id', as: 'pipeline' });

db.CrmLead.belongsTo(db.CrmPipeline, { foreignKey: 'pipeline_id', as: 'pipeline' });
db.CrmLead.belongsTo(db.CrmPipelineStage, { foreignKey: 'pipeline_stage_id', as: 'etapa' });
db.CrmLead.belongsTo(db.CrmLossReason, { foreignKey: 'motivo_perda_id', as: 'motivoPerda' });
db.CrmLead.belongsTo(db.User, { foreignKey: 'assigned_user_id', as: 'responsavel' });
db.CrmLead.belongsTo(db.User, { foreignKey: 'criado_por', as: 'criadoPor' });
db.CrmLead.belongsTo(db.User, { foreignKey: 'atualizado_por', as: 'atualizadoPor' });

db.CrmPipeline.hasMany(db.CrmLead, { foreignKey: 'pipeline_id', as: 'leads' });
db.CrmPipelineStage.hasMany(db.CrmLead, { foreignKey: 'pipeline_stage_id', as: 'leads' });

db.CrmAuditLog.belongsTo(db.CrmLead, { foreignKey: 'lead_id', as: 'lead' });
db.CrmAuditLog.belongsTo(db.User, { foreignKey: 'user_id', as: 'usuario' });
db.CrmLead.hasMany(db.CrmAuditLog, { foreignKey: 'lead_id', as: 'auditLogs' });

db.CrmInteraction.belongsTo(db.CrmLead, { foreignKey: 'lead_id', as: 'lead' });
db.CrmInteraction.belongsTo(db.User, { foreignKey: 'user_id', as: 'usuario' });
db.CrmLead.hasMany(db.CrmInteraction, { foreignKey: 'lead_id', as: 'interactions' });

db.CrmTask.belongsTo(db.CrmLead, { foreignKey: 'lead_id', as: 'lead' });
db.CrmTask.belongsTo(db.User, { foreignKey: 'assigned_user_id', as: 'responsavel' });
db.CrmTask.belongsTo(db.User, { foreignKey: 'criado_por', as: 'criadoPor' });
db.CrmLead.hasMany(db.CrmTask, { foreignKey: 'lead_id', as: 'tasks' });

db.CrmIntegrationMetaEvent.belongsTo(db.CrmLead, { foreignKey: 'processed_lead_id', as: 'processedLead' });
db.CrmLead.hasMany(db.CrmIntegrationMetaEvent, { foreignKey: 'processed_lead_id', as: 'metaEvents' });
db.CrmIntegrationMetaEvent.belongsTo(db.CrmConversation, { foreignKey: 'processed_conversation_id', as: 'processedConversation' });
db.CrmConversation.hasMany(db.CrmIntegrationMetaEvent, { foreignKey: 'processed_conversation_id', as: 'metaIntegrationEvents' });
db.CrmIntegrationMetaEvent.belongsTo(db.CrmMessage, { foreignKey: 'processed_message_id', as: 'processedMessage' });
db.CrmMessage.hasMany(db.CrmIntegrationMetaEvent, { foreignKey: 'processed_message_id', as: 'metaIntegrationEvents' });
db.CrmIntegrationGoogleEvent.belongsTo(db.CrmLead, { foreignKey: 'processed_lead_id', as: 'processedLead' });
db.CrmLead.hasMany(db.CrmIntegrationGoogleEvent, { foreignKey: 'processed_lead_id', as: 'googleEvents' });
db.CrmIntegrationGoogleEvent.belongsTo(db.CrmConversation, { foreignKey: 'processed_conversation_id', as: 'processedConversation' });
db.CrmConversation.hasMany(db.CrmIntegrationGoogleEvent, { foreignKey: 'processed_conversation_id', as: 'googleIntegrationEvents' });
db.CrmIntegrationGoogleEvent.belongsTo(db.CrmMessage, { foreignKey: 'processed_message_id', as: 'processedMessage' });
db.CrmMessage.hasMany(db.CrmIntegrationGoogleEvent, { foreignKey: 'processed_message_id', as: 'googleIntegrationEvents' });

db.CrmConversation.belongsTo(db.CrmLead, { foreignKey: 'lead_id', as: 'lead' });
db.CrmLead.hasMany(db.CrmConversation, { foreignKey: 'lead_id', as: 'conversations' });
db.CrmConversation.belongsTo(db.CrmChannel, { foreignKey: 'channel_id', as: 'channel' });
db.CrmChannel.hasMany(db.CrmConversation, { foreignKey: 'channel_id', as: 'conversations' });
db.CrmConversation.belongsTo(db.CrmPhoneAsset, { foreignKey: 'phone_asset_id', as: 'phoneAsset' });
db.CrmPhoneAsset.hasMany(db.CrmConversation, { foreignKey: 'phone_asset_id', as: 'conversations' });
db.CrmConversation.belongsTo(db.User, { foreignKey: 'assigned_user_id', as: 'responsavel' });
db.CrmConversation.belongsTo(db.User, { foreignKey: 'created_by_user_id', as: 'criadoPor' });

db.CrmMessage.belongsTo(db.CrmConversation, { foreignKey: 'conversation_id', as: 'conversation' });
db.CrmConversation.hasMany(db.CrmMessage, { foreignKey: 'conversation_id', as: 'messages' });
db.CrmMessage.belongsTo(db.CrmLead, { foreignKey: 'lead_id', as: 'lead' });
db.CrmMessage.belongsTo(db.User, { foreignKey: 'user_id', as: 'usuario' });

db.CrmConversationParticipant.belongsTo(db.CrmConversation, { foreignKey: 'conversation_id', as: 'conversation' });
db.CrmConversation.hasMany(db.CrmConversationParticipant, { foreignKey: 'conversation_id', as: 'participants' });
db.CrmConversationParticipant.belongsTo(db.User, { foreignKey: 'user_id', as: 'usuario' });
db.User.hasMany(db.CrmConversationParticipant, { foreignKey: 'user_id', as: 'crmConversationParticipants' });

db.CrmMessageTemplate.belongsTo(db.User, { foreignKey: 'created_by_user_id', as: 'criadoPor' });
db.CrmAutomationRule.belongsTo(db.User, { foreignKey: 'created_by_user_id', as: 'criadoPor' });
db.CrmAutomationRule.belongsTo(db.User, { foreignKey: 'updated_by_user_id', as: 'atualizadoPor' });
db.CrmAutomationExecution.belongsTo(db.CrmAutomationRule, { foreignKey: 'rule_id', as: 'rule' });
db.CrmAutomationRule.hasMany(db.CrmAutomationExecution, { foreignKey: 'rule_id', as: 'executions' });
db.CrmAutomationExecution.belongsTo(db.CrmLead, { foreignKey: 'lead_id', as: 'lead' });
db.CrmLead.hasMany(db.CrmAutomationExecution, { foreignKey: 'lead_id', as: 'automationExecutions' });
db.CrmAutomationExecution.belongsTo(db.CrmConversation, { foreignKey: 'conversation_id', as: 'conversation' });
db.CrmConversation.hasMany(db.CrmAutomationExecution, { foreignKey: 'conversation_id', as: 'automationExecutions' });
db.CrmAutomationExecution.belongsTo(db.User, { foreignKey: 'created_by_user_id', as: 'criadoPor' });
db.User.hasMany(db.CrmAutomationExecution, { foreignKey: 'created_by_user_id', as: 'crmAutomationExecutions' });

/* ===== FISCAL ===== */
db.EmpresaGrupo.hasMany(db.FiscalCompany, { foreignKey: 'empresa_id', as: 'fiscalCompanies' });
db.FiscalCompany.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresa' });

db.User.hasMany(db.FiscalCompany, { foreignKey: 'created_by', as: 'fiscalCompaniesCriadas' });
db.FiscalCompany.belongsTo(db.User, { foreignKey: 'created_by', as: 'criadoPor' });
db.User.hasMany(db.FiscalCompany, { foreignKey: 'updated_by', as: 'fiscalCompaniesAtualizadas' });
db.FiscalCompany.belongsTo(db.User, { foreignKey: 'updated_by', as: 'atualizadoPor' });

db.FiscalCompany.hasMany(db.FiscalCertificate, { foreignKey: 'fiscal_company_id', as: 'certificates' });
db.FiscalCertificate.belongsTo(db.FiscalCompany, { foreignKey: 'fiscal_company_id', as: 'company' });
db.FiscalCertificate.belongsTo(db.User, { foreignKey: 'created_by', as: 'criadoPor' });
db.FiscalCertificate.belongsTo(db.User, { foreignKey: 'updated_by', as: 'atualizadoPor' });

db.FiscalCompany.hasMany(db.FiscalDfeSyncState, { foreignKey: 'fiscal_company_id', as: 'syncStates' });
db.FiscalDfeSyncState.belongsTo(db.FiscalCompany, { foreignKey: 'fiscal_company_id', as: 'company' });

db.FiscalCompany.hasMany(db.FiscalDfeDocument, { foreignKey: 'fiscal_company_id', as: 'documents' });
db.FiscalDfeDocument.belongsTo(db.FiscalCompany, { foreignKey: 'fiscal_company_id', as: 'company' });

db.FiscalDfeDocument.hasMany(db.FiscalDfeEvent, { foreignKey: 'fiscal_dfe_document_id', as: 'events' });
db.FiscalDfeEvent.belongsTo(db.FiscalDfeDocument, { foreignKey: 'fiscal_dfe_document_id', as: 'document' });

db.FiscalCompany.hasMany(db.FiscalSyncLog, { foreignKey: 'fiscal_company_id', as: 'syncLogs' });
db.FiscalSyncLog.belongsTo(db.FiscalCompany, { foreignKey: 'fiscal_company_id', as: 'company' });

db.FiscalDfeDocument.hasMany(db.FiscalDocumentLink, { foreignKey: 'fiscal_dfe_document_id', as: 'links' });
db.FiscalDocumentLink.belongsTo(db.FiscalDfeDocument, { foreignKey: 'fiscal_dfe_document_id', as: 'document' });

db.FiscalDfeDocument.hasMany(db.FiscalDivergence, { foreignKey: 'fiscal_dfe_document_id', as: 'divergences' });
db.FiscalDivergence.belongsTo(db.FiscalDfeDocument, { foreignKey: 'fiscal_dfe_document_id', as: 'document' });
db.FiscalDocumentLink.hasMany(db.FiscalDivergence, { foreignKey: 'fiscal_document_link_id', as: 'divergences' });
db.FiscalDivergence.belongsTo(db.FiscalDocumentLink, { foreignKey: 'fiscal_document_link_id', as: 'link' });

db.FiscalDocumentLink.belongsTo(db.Solicitacao, { foreignKey: 'solicitacao_id', as: 'solicitacao' });
db.FiscalDocumentLink.belongsTo(db.SolicitacaoCompra, { foreignKey: 'solicitacao_compra_id', as: 'solicitacaoCompra' });
db.FiscalDocumentLink.belongsTo(db.PedidoCompra, { foreignKey: 'pedido_id', as: 'pedido' });
db.FiscalDocumentLink.belongsTo(db.PedidoCompraItem, { foreignKey: 'pedido_item_id', as: 'pedidoItem' });
db.FiscalDocumentLink.belongsTo(db.TituloFinanceiro, { foreignKey: 'financeiro_titulo_id', as: 'tituloFinanceiro' });
db.FiscalDocumentLink.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.FiscalDocumentLink.belongsTo(db.Obra, { foreignKey: 'centro_custo_id', as: 'centroCusto' });
db.FiscalDocumentLink.belongsTo(db.Apropriacao, { foreignKey: 'apropriacao_id', as: 'apropriacao' });
db.FiscalDocumentLink.belongsTo(db.CategoriaFinanceira, { foreignKey: 'plano_financeiro_id', as: 'planoFinanceiro' });
db.FiscalDocumentLink.belongsTo(db.Parceiro, { foreignKey: 'fornecedor_id', as: 'fornecedor' });

db.FiscalCompany.hasMany(db.FiscalAccountingBatch, { foreignKey: 'fiscal_company_id', as: 'accountingBatches' });
db.FiscalAccountingBatch.belongsTo(db.FiscalCompany, { foreignKey: 'fiscal_company_id', as: 'company' });
db.FiscalAccountingBatch.belongsTo(db.User, { foreignKey: 'generated_by', as: 'geradoPor' });
db.FiscalAccountingBatch.hasMany(db.FiscalAccountingBatchItem, { foreignKey: 'batch_id', as: 'items' });
db.FiscalAccountingBatchItem.belongsTo(db.FiscalAccountingBatch, { foreignKey: 'batch_id', as: 'batch' });
db.FiscalDfeDocument.hasMany(db.FiscalAccountingBatchItem, { foreignKey: 'fiscal_dfe_document_id', as: 'accountingBatchItems' });
db.FiscalAccountingBatchItem.belongsTo(db.FiscalDfeDocument, { foreignKey: 'fiscal_dfe_document_id', as: 'document' });

/* ===== CUSTOS E RECEBIVEIS ===== */
db.CrPlanoObra.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.CrPlanoObra.belongsTo(db.User, { foreignKey: 'publicado_por', as: 'publicadoPor' });
db.CrPlanoObra.hasMany(db.CrPlanoItem, { foreignKey: 'plano_id', as: 'itens' });

db.CrPlanoItem.belongsTo(db.CrPlanoObra, { foreignKey: 'plano_id', as: 'plano' });
db.CrPlanoItem.belongsTo(db.CrPlanoItem, { foreignKey: 'item_pai_id', as: 'itemPai' });
db.CrPlanoItem.hasMany(db.CrPlanoItem, { foreignKey: 'item_pai_id', as: 'subitens' });
db.CrPlanoItem.hasMany(db.CrPlanoMacroVinculo, { foreignKey: 'plano_item_id', as: 'vinculosMacro' });

db.CrPlanoMacroVinculo.belongsTo(db.CrPlanoItem, { foreignKey: 'plano_item_id', as: 'planoItem' });
db.CrPlanoMacroVinculo.belongsTo(db.Apropriacao, { foreignKey: 'apropriacao_id', as: 'apropriacao' });

db.CrImportacao.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.CrImportacao.belongsTo(db.CrPlanoObra, { foreignKey: 'plano_id', as: 'plano' });
db.CrImportacao.belongsTo(db.User, { foreignKey: 'usuario_id', as: 'usuario' });

db.CrCompetencia.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.CrCompetencia.belongsTo(db.User, { foreignKey: 'finalizado_por', as: 'finalizadoPor' });
db.CrCompetencia.hasMany(db.CrPrevisaoCusto, { foreignKey: 'competencia_id', as: 'previsoesCusto' });
db.CrCompetencia.hasMany(db.CrPrevisaoReceita, { foreignKey: 'competencia_id', as: 'previsoesReceita' });
db.CrCompetencia.hasMany(db.CrMedicaoConsolidada, { foreignKey: 'competencia_id', as: 'medicoes' });
db.CrCompetencia.hasMany(db.CrRealizado, { foreignKey: 'competencia_id', as: 'realizados' });
db.CrCompetencia.hasMany(db.CrReabertura, { foreignKey: 'competencia_id', as: 'reaberturas' });

db.CrPrevisaoCusto.belongsTo(db.CrCompetencia, { foreignKey: 'competencia_id', as: 'competencia' });
db.CrPrevisaoCusto.belongsTo(db.CrPlanoItem, { foreignKey: 'plano_item_id', as: 'planoItem' });
db.CrPrevisaoCusto.belongsTo(db.Parceiro, { foreignKey: 'parceiro_id', as: 'parceiro' });
db.CrPrevisaoCusto.hasMany(db.CrPrevisaoReceita, { foreignKey: 'previsao_custo_id', as: 'medicoesPrevistas' });
db.CrPrevisaoCusto.hasMany(db.CrMedicaoConsolidada, { foreignKey: 'previsao_custo_id', as: 'medicoesAprovadas' });

db.CrPrevisaoReceita.belongsTo(db.CrCompetencia, { foreignKey: 'competencia_id', as: 'competencia' });
db.CrPrevisaoReceita.belongsTo(db.CrPlanoItem, { foreignKey: 'plano_item_id', as: 'planoItem' });
db.CrPrevisaoReceita.belongsTo(db.CrPrevisaoCusto, { foreignKey: 'previsao_custo_id', as: 'previsaoCusto' });
db.CrPrevisaoReceita.belongsTo(db.ContratoComercialParcela, { foreignKey: 'contrato_parcela_id', as: 'contratoParcela' });
db.CrPrevisaoReceita.belongsTo(db.TituloFinanceiro, { foreignKey: 'titulo_financeiro_id', as: 'tituloFinanceiro' });

db.CrMedicaoConsolidada.belongsTo(db.CrCompetencia, { foreignKey: 'competencia_id', as: 'competencia' });
db.CrMedicaoConsolidada.belongsTo(db.CrPlanoItem, { foreignKey: 'plano_item_id', as: 'planoItem' });
db.CrMedicaoConsolidada.belongsTo(db.CrPrevisaoCusto, { foreignKey: 'previsao_custo_id', as: 'previsaoCusto' });
db.CrMedicaoConsolidada.belongsTo(db.User, { foreignKey: 'registrado_por', as: 'registradoPor' });

db.CrRealizado.belongsTo(db.CrCompetencia, { foreignKey: 'competencia_id', as: 'competencia' });
db.CrRealizado.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.CrRealizado.belongsTo(db.CrPlanoItem, { foreignKey: 'plano_item_id', as: 'planoItem' });
db.CrRealizado.belongsTo(db.TituloFinanceiro, { foreignKey: 'titulo_financeiro_id', as: 'tituloFinanceiro' });
db.CrRealizado.belongsTo(db.MovimentoFinanceiro, { foreignKey: 'movimento_financeiro_id', as: 'movimentoFinanceiro' });

db.CrResponsavelObra.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.CrResponsavelObra.belongsTo(db.User, { foreignKey: 'user_id', as: 'usuario' });

db.CrObrigacaoUsuario.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.CrObrigacaoUsuario.belongsTo(db.User, { foreignKey: 'user_id', as: 'usuario' });

db.CrReabertura.belongsTo(db.CrCompetencia, { foreignKey: 'competencia_id', as: 'competencia' });
db.CrReabertura.belongsTo(db.User, { foreignKey: 'solicitado_por', as: 'solicitadoPor' });
db.CrReabertura.belongsTo(db.User, { foreignKey: 'aprovado_por', as: 'aprovadoPor' });

db.CrGuardBypass.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.CrGuardBypass.belongsTo(db.User, { foreignKey: 'user_id', as: 'usuario' });
db.CrGuardBypass.belongsTo(db.User, { foreignKey: 'concedido_por', as: 'concedidoPor' });
db.CrGuardBypass.belongsTo(db.User, { foreignKey: 'revogado_por', as: 'revogadoPor' });

db.CrAuditoria.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.CrAuditoria.belongsTo(db.CrCompetencia, { foreignKey: 'competencia_id', as: 'competencia' });
db.CrAuditoria.belongsTo(db.User, { foreignKey: 'usuario_id', as: 'usuario' });

/* ===== SST ===== */
[
  db.SstRisco,
  db.SstAgenteNocivo,
  db.SstPgr,
  db.SstLtcat,
  db.SstLtcatAvaliacao,
  db.SstPcmso,
  db.SstAso,
  db.SstExame,
  db.SstEpiEntrega,
  db.SstTreinamento,
  db.SstAcidente,
  db.SstDocumento,
  db.SstAmbienteTrabalho,
  db.SstExposicao,
  db.SstRegraConformidade,
  db.SstPoliticaBloqueio,
  db.SstBloqueioOperacional,
  db.SstNotificacao,
  db.SstPendenciaOperacional,
  db.SstComplianceScore,
  db.SstCriticidade,
  db.SstWorkflow,
  db.SstWorkflowExecucao,
  db.SstWorkflowAcao,
  db.SstWorkflowEvento,
  db.SstRecomendacaoOperacional,
  db.SstDocumentoAnaliseIa,
  db.SstIaDocumentLog,
  db.SstWorkflowLog,
  db.SstAutomationLog,
  db.SstBlockingLog,
  db.SstIntegrationLog,
  db.SstRolloutPlano,
  db.SstTelemetryMetric,
  db.SstOperationalAlert,
  db.SstHardeningPolicy,
  db.SstJob,
  db.SstQueueMetric,
  db.SstPerformanceMetric,
  db.SstCacheEntry,
  db.SstQualityIssue,
  db.SstGovernanceLog,
  db.SstEventoEsocial,
  db.SstEventoOperacional,
  db.SstHistorico
].forEach((model) => {
  if (model?.rawAttributes?.empresa_id) {
    db.EmpresaGrupo.hasMany(model, { foreignKey: 'empresa_id', as: `${model.name}Registros` });
    model.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresa' });
  }
  if (model?.rawAttributes?.obra_id) {
    db.Obra.hasMany(model, { foreignKey: 'obra_id', as: `${model.name}Registros` });
    model.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
  }
  if (model?.rawAttributes?.colaborador_id) {
    db.RhColaborador.hasMany(model, { foreignKey: 'colaborador_id', as: `${model.name}Registros` });
    model.belongsTo(db.RhColaborador, { foreignKey: 'colaborador_id', as: 'colaborador' });
  }
  if (model?.rawAttributes?.criado_por) {
    model.belongsTo(db.User, { foreignKey: 'criado_por', as: 'criadoPor' });
    model.belongsTo(db.User, { foreignKey: 'atualizado_por', as: 'atualizadoPor' });
  }
});

db.SstRisco.hasMany(db.SstAgenteNocivo, { foreignKey: 'risco_id', as: 'agentes' });
db.SstAgenteNocivo.belongsTo(db.SstRisco, { foreignKey: 'risco_id', as: 'risco' });
db.SstLtcat.hasMany(db.SstLtcatAvaliacao, { foreignKey: 'ltcat_id', as: 'avaliacoes' });
db.SstLtcatAvaliacao.belongsTo(db.SstLtcat, { foreignKey: 'ltcat_id', as: 'ltcat' });
db.SstAmbienteTrabalho.hasMany(db.SstExposicao, { foreignKey: 'ambiente_id', as: 'exposicoes' });
db.SstExposicao.belongsTo(db.SstAmbienteTrabalho, { foreignKey: 'ambiente_id', as: 'ambiente' });
db.SstRisco.hasMany(db.SstExposicao, { foreignKey: 'risco_id', as: 'exposicoes' });
db.SstExposicao.belongsTo(db.SstRisco, { foreignKey: 'risco_id', as: 'risco' });
db.SstAgenteNocivo.hasMany(db.SstExposicao, { foreignKey: 'agente_nocivo_id', as: 'exposicoes' });
db.SstExposicao.belongsTo(db.SstAgenteNocivo, { foreignKey: 'agente_nocivo_id', as: 'agenteNocivo' });
db.SstAso.hasMany(db.SstExame, { foreignKey: 'aso_id', as: 'examesComplementares' });
db.SstExame.belongsTo(db.SstAso, { foreignKey: 'aso_id', as: 'aso' });
db.User.hasMany(db.SstAcidente, { foreignKey: 'responsavel_id', as: 'acidentesSstResponsavel' });
db.SstAcidente.belongsTo(db.User, { foreignKey: 'responsavel_id', as: 'responsavel' });
db.SstPoliticaBloqueio.hasMany(db.SstBloqueioOperacional, { foreignKey: 'politica_id', as: 'bloqueios' });
db.SstBloqueioOperacional.belongsTo(db.SstPoliticaBloqueio, { foreignKey: 'politica_id', as: 'politica' });
db.User.hasMany(db.SstNotificacao, { foreignKey: 'usuario_id', as: 'notificacoesSst' });
db.SstNotificacao.belongsTo(db.User, { foreignKey: 'usuario_id', as: 'usuario' });
db.User.hasMany(db.SstPendenciaOperacional, { foreignKey: 'responsavel_id', as: 'pendenciasSstResponsavel' });
db.SstPendenciaOperacional.belongsTo(db.User, { foreignKey: 'responsavel_id', as: 'responsavel' });
db.SstWorkflow.hasMany(db.SstWorkflowAcao, { foreignKey: 'workflow_id', as: 'acoes' });
db.SstWorkflowAcao.belongsTo(db.SstWorkflow, { foreignKey: 'workflow_id', as: 'workflow' });
db.SstWorkflow.hasMany(db.SstWorkflowExecucao, { foreignKey: 'workflow_id', as: 'execucoes' });
db.SstWorkflowExecucao.belongsTo(db.SstWorkflow, { foreignKey: 'workflow_id', as: 'workflow' });
db.SstWorkflow.hasMany(db.SstWorkflowEvento, { foreignKey: 'workflow_id', as: 'eventosWorkflow' });
db.SstWorkflowEvento.belongsTo(db.SstWorkflow, { foreignKey: 'workflow_id', as: 'workflow' });
db.SstWorkflowExecucao.hasMany(db.SstWorkflowEvento, { foreignKey: 'execucao_id', as: 'eventos' });
db.SstWorkflowEvento.belongsTo(db.SstWorkflowExecucao, { foreignKey: 'execucao_id', as: 'execucao' });
db.SstEventoOperacional.hasMany(db.SstWorkflowExecucao, { foreignKey: 'evento_id', as: 'workflowExecucoes' });
db.SstWorkflowExecucao.belongsTo(db.SstEventoOperacional, { foreignKey: 'evento_id', as: 'eventoOperacional' });
db.SstEventoOperacional.hasMany(db.SstWorkflowEvento, { foreignKey: 'evento_operacional_id', as: 'workflowEventos' });
db.SstWorkflowEvento.belongsTo(db.SstEventoOperacional, { foreignKey: 'evento_operacional_id', as: 'eventoOperacional' });
db.SstDocumento.hasMany(db.SstDocumentoAnaliseIa, { foreignKey: 'documento_id', as: 'analisesIa' });
db.SstDocumentoAnaliseIa.belongsTo(db.SstDocumento, { foreignKey: 'documento_id', as: 'documento' });
db.SstDocumento.hasMany(db.SstIaDocumentLog, { foreignKey: 'documento_id', as: 'logsIa' });
db.SstIaDocumentLog.belongsTo(db.SstDocumento, { foreignKey: 'documento_id', as: 'documento' });
db.SstDocumentoAnaliseIa.hasMany(db.SstIaDocumentLog, { foreignKey: 'analise_id', as: 'logs' });
db.SstIaDocumentLog.belongsTo(db.SstDocumentoAnaliseIa, { foreignKey: 'analise_id', as: 'analise' });
db.SstWorkflow.hasMany(db.SstWorkflowLog, { foreignKey: 'workflow_id', as: 'logs' });
db.SstWorkflowLog.belongsTo(db.SstWorkflow, { foreignKey: 'workflow_id', as: 'workflow' });
db.SstWorkflowExecucao.hasMany(db.SstWorkflowLog, { foreignKey: 'execucao_id', as: 'logs' });
db.SstWorkflowLog.belongsTo(db.SstWorkflowExecucao, { foreignKey: 'execucao_id', as: 'execucao' });
db.SstBloqueioOperacional.hasMany(db.SstBlockingLog, { foreignKey: 'bloqueio_id', as: 'logs' });
db.SstBlockingLog.belongsTo(db.SstBloqueioOperacional, { foreignKey: 'bloqueio_id', as: 'bloqueio' });

/* ===== ESOCIAL ===== */
db.EmpresaGrupo.hasMany(db.EsocialLote, { foreignKey: 'empresa_id', as: 'esocialLotes' });
db.EsocialLote.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresa' });
db.EsocialLayoutVersion.hasMany(db.EsocialLote, { foreignKey: 'layout_version_id', as: 'lotes' });
db.EsocialLote.belongsTo(db.EsocialLayoutVersion, { foreignKey: 'layout_version_id', as: 'layoutVersion' });
db.EsocialLayoutVersion.hasMany(db.EsocialEvento, { foreignKey: 'layout_version_id', as: 'eventos' });
db.EsocialEvento.belongsTo(db.EsocialLayoutVersion, { foreignKey: 'layout_version_id', as: 'layoutVersion' });
db.EsocialLote.hasMany(db.EsocialEvento, { foreignKey: 'lote_id', as: 'eventos' });
db.EsocialEvento.belongsTo(db.EsocialLote, { foreignKey: 'lote_id', as: 'lote' });
db.EsocialEvento.hasMany(db.EsocialRetorno, { foreignKey: 'evento_id', as: 'retornos' });
db.EsocialRetorno.belongsTo(db.EsocialEvento, { foreignKey: 'evento_id', as: 'evento' });
db.EsocialLote.hasMany(db.EsocialRetorno, { foreignKey: 'lote_id', as: 'retornos' });
db.EsocialRetorno.belongsTo(db.EsocialLote, { foreignKey: 'lote_id', as: 'lote' });
db.EmpresaGrupo.hasMany(db.EsocialEvento, { foreignKey: 'empresa_id', as: 'esocialEventos' });
db.EsocialEvento.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresa' });
db.Obra.hasMany(db.EsocialEvento, { foreignKey: 'obra_id', as: 'esocialEventos' });
db.EsocialEvento.belongsTo(db.Obra, { foreignKey: 'obra_id', as: 'obra' });
db.RhColaborador.hasMany(db.EsocialEvento, { foreignKey: 'colaborador_id', as: 'esocialEventos' });
db.EsocialEvento.belongsTo(db.RhColaborador, { foreignKey: 'colaborador_id', as: 'colaborador' });
db.EsocialEvento.hasMany(db.EsocialTransmissionLog, { foreignKey: 'evento_id', as: 'transmissionLogs' });
db.EsocialTransmissionLog.belongsTo(db.EsocialEvento, { foreignKey: 'evento_id', as: 'evento' });
db.EsocialLote.hasMany(db.EsocialTransmissionLog, { foreignKey: 'lote_id', as: 'transmissionLogs' });
db.EsocialTransmissionLog.belongsTo(db.EsocialLote, { foreignKey: 'lote_id', as: 'lote' });
db.EsocialEvento.hasMany(db.EsocialXmlValidationLog, { foreignKey: 'evento_id', as: 'validationLogs' });
db.EsocialXmlValidationLog.belongsTo(db.EsocialEvento, { foreignKey: 'evento_id', as: 'evento' });
db.EsocialLote.hasMany(db.EsocialXmlValidationLog, { foreignKey: 'lote_id', as: 'validationLogs' });
db.EsocialXmlValidationLog.belongsTo(db.EsocialLote, { foreignKey: 'lote_id', as: 'lote' });
db.EsocialLote.hasMany(db.EsocialSoapLog, { foreignKey: 'lote_id', as: 'soapLogs' });
db.EsocialSoapLog.belongsTo(db.EsocialLote, { foreignKey: 'lote_id', as: 'lote' });

[
  db.EsocialTransmissionLog,
  db.EsocialCertificateLog,
  db.EsocialXmlValidationLog,
  db.EsocialSoapLog
].forEach((model) => {
  if (model?.rawAttributes?.empresa_id) {
    db.EmpresaGrupo.hasMany(model, { foreignKey: 'empresa_id', as: `${model.name}Registros` });
    model.belongsTo(db.EmpresaGrupo, { foreignKey: 'empresa_id', as: 'empresa' });
  }
  if (model?.rawAttributes?.criado_por) {
    model.belongsTo(db.User, { foreignKey: 'criado_por', as: 'criadoPor' });
    model.belongsTo(db.User, { foreignKey: 'atualizado_por', as: 'atualizadoPor' });
  }
});

db.GovernancaAccessLog.belongsTo(db.User, { foreignKey: 'usuario_id', as: 'usuario' });
db.User.hasMany(db.GovernancaAccessLog, { foreignKey: 'usuario_id', as: 'governancaAccessLogs' });
db.GovernancaEventoOperacional.belongsTo(db.User, { foreignKey: 'usuario_id', as: 'usuario' });
db.GovernancaEventoOperacional.belongsTo(db.Setor, { foreignKey: 'setor_id', as: 'setor' });
db.User.hasMany(db.GovernancaEventoOperacional, { foreignKey: 'usuario_id', as: 'governancaEventosOperacionais' });

/* ===== TREINAMENTO ===== */
db.TreinamentoConteudo.belongsTo(db.User, { foreignKey: 'criado_por', as: 'criadoPor' });
db.TreinamentoConteudo.belongsTo(db.User, { foreignKey: 'atualizado_por', as: 'atualizadoPor' });
db.TreinamentoConteudo.belongsTo(db.User, { foreignKey: 'publicado_por', as: 'publicadoPor' });
db.TreinamentoConteudo.hasMany(db.TreinamentoLeituraUsuario, { foreignKey: 'conteudo_id', as: 'leituras' });
db.TreinamentoLeituraUsuario.belongsTo(db.TreinamentoConteudo, { foreignKey: 'conteudo_id', as: 'conteudo' });
db.TreinamentoLeituraUsuario.belongsTo(db.User, { foreignKey: 'usuario_id', as: 'usuario' });

module.exports = db;
