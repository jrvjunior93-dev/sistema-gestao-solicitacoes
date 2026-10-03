import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineBanknotes,
  HiOutlineBuildingOffice2,
  HiOutlineCalendarDays,
  HiOutlineChartBarSquare,
  HiOutlineExclamationTriangle,
  HiOutlineTag
} from 'react-icons/hi2';
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
import {
  getDashboardProvisionamentoFinanceiro,
  getProvisionamentoFinanceiroContexto,
  listarCategoriasMacroProvisionamento
} from '../../../services/provisoesFinanceiras';
import { formatarMoedaBRL } from '../utils/moeda';

const FILTROS_VAZIOS = {
  obra_id: '',
  categoria_macro_id: '',
  prioridade: '',
  data_inicial: '',
  data_final: ''
};

const PRIORIDADE_OPCOES = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Media' },
  { valor: 'alta', rotulo: 'Alta' },
  { valor: 'critica', rotulo: 'Critica' }
];

function formatarObra(obra) {
  if (!obra) return '-';
  return `${obra.codigo ? `${obra.codigo} - ` : ''}${obra.nome}`;
}

function formatarMes(valor) {
  const match = String(valor || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return valor || '-';
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric'
  });
}

function formatarData(valor) {
  if (!valor) return '-';
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return '-';
}

function formatarPrioridade(valor) {
  const labels = {
    baixa: 'Baixa',
    media: 'Media',
    alta: 'Alta',
    critica: 'Critica'
  };
  return labels[String(valor || '').toLowerCase()] || 'Nao definida';
}

/*
  BARRAS DE PROPORÇÃO — o `dash-panel`/`dash-bar-*` era um dialeto próprio
  desta tela. Vira BlocoConteudo com a mesma leitura: rótulo, apoio, barra de
  proporção e o VALOR à direita em tabular-nums (é dinheiro: os meses e as
  obras precisam alinhar dígito a dígito).

  R8: aqui só existe a série PREVISTA — azul (`--c-primary`, que é o
  `--comp-previsto`). Não há série realizada nesta tela, então não há
  vermelho: cor é da SÉRIE, não do componente.
*/
function BlocoBarras({ titulo, descricao, itens, variante = 'secundario' }) {
  const maximo = Math.max(...itens.map((item) => Number(item.valor || 0)), 0);

  return (
    <BlocoConteudo titulo={titulo} descricao={descricao} variante={variante}>
      {itens.length === 0 ? (
        <p className="text-sm text-[var(--c-muted)]">Sem dados para o recorte atual.</p>
      ) : (
        <div className="space-y-3">
          {itens.map((item, index) => {
            const valor = Number(item.valor || 0);
            const largura = maximo > 0 ? Math.max(6, (valor / maximo) * 100) : 0;
            return (
              <div key={`${titulo}-${item.label}-${index}`} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--c-text)]" title={item.label}>
                    {item.label}
                    {item.meta ? <span className="text-[var(--c-muted)]"> · {item.meta}</span> : null}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--c-text)]">{formatarMoedaBRL(valor)}</span>
                </div>
                {/* A largura em % é DADO (a proporção), não medida de layout —
                    por isso continua no style; altura no degrau de 8px e
                    cores por token.
                    R18 (onde NÃO vale, 2): o overflow recorta só a FORMA da
                    barra e não é ancestral de nada fixo. */}
                <div className="h-2 overflow-hidden rounded-full bg-[var(--ui-border)]">
                  <div className="h-full rounded-full bg-[var(--c-primary)]" style={{ width: `${largura}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BlocoConteudo>
  );
}

/*
  Alerta: era uma pilha de <article> clicáveis com `role="button"` e o
  dinheiro concatenado numa string de texto. Vira TabelaPadrao — o valor
  ganha `tipo: 'valor'` (190px, à direita, tabular-nums, nunca trunca) e a
  linha ganha caminho por teclado do próprio componente (A1).
*/
function BlocoAlerta({ titulo, descricao, itens, storageKey, aoAbrir, vazio }) {
  return (
    <BlocoConteudo
      titulo={titulo}
      /* C2 × B3: o total do alerta está no ladrilho acima (recorte de
         decisão); aqui a contagem responde "quantos estão NESTA lista". */
      contagem={`${itens.length} item(ns)`}
      descricao={descricao}
      variante="secundario"
    >
      <TabelaPadrao
        colunas={[
          {
            id: 'codigo',
            titulo: 'Código',
            // R17: o código NOMEIA o provisionamento da linha.
            tipo: 'identidade',
            noCard: 'titulo',
            render: (item) => item.codigo
          },
          {
            id: 'obra',
            titulo: 'Obra',
            tipo: 'texto',
            render: (item) => formatarObra(item.obra)
          },
          {
            id: 'data',
            titulo: 'Data prevista',
            tipo: 'data',
            render: (item) => formatarData(item.data_prevista_desembolso)
          },
          {
            id: 'prioridade',
            titulo: 'Prioridade',
            tipo: 'badge',
            render: (item) => formatarPrioridade(item.prioridade)
          },
          {
            id: 'valor',
            titulo: 'Valor previsto',
            // T7 — dinheiro: nunca trunca, nunca vaza.
            tipo: 'valor',
            render: (item) => formatarMoedaBRL(item.valor_previsto)
          }
        ]}
        itens={itens}
        getId={(item) => item.id}
        storageKey={storageKey}
        rotuloRolagem={titulo}
        vazio={vazio}
        larguraAcoes={140}
        // A1: além do botão focável, o TabelaPadrao dá tabIndex + Enter na
        // linha quando recebe `aoClicarLinha`.
        aoClicarLinha={aoAbrir}
        acoesLinha={(item) => (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => aoAbrir(item)}>
            Detalhes
          </button>
        )}
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
  { id: 'obra_id', rotulo: 'Obra' },
  { id: 'categoria_macro_id', rotulo: 'Item macro' },
  { id: 'prioridade', rotulo: 'Prioridade' }
];

export default function DashboardProvisionamentoFinanceiro() {
  const navigate = useNavigate();
  const { avisos, avisar, fechar } = useAvisos();
  const [contexto, setContexto] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => String(filtros[filtro.id] ?? '').trim() !== '').map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:provisionamento-dashboard', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => atualizarCampo(id, FILTROS_VAZIOS[id] ?? '')
  });

  useEffect(() => {
    async function carregarBase() {
      try {
        setLoadingBase(true);
        const [contextoData, categoriasData] = await Promise.all([
          getProvisionamentoFinanceiroContexto(),
          listarCategoriasMacroProvisionamento()
        ]);
        setContexto(contextoData);
        setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
      } catch (error) {
        console.error(error);
        avisar.erro(error?.message || 'Erro ao carregar base do dashboard.');
      } finally {
        setLoadingBase(false);
      }
    }

    carregarBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const podeVerDashboard = useMemo(
    () => Boolean(contexto?.permissoes?.superadmin || contexto?.permissoes?.pode_dashboard),
    [contexto]
  );

  useEffect(() => {
    if (!contexto || podeVerDashboard) return;
    navigate('/provisoes-financeiras', { replace: true });
  }, [contexto, podeVerDashboard, navigate]);

  useEffect(() => {
    if (!contexto || !podeVerDashboard) return;

    async function carregarDashboard() {
      try {
        setLoadingDashboard(true);
        const data = await getDashboardProvisionamentoFinanceiro(filtros);
        setDashboard(data);
      } catch (error) {
        console.error(error);
        avisar.erro(error?.message || 'Erro ao carregar dashboard.');
      } finally {
        setLoadingDashboard(false);
      }
    }

    carregarDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexto, podeVerDashboard, filtros, refreshKey]);

  const obrasAcesso = useMemo(() => (
    Array.isArray(contexto?.obras_acesso) ? contexto.obras_acesso : []
  ), [contexto]);

  const obrasOrdenadas = useMemo(
    () => [...(dashboard?.graficos?.por_obra || [])].sort((a, b) => Number(b?.total_valor || 0) - Number(a?.total_valor || 0)),
    [dashboard]
  );

  const categoriasOrdenadas = useMemo(
    () => [...(dashboard?.graficos?.por_categoria || [])].sort((a, b) => Number(b?.total_valor || 0) - Number(a?.total_valor || 0)),
    [dashboard]
  );

  const curvaSemanal = useMemo(
    () => [...(dashboard?.graficos?.curva_semanal || [])].sort((a, b) => String(a?.semana_inicio || '').localeCompare(String(b?.semana_inicio || ''))),
    [dashboard]
  );

  const destaqueObra = useMemo(() => obrasOrdenadas[0] || null, [obrasOrdenadas]);
  const destaqueCategoria = useMemo(() => categoriasOrdenadas[0] || null, [categoriasOrdenadas]);
  const obrasConcentracaoAlta = useMemo(() => dashboard?.alertas?.obras_concentracao_alta || [], [dashboard]);

  /*
    R12 — os três recortes enumeráveis viram MARCAÇÃO com etiqueta
    removível. O endpoint aceita UM valor por chave, então as dimensões são
    `unico: true` (marca redonda; marcar outro substitui). R23: são três
    dimensões e uma consulta só — abaixo do critério da exceção, então o
    filtro APLICA AO MARCAR, sem botão.
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : []),
    categoria_macro_id: new Set(filtros.categoria_macro_id ? [String(filtros.categoria_macro_id)] : []),
    prioridade: new Set(filtros.prioridade ? [String(filtros.prioridade)] : [])
  }), [filtros]);

  const dimensoes = useMemo(() => [
    {
      id: 'obra_id',
      rotulo: 'Obra',
      unico: true,
      opcoes: obrasAcesso.map((obra) => ({ valor: String(obra.id), rotulo: formatarObra(obra) }))
    },
    {
      id: 'categoria_macro_id',
      rotulo: 'Item macro',
      unico: true,
      opcoes: categorias.map((categoria) => ({ valor: String(categoria.id), rotulo: categoria.nome }))
    },
    { id: 'prioridade', rotulo: 'Prioridade', unico: true, opcoes: PRIORIDADE_OPCOES }
  ], [obrasAcesso, categorias]);

  function alternarFiltro(dimensao, valor) {
    setFiltros((atual) => ({
      ...atual,
      [dimensao]: String(atual[dimensao]) === String(valor) ? '' : String(valor)
    }));
  }

  function atualizarCampo(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }

  function abrirProvisao(item) {
    navigate(`/provisoes-financeiras/${item.id}`);
  }

  if (loadingBase) {
    return (
      <Pagina>
        <PageHeader titulo="Dashboard de Previsão" />
        <BlocoConteudo>Carregando dashboard...</BlocoConteudo>
      </Pagina>
    );
  }

  if (!podeVerDashboard) {
    return (
      <Pagina>
        <PageHeader titulo="Dashboard de Previsão" />
        <BlocoConteudo>Redirecionando...</BlocoConteudo>
      </Pagina>
    );
  }

  const vencidasNaoTratadas = dashboard?.alertas?.vencidas_nao_tratadas?.itens || [];
  const criticasProximas = dashboard?.alertas?.itens_criticos_proximos?.itens || [];

  return (
    <Pagina>
      {/*
        R11/C6 — o botão "Ver lista" saiu da barra de ações: é CAMINHO PARA
        OUTRA TELA, e o lugar dele é o menu/hub/Ctrl+K. Conferido antes de
        remover: `/provisoes-financeiras` (`prov-lista`) é item de PRIMEIRO
        nível do menu do módulo. Sobra a única AÇÃO sobre esta tela:
        atualizar o recorte.

        C2/R5 — a faixa fica com o TOTAL do recorte (critério C2 × B3 de
        05/09) e os blocos, com os recortes.
      */}
      <PageHeader
        titulo="Dashboard de Previsão"
        contagem={loadingDashboard ? null : `${formatarMoedaBRL(dashboard?.cards?.total_periodo || 0)} previstos`}
        descricao="Leitura gerencial do desembolso previsto por obra, categoria e janela de tempo."
        acaoPrincipal={{
          rotulo: loadingDashboard ? 'Atualizando...' : 'Atualizar',
          onClick: () => setRefreshKey((valor) => valor + 1),
          desabilitada: loadingDashboard,
          icone: <HiOutlineArrowPath aria-hidden="true" />
        }}
        secundarias={[{
          rotulo: 'Limpar filtros',
          onClick: () => setFiltros(FILTROS_VAZIOS),
          desabilitada: loadingDashboard
        }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo variante="secundario">
        {/* R12/R16b: recorte enumerável em marcação; o período é contínuo e
            vai em `campos`. R23: aplica ao marcar (três dimensões, uma
            consulta) — sem botão "aplicar". */}
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
          aoLimpar={() => setFiltros(FILTROS_VAZIOS)}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {/*
        MÓDULO DE DINHEIRO — os sete `dash-kpi-card` viram StatTile com tom
        semântico por token. B3/C2: o TOTAL do período mora na faixa; aqui
        ficam os RECORTES (janelas de 7 e 30 dias, vencidas, destaques e
        concentração), cada um respondendo a sua própria pergunta.
      */}
      <StatGrid colunas={4}>
        <StatTile
          label="Provisões em aberto"
          valor={String(dashboard?.cards?.quantidade_abertas || 0)}
          sub="Previstas, em analise ou aprovadas"
          icone={<HiOutlineBanknotes aria-hidden="true" />}
        />
        <StatTile
          label="Próximos 7 dias"
          valor={formatarMoedaBRL(dashboard?.cards?.total_proximos_7_dias || 0)}
          sub="Pressão financeira imediata"
          tom="warning"
          icone={<HiOutlineCalendarDays aria-hidden="true" />}
        />
        <StatTile
          label="Próximos 30 dias"
          valor={formatarMoedaBRL(dashboard?.cards?.total_proximos_30_dias || 0)}
          sub="Visão de caixa do curto prazo"
          icone={<HiOutlineChartBarSquare aria-hidden="true" />}
        />
        <StatTile
          label="Vencidas não tratadas"
          valor={String(dashboard?.alertas?.vencidas_nao_tratadas?.quantidade || 0)}
          sub="Itens que pedem ação imediata"
          tom={Number(dashboard?.alertas?.vencidas_nao_tratadas?.quantidade || 0) > 0 ? 'danger' : 'success'}
          icone={<HiOutlineExclamationTriangle aria-hidden="true" />}
        />
        <StatTile
          label="Obra com maior concentração"
          valor={destaqueObra ? formatarMoedaBRL(destaqueObra.total_valor) : null}
          vazio={!destaqueObra}
          sub={destaqueObra ? formatarObra(destaqueObra.obra) : 'Sem destaque no recorte atual'}
          icone={<HiOutlineBuildingOffice2 aria-hidden="true" />}
        />
        <StatTile
          label="Categoria dominante"
          valor={destaqueCategoria ? formatarMoedaBRL(destaqueCategoria.total_valor) : null}
          vazio={!destaqueCategoria}
          sub={destaqueCategoria?.categoria?.nome || 'Sem destaque no recorte atual'}
          icone={<HiOutlineTag aria-hidden="true" />}
        />
        <StatTile
          label="Obras em concentração alta"
          valor={String(obrasConcentracaoAlta.length || 0)}
          sub="Acima do limiar de concentração do recorte"
          tom={obrasConcentracaoAlta.length ? 'warning' : undefined}
          icone={<HiOutlineExclamationTriangle aria-hidden="true" />}
        />
      </StatGrid>

      {loadingDashboard ? (
        <BlocoConteudo>Carregando dados do dashboard...</BlocoConteudo>
      ) : (
        <>
          {/*
            BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
            em que ligar isto é SEGURO: estes 7 blocos são leituras
            independentes — sem ordem obrigatória entre si, sem botão de gravar
            dentro e sem campo obrigatório que ocultar esconda. O padrão continua
            sendo o do código; a preferência guarda só o DESVIO. No celular o
            modo não existe (arrastar é HTML5 nativo e não responde a toque).
          */}
          <BlocosPersonalizaveis
            chave="blocos:dashboard-provisionamento-financeiro"
            larguraPadrao="total"
            dentroDeGrade
          >
            <BlocoBarras data-bloco-id="provisionamento-por-mes" data-bloco-rotulo="Provisionamento por mes"
              titulo="Provisionamento por mês"
              descricao="Curva de previsão para antecipar picos de desembolso."
              variante="primario"
              itens={(dashboard?.graficos?.por_mes || []).map((item) => ({
                label: formatarMes(item.mes),
                valor: Number(item.total_valor || 0),
                meta: `${item.quantidade || 0} registro(s)`
              }))}
            />

            <BlocoBarras data-bloco-id="top-obras-por-valor" data-bloco-rotulo="Top obras por valor"
              titulo="Top obras por valor"
              descricao="Onde a concentração financeira esta mais forte."
              itens={obrasOrdenadas.map((item) => ({
                label: formatarObra(item.obra),
                valor: Number(item.total_valor || 0),
                meta: `${item.quantidade || 0} registro(s)`
              }))}
            />

            <BlocoBarras data-bloco-id="provisionamento-por-item-macro" data-bloco-rotulo="Provisionamento por item macro"
              titulo="Provisionamento por item macro"
              descricao="Composição da previsão por natureza de gasto."
              itens={categoriasOrdenadas.map((item) => ({
                label: item.categoria?.nome || '-',
                valor: Number(item.total_valor || 0),
                meta: `${item.quantidade || 0} registro(s)`
              }))}
            />

            <BlocoBarras data-bloco-id="curva-semanal" data-bloco-rotulo="Curva semanal"
              titulo="Curva semanal"
              descricao="Distribuição da previsão nas próximas semanas do recorte."
              itens={curvaSemanal.map((item) => ({
                label: item.semana_label || '-',
                valor: Number(item.total_valor || 0),
                meta: `${item.quantidade || 0} registro(s)`
              }))}
            />

            <BlocoAlerta data-bloco-id="vencidas-nao-tratadas" data-bloco-rotulo="Vencidas nao tratadas"
              titulo="Vencidas não tratadas"
              descricao="Itens que precisam de regularizacao."
              itens={vencidasNaoTratadas}
              storageKey="tabela:provisionamento-dashboard:vencidas"
              aoAbrir={abrirProvisao}
              vazio="Nenhum item neste alerta."
            />

            <BlocoAlerta data-bloco-id="criticas-proximas" data-bloco-rotulo="Criticas proximas"
              titulo="Críticas próximas"
              descricao="Itens de prioridade critica no horizonte imediato."
              itens={criticasProximas}
              storageKey="tabela:provisionamento-dashboard:criticas"
              aoAbrir={abrirProvisao}
              vazio="Nenhum item neste alerta."
            />

            <BlocoConteudo
              titulo="Concentração por obra"
              contagem={`${obrasConcentracaoAlta.length} obra(s)`}
              descricao="Obras com peso mais alto dentro do valor previsto do recorte."
              variante="secundario"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'obra',
                    titulo: 'Obra',
                    // R17: a obra NOMEIA a linha da concentração.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => formatarObra(item.obra)
                  },
                  {
                    id: 'valor',
                    titulo: 'Valor previsto',
                    tipo: 'valor',
                    render: (item) => formatarMoedaBRL(item.total_valor)
                  },
                  {
                    id: 'percentual',
                    titulo: 'Participação',
                    tipo: 'numero',
                    render: (item) => `${item.percentual}%`
                  }
                ]}
                itens={obrasConcentracaoAlta}
                getId={(item) => item.obra_id}
                storageKey="tabela:provisionamento-dashboard:concentracao"
                rotuloRolagem="Concentracao por obra"
                vazio="Nenhuma obra acima do limiar de concentração."
              />
            </BlocoConteudo>
          </BlocosPersonalizaveis>
        </>
      )}
    </Pagina>
  );
}
