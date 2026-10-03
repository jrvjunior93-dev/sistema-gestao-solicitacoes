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
import { obterRelatorioEvolucaoCompras } from '../services/compras';
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function extractErrorMessage(error) {
  const message = error?.message || '';
  try {
    const parsed = JSON.parse(message);
    return parsed?.error || parsed?.message || message;
  } catch (_) {
    return message || 'Erro ao carregar relatorio de evolucao mensal de compras';
  }
}

/**
 * MINIBARRA DA CURVA MENSAL — a largura em % e DADO (a proporcao do mes
 * contra o maior mes), nao medida de layout: por isso continua no `style` e
 * nao vira degrau da escala (R10). Trilho e preenchimento saem de token
 * (R25); antes eram `bg-slate-100` e `bg-blue-600`, paleta crua sem par no
 * tema escuro e fora do piso de contraste do ThemeContext.
 *
 * O ZERO NAO DESENHA (correcao de 04/09). A versao anterior calculava
 * `Math.max(4, ...)` sem guarda: um mes com valor ZERO saia com 4% de barra
 * pintada — barra visivel afirmando que houve compra num mes sem nenhuma.
 * O piso de 4% tem proposito legitimo (mes pequeno porem real precisa
 * aparecer), mas so vale DEPOIS de o valor ser maior que zero.
 */
function MiniBar({ value, max }) {
  const numero = Number(value || 0);
  const proporcao = max > 0 ? Math.round((numero / max) * 100) : 0;
  const largura = numero > 0 ? Math.max(4, proporcao) : 0;
  return (
    <div className="mt-1 h-2 rounded-full bg-[var(--ui-border)] overflow-clip">
      <div
        className="h-2 rounded-full bg-[var(--c-primary)]"
        style={{ width: `${largura}%` }}
      />
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

export default function ComprasRelatorioEvolucao() {
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
        const data = await obterRelatorioEvolucaoCompras(filtrosAtivos);
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
  const meses = useMemo(() => (Array.isArray(relatorio?.meses) ? relatorio.meses : []), [relatorio]);
  const obrasResumo = useMemo(() => (Array.isArray(relatorio?.obras) ? relatorio.obras : []), [relatorio]);
  const statusResumo = useMemo(() => (Array.isArray(relatorio?.status) ? relatorio.status : []), [relatorio]);
  const maxMesValor = useMemo(() => (
    meses.reduce((max, item) => Math.max(max, Number(item.valor_total || 0)), 0)
  ), [meses]);

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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:compras-evolucao', FILTROS_DA_TELA, {
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
        titulo="Evolução Mensal de Compras"
        voltar={{ to: '/compras/relatorios', title: 'Voltar aos relatorios' }}
        contagem={`${formatNumber(meses.length)} mês(es) com movimentação`}
        /* R23: agregacao pesada sobre pedidos, itens e fornecedores — o
           recorte e RASCUNHO ate o clique, e a regra exige que a tela
           AVISE isso. */
        descricao="Curva mensal de pedidos de compra emitidos, valor total, ticket médio e concentração por obra/centro. Marque o recorte e clique em Atualizar relatório."
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

      <Avisos
        avisos={erro ? [{ id: 'evolucao-erro', tipo: 'error', mensagem: erro }] : []}
        aoFechar={() => setErro('')}
      />

      <StatGrid colunas={3}>
        <StatTile label="Pedidos" valor={formatNumber(resumo.pedidos)} sub="Pedidos emitidos" />
        <StatTile label="Meses" valor={formatNumber(resumo.meses)} sub="Com movimentação" />
        <StatTile label="Valor total" valor={formatMoney(resumo.valor_total)} sub="Soma dos pedidos" />
        <StatTile label="Ticket médio" valor={formatMoney(resumo.ticket_medio)} sub="Valor por pedido" />
        <StatTile
          label="Maior mês"
          valor={resumo.maior_mes?.label || '-'}
          sub={resumo.maior_mes ? formatMoney(resumo.maior_mes.valor_total) : 'Sem dados'}
          vazio={!resumo.maior_mes}
        />
        <StatTile label="Fornecedores" valor={formatNumber(resumo.fornecedores)} sub="Com pedido no período" />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 2 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:compras-relatorio-evolucao" larguraPadrao="total">
        {/* R18: o `overflow-hidden` que embrulhava esta tabela criava um
            scrollport e matava o `position: sticky` da coluna fixa e do
            cabecalho — sem erro e sem falha de build. */}
        <BlocoConteudo
          titulo="Curva mensal"
          descricao="Pedidos agrupados pelo mês real de criação do pedido de compra."
          variante="primario"
          cor="var(--c-primary)"
        >
          <TabelaPadrao
            // R17: serie puramente temporal (mes x totais) — a linha e um
            // periodo, nao um registro nomeado; nao ha coluna de identidade.
            semIdentidade
            colunas={[
              { id: 'mes', titulo: 'Mês', tipo: 'texto', noCard: 'titulo', render: (item) => <span className="font-semibold text-[var(--c-text)]">{item.label}</span> },
              { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
              { id: 'fornecedores', titulo: 'Fornecedores', tipo: 'numero', render: (item) => formatNumber(item.fornecedores) },
              { id: 'obras', titulo: 'Obras', tipo: 'numero', render: (item) => formatNumber(item.obras) },
              { id: 'itens', titulo: 'Itens', tipo: 'numero', render: (item) => formatNumber(item.itens) },
              {
                id: 'valor',
                titulo: 'Valor',
                tipo: 'valor',
                render: (item) => (
                  <span className="font-semibold">
                    {formatMoney(item.valor_total)}
                    <MiniBar value={item.valor_total} max={maxMesValor} />
                  </span>
                )
              },
              { id: 'ticket', titulo: 'Ticket', tipo: 'valor', render: (item) => formatMoney(item.ticket_medio) },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'texto',
                render: (item) => (
                  <>
                    {/* `.badge-soft` NAO EXISTE em CSS nenhum do repositorio —
                        a pilula saia sem fundo, sem contorno e sem forma.
                        `badge-muted` existe e e a familia neutra do sistema. */}
                    {(item.status || []).slice(0, 3).map((status) => (
                      <span key={status.key} className="badge badge-muted mr-1">
                        {status.label}: {status.total}
                      </span>
                    ))}
                  </>
                )
              }
            ]}
            itens={meses}
            getId={(item) => item.key}
            carregando={loading}
            storageKey="tabela:compras-evolucao:meses"
            rotuloRolagem="Curva mensal"
            vazio="Sem pedidos nos filtros."
          />
        </BlocoConteudo>

        <div data-bloco-id="compras-por-obra-centro" data-bloco-rotulo="Compras por obra/centro" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <BlocoConteudo
            titulo="Compras por obra/centro"
            descricao="Ranking de valor comprado por obra ou centro de custo no período."
            variante="secundario"
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'obra',
                  titulo: 'Obra/Centro',
                  // R17: a obra/centro NOMEIA a linha do ranking.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.obra_nome
                },
                { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
                { id: 'fornecedores', titulo: 'Fornecedores', tipo: 'numero', render: (item) => formatNumber(item.fornecedores) },
                { id: 'itens', titulo: 'Itens', tipo: 'numero', render: (item) => formatNumber(item.itens) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => <span className="font-semibold">{formatMoney(item.valor_total)}</span> },
                { id: 'ticket', titulo: 'Ticket', tipo: 'valor', render: (item) => formatMoney(item.ticket_medio) },
                {
                  id: 'meses',
                  titulo: 'Meses',
                  tipo: 'valor',
                  /*
                    T7: os tres meses iam juntos num UNICO texto ("mes: valor |
                    mes: valor | ..."), e esse texto e um SO no de dinheiro:
                    quando nao cabia, ele nao truncava, QUEBRAVA em ate 3
                    linhas — o mesmo defeito que a T6 ja tinha aprendido para
                    palavra partida, só que aqui era o VALOR que virava dois.
                    Cada mes vira sua PROPRIA linha (nowrap, sem juntar por
                    "|"): a T7 mede cada um separado, e cada um sozinho e bem
                    mais curto que a largura da coluna.

                    E a coluna passa a declarar o PAPEL em vez da medida: cada
                    linha dela é dinheiro, então o papel é `valor` — e quem
                    sabe a largura de dinheiro é o componente (190px e piso
                    monetário, contra o pior caso real de 162px). A primeira
                    versão deste conserto cravou `largura: 200` aqui e o
                    validador reprovou, com razão: R10, medida na tela é o
                    defeito que a declaração de papel existe para evitar.
                  */
                  render: (item) => {
                    const ultimosMeses = (item.meses || []).slice(-3);
                    if (!ultimosMeses.length) {
                      return <span className="text-xs text-[var(--c-muted)]">-</span>;
                    }
                    return (
                      <div className="grid gap-1">
                        {ultimosMeses.map((mes) => (
                          <span key={mes.label} className="block whitespace-nowrap text-xs text-[var(--c-muted)]">
                            {mes.label}: {formatMoney(mes.valor_total)}
                          </span>
                        ))}
                      </div>
                    );
                  }
                }
              ]}
              itens={obrasResumo}
              getId={(item) => item.key}
              carregando={loading}
              storageKey="tabela:compras-evolucao:obras"
              rotuloRolagem="Compras por obra/centro"
              vazio="Sem dados por obra/centro."
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Pedidos por status"
            descricao="Distribuição dos pedidos usados na evolução."
            variante="secundario"
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'status',
                  titulo: 'Status',
                  // R17: o status NOMEIA a linha deste agrupamento.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.label
                },
                { id: 'total', titulo: 'Total', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => <span className="font-semibold">{formatMoney(item.valor_total)}</span> }
              ]}
              itens={statusResumo}
              getId={(item) => item.key}
              carregando={loading}
              storageKey="tabela:compras-evolucao:status"
              rotuloRolagem="Pedidos por status"
              vazio="Sem status nos filtros."
            />
          </BlocoConteudo>
        </div>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
