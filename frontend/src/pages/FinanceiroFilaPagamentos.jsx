import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineMagnifyingGlass
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import {
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
  StatGrid,
  StatTile,
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

export default function FinanceiroFilaPagamentos() {
  const { user } = useAuth();
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [status, setStatus] = useState('PENDENTE');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
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
              motivo: ''
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
      mensagem: `${targetRows.length} título(s), total informado ${currency(total)}. Valores menores registram baixa parcial; valores maiores ficam como divergência sem baixa.`,
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
    const { ok, texto } = await confirmar({
      titulo: action === 'REABRIR' ? 'Devolver título para pagamento?' : 'Encerrar esta pendência?',
      mensagem: action === 'REABRIR'
        ? 'O saldo atual do título volta para a fila operacional.'
        : 'A pendência deixa de aparecer como ativa. O saldo financeiro do título não será alterado.',
      rotuloConfirmar: action === 'REABRIR' ? 'Devolver para fila' : 'Encerrar pendência',
      campo: { rotulo: 'Observação', obrigatorio: false, multilinha: true }
    });
    if (!ok) return;
    setActionKey(`resolve-${row.id}`);
    try {
      await resolverFilaPagamento(row.id, action, String(texto || '').trim());
      avisar.sucesso(action === 'REABRIR' ? 'Título devolvido para pagamento.' : 'Pendência encerrada.');
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao resolver a pendência.');
    } finally {
      setActionKey('');
    }
  }

  const pendingRows = useMemo(() => rows.filter((row) => row.status === 'PENDENTE'), [rows]);
  const selectedRows = useMemo(
    () => pendingRows.filter((row) => selected.includes(Number(row.id))),
    [pendingRows, selected]
  );
  const busy = Boolean(actionKey);

  return (
    <Pagina>
      <PageHeader
        titulo="Fila de Pagamentos"
        contagem={`${rows.length} título(s) à vista`}
        descricao="Confira os dados bancários e registre as baixas diretamente na tabela."
        acaoPrincipal={canSettle ? {
          rotulo: busy ? 'Processando...' : `Registrar selecionados${selectedRows.length ? ` (${selectedRows.length})` : ''}`,
          onClick: () => settle(selectedRows),
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

      <StatGrid colunas={5}>
        <StatTile label="Pendentes" valor={Number(summary.PENDENTE || 0)} tom="info" />
        <StatTile label="Não pagos" valor={Number(summary.NAO_PAGO || 0)} tom="warning" />
        <StatTile label="Divergentes" valor={Number(summary.DIVERGENTE || 0)} tom="danger" />
        <StatTile label="Baixados" valor={Number(summary.BAIXADO || 0)} tom="success" />
        <StatTile label="Resolvidos" valor={Number(summary.RESOLVIDO || 0)} />
      </StatGrid>

      <BlocoConteudo
        titulo="Pagamentos preparados"
        variante="primario"
        cor="var(--module-financeiro)"
        descricao="A empresa é determinada pela conta bancária selecionada; não há escolha separada."
        controles={(
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="sr-only">Status</span>
              <select className="input input-sm" value={status} onChange={(event) => setStatus(event.target.value)} disabled={busy}>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <form
              className="flex min-w-[260px] items-center gap-2"
              onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }}
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
          <table className="w-full min-w-[1520px] border-collapse text-sm">
            <thead className="bg-[var(--c-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--c-muted)]">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os títulos pendentes"
                    checked={pendingRows.length > 0 && selectedRows.length === pendingRows.length}
                    onChange={(event) => setSelected(event.target.checked ? pendingRows.map((row) => Number(row.id)) : [])}
                    disabled={!canSettle || busy}
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
                <th className="px-3 py-3">Status / ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--c-border)] bg-[var(--c-surface)]">
              {loading ? (
                <tr><td colSpan="11" className="px-4 py-10 text-center text-[var(--c-muted)]">Carregando pagamentos...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="11" className="px-4 py-10 text-center text-[var(--c-muted)]">Nenhum título encontrado neste recorte.</td></tr>
              ) : rows.map((row) => {
                const title = row.titulo || {};
                const beneficiary = beneficiaryData(title);
                const account = selectedAccount(row);
                const editable = row.status === 'PENDENTE' && canSettle;
                const accountOptions = compatibleAccounts(row);
                const reasonVisible = reasonOpenId === row.id;
                return (
                  <tr key={row.id} className={row.status === 'DIVERGENTE' ? 'bg-red-50/60 dark:bg-red-950/10' : row.status === 'NAO_PAGO' ? 'bg-amber-50/60 dark:bg-amber-950/10' : ''}>
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${title.codigo || row.id}`}
                        checked={selected.includes(Number(row.id))}
                        onChange={(event) => setSelected((current) => event.target.checked
                          ? [...new Set([...current, Number(row.id)])]
                          : current.filter((id) => id !== Number(row.id)))}
                        disabled={!editable || busy}
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
                      {editable && accountOptions.length === 0 ? <div className="mt-1 text-xs text-red-600">Nenhuma conta da empresa.</div> : null}
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
                    <td className="px-3 py-3 align-top">
                      <StatusBadge status={String(row.status || '').replace('_', ' ')} kind={statusKind(row.status)} />
                      {row.motivo ? <div className="mt-2 max-w-[260px] text-xs text-[var(--c-muted)]" title={row.motivo}>{row.motivo}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {editable && canSettle ? (
                          <button className="btn btn-primary btn-sm" type="button" onClick={() => settle([row])} disabled={busy}>Registrar baixa</button>
                        ) : null}
                        {row.status === 'PENDENTE' && canReport ? (
                          <button className="btn btn-outline btn-sm" type="button" onClick={() => setReasonOpenId(reasonVisible ? null : row.id)} disabled={busy}>Não pago</button>
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
