import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import OverlayModal from '../components/ui/OverlayModal';
import {
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao
} from '../components/padrao';
import { useAuth } from '../contexts/AuthContext';
import { useUiVisibility } from '../hooks/useUiVisibility';
import {
  getContasBancarias,
  estornarConciliacaoBancaria,
  getRelatorioConciliacaoContas,
  getRelatorioFluxoCaixa,
  getRelatorioMovimentacaoContas
} from '../services/financeiro';
import { getMinhasObras } from '../services/obras';
import { canViewFinanceiroRelatorio, hasPermissao } from '../utils/acessoProduto';
import DateInputBR from '../components/DateInputBR';

const FinanceiroExecutivoGrupo = lazy(() => import('./FinanceiroExecutivoGrupo'));
const FinanceiroFluxoConsolidado = lazy(() => import('./FinanceiroFluxoConsolidado'));
const FinanceiroDre = lazy(() => import('./FinanceiroDre'));
const FinanceiroDiagnosticoDre = lazy(() => import('./FinanceiroDiagnosticoDre'));
const FinanceiroIntercompany = lazy(() => import('./FinanceiroIntercompany'));
const FinanceiroEndividamento = lazy(() => import('./FinanceiroEndividamento'));
const FinanceiroRelatorioAnalitico = lazy(() => import('./FinanceiroRelatorioAnalitico'));
const FinanceiroObras = lazy(() => import('./FinanceiroObras'));
const FinanceiroResultadoObras = lazy(() => import('./FinanceiroResultadoObras'));
const FinanceiroResultadoCentrosCusto = lazy(() => import('./FinanceiroResultadoCentrosCusto'));

const DEFAULT_FILTERS = {
  periodo: '30_DIAS',
  obra_id: '',
  data_inicial: '',
  data_final: ''
};

const EMPTY_RELATORIO = {
  filtro: {
    periodo: '30_DIAS',
    descricao: '',
    data_inicial: '',
    data_final: '',
    agrupamento: 'DIA',
    obra_id: null
  },
  resumo: {
    entradas_previstas: 0,
    saidas_previstas: 0,
    saldo_previsto: 0,
    entradas_realizadas: 0,
    saidas_realizadas: 0,
    juros_realizados: 0,
    multa_realizada: 0,
    desconto_realizado: 0,
    saldo_realizado: 0,
    variacao_realizado_vs_previsto: 0,
    titulos_previstos: 0,
    movimentos_realizados: 0
  },
  serie: []
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatCompactCurrency(value) {
  const numeric = Number(value || 0);
  const abs = Math.abs(numeric);

  if (abs >= 1000000) {
    return `${numeric < 0 ? '-' : ''}R$ ${(abs / 1000000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} mi`;
  }

  if (abs >= 1000) {
    return `${numeric < 0 ? '-' : ''}R$ ${(abs / 1000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} mil`;
  }

  return formatCurrency(numeric);
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return '-';
  return `${day}/${month}/${year}`;
}

function vinculoAnalitico(item) {
  if (item.tipo_conciliacao === 'TRANSFERENCIA') return `Transferencia #${item.transferencia_financeira_id}`;
  if (item.tipo_conciliacao === 'FATURA_CARTAO') return `Fatura #${item.fatura_cartao_id}`;
  if (item.tipo_conciliacao === 'TARIFA') return `Tarifa · mov. #${item.movimento_financeiro_id}`;
  if (item.tipo_conciliacao === 'RENDIMENTO') return `Rendimento da conta · mov. #${item.movimento_financeiro_id}`;
  if (item.tipo_conciliacao === 'ESTORNO_TARIFA') return `Estorno de tarifa - mov. #${item.movimento_financeiro_id}`;
  if (item.tipo_conciliacao === 'ESTORNO_BANCARIO') return `Estorno bancario - mov. #${item.movimento_financeiro_id}`;
  if (item.tipo_conciliacao === 'CREDITO_ROTATIVO') {
    return `${item.natureza === 'SAIDA' ? 'Amortizacao' : 'Liberacao'} · mov. #${item.movimento_financeiro_id}`;
  }
  return item.titulo_codigo || (item.movimento_financeiro_id ? `Mov. #${item.movimento_financeiro_id}` : '-');
}

function descricaoAnalitico(item) {
  if (item.tipo_conciliacao === 'TRANSFERENCIA') {
    return `${item.conta_origem || 'Origem'} → ${item.conta_destino || 'Destino'}${item.transferencia_descricao ? ` · ${item.transferencia_descricao}` : ''}`;
  }
  return item.descricao_banco || item.categoria || item.observacoes || '-';
}

function observacaoSintetico(item, type) {
  if (type === 'conciliacao') {
    return `${item.conciliados || 0} conciliado(s), ${item.pendentes || 0} pendente(s)`;
  }
  return Number(item.permutas || 0) > 0 ? `${formatCurrency(item.permutas)} em permutas` : '-';
}

/*
  R25 — o tom do dinheiro vem de token semântico. As classes cruas
  (emerald/rose/slate com degrau) não têm par no tema escuro e não passam
  pelo piso de contraste do ThemeContext (R24): `text-slate-500` é
  #64748b, 4,34:1, abaixo do mínimo AA de 4,5:1.

  Escritas por extenso porque o Tailwind varre LITERAIS — classe montada
  por template nunca chega ao CSS.
*/
function getCurrencyTone(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return 'text-[var(--sem-success)]';
  if (numeric < 0) return 'text-[var(--sem-danger)]';
  return 'text-[var(--c-text)]';
}

/*
  Tom do SALDO, que é outra pergunta: aqui zero conta como positivo
  (>= 0), exatamente como a tela fazia antes. Manter as duas funções
  separadas em vez de reaproveitar a de cima é de propósito — trocar
  `>= 0` por `> 0` mudaria a cor de um saldo zerado sem ninguém pedir, e
  cor em tela de dinheiro é leitura, não enfeite.
*/
function getSaldoTone(value) {
  return Number(value || 0) >= 0 ? 'text-[var(--sem-success)]' : 'text-[var(--sem-danger)]';
}

function normalizeRelatorio(data) {
  if (!data || typeof data !== 'object') {
    return EMPTY_RELATORIO;
  }

  return {
    filtro: {
      periodo: data.filtro?.periodo || '30_DIAS',
      descricao: data.filtro?.descricao || '',
      data_inicial: data.filtro?.data_inicial || '',
      data_final: data.filtro?.data_final || '',
      agrupamento: data.filtro?.agrupamento || 'DIA',
      obra_id: data.filtro?.obra_id ?? null
    },
    resumo: {
      entradas_previstas: Number(data.resumo?.entradas_previstas || 0),
      saidas_previstas: Number(data.resumo?.saidas_previstas || 0),
      saldo_previsto: Number(data.resumo?.saldo_previsto || 0),
      entradas_realizadas: Number(data.resumo?.entradas_realizadas || 0),
      saidas_realizadas: Number(data.resumo?.saidas_realizadas || 0),
      juros_realizados: Number(data.resumo?.juros_realizados || 0),
      multa_realizada: Number(data.resumo?.multa_realizada || 0),
      desconto_realizado: Number(data.resumo?.desconto_realizado || 0),
      saldo_realizado: Number(data.resumo?.saldo_realizado || 0),
      variacao_realizado_vs_previsto: Number(data.resumo?.variacao_realizado_vs_previsto || 0),
      titulos_previstos: Number(data.resumo?.titulos_previstos || 0),
      movimentos_realizados: Number(data.resumo?.movimentos_realizados || 0)
    },
    serie: Array.isArray(data.serie)
      ? data.serie.map((item) => ({
          referencia: item.referencia || '',
          label: item.label || '',
          entradas_previstas: Number(item.entradas_previstas || 0),
          saidas_previstas: Number(item.saidas_previstas || 0),
          saldo_previsto: Number(item.saldo_previsto || 0),
          saldo_previsto_acumulado: Number(item.saldo_previsto_acumulado || 0),
          entradas_realizadas: Number(item.entradas_realizadas || 0),
          saidas_realizadas: Number(item.saidas_realizadas || 0),
          juros_realizados: Number(item.juros_realizados || 0),
          multa_realizada: Number(item.multa_realizada || 0),
          desconto_realizado: Number(item.desconto_realizado || 0),
          saldo_realizado: Number(item.saldo_realizado || 0),
          saldo_realizado_acumulado: Number(item.saldo_realizado_acumulado || 0)
        }))
      : []
  };
}

/*
  O ladrilho é o `StatTile` do sistema — o mesmo da FinanceiroTitulos e da
  FinanceiroObras. O cartão local trazia o hexadecimal do valor (R25) e um
  quarto dialeto de "cartão de número" que a StatGrid existe para unificar.

  `positive == null` continua significando NEUTRO: KPI que não pertence a
  série nenhuma (contagem, saldo derivado) fica na cor de texto (R8).
*/
function RelatorioMetric({ label, value, detail, positive = null }) {
  const tom = positive == null ? undefined : (positive ? 'success' : 'danger');
  return <StatTile label={label} valor={value} sub={detail} tom={tom} />;
}

function buildLinePath(points) {
  if (!points.length) {
    return '';
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function buildComparativoGeometry(serie, previstoKey, realizadoKey) {
  if (!serie.length) {
    return null;
  }

  const width = 920;
  const height = 180;
  const padding = { top: 16, right: 20, bottom: 36, left: 20 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = serie.flatMap((item) => [
    Number(item[previstoKey] || 0),
    Number(item[realizadoKey] || 0),
    0
  ]);

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    const delta = Math.max(Math.abs(min) * 0.2, 1);
    min -= delta;
    max += delta;
  }

  const getX = (index) => padding.left + (plotWidth * index) / Math.max(serie.length - 1, 1);
  const getY = (value) => padding.top + ((max - Number(value || 0)) / Math.max(max - min, 1)) * plotHeight;

  const previstoPoints = serie.map((item, index) => ({
    x: getX(index),
    y: getY(item[previstoKey]),
    raw: Number(item[previstoKey] || 0),
    label: item.label,
    referencia: item.referencia
  }));

  const realizadoPoints = serie.map((item, index) => ({
    x: getX(index),
    y: getY(item[realizadoKey]),
    raw: Number(item[realizadoKey] || 0),
    label: item.label,
    referencia: item.referencia
  }));

  const gridValues = Array.from({ length: 5 }, (_, index) => max - ((max - min) / 4) * index);
  const labelStep = Math.max(1, Math.ceil(serie.length / 7));
  const footerLabels = serie
    .map((item, index) => ({
      key: `${item.referencia}-${index}`,
      label: item.label,
      show: index === 0 || index === serie.length - 1 || index % labelStep === 0
    }))
    .filter((item) => item.show);

  return {
    width,
    height,
    padding,
    previstoPoints,
    realizadoPoints,
    previstoPath: buildLinePath(previstoPoints),
    realizadoPath: buildLinePath(realizadoPoints),
    gridValues,
    footerLabels,
    max,
    min
  };
}

function FluxoComparativoCard({ serie }) {
  const [mode, setMode] = useState('ACUMULADO');

  const modeConfig =
    mode === 'SALDO'
      ? {
          title: 'Fluxo previsto x realizado',
          subtitle: 'Comparacao do saldo de cada periodo entre o que foi projetado e o que de fato aconteceu.',
          previstoKey: 'saldo_previsto',
          realizadoKey: 'saldo_realizado'
        }
      : {
          title: 'Fluxo previsto x realizado',
          subtitle: 'Comparacao acumulada do caixa projetado contra o caixa efetivamente baixado no periodo.',
          previstoKey: 'saldo_previsto_acumulado',
          realizadoKey: 'saldo_realizado_acumulado'
        };

  const geometry = buildComparativoGeometry(serie, modeConfig.previstoKey, modeConfig.realizadoKey);
  const fechamentoPrevisto = Number(serie[serie.length - 1]?.[modeConfig.previstoKey] || 0);
  const fechamentoRealizado = Number(serie[serie.length - 1]?.[modeConfig.realizadoKey] || 0);
  const diferenca = fechamentoRealizado - fechamentoPrevisto;
  const pico = serie.reduce(
    (acc, item) => Math.max(acc, Number(item[modeConfig.previstoKey] || 0), Number(item[modeConfig.realizadoKey] || 0)),
    Number.NEGATIVE_INFINITY
  );
  const piso = serie.reduce(
    (acc, item) => Math.min(acc, Number(item[modeConfig.previstoKey] || 0), Number(item[modeConfig.realizadoKey] || 0)),
    Number.POSITIVE_INFINITY
  );

  return (
    <section className="finance-chart-card finance-chart-card--comparison">
      <div className="finance-chart-card__backdrop" />

      <div className="finance-chart-card__head">
        <div>
          <h2 className="finance-chart-card__title">{modeConfig.title}</h2>
          <p className="finance-chart-card__subtitle">{modeConfig.subtitle}</p>
        </div>

        <div className="finance-chart-card__controls">
          <div className="finance-chart-toggle-group">
            <button
              type="button"
              className={`finance-chart-toggle ${mode === 'ACUMULADO' ? 'finance-chart-toggle--active' : ''}`}
              onClick={() => setMode('ACUMULADO')}
            >
              Acumulado
            </button>
            <button
              type="button"
              className={`finance-chart-toggle ${mode === 'SALDO' ? 'finance-chart-toggle--active' : ''}`}
              onClick={() => setMode('SALDO')}
            >
              Saldo do período
            </button>
          </div>

          <div className="finance-chart-legend">
            <span className="finance-chart-legend-item">
              <span className="finance-chart-legend-dot finance-chart-legend-dot--previsto" />
              Previsto
            </span>
            <span className="finance-chart-legend-item">
              <span className="finance-chart-legend-dot finance-chart-legend-dot--realizado" />
              Realizado
            </span>
          </div>
        </div>
      </div>

      {!serie.length ? (
        <div className="finance-chart-empty">Nenhum movimento encontrado no período selecionado.</div>
      ) : (
        <>
          <div className="finance-chart-stats">
            <div className="finance-chart-stat">
              <span>Previsto</span>
              <strong>{formatCompactCurrency(fechamentoPrevisto)}</strong>
            </div>
            <div className="finance-chart-stat">
              <span>Realizado</span>
              <strong>{formatCompactCurrency(fechamentoRealizado)}</strong>
            </div>
            <div className="finance-chart-stat">
              <span>Variacao</span>
              <strong>{formatCompactCurrency(diferenca)}</strong>
            </div>
            <div className="finance-chart-stat">
              <span>Pico</span>
              <strong>{formatCompactCurrency(pico)}</strong>
            </div>
            <div className="finance-chart-stat">
              <span>Piso</span>
              <strong>{formatCompactCurrency(piso)}</strong>
            </div>
          </div>

          <div className="finance-chart-shell">
            <svg
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              className="finance-chart-svg"
              role="img"
              aria-label={`${modeConfig.title} em formato de gráfico`}
            >
              <defs>
                <filter id="finance-chart-previsto-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="finance-chart-realizado-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="4" result="blur2" />
                  <feMerge>
                    <feMergeNode in="blur2" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {geometry.gridValues.map((value, index) => {
                const y =
                  geometry.padding.top +
                  ((geometry.max - value) / Math.max(geometry.max - geometry.min, 1)) *
                    (geometry.height - geometry.padding.top - geometry.padding.bottom);

                return (
                  <line
                    key={`grid-${index}`}
                    x1={geometry.padding.left}
                    y1={y}
                    x2={geometry.width - geometry.padding.right}
                    y2={y}
                    className={`finance-chart-grid ${Math.abs(value) < 0.0001 ? 'finance-chart-zero' : ''}`}
                  />
                );
              })}

              <path
                d={geometry.previstoPath}
                fill="none"
                stroke="var(--finance-chart-previsto)"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#finance-chart-previsto-glow)"
              />
              <path
                d={geometry.realizadoPath}
                fill="none"
                stroke="var(--finance-chart-realizado)"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#finance-chart-realizado-glow)"
              />

              {geometry.previstoPoints.map((point, index) => (
                <g key={`pair-${point.referencia}-${index}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="4.2"
                    fill="var(--finance-chart-previsto)"
                    className="finance-chart-point"
                  >
                    <title>{`${point.label} - Previsto ${formatCurrency(point.raw)}`}</title>
                  </circle>
                  <circle
                    cx={geometry.realizadoPoints[index].x}
                    cy={geometry.realizadoPoints[index].y}
                    r="4.2"
                    fill="var(--finance-chart-realizado)"
                    className="finance-chart-point finance-chart-point--secondary"
                  >
                    <title>{`${point.label} - Realizado ${formatCurrency(geometry.realizadoPoints[index].raw)}`}</title>
                  </circle>
                </g>
              ))}
            </svg>
          </div>

          <div className="finance-chart-axis">
            {geometry.footerLabels.map((item) => (
              <span key={item.key}>{item.label}</span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function FluxoCaixaRelatorioConteudo({ isVisible }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(EMPTY_RELATORIO);
  const [loading, setLoading] = useState(true);
  const [loadingObras, setLoadingObras] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getMinhasObras({ modo: 'FINANCEIRO' })
      .then((data) => {
        if (!active) return;
        setObras(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setObras([]);
      })
      .finally(() => {
        if (active) setLoadingObras(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getRelatorioFluxoCaixa(appliedFilters)
      .then((data) => {
        if (!active) return;
        setRelatorio(normalizeRelatorio(data));
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Erro ao carregar relatorio financeiro');
        setRelatorio(EMPTY_RELATORIO);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters]);

  const metaPeriodo = useMemo(() => {
    if (!relatorio.filtro?.data_inicial || !relatorio.filtro?.data_final) {
      return '';
    }

    return `${formatDate(relatorio.filtro.data_inicial)} ate ${formatDate(relatorio.filtro.data_final)}`;
  }, [relatorio.filtro]);

  const saldoProjetadoPositivo = relatorio.resumo.saldo_previsto >= 0;
  const saldoRealizadoPositivo = relatorio.resumo.saldo_realizado >= 0;
  const variacaoPositiva = relatorio.resumo.variacao_realizado_vs_previsto >= 0;

  function handlePeriodoChange(periodo) {
    setFilters((current) => ({
      ...current,
      periodo,
      data_inicial: periodo === 'PERSONALIZADO' ? current.data_inicial : '',
      data_final: periodo === 'PERSONALIZADO' ? current.data_final : ''
    }));
  }

  function aplicarFiltros(event) {
    event.preventDefault();
    setAppliedFilters({
      ...filters
    });
  }

  function limparFiltros() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  /*
    ESTE CONTEÚDO NUNCA É UMA PÁGINA — ele sempre renderiza DENTRO do hub
    (no painel lateral ou no modo tela inteira), e os dois já desenham a
    faixa fixa com o título do relatório escolhido.

    Até aqui ele trazia a sua própria `div.page` com um segundo
    `.app-page-header` dentro: duas faixas fixas grudando na mesma rolagem
    e o nome do relatório escrito duas vezes na mesma tela (R16 — uma
    responsabilidade, um dono; B3 — cada informação aparece uma vez).
    Agora são só blocos.
  */
  return (
    <div className="app-pagina">
      <form className="card sol-surface-card" onSubmit={aplicarFiltros}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="app-filter-field min-w-40">
            <span className="app-filter-label">Período</span>
            <select className="input w-full input-sm" value={filters.periodo}
              onChange={(e) => handlePeriodoChange(e.target.value)}>
              <option value="HOJE">Hoje</option>
              <option value="7_DIAS">Próximos 7 dias</option>
              <option value="30_DIAS">Próximos 30 dias</option>
              <option value="90_DIAS">Próximos 90 dias</option>
              <option value="MES_ATUAL">Mês atual</option>
              <option value="PROXIMO_MES">Próximo mês</option>
              <option value="PERSONALIZADO">Personalizado</option>
            </select>
          </label>
          <label className="app-filter-field min-w-32">
            <span className="app-filter-label">Data inicial</span>
            <DateInputBR className="input w-full input-sm" value={filters.data_inicial}
              disabled={filters.periodo !== 'PERSONALIZADO'}
              onChange={(e) => setFilters((c) => ({ ...c, data_inicial: e.target.value }))} />
          </label>
          <label className="app-filter-field min-w-32">
            <span className="app-filter-label">Data final</span>
            <DateInputBR className="input w-full input-sm" value={filters.data_final}
              disabled={filters.periodo !== 'PERSONALIZADO'}
              onChange={(e) => setFilters((c) => ({ ...c, data_final: e.target.value }))} />
          </label>
          <label className="app-filter-field flex-1 min-w-40">
            <span className="app-filter-label">Obra</span>
            <select className="input w-full input-sm" value={filters.obra_id}
              onChange={(e) => setFilters((c) => ({ ...c, obra_id: e.target.value }))}
              disabled={loadingObras}>
              <option value="">Todas as obras</option>
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </label>
          {/*
            X3 — `shrink-0` aqui era o transbordo do mobile (04/09).

            Medido no preview: numa janela de 390px este contêiner ia a
            745px e arrastava o botão primário até 775px, recortado por
            `overflow-x: clip` — sumia sem deixar rolagem. A cadeia de
            ancestrais que o check passou a reportar apontou ELE, não o
            botão: o botão era a vítima, com `width` herdada de um pai que
            se recusava a encolher.

            `shrink-0` num contêiner que carrega uma FRASE é contradição:
            ele diz "nunca me encolha" abrigando texto que quebraria sem
            perda nenhuma. Sai o `shrink-0`, entra `flex-wrap` — em tela
            estreita o aviso passa para a linha de baixo e os botões
            continuam alcançáveis.
          */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {metaPeriodo && (
              <span className="hidden text-xs text-[var(--c-muted)] md:block">
                {metaPeriodo}{relatorio.filtro?.agrupamento ? ` · por ${relatorio.filtro.agrupamento === 'MES' ? 'mês' : 'dia'}` : ''}
              </span>
            )}
            {/*
              R23 — CONSULTA CARA, DECLARADA: quatro dimensões combináveis
              (período, data inicial, data final e obra) sobre a agregação
              de títulos e movimentos do período. A marca é RASCUNHO até
              este clique, e o botão diz o que faz ("Atualizar relatório",
              não "Aplicar filtros"). O aviso fica junto do botão, por
              extenso — na `descricao` do PageHeader ele truncaria (R5/C2).
            */}
            <span className="text-sm text-[var(--c-muted)]">
              Os filtros só valem depois de &quot;Atualizar relatório&quot; — até o clique, a marca é rascunho.
            </span>
            <button type="button" className="btn btn-outline btn-sm" onClick={limparFiltros}>Limpar</button>
            <button type="submit" className="btn btn-primary btn-sm">Atualizar relatório</button>
          </div>
        </div>
      </form>

      {error ? (
        <div className="app-alert app-alert--error">
          {error}
        </div>
      ) : null}

      {isVisible('financeiro.fluxo_caixa.metricas') ? (
      <StatGrid colunas={4}>
        <RelatorioMetric
          label="Entradas previstas"
          value={formatCurrency(relatorio.resumo.entradas_previstas)}
          detail={`${relatorio.resumo.titulos_previstos} titulo(s) no periodo`}
        />
        <RelatorioMetric
          label="Saídas previstas"
          value={formatCurrency(relatorio.resumo.saidas_previstas)}
          detail="Baseado no saldo atual dos titulos"
        />
        <RelatorioMetric
          label="Saldo projetado"
          value={formatCurrency(relatorio.resumo.saldo_previsto)}
          detail="Receber menos pagar"
          positive={saldoProjetadoPositivo}
        />
        <RelatorioMetric
          label="Saldo realizado"
          value={formatCurrency(relatorio.resumo.saldo_realizado)}
          detail={`${relatorio.resumo.movimentos_realizados} movimento(s) ativo(s)`}
          positive={saldoRealizadoPositivo}
        />
        <RelatorioMetric
          label="Entradas realizadas"
          value={formatCurrency(relatorio.resumo.entradas_realizadas)}
          detail="Recebimentos baixados"
        />
        <RelatorioMetric
          label="Saídas realizadas"
          value={formatCurrency(relatorio.resumo.saidas_realizadas)}
          detail="Pagamentos baixados"
        />
        <RelatorioMetric
          label="Juros realizados"
          value={formatCurrency(relatorio.resumo.juros_realizados)}
          detail="Juros informados nas baixas"
        />
        <RelatorioMetric
          label="Multa realizada"
          value={formatCurrency(relatorio.resumo.multa_realizada)}
          detail="Multas informadas nas baixas"
        />
        <RelatorioMetric
          label="Desconto realizado"
          value={formatCurrency(relatorio.resumo.desconto_realizado)}
          detail="Descontos aplicados nas baixas"
        />
        <RelatorioMetric
          label="Variacao"
          value={formatCurrency(relatorio.resumo.variacao_realizado_vs_previsto)}
          detail="Delta entre saldos liquidos"
          positive={variacaoPositiva}
        />
        <RelatorioMetric
          label="Movimentos ativos"
          value={String(relatorio.resumo.movimentos_realizados)}
          detail={`${relatorio.serie.length} ponto(s) na visualizacao`}
        />
      </StatGrid>
      ) : null}

      {loading ? (
        <div className="app-empty-card">
          Carregando relatório de fluxo de caixa...
        </div>
      ) : (
        <>
          {isVisible('financeiro.fluxo_caixa.grafico') ? (
            <FluxoComparativoCard serie={relatorio.serie} />
          ) : null}

          {isVisible('financeiro.fluxo_caixa.detalhamento') ? (
          <section className="card sol-surface-card app-table-shell">
            <div className="border-b border-[var(--c-border)] px-4 py-3">
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Detalhamento por período</h2>
              <p className="text-sm text-[var(--c-muted)]">
                Série consolidada para acompanhar entradas, saídas e saldo acumulado.
              </p>
            </div>

            <TabelaPadrao
              colunas={[
                { id: 'periodo', titulo: 'Período', tipo: 'data', noCard: 'titulo', render: (item) => item.label },
                { id: 'entradas_previstas', titulo: 'Entradas previstas', tipo: 'valor', render: (item) => formatCurrency(item.entradas_previstas) },
                { id: 'saidas_previstas', titulo: 'Saídas previstas', tipo: 'valor', render: (item) => formatCurrency(item.saidas_previstas) },
                {
                  id: 'saldo_previsto',
                  titulo: 'Saldo previsto',
                  tipo: 'valor',
                  render: (item) => (
                    <span className={`font-medium ${getSaldoTone(item.saldo_previsto)}`}>
                      {formatCurrency(item.saldo_previsto)}
                    </span>
                  )
                },
                { id: 'acumulado_previsto', titulo: 'Acumulado previsto', tipo: 'valor', render: (item) => formatCurrency(item.saldo_previsto_acumulado) },
                { id: 'entradas_realizadas', titulo: 'Entradas realizadas', tipo: 'valor', render: (item) => formatCurrency(item.entradas_realizadas) },
                { id: 'saidas_realizadas', titulo: 'Saídas realizadas', tipo: 'valor', render: (item) => formatCurrency(item.saidas_realizadas) },
                {
                  id: 'saldo_realizado',
                  titulo: 'Saldo realizado',
                  tipo: 'valor',
                  render: (item) => (
                    <span className={`font-medium ${getSaldoTone(item.saldo_realizado)}`}>
                      {formatCurrency(item.saldo_realizado)}
                    </span>
                  )
                },
                { id: 'acumulado_realizado', titulo: 'Acumulado realizado', tipo: 'valor', render: (item) => formatCurrency(item.saldo_realizado_acumulado) }
              ]}
              itens={relatorio.serie}
              getId={(item) => item.referencia}
              storageKey="tabela:financeiro-relatorios:detalhamento-periodo"
              rotuloRolagem="Detalhamento por periodo"
              vazio="Nenhum dado encontrado para o período selecionado."
              // R17: linha e periodo x totais da serie — nao existe registro
              // nomeado nesta tabela, so a competencia temporal.
              semIdentidade
            />
          </section>
          ) : null}
        </>
      )}
    </div>
  );
}

const CONTAS_REPORT_DEFAULT_FILTERS = {
  periodo: 'MES_ATUAL',
  data_inicial: '',
  data_final: '',
  conta_bancaria_id: '',
  status: 'TODOS',
  tipo_conciliacao: 'TODOS',
  natureza: 'TODAS',
  busca: ''
};

function buildContaReportParams(filters, type) {
  const params = { periodo: filters.periodo, conta_bancaria_id: filters.conta_bancaria_id };
  if (filters.periodo === 'PERSONALIZADO') {
    params.data_inicial = filters.data_inicial;
    params.data_final = filters.data_final;
  }
  if (type === 'conciliacao') {
    params.status = filters.status;
    params.tipo_conciliacao = filters.tipo_conciliacao;
    params.natureza = filters.natureza;
    params.busca = filters.busca;
  }
  return params;
}

function ContaReportFilters({ filters, setFilters, contas, loading, onSubmit, type }) {
  return (
    <form className="card sol-surface-card p-4 financeiro-conta-report-filters" onSubmit={onSubmit}>
      <div className="financeiro-conta-report-filter-grid">
        <label className="field">
          <span>Período</span>
          <select
            value={filters.periodo}
            onChange={(event) => setFilters((current) => ({ ...current, periodo: event.target.value }))}
          >
            <option value="MES_ATUAL">Mês atual</option>
            <option value="HOJE">Hoje</option>
            <option value="30_DIAS">Próximos 30 dias</option>
            <option value="90_DIAS">Próximos 90 dias</option>
            <option value="PERSONALIZADO">Personalizado</option>
          </select>
        </label>
        {type === 'conciliacao' ? (
          <>
            <label className="field">
              <span>Status</span>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="TODOS">Todos os status</option>
                <option value="CONCILIADO">Conciliados</option>
                <option value="PENDENTE">Pendentes</option>
                <option value="IGNORADO">Ignorados</option>
                <option value="REMOVIDO">Removidos</option>
              </select>
            </label>
            <label className="field">
              <span>Tipo de vínculo</span>
              <select value={filters.tipo_conciliacao} onChange={(event) => setFilters((current) => ({ ...current, tipo_conciliacao: event.target.value }))}>
                <option value="TODOS">Todos os tipos</option>
                <option value="TRANSFERENCIA">Transferências</option>
                <option value="TITULO">Títulos</option>
                <option value="FATURA_CARTAO">Faturas de cartão</option>
                <option value="TARIFA">Tarifas bancárias</option>
                <option value="RENDIMENTO">Rendimentos da conta</option>
                <option value="ESTORNO_TARIFA">Estornos de tarifa</option>
                <option value="ESTORNO_BANCARIO">Estornos bancários</option>
                <option value="CREDITO_ROTATIVO">Crédito rotativo</option>
                <option value="MOVIMENTO">Outros movimentos</option>
                <option value="SEM_VINCULO">Sem vínculo</option>
              </select>
            </label>
            <label className="field">
              <span>Natureza</span>
              <select value={filters.natureza} onChange={(event) => setFilters((current) => ({ ...current, natureza: event.target.value }))}>
                <option value="TODAS">Entradas e saídas</option>
                <option value="ENTRADA">Entradas</option>
                <option value="SAIDA">Saídas</option>
              </select>
            </label>
            <label className="field md:col-span-2">
              <span>Buscar no extrato</span>
              <input
                type="search"
                value={filters.busca}
                placeholder="Descrição, documento ou identificador OFX"
                onChange={(event) => setFilters((current) => ({ ...current, busca: event.target.value }))}
              />
            </label>
          </>
        ) : null}
        <label className="field">
          <span>Data inicial</span>
          <DateInputBR
            value={filters.data_inicial}
            disabled={filters.periodo !== 'PERSONALIZADO'}
            onChange={(event) => setFilters((current) => ({ ...current, data_inicial: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Data final</span>
          <DateInputBR
            value={filters.data_final}
            disabled={filters.periodo !== 'PERSONALIZADO'}
            onChange={(event) => setFilters((current) => ({ ...current, data_final: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Conta bancária</span>
          <select
            value={filters.conta_bancaria_id}
            onChange={(event) => setFilters((current) => ({ ...current, conta_bancaria_id: event.target.value }))}
          >
            <option value="">Todas as contas</option>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.nome || `${conta.banco || ''} ${conta.conta || ''}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="financeiro-conta-report-actions">
        {/*
          R23 — CONSULTA CARA, DECLARADA. A conciliação combina OITO
          dimensões (período, data inicial, data final, conta, status,
          tipo de vínculo, natureza e busca no extrato) sobre o extrato
          inteiro do período. As marcas são RASCUNHO até este clique, e o
          botão diz o que faz ("Gerar relatorio", não "Aplicar filtros").
        */}
        <span className="text-sm text-[var(--c-muted)]">
          Os filtros só valem depois de &quot;Gerar relatorio&quot; — até o clique, a marca é rascunho.
        </span>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Gerando...' : 'Gerar relatorio'}
        </button>
      </div>
    </form>
  );
}

function ContaReportShell({ title, subtitle, type }) {
  const { user } = useAuth();
  const canEstornarConciliacao = type === 'conciliacao' && hasPermissao(user, 'financeiro.conciliacao.estornar');
  const [filters, setFilters] = useState({ ...CONTAS_REPORT_DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...CONTAS_REPORT_DEFAULT_FILTERS });
  const [contas, setContas] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [estornoModal, setEstornoModal] = useState({ open: false, item: null, motivo: '', processing: false, error: '' });

  useEffect(() => {
    let active = true;
    getContasBancarias()
      .then((data) => {
        if (active) setContas(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setContas([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const loader = type === 'conciliacao' ? getRelatorioConciliacaoContas : getRelatorioMovimentacaoContas;
    loader(buildContaReportParams(appliedFilters, type))
      .then((data) => {
        if (active) setRelatorio(data);
      })
      .catch((err) => {
        if (!active) return;
        setRelatorio(null);
        setError(err?.message || 'Erro ao gerar relatorio');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters, type]);

  function handleSubmit(event) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  /*
    R26 — o movimento a estornar é FIXADO numa const antes de qualquer
    `await`, e é essa referência que vai na chamada. O modal do sistema
    não bloqueia a tela como o `confirm`/`prompt` do navegador bloqueava:
    com a caixa aberta dá para clicar noutra linha do analítico, e sem
    fixar a tela perguntaria sobre um vínculo e estornaria outro — a
    classe CONSENTIMENTO da DoD, que não deixa rastro de erro no log.

    O texto que a pessoa LÊ no modal descreve `estornoModal.item`, o
    MESMO objeto que vira `alvo` aqui: os dois lados são o mesmo registro,
    no mesmo momento, com o mesmo critério.
  */
  async function handleEstornarConciliacao(event) {
    event.preventDefault();
    const alvo = estornoModal.item;
    const motivo = String(estornoModal.motivo || '').trim();
    if (!alvo?.id || !motivo || estornoModal.processing) return;
    try {
      setEstornoModal((current) => ({ ...current, processing: true, error: '' }));
      await estornarConciliacaoBancaria(alvo.id, { motivo });
      setEstornoModal({ open: false, item: null, motivo: '', processing: false, error: '' });
      const data = await getRelatorioConciliacaoContas(buildContaReportParams(appliedFilters, type));
      setRelatorio(data);
    } catch (err) {
      setEstornoModal((current) => ({ ...current, processing: false, error: err?.message || 'Erro ao estornar conciliacao' }));
    }
  }

  const resumo = relatorio?.resumo || {};
  const sintetico = Array.isArray(relatorio?.sintetico) ? relatorio.sintetico : [];
  const analitico = Array.isArray(relatorio?.analitico) ? relatorio.analitico : [];

  return (
    <div className="financeiro-conta-report-shell space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">{title}</h2>
        <p className="text-sm text-[var(--c-muted)]">{subtitle}</p>
      </div>

      <ContaReportFilters
        filters={filters}
        setFilters={setFilters}
        contas={contas}
        loading={loading}
        onSubmit={handleSubmit}
        type={type}
      />

      {error ? <div className="app-alert app-alert--error">{error}</div> : null}

      {relatorio ? (
        <>
          <StatGrid colunas={4} className="financeiro-report-summary-grid">
            <RelatorioMetric label="Contas" value={resumo.contas || 0} />
            <RelatorioMetric label="Movimentos" value={resumo.movimentos || 0} />
            {type === 'conciliacao' ? (
              <>
                <RelatorioMetric label="Conciliados" value={resumo.conciliados || 0} positive />
                <RelatorioMetric label="Pendentes" value={resumo.pendentes || 0} positive={Number(resumo.pendentes || 0) === 0} />
                <RelatorioMetric label="Ignorados/removidos" value={`${resumo.ignorados || 0}/${resumo.removidos || 0}`} />
                <RelatorioMetric label="Transferências" value={resumo.transferencias || 0} />
              </>
            ) : (
              <>
                <RelatorioMetric label="Entradas" value={formatCurrency(resumo.entradas)} positive />
                <RelatorioMetric label="Saídas" value={formatCurrency(resumo.saidas)} positive={false} />
                <RelatorioMetric label="Saldo líquido" value={formatCurrency(resumo.saldo_liquido)} positive={Number(resumo.saldo_liquido || 0) >= 0} />
                <RelatorioMetric label="Permutas" value={formatCurrency(resumo.permutas)} detail="Separadas do caixa bancario" />
              </>
            )}
          </StatGrid>

          <section className="card sol-surface-card p-4 financeiro-report-card">
            <div className="mb-3">
              <h3 className="text-lg font-semibold text-[var(--c-text)]">Sintético por conta</h3>
              <p className="text-xs text-[var(--c-muted)]">{relatorio.filtro?.descricao || 'Periodo selecionado'}</p>
            </div>
            <TabelaPadrao
              colunas={[
                {
                  id: 'conta',
                  titulo: 'Conta',
                  // R17: a conta bancaria NOMEIA a linha do sintetico.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.conta
                },
                { id: 'movimentos', titulo: 'Movimentos', tipo: 'numero', render: (item) => item.movimentos },
                {
                  id: 'entradas',
                  titulo: type === 'conciliacao' ? 'Conciliados' : 'Entradas',
                  tipo: 'valor',
                  render: (item) => (type === 'conciliacao' ? item.conciliados : formatCurrency(item.entradas))
                },
                {
                  id: 'saidas',
                  titulo: type === 'conciliacao' ? 'Pendentes' : 'Saidas',
                  tipo: 'valor',
                  render: (item) => (type === 'conciliacao' ? item.pendentes : formatCurrency(item.saidas))
                },
                {
                  id: 'saldo',
                  titulo: type === 'conciliacao' ? 'Ignor./remov.' : 'Saldo',
                  tipo: 'valor',
                  render: (item) => (type === 'conciliacao'
                    ? `${item.ignorados || 0}/${item.removidos || 0}`
                    : formatCurrency(item.saldo_liquido))
                },
                {
                  id: 'status',
                  titulo: 'Observação',
                  tipo: 'texto',
                  render: (item) => <span className="text-[var(--c-muted)]">{observacaoSintetico(item, type)}</span>
                }
              ]}
              itens={sintetico}
              getId={(item) => item.conta_bancaria_id || item.conta}
              storageKey={`tabela:financeiro-relatorios:${type}-sintetico`}
              rotuloRolagem="Sintetico por conta"
              vazio="Nenhum registro encontrado."
            />
          </section>

          <section className="card sol-surface-card p-4 financeiro-report-card">
            <h3 className="mb-3 text-lg font-semibold text-[var(--c-text)]">Analítico</h3>
            <TabelaPadrao
              colunas={[
                { id: 'data', titulo: 'Data', tipo: 'data', render: (item) => formatDate(item.data_movimento) },
                { id: 'conta', titulo: 'Conta', tipo: 'texto', render: (item) => item.conta },
                {
                  id: 'status',
                  titulo: type === 'conciliacao' ? 'Status' : 'Classe',
                  tipo: 'status',
                  render: (item) => <span className="fx-badge">{type === 'conciliacao' ? item.status : item.classe}</span>
                },
                ...(type === 'conciliacao' ? [{
                  id: 'natureza',
                  titulo: 'Natureza',
                  tipo: 'badge',
                  render: (item) => (
                    <span className={`badge ${item.natureza === 'SAIDA' ? 'badge-danger' : 'badge-success'}`}>
                      {item.natureza === 'SAIDA' ? 'Saída' : 'Entrada'}
                    </span>
                  )
                }] : []),
                {
                  id: 'titulo',
                  titulo: type === 'conciliacao' ? 'Vinculo' : 'Titulo',
                  tipo: 'texto',
                  render: (item) => vinculoAnalitico(item)
                },
                {
                  id: 'parceiro',
                  titulo: 'Cliente/Fornecedor',
                  // R17: o cliente/fornecedor NOMEIA a linha do analitico.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.parceiro || '-'
                },
                { id: 'obra', titulo: 'Obra', tipo: 'texto', render: (item) => item.obra || '-' },
                { id: 'documento', titulo: 'Documento', tipo: 'codigo', render: (item) => item.documento || item.ofx_uid || '-' },
                {
                  id: 'valor',
                  titulo: type === 'movimentacao' ? 'Movimento' : 'Valor',
                  tipo: 'valor',
                  render: (item) => {
                    const valorMovimento = type === 'movimentacao'
                      ? Number(item.valor_movimento ?? item.valor_quitacao ?? item.valor)
                      : Number(item.valor_quitacao ?? item.valor);
                    return <span className={`font-semibold ${getCurrencyTone(valorMovimento)}`}>{formatCurrency(valorMovimento)}</span>;
                  }
                },
                ...(type === 'movimentacao' ? [{
                  id: 'saldo',
                  titulo: 'Saldo',
                  tipo: 'valor',
                  render: (item) => <span className={`font-semibold ${getCurrencyTone(item.saldo_movimento)}`}>{formatCurrency(item.saldo_movimento)}</span>
                }] : []),
                { id: 'descricao', titulo: 'Descrição', tipo: 'texto', render: (item) => descricaoAnalitico(item) }
              ]}
              itens={analitico}
              storageKey={`tabela:financeiro-relatorios:${type}-analitico`}
              rotuloRolagem="Analitico do relatorio"
              vazio="Nenhum registro encontrado."
              acoesLinha={type === 'conciliacao' && canEstornarConciliacao
                ? (item) => (item.status === 'CONCILIADO'
                  && item.tipo_conciliacao !== 'ESTORNO_BANCARIO'
                  && (item.tipo_conciliacao !== 'TRANSFERENCIA' || item.transferencia_status === 'ATIVA') ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-perigo-suave"
                      onClick={() => setEstornoModal({ open: true, item, motivo: '', processing: false, error: '' })}
                    >
                      Estornar
                    </button>
                  ) : '-')
                : undefined}
            />
          </section>
        </>
      ) : null}

      {/*
        R27 — casca do sistema. O painel antigo era um overlay à mão, com
        fundo em paleta crua e sem rolagem própria: numa janela baixa o
        rodapé saía do painel e o botão "Confirmar estorno" ficava
        inalcançável, com o modal parecendo funcional. Agora o cabeçalho e
        o rodapé são marcados com `data-modal` e o corpo rola sozinho.
      */}
      {estornoModal.open ? (
        <OverlayModal
          rotulo="Estornar conciliação bancária"
          largura="var(--modal-max-w-md, 640px)"
          onFechar={estornoModal.processing
            ? undefined
            : () => setEstornoModal({ open: false, item: null, motivo: '', processing: false, error: '' })}
        >
          {/*
            Cabeçalho, corpo e rodapé são filhos DIRETOS do OverlayModal —
            é neles que o componente procura o `data-modal`. Envolver os
            três num `<form>` faria o formulário inteiro virar corpo
            rolante e o rodapé deixaria de ficar fixo. O botão de submeter
            mora no rodapé e alcança o formulário pelo atributo `form`,
            que é exatamente para isto.
          */}
          <div data-modal="cabecalho" className="border-b border-[var(--c-border)] p-4">
            <h3 className="text-lg font-semibold text-[var(--c-text)]">Estornar conciliação bancária</h3>
            <p className="mt-1 text-sm text-[var(--c-muted)]">
              {estornoModal.item?.tipo_conciliacao === 'TRANSFERENCIA'
                  ? 'A transferencia sera cancelada e os lancamentos OFX vinculados voltarao para pendente.'
                  : estornoModal.item?.tipo_conciliacao === 'TARIFA'
                    ? 'A tarifa criada pela conciliacao sera estornada e o lancamento OFX voltara para pendente.'
                    : estornoModal.item?.tipo_conciliacao === 'RENDIMENTO'
                      ? 'O rendimento criado pela conciliacao sera estornado e o lancamento OFX voltara para pendente.'
                    : estornoModal.item?.tipo_conciliacao === 'ESTORNO_TARIFA'
                      ? 'O credito de estorno sera desfeito e o lancamento OFX voltara para pendente. A tarifa original permanecera ativa.'
                    : estornoModal.item?.tipo_conciliacao === 'CREDITO_ROTATIVO'
                      ? 'O movimento de credito rotativo sera estornado e o lancamento OFX voltara para pendente.'
                  : 'O vinculo sera desfeito sem apagar o registro financeiro original, e o lancamento OFX voltara para pendente.'}
            </p>
          </div>

          <form id={`form-estorno-${type}`} className="space-y-3 p-4" onSubmit={handleEstornarConciliacao}>
              {/* Consentimento: o vinculo descrito aqui e o MESMO que
                  `handleEstornarConciliacao` envia (o `alvo`, fixado antes
                  do await). */}
              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--ui-surface-soft)] p-3 text-sm">
                <strong className="block text-[var(--c-text)]">{vinculoAnalitico(estornoModal.item || {})}</strong>
                <span className="text-[var(--c-muted)]">
                  {formatDate(estornoModal.item?.data_movimento)} · {estornoModal.item?.conta || 'Conta nao identificada'}
                </span>
              </div>
              <p className="text-sm text-[var(--c-muted)]">
                O estorno fica registrado na auditoria e não pode ser desfeito por esta tela.
              </p>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Motivo do estorno *</span>
                <textarea
                  className="input w-full resize-y"
                  rows={3}
                  maxLength={255}
                  value={estornoModal.motivo}
                  onChange={(event) => setEstornoModal((current) => ({ ...current, motivo: event.target.value, error: '' }))}
                />
              </label>
            {estornoModal.error ? <div className="app-alert app-alert--error">{estornoModal.error}</div> : null}
          </form>

          <div data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
            <button type="button" className="btn btn-outline" disabled={estornoModal.processing} onClick={() => setEstornoModal({ open: false, item: null, motivo: '', processing: false, error: '' })}>Cancelar</button>
            <button type="submit" form={`form-estorno-${type}`} className="btn btn-outline btn-perigo-suave" disabled={estornoModal.processing || !String(estornoModal.motivo || '').trim()}>{estornoModal.processing ? 'Estornando...' : 'Confirmar estorno'}</button>
          </div>
        </OverlayModal>
      ) : null}
    </div>
  );
}

function MovimentacaoContasRelatorioConteudo() {
  return (
    <ContaReportShell
      type="movimentacao"
      title="Movimentação de contas"
      subtitle="Relatorio sintetico e analitico das movimentacoes por conta bancaria, separando permutas do caixa."
    />
  );
}

function ConciliacaoContasRelatorioConteudo() {
  return (
    <ContaReportShell
      type="conciliacao"
      title="Conciliação bancária"
      subtitle="Relatorio sintetico e analitico dos movimentos importados, conciliados, pendentes, ignorados e removidos."
    />
  );
}

const REPORT_CATALOG = [
  {
    id: 'fluxo-caixa',
    title: 'Fluxo de caixa',
    group: 'Caixa',
    description: 'Previsto e realizado por periodo e obra.',
    route: '/financeiro/relatorios',
    permissionKey: 'financeiro.relatorios.visualizar',
    embedded: true,
    component: FluxoCaixaRelatorioConteudo
  },
  {
    id: 'grupo-consolidado',
    title: 'Grupo Consolidado',
    group: 'Executivo',
    description: 'Visao consolidada do grupo e indicadores executivos.',
    route: '/financeiro/relatorios/grupo-consolidado',
    permissionKey: 'financeiro.relatorios.grupo_consolidado',
    visibilityKey: 'relatorios.financeiro.grupo_consolidado',
    component: FinanceiroExecutivoGrupo
  },
  {
    id: 'fluxo-consolidado',
    title: 'Fluxo Consolidado',
    group: 'Caixa',
    description: 'Fluxo consolidado entre empresas do grupo.',
    route: '/financeiro/relatorios/fluxo-consolidado',
    permissionKey: 'financeiro.relatorios.fluxo_consolidado',
    visibilityKey: 'relatorios.financeiro.fluxo_consolidado',
    component: FinanceiroFluxoConsolidado
  },
  {
    id: 'dre',
    title: 'DRE',
    group: 'Resultado',
    description: 'Resultado gerencial por categorias financeiras.',
    route: '/financeiro/relatorios/dre',
    permissionKey: 'financeiro.relatorios.dre',
    visibilityKey: 'relatorios.financeiro.dre',
    component: FinanceiroDre
  },
  {
    id: 'diagnostico-dre',
    title: 'Diagnostico DRE',
    group: 'Resultado',
    description: 'Consistencias e pendencias que impactam a DRE.',
    route: '/financeiro/relatorios/dre/diagnostico',
    permissionKey: 'financeiro.relatorios.diagnostico_dre',
    visibilityKey: 'relatorios.financeiro.diagnostico_dre',
    component: FinanceiroDiagnosticoDre
  },
  {
    id: 'entre-empresas',
    title: 'Entre Empresas',
    group: 'Governanca',
    description: 'Movimentos entre empresas e eliminacoes no consolidado.',
    route: '/financeiro/relatorios/intercompany',
    permissionKey: 'financeiro.relatorios.intercompany',
    visibilityKey: 'relatorios.financeiro.intercompany',
    component: FinanceiroIntercompany
  },
  {
    id: 'endividamento',
    title: 'Endividamento',
    group: 'Bancos',
    description: 'Acompanhamento de dividas e compromissos bancarios.',
    route: '/financeiro/relatorios/endividamento',
    permissionKey: 'financeiro.relatorios.endividamento',
    visibilityKey: 'relatorios.financeiro.endividamento',
    component: FinanceiroEndividamento
  },
  {
    id: 'movimentacao-contas',
    title: 'Movimentacao de Contas',
    group: 'Bancos',
    description: 'Sintetico e analitico de entradas, saidas e permutas por conta.',
    route: '/financeiro/relatorios?relatorio=movimentacao-contas',
    permissionKey: 'financeiro.relatorios.movimentacao_contas',
    visibilityKey: 'relatorios.financeiro.movimentacao_contas',
    embedded: true,
    component: MovimentacaoContasRelatorioConteudo
  },
  {
    id: 'conciliacao-contas',
    title: 'Conciliacao Bancaria',
    group: 'Bancos',
    description: 'Sintetico e analitico dos OFX conciliados, pendentes e ignorados.',
    route: '/financeiro/relatorios?relatorio=conciliacao-contas',
    permissionKey: 'financeiro.relatorios.conciliacao_contas',
    visibilityKey: 'relatorios.financeiro.conciliacao_contas',
    embedded: true,
    component: ConciliacaoContasRelatorioConteudo
  },
  {
    id: 'analitico',
    title: 'Analitico',
    group: 'Titulos',
    description: 'Extrato analitico dos titulos financeiros.',
    route: '/financeiro/relatorios/analitico',
    permissionKey: 'financeiro.relatorios.analitico',
    visibilityKey: 'relatorios.financeiro.analitico',
    component: FinanceiroRelatorioAnalitico
  },
  {
    id: 'financeiro-obras',
    title: 'Financeiro de Obras',
    group: 'Obras',
    description: 'Realizado, comprometido e a realizar por obra.',
    route: '/financeiro/relatorios/financeiro-obras',
    permissionKey: 'financeiro.relatorios.financeiro_obras',
    visibilityKey: 'relatorios.financeiro.financeiro_obras',
    component: FinanceiroObras
  },
  {
    id: 'resultado-obras',
    title: 'Resultado de Obras',
    group: 'Obras',
    description: 'Resultado financeiro agregado por obra.',
    route: '/financeiro/relatorios/resultado-obras',
    permissionKey: 'financeiro.relatorios.resultado_obras',
    visibilityKey: 'relatorios.financeiro.resultado_obras',
    component: FinanceiroResultadoObras
  },
  {
    id: 'centros-custo',
    title: 'Centros de Custo',
    group: 'Obras',
    description: 'Resultado agrupado por centro de custo.',
    route: '/financeiro/relatorios/centros-custo',
    permissionKey: 'financeiro.relatorios.centros_custo',
    visibilityKey: 'relatorios.financeiro.centros_custo',
    component: FinanceiroResultadoCentrosCusto
  }
];

/*
  R25 — o cartão da lista lateral trocou a paleta crua (blue/slate com
  degrau) por tokens. O estado ATIVO deixou de depender só de fundo
  colorido: ganhou `aria-current`, que é o que um leitor de tela usa, e a
  borda de destaque vem do token primário.

  R10 — o rótulo do grupo estava em 10px, abaixo do piso de 12px da
  escala; foi para `text-xs` (12). Vale a decisão D4: leitura vence
  densidade.
*/
function ReportListItem({ report, active, onClick }) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? 'border-[var(--c-primary)] bg-[var(--sem-info-bg)] shadow-sm'
          : 'border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary)] hover:bg-[var(--ui-surface-soft)]'
      }`}
      onClick={onClick}
    >
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--c-muted)]">
        {report.group}
      </span>
      <span className="block text-sm font-semibold text-[var(--c-text)]">{report.title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-[var(--c-muted)]">{report.description}</span>
    </button>
  );
}

function getReportFullScreenRoute(report) {
  if (!report.embedded) {
    return report.route;
  }

  const params = new URLSearchParams({
    relatorio: report.id,
    tela: 'inteira'
  });

  return `/financeiro/relatorios?${params.toString()}`;
}

export default function FinanceiroRelatorios() {
  const { user } = useAuth();
  const { isVisible } = useUiVisibility();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const isFullScreenMode = searchParams.get('tela') === 'inteira';

  const availableReports = useMemo(
    () => REPORT_CATALOG.filter((report) => (
      canViewFinanceiroRelatorio(user, report.permissionKey) &&
      (!report.visibilityKey || isVisible(report.visibilityKey))
    )),
    [isVisible, user]
  );

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return availableReports;

    return availableReports.filter((report) =>
      [report.title, report.group, report.description].some((value) =>
        String(value || '').toLowerCase().includes(term)
      )
    );
  }, [availableReports, search]);

  const selectedId = searchParams.get('relatorio') || availableReports[0]?.id || 'fluxo-caixa';
  const selectedReport =
    availableReports.find((report) => report.id === selectedId) || availableReports[0] || null;

  if (!selectedReport) {
    return (
      <Pagina className="financeiro-relatorios-page">
        <PageHeader
          titulo="Relatórios Financeiros"
          descricao="Nenhum relatório liberado para o seu acesso."
        />
        <div className="empty-state">
          <strong>Nenhum relatório financeiro liberado.</strong>
          <span>Solicite ao administrador a permissão granular para acessar relatórios financeiros.</span>
        </div>
      </Pagina>
    );
  }

  const SelectedReportComponent = selectedReport.component;

  function selectReport(report) {
    setSearchParams(report.id === 'fluxo-caixa' ? {} : { relatorio: report.id });
  }

  if (isFullScreenMode && selectedReport.embedded) {
    return (
      <Pagina className="financeiro-relatorios-page financeiro-relatorios-page--full">
        {/*
          O grupo do relatório vira a CONTAGEM da faixa (renderiza em
          <strong>, na linha de apoio) em vez de um texto solto de 11px
          por cima do canvas — R5/B5 e R10 no mesmo movimento.
        */}
        {/*
          SEM seta de voltar aqui, e a decisão é do trinco de navegação,
          não minha: `scripts/trinco-navegacao.json` congela quantos
          destinos cada arquivo escreve à mão, e o número só DESCE — o
          `to:` desta seta fazia esta tela subir de 3 para 4 e reprovava o
          `test:responsive`. A saída da tela inteira é o menu lateral e o
          voltar do navegador; se o cliente quiser a seta, o caminho certo
          é o destino entrar no `navigationConfig`, não mais um literal
          aqui. Está anotado como decisão pendente no relatório da leva.
        */}
        <PageHeader
          titulo={selectedReport.title}
          contagem={selectedReport.group}
          descricao={selectedReport.description}
        />

        <div className="financeiro-relatorios-content">
          <Suspense fallback={<div className="app-empty-card">Carregando relatório...</div>}>
            <SelectedReportComponent isVisible={isVisible} embutido />
          </Suspense>
        </div>
      </Pagina>
    );
  }

  return (
    <Pagina className="financeiro-relatorios-page">
      {/*
        NAVEGAÇÃO SAIU DA FAIXA (decisão do cliente, 04/09) — e com ela
        acaba um conflito entre duas regras nossas.

        A faixa trazia três atalhos — Contas a Receber, Contas a Pagar e
        Cadastros — como ações secundárias. A D3 os pôs ali por eliminação:
        a R11 proíbe navegação dentro do menu "⋯", então sobrou a barra de
        ações. Só que a C6 proíbe exatamente isso: navegação vestida de
        ação. As duas regras se empurravam porque a premissa das duas
        estava errada.

        A resolução: os dois lugares — o menu "⋯" e a barra de ações — são
        para ações SOBRE ESTA TELA. Caminho para outra tela não pertence a
        nenhum dos dois. Ele mora no hub do módulo, no breadcrumb e no
        Ctrl+K, que existem para isso.

        Conferido antes de remover: os três destinos estão no hub do
        Financeiro (`fin-receber`, `fin-pagar`, `fin-cadastros` no
        navigationConfig), então nada ficou inalcançável — e os dois
        primeiros ganham de brinde a URL nova com o recorte declarado
        (D2), em vez dos endereços antigos que só sobrevivem por
        redirecionamento.
      */}
      <PageHeader
        titulo="Relatórios Financeiros"
        contagem={`${availableReports.length} relatório(s) liberado(s)`}
        descricao="Escolha um relatório na coluna lateral e trabalhe no painel principal sem perder contexto."
      />

      <div className="financeiro-relatorios-layout grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="card sol-surface-card financeiro-relatorios-sidebar h-fit xl:sticky xl:top-4">
          <div className="border-b border-[var(--c-border)] px-4 py-4">
            <h2 className="text-lg font-semibold text-[var(--c-text)]">Relatórios</h2>
            {/*
              R16/F1 — UMA busca por contexto, ocupando a largura da faixa
              do bloco (.app-busca: cresce entre 220 e 480px). A contagem
              de disponíveis saiu daqui: ela já vive na faixa fixa do topo,
              e repetir a mesma informação em dois lugares é B3.
              R23 não se aplica: busca textual nunca tem botão.
            */}
            <input
              type="search"
              className="input app-busca mt-3 w-full input-sm"
              aria-label="Buscar relatório"
              placeholder="Buscar relatório..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="max-h-[calc(100vh-270px)] space-y-2 overflow-y-auto p-3">
            {filteredReports.length ? (
              filteredReports.map((report) => (
                <ReportListItem
                  key={report.id}
                  report={report}
                  active={selectedReport.id === report.id}
                  onClick={() => selectReport(report)}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--c-border)] px-4 py-6 text-sm text-[var(--c-muted)]">
                Nenhum relatório encontrado para essa busca.
              </div>
            )}
          </div>
        </aside>

        <section className="financeiro-relatorios-content min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 shadow-sm">
            <div>
              <span className="block text-xs font-bold uppercase tracking-wide text-[var(--c-muted)]">
                {selectedReport.group}
              </span>
              <h2 className="text-lg font-semibold text-[var(--c-text)]">{selectedReport.title}</h2>
            </div>
            <Link to={getReportFullScreenRoute(selectedReport)} className="btn btn-outline btn-sm">
              Abrir tela inteira
            </Link>
          </div>

          {/*
            `embutido` — este painel JÁ tem o cabeçalho do relatório logo
            acima, e a página já tem a sua faixa fixa. Sem esta chave, a
            tela filha (DRE, Financeiro de Obras…) desenhava a terceira: um
            segundo `.app-page-header` grudando na mesma rolagem e o mesmo
            título escrito duas vezes (R16/B3). Quem não conhece a prop
            simplesmente a ignora — nenhum contrato muda (R21).
          */}
          <Suspense fallback={<div className="app-empty-card">Carregando relatório...</div>}>
            <SelectedReportComponent isVisible={isVisible} embutido />
          </Suspense>
        </section>
      </div>
    </Pagina>
  );
}
