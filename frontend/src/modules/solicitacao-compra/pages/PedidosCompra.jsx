import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineEye } from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';
import { listarPedidosCompra } from '../../../services/compras';
import { getStatusPedidosCompra } from '../../../services/configuracoesSistema';
import { getObras } from '../../../services/obras';
import useComprasRealtimeRefresh from '../hooks/useComprasRealtimeRefresh';
import StatusBadge from '../../../components/StatusBadge';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useFiltrosVisiveis
} from '../../../components/padrao';
import { chaveStatusCompra, familiaStatusCompra } from '../utils/statusCompras';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatStatusLabel(value, statusMap) {
  return statusMap[chaveStatusCompra(value)]?.nome || String(value || '-').replace(/_/g, ' ').toUpperCase();
}

/*
  Família semântica da etiqueta do pedido, em três degraus e NESTA ordem:

  1. o mapa semântico do módulo (`utils/statusCompras.js`), que conhece
     CANCELADO — antes ele não era tratado aqui e um pedido cancelado cujo
     status configurado NÃO bloqueia edição caía no `return 'success'` final:
     saía VERDE. "Morreu" com a cor de "deu certo";
  2. `bloqueia_edicao` da configuração, que continua valendo para status
     criados pelo administrador (o ciclo terminou, ninguém mexe mais):
     neutro;
  3. sem nenhum dos dois, `undefined` — o classificador do StatusBadge
     decide, em vez de a tela inventar uma cor para o que não conhece.
*/
function statusKind(status, statusMap) {
  const familia = familiaStatusCompra(status);
  if (familia) return familia;
  if (statusMap[chaveStatusCompra(status)]?.bloqueia_edicao) return 'neutral';
  return undefined;
}

const STATUS_PEDIDOS_FALLBACK = [
  { codigo: 'ABERTO', nome: 'Aberto', ativo: true },
  { codigo: 'EM_ANALISE', nome: 'Em analise interna', ativo: true },
  { codigo: 'ENVIADO_FORNECEDOR', nome: 'Enviado ao fornecedor', ativo: true },
  { codigo: 'NEGOCIACAO', nome: 'Em negociacao', ativo: true },
  { codigo: 'FECHADO_FORNECEDOR', nome: 'Fechado com o fornecedor', ativo: true },
  { codigo: 'CANCELADO', nome: 'Cancelado', ativo: true }
];

const STATUS_FINANCEIRO_OPTIONS = [
  ['AGUARDANDO_GEO', 'Legado aguardando revisão'],
  ['AGUARDANDO_PREVISAO', 'Aguardando títulos de Compras'],
  ['LEGADO_PENDENTE_REVISAO', 'Legado pendente de revisão'],
  ['PREVISAO_CRIADA', 'Previsão criada'],
  ['PARCIALMENTE_LIBERADO', 'Parcialmente liberado'],
  ['LIBERADO_FINANCEIRO', 'Títulos criados'],
  ['PAGO_PARCIALMENTE', 'Pago parcialmente'],
  ['CONCLUIDO', 'Concluído'],
  ['CORRECAO_SOLICITADA', 'Reabertura solicitada']
].map(([valor, rotulo]) => ({ valor, rotulo }));

function formatStatusFinanceiro(value) {
  return STATUS_FINANCEIRO_OPTIONS.find((item) => item.valor === value)?.rotulo
    || String(value || 'Não iniciado').replace(/_/g, ' ');
}

async function carregarStatusPedidosComFallback() {
  try {
    const dataStatus = await getStatusPedidosCompra();
    const statuses = Array.isArray(dataStatus?.statuses) ? dataStatus.statuses : [];
    return statuses.length ? statuses : STATUS_PEDIDOS_FALLBACK;
  } catch (error) {
    console.warn('Falha ao buscar configuracao de status dos pedidos. Usando lista padrao.', error);
    return STATUS_PEDIDOS_FALLBACK;
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

  `obrigatorio` na busca livre: é o único caminho para achar um registro
  pelo que a pessoa lembra dele. Mesma família da coluna de identidade
  travada da TabelaPadrao — aparece na lista, marcada e sem desmarcar.
*/
const FILTROS_DA_TELA = [
  { id: 'busca', rotulo: 'Busca', obrigatorio: true },
  { id: 'status', rotulo: 'Status' },
  { id: 'status_financeiro', rotulo: 'Financeiro GEO' },
  { id: 'obra_id', rotulo: 'Obra' }
];

export default function PedidosCompra() {
  const navigate = useNavigate();
  const { avisos, avisar, fechar } = useAvisos();
  const [pedidos, setPedidos] = useState([]);
  const [obras, setObras] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');

  /*
    `unico: true` nas duas dimensões, verificado NO SERVIÇO: o
    `listarPedidos` (backend/src/services/pedidoCompraService.js) faz
    `where.status = String(status)` e `where.obra_id = Number(obraId)` — UM
    valor cada. Marcação múltipla mostraria duas etiquetas e mandaria um
    valor só: a lista não estreitaria e a etiqueta mentiria (R15).
  */
  const [ativos, setAtivos] = useState({ status: new Set(), status_financeiro: new Set(), obra_id: new Set() });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => (filtro.id === 'busca'
      ? busca.trim() !== ''
      : (ativos[filtro.id]?.size || 0) > 0)).map((filtro) => filtro.id),
    [busca, ativos]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:pedidos-compra', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setAtivos((atuais) => ({ ...atuais, [id]: new Set() }))
  });

  const status = useMemo(() => [...(ativos.status || [])][0] || '', [ativos.status]);
  const statusFinanceiro = useMemo(() => [...(ativos.status_financeiro || [])][0] || '', [ativos.status_financeiro]);
  const obraId = useMemo(() => [...(ativos.obra_id || [])][0] || '', [ativos.obra_id]);

  // O recorte corrente numa ref: o refresh em tempo real e o botão
  // "Atualizar" reconsultam o MESMO recorte que está na tela.
  const recorteRef = useRef({ q: '', status: '', status_financeiro: '', obra_id: '' });
  recorteRef.current = { q: busca, status, status_financeiro: statusFinanceiro, obra_id: obraId };

  async function carregar() {
    const recorte = recorteRef.current;
    try {
      setLoading(true);
      const [dataPedidos, dataObras, dataStatus] = await Promise.all([
        listarPedidosCompra({
          q: recorte.q || undefined,
          status: recorte.status || undefined,
          status_financeiro: recorte.status_financeiro || undefined,
          obra_id: recorte.obra_id || undefined,
          visao: 'resumo'
        }),
        getObras(),
        carregarStatusPedidosComFallback()
      ]);

      setPedidos(Array.isArray(dataPedidos) ? dataPedidos : []);
      setObras(Array.isArray(dataObras) ? dataObras : []);
      setStatusOptions(Array.isArray(dataStatus) ? dataStatus : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar pedidos de compra');
    } finally {
      setLoading(false);
    }
  }

  /*
    R23: 3 dimensões e consulta simples — o recorte aplica AO MARCAR, sem
    botão de "aplicar", e a etiqueta nunca afirma um filtro que ainda não
    vale. A busca textual tem a espera de digitação de 350ms prevista pela
    própria regra.
  */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      carregar();
    }, busca ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [busca, status, statusFinanceiro, obraId]);

  useComprasRealtimeRefresh(carregar);

  const statusMap = useMemo(
    () => Object.fromEntries((statusOptions || []).map((item) => [chaveStatusCompra(item.codigo), item])),
    [statusOptions]
  );

  const dimensoes = useMemo(() => [
    {
      id: 'status',
      rotulo: 'Status',
      unico: true,
      opcoes: statusOptions
        .filter((item) => item?.ativo !== false)
        .map((item) => ({ valor: String(item.codigo), rotulo: item.nome }))
    },
    {
      id: 'obra_id',
      rotulo: 'Obra',
      unico: true,
      opcoes: obras.map((obra) => ({ valor: String(obra.id), rotulo: obra.nome }))
    },
    {
      id: 'status_financeiro',
      rotulo: 'Financeiro GEO',
      unico: true,
      opcoes: STATUS_FINANCEIRO_OPTIONS
    }
  ], [statusOptions, obras]);

  function alternarFiltro(dimensao, valor, opcoes) {
    setAtivos((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
  }

  function limparFiltros() {
    setAtivos({ status: new Set(), status_financeiro: new Set(), obra_id: new Set() });
    setBusca('');
  }

  const totalPedidos = pedidos.length;
  const totalValor = pedidos.reduce((acc, pedido) => acc + Number(pedido.valor_total || 0), 0);

  const colunas = [
    {
      id: 'pedido',
      titulo: 'Pedido',
      tipo: 'codigo',
      render: (pedido) => `PC-${String(pedido.id).padStart(5, '0')}`
    },
    {
      id: 'fornecedor',
      titulo: 'Fornecedor',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (pedido) => pedido.fornecedor?.nome || '-'
    },
    {
      id: 'obra',
      titulo: 'Obra',
      tipo: 'texto',
      render: (pedido) => pedido.obra?.nome || '-'
    },
    {
      id: 'solicitacao',
      titulo: 'Solicitação',
      tipo: 'codigo',
      render: (pedido) => `SC-${String(pedido.solicitacao_compra_id || pedido.solicitacao?.id || '').padStart(5, '0')}`
    },
    {
      id: 'itens_ativos',
      titulo: 'Itens ativos',
      tipo: 'numero',
      render: (pedido) => (
        pedido.itens_ativos_count
          ?? (pedido.itens || []).filter((item) => !item.removido).length
      )
    },
    {
      id: 'valor_total',
      titulo: 'Valor total',
      tipo: 'valor',
      render: (pedido) => formatMoney(pedido.valor_total)
    },
    {
      id: 'pedido_minimo',
      titulo: 'Pedido mínimo',
      tipo: 'valor',
      render: (pedido) => (
        <>
          {pedido.valor_minimo_pedido ? formatMoney(pedido.valor_minimo_pedido) : '-'}
          {!pedido.atingiu_pedido_minimo ? (
            // R25: `text-amber-700` era paleta crua (sem par no tema escuro,
            // fora do piso de contraste). O aviso continua âmbar, agora pelo
            // token semântico.
            <div className="text-xs font-medium" style={{ color: 'var(--sem-warning)' }}>
              Não atingido
            </div>
          ) : null}
        </>
      )
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (pedido) => (
        <StatusBadge
          status={formatStatusLabel(pedido.status, statusMap)}
          kind={statusKind(pedido.status, statusMap)}
        />
      )
    },
    {
      id: 'financeiro_geo',
      titulo: 'Títulos do pedido',
      tipo: 'status',
      render: (pedido) => (
        <StatusBadge
          status={formatStatusFinanceiro(pedido.financeiro?.status)}
          kind={['CONCLUIDO', 'LIBERADO_FINANCEIRO'].includes(pedido.financeiro?.status) ? 'success' : 'neutral'}
        />
      )
    }
  ];

  return (
    <Pagina>
      <PageHeader
        titulo="Pedidos de Compra"
        contagem={loading ? null : `${totalPedidos} pedido(s)`}
        descricao="Compras acompanha o pedido e cria seus títulos. O GEO autoriza o envio para pagamento pelo Contas a Pagar."
        secundarias={[
          {
            rotulo: loading ? 'Buscando...' : 'Atualizar',
            onClick: carregar,
            desabilitada: loading
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* R12: os dois `<select>` (status e obra) viram marcação; o botão
          "Exibir/Ocultar filtros", que só encolhia a grade no celular, virou
          o recolher do bloco. */}
      <BlocoConteudo titulo="Filtros" variante="secundario" recolhivel>
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('busca') ? {
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Fornecedor, obra ou pedido'
          } : null}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      <StatGrid colunas={2}>
        <StatTile label="Pedidos listados" valor={totalPedidos} />
        <StatTile label="Valor total em pedidos" valor={formatMoney(totalValor)} />
      </StatGrid>

      <BlocoConteudo
        titulo="Lista de pedidos"
        variante="primario"
        cor="var(--sem-info)"
        contagem={`${pedidos.length} registro(s)`}
      >
        <TabelaPadrao
          colunas={colunas}
          itens={pedidos}
          carregando={loading}
          vazio="Nenhum pedido de compra encontrado para os filtros informados."
          storageKey="tabela:pedidos-compra"
          rotuloRolagem="Lista de pedidos"
          acoesLinha={(pedido) => (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => navigate(`/pedidos-compra/${pedido.id}`)}
              title="Abrir pedido"
              aria-label={`Abrir pedido PC-${String(pedido.id).padStart(5, '0')}`}
            >
              <HiOutlineEye />
            </button>
          )}
          larguraAcoes={120}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
