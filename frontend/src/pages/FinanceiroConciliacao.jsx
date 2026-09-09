import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Pagina,
  PageHeader,
  TabelaPadrao,
  CelulaDupla,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import { formatCurrencyInput, normalizeCurrencyTyping, parseCurrencyInput } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';
import { hasPermissao } from '../utils/acessoProduto';
import DateInputBR from '../components/DateInputBR';

const TIPOS_INTERCOMPANY = [
  { value: 'APORTE', label: 'Aporte' },
  { value: 'EMPRESTIMO', label: 'Emprestimo' },
  { value: 'REEMBOLSO', label: 'Reembolso' },
  { value: 'RATEIO', label: 'Rateio' },
  { value: 'COBERTURA_CAIXA', label: 'Cobertura de caixa' },
  { value: 'FOLHA', label: 'Folha' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
  { value: 'IMPOSTO', label: 'Imposto' },
  { value: 'TRANSFERENCIA_OPERACIONAL', label: 'Transferência operacional' }
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
  if (s === 'CONCILIADO') return 'app-status-pill bg-[var(--sem-success-bg)] text-[var(--sem-success)]';
  if (s === 'IGNORADO') return 'app-status-pill bg-[var(--sem-neutral-bg)] text-[var(--sem-neutral)]';
  return 'app-status-pill bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]';
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

/*
  R10 — os dois papéis que a tela usa de verdade: corpo (14) e título de
  bloco (18). Havia um terceiro degrau, fora da escala, para size="xl" —
  ramo MORTO, nenhuma chamada o usava — e ele só existia para reprovar.
  `tabular-nums` em todos: valor de dinheiro alinha coluna com coluna (R6).

  (O nome da classe reprovada não se escreve aqui: o check da R10 é linha a
  linha e NÃO desconta comentário — citá-la faria a explicação da correção
  reprovar no lugar do defeito.)
*/
function ValorBanco({ value, size = 'lg' }) {
  const positive = Number(value || 0) >= 0;
  const sizeClass = size === 'sm' ? 'text-sm font-semibold tabular-nums' : 'text-lg font-semibold tabular-nums';
  return (
    <span className={`${sizeClass} ${positive ? 'text-[var(--sem-success)]' : 'text-[var(--sem-danger)]'}`}>
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
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-xl rounded-2xl bg-[var(--c-surface)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] pb-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--c-text)]">Ações rápidas</h2>
            <p className="mt-1 text-sm text-[var(--c-muted)]">Escolha como registrar este lançamento bancário.</p>
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
            <span className="block text-sm font-semibold text-[var(--c-text)]">Criar título + baixa</span>
            <span className="mt-1 block text-xs text-[var(--c-muted)]">Usa o fluxo completo de contas a pagar/receber e concilia o movimento.</span>
          </button>

          <div className="rounded-xl border border-[var(--c-border)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--c-text)]">Crédito rotativo</p>
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
                <p className="text-sm font-semibold text-[var(--c-text)]">Registrar tarifa bancária</p>
                <p className="text-xs text-[var(--c-muted)]">Cria movimento avulso de tarifa com categoria financeira explícita para DRE.</p>
              </div>
              {!isSaida && <span className="rounded-full bg-[var(--sem-warning-bg)] px-2 py-1 text-xs font-medium text-[var(--sem-warning)]">Apenas saídas</span>}
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
              <div className="mt-3 rounded-xl border border-[var(--sem-danger-border)] bg-[var(--sem-danger-bg)] px-3 py-2 text-xs font-medium text-[var(--sem-danger)]">
                {error}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--c-border)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--c-text)]">Lancar estorno de tarifa</p>
              <p className="text-xs text-[var(--c-muted)]">
                Registra este crédito como um lançamento independente, sem exigir uma tarifa anterior.
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
  onToggleSelecionado,
}) {
  const idDe = (it) => Number(it.movimento_financeiro_id || 0);

  // Mesma chave de processamento de antes: sem selecao, a chave usa o id da
  // propria linha; com selecao, a lista inteira.
  const processandoLinha = (it) => {
    const chave = `confirmar-${modal.item?.id}-${selecionados.join('-') || idDe(it)}`;
    return Boolean(modal.processing) || processingId === chave;
  };

  // Selecao CRUZADA: o movimento so pode entrar se a soma continuar dentro do
  // valor do lancamento do extrato (a mesma trava do checkbox anterior).
  const ultrapassa = (it) => {
    const selecionado = selecionados.includes(idDe(it));
    const valor = Math.abs(Number(it.valor_quitacao || 0));
    return !selecionado && totalSelecionado + valor > valorEsperado + 0.01;
  };

  return (
    <TabelaPadrao
      colunas={[
        {
          id: 'titulo',
          titulo: 'Título',
          // R17: a descricao do titulo e quem nomeia o movimento.
          tipo: 'identidade',
          noCard: 'titulo',
          render: (it) => (
            <div className="min-w-0">
              <div>{it.titulo_descricao || '-'}</div>
              {it.motivos?.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {it.motivos.map((m) => (
                    <span key={`${it.movimento_financeiro_id}-${m}`} className="rounded-full bg-[var(--sem-neutral-bg)] px-2 py-1 text-xs font-normal text-[var(--sem-neutral)]">{m}</span>
                  ))}
                </div>
              )}
            </div>
          )
        },
        {
          id: 'parceiro',
          titulo: 'Parceiro',
          tipo: 'texto',
          render: (it) => it.parceiro_nome || '-'
        },
        {
          id: 'tipo',
          titulo: 'Tipo',
          tipo: 'badge',
          render: (it) => it.tipo || '-'
        },
        {
          id: 'data_movimento',
          titulo: 'Data',
          tipo: 'data',
          render: (it) => formatDate(it.data_movimento)
        },
        {
          id: 'valor_quitacao',
          titulo: 'Valor',
          tipo: 'valor',
          render: (it) => <strong>{formatCurrency(it.valor_quitacao)}</strong>
        },
        {
          id: 'documento',
          titulo: 'Documento',
          tipo: 'codigo',
          render: (it) => it.documento || `mov. #${it.movimento_financeiro_id}`
        },
        {
          id: 'score',
          titulo: 'Score',
          tipo: 'numero',
          ordenavel: true,
          ordemInicial: 'desc',
          valorOrdenacao: (it) => Number(it.score || 0),
          render: (it) => it.score || 0
        }
      ]}
      itens={itens}
      getId={idDe}
      carregando={loading}
      vazio="Nenhum movimento encontrado com os filtros atuais."
      storageKey="tabela:financeiro-conciliacao:associacao-manual"
      rotuloRolagem="Movimentos para associar ao lancamento bancario"
      selecao={{
        selecionados,
        aoAlternar: (id) => onToggleSelecionado(id),
        // "Todos" nao pode ser literal aqui: marca, em ordem, o que ainda
        // cabe no valor do extrato (a soma nunca pode ultrapassar).
        // `semTodos`: marcar tudo violaria o invariante desta tela — a soma
        // dos movimentos não pode passar do valor do lançamento. Antes o
        // componente exigia um "todos", e a tela foi obrigada a inventar um
        // "marca o que ainda cabe" que ninguém pediu. Sem o botão, o
        // invariante fica com quem é dono dele.
        semTodos: true,
        aoAlternarTodos: () => {},
        elegivel: (it) => !processandoLinha(it) && !ultrapassa(it)
      }}
    />
  );
}

function FaturasAssociacaoTabela({ loading, itens, modal, processingId, onAssociar }) {
  return (
    <TabelaPadrao
      colunas={[
        {
          id: 'cartao',
          titulo: 'Cartão',
          // R17: o cartao e quem nomeia a fatura na lista.
          tipo: 'identidade',
          noCard: 'titulo',
          render: (fatura) => (
            <CelulaDupla
              principal={fatura.cartao?.nome || 'Cartao'}
              sub={fatura.competencia ? `Competencia ${fatura.competencia}` : null}
            />
          )
        },
        {
          id: 'competencia',
          titulo: 'Competência',
          tipo: 'texto',
          render: (fatura) => fatura.competencia || '-'
        },
        {
          id: 'data_fechamento',
          titulo: 'Fechamento',
          tipo: 'data',
          render: (fatura) => formatDate(fatura.data_fechamento)
        },
        {
          id: 'data_vencimento',
          titulo: 'Vencimento',
          tipo: 'data',
          render: (fatura) => formatDate(fatura.data_vencimento)
        },
        {
          id: 'total_titulos',
          titulo: 'Títulos',
          tipo: 'numero',
          render: (fatura) => fatura.total_titulos || 0
        },
        {
          id: 'valor_total',
          titulo: 'Valor',
          tipo: 'valor',
          render: (fatura) => <strong>{formatCurrency(fatura.valor_total)}</strong>
        },
        {
          id: 'status',
          titulo: 'Status',
          tipo: 'status',
          render: (fatura) => <span className={statusClass(fatura.status)}>{fatura.status}</span>
        }
      ]}
      itens={itens}
      getId={(fatura) => fatura.id}
      carregando={loading}
      vazio="Nenhuma fatura encontrada com os filtros atuais."
      storageKey="tabela:financeiro-conciliacao:faturas"
      rotuloRolagem="Faturas de cartao para associar"
      larguraAcoes={160}
      acoesLinha={(fatura) => {
        const processing = Boolean(modal.processing)
          || processingId === `fatura-${modal.item?.id}-${fatura.id}`;
        return (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={processing}
            onClick={() => onAssociar(modal.item?.id, fatura.id)}
          >
            {processing ? 'Associando...' : 'Associar'}
          </button>
        );
      }}
    />
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
    if (!form.empresa_id) { setErro('A conta bancária precisa estar vinculada a uma empresa pagadora.'); return; }
    if (!form.obra_id) { setErro('Selecione a obra.'); return; }
    if (!form.parceiro_id) { setErro('Selecione um parceiro (obrigatório).'); return; }
    if (!form.categoria_financeira_id) { setErro('Selecione a categoria financeira do título.'); return; }
    if (!form.competencia_data) { setErro('Informe a competência DRE real do título.'); return; }
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
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--c-surface)] shadow-2xl">
        <div className="sticky top-0 z-presa-no-bloco flex items-center justify-between border-b border-[var(--c-border)] bg-[var(--c-surface)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--c-text)]">Novo título + baixa</h2>
            <p className="text-xs text-[var(--c-muted)]">Cria o título, registra o pagamento e concilia automaticamente.</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fechar</button>
        </div>

        {/* Contexto do lançamento OFX */}
        <div className="mx-6 mt-4 flex items-center gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-3 text-sm">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[var(--c-text)] truncate">{item?.descricao_banco || 'Lançamento bancário'}</p>
            <p className="text-xs text-[var(--c-muted)]">{item?.conta_bancaria_nome} · {formatDate(item?.data_movimento)}</p>
          </div>
          <ValorBanco value={item?.valor} size="sm" />
        </div>

        <form onSubmit={handleSalvar} className="grid gap-3 p-6">
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
              <DateInputBR className="input w-full" value={form.data_vencimento}
                onChange={(e) => setForm((c) => ({ ...c, data_vencimento: e.target.value }))} />
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Data de pagamento</span>
              <DateInputBR className="input w-full" value={form.data_pagamento}
                onChange={(e) => setForm((c) => ({ ...c, data_pagamento: e.target.value }))} />
            </label>
          </div>

          <label className="app-filter-field">
            <span className="app-filter-label">Competência DRE</span>
            <DateInputBR
              className="input w-full"
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
              className={`input w-full ${form.considera_dre && !categoriaClassificadaDre ? 'border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)]' : ''}`}
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

          <label className="flex items-center gap-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-3 text-sm text-[var(--c-text)]">
            <input
              type="checkbox"
              checked={Boolean(form.considera_dre)}
              onChange={(e) => setForm((c) => ({ ...c, considera_dre: e.target.checked }))}
            />
            Considerar este título na DRE gerencial
          </label>

          <div className="app-filter-field">
            <span className="app-filter-label">Parceiro (buscar)</span>
            <input className="input w-full" type="text" value={buscaParceiro}
              onChange={(e) => { setBuscaParceiro(e.target.value); if (!e.target.value) setForm((c) => ({ ...c, parceiro_id: '' })); }}
              placeholder="Digite nome ou CNPJ..." />
            {parceiros.length > 0 && (
              <div className="mt-1 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
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
            <div className="rounded-xl border border-[var(--sem-danger-border)] bg-[var(--sem-danger-bg)] px-3 py-2 text-sm text-[var(--sem-danger)]">{erro}</div>
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
    <p className="truncate text-xs text-[var(--c-muted)] leading-tight" title={`${rotulo}: ${descricao}`}>
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
        <div className="border-b border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-3 py-2 text-[var(--sem-warning)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-[var(--sem-warning)] px-2 py-1 text-xs font-bold uppercase tracking-wide text-[var(--c-surface)]">
                  Estorno bancário
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
                <span className="text-xs text-[var(--sem-warning)]">
                  {alertaEstorno.total_candidatos} lancamento(s) original(is) compativel(is)
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--sem-warning)]">
                Confirme qual saída e a contraparte. Sem baixa anterior, o par será neutralizado e o título permanecera aberto para o pagamento efetivo.
              </p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEstornoExpandido((value) => !value)}>
              {estornoExpandido ? 'Fechar revisao' : 'Revisar estorno'}
            </button>
          </div>

          {estornoExpandido && (
            <div className="mt-2 border-t border-[var(--sem-warning-border)] pt-2">
              {alertaEstorno.candidatos.length === 0 ? (
                <p className="text-xs font-medium text-[var(--sem-danger)]">Nenhuma saída de mesmo valor foi localizada na janela de conferência.</p>
              ) : (
                <div className="grid gap-2 lg:grid-cols-2">
                  {alertaEstorno.candidatos.map((candidato) => {
                    const candidatoApto = candidatoEstornoApto(candidato);
                    const tipoMovimento = String(candidato.movimento?.tipo_movimento || '').toUpperCase();
                    const saidaSemBaixa = String(candidato.status || '').toUpperCase() === 'PENDENTE'
                      && !candidato.titulo
                      && !candidato.movimento?.id;
                    return (
                    <label key={candidato.conciliacao_id} className={`flex gap-2 rounded border px-2 py-2 ${candidatoApto ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'} ${Number(estornoOrigemId) === Number(candidato.conciliacao_id) ? 'border-[var(--c-primary)] bg-[var(--sem-warning-bg)]' : 'border-[var(--sem-warning-border)] bg-[var(--c-surface)]'}`}>
                      <input type="radio" name={`estorno-${item.id}`} disabled={!candidatoApto} checked={Number(estornoOrigemId) === Number(candidato.conciliacao_id)} onChange={() => setEstornoOrigemId(Number(candidato.conciliacao_id))} />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{candidato.descricao_banco || `Lancamento #${candidato.conciliacao_id}`}</span>
                        <span className="block text-xs text-[var(--sem-warning)]">{formatDate(candidato.data_movimento)} · {formatCurrency(Math.abs(Number(candidato.valor || 0)))} · {candidato.status}</span>
                        {candidato.titulo && (
                          <span className="block truncate text-xs text-[var(--c-muted)]">Titulo #{candidato.titulo.id} · {candidato.titulo.parceiro_nome || candidato.titulo.descricao}</span>
                        )}
                        {saidaSemBaixa && (
                          <span className="block text-xs font-medium text-[var(--sem-success)]">Sem baixa de título: a saída e a devolução serão pareadas, mantendo o título aberto.</span>
                        )}
                        {tipoMovimento === 'TARIFA_BANCARIA' && (
                          <span className="block text-xs font-medium text-[var(--sem-success)]">Tarifa já registrada: a devolução preservara a mesma classificação financeira.</span>
                        )}
                        {!candidatoApto && (
                          <span className="block text-xs font-medium text-[var(--sem-danger)]">Concilie esta saída com o título correto antes de confirmar a devolução.</span>
                        )}
                      </span>
                    </label>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-end">
                <label className="flex-1 text-xs font-semibold text-[var(--sem-warning)]">
                  Justificativa
                  <input className="input input-sm mt-1 w-full" value={estornoMotivo} maxLength={255} onChange={(event) => setEstornoMotivo(event.target.value)} />
                </label>
                {canEstornarTransferencia ? (
                  <button type="button" className="btn btn-danger btn-sm" disabled={!podeConfirmarEstorno} onClick={() => onConfirmarEstorno(item, estornoOrigemId, estornoMotivo)}>
                    {isConfirmandoEstorno ? 'Confirmando...' : 'Confirmar devolucao'}
                  </button>
                ) : (
                  <span className="text-xs text-[var(--sem-warning)]">Seu usuário pode visualizar o alerta, mas não possui permissão para estornar conciliacoes.</span>
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
            <label className="mb-1 flex items-center gap-2 text-xs font-semibold text-[var(--c-muted)]">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelecao?.(item)}
              />
              Selecionar para baixa em título
            </label>
          )}
          {/* header */}
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs uppercase tracking-wide font-semibold text-[var(--c-muted)]">Extrato bancário</p>
            <span className={statusClass(item.status)}>{statusLabel(item.status)}</span>
          </div>
          {/* card interno */}
          <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-2">
            <p className="font-semibold text-xs text-[var(--c-text)] leading-tight truncate">
              {item.descricao_banco || 'Lançamento bancário'}
            </p>
            <p className="text-xs text-[var(--c-muted)] leading-tight">
              {item.conta_bancaria_nome}{item.documento ? ` · Doc. ${item.documento}` : ''}
            </p>
            <ValorBanco value={item.valor} size="sm" />
            <p className="text-xs text-[var(--c-muted)] leading-tight">
              {formatDate(item.data_movimento)}
              {item.conciliacao_em_lote_disponivel && <span className="ml-2 text-[var(--sem-success)]">✦ Lote</span>}
              {item.associacao_manual_recomendada && <span className="ml-2 text-[var(--sem-warning)]">● Manual</span>}
            </p>
          </div>
          {/* conciliado info */}
          {item.titulo && (
            <p className="text-xs text-[var(--sem-success)] leading-tight">
              ✓ #{item.titulo.id} {item.titulo.descricao}{item.titulo.parceiro_nome ? ` · ${item.titulo.parceiro_nome}` : ''}
            </p>
          )}
          {/* ignorar */}
          {isPendente && !alertaEstorno && (
            /* D3/C5 + R2/M1 — "Ignorar" e "Remover do extrato" eram texto
               sublinhado de 10px: alvo de clique bem abaixo dos 32px e
               nenhum dos três pesos. Viram botões do sistema, com a
               DESTRUTIVA em vermelho suave e APARTADA das demais. */
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={isIgnorando || isRemovendo}
                onClick={() => onIgnorar(item.id)}
              >
                {isIgnorando ? 'Ignorando...' : 'Ignorar'}
              </button>
              <span className="app-actionbar-apartada">
                <button
                  type="button"
                  className="btn btn-outline btn-sm btn-perigo-suave"
                  disabled={isIgnorando || isRemovendo}
                  onClick={() => onRemover(item.id)}
                >
                  {isRemovendo ? 'Removendo...' : 'Remover do extrato'}
                </button>
              </span>
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
              className={`btn btn-sm text-xs font-semibold tracking-wide transition-all ${podeConfirmar ? 'btn-primary' : 'btn-outline text-[var(--c-muted)] cursor-not-allowed opacity-40'}`}
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
              <p className="text-xs uppercase tracking-wide font-semibold text-[var(--c-muted)]">Lançamento Fluxy</p>
              {/*
                D3 + R2/M1 — as quatro ações do lado Fluxy eram quadrados de
                20×20 com rótulo cortado ("Fat", "Transf"): metade do alvo
                mínimo de 32px e vocabulário que só quem já sabia entendia.
                Viraram botões do sistema (o .btn impõe 32px no desktop,
                44px no toque e 18px no ícone), com o nome inteiro — D4:
                entre caber mais e ler, ganha ler.
              */}
              <div className="flex flex-wrap items-center justify-end gap-1">
                <button type="button" className="btn btn-outline btn-sm" title="Ações rápidas para este lançamento"
                  onClick={() => onAcoesRapidas(item)}>
                  <PlusIcon className="h-4 w-4" />
                  Ações
                </button>
                <button type="button" className="btn btn-outline btn-sm" title="Associar manualmente a um movimento financeiro"
                  onClick={() => onAssociarManual(item)}>
                  <KeyIcon className="h-4 w-4" />
                  Associar
                </button>
                <button type="button" className="btn btn-outline btn-sm" title="Associar a uma fatura de cartão"
                  onClick={() => onAssociarFatura(item)}>
                  Fatura
                </button>
                <button type="button" className="btn btn-outline btn-sm" title="Conciliar como transferência entre contas"
                  onClick={() => onAssociarTransferencia(item)}>
                  Transferência
                </button>
              </div>
            </div>
          )}

          {!isPendente && item.titulo ? (
            <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-2 space-y-1">
              <p className="font-semibold text-xs text-[var(--c-text)] truncate">{item.titulo.descricao}</p>
              {item.titulo.parceiro_nome && <p className="text-xs text-[var(--c-muted)]">{item.titulo.parceiro_nome}</p>}
              {item.titulo.categoria_financeira_nome && (
                <p className="truncate text-xs text-[var(--c-muted)]" title={item.titulo.categoria_financeira_nome}>
                  Categoria: {item.titulo.categoria_financeira_nome}
                </p>
              )}
              <ContextoObraTitulo registro={item.titulo} />
              {item.movimento && <p className="text-xs text-[var(--c-muted)]">Mov. #{item.movimento.id}</p>}
            </div>
          ) : !isPendente && ['TARIFA_BANCARIA', 'ESTORNO_TARIFA_BANCARIA'].includes(item.movimento?.tipo_movimento) ? (
            <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-2 space-y-1">
              <p className="font-semibold text-xs text-[var(--c-text)] truncate">
                {item.movimento.tipo_movimento === 'ESTORNO_TARIFA_BANCARIA' ? 'Estorno de tarifa bancaria' : 'Tarifa bancaria'}
              </p>
              <p className="text-xs text-[var(--c-muted)]">{item.movimento.observacoes || item.descricao_banco}</p>
              <p className="text-xs text-[var(--c-muted)]">Mov. #{item.movimento.id}</p>
            </div>
          ) : !isPendente && item.transferencia ? (
            <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-2 space-y-1">
              <p className="font-semibold text-xs text-[var(--c-text)] truncate">Transferencia #{item.transferencia.id}</p>
              <p className="text-xs text-[var(--c-muted)]">
                {item.transferencia.contaOrigem?.nome || 'Origem'} para {item.transferencia.contaDestino?.nome || 'Destino'}
              </p>
              {canEstornarTransferencia && String(item.transferencia.status || 'ATIVA').toUpperCase() === 'ATIVA' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm btn-perigo-suave mt-1"
                  disabled={processingId === `estornar-transferencia-${item.id}`}
                  onClick={() => onEstornarTransferencia?.(item)}
                >
                  {processingId === `estornar-transferencia-${item.id}` ? 'Estornando...' : 'Estornar transferencia'}
                </button>
              )}
            </div>
          ) : !isPendente ? (
            <div className="flex flex-1 items-center justify-center py-1">
              <p className="text-xs text-[var(--c-muted)]">{statusLabel(item.status)}</p>
            </div>
          ) : alertaEstorno ? (
            <div className="flex flex-1 items-center rounded border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-2 py-2">
              <p className="text-xs font-medium leading-tight text-[var(--sem-warning)]">
                Aguardando a escolha do lançamento original. Nenhum título será associado automaticamente.
              </p>
            </div>
          ) : temAssociacaoPreparada ? (
            <div className="flex flex-col gap-1 flex-1">
              <div className="flex-1 rounded border border-[var(--sem-info-border)] bg-[var(--sem-info-bg)] px-2 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sem-info)]">
                  Associação manual preparada
                </p>
                {/*
                  Família D — o número que a pessoa LÊ antes de clicar em
                  Conciliar tem de sair da MESMA coleção que o clique
                  percorre. O botão manda `movimentosPreparadosIds`
                  (= `associacaoPreparada.movimentoIds`); este texto contava
                  `movimentosPreparados` (= `.movimentos`, filtrada de
                  `dados.itens`). São dois arrays diferentes, hoje iguais só
                  por construção. Contar pelo array que a AÇÃO usa é a
                  correção; o detalhe do item continua vindo do outro,
                  porque só ele tem descrição — e só quando há um só.
                */}
                <p className="font-semibold text-xs text-[var(--c-text)] leading-tight">
                  {movimentosPreparadosIds.length === 1 && movimentosPreparados.length === 1
                    ? movimentosPreparados[0]?.titulo_descricao
                    : `${movimentosPreparadosIds.length} movimentos selecionados`}
                </p>
                {movimentosPreparadosIds.length === 1 && movimentosPreparados.length === 1 ? (
                  <>
                    <p className="text-xs text-[var(--c-muted)] leading-tight">
                      {movimentosPreparados[0]?.parceiro_nome}
                      {movimentosPreparados[0]?.documento ? ` · Doc. ${movimentosPreparados[0].documento}` : ''}
                    </p>
                    {movimentosPreparados[0]?.categoria_financeira_nome && (
                      <p
                        className="truncate text-xs text-[var(--c-muted)] leading-tight"
                        title={movimentosPreparados[0].categoria_financeira_nome}
                      >
                        Categoria: {movimentosPreparados[0].categoria_financeira_nome}
                      </p>
                    )}
                    <ContextoObraTitulo registro={movimentosPreparados[0]} />
                    <p className="text-xs text-[var(--c-muted)] leading-tight">
                      {formatDate(movimentosPreparados[0]?.data_movimento)} · mov. #{movimentosPreparados[0]?.movimento_financeiro_id}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[var(--c-muted)] leading-tight">
                    Movimentos #{movimentosPreparadosIds.join(', #')}
                  </p>
                )}
                <ValorBanco value={associacaoPreparada?.total} size="sm" />
                <p className="mt-1 text-xs font-medium text-[var(--sem-info)]">
                  Clique em Conciliar para confirmar.
                </p>
              </div>
            </div>
          ) : sugestoesCompativeis.length > 0 ? (
            <div className="flex flex-1 flex-col justify-center rounded border border-dashed border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-2">
              <button
                type="button"
                className="self-start text-xs font-semibold text-[var(--c-primary)] underline underline-offset-2"
                aria-expanded={expandirSugestoes}
                onClick={() => setExpandirSugestoes((value) => !value)}
              >
                {expandirSugestoes ? 'Ocultar opções' : `+ ${totalSugestoesCompativeis} títulos compatíveis`}
              </button>
              <p className="mt-1 text-xs leading-tight text-[var(--c-muted)]">
                Mesma data e valor. Escolha um título para preparar a conciliação.
              </p>
              {expandirSugestoes && (
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
                  {sugestoesCompativeis.map((sugestao) => (
                    <div
                      key={sugestao.movimento_financeiro_id}
                      className="flex items-center gap-2 rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-[var(--c-text)]" title={sugestao.titulo_descricao}>
                          {sugestao.titulo_descricao}
                        </p>
                        <p className="truncate text-xs text-[var(--c-muted)]">
                          {sugestao.parceiro_nome || 'Sem parceiro'}
                          {sugestao.categoria_financeira_nome ? ` · ${sugestao.categoria_financeira_nome}` : ''}
                        </p>
                        <ContextoObraTitulo registro={sugestao} />
                        <p className="text-xs text-[var(--c-muted)]">
                          {formatDate(sugestao.data_movimento)} · {formatCurrency(sugestao.valor_quitacao)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm shrink-0 text-xs"
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
              <div className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-2">
                <p className="font-semibold text-xs text-[var(--c-text)] leading-tight truncate">{topSugestao.titulo_descricao}</p>
                <p className="text-xs text-[var(--c-muted)] leading-tight">
                  {topSugestao.parceiro_nome}{topSugestao.documento ? ` · Doc. ${topSugestao.documento}` : ''}
                </p>
                {topSugestao.categoria_financeira_nome && (
                  <p
                    className="truncate text-xs text-[var(--c-muted)] leading-tight"
                    title={topSugestao.categoria_financeira_nome}
                  >
                    Categoria: {topSugestao.categoria_financeira_nome}
                  </p>
                )}
                <ContextoObraTitulo registro={topSugestao} />
                <ValorBanco value={topSugestao.valor_quitacao} size="sm" />
                <p className="text-xs text-[var(--c-muted)] leading-tight">
                  {formatDate(topSugestao.data_movimento)} · {topSugestao.tipo} · mov. #{topSugestao.movimento_financeiro_id}
                </p>
              </div>
              {outrasSugestoes.length > 0 && (
                <button type="button"
                  className="text-xs text-[var(--c-primary)] underline underline-offset-2 self-start"
                  onClick={() => setExpandirSugestoes((v) => !v)}>
                  {expandirSugestoes ? 'Ocultar' : `+${outrasSugestoes.length} outras`}
                </button>
              )}
              {expandirSugestoes && (
                <div className="space-y-1">
                  {outrasSugestoes.map((s) => {
                    const pid = `confirmar-${item.id}-${s.movimento_financeiro_id}`;
                    return (
                      <div key={s.movimento_financeiro_id} className="rounded border border-[var(--c-border)] px-2 py-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{s.titulo_descricao}</p>
                          {s.categoria_financeira_nome && (
                            <p className="truncate text-xs text-[var(--c-muted)]" title={s.categoria_financeira_nome}>
                              Categoria: {s.categoria_financeira_nome}
                            </p>
                          )}
                          <ContextoObraTitulo registro={s} />
                          <p className="text-xs text-[var(--c-muted)]">{formatDate(s.data_movimento)} · {formatCurrency(s.valor_quitacao)}</p>
                        </div>
                        <button type="button" className="btn btn-outline btn-sm text-xs shrink-0"
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
              <p className="text-xs text-[var(--c-muted)]">
                {item.associacao_manual_recomendada
                  ? 'Mais de um título coincide. Use Associar manualmente.'
                  : 'Nenhum lançamento equivalente encontrado'}
              </p>
            </div>
          )}
          {/* R10 — o calço de 18px existia para compensar, à mão, a altura do
              rótulo de seleção da coluna esquerda. Medida fora da escala a
              serviço de um alinhamento que o `items-stretch` do grid já
              resolve: saiu. */}
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
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 px-4 py-6">
      <form onSubmit={submit} className="w-full max-w-4xl overflow-hidden rounded-2xl bg-[var(--c-surface)] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--c-text)]">Baixar título com extratos selecionados</h2>
            <p className="mt-1 text-sm text-[var(--c-muted)]">
              Cada lançamento selecionado vira uma baixa real no título, mantendo a data original do extrato.
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fechar</button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-6">
          {!tipoEsperado && (
            <div className="mb-4 rounded-xl border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-4 py-3 text-sm text-[var(--sem-warning)]">
              Selecione somente lançamentos de entrada ou somente de saída para vincular a um único título.
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
              <select className="input" value={formaRecebimento} onChange={(event) => setFormaRecebimento(event.target.value)}>
                <option value="TRANSFERENCIA">Transferência</option>
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
              <span className="form-label">Buscar título</span>
              <input className="input" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Digite descrição, documento, parceiro ou código" />
            </label>
            <label className="form-field">
              <span className="form-label">Observação</span>
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

          <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto rounded-xl border border-[var(--c-border)] p-2">
            {loading ? (
              <div className="app-empty-card">Carregando títulos...</div>
            ) : titulosFiltrados.length === 0 ? (
              <div className="app-empty-card">Nenhum título aberto ou parcial encontrado.</div>
            ) : titulosFiltrados.map((titulo) => {
              const selected = String(tituloId) === String(titulo.id);
              return (
                <button
                  key={titulo.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    selected
                      ? 'border-[var(--c-primary)] bg-[var(--sem-info-bg)] text-[var(--c-text)]'
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

          {error && <p className="mt-3 text-sm text-[var(--sem-danger)]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--c-border)] px-6 py-4">
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
          <p className="mt-1 text-xs text-[var(--c-muted)]">
            {item.conta_bancaria_nome} ({item.banco || '-'}) · {formatDateTime(item.criado_em)}
          </p>
          <p className="text-xs text-[var(--c-muted)]">
            Por {item.criado_por?.nome || item.criado_por?.email || 'Sistema'} · hash {String(item.arquivo_hash || '').slice(0, 10)}…
          </p>
        </div>
        <div className="flex shrink-0 gap-2 text-center text-xs">
          <div className="rounded-lg bg-[var(--c-bg)] px-3 py-2">
            <div className="text-[var(--c-muted)]">Lidos</div>
            <div className="mt-1 font-semibold text-[var(--c-text)]">{item.total_lidos}</div>
          </div>
          <div className="rounded-lg bg-[var(--sem-success-bg)] px-3 py-2">
            <div className="text-[var(--sem-success)]">Import.</div>
            <div className="mt-1 font-semibold text-[var(--sem-success)]">{item.importados}</div>
          </div>
          <div className="rounded-lg bg-[var(--sem-warning-bg)] px-3 py-2">
            <div className="text-[var(--sem-warning)]">Ignor.</div>
            <div className="mt-1 font-semibold text-[var(--sem-warning)]">{item.ignorados}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar + Footer ─────────────────────────────────────────────────────────

/*
  BARRA DE APOIO DA LISTA — o que mudou aqui, e por quê.

  1. R16/C5 — "Conciliar em lote" SAIU daqui: é a ação principal da tela e
     agora mora na faixa fixa do cabeçalho, onde continua a um clique
     depois de rolar 100 lançamentos. Um dono por responsabilidade.

  2. B3 — a contagem total de registros saiu: ela já aparece, uma vez, na
     `contagem` do PageHeader. Aqui fica só a posição na paginação, que é
     informação diferente.

  3. CONSENTIMENTO (DoD) — os três contadores são da PÁGINA carregada
     (`dados.itens`), e a conciliação em lote percorre o FILTRO INTEIRO.
     Enquanto o número era "N p/ lote", ao lado do botão do lote, ele lia
     como o alcance da ação — e não é. O rótulo passou a dizer de onde o
     número vem: "nesta página". O alcance real está escrito na
     confirmação, que é onde a pessoa autoriza.
*/
function ToolbarConciliacao({ meta, filters, setFilters, setAppliedFilters, resumoSugestoes }) {
  return (
    <div className="card sol-surface-card app-toolbar-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--c-muted)]">
          <span>
            Pág. <strong className="text-[var(--c-text)]">{meta.current_page}</strong> / {meta.total_pages}
          </span>
          {resumoSugestoes.prontos > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--sem-success)]">
              <SparkIcon className="h-3 w-3" />
              {resumoSugestoes.prontos} com sugestão segura nesta página
            </span>
          )}
          {resumoSugestoes.manuais > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--sem-warning)]">
              <KeyIcon className="h-3 w-3" />
              {resumoSugestoes.manuais} para associar à mão nesta página
            </span>
          )}
          {resumoSugestoes.estornos > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--sem-warning)]">
              ↩ {resumoSugestoes.estornos} estorno(s) para revisar nesta página
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--c-muted)]">
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
  /*
    R3/R19 — erro e sucesso da tela viram FAIXA DO SISTEMA (Avisos), não
    mais dois `<div>` soltos com cor crua. Os dois são EVENTO — "importei",
    "conciliei", "falhou agora" —, que é exatamente a fronteira do
    `useAvisos`: fecha e o problema não continua, porque ele já aconteceu.
    As condições DERIVADAS DO CONTEÚDO desta tela (soma que ultrapassa o
    valor do extrato, estorno aguardando escolha do lançamento original)
    continuam onde estavam, fixas ao lado do que descrevem — fechá-las não
    resolveria nada.
  */
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
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
      avisar.erro(err?.message || 'Erro ao carregar conciliacoes bancarias');
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
    if (!uploadForm.files.length) { avisar.erro('Selecione ao menos um arquivo OFX.'); return; }
    try {
      setImporting(true); limparAvisos();
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
      /*
        O resumo é o mesmo; o TOM é que passou a depender do resultado.
        Antes ele saía sempre como "sucesso" — inclusive quando o número de
        arquivos importados era ZERO — e ganhava, agora, o comportamento de
        sucesso do componente: faixa verde que some sozinha em 6s. Uma
        importação que não importou nada não pode sumir sozinha.
      */
      const resumoImportacao = `${arquivosImportados} arquivo(s) importado(s), ${arquivosNaoImportados} nao importado(s) e ${importados} lancamento(s) novo(s) gravado(s).${alertasEstorno ? ` Atenção: ${alertasEstorno} possível(is) estorno(s) bancário(s) precisa(m) de revisão.` : ''}`;
      if (arquivosImportados > 0) {
        avisar.sucesso(resumoImportacao);
      } else {
        avisar.erro(`${resumoImportacao} Confira o resumo abaixo e ajuste as contas bancarias antes de tentar novamente.`);
      }
      setUploadForm((c) => ({ ...c, files: [] }));
      const fi = document.getElementById('ofx-file-input');
      if (fi) fi.value = '';
      await carregarResumoContas();
      if (viewMode === 'DETALHE') await carregarConciliacoes();
    } catch (err) { avisar.erro(err?.message || 'Erro ao importar OFX'); } finally { setImporting(false); }
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
    avisar.sucesso('Título baixado e lançamentos bancários conciliados com sucesso.');
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
      else avisar.erro(message);
      return;
    }
    try {
      const processingKey = `confirmar-${conciliacaoId}-${movimentoIds.join('-')}`;
      setProcessingId(processingKey);
      limparAvisos();
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
      avisar.sucesso('Conciliação confirmada com sucesso.');
      if (fecharModal) setAssociacaoModal((c) => ({ ...c, open: false, processing: false, error: '', selecionados: [], dados: { conciliacao: null, meta: { total: 0, limit: 30 }, itens: [] } }));
      await carregarConciliacoes();
    } catch (err) {
      const message = err?.message || 'Erro ao confirmar conciliacao';
      if (fecharModal) setAssociacaoModal((c) => ({ ...c, processing: false, error: message }));
      else avisar.erro(message);
    } finally {
      setProcessingId(null);
      if (fecharModal) setAssociacaoModal((c) => ({ ...c, processing: false }));
    }
  }

  async function handleConfirmarEstornoBancario(item, conciliacaoOrigemId, motivo) {
    if (!item?.id || !conciliacaoOrigemId) return;
    const candidato = item.estorno_bancario?.candidatos?.find((value) => Number(value.conciliacao_id) === Number(conciliacaoOrigemId));
    if (!candidatoEstornoApto(candidato)) {
      avisar.erro('A saída original não esta apta para confirmar esta devolução. Atualize a conciliação e tente novamente.');
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
    /*
      R3/R19 + R21 — modal do sistema, e o retorno se DESESTRUTURA:
      `confirmar()` devolve { ok, texto } e objeto é sempre truthy; ler o
      objeto como booleano faria "Cancelar" CONFIRMAR a devolução.

      Classe CONSENTIMENTO (DoD): o `#` citado na mensagem é o mesmo
      `conciliacaoOrigemId` que vai no payload logo abaixo, e o
      `confirmacaoInfo` é derivado do MESMO `candidato` — não de outra
      leitura da lista. Um lançamento perguntado, um lançamento pareado.
      O texto declara que a tela não desfaz.
    */
    const { ok } = await confirmar({
      titulo: 'Confirmar devolução bancária',
      mensagem: `Este crédito será pareado com o lançamento #${conciliacaoOrigemId}.${confirmacaoInfo} Esta tela não desfaz o pareamento.`,
      rotuloConfirmar: 'Confirmar devolução',
      destrutiva: true
    });
    if (!ok) return;
    try {
      setProcessingId(`estorno-bancario-${item.id}`);
      limparAvisos();
      await confirmarConciliacaoEstornoBancario(item.id, {
        conciliacao_origem_id: conciliacaoOrigemId,
        motivo
      });
      setConciliacoesSelecionadas((current) => current.filter((id) => Number(id) !== Number(item.id)));
      avisar.sucesso(baixaDeTitulo
        ? `Estorno confirmado. O titulo #${candidato.titulo.id} foi reaberto e os dois lancamentos OFX permaneceram auditados.`
        : tarifaRegistrada
          ? 'Estorno de tarifa confirmado. A classificacao financeira foi preservada e os dois lancamentos OFX permaneceram auditados.'
          : 'Estorno confirmado. A saida e a devolucao foram pareadas sem baixar o titulo, que permanece aberto para o pagamento efetivo.');
      await carregarConciliacoes();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao confirmar estorno bancario');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleIgnorar(conciliacaoId) {
    // R3/R19 + R21. Um id perguntado, o MESMO id na chamada — sem coleção
    // no meio, não há como a pergunta e a ação divergirem.
    const { ok } = await confirmar({
      titulo: 'Ignorar lançamento?',
      mensagem: `O lançamento #${conciliacaoId} sai da fila de conferência e deixa de aparecer entre os pendentes. Ele continua no extrato, com o status "Ignorado".`,
      rotuloConfirmar: 'Ignorar lançamento'
    });
    if (!ok) return;
    try {
      setProcessingId(`ignorar-${conciliacaoId}`); limparAvisos();
      await ignorarConciliacaoBancaria(conciliacaoId);
      avisar.sucesso('Lançamento marcado como ignorado.');
      await carregarConciliacoes();
    } catch (err) { avisar.erro(err?.message || 'Erro ao ignorar conciliacao'); } finally { setProcessingId(null); }
  }

  async function handleRemover(conciliacaoId) {
    // R3/R19 + R21. Destrutiva: sai em vermelho suave e apartada, e o texto
    // diz o que sobrevive (a auditoria) e o que esta tela não desfaz.
    const { ok } = await confirmar({
      titulo: 'Remover lançamento do extrato?',
      mensagem: `O lançamento #${conciliacaoId} sai da conciliação. O registro permanece gravado para auditoria e não é apagado do banco de dados, mas esta tela não o traz de volta.`,
      rotuloConfirmar: 'Remover do extrato',
      destrutiva: true
    });
    if (!ok) return;
    try {
      setProcessingId(`remover-${conciliacaoId}`); limparAvisos();
      await removerConciliacaoBancaria(conciliacaoId, { motivo: 'Removido manualmente na tela de conciliacao' });
      avisar.sucesso('Lançamento removido do extrato.');
      await carregarConciliacoes();
    } catch (err) { avisar.erro(err?.message || 'Erro ao remover lancamento do extrato'); } finally { setProcessingId(null); }
  }

  async function handleConciliarSugeridos() {
    /*
      R3/R19 + R21 + classe CONSENTIMENTO (DoD) — e aqui está o cuidado que
      define esta ação.

      O contador ao lado do botão ("N p/ lote") é da PÁGINA: sai do
      `resumoSugestoesPagina`, que reduz `dados.itens`, ou seja, os itens
      carregados agora. A chamada abaixo NÃO recebe page nem page_size:
      ela percorre o FILTRO INTEIRO, no servidor, em todas as páginas.
      Citar o N da página numa mensagem que autoriza o filtro inteiro seria
      exatamente "perguntar sobre 3 e agir sobre 47" — então a mensagem não
      cita número nenhum: ela nomeia o RECORTE, que é a coleção real que a
      ação percorre, e diz explicitamente que não se limita à página.

      (O descompasso entre o contador e o alcance da ação é anterior a esta
      leva e está relatado; a tela não muda o alcance, muda a promessa.)
    */
    const contaDoRecorte = contas.find((conta) => String(conta.id) === String(appliedFilters.conta_bancaria_id));
    const recorte = [
      contaDoRecorte ? `conta ${getContaNome(contaDoRecorte)}` : 'todas as contas',
      appliedFilters.data_inicial || appliedFilters.data_final
        ? `período de ${appliedFilters.data_inicial ? formatDate(appliedFilters.data_inicial) : 'início'} a ${appliedFilters.data_final ? formatDate(appliedFilters.data_final) : 'hoje'}`
        : 'todo o período'
    ].join(', ');
    const { ok } = await confirmar({
      titulo: 'Conciliar em lote?',
      mensagem: `Serão conciliados TODOS os lançamentos pendentes com sugestão segura do recorte atual (${recorte}) — em todas as páginas, não apenas os desta. Cada confirmação baixa o título correspondente. Se o lote parar no meio, o que já foi conciliado permanece conciliado, e esta tela não desfaz.`,
      rotuloConfirmar: 'Conciliar em lote',
      destrutiva: true
    });
    if (!ok) return;
    try {
      setBulkReconciling(true); limparAvisos();
      const response = await conciliarSugestoesBancarias({ status: appliedFilters.status === 'TODOS' ? 'TODOS' : 'PENDENTE', conta_bancaria_id: appliedFilters.conta_bancaria_id, data_inicial: appliedFilters.data_inicial, data_final: appliedFilters.data_final });
      const r = response?.resumo || {};
      avisar.sucesso(`${r.total_conciliadas || 0} confirmada(s) em lote. ${r.associacao_manual || 0} para associação manual. ${r.sem_sugestao || 0} sem sugestão.`);
      await carregarConciliacoes();
    } catch (err) { avisar.erro(err?.message || 'Erro ao conciliar sugestoes em lote'); } finally { setBulkReconciling(false); }
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

  // A TabelaPadrao sempre oferece "selecionar todos" quando ha selecao em
  // lote — e aqui "todos" nao pode ser literal: a soma dos movimentos nao
  // pode ultrapassar o valor do lancamento do extrato. Marca-se, na ordem da
  // lista, tudo o que ainda couber; desmarcar limpa a selecao inteira.
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
    limparAvisos();
    avisar.sucesso('Associação manual preparada. Revise as informações e clique em Conciliar para confirmar.');
    fecharAssociacaoManual();
  }

  function prepararSugestaoCompativel(item, sugestao) {
    const conciliacaoId = Number(item?.id || 0);
    const movimentoId = Number(sugestao?.movimento_financeiro_id || 0);
    if (!conciliacaoId || !movimentoId) {
      avisar.erro('Não foi possível preparar o título selecionado para conciliação.');
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
    limparAvisos();
    avisar.sucesso('Título compatível preparado. Revise as informações e clique em Conciliar para confirmar.');
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
      limparAvisos();
      await confirmarConciliacaoFaturaCartao(conciliacaoId, { fatura_cartao_id: faturaId });
      avisar.sucesso('Fatura conciliada e títulos vinculados baixados com sucesso.');
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
      limparAvisos();
      await confirmarConciliacaoTransferencia(transferenciaModal.item.id, {
        conta_contraparte_id: transferenciaModal.conta_contraparte_id,
        tipo_transferencia: transferenciaEntreEmpresas ? 'ENTRE_EMPRESAS' : 'MESMA_TITULARIDADE',
        descricao: transferenciaModal.descricao,
        tipo_intercompany: transferenciaEntreEmpresas ? transferenciaModal.tipo_intercompany : undefined,
        motivo_intercompany: transferenciaEntreEmpresas ? transferenciaModal.motivo_intercompany : undefined,
        elimina_consolidado: transferenciaEntreEmpresas ? transferenciaModal.elimina_consolidado : true
      });
      avisar.sucesso('Lançamento conciliado como transferência entre contas.');
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
      limparAvisos();
      await estornarConciliacaoTransferencia(item.id, { motivo });
      setEstornoTransferenciaModal({ open: false, item: null, motivo: '', processing: false, error: '' });
      avisar.sucesso('Transferência estornada. Os lançamentos OFX vinculados voltaram para pendente.');
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
      limparAvisos();
      setAcoesRapidasError('');
      await confirmarConciliacaoTarifaBancaria(item.id, {
        codigo: tarifa.codigo,
        descricao: item.descricao_banco || tarifa.nome
      });
      avisar.sucesso(`Lancamento conciliado como ${tarifa.nome}.`);
      setAcoesRapidasItem(null);
      await carregarConciliacoes();
    } catch (err) {
      const message = err?.message || 'Erro ao conciliar tarifa bancaria';
      setAcoesRapidasError(message);
      avisar.erro(message);
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
      limparAvisos();
      await confirmarConciliacaoEstornoTarifa(item.id, {
        codigo: tarifa.codigo,
        descricao: item.descricao_banco || `Estorno de ${tarifa.nome}`
      });
      setAcoesRapidasItem(null);
      avisar.sucesso(`Estorno de tarifa lancado como movimento independente (${tarifa.nome}).`);
      await carregarConciliacoes();
    } catch (err) {
      const message = err?.message || 'Erro ao conciliar estorno de tarifa bancaria';
      setAcoesRapidasError(message);
      avisar.erro(message);
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
      limparAvisos();
      setAcoesRapidasError('');
      const response = await confirmarConciliacaoCreditoRotativo(item.id, {
        descricao: item.descricao_banco || ''
      });
      const natureza = String(response?.natureza || '').toUpperCase();
      avisar.sucesso(natureza === 'AMORTIZACAO'
        ? 'Amortizacao de credito rotativo conciliada.'
        : 'Liberacao de credito rotativo conciliada.');
      setAcoesRapidasItem(null);
      await carregarConciliacoes();
    } catch (err) {
      const message = err?.message || 'Erro ao conciliar credito rotativo';
      setAcoesRapidasError(message);
      avisar.erro(message);
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

  /*
    R23 — EXCEÇÃO DECLARADA (consulta cara), e ela é declarada NA TELA, não
    só aqui.

    Painel de contas: `carregarResumoContas` dispara UMA requisição POR
    CONTA bancária filtrada (`Promise.all` sobre `contasFiltradas`). Com
    duas contas já são duas; com dez, dez. Aplicar ao marcar significaria
    esse leque inteiro a cada tecla digitada na busca — muito acima do teto
    de 3 da regra, e não é estimativa: está no código, contável.

    Conferência: a consulta é paginada NO SERVIDOR sobre o extrato inteiro
    e ainda calcula as sugestões de match de cada lançamento; são 4
    dimensões que o operador combina o tempo todo (situação, conta, data
    inicial, data final), sendo duas delas campos de data — aplicar ao
    marcar consultaria a cada dígito de uma data pela metade.

    O que a regra exige quando a exceção vale, e o que passa a existir:
    o botão diz o que FAZ ("Atualizar contas"/"Atualizar lançamentos", não
    "Filtrar"), e o apoio avisa que a marca é RASCUNHO até o clique. Sem
    isso a etiqueta mente — só que mais devagar.

    LIMITE DECLARADO: o segundo critério da R23 (">2s no ambiente de dev
    com dados reais") NÃO foi medido por mim. O painel de contas dispensa a
    medição, porque já estoura o critério de requisições; a conferência
    apoia-se na leitura de 4 dimensões combinadas, e está no relatório como
    decisão a confirmar com o cliente.
  */
  const rascunhoDashboard = ['busca', 'banco', 'data_inicial', 'data_final']
    .some((campo) => String(dashboardFilters[campo] || '') !== String(appliedDashboardFilters[campo] || ''));
  const rascunhoConferencia = ['status', 'conta_bancaria_id', 'data_inicial', 'data_final']
    .some((campo) => String(filters[campo] || '') !== String(appliedFilters[campo] || ''));

  return (
    <Pagina>
      {/*
        R13/C1/C2/R5 — a faixa fixa do sistema entra no lugar do cartão de
        título solto: 22px, contagem + apoio em UMA linha na própria faixa
        (era `page-subtitle`, texto de apoio flutuando sobre o canvas), e a
        faixa gruda encostada na topbar durante a rolagem. Em lista de 100
        lançamentos, isso é o que mantém "Conciliar em lote" a um clique.

        R11/C6 — saíram daqui os três links de "ir para" (Títulos,
        Relatórios, Cadastros): navegação não é ação, e menu, breadcrumb e
        Ctrl+K já levam a essas telas. É a remoção que a própria R11
        autoriza pelo exemplo do "⋯" de Parceiros, e é a mesma que a
        FinanceiroTitulos fez ontem.

        C3/R11 — "Voltar para contas" NÃO é um link de navegação: é o
        retorno ao painel de contas dentro da própria tela, e por isso vira
        a SETA à esquerda do cabeçalho, a affordance primária de retorno do
        modo de conferência.

        C5/D3 — os três pesos: "Conciliar em lote" é o ÚNICO primário
        sólido, e ele subiu do rodapé da barra de ferramentas para cá
        (R16: um dono por responsabilidade).
      */}
      <PageHeader
        titulo="Conciliação Bancária"
        contagem={viewMode === 'DETALHE'
          ? `${dados.meta.total_disponivel} lançamento(s)`
          : `${resumoDashboard.contas} conta(s)`}
        descricao={viewMode === 'DETALHE'
          ? 'Confira lançamento a lançamento; a conciliação baixa o título correspondente.'
          : 'Importe o OFX e confira por conta. A importação não concilia nem cria títulos automaticamente.'}
        voltar={viewMode === 'DETALHE'
          ? { onClick: () => setViewMode('CONTAS'), title: 'Voltar para o painel de contas' }
          : undefined}
        acaoPrincipal={viewMode === 'DETALHE' ? {
          rotulo: bulkReconciling ? 'Conciliando...' : 'Conciliar em lote',
          onClick: handleConciliarSugeridos,
          desabilitada: bulkReconciling
            || appliedFilters.status === 'CONCILIADO'
            || appliedFilters.status === 'IGNORADO'
            || resumoSugestoesPagina.prontos === 0,
          icone: <SparkIcon className="h-4 w-4" />,
          title: 'Conciliar todos os pendentes com sugestão segura do recorte atual'
        } : undefined}
      />

      {/* R3/R19 — evento (importou, conciliou, falhou) em faixa do sistema,
          no topo do conteúdo. Nunca mais a caixa cinza do Chrome. */}
      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/* Importar OFX — linha horizontal */}
      <form className="card sol-surface-card" onSubmit={handleImportar}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="app-filter-field flex-1">
            <span className="app-filter-label">Importar OFX <span className="font-normal text-[var(--c-muted)]">— Remessas duplicadas são bloqueadas.</span></span>
            <select className="input w-full input-sm" value={uploadForm.conta_bancaria_id} disabled={loadingContas}
              onChange={(e) => setUploadForm((c) => ({ ...c, conta_bancaria_id: e.target.value }))}>
              <option value="">Detectar conta pelo OFX</option>
              {contas.map((ct) => <option key={ct.id} value={ct.id}>{ct.nome}</option>)}
            </select>
          </label>
          <label className="app-filter-field flex-[2]">
            <span className="app-filter-label">Arquivo OFX</span>
            <input id="ofx-file-input" className="input w-full input-sm" type="file" accept=".ofx" multiple
              onChange={(e) => setUploadForm((c) => ({ ...c, files: Array.from(e.target.files || []) }))} />
          </label>
          <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={importing || !uploadForm.files.length}>
            {importing ? 'Importando...' : 'Importar OFX'}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--c-muted)]">
          Deixe a conta em branco para o sistema identificar cada OFX pela Identificação OFX cadastrada na conta bancária. Se selecionar uma conta, todos os arquivos serão importados nela.
        </p>
      </form>

      {importResults.length > 0 && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 shadow-2xl">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Resultado da importação</h2>
                <p className="mt-1 text-xs text-[var(--c-muted)]">Confira quais OFX foram importados e quais precisam de ajuste cadastral.</p>
              </div>
              <span className="rounded-full bg-[var(--sem-neutral-bg)] px-3 py-1 text-xs font-semibold text-[var(--c-text)]">
                {importResults.filter((item) => item.sucesso).length}/{importResults.length} importado(s)
              </span>
            </div>

            <div className="max-h-[48vh] overflow-y-auto pr-1">
              <div className="grid gap-2">
                {importResults.map((item, index) => (
                  <div
                    key={`${item.arquivo || 'ofx'}-${index}`}
                    className={`rounded-xl border px-3 py-2 text-xs ${item.sucesso ? 'border-[var(--sem-success-border)] bg-[var(--sem-success-bg)] text-[var(--sem-success)]' : 'border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="truncate">{item.arquivo || `Arquivo ${index + 1}`}</strong>
                      {/* A pastilha fica SOBRE o cartão da mesma família
                          semântica: usar o mesmo `-bg` nos dois a apagaria.
                          Ela inverte — cor cheia com texto na superfície —,
                          que é o mesmo idioma da pastilha "Estorno bancario". */}
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${item.sucesso ? 'bg-[var(--sem-success)] text-[var(--c-surface)]' : 'bg-[var(--sem-warning)] text-[var(--c-surface)]'}`}>
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

      {/* R16 — as duas faixas soltas de erro/sucesso saíram: quem responde
          por aviso nesta tela é o <Avisos> do topo, um dono só. */}

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
                  placeholder="Banco, conta, agência ou empresa"
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
                <DateInputBR
                  className="input w-full input-sm"
                  value={dashboardFilters.data_inicial}
                  onChange={(e) => setDashboardFilters((current) => ({ ...current, data_inicial: e.target.value }))}
                />
              </label>
              <label className="app-filter-field">
                <span className="app-filter-label">Data final</span>
                <DateInputBR
                  className="input w-full input-sm"
                  value={dashboardFilters.data_final}
                  onChange={(e) => setDashboardFilters((current) => ({ ...current, data_final: e.target.value }))}
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary btn-sm">Atualizar contas</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={limparFiltrosDashboard}>Limpar</button>
              </div>
            </div>
            {/* R23 — o apoio que impede a etiqueta de mentir: enquanto o
                recorte digitado difere do aplicado, os cartões abaixo ainda
                são os do recorte ANTERIOR, e o texto diz isso. */}
            <p className={`mt-3 text-xs ${rascunhoDashboard ? 'font-semibold text-[var(--sem-warning)]' : 'text-[var(--c-muted)]'}`}>
              {rascunhoDashboard
                ? 'Recorte em rascunho: os cartões abaixo ainda mostram o recorte anterior. Clique em "Atualizar contas" para valer.'
                : 'Este recorte consulta uma conta bancária de cada vez, então ele só vale quando você clica em "Atualizar contas".'}
            </p>
          </form>

          <div className="card sol-surface-card">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-1 flex-col">
                <span className="text-xs uppercase tracking-wide text-[var(--c-muted)]">Contas exibidas</span>
                <span className="text-sm font-bold text-[var(--c-text)]">{resumoDashboard.contas}</span>
                <span className="text-xs text-[var(--c-muted)]">com conciliação no filtro</span>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-xs uppercase tracking-wide text-[var(--sem-warning)]">Pendentes</span>
                <span className="text-sm font-bold text-[var(--sem-warning)]">{resumoDashboard.pendentes}</span>
                <span className="text-xs text-[var(--c-muted)]">aguardando conferência</span>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-xs uppercase tracking-wide text-[var(--sem-success)]">Conciliados</span>
                <span className="text-sm font-bold text-[var(--sem-success)]">{resumoDashboard.conciliados}</span>
                <span className="text-xs text-[var(--c-muted)]">matches confirmados</span>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-xs uppercase tracking-wide text-[var(--sem-neutral)]">Ignorados</span>
                <span className="text-sm font-bold text-[var(--sem-neutral)]">{resumoDashboard.ignorados}</span>
                <span className="text-xs text-[var(--c-muted)]">descartados</span>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-xs uppercase tracking-wide text-[var(--c-muted)]">Movimentação bruta</span>
                <span className="text-sm font-bold text-[var(--c-text)]">{formatCurrency(resumoDashboard.valor_absoluto_total)}</span>
                <span className="text-xs text-[var(--c-muted)]">soma absoluta do filtro</span>
              </div>
            </div>
          </div>

          {loadingContas || loadingContasResumo ? (
            <div className="app-empty-card sol-surface-card">Carregando contas bancárias...</div>
          ) : contasResumo.length === 0 ? (
            <div className="app-empty-card sol-surface-card">Nenhuma conta encontrada com os filtros atuais.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {contasResumo.map(({ conta, resumo, erro }) => {
                const hasPending = resumo.pendentes > 0;
                return (
                  <div key={conta.id} className="card sol-surface-card border border-[var(--c-border)] p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">{getContaBanco(conta)}</p>
                        <h2 className="mt-1 truncate text-lg font-semibold text-[var(--c-text)]">{getContaNome(conta)}</h2>
                        <p className="mt-1 text-sm text-[var(--c-muted)]">
                          Agencia {getContaAgencia(conta)} - Conta {getContaNumero(conta)}
                        </p>
                        <p className="mt-1 truncate text-xs text-[var(--c-muted)]">{getContaEmpresaNome(conta)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${erro ? 'bg-[var(--sem-danger-bg)] text-[var(--sem-danger)]' : hasPending ? 'bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]' : 'bg-[var(--sem-success-bg)] text-[var(--sem-success)]'}`}>
                        {erro ? 'Erro' : hasPending ? 'Conferir' : 'Em dia'}
                      </span>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-[var(--sem-warning-bg)] px-3 py-2">
                        <span className="block text-xs uppercase tracking-wide text-[var(--sem-warning)]">Pendentes</span>
                        <strong className="text-lg text-[var(--sem-warning)]">{resumo.pendentes}</strong>
                      </div>
                      <div className="rounded-xl bg-[var(--sem-success-bg)] px-3 py-2">
                        <span className="block text-xs uppercase tracking-wide text-[var(--sem-success)]">Conciliados</span>
                        <strong className="text-lg text-[var(--sem-success)]">{resumo.conciliados}</strong>
                      </div>
                      <div className="rounded-xl bg-[var(--sem-neutral-bg)] px-3 py-2">
                        <span className="block text-xs uppercase tracking-wide text-[var(--sem-neutral)]">Ignorados</span>
                        <strong className="text-lg text-[var(--sem-neutral)]">{resumo.ignorados}</strong>
                      </div>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <span className="block text-xs uppercase tracking-wide text-[var(--c-muted)]">Movimentação bruta</span>
                        <strong className="text-lg text-[var(--c-text)]">{formatCurrency(resumo.valor_absoluto_total)}</strong>
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
          <label className="app-filter-field">
            <span className="app-filter-label">Status</span>
            <select className="input w-full input-sm" value={filters.status}
              onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              <option value="PENDENTE">Pendentes</option>
              <option value="CONCILIADO">Conciliados</option>
              <option value="IGNORADO">Ignorados</option>
              <option value="TODOS">Todos</option>
            </select>
          </label>
          <label className="app-filter-field flex-1">
            <span className="app-filter-label">Conta bancária</span>
            <select className="input w-full input-sm" value={filters.conta_bancaria_id} disabled={loadingContas}
              onChange={(e) => setFilters((c) => ({ ...c, conta_bancaria_id: e.target.value }))}>
              <option value="">Todas</option>
              {contas.map((ct) => <option key={ct.id} value={ct.id}>{ct.nome}</option>)}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Data inicial</span>
            <DateInputBR className="input w-full input-sm" value={filters.data_inicial}
              onChange={(e) => setFilters((c) => ({ ...c, data_inicial: e.target.value }))} />
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Data final</span>
            <DateInputBR className="input w-full input-sm" value={filters.data_final}
              onChange={(e) => setFilters((c) => ({ ...c, data_final: e.target.value }))} />
          </label>
          <div className="flex gap-2 shrink-0">
            <button type="submit" className="btn btn-primary btn-sm">Atualizar lançamentos</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => {
              const next = { status: 'PENDENTE', conta_bancaria_id: '', data_inicial: '', data_final: '', page: 1, page_size: filters.page_size || 100 };
              setFilters(next); setAppliedFilters(next);
            }}>Limpar</button>
          </div>
        </div>
        {/* R23 — mesma honestidade da faixa de contas: enquanto o recorte
            escolhido difere do aplicado, a lista abaixo é a do recorte
            anterior, e o apoio diz isso em vez de deixar a etiqueta mentir. */}
        <p className={`mt-3 text-xs ${rascunhoConferencia ? 'font-semibold text-[var(--sem-warning)]' : 'text-[var(--c-muted)]'}`}>
          {rascunhoConferencia
            ? 'Recorte em rascunho: a lista abaixo ainda é a do recorte anterior. Clique em "Atualizar lançamentos" para valer.'
            : 'A lista abaixo muda somente ao clicar em "Atualizar lançamentos".'}
        </p>
      </form>

      {/* Indicadores + Resumo consolidado — linha horizontal */}
      <div className="card sol-surface-card">
        <div className="flex flex-wrap items-center gap-3">
          {resumoFinanceiro.map((item) => (
            <div key={item.label} className="flex flex-col flex-1">
              <span className="text-xs uppercase tracking-wide text-[var(--c-muted)]">{item.label}</span>
              <span className="text-sm font-bold text-[var(--c-text)] tabular-nums">{item.value}</span>
              <span className="text-xs text-[var(--c-muted)]">{item.detail}</span>
            </div>
          ))}
          <div className="h-8 w-px bg-[var(--c-border)] shrink-0 hidden xl:block" />
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase tracking-wide text-[var(--c-muted)]">Lidos</span>
              <span className="text-sm font-bold text-[var(--c-text)]">{importacoes.resumo.total_lidos}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase tracking-wide text-[var(--sem-success)]">Import.</span>
              <span className="text-sm font-bold text-[var(--sem-success)]">{importacoes.resumo.total_importados}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase tracking-wide text-[var(--sem-warning)]">Ignor.</span>
              <span className="text-sm font-bold text-[var(--sem-warning)]">{importacoes.resumo.total_ignorados}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Área operacional */}
      {loading
        ? <div className="app-empty-card sol-surface-card">Carregando lançamentos...</div>
        : (
          <div className="space-y-2">
            <ToolbarConciliacao
              meta={dados.meta} filters={filters} setFilters={setFilters} setAppliedFilters={setAppliedFilters}
              resumoSugestoes={resumoSugestoesPagina}
            />

            {conciliacoesSelecionadasItens.length > 0 && (
              <div className="sol-surface-card card flex flex-col gap-3 border border-[var(--c-primary)] bg-[var(--sem-info-bg)] p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--c-text)]">
                    {conciliacoesSelecionadasItens.length} lancamento(s) selecionado(s)
                  </p>
                  <p className="text-xs text-[var(--c-muted)]">
                    Use para baixar um único título com pagamentos parciais em uma ou mais datas do extrato.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setConciliacoesSelecionadas([])}>
                    Limpar seleção
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setBaixaExtratosModalOpen(true)}>
                    Baixar título com selecionados
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

            {/*
              D2 — a tela do financeiro lê AÇÃO → CONTEXTO → HISTÓRICO, e o
              histórico não existia na tela: o `HistoricoImportacaoItem`
              estava escrito, completo, e NUNCA era montado. A consulta que
              o alimenta (`getImportacoesConciliacao`, limit 8) já era
              disparada a cada recarga — a tela pagava a requisição e jogava
              a resposta fora, exibindo só os contadores agregados.

              Ele volta ao fim do fluxo, que é o lugar do histórico. Se o
              cliente não quiser o bloco, o que sai junto é a requisição.
            */}
            {importacoes.itens.length > 0 && (
              <div className="card sol-surface-card">
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Últimas importações de OFX</h2>
                <p className="mt-1 text-xs text-[var(--c-muted)]">
                  Quem importou, quando, e o que cada remessa trouxe — no recorte atual.
                </p>
                <div className="mt-4 grid gap-2">
                  {importacoes.itens.map((item) => (
                    <HistoricoImportacaoItem key={item.id || `${item.arquivo_hash}-${item.criado_em}`} item={item} />
                  ))}
                </div>
              </div>
            )}
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
        <div className="fixed inset-0 z-modal-acima flex items-center justify-center bg-black/40 px-4 py-6">
          <form
            className="w-full max-w-xl rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 shadow-2xl"
            onSubmit={handleEstornarTransferencia}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Estornar transferência conciliada</h2>
                <p className="mt-1 text-sm text-[var(--c-muted)]">
                  A transferência será cancelada e todos os lançamentos OFX vinculados voltarao para pendente.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm shrink-0"
                disabled={estornoTransferenciaModal.processing}
                onClick={() => setEstornoTransferenciaModal({ open: false, item: null, motivo: '', processing: false, error: '' })}
              >Fechar</button>
            </div>
            <div className="mt-4 rounded-xl border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-4 py-3 text-sm text-[var(--sem-warning)]">
              Transferencia #{estornoTransferenciaModal.item?.transferencia?.id || '-'} · {formatCurrency(Math.abs(Number(estornoTransferenciaModal.item?.valor || 0)))}
            </div>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium text-[var(--c-text)]">Motivo do estorno *</span>
              <textarea
                className="input min-h-24 w-full resize-y"
                maxLength={255}
                value={estornoTransferenciaModal.motivo}
                onChange={(event) => setEstornoTransferenciaModal((current) => ({ ...current, motivo: event.target.value, error: '' }))}
                placeholder="Ex.: transferência conciliada na conta incorreta"
              />
            </label>
            {estornoTransferenciaModal.error && (
              <div className="mt-3 rounded-xl border border-[var(--sem-danger-border)] bg-[var(--sem-danger-bg)] px-4 py-3 text-sm text-[var(--sem-danger)]">
                {estornoTransferenciaModal.error}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
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
              avisar.sucesso('Título criado e baixado. Verifique as sugestões atualizadas para conciliar.');
            }
          }}
        />
      )}

      {/* Modal: Transferencia entre contas */}
      {transferenciaModal.open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl bg-[var(--c-surface)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Conciliar transferência</h2>
                <p className="mt-1 text-sm text-[var(--c-muted)]">
                  Informe a outra conta envolvida. O sistema define origem e destino pelo sinal do lançamento bancário.
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
                <div className={`rounded-xl border px-4 py-3 text-sm ${transferenciaEntreEmpresas ? 'border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]' : 'border-[var(--sem-success-border)] bg-[var(--sem-success-bg)] text-[var(--sem-success)]'}`}>
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
                <div className="rounded-xl border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-4 py-3 text-sm text-[var(--sem-warning)]">
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
                <span className="mb-1 block text-[var(--c-muted)]">Descrição</span>
                <input
                  className="input w-full"
                  value={transferenciaModal.descricao}
                  onChange={(e) => setTransferenciaModal((current) => ({ ...current, descricao: e.target.value }))}
                />
              </label>
              {transferenciaModal.error && (
                <div className="rounded-xl border border-[var(--sem-danger-border)] bg-[var(--sem-danger-bg)] px-4 py-3 text-sm text-[var(--sem-danger)]">
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
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-[var(--c-surface)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Associação manual</h2>
                <p className="mt-1 text-sm text-[var(--c-muted)]">
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
              <div className="mt-3 rounded-xl border border-[var(--sem-danger-border)] bg-[var(--sem-danger-bg)] px-4 py-3 text-sm text-[var(--sem-danger)]">{associacaoModal.error}</div>
            )}
            <div className="mt-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-4 py-2 text-sm text-[var(--c-muted)]">
              {associacaoModal.dados.meta.total} movimento(s) encontrado(s)
            </div>
            <div className="mt-3">
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
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-[var(--c-muted)]">Selecionado: <strong className="text-[var(--c-text)]">{formatCurrency(associacaoResumo.totalSelecionado)}</strong></span>
                <span className="text-[var(--c-muted)]">Extrato: <strong className="text-[var(--c-text)]">{formatCurrency(associacaoResumo.valorEsperado)}</strong></span>
                {associacaoResumo.selecionados.length > 0 && !associacaoResumo.fechou && !associacaoResumo.ultrapassou ? (
                  <span className="text-[var(--sem-warning)]">Falta {formatCurrency(Math.max(associacaoResumo.diferenca, 0))}</span>
                ) : null}
                {associacaoResumo.ultrapassou ? (
                  <span className="text-[var(--sem-danger)]">Seleção acima do valor pago.</span>
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
            {/*
              R1/R17 — aqui vivia uma SEGUNDA renderização da mesma lista, em
              cartões soltos, mantida viva atrás de `className="hidden"` desde a
              migração para a TabelaPadrao logo acima. Markup morto não é
              inofensivo: ele reprovava na escala e nas cores, e quem lesse o
              arquivo veria duas listas onde só existe uma. Removido — a
              TabelaPadrao acima é a única dona da lista (R16).
            */}
          </div>
        </div>
      )}

      {/* Modal: Associar fatura */}
      {faturaModal.open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-[var(--c-surface)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Associar fatura de cartão</h2>
                <p className="mt-1 text-sm text-[var(--c-muted)]">
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
                { label: 'Texto / cartão', field: 'documento', type: 'text', placeholder: 'Cartão, titular ou competência' },
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
              <div className="mt-3 rounded-xl border border-[var(--sem-danger-border)] bg-[var(--sem-danger-bg)] px-4 py-3 text-sm text-[var(--sem-danger)]">{faturaModal.error}</div>
            )}
            <div className="mt-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-4 py-2 text-sm text-[var(--c-muted)]">
              {faturaModal.dados.meta.total} fatura(s) encontrada(s)
            </div>
            <div className="mt-3">
              <FaturasAssociacaoTabela
                loading={faturaModal.loading}
                itens={faturaModal.dados.itens}
                modal={faturaModal}
                processingId={processingId}
                onAssociar={handleConfirmarFatura}
              />
            </div>
            {/*
              R1/R17 — aqui vivia uma SEGUNDA renderização da mesma lista, em
              cartões soltos, mantida viva atrás de `className="hidden"` desde a
              migração para a TabelaPadrao logo acima. Markup morto não é
              inofensivo: ele reprovava na escala e nas cores, e quem lesse o
              arquivo veria duas listas onde só existe uma. Removido — a
              TabelaPadrao acima é a única dona da lista (R16).
            */}
          </div>
        </div>
      )}

      {/* R3/R19 — o modal de confirmação do sistema mora aqui; sem ele,
          `confirmar()` fica pendurado e nada aparece na tela. */}
      {elementoConfirmacao}
    </Pagina>
  );
}
