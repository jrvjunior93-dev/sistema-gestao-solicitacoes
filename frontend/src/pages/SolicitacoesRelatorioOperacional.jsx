import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarraFiltros,
  BlocoConteudo,
  BlocosPersonalizaveis,
  CelulaDupla,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useFiltrosVisiveis
} from '../components/padrao';
import {
  getObrasVisiveisSolicitacoes,
  obterRelatorioSolicitacoesOperacional
} from '../services/solicitacoes';

const DEFAULT_FILTERS = {
  periodo: '30_DIAS',
  data_inicio: '',
  data_fim: '',
  obra_id: ''
};

const PERIODOS = [
  { valor: 'HOJE', rotulo: 'Hoje' },
  { valor: '30_DIAS', rotulo: 'Últimos 30 dias' },
  { valor: '90_DIAS', rotulo: 'Últimos 90 dias' },
  { valor: 'MES_ATUAL', rotulo: 'Mês atual' }
];

/*
  LIMITES REAIS DO SERVIDOR — `backend/src/services/relatorioSolicitacoesService.js`
  não devolve o conjunto inteiro em cinco listas:
    por_obra, por_tipo, por_criador, por_responsavel → 20 primeiros
    gargalos                                        → 30 primeiros
  Antes desta migração os blocos se chamavam só "Por obra/centro", "Por
  tipo", "Por criador", "Por responsável atual" e "Gargalos operacionais" —
  títulos que prometem o CONJUNTO — enquanto a tabela mostrava o topo da
  lista, sem dizer. Quem lia "20 criadores" concluía que existem 20. Os
  limites viram texto na tela; nenhum número mudou.
*/
const LIMITE_AGRUPAMENTO = 20;
const LIMITE_GARGALOS = 30;

// Recortes de LEITURA feitos aqui na tela (os gráficos ficariam ilegíveis
// com a lista inteira). Também são ditos no bloco a que pertencem.
const LINHAS_RANKING = 8;
const LINHAS_SEM_SLA = 6;
const LINHAS_HEATMAP = 6;

function readFilters(searchParams) {
  return {
    periodo: searchParams.get('periodo') || DEFAULT_FILTERS.periodo,
    data_inicio: searchParams.get('data_inicio') || '',
    data_fim: searchParams.get('data_fim') || '',
    obra_id: searchParams.get('obra_id') || ''
  };
}

function buildSearchParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });
  return params;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}%`;
}

function formatDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('pt-BR');
}

function formatDays(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '-';
  return `${formatNumber(numeric, 1)} dia(s)`;
}

function formatLabel(value) {
  return String(value || 'Nao informado')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function extractErrorMessage(error) {
  return error?.data?.error || error?.message || 'Erro ao carregar relatório de solicitações';
}

/**
 * BARRA DE PROPORÇÃO — o desenho que estava repetido em seis lugares.
 *
 * `valor === 0` desenha barra de largura ZERO. As seis cópias anteriores
 * usavam `Math.max(4, (valor / maior) * 100)`, ou seja: o item sem nenhuma
 * solicitação ganhava uma barrinha visível e o gráfico afirmava volume onde
 * não havia nenhum. O número ao lado continua dizendo quanto é.
 *
 * A largura em % é DADO (a proporção), não medida de layout — por isso
 * continua no `style`. Trilho e preenchimento vêm de token (R25); a altura
 * é degrau da escala.
 */
function BarraProporcao({ valor, maior, tom = 'var(--c-primary)' }) {
  const pct = Number(maior || 0) > 0
    ? Math.round((Number(valor || 0) / Number(maior)) * 100)
    : 0;
  return (
    <div className="h-3 overflow-hidden rounded-full bg-[var(--ui-border)]">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tom }} />
    </div>
  );
}

/*
  QUAIS FILTROS APARECEM (N53) — a declaração desta tela para o painel
  único de `PainelFiltrosVisiveis`, no molde do painel "Colunas" da
  TabelaPadrao.

  NENHUM `padrao: false`: todos os filtros continuam VISÍVEIS na primeira
  abertura. Só três telas têm conjunto inicial reduzido, e é o que o
  cliente aprovou nelas — aqui o seletor apenas passa a EXISTIR, para quem
  quiser mexer. Esconder por padrão mudaria o que a pessoa vê sem ela ter
  pedido.
*/
const FILTROS_DA_TELA = [
  { id: 'data_inicio', rotulo: 'Data inicial' },
  { id: 'data_fim', rotulo: 'Data final' },
  { id: 'periodo', rotulo: 'Período' },
  { id: 'obra_id', rotulo: 'Obra / Centro de custo' }
];

export default function SolicitacoesRelatorioOperacional() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtros, setFiltros] = useState(() => readFilters(searchParams));
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    getObrasVisiveisSolicitacoes()
      .then((data) => {
        if (ativo) {
          setObras(Array.isArray(data) ? data : []);
        }
      })
      .catch((error) => console.error(error));

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    const filtrosAtivos = readFilters(searchParams);
    setFiltros(filtrosAtivos);

    let ativo = true;
    async function carregar() {
      try {
        setLoading(true);
        setErro('');
        const data = await obterRelatorioSolicitacoesOperacional(filtrosAtivos);
        if (ativo) {
          setRelatorio(data);
        }
      } catch (error) {
        console.error(error);
        if (ativo) {
          setRelatorio(null);
          setErro(extractErrorMessage(error));
        }
      } finally {
        if (ativo) {
          setLoading(false);
        }
      }
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, [searchParams]);

  const resumo = relatorio?.resumo || {};
  const porStatus = useMemo(() => (Array.isArray(relatorio?.por_status) ? relatorio.por_status : []), [relatorio]);
  const porSetor = useMemo(() => (Array.isArray(relatorio?.por_setor) ? relatorio.por_setor : []), [relatorio]);
  const porObra = useMemo(() => (Array.isArray(relatorio?.por_obra) ? relatorio.por_obra : []), [relatorio]);
  const porTipo = useMemo(() => (Array.isArray(relatorio?.por_tipo) ? relatorio.por_tipo : []), [relatorio]);
  const porCriador = useMemo(() => (Array.isArray(relatorio?.por_criador) ? relatorio.por_criador : []), [relatorio]);
  const acertividadeCriacao = useMemo(
    () => (Array.isArray(relatorio?.acertividade_criacao) ? relatorio.acertividade_criacao : []),
    [relatorio]
  );
  const pendenciasFinanceirasCriador = useMemo(
    () => (Array.isArray(relatorio?.pendencias_financeiras_criador) ? relatorio.pendencias_financeiras_criador : []),
    [relatorio]
  );
  // ORDEM INICIAL da tabela: quem mais voltou para ajuste primeiro — a
  // mesma de antes. Do primeiro clique num título em diante quem ordena é a
  // TabelaPadrao (asc → desc → volta a esta ordem), com os MESMOS campos:
  // usuario, criadas, com ajuste, ocorrencias e acertividade.
  const acertividadeCriacaoOrdenada = useMemo(() => (
    [...acertividadeCriacao].sort(
      (a, b) => Number(b.solicitacoes_com_ajuste || 0) - Number(a.solicitacoes_com_ajuste || 0)
    )
  ), [acertividadeCriacao]);
  const porResponsavel = useMemo(() => (Array.isArray(relatorio?.por_responsavel) ? relatorio.por_responsavel : []), [relatorio]);
  const temposEtapas = useMemo(() => (Array.isArray(relatorio?.tempos_etapas) ? relatorio.tempos_etapas : []), [relatorio]);
  const evolucaoMensal = useMemo(() => (Array.isArray(relatorio?.evolucao_mensal) ? relatorio.evolucao_mensal : []), [relatorio]);
  const setorStatus = useMemo(() => (Array.isArray(relatorio?.setor_status) ? relatorio.setor_status : []), [relatorio]);
  const agingSetor = useMemo(() => (Array.isArray(relatorio?.aging_setor) ? relatorio.aging_setor : []), [relatorio]);
  const agingStatus = useMemo(() => (Array.isArray(relatorio?.aging_status) ? relatorio.aging_status : []), [relatorio]);
  const slaSetor = useMemo(() => (Array.isArray(relatorio?.sla_setor) ? relatorio.sla_setor : []), [relatorio]);
  const setoresSemSla = useMemo(() => (Array.isArray(relatorio?.setores_sem_sla) ? relatorio.setores_sem_sla : []), [relatorio]);
  const gargalos = useMemo(() => (Array.isArray(relatorio?.gargalos) ? relatorio.gargalos : []), [relatorio]);
  const topSetores = useMemo(() => porSetor.slice(0, LINHAS_RANKING), [porSetor]);
  const topStatus = useMemo(() => porStatus.slice(0, LINHAS_RANKING), [porStatus]);
  const topObras = useMemo(() => porObra.slice(0, LINHAS_RANKING), [porObra]);
  const topAgingStatus = useMemo(() => agingStatus.slice(0, LINHAS_RANKING), [agingStatus]);
  const topSlaSetor = useMemo(() => slaSetor.slice(0, LINHAS_RANKING), [slaSetor]);
  const topSetoresSemSla = useMemo(() => setoresSemSla.slice(0, LINHAS_SEM_SLA), [setoresSemSla]);
  const topSetoresHeatmap = useMemo(() => {
    const mapa = new Map();
    setorStatus.forEach((item) => {
      const key = item.setor || 'NAO_INFORMADO';
      const atual = mapa.get(key) || { key, setor: item.setor, total: 0 };
      atual.total += Number(item.total || 0);
      mapa.set(key, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total).slice(0, LINHAS_HEATMAP);
  }, [setorStatus]);
  const topStatusHeatmap = useMemo(() => {
    const mapa = new Map();
    setorStatus.forEach((item) => {
      const key = item.status || 'NAO_INFORMADO';
      const atual = mapa.get(key) || { key, status: item.status, total: 0 };
      atual.total += Number(item.total || 0);
      mapa.set(key, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total).slice(0, LINHAS_HEATMAP);
  }, [setorStatus]);
  const heatmapLookup = useMemo(() => {
    const mapa = new Map();
    setorStatus.forEach((item) => {
      mapa.set(`${item.setor || 'NAO_INFORMADO'}|${item.status || 'NAO_INFORMADO'}`, item);
    });
    return mapa;
  }, [setorStatus]);
  const maiorTotalSetor = useMemo(
    () => Math.max(...topSetores.map((item) => Number(item.total || 0)), 0),
    [topSetores]
  );
  const maiorTotalStatus = useMemo(
    () => Math.max(...topStatus.map((item) => Number(item.total || 0)), 0),
    [topStatus]
  );
  const maiorTotalObra = useMemo(
    () => Math.max(...topObras.map((item) => Number(item.total || 0)), 0),
    [topObras]
  );
  const maiorTotalEvolucao = useMemo(
    () => Math.max(...evolucaoMensal.map((item) => Number(item.total || 0)), 0),
    [evolucaoMensal]
  );
  const maiorAgingStatus = useMemo(
    () => Math.max(...topAgingStatus.map((item) => Number(item.media_dias_parada || 0)), 0),
    [topAgingStatus]
  );
  const maiorSlaVencidas = useMemo(
    () => Math.max(...topSlaSetor.map((item) => Number(item.vencidas || 0)), 0),
    [topSlaSetor]
  );
  const maiorHeatmap = useMemo(
    () => Math.max(...setorStatus.map((item) => Number(item.total || 0)), 0),
    [setorStatus]
  );

  /*
    R12 — os recortes ENUMERÁVEIS (período e obra) viram marcação com
    etiqueta removível. `unico: true` nos dois: o endpoint recebe UM valor
    por chave (`periodo=30_DIAS`, `obra_id=7`) e o `alternarFiltro` abaixo
    guarda escalar, então marcar outro TROCA a escolha. Com caixa quadrada a
    pessoa marcaria dois, veria duas etiquetas e a lista não estreitaria —
    capacidade aparente sem efeito (a família da R15).
  */
  const ativos = useMemo(() => ({
    periodo: new Set(filtros.periodo ? [String(filtros.periodo)] : []),
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : [])
  }), [filtros]);

  const dimensoes = useMemo(() => [
    { id: 'periodo', rotulo: 'Período', unico: true, opcoes: PERIODOS },
    {
      id: 'obra_id',
      rotulo: 'Obra / Centro de custo',
      unico: true,
      opcoes: obras.map((obra) => ({ valor: String(obra.id), rotulo: obra.nome }))
    }
  ], [obras]);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      /* O valor que o SISTEMA propõe não conta como preenchido: se contasse,
         o padrão revelaria de volta, a cada recarga, exatamente o filtro que
         a pessoa escondeu. */
      const padrao = String(DEFAULT_FILTERS[filtro.id] ?? '');
      const rascunho = String(filtros[filtro.id] ?? '');
      const emCurso = String(searchParams.get(filtro.id) ?? '');
      return (rascunho !== '' && rascunho !== padrao) || (emCurso !== '' && emCurso !== padrao);
    }).map((filtro) => filtro.id),
    [filtros, searchParams]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:solicitacoes-relatorio-operacional', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      atualizarCampo(id, DEFAULT_FILTERS[id] ?? '');
      // A consulta em curso mora na URL: sem tirar a chave dali, o recorte
      // seguiria valendo com o campo já fora da faixa.
      if (searchParams.get(id)) {
        const proximos = new URLSearchParams(searchParams);
        proximos.delete(id);
        setSearchParams(proximos);
      }
    }
  });

  function atualizarCampo(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }

  function alternarFiltro(dimensao, valor) {
    setFiltros((atual) => ({
      ...atual,
      [dimensao]: String(atual[dimensao]) === String(valor) ? '' : String(valor)
    }));
  }

  function aplicarFiltros() {
    setSearchParams(buildSearchParams(filtros));
  }

  function limparFiltros() {
    setFiltros(DEFAULT_FILTERS);
    setSearchParams(buildSearchParams(DEFAULT_FILTERS));
  }

  return (
    <Pagina>
      {/*
        R23 — EXCEÇÃO DE CONSULTA CARA, medida NESTA tela e não copiada das
        irmãs. Aqui são só TRÊS recortes (período, intervalo de datas e
        obra), abaixo do gatilho de 4+ dimensões. Quem pesa é o outro braço
        da regra, o do custo: o endpoint carrega TODAS as solicitações do
        período mais o histórico delas e monta dezoito agregações em memória
        (`relatorioSolicitacoesService`) — não é uma contagem, é o relatório
        inteiro a cada chamada. Somado a isso, o recorte desta tela mora na
        URL (`useSearchParams`), então aplicar ao marcar empilharia uma
        entrada de histórico e uma consulta cara por clique.
        Por isso o recorte fica em rascunho até o clique, o botão diz o que
        faz ("Atualizar relatório", não "Aplicar filtros") e a descrição
        avisa — sem o aviso a etiqueta aparece ao marcar e é lida como
        filtro já aplicado, o que seria mentira (F3).

        R11: o "Voltar aos relatórios" saiu — botão de retorno redundante em
        tela de listagem, que menu, breadcrumb e Ctrl+K já resolvem. (A seta
        de voltar do PageHeader é outra coisa e vale para tela de detalhe.)
      */}
      <PageHeader
        titulo="Painel operacional"
        descricao="Marque o recorte e clique em Atualizar relatório: a consulta remonta o relatório inteiro, então só roda no clique."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatório',
          onClick: aplicarFiltros,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros }]}
      />

      <BlocoConteudo variante="secundario">
        {/* R16b: data inicial/final são recorte CONTÍNUO (não têm lista de
            opções) e vão em `campos`; período e obra são enumeráveis e vão
            em `filtros`, com etiqueta removível. */}
        <BarraFiltros
          campos={[
            {
              id: 'data_inicio',
              rotulo: 'Data inicial',
              tipo: 'date',
              valor: filtros.data_inicio,
              aoMudar: (valor) => atualizarCampo('data_inicio', valor)
            },
            {
              id: 'data_fim',
              rotulo: 'Data final',
              tipo: 'date',
              valor: filtros.data_fim,
              aoMudar: (valor) => atualizarCampo('data_fim', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {erro ? <div className="app-alert app-alert--error">{erro}</div> : null}

      {/*
        Os números do `resumo` são calculados pelo servidor sobre TODAS as
        solicitações do recorte (nenhum corte de página), então podem
        prometer o conjunto sem mentir.
      */}
      <StatGrid colunas={5}>
        <StatTile
          label="Solicitações"
          valor={formatNumber(resumo.total_solicitacoes)}
          sub="Criadas no período filtrado"
        />
        <StatTile
          label="Concluídas"
          valor={formatNumber(resumo.concluidas)}
          sub={`${formatNumber(resumo.abertas)} ainda abertas`}
          tom="success"
        />
        <StatTile
          label="Média abertas"
          valor={`${formatNumber(resumo.media_dias_abertas, 1)} dia(s)`}
          sub="Tempo médio desde a criação"
          tom={Number(resumo.media_dias_abertas || 0) > 0 ? 'warning' : undefined}
        />
        <StatTile
          label="Maior parada"
          valor={`${formatNumber(resumo.maior_tempo_parado_dias, 1)} dia(s)`}
          sub="Sem nova movimentação registrada"
          tom={Number(resumo.maior_tempo_parado_dias || 0) > 0 ? 'danger' : undefined}
        />
        <StatTile
          label="Valor aberto"
          valor={formatCurrency(resumo.valor_aberto)}
          sub={`${formatCurrency(resumo.valor_total)} no período`}
        />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 11 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:solicitacoes-relatorio-operacional" larguraPadrao="total">
        {/*
          O funil usava `app-empty-card` — a caixa de ESTADO VAZIO — para
          mostrar cinco números que existem. A classe diz "não há nada aqui" e
          o conteúdo dizia o contrário. Ladrilho de dado único é StatTile.
        */}
        <BlocoConteudo
          titulo="Funil do período"
          descricao="Contagem por etapa alcançada, sobre todas as solicitações do recorte."
        >
          <StatGrid colunas={5}>
            <StatTile label="Criadas" valor={formatNumber(resumo.criadas)} />
            <StatTile label="Assumidas" valor={formatNumber(resumo.assumidas)} />
            <StatTile label="Enviadas" valor={formatNumber(resumo.enviadas)} />
            <StatTile label="Aprovadas diretoria" valor={formatNumber(resumo.aprovadas_diretoria)} />
            <StatTile label="Concluídas" valor={formatNumber(resumo.concluidas)} tom="success" />
          </StatGrid>
        </BlocoConteudo>

        <div data-bloco-id="ranking-por-setor-atual" data-bloco-rotulo="Ranking por setor atual" className="grid gap-4 xl:grid-cols-3">
          <BlocoConteudo
            titulo="Ranking por setor atual"
            contagem={porSetor.length > topSetores.length ? `${topSetores.length} de ${porSetor.length}` : `${porSetor.length} setor(es)`}
            descricao={`Os ${LINHAS_RANKING} setores de maior volume no período filtrado.`}
          >
            {loading ? (
              <div className="app-empty-card">Carregando setores...</div>
            ) : topSetores.length === 0 ? (
              <div className="app-empty-card">Sem dados por setor no período.</div>
            ) : (
              <div className="grid gap-3">
                {topSetores.map((item, index) => {
                  const total = Number(item.total || 0);
                  return (
                    <div key={`setor-grafico-${item.key}`} className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[var(--c-muted)]">#{index + 1}</span>
                          <strong className="ml-2 text-sm text-[var(--c-text)]">{formatLabel(item.setor || item.key)}</strong>
                        </div>
                        <strong className="text-sm tabular-nums text-[var(--c-text)]">{formatNumber(total)}</strong>
                      </div>
                      <BarraProporcao valor={total} maior={maiorTotalSetor} />
                    </div>
                  );
                })}
              </div>
            )}
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Distribuição por status"
            contagem={porStatus.length > topStatus.length ? `${topStatus.length} de ${porStatus.length}` : `${porStatus.length} status`}
            descricao={`Os ${LINHAS_RANKING} status de maior volume. O percentual é sobre TODAS as solicitações do recorte, não só sobre estes.`}
          >
            {loading ? (
              <div className="app-empty-card">Carregando status...</div>
            ) : topStatus.length === 0 ? (
              <div className="app-empty-card">Sem dados por status no período.</div>
            ) : (
              <div className="grid gap-3">
                {topStatus.map((item) => {
                  const total = Number(item.total || 0);
                  const percent = Number(resumo.total_solicitacoes || 0) > 0
                    ? (total / Number(resumo.total_solicitacoes || 0)) * 100
                    : 0;
                  return (
                    <div key={`status-grafico-${item.key}`} className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-[var(--c-text)]">{formatLabel(item.status || item.key)}</strong>
                        <span className="text-sm font-bold tabular-nums text-[var(--c-text)]">
                          {formatNumber(total)} | {formatPercent(percent)}
                        </span>
                      </div>
                      <BarraProporcao valor={total} maior={maiorTotalStatus} tom="var(--c-success)" />
                    </div>
                  );
                })}
              </div>
            )}
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Volume por obra/centro"
            contagem={porObra.length > topObras.length ? `${topObras.length} de ${porObra.length}` : `${porObra.length} obra(s)/centro(s)`}
            descricao={`As ${LINHAS_RANKING} origens que mais abriram solicitações. Antes disso o servidor já cortou em ${LIMITE_AGRUPAMENTO} obras/centros — nem o "de N" é a lista completa.`}
          >
            {loading ? (
              <div className="app-empty-card">Carregando obras...</div>
            ) : topObras.length === 0 ? (
              <div className="app-empty-card">Sem dados por obra/centro no período.</div>
            ) : (
              <div className="grid gap-3">
                {topObras.map((item, index) => {
                  const total = Number(item.total || 0);
                  return (
                    <div key={`obra-grafico-${item.key}`} className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[var(--c-muted)]">#{index + 1}</span>
                          <strong className="ml-2 text-sm text-[var(--c-text)]">{item.obra_nome || 'Sem obra/centro'}</strong>
                        </div>
                        <strong className="text-sm tabular-nums text-[var(--c-text)]">{formatNumber(total)}</strong>
                      </div>
                      <BarraProporcao valor={total} maior={maiorTotalObra} tom="var(--c-warning)" />
                    </div>
                  );
                })}
              </div>
            )}
          </BlocoConteudo>
        </div>

        <div data-bloco-id="evolucao-mensal" data-bloco-rotulo="Evolução mensal" className="grid gap-4 xl:grid-cols-2">
          <BlocoConteudo
            titulo="Evolução mensal"
            contagem={`${evolucaoMensal.length} mês(es)`}
            descricao="Solicitações criadas por mês dentro do período filtrado."
          >
            {loading ? (
              <div className="app-empty-card">Carregando evolução...</div>
            ) : evolucaoMensal.length === 0 ? (
              <div className="app-empty-card">Sem dados mensais para o filtro selecionado.</div>
            ) : (
              <div className="grid gap-3">
                {evolucaoMensal.map((item) => {
                  const total = Number(item.total || 0);
                  return (
                    <div key={`evolucao-${item.mes}`} className="grid gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong className="text-sm text-[var(--c-text)]">{item.mes_label || item.mes}</strong>
                        <span className="text-sm font-bold tabular-nums text-[var(--c-text)]">
                          {formatNumber(total)} criada(s)
                        </span>
                      </div>
                      <BarraProporcao valor={total} maior={maiorTotalEvolucao} />
                      <div className="text-xs text-[var(--c-muted)]">
                        {formatNumber(item.concluidas)} concluída(s) | {formatNumber(item.abertas)} aberta(s)
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Aging por status"
            contagem={agingStatus.length > topAgingStatus.length ? `${topAgingStatus.length} de ${agingStatus.length}` : `${agingStatus.length} status`}
            descricao={`Tempo médio parado das solicitações abertas em cada status atual — os ${LINHAS_RANKING} de maior volume.`}
          >
            {loading ? (
              <div className="app-empty-card">Carregando aging por status...</div>
            ) : topAgingStatus.length === 0 ? (
              <div className="app-empty-card">Sem solicitações abertas para calcular aging por status.</div>
            ) : (
              <div className="grid gap-3">
                {topAgingStatus.map((item) => {
                  const media = Number(item.media_dias_parada || 0);
                  return (
                    <div key={`aging-status-${item.key}`} className="grid gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong className="text-sm text-[var(--c-text)]">{formatLabel(item.status || item.key)}</strong>
                        <span className="text-sm font-bold tabular-nums text-[var(--c-text)]">
                          {formatDays(media)} | {formatNumber(item.total)} aberta(s)
                        </span>
                      </div>
                      <BarraProporcao valor={media} maior={maiorAgingStatus} tom="var(--c-danger)" />
                      <div className="text-xs text-[var(--c-muted)]">
                        Maior parada: {formatDays(item.maior_dias_parada)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BlocoConteudo>
        </div>

        <BlocoConteudo
          titulo="Mapa setor x status"
          descricao={`Cruzamento dos ${LINHAS_HEATMAP} setores e dos ${LINHAS_HEATMAP} status de maior volume no período filtrado.`}
        >
          {loading ? (
            <div className="app-empty-card">Carregando matriz...</div>
          ) : topSetoresHeatmap.length === 0 || topStatusHeatmap.length === 0 ? (
            <div className="app-empty-card">Sem dados suficientes para montar o mapa setor x status.</div>
          ) : (
            /* R18 (onde NÃO vale): rolagem horizontal com `overflow-x-auto`
               não é `overflow: hidden` e não há nada fixo aqui dentro. A
               largura mínima em px que existia (`min-w-[720px]`) saiu — quem
               dita o mínimo agora é o conteúdo (`min-w-max`), sem medida
               escrita na tela (R10). */
            <div className="overflow-x-auto">
              <div
                className="grid min-w-max gap-2"
                style={{ gridTemplateColumns: `auto repeat(${topStatusHeatmap.length}, minmax(0, 1fr))` }}
              >
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--c-muted)]">Setor</div>
                {topStatusHeatmap.map((statusItem) => (
                  <div key={`heatmap-head-${statusItem.key}`} className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--c-muted)] text-center">
                    {formatLabel(statusItem.status || statusItem.key)}
                  </div>
                ))}
                {topSetoresHeatmap.map((setorItem) => (
                  <Fragment key={`heatmap-row-${setorItem.key}`}>
                    <div className="text-sm font-bold text-[var(--c-text)] py-2">
                      {formatLabel(setorItem.setor || setorItem.key)}
                    </div>
                    {topStatusHeatmap.map((statusItem) => {
                      const item = heatmapLookup.get(`${setorItem.setor || 'NAO_INFORMADO'}|${statusItem.status || 'NAO_INFORMADO'}`);
                      const total = Number(item?.total || 0);
                      /*
                        A INTENSIDADE é dado (a proporção da célula), como a
                        largura da barra. O que era cor à mão saiu: antes a
                        célula pintava `rgba(37, 99, 235, opacidade)` e trocava
                        o texto para `#fff` acima de 45% — dois valores crus,
                        sem par no tema escuro e sem passar pelo piso de
                        contraste (R2/R25).
                        Agora a mistura sai de token (`--sem-info` sobre a
                        superfície do bloco) e o teto é 45%, para o texto
                        continuar em `--c-text` nos dois temas em vez de
                        inverter para branco. O número está escrito em toda
                        célula, então a cor reforça — não carrega sozinha.
                      */
                      // Zero não ganha piso de tinta: a célula sem cruzamento
                      // fica na cor da superfície, com o "0" escrito. Piso de
                      // intensidade é a mesma mentira do piso de largura.
                      const intensidade = total > 0 && maiorHeatmap > 0
                        ? Math.min(45, Math.max(1, Math.round((total / maiorHeatmap) * 45)))
                        : 0;
                      return (
                        <div
                          key={`heatmap-cell-${setorItem.key}-${statusItem.key}`}
                          className="rounded-lg px-3 py-2 text-center text-sm font-bold text-[var(--c-text)]"
                          style={{
                            backgroundColor: `color-mix(in srgb, var(--sem-info) ${intensidade}%, var(--ui-surface))`
                          }}
                        >
                          {formatNumber(total)}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </BlocoConteudo>

        <div data-bloco-id="sla-por-setor" data-bloco-rotulo="SLA por setor" className="grid gap-4 xl:grid-cols-2">
          <BlocoConteudo
            titulo="SLA por setor"
            contagem={slaSetor.length > topSlaSetor.length ? `${topSlaSetor.length} de ${slaSetor.length}` : `${slaSetor.length} setor(es)`}
            descricao={`Solicitações abertas vencidas conforme o SLA cadastrado por setor — os ${LINHAS_RANKING} com mais vencidas.`}
            /* R11 (onde NÃO vale): "Configurar SLA" não é navegação para tela
               irmã disfarçada de ação — é a ÚNICA saída do estado vazio deste
               bloco ("nenhum SLA configurado"). Fica. */
            acoes={<Link to="/solicitacoes-sla-setor" className="btn btn-outline">Configurar SLA</Link>}
          >
            {loading ? (
              <div className="app-empty-card">Carregando SLA...</div>
            ) : !relatorio?.sla_configurado ? (
              <div className="app-empty-card">
                Nenhum SLA por setor configurado. Cadastre os prazos para ativar a leitura de vencimentos.
              </div>
            ) : topSlaSetor.length === 0 ? (
              <div className="app-empty-card">Nenhuma solicitação aberta em setor com SLA configurado.</div>
            ) : (
              <div className="grid gap-3">
                {topSlaSetor.map((item) => {
                  const vencidas = Number(item.vencidas || 0);
                  /*
                    Aqui o piso de 4% era ainda pior que nos outros gráficos:
                    o setor com ZERO vencida ganhava barra visível — verde, mas
                    visível — num gráfico cujo título é "vencidas". Zero é
                    largura zero; o tom continua distinguindo quem tem vencida
                    de quem não tem.
                  */
                  return (
                    <div key={`sla-setor-${item.key}`} className="grid gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong className="text-sm text-[var(--c-text)]">{formatLabel(item.setor_nome || item.setor || item.key)}</strong>
                        <span className="text-sm font-bold tabular-nums text-[var(--c-text)]">
                          {formatNumber(vencidas)} vencida(s) de {formatNumber(item.total)}
                        </span>
                      </div>
                      <BarraProporcao
                        valor={vencidas}
                        maior={maiorSlaVencidas}
                        tom={vencidas > 0 ? 'var(--c-danger)' : 'var(--c-success)'}
                      />
                      <div className="text-xs text-[var(--c-muted)]">
                        SLA: {formatNumber(item.sla_dias, 1)} dia(s) | No prazo: {formatNumber(item.no_prazo)} | Maior parada: {formatDays(item.maior_dias_parada)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Setores sem SLA configurado"
            contagem={setoresSemSla.length > topSetoresSemSla.length ? `${topSetoresSemSla.length} de ${setoresSemSla.length}` : `${setoresSemSla.length} setor(es)`}
            descricao={`Solicitações abertas que ainda não podem ser tratadas como vencidas por falta de regra real — os ${LINHAS_SEM_SLA} de maior volume.`}
          >
            {loading ? (
              <div className="app-empty-card">Carregando setores sem SLA...</div>
            ) : topSetoresSemSla.length === 0 ? (
              <div className="app-empty-card">Todas as solicitações abertas do filtro estão em setores com SLA ou não há abertas.</div>
            ) : (
              <div className="divide-y divide-[var(--ui-border)]">
                {topSetoresSemSla.map((item) => (
                  <div key={`sem-sla-${item.key}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <strong className="block text-sm text-[var(--c-text)]">{formatLabel(item.setor_nome || item.setor || item.key)}</strong>
                      <span className="text-xs text-[var(--c-muted)]">{formatCurrency(item.valor_aberto)} em aberto</span>
                    </div>
                    <span className="fx-badge fx-badge--warning">
                      {formatNumber(item.total)} aberta(s)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </BlocoConteudo>
        </div>

        <div data-bloco-id="tempos-por-etapa" data-bloco-rotulo="Tempos por etapa" className="grid gap-4 xl:grid-cols-2">
          <BlocoConteudo
            titulo="Tempos por etapa"
            contagem={`${temposEtapas.length} etapa(s)`}
            descricao="Médias calculadas apenas quando a etapa possui data real registrada."
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'etapa',
                  titulo: 'Etapa',
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.label
                },
                { id: 'amostras', titulo: 'Amostras', tipo: 'numero', render: (item) => formatNumber(item.amostras) },
                { id: 'media', titulo: 'Média', tipo: 'numero', render: (item) => formatDays(item.media_dias) },
                { id: 'maior', titulo: 'Maior', tipo: 'numero', render: (item) => formatDays(item.maior_dias) }
              ]}
              itens={temposEtapas}
              getId={(item) => item.key}
              carregando={loading}
              vazio="Sem etapas com datas suficientes no período."
              storageKey="tabela:solicitacoes-relatorio-operacional:tempos-etapas"
              rotuloRolagem="Tempos por etapa"
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Aging por setor atual"
            contagem={`${agingSetor.length} setor(es)`}
            descricao="Solicitações abertas agrupadas pelo setor em que estão paradas agora."
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'setor',
                  titulo: 'Setor',
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => formatLabel(item.setor || item.key)
                },
                { id: 'abertas', titulo: 'Abertas', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'media', titulo: 'Média parada', tipo: 'numero', render: (item) => formatDays(item.media_dias_parada) },
                { id: 'maior', titulo: 'Maior parada', tipo: 'numero', render: (item) => formatDays(item.maior_dias_parada) },
                { id: 'valor', titulo: 'Valor aberto', tipo: 'valor', render: (item) => formatCurrency(item.valor_aberto) }
              ]}
              itens={agingSetor}
              getId={(item) => item.key}
              carregando={loading}
              vazio="Sem solicitações abertas nos filtros selecionados."
              storageKey="tabela:solicitacoes-relatorio-operacional:aging-setor"
              rotuloRolagem="Aging por setor atual"
            />
          </BlocoConteudo>
        </div>

        <BlocoConteudo
          titulo="Pendências financeiras por usuário"
          contagem={`${pendenciasFinanceirasCriador.length} usuário(s)`}
          descricao="Mede solicitações marcadas por GEO ou Financeiro como fora do prazo, sem nota ou sem boleto até o vencimento."
        >
          {/* A "leitura" do bloco é um aviso permanente sobre como o número é
              calculado — `app-alert` (token semântico) no lugar do trio
              border-amber-100/bg-amber-50/text-amber-800 escrito à mão (R25). */}
          <div className="app-alert app-alert--warning">
            <strong>Leitura:</strong> a pendência fica aberta até ser regularizada no detalhe da solicitação. O tempo médio mede o prazo entre a marcação e a regularização.
          </div>
          <TabelaPadrao
            colunas={[
              {
                id: 'usuario',
                titulo: 'Usuário criador',
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => item.usuario_nome || 'Sem criador'
              },
              {
                id: 'marcadas',
                titulo: 'Marcadas',
                tipo: 'numero',
                render: (item) => <strong>{formatNumber(item.total_marcadas)}</strong>
              },
              {
                id: 'abertas',
                titulo: 'Abertas',
                tipo: 'numero',
                render: (item) => (
                  <span className={Number(item.abertas || 0) > 0 ? 'font-bold text-[var(--sem-warning)]' : 'text-[var(--c-muted)]'}>
                    {formatNumber(item.abertas)}
                  </span>
                )
              },
              {
                id: 'regularizadas',
                titulo: 'Regularizadas',
                tipo: 'numero',
                render: (item) => <span className="font-bold text-[var(--sem-success)]">{formatNumber(item.regularizadas)}</span>
              },
              { id: 'media', titulo: 'Prazo médio', tipo: 'numero', render: (item) => formatDays(item.media_dias_regularizacao) },
              { id: 'maior', titulo: 'Maior prazo', tipo: 'numero', render: (item) => formatDays(item.maior_dias_regularizacao) },
              {
                id: 'tipos',
                titulo: 'Tipos de pendência',
                tipo: 'texto',
                render: (item) => (
                  Array.isArray(item.tipos) && item.tipos.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {item.tipos.map((tipo) => (
                        <span key={`${item.key}-${tipo.tipo}`} className="fx-badge fx-badge--neutral">
                          {formatLabel(tipo.tipo)}: {formatNumber(tipo.total)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[var(--c-muted)]">Sem tipo informado</span>
                  )
                )
              }
            ]}
            itens={pendenciasFinanceirasCriador}
            getId={(item) => item.key}
            carregando={loading}
            vazio="Sem pendências financeiras marcadas no período."
            storageKey="tabela:solicitacoes-relatorio-operacional:pendencias-financeiras"
            rotuloRolagem="Pendências financeiras por usuário"
          />
        </BlocoConteudo>

        <div data-bloco-id="por-status" data-bloco-rotulo="Por status" className="grid gap-4 xl:grid-cols-3">
          <BlocoConteudo
            titulo="Por status"
            contagem={`${porStatus.length} status`}
            descricao="Todos os status com solicitação no recorte."
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'status',
                  titulo: 'Status',
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => formatLabel(item.status || item.key)
                },
                { id: 'total', titulo: 'Qtd.', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) }
              ]}
              itens={porStatus}
              getId={(item) => item.key}
              carregando={loading}
              vazio="Sem dados no período."
              storageKey="tabela:solicitacoes-relatorio-operacional:por-status"
              rotuloRolagem="Por status"
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Por setor atual"
            contagem={`${porSetor.length} setor(es)`}
            descricao="Todos os setores com solicitação no recorte."
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'setor',
                  titulo: 'Setor',
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => formatLabel(item.setor || item.key)
                },
                { id: 'total', titulo: 'Qtd.', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) }
              ]}
              itens={porSetor}
              getId={(item) => item.key}
              carregando={loading}
              vazio="Sem dados no período."
              storageKey="tabela:solicitacoes-relatorio-operacional:por-setor"
              rotuloRolagem="Por setor atual"
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Por obra/centro"
            contagem={`${porObra.length} de até ${LIMITE_AGRUPAMENTO}`}
            descricao={`O servidor devolve as ${LIMITE_AGRUPAMENTO} obras/centros de maior volume — não a lista completa.`}
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'obra',
                  titulo: 'Obra / Centro',
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => (
                    <CelulaDupla
                      principal={item.obra_nome || 'Sem obra/centro'}
                      sub={item.obra_codigo || ''}
                    />
                  )
                },
                { id: 'tipo', titulo: 'Tipo', tipo: 'texto', render: (item) => formatLabel(item.tipo_centro_custo) },
                { id: 'total', titulo: 'Qtd.', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) }
              ]}
              itens={porObra}
              getId={(item) => item.key}
              carregando={loading}
              vazio="Sem dados no período."
              storageKey="tabela:solicitacoes-relatorio-operacional:por-obra"
              rotuloRolagem="Por obra/centro"
            />
          </BlocoConteudo>
        </div>

        <BlocoConteudo
          titulo="Acertividade na criação por usuário"
          contagem={`${acertividadeCriacaoOrdenada.length} usuário(s)`}
          descricao="Mede solicitações criadas, quantas voltaram para ajuste e quais setores registraram essas ocorrências."
        >
          <div className="app-alert app-alert--warning">
            <strong>Leitura:</strong> "Com ajuste" conta cada solicitação uma única vez. "Ocorrências por setor" pode ser maior quando a mesma solicitação recebeu ajuste de mais de um setor.
          </div>
          <TabelaPadrao
            colunas={[
              {
                id: 'usuario',
                titulo: 'Usuário criador',
                // R17: o criador NOMEIA a linha desta tabela.
                tipo: 'identidade',
                noCard: 'titulo',
                ordenavel: true,
                valorOrdenacao: (item) => String(item.usuario_nome || 'Sem criador'),
                render: (item) => item.usuario_nome || 'Sem criador'
              },
              {
                id: 'criadas',
                titulo: 'Criadas',
                tipo: 'numero',
                ordenavel: true,
                // Quantidade interessa do MAIOR para o menor no 1o clique.
                ordemInicial: 'desc',
                valorOrdenacao: (item) => Number(item.total_criadas || 0),
                render: (item) => formatNumber(item.total_criadas)
              },
              {
                id: 'ajustes',
                titulo: 'Com ajuste',
                tipo: 'numero',
                ordenavel: true,
                ordemInicial: 'desc',
                valorOrdenacao: (item) => Number(item.solicitacoes_com_ajuste || 0),
                render: (item) => (
                  <>
                    <strong>{formatNumber(item.solicitacoes_com_ajuste)}</strong>
                    <div className="text-xs text-[var(--c-muted)]">
                      {formatPercent(item.taxa_ajuste)} das criadas
                    </div>
                  </>
                )
              },
              {
                id: 'ocorrencias',
                titulo: 'Ocorr. setor',
                tipo: 'numero',
                ordenavel: true,
                ordemInicial: 'desc',
                valorOrdenacao: (item) => Number(item.ocorrencias_setor_ajuste || 0),
                render: (item) => (
                  <>
                    <strong>{formatNumber(item.ocorrencias_setor_ajuste)}</strong>
                    {Number(item.solicitacoes_com_ajuste_multissetor || 0) > 0 ? (
                      <div className="text-xs text-[var(--sem-warning)]">
                        {formatNumber(item.solicitacoes_com_ajuste_multissetor)} multi-setor
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--c-muted)]">sem multi-setor</div>
                    )}
                  </>
                )
              },
              {
                id: 'acertividade',
                titulo: 'Acertividade',
                tipo: 'numero',
                ordenavel: true,
                ordemInicial: 'desc',
                valorOrdenacao: (item) => Number(item.taxa_acertividade || 0),
                render: (item) => (
                  <span className="fx-badge fx-badge--success">
                    {formatPercent(item.taxa_acertividade)}
                  </span>
                )
              },
              {
                id: 'setores',
                titulo: 'Setores que pediram ajuste',
                tipo: 'texto',
                render: (item) => (Array.isArray(item.ajustes_por_setor) && item.ajustes_por_setor.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {item.ajustes_por_setor.map((setor) => (
                      <span key={`${item.key}-${setor.setor}`} className="fx-badge fx-badge--neutral">
                        {formatLabel(setor.setor)}: {formatNumber(setor.total)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[var(--c-muted)]">Sem ajustes</span>
                ))
              }
            ]}
            itens={acertividadeCriacaoOrdenada}
            getId={(item) => item.key}
            carregando={loading}
            vazio="Sem solicitações criadas no período."
            storageKey="tabela:solicitacoes-relatorio-operacional:acertividade-criacao"
            rotuloRolagem="Acertividade na criação por usuário"
          />
        </BlocoConteudo>

        <div data-bloco-id="por-tipo" data-bloco-rotulo="Por tipo" className="grid gap-4 xl:grid-cols-3">
          <BlocoConteudo
            titulo="Por tipo"
            contagem={`${porTipo.length} de até ${LIMITE_AGRUPAMENTO}`}
            descricao={`O servidor devolve os ${LIMITE_AGRUPAMENTO} tipos de maior volume — não a lista completa.`}
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'tipo',
                  titulo: 'Tipo',
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.tipo_nome || 'Sem tipo'
                },
                { id: 'total', titulo: 'Qtd.', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) }
              ]}
              itens={porTipo}
              getId={(item) => item.key}
              carregando={loading}
              vazio="Sem dados no período."
              storageKey="tabela:solicitacoes-relatorio-operacional:por-tipo"
              rotuloRolagem="Por tipo"
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Por responsável atual"
            contagem={`${porResponsavel.length} de até ${LIMITE_AGRUPAMENTO}`}
            descricao={`O servidor devolve os ${LIMITE_AGRUPAMENTO} responsáveis de maior volume — não a lista completa.`}
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'usuario',
                  titulo: 'Responsável',
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.usuario_nome || 'Sem responsável'
                },
                { id: 'total', titulo: 'Qtd.', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) }
              ]}
              itens={porResponsavel}
              getId={(item) => item.key}
              carregando={loading}
              vazio="Sem dados no período."
              storageKey="tabela:solicitacoes-relatorio-operacional:por-responsavel"
              rotuloRolagem="Por responsável atual"
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Por criador"
            contagem={`${porCriador.length} de até ${LIMITE_AGRUPAMENTO}`}
            descricao={`O servidor devolve os ${LIMITE_AGRUPAMENTO} criadores de maior volume — não a lista completa.`}
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'usuario',
                  titulo: 'Criador',
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.usuario_nome || 'Sem criador'
                },
                { id: 'total', titulo: 'Qtd.', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) }
              ]}
              itens={porCriador}
              getId={(item) => item.key}
              carregando={loading}
              vazio="Sem dados no período."
              storageKey="tabela:solicitacoes-relatorio-operacional:por-criador"
              rotuloRolagem="Por criador"
            />
          </BlocoConteudo>
        </div>

        <BlocoConteudo
          titulo="Gargalos operacionais"
          contagem={`${gargalos.length} de até ${LIMITE_GARGALOS}`}
          descricao={`Solicitações abertas há pelo menos 3 dias sem nova movimentação registrada. O servidor devolve as ${LIMITE_GARGALOS} mais paradas — se houver mais, elas não estão aqui.`}
          variante="primario"
          cor="var(--module-solicitacoes)"
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'codigo',
                titulo: 'Solicitação',
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (
                  <div>
                    <Link to={`/solicitacoes/${item.id}`} className="font-bold text-[var(--c-primary)] hover:underline">
                      {item.codigo || `#${item.id}`}
                    </Link>
                    <div className="text-xs text-[var(--c-muted)]">Criada em {formatDate(item.criada_em)}</div>
                  </div>
                )
              },
              { id: 'setor', titulo: 'Setor', tipo: 'texto', render: (item) => formatLabel(item.setor) },
              { id: 'status', titulo: 'Status', tipo: 'status', render: (item) => formatLabel(item.status) },
              { id: 'responsavel', titulo: 'Responsável', tipo: 'texto', render: (item) => item.responsavel_nome || '-' },
              { id: 'obra', titulo: 'Obra / Centro', tipo: 'texto', render: (item) => item.obra_nome || '-' },
              { id: 'tipo', titulo: 'Tipo', tipo: 'texto', render: (item) => item.tipo_nome || '-' },
              {
                id: 'dias',
                titulo: 'Parada',
                tipo: 'numero',
                render: (item) => (
                  <div>
                    <strong>{formatNumber(item.dias_parada, 1)} dia(s)</strong>
                    <div className="text-xs text-[var(--c-muted)]">Última: {formatDate(item.ultima_movimentacao_em)}</div>
                  </div>
                )
              },
              { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor) }
            ]}
            itens={gargalos}
            carregando={loading}
            vazio="Nenhum gargalo encontrado nos filtros selecionados."
            storageKey="tabela:solicitacoes-relatorio-operacional:gargalos"
            rotuloRolagem="Gargalos operacionais"
          />
        </BlocoConteudo>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
