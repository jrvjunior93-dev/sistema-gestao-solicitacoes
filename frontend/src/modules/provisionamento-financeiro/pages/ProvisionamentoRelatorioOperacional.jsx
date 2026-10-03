import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  BlocosPersonalizaveis,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  getDashboardProvisionamentoFinanceiro,
  getProvisionamentoFinanceiroContexto,
  listarCategoriasMacroProvisionamento,
  listarProvisoesFinanceiras
} from '../../../services/provisoesFinanceiras';
import { formatarMoedaBRL } from '../utils/moeda';

const DEFAULT_FILTERS = {
  obra_id: '',
  categoria_macro_id: '',
  status: '',
  prioridade: '',
  data_inicial: '',
  data_final: ''
};

const LIMITE_ANALITICO = 200;

const STATUS_OPCOES = [
  { valor: 'previsto', rotulo: 'Previsto' },
  { valor: 'em_analise', rotulo: 'Em analise' },
  { valor: 'aprovado', rotulo: 'Aprovado' },
  { valor: 'realizado', rotulo: 'Realizado' },
  { valor: 'cancelado', rotulo: 'Cancelado' }
];

const PRIORIDADE_OPCOES = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Media' },
  { valor: 'alta', rotulo: 'Alta' },
  { valor: 'critica', rotulo: 'Critica' }
];

function formatarData(valor) {
  if (!valor) return '-';
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return '-';
}

function formatarMes(valor) {
  const match = String(valor || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return valor || '-';
  return `${match[2]}/${match[1]}`;
}

function formatarObra(obra) {
  if (!obra) return '-';
  return `${obra.codigo ? `${obra.codigo} - ` : ''}${obra.nome}`;
}

function formatarStatus(valor) {
  const labels = {
    previsto: 'Previsto',
    em_analise: 'Em analise',
    aprovado: 'Aprovado',
    cancelado: 'Cancelado',
    realizado: 'Realizado'
  };
  return labels[String(valor || '').toLowerCase()] || '-';
}

function formatarPrioridade(valor) {
  const labels = {
    baixa: 'Baixa',
    media: 'Media',
    alta: 'Alta',
    critica: 'Critica'
  };
  return labels[String(valor || '').toLowerCase()] || '-';
}

/*
  R25 — o mapa de tons crus (blue/emerald/amber/rose/slate) do Card antigo
  vira FAMÍLIA SEMÂNTICA. Cancelado é neutro (decisão registrada, não erro)
  e realizado/aprovado é sucesso; a classificação automática do StatusBadge
  não conhece o vocabulário deste módulo.
*/
function familiaStatus(valor) {
  const normalizado = String(valor || '').toLowerCase();
  if (normalizado === 'realizado' || normalizado === 'aprovado') return 'success';
  if (normalizado === 'cancelado') return 'neutral';
  if (normalizado === 'em_analise') return 'info';
  return 'warning';
}

function percentual(valor, total) {
  const base = Number(total || 0);
  if (!base) return '0,00%';
  return `${((Number(valor || 0) / base) * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

/*
  Bloco de agrupamento: o mesmo recorte visto por obra, categoria, status e
  semana. A coluna de VALOR é `tipo: 'valor'` (190px, à direita,
  tabular-nums) — módulo de dinheiro, valor nunca trunca (T7).
*/
function BlocoAgrupado({ titulo, descricao, linhas, total, storageKey, rotulo }) {
  return (
    <BlocoConteudo
      titulo={titulo}
      /* C2 × B3: o TOTAL do recorte está na faixa; aqui fica o número que só
         este bloco responde — quantas linhas o agrupamento tem. */
      contagem={`${linhas.length} linha(s)`}
      descricao={descricao}
      variante="secundario"
    >
      <TabelaPadrao
        colunas={[
          {
            id: 'label',
            titulo: 'Descrição',
            // R17: o rótulo NOMEIA a linha do agrupamento (obra, categoria,
            // status ou semana, conforme o bloco).
            tipo: 'identidade',
            noCard: 'titulo',
            render: (linha) => rotulo(linha)
          },
          {
            id: 'quantidade',
            titulo: 'Qtd.',
            tipo: 'numero',
            render: (linha) => Number(linha.quantidade || 0).toLocaleString('pt-BR')
          },
          {
            id: 'valor',
            titulo: 'Valor',
            tipo: 'valor',
            render: (linha) => formatarMoedaBRL(Number(linha.total_valor || 0))
          },
          {
            id: 'participacao',
            titulo: 'Participação',
            tipo: 'numero',
            render: (linha) => percentual(Number(linha.total_valor || 0), total)
          }
        ]}
        itens={linhas}
        getId={(linha) => rotulo(linha)}
        storageKey={storageKey}
        rotuloRolagem={titulo}
        vazio="Sem dados para os filtros."
      />
    </BlocoConteudo>
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
  { id: 'data_inicial', rotulo: 'Data inicial' },
  { id: 'data_final', rotulo: 'Data final' },
  { id: 'obra_id', rotulo: 'Obra/Centro' },
  { id: 'categoria_macro_id', rotulo: 'Categoria macro' },
  { id: 'status', rotulo: 'Status' },
  { id: 'prioridade', rotulo: 'Prioridade' }
];

export default function ProvisionamentoRelatorioOperacional() {
  const { avisos, avisar, fechar } = useAvisos();
  const [contexto, setContexto] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [lista, setLista] = useState([]);
  const [filtros, setFiltros] = useState(DEFAULT_FILTERS);
  const [filtrosAplicados, setFiltrosAplicados] = useState(DEFAULT_FILTERS);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => String(filtros[filtro.id] ?? '').trim() !== ''
      || String(filtrosAplicados[filtro.id] ?? '').trim() !== '').map((filtro) => filtro.id),
    [filtros, filtrosAplicados]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:provisionamento-relatorio-operacional', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      /* O rascunho E o recorte em curso: é o segundo que a consulta usa,
         e um filtro escondido não pode seguir recortando a lista. */
      setFiltros((atual) => ({ ...atual, [id]: DEFAULT_FILTERS[id] ?? '' }));
      setFiltrosAplicados((atual) => ({ ...atual, [id]: DEFAULT_FILTERS[id] ?? '' }));
    }
  });
  const [loading, setLoading] = useState(true);

  const obras = useMemo(() => (
    Array.isArray(contexto?.obras_acesso) ? contexto.obras_acesso : []
  ), [contexto]);

  async function carregar(params) {
    try {
      setLoading(true);
      const [dashboardData, listaData] = await Promise.all([
        getDashboardProvisionamentoFinanceiro(params),
        listarProvisoesFinanceiras({
          ...params,
          sort_by: 'data_prevista_desembolso',
          sort_dir: 'ASC',
          page: 1,
          limit: LIMITE_ANALITICO
        })
      ]);
      setDashboard(dashboardData);
      setLista(Array.isArray(listaData?.items) ? listaData.items : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar relatorio de provisionamento.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function carregarBase() {
      try {
        setLoading(true);
        const [contextoData, categoriasData] = await Promise.all([
          getProvisionamentoFinanceiroContexto(),
          listarCategoriasMacroProvisionamento()
        ]);
        setContexto(contextoData);
        setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
      } catch (error) {
        console.error(error);
        avisar.erro(error?.message || 'Erro ao carregar contexto do provisionamento.');
        setLoading(false);
      }
    }

    carregarBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!contexto) return;
    carregar(filtrosAplicados);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexto, filtrosAplicados]);

  const totalPeriodo = Number(dashboard?.cards?.total_periodo || 0);
  const abertas = Number(dashboard?.cards?.quantidade_abertas || 0);
  const vencidas = useMemo(() => dashboard?.alertas?.vencidas_nao_tratadas?.itens || [], [dashboard]);
  const criticas = useMemo(() => dashboard?.alertas?.itens_criticos_proximos?.itens || [], [dashboard]);
  const concentracaoAlta = useMemo(() => dashboard?.alertas?.obras_concentracao_alta || [], [dashboard]);
  const porMes = useMemo(() => dashboard?.graficos?.por_mes || [], [dashboard]);
  const maiorMes = Math.max(...porMes.map((item) => Number(item.total_valor || 0)), 1);

  /*
    R12 — os seis recortes enumeráveis viram MARCAÇÃO com etiqueta
    removível. O endpoint aceita UM valor por chave (obra_id, status…), por
    isso as dimensões declaram `unico: true`: a marca fica REDONDA e marcar
    outro valor substitui. Marcação múltipla aqui mostraria duas etiquetas e
    mandaria um filtro só — capacidade aparente sem efeito (R15).
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : []),
    categoria_macro_id: new Set(filtros.categoria_macro_id ? [String(filtros.categoria_macro_id)] : []),
    status: new Set(filtros.status ? [String(filtros.status)] : []),
    prioridade: new Set(filtros.prioridade ? [String(filtros.prioridade)] : [])
  }), [filtros]);

  const dimensoes = useMemo(() => [
    {
      id: 'obra_id',
      rotulo: 'Obra/Centro',
      unico: true,
      opcoes: obras.map((obra) => ({ valor: String(obra.id), rotulo: formatarObra(obra) }))
    },
    {
      id: 'categoria_macro_id',
      rotulo: 'Categoria macro',
      unico: true,
      opcoes: categorias.map((categoria) => ({ valor: String(categoria.id), rotulo: categoria.nome }))
    },
    { id: 'status', rotulo: 'Status', unico: true, opcoes: STATUS_OPCOES },
    { id: 'prioridade', rotulo: 'Prioridade', unico: true, opcoes: PRIORIDADE_OPCOES }
  ], [obras, categorias]);

  function alternarFiltro(dimensao, valor) {
    setFiltros((atual) => ({
      ...atual,
      [dimensao]: String(atual[dimensao]) === String(valor) ? '' : String(valor)
    }));
  }

  function atualizarCampo(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }

  function aplicarFiltros() {
    // R26/consentimento: o recorte que vai para o servidor é o que está na
    // tela NO MOMENTO DO CLIQUE, fixado numa const antes de qualquer await.
    const recorte = filtros;
    setFiltrosAplicados(recorte);
  }

  function limparFiltros() {
    setFiltros(DEFAULT_FILTERS);
    setFiltrosAplicados(DEFAULT_FILTERS);
  }

  return (
    <Pagina>
      {/*
        R11/C6 — os dois links da barra de ações ("Voltar aos relatorios" e
        "Lista de provisoes") saíram: são CAMINHO PARA OUTRA TELA, e o lugar
        deles é o hub do módulo, o breadcrumb e o Ctrl+K. Conferido antes de
        remover, como a regra exige: `/provisoes-financeiras/relatorios`
        (`prov-relatorios`) e `/provisoes-financeiras` (`prov-lista`) são
        itens de PRIMEIRO nível do menu do módulo no `navigationConfig`, e o
        hub de relatórios lista este painel. Nenhuma porta foi perdida.

        C2/R5 — título, contagem e apoio na faixa fixa. A faixa fica com o
        TOTAL do recorte (critério C2 × B3 de 05/09); os blocos abaixo ficam
        com os recortes.

        R23 — esta tela é a EXCEÇÃO declarada (SEIS dimensões + agregação
        pesada em duas consultas), então a marca é RASCUNHO até o clique. A
        regra exige que a tela AVISE isso: sem o aviso, a etiqueta aparece ao
        marcar e a pessoa lê como filtro já aplicado, o que é mentira.
      */}
      <PageHeader
        titulo="Painel operacional de provisionamento"
        contagem={loading ? null : `${formatarMoedaBRL(totalPeriodo)} previstos`}
        descricao="Marque o recorte e clique em Atualizar relatório: com seis filtros, a consulta so roda no clique."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatorio',
          onClick: aplicarFiltros,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros, desabilitada: loading }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo variante="secundario">
        {/* R12/R16b: recorte enumerável em marcação; data inicial/final são
            contínuas e não têm lista fechada — vão em `campos`. */}
        <BarraFiltros
          campos={[
            {
              id: 'data_inicial',
              rotulo: 'Data inicial',
              tipo: 'date',
              valor: filtros.data_inicial,
              aoMudar: (valor) => atualizarCampo('data_inicial', valor)
            },
            {
              id: 'data_final',
              rotulo: 'Data final',
              tipo: 'date',
              valor: filtros.data_final,
              aoMudar: (valor) => atualizarCampo('data_final', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {/*
        MÓDULO DE DINHEIRO — os oito cartões de paleta crua viraram
        StatTile com TOM SEMÂNTICO por token (R25/M3). Os valores usam o
        `.app-stat-valor`, que já é tabular.

        B3/C2: o total previsto vive na FAIXA (é o número que acompanha a
        pessoa ao rolar); aqui ficam os RECORTES — janelas de 7 e 30 dias,
        vencidas, abertas, críticas, concentração e o tamanho da amostra
        analítica.
      */}
      <StatGrid colunas={4}>
        <StatTile
          label="Próximos 7 dias"
          valor={formatarMoedaBRL(dashboard?.cards?.total_proximos_7_dias || 0)}
          sub="Pressão imediata de caixa"
          tom="warning"
        />
        <StatTile
          label="Próximos 30 dias"
          valor={formatarMoedaBRL(dashboard?.cards?.total_proximos_30_dias || 0)}
          sub="Pressão de curto prazo"
        />
        <StatTile
          label="Vencidas não tratadas"
          valor={String(vencidas.length)}
          sub="Previstas/em analise já vencidas"
          tom={vencidas.length ? 'danger' : 'success'}
        />
        <StatTile
          label="Críticas próximas"
          valor={String(criticas.length)}
          sub="Prioridade critica nos próximos 7 dias"
          tom={criticas.length ? 'danger' : 'success'}
        />
        <StatTile
          label="Abertas"
          valor={String(abertas)}
          sub="Previstas, em analise ou aprovadas"
        />
        <StatTile
          label="Concentração alta"
          valor={String(concentracaoAlta.length)}
          sub="Obras acima do limiar do dashboard"
          tom={concentracaoAlta.length ? 'warning' : undefined}
        />
        <StatTile
          label="Analítico carregado"
          valor={String(lista.length)}
          sub={`Primeiros ${LIMITE_ANALITICO} itens do recorte`}
        />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 6 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:provisionamento-relatorio-operacional" larguraPadrao="total">
        <BlocoConteudo
          titulo="Curva mensal prevista"
          descricao="Valores por data prevista de desembolso, sem provisões canceladas."
          variante="primario"
          cor="var(--c-primary)"
        >
          {porMes.length === 0 ? (
            <p className="text-sm text-[var(--c-muted)]">Sem dados no recorte atual.</p>
          ) : (
            <div className="space-y-3">
              {porMes.map((item) => {
                const valor = Number(item.total_valor || 0);
                const largura = Math.max((valor / maiorMes) * 100, 4);
                return (
                  <div key={item.mes} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-[var(--c-text)]">{formatarMes(item.mes)}</span>
                      {/* Valor em barra também é dinheiro: tabular, para os
                          meses alinharem coluna a coluna. */}
                      <span className="font-semibold tabular-nums text-[var(--c-text)]">{formatarMoedaBRL(valor)}</span>
                    </div>
                    {/* A largura em % é DADO (a proporção da barra), não medida
                        de layout — por isso continua no style; a altura é o
                        degrau de 8px da escala e as cores são token.
                        R8: previsto = azul (--c-primary). Não há série
                        realizada nesta tela, então não há vermelho.
                        R18 (onde NÃO vale, 2): o overflow aqui só recorta a
                        FORMA da barra e não é ancestral de nada fixo. */}
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--ui-border)]">
                      <div className="h-full rounded-full bg-[var(--c-primary)]" style={{ width: `${largura}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BlocoConteudo>

        <BlocoAgrupado data-bloco-id="por-obra-centro" data-bloco-rotulo="Por obra/centro"
          titulo="Por obra/centro"
          descricao="Onde a previsão esta concentrada."
          linhas={dashboard?.graficos?.por_obra || []}
          total={totalPeriodo}
          storageKey="tabela:provisionamento-relatorio-operacional:por-obra"
          rotulo={(linha) => formatarObra(linha.obra)}
        />

        <BlocoAgrupado data-bloco-id="por-categoria-macro" data-bloco-rotulo="Por categoria macro"
          titulo="Por categoria macro"
          descricao="Composição da previsão por natureza de gasto."
          linhas={dashboard?.graficos?.por_categoria || []}
          total={totalPeriodo}
          storageKey="tabela:provisionamento-relatorio-operacional:por-categoria"
          rotulo={(linha) => linha.categoria?.nome || 'Sem categoria'}
        />

        <BlocoAgrupado data-bloco-id="pipeline-por-status" data-bloco-rotulo="Pipeline por status"
          titulo="Pipeline por status"
          descricao="Quanto já passou por analise e aprovação."
          linhas={dashboard?.graficos?.pipeline_status || []}
          total={totalPeriodo}
          storageKey="tabela:provisionamento-relatorio-operacional:pipeline-status"
          rotulo={(linha) => formatarStatus(linha.status)}
        />

        <BlocoAgrupado data-bloco-id="curva-semanal" data-bloco-rotulo="Curva semanal"
          titulo="Curva semanal"
          descricao="Distribuição da previsão nas próximas semanas do recorte."
          linhas={dashboard?.graficos?.curva_semanal || []}
          total={totalPeriodo}
          storageKey="tabela:provisionamento-relatorio-operacional:curva-semanal"
          rotulo={(linha) => linha.semana_label || linha.semana_inicio}
        />

        <BlocoConteudo
          titulo="Analítico do recorte"
          contagem={`${lista.length} item(ns)`}
          descricao={`Primeiros ${LIMITE_ANALITICO} provisionamentos ordenados pela data prevista mais próxima.`}
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'codigo',
                titulo: 'Código',
                // R17: o código NOMEIA o provisionamento da linha.
                tipo: 'identidade',
                noCard: 'titulo',
                /* "Onde a navegação mora" (04/09): o link para o REGISTRO
                   relacionado fica no corpo, junto do dado que o origina —
                   nunca na barra de ações. A cor vem de token (R25). */
                render: (item) => (
                  <Link className="font-semibold text-[var(--c-primary)]" to={`/provisoes-financeiras/${item.id}`}>
                    {item.codigo}
                  </Link>
                )
              },
              {
                id: 'data',
                titulo: 'Data prevista',
                tipo: 'data',
                render: (item) => formatarData(item.data_prevista_desembolso)
              },
              { id: 'obra', titulo: 'Obra/Centro', tipo: 'texto', render: (item) => formatarObra(item.obra) },
              { id: 'categoria', titulo: 'Categoria', tipo: 'texto', render: (item) => item.categoriaMacro?.nome || '-' },
              {
                id: 'descricao',
                titulo: 'Descrição',
                tipo: 'texto',
                // T6: texto longo trunca com o conteúdo completo no tooltip.
                render: (item) => <span title={item.descricao || undefined}>{item.descricao || '-'}</span>
              },
              { id: 'credor', titulo: 'Credor', tipo: 'texto', render: (item) => item.fornecedor_texto || '-' },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (item) => <StatusBadge status={formatarStatus(item.status)} kind={familiaStatus(item.status)} />
              },
              { id: 'prioridade', titulo: 'Prioridade', tipo: 'badge', render: (item) => formatarPrioridade(item.prioridade) },
              {
                id: 'valor',
                titulo: 'Valor',
                // R1/R17/T7 — dinheiro: 190px, à direita, tabular-nums, e
                // NUNCA trunca.
                tipo: 'valor',
                render: (item) => formatarMoedaBRL(item.valor_previsto)
              }
            ]}
            itens={lista}
            getId={(item) => item.id}
            carregando={loading}
            storageKey="tabela:provisionamento-relatorio-operacional:analitico"
            rotuloRolagem="Analitico do recorte"
            colunasConfiguraveis
            vazio="Nenhum provisionamento encontrado."
          />
        </BlocoConteudo>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
