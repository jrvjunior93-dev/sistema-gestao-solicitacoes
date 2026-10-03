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
  useFiltrosVisiveis
} from '../components/padrao';
import { obterRelatorioComprasDiretas } from '../services/compras';
import { getMinhasObras } from '../services/obras';
import '../styles/compras-relatorio-apoio.css';

const DEFAULT_FILTERS = {
  obra_id: '',
  data_inicio: '',
  data_fim: '',
  status: '',
  q: '',
  item: '',
  limit: '1000'
};

function readFilters(searchParams) {
  return {
    obra_id: searchParams.get('obra_id') || '',
    data_inicio: searchParams.get('data_inicio') || '',
    data_fim: searchParams.get('data_fim') || '',
    status: searchParams.get('status') || '',
    q: searchParams.get('q') || '',
    item: searchParams.get('item') || '',
    limit: searchParams.get('limit') || '1000'
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
    return message || 'Erro ao carregar relatorio de compras diretas';
  }
}

/*
  As duas UNICAS ocorrencias de `.link-primary` no repositorio inteiro
  estavam nesta tela, e a classe NAO EXISTE em CSS nenhum: os codigos de SC
  e SOL eram links de verdade pintados como texto comum — clicavel sem sinal
  de que era clicavel (R15). A forma que o sistema ja usa para link dentro de
  tabela e a de FinanceiroTituloDetalhe: peso + cor de token + sublinhado no
  hover.
*/
const CLASSE_LINK = 'font-semibold text-[var(--c-primary)] hover:underline';

function RankingTable({ title, subtitle, rows, valueLabel = 'Valor', nameKey = 'label', metaKey, storageKey }) {
  const safeRows = Array.isArray(rows) ? rows.slice(0, 8) : [];

  return (
    <BlocoConteudo titulo={title} descricao={subtitle} variante="secundario">
      <TabelaPadrao
        colunas={[
          {
            id: 'nome',
            titulo: 'Nome',
            // R17: o nome do ranking (solicitante/credor/item/obra) NOMEIA a linha.
            tipo: 'identidade',
            noCard: 'titulo',
            render: (row) => (
              <div>
                <strong>{row[nameKey] || row.label || '-'}</strong>
                {metaKey && row[metaKey] ? (
                  <small className="block text-xs text-[var(--c-muted)]">{row[metaKey]}</small>
                ) : null}
              </div>
            )
          },
          { id: 'compras', titulo: 'Compras', tipo: 'numero', render: (row) => formatNumber(row.compras) },
          { id: 'itens', titulo: 'Itens', tipo: 'numero', render: (row) => formatNumber(row.itens) },
          { id: 'valor', titulo: valueLabel, tipo: 'valor', render: (row) => formatMoney(row.valor_total) }
        ]}
        itens={safeRows}
        getId={(row) => row.key}
        storageKey={storageKey}
        rotuloRolagem={title}
        vazio="Sem dados no período."
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

  `obrigatorio` na busca livre: é o único caminho para achar um registro
  pelo que a pessoa lembra dele. Mesma família da coluna de identidade
  travada da TabelaPadrao — aparece na lista, marcada e sem desmarcar.
*/
const FILTROS_DA_TELA = [
  { id: 'q', rotulo: 'Busca', obrigatorio: true },
  { id: 'data_inicio', rotulo: 'Criada de' },
  { id: 'data_fim', rotulo: 'Criada até' },
  { id: 'item', rotulo: 'Nome do item comprado' },
  { id: 'limit', rotulo: 'Limite de linhas' },
  { id: 'obra_id', rotulo: 'Obra / Centro de custo' },
  { id: 'status', rotulo: 'Status' }
];

export default function ComprasRelatorioComprasDiretas() {
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
        const data = await obterRelatorioComprasDiretas(filtrosAtivos);
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
  const itens = useMemo(() => (
    Array.isArray(relatorio?.itens) ? relatorio.itens : []
  ), [relatorio]);
  const statusOptions = useMemo(() => (
    Array.isArray(relatorio?.status) ? relatorio.status : []
  ), [relatorio]);

  /*
    R12: obra e status deixaram de ser controle solto e viraram MARCACAO.
    Ambos com `unico: true`, porque o endpoint recebe UM `obra_id`
    (`parseInteger`) e UM `status` (`parseOptionalText`), com
    `ensureAllowedKeys` limitando cada chave a um valor. Sem declarar, o menu
    abriria com caixa quadrada prometendo escolha multipla e, com duas
    marcas, a tela mandaria filtro nenhum — duas etiquetas na faixa e a
    lista sem estreitar (R15).

    O status ainda ganhou uma coisa que nao tinha: antes era `<input>` com
    `datalist`, ou seja, campo de texto LIVRE com sugestao. Quem digitasse
    "enviada" em vez de "ENVIADO" recebia lista vazia sem saber por que. A
    lista de status vem do proprio relatorio — e enumeravel de verdade.
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : []),
    status: new Set(filtros.status ? [String(filtros.status)] : [])
  }), [filtros.obra_id, filtros.status]);

  const dimensoes = useMemo(() => [
    {
      id: 'obra_id',
      rotulo: 'Obra / Centro de custo',
      unico: true,
      opcoes: obras.map((obra) => ({
        valor: String(obra.id),
        rotulo: obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome
      }))
    },
    {
      id: 'status',
      rotulo: 'Status',
      unico: true,
      opcoes: statusOptions.map((entry) => ({ valor: String(entry.key), rotulo: entry.label }))
    }
  ], [obras, statusOptions]);
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:compras-diretas', FILTROS_DA_TELA, {
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
        titulo="Compras Diretas"
        voltar={{ to: '/compras/relatorios', title: 'Voltar aos relatorios' }}
        contagem={loading ? 'Carregando...' : `${formatNumber(itens.length)} item(ns) listado(s)`}
        /* R23: sete recortes combinaveis sobre uma consulta analitica de ate
           5000 linhas — bem acima do criterio da excecao. O recorte e
           RASCUNHO ate o clique, e a regra exige que a tela AVISE isso. */
        descricao="Monitore quem solicita, quais credores atendem, quais itens são comprados e o volume de compras diretas. Marque o recorte e clique em Atualizar relatório."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatorio',
          onClick: aplicarFiltros,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros, desabilitada: loading }]}
      />

      <BlocoConteudo variante="secundario">
        {/* R12/R16b: a busca geral ocupa a faixa em cima; obra e status sao
            enumeraveis e vao em marcacao com etiqueta removivel; datas,
            texto do item e limite de linhas nao tem lista fechada e vao em
            `campos`, o espaco declarado da BarraFiltros para o continuo. */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filtros.q,
            aoMudar: (valor) => atualizarCampo('q', valor),
            placeholder: 'SOL, SC, solicitante, credor ou obra'
          } : null}
          campos={[
            {
              id: 'data_inicio',
              rotulo: 'Criada de',
              tipo: 'date',
              valor: filtros.data_inicio,
              aoMudar: (valor) => atualizarCampo('data_inicio', valor)
            },
            {
              id: 'data_fim',
              rotulo: 'Criada até',
              tipo: 'date',
              valor: filtros.data_fim,
              aoMudar: (valor) => atualizarCampo('data_fim', valor)
            },
            {
              id: 'item',
              rotulo: 'Nome do item comprado',
              tipo: 'text',
              valor: filtros.item,
              aoMudar: (valor) => atualizarCampo('item', valor)
            },
            {
              id: 'limit',
              rotulo: 'Limite de linhas',
              tipo: 'number',
              min: 1,
              max: 5000,
              valor: filtros.limit,
              aoMudar: (valor) => atualizarCampo('limit', valor)
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
        avisos={erro ? [{ id: 'compras-diretas-erro', tipo: 'error', mensagem: erro }] : []}
        aoFechar={() => setErro('')}
      />

      <StatGrid colunas={5}>
        <StatTile label="Compras diretas" valor={formatNumber(resumo.compras)} sub="Solicitações criadas" />
        <StatTile label="Valor total" valor={formatMoney(resumo.valor_total)} sub="Soma dos itens" />
        <StatTile
          label="Itens"
          valor={formatNumber(resumo.itens)}
          sub={`${formatNumber(resumo.quantidade_total, 2)} unidades informadas`}
        />
        <StatTile label="Solicitantes" valor={formatNumber(resumo.solicitantes)} sub="Usuários com compras diretas" />
        <StatTile label="Credores" valor={formatNumber(resumo.credores)} sub="Fornecedores/credores usados" />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 2 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:compras-relatorio-compras-diretas" larguraPadrao="total">
        <div data-bloco-id="solicitantes" data-bloco-rotulo="Solicitantes" className="grid gap-4 lg:grid-cols-2">
          <RankingTable
            title="Solicitantes"
            subtitle="Usuarios que mais abriram compras diretas."
            rows={relatorio?.solicitantes}
            metaKey="email"
            storageKey="tabela:compras-diretas:solicitantes"
          />
          <RankingTable
            title="Credores"
            subtitle="Fornecedores/credores mais usados em compra direta."
            rows={relatorio?.credores}
            metaKey="documento"
            storageKey="tabela:compras-diretas:credores"
          />
          <RankingTable
            title="Itens comprados"
            subtitle="Itens com maior valor acumulado."
            rows={relatorio?.itens_ranking}
            metaKey="unidade"
            storageKey="tabela:compras-diretas:itens-ranking"
          />
          <RankingTable
            title="Obras / centros"
            subtitle="Centros de custo com maior uso de compra direta."
            rows={relatorio?.obras}
            metaKey="obra_codigo"
            storageKey="tabela:compras-diretas:obras"
          />
        </div>

        <BlocoConteudo
          titulo="Detalhamento por item"
          contagem={loading ? 'Carregando...' : `${formatNumber(itens.length)} item(ns)`}
          descricao="Cada item comprado com solicitante, obra, credor e valor."
          variante="primario"
          cor="var(--c-primary)"
        >
          <TabelaPadrao
            colunas={[
              { id: 'data', titulo: 'Data', tipo: 'data', render: (row) => formatDate(row.criado_em) },
              {
                id: 'compra',
                titulo: 'SC',
                tipo: 'codigo',
                render: (row) => (
                  <Link to={`/solicitacoes-compra/${row.compra_id}`} className={CLASSE_LINK}>
                    {row.compra_codigo}
                  </Link>
                )
              },
              {
                id: 'solicitacao',
                titulo: 'SOL',
                tipo: 'codigo',
                render: (row) => (row.solicitacao_id ? (
                  <Link to={`/solicitacoes/${row.solicitacao_id}`} className={CLASSE_LINK}>
                    {row.solicitacao_codigo || `#${row.solicitacao_id}`}
                  </Link>
                ) : '-')
              },
              {
                id: 'solicitante',
                titulo: 'Solicitante',
                tipo: 'texto',
                render: (row) => (
                  <div>
                    <strong>{row.solicitante?.nome || '-'}</strong>
                    {row.solicitante?.email ? (
                      <small className="block text-xs text-[var(--c-muted)]">{row.solicitante.email}</small>
                    ) : null}
                  </div>
                )
              },
              {
                id: 'obra',
                titulo: 'Obra',
                tipo: 'texto',
                render: (row) => (
                  <div>
                    <strong>{row.obra?.nome || '-'}</strong>
                    {row.obra?.codigo ? (
                      <small className="block text-xs text-[var(--c-muted)]">{row.obra.codigo}</small>
                    ) : null}
                  </div>
                )
              },
              {
                id: 'credor',
                titulo: 'Credor',
                tipo: 'texto',
                render: (row) => (
                  <div>
                    <strong>{row.credor?.nome || 'Sem credor'}</strong>
                    {row.credor?.documento ? (
                      <small className="block text-xs text-[var(--c-muted)]">{row.credor.documento}</small>
                    ) : null}
                  </div>
                )
              },
              {
                id: 'item',
                titulo: 'Item',
                // R17: o item comprado NOMEIA a linha do detalhamento.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (row) => (
                  <div>
                    <strong>{row.item?.descricao || '-'}</strong>
                    {row.item?.apropriacao?.codigo ? (
                      <small className="block text-xs text-[var(--c-muted)]">
                        {row.item.apropriacao.codigo} {row.item.apropriacao.descricao || ''}
                      </small>
                    ) : null}
                  </div>
                )
              },
              { id: 'unidade', titulo: 'Unid.', tipo: 'texto', render: (row) => row.item?.unidade || '-' },
              { id: 'quantidade', titulo: 'Qtd.', tipo: 'numero', render: (row) => formatNumber(row.quantidade, 2) },
              { id: 'unitario', titulo: 'Unitário', tipo: 'valor', render: (row) => formatMoney(row.valor_unitario) },
              { id: 'total', titulo: 'Total', tipo: 'valor', render: (row) => formatMoney(row.valor_total) },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                // `.badge-soft` NAO EXISTE em CSS nenhum do repositorio — a
                // pilula saia sem fundo, sem contorno e sem forma. `badge-muted`
                // existe e e a familia neutra do sistema.
                render: (row) => <span className="badge badge-muted">{row.status_label || row.status}</span>
              }
            ]}
            itens={itens}
            getId={(row) => `${row.compra_id}-${row.item?.tipo}-${row.item?.id}`}
            carregando={loading}
            storageKey="tabela:compras-diretas:detalhe"
            rotuloRolagem="Detalhamento por item"
            vazio="Nenhuma compra direta encontrada para os filtros informados."
          />
        </BlocoConteudo>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
