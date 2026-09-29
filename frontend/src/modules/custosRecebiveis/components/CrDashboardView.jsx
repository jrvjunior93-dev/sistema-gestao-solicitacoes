import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineBars3,
  HiOutlineBanknotes,
  HiOutlineBuildingOffice2,
  HiOutlineCheckCircle,
  HiOutlineChevronDoubleUp,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineChevronUp,
  HiOutlineExclamationTriangle,
  HiOutlineScale,
  HiOutlineWallet
} from 'react-icons/hi2';
import { BlocoConteudo } from '../../../components/padrao';
import { TIPO_BLOCOS, usePreferenciaDeLista } from '../../../contexts/PreferenciasContext';
import {
  listarCustosRecebiveisObras,
  mensagemLegivel,
  obterCustosRecebiveisDashboard
} from '../services/custosRecebiveis';
import {
  VALOR_OCULTO,
  calcularResultadoDoResumo,
  calcularResultadoMes
} from '../utils/resultadoMes';
import CrMonthlySummaryCard from './CrMonthlySummaryCard';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC'
});

function formatMonth(value) {
  if (!value) return '—';
  const date = new Date(`${value}-01T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : monthFormatter.format(date).replace('.', '');
}

function formatPercent(value) {
  return value == null
    ? 'Sem base'
    : `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/*
  VALORES OCULTOS (Painel do Gestor com o "olho" fechado, 29/09/2026).
  Com a prop `valoresOcultos`, TODO valor financeiro desta visão sai como
  VALOR_OCULTO — mesmo que algum número chegue da API por engano: nada é
  formatado, nem em title, aria-label, atributos data ou largura de barra. Rótulos, nomes
  de obra, situação e mês continuam. Tons que dependem do valor (positivo,
  negativo, alerta) ficam neutros, para a cor não entregar o sinal.
  Nos textos dos pontos de atenção (montados no servidor), qualquer quantia
  em reais é trocada pelo marcador como segunda barreira.
*/
const QUANTIA_EM_REAIS = /-?R\$\s?-?\d(?:[\d.]*\d)?(?:,\d+)?/g;

function textoSemQuantias(texto, valoresOcultos) {
  if (!valoresOcultos || !texto) return texto;
  return String(texto).replace(QUANTIA_EM_REAIS, VALOR_OCULTO);
}

// Classes estáveis para o Modo TV do Painel do Gestor: `cr-valor` em todo
// número da carteira; `cr-valor--principal` nos números de destaque.
function Metric({
  label,
  value,
  tone = 'neutral',
  helper = null,
  metric = undefined,
  oculto = false
}) {
  return (
    <div className="cr-ops-metric" data-tone={oculto ? 'neutral' : tone} data-metric={metric}>
      <span>{label}</span>
      <strong className="cr-valor cr-valor--principal" data-oculto={oculto || undefined}>
        {oculto ? VALOR_OCULTO : value}
      </strong>
      {helper && !oculto ? <small>{helper}</small> : null}
    </div>
  );
}

function TrendPanel({
  title,
  icon: Icon,
  rows,
  primaryKey,
  primaryLabel,
  secondaryKey,
  secondaryLabel,
  valoresOcultos = false
}) {
  const maxValue = useMemo(() => Math.max(
    1,
    ...rows.flatMap((row) => [
      Number(row[primaryKey]) || 0,
      Number(row[secondaryKey]) || 0
    ])
  ), [primaryKey, rows, secondaryKey]);

  return (
    <section className="cr-section cr-trend-panel">
      <div className="cr-trend-heading">
        <div>
          <Icon className="h-5 w-5" />
          <strong>{title}</strong>
        </div>
        <div className="cr-trend-legend" aria-label="Legenda">
          <span data-series="primary">{primaryLabel}</span>
          <span data-series="secondary">{secondaryLabel}</span>
        </div>
      </div>
      <div className="cr-trend-list">
        {valoresOcultos ? rows.map((row) => (
          // Sem barras: a largura delas entregaria a proporção dos valores.
          <div className="cr-trend-row" key={`${title}-${row.competencia}`} data-oculto="true">
            <span>{formatMonth(row.competencia)}</span>
            <div className="cr-trend-bars" aria-hidden="true" />
            <strong className="cr-valor" data-oculto="true">{VALOR_OCULTO}</strong>
          </div>
        )) : rows.map((row) => {
          const primary = Number(row[primaryKey]) || 0;
          const secondary = Number(row[secondaryKey]) || 0;
          return (
            <div className="cr-trend-row" key={`${title}-${row.competencia}`}>
              <span>{formatMonth(row.competencia)}</span>
              <div className="cr-trend-bars">
                <i
                  data-series="primary"
                  style={{ width: `${Math.max(0, (primary / maxValue) * 100)}%` }}
                  title={`${primaryLabel}: ${currency.format(primary)}`}
                />
                <i
                  data-series="secondary"
                  style={{ width: `${Math.max(0, (secondary / maxValue) * 100)}%` }}
                  title={`${secondaryLabel}: ${currency.format(secondary)}`}
                />
              </div>
              <strong className="cr-valor">{currency.format(secondary)}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* =====================================================================
   ORDEM DOS CARDS DE "PLANEJAMENTO MENSAL POR OBRA" (29/09/2026)
   ---------------------------------------------------------------------
   Pedido do proprietário: o administrador escolhe um CRITÉRIO ou arrasta
   os cards para uma ordem manual, e a escolha fica salva POR USUÁRIO.

   Persistência: o mesmo armazém de preferências dos BlocosPersonalizaveis
   (`usePreferenciaDeLista`, tipo `blocos`: leitura síncrona, gravação no
   banco com 700ms de atraso e espelho no localStorage). Valor guardado:
   `{ criterio, ordemManual: [obraId, ...] }`. Trocar de critério NÃO apaga
   a ordem manual — voltar para "Ordem manual" reencontra o arranjo.

   A ordem manual é por OBRA (não por card): com várias competências, os
   cards da mesma obra andam juntos, do mês mais recente para o mais antigo.
   Obra que não está na ordem salva vai para o fim (por nome). Obra
   escondida pelos filtros mantém a posição dela na ordem salva.
   ===================================================================== */
const CHAVE_ORDEM_OBRAS = 'custos-recebiveis:dashboard:ordem-obras';

const CRITERIOS_ORDEM = [
  { id: 'PENDENCIAS', rotulo: 'Pendências primeiro' },
  { id: 'PIOR_RESULTADO', rotulo: 'Pior resultado primeiro' },
  { id: 'NOME', rotulo: 'Nome da obra (A–Z)' },
  { id: 'CODIGO', rotulo: 'Código' },
  { id: 'MANUAL', rotulo: 'Ordem manual (arrastar)' }
];
const CRITERIO_PADRAO = 'PENDENCIAS';
const CRITERIOS_VALIDOS = new Set(CRITERIOS_ORDEM.map((item) => item.id));

// Mesmo limiar D-3 de `utils/prazos.js` (PRAZO_PROXIMO_DIAS, não exportado).
const PRAZO_PROXIMO_DIAS = 3;
const CELULAR_ORDEM = '(max-width: 767px)';

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function nomeObra(item) {
  return String(item.obra?.nome || '');
}

function porNome(a, b) {
  return collator.compare(nomeObra(a), nomeObra(b))
    || String(b.competencia).localeCompare(String(a.competencia));
}

/*
  Pendência de prazo de uma obra, a partir de `obra.prazos` da listagem de
  obras do módulo (GET /custos-recebiveis/obras — o dashboard não traz
  prazos). Menor = mais urgente:
    0 obra travada (`travada`, ou `travaria` no modo observação);
    1 prazo vencido (planejamento ou medição aprovada);
    2 prazo aberto que vence em até 3 dias;
    3 sem pendência de prazo (ou prazos indisponíveis).
  `peso` desempata dentro da faixa: mais dias de atraso primeiro; no prazo
  próximo, menos dias restantes primeiro.
*/
function pendenciaDeObra(prazos) {
  if (!prazos) return { faixa: 3, peso: 0 };
  const itens = [prazos.planejamento, prazos.medicao].filter(Boolean);
  const vencidos = itens.filter((item) => item.situacao === 'VENCIDO');
  const atraso = vencidos.reduce((maior, item) => Math.max(maior, Number(item.dias) || 0), 0);
  if (prazos.travada || prazos.travaria) return { faixa: 0, peso: -atraso };
  if (vencidos.length) return { faixa: 1, peso: -atraso };
  const proximos = itens.filter((item) => (
    item.situacao === 'ABERTO' && (Number(item.dias) || 0) <= PRAZO_PROXIMO_DIAS
  ));
  if (proximos.length) {
    return { faixa: 2, peso: Math.min(...proximos.map((item) => Number(item.dias) || 0)) };
  }
  return { faixa: 3, peso: 0 };
}

function ordenarCards(cards, criterio, { ordemManual, prazosPorObra, valoresOcultos = false }) {
  const lista = cards.slice();
  // Valores ocultos: não há resultado para comparar — "Pior resultado"
  // cai para a ordem manual salva e, fora dela, o nome da obra (a escolha
  // do usuário não é regravada; ao abrir o olho o critério volta a valer).
  if (criterio === 'PIOR_RESULTADO' && valoresOcultos) {
    return ordenarCards(cards, 'MANUAL', { ordemManual, prazosPorObra });
  }
  if (criterio === 'NOME') return lista.sort(porNome);
  if (criterio === 'CODIGO') {
    return lista.sort((a, b) => {
      const ca = String(a.obra?.codigo || '');
      const cb = String(b.obra?.codigo || '');
      if (!ca !== !cb) return ca ? -1 : 1; // sem código vai para o fim
      return collator.compare(ca, cb) || porNome(a, b);
    });
  }
  if (criterio === 'PIOR_RESULTADO') {
    const resultado = new Map(lista.map((item) => [item, calcularResultadoDoResumo(item)]));
    return lista.sort((a, b) => {
      const ra = resultado.get(a);
      const rb = resultado.get(b);
      if (ra.semPlanejamento !== rb.semPlanejamento) return ra.semPlanejamento ? 1 : -1;
      return (ra.valor - rb.valor) || porNome(a, b);
    });
  }
  if (criterio === 'MANUAL') {
    const posicao = new Map(ordemManual.map((id, indice) => [Number(id), indice]));
    const indice = (item) => (posicao.has(Number(item.obra?.id))
      ? posicao.get(Number(item.obra?.id))
      : Number.POSITIVE_INFINITY);
    return lista.sort((a, b) => {
      const ia = indice(a);
      const ib = indice(b);
      if (ia !== ib) return ia < ib ? -1 : 1;
      // Mesma obra: mês mais recente primeiro. Obras fora da ordem salva:
      // entre elas, por nome.
      if (Number(a.obra?.id) === Number(b.obra?.id)) {
        return String(b.competencia).localeCompare(String(a.competencia));
      }
      return porNome(a, b);
    });
  }
  // PENDENCIAS (padrão). Sem prazos disponíveis todas caem na faixa 3 e o
  // desempate é o de antes desta mudança: mais alertas do dashboard, nome.
  return lista.sort((a, b) => {
    const pa = pendenciaDeObra(prazosPorObra?.get(Number(a.obra?.id)));
    const pb = pendenciaDeObra(prazosPorObra?.get(Number(b.obra?.id)));
    return (pa.faixa - pb.faixa)
      || (pa.peso - pb.peso)
      || (Number(b.alertas || 0) - Number(a.alertas || 0))
      || porNome(a, b);
  });
}

/*
  Reordena só as obras VISÍVEIS dentro da ordem salva: as posições que elas
  ocupam na ordem completa são reaproveitadas na nova sequência, e as obras
  escondidas pelos filtros ficam onde estavam.
*/
function mesclarOrdemVisivel(ordemSalva, visiveisNovaOrdem) {
  const visiveis = new Set(visiveisNovaOrdem);
  const completa = [
    ...ordemSalva,
    ...visiveisNovaOrdem.filter((id) => !ordemSalva.includes(id))
  ];
  const fila = visiveisNovaOrdem.slice();
  return completa.map((id) => (visiveis.has(id) ? fila.shift() : id));
}

function lerOrdemManual(valor) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set();
  return valor
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0 && !vistos.has(id) && vistos.add(id));
}

export default function CrDashboardView({
  competencia,
  competencias = [],
  obraFilterId = null,
  classificacaoFilter = '',
  presentation = 'default',
  canOpenPlanning = false,
  onOpenArea,
  loadDashboard = obterCustosRecebiveisDashboard,
  // Opcional: a listagem de obras do módulo (com `prazos`) quando a página
  // já a tem em mãos. Sem ela, o critério "Pendências primeiro" busca a
  // listagem uma vez por competência.
  obras: obrasComPrazos = null,
  loadObras = listarCustosRecebiveisObras,
  // Painel do Gestor (29/09/2026). Ausentes = comportamento do módulo.
  //  - valoresOcultos: "olho" fechado; nenhum valor financeiro no DOM.
  //  - ordemStorageKey: chave da preferência de ordem dos cards (o painel
  //    guarda a sua separada da do módulo).
  //  - buscarPrazos: false impede a busca de GET /custos-recebiveis/obras
  //    (a resposta traz planilha_geral, contratos com valor_total etc.).
  //    Com valores ocultos a busca também não acontece. Sem prazos,
  //    "Pendências primeiro" ordena pelos alertas do dashboard e o nome.
  valoresOcultos = false,
  ordemStorageKey = CHAVE_ORDEM_OBRAS,
  buscarPrazos = true
}) {
  const oculto = Boolean(valoresOcultos);
  const money = (value) => (oculto ? VALOR_OCULTO : currency.format(value || 0));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const competenciasParam = (competencias.length ? competencias : [competencia]).join(',');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setData(await loadDashboard(
        competencia,
        obraFilterId,
        competenciasParam,
        classificacaoFilter
      ));
    } catch (requestError) {
      setData(null);
      setError(mensagemLegivel(requestError, 'Erro ao carregar visão geral.'));
    } finally {
      setLoading(false);
    }
  }, [classificacaoFilter, competencia, competenciasParam, loadDashboard, obraFilterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const history = Array.isArray(data?.historico) ? data.historico : [];
  const alerts = Array.isArray(data?.alertas) ? data.alertas : [];
  const macros = Array.isArray(data?.macros) ? data.macros : [];
  const workSummaries = Array.isArray(data?.obras_resumo) ? data.obras_resumo : [];
  const isWorkContext = data?.escopo?.tipo === 'OBRA';
  const visibleWorkSummaries = useMemo(() => {
    const competenceSet = new Set(
      (competencias.length ? competencias : [competencia]).map(String)
    );
    return workSummaries
      .filter((item) => (
        String(item.obra?.tipo_centro_custo || '').toUpperCase() === 'OBRA'
        && competenceSet.has(String(item.competencia))
        && (!obraFilterId || Number(item.obra?.id) === Number(obraFilterId))
        && (!classificacaoFilter
          || String(item.obra?.classificacao || '').toUpperCase() === classificacaoFilter)
      ))
      .sort((a, b) => (
        Number(b.alertas || 0) - Number(a.alertas || 0)
        || String(a.obra?.nome || '').localeCompare(String(b.obra?.nome || ''), 'pt-BR')
        || String(b.competencia).localeCompare(String(a.competencia))
      ));
  }, [classificacaoFilter, competencia, competencias, obraFilterId, workSummaries]);
  /* ----- ordem dos cards (critério ou manual, por usuário) ----------- */
  // Só a ordem (critério + ids de obra) é gravada; nenhum valor.
  const [preferenciaOrdem, gravarPreferenciaOrdem] = usePreferenciaDeLista(
    ordemStorageKey || CHAVE_ORDEM_OBRAS,
    TIPO_BLOCOS
  );
  const criterio = CRITERIOS_VALIDOS.has(preferenciaOrdem?.criterio)
    ? preferenciaOrdem.criterio
    : CRITERIO_PADRAO;
  const ordemManual = useMemo(
    () => lerOrdemManual(preferenciaOrdem?.ordemManual),
    [preferenciaOrdem]
  );
  const [prazosCarregados, setPrazosCarregados] = useState({
    chave: '',
    estado: 'ocioso',
    itens: []
  });
  const temObrasDeFora = Array.isArray(obrasComPrazos);
  const podeBuscarPrazos = buscarPrazos !== false && !oculto;
  const precisaPrazos = criterio === 'PENDENCIAS' && !temObrasDeFora && podeBuscarPrazos;
  const chavePrazos = String(competencia || '');

  // Pedido em curso fica num ref (não no estado): com o estado nas
  // dependências, o próprio "carregando" cancelaria a busca.
  const pedidoPrazosRef = useRef('');
  useEffect(() => {
    if (!precisaPrazos || pedidoPrazosRef.current === chavePrazos) return undefined;
    pedidoPrazosRef.current = chavePrazos;
    const controle = new AbortController();
    let pendente = true;
    setPrazosCarregados({ chave: chavePrazos, estado: 'carregando', itens: [] });
    loadObras({ competencia: chavePrazos }, { signal: controle.signal })
      .then((resposta) => {
        pendente = false;
        if (controle.signal.aborted) return;
        setPrazosCarregados({
          chave: chavePrazos,
          estado: 'pronto',
          itens: Array.isArray(resposta?.items) ? resposta.items : []
        });
      })
      .catch(() => {
        pendente = false;
        // Sem permissão de obras, rota fora ou rede: a ordem cai no
        // desempate por alertas do dashboard e a tela avisa em uma linha.
        if (controle.signal.aborted) return;
        setPrazosCarregados({ chave: chavePrazos, estado: 'erro', itens: [] });
      });
    return () => {
      if (!pendente) return;
      // Desmontou (ou mudou a competência) no meio: libera para buscar de novo.
      controle.abort();
      pedidoPrazosRef.current = '';
    };
  }, [chavePrazos, loadObras, precisaPrazos]);

  const prazosPorObra = useMemo(() => {
    const fonte = temObrasDeFora ? obrasComPrazos : prazosCarregados.itens;
    return new Map(
      (fonte || [])
        .filter((obra) => obra && obra.prazos)
        .map((obra) => [Number(obra.id), obra.prazos])
    );
  }, [obrasComPrazos, prazosCarregados.itens, temObrasDeFora]);

  const orderedWorkSummaries = useMemo(
    () => ordenarCards(visibleWorkSummaries, criterio, {
      ordemManual,
      prazosPorObra,
      valoresOcultos: oculto
    }),
    [criterio, ordemManual, oculto, prazosPorObra, visibleWorkSummaries]
  );
  const obraIdsVisiveis = useMemo(() => {
    const ids = [];
    orderedWorkSummaries.forEach((item) => {
      const id = Number(item.obra?.id);
      if (id && !ids.includes(id)) ids.push(id);
    });
    return ids;
  }, [orderedWorkSummaries]);

  const modoManual = criterio === 'MANUAL';
  const [ehCelular, setEhCelular] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.matchMedia?.(CELULAR_ORDEM).matches)
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(CELULAR_ORDEM);
    const ouvinte = (evento) => setEhCelular(evento.matches);
    media.addEventListener('change', ouvinte);
    return () => media.removeEventListener('change', ouvinte);
  }, []);
  // Arrastar é HTML5 nativo, que não responde a toque: no celular ficam os
  // botões de mover (mesma regra dos BlocosPersonalizaveis).
  const podeArrastar = modoManual && !ehCelular;
  const [arrastando, setArrastando] = useState(null);
  const [alvoArrasto, setAlvoArrasto] = useState(null);
  const [anuncioOrdem, setAnuncioOrdem] = useState('');
  const alcasRef = useRef(new Map());
  const focoPendenteRef = useRef(null);

  const gravarOrdem = useCallback((proximoCriterio, proximaOrdem) => {
    gravarPreferenciaOrdem(
      proximoCriterio === CRITERIO_PADRAO && !proximaOrdem.length
        ? null
        : { criterio: proximoCriterio, ordemManual: proximaOrdem }
    );
  }, [gravarPreferenciaOrdem]);

  const alterarCriterio = (evento) => {
    const proximo = CRITERIOS_VALIDOS.has(evento.target.value)
      ? evento.target.value
      : CRITERIO_PADRAO;
    gravarOrdem(proximo, ordemManual);
    setAnuncioOrdem('');
  };

  const moverObra = (obraId, destino, { focar = false } = {}) => {
    const ids = obraIdsVisiveis.slice();
    const origem = ids.indexOf(Number(obraId));
    if (origem < 0) return;
    const alvo = Math.max(0, Math.min(ids.length - 1, destino));
    if (alvo === origem) return;
    ids.splice(alvo, 0, ids.splice(origem, 1)[0]);
    gravarOrdem('MANUAL', mesclarOrdemVisivel(ordemManual, ids));
    const card = orderedWorkSummaries.find((item) => Number(item.obra?.id) === Number(obraId));
    setAnuncioOrdem(`${card?.obra?.nome || 'Obra'} movida para a posição ${alvo + 1} de ${ids.length}.`);
    if (focar) focoPendenteRef.current = Number(obraId);
  };

  useEffect(() => {
    const id = focoPendenteRef.current;
    if (!id) return;
    focoPendenteRef.current = null;
    alcasRef.current.get(id)?.focus();
  }, [obraIdsVisiveis]);

  const teclaNaAlca = (evento, obraId, posicao) => {
    const mapa = {
      ArrowUp: posicao - 1,
      ArrowLeft: posicao - 1,
      ArrowDown: posicao + 1,
      ArrowRight: posicao + 1,
      Home: 0,
      End: obraIdsVisiveis.length - 1
    };
    if (!(evento.key in mapa)) return;
    evento.preventDefault();
    moverObra(obraId, mapa[evento.key], { focar: true });
  };

  const encerrarArrasto = () => {
    setArrastando(null);
    setAlvoArrasto(null);
  };

  const filteredPortfolio = useMemo(() => {
    const totals = visibleWorkSummaries.reduce((result, item) => ({
      custo_planejado: result.custo_planejado + (Number(item.custo_planejado) || 0),
      custo_realizado: result.custo_realizado + (Number(item.custo_realizado) || 0),
      recebivel_previsto: result.recebivel_previsto + (Number(item.recebivel_previsto) || 0),
      medicao_aprovada: result.medicao_aprovada + (Number(item.medicao_aprovada) || 0),
      glosa: result.glosa + (Number(item.glosa) || 0),
      receita_recebida: result.receita_recebida + (Number(item.receita_recebida) || 0),
      saldo_receber: result.saldo_receber + (Number(item.saldo_receber) || 0),
      recebiveis_vencidos: result.recebiveis_vencidos
        + (Number(item.recebiveis_vencidos) || 0)
    }), {
      custo_planejado: 0,
      custo_realizado: 0,
      recebivel_previsto: 0,
      medicao_aprovada: 0,
      glosa: 0,
      receita_recebida: 0,
      saldo_receber: 0,
      recebiveis_vencidos: 0
    });
    const classifications = new Set(
      visibleWorkSummaries
        .map((item) => String(item.obra?.classificacao || '').toUpperCase())
        .filter(Boolean)
    );
    const publicPending = visibleWorkSummaries.filter((item) => (
      String(item.obra?.classificacao || '').toUpperCase() === 'PUBLICA'
      && item.medicao_aprovada == null
    )).length;
    const custoDesvio = totals.custo_realizado - totals.custo_planejado;
    return {
      ...totals,
      desvio_custo: custoDesvio,
      percentual_custo: totals.custo_planejado > 0
        ? (totals.custo_realizado / totals.custo_planejado) * 100
        : null,
      classificacao: classifications.size === 1 ? [...classifications][0] : '',
      total_obras: new Set(
        visibleWorkSummaries.map((item) => Number(item.obra?.id)).filter(Boolean)
      ).size,
      medicoes_pendentes: publicPending
    };
  }, [visibleWorkSummaries]);
  const portfolioClassification = filteredPortfolio.classificacao;
  // "Títulos vencidos" é quantidade, não quantia: com valores ocultos só
  // vira marcador se o servidor também a ocultar (null).
  const vencidosOcultos = oculto
    && visibleWorkSummaries.some((item) => item.recebiveis_vencidos == null);
  /*
    Resultado da carteira (pedido do proprietário, 29/09): a mesma regra do
    card de mês, sobre os TOTAIS exibidos acima — Previsto (recebíveis) −
    Planejado (custos); quando Realizado > Planejado, Previsto − Realizado.
    Sem classificação: fórmula genérica ("Recebível previsto − …"), porque a
    carteira mistura obras públicas e privadas.
  */
  const portfolioResult = calcularResultadoMes({
    classificacao: null,
    recebivelPrevisto: filteredPortfolio.recebivel_previsto,
    custoPlanejado: filteredPortfolio.custo_planejado,
    custoRealizado: filteredPortfolio.custo_realizado,
    valoresOcultos: oculto
  });
  let portfolioResultTone = 'neutral';
  const portfolioResultComValor = !portfolioResult.oculto && !portfolioResult.semPlanejamento;
  if (portfolioResultComValor && portfolioResult.valor > 0) portfolioResultTone = 'positive';
  if (portfolioResultComValor && portfolioResult.valor < 0) portfolioResultTone = 'negative';

  if (loading && !data) {
    return <section className="cr-section cr-empty-state">Carregando visão geral...</section>;
  }
  if (error) {
    return (
      <section className="cr-section cr-empty-state cr-empty-state--large">
        <HiOutlineExclamationTriangle className="h-6 w-6" />
        <strong>Não foi possível carregar o dashboard</strong>
        <span>{error}</span>
        <button type="button" className="btn btn-outline" onClick={load}>Tentar novamente</button>
      </section>
    );
  }

  return (
    <div className={`cr-ops-dashboard${presentation === 'gestor' ? ' cr-ops-dashboard--gestor' : ''}`}>
      {/*
        B1/B2 (matriz) — A CARTEIRA CONSOLIDADA É O BLOCO DA TELA.

        A visão geral era feita só de `cr-section`: um dialeto local que
        repete borda, raio e fundo com números próprios e não é o bloco que a
        B1 procura sobre o canvas. Esta seção — a que responde a pergunta
        central da aba — passa a ser o `BlocoConteudo` padrão, na variante
        primária com a barra na cor do módulo (B2: UM primário por tela).

        Nada de texto mudou de lugar: o olho-de-boi virou o título do bloco, a
        contagem do recorte virou `contagem`, a linha das competências virou
        `descricao` e o "Atualizar" continua à direita, agora em `acoes`. O
        espaçamento interno é o do componente padrão — por isso a classe
        `cr-ops-overview`, que só declarava um grid com gap próprio, sai.
      */}
      <BlocoConteudo
        titulo="Carteira consolidada"
        contagem={`${filteredPortfolio.total_obras} obra(s) no recorte executivo`}
        descricao={`${competencias.length > 1
          ? `${competencias.length} competências selecionadas`
          : `Competência ${formatMonth(competencias[0] || competencia)}`
        } · valores realizados consideram baixas financeiras ativas.`}
        variante="primario"
        cor="var(--cr-accent)"
        acoes={(
          <button type="button" className="btn btn-outline" onClick={load} disabled={loading}>
            <HiOutlineArrowPath className="h-4 w-4" />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        )}
      >
        <div className="cr-ops-ledger">
          <div className="cr-ops-ledger__group">
            <div className="cr-ops-ledger__title">
              <HiOutlineWallet />
              <span>Custos</span>
            </div>
            <div className="cr-ops-metrics">
              <Metric
                label="Planejado"
                value={money(filteredPortfolio.custo_planejado)}
                tone="context"
                oculto={oculto}
              />
              <Metric
                label="Realizado"
                value={money(filteredPortfolio.custo_realizado)}
                tone="negative"
                oculto={oculto}
              />
              <Metric
                label="Desvio"
                metric="resultado"
                value={portfolioResultComValor
                  ? currency.format(portfolioResult.valor)
                  : 'Sem planejamento'}
                helper={portfolioResultComValor ? portfolioResult.formula : null}
                tone={portfolioResultTone}
                oculto={portfolioResult.oculto}
              />
              <Metric
                label="Execução"
                value={oculto ? null : formatPercent(filteredPortfolio.percentual_custo)}
                tone={Number(filteredPortfolio.percentual_custo) > 100 ? 'negative' : 'neutral'}
                oculto={oculto}
              />
            </div>
          </div>

          <div className="cr-ops-ledger__group">
            <div className="cr-ops-ledger__title">
              <HiOutlineBanknotes />
              <span>Recebíveis</span>
            </div>
            <div className="cr-ops-metrics">
              <Metric
                label={portfolioClassification === 'PUBLICA' ? 'Medição prevista' : 'Previsto'}
                value={money(filteredPortfolio.recebivel_previsto)}
                tone="context"
                oculto={oculto}
              />
              {portfolioClassification === 'PUBLICA' ? (
                <Metric
                  label="Medição aprovada"
                  oculto={oculto}
                  value={filteredPortfolio.medicoes_pendentes === visibleWorkSummaries.length
                    ? 'Aguardando'
                    : money(filteredPortfolio.medicao_aprovada)}
                  helper={filteredPortfolio.medicoes_pendentes > 0
                    ? `${filteredPortfolio.medicoes_pendentes} competência(s) aguardando`
                    : null}
                  tone={filteredPortfolio.medicoes_pendentes === visibleWorkSummaries.length
                    ? 'warning'
                    : 'context'}
                />
              ) : null}
              {portfolioClassification !== 'PRIVADA' ? (
                <Metric
                  label="Glosa"
                  oculto={oculto}
                  value={money(filteredPortfolio.glosa)}
                  tone={Number(filteredPortfolio.glosa) > 0 ? 'negative' : 'neutral'}
                />
              ) : null}
              <Metric
                label="Recebido"
                oculto={oculto}
                value={money(filteredPortfolio.receita_recebida)}
                tone="actual"
              />
              <Metric
                label="Saldo a receber"
                oculto={oculto}
                value={money(filteredPortfolio.saldo_receber)}
                tone={Number(filteredPortfolio.saldo_receber) > 0 ? 'warning' : 'positive'}
              />
              {portfolioClassification === 'PRIVADA' ? (
                <Metric
                  label="Títulos vencidos"
                  oculto={vencidosOcultos}
                  value={String(filteredPortfolio.recebiveis_vencidos || 0)}
                  tone={Number(filteredPortfolio.recebiveis_vencidos) > 0
                    ? 'negative'
                    : 'neutral'}
                />
              ) : null}
            </div>
          </div>
        </div>
      </BlocoConteudo>

      <section className="cr-section cr-portfolio-planning">
        <div className="cr-section-heading">
          <div>
            <span className="cr-scope-kicker">Decisão por obra</span>
            <h2>Planejamento mensal por obra</h2>
            <p>
              {competencias.length > 1
                ? `${competencias.length} competências selecionadas`
                : `Competência ${formatMonth(competencias[0] || competencia)}`}
              {' '}· os mesmos filtros também compõem a carteira consolidada acima.
            </p>
          </div>
          <div className="cr-ordem-obras">
            <label className="cr-ordem-obras__campo">
              <span>Ordenar por</span>
              {/* Seletor de CONTEXTO (ordem de exibição), não recorte de lista. */}
              <select value={criterio} onChange={alterarCriterio}>
                {CRITERIOS_ORDEM.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>{opcao.rotulo}</option>
                ))}
              </select>
            </label>
            <span className="cr-portfolio-planning__count">
              <HiOutlineBuildingOffice2 className="h-4 w-4" />
              {visibleWorkSummaries.length} card(s)
            </span>
          </div>
        </div>

        {modoManual && visibleWorkSummaries.length ? (
          <p className="cr-ordem-obras__dica">
            {podeArrastar
              ? 'Arraste os cards ou use os botões de mover. A ordem fica salva para você.'
              : 'Use os botões de mover. A ordem fica salva para você.'}
          </p>
        ) : null}
        {criterio === 'PIOR_RESULTADO' && oculto && visibleWorkSummaries.length ? (
          <p className="cr-ordem-obras__dica">
            Valores ocultos: ordem manual e, depois, por nome.
          </p>
        ) : null}
        {criterio === 'PENDENCIAS' && precisaPrazos && prazosCarregados.estado === 'erro'
          && visibleWorkSummaries.length ? (
            <p className="cr-ordem-obras__dica">
              Prazos das obras indisponíveis: ordem pelos alertas do dashboard.
            </p>
          ) : null}
        <span className="sr-only" aria-live="polite">{anuncioOrdem}</span>

        {visibleWorkSummaries.length ? (
          <div
            className="cr-portfolio-planning__grid"
            data-ordem-manual={modoManual || undefined}
            onDragLeave={(evento) => {
              if (!evento.currentTarget.contains(evento.relatedTarget)) setAlvoArrasto(null);
            }}
          >
            {orderedWorkSummaries.map((item, indiceCard) => {
              const obraId = Number(item.obra.id);
              const posicao = obraIdsVisiveis.indexOf(obraId);
              const total = obraIdsVisiveis.length;
              const primeiroDaObra = orderedWorkSummaries
                .findIndex((outro) => Number(outro.obra?.id) === obraId) === indiceCard;
              const card = (
                <CrMonthlySummaryCard
                  key={`${item.obra.id}-${item.competencia}`}
                  presentation={presentation}
                  title={item.obra.nome}
                  eyebrow={`${item.obra.codigo || item.obra.id} · ${formatMonth(item.competencia)}`}
                  classification={item.obra.classificacao}
                  status={item.estado_competencia}
                  custoPlanejado={item.custo_planejado}
                  custoRealizado={item.custo_realizado}
                  recebivelPrevisto={item.recebivel_previsto}
                  recebivelReconhecido={item.recebivel_reconhecido}
                  receitaRecebida={item.receita_recebida}
                  medicaoAprovadaInformada={item.medicao_aprovada != null}
                  glosa={item.glosa}
                  valoresOcultos={oculto}
                  actionLabel="Abrir planejamento"
                  onOpen={canOpenPlanning
                    ? () => onOpenArea?.({
                      destino: 'planejamento',
                      obra_id: item.obra.id,
                      competencia: item.competencia
                    })
                    : null}
                />
              );
              if (!modoManual) {
                // Fora do modo manual o card fica direto na grade, como antes.
                return card;
              }
              const nome = item.obra.nome;
              const lado = alvoArrasto?.id === obraId ? alvoArrasto.lado : undefined;
              return (
                <div
                  key={`${item.obra.id}-${item.competencia}`}
                  className="cr-ordem-item"
                  data-manual="true"
                  data-arrastando={arrastando === obraId || undefined}
                  data-alvo={lado}
                  data-obra-id={obraId}
                  draggable={podeArrastar}
                  onDragStart={(evento) => {
                    if (!podeArrastar) return;
                    evento.dataTransfer.effectAllowed = 'move';
                    evento.dataTransfer.setData('text/plain', String(obraId));
                    setArrastando(obraId);
                  }}
                  onDragOver={(evento) => {
                    if (!podeArrastar || arrastando == null) return;
                    evento.preventDefault();
                    evento.dataTransfer.dropEffect = 'move';
                    if (arrastando === obraId) {
                      if (alvoArrasto) setAlvoArrasto(null);
                      return;
                    }
                    const origem = obraIdsVisiveis.indexOf(arrastando);
                    const proximoLado = origem < posicao ? 'depois' : 'antes';
                    if (alvoArrasto?.id !== obraId || alvoArrasto?.lado !== proximoLado) {
                      setAlvoArrasto({ id: obraId, lado: proximoLado });
                    }
                  }}
                  onDrop={(evento) => {
                    if (!podeArrastar || arrastando == null) return;
                    evento.preventDefault();
                    moverObra(arrastando, posicao);
                    encerrarArrasto();
                  }}
                  onDragEnd={encerrarArrasto}
                >
                  <div className="cr-ordem-item__barra">
                    <button
                      type="button"
                      className="cr-ordem-item__alca"
                      ref={primeiroDaObra
                        ? (elemento) => {
                          if (elemento) alcasRef.current.set(obraId, elemento);
                          else alcasRef.current.delete(obraId);
                        }
                        : undefined}
                      aria-label={`Mover ${nome}: posição ${posicao + 1} de ${total}. `
                        + 'Setas movem uma posição; Home leva ao início; End, ao fim.'}
                      onKeyDown={(evento) => teclaNaAlca(evento, obraId, posicao)}
                    >
                      <HiOutlineBars3 aria-hidden="true" />
                      <span>{posicao + 1}º</span>
                    </button>
                    <span className="cr-ordem-item__acoes">
                      <span className="tooltip-wrap">
                        <button
                          type="button"
                          className="cr-ordem-item__botao"
                          aria-label={`Mover ${nome} para o início`}
                          disabled={posicao === 0}
                          onClick={() => moverObra(obraId, 0, { focar: true })}
                        >
                          <HiOutlineChevronDoubleUp aria-hidden="true" />
                        </button>
                        <span className="tooltip-content" aria-hidden="true">Mover para o início</span>
                      </span>
                      <span className="tooltip-wrap">
                        <button
                          type="button"
                          className="cr-ordem-item__botao"
                          aria-label={`Mover ${nome} uma posição antes`}
                          disabled={posicao === 0}
                          onClick={() => moverObra(obraId, posicao - 1, { focar: true })}
                        >
                          <HiOutlineChevronUp aria-hidden="true" />
                        </button>
                        <span className="tooltip-content" aria-hidden="true">Mover para antes</span>
                      </span>
                      <span className="tooltip-wrap">
                        <button
                          type="button"
                          className="cr-ordem-item__botao"
                          aria-label={`Mover ${nome} uma posição depois`}
                          disabled={posicao === total - 1}
                          onClick={() => moverObra(obraId, posicao + 1, { focar: true })}
                        >
                          <HiOutlineChevronDown aria-hidden="true" />
                        </button>
                        <span className="tooltip-content" aria-hidden="true">Mover para depois</span>
                      </span>
                    </span>
                  </div>
                  {card}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cr-empty-state">
            Nenhuma obra corresponde aos filtros executivos selecionados.
          </div>
        )}
      </section>

      <div className="cr-dashboard-trends">
        <TrendPanel
          title="Evolução de custos"
          icon={HiOutlineScale}
          rows={history}
          primaryKey="custo_planejado"
          primaryLabel="Planejado"
          secondaryKey="custo_realizado"
          secondaryLabel="Realizado"
          valoresOcultos={oculto}
        />
        <TrendPanel
          title="Evolução de recebíveis"
          icon={HiOutlineBanknotes}
          rows={history}
          primaryKey={portfolioClassification === 'PUBLICA'
            ? 'medicao_aprovada'
            : 'recebivel_reconhecido'}
          primaryLabel={portfolioClassification === 'PUBLICA'
            ? 'Medição aprovada'
            : (portfolioClassification === 'PRIVADA' ? 'Previsto' : 'Reconhecido')}
          secondaryKey="receita_recebida"
          secondaryLabel="Recebido"
          valoresOcultos={oculto}
        />
      </div>

      <section className="cr-section cr-attention-panel">
        <div className="cr-section-heading">
          <div>
            <h2>Pontos de atenção</h2>
            <p>Somente situações que exigem conferência ou ação operacional.</p>
          </div>
          <span className="cr-attention-count" data-empty={!alerts.length}>
            {alerts.length} {alerts.length === 1 ? 'ocorrência' : 'ocorrências'}
          </span>
        </div>
        {alerts.length ? (
          <div className="cr-attention-list">
            {alerts.map((item) => (
              <button
                key={item.id}
                type="button"
                className="cr-attention-row"
                data-tone={item.tom}
                onClick={() => onOpenArea?.(item)}
              >
                <span className="cr-attention-row__marker" aria-hidden="true" />
                <div>
                  <strong>{item.titulo}</strong>
                  <span>{textoSemQuantias(item.descricao, oculto)}</span>
                </div>
                <small>{formatMonth(item.competencia)}</small>
                <HiOutlineChevronRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        ) : (
          <div className="cr-empty-state cr-empty-state--positive">
            <HiOutlineCheckCircle className="h-5 w-5" />
            Nenhuma exceção operacional identificada nesta competência.
          </div>
        )}
      </section>

      {isWorkContext ? (
        <section className="cr-section cr-macro-detail">
          <div className="cr-section-heading">
            <div>
              <h2>Custos por macro</h2>
              <p>Somente macros com planejamento ou realização na obra selecionada.</p>
            </div>
            <HiOutlineBuildingOffice2 className="h-5 w-5 cr-heading-icon" />
          </div>
          {macros.length ? (
            <div className="cr-macro-ops-list">
              {macros.map((item) => {
                const progress = oculto ? 0 : item.previsto > 0
                  ? Math.min(100, (item.realizado / item.previsto) * 100)
                  : (item.realizado > 0 ? 100 : 0);
                return (
                  <div key={item.codigo} className="cr-macro-ops-row" data-state={item.estado}>
                    <div className="cr-macro-ops-row__name">
                      <strong>{item.nome || 'Macro sem descrição'}</strong>
                      <span>{item.codigo} · {item.itens} item(ns) com movimento</span>
                    </div>
                    <div className="cr-macro-ops-row__numbers">
                      <span>Planejado <strong className="cr-valor">{money(item.previsto)}</strong></span>
                      <span>Realizado <strong className="cr-valor">{money(item.realizado)}</strong></span>
                      <span>
                        Desvio
                        <strong className="cr-valor" data-negative={!oculto && item.delta > 0}>
                          {money(item.delta)}
                        </strong>
                      </span>
                    </div>
                    <div className="cr-macro-ops-row__progress">
                      <div className="cr-progress-track">
                        {oculto ? null : (
                          <span data-state={item.estado} style={{ width: `${progress}%` }} />
                        )}
                      </div>
                      <b className="cr-valor">
                        {oculto ? VALOR_OCULTO : formatPercent(item.percentual_execucao)}
                      </b>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="cr-empty-state">
              Nenhuma macro com valor planejado ou realizado nesta competência.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
