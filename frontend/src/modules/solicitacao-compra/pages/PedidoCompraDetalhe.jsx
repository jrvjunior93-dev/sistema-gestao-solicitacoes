import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  removerItemPedidoCompra,
  remanejarItemPedidoCompra,
  uploadAnexoTemporarioCompra
} from '../../../services/compras';
import { getStatusPedidosCompra } from '../../../services/configuracoesSistema';
import { buscarParceiros } from '../../../services/parceiros';
import { useAuth } from '../../../contexts/AuthContext';
import {
  canAlterarStatusComprasPedidos,
  canCancelarComprasPedidos,
  canCancelarFreteComprasPedidos,
  canEditarItensComprasPedidos,
  canReabrirComprasPedidos,
  canRegistrarFreteComprasPedidos,
  canRemanejarComprasPedidos,
  isBusinessAdmin
} from '../../../utils/acessoProduto';
import { useSafeNavigateBack } from '../../../utils/navigation';
import { isValidCpfCnpj, maskCpfCnpj, maskPhone, onlyDigits } from '../../../utils/formatters';
import CompraPreviewModal from '../components/CompraPreviewModal';

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

function getVariationTextClass(value) {
  if (value === null || value === undefined || Math.abs(value) < 0.005) {
    return 'text-[var(--c-muted)]';
  }

  return value > 0 ? 'text-red-600' : 'text-emerald-700';
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
    return {
      label: 'Removido',
      className: 'app-status-pill bg-slate-100 text-slate-700'
    };
  }

  if (isItemAbaixoMinimo(item)) {
    return {
      label: 'Atencao',
      className: 'app-status-pill bg-amber-100 text-amber-700'
    };
  }

  return {
    label: 'Ativo',
    className: 'app-status-pill bg-emerald-100 text-emerald-700'
  };
}

export default function PedidoCompraDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const navigateBack = useSafeNavigateBack('/pedidos-compra');
  const { user } = useAuth();
  const businessAdmin = isBusinessAdmin(user);
  const podeEditarItensPedido = canEditarItensComprasPedidos(user);
  const podeAlterarStatusPedido = canAlterarStatusComprasPedidos(user);
  const podeCancelarPedido = canCancelarComprasPedidos(user);
  const podeReabrirPedido = canReabrirComprasPedidos(user);
  const podeRegistrarFretePedido = canRegistrarFreteComprasPedidos(user);
  const podeCancelarFretePedido = canCancelarFreteComprasPedidos(user);
  const podeRemanejarPedido = canRemanejarComprasPedidos(user);
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
  const [filtroItens, setFiltroItens] = useState('ATIVOS');
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
  const [buscandoFornecedoresFrete, setBuscandoFornecedoresFrete] = useState(false);
  const itemSelecionadoId = itemEditandoId;
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
      if (String(data?.status || '').toUpperCase() === 'CANCELADO') {
        setFiltrosItens({ situacao: new Set() });
      }

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
      alert(error.message || 'Erro ao carregar pedido de compra');
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

    return (pedido?.itens || []).filter((item) => {
      if (filtroItens === 'ATIVOS' && item.removido) {
        return false;
      }
      if (filtroItens === 'ATENCAO' && !isItemAbaixoMinimo(item)) {
        return false;
      }
      if (filtroItens === 'REMOVIDOS' && !item.removido) {
        return false;
      }
      if (filtroItens === 'TODOS') {
        // sem filtro adicional
      }

      if (!termo) {
        return true;
      }

      return buildItemSearchText(item).includes(termo);
    });
  }, [buscaItensDeferred, filtroItens, pedido]);
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
  const remanejamentoBloqueado = Boolean(!podeRemanejarPedido || (edicaoBloqueadaPorStatus && !pedidoCancelado));
  const podeReabrirCotacao = Boolean(podeReabrirPedido && edicaoBloqueadaPorStatus && !pedidoCancelado);
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

    navigate(`/relatorios/administrativos?${params.toString()}`);
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
      alert('Este frete nao pode ser editado porque ja foi cancelado ou possui titulo financeiro vinculado.');
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
      alert(error.message || 'Erro ao buscar credores de frete');
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
      alert('Informe o valor do frete.');
      return;
    }

    const tipo = String(freteForm.tipo || '').toUpperCase();
    if (tipo === 'EMBUTIDO' && !permiteFreteEmbutido) {
      alert('Pedido fechado aceita apenas frete pago a terceiro.');
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
        alert('A soma do frete informado nos itens precisa ser igual ao valor total do frete.');
        return;
      }
      payload.rateios = rateios;
    }

    if (tipo === 'TERCEIRO') {
      if (!freteForm.data_vencimento) {
        alert('Informe a data de vencimento do frete pago a terceiro.');
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
          alert('Informe o nome do credor/transportador.');
          return;
        }
        if (!isValidCpfCnpj(novoFornecedor.cpf_cnpj)) {
          alert('Informe um CPF/CNPJ valido para o credor/transportador.');
          return;
        }
        if (!String(novoFornecedor.whatsapp || '').trim()) {
          alert('Informe o telefone do credor/transportador.');
          return;
        }
        if (!isValidEmail(novoFornecedor.email)) {
          alert('Informe um e-mail valido para o credor/transportador.');
          return;
        }
        payload.novo_fornecedor = {
          ...novoFornecedor,
          cpf_cnpj: onlyDigits(novoFornecedor.cpf_cnpj),
          whatsapp: onlyDigits(novoFornecedor.whatsapp),
          telefone: onlyDigits(novoFornecedor.whatsapp)
        };
      } else {
        alert('Selecione ou cadastre o fornecedor/transportador do frete.');
        return;
      }

      if (dadosPagamento.documento && !isValidCpfCnpj(dadosPagamento.documento)) {
        alert('Informe um CPF/CNPJ valido para o favorecido.');
        return;
      }
      if (String(dadosPagamento.tipo_chave_pix || '').toUpperCase() === 'EMAIL' && dadosPagamento.pix && !isValidEmail(dadosPagamento.pix)) {
        alert('Informe uma chave PIX de e-mail valida.');
        return;
      }
      if (['CPF', 'CNPJ'].includes(String(dadosPagamento.tipo_chave_pix || '').toUpperCase()) && dadosPagamento.pix && !isValidCpfCnpj(dadosPagamento.pix)) {
        alert('Informe uma chave PIX CPF/CNPJ valida.');
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
      fecharModalFrete(true);
      alert(freteEditandoId
        ? 'Frete atualizado com auditoria registrada.'
        : tipo === 'TERCEIRO'
        ? 'Frete registrado e pendencia criada para o financeiro.'
        : 'Frete embutido registrado para rateio de custo.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao registrar frete do pedido');
    } finally {
      setSalvandoFrete(false);
    }
  }

  async function handleCancelarFrete(frete) {
    if (!fretePermiteCancelamento(frete)) {
      alert('Este frete nao pode ser cancelado porque ja foi cancelado ou possui titulo financeiro vinculado.');
      return;
    }

    const motivo = window.prompt('Informe o motivo do cancelamento do frete:');
    if (!motivo || !motivo.trim()) {
      return;
    }

    try {
      setSalvandoFrete(true);
      const data = await cancelarFretePedidoCompra(id, frete.id, { motivo: motivo.trim() });
      setPedido(data || null);
      alert('Frete cancelado com auditoria registrada.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao cancelar frete do pedido');
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
      alert('Item atualizado com auditoria registrada.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao atualizar item do pedido');
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleAdicionarResposta(respostaItemId) {
    try {
      setAddingRespostaId(respostaItemId);
      const data = await adicionarItemPedidoCompra(id, { resposta_item_id: respostaItemId });
      setPedido(data || null);
      alert('Item adicionado ao pedido.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao adicionar item ao pedido');
    } finally {
      setAddingRespostaId(null);
    }
  }

  async function handleRemoverItem(itemId) {
    try {
      setRemovingItemId(itemId);
      const data = await removerItemPedidoCompra(id, itemId);
      setPedido(data || null);
      fecharModalEdicao();
      alert('Item removido do pedido.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao remover item do pedido');
    } finally {
      setRemovingItemId(null);
    }
  }

  async function handleAtualizarStatus(status) {
    if (!status || status === pedido?.status) {
      return;
    }

    if (String(status).toUpperCase() === 'CANCELADO') {
      await handleCancelarPedido();
      return;
    }

    try {
      setSavingStatus(true);
      const data = await atualizarStatusPedidoCompra(id, { status });
      setPedido(data || null);
      alert('Status do pedido atualizado com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao atualizar status do pedido');
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleReabrirCotacao() {
    const confirmou = window.confirm(
      'Reabrir este pedido para edicao ou cancelamento? A cotacao vinculada voltara para edicao e a acao ficara registrada no historico.'
    );
    if (!confirmou) return;

    const motivo = window.prompt('Informe o motivo para reabrir este pedido para edicao ou cancelamento.');
    if (motivo === null) return;

    const motivoNormalizado = motivo.trim();
    if (!motivoNormalizado) {
      alert('Informe o motivo da reabertura.');
      return;
    }

    try {
      setReabrindoCotacao(true);
      const data = await reabrirPedidoCompraParaCotacao(id, { motivo: motivoNormalizado });
      setPedido(data || null);
      alert('Pedido reaberto para edicao ou cancelamento.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao reabrir pedido');
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
      alert(error.message || 'Erro ao baixar PDF do pedido');
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
      alert(error.message || 'Erro ao visualizar PDF do pedido');
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
        alert('PDF baixado. Cadastre o WhatsApp do fornecedor para abrir o envio automaticamente.');
      }
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao preparar envio do pedido');
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

  async function handleCancelarPedido() {
    setCancelamentoPedidoForm({
      motivo: '',
      cancelar_cotacao: true,
      cancelar_solicitacao_compra: true,
      cancelar_solicitacao_principal: false
    });
    setModalCancelamentoAberto(true);
  }

  async function confirmarCancelamentoPedido() {
    const motivoNormalizado = String(cancelamentoPedidoForm.motivo || '').trim();
    if (!motivoNormalizado) {
      alert('Informe o motivo do cancelamento do pedido.');
      return;
    }

    try {
      setCancelandoPedido(true);
      const data = await cancelarPedidoCompra(id, {
        motivo: motivoNormalizado,
        cancelar_cotacao: cancelamentoPedidoForm.cancelar_cotacao,
        cancelar_solicitacao_compra: cancelamentoPedidoForm.cancelar_solicitacao_compra,
        cancelar_solicitacao_principal: cancelamentoPedidoForm.cancelar_solicitacao_principal
      });
      setPedido(data || null);
      setModalCancelamentoAberto(false);
      alert('Cancelamento registrado. O historico da solicitacao foi atualizado.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao cancelar pedido');
    } finally {
      setCancelandoPedido(false);
    }
  }

  async function handleCancelarItensSelecionados() {
    if (!itensSelecionadosCancelamento.length) {
      alert('Selecione ao menos um item ativo para cancelar.');
      return;
    }

    const motivo = window.prompt('Informe o motivo do cancelamento dos itens selecionados.');
    if (motivo === null) return;

    try {
      setCancelandoItens(true);
      const data = await cancelarItensPedidoCompra(id, {
        item_ids: itensSelecionadosCancelamento,
        motivo
      });
      setPedido(data || null);
      setItensSelecionadosCancelamento([]);
      alert('Itens cancelados. As quantidades ficam disponiveis para remanejamento na cotacao.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao cancelar itens');
    } finally {
      setCancelandoItens(false);
    }
  }

  async function handleSalvarComentarioPedido() {
    if (!comentarioPedido.trim()) {
      alert('Digite o comentario do pedido.');
      return;
    }

    try {
      setSalvandoComentario(true);
      await comentarPedidoCompra(id, { comentario: comentarioPedido });
      setComentarioPedido('');
      alert('Comentario registrado no pedido e no historico da solicitacao.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao registrar comentario');
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
      alert('Espelho anexado ao pedido e ao historico da solicitacao.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao anexar espelho do fornecedor');
    } finally {
      setAnexandoEspelho(false);
    }
  }

  async function handleRemanejarItemAtual() {
    if (!itemEditando) return;
    if (!remanejoSelecionado) {
      alert('Selecione o fornecedor/resposta de destino.');
      return;
    }

    const quantidadeMaxima = Number(
      itemEditando.quantidade_disponivel_remanejamento ?? itemEditando.quantidade_pedido ?? 0
    );
    const candidatoDestino = (pedido.candidatos_remanejamento || []).find(
      (candidato) => Number(candidato.resposta_item_id) === Number(remanejoSelecionado)
    );
    const saldoFornecedorDestino = Number(candidatoDestino?.saldo_disponivel_fornecedor || 0);
    const quantidadeMaximaEfetiva = Math.min(quantidadeMaxima, saldoFornecedorDestino);
    const quantidadeInformada = remanejoQuantidade
      ? parseBrazilianQuantity(remanejoQuantidade)
      : quantidadeMaxima;

    if (quantidadeInformada <= 0) {
      alert('Informe uma quantidade maior que zero para remanejar.');
      return;
    }

    if (quantidadeInformada > quantidadeMaximaEfetiva) {
      alert(`A quantidade remanejada nao pode ser maior que ${formatQuantityLabel(quantidadeMaximaEfetiva, itemEditando.unidade)}. Esse limite considera o item de origem e o saldo atual do fornecedor de destino.`);
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
      alert('Item remanejado para o fornecedor selecionado.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao remanejar item');
    } finally {
      setRemanejandoItem(false);
    }
  }

  if (loading) {
    return (
      <div className="page solicitacoes-page">
        <div className="app-empty-card sol-surface-card">Carregando...</div>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="page solicitacoes-page">
        <div className="app-empty-card sol-surface-card">Pedido de compra nao encontrado.</div>
      </div>
    );
  }

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
        Number(itemEditando.quantidade_disponivel_remanejamento ?? itemEditando.quantidade_pedido ?? 0),
        Number(
          candidatoRemanejamentoSelecionado?.saldo_disponivel_fornecedor
          ?? itemEditando.quantidade_disponivel_remanejamento
          ?? itemEditando.quantidade_pedido
          ?? 0
        )
      )
    : 0;

  return (
    <div className="page solicitacoes-page">
      <div className="card sol-surface-card app-toolbar-card">
        <div className="app-page-header-row">
          <div>
            <h1 className="page-title">Pedido de Compra</h1>
            <p className="page-subtitle">
              PC-{String(pedido.id).padStart(5, '0')} - gestao de itens em lista compacta, edicao em modal e auditoria
              dedicada no painel administrativo.
            </p>
          </div>
          <div className="app-page-actions items-end">
            <div className="min-w-[260px]">
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-[var(--c-muted)]">
                Status do pedido
              </label>
              <select
                className="input"
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
            </div>
            {businessAdmin ? (
              <button type="button" className="btn btn-outline" onClick={() => abrirAuditoria()}>
                Painel de auditoria
              </button>
            ) : null}
            <button type="button" className="btn btn-outline" onClick={handleVisualizarPdf} disabled={visualizandoPdf}>
              {visualizandoPdf ? 'Abrindo pedido...' : 'Ver pedido'}
            </button>
            <button type="button" className="btn btn-outline" onClick={handleBaixarPdf} disabled={baixandoPdf}>
              {baixandoPdf ? 'Gerando PDF...' : 'Baixar PDF'}
            </button>
            {!pedidoCancelado ? (
              <button type="button" className="btn btn-primary" onClick={handleEnviarPedido} disabled={enviandoPedido}>
                {enviandoPedido ? 'Preparando envio...' : 'Enviar pedido'}
              </button>
            ) : null}
            {podeReabrirCotacao ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleReabrirCotacao}
                disabled={reabrindoCotacao}
              >
                {reabrindoCotacao ? 'Reabrindo...' : 'Reabrir pedido'}
              </button>
            ) : null}
            {podeCancelarPedido ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCancelarPedido}
                disabled={pedidoCancelado || cancelandoPedido}
              >
                {cancelandoPedido ? 'Cancelando...' : 'Cancelar pedido'}
              </button>
            ) : null}
            <button type="button" className="btn btn-outline" onClick={() => navigateBack('/pedidos-compra')}>
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => navigate(`/solicitacoes-compra/${pedido.solicitacao_compra_id}`)}
            >
              Abrir solicitacao
            </button>
          </div>
        </div>
      </div>

      {!podeGerenciarPedido ? (
        <div className="app-alert mt-4">
          Voce esta visualizando este pedido. Alteracoes de status e itens ficam restritas ao setor de compras.
        </div>
      ) : null}

      {edicaoBloqueadaPorStatus ? (
        <div className="app-alert mt-4">
          {pedido.edicao_bloqueada_motivo === 'COTACAO_ENCERRADA'
            ? 'Este pedido foi criado antes do fechamento automatico e esta vinculado a uma cotacao ja encerrada. Reabra o pedido para editar itens ou cancelar.'
            : `O status atual do pedido bloqueia edicao. Enquanto ele estiver em "${formatStatusLabel(pedido.status, statusMap)}", os itens nao poderao ser alterados, adicionados ou removidos.`}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <div className="card sol-surface-card">
            <div className="card-header">
              <h2 className="font-semibold">Resumo</h2>
            </div>
            <div className="grid gap-3 text-sm">
              <div>
                <div className="text-[var(--c-muted)]">Fornecedor</div>
                <div className="font-semibold">{pedido.fornecedor?.nome || '-'}</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Status</div>
                <div className="font-semibold" style={{ color: statusAtual?.cor || undefined }}>
                  {formatStatusLabel(pedido.status, statusMap)}
                </div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Obra</div>
                <div className="font-semibold">{pedido.obra?.nome || '-'}</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Solicitacao</div>
                <div className="font-semibold">
                  SC-{String(pedido.solicitacao_compra_id).padStart(5, '0')}
                </div>
              </div>
              {pedido.fechamento ? (
                <div>
                  <div className="text-[var(--c-muted)]">Rodada de fechamento</div>
                  <div className="font-semibold">
                    {pedido.fechamento.numero_rodada} - {String(pedido.fechamento.tipo || '').toLowerCase()}
                  </div>
                  {Number(pedido.fechamento.quantidade_excedente || 0) > 0 ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <div className="font-semibold">
                        Quantidade excedente autorizada: {formatQuantityLabel(pedido.fechamento.quantidade_excedente)}
                      </div>
                      <div className="mt-1">Justificativa: {pedido.fechamento.justificativa_excedente || '-'}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div>
                <div className="text-[var(--c-muted)]">Total da aquisicao</div>
                <div className="font-semibold">{formatMoney(pedido.valor_total)}</div>
                <div className="text-xs text-[var(--c-muted)]">Itens, tributos, DIFAL e fretes</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Total devido ao fornecedor</div>
                <div className="font-semibold">{formatMoney(pedido.valor_total_fornecedor ?? pedido.valor_total)}</div>
                <div className="text-xs text-[var(--c-muted)]">Frete de terceiro fica separado</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Mercadorias</div>
                <div className="font-semibold">{formatMoney(pedido.valor_mercadorias)}</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">IPI + ICMS + ST</div>
                <div className="font-semibold">{formatMoney(pedido.valor_tributos)}</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">DIFAL rateado</div>
                <div className="font-semibold">{formatMoney(pedido.difal_total)}</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Frete deste pedido</div>
                <div className="font-semibold">
                  {pedido.frete_tipo_cotacao === 'SEM_FRETE'
                    ? 'Sem frete'
                    : `${pedido.frete_tipo_cotacao === 'TERCEIRO' ? 'Pago a terceiro' : 'Embutido'} - ${formatMoney(pedido.frete_total ?? pedido.frete_valor_cotacao)}`}
                </div>
                {pedido.frete_tipo_cotacao !== 'SEM_FRETE' ? (
                  <div className="text-xs text-[var(--c-muted)]">
                    Lancamento {pedido.frete_modo_cotacao === 'POR_ITEM' ? 'por item' : 'global'}
                  </div>
                ) : null}
                {pedido.frete_data_vencimento ? (
                  <div className="text-xs text-[var(--c-muted)]">Vencimento: {formatDate(pedido.frete_data_vencimento)}</div>
                ) : null}
                {pedido.frete_transportador_nome || pedido.frete_transportador_cpf_cnpj ? (
                  <div className="text-xs text-[var(--c-muted)]">
                    Transportador: {pedido.frete_transportador_nome || 'Nao informado'}
                    {pedido.frete_transportador_cpf_cnpj ? ` - ${pedido.frete_transportador_cpf_cnpj}` : ''}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Itens ativos</div>
                <div className="font-semibold">{itensAtivos.length}</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Pedido minimo do fornecedor</div>
                <div className="font-semibold">
                  {pedido.valor_minimo_pedido ? formatMoney(pedido.valor_minimo_pedido) : '-'}
                </div>
                {!pedido.atingiu_pedido_minimo ? (
                  <div className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    O valor atual ainda nao atinge o pedido minimo informado pelo fornecedor.
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Condicao de pagamento</div>
                <div className="break-words font-semibold">{pedido.condicao_pagamento || '-'}</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Criado por</div>
                <div className="font-semibold">{pedido.criador?.nome || '-'}</div>
              </div>
            </div>
          </div>

          <div className="card sol-surface-card">
            <div className="card-header flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Fretes do pedido</h2>
                <p className="text-xs text-[var(--c-muted)]">
                  Custo rateado nos itens para acompanhamento da obra.
                </p>
              </div>
              {podeRegistrarFretePedido && !pedidoCancelado ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => abrirModalFrete('FECHAMENTO')}
                  disabled={salvandoFrete}
                >
                  Registrar frete
                </button>
              ) : null}
            </div>

            <div className="grid gap-3 text-sm">
              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                <div className="text-[var(--c-muted)]">Total de frete rateado</div>
                <div className="mt-1 text-lg font-semibold">{formatMoney(totalFretesPedido)}</div>
                {fretesPendentesFinanceiro.length ? (
                  <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {fretesPendentesFinanceiro.length} frete(s) aguardando geracao de titulo pelo financeiro.
                  </div>
                ) : null}
              </div>

              {fretesPedido.length ? (
                <div className="app-list-stack">
                  {fretesPedido.map((frete) => (
                    <div key={frete.id} className="app-list-card">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">
                          {String(frete.tipo || '').replace(/_/g, ' ')}
                        </div>
                        <span className={`app-status-pill ${
                          String(frete.status_financeiro || '').toUpperCase() === 'CANCELADO'
                            ? 'bg-slate-100 text-slate-600'
                            : String(frete.status_financeiro || '').toUpperCase() === 'PENDENTE_TITULO'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {String(frete.status_financeiro || 'REGISTRADO').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="mt-1 font-semibold">{formatMoney(frete.valor_total)}</div>
                      <div className="mt-1 text-xs text-[var(--c-muted)]">
                        {frete.fornecedor?.nome || frete.parceiro?.nome ? `${frete.fornecedor?.nome || frete.parceiro?.nome} - ` : ''}
                        {frete.rateios?.length || 0} item(ns) com frete · {frete.criterio_rateio === 'POR_ITEM' ? 'valor informado por item' : 'rateio proporcional'}
                        {frete.data_vencimento ? ` - vence em ${formatDate(frete.data_vencimento)}` : ''}
                      </div>
                      {frete.tituloFinanceiro?.id ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                            Titulo gerado
                          </span>
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
                              className="btn btn-outline !py-1 text-xs"
                              onClick={() => abrirEdicaoFrete(frete)}
                              disabled={salvandoFrete}
                            >
                              Editar frete
                            </button>
                          ) : null}
                          {fretePermiteCancelamento(frete) ? (
                            <button
                              type="button"
                              className="btn btn-outline !py-1 text-xs text-red-600"
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
                <div className="app-empty-card py-5 text-sm">
                  Nenhum frete registrado para este pedido.
                </div>
              )}
            </div>
          </div>

          {podeEditarItensPedido ? (
            <div className="card sol-surface-card">
              <div className="card-header">
                <h2 className="font-semibold">Historico operacional</h2>
              </div>
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-medium">
                  Comentario do pedido
                  <textarea
                    className="input min-h-[110px]"
                    value={comentarioPedido}
                    onChange={(event) => setComentarioPedido(event.target.value)}
                    placeholder="Registre alinhamentos, pendencias ou informacoes para a obra."
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-outline justify-center"
                  onClick={handleSalvarComentarioPedido}
                  disabled={salvandoComentario || !comentarioPedido.trim()}
                >
                  {salvandoComentario ? 'Registrando...' : 'Registrar comentario'}
                </button>

                <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-sm">
                  <div className="font-semibold">Espelho do pedido do fornecedor</div>
                  <p className="mt-1 text-xs text-[var(--c-muted)]">
                    Anexe aqui o comprovante/espelho enviado pelo fornecedor. Ele tambem aparece no historico da solicitacao.
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
              </div>
            </div>
          ) : null}

          {podeEditarItensPedido ? (
            <div className="card sol-surface-card">
              <div className="card-header">
                <h2 className="font-semibold">Itens cotados disponiveis</h2>
              </div>
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
                  Todos os itens cotados desse fornecedor ja foram usados ou nao ha respostas adicionais disponiveis.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4">
          <div className="card sol-surface-card">
            <div className="card-header flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Itens do pedido</h2>
                <p className="text-sm text-[var(--c-muted)]">
                  Filtros no topo, linhas compactas para escala e edicao concentrada em modal.
                </p>
              </div>
              <span className="text-sm text-[var(--c-muted)]">
                {itensFiltrados.length} visivel(is) de {resumoItens.total} item(ns)
              </span>
            </div>

            <div className="solicitacoes-filtros app-filters-card rounded-xl p-4">
              <div className="app-filters-grid">
                <label className="app-filter-field">
                  <span className="app-filter-label">Buscar item</span>
                  <input
                    className="input"
                    value={buscaItens}
                    onChange={(event) => setBuscaItens(event.target.value)}
                    placeholder="Descricao, origem ou unidade"
                  />
                </label>

                <label className="app-filter-field">
                  <span className="app-filter-label">Situacao</span>
                  <select
                    className="input"
                    value={filtroItens}
                    onChange={(event) => setFiltroItens(event.target.value)}
                  >
                    <option value="ATIVOS">Ativos</option>
                    <option value="ATENCAO">Atencao</option>
                    <option value="REMOVIDOS">Removidos</option>
                    <option value="TODOS">Todos</option>
                  </select>
                </label>
              </div>

              <div className="app-page-actions justify-end">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setBuscaItens('');
                    setFiltroItens('ATIVOS');
                  }}
                >
                  Limpar filtros
                </button>
                {businessAdmin ? (
                  <button type="button" className="btn btn-outline" onClick={() => abrirAuditoria()}>
                    Auditoria do pedido
                  </button>
                ) : null}
                {podeCancelarPedido ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleCancelarItensSelecionados}
                    disabled={pedidoBloqueado || cancelandoItens || itensSelecionadosCancelamento.length === 0}
                  >
                    {cancelandoItens ? 'Cancelando...' : `Cancelar itens (${itensSelecionadosCancelamento.length})`}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 app-summary-grid">
              <div className="app-summary-card">
                <span className="app-summary-label">Ativos</span>
                <strong className="app-summary-value">{resumoItens.ativos}</strong>
                <span className="app-summary-subvalue">Itens operacionais</span>
              </div>
              <div className="app-summary-card">
                <span className="app-summary-label">Atencao</span>
                <strong className="app-summary-value">{resumoItens.atencao}</strong>
                <span className="app-summary-subvalue">Abaixo do minimo</span>
              </div>
              <div className="app-summary-card">
                <span className="app-summary-label">Removidos</span>
                <strong className="app-summary-value">{resumoItens.removidos}</strong>
                <span className="app-summary-subvalue">Mantidos para historico</span>
              </div>
              <div className="app-summary-card">
                <span className="app-summary-label">Valor total</span>
                <strong className="app-summary-value">{formatMoney(pedido.valor_total)}</strong>
                <span className="app-summary-subvalue">Total da aquisicao com frete</span>
              </div>
            </div>

            {itensFiltrados.length ? (
              <div className="mt-4 app-table-shell compras-responsive-table">
                <table className="table min-w-[900px]">
                  <thead>
                    <tr>
                      {podeCancelarPedido ? <th className="w-10">Sel.</th> : null}
                      <th>Item</th>
                      <th>Origem</th>
                      <th>Solicitado</th>
                      <th>Pedido</th>
                      <th>Itens</th>
                      <th>Frete</th>
                      <th>Total aquisicao</th>
                      <th>Situacao</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensFiltrados.map((item) => {
                      const situacao = getItemSituacao(item);
                      const precoContext = buildItemPriceContext(item);

                      return (
                        <tr key={item.id} className={item.removido ? 'opacity-80' : ''}>
                          {podeCancelarPedido ? (
                            <td>
                              <input
                                type="checkbox"
                                checked={itensSelecionadosCancelamento.includes(item.id)}
                                disabled={item.removido || pedidoBloqueado}
                                onChange={() => toggleItemCancelamento(item.id)}
                              />
                            </td>
                          ) : null}
                          <td>
                            <div className="font-medium">{item.descricao}</div>
                            <div className="text-xs text-[var(--c-muted)]">
                              Minimo: {formatQuantityLabel(item.quantidade_minima_item, item.unidade)}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--c-muted)]">
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
                            </div>
                          </td>
                          <td>{item.origem || '-'}</td>
                          <td>{formatQuantityLabel(item.quantidade_solicitada, item.unidade)}</td>
                          <td>{formatQuantityLabel(item.quantidade_pedido, item.unidade)}</td>
                          <td>{formatMoney(item.valor_total)}</td>
                          <td>{formatMoney(item.frete_rateado)}</td>
                          <td>{formatMoney(Number(item.valor_total || 0) + Number(item.frete_rateado || 0))}</td>
                          <td>
                            <span className={situacao.className}>{situacao.label}</span>
                          </td>
                          <td className="whitespace-nowrap">
                            <div className="flex flex-wrap gap-2">
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
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 app-empty-card">
                Nenhum item encontrado com os filtros atuais.
              </div>
            )}
          </div>
        </div>
      </div>

      {modalEdicaoAberto && itemEditando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ background: 'rgba(0, 0, 0, 0.45)' }}>
          <div
            className="flex w-full flex-col rounded-2xl border"
            style={{
              background: 'var(--ui-surface)',
              borderColor: 'var(--ui-border)',
              boxShadow: '0 30px 60px rgba(0,0,0,0.2)',
              maxHeight: 'calc(100vh - 32px)',
              maxWidth: '1080px',
              overflow: 'hidden'
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>
                  {podeEditarItensPedido && !itemEditando.removido ? 'Editar item do pedido' : 'Detalhes do item'}
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--c-muted)' }}>
                  PC-{String(pedido.id).padStart(5, '0')} - {itemEditando.descricao}
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={fecharModalEdicao} disabled={modalProcessando}>
                Fechar
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
              {itemEditando.removido ? (
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-[var(--c-muted)]">
                  {pedidoCancelado
                    ? 'Este item pertence a um pedido cancelado. O histórico permanece preservado e o saldo liberado pode ser remanejado para outro fornecedor da mesma cotação.'
                    : 'Este item foi removido do pedido. Ele permanece visível para consulta, mas a trilha detalhada agora fica no painel administrativo de relatórios.'}
                </div>
              ) : null}

              {itemEditandoAbaixoMinimo ? (
                <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  A quantidade atual do pedido ainda esta abaixo do minimo definido para este item.
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="grid gap-3">
                  {!itemEditando.removido ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
                      <label className="grid gap-2 text-sm font-medium">
                        Quantidade do pedido
                        <input
                          className="input h-11"
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
                        <span className="text-xs text-[var(--c-muted)]">
                          Use `.` para milhar e `,` para decimal, com no maximo 2 casas apos a virgula.
                        </span>
                      </label>

                      <label className="grid gap-2 text-sm font-medium">
                        Preco unitario
                        <input
                          className="input h-11"
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
                      </label>

                      <div className="grid gap-2 text-sm font-medium">
                        <span>Valor recalculado</span>
                        <div className="input flex h-11 items-center bg-slate-50">
                          {formatMoney(
                            parseBrazilianQuantity(edicaoItemAtual.quantidade_pedido) * (parseBrazilianMoney(edicaoItemAtual.preco_unitario) || 0)
                          )}
                        </div>
                      </div>
                    </div>

                    <label className="grid gap-2 text-sm font-medium">
                      Observacoes do item
                      <textarea
                        className="input min-h-[84px]"
                        value={edicaoItemAtual.observacoes ?? ''}
                        disabled={pedidoBloqueado}
                        onChange={(event) =>
                          atualizarEdicaoItem(itemEditando.id, {
                            observacoes: event.target.value
                          })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-[var(--c-muted)]">
                    Item removido do fluxo ativo. Use o atalho de auditoria para consultar toda a trilha historica.
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--c-muted)]">
                  Resumo do item
                </div>
                <div className="mt-3 grid gap-2 text-xs">
                  <div>
                    <div className="text-[var(--c-muted)]">Situacao</div>
                    <div className="mt-1">
                      <span className={itemEditandoSituacao.className}>{itemEditandoSituacao.label}</span>
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
                    <div className="text-[var(--c-muted)]">Minimo</div>
                    <div className="font-semibold">{formatQuantityLabel(itemEditando.quantidade_minima_item, itemEditando.unidade)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Cotado pelo fornecedor</div>
                    <div className="font-semibold">{formatUnitPrice(itemEditandoPrecoContext?.precoCotado, itemEditando.unidade)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Preco atual do pedido</div>
                    <div className="font-semibold">{formatUnitPrice(itemEditandoPrecoContext?.precoAtual, itemEditando.unidade)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Ult. compra</div>
                    <div className="font-semibold">{formatUnitPrice(itemEditandoPrecoContext?.ultimoPrecoCompra, itemEditando.unidade, 'Sem historico')}</div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Variacao x ult. compra</div>
                    <div className={`font-semibold ${getVariationTextClass(itemEditandoPrecoContext?.variacaoUltimaCompra)}`}>
                      {formatVariationPercent(itemEditandoPrecoContext?.variacaoUltimaCompra)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--c-muted)]">Valor total atual</div>
                    <div className="font-semibold">{formatMoney(itemEditandoValorTotalAtual)}</div>
                  </div>
                </div>

                {businessAdmin ? (
                  <button type="button" className="btn btn-outline mt-3 w-full justify-center" onClick={() => abrirAuditoria(itemEditando.id)}>
                    Abrir auditoria do item
                  </button>
                ) : null}
              </div>
            </div>

            {podeRemanejarPedido && (!itemEditando.removido || pedidoCancelado) ? (
              <div className="mt-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Remanejar quantidade para outro fornecedor</h3>
                    <p className="mt-0.5 text-xs text-[var(--c-muted)]">
                      {pedidoCancelado
                        ? 'Selecione outro fornecedor respondido. O pedido cancelado continua preservado e um pedido de destino recebe a quantidade escolhida.'
                        : 'Use quando parte ou todo o item precisar voltar para a cotação e seguir em outro pedido.'}
                    </p>
                  </div>
                  <span className="app-status-pill bg-blue-50 text-blue-700">
                    Max. {formatQuantityLabel(quantidadeMaximaRemanejamento, itemEditando.unidade)}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_auto]">
                  <select
                    className="input h-11"
                    value={remanejoSelecionado}
                    onChange={(event) => setRemanejoSelecionado(event.target.value)}
                    disabled={remanejamentoBloqueado || remanejandoItem || candidatosRemanejamentoItem.length === 0}
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
                    className="input h-11"
                    type="text"
                    inputMode="decimal"
                    value={remanejoQuantidade}
                    onChange={(event) => setRemanejoQuantidade(maskBrazilianQuantityInput(event.target.value))}
                    onBlur={(event) => setRemanejoQuantidade(normalizeBrazilianQuantityOnBlur(event.target.value))}
                    placeholder={formatBrazilianQuantity(quantidadeMaximaRemanejamento)}
                    disabled={remanejamentoBloqueado || remanejandoItem}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleRemanejarItemAtual}
                    disabled={remanejamentoBloqueado || remanejandoItem || !remanejoSelecionado || quantidadeMaximaRemanejamento <= 0}
                  >
                    {remanejandoItem ? 'Remanejando...' : 'Remanejar'}
                  </button>
                </div>
              </div>
            ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[var(--c-muted)]">
                  A trilha de auditoria saiu desta tela para evitar sobrecarga visual em pedidos grandes.
                </div>
                <div className="flex flex-wrap gap-2">
                {podeEditarItensPedido && !itemEditando.removido ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleRemoverItem(itemEditando.id)}
                    disabled={pedidoBloqueado || removingItemId === itemEditando.id}
                  >
                    {removingItemId === itemEditando.id ? 'Removendo...' : 'Remover item'}
                  </button>
                ) : null}
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
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {modalCancelamentoAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ background: 'rgba(0, 0, 0, 0.45)' }}>
          <div
            className="w-full rounded-2xl border"
            style={{
              background: 'var(--ui-surface)',
              borderColor: 'var(--ui-border)',
              boxShadow: '0 30px 60px rgba(0,0,0,0.2)',
              maxWidth: '720px'
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--c-border)] px-5 py-4">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>
                  Cancelar pedido
                </h2>
                <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
                  O historico sera preservado. Se houver titulo financeiro ou frete com titulo, o sistema bloqueara a acao.
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

            <div className="space-y-4 px-5 py-4">
              <label className="grid gap-2 text-sm font-medium">
                Motivo do cancelamento *
                <textarea
                  className="input min-h-[96px]"
                  value={cancelamentoPedidoForm.motivo}
                  onChange={(event) => setCancelamentoPedidoForm((current) => ({
                    ...current,
                    motivo: event.target.value
                  }))}
                  placeholder="Explique por que este pedido esta sendo cancelado."
                  disabled={cancelandoPedido}
                />
              </label>

              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-muted)] p-3">
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
                      <strong>Cancelar cotacao vinculada</strong>
                      <span className="block text-xs text-[var(--c-muted)]">
                        Marca os links/respostas da cotacao como cancelados e evita nova interacao no fluxo.
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
                      <strong>Cancelar solicitacao de compra</strong>
                      <span className="block text-xs text-[var(--c-muted)]">
                        Remove a SC do painel de delegacao, mantendo a consulta nas telas historicas.
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
                      <strong>Cancelar tambem a solicitacao principal</strong>
                      <span className="block text-xs text-[var(--c-muted)]">
                        Use somente quando a solicitacao normal nao deve seguir em nenhum outro setor.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setModalCancelamentoAberto(false)}
                  disabled={cancelandoPedido}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmarCancelamentoPedido}
                  disabled={cancelandoPedido}
                >
                  {cancelandoPedido ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {modalFreteAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ background: 'rgba(0, 0, 0, 0.45)' }}>
          <div
            className="flex w-full flex-col rounded-2xl border"
            style={{
              background: 'var(--ui-surface)',
              borderColor: 'var(--ui-border)',
              boxShadow: '0 30px 60px rgba(0,0,0,0.2)',
              maxHeight: 'calc(100vh - 32px)',
              maxWidth: '880px',
              overflow: 'hidden'
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>
                  {freteEditandoId ? 'Editar frete do pedido' : 'Registrar frete do pedido'}
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--c-muted)' }}>
                  {freteEditandoId
                    ? 'A correcao recalcula o rateio e registra auditoria no historico.'
                    : 'O frete sera rateado por valor dos itens. Frete de terceiro cria pendencia para o financeiro.'}
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => fecharModalFrete()} disabled={salvandoFrete}>
                Fechar
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-4 sm:px-5">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium">
                  Tipo de frete
                  <select
                    className="input"
                    value={freteForm.tipo}
                    onChange={(event) => atualizarFreteForm({ tipo: event.target.value })}
                    disabled={salvandoFrete || Boolean(freteEditandoId)}
                  >
                    {permiteFreteEmbutido ? <option value="EMBUTIDO">Embutido no pedido</option> : null}
                    <option value="TERCEIRO">Pago a terceiro</option>
                  </select>
                  {!permiteFreteEmbutido ? (
                    <span className="text-xs font-normal text-[var(--c-muted)]">
                      Pedido fechado aceita somente frete pago a terceiro.
                    </span>
                  ) : null}
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Momento
                  <select
                    className="input"
                    value={freteForm.momento}
                    onChange={(event) => atualizarFreteForm({ momento: event.target.value })}
                    disabled={salvandoFrete || !permiteFreteEmbutido || Boolean(freteEditandoId)}
                  >
                    {permiteFreteEmbutido ? <option value="FECHAMENTO">No fechamento</option> : null}
                    <option value="POSTERIOR">Informado depois</option>
                  </select>
                  {!permiteFreteEmbutido ? (
                    <span className="text-xs font-normal text-[var(--c-muted)]">
                      Frete de pedido fechado fica registrado como informado depois.
                    </span>
                  ) : null}
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Valor total do frete
                  <input
                    className="input"
                    inputMode="decimal"
                    value={freteForm.valor_total}
                    onChange={(event) => atualizarFreteForm({ valor_total: sanitizeMoneyInput(event.target.value) })}
                    onBlur={(event) => atualizarFreteForm({ valor_total: formatMoneyInput(event.target.value) })}
                    placeholder="R$ 0,00"
                    disabled={salvandoFrete}
                  />
                </label>

                {freteForm.tipo === 'TERCEIRO' ? (
                  <label className="grid gap-2 text-sm font-medium">
                    Data de vencimento
                    <input
                      className="input"
                      type="date"
                      value={freteForm.data_vencimento}
                      onChange={(event) => atualizarFreteForm({ data_vencimento: event.target.value })}
                      disabled={salvandoFrete}
                      required
                    />
                  </label>
                ) : null}
              </div>

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
                  <span className="app-status-pill bg-blue-50 text-blue-700">
                    {freteForm.criterio_rateio === 'POR_ITEM' ? 'Informado por item' : 'Proporcional aos itens'}
                  </span>
                </div>
                {freteForm.criterio_rateio === 'POR_ITEM' ? (
                  <div className="mt-3 grid gap-2">
                    {(freteForm.rateios || []).map((rateio) => (
                      <label
                        key={rateio.pedido_compra_item_id}
                        className="grid items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 sm:grid-cols-[minmax(0,1fr)_150px]"
                      >
                        <span className="min-w-0 truncate text-xs font-medium" title={rateio.descricao}>
                          {rateio.descricao}
                        </span>
                        <input
                          className="input h-9 text-right text-sm"
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
                      Pesquise no cadastro de credores ou informe os dados para cadastro rapido.
                    </p>

                    <div className="relative mt-3">
                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          className="input"
                          value={buscaFornecedorFrete}
                          onChange={(event) => {
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
                          onClick={() => handleBuscarFornecedorFrete()}
                          disabled={buscandoFornecedoresFrete || salvandoFrete}
                        >
                          {buscandoFornecedoresFrete ? 'Buscando...' : 'Buscar'}
                        </button>
                      </div>

                      {credorFreteSelecionado ? (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                          <span className="font-semibold">{formatarCredorFrete(credorFreteSelecionado)}</span>
                          <button type="button" className="btn btn-outline !py-1 text-xs" onClick={limparCredorFrete} disabled={salvandoFrete}>
                            Trocar
                          </button>
                        </div>
                      ) : null}

                      {!credorFreteSelecionado && fornecedoresFrete.length ? (
                        <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-[var(--c-border)] bg-[var(--ui-surface)] shadow-xl">
                          {fornecedoresFrete.map((credor) => (
                            <button
                              key={`${credor.origem_frete || 'credor'}:${credor.id}`}
                              type="button"
                              className="block w-full border-b border-[var(--c-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--c-surface)]"
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
                      <div className="font-semibold">Cadastro rapido do credor/transportador</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <input
                          className="input"
                          value={freteForm.novo_fornecedor.nome}
                          onChange={(event) => atualizarNovoFornecedorFrete({ nome: event.target.value })}
                          placeholder="Nome do fornecedor"
                          disabled={salvandoFrete}
                        />
                        <input
                          className="input"
                          value={freteForm.novo_fornecedor.cpf_cnpj}
                          onChange={(event) => atualizarNovoFornecedorFrete({ cpf_cnpj: maskCpfCnpj(event.target.value) })}
                          onBlur={(event) => {
                            if (event.target.value && !isValidCpfCnpj(event.target.value)) {
                              alert('CPF/CNPJ invalido para o credor/transportador.');
                            }
                          }}
                          placeholder="CPF/CNPJ"
                          disabled={salvandoFrete}
                        />
                        <input
                          className="input"
                          value={freteForm.novo_fornecedor.whatsapp}
                          onChange={(event) => atualizarNovoFornecedorFrete({ whatsapp: maskPhone(event.target.value) })}
                          placeholder="WhatsApp/telefone"
                          disabled={salvandoFrete}
                        />
                        <input
                          className="input"
                          type="email"
                          value={freteForm.novo_fornecedor.email}
                          onChange={(event) => atualizarNovoFornecedorFrete({ email: event.target.value.trim().toLowerCase() })}
                          onBlur={(event) => {
                            if (event.target.value && !isValidEmail(event.target.value)) {
                              alert('E-mail invalido para o credor/transportador.');
                            }
                          }}
                          placeholder="Email"
                          disabled={salvandoFrete}
                        />
                        <input
                          className="input md:col-span-2"
                          value={freteForm.novo_fornecedor.contato}
                          onChange={(event) => atualizarNovoFornecedorFrete({ contato: event.target.value })}
                          placeholder="Contato"
                          disabled={salvandoFrete}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                    <div className="font-semibold">Dados para pagamento do frete</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <select
                        className="input"
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
                      <input
                        className="input"
                        value={freteForm.dados_pagamento.pix}
                        onChange={(event) => atualizarDadosPagamentoFrete({
                          pix: maskPixKey(event.target.value, freteForm.dados_pagamento.tipo_chave_pix)
                        })}
                        placeholder="Chave PIX"
                        disabled={salvandoFrete}
                      />
                      <input
                        className="input"
                        value={freteForm.dados_pagamento.favorecido}
                        onChange={(event) => atualizarDadosPagamentoFrete({ favorecido: event.target.value })}
                        placeholder="Favorecido"
                        disabled={salvandoFrete}
                      />
                      <input
                        className="input"
                        value={freteForm.dados_pagamento.documento}
                        onChange={(event) => atualizarDadosPagamentoFrete({ documento: maskCpfCnpj(event.target.value) })}
                        onBlur={(event) => {
                          if (event.target.value && !isValidCpfCnpj(event.target.value)) {
                            alert('CPF/CNPJ invalido para o favorecido.');
                          }
                        }}
                        placeholder="CPF/CNPJ do favorecido"
                        disabled={salvandoFrete}
                      />
                      <input
                        className="input"
                        value={freteForm.dados_pagamento.banco}
                        onChange={(event) => atualizarDadosPagamentoFrete({ banco: event.target.value })}
                        placeholder="Banco"
                        disabled={salvandoFrete}
                      />
                      <input
                        className="input"
                        value={freteForm.dados_pagamento.agencia}
                        onChange={(event) => atualizarDadosPagamentoFrete({ agencia: event.target.value })}
                        placeholder="Agencia"
                        disabled={salvandoFrete}
                      />
                      <input
                        className="input"
                        value={freteForm.dados_pagamento.conta}
                        onChange={(event) => atualizarDadosPagamentoFrete({ conta: event.target.value })}
                        placeholder="Conta"
                        disabled={salvandoFrete}
                      />
                      <textarea
                        className="input min-h-[80px] md:col-span-2"
                        value={freteForm.dados_pagamento.observacoes}
                        onChange={(event) => atualizarDadosPagamentoFrete({ observacoes: event.target.value })}
                        placeholder="Observacoes para o financeiro"
                        disabled={salvandoFrete}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <label className="mt-4 grid gap-2 text-sm font-medium">
                Observacoes do frete
                <textarea
                  className="input min-h-[90px]"
                  value={freteForm.observacoes}
                  onChange={(event) => atualizarFreteForm({ observacoes: event.target.value })}
                  placeholder="Ex.: frete embutido na negociacao ou frete pago diretamente a transportador."
                  disabled={salvandoFrete}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--c-border)] px-4 py-3 sm:px-5">
              <button type="button" className="btn btn-outline" onClick={() => fecharModalFrete()} disabled={salvandoFrete}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleRegistrarFrete} disabled={salvandoFrete}>
                {salvandoFrete ? 'Salvando...' : freteEditandoId ? 'Salvar correcao' : 'Registrar frete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CompraPreviewModal preview={previewPedido} onClose={() => setPreviewPedido(null)} />
    </div>
  );
}
