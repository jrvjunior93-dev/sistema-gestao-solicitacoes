import DateInputBR from '../../../components/DateInputBR';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useFecharAoSair } from '../../../hooks/useFecharAoSair';
import {
  adicionarItemPedidoCompra,
  atualizarStatusPedidoCompra,
  atualizarItemPedidoCompra,
  anexarEspelhoPedidoCompra,
  atualizarFretePedidoCompra,
  baixarPdfPedidoCompra,
  cancelarFretePedidoCompra,
  cancelarItensPedidoCompra,
  cancelarPedidoCompra,
  comentarPedidoCompra,
  listarFornecedoresCompra,
  obterPedidoCompra,
  registrarFretePedidoCompra,
  reabrirPedidoCompraParaCotacao,
  solicitarReaberturaPedidoCompra,
  removerItemPedidoCompra,
  remanejarItemPedidoCompra,
  uploadAnexoTemporarioCompra
} from '../../../services/compras';
import { getStatusPedidosCompra } from '../../../services/configuracoesSistema';
import { buscarParceiros } from '../../../services/parceiros';
import { useAuth } from '../../../contexts/AuthContext';
import {
  canAlterarStatusComprasPedidos,
  canAnexarEspelhoComprasPedidos,
  canCancelarComprasPedidos,
  canCancelarFreteComprasPedidos,
  canEditarItensComprasPedidos,
  canManageComprasPedidos,
  canViewPedidoCompraFinanceiro,
  canReabrirComprasPedidos,
  canRegistrarFreteComprasPedidos,
  canRemanejarComprasPedidos,
  isBusinessAdmin
} from '../../../utils/acessoProduto';
import { useSafeNavigateBack } from '../../../utils/navigation';
import { isValidCpfCnpj, maskCpfCnpj, maskPhone, onlyDigits } from '../../../utils/formatters';
import CompraPreviewModal from '../components/CompraPreviewModal';
import PedidoCompraFinanceiro from '../components/PedidoCompraFinanceiro';
import OverlayModal from '../../../components/ui/OverlayModal';
import '../../../styles/compras-relatorio-apoio.css';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  CamposComVazios,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  BarraFiltros,
  alternarValorFiltro,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseBrazilianMoney(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value).trim().replace(/[^\d,.-]/g, '');
  if (!raw) {
    return null;
  }

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoneyInput(value) {
  const parsed = parseBrazilianMoney(value);
  if (parsed === null) {
    return '';
  }

  return parsed.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function sanitizeMoneyInput(value) {
  return String(value ?? '').replace(/[^\d,.\sR$-]/g, '');
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

function isValidEmail(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function maskCpf(value) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

function maskCnpj(value) {
  return onlyDigits(value)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

function maskPixKey(value, type) {
  const kind = String(type || '').toUpperCase();
  if (kind === 'CPF') return maskCpf(value);
  if (kind === 'CNPJ') return maskCnpj(value);
  if (kind === 'TELEFONE') return maskPhone(value);
  if (kind === 'EMAIL') return String(value || '').trim().toLowerCase().slice(0, 160);
  return String(value || '').trim().slice(0, 180);
}

function formatarCredorFrete(credor) {
  if (!credor) return '';
  const nome = String(credor.nome || '').trim();
  const documento = maskCpfCnpj(credor.cpf_cnpj || credor.cnpj || '');
  return [nome, documento].filter(Boolean).join(' - ') || `Credor ${credor.id}`;
}

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return parseBrazilianMoney(value);
}

function formatUnitPrice(value, unidade, fallback = '-') {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    return fallback;
  }

  return `${formatMoney(parsed)}${unidade ? `/${unidade}` : ''}`;
}

function calculateVariationPercent(currentValue, referenceValue) {
  const current = toNullableNumber(currentValue);
  const reference = toNullableNumber(referenceValue);

  if (current === null || reference === null || reference <= 0) {
    return null;
  }

  return ((current - reference) / reference) * 100;
}

function formatVariationPercent(value, fallback = 'Sem historico') {
  if (value === null || value === undefined) {
    return fallback;
  }

  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const signal = normalized > 0 ? '+' : '';
  return `${signal}${normalized.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function buildItemPriceContext(item, currentUnitPriceOverride = undefined) {
  const contexto = item?.contexto_preco || {};
  const precoCotado = toNullableNumber(contexto.preco_cotado);
  const precoAtual = currentUnitPriceOverride !== undefined
    ? toNullableNumber(currentUnitPriceOverride)
    : toNullableNumber(item?.preco_unitario);
  const ultimoPrecoCompra = toNullableNumber(contexto.ultimo_preco_compra);

  return {
    precoCotado,
    precoAtual,
    ultimoPrecoCompra,
    variacaoUltimaCompra: calculateVariationPercent(precoAtual, ultimoPrecoCompra)
  };
}

/*
  R25: a variação de preço saía em paleta crua (text-red-600 / text-emerald-700),
  que não tem par no tema escuro nem passa pelo piso de contraste do
  ThemeContext. O significado é semântico — preço acima da última compra é
  perda, abaixo é ganho — então a cor vem dos tokens semânticos.
*/
function getVariationTextClass(value) {
  if (value === null || value === undefined || Math.abs(value) < 0.005) {
    return 'text-[var(--c-muted)]';
  }

  return value > 0 ? 'text-[var(--sem-danger)]' : 'text-[var(--sem-success)]';
}

/*
  Pílula de situação com TOM semântico por token (R25). Antes cada ponto da
  tela montava a própria combinação de paleta crua (bg-amber-100 +
  text-amber-700, bg-slate-100 + text-slate-700…), repetida em cinco lugares.
*/
const TONS_PILULA = {
  neutro: { background: 'var(--sem-neutral-bg)', color: 'var(--sem-neutral)' },
  atencao: { background: 'var(--sem-warning-bg)', color: 'var(--sem-warning)' },
  sucesso: { background: 'var(--sem-success-bg)', color: 'var(--sem-success)' },
  info: { background: 'var(--sem-info-bg)', color: 'var(--sem-info)' }
};

function Pilula({ tom = 'neutro', children }) {
  return (
    <span className="app-status-pill" style={TONS_PILULA[tom] || TONS_PILULA.neutro}>
      {children}
    </span>
  );
}

/*
  Faixa de CONDIÇÃO derivada do conteúdo (a fronteira declarada no useAvisos):
  ela descreve o estado do que está na tela e não some com um clique — por
  isso não é `avisar.*`, é superfície fixa ao lado do dado que descreve.
*/
function FaixaCondicao({ tom = 'atencao', children }) {
  const cores = TONS_PILULA[tom] || TONS_PILULA.atencao;
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs"
      style={{ background: cores.background, color: cores.color }}
    >
      {children}
    </div>
  );
}

function formatQuantityIntegerPart(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const normalized = digits.replace(/^0+(?=\d)/, '') || (digits ? '0' : '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function maskBrazilianQuantityInput(value) {
  const raw = String(value ?? '').replace(/[^\d,]/g, '');
  if (!raw) {
    return '';
  }

  const hasComma = raw.includes(',');
  const [integerPartRaw = '', decimalPartRaw = ''] = raw.split(',');
  const integerPart = formatQuantityIntegerPart(integerPartRaw || (hasComma ? '0' : ''));
  const decimalPart = decimalPartRaw.replace(/,/g, '').slice(0, 2);

  return hasComma ? `${integerPart || '0'},${decimalPart}` : integerPart;
}

function parseBrazilianQuantity(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  const raw = String(value).trim().replace(/\./g, '').replace(',', '.');
  const normalized = raw.replace(/[^\d.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBrazilianQuantity(value) {
  if (value === '' || value === null || value === undefined) {
    return '';
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '';
  }

  const isInteger = Math.abs(parsed - Math.trunc(parsed)) < Number.EPSILON;
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function formatQuantityLabel(value, unidade) {
  const formatted = formatBrazilianQuantity(value);
  const suffix = unidade || '';
  return `${formatted || '-'}${suffix ? ` ${suffix}` : ''}`;
}

function normalizeItemType(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function buildPedidoItemKey(item) {
  const referenciaId = Number(item?.solicitacao_compra_item_id || 0) ||
    Number(item?.solicitacao_compra_item_manual_id || 0);
  return `${normalizeItemType(item?.item_tipo)}:${referenciaId}`;
}

function formatStatusLabel(value, statusMap) {
  return statusMap[String(value || '').toUpperCase()]?.nome || String(value || '-').replace(/_/g, ' ').toUpperCase();
}

const STATUS_PEDIDOS_FALLBACK = [
  { codigo: 'ABERTO', nome: 'Aberto', ativo: true, bloqueia_edicao: false },
  { codigo: 'EM_ANALISE', nome: 'Em analise interna', ativo: true, bloqueia_edicao: false },
  { codigo: 'ENVIADO_FORNECEDOR', nome: 'Enviado ao fornecedor', ativo: true, bloqueia_edicao: false },
  { codigo: 'NEGOCIACAO', nome: 'Em negociacao', ativo: true, bloqueia_edicao: false },
  { codigo: 'FECHADO_FORNECEDOR', nome: 'Fechado com o fornecedor', ativo: true, bloqueia_edicao: true },
  { codigo: 'CANCELADO', nome: 'Cancelado', ativo: true, bloqueia_edicao: true }
];

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

function isItemAbaixoMinimo(item) {
  return !item?.removido && item?.quantidade_minima_item && Number(item.quantidade_pedido) < Number(item.quantidade_minima_item);
}

function buildItemSearchText(item) {
  return [
    item?.descricao,
    item?.origem,
    item?.unidade,
    item?.quantidade_solicitada,
    item?.quantidade_pedido
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
}

function buildPedidoWhatsappMessage(pedido) {
  const pedidoCodigo = `PC-${String(pedido?.id || '').padStart(5, '0')}`;
  const solicitacaoCodigo = `SC-${String(pedido?.solicitacao_compra_id || '').padStart(5, '0')}`;
  const fornecedor = pedido?.fornecedor?.nome || 'fornecedor';

  return `Ola! Segue o pedido de compra ${pedidoCodigo} referente a ${solicitacaoCodigo} para ${fornecedor}. Favor confirmar recebimento e prazo de atendimento.`;
}

function triggerBlobDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

const FRETE_FORM_INICIAL = {
  tipo: 'EMBUTIDO',
  momento: 'FECHAMENTO',
  criterio_rateio: 'VALOR_ITENS',
  valor_total: '',
  rateios: [],
  data_vencimento: '',
  fornecedor_compra_id: '',
  parceiro_id: '',
  novo_fornecedor: {
    nome: '',
    cpf_cnpj: '',
    whatsapp: '',
    email: '',
    contato: ''
  },
  dados_pagamento: {
    tipo_chave_pix: 'CPF',
    pix: '',
    banco: '',
    agencia: '',
    conta: '',
    favorecido: '',
    documento: '',
    observacoes: ''
  },
  observacoes: ''
};

function normalizeBrazilianQuantityOnBlur(value) {
  if (!value) {
    return '';
  }

  const parsed = parseBrazilianQuantity(value);
  const forceDecimals = String(value).includes(',');

  if (!Number.isFinite(parsed)) {
    return '';
  }

  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: forceDecimals ? 2 : 0,
    maximumFractionDigits: 2
  });
}

function getItemSituacao(item) {
  if (item?.removido) {
    return { label: 'Removido', tom: 'neutro' };
  }

  if (isItemAbaixoMinimo(item)) {
    return { label: 'Atenção', tom: 'atencao' };
  }

  return { label: 'Ativo', tom: 'sucesso' };
}

/*
  R12 — o recorte da lista de itens virou MARCAÇÃO múltipla. Antes era um
  `<select>` de escolha única com ATIVOS/ATENCAO/REMOVIDOS/TODOS: o estado do
  filtro só era visível abrindo a lista. Aqui as três situações são marcáveis
  e combináveis; conjunto VAZIO = o antigo "Todos", que deixa de ser uma opção
  escondida na lista e passa a ser o estado sem etiqueta nenhuma.
*/
const OPCOES_SITUACAO_ITEM = [
  { valor: 'ATIVOS', rotulo: 'Ativos' },
  { valor: 'ATENCAO', rotulo: 'Atenção' },
  { valor: 'REMOVIDOS', rotulo: 'Removidos' }
];

function itemAtendeSituacao(item, valor) {
  if (valor === 'ATIVOS') return !item.removido;
  if (valor === 'ATENCAO') return Boolean(isItemAbaixoMinimo(item));
  if (valor === 'REMOVIDOS') return Boolean(item.removido);
  return true;
}

export default function PedidoCompraDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const navigateBack = useSafeNavigateBack('/pedidos-compra');
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const businessAdmin = isBusinessAdmin(user);
  const podeEditarItensPedido = canEditarItensComprasPedidos(user);
  const podeComentarPedido = canManageComprasPedidos(user);
  const podeAnexarEspelhoPedido = canAnexarEspelhoComprasPedidos(user);
  const podeAlterarStatusPedido = canAlterarStatusComprasPedidos(user);
  const podeCancelarPedido = canCancelarComprasPedidos(user);
  const podeReabrirPedido = canReabrirComprasPedidos(user);
  const podeRegistrarFretePedido = canRegistrarFreteComprasPedidos(user);
  const podeCancelarFretePedido = canCancelarFreteComprasPedidos(user);
  const podeRemanejarPedido = canRemanejarComprasPedidos(user);
  const podeGerenciarFinanceiroPedido = canViewPedidoCompraFinanceiro(user);
  const podeGerenciarPedido = Boolean(
    podeEditarItensPedido ||
    podeAlterarStatusPedido ||
    podeCancelarPedido ||
    podeReabrirPedido ||
    podeRegistrarFretePedido ||
    podeCancelarFretePedido ||
    podeRemanejarPedido
  );
  const [pedido, setPedido] = useState(null);
  const [statusOptions, setStatusOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingItemId, setSavingItemId] = useState(null);
  const [addingRespostaId, setAddingRespostaId] = useState(null);
  const [removingItemId, setRemovingItemId] = useState(null);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [visualizandoPdf, setVisualizandoPdf] = useState(false);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [previewPedido, setPreviewPedido] = useState(null);
  const [edicoes, setEdicoes] = useState({});
  const [buscaItens, setBuscaItens] = useState('');
  const [filtrosItens, setFiltrosItens] = useState(() => ({ situacao: new Set(['ATIVOS']) }));
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [itemEditandoId, setItemEditandoId] = useState(null);
  const [comentarioPedido, setComentarioPedido] = useState('');
  const [salvandoComentario, setSalvandoComentario] = useState(false);
  const [anexandoEspelho, setAnexandoEspelho] = useState(false);
  const [cancelandoPedido, setCancelandoPedido] = useState(false);
  const [modalCancelamentoAberto, setModalCancelamentoAberto] = useState(false);
  const [cancelamentoPedidoForm, setCancelamentoPedidoForm] = useState({
    motivo: '',
    cancelar_cotacao: true,
    cancelar_solicitacao_compra: true,
    cancelar_solicitacao_principal: false
  });
  const [reabrindoCotacao, setReabrindoCotacao] = useState(false);
  const [itensSelecionadosCancelamento, setItensSelecionadosCancelamento] = useState([]);
  const [cancelandoItens, setCancelandoItens] = useState(false);
  const [remanejoSelecionado, setRemanejoSelecionado] = useState('');
  const [remanejoQuantidade, setRemanejoQuantidade] = useState('');
  const [remanejandoItem, setRemanejandoItem] = useState(false);
  const [modalFreteAberto, setModalFreteAberto] = useState(false);
  const [salvandoFrete, setSalvandoFrete] = useState(false);
  const [freteEditandoId, setFreteEditandoId] = useState(null);
  const [freteForm, setFreteForm] = useState(FRETE_FORM_INICIAL);
  const [buscaFornecedorFrete, setBuscaFornecedorFrete] = useState('');
  const [fornecedoresFrete, setFornecedoresFrete] = useState([]);
  const [credorFreteSelecionado, setCredorFreteSelecionado] = useState(null);
  /*
    A LISTA DE CREDORES DO FRETE NÃO FECHAVA DE JEITO NENHUM (05/09).

    Não havia estado de aberta: a camada existia sempre que
    `fornecedoresFrete.length` fosse maior que zero e o credor ainda não
    tivesse sido escolhido. Ou seja, só saía da tela ao SELECIONAR alguém
    ou ao apagar a busca abaixo de dois caracteres. Como é `absolute z-dropdown`
    dentro do modal de frete, ela cobria o bloco de "Cadastro rápido do
    credor/transportador" logo abaixo — quem quisesse cadastrar um credor
    novo tinha de apagar o que digitou para enxergar o formulário.

    Agora existe `listaCredorFreteAberta`: digitar ou apertar "Buscar"
    abre, clicar fora e `Esc` fecham. A busca continua onde estava — o
    termo não é perdido ao dispensar a lista.

    PROTEÇÃO DA SELEÇÃO, que é o ponto delicado deste arquivo: o hook
    fecha no `mousedown` e o `onClick` da opção só dispara no `mouseup`.
    O ref envolve o campo E a lista (clique na opção é DENTRO, então o
    hook não fecha), e a opção recebeu `onMouseDown` com `preventDefault`
    — esta tela tinha zero dessas proteções, e sem elas o clique morreria
    no meio: a camada fecharia e o credor nunca seria escolhido.
  */
  const credorFreteRef = useRef(null);
  const [listaCredorFreteAberta, setListaCredorFreteAberta] = useState(false);
  useFecharAoSair(credorFreteRef, listaCredorFreteAberta, () => setListaCredorFreteAberta(false));
  const [buscandoFornecedoresFrete, setBuscandoFornecedoresFrete] = useState(false);
  const buscaItensDeferred = useDeferredValue(buscaItens);

  async function carregar() {
    try {
      setLoading(true);
      const [data, dataStatus] = await Promise.all([
        obterPedidoCompra(id),
        carregarStatusPedidosComFallback()
      ]);
      setPedido(data || null);
      setStatusOptions(Array.isArray(dataStatus) ? dataStatus : []);

      const proximasEdicoes = {};
      (data?.itens || []).forEach((item) => {
        proximasEdicoes[item.id] = {
          quantidade_pedido: formatBrazilianQuantity(item.quantidade_pedido),
          preco_unitario: formatMoneyInput(item.preco_unitario),
          observacoes: item.observacoes || ''
        };
      });
      setEdicoes(proximasEdicoes);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao carregar pedido de compra');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [id]);

  const itensAtivos = useMemo(
    () => (pedido?.itens || []).filter((item) => !item.removido),
    [pedido]
  );
  const resumoItens = useMemo(() => {
    return (pedido?.itens || []).reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.removido) {
          acc.removidos += 1;
        } else {
          acc.ativos += 1;
        }
        if (isItemAbaixoMinimo(item)) {
          acc.atencao += 1;
        }
        return acc;
      },
      { total: 0, ativos: 0, atencao: 0, removidos: 0 }
    );
  }, [pedido]);
  const itensFiltrados = useMemo(() => {
    const termo = String(buscaItensDeferred || '').trim().toLowerCase();
    const situacoes = filtrosItens.situacao || new Set();

    return (pedido?.itens || []).filter((item) => {
      if (situacoes.size && ![...situacoes].some((valor) => itemAtendeSituacao(item, valor))) {
        return false;
      }

      if (!termo) {
        return true;
      }

      return buildItemSearchText(item).includes(termo);
    });
  }, [buscaItensDeferred, filtrosItens, pedido]);
  const itemEditando = useMemo(
    () => (pedido?.itens || []).find((item) => item.id === itemEditandoId) || null,
    [itemEditandoId, pedido]
  );
  const statusMap = useMemo(
    () => Object.fromEntries((statusOptions || []).map((item) => [String(item.codigo || '').toUpperCase(), item])),
    [statusOptions]
  );
  const statusAtual = statusMap[String(pedido?.status || '').toUpperCase()] || pedido?.status_configuracao || null;
  const edicaoBloqueadaPorStatus = Boolean(statusAtual?.bloqueia_edicao || pedido?.edicao_bloqueada);
  const pedidoBloqueado = Boolean(edicaoBloqueadaPorStatus || !podeEditarItensPedido);
  const pedidoCancelado = String(pedido?.status || '').toUpperCase() === 'CANCELADO';
  const podeReabrirCotacao = Boolean(podeReabrirPedido && edicaoBloqueadaPorStatus && !pedidoCancelado);
  const reaberturaPendenteGeo = String(pedido?.financeiro?.reabertura?.status || '').toUpperCase() === 'PENDENTE';
  const permiteFreteEmbutido = !edicaoBloqueadaPorStatus;
  const statusSelectOptions = useMemo(() => {
    const ativos = (statusOptions || []).filter((item) => item?.ativo !== false);
    if (!pedido?.status) {
      return ativos;
    }

    const currentStatus = String(pedido.status || '').toUpperCase();
    if (ativos.some((item) => String(item.codigo || '').toUpperCase() === currentStatus)) {
      return ativos;
    }

    return statusAtual ? [...ativos, statusAtual] : ativos;
  }, [pedido?.status, statusAtual, statusOptions]);
  const fretesPedido = useMemo(() => (pedido?.fretes || []), [pedido]);
  const totalFretesPedido = useMemo(
    () => fretesPedido
      .filter((frete) => String(frete.status_financeiro || '').toUpperCase() !== 'CANCELADO')
      .reduce((total, frete) => total + Number(frete.valor_total || 0), 0),
    [fretesPedido]
  );
  const fretesPendentesFinanceiro = useMemo(
    () => fretesPedido.filter((frete) => String(frete.status_financeiro || '').toUpperCase() === 'PENDENTE_TITULO'),
    [fretesPedido]
  );

  function getFreteStatus(frete) {
    return String(frete?.status_financeiro || '').toUpperCase();
  }

  function tomDoFrete(frete) {
    const status = getFreteStatus(frete);
    if (status === 'CANCELADO') return 'neutro';
    if (status === 'PENDENTE_TITULO') return 'atencao';
    return 'sucesso';
  }

  function fretePermiteControle(frete) {
    const status = getFreteStatus(frete);
    return podeRegistrarFretePedido && !frete?.tituloFinanceiro?.id && !frete?.titulo_financeiro_id && !['TITULO_GERADO', 'CANCELADO'].includes(status);
  }

  function fretePermiteCancelamento(frete) {
    const status = getFreteStatus(frete);
    return podeCancelarFretePedido && !frete?.tituloFinanceiro?.id && !frete?.titulo_financeiro_id && !['TITULO_GERADO', 'CANCELADO'].includes(status);
  }

  useEffect(() => {
    if (!itemEditandoId) {
      return;
    }

    const itemAtual = (pedido?.itens || []).find((item) => item.id === itemEditandoId);
    if (!itemAtual) {
      setModalEdicaoAberto(false);
      setItemEditandoId(null);
    }
  }, [itemEditandoId, pedido]);

  function alternarFiltroItens(dimensao, valor, opcoes) {
    setFiltrosItens((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
  }

  function limparFiltrosItens() {
    setBuscaItens('');
    setFiltrosItens({ situacao: new Set() });
  }

  function atualizarEdicaoItem(itemId, changes) {
    setEdicoes((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        ...changes
      }
    }));
  }

  function abrirModalEdicao(itemId) {
    setItemEditandoId(itemId);
    setRemanejoSelecionado('');
    setRemanejoQuantidade('');
    setModalEdicaoAberto(true);
  }

  function fecharModalEdicao() {
    setModalEdicaoAberto(false);
    setItemEditandoId(null);
  }

  function abrirAuditoria(itemId = null) {
    const params = new URLSearchParams();
    params.set('pedido_id', String(pedido?.id || ''));

    if (itemId) {
      params.set('item_id', String(itemId));
    }

    // A auditoria tem UMA rota (04/09). Antes existiam duas servindo o mesmo
    // componente, com os mesmos guardas e os mesmos parametros de query; a
    // /relatorios/administrativos nao tinha porta no menu e so era alcancada
    // por este botao. Ficou a que tem porta — o card "Auditoria de compras"
    // do hub de Relatorios de Compras.
    navigate(`/compras/relatorios/auditoria?${params.toString()}`);
  }

  function abrirModalFrete(momento = 'FECHAMENTO') {
    const tipoInicial = permiteFreteEmbutido ? 'EMBUTIDO' : 'TERCEIRO';
    setFreteEditandoId(null);
    setFreteForm({
      ...FRETE_FORM_INICIAL,
      tipo: tipoInicial,
      momento: permiteFreteEmbutido ? momento : 'POSTERIOR'
    });
    setBuscaFornecedorFrete('');
    setFornecedoresFrete([]);
    setCredorFreteSelecionado(null);
    setModalFreteAberto(true);
  }

  function abrirEdicaoFrete(frete) {
    if (!fretePermiteControle(frete)) {
      avisar.alerta('Este frete não pode ser editado porque já foi cancelado ou possui título financeiro vinculado.');
      return;
    }

    const credor = frete.fornecedor
      ? {
          ...frete.fornecedor,
          fornecedor_compra_id: frete.fornecedor.id,
          parceiro_id: frete.fornecedor.parceiro_id || frete.parceiro_id || '',
          cpf_cnpj: frete.fornecedor.cnpj || ''
        }
      : frete.parceiro
      ? {
          ...frete.parceiro,
          parceiro_id: frete.parceiro.id,
          cpf_cnpj: frete.parceiro.cpf_cnpj || ''
        }
      : null;

    setFreteEditandoId(frete.id);
    setFreteForm({
      ...FRETE_FORM_INICIAL,
      tipo: String(frete.tipo || 'EMBUTIDO').toUpperCase(),
      momento: String(frete.momento || 'FECHAMENTO').toUpperCase(),
      criterio_rateio: String(frete.criterio_rateio || 'VALOR_ITENS').toUpperCase(),
      valor_total: formatMoneyInput(frete.valor_total),
      rateios: (frete.rateios || []).map((rateio) => ({
        pedido_compra_item_id: Number(rateio.pedido_compra_item_id),
        descricao: rateio.item?.descricao || 'Item do pedido',
        valor_rateado: formatMoneyInput(rateio.valor_rateado)
      })),
      data_vencimento: frete.data_vencimento ? String(frete.data_vencimento).slice(0, 10) : '',
      fornecedor_compra_id: credor?.fornecedor_compra_id ? String(credor.fornecedor_compra_id) : '',
      parceiro_id: credor?.parceiro_id ? String(credor.parceiro_id) : '',
      dados_pagamento: {
        ...FRETE_FORM_INICIAL.dados_pagamento,
        ...(frete.dados_pagamento || {})
      },
      observacoes: frete.observacoes || ''
    });
    setBuscaFornecedorFrete(credor ? formatarCredorFrete(credor) : '');
    setFornecedoresFrete([]);
    setCredorFreteSelecionado(credor);
    setModalFreteAberto(true);
  }

  function fecharModalFrete(force = false) {
    if (salvandoFrete && !force) return;
    setModalFreteAberto(false);
    setFreteEditandoId(null);
    setFreteForm(FRETE_FORM_INICIAL);
    setBuscaFornecedorFrete('');
    setFornecedoresFrete([]);
    setCredorFreteSelecionado(null);
  }

  function atualizarFreteForm(changes) {
    setFreteForm((current) => ({
      ...current,
      ...changes
    }));
  }

  function atualizarRateioFrete(itemId, valor) {
    setFreteForm((current) => ({
      ...current,
      rateios: (current.rateios || []).map((rateio) => (
        Number(rateio.pedido_compra_item_id) === Number(itemId)
          ? { ...rateio, valor_rateado: valor }
          : rateio
      ))
    }));
  }

  function atualizarNovoFornecedorFrete(changes) {
    setFreteForm((current) => ({
      ...current,
      novo_fornecedor: {
        ...current.novo_fornecedor,
        ...changes
      }
    }));
  }

  function atualizarDadosPagamentoFrete(changes) {
    setFreteForm((current) => ({
      ...current,
      dados_pagamento: {
        ...current.dados_pagamento,
        ...changes
      }
    }));
  }

  function selecionarCredorFrete(credor) {
    setCredorFreteSelecionado(credor || null);
    setBuscaFornecedorFrete(formatarCredorFrete(credor));
    setFornecedoresFrete([]);
    setFreteForm((current) => ({
      ...current,
      fornecedor_compra_id: credor?.fornecedor_compra_id ? String(credor.fornecedor_compra_id) : '',
      parceiro_id: credor?.parceiro_id ? String(credor.parceiro_id) : String(credor?.id || ''),
      novo_fornecedor: FRETE_FORM_INICIAL.novo_fornecedor,
      dados_pagamento: {
        ...current.dados_pagamento,
        favorecido: current.dados_pagamento.favorecido || credor?.nome || '',
        documento: current.dados_pagamento.documento || maskCpfCnpj(credor?.cpf_cnpj || credor?.cnpj || '')
      }
    }));
  }

  function limparCredorFrete() {
    setCredorFreteSelecionado(null);
    setBuscaFornecedorFrete('');
    setFornecedoresFrete([]);
    setFreteForm((current) => ({
      ...current,
      fornecedor_compra_id: '',
      parceiro_id: ''
    }));
  }

  async function handleBuscarFornecedorFrete(termoBusca = buscaFornecedorFrete) {
    try {
      const termo = String(termoBusca || '').trim();
      if (termo.length < 2) {
        setFornecedoresFrete([]);
        return;
      }
      setBuscandoFornecedoresFrete(true);
      const [parceirosData, fornecedoresData] = await Promise.all([
        buscarParceiros({ q: termo, fornecedor: 1, ativo: 1, limit: 10 }),
        listarFornecedoresCompra({ q: termo, incluir_inativos: '0', limit: 20 })
      ]);
      const parceiros = (Array.isArray(parceirosData) ? parceirosData : []).map((parceiro) => ({
        ...parceiro,
        parceiro_id: parceiro.id,
        origem_frete: 'PARCEIRO'
      }));
      const parceiroIds = new Set(parceiros.map((item) => Number(item.id)));
      const fornecedores = (Array.isArray(fornecedoresData) ? fornecedoresData : [])
        .filter((fornecedor) => !fornecedor.parceiro_id || !parceiroIds.has(Number(fornecedor.parceiro_id)))
        .map((fornecedor) => ({
          id: `fornecedor:${fornecedor.id}`,
          fornecedor_compra_id: fornecedor.id,
          parceiro_id: fornecedor.parceiro_id || '',
          origem_frete: 'FORNECEDOR_COMPRA',
          nome: fornecedor.nome,
          cpf_cnpj: fornecedor.cnpj,
          cnpj: fornecedor.cnpj,
          email: fornecedor.email || '',
          telefone: fornecedor.whatsapp || '',
          contato: fornecedor.contato || ''
        }));
      setFornecedoresFrete([...parceiros, ...fornecedores].slice(0, 12));
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao buscar credores de frete');
    } finally {
      setBuscandoFornecedoresFrete(false);
    }
  }

  useEffect(() => {
    if (!modalFreteAberto || freteForm.tipo !== 'TERCEIRO' || credorFreteSelecionado) {
      return undefined;
    }

    const termo = String(buscaFornecedorFrete || '').trim();
    if (termo.length < 2) {
      setFornecedoresFrete([]);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      handleBuscarFornecedorFrete(termo);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [buscaFornecedorFrete, credorFreteSelecionado, freteForm.tipo, modalFreteAberto]);

  async function handleRegistrarFrete() {
    const valorTotal = parseBrazilianMoney(freteForm.valor_total);
    if (!valorTotal || valorTotal <= 0) {
      avisar.alerta('Informe o valor do frete.');
      return;
    }

    const tipo = String(freteForm.tipo || '').toUpperCase();
    if (tipo === 'EMBUTIDO' && !permiteFreteEmbutido) {
      avisar.alerta('Pedido fechado aceita apenas frete pago a terceiro.');
      return;
    }

    const payload = {
      tipo,
      momento: permiteFreteEmbutido ? freteForm.momento : 'POSTERIOR',
      criterio_rateio: freteForm.criterio_rateio || 'VALOR_ITENS',
      valor_total: valorTotal,
      observacoes: freteForm.observacoes
    };

    if (payload.criterio_rateio === 'POR_ITEM') {
      const rateios = (freteForm.rateios || [])
        .map((rateio) => ({
          pedido_compra_item_id: Number(rateio.pedido_compra_item_id),
          valor_rateado: parseBrazilianMoney(rateio.valor_rateado)
        }))
        .filter((rateio) => rateio.pedido_compra_item_id > 0 && rateio.valor_rateado > 0);
      const totalRateado = rateios.reduce((total, rateio) => total + rateio.valor_rateado, 0);
      if (!rateios.length || Math.abs(totalRateado - valorTotal) > 0.01) {
        avisar.alerta('A soma do frete informado nos itens precisa ser igual ao valor total do frete.');
        return;
      }
      payload.rateios = rateios;
    }

    if (tipo === 'TERCEIRO') {
      if (!freteForm.data_vencimento) {
        avisar.alerta('Informe a data de vencimento do frete pago a terceiro.');
        return;
      }
      const fornecedorId = Number(freteForm.fornecedor_compra_id || 0);
      const parceiroId = Number(freteForm.parceiro_id || 0);
      const novoFornecedor = freteForm.novo_fornecedor || {};
      const dadosPagamento = freteForm.dados_pagamento || {};

      if (fornecedorId) {
        payload.fornecedor_compra_id = fornecedorId;
      } else if (parceiroId) {
        payload.parceiro_id = parceiroId;
      } else if (novoFornecedor.nome || novoFornecedor.cpf_cnpj) {
        if (!String(novoFornecedor.nome || '').trim()) {
          avisar.alerta('Informe o nome do credor/transportador.');
          return;
        }
        if (!isValidCpfCnpj(novoFornecedor.cpf_cnpj)) {
          avisar.alerta('Informe um CPF/CNPJ valido para o credor/transportador.');
          return;
        }
        if (!String(novoFornecedor.whatsapp || '').trim()) {
          avisar.alerta('Informe o telefone do credor/transportador.');
          return;
        }
        if (!isValidEmail(novoFornecedor.email)) {
          avisar.alerta('Informe um e-mail valido para o credor/transportador.');
          return;
        }
        payload.novo_fornecedor = {
          ...novoFornecedor,
          cpf_cnpj: onlyDigits(novoFornecedor.cpf_cnpj),
          whatsapp: onlyDigits(novoFornecedor.whatsapp),
          telefone: onlyDigits(novoFornecedor.whatsapp)
        };
      } else {
        avisar.alerta('Selecione ou cadastre o fornecedor/transportador do frete.');
        return;
      }

      if (dadosPagamento.documento && !isValidCpfCnpj(dadosPagamento.documento)) {
        avisar.alerta('Informe um CPF/CNPJ valido para o favorecido.');
        return;
      }
      if (String(dadosPagamento.tipo_chave_pix || '').toUpperCase() === 'EMAIL' && dadosPagamento.pix && !isValidEmail(dadosPagamento.pix)) {
        avisar.alerta('Informe uma chave PIX de e-mail valida.');
        return;
      }
      if (['CPF', 'CNPJ'].includes(String(dadosPagamento.tipo_chave_pix || '').toUpperCase()) && dadosPagamento.pix && !isValidCpfCnpj(dadosPagamento.pix)) {
        avisar.alerta('Informe uma chave PIX CPF/CNPJ valida.');
        return;
      }

      payload.dados_pagamento = {
        ...dadosPagamento,
        documento: onlyDigits(dadosPagamento.documento),
        pix: ['CPF', 'CNPJ', 'TELEFONE'].includes(String(dadosPagamento.tipo_chave_pix || '').toUpperCase())
          ? onlyDigits(dadosPagamento.pix)
          : dadosPagamento.pix
      };
      payload.data_vencimento = freteForm.data_vencimento;
    }

    try {
      setSalvandoFrete(true);
      const data = freteEditandoId
        ? await atualizarFretePedidoCompra(id, freteEditandoId, payload)
        : await registrarFretePedidoCompra(id, payload);
      setPedido(data || null);
      const editou = Boolean(freteEditandoId);
      fecharModalFrete(true);
      avisar.sucesso(editou
        ? 'Frete atualizado com auditoria registrada.'
        : tipo === 'TERCEIRO'
        ? 'Frete registrado e pendencia criada para o financeiro.'
        : 'Frete embutido registrado para rateio de custo.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao registrar frete do pedido');
    } finally {
      setSalvandoFrete(false);
    }
  }

  /*
    CANCELAMENTO DE FRETE — consentimento E justificativa saíram do
    `window.prompt` (R19) e viraram um passo só do modal do sistema, com a
    justificativa em CAMPO de verdade e obrigatória (`campo.obrigatorio`), do
    jeito que a auditoria já exigia.

    R26: `freteAlvo`/`freteId` fixam o alvo ANTES do `await`. Com o
    `window.prompt` a página ficava bloqueada e essa janela não existia; o
    modal do sistema NÃO bloqueia — a lista de fretes segue clicável, e sem a
    fixação a tela poderia perguntar sobre um frete e cancelar outro.
  */
  async function handleCancelarFrete(frete) {
    const freteAlvo = frete;
    const freteId = freteAlvo?.id;

    if (!fretePermiteCancelamento(freteAlvo)) {
      avisar.alerta('Este frete não pode ser cancelado porque já foi cancelado ou possui título financeiro vinculado.');
      return;
    }

    const { ok, texto } = await confirmar({
      titulo: 'Cancelar frete do pedido',
      mensagem: `Cancelar o frete de ${formatMoney(freteAlvo.valor_total)} deste pedido? Esta acao nao pode ser desfeita e fica registrada na auditoria.`,
      rotuloConfirmar: 'Cancelar frete',
      destrutiva: true,
      campo: { rotulo: 'Motivo do cancelamento do frete', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;

    const motivo = String(texto || '').trim();
    if (!motivo) {
      avisar.alerta('Informe o motivo do cancelamento do frete.');
      return;
    }

    try {
      setSalvandoFrete(true);
      const data = await cancelarFretePedidoCompra(id, freteId, { motivo });
      setPedido(data || null);
      avisar.sucesso('Frete cancelado com auditoria registrada.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao cancelar frete do pedido');
    } finally {
      setSalvandoFrete(false);
    }
  }

  async function handleSalvarItem(itemId) {
    try {
      const edicao = edicoes[itemId] || {};
      const payload = {
        ...edicao,
        preco_unitario: parseBrazilianMoney(edicao.preco_unitario)
      };

      setSavingItemId(itemId);
      const data = await atualizarItemPedidoCompra(id, itemId, payload);
      setPedido(data || null);
      fecharModalEdicao();
      avisar.sucesso('Item atualizado com auditoria registrada.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao atualizar item do pedido');
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleAdicionarResposta(respostaItemId) {
    try {
      setAddingRespostaId(respostaItemId);
      const data = await adicionarItemPedidoCompra(id, { resposta_item_id: respostaItemId });
      setPedido(data || null);
      avisar.sucesso('Item adicionado ao pedido.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao adicionar item ao pedido');
    } finally {
      setAddingRespostaId(null);
    }
  }

  /*
    R26: o item é fixado numa const ANTES da confirmação. O modal não congela
    a tela — a lista continua clicável atrás dele, e o item aberto pode trocar.
  */
  async function handleRemoverItem(itemId) {
    const alvoId = itemId;
    const alvo = (pedido?.itens || []).find((item) => item.id === alvoId) || null;

    const { ok } = await confirmar({
      titulo: 'Remover item do pedido',
      mensagem: `Remover "${alvo?.descricao || `item ${alvoId}`}" deste pedido? Esta acao nao pode ser desfeita; o item continua visivel para consulta no historico.`,
      rotuloConfirmar: 'Remover item',
      destrutiva: true
    });
    if (!ok) return;

    try {
      setRemovingItemId(alvoId);
      const data = await removerItemPedidoCompra(id, alvoId);
      setPedido(data || null);
      fecharModalEdicao();
      avisar.sucesso('Item removido do pedido.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao remover item do pedido');
    } finally {
      setRemovingItemId(null);
    }
  }

  async function handleAtualizarStatus(status) {
    if (!status || status === pedido?.status) {
      return;
    }

    try {
      setSavingStatus(true);
      const data = await atualizarStatusPedidoCompra(id, { status });
      setPedido(data || null);
      avisar.sucesso('Status do pedido atualizado com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao atualizar status do pedido');
    } finally {
      setSavingStatus(false);
    }
  }

  /*
    REABERTURA DO PEDIDO — eram DUAS caixas do navegador em sequência
    (`window.confirm` e `window.prompt`), com o motivo obrigatório e gravado
    em auditoria pedido numa caixa do Chrome que o harness não mede e que não
    deixa rastro no DOM. Agora é UM passo do modal do sistema: consentimento e
    justificativa juntos, com validação visível (`campo.obrigatorio`).
  */
  async function handleReabrirCotacao() {
    const exigeAprovacaoGeo = Boolean(pedido?.financeiro?.reabertura_exige_geo);
    const { ok, texto } = await confirmar({
      titulo: exigeAprovacaoGeo ? 'Solicitar reabertura ao GEO' : 'Reabrir pedido para edição ou cancelamento',
      mensagem: exigeAprovacaoGeo
        ? 'Este pedido possui histórico financeiro. Informe o motivo para o GEO analisar a reabertura; nenhum título será alterado antes da aprovação.'
        : 'Reabrir este pedido para edição ou cancelamento? A cotação vinculada voltará para edição e a ação ficará registrada no histórico.',
      rotuloConfirmar: exigeAprovacaoGeo ? 'Enviar ao GEO' : 'Reabrir pedido',
      campo: { rotulo: 'Motivo da reabertura', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;

    const motivoNormalizado = String(texto || '').trim();
    if (!motivoNormalizado) {
      avisar.alerta('Informe o motivo da reabertura.');
      return;
    }

    try {
      setReabrindoCotacao(true);
      if (exigeAprovacaoGeo) {
        await solicitarReaberturaPedidoCompra(id, { motivo: motivoNormalizado });
        await carregar();
        avisar.sucesso('Pedido de reabertura enviado ao GEO.');
      } else {
        const data = await reabrirPedidoCompraParaCotacao(id, { motivo: motivoNormalizado });
        setPedido(data || null);
        avisar.sucesso('Pedido reaberto para edição ou cancelamento.');
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao reabrir pedido');
    } finally {
      setReabrindoCotacao(false);
    }
  }

  async function handleBaixarPdf() {
    try {
      setBaixandoPdf(true);
      const blob = await baixarPdfPedidoCompra(id);
      triggerBlobDownload(blob, `pedido-compra-PC-${String(id).padStart(5, '0')}.pdf`);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao baixar PDF do pedido');
    } finally {
      setBaixandoPdf(false);
    }
  }

  async function handleVisualizarPdf() {
    try {
      setVisualizandoPdf(true);
      const blob = await baixarPdfPedidoCompra(id);
      const fileName = `pedido-compra-PC-${String(id).padStart(5, '0')}.pdf`;
      const url = window.URL.createObjectURL(blob);

      setPreviewPedido({
        title: `Pedido de compra PC-${String(id).padStart(5, '0')}`,
        name: fileName,
        url
      });
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao visualizar PDF do pedido');
    } finally {
      setVisualizandoPdf(false);
    }
  }

  async function handleEnviarPedido() {
    try {
      setEnviandoPedido(true);
      const blob = await baixarPdfPedidoCompra(id);
      const fileName = `pedido-compra-PC-${String(id).padStart(5, '0')}.pdf`;
      const message = buildPedidoWhatsappMessage(pedido);
      const whatsapp = String(pedido?.fornecedor?.whatsapp || '').replace(/\D/g, '');

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        typeof navigator.share === 'function'
      ) {
        try {
          const file = new File([blob], fileName, { type: 'application/pdf' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: fileName,
              text: message,
              files: [file]
            });
            return;
          }
        } catch {
          // fallback para download + WhatsApp Web
        }
      }

      triggerBlobDownload(blob, fileName);

      if (whatsapp) {
        window.open(
          `https://wa.me/${whatsapp}?text=${encodeURIComponent(`${message} O PDF do pedido foi baixado para anexo.`)}`,
          '_blank',
          'noopener,noreferrer'
        );
      } else {
        avisar.informacao('PDF baixado. Cadastre o WhatsApp do fornecedor para abrir o envio automaticamente.');
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao preparar envio do pedido');
    } finally {
      setEnviandoPedido(false);
    }
  }

  function toggleItemCancelamento(itemId) {
    setItensSelecionadosCancelamento((atuais) => (
      atuais.includes(itemId)
        ? atuais.filter((idAtual) => idAtual !== itemId)
        : [...atuais, itemId]
    ));
  }

  function handleCancelarPedido() {
    setCancelamentoPedidoForm({
      motivo: '',
      cancelar_cotacao: true,
      cancelar_solicitacao_compra: true,
      cancelar_solicitacao_principal: false
    });
    setModalCancelamentoAberto(true);
  }

  async function confirmarCancelamentoPedido() {
    // R26: o formulário inteiro é fixado antes da chamada — o modal não
    // congela a tela e os checkboxes seguem clicáveis enquanto ela corre.
    const formCancelamento = cancelamentoPedidoForm;
    const motivoNormalizado = String(formCancelamento.motivo || '').trim();
    if (!motivoNormalizado) {
      avisar.alerta('Informe o motivo do cancelamento do pedido.');
      return;
    }

    try {
      setCancelandoPedido(true);
      const data = await cancelarPedidoCompra(id, {
        motivo: motivoNormalizado,
        cancelar_cotacao: formCancelamento.cancelar_cotacao,
        cancelar_solicitacao_compra: formCancelamento.cancelar_solicitacao_compra,
        cancelar_solicitacao_principal: formCancelamento.cancelar_solicitacao_principal
      });
      setPedido(data || null);
      setModalCancelamentoAberto(false);
      avisar.sucesso('Cancelamento registrado. O histórico da solicitação foi atualizado.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao cancelar pedido');
    } finally {
      setCancelandoPedido(false);
    }
  }

  /*
    CANCELAMENTO EM LOTE DE ITENS — a classe CONSENTIMENTO da DoD.

    1. `alvos` fixa a marcação numa const ANTES do `await` (R26) e é ELA que
       vai para a chamada. Nada relê `itensSelecionadosCancelamento` depois da
       confirmação: o número que a barra contou, o número que a mensagem cita
       e o conjunto que o serviço recebe são o MESMO — é o "pergunta sobre 3,
       cancela 47" que este projeto persegue.
    2. O motivo era pedido em `window.prompt` e `if (motivo === null) return`
       deixava passar string VAZIA: cancelamento com efeito financeiro entrava
       na auditoria SEM justificativa. Agora o campo é obrigatório no modal e
       ainda é validado aqui.
    3. `cancelarItensPedidoCompra` é UMA chamada em lote (não há laço item a
       item), então não existe sucesso parcial a contar deste lado: ou o
       serviço aceita o lote inteiro, ou nenhum item é cancelado.
  */
  async function handleCancelarItensSelecionados() {
    const alvos = [...itensSelecionadosCancelamento];
    const itensAlvo = (pedido?.itens || []).filter((item) => alvos.includes(item.id));

    if (!alvos.length) {
      avisar.alerta('Selecione ao menos um item ativo para cancelar.');
      return;
    }

    const amostra = itensAlvo.slice(0, 3).map((item) => item.descricao).filter(Boolean).join('; ');
    const { ok, texto } = await confirmar({
      titulo: 'Cancelar itens do pedido',
      mensagem: `Cancelar ${alvos.length} item(ns) marcado(s) deste pedido? Esta acao nao pode ser desfeita: as quantidades voltam para remanejamento na cotacao.${amostra ? ` Itens: ${amostra}${itensAlvo.length > 3 ? ' e outros' : ''}.` : ''}`,
      rotuloConfirmar: `Cancelar ${alvos.length} item(ns)`,
      destrutiva: true,
      campo: { rotulo: 'Motivo do cancelamento dos itens', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;

    const motivo = String(texto || '').trim();
    if (!motivo) {
      avisar.alerta('Informe o motivo do cancelamento dos itens.');
      return;
    }

    try {
      setCancelandoItens(true);
      const data = await cancelarItensPedidoCompra(id, {
        item_ids: alvos,
        motivo
      });
      setPedido(data || null);
      setItensSelecionadosCancelamento([]);
      avisar.sucesso(`${alvos.length} item(ns) cancelado(s). As quantidades ficam disponiveis para remanejamento na cotacao.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || `Erro ao cancelar os ${alvos.length} item(ns) marcados. Nenhum item foi cancelado.`);
    } finally {
      setCancelandoItens(false);
    }
  }

  async function handleSalvarComentarioPedido() {
    const textoComentario = comentarioPedido;
    if (!textoComentario.trim()) {
      avisar.alerta('Digite o comentário do pedido.');
      return;
    }

    try {
      setSalvandoComentario(true);
      await comentarPedidoCompra(id, { comentario: textoComentario });
      setComentarioPedido('');
      avisar.sucesso('Comentário registrado no pedido e no histórico da solicitação.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao registrar comentario');
    } finally {
      setSalvandoComentario(false);
    }
  }

  async function handleAnexarEspelho(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setAnexandoEspelho(true);
      const upload = await uploadAnexoTemporarioCompra(file);
      const data = await anexarEspelhoPedidoCompra(id, {
        arquivo_url: upload?.arquivo_url,
        arquivo_nome_original: upload?.arquivo_nome_original || file.name
      });
      setPedido(data || null);
      avisar.sucesso('Espelho anexado ao pedido e ao histórico da solicitação.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao anexar espelho do fornecedor');
    } finally {
      setAnexandoEspelho(false);
    }
  }

  async function handleRemanejarItemAtual() {
    if (!itemEditando) return;
    if (!remanejoSelecionado) {
      avisar.alerta('Selecione o fornecedor/resposta de destino.');
      return;
    }

    const quantidadeMaxima = Number(itemEditando.quantidade_pedido || 0);
    const candidatoDestino = (pedido.candidatos_remanejamento || []).find(
      (candidato) => Number(candidato.resposta_item_id) === Number(remanejoSelecionado)
    );
    const saldoFornecedorDestino = Number(candidatoDestino?.saldo_disponivel_fornecedor || 0);
    const quantidadeMaximaEfetiva = Math.min(quantidadeMaxima, saldoFornecedorDestino);
    const quantidadeInformada = remanejoQuantidade
      ? parseBrazilianQuantity(remanejoQuantidade)
      : quantidadeMaxima;

    if (quantidadeInformada <= 0) {
      avisar.alerta('Informe uma quantidade maior que zero para remanejar.');
      return;
    }

    if (quantidadeInformada > quantidadeMaximaEfetiva) {
      avisar.alerta(`A quantidade remanejada nao pode ser maior que ${formatQuantityLabel(quantidadeMaximaEfetiva, itemEditando.unidade)}. Esse limite considera o item de origem e o saldo atual do fornecedor de destino.`);
      return;
    }

    try {
      setRemanejandoItem(true);
      const data = await remanejarItemPedidoCompra(id, itemEditando.id, {
        resposta_item_id_destino: remanejoSelecionado,
        quantidade: formatBrazilianQuantity(quantidadeInformada),
        motivo: 'Remanejamento operacional pela tela do pedido'
      });
      setPedido(data || null);
      setRemanejoSelecionado('');
      setRemanejoQuantidade('');
      fecharModalEdicao();
      avisar.sucesso('Item remanejado para o fornecedor selecionado.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao remanejar item');
    } finally {
      setRemanejandoItem(false);
    }
  }

  if (loading) {
    return (
      <Pagina>
        <div className="app-empty-card sol-surface-card">Carregando...</div>
      </Pagina>
    );
  }

  if (!pedido) {
    return (
      <Pagina>
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card sol-surface-card">Pedido de compra não encontrado.</div>
        {elementoConfirmacao}
      </Pagina>
    );
  }

  const codigoPedido = `PC-${String(pedido.id).padStart(5, '0')}`;
  const codigoSolicitacao = `SC-${String(pedido.solicitacao_compra_id).padStart(5, '0')}`;
  const edicaoItemAtual = itemEditando ? edicoes[itemEditando.id] || {} : {};
  const itemEditandoAbaixoMinimo = isItemAbaixoMinimo(itemEditando);
  const itemEditandoSituacao = getItemSituacao(itemEditando);
  const itemEditandoPrecoContext = itemEditando
    ? buildItemPriceContext(itemEditando, edicaoItemAtual.preco_unitario ?? itemEditando.preco_unitario)
    : null;
  const itemEditandoValorTotalAtual = itemEditando
    ? parseBrazilianQuantity(edicaoItemAtual.quantidade_pedido ?? itemEditando.quantidade_pedido) * (itemEditandoPrecoContext?.precoAtual ?? 0)
    : 0;
  const modalProcessando = itemEditando ? savingItemId === itemEditando.id || removingItemId === itemEditando.id : false;
  const candidatosRemanejamentoItem = itemEditando
    ? (pedido.candidatos_remanejamento || []).filter((candidato) => {
        const candidatoKey = candidato.item_key || `${normalizeItemType(candidato.item_tipo)}:${
          Number(candidato.solicitacao_compra_item_id || 0) ||
          Number(candidato.solicitacao_compra_item_manual_id || 0)
        }`;

        return candidatoKey === buildPedidoItemKey(itemEditando) &&
          Number(candidato.resposta_item_id) !== Number(itemEditando.resposta_item_id) &&
          Number(candidato.fornecedor_id) !== Number(pedido.fornecedor_compra_id);
      })
    : [];
  const candidatoRemanejamentoSelecionado = candidatosRemanejamentoItem.find(
    (candidato) => Number(candidato.resposta_item_id) === Number(remanejoSelecionado)
  );
  const quantidadeMaximaRemanejamento = itemEditando
    ? Math.min(
        Number(itemEditando.quantidade_pedido || 0),
        Number(candidatoRemanejamentoSelecionado?.saldo_disponivel_fornecedor ?? itemEditando.quantidade_pedido ?? 0)
      )
    : 0;

  const acoesSecundarias = [
    {
      rotulo: visualizandoPdf ? 'Abrindo pedido...' : 'Ver pedido',
      onClick: handleVisualizarPdf,
      desabilitada: visualizandoPdf
    },
    {
      rotulo: baixandoPdf ? 'Gerando PDF...' : 'Baixar PDF',
      onClick: handleBaixarPdf,
      desabilitada: baixandoPdf
    },
    podeReabrirCotacao ? {
      rotulo: reaberturaPendenteGeo
        ? 'Reabertura aguardando GEO'
        : reabrindoCotacao
        ? 'Processando...'
        : (pedido?.financeiro?.reabertura_exige_geo ? 'Solicitar reabertura ao GEO' : 'Reabrir pedido'),
      onClick: handleReabrirCotacao,
      desabilitada: reabrindoCotacao || reaberturaPendenteGeo
    } : null
  ].filter(Boolean);

  /*
    R13/C4: a faixa fixa mostra o NOME do registro (o fornecedor) com o código
    ao lado — número sem nome é defeito. O apoio (contagem/descrição) vive nas
    props do PageHeader, não num parágrafo solto (R5).
  */
  const camposResumo = [
    { label: 'Fornecedor', valor: pedido.fornecedor?.nome || '' },
    {
      label: 'Status',
      valor: (
        <span style={{ color: statusAtual?.cor || undefined }}>
          {formatStatusLabel(pedido.status, statusMap)}
        </span>
      )
    },
    { label: 'Obra', valor: pedido.obra?.nome || '' },
    {
      /*
        "Onde a NAVEGAÇÃO mora" (04/09): link para o REGISTRO RELACIONADO vai
        no corpo, junto do dado que o origina — nunca na barra de ações. O
        botão "Abrir solicitacao" da faixa virou o próprio código clicável.
      */
      label: 'Solicitação',
      valor: (
        <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/solicitacoes-compra/${pedido.solicitacao_compra_id}`}>
          {codigoSolicitacao}
        </Link>
      ),
      sub: 'Abrir a solicitação de compra de origem'
    },
    {
      label: 'Rodada de fechamento',
      valor: pedido.fechamento
        ? `${pedido.fechamento.numero_rodada} - ${String(pedido.fechamento.tipo || '').toLowerCase()}`
        : '',
      contexto: Boolean(pedido.fechamento)
    },
    {
      label: 'Total da aquisicao',
      valor: formatMoney(pedido.valor_total),
      sub: 'Itens, tributos, DIFAL e fretes'
    },
    {
      label: 'Total devido ao fornecedor',
      valor: formatMoney(pedido.valor_total_fornecedor ?? pedido.valor_total),
      sub: 'Frete de terceiro fica separado'
    },
    { label: 'Mercadorias', valor: formatMoney(pedido.valor_mercadorias) },
    { label: 'IPI + ICMS + ST', valor: formatMoney(pedido.valor_tributos) },
    { label: 'DIFAL rateado', valor: formatMoney(pedido.difal_total) },
    {
      label: 'Frete deste pedido',
      valor: pedido.frete_tipo_cotacao === 'SEM_FRETE'
        ? 'Sem frete'
        : `${pedido.frete_tipo_cotacao === 'TERCEIRO' ? 'Pago a terceiro' : 'Embutido'} - ${formatMoney(pedido.frete_total ?? pedido.frete_valor_cotacao)}`,
      sub: [
        pedido.frete_tipo_cotacao !== 'SEM_FRETE'
          ? `Lancamento ${pedido.frete_modo_cotacao === 'POR_ITEM' ? 'por item' : 'global'}`
          : null,
        pedido.frete_data_vencimento ? `Vencimento: ${formatDate(pedido.frete_data_vencimento)}` : null,
        (pedido.frete_transportador_nome || pedido.frete_transportador_cpf_cnpj)
          ? `Transportador: ${pedido.frete_transportador_nome || 'Nao informado'}${pedido.frete_transportador_cpf_cnpj ? ` - ${pedido.frete_transportador_cpf_cnpj}` : ''}`
          : null
      ].filter(Boolean).join(' · ') || undefined
    },
    { label: 'Itens ativos', valor: String(itensAtivos.length) },
    {
      label: 'Pedido mínimo do fornecedor',
      valor: pedido.valor_minimo_pedido ? formatMoney(pedido.valor_minimo_pedido) : ''
    },
    { label: 'Condicao de pagamento', valor: pedido.condicao_pagamento || '' },
    { label: 'Criado por', valor: pedido.criador?.nome || '' }
  ];

  /*
    C1 (05/09): o apoio longo empurrava a barra de acoes para uma SEGUNDA
    linha da faixa — 94px onde o teto e 72. Mesma causa e mesmo conserto dos
    tres relatorios de Compras: a conta de quebra do flex usa o texto
    INTEIRO do apoio, porque ele e `nowrap` para poder truncar.
  */
  return (
    <Pagina className="apoio-linha-unica">
      <PageHeader
        titulo={pedido.fornecedor?.nome ? `${pedido.fornecedor.nome} — ${codigoPedido}` : codigoPedido}
        contagem={`${resumoItens.total} item(ns)`}
        descricao="Gestão de itens, frete, comentários e cancelamento deste pedido de compra."
        voltar={{ onClick: () => navigateBack('/pedidos-compra'), title: 'Voltar para pedidos de compra' }}
        acaoPrincipal={!pedidoCancelado ? {
          rotulo: enviandoPedido ? 'Preparando envio...' : 'Enviar pedido',
          onClick: handleEnviarPedido,
          desabilitada: enviandoPedido
        } : null}
        secundarias={acoesSecundarias}
        destrutiva={podeCancelarPedido ? {
          rotulo: cancelandoPedido ? 'Cancelando...' : 'Cancelar pedido',
          onClick: handleCancelarPedido,
          desabilitada: pedidoCancelado || cancelandoPedido
        } : null}
      />

      {/* R16: UM dono para a faixa de avisos, logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {!podeGerenciarPedido && !podeGerenciarFinanceiroPedido ? (
        <div className="app-alert">
          Você esta visualizando este pedido. Alterações de status e itens ficam restritas ao setor de compras.
        </div>
      ) : !podeGerenciarPedido && podeGerenciarFinanceiroPedido ? (
        <div className="app-alert">
          A gestão operacional e a criação dos títulos permanecem com Compras. Você pode consultar o pedido e executar apenas as ações liberadas por sua permissão.
        </div>
      ) : null}

      {edicaoBloqueadaPorStatus ? (
        <div className="app-alert">
          {pedido.edicao_bloqueada_motivo === 'COTACAO_ENCERRADA'
            ? 'Este pedido foi criado antes do fechamento automatico e esta vinculado a uma cotacao ja encerrada. Reabra o pedido para editar itens ou cancelar.'
            : `O status atual do pedido bloqueia edicao. Enquanto ele estiver em "${formatStatusLabel(pedido.status, statusMap)}", os itens nao poderao ser alterados, adicionados ou removidos.`}
        </div>
      ) : null}

      <BlocoConteudo
        titulo="Resumo do pedido"
        variante="primario"
        cor="var(--module-compras)"
        descricao="Fornecedor, valores e vínculos deste pedido de compra."
        acoes={businessAdmin ? (
          <button type="button" className="btn btn-outline" onClick={() => abrirAuditoria()}>
            Auditoria do pedido
          </button>
        ) : null}
      >
        {/*
          R12: select de FORMULÁRIO — escreve o status DO REGISTRO, não recorta
          lista nenhuma. Saiu da barra de ações do cabeçalho (onde campo de
          entrada não é ação) e virou campo de verdade, com rótulo e alinhamento
          do CampoForm.
        */}
        {pedido.solicitacao?.solicitacao_principal_id && <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/solicitacoes/${pedido.solicitacao.solicitacao_principal_id}`)}>Acompanhar entregas na solicitação</button>
          <span className="text-[var(--c-muted)]">Confirme a previsão, registre recebimentos e trate o saldo por item.</span>
        </div>}
        <FormSecao colunas={2}>
          <CampoForm label="Status do pedido" hint="A troca de status grava auditoria e pode bloquear a edicao dos itens.">
            <select
              className="input w-full"
              value={pedido.status || ''}
              onChange={(event) => handleAtualizarStatus(event.target.value)}
              disabled={!podeAlterarStatusPedido || savingStatus || pedidoCancelado}
            >
              {statusSelectOptions.map((status) => (
                <option key={status.codigo} value={status.codigo}>
                  {status.nome}
                </option>
              ))}
            </select>
          </CampoForm>
        </FormSecao>

        <div className="mt-4">
          <CamposComVazios campos={camposResumo} colunas={4} />
        </div>

        {pedido.fechamento && Number(pedido.fechamento.quantidade_excedente || 0) > 0 ? (
          <div className="mt-3">
            <FaixaCondicao tom="atencao">
              <span className="font-semibold">
                Quantidade excedente autorizada: {formatQuantityLabel(pedido.fechamento.quantidade_excedente)}
              </span>
              <span className="mt-1 block">Justificativa: {pedido.fechamento.justificativa_excedente || '-'}</span>
            </FaixaCondicao>
          </div>
        ) : null}

        {!pedido.atingiu_pedido_minimo ? (
          <div className="mt-3">
            <FaixaCondicao tom="atencao">
              O valor atual ainda não atinge o pedido mínimo informado pelo fornecedor.
            </FaixaCondicao>
          </div>
        ) : null}
      </BlocoConteudo>

      <PedidoCompraFinanceiro
        pedido={pedido}
        user={user}
        avisar={avisar}
        onAtualizar={carregar}
      />

      <BlocoConteudo
        titulo="Itens do pedido"
        contagem={`${itensFiltrados.length} visível(is)`}
        descricao="Marque itens para cancelar em lote; a edição de cada item abre em modal."
      >
        <StatGrid colunas={4}>
          <StatTile label="Ativos" valor={resumoItens.ativos} sub="Itens operacionais" />
          <StatTile label="Atenção" valor={resumoItens.atencao} sub="Abaixo do mínimo" tom={resumoItens.atencao ? 'warning' : undefined} />
          <StatTile label="Removidos" valor={resumoItens.removidos} sub="Mantidos para histórico" />
          <StatTile label="Valor total" valor={formatMoney(pedido.valor_total)} sub="Total da aquisição com frete" />
        </StatGrid>

        <div className="mt-4">
          <BarraFiltros
            busca={{
              valor: buscaItens,
              aoMudar: setBuscaItens,
              placeholder: 'Buscar por descrição, origem ou unidade'
            }}
            filtros={[{ id: 'situacao', rotulo: 'Situação', opcoes: OPCOES_SITUACAO_ITEM }]}
            ativos={filtrosItens}
            aoAlternar={alternarFiltroItens}
            aoLimpar={limparFiltrosItens}
          />
        </div>

        {podeCancelarPedido ? (
          <div className="app-actionbar mt-4 justify-end">
            <button
              type="button"
              className="btn btn-outline btn-perigo-suave"
              onClick={handleCancelarItensSelecionados}
              disabled={pedidoBloqueado || cancelandoItens || itensSelecionadosCancelamento.length === 0}
            >
              {cancelandoItens ? 'Cancelando...' : `Cancelar itens (${itensSelecionadosCancelamento.length})`}
            </button>
          </div>
        ) : null}

        <div className="mt-4">
          <TabelaPadrao
            colunas={[
              {
                id: 'item',
                titulo: 'Item',
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => {
                  const precoContext = buildItemPriceContext(item);
                  return (
                    <CelulaDupla
                      title={item.descricao}
                      principal={item.descricao}
                      sub={(
                        <>
                          <span className="block">
                            Minimo: {formatQuantityLabel(item.quantidade_minima_item, item.unidade)}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            <span>
                              Cotado: <span className="font-semibold text-[var(--c-text)]">{formatUnitPrice(precoContext.precoCotado, item.unidade)}</span>
                            </span>
                            <span>
                              Atual: <span className="font-semibold text-[var(--c-text)]">{formatUnitPrice(precoContext.precoAtual, item.unidade)}</span>
                            </span>
                            <span>
                              Ult. compra: <span className="font-semibold text-[var(--c-text)]">{formatUnitPrice(precoContext.ultimoPrecoCompra, item.unidade, 'Sem historico')}</span>
                            </span>
                            <span>
                              Var.: <span className={`font-semibold ${getVariationTextClass(precoContext.variacaoUltimaCompra)}`}>{formatVariationPercent(precoContext.variacaoUltimaCompra)}</span>
                            </span>
                            <span>Mercadoria: <span className="font-semibold text-[var(--c-text)]">{formatMoney(item.valor_mercadoria)}</span></span>
                            <span>IPI: <span className="font-semibold text-[var(--c-text)]">{formatMoney(item.ipi_valor)}</span></span>
                            <span>ICMS: <span className="font-semibold text-[var(--c-text)]">{formatMoney(item.icms_valor)}</span></span>
                            <span>ST: <span className="font-semibold text-[var(--c-text)]">{formatMoney(item.st_valor)}</span></span>
                            <span>DIFAL: <span className="font-semibold text-[var(--c-text)]">{formatMoney(item.difal_rateado)}</span></span>
                          </span>
                        </>
                      )}
                    />
                  );
                }
              },
              {
                id: 'origem',
                titulo: 'Origem',
                tipo: 'texto',
                render: (item) => item.origem || '-'
              },
              {
                id: 'solicitado',
                titulo: 'Solicitado',
                tipo: 'numero',
                render: (item) => formatQuantityLabel(item.quantidade_solicitada, item.unidade)
              },
              {
                id: 'pedido',
                titulo: 'Pedido',
                tipo: 'numero',
                render: (item) => formatQuantityLabel(item.quantidade_pedido, item.unidade)
              },
              {
                id: 'itens',
                titulo: 'Itens',
                tipo: 'valor',
                render: (item) => formatMoney(item.valor_total)
              },
              {
                id: 'frete',
                titulo: 'Frete',
                tipo: 'valor',
                render: (item) => formatMoney(item.frete_rateado)
              },
              {
                id: 'total_aquisicao',
                titulo: 'Total aquisição',
                tipo: 'valor',
                render: (item) => formatMoney(Number(item.valor_total || 0) + Number(item.frete_rateado || 0))
              },
              {
                id: 'situacao',
                titulo: 'Situação',
                tipo: 'status',
                render: (item) => {
                  const situacao = getItemSituacao(item);
                  return <Pilula tom={situacao.tom}>{situacao.label}</Pilula>;
                }
              }
            ]}
            itens={itensFiltrados}
            vazio="Nenhum item encontrado com os filtros atuais."
            storageKey="tabela:pedido-compra-detalhe:itens"
            rotuloRolagem="Itens do pedido"
            /*
              R16b (capacidade 3): a marcação em lote é do componente. A coluna
              de checkbox montada à mão saiu — com ela vinha o "todos" ausente
              e o estado indeterminado que ninguém desenhava.
            */
            selecao={podeCancelarPedido ? {
              selecionados: itensSelecionadosCancelamento,
              aoAlternar: (itemId) => toggleItemCancelamento(itemId),
              aoAlternarTodos: (marcar, ids) => setItensSelecionadosCancelamento(marcar ? [...ids] : []),
              elegivel: (item) => !item.removido && !pedidoBloqueado
            } : undefined}
            acoesLinha={(item) => (
              <>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => abrirModalEdicao(item.id)}
                >
                  {podeEditarItensPedido && !item.removido ? 'Editar' : 'Ver item'}
                </button>
                {businessAdmin ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => abrirAuditoria(item.id)}
                  >
                    Auditoria
                  </button>
                ) : null}
              </>
            )}
            larguraAcoes={260}
          />
        </div>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Fretes do pedido"
        contagem={`${fretesPedido.length} frete(s)`}
        descricao="Custo rateado nos itens para acompanhamento da obra."
        acoes={podeRegistrarFretePedido && !pedidoCancelado ? (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => abrirModalFrete('FECHAMENTO')}
            disabled={salvandoFrete}
          >
            Registrar frete
          </button>
        ) : null}
      >
        <StatGrid colunas={2}>
          <StatTile
            label="Total de frete rateado"
            valor={formatMoney(totalFretesPedido)}
            sub="Não inclui fretes cancelados"
          />
          <StatTile
            label="Aguardando o financeiro"
            valor={`${fretesPendentesFinanceiro.length} frete(s)`}
            sub="Pendentes de geração de título"
            tom={fretesPendentesFinanceiro.length ? 'warning' : undefined}
          />
        </StatGrid>

        {fretesPedido.length ? (
          <div className="app-list-stack mt-4">
            {fretesPedido.map((frete) => (
              <div key={frete.id} className="app-list-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">
                    {String(frete.tipo || '').replace(/_/g, ' ')}
                  </div>
                  <Pilula tom={tomDoFrete(frete)}>
                    {String(frete.status_financeiro || 'REGISTRADO').replace(/_/g, ' ')}
                  </Pilula>
                </div>
                <div className="mt-1 font-semibold tabular-nums">{formatMoney(frete.valor_total)}</div>
                <div className="mt-1 text-xs text-[var(--c-muted)]">
                  {frete.fornecedor?.nome || frete.parceiro?.nome ? `${frete.fornecedor?.nome || frete.parceiro?.nome} - ` : ''}
                  {frete.rateios?.length || 0} item(ns) com frete · {frete.criterio_rateio === 'POR_ITEM' ? 'valor informado por item' : 'rateio proporcional'}
                  {frete.data_vencimento ? ` - vence em ${formatDate(frete.data_vencimento)}` : ''}
                </div>
                {frete.tituloFinanceiro?.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Pilula tom="sucesso">Título gerado</Pilula>
                    <Link
                      className="font-semibold text-[var(--c-primary)] hover:underline"
                      to={`/financeiro/titulos/${frete.tituloFinanceiro.id}`}
                    >
                      {frete.tituloFinanceiro.codigo || `Titulo #${frete.tituloFinanceiro.id}`}
                    </Link>
                  </div>
                ) : null}
                {(fretePermiteControle(frete) || fretePermiteCancelamento(frete)) ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {fretePermiteControle(frete) ? (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => abrirEdicaoFrete(frete)}
                        disabled={salvandoFrete}
                      >
                        Editar frete
                      </button>
                    ) : null}
                    {fretePermiteCancelamento(frete) ? (
                      <button
                        type="button"
                        className="btn btn-outline btn-perigo-suave"
                        onClick={() => handleCancelarFrete(frete)}
                        disabled={salvandoFrete}
                      >
                        Cancelar frete
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="app-empty-card mt-4 py-4 text-sm">
            Nenhum frete registrado para este pedido.
          </div>
        )}
      </BlocoConteudo>

      {podeEditarItensPedido ? (
        <BlocoConteudo
          titulo="Itens cotados disponíveis"
          variante="secundario"
          contagem={`${pedido.candidatos_adicao?.length || 0} candidato(s)`}
          descricao="Respostas do fornecedor que ainda podem entrar neste pedido."
          recolhivel
          recolhidoPadrao={!pedido.candidatos_adicao?.length}
        >
          {pedido.candidatos_adicao?.length ? (
            <div className="app-list-stack">
              {pedido.candidatos_adicao.map((item) => (
                <div key={item.resposta_item_id} className="app-list-card">
                  <div className="font-medium">{item.descricao}</div>
                  <div className="mt-1 text-sm text-[var(--c-muted)]">
                    {formatQuantityLabel(item.quantidade_solicitada, item.unidade)} - {formatMoney(item.preco_unitario)}
                  </div>
                  <div className="mt-1 text-xs text-[var(--c-muted)]">
                    Minimo do item: {formatQuantityLabel(item.quantidade_minima_item, item.unidade)} - Prazo: {item.prazo || '-'}
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline mt-3"
                    onClick={() => handleAdicionarResposta(item.resposta_item_id)}
                    disabled={pedidoBloqueado || addingRespostaId === item.resposta_item_id}
                  >
                    {addingRespostaId === item.resposta_item_id ? 'Adicionando...' : 'Adicionar ao pedido'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="app-empty-card py-6">
              Todos os itens cotados desse fornecedor já foram usados ou não ha respostas adicionais disponíveis.
            </div>
          )}
        </BlocoConteudo>
      ) : null}

      {podeComentarPedido || podeAnexarEspelhoPedido ? (
        <BlocoConteudo
          titulo="Histórico operacional"
          variante="secundario"
          descricao="Comentários e espelho do fornecedor aparecem também no histórico da solicitação."
        >
          <div className="grid gap-4">
            {podeComentarPedido ? (
              <FormSecao colunas={1}>
                <CampoForm label="Comentário do pedido" tipo="texto-longo">
                  <textarea
                    className="input w-full"
                    rows={4}
                    value={comentarioPedido}
                    onChange={(event) => setComentarioPedido(event.target.value)}
                    placeholder="Registre alinhamentos, pendências ou informações para a obra."
                  />
                </CampoForm>
                <div className="app-actionbar">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleSalvarComentarioPedido}
                    disabled={salvandoComentario || !comentarioPedido.trim()}
                  >
                    {salvandoComentario ? 'Registrando...' : 'Registrar comentario'}
                  </button>
                </div>
              </FormSecao>
            ) : null}

            {podeAnexarEspelhoPedido ? (
              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-sm">
                <div className="font-semibold">Espelho do pedido do fornecedor</div>
                <p className="mt-1 text-xs text-[var(--c-muted)]">
                  Anexe aqui o comprovante/espelho enviado pelo fornecedor. Ele também aparece no histórico da solicitação.
                </p>
                {pedido.espelho_fornecedor_url ? (
                  <div className="mt-2 text-xs text-[var(--c-muted)]">
                    Anexado: <span className="font-semibold text-[var(--c-text)]">{pedido.espelho_fornecedor_nome || 'arquivo'}</span>
                  </div>
                ) : null}
                <label className="btn btn-outline mt-3 w-full cursor-pointer justify-center">
                  {anexandoEspelho ? 'Anexando...' : 'Anexar espelho'}
                  <input type="file" className="hidden" onChange={handleAnexarEspelho} disabled={anexandoEspelho} />
                </label>
              </div>
            ) : null}
          </div>
        </BlocoConteudo>
      ) : null}

      {/*
        R27: os três modais desta tela eram painéis feitos à mão, com
        `overflow: hidden` (que mata sticky, R18), `maxHeight`/`maxWidth` em px
        e `rgba()` cru no fundo. Agora são `OverlayModal`, com o corpo rolando
        entre `data-modal="cabecalho"` e `data-modal="rodape"` — o botão que
        executa a ação não sai de vista por conteúdo alto.
      */}
      {modalEdicaoAberto && itemEditando ? (
        <OverlayModal
          largura="var(--modal-max-w-xl, 1120px)"
          rotulo={podeEditarItensPedido && !itemEditando.removido ? 'Editar item do pedido' : 'Detalhes do item'}
          onFechar={modalProcessando ? undefined : fecharModalEdicao}
        >
          <div data-modal="cabecalho" className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>
                {podeEditarItensPedido && !itemEditando.removido ? 'Editar item do pedido' : 'Detalhes do item'}
              </h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
                {codigoPedido} - {itemEditando.descricao}
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={fecharModalEdicao} disabled={modalProcessando}>
              Fechar
            </button>
          </div>

          <div className="px-4 py-4">
            {itemEditando.removido ? (
              <div className="mb-3">
                <FaixaCondicao tom="neutro">
                  Este item foi removido do pedido. Ele permanece visível para consulta, mas a trilha detalhada agora fica no
                  painel administrativo de relatorios.
                </FaixaCondicao>
              </div>
            ) : null}

            {itemEditandoAbaixoMinimo ? (
              <div className="mb-3">
                <FaixaCondicao tom="atencao">
                  A quantidade atual do pedido ainda esta abaixo do mínimo definido para este item.
                </FaixaCondicao>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="grid gap-3 lg:col-span-2">
                {!itemEditando.removido ? (
                  <FormSecao colunas={3}>
                    <CampoForm
                      label="Quantidade do pedido"
                      hint="Use `.` para milhar e `,` para decimal, com no maximo 2 casas apos a virgula."
                    >
                      <input
                        className="input w-full"
                        type="text"
                        inputMode="decimal"
                        value={edicaoItemAtual.quantidade_pedido ?? ''}
                        disabled={pedidoBloqueado}
                        onChange={(event) =>
                          atualizarEdicaoItem(itemEditando.id, {
                            quantidade_pedido: maskBrazilianQuantityInput(event.target.value)
                          })
                        }
                        onBlur={(event) =>
                          atualizarEdicaoItem(itemEditando.id, {
                            quantidade_pedido: normalizeBrazilianQuantityOnBlur(event.target.value)
                          })
                        }
                        placeholder="Ex.: 1.250 ou 1.250,50"
                      />
                    </CampoForm>

                    {/* R6: campo de dinheiro usa .input-moeda (mín. 180px, à direita, tabular). */}
                    <CampoForm label="Preço unitário">
                      <input
                        className="input input-moeda"
                        type="text"
                        inputMode="decimal"
                        value={edicaoItemAtual.preco_unitario ?? ''}
                        disabled={pedidoBloqueado}
                        onChange={(event) =>
                          atualizarEdicaoItem(itemEditando.id, {
                            preco_unitario: sanitizeMoneyInput(event.target.value)
                          })
                        }
                        onBlur={(event) =>
                          atualizarEdicaoItem(itemEditando.id, {
                            preco_unitario: formatMoneyInput(event.target.value)
                          })
                        }
                      />
                    </CampoForm>

                    <CampoForm label="Valor recalculado">
                      <div className="input input-moeda flex items-center">
                        {formatMoney(
                          parseBrazilianQuantity(edicaoItemAtual.quantidade_pedido) * (parseBrazilianMoney(edicaoItemAtual.preco_unitario) || 0)
                        )}
                      </div>
                    </CampoForm>

                    <CampoForm label="Observações do item" tipo="texto-longo">
                      <textarea
                        className="input w-full"
                        rows={3}
                        value={edicaoItemAtual.observacoes ?? ''}
                        disabled={pedidoBloqueado}
                        onChange={(event) =>
                          atualizarEdicaoItem(itemEditando.id, {
                            observacoes: event.target.value
                          })
                        }
                      />
                    </CampoForm>
                  </FormSecao>
                ) : (
                  <FaixaCondicao tom="neutro">
                    Item removido do fluxo ativo. Use o atalho de auditoria para consultar toda a trilha historica.
                  </FaixaCondicao>
                )}
              </div>

              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                <div className="text-xs font-medium uppercase text-[var(--c-muted)]">
                  Resumo do item
                </div>
                <div className="mt-3 grid gap-2 text-xs">
                  <div>
                    <div className="text-[var(--c-muted)]">Situação</div>
                    <div className="mt-1">
                      <Pilula tom={itemEditandoSituacao.tom}>{itemEditandoSituacao.label}</Pilula>
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Origem</div>
                    <div className="font-semibold">{itemEditando.origem || '-'}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Solicitado</div>
                    <div className="font-semibold">{formatQuantityLabel(itemEditando.quantidade_solicitada, itemEditando.unidade)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Pedido atual</div>
                    <div className="font-semibold">{formatQuantityLabel(itemEditando.quantidade_pedido, itemEditando.unidade)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Mínimo</div>
                    <div className="font-semibold">{formatQuantityLabel(itemEditando.quantidade_minima_item, itemEditando.unidade)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Cotado pelo fornecedor</div>
                    <div className="font-semibold tabular-nums">{formatUnitPrice(itemEditandoPrecoContext?.precoCotado, itemEditando.unidade)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Preço atual do pedido</div>
                    <div className="font-semibold tabular-nums">{formatUnitPrice(itemEditandoPrecoContext?.precoAtual, itemEditando.unidade)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Ult. compra</div>
                    <div className="font-semibold tabular-nums">{formatUnitPrice(itemEditandoPrecoContext?.ultimoPrecoCompra, itemEditando.unidade, 'Sem historico')}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Variacao x ult. compra</div>
                    <div className={`font-semibold tabular-nums ${getVariationTextClass(itemEditandoPrecoContext?.variacaoUltimaCompra)}`}>
                      {formatVariationPercent(itemEditandoPrecoContext?.variacaoUltimaCompra)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Valor total atual</div>
                    <div className="font-semibold tabular-nums">{formatMoney(itemEditandoValorTotalAtual)}</div>
                  </div>
                </div>

                {businessAdmin ? (
                  <button type="button" className="btn btn-outline mt-3 w-full justify-center" onClick={() => abrirAuditoria(itemEditando.id)}>
                    Abrir auditoria do item
                  </button>
                ) : null}
              </div>
            </div>

            {podeRemanejarPedido && !itemEditando.removido ? (
              <div className="mt-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Remanejar quantidade para outro fornecedor</h3>
                    <p className="mt-1 text-xs text-[var(--c-muted)]">
                      Use quando parte ou todo o item precisar voltar para a cotação e seguir em outro pedido.
                    </p>
                  </div>
                  <Pilula tom="info">
                    Max. {formatQuantityLabel(quantidadeMaximaRemanejamento, itemEditando.unidade)}
                  </Pilula>
                </div>
                {/*
                  R12: seletor de CONTEXTO — escolhe o ALVO da chamada de
                  remanejamento (para qual resposta do fornecedor a quantidade
                  vai), não recorta lista nenhuma. A própria R12 declara esse
                  caso como select legítimo.
                */}
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <select
                    className="input w-full"
                    aria-label="Resposta de destino do remanejamento"
                    value={remanejoSelecionado}
                    onChange={(event) => setRemanejoSelecionado(event.target.value)}
                    disabled={pedidoBloqueado || remanejandoItem || candidatosRemanejamentoItem.length === 0}
                  >
                    <option value="">
                      {candidatosRemanejamentoItem.length ? 'Selecione a resposta de destino' : 'Sem fornecedor alternativo respondido'}
                    </option>
                    {candidatosRemanejamentoItem.map((candidato) => (
                      <option key={`${candidato.resposta_item_id}-${candidato.fornecedor_id}`} value={candidato.resposta_item_id}>
                        {candidato.fornecedor_nome} - saldo {formatQuantityLabel(candidato.saldo_disponivel_fornecedor, candidato.unidade)} - {formatUnitPrice(candidato.preco_unitario, candidato.unidade)} - prazo {candidato.prazo || '-'}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input w-full"
                    type="text"
                    inputMode="decimal"
                    aria-label="Quantidade a remanejar"
                    value={remanejoQuantidade}
                    onChange={(event) => setRemanejoQuantidade(maskBrazilianQuantityInput(event.target.value))}
                    onBlur={(event) => setRemanejoQuantidade(normalizeBrazilianQuantityOnBlur(event.target.value))}
                    placeholder={formatBrazilianQuantity(quantidadeMaximaRemanejamento)}
                    disabled={pedidoBloqueado || remanejandoItem}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleRemanejarItemAtual}
                    disabled={pedidoBloqueado || remanejandoItem || !remanejoSelecionado}
                  >
                    {remanejandoItem ? 'Remanejando...' : 'Remanejar'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div data-modal="rodape" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-border)] px-4 py-3">
            <div className="text-xs text-[var(--c-muted)]">
              A trilha de auditoria saiu desta tela para evitar sobrecarga visual em pedidos grandes.
            </div>
            <div className="app-actionbar">
              <button type="button" className="btn btn-outline" onClick={fecharModalEdicao} disabled={modalProcessando}>
                Cancelar
              </button>
              {podeEditarItensPedido && !itemEditando.removido ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleSalvarItem(itemEditando.id)}
                  disabled={pedidoBloqueado || savingItemId === itemEditando.id}
                >
                  {savingItemId === itemEditando.id ? 'Salvando...' : 'Salvar ajustes'}
                </button>
              ) : null}
              {podeEditarItensPedido && !itemEditando.removido ? (
                <span className="app-actionbar-apartada">
                  <button
                    type="button"
                    className="btn btn-outline btn-perigo-suave"
                    onClick={() => handleRemoverItem(itemEditando.id)}
                    disabled={pedidoBloqueado || removingItemId === itemEditando.id}
                  >
                    {removingItemId === itemEditando.id ? 'Removendo...' : 'Remover item'}
                  </button>
                </span>
              ) : null}
            </div>
          </div>
        </OverlayModal>
      ) : null}

      {modalCancelamentoAberto ? (
        <OverlayModal
          largura="var(--modal-max-w-md, 640px)"
          rotulo="Cancelar pedido"
          onFechar={cancelandoPedido ? undefined : () => setModalCancelamentoAberto(false)}
        >
          <div data-modal="cabecalho" className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>
                Cancelar pedido {codigoPedido}
              </h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
                O histórico será preservado. Se houver título financeiro ou frete com título, o sistema bloqueara a ação.
                Esta acao nao pode ser desfeita.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setModalCancelamentoAberto(false)}
              disabled={cancelandoPedido}
            >
              Fechar
            </button>
          </div>

          <div className="space-y-4 px-4 py-4">
            <FormSecao colunas={1}>
              <CampoForm label="Motivo do cancelamento" obrigatorio tipo="texto-longo">
                <textarea
                  className="input w-full"
                  rows={4}
                  value={cancelamentoPedidoForm.motivo}
                  onChange={(event) => setCancelamentoPedidoForm((current) => ({
                    ...current,
                    motivo: event.target.value
                  }))}
                  placeholder="Explique por que este pedido esta sendo cancelado."
                  disabled={cancelandoPedido}
                />
              </CampoForm>
            </FormSecao>

            <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                Alcance do cancelamento
              </p>
              <div className="mt-3 grid gap-3">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={cancelamentoPedidoForm.cancelar_cotacao}
                    onChange={(event) => setCancelamentoPedidoForm((current) => ({
                      ...current,
                      cancelar_cotacao: event.target.checked
                    }))}
                    disabled={cancelandoPedido}
                  />
                  <span>
                    <strong>Cancelar cotação vinculada</strong>
                    <span className="block text-xs text-[var(--c-muted)]">
                      Marca os links/respostas da cotação como cancelados e evita nova interação no fluxo.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={cancelamentoPedidoForm.cancelar_solicitacao_compra}
                    onChange={(event) => setCancelamentoPedidoForm((current) => ({
                      ...current,
                      cancelar_solicitacao_compra: event.target.checked
                    }))}
                    disabled={cancelandoPedido}
                  />
                  <span>
                    <strong>Cancelar solicitação de compra</strong>
                    <span className="block text-xs text-[var(--c-muted)]">
                      Remove a SC do painel de delegação, mantendo a consulta nas telas historicas.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={cancelamentoPedidoForm.cancelar_solicitacao_principal}
                    onChange={(event) => setCancelamentoPedidoForm((current) => ({
                      ...current,
                      cancelar_solicitacao_principal: event.target.checked
                    }))}
                    disabled={cancelandoPedido}
                  />
                  <span>
                    <strong>Cancelar também a solicitação principal</strong>
                    <span className="block text-xs text-[var(--c-muted)]">
                      Use somente quando a solicitação normal não deve seguir em nenhum outro setor.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div data-modal="rodape" className="app-actionbar justify-end border-t border-[var(--c-border)] px-4 py-3">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setModalCancelamentoAberto(false)}
              disabled={cancelandoPedido}
            >
              Voltar
            </button>
            <span className="app-actionbar-apartada">
              <button
                type="button"
                className="btn btn-outline btn-perigo-suave"
                onClick={confirmarCancelamentoPedido}
                disabled={cancelandoPedido}
              >
                {cancelandoPedido ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </span>
          </div>
        </OverlayModal>
      ) : null}

      {modalFreteAberto ? (
        <OverlayModal
          largura="var(--modal-max-w-lg, 860px)"
          rotulo={freteEditandoId ? 'Editar frete do pedido' : 'Registrar frete do pedido'}
          onFechar={salvandoFrete ? undefined : () => fecharModalFrete()}
        >
          <div data-modal="cabecalho" className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>
                {freteEditandoId ? 'Editar frete do pedido' : 'Registrar frete do pedido'}
              </h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
                {freteEditandoId
                  ? 'A correcao recalcula o rateio e registra auditoria no historico.'
                  : 'O frete sera rateado por valor dos itens. Frete de terceiro cria pendencia para o financeiro.'}
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={() => fecharModalFrete()} disabled={salvandoFrete}>
              Fechar
            </button>
          </div>

          <div className="px-4 py-4">
            {/* Campos de FORMULÁRIO — escrevem o registro do frete (R12). */}
            <FormSecao colunas={3}>
              <CampoForm
                label="Tipo de frete"
                hint={!permiteFreteEmbutido ? 'Pedido fechado aceita somente frete pago a terceiro.' : undefined}
              >
                <select
                  className="input w-full"
                  value={freteForm.tipo}
                  onChange={(event) => atualizarFreteForm({ tipo: event.target.value })}
                  disabled={salvandoFrete || Boolean(freteEditandoId)}
                >
                  {permiteFreteEmbutido ? <option value="EMBUTIDO">Embutido no pedido</option> : null}
                  <option value="TERCEIRO">Pago a terceiro</option>
                </select>
              </CampoForm>

              <CampoForm
                label="Momento"
                hint={!permiteFreteEmbutido ? 'Frete de pedido fechado fica registrado como informado depois.' : undefined}
              >
                <select
                  className="input w-full"
                  value={freteForm.momento}
                  onChange={(event) => atualizarFreteForm({ momento: event.target.value })}
                  disabled={salvandoFrete || !permiteFreteEmbutido || Boolean(freteEditandoId)}
                >
                  {permiteFreteEmbutido ? <option value="FECHAMENTO">No fechamento</option> : null}
                  <option value="POSTERIOR">Informado depois</option>
                </select>
              </CampoForm>

              <CampoForm label="Valor total do frete" obrigatorio>
                <input
                  className="input input-moeda"
                  inputMode="decimal"
                  value={freteForm.valor_total}
                  onChange={(event) => atualizarFreteForm({ valor_total: sanitizeMoneyInput(event.target.value) })}
                  onBlur={(event) => atualizarFreteForm({ valor_total: formatMoneyInput(event.target.value) })}
                  placeholder="R$ 0,00"
                  disabled={salvandoFrete}
                />
              </CampoForm>

              {freteForm.tipo === 'TERCEIRO' ? (
                <CampoForm label="Data de vencimento" obrigatorio>
                  <DateInputBR
                    className="input w-full"
                    value={freteForm.data_vencimento}
                    onChange={(event) => atualizarFreteForm({ data_vencimento: event.target.value })}
                    disabled={salvandoFrete}
                    required
                  />
                </CampoForm>
              ) : null}
            </FormSecao>

            <div className="mt-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">Rateio do frete</div>
                  <p className="mt-1 text-xs text-[var(--c-muted)]">
                    {freteForm.criterio_rateio === 'POR_ITEM'
                      ? 'O valor foi informado por item na cotacao. Ajuste os valores abaixo quando necessario.'
                      : 'O sistema distribui o valor proporcionalmente ao valor dos itens ativos do pedido.'}
                  </p>
                </div>
                <Pilula tom="info">
                  {freteForm.criterio_rateio === 'POR_ITEM' ? 'Informado por item' : 'Proporcional aos itens'}
                </Pilula>
              </div>
              {freteForm.criterio_rateio === 'POR_ITEM' ? (
                <div className="mt-3 grid gap-2">
                  {(freteForm.rateios || []).map((rateio) => (
                    <label
                      key={rateio.pedido_compra_item_id}
                      className="grid items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 sm:grid-cols-3"
                    >
                      <span className="min-w-0 truncate text-xs font-medium sm:col-span-2" title={rateio.descricao}>
                        {rateio.descricao}
                      </span>
                      <input
                        className="input input-moeda text-sm"
                        inputMode="decimal"
                        value={rateio.valor_rateado}
                        onChange={(event) => atualizarRateioFrete(
                          rateio.pedido_compra_item_id,
                          sanitizeMoneyInput(event.target.value)
                        )}
                        onBlur={(event) => atualizarRateioFrete(
                          rateio.pedido_compra_item_id,
                          formatMoneyInput(event.target.value)
                        )}
                        disabled={salvandoFrete}
                        aria-label={`Frete do item ${rateio.descricao}`}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            {freteForm.tipo === 'TERCEIRO' ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                  <div className="font-semibold">Credor/transportador</div>
                  <p className="mt-1 text-xs text-[var(--c-muted)]">
                    Pesquise no cadastro de credores ou informe os dados para cadastro rápido.
                  </p>

                  <div className="relative mt-3" ref={credorFreteRef}>
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        className="input w-full"
                        value={buscaFornecedorFrete}
                        aria-label="Buscar credor do frete"
                        onFocus={() => setListaCredorFreteAberta(true)}
                        onChange={(event) => {
                          setListaCredorFreteAberta(true);
                          setBuscaFornecedorFrete(event.target.value);
                          if (credorFreteSelecionado) {
                            limparCredorFrete();
                            setBuscaFornecedorFrete(event.target.value);
                          }
                        }}
                        placeholder="Buscar credor por nome, CPF/CNPJ, email ou telefone"
                        disabled={salvandoFrete}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setListaCredorFreteAberta(true);
                          handleBuscarFornecedorFrete();
                        }}
                        disabled={buscandoFornecedoresFrete || salvandoFrete}
                      >
                        {buscandoFornecedoresFrete ? 'Buscando...' : 'Buscar'}
                      </button>
                    </div>

                    {credorFreteSelecionado ? (
                      <div
                        className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm"
                        style={{ background: 'var(--sem-success-bg)', color: 'var(--sem-success)' }}
                      >
                        <span className="font-semibold">{formatarCredorFrete(credorFreteSelecionado)}</span>
                        <button type="button" className="btn btn-outline" onClick={limparCredorFrete} disabled={salvandoFrete}>
                          Trocar
                        </button>
                      </div>
                    ) : null}

                    {!credorFreteSelecionado && listaCredorFreteAberta && fornecedoresFrete.length ? (
                      <div className="absolute left-0 right-0 top-full z-dropdown mt-2 max-h-64 overflow-y-auto rounded-xl border border-[var(--c-border)] bg-[var(--ui-surface)] shadow-xl">
                        {fornecedoresFrete.map((credor) => (
                          <button
                            key={`${credor.origem_frete || 'credor'}:${credor.id}`}
                            type="button"
                            className="block w-full border-b border-[var(--c-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--c-surface)]"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selecionarCredorFrete(credor)}
                            disabled={salvandoFrete}
                          >
                            <span className="block font-semibold text-[var(--c-text)]">{formatarCredorFrete(credor)}</span>
                            <span className="block text-xs text-[var(--c-muted)]">
                              {credor.email || 'Sem e-mail'} {credor.telefone ? `- ${maskPhone(credor.telefone)}` : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {!freteForm.fornecedor_compra_id && !freteForm.parceiro_id ? (
                  <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                    <div className="font-semibold">Cadastro rápido do credor/transportador</div>
                    <FormSecao colunas={2}>
                      <CampoForm label="Nome do fornecedor">
                        <input
                          className="input w-full"
                          value={freteForm.novo_fornecedor.nome}
                          onChange={(event) => atualizarNovoFornecedorFrete({ nome: event.target.value })}
                          placeholder="Nome do fornecedor"
                          disabled={salvandoFrete}
                        />
                      </CampoForm>
                      <CampoForm label="CPF/CNPJ">
                        <input
                          className="input w-full"
                          value={freteForm.novo_fornecedor.cpf_cnpj}
                          onChange={(event) => atualizarNovoFornecedorFrete({ cpf_cnpj: maskCpfCnpj(event.target.value) })}
                          onBlur={(event) => {
                            if (event.target.value && !isValidCpfCnpj(event.target.value)) {
                              avisar.alerta('CPF/CNPJ inválido para o credor/transportador.');
                            }
                          }}
                          placeholder="CPF/CNPJ"
                          disabled={salvandoFrete}
                        />
                      </CampoForm>
                      <CampoForm label="WhatsApp/telefone">
                        <input
                          className="input w-full"
                          value={freteForm.novo_fornecedor.whatsapp}
                          onChange={(event) => atualizarNovoFornecedorFrete({ whatsapp: maskPhone(event.target.value) })}
                          placeholder="WhatsApp/telefone"
                          disabled={salvandoFrete}
                        />
                      </CampoForm>
                      <CampoForm label="Email">
                        <input
                          className="input w-full"
                          type="email"
                          value={freteForm.novo_fornecedor.email}
                          onChange={(event) => atualizarNovoFornecedorFrete({ email: event.target.value.trim().toLowerCase() })}
                          onBlur={(event) => {
                            if (event.target.value && !isValidEmail(event.target.value)) {
                              avisar.alerta('E-mail inválido para o credor/transportador.');
                            }
                          }}
                          placeholder="Email"
                          disabled={salvandoFrete}
                        />
                      </CampoForm>
                      <CampoForm label="Contato" span={2}>
                        <input
                          className="input w-full"
                          value={freteForm.novo_fornecedor.contato}
                          onChange={(event) => atualizarNovoFornecedorFrete({ contato: event.target.value })}
                          placeholder="Contato"
                          disabled={salvandoFrete}
                        />
                      </CampoForm>
                    </FormSecao>
                  </div>
                ) : null}

                <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                  <div className="font-semibold">Dados para pagamento do frete</div>
                  <FormSecao colunas={2}>
                    <CampoForm label="Tipo de chave PIX">
                      <select
                        className="input w-full"
                        value={freteForm.dados_pagamento.tipo_chave_pix}
                        onChange={(event) => atualizarDadosPagamentoFrete({
                          tipo_chave_pix: event.target.value,
                          pix: maskPixKey(freteForm.dados_pagamento.pix, event.target.value)
                        })}
                        disabled={salvandoFrete}
                      >
                        <option value="CPF">Chave CPF</option>
                        <option value="CNPJ">Chave CNPJ</option>
                        <option value="TELEFONE">Chave telefone</option>
                        <option value="EMAIL">Chave e-mail</option>
                        <option value="ALEATORIA">Chave aleatoria</option>
                      </select>
                    </CampoForm>
                    <CampoForm label="Chave PIX">
                      <input
                        className="input w-full"
                        value={freteForm.dados_pagamento.pix}
                        onChange={(event) => atualizarDadosPagamentoFrete({
                          pix: maskPixKey(event.target.value, freteForm.dados_pagamento.tipo_chave_pix)
                        })}
                        placeholder="Chave PIX"
                        disabled={salvandoFrete}
                      />
                    </CampoForm>
                    <CampoForm label="Favorecido">
                      <input
                        className="input w-full"
                        value={freteForm.dados_pagamento.favorecido}
                        onChange={(event) => atualizarDadosPagamentoFrete({ favorecido: event.target.value })}
                        placeholder="Favorecido"
                        disabled={salvandoFrete}
                      />
                    </CampoForm>
                    <CampoForm label="CPF/CNPJ do favorecido">
                      <input
                        className="input w-full"
                        value={freteForm.dados_pagamento.documento}
                        onChange={(event) => atualizarDadosPagamentoFrete({ documento: maskCpfCnpj(event.target.value) })}
                        onBlur={(event) => {
                          if (event.target.value && !isValidCpfCnpj(event.target.value)) {
                            avisar.alerta('CPF/CNPJ inválido para o favorecido.');
                          }
                        }}
                        placeholder="CPF/CNPJ do favorecido"
                        disabled={salvandoFrete}
                      />
                    </CampoForm>
                    <CampoForm label="Banco">
                      <input
                        className="input w-full"
                        value={freteForm.dados_pagamento.banco}
                        onChange={(event) => atualizarDadosPagamentoFrete({ banco: event.target.value })}
                        placeholder="Banco"
                        disabled={salvandoFrete}
                      />
                    </CampoForm>
                    <CampoForm label="Agência">
                      <input
                        className="input w-full"
                        value={freteForm.dados_pagamento.agencia}
                        onChange={(event) => atualizarDadosPagamentoFrete({ agencia: event.target.value })}
                        placeholder="Agência"
                        disabled={salvandoFrete}
                      />
                    </CampoForm>
                    <CampoForm label="Conta">
                      <input
                        className="input w-full"
                        value={freteForm.dados_pagamento.conta}
                        onChange={(event) => atualizarDadosPagamentoFrete({ conta: event.target.value })}
                        placeholder="Conta"
                        disabled={salvandoFrete}
                      />
                    </CampoForm>
                    <CampoForm label="Observações para o financeiro" tipo="texto-longo">
                      <textarea
                        className="input w-full"
                        rows={3}
                        value={freteForm.dados_pagamento.observacoes}
                        onChange={(event) => atualizarDadosPagamentoFrete({ observacoes: event.target.value })}
                        placeholder="Observações para o financeiro"
                        disabled={salvandoFrete}
                      />
                    </CampoForm>
                  </FormSecao>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <FormSecao colunas={1}>
                <CampoForm label="Observações do frete" tipo="texto-longo">
                  <textarea
                    className="input w-full"
                    rows={3}
                    value={freteForm.observacoes}
                    onChange={(event) => atualizarFreteForm({ observacoes: event.target.value })}
                    placeholder="Ex.: frete embutido na negociação ou frete pago diretamente a transportador."
                    disabled={salvandoFrete}
                  />
                </CampoForm>
              </FormSecao>
            </div>
          </div>

          <div data-modal="rodape" className="app-actionbar justify-end border-t border-[var(--c-border)] px-4 py-3">
            <button type="button" className="btn btn-outline" onClick={() => fecharModalFrete()} disabled={salvandoFrete}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={handleRegistrarFrete} disabled={salvandoFrete}>
              {salvandoFrete ? 'Salvando...' : freteEditandoId ? 'Salvar correcao' : 'Registrar frete'}
            </button>
          </div>
        </OverlayModal>
      ) : null}

      <CompraPreviewModal preview={previewPedido} onClose={() => setPreviewPedido(null)} />
      {elementoConfirmacao}
    </Pagina>
  );
}
