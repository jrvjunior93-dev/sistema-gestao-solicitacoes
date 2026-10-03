import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CelulaDupla,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useFiltrosVisiveis
} from '../components/padrao';
import { listarAuditoriaItensPedidoCompra } from '../services/compras';
import { getMinhasObras } from '../services/obras';

const DEFAULT_FILTERS = {
  obra_id: '',
  pedido_id: '',
  item_id: '',
  acao: '',
  q: ''
};

// Sem a linha "Todas as acoes": no padrao de marcacao (R12) "todas" e a
// AUSENCIA de marca, e a etiqueta some junto. Uma opcao chamada "todas"
// dentro do menu voltaria a ser o select disfarcado.
const ACTION_OPTIONS = [
  { value: 'AJUSTE_MANUAL', label: 'Ajuste manual' },
  { value: 'ITEM_ADICIONADO', label: 'Item adicionado' },
  { value: 'ITEM_ADICIONADO_FORNECEDOR', label: 'Item adicionado do fornecedor' },
  { value: 'ITEM_ADICIONADO_MANUAL', label: 'Item adicionado manualmente' },
  { value: 'GERADO_DA_COTACAO', label: 'Gerado da cotação' },
  { value: 'REMOVIDO', label: 'Item removido' }
];

const ACTION_LABELS = Object.fromEntries(
  ACTION_OPTIONS.map((item) => [item.value, item.label])
);

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleString('pt-BR');
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '-';
  }

  return numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function parseJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatActionLabel(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ACTION_LABELS[normalized] || normalized.replace(/_/g, ' ') || '-';
}

function readFilters(searchParams) {
  return {
    obra_id: searchParams.get('obra_id') || '',
    pedido_id: searchParams.get('pedido_id') || '',
    item_id: searchParams.get('item_id') || '',
    acao: searchParams.get('acao') || '',
    q: searchParams.get('q') || ''
  };
}

function buildSearchParams(filters) {
  const params = new URLSearchParams();

  Object.entries(filters || {}).forEach(([key, value]) => {
    const normalized = String(value || '').trim();
    if (normalized) {
      params.set(key, normalized);
    }
  });

  return params;
}

// M1/R10: o tom da acao vem do token semantico (badge-info/muted/success),
// nunca de paleta escrita no className — cor de tela nao acompanha tema.
function actionClassName(value) {
  switch (String(value || '').toUpperCase()) {
    case 'AJUSTE_MANUAL':
      return 'badge badge-info';
    case 'REMOVIDO':
      return 'badge badge-muted';
    default:
      return 'badge badge-success';
  }
}

function formatFieldValue(field, value) {
  if (value == null || value === '') {
    return '-';
  }

  if (field === 'preco_unitario') {
    return formatMoney(value);
  }

  if (field === 'quantidade_pedido') {
    return formatNumber(value);
  }

  return String(value);
}

/*
  Rótulo humano do campo. O resumo saía com o nome da COLUNA DO BANCO —
  "quantidade_pedido: - -> 10 | preco_unitario: - -> R$ 5,00". Além de
  comprido (300px numa coluna de 156px, o que reprovou a T7), é linguagem
  de tabela, não de quem lê auditoria de compra.
*/
const ROTULO_CAMPO = {
  quantidade_pedido: 'Quantidade',
  preco_unitario: 'Preço unitário',
  observacoes: 'Observações'
};

function buildChangeSummary(registro) {
  const anteriores = parseJson(registro?.dados_anteriores);
  const novos = parseJson(registro?.dados_novos);
  const parts = [];

  ['quantidade_pedido', 'preco_unitario', 'observacoes'].forEach((field) => {
    const before = anteriores?.[field];
    const after = novos?.[field];
    const rotulo = ROTULO_CAMPO[field] || field;

    if (before == null && after == null) {
      return;
    }

    if (before === after) {
      parts.push(`${rotulo}: ${formatFieldValue(field, after)}`);
      return;
    }

    // Campo que não existia antes é DEFINIÇÃO, não alteração: escrever
    // "- → 10" faz o leitor procurar um valor anterior que nunca houve.
    if (before == null || before === '') {
      parts.push(`${rotulo} definida como ${formatFieldValue(field, after)}`);
      return;
    }

    parts.push(`${rotulo}: ${formatFieldValue(field, before)} → ${formatFieldValue(field, after)}`);
  });

  if (!parts.length && novos?.resposta_item_id) {
    parts.push(`Resposta vinculada: ${novos.resposta_item_id}`);
  }

  if (!parts.length && (anteriores || novos)) {
    parts.push(JSON.stringify(novos || anteriores));
  }

  return parts.join(' | ') || '-';
}

function normalizeAuditErrorMessage(error) {
  const message = String(error?.message || '').trim();

  if (/Cannot GET\s+\/api\/compras\/relatorios\/auditoria-itens-pedido/i.test(message)) {
    return 'A API de auditoria ainda nao esta disponivel no backend em execucao. Reinicie o backend para carregar a nova rota de auditoria de compras.';
  }

  if (/404/.test(message) && /auditoria-itens-pedido/i.test(message)) {
    return 'A rota de auditoria de compras nao foi encontrada no backend em execucao. Reinicie o backend para aplicar a nova rota.';
  }

  return message || 'Erro ao carregar auditoria de compras';
}

/**
 * UMA ROTA SO, DESDE 04/09: `/compras/relatorios/auditoria`.
 *
 * Ate aqui duas rotas serviam este mesmo componente — esta e a
 * `/relatorios/administrativos`, destino do botao de auditoria do
 * PedidoCompraDetalhe. Passavam pelos MESMOS guardas, carregavam os MESMOS
 * dados e a tela nunca leu a rota: nada aqui supoe "vim de Compras", e os
 * parametros (`pedido_id`, `item_id`) viajam por query string, iguais nas
 * duas. Cobertura identica, e so uma delas tinha porta — a outra saiu, e o
 * botao do pedido passou a apontar para esta.
 *
 * Duas rotas para o mesmo caso nao e redundancia inofensiva: dobra o que
 * precisa ser medido, e a que ninguem lembra e a que apodrece.
 *
 * A faixa anuncia o ASSUNTO — auditoria dos itens de pedidos de compra —
 * porque a entrada e um card dentro do hub de Relatorios de Compras, e o
 * breadcrumb nao carrega esse nome sozinho.
 */
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
  { id: 'pedido_id', rotulo: 'Pedido' },
  { id: 'item_id', rotulo: 'Item' },
  { id: 'obra_id', rotulo: 'Obra' },
  { id: 'acao', rotulo: 'Ação' }
];

export default function RelatoriosAdministrativos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtros, setFiltros] = useState(() => readFilters(searchParams));
  const [obras, setObras] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState('');
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let ativo = true;

    getMinhasObras()
      .then((data) => {
        if (!ativo) {
          return;
        }
        setObras(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error(error);
      });

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
        setErroCarregamento('');
        const data = await listarAuditoriaItensPedidoCompra(filtrosAtivos);
        if (!ativo) {
          return;
        }
        setRegistros(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        if (ativo) {
          setRegistros([]);
          const mensagem = normalizeAuditErrorMessage(error);
          setErroCarregamento(mensagem);
          // R3: a falha da consulta e EVENTO — faixa do sistema, com o tom
          // semantico e fechavel. O cartao vazio abaixo continua sendo a
          // CONDICAO (fecha e o problema continua), e por isso nao vira aviso.
          avisar.erro(mensagem);
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
  }, [searchParams, avisar]);

  const resumo = useMemo(() => {
    const pedidos = new Set();
    const itens = new Set();

    registros.forEach((registro) => {
      if (registro?.pedido?.id) {
        pedidos.add(registro.pedido.id);
      }
      if (registro?.item?.id) {
        itens.add(registro.item.id);
      }
    });

    return {
      total: registros.length,
      pedidos: pedidos.size,
      itens: itens.size,
      ultimaMovimentacao: registros[0]?.createdAt || null
    };
  }, [registros]);

  /*
    R12/R15: obra e acao sao recortes ENUMERAVEIS, entao viram marcacao com
    etiqueta removivel. `unico: true` nas duas porque o servico recebe UM
    valor por chave (`obra_id=`, `acao=`): a marca fica REDONDA e marcar
    outra substitui, em vez de prometer soma que o endpoint nao aceita.
  */
  const dimensoes = useMemo(() => [
    {
      id: 'obra_id',
      rotulo: 'Obra',
      unico: true,
      opcoes: obras.map((obra) => ({ valor: String(obra.id), rotulo: obra.nome }))
    },
    {
      id: 'acao',
      rotulo: 'Ação',
      unico: true,
      opcoes: ACTION_OPTIONS.map((opcao) => ({ valor: opcao.value, rotulo: opcao.label }))
    }
  ], [obras]);

  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : []),
    acao: new Set(filtros.acao ? [String(filtros.acao)] : [])
  }), [filtros]);
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:relatorios-administrativos', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      atualizarFiltro(id, DEFAULT_FILTERS[id] ?? '');
      // A consulta em curso mora na URL: sem tirar a chave dali, o recorte
      // seguiria valendo com o campo já fora da faixa.
      if (searchParams.get(id)) {
        const proximos = new URLSearchParams(searchParams);
        proximos.delete(id);
        setSearchParams(proximos);
      }
    }
  });

  function atualizarFiltro(campo, valor) {
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
    setSearchParams(new URLSearchParams());
  }

  return (
    <Pagina>
      {/*
        C2/R5: titulo em 22px e o apoio em UMA linha, na propria faixa.
        R23 (excecao declarada): quatro recortes combinaveis — obra, acao,
        pedido e item — passam do criterio de "consulta cara", entao a marca
        e RASCUNHO ate o clique em Buscar. A regra exige que a tela AVISE
        isso; sem o aviso a etiqueta apareceria antes de a lista mudar.
        D6/R11: o "Voltar aos pedidos" saiu — era navegacao disfarcada de
        acao na barra do cabecalho de uma LISTAGEM.
      */}
      {/*
        C2: numa listagem, o apoio da faixa tem de dizer QUANTO veio — sem
        isso o usuário só descobre o tamanho do resultado rolando. Aqui vale
        dobrado, porque o recorte só é aplicado no clique em Buscar (R23):
        a contagem é o retorno visível de que a busca rodou.
      */}
      <PageHeader
        titulo="Relatórios Administrativos"
        contagem={`${registros.length} ${registros.length === 1 ? 'item' : 'itens'}`}
        descricao="Auditoria dos itens de pedidos de compra: marque o recorte e clique em Buscar."
        acaoPrincipal={{
          rotulo: loading ? 'Buscando...' : 'Buscar',
          onClick: aplicarFiltros,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar filtros', onClick: limparFiltros }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* Bloco 1 — ACAO: montar o recorte. */}
      <BlocoConteudo variante="secundario">
        {/*
          F1/R16: UMA busca, ocupando a largura da faixa. Pedido e item sao
          identificadores digitados (nao ha lista fechada), entao vao em
          `campos`; obra e acao ficam na marcacao.
        */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filtros.q,
            aoMudar: (valor) => atualizarFiltro('q', valor),
            placeholder: 'Pedido, item, obra, usuário ou descrição'
          } : null}
          campos={[
            {
              id: 'pedido_id',
              rotulo: 'Pedido',
              tipo: 'number',
              valor: filtros.pedido_id,
              aoMudar: (valor) => atualizarFiltro('pedido_id', valor)
            },
            {
              id: 'item_id',
              rotulo: 'Item',
              tipo: 'number',
              valor: filtros.item_id,
              aoMudar: (valor) => atualizarFiltro('item_id', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          /* R16: UM dono para "limpar" — o botao do cabecalho. O "Limpar
             tudo" da barra seria o segundo, com o mesmo efeito. As etiquetas
             seguem removiveis uma a uma (F3). */
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {/* Bloco 2 — CONTEXTO: o que o recorte devolveu. */}
      <StatGrid>
        <StatTile label="Registros" valor={resumo.total} sub="Movimentações listadas" />
        <StatTile label="Pedidos afetados" valor={resumo.pedidos} sub="Pedidos com log visível" />
        <StatTile label="Itens afetados" valor={resumo.itens} sub="Itens com histórico no filtro" />
        <StatTile
          label="Última movimentação"
          valor={formatDateTime(resumo.ultimaMovimentacao)}
          sub="Ordenacao decrescente por data"
        />
      </StatGrid>

      {/* Bloco 3 — HISTORICO, por ultimo (ordem de blocos decidida pelo cliente). */}
      <BlocoConteudo
        titulo="Histórico de alterações"
        descricao="Esta área será expandida para relatórios operacionais, de compras e financeiros sem misturar o fluxo transacional das telas operacionais."
        variante="primario"
        cor="var(--c-primary)"
      >
        {erroCarregamento && !loading ? (
          <div className="app-empty-card">
            A tela esta pronta, mas a consulta depende do backend com a rota de auditoria ativa.
          </div>
        ) : (
          <TabelaPadrao
            colunas={[
              {
                id: 'data',
                titulo: 'Data',
                tipo: 'data',
                render: (registro) => formatDateTime(registro.createdAt)
              },
              {
                id: 'acao',
                titulo: 'Ação',
                tipo: 'badge',
                render: (registro) => (
                  <span className={actionClassName(registro.acao)}>{formatActionLabel(registro.acao)}</span>
                )
              },
              {
                id: 'pedido',
                titulo: 'Pedido / obra',
                // R17: o pedido (com a obra) nomeia o registro auditado.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (registro) => (
                  <CelulaDupla
                    principal={registro.pedido?.codigo || '-'}
                    sub={`${registro.pedido?.obra?.nome || '-'}${registro.pedido?.obra?.codigo ? ` - ${registro.pedido.obra.codigo}` : ''}`}
                  />
                )
              },
              {
                id: 'item',
                titulo: 'Item',
                tipo: 'texto',
                render: (registro) => (
                  <CelulaDupla
                    principal={registro.item?.descricao || '-'}
                    sub={`${registro.item?.origem || '-'}${registro.item?.unidade ? ` - ${registro.item.unidade}` : ''}`}
                  />
                )
              },
              {
                id: 'usuario',
                titulo: 'Usuário',
                tipo: 'texto',
                render: (registro) => registro.usuario?.nome || 'Sistema'
              },
              {
                id: 'detalhes',
                titulo: 'Detalhes',
                tipo: 'texto',
                /*
                  A coluna que ABSORVE a sobra. É a mais longa da tabela e
                  era a que menos espaço recebia: 156px para 300px de
                  conteúdo. T4 manda a sobra ir para a coluna de conteúdo.

                  O RESUMO DA ALTERAÇÃO SAIU DA CÉLULA (04/09). Ele vinha na
                  sublinha, que é `nowrap` com reticências, e a sublinha
                  contém DINHEIRO: "Preço unitário: R$ 2,00 → R$ 4,00" foi
                  cortado no preview com 454px de largura para 495px de
                  conteúdo. Valor monetário com reticências é o defeito que
                  a T7 existe para pegar.

                  Alargar a coluna não resolve: o resumo lista quantos
                  campos a alteração tocar e não tem tamanho máximo. Deixar
                  quebrar em duas linhas também não — valor partido em duas
                  linhas é o outro lado da mesma T7 (o olho lê dois números
                  onde há um).

                  Resumo de alteração é DETALHE DO REGISTRO, não rótulo de
                  célula. Foi para a linha expansível, onde tem largura da
                  tabela inteira e pode ocupar as linhas que precisar.
                */
                flex: 3,
                render: (registro) => registro.descricao || '-'
              }
            ]}
            itens={registros}
            getId={(registro) => registro.id}
            carregando={loading}
            /* O resumo completo da alteração — com os valores por extenso,
               sem reticências (T7). */
            linhaExpansivel={(registro) => {
              const resumo = buildChangeSummary(registro);
              return resumo ? <p className="app-note">{resumo}</p> : null;
            }}
            storageKey="tabela:relatorios-administrativos:auditoria"
            rotuloRolagem="Historico de alteracoes"
            vazio="Nenhum registro de auditoria encontrado para os filtros informados."
            /* A1: a acao da linha e um link focavel — quem nao usa mouse
               chega nela pelo teclado sem depender do clique na linha. */
            acoesLinha={(registro) => (
              registro.pedido?.id ? (
                <Link to={`/pedidos-compra/${registro.pedido.id}`} className="btn btn-outline">
                  Abrir pedido
                </Link>
              ) : (
                <span className="text-xs text-[var(--c-muted)]">Sem pedido</span>
              )
            )}
            larguraAcoes={160}
          />
        )}
      </BlocoConteudo>
    </Pagina>
  );
}
