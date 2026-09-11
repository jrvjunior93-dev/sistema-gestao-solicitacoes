import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineMagnifyingGlass
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import {
  aprovarDivergenciasFilaPagamentos,
  getContasFilaPagamentos,
  getFilaPagamentos,
  informarNaoPagamentoFila,
  registrarBaixasFilaPagamentos,
  resolverFilaPagamento
} from '../services/financeiro';
import {
  canBaixarFilaPagamentos,
  canAccessFinanceiro,
  canReportarFilaPagamentos,
  canResolverFilaPagamentos
} from '../utils/acessoProduto';
import DateInputBR from '../components/DateInputBR';
import StatusBadge from '../components/StatusBadge';
import {
  Avisos,
  BlocoConteudo,
  PageHeader,
  Pagina,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

const STATUS_OPTIONS = [
  ['PENDENTE', 'Pendentes'],
  ['NAO_PAGO', 'Não pagos'],
  ['DIVERGENTE', 'Divergentes'],
  ['BAIXADO', 'Baixados'],
  ['RESOLVIDO', 'Resolvidos'],
  ['TODOS', 'Todos']
];

const STATUS_VALUES = new Set(STATUS_OPTIONS.map(([value]) => value));
const SUMMARY_FILTERS = [
  { status: 'PENDENTE', label: 'Pendentes', tone: 'info' },
  { status: 'NAO_PAGO', label: 'Não pagos', tone: 'warning' },
  { status: 'DIVERGENTE', label: 'Divergentes', tone: 'danger' },
  { status: 'BAIXADO', label: 'Baixados', tone: 'success' },
  { status: 'RESOLVIDO', label: 'Resolvidos', tone: 'neutral' }
];

function SummaryFilter({ item, value, active, onClick, disabled }) {
  const toneClass = {
    info: 'text-[var(--sem-info)]',
    warning: 'text-[var(--sem-warning)]',
    danger: 'text-[var(--sem-danger)]',
    success: 'text-[var(--sem-success)]',
    neutral: 'text-[var(--c-text)]'
  }[item.tone];
  return (
    <button
      type="button"
      className={`rounded-xl border bg-[var(--c-surface)] px-4 py-4 text-left transition hover:-translate-y-px hover:border-[var(--module-financeiro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-financeiro)] ${active ? 'border-[var(--module-financeiro)] shadow-sm ring-1 ring-[var(--module-financeiro)]' : 'border-[var(--c-border)]'}`}
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
    >
      <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">{item.label}</span>
      <span className={`mt-2 block text-lg font-semibold ${toneClass}`}>{Number(value || 0)}</span>
    </button>
  );
}

function hojeISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function currency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateBR(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : String(value);
}

function idempotencyKey(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function statusKind(status) {
  if (status === 'DIVERGENTE') return 'danger';
  if (status === 'NAO_PAGO') return 'warning';
  if (status === 'BAIXADO' || status === 'RESOLVIDO') return 'success';
  return 'info';
}

function beneficiaryData(titulo) {
  const beneficiary = titulo?.paymentBeneficiary;
  const form = [titulo?.formaPagamento?.tipo, titulo?.formaPagamento?.codigo, titulo?.formaPagamento?.nome]
    .filter(Boolean).join(' ').toUpperCase();
  const boletoData = titulo?.linha_digitavel || titulo?.codigo_barras;
  if (beneficiary) {
    let pagamento = 'Sem dados bancários cadastrados';
    if (form.includes('BOLETO') && boletoData) pagamento = `Boleto: ${boletoData}`;
    else if (beneficiary.pix_chave) pagamento = `PIX ${beneficiary.pix_tipo_chave || ''}: ${beneficiary.pix_chave}`;
    else if (beneficiary.banco_codigo || beneficiary.agencia || beneficiary.conta) {
      pagamento = `Banco ${beneficiary.banco_codigo || '—'} · Ag. ${beneficiary.agencia || '—'} · Conta ${beneficiary.conta || '—'}`;
    }
    return {
      nome: beneficiary.nome || titulo?.parceiro?.nome || 'Não informado',
      documento: beneficiary.cpf_cnpj || titulo?.parceiro?.cpf_cnpj || '',
      pagamento
    };
  }
  return {
    nome: titulo?.parceiro?.nome || 'Não informado',
    documento: titulo?.parceiro?.cpf_cnpj || '',
    pagamento: boletoData ? `Boleto: ${boletoData}` : 'Sem instrução bancária cadastrada'
  };
}

function empresaIdTitulo(titulo) {
  return Number(titulo?.empresa_id || titulo?.empresa?.id || titulo?.obra?.empresa_grupo_id || 0) || null;
}

function valorParaInput(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '';
}

function valorEmCentavos(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : null;
}

function tipoDivergenciaPagamento(row, draft = {}) {
  const valorPago = valorEmCentavos(draft.valor_pago);
  const saldo = valorEmCentavos(row?.titulo?.valor_saldo);
  const previsto = valorEmCentavos(row?.valor_previsto);
  if (!valorPago || saldo === null || previsto === null) return '';
  if (valorPago < saldo) return 'PARCIAL';
  if (valorPago > saldo) return 'ACIMA_SALDO';
  if (valorPago !== previsto) return 'DIFERENTE_PREVISTO';
  return '';
}

function mensagemJustificativaDivergencia(tipo) {
  if (tipo === 'PARCIAL') return 'Justifique por que o pagamento será parcial.';
  if (tipo === 'ACIMA_SALDO') return 'Justifique por que o pagamento será maior que o saldo.';
  if (tipo === 'DIFERENTE_PREVISTO') return 'Justifique a diferença em relação ao valor previsto.';
  return 'Opcional quando o valor pago corresponde ao saldo e ao previsto.';
}

export default function FinanceiroFilaPagamentos() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const initialStatus = STATUS_VALUES.has(String(searchParams.get('status') || '').toUpperCase())
    ? String(searchParams.get('status')).toUpperCase()
    : 'PENDENTE';
  const initialSearch = String(searchParams.get('q') || '');
  const [status, setStatus] = useState(initialStatus);
  const [search, setSearch] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState('');
  const [reasonOpenId, setReasonOpenId] = useState(null);

  const canSettle = canBaixarFilaPagamentos(user);
  const canOpenTitle = canAccessFinanceiro(user);
  const canReport = canReportarFilaPagamentos(user);
  const canResolve = canResolverFilaPagamentos(user);

  function applyFilters(nextStatus = status, nextSearch = appliedSearch) {
    setStatus(nextStatus);
    setAppliedSearch(nextSearch);
    setSelected([]);
    const nextParams = new URLSearchParams();
    if (nextStatus !== 'PENDENTE') nextParams.set('status', nextStatus);
    if (nextSearch) nextParams.set('q', nextSearch);
    setSearchParams(nextParams, { replace: true });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queueResult, accountResult] = await Promise.all([
        getFilaPagamentos({ status, q: appliedSearch || undefined }),
        getContasFilaPagamentos()
      ]);
      const nextRows = queueResult?.data || [];
      setRows(nextRows);
      setSummary(queueResult?.resumo || {});
      setAccounts(Array.isArray(accountResult) ? accountResult : accountResult?.data || []);
      setSelected((current) => current.filter((id) => nextRows.some((row) => Number(row.id) === Number(id))));
      setDrafts((current) => {
        const next = { ...current };
        nextRows.forEach((row) => {
          if (!next[row.id]) {
            next[row.id] = {
              data_baixa: row.data_baixa || hojeISO(),
              conta_bancaria_id: row.conta_bancaria_id || '',
              valor_pago: valorParaInput(row.valor_informado || row?.titulo?.valor_saldo || row.valor_previsto),
              motivo: row.motivo || ''
            };
          }
        });
        return next;
      });
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao carregar a fila de pagamentos.');
    } finally {
      setLoading(false);
    }
  }, [status, appliedSearch, avisar]);

  useEffect(() => { load(); }, [load]);

  function updateDraft(id, patch) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function compatibleAccounts(row) {
    const companyId = empresaIdTitulo(row.titulo);
    return companyId ? accounts.filter((account) => Number(account.empresa_id) === companyId) : accounts;
  }

  function selectedAccount(row) {
    const id = Number(drafts[row.id]?.conta_bancaria_id || 0);
    return accounts.find((account) => Number(account.id) === id) || null;
  }

  function validateRows(targetRows) {
    for (const row of targetRows) {
      const draft = drafts[row.id] || {};
      if (!draft.data_baixa) return `Informe a data da baixa do título ${row.titulo?.codigo || row.id}.`;
      if (!Number(draft.conta_bancaria_id)) return `Selecione a conta pagadora do título ${row.titulo?.codigo || row.id}.`;
      if (!(Number(draft.valor_pago) > 0)) return `Informe um valor pago válido para o título ${row.titulo?.codigo || row.id}.`;
      const tipoDivergencia = tipoDivergenciaPagamento(row, draft);
      if (tipoDivergencia && !String(draft.motivo || '').trim()) {
        return `Informe a justificativa do valor divergente para o título ${row.titulo?.codigo || row.id}.`;
      }
    }
    return '';
  }

  async function settle(targetRows) {
    const problem = validateRows(targetRows);
    if (problem) {
      avisar.alerta(problem);
      return;
    }
    const total = targetRows.reduce((sum, row) => sum + Number(drafts[row.id]?.valor_pago || 0), 0);
    const { ok } = await confirmar({
      titulo: targetRows.length === 1 ? 'Registrar baixa deste título?' : 'Registrar baixas selecionadas?',
      mensagem: `${targetRows.length} título(s), total informado ${currency(total)}. Valores divergentes exigem justificativa: pagamentos parciais registram a baixa parcial e valores acima do saldo aguardam autorização.`,
      rotuloConfirmar: targetRows.length === 1 ? 'Registrar baixa' : 'Registrar baixas',
      destrutiva: false
    });
    if (!ok) return;

    const key = idempotencyKey('fila-baixa');
    setActionKey(`settle-${key}`);
    try {
      const result = await registrarBaixasFilaPagamentos(targetRows.map((row) => ({
        fila_id: row.id,
        data_baixa: drafts[row.id].data_baixa,
        conta_bancaria_id: Number(drafts[row.id].conta_bancaria_id),
        valor_pago: Number(drafts[row.id].valor_pago),
        motivo: String(drafts[row.id].motivo || '').trim() || undefined
      })), key);
      avisar.sucesso(`${result?.baixados || 0} baixa(s) registrada(s). ${result?.divergentes || 0} divergência(s) sinalizada(s).`);
      setSelected([]);
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao registrar as baixas. Nenhum item do lote foi alterado.');
    } finally {
      setActionKey('');
    }
  }

  async function approveDivergences(targetRows) {
    if (targetRows.length === 0) return;
    const total = targetRows.reduce((sum, row) => sum + Number(row.valor_informado || 0), 0);
    const { ok, texto } = await confirmar({
      titulo: targetRows.length === 1 ? 'Autorizar baixa divergente?' : 'Autorizar baixas divergentes?',
      mensagem: `${targetRows.length} título(s), total informado ${currency(total)}. A autorização registra as baixas ainda pendentes e conclui as divergências já processadas.`,
      rotuloConfirmar: targetRows.length === 1 ? 'Autorizar baixa' : 'Autorizar selecionados',
      destrutiva: false,
      campo: { rotulo: 'Justificativa da aprovação', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;

    const key = idempotencyKey('fila-aprovar-divergencia');
    setActionKey(`approve-${key}`);
    try {
      const result = await aprovarDivergenciasFilaPagamentos(
        targetRows.map((row) => Number(row.id)),
        String(texto || '').trim(),
        key
      );
      avisar.sucesso(`${result?.quantidade || 0} divergência(s) aprovada(s). ${result?.baixas_registradas || 0} baixa(s) registrada(s) agora.`);
      setSelected([]);
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao aprovar as divergências. Nenhum item do lote foi alterado.');
    } finally {
      setActionKey('');
    }
  }

  async function reportNotPaid(row) {
    const reason = String(drafts[row.id]?.motivo || '').trim();
    if (!reason) {
      avisar.alerta(`Informe o motivo de não pagamento do título ${row.titulo?.codigo || row.id}.`);
      setReasonOpenId(row.id);
      return;
    }
    setActionKey(`not-paid-${row.id}`);
    try {
      await informarNaoPagamentoFila(row.id, reason);
      avisar.sucesso('Título mantido em aberto e sinalizado como não pago.');
      setReasonOpenId(null);
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao informar o não pagamento.');
    } finally {
      setActionKey('');
    }
  }

  async function resolve(row, action) {
    const reabrir = action === 'REABRIR';
    const { ok, texto } = await confirmar({
      titulo: reabrir ? 'Devolver título para pagamento?' : 'Encerrar esta pendência?',
      mensagem: reabrir
        ? 'O saldo atual do título volta para a fila operacional.'
        : 'A pendência deixa de aparecer como ativa. O saldo financeiro do título não será alterado.',
      rotuloConfirmar: reabrir ? 'Devolver para fila' : 'Encerrar pendência',
      campo: reabrir ? undefined : { rotulo: 'Observação', obrigatorio: false, multilinha: true }
    });
    if (!ok) return;
    setActionKey(`resolve-${row.id}`);
    try {
      await resolverFilaPagamento(row.id, action, reabrir ? '' : String(texto || '').trim());
      avisar.sucesso(reabrir ? 'Título devolvido para pagamento.' : 'Pendência encerrada.');
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao resolver a pendência.');
    } finally {
      setActionKey('');
    }
  }

  const pendingRows = useMemo(() => rows.filter((row) => row.status === 'PENDENTE'), [rows]);
  const divergentRows = useMemo(() => rows.filter((row) => row.status === 'DIVERGENTE'), [rows]);
  const selectableRows = status === 'DIVERGENTE' && canResolve
    ? divergentRows
    : (status === 'PENDENTE' && canSettle ? pendingRows : []);
  const selectedRows = useMemo(
    () => selectableRows.filter((row) => selected.includes(Number(row.id))),
    [selectableRows, selected]
  );
  const approvingDivergences = status === 'DIVERGENTE';
  const hasBulkAction = status === 'DIVERGENTE' ? canResolve : (status === 'PENDENTE' && canSettle);
  const showReasonColumn = status === 'DIVERGENTE' || status === 'PENDENTE';
  const busy = Boolean(actionKey);

  return (
    <Pagina>
      <PageHeader
        titulo="Fila de Pagamentos"
        contagem={`${rows.length} título(s) à vista`}
        descricao="Confira os dados bancários e registre as baixas diretamente na tabela."
        acaoPrincipal={hasBulkAction ? {
          rotulo: busy
            ? 'Processando...'
            : `${approvingDivergences ? 'Autorizar' : 'Registrar'} selecionados${selectedRows.length ? ` (${selectedRows.length})` : ''}`,
          onClick: () => approvingDivergences ? approveDivergences(selectedRows) : settle(selectedRows),
          desabilitada: busy || selectedRows.length === 0,
          icone: <HiOutlineCheckCircle aria-hidden="true" />
        } : undefined}
        secundarias={[{
          rotulo: 'Atualizar',
          onClick: () => { limparAvisos(); load(); },
          desabilitada: loading || busy,
          icone: <HiOutlineArrowPath aria-hidden="true" />
        }]}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Filtros rápidos da fila">
        {SUMMARY_FILTERS.map((item) => (
          <SummaryFilter
            key={item.status}
            item={item}
            value={summary[item.status]}
            active={status === item.status}
            onClick={() => applyFilters(item.status, appliedSearch)}
            disabled={busy}
          />
        ))}
      </div>

      <BlocoConteudo
        titulo="Pagamentos preparados"
        variante="primario"
        cor="var(--module-financeiro)"
        descricao="A empresa é determinada pela conta bancária selecionada; não há escolha separada."
        controles={(
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="sr-only">Status</span>
              <select className="input input-sm" value={status} onChange={(event) => applyFilters(event.target.value, appliedSearch)} disabled={busy}>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <form
              className="flex min-w-[260px] items-center gap-2"
              onSubmit={(event) => { event.preventDefault(); applyFilters(status, search.trim()); }}
            >
              <input
                className="input input-sm min-w-0 flex-1"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Título, credor, documento ou obra"
              />
              <button className="btn btn-outline btn-sm" type="submit" title="Pesquisar">
                <HiOutlineMagnifyingGlass className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        )}
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--c-border)]" aria-label="Tabela da fila de pagamentos">
          <table className="w-full min-w-[1760px] border-collapse text-sm">
            <thead className="bg-[var(--ui-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--c-muted)]">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={approvingDivergences ? 'Selecionar todas as divergências' : 'Selecionar todos os títulos pendentes'}
                    checked={selectableRows.length > 0 && selectedRows.length === selectableRows.length}
                    onChange={(event) => setSelected(event.target.checked ? selectableRows.map((row) => Number(row.id)) : [])}
                    disabled={selectableRows.length === 0 || busy}
                  />
                </th>
                <th className="px-3 py-3">Título / documento</th>
                <th className="px-3 py-3">Credor / favorecido</th>
                <th className="px-3 py-3">Dados para pagamento</th>
                <th className="px-3 py-3">Vencimento</th>
                <th className="px-3 py-3 text-right">Previsto / saldo</th>
                <th className="px-3 py-3">Data da baixa</th>
                <th className="px-3 py-3">Conta pagadora</th>
                <th className="px-3 py-3">Empresa</th>
                <th className="px-3 py-3">Valor pago</th>
                {showReasonColumn ? <th className="px-3 py-3">Justificativa</th> : null}
                <th className="px-3 py-3">Status / ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--c-border)] bg-[var(--c-surface)]">
              {loading ? (
                <tr><td colSpan={showReasonColumn ? 12 : 11} className="px-4 py-10 text-center text-[var(--c-muted)]">Carregando pagamentos...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={showReasonColumn ? 12 : 11} className="px-4 py-10 text-center text-[var(--c-muted)]">Nenhum título encontrado neste recorte.</td></tr>
              ) : rows.map((row) => {
                const title = row.titulo || {};
                const beneficiary = beneficiaryData(title);
                const account = selectedAccount(row);
                const editable = row.status === 'PENDENTE' && canSettle;
                const selectable = selectableRows.some((item) => Number(item.id) === Number(row.id));
                const accountOptions = compatibleAccounts(row);
                const reasonVisible = reasonOpenId === row.id;
                const tipoDivergencia = editable ? tipoDivergenciaPagamento(row, drafts[row.id]) : '';
                return (
                  <tr key={row.id} className={row.status === 'DIVERGENTE' ? 'bg-[var(--sem-danger-bg)]' : row.status === 'NAO_PAGO' ? 'bg-[var(--sem-warning-bg)]' : ''}>
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${title.codigo || row.id}`}
                        checked={selected.includes(Number(row.id))}
                        onChange={(event) => setSelected((current) => event.target.checked
                          ? [...new Set([...current, Number(row.id)])]
                          : current.filter((id) => id !== Number(row.id)))}
                        disabled={!selectable || busy}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      {canOpenTitle ? (
                        <Link className="font-semibold text-[var(--module-financeiro)] hover:underline" to={`/financeiro/titulos/${title.id}`}>{title.codigo || `#${title.id}`}</Link>
                      ) : (
                        <span className="font-semibold text-[var(--c-text)]">{title.codigo || `#${title.id}`}</span>
                      )}
                      <div className="mt-1 max-w-[210px] truncate" title={title.descricao}>{title.descricao || 'Sem descrição'}</div>
                      <div className="text-xs text-[var(--c-muted)]">{title.numero_documento || 'Sem documento'} · {title.formaPagamento?.nome || 'Forma não informada'}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[230px] font-medium" title={beneficiary.nome}>{beneficiary.nome}</div>
                      <div className="text-xs text-[var(--c-muted)]">{beneficiary.documento || 'Documento não informado'}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[250px] break-all text-xs" title={beneficiary.pagamento}>{beneficiary.pagamento}</div>
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">{dateBR(title.data_vencimento || row.data_vencimento_prevista)}</td>
                    <td className="px-3 py-3 align-top text-right whitespace-nowrap">
                      <div>{currency(row.valor_previsto)}</div>
                      <div className="text-xs font-semibold text-[var(--c-muted)]">Saldo {currency(title.valor_saldo)}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <DateInputBR
                        className="input input-sm w-[128px]"
                        value={drafts[row.id]?.data_baixa || row.data_baixa || ''}
                        onChange={(event) => updateDraft(row.id, { data_baixa: event.target.value })}
                        disabled={!editable || busy}
                        aria-label={`Data da baixa de ${title.codigo || row.id}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <select
                        className="input input-sm w-[230px]"
                        value={drafts[row.id]?.conta_bancaria_id || row.conta_bancaria_id || ''}
                        onChange={(event) => updateDraft(row.id, { conta_bancaria_id: event.target.value })}
                        disabled={!editable || busy}
                        aria-label={`Conta pagadora de ${title.codigo || row.id}`}
                      >
                        <option value="">Selecione</option>
                        {accountOptions.map((item) => (
                          <option key={item.id} value={item.id}>{item.nome} · {item.banco || 'Banco'} {item.conta || ''}</option>
                        ))}
                      </select>
                      {editable && accountOptions.length === 0 ? <div className="mt-1 text-xs text-[var(--sem-danger)]">Nenhuma conta da empresa.</div> : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[180px] text-xs font-medium">{account?.empresa?.nome || account?.empresa?.razao_social || title.empresa?.nome || 'Definida pela conta'}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        className="input input-sm w-[130px] text-right"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={drafts[row.id]?.valor_pago ?? valorParaInput(row.valor_informado || title.valor_saldo)}
                        onChange={(event) => updateDraft(row.id, { valor_pago: event.target.value })}
                        disabled={!editable || busy}
                        aria-label={`Valor pago de ${title.codigo || row.id}`}
                      />
                    </td>
                    {showReasonColumn ? (
                      <td className="px-3 py-3 align-top">
                        {editable ? (
                          <div className="w-[280px]">
                            <textarea
                              className={`input min-h-[72px] w-full ${tipoDivergencia && !String(drafts[row.id]?.motivo || '').trim() ? 'border-[var(--sem-danger)]' : ''}`}
                              value={drafts[row.id]?.motivo || ''}
                              onChange={(event) => updateDraft(row.id, { motivo: event.target.value })}
                              placeholder={tipoDivergencia ? 'Justificativa obrigatória' : 'Observação opcional'}
                              required={Boolean(tipoDivergencia)}
                              aria-label={`Justificativa do pagamento de ${title.codigo || row.id}`}
                              disabled={busy}
                            />
                            <div className={`mt-1 text-xs ${tipoDivergencia ? 'font-semibold text-[var(--sem-danger)]' : 'text-[var(--c-muted)]'}`}>
                              {mensagemJustificativaDivergencia(tipoDivergencia)}
                            </div>
                          </div>
                        ) : (
                          <div className="max-w-[300px] whitespace-pre-wrap text-xs text-[var(--c-text)]" title={row.motivo || ''}>
                            {row.motivo || 'Sem justificativa informada.'}
                          </div>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-3 align-top">
                      <StatusBadge status={String(row.status || '').replace('_', ' ')} kind={statusKind(row.status)} />
                      {!showReasonColumn && row.motivo ? <div className="mt-2 max-w-[260px] text-xs text-[var(--c-muted)]" title={row.motivo}>{row.motivo}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {editable && canSettle ? (
                          <button className="btn btn-primary btn-sm" type="button" onClick={() => settle([row])} disabled={busy}>Registrar baixa</button>
                        ) : null}
                        {row.status === 'PENDENTE' && canReport ? (
                          <button className="btn btn-outline btn-sm" type="button" onClick={() => setReasonOpenId(reasonVisible ? null : row.id)} disabled={busy}>Não pago</button>
                        ) : null}
                        {row.status === 'DIVERGENTE' && canResolve ? (
                          <button className="btn btn-primary btn-sm" type="button" onClick={() => approveDivergences([row])} disabled={busy}>Autorizar baixa</button>
                        ) : null}
                        {['NAO_PAGO', 'DIVERGENTE'].includes(row.status) && canResolve ? (
                          <>
                            {Number(title.valor_saldo || 0) > 0 ? <button className="btn btn-outline btn-sm" type="button" onClick={() => resolve(row, 'REABRIR')} disabled={busy}>Reabrir</button> : null}
                            <button className="btn btn-outline btn-sm" type="button" onClick={() => resolve(row, 'ENCERRAR')} disabled={busy}>Encerrar</button>
                          </>
                        ) : null}
                      </div>
                      {reasonVisible ? (
                        <div className="mt-2 w-[280px]">
                          <textarea
                            className="input min-h-[72px] w-full"
                            value={drafts[row.id]?.motivo || ''}
                            onChange={(event) => updateDraft(row.id, { motivo: event.target.value })}
                            placeholder="Motivo do não pagamento"
                            disabled={busy}
                          />
                          <button className="btn btn-outline btn-sm mt-1" type="button" onClick={() => reportNotPaid(row)} disabled={busy}>Confirmar não pagamento</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--c-muted)]">
          O processamento em massa é atômico: se uma linha falhar na validação, nenhuma baixa do lote é gravada.
        </p>
      </BlocoConteudo>
      {elementoConfirmacao}
    </Pagina>
  );
}
