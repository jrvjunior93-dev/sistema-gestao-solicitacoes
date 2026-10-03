import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { obterRelatorioDemandaPedidosCompras } from '../services/compras';
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
    return message || 'Erro ao carregar relatorio de demanda e pedidos';
  }
}

/*
  As duas tabelas "por status" são a MESMA tabela com dados diferentes — o
  bloco padrão entra aqui inteiro (título, apoio e superfície), no lugar do
  `card ... overflow-hidden` + `h2` + `page-subtitle` copiados (R5/R18).
*/
function StatusTable({ title, subtitle, rows, storageKey, loading }) {
  return (
    <BlocoConteudo titulo={title} descricao={subtitle}>
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
          { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatMoney(item.valor_total) }
        ]}
        itens={rows}
        getId={(item) => item.key}
        carregando={loading}
        storageKey={storageKey}
        rotuloRolagem={title}
        vazio="Sem registros no período."
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
  { id: 'data_inicio', rotulo: 'Criação inicial' },
  { id: 'data_fim', rotulo: 'Criação final' },
  { id: 'obra_id', rotulo: 'Obra / Centro de custo' }
];

export default function ComprasRelatorioDemandaPedidos() {
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
        const data = await obterRelatorioDemandaPedidosCompras(filtrosAtivos);
        if (ativo) {
          setRelatorio(data);
        }
      } catch (error) {
        console.error(error);
        if (ativo) {
          setRelatorio(null);
          // R19: falha da consulta é evento — faixa do sistema (Avisos), não
          // caixa de paleta crua montada à mão.
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
  const solicitacoesPorStatus = useMemo(() => (
    Array.isArray(relatorio?.solicitacoes_por_status) ? relatorio.solicitacoes_por_status : []
  ), [relatorio]);
  const pedidosPorStatus = useMemo(() => (
    Array.isArray(relatorio?.pedidos_por_status) ? relatorio.pedidos_por_status : []
  ), [relatorio]);
  const solicitacoesPorObra = useMemo(() => (
    Array.isArray(relatorio?.solicitacoes_por_obra) ? relatorio.solicitacoes_por_obra : []
  ), [relatorio]);
  const pedidosPorObra = useMemo(() => (
    Array.isArray(relatorio?.pedidos_por_obra) ? relatorio.pedidos_por_obra : []
  ), [relatorio]);
  const solicitacoes = useMemo(() => (
    Array.isArray(relatorio?.solicitacoes) ? relatorio.solicitacoes : []
  ), [relatorio]);
  const pedidos = useMemo(() => (
    Array.isArray(relatorio?.pedidos) ? relatorio.pedidos : []
  ), [relatorio]);

  /*
    R12: obra/centro sai do `<select>` e vira marcação com etiqueta
    removível; as datas são recorte contínuo (sem lista fechada) e entram em
    `campos`, o espaço declarado da R16b.
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : [])
  }), [filtros.obra_id]);

  /*
    `unico: true`: o backend valida `obra_id` com `parseInteger`
    (validateCompraRelatorioDemandaPedidosQuery) — UM valor. Marca redonda,
    marcar outro substitui; caixa quadrada aqui prometeria múltipla escolha
    que o serviço não aceita (R15).
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:compras-demanda-pedidos', FILTROS_DA_TELA, {
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
    R23: 1 dimensão marcável + 2 datas fica LONGE do critério de consulta
    cara (4+ dimensões), então o recorte aplica ao marcar e a etiqueta nunca
    afirma um filtro que ainda não vale. "Atualizar relatorio" continua na
    tela como o que sempre deveria ter sido: recarregar o recorte atual.
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
        titulo="Demanda e Pedidos"
        contagem="Compras / Relatórios"
        descricao="Visão sintética e analítica das solicitações de compra e dos pedidos gerados."
        /* R11: o retorno ao hub de relatórios fica na seta do cabeçalho —
           navegação não é ação, então não volta para a barra de ações. */
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
              rotulo: 'Criação inicial',
              tipo: 'date',
              valor: filtros.data_inicio,
              aoMudar: (valor) => mudarCampo('data_inicio', valor)
            },
            {
              id: 'data_fim',
              rotulo: 'Criação final',
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

      <StatGrid colunas={5}>
        <StatTile label="Solicitações" valor={formatNumber(resumo.solicitacoes)} sub="Criadas no período" />
        <StatTile label="Liberadas" valor={formatNumber(resumo.solicitacoes_liberadas)} sub="Com liberacao para compra" />
        <StatTile label="Pedidos" valor={formatNumber(resumo.pedidos)} sub="Gerados no período" />
        <StatTile label="Valor pedidos" valor={formatMoney(resumo.valor_pedidos)} sub="Somente pedidos reais" />
        <StatTile label="Ticket médio" valor={formatMoney(resumo.ticket_medio_pedido)} sub="Valor médio por pedido" />
      </StatGrid>

      {/* R18: as cinco tabelas viviam dentro de `card ... overflow-hidden`.
          O `hidden` cria scrollport e mata o `position: sticky` do cabeçalho
          e da coluna fixa, calado — nenhum erro, nenhum teste. O
          BlocoConteudo não recorta; onde cortar for necessário, o idioma é
          `overflow: clip`. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <StatusTable
          title="Solicitações por status"
          subtitle="Volume de demandas de compra pela situacao atual."
          rows={solicitacoesPorStatus}
          storageKey="tabela:compras-demanda-pedidos:status-solicitacoes"
          loading={loading}
        />
        <StatusTable
          title="Pedidos por status"
          subtitle="Pedidos emitidos agrupados pela situacao atual."
          rows={pedidosPorStatus}
          storageKey="tabela:compras-demanda-pedidos:status-pedidos"
          loading={loading}
        />
      </div>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 3 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:compras-relatorio-demanda-pedidos" larguraPadrao="total">
        <div data-bloco-id="solicitacoes-por-obra-centro" data-bloco-rotulo="Solicitacoes por obra/centro" className="grid gap-4 xl:grid-cols-2">
          <BlocoConteudo titulo="Solicitações por obra/centro" descricao="Origem das demandas no período filtrado.">
            <TabelaPadrao
              colunas={[
                {
                  id: 'obra',
                  titulo: 'Obra/Centro',
                  // R17: a obra/centro NOMEIA a linha deste resumo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.label
                },
                { id: 'total', titulo: 'Total', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'valor', titulo: 'Valor pedidos', tipo: 'valor', render: (item) => formatMoney(item.valor_total) }
              ]}
              itens={solicitacoesPorObra}
              getId={(item) => item.key}
              carregando={loading}
              storageKey="tabela:compras-demanda-pedidos:obras-solicitacoes"
              rotuloRolagem="Solicitacoes por obra/centro"
              vazio="Sem solicitações no período."
            />
          </BlocoConteudo>

          <BlocoConteudo titulo="Pedidos por obra/centro" descricao="Valor efetivamente pedido por origem operacional.">
            <TabelaPadrao
              colunas={[
                {
                  id: 'obra',
                  titulo: 'Obra/Centro',
                  // R17: a obra/centro NOMEIA a linha deste resumo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.label
                },
                { id: 'total', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.total) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatMoney(item.valor_total) }
              ]}
              itens={pedidosPorObra}
              getId={(item) => item.key}
              carregando={loading}
              storageKey="tabela:compras-demanda-pedidos:obras-pedidos"
              rotuloRolagem="Pedidos por obra/centro"
              vazio="Sem pedidos no período."
            />
          </BlocoConteudo>
        </div>

        <BlocoConteudo
          titulo="Analítico de solicitações"
          contagem="Últimas 100"
          descricao="Solicitações conforme os filtros aplicados."
          variante="primario"
          cor="var(--c-primary)"
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'codigo',
                titulo: 'Código',
                // R17: o codigo da solicitacao NOMEIA o registro.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (
                  <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/solicitacoes-compra/${item.id}`}>
                    SC #{item.id}
                  </Link>
                )
              },
              { id: 'titulo', titulo: 'Título', tipo: 'texto', render: (item) => <span className="font-semibold text-[var(--c-text)]">{item.titulo || '-'}</span> },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (item) => <StatusBadge status={item.status_label || '-'} />
              },
              { id: 'obra', titulo: 'Obra/Centro', tipo: 'texto', render: (item) => item.obra?.nome || '-' },
              { id: 'pedidos', titulo: 'Pedidos', tipo: 'numero', render: (item) => formatNumber(item.pedidos) },
              { id: 'valor', titulo: 'Valor pedidos', tipo: 'valor', render: (item) => formatMoney(item.valor_pedidos) },
              { id: 'criado', titulo: 'Criada em', tipo: 'data', render: (item) => formatDate(item.criado_em) }
            ]}
            itens={solicitacoes}
            carregando={loading}
            storageKey="tabela:compras-demanda-pedidos:solicitacoes"
            rotuloRolagem="Analitico de solicitacoes"
            vazio="Sem solicitações no período."
          />
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Analítico de pedidos"
          contagem="Últimos 100"
          descricao="Pedidos conforme os filtros aplicados."
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'codigo',
                titulo: 'Pedido',
                // R17: o codigo do pedido NOMEIA o registro.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (
                  <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/pedidos-compra/${item.id}`}>
                    PC #{item.id}
                  </Link>
                )
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (item) => <StatusBadge status={item.status_label || '-'} />
              },
              { id: 'solicitacao', titulo: 'Solicitação', tipo: 'codigo', render: (item) => (item.solicitacao ? `SC #${item.solicitacao.id}` : '-') },
              { id: 'obra', titulo: 'Obra/Centro', tipo: 'texto', render: (item) => item.obra?.nome || '-' },
              { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatMoney(item.valor_total) },
              { id: 'criado', titulo: 'Criado em', tipo: 'data', render: (item) => formatDate(item.criado_em) }
            ]}
            itens={pedidos}
            carregando={loading}
            storageKey="tabela:compras-demanda-pedidos:pedidos"
            rotuloRolagem="Analitico de pedidos"
            vazio="Sem pedidos no período."
          />
        </BlocoConteudo>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
