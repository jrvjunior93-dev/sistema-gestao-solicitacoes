import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  useFiltrosVisiveis
} from '../components/padrao';
import { obterRelatorioCategoriasInsumosCompras } from '../services/compras';
import { getMinhasObras } from '../services/obras';
import '../styles/compras-relatorio-apoio.css';

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

function extractErrorMessage(error) {
  const message = error?.message || '';
  try {
    const parsed = JSON.parse(message);
    return parsed?.error || parsed?.message || message;
  } catch (_) {
    return message || 'Erro ao carregar compras por categoria e insumo';
  }
}

/**
 * BARRA DE PROPORCAO — a largura em % e DADO (a proporcao da categoria), nao
 * medida de layout: por isso continua no `style` e nao vira degrau da escala
 * (R10). Trilho e preenchimento saem de token (R25); antes o trilho era
 * `bg-slate-100`, paleta crua sem par no tema escuro.
 *
 * O ZERO NAO DESENHA (correcao de 04/09). A versao anterior calculava
 * `Math.max(4, pct)` sem guarda: uma categoria com valor ZERO saia com 4% de
 * barra pintada — barra visivel afirmando que existe valor onde nao existe
 * nenhum. O piso de 4% tem proposito legitimo (valor pequeno porem real
 * precisa aparecer), mas so vale DEPOIS de o valor ser maior que zero.
 */
function BarraProporcao({ valor, maximo }) {
  const numero = Number(valor || 0);
  const proporcao = maximo > 0 ? (numero / maximo) * 100 : 0;
  const largura = numero > 0 ? Math.max(4, proporcao) : 0;
  return (
    <div className="h-2 rounded-full bg-[var(--ui-border)] overflow-clip">
      <div className="h-full rounded-full bg-[var(--c-primary)]" style={{ width: `${largura}%` }} />
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
  { id: 'data_inicio', rotulo: 'Pedido criado de' },
  { id: 'data_fim', rotulo: 'Pedido criado até' },
  { id: 'obra_id', rotulo: 'Obra / Centro de custo' }
];

export default function ComprasRelatorioCategoriasInsumos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtros, setFiltros] = useState(() => readFilters(searchParams));
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

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
        setErro('');
        const data = await obterRelatorioCategoriasInsumosCompras(filtrosAtivos);
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
  const categorias = useMemo(() => (Array.isArray(relatorio?.categorias) ? relatorio.categorias : []), [relatorio]);
  const insumos = useMemo(() => (Array.isArray(relatorio?.insumos) ? relatorio.insumos : []), [relatorio]);
  const obrasResumo = useMemo(() => (Array.isArray(relatorio?.obras) ? relatorio.obras : []), [relatorio]);
  const topCategorias = useMemo(() => categorias.slice(0, 10), [categorias]);
  const maiorValorCategoria = useMemo(
    () => Math.max(...topCategorias.map((item) => Number(item.valor_total || 0)), 0),
    [topCategorias]
  );

  /*
    R12: a obra deixou de ser `<select>` e virou MARCACAO. `unico: true`
    porque o endpoint recebe UM `obra_id` (`parseInteger` no validador do
    backend, com `ensureAllowedKeys` limitando a chave a um valor): sem
    declarar, o menu abriria com caixa quadrada prometendo escolha multipla
    e, com duas marcas, a tela mandaria filtro nenhum — duas etiquetas na
    faixa e a lista sem estreitar (R15).
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : [])
  }), [filtros.obra_id]);

  const dimensoes = useMemo(() => [
    {
      id: 'obra_id',
      rotulo: 'Obra / Centro de custo',
      unico: true,
      opcoes: obras.map((obra) => ({
        valor: String(obra.id),
        rotulo: obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome
      }))
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:compras-categorias-insumos', FILTROS_DA_TELA, {
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
    setFiltros((current) => ({ ...current, [campo]: valor }));
  }

  function alternarFiltro(dimensao, valor) {
    setFiltros((current) => ({
      ...current,
      [dimensao]: String(current[dimensao]) === String(valor) ? '' : String(valor)
    }));
  }

  function aplicarFiltros() {
    setSearchParams(buildSearchParams(filtros));
  }

  function limparFiltros() {
    setFiltros(DEFAULT_FILTERS);
    setSearchParams(new URLSearchParams());
  }

  return (
    /* C1: apoio (contagem + descricao) passa de 180 caracteres — mais longo
       que nos outros relatorios de Compras — e empurrava a barra de acoes
       para uma segunda linha na faixa compacta (94px; ver o comentario em
       styles/compras-relatorio-apoio.css). */
    <Pagina className="apoio-linha-unica">
      {/* R11: "Voltar aos relatorios" era botao de acao fazendo papel de
          navegacao. Vira a seta `voltar` do PageHeader. */}
      <PageHeader
        titulo="Categorias e Insumos"
        voltar={{ to: '/compras/relatorios', title: 'Voltar aos relatorios' }}
        contagem={`${formatNumber(categorias.length)} categoria(s) no recorte`}
        /* R23: agregacao pesada sobre itens de pedido — o recorte e
           RASCUNHO ate o clique, e a regra exige que a tela AVISE isso. */
        descricao="Valor pedido por categoria, insumo e obra/centro com base nos itens reais dos pedidos de compra. Marque o recorte e clique em Atualizar relatório."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatorio',
          onClick: aplicarFiltros,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros }]}
      />

      <BlocoConteudo variante="secundario">
        {/* R12/R16b: obra e recorte enumeravel (marcacao + etiqueta); as
            datas sao contornos continuos — vao em `campos`. */}
        <BarraFiltros
          campos={[
            {
              id: 'data_inicio',
              rotulo: 'Pedido criado de',
              tipo: 'date',
              valor: filtros.data_inicio,
              aoMudar: (valor) => atualizarCampo('data_inicio', valor)
            },
            {
              id: 'data_fim',
              rotulo: 'Pedido criado até',
              tipo: 'date',
              valor: filtros.data_fim,
              aoMudar: (valor) => atualizarCampo('data_fim', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          /* R16: "Limpar" tem UM dono nesta tela — o botao secundario do
             cabecalho. Passar `aoLimpar` aqui poria um segundo controle
             com a MESMA acao no mesmo contexto visual; o ✕ de cada
             etiqueta continua removendo o recorte individual. */
          aoAlternar={alternarFiltro}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {/* O erro de carregamento era uma caixa de paleta crua escrita a mao
          (`border-red-200 bg-red-50 text-red-700`) — sem par no tema escuro
          e sem passar pelo piso de contraste (R25). Agora e o Avisos do
          sistema: tom semantico + icone. */}
      <Avisos
        avisos={erro ? [{ id: 'categorias-insumos-erro', tipo: 'error', mensagem: erro }] : []}
        aoFechar={() => setErro('')}
      />

      {/* Os cinco ladrilhos usavam `.metric-card`, classe que NAO EXISTE em
          CSS nenhum do repositorio: os KPIs saiam sem caixa, sem hierarquia
          e sem alinhamento — texto solto sobre o canvas. Agora StatGrid. */}
      <StatGrid colunas={5}>
        <StatTile label="Itens" valor={formatNumber(resumo.itens)} sub="Itens de pedidos" />
        <StatTile label="Pedidos" valor={formatNumber(resumo.pedidos)} sub="Pedidos com itens" />
        <StatTile label="Categorias" valor={formatNumber(resumo.categorias)} sub="Com movimentação" />
        <StatTile label="Valor total" valor={formatMoney(resumo.valor_total)} sub="Valor dos itens" />
        <StatTile label="Ticket médio item" valor={formatMoney(resumo.ticket_medio_item)} sub="Valor médio por item" />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 3 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:compras-relatorio-categorias-insumos" larguraPadrao="total">
        <BlocoConteudo
          titulo="Compras por categoria"
          descricao="Top 10 categorias por valor efetivamente pedido no período filtrado."
        >
          {loading ? (
            <div className="app-empty-card">Carregando categorias...</div>
          ) : topCategorias.length === 0 ? (
            <div className="app-empty-card">Sem itens de pedido para montar o gráfico.</div>
          ) : (
            <div className="grid gap-3">
              {topCategorias.map((item, index) => (
                <div key={`categoria-grafico-${item.key}`} className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[var(--c-muted)]">#{index + 1}</span>
                      <strong className="ml-2 text-sm text-[var(--c-text)]">{item.categoria_nome}</strong>
                      <span className="ml-2 text-xs text-[var(--c-muted)]">
                        {formatNumber(item.itens)} item(ns)
                      </span>
                    </div>
                    <strong className="text-sm tabular-nums text-[var(--c-text)]">{formatMoney(item.valor_total)}</strong>
                  </div>
                  <BarraProporcao valor={item.valor_total} maximo={maiorValorCategoria} />
                </div>
              ))}
            </div>
          )}
        </BlocoConteudo>

        {/* R18: os `overflow-hidden` que embrulhavam estas tabelas criavam
            scrollport e matavam o `position: sticky` da coluna fixa e do
            cabecalho — sem erro e sem falha de build. */}
        <div data-bloco-id="por-categoria" data-bloco-rotulo="Por categoria" className="grid gap-4 xl:grid-cols-2">
          <BlocoConteudo
            titulo="Por categoria"
            descricao="Categorias do cadastro de insumos e itens manuais sem categoria."
            variante="secundario"
          >
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
                { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
                { id: 'quantidade', titulo: 'Quantidade', tipo: 'numero', render: (item) => formatNumber(item.quantidade_total, 3) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatMoney(item.valor_total) }
              ]}
              itens={categorias}
              getId={(item) => item.key}
              carregando={loading}
              storageKey="tabela:compras-categorias-insumos:categorias"
              rotuloRolagem="Compras por categoria"
              vazio="Sem itens de pedido no período."
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Por obra/centro"
            descricao="Concentração de valor pedido por origem operacional."
            variante="secundario"
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'obra',
                  titulo: 'Obra/Centro',
                  // R17: a obra/centro NOMEIA a linha deste resumo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.obra_nome
                },
                { id: 'itens', titulo: 'Itens', tipo: 'numero', render: (item) => formatNumber(item.itens) },
                { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatMoney(item.valor_total) }
              ]}
              itens={obrasResumo}
              getId={(item) => item.key}
              carregando={loading}
              storageKey="tabela:compras-categorias-insumos:obras"
              rotuloRolagem="Compras por obra/centro"
              vazio="Sem itens de pedido no período."
            />
          </BlocoConteudo>
        </div>

        <BlocoConteudo
          titulo="Por insumo/item"
          descricao="Top 100 itens por valor total pedido."
          variante="primario"
          cor="var(--c-primary)"
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'descricao',
                titulo: 'Insumo/Item',
                // R17: a descricao do insumo NOMEIA o registro.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => item.descricao
              },
              { id: 'categoria', titulo: 'Categoria', tipo: 'texto', render: (item) => item.categoria_nome },
              { id: 'unidade', titulo: 'Unidade', tipo: 'texto', render: (item) => item.unidade || '-' },
              { id: 'itens', titulo: 'Itens', tipo: 'numero', render: (item) => formatNumber(item.itens) },
              { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
              { id: 'quantidade', titulo: 'Quantidade', tipo: 'numero', render: (item) => formatNumber(item.quantidade_total, 3) },
              { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatMoney(item.valor_total) }
            ]}
            itens={insumos}
            getId={(item) => item.key}
            carregando={loading}
            storageKey="tabela:compras-categorias-insumos:insumos"
            rotuloRolagem="Compras por insumo/item"
            vazio="Sem itens de pedido no período."
          />
        </BlocoConteudo>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
