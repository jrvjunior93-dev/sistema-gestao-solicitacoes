import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  Pagina,
  PageHeader,
  Paginacao,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos
} from '../../../components/padrao';
import { useFiltrosVisiveis } from '../../../components/padrao/PainelFiltrosVisiveis';
import StatusBadge from '../../../components/StatusBadge';
import {
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
  busca: '',
  fornecedor: '',
  usuario_criacao_id: '',
  data_inicial: '',
  data_final: ''
};

/*
  PAINEL "QUAIS FILTROS APARECEM" — REPOSTO POR DECISAO DO CLIENTE (05/09).

  A migracao tinha removido esta capacidade com o argumento de que ela
  existia para administrar espaco numa grade de oito campos, e que a
  marcacao nova e compacta. O cliente decidiu: "capacidade nao sai sem a
  minha palavra, e o argumento do agente pode estar certo sem que eu tenha
  visto o efeito". Reposto, e a proposta de remocao fica registrada em
  docs/ACHADOS-DE-NEGOCIO.md com o argumento dele, para decidir vendo a tela.

  A UNICA diferenca em relacao ao painel original: esconder um filtro agora
  LIMPA o valor dele. Antes escondia o campo e mantinha o filtro aplicado —
  desmarcar "Credor" com um credor digitado deixava a lista recortada por um
  criterio que nao estava em lugar nenhum da tela. Nao e capricho: sem isso a
  etiqueta some junto com o campo (ela nasce de `filtros`), e o filtro
  invisivel volta exatamente como era.

  ------------------------------------------------------------------------
  UNIFICAÇÃO E PERSISTÊNCIA (05/09, fechamento do N53).

  Este painel era o TERCEIRO desenho da mesma ideia no sistema — bloco
  recolhível com caixas soltas, ao lado de um modal (Consulta de títulos) e
  de um menu de marcação (Solicitações), nas 3 telas medidas que oferecem a
  escolha. Passa a usar a superfície única
  (`components/padrao/PainelFiltrosVisiveis.jsx`), no molde do painel
  "Colunas" da TabelaPadrao.

  E, principalmente, PASSA A GRAVAR. Ele era o único dos três que não
  guardava nada: a escolha morria no F5, e a capacidade que o cliente
  mandou repor durava uma sessão. Agora vai para o banco (tipo `filtros`,
  por usuário) — a mesma escolha vale no desktop da obra e no notebook.

  O CONJUNTO INICIAL abaixo (`padrao: false` = nasce escondido) é o
  recorte aprovado pelo cliente para esta tela: busca, período e os dois
  recortes que a operação usa todo dia (obra e status). Credor, item macro,
  prioridade e criador continuam a um clique de distância, e quem JÁ tinha
  configurado não é afetado — o padrão só vale para quem nunca configurou.

  `busca` é OBRIGATÓRIO: é o único caminho para achar uma provisão pelo que
  a pessoa lembra dela (código, descrição ou credor). Mesma família da
  coluna de identidade travada da TabelaPadrao.
*/
const FILTROS_DA_TELA = [
  { id: 'busca', rotulo: 'Busca', obrigatorio: true },
  { id: 'data_inicial', rotulo: 'Data inicial' },
  { id: 'data_final', rotulo: 'Data final' },
  { id: 'obra_id', rotulo: 'Obra' },
  { id: 'status', rotulo: 'Status' },
  { id: 'fornecedor', rotulo: 'Credor', padrao: false },
  { id: 'categoria_macro_id', rotulo: 'Item macro', padrao: false },
  { id: 'prioridade', rotulo: 'Prioridade', padrao: false },
  { id: 'usuario_criacao_id', rotulo: 'Criador', padrao: false }
];

const STATUS_OPCOES = [
  { valor: 'previsto', rotulo: 'Previsto' },
  { valor: 'em_analise', rotulo: 'Em analise' },
  { valor: 'aprovado', rotulo: 'Aprovado' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
  { valor: 'realizado', rotulo: 'Realizado' }
];

const PRIORIDADE_OPCOES = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Media' },
  { valor: 'alta', rotulo: 'Alta' },
  { valor: 'critica', rotulo: 'Critica' }
];

/* A consulta continua pedindo ao servidor a ordem PADRÃO da lista
   (desembolso mais próximo primeiro), como antes. Do primeiro clique num
   título em diante quem ordena é a TabelaPadrao — por isso `alternarOrdenacao`
   e o indicador à mão saíram: a ordem virou capacidade do componente. */
const ORDENACAO_PADRAO = {
  sort_by: 'data_prevista_desembolso',
  sort_dir: 'ASC'
};

/* A lista é PAGINADA NO SERVIDOR: ordenar só a página à vista faria o
   usuário ler "as maiores provisões" quando são apenas as maiores daquelas
   25. Por isso o clique no cabeçalho reconsulta o backend — o mapa liga a
   coluna da tabela ao campo que a API ordena. */
const CAMPO_ORDENACAO_POR_COLUNA = {
  obra: 'obra_nome',
  data_prevista: 'data_prevista_desembolso',
  categoria: 'categoria_nome',
  descricao: 'descricao',
  fornecedor: 'fornecedor_nome',
  valor: 'valor_previsto',
  status: 'status'
};

// Uma chave só: a TabelaPadrao guarda nela a escolha de colunas (quais e em
// que ordem, no painel "Colunas") e as larguras. Substitui o painel de
// colunas próprio da tela (`colunasVisiveis`/`toggleColuna`).
const STORAGE_KEY = 'tabela:provisionamentos-financeiros';

function formatarData(valor) {
  if (!valor) return '-';
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return '-';
}

function formatarObra(obra) {
  if (!obra) return '-';
  return `${obra.codigo ? `${obra.codigo} - ` : ''}${obra.nome}`;
}

function formatarStatus(valor) {
  const normalized = String(valor || '').toLowerCase();
  const labels = {
    previsto: 'Previsto',
    em_analise: 'Em analise',
    aprovado: 'Aprovado',
    cancelado: 'Cancelado',
    realizado: 'Realizado'
  };
  return labels[normalized] || '-';
}

function formatarPrioridade(valor) {
  const normalized = String(valor || '').toLowerCase();
  const labels = {
    baixa: 'Baixa',
    media: 'Media',
    alta: 'Alta',
    critica: 'Critica'
  };
  return labels[normalized] || '-';
}

/*
  R25 — a família semântica do status do provisionamento. Cancelado é
  NEUTRO (é uma decisão registrada, não um erro) e realizado/aprovado é
  SUCESSO; a classificação automática do StatusBadge não conhece o
  vocabulário deste módulo e jogaria "previsto" e "em analise" em famílias
  que não são as que a operação lê.
*/
function familiaStatus(valor) {
  const normalizado = String(valor || '').toLowerCase();
  if (normalizado === 'realizado' || normalizado === 'aprovado') return 'success';
  if (normalizado === 'cancelado') return 'neutral';
  if (normalizado === 'em_analise') return 'info';
  return 'warning';
}

export default function ProvisionamentosFinanceiros() {
  const navigate = useNavigate();
  const { avisos, avisar, fechar } = useAvisos();
  const [contexto, setContexto] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [lista, setLista] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [resumo, setResumo] = useState({ total_registros_filtrados: 0, valor_total_filtrado: 0 });
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingLista, setLoadingLista] = useState(false);
  const [filtros, setFiltros] = useState(DEFAULT_FILTERS);
  const [ordenacao, setOrdenacao] = useState(ORDENACAO_PADRAO);

  /*
    Filtro com valor é filtro VISÍVEL — o outro lado de "esconder limpa".
    Um valor pode chegar antes da preferência (link, voltar do detalhe), e
    escondê-lo deixaria a lista recortada por um critério fora da tela.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA
      .filter((filtro) => String(filtros?.[filtro.id] ?? '').trim() !== '')
      .map((filtro) => filtro.id),
    [filtros]
  );

  /*
    A escolha mora na MESMA chave de lista que a TabelaPadrao desta tela já
    usa: é a mesma lista respondendo a duas perguntas (quais colunas, quais
    filtros), e o contexto separa as duas pelo TIPO.

    Sem `legado`: esta tela nunca gravou a escolha em lugar nenhum, então
    não há chave antiga de onde migrar — não existe usuário desta tela com
    configuração para preservar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis(STORAGE_KEY, FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    // Esconder LIMPA. Se o valor ficasse, ele continuaria recortando a
    // lista sem campo e sem etiqueta — o defeito que a propria migracao
    // apontou. Limpar dispara a consulta de novo (o efeito de busca depende
    // de `filtros`): a lista alarga junto com a faixa.
    aoEsconder: (id) => atualizarFiltro(id, DEFAULT_FILTERS[id] ?? '')
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
        avisar.erro(error?.message || 'Erro ao carregar o modulo de provisoes.');
      } finally {
        setLoadingBase(false);
      }
    }

    carregarBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!contexto) return;

    async function carregarLista() {
      try {
        setLoadingLista(true);
        const data = await listarProvisoesFinanceiras({
          ...filtros,
          ...ordenacao,
          page: meta.page,
          limit: meta.limit
        });

        setLista(Array.isArray(data?.items) ? data.items : []);
        setMeta((atual) => ({
          ...atual,
          page: Number(data?.meta?.page || atual.page || 1),
          limit: Number(data?.meta?.limit || atual.limit || 25),
          total: Number(data?.meta?.total || 0),
          pages: Number(data?.meta?.pages || 0)
        }));
        setResumo({
          total_registros_filtrados: Number(data?.resumo?.total_registros_filtrados || 0),
          valor_total_filtrado: Number(data?.resumo?.valor_total_filtrado || 0)
        });
      } catch (error) {
        console.error(error);
        avisar.erro(error?.message || 'Erro ao listar provisoes.');
      } finally {
        setLoadingLista(false);
      }
    }

    carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexto, filtros, ordenacao, meta.page, meta.limit]);

  const obrasAcesso = useMemo(() => (
    Array.isArray(contexto?.obras_acesso) ? contexto.obras_acesso : []
  ), [contexto]);

  const criadoresFiltro = useMemo(() => (
    Array.isArray(contexto?.criadores_filtro) ? contexto.criadores_filtro : []
  ), [contexto]);

  // MÓDULO DE DINHEIRO: o recorte da PÁGINA carregada é somado aqui — é o
  // número que responde "quanto vale o que estou vendo agora", distinto do
  // total do recorte, que fica na faixa.
  const valorDaPagina = useMemo(
    () => lista.reduce((soma, item) => soma + Number(item.valor_previsto || 0), 0),
    [lista]
  );

  /*
    R12 — os recortes ENUMERÁVEIS (obra, item macro, status, prioridade,
    criador) viram MARCAÇÃO com etiqueta removível. O endpoint aceita UM
    valor por chave, então cada dimensão é `unico: true`: a marca fica
    REDONDA e marcar outro valor substitui. Marcação múltipla mostraria duas
    etiquetas e mandaria um filtro só — capacidade aparente sem efeito (R15).

    R23: são recortes de UMA consulta só, então o filtro APLICA AO MARCAR —
    sem botão "aplicar" e sem rascunho.
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : []),
    categoria_macro_id: new Set(filtros.categoria_macro_id ? [String(filtros.categoria_macro_id)] : []),
    status: new Set(filtros.status ? [String(filtros.status)] : []),
    prioridade: new Set(filtros.prioridade ? [String(filtros.prioridade)] : []),
    usuario_criacao_id: new Set(filtros.usuario_criacao_id ? [String(filtros.usuario_criacao_id)] : [])
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
    { id: 'status', rotulo: 'Status', unico: true, opcoes: STATUS_OPCOES },
    { id: 'prioridade', rotulo: 'Prioridade', unico: true, opcoes: PRIORIDADE_OPCOES },
    {
      id: 'usuario_criacao_id',
      rotulo: 'Criador',
      unico: true,
      opcoes: criadoresFiltro.map((criador) => ({
        valor: String(criador.id),
        rotulo: criador.nome || criador.email
      }))
    }
  ], [obrasAcesso, categorias, criadoresFiltro]);

  function atualizarFiltro(campo, valor) {
    setMeta((atual) => ({ ...atual, page: 1 }));
    setFiltros((atual) => ({ ...atual, [campo]: valor ?? '' }));
  }

  function alternarFiltro(dimensao, valor) {
    setMeta((atual) => ({ ...atual, page: 1 }));
    setFiltros((atual) => ({
      ...atual,
      [dimensao]: String(atual[dimensao]) === String(valor) ? '' : String(valor)
    }));
  }

  function limparFiltros() {
    setMeta((atual) => ({ ...atual, page: 1 }));
    setFiltros(DEFAULT_FILTERS);
  }

  if (loadingBase) {
    return (
      <Pagina>
        <PageHeader titulo="Provisionamentos" />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo>Carregando módulo...</BlocoConteudo>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/*
        C2 × B3 (critério do cliente, 05/09) — a FAIXA fica com o TOTAL e os
        blocos ficam com os RECORTES. Por isso a contagem de registros e o
        VALOR TOTAL filtrado subiram para o cabeçalho: são os dois números
        que precisam acompanhar a pessoa enquanto ela rola a lista. Os
        antigos cartões "Valor total filtrado" e "Registros filtrados"
        mudaram de conteúdo (não sumiram): passaram a mostrar o recorte que
        só eles sabem — o da PÁGINA carregada.

        R11/C6 — o botão "Categorias macro" saiu da barra de ações: é
        CAMINHO PARA OUTRA TELA. Conferido antes de remover, como a regra
        exige: `/provisoes-financeiras/categorias` (`prov-categorias`) é
        item de PRIMEIRO nível do menu do módulo no `navigationConfig` e
        está no Ctrl+K. "Nova provisao" fica: é a ação principal desta
        listagem, não um atalho de módulo.
      */}
      <PageHeader
        titulo="Provisionamentos"
        contagem={loadingLista ? null : `${resumo.total_registros_filtrados || meta.total || 0} provisao(oes)`}
        descricao={`${formatarMoedaBRL(resumo.valor_total_filtrado)} previstos no recorte`}
        acaoPrincipal={contexto?.permissoes?.pode_criar
          ? { rotulo: 'Nova provisão', to: '/provisoes-financeiras/nova' }
          : undefined}
        secundarias={[{ rotulo: 'Limpar filtros', onClick: limparFiltros }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <StatGrid colunas={2}>
        <StatTile
          label="Valor nesta página"
          valor={formatarMoedaBRL(valorDaPagina)}
          sub={`Página ${meta.page || 1} de ${meta.pages || 1}`}
        />
        <StatTile
          label="Registros nesta página"
          valor={String(lista.length)}
          /* B3: o total do recorte já está na faixa e não se repete aqui —
             dois números iguais em lugares diferentes fazem o leitor parar
             para procurar a diferença que não existe. */
          sub={`${meta.limit || 25} por página`}
        />
      </StatGrid>

      <BlocoConteudo
        titulo="Provisões registradas"
        descricao="Acompanhe previsões de desembolso por obra, categoria e período."
        variante="primario"
        cor="var(--c-primary)"
      >
        {/*
          R12/R3/R16 — o recorte era um painel de OITO selects e inputs atrás
          de um botão "Filtros", com um segundo painel de caixas escolhendo
          QUAIS filtros aparecem. Vira a BarraFiltros das Solicitações: busca
          única em cima ocupando a faixa, marcação múltipla abaixo e
          etiquetas removíveis.

          DEFEITO DE SIGNIFICADO CORRIGIDO AQUI: o painel "quais filtros
          aparecem" (`filtrosVisiveis`/`toggleFiltro`) escondia o CAMPO sem
          limpar o VALOR — desmarcar "Credor" com um credor digitado deixava
          a lista filtrada por um critério que não estava mais em lugar
          nenhum da tela. Com as etiquetas, todo filtro ativo é visível e
          removível (F3), que é o que a capacidade tentava resolver.

          Credor e o período não são enumeráveis (texto livre e datas
          contínuas), então vão em `campos`, na mesma faixa.
        */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('busca') ? {
            valor: filtros.busca,
            aoMudar: (valor) => atualizarFiltro('busca', valor),
            placeholder: 'Buscar código, descrição ou credor'
          } : null}
          campos={[
            {
              id: 'fornecedor',
              rotulo: 'Credor',
              valor: filtros.fornecedor,
              aoMudar: (valor) => atualizarFiltro('fornecedor', valor)
            },
            {
              id: 'data_inicial',
              rotulo: 'Data inicial',
              tipo: 'date',
              valor: filtros.data_inicial,
              aoMudar: (valor) => atualizarFiltro('data_inicial', valor)
            },
            {
              id: 'data_final',
              rotulo: 'Data final',
              tipo: 'date',
              valor: filtros.data_final,
              aoMudar: (valor) => atualizarFiltro('data_final', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          /*
            O painel de "quais filtros aparecem" desce para DENTRO da faixa
            (05/09). Ele era um bloco recolhível separado, e a distância era
            o problema: a pessoa via a faixa encolher sem ver o que a
            encolheu. Junto do que governa, e no mesmo lugar das outras duas
            telas, ele é aprendido uma vez só.
          */
          visibilidade={visibilidadeFiltros}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
        />

        <TabelaPadrao
          colunas={[
            {
              id: 'codigo',
              titulo: 'Código',
              // R17: o codigo NOMEIA a provisao — coluna travada no painel.
              tipo: 'identidade',
              noCard: 'titulo',
              ordenavel: true,
              valorOrdenacao: (item) => String(item.codigo || ''),
              render: (item) => <span className="font-semibold">{item.codigo}</span>
            },
            {
              id: 'obra',
              titulo: 'Obra',
              tipo: 'texto',
              ordenavel: true,
              valorOrdenacao: (item) => formatarObra(item.obra),
              render: (item) => formatarObra(item.obra)
            },
            {
              id: 'data_prevista',
              titulo: 'Data prevista',
              tipo: 'data',
              ordenavel: true,
              // Ordena pela data ISO crua (AAAA-MM-DD ordena como texto);
              // o dd/mm/aaaa exibido ordenaria pelo dia.
              valorOrdenacao: (item) => item.data_prevista_desembolso || '',
              render: (item) => formatarData(item.data_prevista_desembolso)
            },
            {
              id: 'categoria',
              titulo: 'Item macro',
              tipo: 'texto',
              ordenavel: true,
              valorOrdenacao: (item) => item.categoriaMacro?.nome || '',
              render: (item) => item.categoriaMacro?.nome || '-'
            },
            {
              id: 'descricao',
              titulo: 'Descrição',
              tipo: 'texto',
              ordenavel: true,
              valorOrdenacao: (item) => item.descricao || '',
              // T6: texto longo trunca com o conteúdo completo no tooltip.
              render: (item) => <span title={item.descricao || undefined}>{item.descricao || '-'}</span>
            },
            {
              id: 'fornecedor',
              titulo: 'Credor',
              tipo: 'texto',
              ordenavel: true,
              valorOrdenacao: (item) => item.fornecedor_texto || '',
              render: (item) => item.fornecedor_texto || '-'
            },
            {
              id: 'valor',
              titulo: 'Valor previsto',
              // R1/R17/T7 — MÓDULO DE DINHEIRO: 190px, à direita, em
              // tabular-nums, e NUNCA trunca (nem por arrasto do usuário).
              tipo: 'valor',
              ordenavel: true,
              // Dinheiro interessa do MAIOR para o menor no primeiro clique.
              ordemInicial: 'desc',
              valorOrdenacao: (item) => Number(item.valor_previsto || 0),
              render: (item) => formatarMoedaBRL(item.valor_previsto)
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              // R25: pílula do sistema (token + ícone) no lugar do texto solto.
              render: (item) => (
                <StatusBadge status={formatarStatus(item.status)} kind={familiaStatus(item.status)} />
              )
            },
            {
              id: 'prioridade',
              titulo: 'Prioridade',
              tipo: 'badge',
              render: (item) => formatarPrioridade(item.prioridade)
            }
          ]}
          itens={lista}
          getId={(item) => item.id}
          carregando={loadingLista}
          vazio="Nenhum provisionamento encontrado."
          colunasConfiguraveis
          // Ordenação NO SERVIDOR (lista paginada): a tabela avisa, a tela
          // reconsulta e volta à página 1 — ordenar mantendo a página 7
          // mostraria um recorte sem sentido.
          aoOrdenar={(coluna, direcao) => {
            const campo = coluna ? CAMPO_ORDENACAO_POR_COLUNA[coluna] : null;
            setOrdenacao(campo
              ? { sort_by: campo, sort_dir: direcao === 'desc' ? 'DESC' : 'ASC' }
              : ORDENACAO_PADRAO);
            setMeta((atual) => ({ ...atual, page: 1 }));
          }}
          storageKey={STORAGE_KEY}
          rotuloRolagem="Provisionamentos financeiros"
          larguraAcoes={140}
          // A1: além do botão focável, a linha inteira responde a Enter/Espaço
          // (o TabelaPadrao dá o tabIndex quando recebe `aoClicarLinha`).
          aoClicarLinha={(item) => navigate(`/provisoes-financeiras/${item.id}`)}
          acoesLinha={(item) => (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => navigate(`/provisoes-financeiras/${item.id}`)}
            >
              Detalhes
            </button>
          )}
        />

        {/* R16b — o rodapé de lista paginada tem UM dono: o `Paginacao`, que
            mostra a POSIÇÃO junto das setas (sem ela a pessoa não sabe se
            vale continuar clicando). Os dois botões soltos saíram. */}
        <Paginacao
          pagina={meta.page || 1}
          totalPaginas={meta.pages || 1}
          carregando={loadingLista}
          rotuloRegistro="provisao"
          aoMudarPagina={(pagina) => setMeta((atual) => ({ ...atual, page: pagina }))}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
