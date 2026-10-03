import { useEffect, useMemo, useState } from 'react';
import TituloNegociacaoHistorico from '../components/financeiro/TituloNegociacaoHistorico';
import { Link, useParams } from 'react-router-dom';
import {
  atualizarCobrancaTituloFinanceiro,
  baixarTituloFinanceiro,
  estornarMovimentoFinanceiro,
  getCartoesFinanceiros,
  getChequesTerceirosDisponiveis,
  getContasBancarias,
  getTituloFinanceiroAuditoria,
  getTituloFinanceiroById
} from '../services/financeiro';
import { useAuth } from '../contexts/AuthContext';
import { hasPermissao } from '../utils/acessoProduto';
import { formatCurrencyInput, normalizeCurrencyTyping } from '../utils/formatters';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  CamposComVazios,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import DateInputBR from '../components/DateInputBR';

const FORMAS_RECEBIMENTO = ['DINHEIRO', 'PIX', 'CARTAO', 'TRANSFERENCIA', 'BOLETO', 'CHEQUE', 'PERMUTA', 'BENS', 'OUTROS'];
const CATEGORIAS_BEM = ['VEICULO', 'IMOVEL', 'TERRENO', 'SERVICO', 'MATERIAL', 'CREDITO', 'OUTROS'];
const FORMAS_COBRANCA = ['BOLETO', 'PIX', 'OUTROS'];
const STATUS_COBRANCA = ['PENDENTE_EMISSAO', 'EMITIDO', 'PAGO_BANCO', 'CONCILIADO', 'CANCELADO'];
const TIPOS_INTERCOMPANY_LABEL = {
  APORTE: 'Aporte',
  EMPRESTIMO: 'Emprestimo',
  REEMBOLSO: 'Reembolso',
  RATEIO: 'Rateio',
  COBERTURA_CAIXA: 'Cobertura de caixa',
  FOLHA: 'Folha',
  ADMINISTRATIVO: 'Administrativo',
  IMPOSTO: 'Imposto',
  TRANSFERENCIA_OPERACIONAL: 'Transferencia operacional'
};
const NATUREZAS_INTERCOMPANY_BAIXA = [
  {
    value: 'OPERACIONAL_TERCEIRO',
    label: 'Despesa/receita operacional paga por outra empresa',
    description: 'Entra nos relatorios operacionais, DRE e custo da obra. Registra que outra empresa fez a baixa.',
    tipo_intercompany: 'TRANSFERENCIA_OPERACIONAL',
    elimina_consolidado: false,
    transferencia_interna: false
  },
  {
    value: 'TRANSFERENCIA_INTERNA',
    label: 'Transferência interna entre empresas',
    description: 'Use para cobertura de caixa ou envio de recurso entre empresas. Nao entra na DRE consolidada.',
    tipo_intercompany: 'COBERTURA_CAIXA',
    elimina_consolidado: true,
    transferencia_interna: true
  },
  {
    value: 'REEMBOLSO_COMPENSACAO',
    label: 'Reembolso ou compensação entre empresas',
    description: 'Use para acerto/reembolso interno. Mantem o rastro sem tratar como despesa operacional da obra.',
    tipo_intercompany: 'REEMBOLSO',
    elimina_consolidado: true,
    transferencia_interna: false
  }
];

function getNaturezaBaixaIntercompany(value) {
  return NATUREZAS_INTERCOMPANY_BAIXA.find((item) => item.value === value) || NATUREZAS_INTERCOMPANY_BAIXA[0];
}

function inferNaturezaBaixaIntercompany(data = {}) {
  const tipo = String(data.tipo_intercompany || '').toUpperCase();
  if (tipo === 'REEMBOLSO') return 'REEMBOLSO_COMPENSACAO';
  if (data.transferencia_interna !== false && data.elimina_consolidado !== false) return 'TRANSFERENCIA_INTERNA';
  return 'OPERACIONAL_TERCEIRO';
}

function applyNaturezaBaixaIntercompany(form, naturezaValue) {
  const natureza = getNaturezaBaixaIntercompany(naturezaValue);
  return {
    ...form,
    natureza_intercompany_baixa: natureza.value,
    tipo_intercompany: natureza.tipo_intercompany,
    elimina_consolidado: natureza.elimina_consolidado,
    transferencia_interna: natureza.transferencia_interna
  };
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function labelTipoIntercompany(value) {
  return TIPOS_INTERCOMPANY_LABEL[String(value || '').toUpperCase()] || value || '-';
}


function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCodigoBancoInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function contaBancariaObrigatoria(formaRecebimento) {
  return !['CARTAO', 'PERMUTA', 'BENS', 'OUTROS'].includes(String(formaRecebimento || '').toUpperCase());
}

function contaExigeControleDiario(conta) {
  const valorConfigurado = conta?.exige_abertura_fechamento;
  const exigeAberturaFechamento = valorConfigurado === true
    || Number(valorConfigurado) === 1
    || String(valorConfigurado || '').trim().toLowerCase() === 'true';

  return exigeAberturaFechamento
    || String(conta?.tipo_operacional || '').toUpperCase() === 'CAIXA_INTERNO';
}

function isCartaoForma(formaRecebimento) {
  return String(formaRecebimento || '').toUpperCase() === 'CARTAO';
}

function isCartaoDebito(cartao) {
  return String(cartao?.tipo || '').toUpperCase() === 'DEBITO';
}

function getCartaoLabel(cartao) {
  const tipo = isCartaoDebito(cartao) ? 'Debito' : 'Credito';
  const bandeira = cartao?.bandeira ? `${cartao.bandeira} ` : '';
  const final = cartao?.ultimos_digitos ? ` final ${cartao.ultimos_digitos}` : '';
  return `${cartao?.nome || 'Cartao'} - ${tipo} - ${bandeira}${final}`.trim();
}

function isChequeForma(formaRecebimento) {
  return String(formaRecebimento || '').toUpperCase() === 'CHEQUE';
}

function formatChequeTerceiroLabel(cheque) {
  const numero = cheque?.numero_cheque || cheque?.codigo || 'Sem numero';
  const titular = cheque?.titular_nome || cheque?.cliente_nome || cheque?.parceiroEntregou?.nome || 'Titular nao informado';
  const vencimento = cheque?.data_vencimento ? ` - venc. ${formatDate(cheque.data_vencimento)}` : '';
  return `${numero} - ${titular} - ${formatCurrency(cheque?.valor)}${vencimento}`;
}

function normalizeFormaBaixaForm(formaRecebimento) {
  const normalized = String(formaRecebimento || '').toUpperCase();
  return normalized.startsWith('CARTAO_') ? 'CARTAO' : normalized;
}

function buildBaixaForm(titulo, contasBancarias, movimento = null) {
  if (movimento) {
    return {
      empresa_id: String(movimento.empresa_id || movimento.empresa?.id || ''),
      conta_bancaria_id: String(movimento.conta_bancaria_id || movimento.contaBancaria?.id || ''),
      cartao_id: String(movimento.cartao_id || movimento.cartao?.id || ''),
      usar_cheque_terceiro: Boolean(movimento.cheque_terceiro_id),
      cheque_terceiro_id: String(movimento.cheque_terceiro_id || ''),
      cheque_numero: movimento?.cheque_numero || '',
      cheque_emitente: movimento?.cheque_emitente || '',
      cheque_banco: movimento?.cheque_banco || '',
      cheque_agencia: movimento?.cheque_agencia || '',
      cheque_conta: movimento?.cheque_conta || '',
      titular_documento: movimento?.cheque_titular_documento || '',
      data_emissao: movimento?.cheque_data_emissao || '',
      data_vencimento: movimento?.cheque_data_vencimento || '',
      forma_recebimento: normalizeFormaBaixaForm(movimento?.forma_recebimento),
      tipo_permuta: movimento?.tipo_permuta || '',
      categoria_bem: movimento?.categoria_bem || '',
      descricao_bem: movimento?.descricao_bem || '',
      valor_referencia_bem: formatCurrencyInput(movimento?.valor_referencia_bem),
      documento_referencia: movimento?.documento_referencia || '',
      valor: formatCurrencyInput(movimento?.valor),
      juros: formatCurrencyInput(movimento?.juros, { emptyZero: false }),
      multa: formatCurrencyInput(movimento?.multa, { emptyZero: false }),
      desconto: formatCurrencyInput(movimento?.desconto, { emptyZero: false }),
      data_movimento: movimento?.data_movimento || today(),
      observacoes: movimento?.observacoes || '',
      intercompany: Boolean(movimento?.intercompany_group_id || movimento?.tipo_intercompany),
      natureza_intercompany_baixa: inferNaturezaBaixaIntercompany(movimento),
      tipo_intercompany: movimento?.tipo_intercompany || '',
      motivo_intercompany: movimento?.motivo_intercompany || '',
      elimina_consolidado: movimento?.elimina_consolidado !== false,
      transferencia_interna: movimento?.transferencia_interna !== false
    };
  }

  return {
    empresa_id: String(titulo?.empresa_id || ''),
    conta_bancaria_id: '',
    cartao_id: '',
    usar_cheque_terceiro: false,
    cheque_terceiro_id: '',
    cheque_numero: '',
    cheque_emitente: '',
    cheque_banco: '',
    cheque_agencia: '',
    cheque_conta: '',
    titular_documento: '',
    data_emissao: '',
    data_vencimento: '',
    forma_recebimento: '',
    tipo_permuta: '',
    categoria_bem: '',
    descricao_bem: '',
    valor_referencia_bem: '',
    documento_referencia: '',
    valor: formatCurrencyInput(titulo?.valor_saldo),
    juros: formatCurrencyInput(0, { emptyZero: false }),
    multa: formatCurrencyInput(0, { emptyZero: false }),
    desconto: formatCurrencyInput(0, { emptyZero: false }),
    data_movimento: today(),
    observacoes: '',
    intercompany: false,
    natureza_intercompany_baixa: 'OPERACIONAL_TERCEIRO',
    tipo_intercompany: '',
    motivo_intercompany: '',
    elimina_consolidado: false,
    transferencia_interna: false
  };
}

function buildCobrancaForm(titulo) {
  return {
    forma_cobranca: titulo?.forma_cobranca || '',
    status_cobranca: titulo?.status_cobranca && titulo.status_cobranca !== 'NAO_APLICAVEL'
      ? titulo.status_cobranca
      : 'PENDENTE_EMISSAO',
    banco_cobranca: titulo?.banco_cobranca || '',
    nosso_numero: titulo?.nosso_numero || '',
    linha_digitavel: titulo?.linha_digitavel || '',
    codigo_barras: titulo?.codigo_barras || '',
    identificador_externo: titulo?.identificador_externo || '',
    boleto_emitido_em: titulo?.boleto_emitido_em || ''
  };
}

function auditStatusClass(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SUCCESS') return 'bg-[var(--sem-success-bg)] text-[var(--sem-success)]';
  if (normalized === 'DENIED') return 'bg-[var(--sem-danger-bg)] text-[var(--sem-danger)]';
  return 'bg-[var(--sem-neutral-bg)] text-[var(--sem-neutral)]';
}

function paymentStatusClass(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (['APROVADO', 'CONFIRMADO_BANCO', 'BAIXADO'].includes(normalized)) return 'bg-[var(--sem-success-bg)] text-[var(--sem-success)]';
  if (['PENDENTE_APROVACAO', 'ENVIADO_AO_BANCO', 'AGUARDANDO_CONFIRMACAO_BAIXA'].includes(normalized)) return 'bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]';
  if (['REJEITADO_BANCO', 'FALHA_INTEGRACAO', 'CANCELADO'].includes(normalized)) return 'bg-[var(--sem-danger-bg)] text-[var(--sem-danger)]';
  return 'bg-[var(--sem-neutral-bg)] text-[var(--sem-neutral)]';
}

function formatAuditMetadata(metadata, { hideFinancialReferenceIds = false } = {}) {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }

  const labels = {
    solicitacao_id: 'Solicitacao',
    obra_id: 'Obra',
    parceiro_id: 'Parceiro',
    tipo: 'Tipo',
    valor_original: 'Valor original',
    movimento_id: 'Movimento',
    conta_bancaria_id: 'Conta bancaria',
    empresa_baixa_id: 'Empresa da baixa',
    intercompany_group_id: 'Grupo entre empresas',
    tipo_intercompany: 'Tipo',
    forma_recebimento: 'Forma de pagamento/recebimento',
    tipo_permuta: 'Tipo de permuta',
    categoria_bem: 'Categoria do bem',
    descricao_bem: 'Descricao do bem',
    valor_referencia_bem: 'Valor de referencia',
    documento_referencia: 'Documento',
    forma_cobranca: 'Forma de cobranca',
    status_cobranca: 'Status da cobranca',
    banco_cobranca: 'Codigo do banco da cobranca',
    nosso_numero: 'Nosso numero',
    identificador_externo: 'Identificador externo',
    boleto_emitido_em: 'Boleto emitido em',
    valor: 'Valor',
    juros: 'Juros',
    multa: 'Multa',
    desconto: 'Desconto',
    valor_quitacao: 'Quitacao',
    valor_estornado: 'Valor estornado',
    cheque_numero: 'Numero do cheque',
    cheque_emitente: 'Emitente do cheque',
    cheque_titular_documento: 'CPF/CNPJ do titular',
    cheque_banco: 'Banco do cheque',
    cheque_agencia: 'Agencia do cheque',
    cheque_conta: 'Conta do cheque',
    cheque_data_emissao: 'Emissao do cheque',
    cheque_data_vencimento: 'Vencimento do cheque'
  };

  return Object.entries(metadata)
    .filter(([key]) => !hideFinancialReferenceIds || !['empresa_baixa_id', 'conta_bancaria_id'].includes(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 16)
    .map(([key, value]) => ({
      key,
      label: labels[key] || key.replace(/_/g, ' '),
      value: ['valor_original', 'valor', 'juros', 'multa', 'desconto', 'valor_quitacao', 'valor_estornado', 'valor_referencia_bem'].includes(key)
        ? formatCurrency(value)
        : String(value)
    }));
}

export default function FinanceiroTituloDetalhe() {
  const { id } = useParams();
  const { user } = useAuth();
  const [titulo, setTitulo] = useState(null);
  const [contasBancarias, setContasBancarias] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [chequesTerceiros, setChequesTerceiros] = useState([]);
  const [loadingChequesTerceiros, setLoadingChequesTerceiros] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditoria, setAuditoria] = useState([]);
  const [modalBaixaOpen, setModalBaixaOpen] = useState(false);
  const [baixaForm, setBaixaForm] = useState(() => buildBaixaForm(null, []));
  const [cobrancaForm, setCobrancaForm] = useState(() => buildCobrancaForm(null));
  const [savingCobranca, setSavingCobranca] = useState(false);
  const [savingBaixa, setSavingBaixa] = useState(false);
  const [estornandoId, setEstornandoId] = useState(null);
  const [corrigindoMovimentoId, setCorrigindoMovimentoId] = useState(null);
  // R3: aviso e confirmação do sistema no lugar das caixas do navegador. A
  // faixa `error` desta tela continua como está (erro de fluxo); o
  // useAvisos cobre só o que era caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const podeVerPagamentosBancarios = hasPermissao(user, 'financeiro.titulos.pagamentos_bancarios.visualizar');
  const podeVerMovimentosFinanceiros = hasPermissao(user, 'financeiro.titulos.movimentos.visualizar');
  const podeVerAuditoriaFinanceira = hasPermissao(user, 'financeiro.titulos.auditoria.visualizar');

  async function carregar() {
    try {
      setLoading(true);
      setError('');
      const [tituloData, contasData, cartoesData, auditoriaData] = await Promise.all([
        getTituloFinanceiroById(id),
        getContasBancarias(),
        getCartoesFinanceiros(),
        podeVerAuditoriaFinanceira ? getTituloFinanceiroAuditoria(id) : Promise.resolve([])
      ]);
      setTitulo(tituloData);
      setContasBancarias(Array.isArray(contasData) ? contasData : []);
      setCartoes(Array.isArray(cartoesData) ? cartoesData : []);
      setAuditoria(Array.isArray(auditoriaData) ? auditoriaData : []);
      setCobrancaForm(buildCobrancaForm(tituloData));
      setBaixaForm((current) => ({
        ...buildBaixaForm(tituloData, Array.isArray(contasData) ? contasData : []),
        conta_bancaria_id: current.conta_bancaria_id || '',
        cartao_id: current.cartao_id || '',
        cheque_terceiro_id: current.cheque_terceiro_id || ''
      }));
    } catch (err) {
      setError(err?.message || 'Erro ao carregar titulo financeiro');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [id, podeVerAuditoriaFinanceira]);

  const movimentosAtivos = useMemo(() => {
    return Array.isArray(titulo?.movimentos)
      ? titulo.movimentos.filter((item) => String(item.status || '').toUpperCase() === 'ATIVO')
      : [];
  }, [titulo]);
  const fontesFinanceirasAtivas = useMemo(() => {
    const fontesPorDescricao = new Map();

    movimentosAtivos.forEach((movimento) => {
      const empresaNome = movimento.empresa?.nome || movimento.empresa?.razao_social || 'Empresa nao informada';
      const contaNome = movimento.contaBancaria?.nome || 'Sem conta bancaria vinculada';
      const chave = `${empresaNome}::${contaNome}`;
      if (!fontesPorDescricao.has(chave)) {
        fontesPorDescricao.set(chave, {
          empresa_nome: empresaNome,
          conta_bancaria_nome: contaNome
        });
      }
    });

    return Array.from(fontesPorDescricao.values());
  }, [movimentosAtivos]);
  const pagamentosAtivos = useMemo(() => {
    return Array.isArray(titulo?.paymentIntents)
      ? titulo.paymentIntents.filter((item) => !['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO'].includes(String(item.status || '').toUpperCase()))
      : [];
  }, [titulo]);
  const movimentosAtivosCount = Array.isArray(titulo?.movimentos)
    ? movimentosAtivos.length
    : Number(titulo?.movimentos_ativos_count || 0);
  const cartoesUtilizados = useMemo(() => {
    const cartoesPorId = new Map();
    const movimentosValidos = Array.isArray(titulo?.movimentos)
      ? titulo.movimentos.filter((movimento) => String(movimento?.status || '').toUpperCase() !== 'ESTORNADO')
      : [];

    movimentosValidos.forEach((movimento) => {
      if (movimento?.cartao?.id) {
        cartoesPorId.set(String(movimento.cartao.id), movimento.cartao);
      }
    });

    if (cartoesPorId.size === 0 && titulo?.cartao?.id) {
      cartoesPorId.set(String(titulo.cartao.id), titulo.cartao);
    }

    return Array.from(cartoesPorId.values());
  }, [titulo]);
  const tituloRelacionadoACartao = useMemo(() => {
    const formaPagamento = titulo?.formaPagamento || {};
    const identificacaoForma = [formaPagamento.codigo, formaPagamento.nome, formaPagamento.tipo]
      .filter(Boolean)
      .join(' ')
      .toUpperCase();

    return cartoesUtilizados.length > 0
      || Boolean(formaPagamento.exige_cartao)
      || identificacaoForma.includes('CARTAO');
  }, [cartoesUtilizados, titulo]);
  const pagamentosAtivosCount = Array.isArray(titulo?.paymentIntents)
    ? pagamentosAtivos.length
    : Number(titulo?.payment_intents_ativos_count || 0);
  const podeEditarTitulo = ['PREVISAO', 'ABERTO'].includes(String(titulo?.status || '').toUpperCase())
    && !titulo?.renegociacao_id && !titulo?.renegociado_por_id
    && Number(titulo?.valor_baixado || 0) === 0
    && movimentosAtivosCount === 0
    && pagamentosAtivosCount === 0;
  const bloqueadoPorRetornoObra = titulo?.bloqueado_retorno_obra === true
    || Number(titulo?.bloqueado_retorno_obra) === 1;

  const contasBancariasBaixa = useMemo(() => {
    return contasBancarias.filter((conta) => conta.ativo !== false);
  }, [contasBancarias]);
  const selectedCartaoBaixa = useMemo(
    () => cartoes.find((cartao) => String(cartao.id) === String(baixaForm.cartao_id)) || null,
    [cartoes, baixaForm.cartao_id]
  );
  const cartoesBaixa = useMemo(() => cartoes.filter((cartao) => {
    return cartao.ativo !== false;
  }), [cartoes]);
  const baixaUsaCartao = isCartaoForma(baixaForm.forma_recebimento);
  const baixaCartaoDebito = baixaUsaCartao && isCartaoDebito(selectedCartaoBaixa);
  const baixaUsaCheque = isChequeForma(baixaForm.forma_recebimento);
  const baixaUsaDinheiro = String(baixaForm.forma_recebimento || '').toUpperCase() === 'DINHEIRO';
  const tituloTipo = String(titulo?.tipo || '').toUpperCase();
  const baixaFormaLabel = tituloTipo === 'PAGAR' ? 'Forma de pagamento' : 'Forma de recebimento';
  const baixaRecebeChequeTerceiro = baixaUsaCheque && tituloTipo === 'RECEBER';
  const baixaPagaComChequeTerceiro = baixaUsaCheque && tituloTipo === 'PAGAR' && Boolean(baixaForm.usar_cheque_terceiro);
  const chequesTerceirosDisponiveis = useMemo(
    () => chequesTerceiros.filter((cheque) => String(cheque?.status || '').toUpperCase() === 'EM_CARTEIRA'),
    [chequesTerceiros]
  );
  const contasFinanceirasCompativeisBaixa = useMemo(
    () => baixaUsaDinheiro
      ? contasBancariasBaixa.filter((conta) => contaExigeControleDiario(conta))
      : contasBancariasBaixa,
    [baixaUsaDinheiro, contasBancariasBaixa]
  );
  const contaSelecionadaBaixa = useMemo(
    () => contasBancarias.find((conta) => String(conta.id) === String(baixaForm.conta_bancaria_id)) || null,
    [baixaForm.conta_bancaria_id, contasBancarias]
  );

  useEffect(() => {
    let ativo = true;

    if (!baixaPagaComChequeTerceiro) {
      setChequesTerceiros([]);
      setLoadingChequesTerceiros(false);
      return () => {
        ativo = false;
      };
    }

    setLoadingChequesTerceiros(true);
    getChequesTerceirosDisponiveis()
      .then((data) => {
        if (ativo) setChequesTerceiros(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!ativo) return;
        setChequesTerceiros([]);
        setError(err?.message || 'Erro ao consultar cheques de terceiros disponiveis.');
      })
      .finally(() => {
        if (ativo) setLoadingChequesTerceiros(false);
      });

    return () => {
      ativo = false;
    };
  }, [baixaPagaComChequeTerceiro]);

  const empresaTituloId = String(titulo?.empresa_id || '');
  const baixaEmpresaDiferente = Boolean(
    empresaTituloId &&
    baixaForm.empresa_id &&
    String(baixaForm.empresa_id) !== empresaTituloId
  );
  const mostrarIntercompanyBaixa = baixaEmpresaDiferente || baixaForm.intercompany;

  function aplicarEmpresaFonteBaixa(current, empresaFonteId) {
    const empresaResolvidaId = String(empresaFonteId || titulo?.empresa_id || '');
    const empresaDiferente = Boolean(
      empresaTituloId && empresaResolvidaId && empresaResolvidaId !== empresaTituloId
    );
    const base = {
      ...current,
      empresa_id: empresaResolvidaId,
      intercompany: empresaDiferente || current.intercompany
    };
    return empresaDiferente
      ? applyNaturezaBaixaIntercompany(base, current.natureza_intercompany_baixa || 'OPERACIONAL_TERCEIRO')
      : base;
  }

  function selecionarContaBaixa(contaBancariaId) {
    const conta = contasBancarias.find((item) => String(item.id) === String(contaBancariaId));
    setBaixaForm((current) => aplicarEmpresaFonteBaixa({
      ...current,
      conta_bancaria_id: contaBancariaId
    }, conta?.empresa_id));
  }

  async function handleSalvarCobranca(event) {
    event.preventDefault();
    try {
      setSavingCobranca(true);
      setError('');
      const payload = {
        forma_cobranca: cobrancaForm.forma_cobranca || null,
        status_cobranca: cobrancaForm.forma_cobranca ? cobrancaForm.status_cobranca : null,
        banco_cobranca: cobrancaForm.banco_cobranca || null,
        nosso_numero: cobrancaForm.nosso_numero || null,
        linha_digitavel: cobrancaForm.linha_digitavel || null,
        codigo_barras: cobrancaForm.codigo_barras || null,
        identificador_externo: cobrancaForm.identificador_externo || null,
        boleto_emitido_em: cobrancaForm.boleto_emitido_em || null
      };
      await atualizarCobrancaTituloFinanceiro(id, payload);
      // Recarrega primeiro e avisa depois: `carregar()` limpa o estado de
      // erro da tela, e avisar antes apagaria a confirmação recém-pintada.
      await carregar();
      avisar.sucesso('Dados de cobrança atualizados com sucesso.');
    } catch (err) {
      setError(err?.message || 'Erro ao atualizar cobranca do titulo');
    } finally {
      setSavingCobranca(false);
    }
  }

  async function handleBaixaSubmit(event) {
    event.preventDefault();
    if (bloqueadoPorRetornoObra) {
      setError(titulo?.bloqueio_retorno_motivo || 'Baixa bloqueada por pedido de retorno da Obra.');
      return;
    }
    if (!baixaForm.forma_recebimento) {
      setError(`Informe a ${baixaFormaLabel.toLowerCase()} da baixa.`);
      return;
    }
    if (baixaUsaCartao && !baixaForm.cartao_id) {
      setError('Informe o cartao utilizado na baixa.');
      return;
    }
    if (baixaCartaoDebito && !baixaForm.conta_bancaria_id) {
      setError('Cartao de debito precisa ter conta bancaria vinculada.');
      return;
    }
    if (baixaUsaDinheiro && !baixaForm.conta_bancaria_id) {
      setError('Selecione o caixa fisico usado na baixa em dinheiro.');
      return;
    }
    if (baixaUsaDinheiro && !contaExigeControleDiario(contaSelecionadaBaixa)) {
      setError('A baixa em dinheiro deve usar uma conta de caixa fisico com controle de abertura e fechamento.');
      return;
    }
    if (contaBancariaObrigatoria(baixaForm.forma_recebimento) && !baixaPagaComChequeTerceiro && !baixaForm.conta_bancaria_id) {
      setError('Informe a conta bancaria da baixa.');
      return;
    }
    if (baixaEmpresaDiferente && !baixaForm.intercompany) {
      setError('A empresa da baixa e diferente da empresa do titulo. A baixa precisa ser marcada como Entre Empresas.');
      return;
    }
    if (baixaForm.intercompany && !baixaForm.tipo_intercompany) {
      setError('Informe a natureza da baixa Entre Empresas.');
      return;
    }
    if (baixaPagaComChequeTerceiro && !baixaForm.cheque_terceiro_id) {
      setError('Selecione o cheque de terceiro que sera usado no pagamento.');
      return;
    }
    if (baixaUsaCheque && !baixaPagaComChequeTerceiro && (!String(baixaForm.cheque_numero || '').trim() || !String(baixaForm.cheque_emitente || '').trim())) {
      setError('Informe numero e emitente do cheque usado na baixa.');
      return;
    }
    try {
      setSavingBaixa(true);
      setError('');
      await baixarTituloFinanceiro(id, baixaForm);
      setModalBaixaOpen(false);
      setCorrigindoMovimentoId(null);
      setBaixaForm(buildBaixaForm(titulo, contasBancarias));
      // Recarrega primeiro e avisa depois (mesma razão do salvar cobranca).
      await carregar();
      avisar.sucesso(corrigindoMovimentoId ? 'Baixa corrigida com sucesso.' : 'Baixa registrada com sucesso.');
    } catch (err) {
      setError(err?.message || 'Erro ao registrar baixa');
    } finally {
      setSavingBaixa(false);
    }
  }

  async function handleEstornar(movimentoId) {
    // confirmar() devolve { ok, texto } — objeto é sempre truthy, então o
    // retorno TEM de ser desestruturado (R21), senão "Cancelar" estornaria.
    const { ok } = await confirmar({
      titulo: 'Estornar baixa',
      mensagem: 'Confirmar estorno desta baixa?',
      rotuloConfirmar: 'Estornar',
      destrutiva: true
    });
    if (!ok) return;

    try {
      setEstornandoId(movimentoId);
      setError('');
      await estornarMovimentoFinanceiro(id, movimentoId, {});
      // Recarrega primeiro e avisa depois (mesma razão do salvar cobranca).
      await carregar();
      avisar.sucesso('Baixa estornada com sucesso.');
    } catch (err) {
      setError(err?.message || 'Erro ao estornar baixa');
    } finally {
      setEstornandoId(null);
    }
  }

  async function handleCorrigirBaixa(movimento) {
    const { ok } = await confirmar({
      titulo: 'Corrigir baixa',
      mensagem: 'Confirmar estorno desta baixa e abrir a correção para alterar conta bancária e data?',
      rotuloConfirmar: 'Estornar e corrigir',
      destrutiva: true
    });
    if (!ok) return;

    try {
      setCorrigindoMovimentoId(movimento.id);
      setEstornandoId(movimento.id);
      setError('');
      const tituloAtualizado = await estornarMovimentoFinanceiro(id, movimento.id, {
        observacoes: 'Baixa estornada para correcao de conta bancaria/data.'
      });
      setTitulo(tituloAtualizado);
      setBaixaForm(buildBaixaForm(tituloAtualizado, contasBancarias, movimento));
      setModalBaixaOpen(true);
      const auditoriaData = await getTituloFinanceiroAuditoria(id);
      setAuditoria(Array.isArray(auditoriaData) ? auditoriaData : []);
    } catch (err) {
      setCorrigindoMovimentoId(null);
      setError(err?.message || 'Erro ao preparar correcao da baixa');
    } finally {
      setEstornandoId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--c-muted)]">Carregando título financeiro...</p>;
  }

  if (!titulo) {
    return <p className="text-sm text-[var(--c-muted)]">Título financeiro não encontrado.</p>;
  }


  return (
    <>
      <Pagina>
        {/* C3 (R11 revisto, 02/09): tela de DETALHE tem a seta de voltar à
            esquerda SEMPRE — a R11 só remove "Voltar" redundante de LISTAGEM. */}
        <PageHeader
          titulo={`Titulo ${titulo.codigo || `#${titulo.id}`}`}
          descricao={titulo.descricao || undefined}
          voltar={{ to: '/financeiro/titulos', title: 'Voltar para títulos' }}
          acaoPrincipal={{
            rotulo: 'Registrar baixa',
            desabilitada: bloqueadoPorRetornoObra
              || !['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase()),
            title: bloqueadoPorRetornoObra
              ? (titulo.bloqueio_retorno_motivo || 'Baixa bloqueada por pedido de retorno da Obra')
              : undefined,
            onClick: () => {
              setError('');
              setCorrigindoMovimentoId(null);
              setBaixaForm(buildBaixaForm(titulo, contasBancarias));
              setModalBaixaOpen(true);
            }
          }}
          /*
            "ABRIR SOLICITAÇÃO" SAIU DAQUI (decisão do cliente, 04/09).

            Terceira linha da regra de navegação: link para o REGISTRO
            RELACIONADO mora no corpo, junto do dado que o origina — nunca
            na barra de ações nem no menu "⋯".

            Ao lado do dado o link explica por que existe; na barra de ações
            fica sem contexto, e é essa falta de contexto que a C6 chama de
            navegação vestida de ação.

            Aqui não se perdeu caminho nenhum: o link JÁ existia no corpo, no
            campo "Solicitacao" do bloco de dados, com o código clicável.
            A faixa trazia a MESMA navegação em duplicata.
          */
          secundarias={[
            podeEditarTitulo
              ? { rotulo: 'Editar título', to: `/financeiro/titulos/${titulo.id}/editar` }
              : {
                rotulo: 'Editar título',
                desabilitada: true,
                title: 'Somente titulos em aberto, sem baixa e sem pagamento em massa vinculado podem ser editados',
                onClick: () => {}
              }
          ].filter(Boolean)}
        />

        <Avisos avisos={avisos} aoFechar={fechar} />
        <TituloNegociacaoHistorico titulo={titulo} />

        {error && (
          <div className="app-alert app-alert--error">
            {error}
          </div>
        )}

        {bloqueadoPorRetornoObra && (
          <div className="app-alert app-alert--warning" role="status">
            <strong>Baixa temporariamente bloqueada.</strong>{' '}
            {titulo.bloqueio_retorno_motivo || 'A Obra solicitou o retorno da solicitacao vinculada a este titulo.'}
            {' '}O bloqueio sera removido quando a solicitacao voltar ao Financeiro.
          </div>
        )}

        {/* Pergunta central da tela: "quanto falta deste titulo e o que fazer
            com ele?" — os quatro numeros que decidem vem primeiro. */}
        <StatGrid colunas={4}>
          <StatTile label="Tipo" valor={titulo.tipo} />
          <StatTile label="Status" valor={<StatusBadge status={titulo.status} />} />
          <StatTile label="Valor original" valor={formatCurrency(titulo.valor_original)} />
          <StatTile
            label="Saldo"
            valor={formatCurrency(titulo.valor_saldo)}
            tom={Number(titulo.valor_saldo) > 0 ? 'warning' : 'success'}
          />
        </StatGrid>

        {/* "Dados do titulo" + "Resumo operacional" eram dois blocos 50/50
            disputando atencao (15 campos vs 4). Viraram UM bloco principal em
            largura total; o codigo saiu daqui porque ja e o titulo da pagina
            (informacao aparece uma vez). Campos vazios ficam atras do
            alternador — nenhum dado deixou de existir. */}
        {/* B3: a descrição do título mora na FAIXA (apoio do registro) —
            repetir aqui era a mesma informação duas vezes na tela. */}
        <BlocoConteudo
          titulo="Dados do título"
          variante="primario"
          cor="var(--module-financeiro)"
        >
          <CamposComVazios
            colunas={4}
            campos={[
              { label: 'Parceiro', valor: titulo.parceiro?.nome, span: 2 },
              { label: 'Obra', valor: titulo.obra?.nome, span: 2 },
              { label: 'Vencimento', valor: formatDate(titulo.data_vencimento) === '-' ? null : formatDate(titulo.data_vencimento) },
              { label: 'Emissão', valor: formatDate(titulo.data_emissao) === '-' ? null : formatDate(titulo.data_emissao) },
              { label: 'Valor baixado', valor: Number(titulo.valor_baixado) > 0 ? formatCurrency(titulo.valor_baixado) : null },
              { label: 'Quitacao', valor: formatDate(titulo.data_quitacao) === '-' ? null : formatDate(titulo.data_quitacao) },
              { label: 'Categoria', valor: titulo.categoriaFinanceira?.nome },
              {
                label: 'Solicitação',
                valor: titulo.solicitacao?.id ? (
                  <Link className="text-[var(--c-primary)] hover:underline" to={`/solicitacoes/${titulo.solicitacao.id}`}>
                    {titulo.solicitacao.codigo || `#${titulo.solicitacao.id}`}
                  </Link>
                ) : null
              },
              { label: 'Criado por', valor: titulo.criadoPor?.nome },
              { label: 'Baixas ativas', valor: movimentosAtivosCount > 0 ? String(movimentosAtivosCount) : null },
              {
                label: cartoesUtilizados.length > 1 ? 'Cartoes utilizados' : 'Cartao utilizado',
                contexto: tituloRelacionadoACartao,
                valor: cartoesUtilizados.length > 0
                  ? cartoesUtilizados.map((cartao) => getCartaoLabel(cartao)).join(' · ')
                  : null
              },
              { label: 'Entre Empresas', valor: titulo.intercompany ? 'Sim' : null },
              { label: 'Origem', contexto: Boolean(titulo.intercompany), valor: titulo.empresaOrigem?.nome },
              { label: 'Destino', contexto: Boolean(titulo.intercompany), valor: titulo.empresaDestino?.nome },
              { label: 'Tipo intercompany', contexto: Boolean(titulo.intercompany), valor: labelTipoIntercompany(titulo.tipo_intercompany) },
              {
                label: 'Consolidado',
                contexto: Boolean(titulo.intercompany),
                valor: titulo.elimina_consolidado ? 'Elimina no consolidado' : 'Mantem no consolidado'
              }
            ]}
          />

          {podeVerMovimentosFinanceiros && fontesFinanceirasAtivas.length > 0 && (
            <div className="mt-3 border-t border-[var(--c-border)] pt-3">
              <div className="mb-2 text-sm font-medium text-[var(--c-text)]">
                {fontesFinanceirasAtivas.length > 1 ? 'Fontes das baixas' : 'Fonte da baixa'}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {fontesFinanceirasAtivas.map((fonte) => (
                  <div
                    key={`${fonte.empresa_nome}-${fonte.conta_bancaria_nome}`}
                    className="rounded-lg bg-[var(--ui-surface-2)] px-3 py-2"
                  >
                    <div className="text-xs text-[var(--c-muted)]">
                      {titulo.tipo === 'PAGAR' ? 'Empresa pagadora' : 'Empresa recebedora'}
                    </div>
                    <div className="text-sm font-medium text-[var(--c-text)]">{fonte.empresa_nome}</div>
                    <div className="mt-1 text-xs text-[var(--c-muted)]">Conta bancária</div>
                    <div className="text-sm font-medium text-[var(--c-text)]">{fonte.conta_bancaria_nome}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </BlocoConteudo>

        {/* O bloco tinha os MESMOS oito campos duas vezes: grid somente-leitura
            + formulario logo abaixo (inicializado do proprio titulo). Ficou so
            a versao editavel — e o break-all letra a letra saiu junto. */}
        {titulo.tipo === 'RECEBER' && (
          <BlocoConteudo
            titulo="Cobrança externa"
            variante="secundario"
            recolhivel
            recolhidoPadrao={!titulo.forma_cobranca}
            acoes={titulo.forma_cobranca ? (
              <StatusBadge status={`${titulo.forma_cobranca}${titulo.status_cobranca && titulo.status_cobranca !== 'NAO_APLICAVEL' ? ` - ${titulo.status_cobranca}` : ''}`} />
            ) : null}
          >
            <p className="app-note mb-3">
              Use esta área para complementar o título com os dados do boleto emitido diretamente no banco.
            </p>

            <form className="grid gap-3 md:grid-cols-4" onSubmit={handleSalvarCobranca}>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Forma de cobrança</span>
                <select
                  className="input w-full"
                  value={cobrancaForm.forma_cobranca}
                  onChange={(event) => setCobrancaForm((current) => ({
                    ...current,
                    forma_cobranca: event.target.value,
                    status_cobranca: event.target.value ? current.status_cobranca : 'PENDENTE_EMISSAO'
                  }))}
                >
                  <option value="">Não controlar</option>
                  {FORMAS_COBRANCA.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted">Status da cobrança</span>
                <select
                  className="input w-full"
                  value={cobrancaForm.status_cobranca}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, status_cobranca: event.target.value }))}
                  disabled={!cobrancaForm.forma_cobranca}
                >
                  {STATUS_COBRANCA.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted">Código do banco</span>
                <input
                  className="input w-full"
                  inputMode="numeric"
                  maxLength={8}
                  pattern="[0-9]*"
                  value={cobrancaForm.banco_cobranca}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, banco_cobranca: normalizeCodigoBancoInput(event.target.value) }))}
                  placeholder="Ex.: 001, 104, 237"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted">Emitido em</span>
                <DateInputBR
                  className="input w-full"
                  value={cobrancaForm.boleto_emitido_em}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, boleto_emitido_em: event.target.value }))}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted">Nosso número</span>
                <input
                  className="input w-full"
                  value={cobrancaForm.nosso_numero}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, nosso_numero: event.target.value }))}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted">Identificador externo</span>
                <input
                  className="input w-full"
                  value={cobrancaForm.identificador_externo}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, identificador_externo: event.target.value }))}
                />
              </label>

              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-muted">Linha digitável</span>
                <input
                  className="input w-full"
                  value={cobrancaForm.linha_digitavel}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, linha_digitavel: event.target.value }))}
                />
              </label>

              <label className="text-sm md:col-span-4">
                <span className="mb-1 block text-muted">Código de barras</span>
                <input
                  className="input w-full"
                  value={cobrancaForm.codigo_barras}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, codigo_barras: event.target.value }))}
                />
              </label>

              <div className="md:col-span-4 flex justify-end">
                <button type="submit" className="btn btn-primary" disabled={savingCobranca}>
                  {savingCobranca ? 'Salvando...' : 'Salvar dados de cobranca'}
                </button>
              </div>
            </form>
          </BlocoConteudo>
        )}

        {String(titulo.tipo || '').toUpperCase() === 'PAGAR' && (
          <BlocoConteudo
            titulo="Boleto para pagamento"
            variante="secundario"
            recolhivel
            recolhidoPadrao={!titulo.linha_digitavel && !titulo.codigo_barras}
            acoes={(titulo.linha_digitavel || titulo.codigo_barras) ? (
              <StatusBadge status="Pronto para remessa" />
            ) : null}
          >
            <p className="app-note mb-3">
              A linha digitável ou código de barras habilita este título para remessa Caixa CNAB240 em Bancos Enterprise.
            </p>

            <form className="grid gap-3 md:grid-cols-4" onSubmit={handleSalvarCobranca}>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Código do banco</span>
                <input
                  className="input w-full"
                  inputMode="numeric"
                  maxLength={8}
                  pattern="[0-9]*"
                  value={cobrancaForm.banco_cobranca}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, banco_cobranca: normalizeCodigoBancoInput(event.target.value) }))}
                  placeholder="Ex.: 001, 104, 237"
                />
              </label>

              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-muted">Linha digitável</span>
                <input
                  className="input w-full"
                  value={cobrancaForm.linha_digitavel}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, linha_digitavel: event.target.value }))}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted">Código de barras</span>
                <input
                  className="input w-full"
                  value={cobrancaForm.codigo_barras}
                  onChange={(event) => setCobrancaForm((current) => ({ ...current, codigo_barras: event.target.value }))}
                />
              </label>

              <div className="md:col-span-4 flex justify-end">
                <button type="submit" className="btn btn-primary" disabled={savingCobranca}>
                  {savingCobranca ? 'Salvando...' : 'Salvar dados do boleto'}
                </button>
              </div>
            </form>
          </BlocoConteudo>
        )}

        {String(titulo.tipo || '').toUpperCase() === 'PAGAR' && podeVerPagamentosBancarios && (
          <BlocoConteudo
            titulo="Pagamentos bancários"
            variante="secundario"
            recolhivel
            recolhidoPadrao={!Array.isArray(titulo.paymentIntents) || titulo.paymentIntents.length === 0}
            acoes={<Link to="/financeiro/pagamentos" className="btn btn-outline btn-sm">Abrir pagamentos</Link>}
          >
            <p className="app-note mb-3">Status bancário separado do status financeiro do título.</p>

            {!Array.isArray(titulo.paymentIntents) || titulo.paymentIntents.length === 0 ? (
              <div className="rounded-xl bg-[var(--c-bg)] px-3 py-4 text-sm text-[var(--c-muted)]">
                Nenhuma intenção de pagamento criada para este título.
              </div>
            ) : (
              <div className="space-y-3">
                {titulo.paymentIntents.map((intent) => {
                  const batchItem = Array.isArray(intent.batchItems) ? intent.batchItems[0] : null;
                  const batch = batchItem?.batch;
                  return (
                    <div key={intent.id} className="rounded-xl border border-[var(--c-border)] px-3 py-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1 text-sm">
                          <div className="font-medium text-[var(--c-text)]">
                            Intent #{intent.id} - {formatCurrency(intent.valor)}
                          </div>
                          <div className="text-[var(--c-muted)]">
                            Lote: {batch?.codigo || 'Nao vinculado'}
                          </div>
                          <div className="text-[var(--c-muted)]">
                            Favorecido: {intent.beneficiary?.nome || '-'} - {intent.beneficiary?.pix_chave || '-'}
                          </div>
                          <div className="text-[var(--c-muted)]">
                            Envio: {formatDateTime(intent.enviado_em)} | Banco: {formatDateTime(intent.confirmado_banco_em)}
                          </div>
                          <div className="text-[var(--c-muted)]">
                            Baixa: {formatDateTime(intent.baixa_confirmada_em)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`app-status-pill ${paymentStatusClass(intent.status)}`}>
                            {intent.status}
                          </span>
                          {batch?.status && (
                            <span className={`app-status-pill ${paymentStatusClass(batch.status)}`}>
                              Lote {batch.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BlocoConteudo>
        )}

        {podeVerMovimentosFinanceiros && (
        <BlocoConteudo titulo="Movimentos financeiros" variante="secundario">
          {!Array.isArray(titulo.movimentos) || titulo.movimentos.length === 0 ? (
            <div className="rounded-xl bg-[var(--c-bg)] px-3 py-4 text-sm text-[var(--c-muted)]">
              Nenhum movimento registrado neste título.
            </div>
          ) : (
            <div className="space-y-3">
              {titulo.movimentos.map((movimento) => (
                <div key={movimento.id} className="rounded-xl border border-[var(--c-border)] px-3 py-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1 text-sm">
                      <div className="font-medium text-[var(--c-text)]">
                        {movimento.tipo_movimento} #{movimento.id}
                      </div>
                      <div className="text-[var(--c-muted)]">
                        {formatDate(movimento.data_movimento)} - {movimento.contaBancaria?.nome || 'Sem conta'}
                      </div>
                      <div className="text-[var(--c-muted)]">
                        Empresa pagadora: {movimento.empresa?.nome || movimento.empresa?.razao_social || 'Nao informada'}
                      </div>
                      <div className="text-[var(--c-muted)]">
                        {baixaFormaLabel}: {movimento.formaPagamento?.nome || movimento.forma_recebimento || 'Nao informada'}
                        {movimento.formaPagamento?.codigo ? ` · ${movimento.formaPagamento.codigo}` : ''}
                      </div>
                      <div className="text-[var(--c-muted)]">
                        Valor base {formatCurrency(movimento.valor)} - Juros {formatCurrency(movimento.juros)} - Multa {formatCurrency(movimento.multa)} - Desconto {formatCurrency(movimento.desconto)}
                      </div>
                      <div className="text-[var(--c-muted)]">
                        Quitacao {formatCurrency(movimento.valor_quitacao)}
                      </div>
                      {String(movimento.forma_recebimento || '').toUpperCase().includes('CHEQUE') && movimento.cheque_numero ? (
                        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-xs text-[var(--c-muted)]">
                          <strong className="block text-[var(--c-text)]">Cheque nº {movimento.cheque_numero}</strong>
                          <span>
                            Emitente: {movimento.cheque_emitente || 'Nao informado'}
                            {movimento.cheque_titular_documento ? ` · CPF/CNPJ ${movimento.cheque_titular_documento}` : ''}
                          </span>
                          {(movimento.cheque_banco || movimento.cheque_agencia || movimento.cheque_conta) ? (
                            <span className="block">
                              {movimento.cheque_banco || 'Banco nao informado'}
                              {movimento.cheque_agencia ? ` · Ag. ${movimento.cheque_agencia}` : ''}
                              {movimento.cheque_conta ? ` · Conta ${movimento.cheque_conta}` : ''}
                            </span>
                          ) : null}
                          {(movimento.cheque_data_emissao || movimento.cheque_data_vencimento) ? (
                            <span className="block">
                              {movimento.cheque_data_emissao ? `Emissao ${formatDate(movimento.cheque_data_emissao)}` : ''}
                              {movimento.cheque_data_vencimento ? ` · Vencimento ${formatDate(movimento.cheque_data_vencimento)}` : ''}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {(movimento.intercompany_group_id || movimento.tipo_intercompany) && (
                        <div className="text-[var(--c-muted)]">
                          Entre Empresas: {labelTipoIntercompany(movimento.tipo_intercompany)}
                          {movimento.empresaOrigem?.nome || movimento.empresaDestino?.nome
                            ? ` - ${movimento.empresaOrigem?.nome || 'Origem'} -> ${movimento.empresaDestino?.nome || 'Destino'}`
                            : ''}
                        </div>
                      )}
                      {(movimento.tipo_permuta || movimento.categoria_bem || movimento.descricao_bem || movimento.valor_referencia_bem) && (
                        <div className="text-[var(--c-muted)]">
                          {movimento.tipo_permuta ? `Permuta: ${movimento.tipo_permuta}. ` : ''}
                          {movimento.categoria_bem ? `Categoria do bem: ${movimento.categoria_bem}. ` : ''}
                          {movimento.descricao_bem ? `Bem: ${movimento.descricao_bem}. ` : ''}
                          {movimento.valor_referencia_bem ? `Referencia ${formatCurrency(movimento.valor_referencia_bem)}.` : ''}
                        </div>
                      )}
                      {movimento.observacoes && (
                        <div className="text-[var(--c-muted)] whitespace-pre-wrap">{movimento.observacoes}</div>
                      )}
                    </div>

                    <div className="flex flex-col items-start gap-2 md:items-end">
                      <StatusBadge status={movimento.status} />
                      {String(movimento.status || '').toUpperCase() === 'ATIVO' && (
                        <div className="app-actionbar md:justify-end">
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={Boolean(titulo.renegociado_por_id) || estornandoId === movimento.id || savingBaixa}
                            title={titulo.renegociado_por_id ? 'Baixa anterior preservada pela negociação. Consulte os novos títulos.' : undefined}
                            onClick={() => handleCorrigirBaixa(movimento)}
                          >
                            {corrigindoMovimentoId === movimento.id && estornandoId === movimento.id
                              ? 'Preparando...'
                              : 'Corrigir baixa'}
                          </button>
                          <span className="app-actionbar-apartada">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm btn-perigo-suave"
                              disabled={Boolean(titulo.renegociado_por_id) || estornandoId === movimento.id || savingBaixa}
                              title={titulo.renegociado_por_id ? 'Baixa anterior preservada pela negociação. Consulte os novos títulos.' : undefined}
                              onClick={() => handleEstornar(movimento.id)}
                            >
                              {estornandoId === movimento.id && corrigindoMovimentoId !== movimento.id
                                ? 'Estornando...'
                                : 'Estornar'}
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </BlocoConteudo>
        )}

        {/* Historico por ultimo e recolhido por padrao (regra 1 da organizacao:
            dado que gera acao primeiro, registro depois). */}
        {podeVerAuditoriaFinanceira && (
        <BlocoConteudo
          titulo="Auditoria financeira"
          variante="secundario"
          recolhivel
          recolhidoPadrao
        >
          <p className="app-note mb-3">Criação, baixas e estornos ficam rastreados no backend.</p>

          {auditoria.length === 0 ? (
            <div className="rounded-xl bg-[var(--c-bg)] px-3 py-4 text-sm text-[var(--c-muted)]">
              Nenhum evento auditável encontrado para este título.
            </div>
          ) : (
            <div className="space-y-3">
              {auditoria.map((evento) => {
                const fontesFinanceiras = Array.isArray(evento.fontes_financeiras)
                  ? evento.fontes_financeiras
                  : [];
                const metadata = formatAuditMetadata(evento.metadata, {
                  hideFinancialReferenceIds: fontesFinanceiras.length > 0
                });

                return (
                  <div key={evento.id} className="rounded-xl border border-[var(--c-border)] px-3 py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-[var(--c-text)]">{evento.label}</div>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${auditStatusClass(evento.status)}`}>
                            {evento.status}
                          </span>
                        </div>
                        <div className="text-sm text-[var(--c-muted)]">
                          {evento.descricao || 'Evento financeiro registrado'}
                        </div>
                        <div className="text-xs text-[var(--c-muted)]">
                          {evento.usuario?.nome || evento.usuario?.email || 'Sistema'} - {formatDateTime(evento.criado_em)}
                        </div>
                        {fontesFinanceiras.length > 0 && (
                          <div className="grid gap-2 pt-2 sm:grid-cols-2">
                            {fontesFinanceiras.map((fonte, index) => (
                              <div
                                key={`${evento.id}-${fonte.movimento_id || index}`}
                                className="rounded-lg bg-[var(--c-bg)] px-3 py-2 text-xs"
                              >
                                <div className="text-[var(--c-muted)]">
                                  {titulo.tipo === 'PAGAR' ? 'Empresa pagadora' : 'Empresa recebedora'}
                                </div>
                                <div className="font-medium text-[var(--c-text)]">
                                  {fonte.empresa?.nome || fonte.empresa?.razao_social || 'Empresa nao informada'}
                                </div>
                                <div className="mt-1 text-[var(--c-muted)]">Conta bancária</div>
                                <div className="font-medium text-[var(--c-text)]">
                                  {fonte.conta_bancaria?.nome || 'Sem conta bancaria vinculada'}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {metadata.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {metadata.map((item) => (
                              <span
                                key={`${evento.id}-${item.key}`}
                                className="rounded-full bg-[var(--ui-surface-2)] px-2 py-1 text-xs text-[var(--c-text)]"
                              >
                                {item.label}: {item.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BlocoConteudo>
        )}
      </Pagina>

      {modalBaixaOpen && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 px-4 py-4">
          <div className="card flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden p-0">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--c-border)] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>
                  {corrigindoMovimentoId ? 'Corrigir baixa' : 'Registrar baixa'}
                </h3>
                <p className="text-sm text-[var(--c-muted)]">
                  {corrigindoMovimentoId
                    ? 'A baixa anterior ja foi estornada. Ajuste conta bancaria, data e demais campos antes de salvar.'
                    : 'Use baixa parcial ou total. O saldo do titulo sera atualizado no backend.'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setModalBaixaOpen(false);
                  setCorrigindoMovimentoId(null);
                  setBaixaForm(buildBaixaForm(titulo, contasBancarias));
                }}
              >
                Fechar
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleBaixaSubmit}>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted">{baixaFormaLabel}</span>
                  <select
                    className="input w-full"
                    value={baixaForm.forma_recebimento}
                    onChange={(event) => setBaixaForm((current) => ({
                      ...current,
                      forma_recebimento: event.target.value,
                      cartao_id: '',
                      usar_cheque_terceiro: false,
                      cheque_terceiro_id: '',
                      cheque_numero: '',
                      cheque_emitente: '',
                      cheque_banco: '',
                      cheque_agencia: '',
                      cheque_conta: '',
                      titular_documento: '',
                      data_emissao: '',
                      data_vencimento: '',
                      conta_bancaria_id: ''
                    }))}
                  >
                    <option value="">Não informar</option>
                    {FORMAS_RECEBIMENTO.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>

                {baixaUsaCartao ? (
                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-muted">Cartão utilizado</span>
                    <select
                      className="input w-full"
                      value={baixaForm.cartao_id}
                      onChange={(event) => {
                        const cartaoSelecionado = cartoes.find((cartao) => String(cartao.id) === String(event.target.value));
                        const contaCartao = contasBancarias.find((conta) => String(conta.id) === String(cartaoSelecionado?.conta_bancaria_id));
                        const contaCartaoId = isCartaoDebito(cartaoSelecionado) ? String(contaCartao?.id || '') : '';
                        setBaixaForm((current) => aplicarEmpresaFonteBaixa({
                          ...current,
                          cartao_id: event.target.value,
                          conta_bancaria_id: contaCartaoId
                        }, contaCartao?.empresa_id));
                      }}
                      required
                    >
                      <option value="">Selecione o cartão</option>
                      {cartoesBaixa.map((cartao) => (
                        <option key={cartao.id} value={cartao.id}>
                          {getCartaoLabel(cartao)}
                        </option>
                      ))}
                    </select>
                    {baixaCartaoDebito ? (
                      <span className="mt-1 block text-xs text-[var(--c-muted)]">
                        Cartão de débito baixa pela conta bancária vinculada ao cartão.
                      </span>
                    ) : null}
                  </label>
                ) : null}

                {baixaUsaCheque && tituloTipo === 'PAGAR' ? (
                  <div className="rounded-xl border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] p-3 text-sm text-[var(--sem-warning)] md:col-span-2">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(baixaForm.usar_cheque_terceiro)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setBaixaForm((current) => ({
                            ...current,
                            usar_cheque_terceiro: checked,
                            cheque_terceiro_id: checked ? current.cheque_terceiro_id : '',
                            cheque_numero: checked ? '' : current.cheque_numero,
                            cheque_emitente: checked ? '' : current.cheque_emitente
                          }));
                        }}
                      />
                      <span>
                        <span className="block font-semibold">Usar cheque de terceiro em carteira</span>
                        <span className="block text-xs text-[var(--sem-warning)]">
                          Use quando o pagamento for feito com um cheque recebido anteriormente de cliente ou parceiro.
                        </span>
                      </span>
                    </label>
                    {baixaPagaComChequeTerceiro ? (
                      <label className="mt-3 block text-sm">
                        <span className="mb-1 block text-[var(--sem-warning)]">Cheque disponível</span>
                        <select
                          className="input w-full bg-white"
                          value={baixaForm.cheque_terceiro_id || ''}
                          onChange={(event) => {
                            const cheque = chequesTerceirosDisponiveis.find((item) => String(item.id) === String(event.target.value));
                            setBaixaForm((current) => aplicarEmpresaFonteBaixa({
                              ...current,
                              cheque_terceiro_id: event.target.value
                            }, cheque?.empresa_id));
                          }}
                          required
                        >
                          <option value="">Selecione o cheque</option>
                          {chequesTerceirosDisponiveis.map((cheque) => (
                            <option key={cheque.id} value={cheque.id}>
                              {formatChequeTerceiroLabel(cheque)}
                            </option>
                          ))}
                        </select>
                        {loadingChequesTerceiros ? (
                          <span className="mt-1 block text-xs text-[var(--sem-warning)]">
                            Consultando cheques em carteira...
                          </span>
                        ) : !chequesTerceirosDisponiveis.length ? (
                          <span className="mt-1 block text-xs text-[var(--sem-warning)]">
                            Nenhum cheque de terceiro em carteira foi encontrado.
                          </span>
                        ) : null}
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {baixaUsaCheque && !baixaPagaComChequeTerceiro ? (
                  <div className="rounded-xl border border-[var(--sem-info-border)] bg-[var(--sem-info-bg)] p-3 text-sm text-[var(--sem-info)] md:col-span-2">
                    <div className="mb-3 text-xs text-[var(--sem-info)]">
                      {baixaRecebeChequeTerceiro
                        ? 'Ao confirmar um recebimento por cheque, o sistema registra automaticamente o documento na carteira de cheques de terceiros.'
                        : 'Informe os dados do cheque emitido para identificar e auditar o pagamento deste titulo.'}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label>
                        <span className="mb-1 block text-[var(--sem-info)]">Número do cheque</span>
                        <input
                          className="input w-full bg-white"
                          value={baixaForm.cheque_numero}
                          onChange={(event) => setBaixaForm((current) => ({ ...current, cheque_numero: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[var(--sem-info)]">Emitente / titular</span>
                        <input
                          className="input w-full bg-white"
                          value={baixaForm.cheque_emitente}
                          onChange={(event) => setBaixaForm((current) => ({ ...current, cheque_emitente: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[var(--sem-info)]">CPF/CNPJ do titular</span>
                        <input
                          className="input w-full bg-white"
                          value={baixaForm.titular_documento}
                          onChange={(event) => setBaixaForm((current) => ({ ...current, titular_documento: event.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[var(--sem-info)]">Banco</span>
                        <input
                          className="input w-full bg-white"
                          value={baixaForm.cheque_banco}
                          onChange={(event) => setBaixaForm((current) => ({ ...current, cheque_banco: event.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[var(--sem-info)]">Agência</span>
                        <input
                          className="input w-full bg-white"
                          value={baixaForm.cheque_agencia}
                          onChange={(event) => setBaixaForm((current) => ({ ...current, cheque_agencia: event.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[var(--sem-info)]">Conta</span>
                        <input
                          className="input w-full bg-white"
                          value={baixaForm.cheque_conta}
                          onChange={(event) => setBaixaForm((current) => ({ ...current, cheque_conta: event.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[var(--sem-info)]">Emissão</span>
                        <DateInputBR
                          className="input w-full bg-white"
                          value={baixaForm.data_emissao}
                          onChange={(event) => setBaixaForm((current) => ({ ...current, data_emissao: event.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[var(--sem-info)]">Vencimento</span>
                        <DateInputBR
                          className="input w-full bg-white"
                          value={baixaForm.data_vencimento}
                          onChange={(event) => setBaixaForm((current) => ({ ...current, data_vencimento: event.target.value }))}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                <label className="text-sm">
                  <span className="mb-1 block text-muted">
                    {baixaUsaDinheiro ? 'Caixa fisico *' : 'Conta bancaria'}
                  </span>
                  <select
                    className="input w-full"
                    value={baixaForm.conta_bancaria_id}
                    onChange={(event) => selecionarContaBaixa(event.target.value)}
                    required={(contaBancariaObrigatoria(baixaForm.forma_recebimento) && !baixaPagaComChequeTerceiro) || baixaCartaoDebito}
                    disabled={baixaUsaCartao}
                  >
                    <option value="">
                      {baixaUsaCartao
                        ? (baixaCartaoDebito ? 'Conta vinculada ao cartao' : 'Cartao de credito sem baixa bancaria imediata')
                        : 'Selecione uma conta'}
                    </option>
                    {contasFinanceirasCompativeisBaixa.map((conta) => (
                      <option key={conta.id} value={conta.id}>
                        {conta.nome}
                      </option>
                    ))}
                  </select>
                  {baixaUsaDinheiro ? (
                    <span className="mt-1 block text-xs text-muted">
                      {contasFinanceirasCompativeisBaixa.length
                        ? 'O caixa precisa estar aberto e incluir a data deste movimento.'
                        : 'Nenhuma conta de caixa fisico com controle diario foi encontrada.'}
                    </span>
                  ) : null}
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-muted">Data do movimento</span>
                  <DateInputBR
                    className="input w-full"
                    value={baixaForm.data_movimento}
                    onChange={(event) => setBaixaForm((current) => ({ ...current, data_movimento: event.target.value }))}
                    required
                  />
                </label>
              </div>

              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                <label className="flex items-start gap-2 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(baixaForm.intercompany)}
                    disabled={baixaEmpresaDiferente}
                    onChange={(event) => setBaixaForm((current) => {
                      if (event.target.checked) {
                        return applyNaturezaBaixaIntercompany(
                          { ...current, intercompany: true },
                          current.natureza_intercompany_baixa || 'OPERACIONAL_TERCEIRO'
                        );
                      }
                      return {
                        ...current,
                        intercompany: false,
                        natureza_intercompany_baixa: 'OPERACIONAL_TERCEIRO',
                        tipo_intercompany: '',
                        motivo_intercompany: '',
                        elimina_consolidado: false,
                        transferencia_interna: false
                      };
                    })}
                  />
                  <span>
                    <span className="block font-semibold">Baixa Entre Empresas</span>
                    <span className="block text-xs text-[var(--c-muted)]">
                      Use quando uma empresa paga ou recebe um título que pertence a outra empresa do grupo.
                    </span>
                  </span>
                </label>

                {mostrarIntercompanyBaixa && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-sm md:col-span-2">
                      <span className="mb-1 block text-muted">Natureza da baixa</span>
                      <select
                        className="input w-full"
                        value={baixaForm.natureza_intercompany_baixa || 'OPERACIONAL_TERCEIRO'}
                        onChange={(event) => setBaixaForm((current) => applyNaturezaBaixaIntercompany(current, event.target.value))}
                        required={Boolean(baixaForm.intercompany)}
                      >
                        {NATUREZAS_INTERCOMPANY_BAIXA.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs text-[var(--c-muted)]">
                        {getNaturezaBaixaIntercompany(baixaForm.natureza_intercompany_baixa).description}
                      </span>
                    </label>
                    <label className="text-sm md:col-span-2">
                      <span className="mb-1 block text-muted">Motivo</span>
                      <input
                        className="input w-full"
                        value={baixaForm.motivo_intercompany}
                        onChange={(event) => setBaixaForm((current) => ({ ...current, motivo_intercompany: event.target.value }))}
                        placeholder="Ex.: pagamento feito pela tesouraria"
                      />
                    </label>
                    <div className="md:col-span-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-[var(--c-muted)]">
                      <div className="font-semibold text-[var(--c-text)]">Impacto financeiro</div>
                      <div>
                        Tipo interno: {labelTipoIntercompany(baixaForm.tipo_intercompany)}.
                        {baixaForm.elimina_consolidado === false
                          ? ' Mantem o valor nos relatorios operacionais e na DRE.'
                          : ' Elimina a relacao interna no consolidado.'}
                        {baixaForm.transferencia_interna === true
                          ? ' Sera tratado como transferencia interna.'
                          : ' Nao sera tratado como transferencia interna.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Tipo de permuta</span>
                  <input
                    className="input w-full"
                    value={baixaForm.tipo_permuta}
                    onChange={(event) => setBaixaForm((current) => ({ ...current, tipo_permuta: event.target.value }))}
                    placeholder="Ex.: carro + dinheiro"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Categoria do bem</span>
                  <select
                    className="input w-full"
                    value={baixaForm.categoria_bem}
                    onChange={(event) => setBaixaForm((current) => ({ ...current, categoria_bem: event.target.value }))}
                  >
                    <option value="">Não informar</option>
                    {CATEGORIAS_BEM.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Bem / descrição</span>
                  <input
                    className="input w-full"
                    value={baixaForm.descricao_bem}
                    onChange={(event) => setBaixaForm((current) => ({ ...current, descricao_bem: event.target.value }))}
                    placeholder="Veículo, imóvel, terreno..."
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Valor referência</span>
                  <input
                    className="input input-moeda w-full"
                    inputMode="decimal"
                    value={baixaForm.valor_referencia_bem}
                    onChange={(event) => setBaixaForm((current) => ({ ...current, valor_referencia_bem: normalizeCurrencyTyping(event.target.value) }))}
                    onBlur={(event) => setBaixaForm((current) => ({ ...current, valor_referencia_bem: formatCurrencyInput(event.target.value) }))}
                  />
                </label>
              </div>

              <label className="text-sm block">
                <span className="mb-1 block text-muted">Documento de referência</span>
                <input
                  className="input w-full"
                  value={baixaForm.documento_referencia}
                  onChange={(event) => setBaixaForm((current) => ({ ...current, documento_referencia: event.target.value }))}
                  placeholder="Número de contrato, recibo, placa, matrícula..."
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Valor base</span>
                  <input
                    className="input input-moeda w-full"
                    inputMode="decimal"
                    value={baixaForm.valor}
                    onChange={(event) => setBaixaForm((current) => ({ ...current, valor: normalizeCurrencyTyping(event.target.value) }))}
                    onBlur={(event) => setBaixaForm((current) => ({ ...current, valor: formatCurrencyInput(event.target.value) }))}
                    required
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Juros</span>
                  <input
                    className="input input-moeda w-full"
                    inputMode="decimal"
                    value={baixaForm.juros}
                    onChange={(event) => setBaixaForm((current) => ({ ...current, juros: normalizeCurrencyTyping(event.target.value) }))}
                    onBlur={(event) => setBaixaForm((current) => ({ ...current, juros: formatCurrencyInput(event.target.value, { emptyZero: false }) }))}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Multa</span>
                  <input
                    className="input input-moeda w-full"
                    inputMode="decimal"
                    value={baixaForm.multa}
                    onChange={(event) => setBaixaForm((current) => ({ ...current, multa: normalizeCurrencyTyping(event.target.value) }))}
                    onBlur={(event) => setBaixaForm((current) => ({ ...current, multa: formatCurrencyInput(event.target.value, { emptyZero: false }) }))}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Desconto</span>
                  <input
                    className="input input-moeda w-full"
                    inputMode="decimal"
                    value={baixaForm.desconto}
                    onChange={(event) => setBaixaForm((current) => ({ ...current, desconto: normalizeCurrencyTyping(event.target.value) }))}
                    onBlur={(event) => setBaixaForm((current) => ({ ...current, desconto: formatCurrencyInput(event.target.value, { emptyZero: false }) }))}
                  />
                </label>
              </div>

              <label className="text-sm block">
                <span className="mb-1 block text-muted">Observações</span>
                <textarea
                  className="input min-h-24 w-full"
                  value={baixaForm.observacoes}
                  onChange={(event) => setBaixaForm((current) => ({ ...current, observacoes: event.target.value }))}
                />
              </label>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--c-border)] bg-[var(--c-surface)] px-6 py-4">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setModalBaixaOpen(false);
                    setCorrigindoMovimentoId(null);
                    setBaixaForm(buildBaixaForm(titulo, contasBancarias));
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    savingBaixa ||
                    bloqueadoPorRetornoObra ||
                    !baixaForm.forma_recebimento ||
                    (baixaUsaCartao && !baixaForm.cartao_id) ||
                    (baixaCartaoDebito && !baixaForm.conta_bancaria_id) ||
                    (baixaUsaDinheiro && !contaExigeControleDiario(contaSelecionadaBaixa)) ||
                    (contaBancariaObrigatoria(baixaForm.forma_recebimento) && !baixaPagaComChequeTerceiro && !baixaForm.conta_bancaria_id) ||
                    (baixaPagaComChequeTerceiro && !baixaForm.cheque_terceiro_id) ||
                    (baixaUsaCheque && !baixaPagaComChequeTerceiro && (!baixaForm.cheque_numero || !baixaForm.cheque_emitente)) ||
                    !baixaForm.valor ||
                    (Boolean(baixaForm.intercompany) && !baixaForm.tipo_intercompany)
                  }
                >
                  {savingBaixa ? 'Salvando...' : corrigindoMovimentoId ? 'Salvar correcao' : 'Confirmar baixa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {elementoConfirmacao}
    </>
  );
}
