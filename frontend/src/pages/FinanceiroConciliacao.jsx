import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  baixarTituloPorConciliacoes,
  conciliarSugestoesBancarias,
  confirmarConciliacaoBancaria,
  confirmarConciliacaoFaturaCartao,
  confirmarConciliacaoCreditoRotativo,
  confirmarConciliacaoEstornoBancario,
  confirmarConciliacaoEstornoTarifa,
  confirmarConciliacaoTarifaBancaria,
  confirmarConciliacaoTransferencia,
  estornarConciliacaoTransferencia,
  criarTituloConciliacaoBancaria,
  getConciliacoesBancarias,
  getCategoriasFinanceiras,
  getContasBancarias,
  getFaturasAssociacaoConciliacao,
  getImportacoesConciliacao,
  getMovimentosAssociacaoConciliacao,
  getTarifasBancariasAtalhos,
  getTitulosFinanceiros,
  ignorarConciliacaoBancaria,
  importarOfxConciliacao,
  removerConciliacaoBancaria
} from '../services/financeiro';
import { buscarParceiros } from '../services/parceiros';
import { getMinhasObras } from '../services/obras';
import { formatCurrencyInput, normalizeCurrencyTyping, parseCurrencyInput } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';
import { hasPermissao } from '../utils/acessoProduto';

const TIPOS_INTERCOMPANY = [
  { value: 'APORTE', label: 'Aporte' },
  { value: 'EMPRESTIMO', label: 'Emprestimo' },
  { value: 'REEMBOLSO', label: 'Reembolso' },
  { value: 'RATEIO', label: 'Rateio' },
  { value: 'COBERTURA_CAIXA', label: 'Cobertura de caixa' },
  { value: 'FOLHA', label: 'Folha' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
  { value: 'IMPOSTO', label: 'Imposto' },
  { value: 'TRANSFERENCIA_OPERACIONAL', label: 'Transferencia operacional' }
];

const CLASSIFICACOES_INCOMPATIVEIS_COM_TARIFA = new Set([
  'ENDIVIDAMENTO',
  'INVESTIMENTO',
  'PATRIMONIAL',
  'INTERCOMPANY',
  'TRANSFERENCIA_INTERNA'
]);

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'CONCILIADO') return 'Conciliado';
  if (s === 'IGNORADO') return 'Ignorado';
  return 'Pendente';
}

function statusClass(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'CONCILIADO') return 'app-status-pill bg-emerald-100 text-emerald-700';
  if (s === 'IGNORADO') return 'app-status-pill bg-slate-100 text-slate-500';
  return 'app-status-pill bg-amber-100 text-amber-700';
}

function getContaNome(conta) {
  return conta?.nome || conta?.descricao || conta?.conta_corrente || conta?.conta || `Conta #${conta?.id || '-'}`;
}

function getContaBanco(conta) {
  return conta?.banco || conta?.banco_nome || conta?.instituicao || conta?.instituicao_nome || 'Banco nao informado';
}

function getContaAgencia(conta) {
  return conta?.agencia || conta?.agencia_numero || conta?.numero_agencia || '-';
}

function getContaNumero(conta) {
  return conta?.conta || conta?.numero_conta || conta?.conta_corrente || conta?.codigo || '-';
}

function tipoTituloPorValorExtrato(value) {
  return Number(value || 0) >= 0 ? 'RECEBER' : 'PAGAR';
}

function buildAssociacaoDefaults(item) {
  return {
    data_inicial: item?.data_movimento || '',
    data_final: item?.data_movimento || '',
    documento: '',
    numero_documento: '',
    valor_inicial: '',
    valor_final: '',
    limit: 30
  };
}

function valorAbsolutoMovimentoAssociacao(item) {
  return Math.abs(Number(item?.valor_quitacao || item?.valor || 0));
}

function buildAssociacaoResumo(modal) {
  const selecionados = Array.isArray(modal?.selecionados)
    ? modal.selecionados.map(Number).filter(Boolean)
    : [];
  const itens = Array.isArray(modal?.dados?.itens) ? modal.dados.itens : [];
  const totalSelecionado = itens
    .filter((item) => selecionados.includes(Number(item.movimento_financeiro_id || 0)))
    .reduce((total, item) => total + valorAbsolutoMovimentoAssociacao(item), 0);
  const valorEsperado = Math.abs(Number(modal?.item?.valor || 0));
  const diferenca = valorEsperado - totalSelecionado;

  return {
    selecionados,
    totalSelecionado,
    valorEsperado,
    diferenca,
    ultrapassou: totalSelecionado > valorEsperado + 0.01,
    fechou: selecionados.length > 0 && Math.abs(diferenca) <= 0.01
  };
}

// ─── ícones ───────────────────────────────────────────────────────────────────

function getContaEmpresaId(conta) {
  return String(conta?.empresa_id || conta?.empresa?.id || '');
}

function getContaEmpresaNome(conta) {
  return conta?.empresa?.nome || conta?.empresa?.razao_social || (conta?.empresa_id ? `Empresa #${conta.empresa_id}` : 'Sem empresa vinculada');
}

function tarifaAtalhoAptaParaConciliacao(tarifa = {}) {
  if (!tarifa.categoria_financeira_id) {
    return { ok: true, motivo: 'Sem categoria fixa: o sistema tentara usar uma categoria padrao de tarifa bancaria.' };
  }

  const categoria = tarifa.categoria_financeira;
  if (!categoria) {
    return { ok: true, motivo: tarifa.descricao || tarifa.nome || '' };
  }

  const tipo = String(categoria.tipo || '').trim().toUpperCase();
  if (!['PAGAR', 'AMBOS'].includes(tipo)) {
    return { ok: false, motivo: 'A categoria da tarifa deve ser de pagar ou ambos.' };
  }
  if (categoria.ativo === false) {
    return { ok: false, motivo: 'A categoria da tarifa esta inativa.' };
  }
  if (categoria.considera_dre === false || !String(categoria.dre_grupo || '').trim()) {
    return { ok: false, motivo: 'A categoria da tarifa precisa estar classificada para DRE.' };
  }
  const classificacao = String(categoria.classificacao_gerencial || '').trim().toUpperCase();
  if (CLASSIFICACOES_INCOMPATIVEIS_COM_TARIFA.has(classificacao)) {
    return { ok: false, motivo: 'A categoria da tarifa nao pode ser divida, patrimonio, entre empresas ou transferencia interna.' };
  }

  return {
    ok: true,
    motivo: `${categoria.nome}${categoria.dre_grupo ? ` - ${categoria.dre_grupo}` : ''}`
  };
}

function KeyIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M14.5 7.5a4.5 4.5 0 1 1-2.8 8l-4.2 4.2H5v-2.5H2.5v-2.5l4.1-4.1a4.5 4.5 0 0 1 7.9-3.1Z" />
      <path d="M16.5 7.5h.01" />
    </svg>
  );
}

function SparkIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="m12 3 1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3L12 3Z" />
      <path d="m18 14 1 2.6 2.5.7-2.5 1-1 2.7-1-2.7-2.5-1 2.5-.7 1-2.6Z" />
    </svg>
  );
}

function PlusIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function LinkIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </svg>
  );
}

// ─── ValorBanco ───────────────────────────────────────────────────────────────

function ValorBanco({ value, size = 'lg' }) {
  const positive = Number(value || 0) >= 0;
  const sizeClass = size === 'xl' ? 'text-2xl font-bold tabular-nums' : size === 'sm' ? 'text-sm font-semibold' : 'text-lg font-semibold';
  return (
    <span className={`${sizeClass} ${positive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
      {formatCurrency(value)}
    </span>
  );
}

// ─── NovoTituloRapidoModal ────────────────────────────────────────────────────

function AcoesRapidasConciliacaoModal({ item, tarifas, processingId, error, onClose, onNovoTitulo, onConfirmarCreditoRotativo, onConfirmarTarifa, onConfirmarEstornoTarifa }) {
  const tarifasAtivas = Array.isArray(tarifas) ? tarifas.filter((tarifa) => tarifa.ativo !== false) : [];
  const isSaida = Number(item?.valor || 0) < 0;
  const creditoRotativoNatureza = isSaida ? 'amortizacao' : 'liberacao';
  const creditoRotativoKey = `credito-rotativo-${item?.id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-[var(--c-surface)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] pb-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--c-text)]">Acoes rapidas</h2>
            <p className="mt-0.5 text-sm text-[var(--c-muted)]">Escolha como registrar este lancamento bancario.</p>
            {item && (
              <div className="mt-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm">
                <span className="font-medium">{item.descricao_banco || 'Lancamento bancario'}</span>
                {' - '}{formatDate(item.data_movimento)}
                {' - '}<ValorBanco value={item.valor} size="sm" />
              </div>
            )}
          </div>
          <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={onClose}>Fechar</button>
        </div>

        <div className="mt-4 grid gap-3">
          <button
            type="button"
            className="rounded-xl border border-[var(--c-border)] px-4 py-3 text-left transition-colors hover:border-[var(--c-primary)] hover:bg-[var(--c-bg)]"
            onClick={() => onNovoTitulo(item)}
          >
            <span className="block text-sm font-semibold text-[var(--c-text)]">Criar titulo + baixa</span>
            <span className="mt-0.5 block text-xs text-[var(--c-muted)]">Usa o fluxo completo de contas a pagar/receber e concilia o movimento.</span>
          </button>

          <div className="rounded-xl border border-[var(--c-border)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--c-text)]">Credito rotativo</p>
                <p className="text-xs text-[var(--c-muted)]">
                  Registra {creditoRotativoNatureza} no caixa e no endividamento, sem compor a DRE.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm shrink-0"
                disabled={processingId === creditoRotativoKey}
                onClick={() => onConfirmarCreditoRotativo(item)}
              >
                {processingId === creditoRotativoKey
                  ? 'Registrando...'
                  : isSaida ? 'Registrar amortizacao' : 'Registrar liberacao'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-[var(--c-border)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--c-text)]">Registrar tarifa bancaria</p>
                <p className="text-xs text-[var(--c-muted)]">Cria movimento avulso de tarifa com categoria financeira explicita para DRE.</p>
              </div>
              {!isSaida && <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">Apenas saidas</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {tarifasAtivas.length === 0 ? (
                <span className="text-xs text-[var(--c-muted)]">Nenhuma tarifa ativa configurada.</span>
              ) : tarifasAtivas.map((tarifa) => {
                const key = `tarifa-${item?.id}-${tarifa.codigo}`;
                const itemEmProcessamento = String(processingId || '').startsWith(`tarifa-${item?.id}-`);
                const elegibilidade = tarifaAtalhoAptaParaConciliacao(tarifa);
                return (
                  <button
                    key={tarifa.codigo}
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={!isSaida || !elegibilidade.ok || itemEmProcessamento}
                    onClick={() => onConfirmarTarifa(item, tarifa)}
                    title={!isSaida ? 'Tarifas bancarias devem ser lancamentos de saida.' : elegibilidade.motivo}
                  >
                    {processingId === key ? 'Registrando...' : tarifa.nome}
                  </button>
                );
              })}
            </div>
            {error ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--c-border)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--c-text)]">Lancar estorno de tarifa</p>
              <p className="text-xs text-[var(--c-muted)]">
                Registra este credito como um lancamento independente, sem exigir uma tarifa anterior.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {tarifasAtivas.length === 0 ? (
                <span className="text-xs text-[var(--c-muted)]">Nenhuma tarifa ativa configurada.</span>
              ) : tarifasAtivas.map((tarifa) => {
                const key = `estorno-tarifa-${item?.id}-${tarifa.codigo}`;
                const itemEmProcessamento = String(processingId || '').startsWith(`estorno-tarifa-${item?.id}-`);
                const elegibilidade = tarifaAtalhoAptaParaConciliacao(tarifa);
                return (
                  <button
                    key={`estorno-${tarifa.codigo}`}
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={isSaida || !elegibilidade.ok || itemEmProcessamento}
                    onClick={() => onConfirmarEstornoTarifa(item, tarifa)}
                    title={isSaida ? 'Estornos de tarifa devem ser lancamentos de entrada.' : elegibilidade.motivo}
                  >
                    {processingId === key ? 'Lancando...' : `Estorno - ${tarifa.nome}`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssociacaoManualTabela({
  loading,
  itens,
  modal,
  processingId,
  selecionados = [],
  totalSelecionado = 0,
  valorEsperado = 0,
  onToggleSelecionado
}) {
  if (loading) {
    return <div className="px-4 py-8 text-center text-sm text-[var(--c-muted)]">Carregando movimentos...</div>;
  }

  if (!itens.length) {
    return <div className="px-4 py-8 text-center text-sm text-[var(--c-muted)]">Nenhum movimento encontrado com os filtros atuais.</div>;
  }

  return (
    <table className="min-w-full divide-y divide-[var(--c-border)] text-sm">
      <thead className="bg-[var(--c-surface-muted)] text-xs uppercase tracking-[0.12em] text-[var(--c-muted)]">
        <tr>
          <th className="px-4 py-3 text-left">Sel.</th>
          <th className="px-4 py-3 text-left">Titulo</th>
          <th className="px-4 py-3 text-left">Parceiro</th>
          <th className="px-4 py-3 text-left">Tipo</th>
          <th className="px-4 py-3 text-left">Data</th>
          <th className="px-4 py-3 text-right">Valor</th>
          <th className="px-4 py-3 text-left">Documento</th>
          <th className="px-4 py-3 text-center">Score</th>
          <th className="px-4 py-3 text-center">Acao</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--c-border)] bg-white dark:bg-[var(--c-surface)]">
        {itens.map((it) => {
          const id = Number(it.movimento_financeiro_id || 0);
          const selected = selecionados.includes(id);
          const valor = Math.abs(Number(it.valor_quitacao || 0));
          const ultrapassa = !selected && totalSelecionado + valor > valorEsperado + 0.01;
          const processingKey = `confirmar-${modal.item?.id}-${selecionados.join('-') || id}`;
          const processing = modal.processing || processingId === processingKey;
          return (
            <tr key={it.movimento_financeiro_id} className={`align-top ${selected ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''}`}>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--c-border)] text-blue-600"
                  checked={selected}
                  disabled={processing || ultrapassa}
                  title={ultrapassa ? 'Selecionar este movimento ultrapassa o valor do extrato.' : 'Selecionar movimento'}
                  onChange={() => onToggleSelecionado(id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-[var(--c-text)]">
                <div>{it.titulo_descricao || '-'}</div>
                {it.motivos?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {it.motivos.map((m) => (
                      <span key={`${it.movimento_financeiro_id}-${m}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600">{m}</span>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-[var(--c-muted)]">{it.parceiro_nome || '-'}</td>
              <td className="px-4 py-3 text-[var(--c-muted)]">{it.tipo || '-'}</td>
              <td className="px-4 py-3 text-[var(--c-muted)]">{formatDate(it.data_movimento)}</td>
              <td className="px-4 py-3 text-right font-semibold text-[var(--c-text)]">{formatCurrency(it.valor_quitacao)}</td>
              <td className="px-4 py-3 text-[var(--c-muted)]">{it.documento || `mov. #${it.movimento_financeiro_id}`}</td>
              <td className="px-4 py-3 text-center text-xs uppercase tracking-wide text-[var(--c-muted)]">{it.score || 0}</td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                    selected
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-[var(--c-border)] bg-white text-[var(--c-text)] hover:border-blue-400 hover:text-blue-700'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                  disabled={processing || ultrapassa}
                  title={selected ? 'Remover da associacao' : ultrapassa ? 'Ultrapassa o valor do extrato' : 'Selecionar para associar'}
                  aria-label={selected ? 'Remover da associacao' : 'Selecionar para associar'}
                  onClick={() => onToggleSelecionado(id)}
                >
                  <LinkIcon className="h-4 w-4" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FaturasAssociacaoTabela({ loading, itens, modal, processingId, onAssociar }) {
  if (loading) {
    return <div className="px-4 py-8 text-center text-sm text-[var(--c-muted)]">Carregando faturas...</div>;
  }

  if (!itens.length) {
    return <div className="px-4 py-8 text-center text-sm text-[var(--c-muted)]">Nenhuma fatura encontrada com os filtros atuais.</div>;
  }

  return (
    <table className="min-w-full divide-y divide-[var(--c-border)] text-sm">
      <thead className="bg-[var(--c-surface-muted)] text-xs uppercase tracking-[0.12em] text-[var(--c-muted)]">
        <tr>
          <th className="px-4 py-3 text-left">Cartao</th>
          <th className="px-4 py-3 text-left">Competencia</th>
          <th className="px-4 py-3 text-left">Fechamento</th>
          <th className="px-4 py-3 text-left">Vencimento</th>
          <th className="px-4 py-3 text-center">Titulos</th>
          <th className="px-4 py-3 text-right">Valor</th>
          <th className="px-4 py-3 text-center">Status</th>
          <th className="px-4 py-3 text-right">Acao</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--c-border)] bg-white dark:bg-[var(--c-surface)]">
        {itens.map((fatura) => {
          const processingKey = `fatura-${modal.item?.id}-${fatura.id}`;
          const processing = modal.processing || processingId === processingKey;
          return (
            <tr key={fatura.id} className="align-middle">
              <td className="px-4 py-3 font-medium text-[var(--c-text)]">{fatura.cartao?.nome || 'Cartao'}</td>
              <td className="px-4 py-3 text-[var(--c-muted)]">{fatura.competencia || '-'}</td>
              <td className="px-4 py-3 text-[var(--c-muted)]">{formatDate(fatura.data_fechamento)}</td>
              <td className="px-4 py-3 text-[var(--c-muted)]">{formatDate(fatura.data_vencimento)}</td>
              <td className="px-4 py-3 text-center text-[var(--c-muted)]">{fatura.total_titulos || 0}</td>
              <td className="px-4 py-3 text-right font-semibold text-[var(--c-text)]">{formatCurrency(fatura.valor_total)}</td>
              <td className="px-4 py-3 text-center"><span className={statusClass(fatura.status)}>{fatura.status}</span></td>
              <td className="px-4 py-3 text-right">
                <button type="button" className="btn btn-primary btn-sm" disabled={processing} onClick={() => onAssociar(modal.item?.id, fatura.id)}>
                  {processing ? 'Associando...' : 'Associar'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function NovoTituloRapidoModal({ item, contas, onClose, onConciliar }) {
  const tipoInferido = Number(item?.valor || 0) < 0 ? 'PAGAR' : 'RECEBER';
  const valorAbs = Math.abs(Number(item?.valor || 0));
  const contaInicialId = String(item?.conta_bancaria_id || contas[0]?.id || '');
  const contaInicial = contas.find((conta) => String(conta.id) === contaInicialId);

  const [form, setForm] = useState({
    tipo: tipoInferido,
    descricao: item?.descricao_banco || '',
    valor: valorAbs ? formatCurrencyInput(valorAbs) : '',
    data_vencimento: item?.data_movimento || today(),
    competencia_data: item?.data_movimento || '',
    considera_dre: true,
    conta_bancaria_id: contaInicialId,
    empresa_id: String(contaInicial?.empresa_id || ''),
    obra_id: '',
    categoria_financeira_id: '',
    parceiro_id: '',
    data_pagamento: item?.data_movimento || today()
  });
  const [categorias, setCategorias] = useState([]);
  const [obras, setObras] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [buscaParceiro, setBuscaParceiro] = useState('');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const buscaTimeout = useRef(null);

  useEffect(() => {
    Promise.all([
      getCategoriasFinanceiras().catch(() => []),
      getMinhasObras().catch(() => [])
    ]).then(([cats, obs]) => {
      const catList = Array.isArray(cats) ? cats : [];
      const obraList = Array.isArray(obs) ? obs : [];
      setCategorias(catList);
      setObras(obraList);
    });
  }, []);

  useEffect(() => {
    clearTimeout(buscaTimeout.current);
    if (!buscaParceiro.trim()) {
      setParceiros([]);
      return;
    }
    buscaTimeout.current = setTimeout(async () => {
      try {
        const data = await buscarParceiros({ q: buscaParceiro.trim(), limit: 20 });
        setParceiros(Array.isArray(data?.itens) ? data.itens : Array.isArray(data) ? data : []);
      } catch {
        setParceiros([]);
      }
    }, 300);
  }, [buscaParceiro]);

  const categoriasFiltradas = categorias.filter((c) => {
    const t = String(c.tipo || '').toUpperCase();
    return t === form.tipo || t === 'AMBOS';
  });
  const selectedCategory = categorias.find((categoria) => String(categoria.id) === String(form.categoria_financeira_id)) || null;
  const categoriaClassificadaDre = Boolean(
    selectedCategory &&
    selectedCategory.considera_dre !== false &&
    String(selectedCategory.dre_grupo || '').trim()
  );

  async function handleSalvar(e) {
    e.preventDefault();
    if (saving) return;
    setErro('');
    if (!form.descricao.trim()) { setErro('Informe a descrição do título.'); return; }
    const valor = parseCurrencyInput(form.valor);
    if (!form.valor || valor <= 0) { setErro('Informe um valor válido.'); return; }
    if (!form.conta_bancaria_id) { setErro('Selecione a conta bancária.'); return; }
    if (!form.empresa_id) { setErro('A conta bancaria precisa estar vinculada a uma empresa pagadora.'); return; }
    if (!form.obra_id) { setErro('Selecione a obra.'); return; }
    if (!form.parceiro_id) { setErro('Selecione um parceiro (obrigatório).'); return; }
    if (!form.categoria_financeira_id) { setErro('Selecione a categoria financeira do titulo.'); return; }
    if (!form.competencia_data) { setErro('Informe a competencia DRE real do titulo.'); return; }
    if (form.considera_dre && !categoriaClassificadaDre) { setErro('Para considerar na DRE, selecione uma categoria financeira com grupo DRE classificado.'); return; }

    try {
      setSaving(true);
      // 1. Criar título (sem conta_bancaria_id — vai apenas na baixa)
      await criarTituloConciliacaoBancaria(item.id, {
        tipo: form.tipo,
        obra_id: Number(form.obra_id),
        descricao: form.descricao.trim(),
        valor,
        data_vencimento: form.data_vencimento,
        competencia_data: form.competencia_data || undefined,
        considera_dre: Boolean(form.considera_dre),
        conta_bancaria_id: Number(form.conta_bancaria_id),
        empresa_id: Number(form.empresa_id),
        data_movimento: form.data_pagamento,
        categoria_financeira_id: form.categoria_financeira_id ? Number(form.categoria_financeira_id) : undefined,
        parceiro_id: form.parceiro_id ? Number(form.parceiro_id) : undefined
      });
      await onConciliar();
      onClose();
    } catch (err) {
      setErro(err?.message || 'Erro ao criar título e registrar pagamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white dark:bg-[var(--c-surface)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--c-border)] bg-white dark:bg-[var(--c-surface)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--c-text)]">Novo título + baixa</h2>
            <p className="text-xs text-[var(--c-muted)]">Cria o título, registra o pagamento e concilia automaticamente.</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fechar</button>
        </div>

        {/* Contexto do lançamento OFX */}
        <div className="mx-5 mt-4 flex items-center gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2.5 text-sm">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[var(--c-text)] truncate">{item?.descricao_banco || 'Lançamento bancário'}</p>
            <p className="text-xs text-[var(--c-muted)]">{item?.conta_bancaria_nome} · {formatDate(item?.data_movimento)}</p>
          </div>
          <ValorBanco value={item?.valor} size="sm" />
        </div>

        <form onSubmit={handleSalvar} className="grid gap-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="app-filter-field">
              <span className="app-filter-label">Tipo</span>
              <select className="input w-full" value={form.tipo} disabled>
                <option value="PAGAR">A pagar</option>
                <option value="RECEBER">A receber</option>
              </select>
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Obra *</span>
              <select className="input w-full" value={form.obra_id}
                onChange={(e) => setForm((c) => ({ ...c, obra_id: e.target.value }))}>
                <option value="">Selecione</option>
                {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </label>
          </div>

          <label className="app-filter-field">
            <span className="app-filter-label">Conta bancária *</span>
            <select className="input w-full" value={form.conta_bancaria_id} disabled>
              <option value="">Selecione</option>
              {contas.map((ct) => <option key={ct.id} value={ct.id}>{ct.nome}</option>)}
            </select>
          </label>

          <label className="app-filter-field">
            <span className="app-filter-label">Empresa pagadora *</span>
            <input
              className="input w-full"
              value={contas.find((ct) => String(ct.id) === String(form.conta_bancaria_id))?.empresa?.nome || form.empresa_id || ''}
              disabled
            />
          </label>

          <label className="app-filter-field">
            <span className="app-filter-label">Descrição *</span>
            <input className="input w-full" type="text" value={form.descricao}
              onChange={(e) => setForm((c) => ({ ...c, descricao: e.target.value }))}
              placeholder="Descrição do título" />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="app-filter-field">
              <span className="app-filter-label">Valor *</span>
              <input className="input w-full" inputMode="decimal" value={form.valor} disabled />
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Vencimento</span>
              <input className="input w-full" type="date" value={form.data_vencimento}
                onChange={(e) => setForm((c) => ({ ...c, data_vencimento: e.target.value }))} />
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Data de pagamento</span>
              <input className="input w-full" type="date" value={form.data_pagamento}
                onChange={(e) => setForm((c) => ({ ...c, data_pagamento: e.target.value }))} />
            </label>
          </div>

          <label className="app-filter-field">
            <span className="app-filter-label">Competencia DRE</span>
            <input
              className="input w-full"
              type="date"
              value={form.competencia_data}
              onChange={(e) => setForm((c) => ({ ...c, competencia_data: e.target.value }))}
              required={Boolean(form.considera_dre)}
            />
            <span className="mt-1 block text-xs text-[var(--c-muted)]">
              {form.considera_dre
                ? 'Obrigatoria para DRE. Informe o periodo economico real.'
                : 'Opcional quando o titulo nao entra na DRE.'}
            </span>
          </label>

          <label className="app-filter-field">
            <span className="app-filter-label">Categoria</span>
            <select
              className={`input w-full ${form.considera_dre && !categoriaClassificadaDre ? 'border-amber-300 bg-amber-50' : ''}`}
              value={form.categoria_financeira_id}
              required={Boolean(form.considera_dre)}
              onChange={(e) => setForm((c) => ({ ...c, categoria_financeira_id: e.target.value }))}>
              <option value="">Sem categoria</option>
              {categoriasFiltradas.map((cat) => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
            </select>
            <span className="mt-1 block text-xs text-[var(--c-muted)]">
              {selectedCategory
                ? selectedCategory.considera_dre === false
                  ? 'Categoria fora da DRE.'
                  : selectedCategory.dre_grupo
                    ? `${selectedCategory.dre_grupo}${selectedCategory.dre_subgrupo ? ` / ${selectedCategory.dre_subgrupo}` : ''}`
                    : 'Categoria sem grupo DRE classificado.'
                : form.considera_dre
                  ? 'Obrigatoria para DRE. Selecione categoria com grupo DRE classificado.'
                  : 'Opcional.'}
            </span>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2.5 text-sm text-[var(--c-text)]">
            <input
              type="checkbox"
              checked={Boolean(form.considera_dre)}
              onChange={(e) => setForm((c) => ({ ...c, considera_dre: e.target.checked }))}
            />
            Considerar este titulo na DRE gerencial
          </label>

          <div className="app-filter-field">
            <span className="app-filter-label">Parceiro (buscar)</span>
            <input className="input w-full" type="text" value={buscaParceiro}
              onChange={(e) => { setBuscaParceiro(e.target.value); if (!e.target.value) setForm((c) => ({ ...c, parceiro_id: '' })); }}
              placeholder="Digite nome ou CNPJ..." />
            {parceiros.length > 0 && (
              <div className="mt-1 rounded-xl border border-[var(--c-border)] bg-white shadow-lg">
                {parceiros.map((p) => (
                  <button key={p.id} type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--c-bg)] ${String(form.parceiro_id) === String(p.id) ? 'bg-[var(--c-bg)] font-semibold' : ''}`}
                    onClick={() => { setForm((c) => ({ ...c, parceiro_id: String(p.id) })); setBuscaParceiro(p.nome || p.razao_social || ''); setParceiros([]); }}>
                    {p.nome || p.razao_social} {p.cnpj_cpf ? `· ${p.cnpj_cpf}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {erro && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Criar, baixar e conciliar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ItemConciliacao — layout 2 colunas ──────────────────────────────────────

function ContextoObraTitulo({ registro }) {
  const codigo = String(registro?.obra_codigo || '').trim();
  const nome = String(registro?.obra_nome || '').trim();
  if (!codigo && !nome) return null;

  const tipo = String(registro?.obra_tipo_centro_custo || '').trim().toUpperCase();
  const rotulo = tipo === 'OBRA'
    ? 'Obra'
    : (tipo ? 'Centro de custo' : 'Obra/centro de custo');
  const descricao = [codigo, nome].filter(Boolean).join(' · ');

  return (
    <p className="truncate text-[10px] text-[var(--c-muted)] leading-tight" title={`${rotulo}: ${descricao}`}>
      {rotulo}: {descricao}
    </p>
  );
}

function candidatoEstornoApto(candidato) {
  if (!candidato) return false;
  const tipoMovimento = String(candidato.movimento?.tipo_movimento || '').toUpperCase();
  const baixaDeTitulo = Boolean(candidato.titulo && candidato.movimento?.id && tipoMovimento === 'BAIXA');
  const tarifaRegistrada = Boolean(candidato.movimento?.id && tipoMovimento === 'TARIFA_BANCARIA');
  const saidaPendenteSemBaixa = String(candidato.status || '').toUpperCase() === 'PENDENTE'
    && !candidato.titulo
    && !candidato.movimento?.id;
  return baixaDeTitulo || tarifaRegistrada || saidaPendenteSemBaixa;
}

function ItemConciliacao({ item, associacaoPreparada = null, processingId, selected = false, canEstornarTransferencia = false, onToggleSelecao, onConfirmar, onConfirmarEstorno, onIgnorar, onRemover, onAssociarManual, onPrepararSugestao, onAssociarFatura, onAssociarTransferencia, onEstornarTransferencia, onAcoesRapidas }) {
  const [expandirSugestoes, setExpandirSugestoes] = useState(false);
  const [estornoExpandido, setEstornoExpandido] = useState(false);
  const [estornoOrigemId, setEstornoOrigemId] = useState(() => {
    const candidatos = item?.estorno_bancario?.candidatos || [];
    return candidatos.length === 1 ? Number(candidatos[0].conciliacao_id) : null;
  });
  const [estornoMotivo, setEstornoMotivo] = useState('Pagamento devolvido pelo banco conforme lancamento OFX.');

  const isPendente = item.status === 'PENDENTE';
  const alertaEstorno = isPendente && item.estorno_bancario?.detectado
    ? item.estorno_bancario
    : null;
  const movimentosPreparados = Array.isArray(associacaoPreparada?.movimentos)
    ? associacaoPreparada.movimentos
    : [];
  const movimentosPreparadosIds = Array.isArray(associacaoPreparada?.movimentoIds)
    ? associacaoPreparada.movimentoIds.map(Number).filter(Boolean)
    : [];
  const temAssociacaoPreparada = isPendente && movimentosPreparadosIds.length > 0;

  // Melhor sugestão: prioriza a sugestão automática marcada pelo backend
  const topSugestao = isPendente && !temAssociacaoPreparada && !item.associacao_manual_recomendada
    ? (item.sugestoes?.find((s) => s.movimento_financeiro_id === item.sugestao_automatica?.movimento_financeiro_id) || item.sugestoes?.[0])
    : null;
  const outrasSugestoes = isPendente && !temAssociacaoPreparada && !item.associacao_manual_recomendada && item.sugestoes?.length > 1
    ? item.sugestoes.filter((s) => s.movimento_financeiro_id !== topSugestao?.movimento_financeiro_id)
    : [];
  const sugestoesCompativeis = isPendente && !temAssociacaoPreparada && item.associacao_manual_recomendada && Array.isArray(item.sugestoes)
    ? item.sugestoes
    : [];
  const totalSugestoesCompativeis = Math.max(
    Number(item.total_candidatos_exatos_mesmo_dia || 0),
    sugestoesCompativeis.length
  );

  const movimentoIdsConfirmacao = temAssociacaoPreparada
    ? movimentosPreparadosIds
    : (topSugestao ? [Number(topSugestao.movimento_financeiro_id)] : []);
  const pidConfirmar = movimentoIdsConfirmacao.length
    ? `confirmar-${item.id}-${movimentoIdsConfirmacao.join('-')}`
    : null;
  const isConfirmando = processingId === pidConfirmar;
  const isIgnorando = processingId === `ignorar-${item.id}`;
  const isRemovendo = processingId === `remover-${item.id}`;
  const isConfirmandoEstorno = processingId === `estorno-bancario-${item.id}`;
  const podeConfirmar = isPendente && movimentoIdsConfirmacao.length > 0 && !isConfirmando;
  const candidatoEstornoSelecionado = alertaEstorno?.candidatos?.find((candidato) => Number(candidato.conciliacao_id) === Number(estornoOrigemId));
  const candidatoSelecionadoApto = candidatoEstornoApto(candidatoEstornoSelecionado);
  const podeConfirmarEstorno = Boolean(
    alertaEstorno
    && canEstornarTransferencia
    && estornoOrigemId
    && candidatoSelecionadoApto
    && String(estornoMotivo || '').trim()
    && !isConfirmandoEstorno
  );

  return (
    <div className="sol-surface-card card overflow-hidden rounded-lg border border-[var(--c-border)]">
      {alertaEstorno && (
        <div className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-amber-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-50">
                  Estorno bancario
                </span>
                <strong className="text-xs">
                  {alertaEstorno.tipo === 'PIX_REJEITADO'
                    ? 'PIX rejeitado/devolvido'
                    : alertaEstorno.tipo === 'CHEQUE_DEVOLVIDO'
                      ? 'Cheque devolvido'
                      : alertaEstorno.tipo === 'ESTORNO_TARIFA_BANCARIA'
                        ? 'Estorno de tarifa bancaria'
                        : 'Possivel devolucao'}
                </strong>
                <span className="text-[10px] text-amber-800">
                  {alertaEstorno.total_candidatos} lancamento(s) original(is) compativel(is)
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-amber-800">
                Confirme qual saida e a contraparte. Sem baixa anterior, o par sera neutralizado e o titulo permanecera aberto para o pagamento efetivo.
              </p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEstornoExpandido((value) => !value)}>
              {estornoExpandido ? 'Fechar revisao' : 'Revisar estorno'}
            </button>
          </div>

          {estornoExpandido && (
            <div className="mt-2 border-t border-amber-200 pt-2">
              {alertaEstorno.candidatos.length === 0 ? (
                <p className="text-xs font-medium text-rose-700">Nenhuma saida de mesmo valor foi localizada na janela de conferencia.</p>
              ) : (
                <div className="grid gap-1.5 lg:grid-cols-2">
                  {alertaEstorno.candidatos.map((candidato) => {
                    const candidatoApto = candidatoEstornoApto(candidato);
                    const tipoMovimento = String(candidato.movimento?.tipo_movimento || '').toUpperCase();
                    const saidaSemBaixa = String(candidato.status || '').toUpperCase() === 'PENDENTE'
                      && !candidato.titulo
                      && !candidato.movimento?.id;
                    return (
                    <label key={candidato.conciliacao_id} className={`flex gap-2 rounded border px-2 py-1.5 ${candidatoApto ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'} ${Number(estornoOrigemId) === Number(candidato.conciliacao_id) ? 'border-amber-600 bg-amber-100' : 'border-amber-200 bg-[var(--c-surface)]'}`}>
                      <input type="radio" name={`estorno-${item.id}`} disabled={!candidatoApto} checked={Number(estornoOrigemId) === Number(candidato.conciliacao_id)} onChange={() => setEstornoOrigemId(Number(candidato.conciliacao_id))} />
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-semibold">{candidato.descricao_banco || `Lancamento #${candidato.conciliacao_id}`}</span>
                        <span className="block text-[10px] text-amber-800">{formatDate(candidato.data_movimento)} · {formatCurrency(Math.abs(Number(candidato.valor || 0)))} · {candidato.status}</span>
                        {candidato.titulo && (
                          <span className="block truncate text-[10px] text-[var(--c-muted)]">Titulo #{candidato.titulo.id} · {candidato.titulo.parceiro_nome || candidato.titulo.descricao}</span>
                        )}
                        {saidaSemBaixa && (
                          <span className="block text-[10px] font-medium text-emerald-700">Sem baixa de titulo: a saida e a devolucao serao pareadas, mantendo o titulo aberto.</span>
                        )}
                        {tipoMovimento === 'TARIFA_BANCARIA' && (
                          <span className="block text-[10px] font-medium text-emerald-700">Tarifa ja registrada: a devolucao preservara a mesma classificacao financeira.</span>
                        )}
                        {!candidatoApto && (
                          <span className="block text-[10px] font-medium text-rose-700">Concilie esta saida com o titulo correto antes de confirmar a devolucao.</span>
                        )}
                      </span>
                    </label>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-end">
                <label className="flex-1 text-[10px] font-semibold text-amber-900">
                  Justificativa
                  <input className="input input-sm mt-1 w-full" value={estornoMotivo} maxLength={255} onChange={(event) => setEstornoMotivo(event.target.value)} />
                </label>
                {canEstornarTransferencia ? (
                  <button type="button" className="btn btn-danger btn-sm" disabled={!podeConfirmarEstorno} onClick={() => onConfirmarEstorno(item, estornoOrigemId, estornoMotivo)}>
                    {isConfirmandoEstorno ? 'Confirmando...' : 'Confirmar devolucao'}
                  </button>
                ) : (
                  <span className="text-[10px] text-amber-800">Seu usuario pode visualizar o alerta, mas nao possui permissao para estornar conciliacoes.</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="grid items-stretch" style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }}>

        {/* ── Coluna esquerda: lançamento OFX ── */}
        <div className="flex flex-col gap-1 p-2">
          {isPendente && !alertaEstorno && (
            <label className="mb-1 flex items-center gap-2 text-[10px] font-semibold text-[var(--c-muted)]">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelecao?.(item)}
              />
              Selecionar para baixa em titulo
            </label>
          )}
          {/* header */}
          <div className="flex items-center justify-between gap-1">
            <p className="text-[9px] uppercase tracking-wide font-semibold text-[var(--c-muted)]">Extrato bancário</p>
            <span className={statusClass(item.status)}>{statusLabel(item.status)}</span>
          </div>
          {/* card interno */}
          <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5">
            <p className="font-semibold text-[11px] text-[var(--c-text)] leading-tight truncate">
              {item.descricao_banco || 'Lançamento bancário'}
            </p>
            <p className="text-[10px] text-[var(--c-muted)] leading-tight">
              {item.conta_bancaria_nome}{item.documento ? ` · Doc. ${item.documento}` : ''}
            </p>
            <ValorBanco value={item.valor} size="sm" />
            <p className="text-[10px] text-[var(--c-muted)] leading-tight">
              {formatDate(item.data_movimento)}
              {item.conciliacao_em_lote_disponivel && <span className="ml-1.5 text-emerald-600">✦ Lote</span>}
              {item.associacao_manual_recomendada && <span className="ml-1.5 text-amber-600">● Manual</span>}
            </p>
          </div>
          {/* conciliado info */}
          {item.titulo && (
            <p className="text-[10px] text-emerald-700 leading-tight">
              ✓ #{item.titulo.id} {item.titulo.descricao}{item.titulo.parceiro_nome ? ` · ${item.titulo.parceiro_nome}` : ''}
            </p>
          )}
          {/* ignorar */}
          {isPendente && !alertaEstorno && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="text-[10px] text-slate-400 hover:text-amber-600 underline underline-offset-2 leading-tight"
                disabled={isIgnorando || isRemovendo}
                onClick={() => onIgnorar(item.id)}
              >
                {isIgnorando ? 'Ignorando...' : 'Ignorar'}
              </button>
              <button
                type="button"
                className="text-[10px] text-slate-400 hover:text-rose-600 underline underline-offset-2 leading-tight"
                disabled={isIgnorando || isRemovendo}
                onClick={() => onRemover(item.id)}
              >
                {isRemovendo ? 'Removendo...' : 'Remover do extrato'}
              </button>
            </div>
          )}
        </div>

        {/* ── Centro: botão conciliar ── */}
        <div className="flex items-center justify-center px-2">
          {isPendente && !alertaEstorno && (
            <button
              type="button"
              disabled={!podeConfirmar}
              onClick={() => podeConfirmar && onConfirmar(
                item.id,
                temAssociacaoPreparada ? movimentoIdsConfirmacao : movimentoIdsConfirmacao[0]
              )}
              className={`btn btn-sm text-[11px] font-semibold tracking-wide transition-all ${podeConfirmar ? 'btn-primary' : 'btn-outline text-[var(--c-muted)] cursor-not-allowed opacity-40'}`}
              title={podeConfirmar
                ? (temAssociacaoPreparada ? 'Confirmar associação manual preparada' : 'Confirmar sugestão principal')
                : 'Sem lançamento equivalente encontrado'}
            >
              {isConfirmando ? '...' : 'Conciliar'}
            </button>
          )}
        </div>

        {/* ── Coluna direita: sugestão / vazio ── */}
        <div className="flex flex-col gap-1 p-2">
          {/* header */}
          {/*
            O alerta de estorno continua impedindo a conciliacao automatica,
            mas nao pode esconder as alternativas manuais. Descricoes
            bancarias como "Taxa de devolucao de cheque" podem produzir um
            falso positivo; neste caso o usuario precisa escolher a
            classificacao correta pelos atalhos abaixo.
          */}
          {isPendente && (
            <div className="flex items-center justify-between gap-1">
              <p className="text-[9px] uppercase tracking-wide font-semibold text-[var(--c-muted)]">Lançamento Fluxy</p>
              <div className="flex items-center gap-0.5">
                <button type="button" title="Acoes rapidas"
                  className="flex h-5 w-5 items-center justify-center rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-muted)] hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] transition-colors"
                  onClick={() => onAcoesRapidas(item)}>
                  <PlusIcon className="h-2.5 w-2.5" />
                </button>
                <button type="button" title="Associar manualmente"
                  className="flex h-5 w-5 items-center justify-center rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-muted)] hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] transition-colors"
                  onClick={() => onAssociarManual(item)}>
                  <KeyIcon className="h-2.5 w-2.5" />
                </button>
                <button type="button" title="Associar fatura de cartao"
                  className="flex h-5 min-w-5 items-center justify-center rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 text-[9px] font-semibold text-[var(--c-muted)] hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] transition-colors"
                  onClick={() => onAssociarFatura(item)}>
                  Fat
                </button>
                <button type="button" title="Conciliar como transferencia entre contas"
                  className="flex h-5 min-w-5 items-center justify-center rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 text-[9px] font-semibold text-[var(--c-muted)] hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] transition-colors"
                  onClick={() => onAssociarTransferencia(item)}>
                  Transf
                </button>
              </div>
            </div>
          )}

          {!isPendente && item.titulo ? (
            <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 space-y-0.5">
              <p className="font-semibold text-[11px] text-[var(--c-text)] truncate">{item.titulo.descricao}</p>
              {item.titulo.parceiro_nome && <p className="text-[10px] text-[var(--c-muted)]">{item.titulo.parceiro_nome}</p>}
              {item.titulo.categoria_financeira_nome && (
                <p className="truncate text-[10px] text-[var(--c-muted)]" title={item.titulo.categoria_financeira_nome}>
                  Categoria: {item.titulo.categoria_financeira_nome}
                </p>
              )}
              <ContextoObraTitulo registro={item.titulo} />
              {item.movimento && <p className="text-[10px] text-[var(--c-muted)]">Mov. #{item.movimento.id}</p>}
            </div>
          ) : !isPendente && ['TARIFA_BANCARIA', 'ESTORNO_TARIFA_BANCARIA'].includes(item.movimento?.tipo_movimento) ? (
            <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 space-y-0.5">
              <p className="font-semibold text-[11px] text-[var(--c-text)] truncate">
                {item.movimento.tipo_movimento === 'ESTORNO_TARIFA_BANCARIA' ? 'Estorno de tarifa bancaria' : 'Tarifa bancaria'}
              </p>
              <p className="text-[10px] text-[var(--c-muted)]">{item.movimento.observacoes || item.descricao_banco}</p>
              <p className="text-[10px] text-[var(--c-muted)]">Mov. #{item.movimento.id}</p>
            </div>
          ) : !isPendente && item.transferencia ? (
            <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 space-y-0.5">
              <p className="font-semibold text-[11px] text-[var(--c-text)] truncate">Transferencia #{item.transferencia.id}</p>
              <p className="text-[10px] text-[var(--c-muted)]">
                {item.transferencia.contaOrigem?.nome || 'Origem'} para {item.transferencia.contaDestino?.nome || 'Destino'}
              </p>
              {canEstornarTransferencia && String(item.transferencia.status || 'ATIVA').toUpperCase() === 'ATIVA' && (
                <button
                  type="button"
                  className="mt-1 text-[10px] font-semibold text-rose-600 underline underline-offset-2 hover:text-rose-700"
                  disabled={processingId === `estornar-transferencia-${item.id}`}
                  onClick={() => onEstornarTransferencia?.(item)}
                >
                  {processingId === `estornar-transferencia-${item.id}` ? 'Estornando...' : 'Estornar transferencia'}
                </button>
              )}
            </div>
          ) : !isPendente ? (
            <div className="flex flex-1 items-center justify-center py-1">
              <p className="text-[10px] text-[var(--c-muted)]">{statusLabel(item.status)}</p>
            </div>
          ) : alertaEstorno ? (
            <div className="flex flex-1 items-center rounded border border-amber-200 bg-amber-50 px-2 py-2">
              <p className="text-[10px] font-medium leading-tight text-amber-800">
                Aguardando a escolha do lancamento original. Nenhum titulo sera associado automaticamente.
              </p>
            </div>
          ) : temAssociacaoPreparada ? (
            <div className="flex flex-col gap-1 flex-1">
              <div className="flex-1 rounded border border-blue-300 bg-blue-50 px-2 py-1.5 dark:border-blue-700 dark:bg-blue-950/30">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  Associação manual preparada
                </p>
                <p className="font-semibold text-[11px] text-[var(--c-text)] leading-tight">
                  {movimentosPreparados.length === 1
                    ? movimentosPreparados[0]?.titulo_descricao
                    : `${movimentosPreparados.length} movimentos selecionados`}
                </p>
                {movimentosPreparados.length === 1 ? (
                  <>
                    <p className="text-[10px] text-[var(--c-muted)] leading-tight">
                      {movimentosPreparados[0]?.parceiro_nome}
                      {movimentosPreparados[0]?.documento ? ` · Doc. ${movimentosPreparados[0].documento}` : ''}
                    </p>
                    {movimentosPreparados[0]?.categoria_financeira_nome && (
                      <p
                        className="truncate text-[10px] text-[var(--c-muted)] leading-tight"
                        title={movimentosPreparados[0].categoria_financeira_nome}
                      >
                        Categoria: {movimentosPreparados[0].categoria_financeira_nome}
                      </p>
                    )}
                    <ContextoObraTitulo registro={movimentosPreparados[0]} />
                    <p className="text-[10px] text-[var(--c-muted)] leading-tight">
                      {formatDate(movimentosPreparados[0]?.data_movimento)} · mov. #{movimentosPreparados[0]?.movimento_financeiro_id}
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-[var(--c-muted)] leading-tight">
                    Movimentos #{movimentosPreparadosIds.join(', #')}
                  </p>
                )}
                <ValorBanco value={associacaoPreparada?.total} size="sm" />
                <p className="mt-1 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                  Clique em Conciliar para confirmar.
                </p>
              </div>
            </div>
          ) : sugestoesCompativeis.length > 0 ? (
            <div className="flex flex-1 flex-col justify-center rounded border border-dashed border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-2">
              <button
                type="button"
                className="self-start text-[10px] font-semibold text-[var(--c-primary)] underline underline-offset-2"
                aria-expanded={expandirSugestoes}
                onClick={() => setExpandirSugestoes((value) => !value)}
              >
                {expandirSugestoes ? 'Ocultar opções' : `+ ${totalSugestoesCompativeis} títulos compatíveis`}
              </button>
              <p className="mt-1 text-[10px] leading-tight text-[var(--c-muted)]">
                Mesma data e valor. Escolha um título para preparar a conciliação.
              </p>
              {expandirSugestoes && (
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
                  {sugestoesCompativeis.map((sugestao) => (
                    <div
                      key={sugestao.movimento_financeiro_id}
                      className="flex items-center gap-2 rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-semibold text-[var(--c-text)]" title={sugestao.titulo_descricao}>
                          {sugestao.titulo_descricao}
                        </p>
                        <p className="truncate text-[10px] text-[var(--c-muted)]">
                          {sugestao.parceiro_nome || 'Sem parceiro'}
                          {sugestao.categoria_financeira_nome ? ` · ${sugestao.categoria_financeira_nome}` : ''}
                        </p>
                        <ContextoObraTitulo registro={sugestao} />
                        <p className="text-[10px] text-[var(--c-muted)]">
                          {formatDate(sugestao.data_movimento)} · {formatCurrency(sugestao.valor_quitacao)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm shrink-0 text-[10px]"
                        onClick={() => onPrepararSugestao(item, sugestao)}
                      >
                        Usar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : topSugestao ? (
            <div className="flex flex-col gap-1 flex-1">
              <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5">
                <p className="font-semibold text-[11px] text-[var(--c-text)] leading-tight truncate">{topSugestao.titulo_descricao}</p>
                <p className="text-[10px] text-[var(--c-muted)] leading-tight">
                  {topSugestao.parceiro_nome}{topSugestao.documento ? ` · Doc. ${topSugestao.documento}` : ''}
                </p>
                {topSugestao.categoria_financeira_nome && (
                  <p
                    className="truncate text-[10px] text-[var(--c-muted)] leading-tight"
                    title={topSugestao.categoria_financeira_nome}
                  >
                    Categoria: {topSugestao.categoria_financeira_nome}
                  </p>
                )}
                <ContextoObraTitulo registro={topSugestao} />
                <ValorBanco value={topSugestao.valor_quitacao} size="sm" />
                <p className="text-[10px] text-[var(--c-muted)] leading-tight">
                  {formatDate(topSugestao.data_movimento)} · {topSugestao.tipo} · mov. #{topSugestao.movimento_financeiro_id}
                </p>
              </div>
              {outrasSugestoes.length > 0 && (
                <button type="button"
                  className="text-[10px] text-[var(--c-primary)] underline underline-offset-2 self-start"
                  onClick={() => setExpandirSugestoes((v) => !v)}>
                  {expandirSugestoes ? 'Ocultar' : `+${outrasSugestoes.length} outras`}
                </button>
              )}
              {expandirSugestoes && (
                <div className="space-y-1">
                  {outrasSugestoes.map((s) => {
                    const pid = `confirmar-${item.id}-${s.movimento_financeiro_id}`;
                    return (
                      <div key={s.movimento_financeiro_id} className="rounded border border-[var(--c-border)] px-2 py-1.5 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium truncate">{s.titulo_descricao}</p>
                          {s.categoria_financeira_nome && (
                            <p className="truncate text-[10px] text-[var(--c-muted)]" title={s.categoria_financeira_nome}>
                              Categoria: {s.categoria_financeira_nome}
                            </p>
                          )}
                          <ContextoObraTitulo registro={s} />
                          <p className="text-[10px] text-[var(--c-muted)]">{formatDate(s.data_movimento)} · {formatCurrency(s.valor_quitacao)}</p>
                        </div>
                        <button type="button" className="btn btn-outline btn-sm text-[10px] shrink-0"
                          disabled={processingId === pid}
                          onClick={() => onConfirmar(item.id, s.movimento_financeiro_id)}>
                          {processingId === pid ? '...' : 'Usar'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded border border-dashed border-[var(--c-border)] py-2 text-center">
              <p className="text-[10px] text-[var(--c-muted)]">
                {item.associacao_manual_recomendada
                  ? 'Mais de um título coincide. Use Associar manualmente.'
                  : 'Nenhum lançamento equivalente encontrado'}
              </p>
            </div>
          )}
          {isPendente && <div className="h-[18px]" />}
        </div>
      </div>
    </div>
  );
}

// ─── HistoricoImportacaoItem ──────────────────────────────────────────────────

function BaixaExtratosTituloModal({ itens, onClose, onConfirmar }) {
  const [titulos, setTitulos] = useState([]);
  const [busca, setBusca] = useState('');
  const [tituloId, setTituloId] = useState('');
  const [formaRecebimento, setFormaRecebimento] = useState('TRANSFERENCIA');
  const [observacoes, setObservacoes] = useState('');
  const [entreEmpresas, setEntreEmpresas] = useState(false);
  const [tipoIntercompany, setTipoIntercompany] = useState('');
  const [motivoIntercompany, setMotivoIntercompany] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const tipoEsperado = useMemo(() => {
    const tipos = [...new Set(itens.map((item) => tipoTituloPorValorExtrato(item.valor)))];
    return tipos.length === 1 ? tipos[0] : null;
  }, [itens]);
  const totalSelecionado = useMemo(() => (
    itens.reduce((acc, item) => acc + Math.abs(Number(item.valor || 0)), 0)
  ), [itens]);

  useEffect(() => {
    let alive = true;
    async function carregarTitulos() {
      try {
        setLoading(true);
        setError('');
        if (!tipoEsperado) {
          setTitulos([]);
          return;
        }
        const [abertos, parciais] = await Promise.all([
          getTitulosFinanceiros({ tipo: tipoEsperado, status: 'ABERTO' }),
          getTitulosFinanceiros({ tipo: tipoEsperado, status: 'PARCIAL' })
        ]);
        if (!alive) return;
        const merged = [...(Array.isArray(abertos) ? abertos : []), ...(Array.isArray(parciais) ? parciais : [])];
        const unique = Array.from(new Map(merged.map((titulo) => [Number(titulo.id), titulo])).values());
        setTitulos(unique.filter((titulo) => Number(titulo.valor_saldo || 0) > 0));
      } catch (err) {
        if (alive) setError(err?.message || 'Erro ao buscar titulos financeiros.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    carregarTitulos();
    return () => { alive = false; };
  }, [tipoEsperado]);

  const titulosFiltrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return titulos.filter((titulo) => {
      if (!term) return true;
      return [
        titulo.id,
        titulo.codigo,
        titulo.descricao,
        titulo.numero_documento,
        titulo.parceiro?.nome,
        titulo.parceiro_nome
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [busca, titulos]);

  async function submit(event) {
    event.preventDefault();
    if (!tipoEsperado) {
      setError('Selecione apenas lancamentos de entrada ou apenas de saida.');
      return;
    }
    if (!tituloId) {
      setError('Selecione o titulo financeiro que recebera as baixas.');
      return;
    }
    if (!formaRecebimento) {
      setError('Selecione a forma de pagamento/recebimento da baixa.');
      return;
    }
    if (entreEmpresas && !tipoIntercompany) {
      setError('Marque a baixa como Entre Empresas e informe o tipo.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      await onConfirmar(Number(tituloId), {
        conciliacao_ids: itens.map((item) => item.id),
        forma_recebimento: formaRecebimento,
        observacoes: observacoes || 'Baixa parcial conciliada por extrato bancario',
        intercompany: entreEmpresas,
        tipo_intercompany: entreEmpresas ? tipoIntercompany : undefined,
        motivo_intercompany: entreEmpresas ? motivoIntercompany : undefined
      });
    } catch (err) {
      setError(err?.message || 'Erro ao baixar titulo por conciliacoes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <form onSubmit={submit} className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[var(--c-surface)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--c-text)]">Baixar titulo com extratos selecionados</h2>
            <p className="mt-0.5 text-sm text-[var(--c-muted)]">
              Cada lancamento selecionado vira uma baixa real no titulo, mantendo a data original do extrato.
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fechar</button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-5">
          {!tipoEsperado && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Selecione somente lancamentos de entrada ou somente de saida para vincular a um unico titulo.
            </div>
          )}

          <div className="rounded-xl border border-[var(--c-border)] p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--c-text)]">{itens.length} lancamento(s) selecionado(s)</p>
                <p className="text-xs text-[var(--c-muted)]">
                  Tipo esperado: {tipoEsperado || '-'} | Total: {formatCurrency(totalSelecionado)}
                </p>
              </div>
              <select className="input max-w-[220px]" value={formaRecebimento} onChange={(event) => setFormaRecebimento(event.target.value)}>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {itens.map((item) => (
                <div key={item.id} className="rounded-lg bg-[var(--c-bg)] px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{item.descricao_banco || 'Lancamento bancario'}</span>
                    <ValorBanco value={item.valor} size="sm" />
                  </div>
                  <p className="text-xs text-[var(--c-muted)]">
                    {formatDate(item.data_movimento)} | {item.conta_bancaria_nome || 'Conta bancaria'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px]">
            <label className="form-field">
              <span className="form-label">Buscar titulo</span>
              <input className="input" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Digite descricao, documento, parceiro ou codigo" />
            </label>
            <label className="form-field">
              <span className="form-label">Observacao</span>
              <input className="input" value={observacoes} onChange={(event) => setObservacoes(event.target.value)} placeholder="Opcional" />
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--c-border)] p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-[var(--c-text)]">
              <input
                type="checkbox"
                checked={entreEmpresas}
                onChange={(event) => setEntreEmpresas(event.target.checked)}
              />
              Baixa Entre Empresas
            </label>
            {entreEmpresas && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="form-field">
                  <span className="form-label">Tipo</span>
                  <select className="input" value={tipoIntercompany} onChange={(event) => setTipoIntercompany(event.target.value)}>
                    <option value="">Selecione</option>
                    {TIPOS_INTERCOMPANY.map((tipo) => (
                      <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-label">Motivo</span>
                  <input className="input" value={motivoIntercompany} onChange={(event) => setMotivoIntercompany(event.target.value)} placeholder="Opcional" />
                </label>
              </div>
            )}
          </div>

          <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto rounded-xl border border-[var(--c-border)] p-2">
            {loading ? (
              <div className="app-empty-card">Carregando titulos...</div>
            ) : titulosFiltrados.length === 0 ? (
              <div className="app-empty-card">Nenhum titulo aberto ou parcial encontrado.</div>
            ) : titulosFiltrados.map((titulo) => {
              const selected = String(tituloId) === String(titulo.id);
              return (
                <button
                  key={titulo.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    selected
                      ? 'border-[var(--c-primary)] bg-blue-50 text-[var(--c-text)]'
                      : 'border-[var(--c-border)] hover:border-[var(--c-primary)] hover:bg-[var(--c-bg)]'
                  }`}
                  onClick={() => setTituloId(String(titulo.id))}
                >
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <strong>#{titulo.id} {titulo.descricao || titulo.codigo || 'Titulo financeiro'}</strong>
                    <span className="text-sm font-semibold">{formatCurrency(titulo.valor_saldo)}</span>
                  </div>
                  <p className="text-xs text-[var(--c-muted)]">
                    {titulo.parceiro?.nome || titulo.parceiro_nome || 'Sem credor/cliente'} | Venc. {formatDate(titulo.data_vencimento)}
                  </p>
                </button>
              );
            })}
          </div>

          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--c-border)] px-5 py-4">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !tipoEsperado}>
            {saving ? 'Processando...' : 'Baixar e conciliar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function HistoricoImportacaoItem({ item }) {
  return (
    <div className="app-list-card">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--c-text)]">{item.arquivo_nome}</p>
          <p className="mt-0.5 text-xs text-[var(--c-muted)]">
            {item.conta_bancaria_nome} ({item.banco || '-'}) · {formatDateTime(item.criado_em)}
          </p>
          <p className="text-[11px] text-[var(--c-muted)]">
            Por {item.criado_por?.nome || item.criado_por?.email || 'Sistema'} · hash {String(item.arquivo_hash || '').slice(0, 10)}…
          </p>
        </div>
        <div className="flex shrink-0 gap-2 text-center text-xs">
          <div className="rounded-lg bg-[var(--c-bg)] px-3 py-2">
            <div className="text-[var(--c-muted)]">Lidos</div>
            <div className="mt-0.5 font-semibold text-[var(--c-text)]">{item.total_lidos}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2">
            <div className="text-emerald-600">Import.</div>
            <div className="mt-0.5 font-semibold text-emerald-700">{item.importados}</div>
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <div className="text-amber-600">Ignor.</div>
            <div className="mt-0.5 font-semibold text-amber-700">{item.ignorados}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar + Footer ─────────────────────────────────────────────────────────

function ToolbarConciliacao({ meta, filters, setFilters, setAppliedFilters, resumoSugestoes, bulkReconciling, onConciliarSugeridos, appliedFilters }) {
  return (
    <div className="card sol-surface-card app-toolbar-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--c-muted)]">
          <span>
            Pág. <strong className="text-[var(--c-text)]">{meta.current_page}</strong> / {meta.total_pages}
            {' '}· {meta.total_disponivel} registro(s)
          </span>
          {resumoSugestoes.prontos > 0 && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <SparkIcon className="h-3 w-3" />
              {resumoSugestoes.prontos} p/ lote
            </span>
          )}
          {resumoSugestoes.manuais > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <KeyIcon className="h-3 w-3" />
              {resumoSugestoes.manuais} manual
            </span>
          )}
          {resumoSugestoes.estornos > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
              ↩ {resumoSugestoes.estornos} estorno(s) para revisar
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--c-muted)]">
            Por página
            <select className="input input-sm" value={filters.page_size}
              onChange={(e) => {
                const ps = Number(e.target.value || 100);
                setFilters((c) => ({ ...c, page_size: ps, page: 1 }));
                setAppliedFilters((c) => ({ ...c, page_size: ps, page: 1 }));
              }}>
              {[25, 50, 100, 200, 500].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary btn-sm"
            disabled={bulkReconciling || appliedFilters.status === 'CONCILIADO' || appliedFilters.status === 'IGNORADO' || resumoSugestoes.prontos === 0}
            onClick={onConciliarSugeridos}>
            {bulkReconciling ? 'Conciliando...' : 'Conciliar em lote'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FooterPaginacao({ meta, onAlterarPagina }) {
  if (meta.total_pages <= 1) return null;
  return (
    <div className="card sol-surface-card app-toolbar-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--c-muted)]">Pág. {meta.current_page} / {meta.total_pages}</span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline btn-sm" disabled={meta.current_page <= 1}
            onClick={() => onAlterarPagina(meta.current_page - 1)}>← Anterior</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={meta.current_page >= meta.total_pages}
            onClick={() => onAlterarPagina(meta.current_page + 1)}>Próxima →</button>
        </div>
      </div>
    </div>
  );
}

// ─── página principal ─────────────────────────────────────────────────────────

export default function FinanceiroConciliacao() {
  const { user } = useAuth();
  const canEstornarTransferencia = hasPermissao(user, 'financeiro.conciliacao.estornar');
  const [contas, setContas] = useState([]);
  const [viewMode, setViewMode] = useState('CONTAS');
  const [dashboardFilters, setDashboardFilters] = useState({ busca: '', banco: '', data_inicial: '', data_final: '' });
  const [appliedDashboardFilters, setAppliedDashboardFilters] = useState({ busca: '', banco: '', data_inicial: '', data_final: '' });
  const [contasResumo, setContasResumo] = useState([]);
  const [loadingContasResumo, setLoadingContasResumo] = useState(false);
  const [tarifasBancarias, setTarifasBancarias] = useState([]);
  const [filters, setFilters] = useState({ status: 'PENDENTE', conta_bancaria_id: '', data_inicial: '', data_final: '', page: 1, page_size: 100 });
  const [appliedFilters, setAppliedFilters] = useState({ status: 'PENDENTE', conta_bancaria_id: '', data_inicial: '', data_final: '', page: 1, page_size: 100 });
  const [uploadForm, setUploadForm] = useState({ conta_bancaria_id: '', files: [] });
  const [importResults, setImportResults] = useState([]);
  const [dados, setDados] = useState({
    resumo: { total: 0, pendentes: 0, conciliados: 0, ignorados: 0, valor_total: 0, valor_absoluto_total: 0 },
    meta: { total_disponivel: 0, total_listado: 0, current_page: 1, page_size: 100, total_pages: 1 },
    itens: []
  });
  const [importacoes, setImportacoes] = useState({
    resumo: { total_importacoes: 0, total_lidos: 0, total_importados: 0, total_ignorados: 0 },
    itens: []
  });
  const [loading, setLoading] = useState(true);
  const [loadingContas, setLoadingContas] = useState(true);
  const [importing, setImporting] = useState(false);
  const [bulkReconciling, setBulkReconciling] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [associacoesPreparadas, setAssociacoesPreparadas] = useState({});
  const tarifaRequestsEmAndamentoRef = useRef(new Set());
  const [acoesRapidasItem, setAcoesRapidasItem] = useState(null);
  const [acoesRapidasError, setAcoesRapidasError] = useState('');
  const [novoTituloItem, setNovoTituloItem] = useState(null); // item OFX para o modal de novo título
  const [associacaoModal, setAssociacaoModal] = useState({
    open: false, item: null, filters: buildAssociacaoDefaults(null),
    loading: false, processing: false, error: '',
    selecionados: [],
    dados: { conciliacao: null, meta: { total: 0, limit: 30 }, itens: [] }
  });
  const [faturaModal, setFaturaModal] = useState({
    open: false, item: null, filters: buildAssociacaoDefaults(null),
    loading: false, processing: false, error: '',
    dados: { conciliacao: null, meta: { total: 0, limit: 30 }, itens: [] }
  });
  const [transferenciaModal, setTransferenciaModal] = useState({
    open: false,
    item: null,
    conta_contraparte_id: '',
    descricao: '',
    tipo_intercompany: '',
    motivo_intercompany: '',
    elimina_consolidado: true,
    processing: false,
    error: ''
  });
  const [estornoTransferenciaModal, setEstornoTransferenciaModal] = useState({
    open: false,
    item: null,
    motivo: '',
    processing: false,
    error: ''
  });
  const [conciliacoesSelecionadas, setConciliacoesSelecionadas] = useState([]);
  const [baixaExtratosModalOpen, setBaixaExtratosModalOpen] = useState(false);

  const contaAtualTransferencia = useMemo(
    () => contas.find((conta) => String(conta.id) === String(transferenciaModal.item?.conta_bancaria_id)),
    [contas, transferenciaModal.item?.conta_bancaria_id]
  );
  const contaContraparteTransferencia = useMemo(
    () => contas.find((conta) => String(conta.id) === String(transferenciaModal.conta_contraparte_id)),
    [contas, transferenciaModal.conta_contraparte_id]
  );
  const transferenciaEntreEmpresas = Boolean(
    getContaEmpresaId(contaAtualTransferencia) &&
    getContaEmpresaId(contaContraparteTransferencia) &&
    getContaEmpresaId(contaAtualTransferencia) !== getContaEmpresaId(contaContraparteTransferencia)
  );
  const transferenciaSaiDaContaAtual = Number(transferenciaModal.item?.valor || 0) < 0;
  const contaOrigemTransferencia = transferenciaSaiDaContaAtual
    ? contaAtualTransferencia
    : contaContraparteTransferencia;
  const contaDestinoTransferencia = transferenciaSaiDaContaAtual
    ? contaContraparteTransferencia
    : contaAtualTransferencia;
  const contraparteAutomaticaSelecionada = Boolean(
    transferenciaModal.item?.transferencia_contraparte_automatica?.conta_bancaria_id
    && String(transferenciaModal.item.transferencia_contraparte_automatica.conta_bancaria_id)
      === String(transferenciaModal.conta_contraparte_id)
  );

  async function carregarContas() {
    try {
      setLoadingContas(true);
      const contasData = await getContasBancarias();
      const normalized = Array.isArray(contasData) ? contasData : [];
      setContas(normalized);
      setUploadForm((c) => ({ ...c, conta_bancaria_id: c.conta_bancaria_id || '' }));
    } catch { setContas([]); } finally { setLoadingContas(false); }
  }

  async function carregarTarifasBancarias({ preservarEmErro = false } = {}) {
    try {
      const data = await getTarifasBancariasAtalhos();
      setTarifasBancarias(Array.isArray(data) ? data : []);
    } catch {
      if (!preservarEmErro) {
        setTarifasBancarias([]);
      }
    }
  }

  function abrirAcoesRapidas(item) {
    setAcoesRapidasError('');
    setAcoesRapidasItem(item);
    carregarTarifasBancarias({ preservarEmErro: true });
  }

  async function carregarResumoContas() {
    const contasFiltradas = contas.filter((conta) => {
      const busca = String(appliedDashboardFilters.busca || '').trim().toLowerCase();
      const banco = String(appliedDashboardFilters.banco || '').trim().toLowerCase();
      const textoConta = [
        getContaNome(conta),
        getContaBanco(conta),
        getContaAgencia(conta),
        getContaNumero(conta),
        getContaEmpresaNome(conta)
      ].join(' ').toLowerCase();
      const bancoConta = getContaBanco(conta).toLowerCase();
      return (!busca || textoConta.includes(busca)) && (!banco || bancoConta === banco);
    });

    if (contasFiltradas.length === 0) {
      setContasResumo([]);
      return;
    }

    try {
      setLoadingContasResumo(true);
      const resultados = await Promise.all(contasFiltradas.map(async (conta) => {
        try {
          const response = await getConciliacoesBancarias({
            status: 'TODOS',
            conta_bancaria_id: String(conta.id),
            data_inicial: appliedDashboardFilters.data_inicial,
            data_final: appliedDashboardFilters.data_final,
            page: 1,
            page_size: 1
          });
          return {
            conta,
            erro: false,
            resumo: {
              total: Number(response?.resumo?.total || 0),
              pendentes: Number(response?.resumo?.pendentes || 0),
              conciliados: Number(response?.resumo?.conciliados || 0),
              ignorados: Number(response?.resumo?.ignorados || 0),
              valor_total: Number(response?.resumo?.valor_total || 0),
              valor_absoluto_total: Number(response?.resumo?.valor_absoluto_total || 0)
            }
          };
        } catch {
          return {
            conta,
            erro: true,
            resumo: { total: 0, pendentes: 0, conciliados: 0, ignorados: 0, valor_total: 0, valor_absoluto_total: 0 }
          };
        }
      }));
      setContasResumo(resultados);
    } finally {
      setLoadingContasResumo(false);
    }
  }

  async function carregarConciliacoes() {
    try {
      setLoading(true);
      setError('');
      const [response, importacoesResponse] = await Promise.all([
        getConciliacoesBancarias(appliedFilters),
        getImportacoesConciliacao({ conta_bancaria_id: appliedFilters.conta_bancaria_id, data_inicial: appliedFilters.data_inicial, data_final: appliedFilters.data_final, limit: 8 })
      ]);
      setDados({
        resumo: {
          total: Number(response?.resumo?.total || 0),
          pendentes: Number(response?.resumo?.pendentes || 0),
          conciliados: Number(response?.resumo?.conciliados || 0),
          ignorados: Number(response?.resumo?.ignorados || 0),
          valor_total: Number(response?.resumo?.valor_total || 0),
          valor_absoluto_total: Number(response?.resumo?.valor_absoluto_total || 0)
        },
        meta: {
          total_disponivel: Number(response?.meta?.total_disponivel || response?.resumo?.total || 0),
          total_listado: Number(response?.meta?.total_listado || 0),
          current_page: Number(response?.meta?.current_page || appliedFilters.page || 1),
          page_size: Number(response?.meta?.page_size || appliedFilters.page_size || 100),
          total_pages: Number(response?.meta?.total_pages || 1)
        },
        itens: Array.isArray(response?.itens) ? response.itens : []
      });
      setImportacoes({
        resumo: {
          total_importacoes: Number(importacoesResponse?.resumo?.total_importacoes || 0),
          total_lidos: Number(importacoesResponse?.resumo?.total_lidos || 0),
          total_importados: Number(importacoesResponse?.resumo?.total_importados || 0),
          total_ignorados: Number(importacoesResponse?.resumo?.total_ignorados || 0)
        },
        itens: Array.isArray(importacoesResponse?.itens) ? importacoesResponse.itens : []
      });
    } catch (err) {
      setError(err?.message || 'Erro ao carregar conciliacoes bancarias');
      setDados({ resumo: { total: 0, pendentes: 0, conciliados: 0, ignorados: 0, valor_total: 0, valor_absoluto_total: 0 }, meta: { total_disponivel: 0, total_listado: 0, current_page: 1, page_size: 100, total_pages: 1 }, itens: [] });
      setImportacoes({ resumo: { total_importacoes: 0, total_lidos: 0, total_importados: 0, total_ignorados: 0 }, itens: [] });
    } finally { setLoading(false); }
  }

  useEffect(() => { carregarContas(); carregarTarifasBancarias(); }, []);
  useEffect(() => { if (contas.length > 0) carregarResumoContas(); }, [contas, appliedDashboardFilters]);
  useEffect(() => { if (viewMode === 'DETALHE') carregarConciliacoes(); }, [appliedFilters, viewMode]);

  const resumoFinanceiro = useMemo(() => ([
    { label: 'Pendentes', value: String(dados.resumo.pendentes), detail: 'Aguardando conferência' },
    { label: 'Conciliados', value: String(dados.resumo.conciliados), detail: 'Matches confirmados' },
    { label: 'Ignorados', value: String(dados.resumo.ignorados), detail: 'Descartados na conferência' },
    { label: 'Saldo líquido', value: formatCurrency(dados.resumo.valor_total), detail: dados.meta.total_disponivel > dados.meta.total_listado ? `${dados.meta.total_listado} de ${dados.meta.total_disponivel} exibidos` : `${dados.meta.total_disponivel} lançamento(s)` },
    { label: 'Movimentação bruta', value: formatCurrency(dados.resumo.valor_absoluto_total), detail: 'Soma absoluta do filtro' }
  ]), [dados.meta.total_disponivel, dados.meta.total_listado, dados.resumo]);

  const resumoSugestoesPagina = useMemo(() => dados.itens.reduce(
    (acc, item) => { if (item.conciliacao_em_lote_disponivel) acc.prontos += 1; if (item.associacao_manual_recomendada) acc.manuais += 1; if (item.status === 'PENDENTE' && item.estorno_bancario?.detectado) acc.estornos += 1; return acc; },
    { prontos: 0, manuais: 0, estornos: 0 }
  ), [dados.itens]);
  const bancosDashboard = useMemo(() => {
    const bancos = new Set(contas.map((conta) => getContaBanco(conta)).filter(Boolean));
    return Array.from(bancos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [contas]);
  const resumoDashboard = useMemo(() => contasResumo.reduce((acc, item) => {
    acc.contas += 1;
    acc.pendentes += item.resumo.pendentes;
    acc.conciliados += item.resumo.conciliados;
    acc.ignorados += item.resumo.ignorados;
    acc.valor_absoluto_total += item.resumo.valor_absoluto_total;
    return acc;
  }, { contas: 0, pendentes: 0, conciliados: 0, ignorados: 0, valor_absoluto_total: 0 }), [contasResumo]);
  const conciliacoesSelecionadasItens = useMemo(() => {
    const ids = new Set(conciliacoesSelecionadas.map((id) => Number(id)));
    return dados.itens.filter((item) => ids.has(Number(item.id)) && item.status === 'PENDENTE' && !item.estorno_bancario?.detectado);
  }, [conciliacoesSelecionadas, dados.itens]);

  async function handleImportar(event) {
    event.preventDefault();
    if (!uploadForm.files.length) { setError('Selecione ao menos um arquivo OFX.'); return; }
    try {
      setImporting(true); setError(''); setFeedback('');
      setImportResults([]);
      const formData = new FormData();
      if (uploadForm.conta_bancaria_id) {
        formData.append('conta_bancaria_id', uploadForm.conta_bancaria_id);
      }
      uploadForm.files.forEach((file) => formData.append('files', file));
      const response = await importarOfxConciliacao(formData);
      const resultados = Array.isArray(response?.resultados) ? response.resultados : [];
      setImportResults(resultados);
      const arquivosImportados = Number(response.arquivos_importados || 0);
      const arquivosNaoImportados = Number(response.arquivos_nao_importados || 0);
      const importados = Number(response.importados || 0);
      const alertasEstorno = Number(response.alertas_estorno || 0);
      setFeedback(`${arquivosImportados} arquivo(s) importado(s), ${arquivosNaoImportados} nao importado(s) e ${importados} lancamento(s) novo(s) gravado(s).${alertasEstorno ? ` Atenção: ${alertasEstorno} possível(is) estorno(s) bancário(s) precisa(m) de revisão.` : ''}`);
      if (arquivosNaoImportados > 0 && arquivosImportados === 0) {
        setError('Nenhum arquivo foi importado. Confira o resumo abaixo e ajuste as contas bancarias antes de tentar novamente.');
      }
      setUploadForm((c) => ({ ...c, files: [] }));
      const fi = document.getElementById('ofx-file-input');
      if (fi) fi.value = '';
      await carregarResumoContas();
      if (viewMode === 'DETALHE') await carregarConciliacoes();
    } catch (err) { setError(err?.message || 'Erro ao importar OFX'); } finally { setImporting(false); }
  }

  function toggleConciliacaoSelecionada(item) {
    if (!item || item.status !== 'PENDENTE' || item.estorno_bancario?.detectado) return;
    setConciliacoesSelecionadas((current) => {
      const id = Number(item.id);
      return current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
    });
  }

  async function handleBaixarTituloPorExtratos(tituloId, payload) {
    await baixarTituloPorConciliacoes(tituloId, payload);
    setBaixaExtratosModalOpen(false);
    setConciliacoesSelecionadas([]);
    setFeedback('Titulo baixado e lancamentos bancarios conciliados com sucesso.');
    await carregarConciliacoes();
  }

  async function handleConfirmar(conciliacaoId, movimentoIdOrIds, { fecharModal = false } = {}) {
    // Se conciliacaoId for null, apenas recarrega (fluxo do novo título sem movimento_id)
    if (!conciliacaoId) { await carregarConciliacoes(); return; }
    const movimentoIds = Array.isArray(movimentoIdOrIds)
      ? [...new Set(movimentoIdOrIds.map((id) => Number(id)).filter(Boolean))]
      : [Number(movimentoIdOrIds)].filter(Boolean);
    if (!movimentoIds.length) {
      const message = 'Selecione um movimento financeiro valido para confirmar a conciliacao.';
      if (fecharModal) setAssociacaoModal((c) => ({ ...c, processing: false, error: message }));
      else setError(message);
      return;
    }
    try {
      const processingKey = `confirmar-${conciliacaoId}-${movimentoIds.join('-')}`;
      setProcessingId(processingKey);
      setError(''); setFeedback('');
      if (fecharModal) setAssociacaoModal((c) => ({ ...c, processing: true, error: '' }));
      await confirmarConciliacaoBancaria(
        conciliacaoId,
        movimentoIds.length > 1
          ? { movimento_financeiro_ids: movimentoIds }
          : { movimento_financeiro_id: movimentoIds[0] }
      );
      setAssociacoesPreparadas((current) => {
        const next = { ...current };
        delete next[Number(conciliacaoId)];
        return next;
      });
      setFeedback('Conciliacao confirmada com sucesso.');
      if (fecharModal) setAssociacaoModal((c) => ({ ...c, open: false, processing: false, error: '', selecionados: [], dados: { conciliacao: null, meta: { total: 0, limit: 30 }, itens: [] } }));
      await carregarConciliacoes();
    } catch (err) {
      const message = err?.message || 'Erro ao confirmar conciliacao';
      if (fecharModal) setAssociacaoModal((c) => ({ ...c, processing: false, error: message }));
      else setError(message);
    } finally {
      setProcessingId(null);
      if (fecharModal) setAssociacaoModal((c) => ({ ...c, processing: false }));
    }
  }

  async function handleConfirmarEstornoBancario(item, conciliacaoOrigemId, motivo) {
    if (!item?.id || !conciliacaoOrigemId) return;
    const candidato = item.estorno_bancario?.candidatos?.find((value) => Number(value.conciliacao_id) === Number(conciliacaoOrigemId));
    if (!candidatoEstornoApto(candidato)) {
      setError('A saida original nao esta apta para confirmar esta devolucao. Atualize a conciliacao e tente novamente.');
      return;
    }
    const tipoMovimento = String(candidato.movimento?.tipo_movimento || '').toUpperCase();
    const baixaDeTitulo = tipoMovimento === 'BAIXA' && candidato.titulo;
    const tarifaRegistrada = tipoMovimento === 'TARIFA_BANCARIA';
    const confirmacaoInfo = baixaDeTitulo
      ? ` O titulo #${candidato.titulo.id} sera reaberto.`
      : tarifaRegistrada
        ? ' A devolucao sera registrada como estorno da tarifa, preservando sua classificacao.'
        : ' A saida e a devolucao serao pareadas, mantendo o titulo aberto.';
    if (!window.confirm(`Confirmar que este credito devolveu o lancamento #${conciliacaoOrigemId}?${confirmacaoInfo}`)) return;
    try {
      setProcessingId(`estorno-bancario-${item.id}`);
      setError(''); setFeedback('');
      await confirmarConciliacaoEstornoBancario(item.id, {
        conciliacao_origem_id: conciliacaoOrigemId,
        motivo
      });
      setConciliacoesSelecionadas((current) => current.filter((id) => Number(id) !== Number(item.id)));
      setFeedback(baixaDeTitulo
        ? `Estorno confirmado. O titulo #${candidato.titulo.id} foi reaberto e os dois lancamentos OFX permaneceram auditados.`
        : tarifaRegistrada
          ? 'Estorno de tarifa confirmado. A classificacao financeira foi preservada e os dois lancamentos OFX permaneceram auditados.'
          : 'Estorno confirmado. A saida e a devolucao foram pareadas sem baixar o titulo, que permanece aberto para o pagamento efetivo.');
      await carregarConciliacoes();
    } catch (err) {
      setError(err?.message || 'Erro ao confirmar estorno bancario');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleIgnorar(conciliacaoId) {
    if (!window.confirm('Marcar este lancamento como ignorado?')) return;
    try {
      setProcessingId(`ignorar-${conciliacaoId}`); setError(''); setFeedback('');
      await ignorarConciliacaoBancaria(conciliacaoId);
      setFeedback('Lancamento marcado como ignorado.');
      await carregarConciliacoes();
    } catch (err) { setError(err?.message || 'Erro ao ignorar conciliacao'); } finally { setProcessingId(null); }
  }

  async function handleRemover(conciliacaoId) {
    if (!window.confirm('Remover este lancamento do extrato? O registro ficara auditado e nao sera apagado fisicamente do banco.')) return;
    try {
      setProcessingId(`remover-${conciliacaoId}`); setError(''); setFeedback('');
      await removerConciliacaoBancaria(conciliacaoId, { motivo: 'Removido manualmente na tela de conciliacao' });
      setFeedback('Lancamento removido do extrato.');
      await carregarConciliacoes();
    } catch (err) { setError(err?.message || 'Erro ao remover lancamento do extrato'); } finally { setProcessingId(null); }
  }

  async function handleConciliarSugeridos() {
    if (!window.confirm('Conciliar em lote todos os lançamentos pendentes do filtro atual que tenham sugestão segura?')) return;
    try {
      setBulkReconciling(true); setError(''); setFeedback('');
      const response = await conciliarSugestoesBancarias({ status: appliedFilters.status === 'TODOS' ? 'TODOS' : 'PENDENTE', conta_bancaria_id: appliedFilters.conta_bancaria_id, data_inicial: appliedFilters.data_inicial, data_final: appliedFilters.data_final });
      const r = response?.resumo || {};
      setFeedback(`${r.total_conciliadas || 0} confirmada(s) em lote. ${r.associacao_manual || 0} para associação manual. ${r.sem_sugestao || 0} sem sugestão.`);
      await carregarConciliacoes();
    } catch (err) { setError(err?.message || 'Erro ao conciliar sugestoes em lote'); } finally { setBulkReconciling(false); }
  }

  async function carregarMovimentosAssociacao(conciliacaoId, filtersPayload, { manterAberto = true, selecionadosIniciais = null } = {}) {
    try {
      setAssociacaoModal((c) => ({
        ...c,
        open: manterAberto,
        loading: true,
        error: '',
        selecionados: Array.isArray(selecionadosIniciais) ? selecionadosIniciais : c.selecionados,
        filters: filtersPayload || c.filters
      }));
      const response = await getMovimentosAssociacaoConciliacao(conciliacaoId, filtersPayload);
      setAssociacaoModal((c) => {
        const itens = Array.isArray(response?.itens) ? response.itens : [];
        const idsDisponiveis = new Set(itens.map((item) => Number(item.movimento_financeiro_id || 0)));
        const selecionados = (Array.isArray(selecionadosIniciais) ? selecionadosIniciais : c.selecionados)
          .map(Number)
          .filter((id) => id && idsDisponiveis.has(id));
        return {
          ...c,
          open: true,
          loading: false,
          error: '',
          selecionados,
          dados: {
            conciliacao: response?.conciliacao || null,
            meta: {
              total: Number(response?.meta?.total || 0),
              limit: Number(response?.meta?.limit || filtersPayload?.limit || c.filters.limit || 30)
            },
            itens
          }
        };
      });
    } catch (err) { setAssociacaoModal((c) => ({ ...c, open: true, loading: false, error: err?.message || 'Erro ao buscar movimentos' })); }
  }

  async function abrirAssociacaoManual(item) {
    const defaults = buildAssociacaoDefaults(item);
    const selecionadosIniciais = associacoesPreparadas[Number(item.id)]?.movimentoIds || [];
    setAssociacaoModal({ open: true, item, filters: defaults, loading: true, processing: false, error: '', selecionados: selecionadosIniciais, dados: { conciliacao: null, meta: { total: 0, limit: defaults.limit }, itens: [] } });
    await carregarMovimentosAssociacao(item.id, defaults, { selecionadosIniciais });
  }

  function fecharAssociacaoManual() {
    setAssociacaoModal({ open: false, item: null, filters: buildAssociacaoDefaults(null), loading: false, processing: false, error: '', selecionados: [], dados: { conciliacao: null, meta: { total: 0, limit: 30 }, itens: [] } });
  }

  async function consultarAssociacaoManual(event) {
    event.preventDefault();
    if (!associacaoModal.item?.id) return;
    await carregarMovimentosAssociacao(associacaoModal.item.id, associacaoModal.filters);
  }

  function toggleMovimentoAssociacaoManual(movimentoId) {
    const id = Number(movimentoId || 0);
    if (!id) return;
    setAssociacaoModal((current) => {
      const selecionadosAtuais = Array.isArray(current.selecionados)
        ? current.selecionados.map(Number).filter(Boolean)
        : [];
      if (selecionadosAtuais.includes(id)) {
        return { ...current, error: '', selecionados: selecionadosAtuais.filter((item) => item !== id) };
      }

      const movimento = current.dados.itens.find((item) => Number(item.movimento_financeiro_id || 0) === id);
      const resumoAtual = buildAssociacaoResumo({ ...current, selecionados: selecionadosAtuais });
      const novoTotal = resumoAtual.totalSelecionado + valorAbsolutoMovimentoAssociacao(movimento);
      if (novoTotal > resumoAtual.valorEsperado + 0.01) {
        return {
          ...current,
          error: 'A soma selecionada ultrapassa o valor do lancamento bancario.',
          selecionados: selecionadosAtuais
        };
      }

      return { ...current, error: '', selecionados: [...selecionadosAtuais, id] };
    });
  }

  function handleConfirmarAssociacaoSelecionada() {
    const resumo = buildAssociacaoResumo(associacaoModal);
    if (!associacaoModal.item?.id) return;
    if (!resumo.selecionados.length) {
      setAssociacaoModal((current) => ({ ...current, error: 'Selecione ao menos um movimento financeiro.' }));
      return;
    }
    if (resumo.ultrapassou) {
      setAssociacaoModal((current) => ({ ...current, error: 'A soma selecionada ultrapassa o valor do lancamento bancario.' }));
      return;
    }
    if (!resumo.fechou) {
      setAssociacaoModal((current) => ({ ...current, error: 'A soma selecionada precisa fechar com o valor do lancamento bancario.' }));
      return;
    }

    const movimentos = associacaoModal.dados.itens.filter((item) => (
      resumo.selecionados.includes(Number(item.movimento_financeiro_id || 0))
    ));
    setAssociacoesPreparadas((current) => ({
      ...current,
      [Number(associacaoModal.item.id)]: {
        movimentoIds: resumo.selecionados,
        movimentos,
        total: resumo.totalSelecionado
      }
    }));
    setFeedback('Associacao manual preparada. Revise as informacoes e clique em Conciliar para confirmar.');
    setError('');
    fecharAssociacaoManual();
  }

  function prepararSugestaoCompativel(item, sugestao) {
    const conciliacaoId = Number(item?.id || 0);
    const movimentoId = Number(sugestao?.movimento_financeiro_id || 0);
    if (!conciliacaoId || !movimentoId) {
      setError('Não foi possível preparar o título selecionado para conciliação.');
      return;
    }

    setAssociacoesPreparadas((current) => ({
      ...current,
      [conciliacaoId]: {
        movimentoIds: [movimentoId],
        movimentos: [sugestao],
        total: valorAbsolutoMovimentoAssociacao(sugestao)
      }
    }));
    setFeedback('Título compatível preparado. Revise as informações e clique em Conciliar para confirmar.');
    setError('');
  }

  async function carregarFaturasAssociacao(conciliacaoId, filtersPayload, { manterAberto = true } = {}) {
    try {
      setFaturaModal((c) => ({ ...c, open: manterAberto, loading: true, error: '', filters: filtersPayload || c.filters }));
      const response = await getFaturasAssociacaoConciliacao(conciliacaoId, filtersPayload);
      setFaturaModal((c) => ({
        ...c,
        open: true,
        loading: false,
        error: '',
        dados: {
          conciliacao: response?.conciliacao || null,
          meta: {
            total: Number(response?.meta?.total || 0),
            limit: Number(response?.meta?.limit || filtersPayload?.limit || c.filters.limit || 30)
          },
          itens: Array.isArray(response?.itens) ? response.itens : []
        }
      }));
    } catch (err) {
      setFaturaModal((c) => ({ ...c, open: true, loading: false, error: err?.message || 'Erro ao buscar faturas' }));
    }
  }

  async function abrirAssociacaoFatura(item) {
    const defaults = buildAssociacaoDefaults(item);
    setFaturaModal({
      open: true,
      item,
      filters: defaults,
      loading: true,
      processing: false,
      error: '',
      dados: { conciliacao: null, meta: { total: 0, limit: defaults.limit }, itens: [] }
    });
    await carregarFaturasAssociacao(item.id, defaults);
  }

  function fecharAssociacaoFatura() {
    setFaturaModal({
      open: false,
      item: null,
      filters: buildAssociacaoDefaults(null),
      loading: false,
      processing: false,
      error: '',
      dados: { conciliacao: null, meta: { total: 0, limit: 30 }, itens: [] }
    });
  }

  async function consultarAssociacaoFatura(event) {
    event.preventDefault();
    if (!faturaModal.item?.id) return;
    await carregarFaturasAssociacao(faturaModal.item.id, faturaModal.filters);
  }

  async function handleConfirmarFatura(conciliacaoId, faturaId) {
    if (!Number.isInteger(Number(faturaId)) || Number(faturaId) <= 0) {
      setFaturaModal((c) => ({ ...c, processing: false, error: 'Selecione uma fatura valida para conciliar.' }));
      return;
    }

    try {
      const processingKey = `fatura-${conciliacaoId}-${faturaId}`;
      setProcessingId(processingKey);
      setFaturaModal((c) => ({ ...c, processing: true, error: '' }));
      setError('');
      setFeedback('');
      await confirmarConciliacaoFaturaCartao(conciliacaoId, { fatura_cartao_id: faturaId });
      setFeedback('Fatura conciliada e titulos vinculados baixados com sucesso.');
      fecharAssociacaoFatura();
      await carregarConciliacoes();
    } catch (err) {
      setFaturaModal((c) => ({ ...c, processing: false, error: err?.message || 'Erro ao conciliar fatura' }));
    } finally {
      setProcessingId(null);
      setFaturaModal((c) => ({ ...c, processing: false }));
    }
  }

  function abrirAssociacaoTransferencia(item) {
    const contaContraparteAutomaticaId = item?.transferencia_contraparte_automatica?.conta_bancaria_id;
    setTransferenciaModal({
      open: true,
      item,
      conta_contraparte_id: contaContraparteAutomaticaId
        ? String(contaContraparteAutomaticaId)
        : '',
      descricao: item?.descricao_banco ? `Transferencia - ${item.descricao_banco}` : 'Transferencia entre contas',
      tipo_intercompany: '',
      motivo_intercompany: item?.descricao_banco || '',
      elimina_consolidado: true,
      processing: false,
      error: ''
    });
  }

  function fecharAssociacaoTransferencia() {
    setTransferenciaModal({
      open: false,
      item: null,
      conta_contraparte_id: '',
      descricao: '',
      tipo_intercompany: '',
      motivo_intercompany: '',
      elimina_consolidado: true,
      processing: false,
      error: ''
    });
  }

  async function handleConfirmarTransferencia(event) {
    event.preventDefault();
    if (!transferenciaModal.item?.id) return;
    if (!transferenciaModal.conta_contraparte_id) {
      setTransferenciaModal((current) => ({ ...current, error: 'Selecione a conta contraparte da transferencia.' }));
      return;
    }
    if (transferenciaEntreEmpresas && !transferenciaModal.tipo_intercompany) {
      setTransferenciaModal((current) => ({ ...current, error: 'Selecione o tipo da transferencia entre empresas.' }));
      return;
    }
    if (transferenciaEntreEmpresas && !String(transferenciaModal.motivo_intercompany || '').trim()) {
      setTransferenciaModal((current) => ({ ...current, error: 'Informe o motivo da transferencia entre empresas.' }));
      return;
    }

    try {
      setProcessingId(`transferencia-${transferenciaModal.item.id}`);
      setTransferenciaModal((current) => ({ ...current, processing: true, error: '' }));
      setError('');
      setFeedback('');
      await confirmarConciliacaoTransferencia(transferenciaModal.item.id, {
        conta_contraparte_id: transferenciaModal.conta_contraparte_id,
        tipo_transferencia: transferenciaEntreEmpresas ? 'ENTRE_EMPRESAS' : 'MESMA_TITULARIDADE',
        descricao: transferenciaModal.descricao,
        tipo_intercompany: transferenciaEntreEmpresas ? transferenciaModal.tipo_intercompany : undefined,
        motivo_intercompany: transferenciaEntreEmpresas ? transferenciaModal.motivo_intercompany : undefined,
        elimina_consolidado: transferenciaEntreEmpresas ? transferenciaModal.elimina_consolidado : true
      });
      setFeedback('Lancamento conciliado como transferencia entre contas.');
      fecharAssociacaoTransferencia();
      await carregarConciliacoes();
    } catch (err) {
      setTransferenciaModal((current) => ({ ...current, processing: false, error: err?.message || 'Erro ao conciliar transferencia' }));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleEstornarTransferencia(event) {
    event.preventDefault();
    const item = estornoTransferenciaModal.item;
    const motivo = String(estornoTransferenciaModal.motivo || '').trim();
    if (!item?.id || estornoTransferenciaModal.processing) return;
    if (!motivo) {
      setEstornoTransferenciaModal((current) => ({ ...current, error: 'Informe o motivo do estorno.' }));
      return;
    }

    try {
      setProcessingId(`estornar-transferencia-${item.id}`);
      setEstornoTransferenciaModal((current) => ({ ...current, processing: true, error: '' }));
      setError('');
      setFeedback('');
      await estornarConciliacaoTransferencia(item.id, { motivo });
      setEstornoTransferenciaModal({ open: false, item: null, motivo: '', processing: false, error: '' });
      setFeedback('Transferencia estornada. Os lancamentos OFX vinculados voltaram para pendente.');
      await carregarConciliacoes();
    } catch (err) {
      setEstornoTransferenciaModal((current) => ({
        ...current,
        processing: false,
        error: err?.message || 'Erro ao estornar transferencia conciliada'
      }));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleConfirmarTarifa(item, tarifa) {
    if (!item?.id || !tarifa?.codigo) return;

    const lockKey = `tarifa-${item.id}`;
    const processingKey = `${lockKey}-${tarifa.codigo}`;
    if (tarifaRequestsEmAndamentoRef.current.has(lockKey)) return;
    tarifaRequestsEmAndamentoRef.current.add(lockKey);

    try {
      setProcessingId(processingKey);
      setError('');
      setAcoesRapidasError('');
      setFeedback('');
      await confirmarConciliacaoTarifaBancaria(item.id, {
        codigo: tarifa.codigo,
        descricao: item.descricao_banco || tarifa.nome
      });
      setFeedback(`Lancamento conciliado como ${tarifa.nome}.`);
      setAcoesRapidasItem(null);
      await carregarConciliacoes();
    } catch (err) {
      const message = err?.message || 'Erro ao conciliar tarifa bancaria';
      setAcoesRapidasError(message);
      setError(message);
    } finally {
      tarifaRequestsEmAndamentoRef.current.delete(lockKey);
      setProcessingId(null);
    }
  }

  async function handleConfirmarEstornoTarifa(item, tarifa) {
    if (!item?.id || !tarifa?.codigo) return;
    const lockKey = `estorno-tarifa-${item.id}`;
    const processingKey = `${lockKey}-${tarifa.codigo}`;
    if (tarifaRequestsEmAndamentoRef.current.has(lockKey)) return;
    tarifaRequestsEmAndamentoRef.current.add(lockKey);

    try {
      setProcessingId(processingKey);
      setAcoesRapidasError('');
      setError('');
      setFeedback('');
      await confirmarConciliacaoEstornoTarifa(item.id, {
        codigo: tarifa.codigo,
        descricao: item.descricao_banco || `Estorno de ${tarifa.nome}`
      });
      setAcoesRapidasItem(null);
      setFeedback(`Estorno de tarifa lancado como movimento independente (${tarifa.nome}).`);
      await carregarConciliacoes();
    } catch (err) {
      const message = err?.message || 'Erro ao conciliar estorno de tarifa bancaria';
      setAcoesRapidasError(message);
      setError(message);
    } finally {
      tarifaRequestsEmAndamentoRef.current.delete(lockKey);
      setProcessingId(null);
    }
  }

  async function handleConfirmarCreditoRotativo(item) {
    if (!item?.id) return;

    const processingKey = `credito-rotativo-${item.id}`;
    try {
      setProcessingId(processingKey);
      setError('');
      setAcoesRapidasError('');
      setFeedback('');
      const response = await confirmarConciliacaoCreditoRotativo(item.id, {
        descricao: item.descricao_banco || ''
      });
      const natureza = String(response?.natureza || '').toUpperCase();
      setFeedback(natureza === 'AMORTIZACAO'
        ? 'Amortizacao de credito rotativo conciliada.'
        : 'Liberacao de credito rotativo conciliada.');
      setAcoesRapidasItem(null);
      await carregarConciliacoes();
    } catch (err) {
      const message = err?.message || 'Erro ao conciliar credito rotativo';
      setAcoesRapidasError(message);
      setError(message);
    } finally {
      setProcessingId(null);
    }
  }

  function aplicarFiltros(event) {
    event.preventDefault();
    setAppliedFilters({ ...filters, page: 1 });
  }

  function aplicarFiltrosDashboard(event) {
    event.preventDefault();
    setAppliedDashboardFilters({ ...dashboardFilters });
  }

  function limparFiltrosDashboard() {
    const next = { busca: '', banco: '', data_inicial: '', data_final: '' };
    setDashboardFilters(next);
    setAppliedDashboardFilters(next);
  }

  function abrirConferenciaManual(conta) {
    const next = {
      status: 'PENDENTE',
      conta_bancaria_id: String(conta?.id || ''),
      data_inicial: appliedDashboardFilters.data_inicial,
      data_final: appliedDashboardFilters.data_final,
      page: 1,
      page_size: filters.page_size || 100
    };
    setFilters(next);
    setAppliedFilters(next);
    setViewMode('DETALHE');
  }

  function alterarPagina(nextPage) {
    setAppliedFilters((c) => ({ ...c, page: nextPage }));
  }

  // ─── render ──────────────────────────────────────────────────────────────────

  const associacaoResumo = buildAssociacaoResumo(associacaoModal);

  return (
    <div className="page solicitacoes-page">

      {/* Cabeçalho */}
      <div className="card sol-surface-card app-toolbar-card">
        <div className="app-page-header-row">
          <div>
            <h1 className="page-title">Conciliação Bancária</h1>
            <p className="page-subtitle">
              Importe o OFX, revise as sugestões de match e confirme individualmente ou em lote.
              A importação não concilia nem cria títulos automaticamente.
            </p>
          </div>
          <div className="app-page-actions">
            <Link to="/financeiro/titulos" className="btn btn-outline btn-sm">Títulos</Link>
            <Link to="/financeiro/relatorios" className="btn btn-outline btn-sm">Relatórios</Link>
            <Link to="/financeiro/cadastros" className="btn btn-outline btn-sm">Cadastros</Link>
            {viewMode === 'DETALHE' && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewMode('CONTAS')}>
                Voltar para contas
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Importar OFX — linha horizontal */}
      <form className="mt-4 card sol-surface-card" onSubmit={handleImportar}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="app-filter-field flex-1 min-w-[160px]">
            <span className="app-filter-label">Importar OFX <span className="font-normal text-[var(--c-muted)]">— Remessas duplicadas são bloqueadas.</span></span>
            <select className="input w-full input-sm" value={uploadForm.conta_bancaria_id} disabled={loadingContas}
              onChange={(e) => setUploadForm((c) => ({ ...c, conta_bancaria_id: e.target.value }))}>
              <option value="">Detectar conta pelo OFX</option>
              {contas.map((ct) => <option key={ct.id} value={ct.id}>{ct.nome}</option>)}
            </select>
          </label>
          <label className="app-filter-field flex-[2] min-w-[200px]">
            <span className="app-filter-label">Arquivo OFX</span>
            <input id="ofx-file-input" className="input w-full input-sm" type="file" accept=".ofx" multiple
              onChange={(e) => setUploadForm((c) => ({ ...c, files: Array.from(e.target.files || []) }))} />
          </label>
          <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={importing || !uploadForm.files.length}>
            {importing ? 'Importando...' : 'Importar OFX'}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--c-muted)]">
          Deixe a conta em branco para o sistema identificar cada OFX pela Identificacao OFX cadastrada na conta bancaria. Se selecionar uma conta, todos os arquivos serao importados nela.
        </p>
      </form>

      {importResults.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--c-text)]">Resultado da importacao</h2>
                <p className="mt-1 text-xs text-[var(--c-muted)]">Confira quais OFX foram importados e quais precisam de ajuste cadastral.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {importResults.filter((item) => item.sucesso).length}/{importResults.length} importado(s)
              </span>
            </div>

            <div className="max-h-[48vh] overflow-y-auto pr-1">
              <div className="grid gap-2">
                {importResults.map((item, index) => (
                  <div
                    key={`${item.arquivo || 'ofx'}-${index}`}
                    className={`rounded-xl border px-3 py-2 text-xs ${item.sucesso ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="truncate">{item.arquivo || `Arquivo ${index + 1}`}</strong>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.sucesso ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                        {item.sucesso ? 'Importado' : 'Nao importado'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs">
                      {item.sucesso
                        ? `${item.importados || 0} lancamento(s) novo(s), ${item.ignorados || 0} ignorado(s) - ${item.conta_bancaria_nome || `Conta #${item.conta_bancaria_id || '-'}`}`
                        : item.mensagem || 'Conta nao encontrada para este OFX.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setImportResults([])}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros — linha horizontal */}
      {error && <div className="app-alert app-alert--error">{error}</div>}
      {feedback && <div className="app-alert border-emerald-200 bg-emerald-50 text-emerald-700">{feedback}</div>}

      {viewMode === 'CONTAS' ? (
        <>
          <form className="card sol-surface-card" onSubmit={aplicarFiltrosDashboard}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto] xl:items-end">
              <label className="app-filter-field">
                <span className="app-filter-label">Buscar conta</span>
                <input
                  className="input w-full input-sm"
                  value={dashboardFilters.busca}
                  onChange={(e) => setDashboardFilters((current) => ({ ...current, busca: e.target.value }))}
                  placeholder="Banco, conta, agencia ou empresa"
                />
              </label>
              <label className="app-filter-field">
                <span className="app-filter-label">Banco</span>
                <select
                  className="input w-full input-sm"
                  value={dashboardFilters.banco}
                  onChange={(e) => setDashboardFilters((current) => ({ ...current, banco: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {bancosDashboard.map((banco) => <option key={banco} value={banco}>{banco}</option>)}
                </select>
              </label>
              <label className="app-filter-field">
                <span className="app-filter-label">Data inicial</span>
                <input
                  className="input w-full input-sm"
                  type="date"
                  value={dashboardFilters.data_inicial}
                  onChange={(e) => setDashboardFilters((current) => ({ ...current, data_inicial: e.target.value }))}
                />
              </label>
              <label className="app-filter-field">
                <span className="app-filter-label">Data final</span>
                <input
                  className="input w-full input-sm"
                  type="date"
                  value={dashboardFilters.data_final}
                  onChange={(e) => setDashboardFilters((current) => ({ ...current, data_final: e.target.value }))}
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary btn-sm">Filtrar</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={limparFiltrosDashboard}>Limpar</button>
              </div>
            </div>
          </form>

          <div className="card sol-surface-card">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-[120px] flex-1 flex-col">
                <span className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">Contas exibidas</span>
                <span className="text-sm font-bold text-[var(--c-text)]">{resumoDashboard.contas}</span>
                <span className="text-[10px] text-[var(--c-muted)]">com conciliacao no filtro</span>
              </div>
              <div className="flex min-w-[120px] flex-1 flex-col">
                <span className="text-[10px] uppercase tracking-wide text-amber-600">Pendentes</span>
                <span className="text-sm font-bold text-amber-700">{resumoDashboard.pendentes}</span>
                <span className="text-[10px] text-[var(--c-muted)]">aguardando conferencia</span>
              </div>
              <div className="flex min-w-[120px] flex-1 flex-col">
                <span className="text-[10px] uppercase tracking-wide text-emerald-600">Conciliados</span>
                <span className="text-sm font-bold text-emerald-700">{resumoDashboard.conciliados}</span>
                <span className="text-[10px] text-[var(--c-muted)]">matches confirmados</span>
              </div>
              <div className="flex min-w-[120px] flex-1 flex-col">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Ignorados</span>
                <span className="text-sm font-bold text-slate-600">{resumoDashboard.ignorados}</span>
                <span className="text-[10px] text-[var(--c-muted)]">descartados</span>
              </div>
              <div className="flex min-w-[150px] flex-1 flex-col">
                <span className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">Movimentacao bruta</span>
                <span className="text-sm font-bold text-[var(--c-text)]">{formatCurrency(resumoDashboard.valor_absoluto_total)}</span>
                <span className="text-[10px] text-[var(--c-muted)]">soma absoluta do filtro</span>
              </div>
            </div>
          </div>

          {loadingContas || loadingContasResumo ? (
            <div className="app-empty-card sol-surface-card">Carregando contas bancarias...</div>
          ) : contasResumo.length === 0 ? (
            <div className="app-empty-card sol-surface-card">Nenhuma conta encontrada com os filtros atuais.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {contasResumo.map(({ conta, resumo, erro }) => {
                const hasPending = resumo.pendentes > 0;
                return (
                  <div key={conta.id} className="card sol-surface-card border border-[var(--c-border)] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">{getContaBanco(conta)}</p>
                        <h2 className="mt-1 truncate text-lg font-semibold text-[var(--c-text)]">{getContaNome(conta)}</h2>
                        <p className="mt-1 text-sm text-[var(--c-muted)]">
                          Agencia {getContaAgencia(conta)} - Conta {getContaNumero(conta)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[var(--c-muted)]">{getContaEmpresaNome(conta)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${erro ? 'bg-rose-50 text-rose-700' : hasPending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {erro ? 'Erro' : hasPending ? 'Conferir' : 'Em dia'}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-amber-50 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wide text-amber-700">Pendentes</span>
                        <strong className="text-lg text-amber-800">{resumo.pendentes}</strong>
                      </div>
                      <div className="rounded-xl bg-emerald-50 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wide text-emerald-700">Conciliados</span>
                        <strong className="text-lg text-emerald-800">{resumo.conciliados}</strong>
                      </div>
                      <div className="rounded-xl bg-slate-100 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wide text-slate-600">Ignorados</span>
                        <strong className="text-lg text-slate-700">{resumo.ignorados}</strong>
                      </div>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide text-[var(--c-muted)]">Movimentacao bruta</span>
                        <strong className="text-base text-[var(--c-text)]">{formatCurrency(resumo.valor_absoluto_total)}</strong>
                      </div>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirConferenciaManual(conta)}>
                        Conferir manualmente
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
      <form className="card sol-surface-card" onSubmit={aplicarFiltros}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="app-filter-field min-w-[130px]">
            <span className="app-filter-label">Status</span>
            <select className="input w-full input-sm" value={filters.status}
              onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              <option value="PENDENTE">Pendentes</option>
              <option value="CONCILIADO">Conciliados</option>
              <option value="IGNORADO">Ignorados</option>
              <option value="TODOS">Todos</option>
            </select>
          </label>
          <label className="app-filter-field flex-1 min-w-[150px]">
            <span className="app-filter-label">Conta bancária</span>
            <select className="input w-full input-sm" value={filters.conta_bancaria_id} disabled={loadingContas}
              onChange={(e) => setFilters((c) => ({ ...c, conta_bancaria_id: e.target.value }))}>
              <option value="">Todas</option>
              {contas.map((ct) => <option key={ct.id} value={ct.id}>{ct.nome}</option>)}
            </select>
          </label>
          <label className="app-filter-field min-w-[130px]">
            <span className="app-filter-label">Data inicial</span>
            <input className="input w-full input-sm" type="date" value={filters.data_inicial}
              onChange={(e) => setFilters((c) => ({ ...c, data_inicial: e.target.value }))} />
          </label>
          <label className="app-filter-field min-w-[130px]">
            <span className="app-filter-label">Data final</span>
            <input className="input w-full input-sm" type="date" value={filters.data_final}
              onChange={(e) => setFilters((c) => ({ ...c, data_final: e.target.value }))} />
          </label>
          <div className="flex gap-2 shrink-0">
            <button type="submit" className="btn btn-primary btn-sm">Filtrar</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => {
              const next = { status: 'PENDENTE', conta_bancaria_id: '', data_inicial: '', data_final: '', page: 1, page_size: filters.page_size || 100 };
              setFilters(next); setAppliedFilters(next);
            }}>Limpar</button>
          </div>
        </div>
      </form>

      {/* Indicadores + Resumo consolidado — linha horizontal */}
      <div className="card sol-surface-card">
        <div className="flex flex-wrap items-center gap-3">
          {resumoFinanceiro.map((item) => (
            <div key={item.label} className="flex flex-col min-w-[100px] flex-1">
              <span className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">{item.label}</span>
              <span className="text-sm font-bold text-[var(--c-text)] tabular-nums">{item.value}</span>
              <span className="text-[10px] text-[var(--c-muted)]">{item.detail}</span>
            </div>
          ))}
          <div className="h-8 w-px bg-[var(--c-border)] shrink-0 hidden xl:block" />
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">Lidos</span>
              <span className="text-sm font-bold text-[var(--c-text)]">{importacoes.resumo.total_lidos}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wide text-emerald-600">Import.</span>
              <span className="text-sm font-bold text-emerald-700">{importacoes.resumo.total_importados}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wide text-amber-600">Ignor.</span>
              <span className="text-sm font-bold text-amber-700">{importacoes.resumo.total_ignorados}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Área operacional */}
      {loading
        ? <div className="app-empty-card sol-surface-card">Carregando lançamentos...</div>
        : (
          <div className="space-y-1.5">
            <ToolbarConciliacao
              meta={dados.meta} filters={filters} setFilters={setFilters} setAppliedFilters={setAppliedFilters}
              resumoSugestoes={resumoSugestoesPagina} bulkReconciling={bulkReconciling}
              onConciliarSugeridos={handleConciliarSugeridos} appliedFilters={appliedFilters}
            />

            {conciliacoesSelecionadasItens.length > 0 && (
              <div className="sol-surface-card card flex flex-col gap-3 border border-[var(--c-primary)] bg-blue-50/60 p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--c-text)]">
                    {conciliacoesSelecionadasItens.length} lancamento(s) selecionado(s)
                  </p>
                  <p className="text-xs text-[var(--c-muted)]">
                    Use para baixar um unico titulo com pagamentos parciais em uma ou mais datas do extrato.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setConciliacoesSelecionadas([])}>
                    Limpar selecao
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setBaixaExtratosModalOpen(true)}>
                    Baixar titulo com selecionados
                  </button>
                </div>
              </div>
            )}

            {dados.itens.length === 0
              ? <div className="app-empty-card sol-surface-card">Nenhum lançamento encontrado com os filtros atuais.</div>
              : dados.itens.map((item) => (
                  <ItemConciliacao
                    key={item.id}
                    item={item}
                    associacaoPreparada={associacoesPreparadas[Number(item.id)] || null}
                    processingId={processingId}
                    canEstornarTransferencia={canEstornarTransferencia}
                    selected={conciliacoesSelecionadas.includes(Number(item.id))}
                    onToggleSelecao={toggleConciliacaoSelecionada}
                    onConfirmar={handleConfirmar} onIgnorar={handleIgnorar}
                    onConfirmarEstorno={handleConfirmarEstornoBancario}
                    onRemover={handleRemover}
                    onAssociarManual={abrirAssociacaoManual}
                    onPrepararSugestao={prepararSugestaoCompativel}
                    onAssociarFatura={abrirAssociacaoFatura}
                    onAssociarTransferencia={abrirAssociacaoTransferencia}
                    onEstornarTransferencia={(it) => setEstornoTransferenciaModal({
                      open: true,
                      item: it,
                      motivo: '',
                      processing: false,
                      error: ''
                    })}
                    onAcoesRapidas={abrirAcoesRapidas}
                  />
                ))
            }

            <FooterPaginacao meta={dados.meta} onAlterarPagina={alterarPagina} />
          </div>
        )
      }
        </>
      )}

      {baixaExtratosModalOpen && (
        <BaixaExtratosTituloModal
          itens={conciliacoesSelecionadasItens}
          onClose={() => setBaixaExtratosModalOpen(false)}
          onConfirmar={handleBaixarTituloPorExtratos}
        />
      )}

      {estornoTransferenciaModal.open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <form
            className="w-full max-w-xl rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 shadow-2xl"
            onSubmit={handleEstornarTransferencia}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Estornar transferencia conciliada</h2>
                <p className="mt-1 text-sm text-[var(--c-muted)]">
                  A transferencia sera cancelada e todos os lancamentos OFX vinculados voltarao para pendente.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm shrink-0"
                disabled={estornoTransferenciaModal.processing}
                onClick={() => setEstornoTransferenciaModal({ open: false, item: null, motivo: '', processing: false, error: '' })}
              >Fechar</button>
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Transferencia #{estornoTransferenciaModal.item?.transferencia?.id || '-'} · {formatCurrency(Math.abs(Number(estornoTransferenciaModal.item?.valor || 0)))}
            </div>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium text-[var(--c-text)]">Motivo do estorno *</span>
              <textarea
                className="input min-h-24 w-full resize-y"
                maxLength={255}
                value={estornoTransferenciaModal.motivo}
                onChange={(event) => setEstornoTransferenciaModal((current) => ({ ...current, motivo: event.target.value, error: '' }))}
                placeholder="Ex.: transferencia conciliada na conta incorreta"
              />
            </label>
            {estornoTransferenciaModal.error && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                {estornoTransferenciaModal.error}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-outline" disabled={estornoTransferenciaModal.processing} onClick={() => setEstornoTransferenciaModal({ open: false, item: null, motivo: '', processing: false, error: '' })}>Cancelar</button>
              <button type="submit" className="btn btn-danger" disabled={estornoTransferenciaModal.processing || !String(estornoTransferenciaModal.motivo || '').trim()}>
                {estornoTransferenciaModal.processing ? 'Estornando...' : 'Confirmar estorno'}
              </button>
            </div>
          </form>
        </div>
      )}

      {acoesRapidasItem && (
        <AcoesRapidasConciliacaoModal
          item={acoesRapidasItem}
          tarifas={tarifasBancarias}
          processingId={processingId}
          error={acoesRapidasError}
          onClose={() => {
            setAcoesRapidasError('');
            setAcoesRapidasItem(null);
          }}
          onNovoTitulo={(item) => {
            setAcoesRapidasError('');
            setAcoesRapidasItem(null);
            setNovoTituloItem(item);
          }}
          onConfirmarCreditoRotativo={handleConfirmarCreditoRotativo}
          onConfirmarTarifa={handleConfirmarTarifa}
          onConfirmarEstornoTarifa={handleConfirmarEstornoTarifa}
        />
      )}

      {/* Modal: Novo título + baixa */}
      {novoTituloItem && (
        <NovoTituloRapidoModal
          item={novoTituloItem}
          contas={contas}
          onClose={() => setNovoTituloItem(null)}
          onConciliar={async (conciliacaoId, movimentoId) => {
            setNovoTituloItem(null);
            if (conciliacaoId && movimentoId) {
              await handleConfirmar(conciliacaoId, movimentoId);
            } else {
              await carregarConciliacoes();
              setFeedback('Título criado e baixado. Verifique as sugestões atualizadas para conciliar.');
            }
          }}
        />
      )}

      {/* Modal: Transferencia entre contas */}
      {transferenciaModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-[var(--c-surface)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Conciliar transferencia</h2>
                <p className="mt-0.5 text-sm text-[var(--c-muted)]">
                  Informe a outra conta envolvida. O sistema define origem e destino pelo sinal do lancamento bancario.
                </p>
                {transferenciaModal.item && (
                  <div className="mt-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm">
                    <span className="font-medium">{transferenciaModal.item.descricao_banco || 'Lancamento'}</span>
                    {' - '}{formatDate(transferenciaModal.item.data_movimento)}
                    {' - '}<ValorBanco value={transferenciaModal.item.valor} size="sm" />
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={fecharAssociacaoTransferencia}>Fechar</button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleConfirmarTransferencia}>
              <label className="text-sm">
                <span className="mb-1 block text-[var(--c-muted)]">Conta contraparte</span>
                <select
                  className="input w-full"
                  value={transferenciaModal.conta_contraparte_id}
                  onChange={(e) => setTransferenciaModal((current) => ({ ...current, conta_contraparte_id: e.target.value, tipo_intercompany: '', error: '' }))}
                  required
                >
                  <option value="">Selecione</option>
                  {contas
                    .filter((conta) => String(conta.id) !== String(transferenciaModal.item?.conta_bancaria_id))
                    .map((conta) => (
                      <option key={conta.id} value={conta.id}>
                        {conta.nome}{conta.banco ? ` - ${conta.banco}` : ''}
                      </option>
                    ))}
                </select>
              </label>
              {contaAtualTransferencia && contaContraparteTransferencia ? (
                <div className={`rounded-xl border px-4 py-3 text-sm ${transferenciaEntreEmpresas ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                  <strong>{transferenciaEntreEmpresas ? 'Transferencia Entre Empresas' : 'Transferencia interna da mesma empresa'}</strong>
                  <div className="mt-1">
                    {getContaEmpresaNome(contaOrigemTransferencia)} para {getContaEmpresaNome(contaDestinoTransferencia)}.
                  </div>
                  {contraparteAutomaticaSelecionada ? (
                    <div className="mt-2 font-medium">
                      Par OFX localizado automaticamente pela mesma data e pelo valor oposto.
                    </div>
                  ) : null}
                </div>
              ) : null}
              {transferenciaModal.item?.transferencia_contraparte_ambigua ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Ha mais de um lancamento OFX com a mesma data e o valor oposto. Confirme a conta contraparte manualmente; nenhum par sera escolhido automaticamente.
                </div>
              ) : null}
              {transferenciaEntreEmpresas ? (
                <>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--c-muted)]">Tipo</span>
                    <select
                      className="input w-full"
                      value={transferenciaModal.tipo_intercompany}
                      onChange={(e) => setTransferenciaModal((current) => ({ ...current, tipo_intercompany: e.target.value }))}
                      required
                    >
                      <option value="">Selecione</option>
                      {TIPOS_INTERCOMPANY.map((tipo) => (
                        <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--c-muted)]">Motivo</span>
                    <input
                      className="input w-full"
                      value={transferenciaModal.motivo_intercompany}
                      onChange={(e) => setTransferenciaModal((current) => ({ ...current, motivo_intercompany: e.target.value }))}
                      placeholder="Ex.: cobertura de caixa para folha"
                      required
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-[var(--c-border)] px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={transferenciaModal.elimina_consolidado}
                      onChange={(e) => setTransferenciaModal((current) => ({ ...current, elimina_consolidado: e.target.checked }))}
                    />
                    <span>Eliminar do consolidado do grupo</span>
                  </label>
                </>
              ) : null}
              <label className="text-sm">
                <span className="mb-1 block text-[var(--c-muted)]">Descricao</span>
                <input
                  className="input w-full"
                  value={transferenciaModal.descricao}
                  onChange={(e) => setTransferenciaModal((current) => ({ ...current, descricao: e.target.value }))}
                />
              </label>
              {transferenciaModal.error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {transferenciaModal.error}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-outline" onClick={fecharAssociacaoTransferencia}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={transferenciaModal.processing}>
                  {transferenciaModal.processing ? 'Conciliando...' : 'Conciliar transferencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Associação manual */}
      {associacaoModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white dark:bg-[var(--c-surface)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Associação manual</h2>
                <p className="mt-0.5 text-sm text-[var(--c-muted)]">
                  Escolha o movimento correto. Esta etapa apenas prepara o match; a gravação acontece ao clicar em Conciliar.
                </p>
                {associacaoModal.item && (
                  <div className="mt-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm">
                    <span className="font-medium">{associacaoModal.item.descricao_banco || 'Lançamento'}</span>
                    {' · '}{formatDate(associacaoModal.item.data_movimento)}
                    {' · '}<ValorBanco value={associacaoModal.item.valor} size="sm" />
                    {associacaoModal.item.documento ? ` · Doc. ${associacaoModal.item.documento}` : ''}
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={fecharAssociacaoManual}>Fechar</button>
            </div>

            <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={consultarAssociacaoManual}>
              {[
                { label: 'Data inicial', field: 'data_inicial', type: 'date' },
                { label: 'Data final', field: 'data_final', type: 'date' },
                { label: 'Documento / texto', field: 'documento', type: 'text', placeholder: 'Parceiro, descrição ou doc.' },
                { label: 'Número do documento', field: 'numero_documento', type: 'text' },
                { label: 'Valor inicial', field: 'valor_inicial', type: 'number' },
                { label: 'Valor final', field: 'valor_final', type: 'number' }
              ].map(({ label, field, type, placeholder }) => (
                <label key={field} className="text-sm">
                  <span className="mb-1 block text-[var(--c-muted)]">{label}</span>
                  <input className="input w-full" type={type === 'number' ? 'text' : type} inputMode={type === 'number' ? 'decimal' : undefined}
                    placeholder={placeholder} value={associacaoModal.filters[field]}
                    onChange={(e) => setAssociacaoModal((c) => ({
                      ...c,
                      filters: {
                        ...c.filters,
                        [field]: type === 'number' ? normalizeCurrencyTyping(e.target.value) : e.target.value
                      }
                    }))} />
                </label>
              ))}
              <label className="text-sm">
                <span className="mb-1 block text-[var(--c-muted)]">Limite</span>
                <select className="input w-full" value={associacaoModal.filters.limit}
                  onChange={(e) => setAssociacaoModal((c) => ({ ...c, filters: { ...c.filters, limit: Number(e.target.value || 30) } }))}>
                  {[20, 30, 50, 100].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <div className="flex items-end gap-2 xl:col-span-2">
                <button type="submit" className="btn btn-primary" disabled={associacaoModal.loading}>
                  {associacaoModal.loading ? 'Consultando...' : 'Consultar'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => {
                  const next = buildAssociacaoDefaults(associacaoModal.item);
                  setAssociacaoModal((c) => ({ ...c, filters: next }));
                  if (associacaoModal.item?.id) carregarMovimentosAssociacao(associacaoModal.item.id, next);
                }}>Limpar</button>
              </div>
            </form>

            {associacaoModal.error && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{associacaoModal.error}</div>
            )}
            <div className="mt-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-4 py-2 text-sm text-[var(--c-muted)]">
              {associacaoModal.dados.meta.total} movimento(s) encontrado(s)
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--c-border)]">
              <AssociacaoManualTabela
                loading={associacaoModal.loading}
                itens={associacaoModal.dados.itens}
                modal={associacaoModal}
                processingId={processingId}
                selecionados={associacaoResumo.selecionados}
                totalSelecionado={associacaoResumo.totalSelecionado}
                valorEsperado={associacaoResumo.valorEsperado}
                onToggleSelecionado={toggleMovimentoAssociacaoManual}
              />
            </div>
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span className="text-[var(--c-muted)]">Selecionado: <strong className="text-[var(--c-text)]">{formatCurrency(associacaoResumo.totalSelecionado)}</strong></span>
                <span className="text-[var(--c-muted)]">Extrato: <strong className="text-[var(--c-text)]">{formatCurrency(associacaoResumo.valorEsperado)}</strong></span>
                {associacaoResumo.selecionados.length > 0 && !associacaoResumo.fechou && !associacaoResumo.ultrapassou ? (
                  <span className="text-amber-700">Falta {formatCurrency(Math.max(associacaoResumo.diferenca, 0))}</span>
                ) : null}
                {associacaoResumo.ultrapassou ? (
                  <span className="text-rose-700">Selecao acima do valor pago.</span>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-primary shrink-0"
                disabled={associacaoModal.processing || !associacaoResumo.fechou}
                onClick={handleConfirmarAssociacaoSelecionada}
              >
                {associacaoModal.processing ? 'Preparando...' : 'Preparar associação'}
              </button>
            </div>
            <div className="hidden">
              {associacaoModal.loading
                ? <div className="rounded-xl border border-[var(--c-border)] px-4 py-8 text-center text-sm text-[var(--c-muted)]">Carregando movimentos...</div>
                : associacaoModal.dados.itens.length === 0
                  ? <div className="rounded-xl border border-dashed border-[var(--c-border)] px-4 py-8 text-center text-sm text-[var(--c-muted)]">Nenhum movimento encontrado com os filtros atuais.</div>
                  : associacaoModal.dados.itens.map((it) => (
                      <div key={it.movimento_financeiro_id} className="rounded-xl border border-[var(--c-border)] px-4 py-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1 text-sm">
                            <p className="font-medium text-[var(--c-text)]">{it.titulo_descricao}</p>
                            <p className="text-[var(--c-muted)]">{it.parceiro_nome} · {it.tipo} · mov. #{it.movimento_financeiro_id}</p>
                            <p className="text-[var(--c-muted)]">{formatDate(it.data_movimento)} · {formatCurrency(it.valor_quitacao)}{it.documento ? ` · Doc. ${it.documento}` : ''}</p>
                            {it.motivos?.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {it.motivos.map((m) => <span key={`${it.movimento_financeiro_id}-${m}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{m}</span>)}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-start gap-2 md:items-end">
                            <span className="text-xs uppercase tracking-wide text-[var(--c-muted)]">Score {it.score}</span>
                            <button type="button" className="btn btn-primary btn-sm"
                              disabled={associacaoModal.processing || processingId === `confirmar-${associacaoModal.item?.id}-${it.movimento_financeiro_id}`}
                              onClick={() => handleConfirmar(associacaoModal.item?.id, it.movimento_financeiro_id, { fecharModal: true })}>
                              {associacaoModal.processing || processingId === `confirmar-${associacaoModal.item?.id}-${it.movimento_financeiro_id}` ? 'Associando...' : 'Associar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
              }
            </div>
          </div>
        </div>
      )}

      {/* Modal: Associar fatura */}
      {faturaModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-[var(--c-surface)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Associar fatura de cartao</h2>
                <p className="mt-0.5 text-sm text-[var(--c-muted)]">
                  Use esta opcao quando o lancamento bancario pagar uma fatura inteira; os titulos da fatura serao baixados individualmente.
                </p>
                {faturaModal.item && (
                  <div className="mt-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm">
                    <span className="font-medium">{faturaModal.item.descricao_banco || 'Lancamento'}</span>
                    {' - '}{formatDate(faturaModal.item.data_movimento)}
                    {' - '}<ValorBanco value={faturaModal.item.valor} size="sm" />
                    {faturaModal.item.documento ? ` - Doc. ${faturaModal.item.documento}` : ''}
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={fecharAssociacaoFatura}>Fechar</button>
            </div>

            <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={consultarAssociacaoFatura}>
              {[
                { label: 'Data inicial', field: 'data_inicial', type: 'date' },
                { label: 'Data final', field: 'data_final', type: 'date' },
                { label: 'Texto / cartao', field: 'documento', type: 'text', placeholder: 'Cartao, titular ou competencia' },
                { label: 'Valor inicial', field: 'valor_inicial', type: 'number' },
                { label: 'Valor final', field: 'valor_final', type: 'number' }
              ].map(({ label, field, type, placeholder }) => (
                <label key={field} className="text-sm">
                  <span className="mb-1 block text-[var(--c-muted)]">{label}</span>
                  <input
                    className="input w-full"
                    type={type === 'number' ? 'text' : type}
                    inputMode={type === 'number' ? 'decimal' : undefined}
                    placeholder={placeholder}
                    value={faturaModal.filters[field] || ''}
                    onChange={(e) => setFaturaModal((c) => ({
                      ...c,
                      filters: {
                        ...c.filters,
                        [field]: type === 'number' ? normalizeCurrencyTyping(e.target.value) : e.target.value
                      }
                    }))}
                  />
                </label>
              ))}
              <label className="text-sm">
                <span className="mb-1 block text-[var(--c-muted)]">Limite</span>
                <select className="input w-full" value={faturaModal.filters.limit}
                  onChange={(e) => setFaturaModal((c) => ({ ...c, filters: { ...c.filters, limit: Number(e.target.value || 30) } }))}>
                  {[20, 30, 50, 100].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <div className="flex items-end gap-2 xl:col-span-2">
                <button type="submit" className="btn btn-primary" disabled={faturaModal.loading}>
                  {faturaModal.loading ? 'Consultando...' : 'Consultar faturas'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => {
                  const next = buildAssociacaoDefaults(faturaModal.item);
                  setFaturaModal((c) => ({ ...c, filters: next }));
                  if (faturaModal.item?.id) carregarFaturasAssociacao(faturaModal.item.id, next);
                }}>Limpar</button>
              </div>
            </form>

            {faturaModal.error && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{faturaModal.error}</div>
            )}
            <div className="mt-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-4 py-2 text-sm text-[var(--c-muted)]">
              {faturaModal.dados.meta.total} fatura(s) encontrada(s)
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--c-border)]">
              <FaturasAssociacaoTabela
                loading={faturaModal.loading}
                itens={faturaModal.dados.itens}
                modal={faturaModal}
                processingId={processingId}
                onAssociar={handleConfirmarFatura}
              />
            </div>
            <div className="hidden">
              {faturaModal.loading
                ? <div className="rounded-xl border border-[var(--c-border)] px-4 py-8 text-center text-sm text-[var(--c-muted)]">Carregando faturas...</div>
                : faturaModal.dados.itens.length === 0
                  ? <div className="rounded-xl border border-dashed border-[var(--c-border)] px-4 py-8 text-center text-sm text-[var(--c-muted)]">Nenhuma fatura encontrada com os filtros atuais.</div>
                  : faturaModal.dados.itens.map((fatura) => {
                    const processingKey = `fatura-${faturaModal.item?.id}-${fatura.id}`;
                    return (
                      <div key={fatura.id} className="rounded-xl border border-[var(--c-border)] px-4 py-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1 text-sm">
                            <p className="font-medium text-[var(--c-text)]">
                              {fatura.cartao?.nome || 'Cartao'} - competencia {fatura.competencia}
                            </p>
                            <p className="text-[var(--c-muted)]">
                              {formatDate(fatura.data_fechamento)} a vencer em {formatDate(fatura.data_vencimento)}
                              {' - '}{fatura.total_titulos || 0} titulo(s)
                            </p>
                            <p className="text-[var(--c-muted)]">
                              Valor da fatura: {formatCurrency(fatura.valor_total)}
                            </p>
                          </div>
                          <div className="flex flex-col items-start gap-2 md:items-end">
                            <span className={statusClass(fatura.status)}>{fatura.status}</span>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={faturaModal.processing || processingId === processingKey}
                              onClick={() => handleConfirmarFatura(faturaModal.item?.id, fatura.id)}
                            >
                              {faturaModal.processing || processingId === processingKey ? 'Associando...' : 'Associar fatura'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
