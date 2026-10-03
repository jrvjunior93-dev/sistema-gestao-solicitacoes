import DateInputBR from '../components/DateInputBR';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFecharAoSair } from '../hooks/useFecharAoSair';
import {
  HiOutlineArrowPath,
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineDocumentArrowDown,
  HiOutlinePaperAirplane,
  HiOutlineShieldCheck,
  HiOutlineXCircle
} from 'react-icons/hi2';
import {
  aprovarPaymentBatch,
  cancelarPaymentBatch,
  confirmarBaixaPaymentIntent,
  criarPaymentBatch,
  enviarPaymentBatchBanco,
  enviarPaymentBatchBbSandbox,
  gerarComprovantePaymentBatchItem,
  getBbPaymentsHealth,
  getPaymentAccounts,
  getPaymentBatch,
  getPaymentBatchBbTransactions,
  getPaymentBatches,
  getPaymentEligibleTitulos,
  getPaymentEvents,
  getPaymentsAwaitingBaixa,
  rejeitarPaymentBatch,
  reprocessarPaymentBatch,
  sincronizarPaymentBatchStatusBb,
  submeterPaymentBatch
} from '../services/financeiro';
import { getObras } from '../services/obras';
import { useAuth } from '../contexts/AuthContext';
import {
  canApprovePagamentos,
  canAuditPagamentos,
  canCancelPagamentos,
  canConfirmarBaixaPagamento,
  canPreparePagamentos,
  canRejectPagamentos,
  canReprocessPagamentos,
  canSendPagamentosBanco,
  canSyncPagamentosBanco
} from '../utils/acessoProduto';
import StatusBadge from '../components/StatusBadge';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

const TABS = [
  { id: 'titulos', label: 'Títulos elegíveis' },
  { id: 'lotes', label: 'Lotes' },
  { id: 'baixas', label: 'Confirmar baixa', requiresConfirmBaixa: true },
  { id: 'auditoria', label: 'Auditoria técnica', requiresAudit: true }
];

const PAYMENT_EVENT_TYPES = [
  'BB_WEBHOOK_RECEIVED',
  'BB_BATCH_STATUS_SYNCED',
  'BB_SUBMIT_PIX_BATCH_RESPONSE'
];

const PAYMENT_EVENT_STATUSES = ['PENDENTE', 'PROCESSADO', 'ERRO'];

const BATCH_STEPS = [
  { statuses: ['RASCUNHO'], label: 'Rascunho' },
  { statuses: ['PENDENTE_APROVACAO'], label: 'Aprovação' },
  { statuses: ['APROVADO', 'ENFILEIRADO', 'ENVIANDO'], label: 'Aprovado' },
  { statuses: ['ENVIADO_AO_BANCO', 'PROCESSANDO_BANCO', 'ENVIO_INDETERMINADO'], label: 'Banco' },
  { statuses: ['AGUARDANDO_CONFIRMACAO_BAIXA', 'BAIXADO'], label: 'Baixa' }
];

const REQUIRED_PAYMENT_BATCH_APPROVALS = 1;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

/*
 * R25 — a tela devolvia CLASSE DE PALETA CRUA por status
 * (`bg-emerald-100 text-emerald-700` e irmãs). Paleta crua não tem par no
 * tema escuro e não passa pelo piso de contraste do ThemeContext.
 *
 * Agora a função devolve a FAMÍLIA SEMÂNTICA e quem pinta é o
 * `StatusBadge` do sistema — token + ícone, porque cor sozinha não
 * comunica. O mapa é o mesmo de antes, status por status, para o
 * significado não mudar junto com a cor: `SUCESSO` continua verde,
 * `ENFILEIRADO` continua âmbar e `CANCELADO` continua vermelho (o
 * classificador automático do StatusBadge leria os três de outro jeito).
 */
function familiaStatus(status) {
  const normalized = String(status || '').toUpperCase();
  if (['APROVADO', 'CONFIRMADO_BANCO', 'BAIXADO', 'SUCESSO'].includes(normalized)) return 'success';
  if (['PENDENTE_APROVACAO', 'ENVIADO_AO_BANCO', 'AGUARDANDO_CONFIRMACAO_BAIXA', 'ENFILEIRADO'].includes(normalized)) return 'warning';
  if (['REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO', 'CANCELADO', 'ERRO'].includes(normalized)) return 'danger';
  return 'neutral';
}

function compactFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
  );
}

function normalizeListResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getObraLabel(obra = {}) {
  return [obra.codigo, obra.nome].filter(Boolean).join(' - ') || `Obra #${obra.id}`;
}

function sumBy(list, fieldName) {
  return (Array.isArray(list) ? list : []).reduce((acc, item) => acc + Number(item?.[fieldName] || 0), 0);
}

function normalizeStatus(value) {
  return String(value || '').toUpperCase();
}

function canGeneratePaymentReceipt(item) {
  const status = normalizeStatus(item?.status || item?.intent?.status);
  return ['AGUARDANDO_CONFIRMACAO_BAIXA', 'BAIXADO', 'CONFIRMADO_BANCO', 'PAGO', 'QUITADO'].includes(status);
}

function getTituloCodigo(titulo) {
  return titulo?.codigo || `#${titulo?.id}`;
}

function getBeneficiaryLabel(titulo) {
  const beneficiary = titulo?.favorecido_pagamento;
  if (!beneficiary) return 'Sem favorecido';
  return `${beneficiary.nome || 'Favorecido'} - ${beneficiary.pix_tipo_chave || 'PIX'} ${beneficiary.pix_chave || ''}`;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function getPaymentAccountPendencies(account = {}) {
  const pendencies = [];
  if (account?.ativo === false) pendencies.push('Conta inativa.');
  if (!account?.empresa_id && !account?.empresa?.id) pendencies.push('Empresa pagadora pendente.');
  if (account?.contaBancaria && !account.contaBancaria.empresa_id) pendencies.push('Conta bancaria interna sem empresa vinculada.');
  if (account?.empresa_id && account?.contaBancaria?.empresa_id && Number(account.empresa_id) !== Number(account.contaBancaria.empresa_id)) {
    pendencies.push('Empresa da conta bancaria diverge da empresa pagadora.');
  }
  if (onlyDigits(account?.cnpj_pagador).length !== 14) pendencies.push('CNPJ pagador incompleto.');
  if (!account?.banco_codigo) pendencies.push('Banco pendente.');
  if (!account?.agencia) pendencies.push('Agencia pendente.');
  if (!account?.conta) pendencies.push('Conta pendente.');
  if (!account?.tipo_conta) pendencies.push('Tipo de conta pendente.');
  if (!account?.convenio) pendencies.push('Convenio pendente.');
  return pendencies;
}

function getPaymentAccountEmpresaId(account = {}) {
  return Number(account?.empresa_id || account?.empresa?.id || 0);
}

function getTituloEmpresaId(titulo = {}) {
  return Number(titulo?.empresa_id || titulo?.empresa?.id || 0);
}

function getTituloEmpresaLabel(titulo = {}) {
  return titulo?.empresa?.nome || titulo?.empresa?.razao_social || (titulo?.empresa_id ? `Empresa #${titulo.empresa_id}` : 'Empresa pendente');
}

function getAccountLabel(account = {}) {
  return account?.contaBancaria?.nome || account?.empresa?.nome || account?.empresa?.razao_social || (account?.id ? `Conta pagadora #${account.id}` : 'Conta pagadora pendente');
}

function getTituloPaymentAccountPendencies(titulo = {}, account = null) {
  const pendencies = [];
  const tituloEmpresaId = getTituloEmpresaId(titulo);
  const accountEmpresaId = getPaymentAccountEmpresaId(account);

  if (!tituloEmpresaId) {
    pendencies.push('Titulo sem empresa do titulo.');
  }
  if (!accountEmpresaId) {
    pendencies.push('Selecione uma conta pagadora completa.');
  }

  return pendencies;
}

function buildBatchGuidance(batch, approvalsCount, isBbRealProvider) {
  const status = normalizeStatus(batch?.status);
  if (!batch) {
    return {
      eyebrow: 'Revisao de lote',
      title: 'Selecione um lote para continuar',
      body: 'Escolha um lote na lista para conferir itens, aprovacoes e historico tecnico.',
      targetTab: 'lotes',
      actionLabel: 'Ver lotes'
    };
  }
  if (status === 'RASCUNHO') {
    return {
      eyebrow: 'Proximo passo',
      title: 'Submeter o lote para aprovacao',
      body: 'Confira conta pagadora, valor total e favorecidos antes de iniciar a aprovacao com MFA.'
    };
  }
  if (status === 'PENDENTE_APROVACAO') {
    return {
      eyebrow: 'Aprovacao',
      title: `${approvalsCount}/${REQUIRED_PAYMENT_BATCH_APPROVALS} aprovacao registrada`,
      body: 'O aprovador deve conferir os itens e informar MFA proprio. O criador do lote nao aprova o proprio lote.'
    };
  }
  if (status === 'APROVADO') {
    return {
      eyebrow: 'Envio bancario',
      title: isBbRealProvider ? 'Enviar para o Banco do Brasil' : 'Enviar em modo mock',
      body: 'Depois do envio, aguarde retorno bancario. A baixa financeira ainda nao deve ser feita nesta etapa.'
    };
  }
  if (['ENVIADO_AO_BANCO', 'PROCESSANDO_BANCO'].includes(status)) {
    return {
      eyebrow: 'Retorno bancario',
      title: 'Acompanhar retorno do banco',
      body: isBbRealProvider ? 'Use a sincronizacao BB para atualizar as transacoes.' : 'Use o retorno mock para simular confirmacao ou falha.'
    };
  }
  if (status === 'AGUARDANDO_CONFIRMACAO_BAIXA') {
    return {
      eyebrow: 'Baixa financeira',
      title: 'Confirmar baixa dos pagamentos liquidados',
      body: 'Somente pagamentos confirmados pelo banco devem virar baixa financeira no titulo.',
      targetTab: 'baixas',
      actionLabel: 'Ver baixas pendentes'
    };
  }
  if (['REJEITADO', 'FALHA_INTEGRACAO', 'PARCIALMENTE_REJEITADO'].includes(status)) {
    return {
      eyebrow: 'Correcao',
      title: 'Corrigir causa antes de reprocessar',
      body: 'Revise favorecido, conta pagadora, retorno tecnico e justificativas antes de gerar novo envio.'
    };
  }
  return {
    eyebrow: 'Status do lote',
    title: batch.status || 'Lote selecionado',
    body: 'Confira historico, itens e transacoes para definir a proxima acao operacional.'
  };
}

function getBatchStepIndex(status) {
  const normalized = normalizeStatus(status);
  const index = BATCH_STEPS.findIndex((step) => step.statuses.includes(normalized));
  return index >= 0 ? index : -1;
}

function getEventPayloadSummary(event = {}) {
  const payload = event.payload || {};
  const candidates = [
    payload.status,
    payload.estado,
    payload.situacao,
    payload.codigoEstado,
    payload.mensagem,
    payload.error?.message
  ].filter(Boolean);
  return candidates.length ? candidates.join(' - ') : 'Payload preservado para auditoria tecnica.';
}

export default function FinanceiroPagamentos() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('titulos');
  const [accounts, setAccounts] = useState([]);
  const [obras, setObras] = useState([]);
  const [titulos, setTitulos] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [bbHealth, setBbHealth] = useState(null);
  const [bbTransactions, setBbTransactions] = useState([]);
  const [paymentEvents, setPaymentEvents] = useState([]);
  const [awaitingBaixa, setAwaitingBaixa] = useState([]);
  const [filters, setFilters] = useState({
    vencimento_inicial: '',
    vencimento_final: '',
    parceiro_id: '',
    obra_id: '',
    categoria_financeira_id: '',
    somente_rh_dp: false
  });
  const [obraSearch, setObraSearch] = useState('');
  const [obraSuggestionsOpen, setObraSuggestionsOpen] = useState(false);
  /*
    A LISTA DE OBRAS NÃO FECHAVA DE JEITO NENHUM (05/09).

    Aqui o estado `obraSuggestionsOpen` até existia, mas ninguém o
    desligava sem consumir a busca: só `handleSelectObra` (escolher uma
    obra) e `handleClearObra` (o botão "Limpar") o punham em falso. Não
    havia caminho para apenas DISPENSAR a camada — e ela é `absolute
    z-dropdown` sobre a faixa de filtros, tapando "Origem" e "Conta pagadora"
    logo abaixo. Clicar fora não fazia nada; `Esc` não fazia nada.

    Faltava só o gancho: o estado já estava pronto, o hook agora o
    desliga. A seleção continua funcionando por duas razões, ambas
    conferidas: o ref envolve o campo E a lista (clique na opção é
    DENTRO, o hook não fecha no `mousedown`) e a opção já trazia
    `onMouseDown` com `preventDefault` de antes — foi a única das onze
    que já tinha a proteção.
  */
  const obraSugestoesRef = useRef(null);
  useFecharAoSair(obraSugestoesRef, obraSuggestionsOpen, () => setObraSuggestionsOpen(false));
  const [batchForm, setBatchForm] = useState({
    payment_account_id: '',
    data_programada: today()
  });
  const [eventFilters, setEventFilters] = useState({
    status: '',
    event_type: '',
    provider_event_id: '',
    payment_batch_id: '',
    payment_intent_id: '',
    data_inicio: '',
    data_fim: '',
    limit: '50'
  });
  const [mfaCode, setMfaCode] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [receiptLoading, setReceiptLoading] = useState('');
  const [loading, setLoading] = useState(true);
  /*
    R19/R3 — o `error` era um cartão só de erro; agora a tela usa a faixa de
    avisos do sistema (tom semântico, fechável, sucesso sumindo em 6s) e a
    confirmação do sistema no lugar dos três `window.prompt` que pediam
    justificativa de cancelamento, rejeição e reprocessamento de lote.
  */
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const canPrepare = useMemo(() => canPreparePagamentos(user), [user]);
  const canApprove = useMemo(() => canApprovePagamentos(user), [user]);
  const canSend = useMemo(() => canSendPagamentosBanco(user), [user]);
  const canReject = useMemo(() => canRejectPagamentos(user), [user]);
  const canAudit = useMemo(() => canAuditPagamentos(user), [user]);
  const canSync = useMemo(() => canSyncPagamentosBanco(user), [user]);
  const canCancel = useMemo(() => canCancelPagamentos(user), [user]);
  const canReprocess = useMemo(() => canReprocessPagamentos(user), [user]);
  const canConfirmBaixa = useMemo(() => canConfirmarBaixaPagamento(user), [user]);
  const isBbSandbox = Boolean(bbHealth?.realProviderEnabled ?? bbHealth?.sandboxRealEnabled);
  const bbAmbienteLabel = String(bbHealth?.env || '').toLowerCase() === 'production'
    ? 'BB PRODUCAO'
    : 'BB HOMOLOGACAO';
  const bbModoLabel = String(bbHealth?.env || '').toLowerCase() === 'production'
    ? 'producao BB habilitada'
    : 'homologacao BB habilitada';
  const visibleTabs = useMemo(() => TABS.filter((tab) => {
    if (tab.requiresAudit && !canAudit) return false;
    if (tab.requiresConfirmBaixa && !canConfirmBaixa) return false;
    return true;
  }), [canAudit, canConfirmBaixa]);

  const obrasFiltradas = useMemo(() => {
    const term = normalizeSearchText(obraSearch);
    if (!term) return [];
    return obras
      .filter((obra) => normalizeSearchText(`${obra.codigo || ''} ${obra.nome || ''}`).includes(term))
      .slice(0, 8);
  }, [obraSearch, obras]);

  async function loadBase() {
    try {
      setLoading(true);
      const [accountsData, batchesData, baixaData, bbHealthData, obrasData] = await Promise.all([
        getPaymentAccounts().catch(() => []),
        getPaymentBatches().catch(() => []),
        getPaymentsAwaitingBaixa().catch(() => []),
        getBbPaymentsHealth().catch(() => null),
        getObras().catch(() => [])
      ]);
      const accountList = Array.isArray(accountsData) ? accountsData : [];
      const firstOperationalAccount = accountList.find((account) => getPaymentAccountPendencies(account).length === 0);
      setAccounts(accountList);
      setObras(normalizeListResponse(obrasData));
      setBatches(Array.isArray(batchesData) ? batchesData : []);
      setAwaitingBaixa(Array.isArray(baixaData) ? baixaData : []);
      setBbHealth(bbHealthData);
      setBatchForm((current) => ({
        ...current,
        payment_account_id: current.payment_account_id || String(firstOperationalAccount?.id || '')
      }));
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar pagamentos');
    } finally {
      setLoading(false);
    }
  }

  function handleObraSearchChange(value) {
    setObraSearch(value);
    setObraSuggestionsOpen(Boolean(value.trim()));
    setFilters((current) => ({ ...current, obra_id: '' }));
  }

  function handleSelectObra(obra) {
    setObraSearch(getObraLabel(obra));
    setObraSuggestionsOpen(false);
    setFilters((current) => ({ ...current, obra_id: String(obra.id || '') }));
  }

  function handleClearObra() {
    setObraSearch('');
    setObraSuggestionsOpen(false);
    setFilters((current) => ({ ...current, obra_id: '' }));
  }

  async function loadTitulos() {
    try {
      setActionLoading('titulos');
      const data = await getPaymentEligibleTitulos(compactFilters(filters));
      setTitulos(Array.isArray(data) ? data : []);
      setSelectedIds([]);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao buscar titulos elegiveis');
    } finally {
      setActionLoading('');
    }
  }

  async function loadBatch(id) {
    if (!id) return;
    try {
      setActionLoading(`batch-${id}`);
      const data = await getPaymentBatch(id);
      setSelectedBatch(data);
      const transactionsData = await getPaymentBatchBbTransactions(id).catch(() => []);
      setBbTransactions(Array.isArray(transactionsData) ? transactionsData : []);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar lote');
    } finally {
      setActionLoading('');
    }
  }

  async function loadPaymentEvents() {
    try {
      setActionLoading('eventos');
      const data = await getPaymentEvents(compactFilters(eventFilters));
      setPaymentEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao buscar eventos tecnicos de pagamento');
    } finally {
      setActionLoading('');
    }
  }

  async function refreshAfterAction(batchId = selectedBatch?.id) {
    await loadBase();
    if (batchId) await loadBatch(batchId);
    if (activeTab === 'auditoria' && canAudit) await loadPaymentEvents();
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (activeTab === 'auditoria' && canAudit && paymentEvents.length === 0) {
      loadPaymentEvents();
    }
  }, [activeTab, canAudit]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'lotes');
    }
  }, [activeTab, visibleTabs]);

  const selectedTotal = useMemo(() => {
    const selected = new Set(selectedIds.map(String));
    return titulos.reduce((acc, titulo) => selected.has(String(titulo.id)) ? acc + Number(titulo.valor_saldo || 0) : acc, 0);
  }, [selectedIds, titulos]);

  const validApprovals = useMemo(() => (
    Array.isArray(selectedBatch?.approvals)
      ? selectedBatch.approvals.filter((approval) => approval.acao === 'APPROVE' && approval.status === 'APROVADO')
      : []
  ), [selectedBatch]);
  const batchCapabilities = selectedBatch?.action_capabilities || {};

  const paymentOverview = useMemo(() => {
    const activeAccounts = accounts.filter((account) => getPaymentAccountPendencies(account).length === 0);
    const pendingApproval = batches.filter((batch) => normalizeStatus(batch?.status) === 'PENDENTE_APROVACAO');
    const bankProcessing = batches.filter((batch) => ['ENVIADO_AO_BANCO', 'PROCESSANDO_BANCO', 'FALHA_INTEGRACAO'].includes(normalizeStatus(batch?.status)));

    return {
      activeAccounts: activeAccounts.length,
      totalAccounts: accounts.length,
      pendingApprovalCount: pendingApproval.length,
      pendingApprovalValue: sumBy(pendingApproval, 'valor_total'),
      bankProcessingCount: bankProcessing.length,
      bankProcessingValue: sumBy(bankProcessing, 'valor_total'),
      awaitingBaixaCount: awaitingBaixa.length,
      awaitingBaixaValue: sumBy(awaitingBaixa, 'valor'),
      certificateConfigured: Boolean(bbHealth?.certificateConfigured),
      modeLabel: isBbSandbox ? bbAmbienteLabel : 'Mock interno'
    };
  }, [accounts, awaitingBaixa, batches, bbAmbienteLabel, bbHealth, isBbSandbox]);

  const selectedPaymentAccount = useMemo(() => (
    accounts.find((account) => String(account.id) === String(batchForm.payment_account_id))
  ), [accounts, batchForm.payment_account_id]);

  const selectedPaymentAccountPendencies = useMemo(
    () => (selectedPaymentAccount ? getPaymentAccountPendencies(selectedPaymentAccount) : []),
    [selectedPaymentAccount]
  );

  const selectedIdsSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  const selectableTitulosIds = useMemo(() => (
    titulos
      .filter((titulo) => titulo.elegivel_pagamento && getTituloPaymentAccountPendencies(titulo, selectedPaymentAccount).length === 0)
      .map((titulo) => titulo.id)
  ), [selectedPaymentAccount, titulos]);

  const allSelectableTitulosSelected = useMemo(() => (
    selectableTitulosIds.length > 0 && selectableTitulosIds.every((id) => selectedIdsSet.has(String(id)))
  ), [selectableTitulosIds, selectedIdsSet]);

  const selectedTitulosAccountPendencies = useMemo(() => {
    return titulos
      .filter((titulo) => selectedIdsSet.has(String(titulo.id)))
      .map((titulo) => ({
        titulo,
        pendencias: getTituloPaymentAccountPendencies(titulo, selectedPaymentAccount)
      }))
      .filter((item) => item.pendencias.length > 0);
  }, [selectedIdsSet, selectedPaymentAccount, titulos]);

  const titulosOverview = useMemo(() => {
    const eligible = titulos.filter((titulo) => titulo.elegivel_pagamento);
    const compatible = eligible.filter((titulo) => getTituloPaymentAccountPendencies(titulo, selectedPaymentAccount).length === 0);
    const operationalBlocked = eligible.length - compatible.length;
    return {
      total: titulos.length,
      eligibleCount: eligible.length,
      compatibleCount: compatible.length,
      blockedCount: Math.max(titulos.length - eligible.length, 0),
      operationalBlockedCount: Math.max(operationalBlocked, 0),
      selectedCount: selectedIds.length,
      selectedTotal,
      selectedOperationalBlockedCount: selectedTitulosAccountPendencies.length
    };
  }, [selectedIds.length, selectedPaymentAccount, selectedTitulosAccountPendencies.length, selectedTotal, titulos]);

  const pageGuidance = useMemo(() => {
    if (activeTab === 'titulos') {
      if (paymentOverview.activeAccounts === 0) {
        return {
          eyebrow: 'Preparacao',
          title: 'Cadastre uma conta pagadora completa',
          body: 'Sem empresa pagadora, CNPJ, dados bancarios e convenio, o financeiro nao consegue montar lote com informacoes reais.',
          targetTab: 'titulos',
          actionLabel: 'Selecionar titulos'
        };
      }
      if (!titulosOverview.total) {
        return {
          eyebrow: 'Preparacao',
          title: 'Busque os titulos elegiveis',
          body: 'Use os filtros para montar uma lista curta e conferir favorecidos antes de gerar o lote.'
        };
      }
      if (titulosOverview.selectedCount > 0) {
        return {
          eyebrow: 'Lote em montagem',
          title: `${titulosOverview.selectedCount} titulo(s) selecionado(s)`,
          body: titulosOverview.selectedOperationalBlockedCount
            ? `${titulosOverview.selectedOperationalBlockedCount} titulo(s) selecionado(s) ainda tem pendencia operacional.`
            : `${formatCurrency(titulosOverview.selectedTotal)} pronto para gerar lote, desde que conta pagadora e data estejam corretas.`
        };
      }
      return {
        eyebrow: 'Conferencia',
        title: `${titulosOverview.compatibleCount} titulo(s) pronto(s) para lote`,
        body: titulosOverview.blockedCount || titulosOverview.operationalBlockedCount
          ? `${titulosOverview.blockedCount} com pendencias cadastrais e ${titulosOverview.operationalBlockedCount} com pendencia operacional.`
          : 'Selecione os titulos que realmente devem ser pagos neste lote.'
      };
    }

    if (activeTab === 'lotes') {
      return buildBatchGuidance(selectedBatch, validApprovals.length, isBbSandbox);
    }

    if (activeTab === 'auditoria') {
      return {
        eyebrow: 'Auditoria tecnica',
        title: `${paymentEvents.length} evento(s) tecnico(s) na consulta`,
        body: 'Use essa leitura para investigar webhook, polling, respostas do provider e status de processamento. Evento tecnico nao substitui baixa financeira.'
      };
    }

    if (awaitingBaixa.length > 0) {
      return {
        eyebrow: 'Baixa financeira',
        title: `${awaitingBaixa.length} pagamento(s) aguardando baixa`,
        body: `${formatCurrency(sumBy(awaitingBaixa, 'valor'))} ja foi confirmado pelo banco e precisa de baixa operacional.`
      };
    }

    return {
      eyebrow: 'Baixa financeira',
      title: 'Nenhuma baixa pendente',
      body: 'Quando o banco confirmar pagamentos, eles aparecerao aqui para baixa semiautomatica.'
    };
  }, [activeTab, awaitingBaixa, isBbSandbox, paymentEvents.length, paymentOverview.activeAccounts, selectedBatch, titulosOverview, validApprovals.length]);

  const selectedBatchStepIndex = useMemo(() => getBatchStepIndex(selectedBatch?.status), [selectedBatch?.status]);
  const cancelRequiresMfa = ['PENDENTE_APROVACAO', 'APROVADO'].includes(String(selectedBatch?.status || '').toUpperCase());

  function toggleTitulo(id) {
    setSelectedIds((current) => (
      current.map(String).includes(String(id))
        ? current.filter((item) => String(item) !== String(id))
        : [...current, id]
    ));
  }

  function toggleTodosTitulosElegiveis() {
    setSelectedIds((current) => {
      const selectable = selectableTitulosIds.map(String);
      const currentSet = new Set(current.map(String));
      const alreadyAllSelected = selectable.length > 0 && selectable.every((id) => currentSet.has(id));

      if (alreadyAllSelected) {
        return current.filter((id) => !selectable.includes(String(id)));
      }

      return Array.from(new Set([...current, ...selectableTitulosIds]));
    });
  }

  function handlePaymentAccountChange(value) {
    setBatchForm((current) => ({ ...current, payment_account_id: value }));
    setSelectedIds([]);
  }

  async function handleCriarLote() {
    try {
      if (!selectedIds.length) {
        avisar.erro('Selecione ao menos um título elegível.');
        return;
      }
      if (selectedTitulosAccountPendencies.length > 0) {
        avisar.erro('Remova da seleção os títulos com pendência operacional antes de gerar o lote.');
        return;
      }
      setActionLoading('criar-lote');
      const data = await criarPaymentBatch({
        titulo_ids: selectedIds,
        payment_account_id: Number(batchForm.payment_account_id),
        data_programada: batchForm.data_programada
      });
      setSelectedIds([]);
      setActiveTab('lotes');
      await refreshAfterAction(data?.id);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao criar lote');
    } finally {
      setActionLoading('');
    }
  }

  /*
    FAMÍLIA D / consentimento — `lote` é o registro que a confirmação CITOU,
    fixado ANTES do `await` do modal e repassado até a chamada do serviço.

    Com o `window.prompt` a página ficava bloqueada e nada podia mudar entre
    a pergunta e a ação. Com o modal do sistema a tela continua montada: a
    lista de lotes ao lado segue clicável, e reler `selectedBatch` DEPOIS da
    confirmação faria a tela perguntar sobre o lote A e cancelar o lote B —
    consentimento válido registrado para uma ação que ninguém autorizou.
    Por isso o lote entra por parâmetro; o padrão continua sendo o
    selecionado, para as ações que não passam por confirmação.
  */
  async function runBatchAction(name, callback, lote = selectedBatch) {
    if (!lote?.id) return;
    try {
      setActionLoading(name);
      await callback(lote.id);
      setMfaCode('');
      await refreshAfterAction(lote.id);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao executar acao do lote');
    } finally {
      setActionLoading('');
    }
  }

  async function handleConfirmBaixa(intentId) {
    try {
      setActionLoading(`baixa-${intentId}`);
      await confirmarBaixaPaymentIntent(intentId, {});
      await refreshAfterAction();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao confirmar baixa');
    } finally {
      setActionLoading('');
    }
  }

  async function handleGerarComprovanteItem(item) {
    if (!selectedBatch?.id || !item?.id) return;
    try {
      setReceiptLoading(String(item.id));
      const data = await gerarComprovantePaymentBatchItem(selectedBatch.id, item.id);
      const url = data?.signed_url || data?.comprovante_pdf_url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      await refreshAfterAction(selectedBatch.id);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao gerar comprovante de pagamento');
    } finally {
      setReceiptLoading('');
    }
  }

  /*
    R19/R3 — as TRÊS caixas do navegador desta tela (cancelar, rejeitar e
    reprocessar lote) pediam a justificativa em `window.prompt`. Mesma caixa
    do Chrome pelos mesmos motivos: ignora tema e tokens, bloqueia a página,
    não existe no DOM (o harness não a mede) e some sem rastro. Agora é o
    `campo` da confirmação do sistema, num passo só.

    R21 — o retorno se DESESTRUTURA. `confirmar()` devolve { ok, texto } e
    objeto é SEMPRE truthy: ler como booleano faria "Cancelar" CANCELAR O
    LOTE. É o defeito de 03/09, aqui num lote de pagamento.

    FAMÍLIA D — cada mensagem cita `lote.codigo`, `lote.quantidade_itens` e
    `lote.valor_total`, os três lidos do MESMO registro cujo `.id` a ação
    recebe (`runBatchAction(..., lote)`), no mesmo instante. Não há coleção
    paralela: a ação endereça um lote, e todo número citado é campo dele.

    Irreversibilidade declarada no texto, em todas as três: cancelamento e
    rejeição não voltam atrás, e o reprocessamento gera um envio novo ao
    banco — se o anterior estiver indeterminado, o dinheiro pode sair duas
    vezes, e é isso que o texto diz antes de a pessoa confirmar.

    `obrigatorio` só na rejeição, porque era a única das três em que o
    `prompt` vazio já era recusado. Nas outras duas o texto vazio caía numa
    justificativa padrão que vai no payload — exigir agora mudaria o payload
    possível, e payload não é decisão de layout.
  */
  async function handleCancelBatch() {
    const lote = selectedBatch;
    if (!lote?.id) return;
    if (cancelRequiresMfa && !String(mfaCode || '').trim()) {
      avisar.erro('Informe o código MFA para cancelar lote pendente de aprovação ou aprovado.');
      return;
    }

    const { ok, texto } = await confirmar({
      titulo: 'Cancelar este lote de pagamento?',
      mensagem: `O lote ${lote.codigo} — ${lote.quantidade_itens} item(ns), ${formatCurrency(lote.valor_total)} — para de seguir para o banco e os titulos voltam a ficar sem lote. Esta ação não pode ser desfeita: para pagar estes titulos será preciso montar um lote novo.`,
      rotuloConfirmar: 'Cancelar lote',
      destrutiva: true,
      campo: { rotulo: 'Motivo do cancelamento', multilinha: true }
    });
    if (!ok) return;

    runBatchAction('cancelar', (id) => cancelarPaymentBatch(id, {
      justificativa: texto.trim() || 'Cancelado pela operacao financeira.',
      codigo_mfa: cancelRequiresMfa ? mfaCode : undefined
    }), lote);
  }

  async function handleRejectBatch() {
    const lote = selectedBatch;
    if (!lote?.id) return;

    const { ok, texto } = await confirmar({
      titulo: 'Rejeitar este lote de pagamento?',
      mensagem: `O lote ${lote.codigo} — ${lote.quantidade_itens} item(ns), ${formatCurrency(lote.valor_total)} — será rejeitado e não segue para o banco. Esta ação não pode ser desfeita: depois dela o lote só volta ao fluxo por reprocessamento.`,
      rotuloConfirmar: 'Rejeitar lote',
      destrutiva: true,
      campo: { rotulo: 'Motivo da rejeição', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;

    const motivo = texto.trim();
    if (!motivo) {
      avisar.erro('Informe uma justificativa para rejeitar o lote.');
      return;
    }
    runBatchAction('rejeitar', (id) => rejeitarPaymentBatch(id, { justificativa: motivo }), lote);
  }

  async function handleReprocessBatch() {
    const lote = selectedBatch;
    if (!lote?.id) return;

    const { ok, texto } = await confirmar({
      titulo: 'Reprocessar este lote?',
      mensagem: `O lote ${lote.codigo} — ${lote.quantidade_itens} item(ns), ${formatCurrency(lote.valor_total)} — gera um NOVO envio ao banco. Confirme só depois de corrigir a causa da falha: envio feito não se desfaz, e se o envio anterior estiver indeterminado o pagamento pode sair duas vezes.`,
      rotuloConfirmar: 'Reprocessar lote',
      destrutiva: true,
      campo: { rotulo: 'Motivo do reprocessamento', multilinha: true }
    });
    if (!ok) return;

    runBatchAction('reprocessar', (id) => reprocessarPaymentBatch(id, {
      codigo_mfa: mfaCode,
      justificativa: texto.trim() || 'Reprocessamento solicitado pela operacao financeira.'
    }), lote);
  }

  return (
    <Pagina>
      {/*
        R13/C1/C2 — a faixa fixa do sistema no lugar da linha solta de
        título. O `h1` media 20px no desktop e 24px no md, à mão e fora dos
        degraus da escala (R10), e o apoio era um `page-subtitle` solto (R5):
        agora título em 22px e apoio + contagem em UMA linha, na própria
        faixa, que gruda abaixo da topbar e compacta sem sumir. Em lista de
        lotes longa, "Atualizar" continua a um clique (D3/C5: a primária
        sólida da tela).

        R11/C6 — saíram daqui os dois links de "ir para" (Titulos,
        Cadastros): navegação não é ação, e o menu, o breadcrumb e o Ctrl+K
        já levam a essas telas. É a remoção que a própria R11 autoriza pelo
        exemplo do "⋯" de Parceiros, e o mesmo recorte que a
        FinanceiroTitulos fez com os quatro links dela. O caminho não some
        da tela: o código de cada título elegível continua sendo um link
        para o título, e a conta pagadora traz por escrito onde cadastrar
        ("Financeiro > Cadastros Financeiros > Contas pagadoras BB").
      */}
      <PageHeader
        titulo="Pagamentos em Massa"
        contagem={loading ? null : `${batches.length} lote(s)`}
        descricao="Motor interno para lotes PIX por chave, com aprovação por MFA, integração Banco do Brasil e baixa semiautomatica."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar',
          onClick: loadBase,
          desabilitada: loading,
          icone: <HiOutlineArrowPath className={`h-4 w-4${loading ? ' animate-spin' : ''}`} />
        }}
      />

      {/* R19/R3: erro e resultado de ação em faixa do sistema, no topo do
          conteúdo — um dono só para "algo aconteceu agora" (R16). */}
      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      <div className="solicitacoes-toolbar">
        <div className="finance-category-toggle-group" role="tablist" aria-label="Navegação de pagamentos">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`finance-category-toggle ${activeTab === tab.id ? 'finance-category-toggle--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/*
          R25 — a pastilha de ambiente vinha de paleta crua (emerald/slate),
          que não tem par no tema escuro nem passa pelo piso de contraste;
          agora é o badge do sistema, com o tom vindo de token.
          C5 — ela desceu do cabeçalho para a barra de abas porque a faixa
          fixa carrega AÇÕES: o modo do banco é contexto, não ação. E é
          contexto que ninguém pode perder de vista, porque separa "sai
          dinheiro de verdade" de "mock interno".
        */}
        <span className={isBbSandbox ? 'badge badge-success' : 'badge badge-muted'} title={`Modo de envio bancário: ${isBbSandbox ? bbModoLabel : 'mock interno'}`}>
          {isBbSandbox ? bbAmbienteLabel : 'MOCK'}
        </span>
      </div>

      {!loading && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            className="card sol-surface-card text-left transition hover:-translate-y-0.5 hover:border-[var(--c-primary)]"
            onClick={() => setActiveTab('titulos')}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">Conta pagadora</p>
            <p className="mt-2 text-lg font-semibold text-[var(--c-text)]">
              {paymentOverview.activeAccounts}/{paymentOverview.totalAccounts}
            </p>
            <p className="mt-1 text-sm text-[var(--c-muted)]">
              {paymentOverview.activeAccounts > 0 ? 'Conta ativa pronta para preparar lotes.' : 'Cadastre uma conta ativa antes de gerar lote.'}
            </p>
          </button>
          <button
            type="button"
            className="card sol-surface-card text-left transition hover:-translate-y-0.5 hover:border-[var(--c-primary)]"
            onClick={() => setActiveTab(canAudit ? 'auditoria' : 'lotes')}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">Aguardando aprovação</p>
            <p className="mt-2 text-lg font-semibold text-[var(--c-text)]">{paymentOverview.pendingApprovalCount}</p>
            <p className="mt-1 text-sm text-[var(--c-muted)]">{formatCurrency(paymentOverview.pendingApprovalValue)} pendente de dupla conferencia.</p>
          </button>
          <button
            type="button"
            className="card sol-surface-card text-left transition hover:-translate-y-0.5 hover:border-[var(--c-primary)]"
            onClick={() => setActiveTab('lotes')}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">Banco / retorno</p>
            <p className="mt-2 text-lg font-semibold text-[var(--c-text)]">{paymentOverview.bankProcessingCount}</p>
            <p className="mt-1 text-sm text-[var(--c-muted)]">
              {paymentOverview.modeLabel} - {isBbSandbox ? (paymentOverview.certificateConfigured ? 'certificado configurado' : 'certificado pendente') : 'retorno simulado'}
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--c-muted)]">{formatCurrency(paymentOverview.bankProcessingValue)} em acompanhamento.</p>
          </button>
          <button
            type="button"
            className="card sol-surface-card text-left transition hover:-translate-y-0.5 hover:border-[var(--c-primary)]"
            onClick={() => setActiveTab('baixas')}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">Baixa pendente</p>
            <p className="mt-2 text-lg font-semibold text-[var(--c-text)]">{paymentOverview.awaitingBaixaCount}</p>
            <p className="mt-1 text-sm text-[var(--c-muted)]">{formatCurrency(paymentOverview.awaitingBaixaValue)} confirmado pelo banco aguardando baixa.</p>
          </button>
        </section>
      )}

      {!loading && (
        <section className="card sol-surface-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">{pageGuidance.eyebrow}</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--c-text)]">{pageGuidance.title}</h2>
              <p className="mt-1 text-sm text-[var(--c-muted)]">{pageGuidance.body}</p>
            </div>
            {pageGuidance.targetTab && pageGuidance.targetTab !== activeTab && (
              <button type="button" className="btn btn-outline" onClick={() => setActiveTab(pageGuidance.targetTab)}>
                {pageGuidance.actionLabel || 'Abrir etapa'}
              </button>
            )}
          </div>
        </section>
      )}

      {loading ? (
        <div className="app-empty-card">Carregando pagamentos...</div>
      ) : (
        <>
          {activeTab === 'titulos' && (
            <>
              {/*
                B1/B2/R10 — os cartões montados à mão viraram blocos do
                sistema: o ritmo vertical passa a vir do `Pagina` (o
                `space-y-4` da raiz saiu) e o bloco do RESULTADO é o único
                primário, com a barra de cor do módulo financeiro.

                R23 — EXCEÇÃO DECLARADA (consulta cara). São CINCO dimensões
                de recorte que o usuário combina (duas datas de vencimento,
                parceiro, obra e origem RH/DP), acima do teto de 3
                requisições da regra: aplicar a cada marca dispararia uma
                consulta por marca sobre a carteira a pagar. Por isso as
                marcas ficam em RASCUNHO e o recorte só vale no clique — o
                botão diz o que faz ("Buscar elegiveis") e o apoio do bloco
                avisa que a lista só muda ali.
              */}
              <BlocoConteudo
                titulo="Seleção para lote"
                variante="secundario"
                descricao="Contas a pagar abertas/parciais aparecem para conferência; so entram no lote os títulos com favorecido PIX completo e conta pagadora valida. Os filtros abaixo são rascunho: a lista so muda quando você clicar em Buscar elegíveis."
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                  <label className="sol-filter-field xl:col-span-2">
                    <span className="sol-filter-label">Vencimento início</span>
                    <DateInputBR className="input w-full" value={filters.vencimento_inicial} onChange={(e) => setFilters((c) => ({ ...c, vencimento_inicial: e.target.value }))} />
                  </label>
                  <label className="sol-filter-field xl:col-span-2">
                    <span className="sol-filter-label">Vencimento fim</span>
                    <DateInputBR className="input w-full" value={filters.vencimento_final} onChange={(e) => setFilters((c) => ({ ...c, vencimento_final: e.target.value }))} />
                  </label>
                  <label className="sol-filter-field xl:col-span-2">
                    <span className="sol-filter-label">Parceiro ID</span>
                    <input className="input w-full" inputMode="numeric" value={filters.parceiro_id} onChange={(e) => setFilters((c) => ({ ...c, parceiro_id: e.target.value }))} />
                  </label>
                  <div className="sol-filter-field relative xl:col-span-3" ref={obraSugestoesRef}>
                    <span className="sol-filter-label">Obra</span>
                    <div className="flex gap-2">
                      <input
                        className="input w-full"
                        value={obraSearch}
                        placeholder="Digite o nome da obra"
                        onChange={(e) => handleObraSearchChange(e.target.value)}
                        onFocus={() => setObraSuggestionsOpen(Boolean(obraSearch.trim()))}
                      />
                      {(obraSearch || filters.obra_id) && (
                        <button type="button" className="btn btn-outline px-3" onClick={handleClearObra}>
                          Limpar
                        </button>
                      )}
                    </div>
                    {obraSuggestionsOpen && (
                      <div className="absolute left-3 right-3 top-[calc(100%-0.5rem)] z-dropdown max-h-64 overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-2 shadow-xl">
                        {obrasFiltradas.length > 0 ? (
                          obrasFiltradas.map((obra) => (
                            <button
                              key={obra.id}
                              type="button"
                              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--ui-surface-soft)]"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleSelectObra(obra)}
                            >
                              <span className="font-semibold text-[var(--c-text)]">{obra.nome || `Obra #${obra.id}`}</span>
                              {obra.codigo && <span className="ml-2 text-xs text-[var(--c-muted)]">Codigo {obra.codigo}</span>}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-[var(--c-muted)]">Nenhuma obra encontrada com esse texto.</div>
                        )}
                      </div>
                    )}
                    <span className="app-note mt-2">
                      Selecione uma obra da lista para aplicar o filtro.
                    </span>
                  </div>
                  <label className="sol-filter-field xl:col-span-1">
                    <span className="sol-filter-label">Origem</span>
                    <span className="flex min-h-12 items-center gap-2 text-sm font-semibold text-[var(--c-text)]">
                      <input
                        type="checkbox"
                        checked={Boolean(filters.somente_rh_dp)}
                        onChange={(e) => setFilters((current) => ({ ...current, somente_rh_dp: e.target.checked }))}
                      />
                      RH/DP
                    </span>
                  </label>
                  <label className="sol-filter-field xl:col-span-2">
                    <span className="sol-filter-label">Conta pagadora</span>
                    <select className="input w-full" value={batchForm.payment_account_id} onChange={(e) => handlePaymentAccountChange(e.target.value)}>
                      <option value="">Selecione</option>
                      {accounts.map((account) => {
                        const pendencies = getPaymentAccountPendencies(account);
                        return (
                          <option key={account.id} value={account.id} disabled={pendencies.length > 0}>
                            {account.contaBancaria?.nome || `Conta ${account.id}`} - {account.empresa?.nome || 'Empresa pendente'} - CNPJ {account.cnpj_pagador || '-'} - Conv. {account.convenio || '-'}{pendencies.length ? ' - INCOMPLETA' : ''}
                          </option>
                        );
                      })}
                    </select>
                    {selectedPaymentAccountPendencies.length > 0 && (
                      <span className="mt-2 block text-xs font-medium text-[var(--sem-danger)]">
                        {selectedPaymentAccountPendencies.join(' ')}
                      </span>
                    )}
                    <span className="app-note mt-2">
                      Cadastre em Financeiro &gt; Cadastros Financeiros &gt; Contas pagadoras BB.
                    </span>
                  </label>
                  <label className="sol-filter-field xl:col-span-2">
                    <span className="sol-filter-label">Data pagamento</span>
                    <DateInputBR className="input w-full" min={today()} value={batchForm.data_programada} onChange={(e) => setBatchForm((c) => ({ ...c, data_programada: e.target.value }))} />
                  </label>
                </div>
                {canPrepare && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary" onClick={loadTitulos} disabled={actionLoading === 'titulos'}>
                      <HiOutlineClock className="h-4 w-4" />
                      {actionLoading === 'titulos' ? 'Buscando...' : 'Buscar elegiveis'}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={toggleTodosTitulosElegiveis} disabled={!selectableTitulosIds.length}>
                      {allSelectableTitulosSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={handleCriarLote} disabled={!selectedIds.length || !batchForm.payment_account_id || selectedPaymentAccountPendencies.length > 0 || selectedTitulosAccountPendencies.length > 0 || actionLoading === 'criar-lote'}>
                      <HiOutlineBanknotes className="h-4 w-4" />
                      {actionLoading === 'criar-lote' ? 'Gerando...' : `Gerar lote (${selectedIds.length})`}
                    </button>
                    <span className="badge badge-muted">{formatCurrency(selectedTotal)}</span>
                  </div>
                )}
                {selectedTitulosAccountPendencies.length > 0 && (
                  <div className="mt-3 rounded-lg border border-[var(--sem-danger-border)] bg-[var(--sem-danger-bg)] px-3 py-2 text-sm text-[var(--sem-danger)]">
                    Remova da seleção os títulos com pendência operacional antes de gerar o lote:
                    {' '}
                    {selectedTitulosAccountPendencies.map(({ titulo }) => getTituloCodigo(titulo)).join(', ')}.
                  </div>
                )}
                {titulosOverview.total > 0 && (
                  <div className="mt-4 grid gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-soft)] p-3 text-sm md:grid-cols-5">
                    <div>
                      <span className="block text-xs uppercase tracking-[0.14em] text-[var(--c-muted)]">Listados</span>
                      <strong className="text-[var(--c-text)]">{titulosOverview.total}</strong>
                    </div>
                    <div>
                      <span className="block text-xs uppercase tracking-[0.14em] text-[var(--c-muted)]">Elegíveis</span>
                      <strong className="text-[var(--sem-success)]">{titulosOverview.eligibleCount}</strong>
                    </div>
                    <div>
                      <span className="block text-xs uppercase tracking-[0.14em] text-[var(--c-muted)]">Prontos para lote</span>
                      <strong className={titulosOverview.operationalBlockedCount ? 'text-[var(--sem-warning)]' : 'text-[var(--sem-success)]'}>{titulosOverview.compatibleCount}</strong>
                    </div>
                    <div>
                      <span className="block text-xs uppercase tracking-[0.14em] text-[var(--c-muted)]">Com pendência</span>
                      <strong className={titulosOverview.blockedCount ? 'text-[var(--sem-warning)]' : 'text-[var(--c-text)]'}>{titulosOverview.blockedCount}</strong>
                    </div>
                    <div>
                      <span className="block text-xs uppercase tracking-[0.14em] text-[var(--c-muted)]">Selecionado</span>
                      <strong className="text-[var(--c-primary)]">{formatCurrency(titulosOverview.selectedTotal)}</strong>
                    </div>
                  </div>
                )}
              </BlocoConteudo>

              <BlocoConteudo
                titulo="Títulos elegíveis"
                variante="primario"
                cor="var(--module-financeiro)"
                contagem={titulos.length ? `${titulos.length} titulo(s)` : null}
                descricao="Marque os títulos que realmente devem ser pagos neste lote."
              >
                {titulos.length === 0 ? (
                  <div className="app-empty-card">Busque títulos a pagar para montar o primeiro lote.</div>
                ) : (
                  <>
                    {/* O "selecionar todos" morava no <th>; o cabeçalho da
                        TabelaPadrao é o menu de alinhamento/medida, então o
                        controle sobe para cima da tabela com a MESMA lógica
                        e agora com rótulo visível. */}
                    <label className="mb-3 flex items-center gap-2 text-sm text-[var(--c-muted)]">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos os títulos elegíveis"
                        checked={allSelectableTitulosSelected}
                        disabled={!selectableTitulosIds.length}
                        onChange={toggleTodosTitulosElegiveis}
                      />
                      Selecionar todos os títulos elegíveis
                    </label>
                    <TabelaPadrao
                      colunas={[
                        {
                          id: 'selecao',
                          sempreVisivel: true,
                          titulo: 'Sel.',
                          // Seleção em lote: coluna de marcação com render próprio.
                          tipo: 'status',
                          render: (titulo) => (
                            <input
                              type="checkbox"
                              checked={selectedIds.map(String).includes(String(titulo.id))}
                              disabled={!(titulo.elegivel_pagamento && getTituloPaymentAccountPendencies(titulo, selectedPaymentAccount).length === 0)}
                              onChange={() => toggleTitulo(titulo.id)}
                              aria-label={`Selecionar título ${getTituloCodigo(titulo)}`}
                            />
                          )
                        },
                        {
                          id: 'titulo',
                          titulo: 'Título',
                          tipo: 'codigo',
                          render: (titulo) => (
                            <div>
                              <Link to={`/financeiro/titulos/${titulo.id}`} className="font-medium text-[var(--c-primary)]">
                                {getTituloCodigo(titulo)}
                              </Link>
                              <div className="text-xs text-[var(--c-muted)]">{titulo.numero_documento || 'Sem documento'}</div>
                              <div className="text-xs text-[var(--c-muted)]">{getTituloEmpresaLabel(titulo)}</div>
                            </div>
                          )
                        },
                        {
                          id: 'credor',
                          titulo: 'Credor',
                          // R17: o credor NOMEIA o titulo a pagar.
                          tipo: 'identidade',
                          noCard: 'titulo',
                          render: (titulo) => titulo.parceiro?.nome || '-'
                        },
                        { id: 'favorecido', titulo: 'Favorecido PIX', tipo: 'texto', render: (titulo) => getBeneficiaryLabel(titulo) },
                        { id: 'vencimento', titulo: 'Vencimento', tipo: 'data', render: (titulo) => formatDate(titulo.data_vencimento) },
                        { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: (titulo) => formatCurrency(titulo.valor_saldo) },
                        {
                          id: 'status',
                          titulo: 'Status',
                          tipo: 'status',
                          render: (titulo) => {
                            const pendencias = getTituloPaymentAccountPendencies(titulo, selectedPaymentAccount);
                            return titulo.elegivel_pagamento && pendencias.length === 0
                              ? <StatusBadge status="ELEGIVEL" kind="success" />
                              : <span className="text-xs text-[var(--sem-warning)]">{[...(titulo.pendencias_pagamento || []), ...pendencias].join(' ')}</span>;
                          }
                        }
                      ]}
                      itens={titulos}
                      // A linha destacada em âmbar do markup antigo: título com
                      // pendência vira tarja de atenção da própria tabela.
                      urgencia={(titulo) => (titulo.elegivel_pagamento && getTituloPaymentAccountPendencies(titulo, selectedPaymentAccount).length === 0 ? null : 'warning')}
                      vazio="Busque títulos a pagar para montar o primeiro lote."
                      storageKey="tabela:financeiro-pagamentos:titulos"
                      rotuloRolagem="Titulos a pagar elegiveis"
                    />
                  </>
                )}
              </BlocoConteudo>
            </>
          )}

          {activeTab === 'lotes' && (
            <section className="grid gap-4 xl:grid-cols-[minmax(280px,420px)_1fr]">
              <BlocoConteudo
                titulo="Lotes recentes"
                variante="secundario"
                contagem={`${batches.length} lote(s)`}
              >
                <div className="app-list-stack">
                  {batches.length === 0 ? (
                    <p className="text-sm text-[var(--c-muted)]">Nenhum lote criado.</p>
                  ) : batches.map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      className="app-list-card text-left"
                      onClick={() => loadBatch(batch.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-[var(--c-text)]">{batch.codigo}</div>
                          <div className="text-xs text-[var(--c-muted)]">
                            {batch.quantidade_itens} item(ns) - {formatCurrency(batch.valor_total)}
                          </div>
                        </div>
                        <StatusBadge status={batch.status} kind={familiaStatus(batch.status)} />
                      </div>
                    </button>
                  ))}
                </div>
              </BlocoConteudo>

              <BlocoConteudo
                titulo={selectedBatch ? `Lote ${selectedBatch.codigo}` : 'Lote selecionado'}
                variante="primario"
                cor="var(--module-financeiro)"
                descricao={selectedBatch ? null : 'Escolha um lote na lista ao lado.'}
              >
                {!selectedBatch ? (
                  <div className="app-empty-card">Selecione um lote para revisar aprovações, envio e itens.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--c-text)]">{selectedBatch.codigo}</h2>
                        <p className="text-sm text-[var(--c-muted)]">
                          {selectedBatch.paymentAccount?.contaBancaria?.nome || 'Conta pagadora'} - {selectedBatch.paymentAccount?.cnpj_pagador || 'CNPJ nao informado'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status={selectedBatch.status} kind={familiaStatus(selectedBatch.status)} />
                        <span className="badge badge-muted">{formatCurrency(selectedBatch.valor_total)}</span>
                        <span className="badge badge-muted">{validApprovals.length}/{REQUIRED_PAYMENT_BATCH_APPROVALS} aprovacao</span>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-5">
                      {BATCH_STEPS.map((step, index) => {
                        const isCurrent = index === selectedBatchStepIndex;
                        const isDone = selectedBatchStepIndex > index;
                        const tone = isCurrent
                          ? 'border-[var(--c-primary)] bg-[var(--sem-info-bg)] text-[var(--c-primary)]'
                          : isDone
                            ? 'border-[var(--sem-success-border)] bg-[var(--sem-success-bg)] text-[var(--sem-success)]'
                            : 'border-[var(--ui-border)] bg-[var(--ui-surface-soft)] text-[var(--c-muted)]';
                        return (
                          <div key={step.label} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tone}`}>
                            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ui-surface)] text-xs">{index + 1}</span>
                            {step.label}
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid gap-3 md:grid-cols-[minmax(180px,260px)_1fr]">
                      <input
                        className="input w-full"
                        placeholder="Código MFA"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        {canPrepare && batchCapabilities.is_creator && (
                          <button type="button" className="btn btn-outline" onClick={() => runBatchAction('submeter', (id) => submeterPaymentBatch(id))} disabled={!batchCapabilities.can_submit || actionLoading === 'submeter'}>
                            <HiOutlineShieldCheck className="h-4 w-4" />
                            Submeter
                          </button>
                        )}
                        {canApprove && !batchCapabilities.is_creator && (
                          <button type="button" className="btn btn-primary" onClick={() => runBatchAction('aprovar', (id) => aprovarPaymentBatch(id, { codigo_mfa: mfaCode }))} disabled={!batchCapabilities.can_approve || !mfaCode || actionLoading === 'aprovar'}>
                            <HiOutlineCheckCircle className="h-4 w-4" />
                            Aprovar
                          </button>
                        )}
                        {canReject && (
                          <button type="button" className="btn btn-outline" onClick={handleRejectBatch} disabled={!['PENDENTE_APROVACAO', 'APROVADO'].includes(selectedBatch.status) || actionLoading === 'rejeitar'}>
                            <HiOutlineXCircle className="h-4 w-4" />
                            Rejeitar
                          </button>
                        )}
                        {canCancel && (
                          <button type="button" className="btn btn-outline" onClick={handleCancelBatch} disabled={!['RASCUNHO', 'EM_REVISAO', 'PENDENTE_APROVACAO', 'APROVADO'].includes(selectedBatch.status) || actionLoading === 'cancelar'}>
                            <HiOutlineXCircle className="h-4 w-4" />
                            {cancelRequiresMfa ? 'Cancelar com MFA' : 'Cancelar'}
                          </button>
                        )}
                        {!isBbSandbox && canSend && batchCapabilities.is_creator && (
                          <button type="button" className="btn btn-primary" onClick={() => runBatchAction('enviar', (id) => enviarPaymentBatchBanco(id, { codigo_mfa: mfaCode }))} disabled={!batchCapabilities.can_send || !mfaCode || actionLoading === 'enviar'}>
                            <HiOutlinePaperAirplane className="h-4 w-4" />
                            Enviar mock
                          </button>
                        )}
                        {isBbSandbox && canSend && batchCapabilities.is_creator && (
                          <button type="button" className="btn btn-primary" onClick={() => runBatchAction('enviar-bb', (id) => enviarPaymentBatchBbSandbox(id, { codigo_mfa: mfaCode }))} disabled={!batchCapabilities.can_send || !mfaCode || actionLoading === 'enviar-bb'}>
                            <HiOutlinePaperAirplane className="h-4 w-4" />
                            Enviar ao BB
                          </button>
                        )}
                        {canSync && (
                          <button type="button" className="btn btn-outline" onClick={() => runBatchAction('sync-bb', (id) => sincronizarPaymentBatchStatusBb(id))} disabled={!isBbSandbox || !['ENVIADO_AO_BANCO', 'PROCESSANDO_BANCO', 'ENVIO_INDETERMINADO', 'FALHA_INTEGRACAO', 'AGUARDANDO_CONFIRMACAO_BAIXA'].includes(selectedBatch.status) || actionLoading === 'sync-bb'}>
                            <HiOutlineArrowPath className="h-4 w-4" />
                            Sincronizar BB
                          </button>
                        )}
                        {canReprocess && batchCapabilities.is_creator && (
                          <button type="button" className="btn btn-outline" onClick={handleReprocessBatch} disabled={!batchCapabilities.can_reprocess || !mfaCode || actionLoading === 'reprocessar'}>
                            <HiOutlineArrowPath className="h-4 w-4" />
                            Reprocessar
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="app-note">
                      Modo BB: {isBbSandbox ? bbModoLabel : 'mock ativo'}
                      {isBbSandbox && (
                        <> - {bbHealth?.baseURL || 'URL BB nao informada'} - certificado {bbHealth?.certificateConfigured ? 'configurado' : 'pendente'}</>
                      )}
                    </div>
                    {selectedBatch.status === 'ENVIO_INDETERMINADO' && (
                      <div className="rounded-lg border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-3 py-2 text-sm font-semibold text-[var(--sem-warning)]">
                        O resultado do envio e indeterminado. Nao gere outro lote para os mesmos titulos; sincronize o status com o Banco do Brasil.
                      </div>
                    )}
                    {selectedBatch.status === 'APROVADO' && !batchCapabilities.is_creator && (
                      <div className="app-note">
                        Somente o usuário que criou este lote pode envia-lo ao banco depois da aprovação.
                      </div>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--c-text)]">Aprovações</h3>
                        <div className="mt-2 app-list-stack">
                          {(selectedBatch.approvals || []).length === 0 ? (
                            <div className="app-note">Nenhuma aprovação registrada.</div>
                          ) : selectedBatch.approvals.map((approval) => (
                            <div key={approval.id} className="app-list-card text-sm">
                              <div className="flex justify-between gap-3">
                                <span>{approval.acao} por usuario #{approval.aprovado_por}</span>
                                <StatusBadge status={approval.status} kind={familiaStatus(approval.status)} />
                              </div>
                              <div className="text-xs text-[var(--c-muted)]">{formatDateTime(approval.aprovado_em || approval.createdAt)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--c-text)]">Tentativas técnicas</h3>
                        <div className="mt-2 app-list-stack">
                          {(bbTransactions.length ? bbTransactions : selectedBatch.transactions || []).length === 0 ? (
                            <div className="app-note">Nenhuma tentativa registrada.</div>
                          ) : (bbTransactions.length ? bbTransactions : selectedBatch.transactions || []).map((transaction) => (
                            <div key={transaction.id} className="app-list-card text-sm">
                              <div className="flex justify-between gap-3">
                                <span>{transaction.provider_batch_id || transaction.correlation_id}</span>
                                <StatusBadge status={transaction.status} kind={familiaStatus(transaction.status)} />
                              </div>
                              <div className="text-xs text-[var(--c-muted)]">HTTP {transaction.http_status || '-'} - {formatDateTime(transaction.finished_at)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <TabelaPadrao
                      colunas={[
                        { id: 'item', titulo: 'Item', tipo: 'numero', render: (item) => item.sequencia },
                        { id: 'titulo', titulo: 'Título', tipo: 'codigo', render: (item) => getTituloCodigo(item.intent?.titulo) },
                        {
                          id: 'favorecido',
                          titulo: 'Favorecido',
                          // R17: o favorecido NOMEIA o item de pagamento.
                          tipo: 'identidade',
                          noCard: 'titulo',
                          render: (item) => (
                            <div>
                              {item.intent?.beneficiary?.nome || '-'}
                              <div className="text-xs text-[var(--c-muted)]">{item.intent?.beneficiary?.pix_chave || '-'}</div>
                            </div>
                          )
                        },
                        { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor) },
                        { id: 'status', titulo: 'Status', tipo: 'status', render: (item) => <StatusBadge status={item.status} kind={familiaStatus(item.status)} /> }
                      ]}
                      itens={selectedBatch.items || []}
                      vazio="Nenhum item neste lote."
                      storageKey="tabela:financeiro-pagamentos:itens-do-lote"
                      rotuloRolagem="Itens do lote de pagamento"
                      larguraAcoes={180}
                      acoesLinha={canAudit ? (item) => (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleGerarComprovanteItem(item)}
                          disabled={!canGeneratePaymentReceipt(item) || receiptLoading === String(item.id)}
                          title={canGeneratePaymentReceipt(item) ? 'Gerar ou abrir comprovante do pagamento' : 'Disponivel apos confirmacao do banco'}
                        >
                          <HiOutlineDocumentArrowDown className="h-4 w-4" />
                          {receiptLoading === String(item.id)
                            ? 'Gerando...'
                            : item.comprovante_pdf_url
                              ? 'Abrir'
                              : 'Gerar'}
                        </button>
                      ) : undefined}
                    />
                  </div>
                )}
              </BlocoConteudo>
            </section>
          )}

          {activeTab === 'baixas' && (
            <BlocoConteudo
              titulo="Pagamentos aguardando baixa"
              variante="primario"
              cor="var(--module-financeiro)"
              contagem={`${awaitingBaixa.length} pagamento(s)`}
              descricao="Somente pagamentos confirmados pelo banco viram baixa financeira no título."
            >
              {awaitingBaixa.length === 0 ? (
                <div className="app-empty-card">Nenhum pagamento confirmado pelo banco aguardando baixa.</div>
              ) : (
                <div className="app-list-stack">
                  {awaitingBaixa.map((intent) => (
                    <div key={intent.id} className="app-list-card">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-medium text-[var(--c-text)]">
                            {getTituloCodigo(intent.titulo)} - {formatCurrency(intent.valor)}
                          </div>
                          <div className="text-sm text-[var(--c-muted)]">
                            Confirmado pelo banco em {formatDateTime(intent.confirmado_banco_em)}
                          </div>
                          <div className="mt-1 text-xs text-[var(--c-muted)]">
                            Empresa: {getTituloEmpresaLabel(intent.titulo)} - Conta: {getAccountLabel(intent.paymentAccount)}
                          </div>
                          <div className="text-xs text-[var(--c-muted)]">
                            Favorecido: {intent.beneficiary?.nome || 'Favorecido pendente'} {intent.beneficiary?.pix_chave ? `- ${intent.beneficiary.pix_chave}` : ''}
                          </div>
                        </div>
                        {canConfirmBaixa && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleConfirmBaixa(intent.id)}
                            disabled={actionLoading === `baixa-${intent.id}`}
                          >
                            <HiOutlineCheckCircle className="h-4 w-4" />
                            {actionLoading === `baixa-${intent.id}` ? 'Confirmando...' : 'Confirmar baixa'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </BlocoConteudo>
          )}

          {activeTab === 'auditoria' && canAudit && (
            <>
              {/*
                R23 — EXCEÇÃO DECLARADA (consulta cara): OITO dimensões de
                recorte sobre a trilha técnica inteira, muito acima do teto de
                3 requisições. As marcas ficam em RASCUNHO e o recorte só vale
                no clique de "Consultar eventos".
              */}
              <BlocoConteudo
                titulo="Eventos técnicos"
                variante="secundario"
                descricao="Consulta para investigar provider, webhook, polling e respostas bancárias sem acionar baixa financeira. Os filtros abaixo são rascunho: a lista so muda quando você clicar em Consultar eventos."
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                  <label className="sol-filter-field xl:col-span-2">
                    <span className="sol-filter-label">Status</span>
                    <select className="input w-full" value={eventFilters.status} onChange={(e) => setEventFilters((c) => ({ ...c, status: e.target.value }))}>
                      <option value="">Todos</option>
                      {PAYMENT_EVENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">Tipo de evento</span>
                    <select className="input w-full" value={eventFilters.event_type} onChange={(e) => setEventFilters((c) => ({ ...c, event_type: e.target.value }))}>
                      <option value="">Todos</option>
                      {PAYMENT_EVENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">ID evento provedor</span>
                    <input className="input w-full" value={eventFilters.provider_event_id} onChange={(e) => setEventFilters((c) => ({ ...c, provider_event_id: e.target.value }))} />
                  </label>
                  <label className="sol-filter-field xl:col-span-1">
                    <span className="sol-filter-label">Lote</span>
                    <input className="input w-full" inputMode="numeric" value={eventFilters.payment_batch_id} onChange={(e) => setEventFilters((c) => ({ ...c, payment_batch_id: e.target.value }))} />
                  </label>
                  <label className="sol-filter-field xl:col-span-1">
                    <span className="sol-filter-label">Intent</span>
                    <input className="input w-full" inputMode="numeric" value={eventFilters.payment_intent_id} onChange={(e) => setEventFilters((c) => ({ ...c, payment_intent_id: e.target.value }))} />
                  </label>
                  <label className="sol-filter-field xl:col-span-1">
                    <span className="sol-filter-label">Limite</span>
                    <input className="input w-full" inputMode="numeric" value={eventFilters.limit} onChange={(e) => setEventFilters((c) => ({ ...c, limit: e.target.value }))} />
                  </label>
                  <label className="sol-filter-field xl:col-span-2">
                    <span className="sol-filter-label">Recebido de</span>
                    <DateInputBR className="input w-full" value={eventFilters.data_inicio} onChange={(e) => setEventFilters((c) => ({ ...c, data_inicio: e.target.value }))} />
                  </label>
                  <label className="sol-filter-field xl:col-span-2">
                    <span className="sol-filter-label">Recebido até</span>
                    <DateInputBR className="input w-full" value={eventFilters.data_fim} onChange={(e) => setEventFilters((c) => ({ ...c, data_fim: e.target.value }))} />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" onClick={loadPaymentEvents} disabled={actionLoading === 'eventos'}>
                    <HiOutlineArrowPath className="h-4 w-4" />
                    {actionLoading === 'eventos' ? 'Consultando...' : 'Consultar eventos'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      setEventFilters({
                        status: '',
                        event_type: '',
                        provider_event_id: '',
                        payment_batch_id: '',
                        payment_intent_id: '',
                        data_inicio: '',
                        data_fim: '',
                        limit: '50'
                      });
                    }}
                  >
                    Limpar
                  </button>
                  <span className="badge badge-muted">{paymentEvents.length} evento(s)</span>
                </div>
              </BlocoConteudo>

              <BlocoConteudo
                titulo="Trilha técnica"
                variante="primario"
                cor="var(--module-financeiro)"
                contagem={paymentEvents.length ? `${paymentEvents.length} evento(s)` : null}
                descricao="Evento técnico não substitui baixa financeira."
              >
                {paymentEvents.length === 0 ? (
                  <div className="app-empty-card">Nenhum evento técnico encontrado para os filtros atuais.</div>
                ) : (
                  <TabelaPadrao
                    colunas={[
                      { id: 'recebido', titulo: 'Recebido', tipo: 'data', render: (event) => formatDateTime(event.received_at) },
                      {
                        id: 'evento',
                        titulo: 'Evento',
                        // R17: o tipo do evento NOMEIA o registro tecnico.
                        tipo: 'identidade',
                        noCard: 'titulo',
                        render: (event) => (
                          <div>
                            <span className="font-medium text-[var(--c-text)]">{event.event_type}</span>
                            <div className="text-xs text-[var(--c-muted)]">Evento #{event.id}</div>
                          </div>
                        )
                      },
                      {
                        id: 'provider',
                        titulo: 'Provider',
                        tipo: 'texto',
                        render: (event) => (
                          <div>
                            {event.provider?.codigo || `Provider #${event.provider_id}`}
                            <div className="text-xs text-[var(--c-muted)]">{event.provider?.ambiente || '-'}</div>
                          </div>
                        )
                      },
                      {
                        id: 'referencia',
                        titulo: 'Referência',
                        tipo: 'codigo',
                        render: (event) => (
                          <div>
                            <div className="font-medium text-[var(--c-text)]">{event.provider_event_id || '-'}</div>
                            <div className="text-xs text-[var(--c-muted)]">
                              {event.batch ? `Lote ${event.batch.codigo}` : event.payment_batch_id ? `Lote #${event.payment_batch_id}` : 'Sem lote'}
                              {event.intent ? ` - Intent #${event.intent.id}` : event.payment_intent_id ? ` - Intent #${event.payment_intent_id}` : ''}
                            </div>
                          </div>
                        )
                      },
                      {
                        id: 'status',
                        titulo: 'Status',
                        tipo: 'status',
                        render: (event) => (
                          <div>
                            <StatusBadge status={event.processing_status} kind={familiaStatus(event.processing_status)} />
                            {event.processing_error && <div className="mt-1 text-xs text-[var(--sem-danger)]">{event.processing_error}</div>}
                          </div>
                        )
                      },
                      { id: 'resumo', titulo: 'Resumo', tipo: 'texto', render: (event) => <span className="text-[var(--c-muted)]">{getEventPayloadSummary(event)}</span> }
                    ]}
                    itens={paymentEvents}
                    vazio="Nenhum evento técnico encontrado para os filtros atuais."
                    storageKey="tabela:financeiro-pagamentos:eventos"
                    rotuloRolagem="Eventos tecnicos de pagamento"
                  />
                )}
              </BlocoConteudo>
            </>
          )}
        </>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
