import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  BlocosPersonalizaveis,
  CelulaDupla,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useFiltrosVisiveis
} from '../components/padrao';
import { obterRelatorioPrecosInsumosFornecedores } from '../services/compras';
import { getMinhasObras } from '../services/obras';

const DEFAULT_FILTERS = {
  obra_id: '',
  data_inicio: '',
  data_fim: ''
};

function readFilters(searchParams) {
  return {
    obra_id: searchParams.get('obra_id') || '',
    data_inicio: searchParams.get('data_inicio') || '',
    data_fim: searchParams.get('data_fim') || ''
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

function formatMoney(value) {
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleDateString('pt-BR');
}

function extractErrorMessage(error) {
  const message = error?.message || '';
  try {
    const parsed = JSON.parse(message);
    return parsed?.error || parsed?.message || message;
  } catch (_) {
    return message || 'Erro ao carregar relatorio de precos por insumo';
  }
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
  { id: 'data_inicio', rotulo: 'Pedido criado de' },
  { id: 'data_fim', rotulo: 'Pedido criado até' },
  { id: 'obra_id', rotulo: 'Obra / Centro de custo' }
];

export default function ComprasRelatorioPrecosInsumos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { avisos, avisar, fechar } = useAvisos();
  const [filtros, setFiltros] = useState(() => readFilters(searchParams));
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let ativo = true;
    getMinhasObras()
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
        const data = await obterRelatorioPrecosInsumosFornecedores(filtrosAtivos);
        if (ativo) {
          setRelatorio(data);
        }
      } catch (error) {
        console.error(error);
        if (ativo) {
          setRelatorio(null);
          /*
            R19: a faixa de erro era `alert alert-error`. A classe existe no
            CSS, mas só ANINHADA (`.layout-shell .alert-error` /
            `.login-card .alert-error`) — fora do shell ela não pinta nada. O
            aviso do sistema não depende de onde a tela está montada.
          */
          avisar.erro(extractErrorMessage(error));
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
  }, [searchParams, recarga, avisar]);

  const resumo = relatorio?.resumo || {};
  const itens = useMemo(() => (Array.isArray(relatorio?.itens) ? relatorio.itens : []), [relatorio]);
  const comparativo = useMemo(() => (
    Array.isArray(relatorio?.comparativo) ? relatorio.comparativo : []
  ), [relatorio]);
  const categorias = useMemo(() => (
    Array.isArray(relatorio?.categorias) ? relatorio.categorias : []
  ), [relatorio]);

  /*
    R12: obra/centro sai do `<select>` e vira marcação com etiqueta
    removível; as duas datas são recorte contínuo e entram em `campos`
    (R16b).
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : [])
  }), [filtros.obra_id]);

  /*
    `unico: true`: o backend valida `obra_id` com `parseInteger`
    (validateCompraRelatorioPrecosInsumosQuery) — UM valor por consulta.
  */
  const dimensoes = useMemo(() => [
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
    () => FILTROS_DA_TELA.filter((filtro) => String(filtros[filtro.id] ?? '').trim() !== ''
      || String(searchParams.get(filtro.id) ?? '').trim() !== '').map((filtro) => filtro.id),
    [filtros, searchParams]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:compras-precos-insumos', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      mudarCampo(id, DEFAULT_FILTERS[id] ?? '');
      // A consulta em curso mora na URL: sem tirar a chave dali, o recorte
      // seguiria valendo com o campo já fora da faixa.
      if (searchParams.get(id)) {
        const proximos = new URLSearchParams(searchParams);
        proximos.delete(id);
        setSearchParams(proximos);
      }
    }
  });

  /*
    R23: 1 dimensão marcável + 2 datas não alcança o critério de consulta
    cara (4+ dimensões), então o recorte aplica ao marcar — a etiqueta na
    faixa nunca afirma um filtro que ainda não está valendo. "Atualizar
    relatorio" fica como recarga explícita do recorte atual.
  */
  function aplicar(proximos) {
    setFiltros(proximos);
    setSearchParams(buildSearchParams(proximos));
  }

  function alternarFiltro(dimensao, valor) {
    aplicar({
      ...filtros,
      [dimensao]: String(filtros[dimensao]) === String(valor) ? '' : String(valor)
    });
  }

  function mudarCampo(campo, valor) {
    aplicar({ ...filtros, [campo]: valor });
  }

  function limparFiltros() {
    setFiltros(DEFAULT_FILTERS);
    setSearchParams(new URLSearchParams());
  }

  function recarregar() {
    setRecarga((atual) => atual + 1);
  }

  return (
    <Pagina>
      <PageHeader
        titulo="Preços por Insumo"
        contagem="Compras / Relatórios"
        descricao="Preço médio de compra por insumo e fornecedor, calculado pelos itens reais dos pedidos."
        /* R11: o retorno ao hub de relatórios mora na seta do cabeçalho. */
        voltar={{ to: '/compras/relatorios', title: 'Voltar aos relatorios' }}
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatorio',
          onClick: recarregar,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo variante="secundario">
        <BarraFiltros
          campos={[
            {
              id: 'data_inicio',
              rotulo: 'Pedido criado de',
              tipo: 'date',
              valor: filtros.data_inicio,
              aoMudar: (valor) => mudarCampo('data_inicio', valor)
            },
            {
              id: 'data_fim',
              rotulo: 'Pedido criado até',
              tipo: 'date',
              valor: filtros.data_fim,
              aoMudar: (valor) => mudarCampo('data_fim', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      <StatGrid colunas={3}>
        <StatTile label="Itens lancados" valor={formatNumber(resumo.itens_lancados)} sub="Itens reais de pedidos" />
        <StatTile label="Itens distintos" valor={formatNumber(resumo.itens_distintos)} sub="Insumos ou manuais agrupados" />
        <StatTile label="Fornecedores" valor={formatNumber(resumo.fornecedores)} sub="Com itens no período" />
        <StatTile label="Pedidos" valor={formatNumber(resumo.pedidos)} sub="Pedidos usados no cálculo" />
        <StatTile label="Valor analisado" valor={formatMoney(resumo.valor_total)} sub="Soma dos itens" />
        <StatTile label="Mais de um fornecedor" valor={formatNumber(resumo.itens_com_mais_de_um_fornecedor)} sub="Itens comparaveis" />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 2 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:compras-relatorio-precos-insumos" larguraPadrao="total">
        {/*
          R18: as três tabelas viviam dentro de `card ... overflow-hidden` — o
          `hidden` cria scrollport e mata o `position: sticky` do cabeçalho e
          da coluna fixa em silêncio. O BlocoConteudo não recorta.

          R25 + CelulaDupla: cada célula "principal + detalhe" era
          `text-slate-900` sobre `text-slate-500` escrita à mão, dez vezes —
          `text-slate-500` é #64748b, 4,34:1, abaixo do mínimo AA de 4,5:1, e
          sem par no tema escuro. Era a `CelulaDupla` reimplementada célula a
          célula: agora é o componente, que já traz o par de tons por token.
        */}
        <BlocoConteudo
          titulo="Insumos por preço médio"
          descricao="Resumo por item comprado, com menor preço médio observado entre fornecedores."
          variante="primario"
          cor="var(--c-primary)"
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'item',
                titulo: 'Item',
                // R17: o insumo/item NOMEIA a linha do resumo.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (
                  <CelulaDupla
                    principal={item.descricao}
                    sub={`${item.unidade || '-'} - ${item.origem === 'INSUMO' ? 'Insumo cadastrado' : 'Item manual'}`}
                  />
                )
              },
              { id: 'categoria', titulo: 'Categoria', tipo: 'texto', render: (item) => item.categoria_nome || '-' },
              { id: 'fornecedores', titulo: 'Fornecedores', tipo: 'numero', render: (item) => formatNumber(item.fornecedores) },
              { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
              { id: 'quantidade', titulo: 'Quantidade', tipo: 'numero', render: (item) => formatNumber(item.quantidade_total, 3) },
              { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => <span className="font-semibold">{formatMoney(item.valor_total)}</span> },
              { id: 'preco_medio', titulo: 'Preço médio', tipo: 'valor', render: (item) => formatMoney(item.preco_medio_geral) },
              {
                id: 'melhor',
                titulo: 'Melhor fornecedor médio',
                tipo: 'texto',
                render: (item) => (
                  <CelulaDupla
                    principal={item.melhor_fornecedor?.nome || '-'}
                    sub={formatMoney(item.menor_preco_medio)}
                  />
                )
              }
            ]}
            itens={itens}
            getId={(item) => item.key}
            carregando={loading}
            storageKey="tabela:compras-precos-insumos:itens"
            rotuloRolagem="Insumos por preco medio"
            vazio="Sem itens de pedido nos filtros."
          />
        </BlocoConteudo>

        <div data-bloco-id="comparativo-por-fornecedor" data-bloco-rotulo="Comparativo por fornecedor" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <BlocoConteudo
            titulo="Comparativo por fornecedor"
            descricao="Cada linha compara o preço médio do fornecedor contra o menor preço médio do mesmo item."
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'item',
                  titulo: 'Item',
                  // R17: o insumo/item NOMEIA a linha do comparativo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => (
                    <CelulaDupla principal={item.descricao} sub={item.unidade || '-'} />
                  )
                },
                { id: 'fornecedor', titulo: 'Fornecedor', tipo: 'texto', render: (item) => <span className="font-semibold text-[var(--c-text)]">{item.fornecedor_nome}</span> },
                { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
                { id: 'quantidade', titulo: 'Quantidade', tipo: 'numero', render: (item) => formatNumber(item.quantidade_total, 3) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatMoney(item.valor_total) },
                { id: 'preco', titulo: 'Preço médio', tipo: 'valor', render: (item) => <span className="font-semibold">{formatMoney(item.preco_medio)}</span> },
                { id: 'menor', titulo: 'Menor médio', tipo: 'valor', render: (item) => formatMoney(item.menor_preco_medio_item) },
                {
                  id: 'diferenca',
                  titulo: 'Diferença',
                  tipo: 'valor',
                  /*
                    R25: `text-amber-700` / `text-emerald-700` viravam a única
                    fonte do SIGNIFICADO (pagou acima × está no menor preço).
                    O significado ficou, agora em token semântico: acima do
                    menor preço é `--c-warning`, no menor preço é `--c-success`.
                  */
                  render: (item) => (
                    <CelulaDupla
                      principal={(
                        <span
                          className="font-semibold"
                          style={{
                            color: Number(item.diferenca_menor_preco_medio || 0) > 0
                              ? 'var(--c-warning)'
                              : 'var(--c-success)'
                          }}
                        >
                          {formatMoney(item.diferenca_menor_preco_medio)}
                        </span>
                      )}
                      sub={formatPercent(item.diferenca_percentual)}
                      title={`${formatMoney(item.diferenca_menor_preco_medio)} — ${formatPercent(item.diferenca_percentual)}`}
                    />
                  )
                },
                { id: 'ultimo', titulo: 'Último pedido', tipo: 'data', render: (item) => formatDate(item.ultimo_pedido_em) }
              ]}
              itens={comparativo}
              getId={(item) => `${item.item_key}-${item.fornecedor_id || 'sem'}`}
              carregando={loading}
              storageKey="tabela:compras-precos-insumos:comparativo"
              rotuloRolagem="Comparativo por fornecedor"
              vazio="Sem comparativo nos filtros."
            />
          </BlocoConteudo>

          <BlocoConteudo titulo="Categorias" descricao="Valor analisado por categoria dos insumos.">
            <TabelaPadrao
              colunas={[
                {
                  id: 'categoria',
                  titulo: 'Categoria',
                  // R17: a categoria NOMEIA a linha deste resumo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.categoria_nome
                },
                { id: 'itens', titulo: 'Itens', tipo: 'numero', render: (item) => formatNumber(item.itens) },
                { id: 'fornecedores', titulo: 'Fornecedores', tipo: 'numero', render: (item) => formatNumber(item.fornecedores) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => <span className="font-semibold">{formatMoney(item.valor_total)}</span> }
              ]}
              itens={categorias}
              getId={(item) => item.key}
              carregando={loading}
              storageKey="tabela:compras-precos-insumos:categorias"
              rotuloRolagem="Categorias"
              vazio="Sem categorias nos filtros."
            />
          </BlocoConteudo>
        </div>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
