import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import StatusBadge from '../components/StatusBadge';
import { obterRelatorioComprasPorFornecedor } from '../services/compras';
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
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
    return message || 'Erro ao carregar relatorio de compras por fornecedor';
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

export default function ComprasRelatorioComprasFornecedor() {
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
        const data = await obterRelatorioComprasPorFornecedor(filtrosAtivos);
        if (ativo) {
          setRelatorio(data);
        }
      } catch (error) {
        console.error(error);
        if (ativo) {
          setRelatorio(null);
          /*
            R19: era `alert alert-error`, classe que só existe ANINHADA no
            CSS (`.layout-shell .alert-error`). O aviso do sistema não pode
            depender de onde a tela foi montada.
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
  const fornecedores = useMemo(() => (
    Array.isArray(relatorio?.fornecedores) ? relatorio.fornecedores : []
  ), [relatorio]);
  const obrasResumo = useMemo(() => (
    Array.isArray(relatorio?.obras) ? relatorio.obras : []
  ), [relatorio]);
  const pedidos = useMemo(() => (
    Array.isArray(relatorio?.pedidos) ? relatorio.pedidos : []
  ), [relatorio]);
  const topFornecedores = useMemo(() => fornecedores.slice(0, 10), [fornecedores]);
  const maiorValorFornecedor = useMemo(
    () => Math.max(...topFornecedores.map((item) => Number(item.valor_total || 0)), 0),
    [topFornecedores]
  );

  /*
    R12: obra/centro sai do `<select>` e vira marcação com etiqueta
    removível; as datas são recorte contínuo e vão em `campos` (R16b).
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : [])
  }), [filtros.obra_id]);

  /*
    `unico: true`: o backend valida `obra_id` com `parseInteger`
    (validateCompraRelatorioComprasFornecedorQuery) — UM valor por consulta.
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:compras-fornecedor', FILTROS_DA_TELA, {
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
    cara (4+ dimensões), então o recorte aplica ao marcar. "Atualizar
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
        titulo="Compras por Fornecedor"
        contagem="Compras / Relatórios"
        descricao="Valor efetivamente pedido por fornecedor com base nos pedidos de compra emitidos."
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
        <StatTile label="Pedidos" valor={formatNumber(resumo.pedidos)} sub="Pedidos emitidos" />
        <StatTile label="Fornecedores" valor={formatNumber(resumo.fornecedores)} sub="Com pedido no período" />
        <StatTile label="Valor pedido" valor={formatMoney(resumo.valor_total)} sub="Baseado em pedidos reais" />
        <StatTile label="Ticket médio" valor={formatMoney(resumo.ticket_medio_pedido)} sub="Valor por pedido" />
        <StatTile label="Concentração top 5" valor={formatPercent(resumo.concentracao_top5)} sub="Valor nos maiores fornecedores" />
        <StatTile
          label="Mínimo não atingido"
          valor={formatNumber(resumo.pedidos_minimo_nao_atingido)}
          sub="Pedidos abaixo do mínimo cadastrado"
          tom={Number(resumo.pedidos_minimo_nao_atingido || 0) > 0 ? 'warning' : undefined}
        />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 3 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:compras-relatorio-compras-fornecedor" larguraPadrao="total">
        <BlocoConteudo
          titulo="Ranking visual de fornecedores"
          contagem="Top 10"
          descricao="Por valor efetivamente pedido no período filtrado."
          variante="secundario"
        >
          {loading ? (
            <div className="app-empty-card">Carregando ranking...</div>
          ) : topFornecedores.length === 0 ? (
            <div className="app-empty-card">Sem pedidos emitidos para montar o ranking.</div>
          ) : (
            <div className="grid gap-3">
              {topFornecedores.map((item, index) => {
                const valor = Number(item.valor_total || 0);
                /*
                  BARRA QUE MENTIA SOBRE O ZERO (corrigido). O cálculo era
                  `Math.max(4, (valor / maior) * 100)`: um fornecedor com valor
                  pedido ZERO desenhava 4% de barra — o olho lê barra como
                  "houve compra", e não houve nenhuma. O piso existia para que
                  valores minúsculos aparecessem, e cobrava esse preço no caso
                  em que a leitura mais importa.
                  Agora zero tem largura zero e o resto fica na proporção real;
                  o número ao lado da barra continua sendo a fonte exata.
                */
                const percentual = maiorValorFornecedor > 0 ? (valor / maiorValorFornecedor) * 100 : 0;
                return (
                  <div key={`ranking-${item.key}`} className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[var(--c-muted)]">#{index + 1}</span>
                        <strong className="ml-2 text-sm text-[var(--c-text)]">{item.fornecedor_nome}</strong>
                        <span className="ml-2 text-xs text-[var(--c-muted)]">
                          {formatNumber(item.pedidos)} pedido(s)
                        </span>
                      </div>
                      <strong className="text-sm tabular-nums text-[var(--c-text)]">{formatMoney(valor)}</strong>
                    </div>
                    {/* R25: o trilho era `bg-slate-100` (paleta crua, sem par
                        no tema escuro) — agora é o token de contorno.
                        R18 (onde NÃO vale, 2): este `overflow-hidden` só
                        recorta a FORMA da barra e não é ancestral de nada
                        fixo. */}
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--ui-border)]">
                      <div
                        className="h-full rounded-full bg-[var(--c-primary)]"
                        style={{ width: `${percentual}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BlocoConteudo>

        {/*
          R18: as três tabelas viviam em `card ... overflow-hidden` — scrollport
          criado sem querer, `position: sticky` morto sem erro nenhum.
          R25 + CelulaDupla: os pares `text-slate-900` / `text-slate-500` eram
          a CelulaDupla escrita à mão; agora é o componente, com os tons por
          token (`text-slate-500` é 4,34:1, abaixo do AA de 4,5:1).
        */}
        <BlocoConteudo
          titulo="Fornecedores por valor pedido"
          descricao="Ranking de fornecedores usando somente pedidos de compra emitidos."
          variante="primario"
          cor="var(--c-primary)"
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'fornecedor',
                titulo: 'Fornecedor',
                // R17: o fornecedor NOMEIA a linha do ranking.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (
                  <CelulaDupla
                    principal={item.fornecedor_nome}
                    sub={`${item.cnpj || 'Sem CNPJ'}${item.estado ? ` - ${item.estado}` : ''}`}
                  />
                )
              },
              { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
              { id: 'itens', titulo: 'Itens', tipo: 'numero', render: (item) => formatNumber(item.itens) },
              {
                id: 'obras',
                titulo: 'Obras/centros',
                tipo: 'texto',
                render: (item) => (
                  <CelulaDupla
                    principal={formatNumber(item.obras)}
                    sub={(item.obras_nomes || []).join(', ') || '-'}
                  />
                )
              },
              { id: 'valor', titulo: 'Valor pedido', tipo: 'valor', render: (item) => <span className="font-semibold">{formatMoney(item.valor_total)}</span> },
              { id: 'ticket', titulo: 'Ticket médio', tipo: 'valor', render: (item) => formatMoney(item.ticket_medio) },
              { id: 'minimo', titulo: 'Mínimo não atingido', tipo: 'numero', render: (item) => formatNumber(item.pedidos_minimo_nao_atingido) },
              { id: 'ultimo', titulo: 'Último pedido', tipo: 'data', render: (item) => formatDate(item.ultimo_pedido_em) }
            ]}
            itens={fornecedores}
            getId={(item) => item.key}
            carregando={loading}
            storageKey="tabela:compras-fornecedor:fornecedores"
            rotuloRolagem="Fornecedores por valor pedido"
            vazio="Sem pedidos emitidos nos filtros."
          />
        </BlocoConteudo>

        <div data-bloco-id="compras-por-obra-centro" data-bloco-rotulo="Compras por obra/centro" className="grid gap-4 lg:grid-cols-2">
          <BlocoConteudo
            titulo="Compras por obra/centro"
            descricao="Onde o valor comprado por fornecedor esta concentrado."
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
                { id: 'fornecedores', titulo: 'Fornecedores', tipo: 'numero', render: (item) => formatNumber(item.fornecedores) },
                { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
                { id: 'itens', titulo: 'Itens', tipo: 'numero', render: (item) => formatNumber(item.itens) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => <span className="font-semibold">{formatMoney(item.valor_total)}</span> },
                { id: 'ticket', titulo: 'Ticket', tipo: 'valor', render: (item) => formatMoney(item.ticket_medio) }
              ]}
              itens={obrasResumo}
              getId={(item) => item.key}
              carregando={loading}
              storageKey="tabela:compras-fornecedor:obras"
              rotuloRolagem="Compras por obra/centro"
              vazio="Sem pedidos por obra/centro nos filtros."
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Pedidos recentes"
            contagem="Últimos 100"
            descricao="Pedidos usados no relatório."
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'pedido',
                  titulo: 'Pedido',
                  // R17: o pedido de compra NOMEIA o registro.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => (
                    <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/pedidos-compra/${item.id}`}>
                      PC #{item.id}
                    </Link>
                  )
                },
                { id: 'fornecedor', titulo: 'Fornecedor', tipo: 'texto', render: (item) => <span className="font-semibold text-[var(--c-text)]">{item.fornecedor?.nome || 'Sem fornecedor'}</span> },
                {
                  id: 'status',
                  titulo: 'Status',
                  tipo: 'status',
                  render: (item) => <StatusBadge status={item.status_label || '-'} />
                },
                { id: 'obra', titulo: 'Obra/Centro', tipo: 'texto', render: (item) => item.obra?.nome || '-' },
                {
                  id: 'solicitacao',
                  titulo: 'Solicitação',
                  tipo: 'codigo',
                  render: (item) => (item.solicitacao?.id ? (
                    <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/solicitacoes-compra/${item.solicitacao.id}`}>
                      SC #{item.solicitacao.id}
                    </Link>
                  ) : '-')
                },
                { id: 'itens', titulo: 'Itens', tipo: 'numero', render: (item) => formatNumber(item.itens) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => <span className="font-semibold">{formatMoney(item.valor_total)}</span> },
                { id: 'criado', titulo: 'Criado em', tipo: 'data', render: (item) => formatDate(item.criado_em) }
              ]}
              itens={pedidos}
              carregando={loading}
              storageKey="tabela:compras-fornecedor:pedidos"
              rotuloRolagem="Pedidos recentes"
              vazio="Sem pedidos nos filtros."
            />
          </BlocoConteudo>
        </div>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
