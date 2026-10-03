import DateInputBR from '../../../components/DateInputBR';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineCheckCircle,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineArrowDownTray,
  HiOutlineArrowUpTray,
  HiOutlineExclamationTriangle,
  HiOutlineLockClosed,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
  HiOutlineTrash
} from 'react-icons/hi2';
import { CelulaDupla, TabelaPadrao, useConfirmacao } from '../../../components/padrao';
import CrPlanningImportModal from './CrPlanningImportModal';
import { COMPETENCIA_ESTADO_LABELS } from '../constants/custosRecebiveis';
import { useFecharAoSair } from '../../../hooks/useFecharAoSair';
import {
  consolidarMedicaoCompetencia,
  registrarSemMedicaoCompetencia,
  baixarModeloPlanilhaPlanejamento,
  decidirReaberturaCompetencia,
  finalizarPlanejamentoCompetencia,
  obterPlanejamentoCompetencia,
  pesquisarItensPlanoCompetencia,
  salvarCustosCompetencia,
  salvarRecebiveisCompetencia,
  solicitarReaberturaCompetencia,
  validarArquivoPlanilhaPlanejamento,
  solicitarReaberturaObraCompetencia
} from '../services/custosRecebiveis';
import {
  buildPlanningDraftKey,
  hasPlanningDraft,
  readPlanningDraft,
  removePlanningDraft,
  writePlanningDraft
} from '../utils/planningDraftStorage';
import { monthLabel, monthShort, monthSlash } from '../utils/prazos';
import {
  ajustarPrevisaoAoSaldo,
  mensagemErroPlanilha,
  novaChaveIdempotencia
} from '../services/custosRecebiveisPrevisao';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const PUBLIC_STEPS = [
  { id: 1, label: 'Custos planejados' },
  { id: 2, label: 'Medição prevista' },
  { id: 3, label: 'Revisão e envio' }
];

const PRIVATE_STEPS = [
  { id: 1, label: 'Custos planejados' },
  { id: 2, label: 'Recebíveis do período' }
];

function asNumber(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });

function formatQuantity(value, unit = '') {
  const text = quantityFormat.format(asNumber(value));
  return unit ? `${text} ${unit}` : text;
}

function pickBalanceField(row, key) {
  if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  const nested = row?.item?.[key];
  return nested === undefined ? null : nested;
}

/*
  Saldo da medição prevista (Fase 5, regra "A + B" de 29/09). O servidor manda
  por item: saldo disponível (teto que bloqueia), previsto aguardando aprovação
  (meses anteriores ainda sem medição aprovada) e saldo provável (disponível -
  pendente, só aviso). Servidor sem esses campos: cai no cálculo anterior
  (orçado - já aprovado) e nada de aviso.
*/
// Linha de apoio da quantidade orçada na medição prevista: valor unitário e
// total planejado (antes eram duas colunas próprias).
function budgetDetail(row) {
  const unit = row.unidade || 'un';
  return `${currency.format(row.custo_unitario || 0)}/${unit} · ${currency.format(row.valor_base || 0)}`;
}

function forecastBalance(row) {
  const approvedBefore = asNumber(pickBalanceField(row, 'quantidade_aprovada_anterior'));
  const rawAvailable = pickBalanceField(row, 'saldo_disponivel');
  const budget = row?.quantidade_base ?? row?.item?.quantidade_orcada;
  const available = rawAvailable != null
    ? asNumber(rawAvailable)
    : Math.max(0, asNumber(budget) - approvedBefore);
  const pending = asNumber(pickBalanceField(row, 'quantidade_prevista_pendente'));
  const months = pickBalanceField(row, 'competencias_pendentes');
  const pendingMonths = Array.isArray(months) ? months.filter(Boolean) : [];
  const rawProbable = pickBalanceField(row, 'saldo_provavel');
  const hasProbable = rawProbable != null;
  const probable = hasProbable ? asNumber(rawProbable) : Math.max(0, available - pending);
  const quantity = asNumber(row?.quantidade_prevista);
  const aboveProbable = hasProbable
    && pending > 0
    && quantity > probable + 0.0001
    && quantity <= available + 0.0001;
  return { approvedBefore, available, pending, pendingMonths, probable, hasProbable, quantity, aboveProbable };
}

function pendingMonthsText(balance) {
  const labels = balance.pendingMonths.map(monthLabel);
  if (!labels.length) return 'o mês anterior';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

function aboveProbableText(balance, unit) {
  const plural = balance.pendingMonths.length > 1;
  return `${pendingMonthsText(balance)} ainda não ${plural ? 'foram aprovados' : 'foi aprovado'}; `
    + `você previu ${formatQuantity(balance.pending, unit)} lá. `
    + `Saldo provável: ${formatQuantity(balance.probable, unit)}.`;
}

function sumSaved(list, field) {
  return (Array.isArray(list) ? list : []).reduce((sum, item) => {
    const value = item?.[field];
    if (value !== undefined && value !== null && value !== '') return sum + asNumber(value);
    return sum + (asNumber(item?.quantidade) * asNumber(item?.custo_unitario));
  }, 0);
}

function newLocalKey(prefix = 'cr-subitem') {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function planningRowKey(value = {}) {
  if (value.previsao_custo_id) return `custo:${Number(value.previsao_custo_id)}`;
  if (value.plano_item_id) return `plano:${Number(value.plano_item_id)}`;
  if (value.id) return `id:${Number(value.id)}`;
  return `local:${value.chave_local || ''}`;
}

function draftSignature(value) {
  return JSON.stringify(value ?? null);
}

function usePlanItemSearch(obraId, competencia, macroCode, query) {
  const [state, setState] = useState({ items: [], loading: false, error: '' });

  useEffect(() => {
    if (!obraId || !competencia || !macroCode) {
      setState({ items: [], loading: false, error: '' });
      return undefined;
    }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    const timer = window.setTimeout(async () => {
      try {
        const response = await pesquisarItensPlanoCompetencia(obraId, competencia, {
          q: query,
          page: 1,
          limit: 50,
          etapaMacroCodigo: macroCode
        });
        if (active) setState({ items: response.items || [], loading: false, error: '' });
      } catch (requestError) {
        if (active) {
          setState({
            items: [],
            loading: false,
            error: requestError.message || 'Não foi possível pesquisar a planilha.'
          });
        }
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [obraId, competencia, macroCode, query]);

  return state;
}

function privateReceiptStatusLabel(status) {
  const normalized = String(status || '').toUpperCase();
  const labels = {
    PREVISTO_CONTRATO: 'Previsto em contrato',
    ABERTO: 'Em aberto',
    EM_ABERTO: 'Em aberto',
    PENDENTE: 'Pendente',
    VENCIDO: 'Vencido',
    PAGO: 'Recebido',
    RECEBIDO: 'Recebido',
    QUITADO: 'Recebido',
    CANCELADO: 'Cancelado'
  };
  return labels[normalized] || normalized.replaceAll('_', ' ') || 'Não informado';
}

/*
  Faixa "a previsão do mês seguinte passou do saldo" (Fase 5, parte B).
  Aparece logo depois de registrar a medição aprovada do mês M (resposta traz
  `ajuste_previsao`) e no mês M+1 enquanto houver excesso
  (`ajuste_previsao_pendente`). O ajuste só REDUZ a quantidade prevista ao
  saldo disponível. Quem não pode ajustar vê a faixa sem o botão.
  Exportada para o detalhe do mês reutilizar a mesma faixa.
*/
export function CrAjustePrevisaoFaixa({ obraId, ajuste, canAdjust = false, onAdjusted, onDismiss = null }) {
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const itens = Array.isArray(ajuste?.itens) ? ajuste.itens : [];
  if (!ajuste?.competencia || !itens.length) return null;
  const mes = monthLabel(ajuste.competencia);

  async function ajustar() {
    if (busyRef.current) return;
    const obraAlvo = obraId;
    const competenciaAlvo = ajuste.competencia;
    const ids = itens.map((item) => Number(item.plano_item_id)).filter(Boolean);
    const mesAlvo = mes;
    const { ok } = await confirmar({
      titulo: `Ajustar previsão de ${mesAlvo} ao saldo`,
      mensagem: `A quantidade prevista de ${ids.length} item(ns) de ${mesAlvo} será reduzida ao saldo disponível. As demais linhas não mudam.`,
      rotuloConfirmar: 'Ajustar ao saldo'
    });
    if (!ok || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    // Uma chave por tentativa: o servidor devolve o mesmo resultado se o
    // mesmo pedido chegar duas vezes.
    const idempotencyKey = novaChaveIdempotencia();
    try {
      const result = await ajustarPrevisaoAoSaldo(obraAlvo, competenciaAlvo, ids, idempotencyKey);
      await onAdjusted?.(result, competenciaAlvo, ids.length);
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível ajustar a previsão ao saldo.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="cr-ajuste-previsao" aria-label={`Previsão de ${mes} acima do saldo`}>
      <header className="cr-ajuste-previsao__header">
        <HiOutlineExclamationTriangle className="h-5 w-5" aria-hidden="true" />
        <strong>A previsão de {mes} passou do saldo em {itens.length} item(ns)</strong>
        {canAdjust ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={ajustar}
          >
            {busy ? 'Ajustando...' : `Ajustar previsão de ${mes} ao saldo`}
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={onDismiss}
          >
            Fechar
          </button>
        ) : null}
      </header>
      {error ? <div className="cr-feedback" data-tone="error">{error}</div> : null}
      <TabelaPadrao
        colunasConfiguraveis={false}
        colunas={[
          {
            id: 'item',
            titulo: 'Item',
            tipo: 'identidade',
            noCard: 'titulo',
            render: (item) => <CelulaDupla principal={item.descricao || item.codigo} sub={item.codigo} />
          },
          { id: 'unidade', titulo: 'Unid.', tipo: 'codigo', render: (item) => item.unidade || 'un' },
          {
            id: 'quantidade_prevista',
            titulo: 'Previsto',
            tipo: 'numero',
            render: (item) => formatQuantity(item.quantidade_prevista)
          },
          {
            id: 'saldo_disponivel',
            titulo: 'Saldo disponível',
            tipo: 'numero',
            render: (item) => formatQuantity(item.saldo_disponivel)
          },
          {
            id: 'quantidade_sugerida',
            titulo: 'Após ajuste',
            tipo: 'numero',
            render: (item) => <strong>{formatQuantity(item.quantidade_sugerida ?? item.saldo_disponivel)}</strong>
          }
        ]}
        itens={itens}
        getId={(item) => String(item.plano_item_id)}
        storageKey="tabela:cr-planejamento:ajuste-previsao"
        rotuloRolagem={`Itens da previsão de ${mes} acima do saldo`}
        vazio="Nenhum item acima do saldo."
      />
      {elementoConfirmacao}
    </section>
  );
}

export default function CrPlanejamentoView({
  obra,
  userId,
  competencia,
  permissions,
  viewMode = 'planning',
  onChanged,
  onCompleted = null
}) {
  const [data, setData] = useState(null);
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [step, setStep] = useState(1);
  const [costs, setCosts] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [measurementPickerMacro, setMeasurementPickerMacro] = useState('');
  /*
    SÓ O ESC (06/09, decisão do cliente — D5).

    Esta lista é de resultado EM FLUXO: não cobre nada, empurra o
    formulário para baixo. Por isso ela NÃO recebe o fechamento por clique
    fora que as 35 camadas do sistema receberam. Medido o preço de
    converter por inteiro: clicar em outro campo do MESMO formulário
    passaria a sumir com a lista, no meio do preenchimento.

    Palavras do cliente: "o Esc dá saída sem esse risco".
  */
  useFecharAoSair(null, Boolean(measurementPickerMacro), () => setMeasurementPickerMacro(''), { apenasEsc: true });
  const [measurementSearch, setMeasurementSearch] = useState('');
  const [approvedPickerMacro, setApprovedPickerMacro] = useState('');
  const [approvedSearch, setApprovedSearch] = useState('');
  const [measurementJustification, setMeasurementJustification] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [sheetType, setSheetType] = useState('');
  const [sheetPreview, setSheetPreview] = useState(null);
  const [sheetLoading, setSheetLoading] = useState('');
  const [costErrors, setCostErrors] = useState([]);
  const [forecastNotices, setForecastNotices] = useState([]);
  const [adjustmentAfterRegister, setAdjustmentAfterRegister] = useState(null);
  // Mensagem da medição aprovada recém-registrada que ainda espera a decisão
  // sobre a faixa "ajustar previsão ao saldo" antes de voltar aos meses.
  const [completeAfterAdjustment, setCompleteAfterAdjustment] = useState('');
  const [savedTotals, setSavedTotals] = useState(null);
  const sheetFileRef = useRef(null);
  const sheetTypeRef = useRef('');
  const draftReadyRef = useRef(false);
  const latestDraftRef = useRef(null);
  const serverBaselineRef = useRef({
    costs: draftSignature([]),
    receipts: draftSignature([]),
    measurement: draftSignature({ items: [], justification: '' })
  });
  const draftKeys = useMemo(() => ({
    costs: buildPlanningDraftKey(userId, obra?.id, competencia, 'custos'),
    receipts: buildPlanningDraftKey(userId, obra?.id, competencia, 'medicao-prevista'),
    measurement: buildPlanningDraftKey(userId, obra?.id, competencia, 'medicao-aprovada')
  }), [competencia, obra?.id, userId]);
  const allDraftKeys = useMemo(() => Object.values(draftKeys).filter(Boolean), [draftKeys]);

  const load = useCallback(async () => {
    draftReadyRef.current = false;
    if (!obra?.id) {
      setData(null);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const response = await obterPlanejamentoCompetencia(obra.id, competencia);
      const serverCosts = response.custos || [];
      const serverReceipts = response.recebiveis || [];
      const serverMeasurements = response.obra?.classificacao === 'PUBLICA'
        ? response.medicoes || []
        : [];
      const serverJustification = serverMeasurements
        .find((item) => item.justificativa_glosa)?.justificativa_glosa || '';
      const planVersion = response.plano?.versao;
      const costsDraft = readPlanningDraft(draftKeys.costs, planVersion);
      const receiptsDraft = readPlanningDraft(draftKeys.receipts, planVersion);
      const measurementDraft = readPlanningDraft(draftKeys.measurement, planVersion);
      const restoredDrafts = [costsDraft, receiptsDraft, measurementDraft].filter(Boolean);

      serverBaselineRef.current = {
        costs: draftSignature(serverCosts),
        receipts: draftSignature(serverReceipts),
        measurement: draftSignature({
          items: serverMeasurements,
          justification: serverJustification
        })
      };
      setData(response);
      setSavedTotals({
        costs: sumSaved(serverCosts, 'valor_previsto'),
        receipts: sumSaved(serverReceipts, 'valor_previsto')
      });
      setCosts(Array.isArray(costsDraft?.items) ? costsDraft.items : serverCosts);
      setReceipts(Array.isArray(receiptsDraft?.items) ? receiptsDraft.items : serverReceipts);
      if (response.obra?.classificacao === 'PUBLICA') {
        setMeasurements(
          Array.isArray(measurementDraft?.items) ? measurementDraft.items : serverMeasurements
        );
        setMeasurementJustification(
          measurementDraft?.justification ?? serverJustification
        );
      } else {
        setMeasurements([]);
        setMeasurementJustification('');
      }
      const latestRestoredDraft = [...restoredDrafts].sort(
        (left, right) => Number(right?.meta?.salvo_em || 0) - Number(left?.meta?.salvo_em || 0)
      )[0];
      const rawRestoredStep = Number(latestRestoredDraft?.meta?.etapa);
      const restoredStep = rawRestoredStep >= 4 ? 3 : rawRestoredStep;
      const maxStep = response.obra?.classificacao === 'PUBLICA' ? PUBLIC_STEPS.length : PRIVATE_STEPS.length;
      if (restoredStep >= 1 && restoredStep <= maxStep) setStep(restoredStep);
      setHasLocalDraft(restoredDrafts.length > 0);
      setDraftNotice(restoredDrafts.length ? 'Rascunho local restaurado' : '');
      draftReadyRef.current = true;
    } catch (requestError) {
      setData(null);
      setError(requestError.message || 'Erro ao carregar planejamento.');
    } finally {
      setLoading(false);
    }
  }, [competencia, draftKeys, obra?.id]);

  useEffect(() => {
    setStep(1);
    setFeedback('');
    setMeasurementPickerMacro('');
    setMeasurementSearch('');
    setApprovedPickerMacro('');
    setApprovedSearch('');
    setMeasurementJustification('');
    setDraftNotice('');
    setHasLocalDraft(false);
    setCostErrors([]);
    setForecastNotices([]);
    setAdjustmentAfterRegister(null);
    setCompleteAfterAdjustment('');
    load();
  }, [load, viewMode]);

  const isPublic = (data?.obra?.classificacao || obra?.classificacao) === 'PUBLICA';
  const approvedOnly = viewMode === 'approved';
  const steps = isPublic ? PUBLIC_STEPS : PRIVATE_STEPS;
  const readonly = data?.regras?.editavel === false;
  latestDraftRef.current = {
    costs,
    receipts,
    measurements,
    measurementJustification,
    isPublic,
    permissions,
    planVersion: data?.plano?.versao,
    step
  };
  const forecastSearch = usePlanItemSearch(
    obra?.id,
    competencia,
    measurementPickerMacro,
    measurementSearch
  );
  const approvedItemSearch = usePlanItemSearch(
    obra?.id,
    competencia,
    approvedPickerMacro,
    approvedSearch
  );
  const totalCosts = useMemo(
    () => costs.reduce((sum, item) => sum + (asNumber(item.quantidade) * asNumber(item.custo_unitario)), 0),
    [costs]
  );
  const totalReceipts = useMemo(() => (
    isPublic
      ? receipts.reduce((sum, item) => sum + asNumber(item.valor_previsto), 0)
      : receipts.reduce((sum, item) => sum + asNumber(item.valor_previsto), 0)
  ), [isPublic, receipts]);
  const totalApproved = useMemo(
    () => measurements.reduce((sum, item) => sum + asNumber(item.valor_medido), 0),
    [measurements]
  );
  const totalGlosa = useMemo(
    () => Math.max(0, totalReceipts - totalApproved),
    [totalApproved, totalReceipts]
  );
  const costsDirty = draftSignature(costs) !== serverBaselineRef.current.costs;
  const receiptsDirty = isPublic && draftSignature(receipts) !== serverBaselineRef.current.receipts;
  const reviewStep = !approvedOnly && ((isPublic && step === 3) || (!isPublic && step === 2));
  // Título do editor: a etapa em curso (29/09, pedido do proprietário).
  let editorStageTitle = 'Custos previstos';
  if (approvedOnly) editorStageTitle = 'Medição aprovada';
  else if (step === 2) editorStageTitle = isPublic ? 'Medição prevista' : 'Recebíveis previstos';
  else if (step === 3) editorStageTitle = 'Revisão e envio';

  // Revisão e envio mostra o que está GRAVADO: ao entrar na etapa relê os
  // totais do servidor (sem mexer no que está em edição na tela).
  useEffect(() => {
    if (!reviewStep || !obra?.id || !competencia) return undefined;
    let active = true;
    obterPlanejamentoCompetencia(obra.id, competencia)
      .then((response) => {
        if (!active) return;
        setSavedTotals({
          costs: sumSaved(response.custos, 'valor_previsto'),
          receipts: sumSaved(response.recebiveis, 'valor_previsto')
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [competencia, obra?.id, reviewStep]);

  const refreshDraftPresence = useCallback(() => {
    setHasLocalDraft(hasPlanningDraft(allDraftKeys));
  }, [allDraftKeys]);
  const flushPlanningDrafts = useCallback(() => {
    if (!draftReadyRef.current || !latestDraftRef.current) return;
    const latest = latestDraftRef.current;
    const metadata = {
      userId,
      obraId: obra?.id,
      competencia,
      planVersion: latest.planVersion,
      step: latest.step
    };
    if (
      draftKeys.costs
      && latest.permissions?.costs
      && draftSignature(latest.costs) !== serverBaselineRef.current.costs
    ) {
      writePlanningDraft(draftKeys.costs, { items: latest.costs }, metadata);
    }
    if (
      draftKeys.receipts
      && latest.isPublic
      && latest.permissions?.receipts
      && draftSignature(latest.receipts) !== serverBaselineRef.current.receipts
    ) {
      writePlanningDraft(draftKeys.receipts, { items: latest.receipts }, metadata);
    }
    const measurementPayload = {
      items: latest.measurements,
      justification: latest.measurementJustification
    };
    if (
      draftKeys.measurement
      && latest.isPublic
      && latest.permissions?.measurement
      && draftSignature(measurementPayload) !== serverBaselineRef.current.measurement
    ) {
      writePlanningDraft(draftKeys.measurement, measurementPayload, metadata);
    }
  }, [competencia, draftKeys, obra?.id, userId]);

  useEffect(() => {
    window.addEventListener('pagehide', flushPlanningDrafts);
    return () => {
      window.removeEventListener('pagehide', flushPlanningDrafts);
      flushPlanningDrafts();
    };
  }, [flushPlanningDrafts]);

  useEffect(() => {
    if (!draftReadyRef.current || !draftKeys.costs || !data || !permissions.costs) {
      return undefined;
    }
    const signature = draftSignature(costs);
    if (signature === serverBaselineRef.current.costs) {
      removePlanningDraft(draftKeys.costs);
      refreshDraftPresence();
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (!draftReadyRef.current) return;
      const saved = writePlanningDraft(
        draftKeys.costs,
        { items: costs },
        {
          userId,
          obraId: obra.id,
          competencia,
          planVersion: data.plano?.versao,
          step
        }
      );
      setDraftNotice(saved ? 'Rascunho salvo neste dispositivo' : 'Não foi possível salvar o rascunho');
      refreshDraftPresence();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [competencia, costs, data, draftKeys.costs, obra?.id, permissions.costs, refreshDraftPresence, step, userId]);

  useEffect(() => {
    if (
      !draftReadyRef.current
      || !draftKeys.receipts
      || !data
      || !isPublic
      || !permissions.receipts
    ) return undefined;
    const signature = draftSignature(receipts);
    if (signature === serverBaselineRef.current.receipts) {
      removePlanningDraft(draftKeys.receipts);
      refreshDraftPresence();
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (!draftReadyRef.current) return;
      const saved = writePlanningDraft(
        draftKeys.receipts,
        { items: receipts },
        {
          userId,
          obraId: obra.id,
          competencia,
          planVersion: data.plano?.versao,
          step
        }
      );
      setDraftNotice(saved ? 'Rascunho salvo neste dispositivo' : 'Não foi possível salvar o rascunho');
      refreshDraftPresence();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [competencia, data, draftKeys.receipts, isPublic, obra?.id, permissions.receipts, receipts, refreshDraftPresence, step, userId]);

  useEffect(() => {
    if (
      !draftReadyRef.current
      || !draftKeys.measurement
      || !data
      || !isPublic
      || !permissions.measurement
    ) return undefined;
    const payload = { items: measurements, justification: measurementJustification };
    const signature = draftSignature(payload);
    if (signature === serverBaselineRef.current.measurement) {
      removePlanningDraft(draftKeys.measurement);
      refreshDraftPresence();
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (!draftReadyRef.current) return;
      const saved = writePlanningDraft(
        draftKeys.measurement,
        payload,
        {
          userId,
          obraId: obra.id,
          competencia,
          planVersion: data.plano?.versao,
          step
        }
      );
      setDraftNotice(saved ? 'Rascunho salvo neste dispositivo' : 'Não foi possível salvar o rascunho');
      refreshDraftPresence();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [competencia, data, draftKeys.measurement, isPublic, measurementJustification, measurements, obra?.id, permissions.measurement, refreshDraftPresence, step, userId]);

  async function discardLocalDraft() {
    // O texto diz o ESCOPO e diz que não volta atrás. Regra do cliente
    // (03/09): confirmação de ação destrutiva declara a irreversibilidade,
    // porque "descartar" sozinho deixa a pessoa supor que dá para recuperar.
    // Aqui são as três seções — custos, medição prevista e medição aprovada —
    // desta obra e competência, e nenhuma outra.
    const { ok } = await confirmar({
      titulo: 'Descartar rascunho',
      mensagem: 'Descartar as alterações não salvas de custos, medição prevista e medição aprovada desta obra e competência? Esta ação não pode ser desfeita.',
      rotuloConfirmar: 'Descartar',
      destrutiva: true
    });
    if (!ok) return;
    draftReadyRef.current = false;
    allDraftKeys.forEach(removePlanningDraft);
    setHasLocalDraft(false);
    await load();
    setDraftNotice('Rascunho descartado');
  }

  function updateCost(index, field, value) {
    setCostErrors((current) => current.filter((item) => item.index !== index));
    setCosts((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, [field]: value };
      next.valor_previsto = asNumber(next.quantidade) * asNumber(next.custo_unitario);
      return next;
    }));
  }

  function updateReceipt(index, field, value) {
    setReceipts((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, [field]: value };
      if (isPublic && field === 'quantidade_prevista') {
        // Teto duro = saldo disponível; o saldo provável só avisa.
        const availableQuantity = forecastBalance(item).available;
        next.quantidade_prevista = Math.min(
          availableQuantity,
          Math.max(0, asNumber(value))
        );
        next.valor_previsto = next.quantidade_prevista * asNumber(item.custo_unitario);
      }
      return next;
    }));
  }

  function updateMeasurement(index, field, value) {
    setMeasurements((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, [field]: value };
      if (field === 'quantidade_medida') {
        next.valor_medido = (
          asNumber(value) * asNumber(item.custo_unitario)
        ).toFixed(2);
      }
      return next;
    }));
  }

  function addReceipt(item) {
    if (!item?.id || receipts.some((row) => Number(row.plano_item_id) === Number(item.id))) return;
    const receipt = {
      previsao_custo_id: null,
      plano_item_id: item.id,
      etapa_macro_codigo: item.etapa_macro_codigo,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade_base: item.quantidade_orcada,
      custo_unitario: item.custo_unitario_orcado,
      valor_base: item.valor_orcado,
      item,
      quantidade_prevista: 0,
      valor_previsto: 0,
      data_prevista: ''
    };
    setReceipts((current) => [...current, receipt]);
    setMeasurementPickerMacro('');
    setMeasurementSearch('');
  }

  function addApprovedMeasurement(item) {
    if (!item?.id || measurements.some((row) => Number(row.plano_item_id) === Number(item.id))) return;
    setMeasurements((current) => [...current, {
      previsao_custo_id: null,
      plano_item_id: item.id,
      etapa_macro_codigo: item.etapa_macro_codigo,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade_base: item.quantidade_orcada,
      custo_unitario: item.custo_unitario_orcado,
      valor_base: item.valor_orcado,
      item,
      quantidade_medida: 0,
      valor_medido: 0,
      valor_glosa: 0,
      justificativa_glosa: '',
      data_medicao: '',
      numero_medicao: ''
    }]);
    setApprovedPickerMacro('');
    setApprovedSearch('');
  }

  function addCost() {
    setCosts((current) => [...current, {
      id: null,
      chave_local: newLocalKey(),
      plano_item_id: null,
      etapa_macro_codigo: null,
      descricao: '',
      unidade: '',
      ordem: current.length + 1,
      item: null,
      quantidade: '',
      custo_unitario: '',
      valor_previsto: 0,
      parceiro_id: null
    }]);
  }

  function removeReceipt(reference) {
    setReceipts((current) => current.filter(
      (item) => planningRowKey(item) !== reference
    ));
  }

  function removeMeasurement(reference) {
    setMeasurements((current) => current.filter(
      (item) => planningRowKey(item) !== reference
    ));
  }

  function removeCost(reference) {
    setCosts((current) => current.filter(
      (item) => planningRowKey(item) !== reference
    ));
  }

  async function downloadPlanningModel(type) {
    if (sheetLoading) return;
    try {
      setSheetLoading(`download:${type}`);
      setError('');
      await baixarModeloPlanilhaPlanejamento(
        obra.id,
        competencia,
        type,
        obra.codigo || obra.id
      );
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível baixar o modelo.');
    } finally {
      setSheetLoading('');
    }
  }

  function choosePlanningFile(type) {
    if (sheetLoading) return;
    sheetTypeRef.current = type;
    setSheetType(type);
    sheetFileRef.current?.click();
  }

  async function handlePlanningFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const importType = sheetTypeRef.current;
    if (!file || !importType) return;
    try {
      setSheetLoading(`upload:${importType}`);
      setError('');
      const response = await validarArquivoPlanilhaPlanejamento(
        obra.id,
        competencia,
        importType,
        file
      );
      setSheetType(importType);
      setSheetPreview(response);
    } catch (requestError) {
      setError(mensagemErroPlanilha(requestError));
      setSheetPreview(null);
    } finally {
      setSheetLoading('');
    }
  }

  function budgetItemFromImported(row, previousField) {
    return {
      id: Number(row.plano_item_id),
      codigo: row.item_codigo,
      descricao: row.descricao,
      unidade: row.unidade,
      quantidade_orcada: asNumber(row.quantidade_orcada),
      custo_unitario_orcado: asNumber(row.valor_unitario),
      valor_orcado: asNumber(row.quantidade_orcada) * asNumber(row.valor_unitario),
      etapa_macro_codigo: row.etapa_macro_codigo,
      [previousField]: Math.max(
        0,
        asNumber(row.quantidade_orcada) - asNumber(row.saldo_disponivel)
      ),
      ...(row.saldo_disponivel != null ? { saldo_disponivel: asNumber(row.saldo_disponivel) } : {}),
      ...(row.saldo_provavel != null ? {
        saldo_provavel: asNumber(row.saldo_provavel),
        quantidade_prevista_pendente: asNumber(row.quantidade_prevista_pendente),
        competencias_pendentes: Array.isArray(row.competencias_pendentes) ? row.competencias_pendentes : []
      } : {})
    };
  }

  function mergeImportedCosts(current, importRows) {
    const next = [...current];
    importRows.forEach((row) => {
      const identity = `${String(row.descricao || '').trim().toLocaleLowerCase('pt-BR')}|${String(row.unidade || '').trim().toLocaleLowerCase('pt-BR')}`;
      const index = next.findIndex((item) => (
        `${String(item.descricao || '').trim().toLocaleLowerCase('pt-BR')}|${String(item.unidade || '').trim().toLocaleLowerCase('pt-BR')}` === identity
      ));
      const imported = {
        ...(index >= 0 ? next[index] : {}),
        id: index >= 0 ? next[index].id : null,
        chave_local: index >= 0 ? next[index].chave_local : newLocalKey('cr-import-cost'),
        plano_item_id: null,
        etapa_macro_codigo: null,
        descricao: row.descricao,
        unidade: row.unidade,
        ordem: index >= 0
          ? next[index].ordem
          : next.length + 1,
        item: null,
        quantidade: asNumber(row.quantidade),
        custo_unitario: asNumber(row.valor_unitario),
        valor_previsto: asNumber(row.valor_total),
        parceiro_id: null
      };
      if (index >= 0) next[index] = imported;
      else next.push(imported);
    });
    return next;
  }

  function mergeImportedForecast(current, importRows) {
    const next = [...current];
    importRows.forEach((row) => {
      const item = budgetItemFromImported(row, 'quantidade_aprovada_anterior');
      const imported = {
        previsao_custo_id: null,
        plano_item_id: item.id,
        etapa_macro_codigo: item.etapa_macro_codigo,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade_base: item.quantidade_orcada,
        custo_unitario: item.custo_unitario_orcado,
        valor_base: item.valor_orcado,
        item,
        quantidade_prevista: asNumber(row.quantidade),
        valor_previsto: asNumber(row.valor_total),
        data_prevista: ''
      };
      const index = next.findIndex((value) => Number(value.plano_item_id) === item.id);
      if (index >= 0) next[index] = { ...next[index], ...imported };
      else next.push(imported);
    });
    return next;
  }

  function mergeImportedApproved(current, importRows) {
    const next = [...current];
    importRows.forEach((row) => {
      const item = budgetItemFromImported(row, 'quantidade_aprovada_anterior');
      const imported = {
        previsao_custo_id: null,
        plano_item_id: item.id,
        etapa_macro_codigo: item.etapa_macro_codigo,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade_base: item.quantidade_orcada,
        custo_unitario: item.custo_unitario_orcado,
        valor_base: item.valor_orcado,
        item,
        quantidade_medida: asNumber(row.quantidade),
        valor_medido: asNumber(row.valor_total),
        valor_glosa: 0,
        justificativa_glosa: '',
        data_medicao: '',
        numero_medicao: ''
      };
      const index = next.findIndex((value) => Number(value.plano_item_id) === item.id);
      if (index >= 0) next[index] = { ...next[index], ...imported };
      else next.push(imported);
    });
    return next;
  }

  /*
    Importação confirmada = aplica E grava num passo só (Fase 6). A
    confirmação de que vai gravar acontece no próprio modal. Se a gravação
    falhar, os itens ficam aplicados na tela (rascunho) com o erro visível.
    Medição aprovada com diferença sem justificativa não registra sozinha:
    aplica e pede a justificativa.
  */
  async function importAndSave(type, items) {
    if (saving) return;
    const importRows = Array.isArray(items) ? items : [];
    const count = importRows.length;
    setSheetPreview(null);
    if (type === 'custos') {
      const next = mergeImportedCosts(costs, importRows);
      setCosts(next);
      setStep(1);
      await saveCosts({ rows: next, successMessage: `${count} item(ns) importados e custos salvos.` });
    } else if (type === 'medicao-prevista') {
      const next = mergeImportedForecast(receipts, importRows);
      setReceipts(next);
      setStep(2);
      await saveReceipts({ rows: next, successMessage: `${count} item(ns) importados e medição prevista salva.` });
    } else if (type === 'medicao-aprovada') {
      const next = mergeImportedApproved(measurements, importRows);
      setMeasurements(next);
      const approvedTotal = next.reduce((sum, item) => sum + asNumber(item.valor_medido), 0);
      const needsJustification = approvedTotal < totalReceipts
        && measurementJustification.trim().length < 5;
      if (needsJustification || data?.medicao_aprovada_estado?.editavel === false) {
        setFeedback(needsJustification
          ? `${count} item(ns) aplicados. Informe a justificativa da diferença e registre a medição aprovada.`
          : `${count} item(ns) aplicados.`);
        return;
      }
      await saveMeasurement({ rows: next, successMessage: `${count} item(ns) importados e medição aprovada registrada.` });
    }
  }

  function renderPlanningSheetActions(type, allowed = true, extraAction = null) {
    if (!allowed) return null;
    const downloading = sheetLoading === `download:${type}`;
    const uploading = sheetLoading === `upload:${type}`;
    return (
      <div className="cr-planning-sheet-actions">
        {extraAction}
        <button
          type="button"
          className="btn btn-outline"
          disabled={Boolean(sheetLoading)}
          onClick={() => downloadPlanningModel(type)}
        >
          <HiOutlineArrowDownTray className="h-4 w-4" />
          {downloading ? 'Gerando...' : 'Baixar modelo'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={(type !== 'medicao-aprovada' && readonly) || Boolean(sheetLoading)}
          onClick={() => choosePlanningFile(type)}
        >
          <HiOutlineArrowUpTray className="h-4 w-4" />
          {uploading ? 'Validando...' : 'Importar planilha'}
        </button>
      </div>
    );
  }

  function receiptsForMacro(macroCode) {
    return receipts.filter((item) => item.etapa_macro_codigo === macroCode);
  }

  function measurementsForMacro(macroCode) {
    return measurements.filter((item) => item.etapa_macro_codigo === macroCode);
  }

  /* AGRUPAMENTO MACRO → SUBITENS (capacidade `agruparPor` da TabelaPadrao).
     Antes cada etapa macro era uma tabela propria dentro de um <article>; agora
     é UMA tabela por bloco, com a etapa virando linha de grupo. A etapa SEM
     nenhum subitem precisa continuar aparecendo — é no cabecalho dela que mora
     o "Adicionar subitem" —, entao entra na lista com uma linha-marcador. */
  function linhasPorMacro(porMacro) {
    return (data?.macros || []).flatMap((macro) => {
      const linhas = porMacro(macro.codigo);
      return linhas.length ? linhas : [{ __vazio: true, etapa_macro_codigo: macro.codigo }];
    });
  }

  function idDaLinha(item) {
    return item.__vazio ? `vazio:${item.etapa_macro_codigo}` : planningRowKey(item);
  }

  function chaveDoMacro(item) {
    return item.etapa_macro_codigo || 'SEM_MACRO';
  }

  function macroDoGrupo(codigo) {
    const lista = data?.macros || [];
    const indice = lista.findIndex((item) => item.codigo === codigo);
    return { macro: lista[indice] || { codigo }, indice };
  }

  function renderForecastMacroHeading(codigo, itensDoGrupo) {
    const { macro, indice } = macroDoGrupo(codigo);
    const rows = itensDoGrupo.filter((item) => !item.__vazio);
    const total = rows.reduce((sum, item) => sum + asNumber(item.valor_previsto), 0);
    const selectedIds = new Set(receipts.map((item) => Number(item.plano_item_id)).filter(Boolean));
    const available = forecastSearch.items.filter((item) => !selectedIds.has(Number(item.id)));
    const pickerOpen = measurementPickerMacro === macro.codigo;
    return (
      <div className="cr-macro-planning-group">
        <div className="cr-macro-planning-heading">
          <div>
            <b>{indice + 1}</b>
            <div>
              <strong>{macro.codigo} · {macro.descricao}</strong>
              <span>{rows.length} subitem(ns) · {currency.format(total)}</span>
            </div>
          </div>
          {!readonly && permissions.receipts ? (
            <button
              type="button"
              className="btn btn-outline"
              aria-expanded={pickerOpen}
              onClick={() => {
                setMeasurementPickerMacro(pickerOpen ? '' : macro.codigo);
                setMeasurementSearch('');
              }}
            >
              <HiOutlinePlus className="h-4 w-4" />
              Adicionar subitem
            </button>
          ) : null}
        </div>
        {pickerOpen ? (
          <div className="cr-macro-subitem-picker">
            <label className="cr-macro-picker-search">
              <HiOutlineMagnifyingGlass className="h-4 w-4" />
              <input
                autoFocus
                type="search"
                value={measurementSearch}
                placeholder="Pesquisar subitem desta etapa..."
                aria-label={`Pesquisar subitens de ${macro.descricao}`}
                onChange={(event) => setMeasurementSearch(event.target.value)}
              />
            </label>
            <div className="cr-macro-picker-results" role="listbox">
              {available.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => addReceipt(item)}
                >
                  <span>{item.codigo} · {item.descricao}</span>
                  <small>
                    {item.unidade || 'un'} · orçado {item.quantidade_orcada} × {currency.format(item.custo_unitario_orcado)}
                  </small>
                  <HiOutlinePlus className="h-4 w-4" />
                </button>
              ))}
              {forecastSearch.loading ? (
                <span className="cr-macro-picker-empty">Pesquisando itens da planilha...</span>
              ) : null}
              {forecastSearch.error ? (
                <span className="cr-macro-picker-empty" data-tone="error">{forecastSearch.error}</span>
              ) : null}
              {!forecastSearch.loading && !forecastSearch.error && !available.length ? (
                <span className="cr-macro-picker-empty">
                  {measurementSearch.trim()
                    ? 'Nenhum subitem da planilha corresponde à pesquisa nesta etapa.'
                    : 'Nenhum subitem disponível na planilha para esta etapa.'}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderApprovedMacroHeading(codigo, itensDoGrupo) {
    const { macro, indice } = macroDoGrupo(codigo);
    const rows = itensDoGrupo.filter((item) => !item.__vazio);
    const total = rows.reduce((sum, item) => sum + asNumber(item.valor_medido), 0);
    const selectedIds = new Set(measurements.map((item) => Number(item.plano_item_id)).filter(Boolean));
    const available = approvedItemSearch.items.filter((item) => !selectedIds.has(Number(item.id)));
    const pickerOpen = approvedPickerMacro === macro.codigo;
    return (
      <div className="cr-macro-planning-group">
        <div className="cr-macro-planning-heading">
          <div>
            <b>{indice + 1}</b>
            <div>
              <strong>{macro.codigo} · {macro.descricao}</strong>
              <span>{rows.length} subitem(ns) · {currency.format(total)}</span>
            </div>
          </div>
          {permissions.measurement ? (
            <button
              type="button"
              className="btn btn-outline"
              aria-expanded={pickerOpen}
              onClick={() => {
                setApprovedPickerMacro(pickerOpen ? '' : macro.codigo);
                setApprovedSearch('');
              }}
            >
              <HiOutlinePlus className="h-4 w-4" />
              Adicionar subitem
            </button>
          ) : null}
        </div>
        {pickerOpen ? (
          <div className="cr-macro-subitem-picker">
            <label className="cr-macro-picker-search">
              <HiOutlineMagnifyingGlass className="h-4 w-4" />
              <input
                autoFocus
                type="search"
                value={approvedSearch}
                placeholder="Pesquisar subitem aprovado..."
                aria-label={`Pesquisar subitens aprovados de ${macro.descricao}`}
                onChange={(event) => setApprovedSearch(event.target.value)}
              />
            </label>
            <div className="cr-macro-picker-results" role="listbox">
              {available.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => addApprovedMeasurement(item)}
                >
                  <span>{item.codigo} · {item.descricao}</span>
                  <small>
                    {item.unidade || 'un'} · orçado {item.quantidade_orcada} × {currency.format(item.custo_unitario_orcado)}
                  </small>
                  <HiOutlinePlus className="h-4 w-4" />
                </button>
              ))}
              {approvedItemSearch.loading ? (
                <span className="cr-macro-picker-empty">Pesquisando itens da planilha...</span>
              ) : null}
              {approvedItemSearch.error ? (
                <span className="cr-macro-picker-empty" data-tone="error">{approvedItemSearch.error}</span>
              ) : null}
              {!approvedItemSearch.loading && !approvedItemSearch.error && !available.length ? (
                <span className="cr-macro-picker-empty">
                  {approvedSearch.trim()
                    ? 'Nenhum subitem da planilha corresponde à pesquisa nesta etapa.'
                    : 'Nenhum subitem disponível na planilha para esta etapa.'}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  async function runMutation(kind, action, successMessage, draftSection = '') {
    if (saving) return null;
    try {
      setSaving(kind);
      setError('');
      setFeedback('');
      const result = await action();
      if (draftSection && draftKeys[draftSection]) {
        removePlanningDraft(draftKeys[draftSection]);
        refreshDraftPresence();
      }
      setFeedback(successMessage);
      await load();
      onChanged?.();
      return { result };
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível concluir a operação.');
      return null;
    } finally {
      setSaving('');
    }
  }

  async function saveReceipts({ rows: sourceRows = receipts, successMessage = 'Medição prevista salva.' } = {}) {
    if (!isPublic || saving) return false;
    const payload = sourceRows.map((item) => ({
      previsao_custo_id: item.previsao_custo_id || null,
      plano_item_id: item.plano_item_id,
      quantidade_prevista: asNumber(item.quantidade_prevista),
      data_prevista: item.data_prevista || null
    }));
    const obraAlvo = obra;
    const competenciaAlvo = competencia;
    // Acima do saldo provável (mas dentro do disponível) não bloqueia: pede
    // confirmação listando os itens.
    const warned = sourceRows
      .map((item) => ({ item, balance: forecastBalance(item) }))
      .filter(({ balance }) => balance.aboveProbable);
    if (warned.length) {
      const { ok } = await confirmar({
        titulo: 'Previsão acima do saldo provável',
        mensagem: (
          <>
            A previsão de {payload.length} item(ns) será salva; {warned.length} passam do saldo provável:
            {warned.map(({ item, balance }) => (
              <span key={planningRowKey(item)} className="cr-confirm-line">
                {item.item?.codigo ? `${item.item.codigo} · ` : ''}{item.descricao}: {formatQuantity(balance.quantity, item.unidade || 'un')} previsto, saldo provável {formatQuantity(balance.probable, item.unidade || 'un')} ({pendingMonthsText(balance)} aguardando aprovação)
              </span>
            ))}
          </>
        ),
        rotuloConfirmar: 'Salvar mesmo assim'
      });
      if (!ok) return false;
    }
    const outcome = await runMutation(
      'receipts',
      () => salvarRecebiveisCompetencia(obraAlvo.id, competenciaAlvo, payload),
      successMessage,
      'receipts'
    );
    if (!outcome) return false;
    setForecastNotices(Array.isArray(outcome.result?.avisos) ? outcome.result.avisos : []);
    return true;
  }

  async function saveCosts({ rows: sourceRows = costs, successMessage = 'Custos planejados salvos.' } = {}) {
    if (saving) return false;
    const isEmpty = (item) => (
      !String(item.descricao || '').trim()
      && !String(item.unidade || '').trim()
      && String(item.quantidade ?? '').trim() === ''
      && String(item.custo_unitario ?? '').trim() === ''
    );
    const rows = sourceRows.filter((item) => !isEmpty(item));
    const validationErrors = rows.flatMap((item, index) => {
      const messages = [];
      if (String(item.descricao || '').trim().length < 2) messages.push('informe a descrição');
      if (!String(item.unidade || '').trim()) messages.push('informe a unidade');
      if (asNumber(item.quantidade) <= 0) messages.push('informe uma quantidade maior que zero');
      if (String(item.custo_unitario ?? '').trim() === '' || asNumber(item.custo_unitario) < 0) {
        messages.push('informe um valor unitário válido');
      }
      return messages.length ? [{ index: sourceRows.indexOf(item), label: index + 1, messages }] : [];
    });
    setCostErrors(validationErrors);
    if (validationErrors.length) {
      setError(`Revise ${validationErrors.length} subitem(ns) destacado(s) antes de salvar.`);
      return false;
    }
    if (rows.length !== sourceRows.length) setCosts(rows);
    const outcome = await runMutation(
      'costs',
      () => salvarCustosCompetencia(
        obra.id,
        competencia,
        rows.map((item) => ({
          id: item.id || null,
          chave_local: item.chave_local || null,
          plano_item_id: item.plano_item_id,
          etapa_macro_codigo: item.etapa_macro_codigo,
          descricao: item.descricao,
          unidade: item.unidade,
          ordem: item.ordem,
          quantidade: asNumber(item.quantidade),
          custo_unitario: asNumber(item.custo_unitario),
          parceiro_id: item.parceiro_id || null
        }))
      ),
      successMessage,
      'costs'
    );
    return Boolean(outcome);
  }

  async function saveMeasurement({
    rows: sourceRows = measurements,
    successMessage = 'Medição aprovada registrada.',
    completeOnSuccess = false
  } = {}) {
    const outcome = await runMutation(
      'measurement',
      () => consolidarMedicaoCompetencia(
        obra.id,
        competencia,
        sourceRows.map((item) => ({
          previsao_custo_id: item.previsao_custo_id || null,
          plano_item_id: item.plano_item_id,
          quantidade_medida: asNumber(item.quantidade_medida),
          valor_medido: asNumber(item.valor_medido),
          justificativa_glosa: item.justificativa_glosa || null,
          data_medicao: item.data_medicao || null,
          numero_medicao: item.numero_medicao || null
        })),
        measurementJustification
      ),
      successMessage,
      'measurement'
    );
    if (!outcome) return false;
    // Parte B (29/09): a previsão do mês seguinte pode ter passado do saldo
    // depois desta aprovação; a faixa de ajuste aparece aqui mesmo.
    const ajuste = outcome.result?.ajuste_previsao || null;
    setAdjustmentAfterRegister(ajuste);
    // Registrado pelo botão (29/09): volta aos meses da obra. Com a faixa de
    // ajuste ao saldo a decisão é do usuário; a volta espera ajustar/fechar.
    if (completeOnSuccess && onCompleted) {
      const pendingAdjustment = Boolean(ajuste?.competencia)
        && Array.isArray(ajuste?.itens) && ajuste.itens.length > 0;
      if (pendingAdjustment) setCompleteAfterAdjustment(successMessage);
      else onCompleted(successMessage);
    }
    return true;
  }

  // Mês em que o fiscal não mediu nada (29/09): registra com justificativa e
  // cumpre a obrigação da medição aprovada.
  async function registerNoMeasurement() {
    const obraAlvo = obra;
    const competenciaAlvo = competencia;
    const { ok, texto } = await confirmar({
      titulo: 'Sem medição aprovada neste mês',
      mensagem: 'Registre por que o fiscal não aprovou medição neste mês. Itens já lançados na medição aprovada serão removidos.',
      rotuloConfirmar: 'Registrar sem medição',
      campo: { rotulo: 'Justificativa (mínimo de 10 caracteres)', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;
    const justificativa = String(texto || '').trim();
    if (justificativa.length < 10) {
      setError('Informe uma justificativa com pelo menos 10 caracteres para registrar o mês sem medição.');
      return;
    }
    const noMeasurementMessage = 'Mês registrado sem medição aprovada.';
    const outcome = await runMutation(
      'measurement',
      () => registrarSemMedicaoCompetencia(obraAlvo.id, competenciaAlvo, justificativa),
      noMeasurementMessage,
      'measurement'
    );
    if (outcome) onCompleted?.(noMeasurementMessage);
  }

  async function finish() {
    if (saving) return;
    // Finalizar vale para o que está gravado; alteração só na tela não entra.
    const savedCosts = savedTotals ? savedTotals.costs : totalCosts;
    const savedReceipts = savedTotals ? savedTotals.receipts : totalReceipts;
    const unsaved = costsDirty || receiptsDirty;
    const { ok } = await confirmar({
      titulo: 'Finalizar competência',
      mensagem: 'Finalizar congela os valores gravados da competência. Depois disso, qualquer ajuste exigirá reabertura aprovada.'
        + (unsaved ? ' Há alterações não salvas nesta tela: elas não entram na finalização.' : ''),
      rotuloConfirmar: 'Finalizar'
    });
    if (!ok) return;
    const justifications = {};
    if (savedCosts === 0) {
      const { ok: confirmed, texto } = await confirmar({
        titulo: 'Finalizar sem custos planejados',
        rotuloConfirmar: 'Continuar',
        campo: { rotulo: 'Justificativa da finalização sem custos planejados', obrigatorio: true, multilinha: true }
      });
      if (!confirmed || !String(texto || '').trim()) return;
      justifications.justificativa_sem_custos = String(texto).trim();
    }
    if (savedReceipts === 0) {
      const { ok: confirmed, texto } = await confirmar({
        titulo: 'Finalizar sem recebíveis previstos',
        rotuloConfirmar: 'Continuar',
        campo: { rotulo: 'Justificativa da finalização sem recebíveis previstos', obrigatorio: true, multilinha: true }
      });
      if (!confirmed || !String(texto || '').trim()) return;
      justifications.justificativa_sem_receitas = String(texto).trim();
    }
    const finishMessage = 'Competência finalizada e protegida contra alterações.';
    const outcome = await runMutation(
      'finish',
      () => finalizarPlanejamentoCompetencia(obra.id, competencia, justifications),
      finishMessage
    );
    if (outcome) onCompleted?.(finishMessage);
  }

  // "Salvar e continuar" (Fase 6): um clique grava a etapa e, se deu certo,
  // avança. Sem alteração pendente só avança.
  const canSaveStep = !approvedOnly && !readonly && (
    (step === 1 && permissions.costs)
    || (step === 2 && isPublic && permissions.receipts)
  );

  async function saveAndContinue() {
    if (saving) return;
    const target = Math.min(steps.length, step + 1);
    let ok = true;
    if (step === 1 && costsDirty) ok = await saveCosts();
    else if (step === 2 && receiptsDirty) ok = await saveReceipts();
    if (ok) setStep(target);
  }

  async function handleAdjusted(result, competenciaAjustada, requested) {
    const count = Array.isArray(result?.ajustados) ? result.ajustados.length : requested;
    const ignored = Array.isArray(result?.ignorados) ? result.ignorados.length : 0;
    setAdjustmentAfterRegister(null);
    setError('');
    if (competenciaAjustada === competencia) await load();
    const adjustedMessage = `Previsão de ${monthLabel(competenciaAjustada)} ajustada ao saldo em ${count} item(ns).`
      + (ignored ? ` ${ignored} item(ns) já estavam dentro do saldo.` : '');
    setFeedback(adjustedMessage);
    onChanged?.();
    if (completeAfterAdjustment && onCompleted) {
      const registeredMessage = completeAfterAdjustment;
      setCompleteAfterAdjustment('');
      onCompleted(`${registeredMessage} ${adjustedMessage}`);
    }
  }

  // Fechar a faixa depois de registrar a medição aprovada: sem ajuste, volta.
  function dismissAdjustmentAndReturn() {
    const registeredMessage = completeAfterAdjustment;
    setAdjustmentAfterRegister(null);
    setCompleteAfterAdjustment('');
    onCompleted?.(registeredMessage);
  }

  async function requestReopening() {
    await runMutation(
      'reopen',
      () => (
        data.competencia.id
          ? solicitarReaberturaCompetencia(data.competencia.id, reopenReason)
          : solicitarReaberturaObraCompetencia(obra.id, competencia, reopenReason)
      ),
      'Solicitação de reabertura registrada para decisão.'
    );
    setReopenReason('');
  }

  async function decideReopening(reopeningId, decision) {
    await runMutation(
      `decision-${reopeningId}`,
      // A reabertura aprovada vale 24 horas (regra do servidor, 29/09).
      () => decidirReaberturaCompetencia(reopeningId, { decisao: decision }),
      decision === 'APROVADA'
        ? 'Reabertura aprovada por 24 horas.'
        : 'Solicitação de reabertura negada.'
    );
  }

  // Totais GRAVADOS (relidos ao entrar na etapa). Alteração só na tela
  // aparece como aviso, porque não entra na finalização.
  function renderSavedSummary(receiptsLabel) {
    const savedCosts = savedTotals ? savedTotals.costs : 0;
    const savedReceipts = savedTotals ? savedTotals.receipts : 0;
    const pending = [
      costsDirty ? 'Custos planejados' : null,
      receiptsDirty ? 'Medição prevista' : null
    ].filter(Boolean);
    return (
      <>
        {pending.length ? (
          <div className="cr-feedback" data-tone="warning" role="status">
            Alterações não salvas em {pending.join(' e ')}. Os totais abaixo são os gravados.
          </div>
        ) : null}
        <div className="cr-review-summary">
          <div><span>Custos planejados</span><strong>{currency.format(savedCosts)}</strong></div>
          <div><span>{receiptsLabel}</span><strong>{currency.format(savedReceipts)}</strong></div>
          <div data-tone={savedReceipts - savedCosts >= 0 ? 'positive' : 'negative'}>
            <span>Margem prevista</span>
            <strong>{currency.format(savedReceipts - savedCosts)}</strong>
          </div>
        </div>
      </>
    );
  }

  function renderClosureControls() {
    return (
      <>
        {permissions.finish && data?.competencia?.estado !== 'FINALIZADA' ? (
          <div className="cr-panel-actions cr-closure-actions">
            <span>
              {isPublic
                ? 'Ao finalizar, os valores gravados ficam protegidos; alterações exigem reabertura aprovada. A medição aprovada continua disponível para registro.'
                : 'Ao finalizar, os recebíveis são sincronizados com as fontes oficiais e os valores ficam protegidos.'}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(saving)}
              onClick={finish}
            >
              <HiOutlineCheckCircle className="h-4 w-4" />
              {saving === 'finish' ? 'Finalizando...' : 'Finalizar competência'}
            </button>
          </div>
        ) : null}

        {data?.regras?.exige_reabertura && permissions.reopenRequest ? (
          <div className="cr-reopen-box">
            <label className="cr-field">
              <span>Motivo da reabertura</span>
              <textarea
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
                placeholder="Explique o ajuste necessário para auditoria."
              />
            </label>
            <button
              type="button"
              className="btn btn-outline"
              disabled={reopenReason.trim().length < 10 || Boolean(saving)}
              onClick={requestReopening}
            >
              Solicitar reabertura
            </button>
          </div>
        ) : null}

        {data?.reaberturas?.length ? (
          <div className="cr-reopening-list">
            <div className="cr-block-heading">
              <div>
                <h3>Histórico de reaberturas</h3>
              </div>
            </div>
            {permissions.reopenApprove
              && data.reaberturas.some((item) => item.situacao === 'SOLICITADA') ? (
                <small className="cr-warning-text">Aprovada, a reabertura vale por 24 horas.</small>
              ) : null}
            {data.reaberturas.map((item) => (
              <article key={item.id} className="cr-reopening-row">
                <div>
                  <strong>{item.solicitante?.nome || `Usuário #${item.solicitado_por}`}</strong>
                  <span>{item.motivo}</span>
                </div>
                <span className="cr-status-pill" data-status={item.situacao}>{item.situacao}</span>
                {permissions.reopenApprove && item.situacao === 'SOLICITADA' ? (
                  <div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={Boolean(saving)}
                      onClick={() => decideReopening(item.id, 'NEGADA')}
                    >
                      Negar
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={Boolean(saving)}
                      onClick={() => decideReopening(item.id, 'APROVADA')}
                    >
                      Aprovar
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  if (!obra?.id) {
    return (
      <section className="cr-section cr-empty-state cr-empty-state--large">
        <strong>Selecione uma obra</strong>
      </section>
    );
  }
  if (loading && !data) {
    return <section className="cr-section cr-empty-state">Carregando planejamento...</section>;
  }
  if (error && !data) {
    return (
      <section className="cr-section cr-empty-state cr-empty-state--large">
        <HiOutlineExclamationTriangle className="h-6 w-6" />
        <strong>Planejamento indisponível</strong>
        <span>{error}</span>
        <button type="button" className="btn btn-outline" onClick={load}>Tentar novamente</button>
      </section>
    );
  }

  return (
    <section className="cr-workspace cr-planning-workspace">
      <input
        ref={sheetFileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={handlePlanningFile}
      />
      <header className="cr-workspace-heading cr-editor-heading">
        <div className="cr-editor-heading__title">
          {/* O que está sendo feito e o mês vêm primeiro e grandes; a obra
              logo abaixo; planilha e situação ficam como apoio. */}
          <h2>{editorStageTitle} — {monthSlash(competencia)}</h2>
          <p className="cr-editor-heading__obra">{obra.codigo || obra.id} · {obra.nome}</p>
          {data?.plano?.versao ? (
            <span className="cr-editor-heading__meta">Planilha v{data.plano.versao}</span>
          ) : null}
        </div>
        <div className="cr-planning-status-stack">
          <span className="cr-status-pill" data-status={data?.competencia?.estado}>
            {COMPETENCIA_ESTADO_LABELS[data?.competencia?.estado] || data?.competencia?.estado}
          </span>
          {draftNotice ? (
            <span className="cr-draft-indicator" data-error={draftNotice.startsWith('Não') || undefined}>
              {draftNotice}
            </span>
          ) : null}
          {hasLocalDraft ? (
            <button type="button" className="cr-draft-discard" onClick={discardLocalDraft}>
              Descartar rascunho
            </button>
          ) : null}
        </div>
      </header>

      {readonly ? (
        <div className="cr-lock-banner">
          <HiOutlineLockClosed className="h-5 w-5" />
          <div>
            <strong>Competência finalizada</strong>
            <span>
              {isPublic
                ? 'Custos e medição prevista estão congelados. A medição aprovada permanece disponível para registro quando o órgão responder.'
                : 'Custos e recebíveis do período permanecem disponíveis para consulta. A edição dos custos exige reabertura aprovada.'}
            </span>
          </div>
        </div>
      ) : null}

      {error ? <div className="cr-feedback" data-tone="error">{error}</div> : null}
      {feedback ? <div className="cr-feedback" data-tone="success">{feedback}</div> : null}

      <CrAjustePrevisaoFaixa
        obraId={obra.id}
        ajuste={adjustmentAfterRegister || data?.ajuste_previsao_pendente || null}
        canAdjust={Boolean(permissions.measurement || permissions.receipts)}
        onAdjusted={handleAdjusted}
        onDismiss={completeAfterAdjustment && adjustmentAfterRegister ? dismissAdjustmentAndReturn : null}
      />

      {!approvedOnly ? <nav className="cr-stepper" aria-label="Etapas do planejamento">
        {steps.map((item) => (
          <button
            key={item.id}
            type="button"
            className={step === item.id ? 'is-active' : ''}
            onClick={() => setStep(item.id)}
          >
            <b>{item.id}</b>
            <span>{item.label}</span>
          </button>
        ))}
      </nav> : null}

      {!approvedOnly && step === 2 && isPublic ? (
        <div className="cr-planning-panel cr-macro-planning-panel">
          <div className="cr-block-heading">
            <div>
              <h3>Medição prevista no período</h3>
            </div>
            {renderPlanningSheetActions('medicao-prevista', permissions.receipts)}
          </div>
          {receipts.some((item) => forecastBalance(item).aboveProbable) ? (
            <div className="cr-feedback cr-forecast-notices" data-tone="warning" role="status">
              <strong>Acima do saldo provável (não bloqueia)</strong>
              {receipts.filter((item) => forecastBalance(item).aboveProbable).map((item) => (
                <span key={planningRowKey(item)}>
                  {item.item?.codigo ? `${item.item.codigo} · ` : ''}{item.descricao}: {aboveProbableText(forecastBalance(item), item.unidade || 'un')}
                </span>
              ))}
            </div>
          ) : null}
          {/* Fase 5 (revisão): larguras enxutas e título em até duas linhas
              (.cr-forecast-grid) para a grade caber em 1440 px sem cortar
              título; valor unitário e total planejado seguem na célula da
              quantidade orçada. */}
          <div className="cr-forecast-grid">
          <TabelaPadrao
            colunas={[
              {
                id: 'servico',
                titulo: 'Serviço',
                // R17: o SERVIÇO da planilha é o que nomeia o subitem medido.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (item.__vazio
                  ? 'Nenhum subitem nesta etapa.'
                  : <strong>{item.descricao}</strong>)
              },
              {
                id: 'unidade',
                largura: 70, minWidth: 70,
                titulo: 'Unid.',
                tipo: 'codigo',
                render: (item) => (item.__vazio ? null : (item.unidade || 'un'))
              },
              {
                id: 'saldo_disponivel',
                largura: 110, minWidth: 110,
                titulo: 'Saldo disponível',
                tipo: 'numero',
                render: (item) => (item.__vazio ? null : formatQuantity(forecastBalance(item).available))
              },
              {
                id: 'previsto_pendente',
                largura: 120, minWidth: 120,
                // O mês aguardando aprovação vai na linha de baixo da célula.
                titulo: 'Aguardando aprovação',
                tipo: 'texto',
                render: (item) => {
                  if (item.__vazio) return null;
                  const balance = forecastBalance(item);
                  if (!balance.pending) return '—';
                  return (
                    <CelulaDupla
                      principal={formatQuantity(balance.pending, item.unidade || 'un')}
                      sub={balance.pendingMonths.map(monthShort).join(', ')}
                    />
                  );
                }
              },
              {
                id: 'saldo_provavel',
                largura: 110, minWidth: 110,
                titulo: 'Saldo provável',
                tipo: 'numero',
                render: (item) => {
                  if (item.__vazio) return null;
                  const balance = forecastBalance(item);
                  return balance.hasProbable || balance.pending ? formatQuantity(balance.probable) : '—';
                }
              },
              {
                id: 'quantidade_prevista',
                largura: 130, minWidth: 130,
                sempreVisivel: true,
                titulo: 'Qtd. prevista',
                tipo: 'numero',
                // Edição inline: o controle mora no render da coluna. Acima do
                // saldo provável (dentro do disponível) a célula fica em aviso.
                render: (item) => {
                  if (item.__vazio) return null;
                  const balance = forecastBalance(item);
                  const unit = item.unidade || 'un';
                  const input = (
                    <input
                      type="number"
                      min="0"
                      max={balance.available}
                      step="0.0001"
                      aria-label={`Quantidade prevista de ${item.descricao || 'subitem'}`}
                      aria-invalid={balance.aboveProbable || undefined}
                      value={item.quantidade_prevista}
                      disabled={readonly || !permissions.receipts}
                      onChange={(event) => updateReceipt(
                        receipts.findIndex((row) => planningRowKey(row) === planningRowKey(item)),
                        'quantidade_prevista',
                        event.target.value
                      )}
                    />
                  );
                  if (!balance.aboveProbable) return input;
                  return (
                    <span className="tooltip-wrap cr-forecast-qty" data-tone="warning">
                      {input}
                      <HiOutlineExclamationTriangle className="h-4 w-4" aria-hidden="true" />
                      <span className="tooltip-content" role="tooltip">{aboveProbableText(balance, unit)}</span>
                    </span>
                  );
                }
              },
              {
                id: 'valor_previsto',
                largura: 130, minWidth: 130,
                titulo: 'Nesta medição',
                tipo: 'valor',
                render: (item) => (item.__vazio ? null : <strong>{currency.format(item.valor_previsto || 0)}</strong>)
              },
              {
                id: 'saldo',
                largura: 110, minWidth: 110,
                titulo: 'Saldo a medir',
                tipo: 'numero',
                render: (item) => {
                  if (item.__vazio) return null;
                  const balance = forecastBalance(item);
                  return formatQuantity(Math.max(0, balance.available - balance.quantity), item.unidade || 'un');
                }
              },
              {
                id: 'quantidade_base',
                largura: 130, minWidth: 130,
                titulo: 'Qtd. orçada',
                tipo: 'numero',
                // Valor unitário e total planejado na linha de baixo (antes
                // eram duas colunas que empurravam a grade para fora de 1440).
                render: (item) => (item.__vazio ? null : (
                  <CelulaDupla
                    principal={item.quantidade_base}
                    sub={budgetDetail(item)}
                  />
                ))
              },
              {
                id: 'quantidade_anterior',
                largura: 110, minWidth: 110,
                titulo: 'Qtd. já aprovada',
                tipo: 'numero',
                render: (item) => (item.__vazio ? null : formatQuantity(forecastBalance(item).approvedBefore))
              }
            ]}
            itens={linhasPorMacro(receiptsForMacro)}
            getId={idDaLinha}
            agruparPor={{ chave: chaveDoMacro, titulo: renderForecastMacroHeading }}
            storageKey="tabela:cr-planejamento:medicao-prevista"
            urgencia={(item) => (!item.__vazio && forecastBalance(item).aboveProbable ? 'warning' : null)}
            rotuloRolagem="Medição prevista por etapa macro"
            vazio="Nenhuma etapa macro disponível no plano publicado."
            acoesLinha={(item) => (
              !item.__vazio && !readonly && permissions.receipts ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => removeReceipt(planningRowKey(item))}
                  aria-label={`Remover ${item.descricao}`}
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              ) : null
            )}
            larguraAcoes={120}
          />
          </div>
          {forecastNotices.length ? (
            <div className="cr-feedback cr-forecast-notices" data-tone="warning" role="status">
              <strong>Salvo acima do saldo provável em {forecastNotices.length} item(ns)</strong>
              {forecastNotices.map((aviso) => (
                <span key={`${aviso.plano_item_id}-${aviso.codigo}`}>
                  {aviso.saldo_provavel != null
                    ? `${aviso.codigo}: ${formatQuantity(aviso.quantidade)} previsto, saldo provável ${formatQuantity(aviso.saldo_provavel)}`
                      + (Array.isArray(aviso.competencias_pendentes) && aviso.competencias_pendentes.length
                        ? ` (${aviso.competencias_pendentes.map(monthShort).join(', ')} aguardando medição aprovada)`
                        : '')
                    : aviso.mensagem}
                </span>
              ))}
            </div>
          ) : null}
          <div className="cr-panel-actions">
            <strong>Total da medição prevista: {currency.format(totalReceipts)}</strong>
            {permissions.receipts ? (
              <button
                type="button"
                className="btn btn-outline"
                disabled={readonly || Boolean(saving)}
                onClick={() => saveReceipts()}
              >
                {saving === 'receipts' ? 'Salvando...' : 'Salvar'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!approvedOnly && step === 2 && !isPublic ? (
        <div className="cr-planning-panel">
          <div className="cr-block-heading">
            <div>
              <h3>{isPublic ? 'Medição prevista no período' : 'Recebíveis cadastrados para o período'}</h3>
            </div>
          </div>
          <TabelaPadrao
            colunas={[
              {
                id: 'origem',
                titulo: isPublic ? 'Item micro' : 'Origem contratual',
                // R17: a origem (item micro ou documento contratual) nomeia o recebível.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (
                  <CelulaDupla
                    principal={isPublic ? `${item.item.codigo} · ${item.item.descricao}` : item.descricao}
                    sub={isPublic
                      ? `${item.item.unidade || 'un'} · ${item.item.etapa_macro_codigo || 'Sem macro'}`
                      : `${item.origem_exibicao === 'TITULO' ? 'Título a receber' : 'Parcela contratual'} · contrato ${item.contrato.numero}`}
                  />
                )
              },
              ...(isPublic ? [
                {
                  id: 'quantidade_orcada',
                  titulo: 'Qtd. orçada',
                  tipo: 'numero',
                  render: (item) => `${item.item.quantidade_orcada} ${item.item.unidade || 'un'}`
                },
                {
                  id: 'quantidade_anterior',
                  titulo: 'Já medida',
                  tipo: 'numero',
                  render: (item) => item.item.quantidade_aprovada_anterior || 0
                },
                {
                  id: 'quantidade_prevista',
                  sempreVisivel: true,
                  titulo: 'Nesta medição',
                  tipo: 'numero',
                  // Edição inline: o controle mora no render da coluna.
                  render: (item) => (
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      aria-label={`Quantidade prevista de ${item.item.descricao}`}
                      value={item.quantidade_prevista}
                      disabled={readonly || !permissions.receipts}
                      onChange={(event) => updateReceipt(
                        receipts.findIndex((row) => (row.key || row.plano_item_id) === (item.key || item.plano_item_id)),
                        'quantidade_prevista',
                        event.target.value
                      )}
                    />
                  )
                },
                {
                  id: 'valor_previsto',
                  titulo: 'Valor previsto',
                  tipo: 'valor',
                  render: (item) => currency.format(item.valor_previsto || 0)
                },
                {
                  id: 'saldo',
                  titulo: 'Saldo após medição',
                  tipo: 'numero',
                  render: (item) => `${Math.max(
                    0,
                    asNumber(item.item.quantidade_orcada)
                      - asNumber(item.item.quantidade_aprovada_anterior)
                      - asNumber(item.quantidade_prevista)
                  )} ${item.item.unidade || 'un'}`
                }
              ] : [
                {
                  id: 'documento',
                  titulo: 'Documento',
                  tipo: 'codigo',
                  render: (item) => item.documento || 'Parcela contratual'
                },
                {
                  id: 'status_financeiro',
                  titulo: 'Status financeiro',
                  tipo: 'status',
                  render: (item) => (
                    <span className="cr-status-pill" data-status={item.status_financeiro}>
                      {privateReceiptStatusLabel(item.status_financeiro)}
                    </span>
                  )
                },
                {
                  id: 'data_prevista',
                  titulo: 'Vencimento',
                  tipo: 'data',
                  render: (item) => item.data_prevista
                },
                {
                  id: 'valor',
                  titulo: 'Valor',
                  tipo: 'valor',
                  render: (item) => currency.format(item.valor_previsto || 0)
                }
              ])
            ]}
            itens={receipts}
            getId={(item) => item.key || item.plano_item_id}
            storageKey={isPublic ? 'tabela:cr-planejamento:recebiveis-publico' : 'tabela:cr-planejamento:recebiveis-privado'}
            rotuloRolagem={isPublic ? 'Medição prevista no período' : 'Recebíveis cadastrados para o período'}
            vazio={isPublic
              ? 'Pesquise e adicione somente os serviços executados nesta medição.'
              : 'Nenhuma parcela ou título a receber encontrado para a competência.'}
            {...(isPublic && !readonly && permissions.receipts ? {
              acoesLinha: (item) => (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => removeReceipt(item.plano_item_id)}
                  aria-label={`Remover ${item.item.descricao}`}
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              ),
              larguraAcoes: 120
            } : null)}
          />
          <div className="cr-panel-actions">
            <strong>{isPublic ? 'Total previsto' : 'Total cadastrado'}: {currency.format(totalReceipts)}</strong>
            {isPublic && permissions.receipts ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={readonly || Boolean(saving)}
                onClick={() => saveReceipts()}
              >
                {saving === 'receipts' ? 'Salvando...' : 'Salvar medição prevista'}
              </button>
            ) : (
              !isPublic ? (
                <span className="cr-automatic-source">
                  Fonte automática: contratos e títulos do Financeiro
                </span>
              ) : null
            )}
          </div>
          {!isPublic ? (
            <div className="cr-private-closeout">
              {renderSavedSummary('Recebíveis do período')}
              {renderClosureControls()}
            </div>
          ) : null}
        </div>
      ) : null}

      {approvedOnly && isPublic ? (
        <div className="cr-planning-panel cr-measurement-panel">
          <div className="cr-block-heading">
            <div>
              <h3>Medição aprovada pelo órgão</h3>
              <p>A diferença para a medição prevista é glosa e exige justificativa.</p>
            </div>
            {renderPlanningSheetActions('medicao-aprovada', permissions.measurement)}
          </div>
          {permissions.measurementView ? (
            <>
              <TabelaPadrao
                colunas={[
                  {
                    id: 'servico_aprovado',
                    titulo: 'Serviço aprovado',
                    // R17: o SERVIÇO aprovado é o que nomeia a linha da medição.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => (item.__vazio
                      ? 'Nenhum subitem nesta etapa.'
                      : <strong>{item.item?.codigo} · {item.descricao || item.item?.descricao}</strong>)
                  },
                  {
                    id: 'unidade',
                    titulo: 'Unid.',
                    tipo: 'codigo',
                    render: (item) => (item.__vazio ? null : (item.unidade || item.item?.unidade || 'un'))
                  },
                  {
                    id: 'quantidade_base',
                    titulo: 'Qtd. orçada',
                    tipo: 'numero',
                    render: (item) => (item.__vazio ? null : item.quantidade_base)
                  },
                  {
                    id: 'quantidade_anterior',
                    titulo: 'Qtd. já aprovada',
                    tipo: 'numero',
                    render: (item) => (item.__vazio ? null : asNumber(item.item?.quantidade_aprovada_anterior))
                  },
                  {
                    id: 'quantidade_medida',
                    sempreVisivel: true,
                    titulo: 'Qtd. aprovada',
                    tipo: 'numero',
                    // Edição inline: o controle mora no render da coluna.
                    render: (item) => (item.__vazio ? null : (
                      <input
                        type="number"
                        min="0"
                        max={Math.max(0, asNumber(item.quantidade_base) - asNumber(item.item?.quantidade_aprovada_anterior))}
                        step="0.0001"
                        aria-label={`Quantidade aprovada de ${item.descricao || item.item?.descricao || 'subitem'}`}
                        value={item.quantidade_medida}
                        disabled={!permissions.measurement}
                        onChange={(event) => updateMeasurement(
                          measurements.findIndex((row) => planningRowKey(row) === planningRowKey(item)),
                          'quantidade_medida',
                          event.target.value
                        )}
                      />
                    ))
                  },
                  {
                    id: 'custo_unitario',
                    titulo: 'Valor unitário',
                    tipo: 'valor',
                    render: (item) => (item.__vazio ? null : currency.format(item.custo_unitario || 0))
                  },
                  {
                    id: 'valor_medido',
                    titulo: 'Valor aprovado',
                    tipo: 'valor',
                    render: (item) => (item.__vazio ? null : <strong>{currency.format(item.valor_medido || 0)}</strong>)
                  },
                  {
                    id: 'boletim',
                    sempreVisivel: true,
                    titulo: 'Data / boletim',
                    tipo: 'texto',
                    render: (item) => (item.__vazio ? null : (
                      <>
                        <DateInputBR
                          aria-label="Data da medição"
                          value={item.data_medicao || ''}
                          disabled={!permissions.measurement}
                          onChange={(event) => updateMeasurement(
                            measurements.findIndex((row) => planningRowKey(row) === planningRowKey(item)),
                            'data_medicao',
                            event.target.value
                          )}
                        />
                        <input
                          value={item.numero_medicao || ''}
                          placeholder="Boletim"
                          aria-label="Número do boletim"
                          disabled={!permissions.measurement}
                          onChange={(event) => updateMeasurement(
                            measurements.findIndex((row) => planningRowKey(row) === planningRowKey(item)),
                            'numero_medicao',
                            event.target.value
                          )}
                        />
                      </>
                    ))
                  }
                ]}
                itens={linhasPorMacro(measurementsForMacro)}
                getId={idDaLinha}
                agruparPor={{ chave: chaveDoMacro, titulo: renderApprovedMacroHeading }}
                storageKey="tabela:cr-planejamento:medicao-aprovada"
                rotuloRolagem="Medição aprovada por etapa macro"
                vazio="Nenhuma etapa macro disponível no plano publicado."
                acoesLinha={(item) => (
                  !item.__vazio && permissions.measurement ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => removeMeasurement(planningRowKey(item))}
                      aria-label={`Remover ${item.descricao || item.item?.descricao}`}
                    >
                      <HiOutlineTrash className="h-4 w-4" />
                    </button>
                  ) : null
                )}
                larguraAcoes={120}
              />
              {totalApproved < totalReceipts ? (
                <label className="cr-field cr-measurement-justification">
                  <span>Justificativa da diferença entre previsto e aprovado</span>
                  <textarea
                    rows="3"
                    value={measurementJustification}
                    placeholder="Explique a glosa ou a diferença de composição aprovada pelo órgão."
                    disabled={!permissions.measurement}
                    onChange={(event) => setMeasurementJustification(event.target.value)}
                  />
                </label>
              ) : null}
              {data?.medicao_aprovada_estado?.sem_medicao ? (
                <div className="cr-feedback" data-tone="warning">
                  Mês registrado sem medição aprovada: {data.medicao_aprovada_estado.sem_medicao.justificativa}
                </div>
              ) : null}
              {data?.medicao_aprovada_estado && !data.medicao_aprovada_estado.editavel ? (
                <div className="cr-feedback" data-tone="warning">
                  O prazo da medição aprovada deste mês terminou. Para alterar, solicite reabertura.
                </div>
              ) : null}
              <div className="cr-panel-actions">
                <span>
                  Aprovado: {currency.format(totalApproved)} · Glosa: {currency.format(totalGlosa)}
                </span>
                {permissions.measurement ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={
                        Boolean(saving)
                        || data?.medicao_aprovada_estado?.editavel === false
                      }
                      onClick={registerNoMeasurement}
                    >
                      Sem medição neste mês
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        !measurements.length
                        || Boolean(saving)
                        || data?.medicao_aprovada_estado?.editavel === false
                        || (totalApproved < totalReceipts && measurementJustification.trim().length < 5)
                      }
                      onClick={() => saveMeasurement({ completeOnSuccess: true })}
                    >
                      {saving === 'measurement' ? 'Registrando...' : 'Registrar medição aprovada'}
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="cr-empty-state">
              Você não possui permissão para visualizar a medição aprovada.
            </div>
          )}
        </div>
      ) : null}

      {!approvedOnly && step === 1 ? (
        <div className="cr-planning-panel cr-macro-planning-panel">
          <div className="cr-block-heading">
            <div>
              <h3>Custos planejados no mês</h3>
            </div>
            {renderPlanningSheetActions(
              'custos',
              permissions.costs,
              !readonly && permissions.costs ? (
                <button type="button" className="btn btn-outline" onClick={addCost}>
                  <HiOutlinePlus className="h-4 w-4" />
                  Adicionar linha
                </button>
              ) : null,
            )}
          </div>
          <TabelaPadrao
            colunas={[
              {
                id: 'descricao',
                titulo: 'Descrição do serviço',
                // R17: o SERVIÇO é o que nomeia o subitem planejado.
                tipo: 'identidade',
                noCard: 'titulo',
                // Edição inline: o controle mora no render da coluna.
                render: (item) => {
                  const index = costs.findIndex((row) => planningRowKey(row) === planningRowKey(item));
                  const rowError = costErrors.find((entry) => entry.index === index);
                  return (
                    <>
                      <input
                        value={item.descricao || ''}
                        placeholder="Descreva o serviço planejado"
                        maxLength="500"
                        aria-label="Descrição do serviço"
                        disabled={readonly || !permissions.costs}
                        onChange={(event) => updateCost(index, 'descricao', event.target.value)}
                      />
                      {rowError ? <small>{rowError.messages.join(' · ')}</small> : null}
                    </>
                  );
                }
              },
              {
                id: 'unidade',
                titulo: 'Unidade',
                tipo: 'codigo',
                render: (item) => (
                  <input
                    value={item.unidade || ''}
                    placeholder="un, m², mês..."
                    maxLength="30"
                    aria-label="Unidade"
                    disabled={readonly || !permissions.costs}
                    onChange={(event) => updateCost(
                      costs.findIndex((row) => planningRowKey(row) === planningRowKey(item)),
                      'unidade',
                      event.target.value
                    )}
                  />
                )
              },
              {
                id: 'quantidade',
                titulo: 'Quantidade',
                tipo: 'numero',
                render: (item) => (
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    aria-label="Quantidade"
                    value={item.quantidade}
                    disabled={readonly || !permissions.costs}
                    onChange={(event) => updateCost(
                      costs.findIndex((row) => planningRowKey(row) === planningRowKey(item)),
                      'quantidade',
                      event.target.value
                    )}
                  />
                )
              },
              {
                id: 'custo_unitario',
                titulo: 'Valor unitário',
                tipo: 'valor',
                render: (item) => (
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    aria-label="Valor unitário"
                    value={item.custo_unitario}
                    disabled={readonly || !permissions.costs}
                    onChange={(event) => updateCost(
                      costs.findIndex((row) => planningRowKey(row) === planningRowKey(item)),
                      'custo_unitario',
                      event.target.value
                    )}
                  />
                )
              },
              {
                id: 'valor_previsto',
                titulo: 'Valor total',
                tipo: 'valor',
                render: (item) => <strong>{currency.format(item.valor_previsto || 0)}</strong>
              }
            ]}
            itens={costs}
            getId={idDaLinha}
            storageKey="tabela:cr-planejamento:custos"
            rotuloRolagem="Custos planejados no mês"
            vazio="Nenhum custo planejado informado. Use Adicionar linha ou importe a planilha modelo."
            urgencia={(item) => {
              const index = costs.findIndex((row) => planningRowKey(row) === planningRowKey(item));
              return costErrors.some((entry) => entry.index === index) ? 'danger' : null;
            }}
            acoesLinha={(item) => (
              !readonly && permissions.costs ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => removeCost(planningRowKey(item))}
                  aria-label={`Remover ${item.descricao || 'subitem'}`}
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              ) : null
            )}
            larguraAcoes={120}
          />
          <div className="cr-panel-actions">
            <strong>Total planejado: {currency.format(totalCosts)}</strong>
            {permissions.costs ? (
              <button
                type="button"
                className="btn btn-outline"
                disabled={readonly || Boolean(saving)}
                onClick={() => saveCosts()}
              >
                {saving === 'costs' ? 'Salvando...' : 'Salvar'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!approvedOnly && step === 3 && isPublic ? (
        <div className="cr-review-layout">
          {renderSavedSummary('Medição prevista')}
          {renderClosureControls()}
        </div>
      ) : null}

      {!approvedOnly ? <footer className="cr-step-actions">
        <button
          type="button"
          className="btn btn-outline"
          disabled={step === 1}
          onClick={() => setStep((current) => Math.max(1, current - 1))}
        >
          <HiOutlineChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <span>Etapa {step} de {steps.length}</span>
        {step < steps.length ? (
          canSaveStep ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(saving)}
              onClick={saveAndContinue}
            >
              {saving === 'costs' || saving === 'receipts' ? 'Salvando...' : 'Salvar e continuar'}
              <HiOutlineChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setStep((current) => Math.min(steps.length, current + 1))}
            >
              Próxima
              <HiOutlineChevronRight className="h-4 w-4" />
            </button>
          )
        ) : <span aria-hidden="true" />}
      </footer> : null}
      {sheetPreview ? (
        <CrPlanningImportModal
          obraId={obra.id}
          competencia={competencia}
          tipo={sheetType}
          preview={sheetPreview}
          onClose={() => setSheetPreview(null)}
          onConfirm={importAndSave}
        />
      ) : null}
      {elementoConfirmacao}
    </section>
  );
}
