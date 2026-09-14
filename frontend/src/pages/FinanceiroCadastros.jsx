import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiXMark
} from 'react-icons/hi2';
import {
  atualizarCartaoFinanceiro,
  atualizarCategoriaFinanceira,
  atualizarContaBancaria,
  atualizarFormaPagamentoFinanceira,
  atualizarPaymentAccount,
  atualizarPaymentBeneficiary,
  atualizarTarifasBancariasAtalhos,
  criarCartaoFinanceiro,
  criarCategoriaFinanceira,
  criarContaBancaria,
  criarFormaPagamentoFinanceira,
  getCartoesFinanceiros,
  criarPaymentAccount,
  criarPaymentBeneficiary,
  getCategoriasFinanceiras,
  getContasBancarias,
  getFormasPagamentoFinanceiras,
  getPaymentAccounts,
  getPaymentBeneficiaries,
  getTarifasBancariasAtalhos
} from '../services/financeiro';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { getCpfCnpjError, getPixDocumentError, maskCpfCnpj, onlyDigits } from '../utils/formatters';
import { categoriaFinanceiraMatchesSearch } from '../utils/categoriaFinanceira';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  alternarValorFiltro,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos
} from '../components/padrao';

function defaultContaForm() {
  return {
    id: null,
    nome: '',
    banco: '',
    agencia: '',
    conta: '',
    ofx_bank_id: '',
    ofx_branch_id: '',
    ofx_account_id: '',
    tipo_conta: '',
    empresa_id: '',
    tipo_operacional: 'BANCARIA',
    exige_abertura_fechamento: false,
    saldo_inicial: '0',
    ativo: true
  };
}

function defaultCategoriaForm() {
  return {
    id: null,
    nome: '',
    tipo: 'AMBOS',
    descricao: '',
    classificacao_gerencial: 'OPERACIONAL',
    dre_grupo: '',
    dre_subgrupo: '',
    dre_ordem: '',
    considera_dre: true,
    ativo: true
  };
}

function defaultFormaPagamentoForm() {
  return {
    id: null,
    nome: '',
    codigo: '',
    tipo: 'OUTROS',
    permite_parcelamento: false,
    gera_fatura: false,
    gera_boleto: false,
    exige_cartao: false,
    exige_cheque: false,
    ordem: 0,
    ativo: true
  };
}

function defaultCartaoForm() {
  return {
    id: null,
    nome: '',
    titular: '',
    tipo: 'CREDITO',
    bandeira: '',
    ultimos_digitos: '',
    conta_bancaria_id: '',
    dia_fechamento: 25,
    dia_vencimento: 5,
    observacoes: '',
    ativo: true
  };
}

function defaultFavorecidoForm() {
  return {
    id: null,
    parceiro_id: '',
    nome: '',
    cpf_cnpj: '',
    pix_tipo_chave: 'CNPJ',
    pix_chave: '',
    ativo: true
  };
}

function defaultPaymentAccountForm() {
  return {
    id: null,
    conta_bancaria_id: '',
    empresa_id: '',
    cnpj_pagador: '',
    banco_codigo: '001',
    agencia: '',
    agencia_digito: '',
    conta: '',
    conta_digito: '',
    tipo_conta: 'CORRENTE',
    convenio: '',
    client_id_ref: '',
    client_secret_ref: '',
    certificate_ref: '',
    ambiente: 'HOMOLOGACAO',
    ativo: true
  };
}

function pickContaFormData(conta = {}) {
  return {
    id: conta.id || null,
    nome: conta.nome || '',
    banco: conta.banco || '',
    agencia: conta.agencia || '',
    conta: conta.conta || '',
    ofx_bank_id: conta.ofx_bank_id || '',
    ofx_branch_id: conta.ofx_branch_id || '',
    ofx_account_id: conta.ofx_account_id || '',
    tipo_conta: conta.tipo_conta || '',
    empresa_id: conta.empresa_id ? String(conta.empresa_id) : '',
    tipo_operacional: conta.tipo_operacional || 'BANCARIA',
    exige_abertura_fechamento: conta.exige_abertura_fechamento === true,
    saldo_inicial: conta.saldo_inicial ?? '0',
    ativo: conta.ativo !== false
  };
}

function pickCategoriaFormData(categoria = {}) {
  return {
    id: categoria.id || null,
    nome: categoria.nome || '',
    tipo: categoria.tipo || 'AMBOS',
    descricao: categoria.descricao || '',
    classificacao_gerencial: categoria.classificacao_gerencial || 'OPERACIONAL',
    dre_grupo: categoria.dre_grupo || '',
    dre_subgrupo: categoria.dre_subgrupo || '',
    dre_ordem: categoria.dre_ordem ?? '',
    considera_dre: categoria.considera_dre !== false,
    ativo: categoria.ativo !== false
  };
}

function pickFormaPagamentoFormData(forma = {}) {
  return {
    id: forma.id || null,
    nome: forma.nome || '',
    codigo: forma.codigo || '',
    tipo: forma.tipo || 'OUTROS',
    permite_parcelamento: forma.permite_parcelamento === true,
    gera_fatura: forma.gera_fatura === true,
    gera_boleto: forma.gera_boleto === true,
    exige_cartao: forma.exige_cartao === true,
    exige_cheque: forma.exige_cheque === true,
    ordem: Number(forma.ordem || 0),
    ativo: forma.ativo !== false
  };
}

function pickCartaoFormData(cartao = {}) {
  return {
    id: cartao.id || null,
    nome: cartao.nome || '',
    titular: cartao.titular || '',
    tipo: normalizarTipoCartao(cartao.tipo),
    bandeira: cartao.bandeira || '',
    ultimos_digitos: cartao.ultimos_digitos || '',
    conta_bancaria_id: cartao.conta_bancaria_id ? String(cartao.conta_bancaria_id) : '',
    dia_fechamento: Number(cartao.dia_fechamento || 25),
    dia_vencimento: Number(cartao.dia_vencimento || 5),
    observacoes: cartao.observacoes || '',
    ativo: cartao.ativo !== false
  };
}

function pickPaymentAccountFormData(account = {}) {
  return {
    id: account.id || null,
    conta_bancaria_id: account.conta_bancaria_id ? String(account.conta_bancaria_id) : '',
    empresa_id: account.empresa_id ? String(account.empresa_id) : '',
    cnpj_pagador: account.cnpj_pagador || '',
    banco_codigo: account.banco_codigo || '001',
    agencia: account.agencia || '',
    agencia_digito: account.agencia_digito || '',
    conta: account.conta || '',
    conta_digito: account.conta_digito || '',
    tipo_conta: account.tipo_conta || 'CORRENTE',
    convenio: account.convenio || '',
    client_id_ref: account.client_id_ref || '',
    client_secret_ref: account.client_secret_ref || '',
    certificate_ref: account.certificate_ref || '',
    ambiente: account.ambiente || 'HOMOLOGACAO',
    ativo: account.ativo !== false
  };
}

function getContaEmpresaId(conta = {}) {
  return conta?.empresa_id ? String(conta.empresa_id) : '';
}

// R25: a cor do estado vem do badge do sistema (tokens --status-*), nunca
// de paleta crua do Tailwind — que não tem par no tema escuro nem passa
// pelo piso de contraste do ThemeContext.
function statusClass(ativo) {
  return ativo ? 'badge-status badge-status--approved' : 'badge-status badge-status--archived';
}

function normalizarTipoCartao(value) {
  const normalized = String(value || 'CREDITO').trim().toUpperCase();
  return normalized === 'DEBITO' || normalized === 'CARTAO_DEBITO' ? 'DEBITO' : 'CREDITO';
}

function labelTipoCartao(value) {
  return normalizarTipoCartao(value) === 'DEBITO' ? 'Debito' : 'Credito';
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const CATEGORIA_TIPO_META = {
  TODAS: {
    label: 'Todas',
    titulo: 'Todas as categorias',
    descricao: 'Visão consolidada de contas a pagar, receber e categorias compartilhadas.'
  },
  PAGAR: {
    label: 'Contas a pagar',
    titulo: 'Categorias de contas a pagar',
    descricao: 'Aparecem apenas em títulos do tipo PAGAR.'
  },
  RECEBER: {
    label: 'Contas a receber',
    titulo: 'Categorias de contas a receber',
    descricao: 'Aparecem apenas em títulos do tipo RECEBER.'
  },
  AMBOS: {
    label: 'Compartilhadas',
    titulo: 'Categorias compartilhadas',
    descricao: 'Ficam disponíveis para títulos a pagar e a receber.'
  }
};

const CATEGORIA_CLASSIFICACAO_GERENCIAL = [
  ['OPERACIONAL', 'Operacional'],
  ['ENDIVIDAMENTO', 'Endividamento'],
  ['INVESTIMENTO', 'Investimento'],
  ['PATRIMONIAL', 'Patrimonial'],
  ['INTERCOMPANY', 'Entre Empresas'],
  ['TRANSFERENCIA_INTERNA', 'Transferencia interna'],
  ['IMPOSTO', 'Imposto'],
  ['FOLHA', 'Folha'],
  ['OUTROS', 'Outros']
];

const CLASSIFICACOES_INCOMPATIVEIS_COM_TARIFA = new Set([
  'ENDIVIDAMENTO',
  'INVESTIMENTO',
  'PATRIMONIAL',
  'INTERCOMPANY',
  'TRANSFERENCIA_INTERNA'
]);

function categoriaTipoLabel(tipo) {
  return CATEGORIA_TIPO_META[tipo]?.label || tipo;
}

function categoriaClassificacaoLabel(value) {
  const normalized = String(value || 'OPERACIONAL').trim().toUpperCase();
  return CATEGORIA_CLASSIFICACAO_GERENCIAL.find(([key]) => key === normalized)?.[1] || normalized;
}

function categoriaTipoBadgeClass(tipo) {
  if (tipo === 'PAGAR') {
    return 'finance-category-type-pill finance-category-type-pill--pagar';
  }
  if (tipo === 'RECEBER') {
    return 'finance-category-type-pill finance-category-type-pill--receber';
  }
  return 'finance-category-type-pill finance-category-type-pill--ambos';
}

function categoriaPossuiGrupoDre(categoria = {}) {
  return categoria.considera_dre !== false && Boolean(String(categoria.dre_grupo || '').trim());
}

function categoriaAptaParaTarifaBancaria(categoria = {}) {
  const tipo = String(categoria.tipo || '').trim().toUpperCase();
  const classificacao = String(categoria.classificacao_gerencial || '').trim().toUpperCase();
  return (
    categoria.ativo !== false &&
    ['PAGAR', 'AMBOS'].includes(tipo) &&
    categoriaPossuiGrupoDre(categoria) &&
    !CLASSIFICACOES_INCOMPATIVEIS_COM_TARIFA.has(classificacao)
  );
}

let tarifaBancariaDraftSequence = 0;

function criarTarifaBancariaDraftId() {
  tarifaBancariaDraftSequence += 1;
  return `tarifa-bancaria-${Date.now()}-${tarifaBancariaDraftSequence}`;
}

function prepararTarifasBancariasParaEdicao(itens) {
  return (Array.isArray(itens) ? itens : []).map((item) => ({
    ...item,
    _draftId: criarTarifaBancariaDraftId()
  }));
}

function prepararTarifasBancariasParaSalvar(itens) {
  return (Array.isArray(itens) ? itens : []).map((item) => ({
    codigo: String(item.codigo || '').trim(),
    nome: String(item.nome || '').trim(),
    descricao: String(item.descricao || '').trim(),
    categoria_financeira_id: item.categoria_financeira_id ? Number(item.categoria_financeira_id) : null,
    ativo: item.ativo !== false
  }));
}

export default function FinanceiroCadastros() {
  const [contas, setContas] = useState([]);
  const [empresasGrupo, setEmpresasGrupo] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [tarifasBancariasAtalhos, setTarifasBancariasAtalhos] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [contaForm, setContaForm] = useState(defaultContaForm());
  const [paymentAccountForm, setPaymentAccountForm] = useState(defaultPaymentAccountForm());
  const [categoriaForm, setCategoriaForm] = useState(defaultCategoriaForm());
  const [formaPagamentoForm, setFormaPagamentoForm] = useState(defaultFormaPagamentoForm());
  const [cartaoForm, setCartaoForm] = useState(defaultCartaoForm());
  const [loading, setLoading] = useState(true);
  const [savingConta, setSavingConta] = useState(false);
  const [savingPaymentAccount, setSavingPaymentAccount] = useState(false);
  const [savingCategoria, setSavingCategoria] = useState(false);
  const [savingFormaPagamento, setSavingFormaPagamento] = useState(false);
  const [savingTarifasBancarias, setSavingTarifasBancarias] = useState(false);
  const [savingCartao, setSavingCartao] = useState(false);
  // R3/R19: erro de salvamento e confirmação de gravação são EVENTO — faixa
  // do sistema, empilhável e fechável. A condição derivada do conteúdo (a
  // categoria marcada para DRE sem grupo DRE) continua fixa no fluxo, ao
  // lado do campo que a resolve.
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  // R12: o recorte da lista é MARCAÇÃO (múltipla, com etiqueta removível),
  // nunca escolha única — conjunto vazio significa "todos os tipos".
  const [categoriaFiltrosAtivos, setCategoriaFiltrosAtivos] = useState({});
  const [categoriasModalAberto, setCategoriasModalAberto] = useState(false);
  const [categoriasModalAba, setCategoriasModalAba] = useState('PAGAR');
  const [categoriasModalBusca, setCategoriasModalBusca] = useState('');
  const [favorecidoForm, setFavorecidoForm] = useState(defaultFavorecidoForm());
  const [favorecidos, setFavorecidos] = useState([]);
  const [savingFavorecido, setSavingFavorecido] = useState(false);
  const [loadingFavorecidos, setLoadingFavorecidos] = useState(false);
  const categoriaFormRef = useRef(null);
  const categoriaNomeInputRef = useRef(null);
  const categoriaFiltroNormalizado = useMemo(() => normalizeSearchText(categoriaFiltro).trim(), [categoriaFiltro]);

  async function carregar() {
    try {
      setLoading(true);
      limpar();
      const [contasData, categoriasData, paymentAccountsData, formasData, tarifasData, cartoesData, empresasData] = await Promise.all([
        getContasBancarias(),
        getCategoriasFinanceiras(),
        getPaymentAccounts().catch(() => []),
        getFormasPagamentoFinanceiras().catch(() => []),
        getTarifasBancariasAtalhos().catch(() => []),
        getCartoesFinanceiros().catch(() => []),
        getEmpresasGrupo({ ativo: true }).catch(() => [])
      ]);
      setContas(Array.isArray(contasData) ? contasData : []);
      setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
      setPaymentAccounts(Array.isArray(paymentAccountsData) ? paymentAccountsData : []);
      setFormasPagamento(Array.isArray(formasData) ? formasData : []);
      setTarifasBancariasAtalhos(prepararTarifasBancariasParaEdicao(tarifasData));
      setCartoes(Array.isArray(cartoesData) ? cartoesData : []);
      setEmpresasGrupo(Array.isArray(empresasData) ? empresasData : []);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar cadastros financeiros');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const tiposCategoriaMarcados = useMemo(
    () => categoriaFiltrosAtivos.tipo || new Set(),
    [categoriaFiltrosAtivos]
  );
  // R23: marcar aplica na hora. E o recorte por TIPO passa a valer sozinho —
  // antes a lista só reagia ao texto, então marcar um tipo sem digitar nada
  // não mudava coisa alguma na tela (capacidade sem efeito, família da R15).
  const temRecorteCategoria = Boolean(categoriaFiltroNormalizado) || tiposCategoriaMarcados.size > 0;
  const categoriasFiltradas = useMemo(() => {
    const search = categoriaFiltroNormalizado;
    if (!search && tiposCategoriaMarcados.size === 0) {
      return [];
    }

    return [...categorias]
      .filter((categoria) => {
        const tipoCategoria = String(categoria.tipo || 'AMBOS').trim().toUpperCase();
        const atendeTipo = tiposCategoriaMarcados.size === 0 || tiposCategoriaMarcados.has(tipoCategoria);
        if (!atendeTipo) {
          return false;
        }

        if (!search) {
          return true;
        }

        return categoriaFinanceiraMatchesSearch(categoria, search);
      })
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }));
  }, [categoriaFiltroNormalizado, tiposCategoriaMarcados, categorias]);

  const categoriasModalFiltradas = useMemo(() => {
    const search = normalizeSearchText(categoriasModalBusca).trim();
    const tiposPermitidos = categoriasModalAba === 'PAGAR' ? ['PAGAR', 'AMBOS'] : ['RECEBER', 'AMBOS'];

    return [...categorias]
      .filter((categoria) => {
        const tipoCategoria = String(categoria.tipo || 'AMBOS').trim().toUpperCase();
        if (!tiposPermitidos.includes(tipoCategoria)) {
          return false;
        }
        if (!search) {
          return true;
        }
        return categoriaFinanceiraMatchesSearch(categoria, search);
      })
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }));
  }, [categorias, categoriasModalAba, categoriasModalBusca]);

  const secoesCategorias = useMemo(() => {
    const grupos = [
      {
        key: 'PAGAR',
        titulo: CATEGORIA_TIPO_META.PAGAR.titulo,
        descricao: CATEGORIA_TIPO_META.PAGAR.descricao,
        itens: categoriasFiltradas.filter((categoria) => String(categoria.tipo || '').trim().toUpperCase() === 'PAGAR')
      },
      {
        key: 'RECEBER',
        titulo: CATEGORIA_TIPO_META.RECEBER.titulo,
        descricao: CATEGORIA_TIPO_META.RECEBER.descricao,
        itens: categoriasFiltradas.filter((categoria) => String(categoria.tipo || '').trim().toUpperCase() === 'RECEBER')
      },
      {
        key: 'AMBOS',
        titulo: CATEGORIA_TIPO_META.AMBOS.titulo,
        descricao: CATEGORIA_TIPO_META.AMBOS.descricao,
        itens: categoriasFiltradas.filter((categoria) => String(categoria.tipo || '').trim().toUpperCase() === 'AMBOS')
      }
    ];

    if (tiposCategoriaMarcados.size === 0) {
      return grupos.filter((grupo) => grupo.itens.length > 0);
    }

    return grupos.filter((grupo) => tiposCategoriaMarcados.has(grupo.key));
  }, [tiposCategoriaMarcados, categoriasFiltradas]);

  const categoriasTarifasBancarias = useMemo(() => (
    [...categorias]
      .filter(categoriaAptaParaTarifaBancaria)
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }))
  ), [categorias]);

  async function handleSalvarConta(event) {
    event.preventDefault();
    try {
      setSavingConta(true);
      limpar();
      const { id, ...contaPayload } = pickContaFormData(contaForm);
      const cleanPayload = {
        ...contaPayload,
        empresa_id: contaPayload.empresa_id ? Number(contaPayload.empresa_id) : null,
        saldo_inicial: contaPayload.saldo_inicial === '' ? 0 : contaPayload.saldo_inicial
      };
      if (contaForm.id) {
        await atualizarContaBancaria(contaForm.id, cleanPayload);
      } else {
        await criarContaBancaria(cleanPayload);
      }
      setContaForm(defaultContaForm());
      await carregar();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar conta bancaria');
    } finally {
      setSavingConta(false);
    }
  }

  async function handleSalvarPaymentAccount(event) {
    event.preventDefault();
    const documentoErro = getCpfCnpjError(paymentAccountForm.cnpj_pagador, {
      required: true,
      type: 'cnpj',
      label: 'CNPJ pagador'
    });
    if (documentoErro) {
      avisar.erro(documentoErro);
      return;
    }
    try {
      setSavingPaymentAccount(true);
      limpar();
      const { id, ...payload } = pickPaymentAccountFormData(paymentAccountForm);
      const contaSelecionada = contas.find((item) => String(item.id) === String(payload.conta_bancaria_id));
      const empresaContaId = getContaEmpresaId(contaSelecionada);
      if (!empresaContaId) {
        avisar.erro('A conta bancária interna precisa estar vinculada a uma empresa do grupo antes de virar conta pagadora.');
        return;
      }
      const cleanPayload = {
        ...payload,
        cnpj_pagador: onlyDigits(payload.cnpj_pagador),
        conta_bancaria_id: Number(payload.conta_bancaria_id),
        empresa_id: Number(empresaContaId)
      };
      if (paymentAccountForm.id) {
        await atualizarPaymentAccount(paymentAccountForm.id, cleanPayload);
      } else {
        await criarPaymentAccount(cleanPayload);
      }
      setPaymentAccountForm(defaultPaymentAccountForm());
      await carregar();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar conta pagadora');
    } finally {
      setSavingPaymentAccount(false);
    }
  }

  function preencherContaPagadoraPelaContaBancaria(contaBancariaId) {
    const conta = contas.find((item) => String(item.id) === String(contaBancariaId));
    setPaymentAccountForm((current) => ({
      ...current,
      conta_bancaria_id: contaBancariaId,
      empresa_id: getContaEmpresaId(conta) || current.empresa_id,
      banco_codigo: current.banco_codigo || '001',
      agencia: conta?.agencia || current.agencia,
      conta: conta?.conta || current.conta,
      tipo_conta: conta?.tipo_conta || current.tipo_conta
    }));
  }

  async function handleSalvarCategoria(event) {
    event.preventDefault();
    try {
      setSavingCategoria(true);
      limpar();
      const { id, ...categoriaPayload } = pickCategoriaFormData(categoriaForm);
      if (categoriaPayload.considera_dre !== false && !String(categoriaPayload.dre_grupo || '').trim()) {
        avisar.erro('Informe o grupo DRE ou desmarque "Considerar na DRE" para salvar a categoria.');
        return;
      }
      if (categoriaForm.id) {
        await atualizarCategoriaFinanceira(categoriaForm.id, categoriaPayload);
      } else {
        await criarCategoriaFinanceira(categoriaPayload);
      }
      setCategoriaForm(defaultCategoriaForm());
      await carregar();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar categoria financeira');
    } finally {
      setSavingCategoria(false);
    }
  }

  function handleEditarCategoria(categoria) {
    setCategoriaForm(pickCategoriaFormData(categoria));
    setCategoriasModalAberto(false);
    window.setTimeout(() => {
      categoriaFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      categoriaNomeInputRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  async function handleSalvarFormaPagamento(event) {
    event.preventDefault();
    try {
      setSavingFormaPagamento(true);
      limpar();
      const { id, ...payload } = pickFormaPagamentoFormData(formaPagamentoForm);
      if (formaPagamentoForm.id) {
        await atualizarFormaPagamentoFinanceira(formaPagamentoForm.id, payload);
      } else {
        await criarFormaPagamentoFinanceira(payload);
      }
      setFormaPagamentoForm(defaultFormaPagamentoForm());
      await carregar();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar forma de pagamento');
    } finally {
      setSavingFormaPagamento(false);
    }
  }

  function handleAdicionarTarifaBancaria() {
    setTarifasBancariasAtalhos((current) => ([
      ...current,
      { _draftId: criarTarifaBancariaDraftId(), codigo: '', nome: '', descricao: '', categoria_financeira_id: '', ativo: true }
    ]));
  }

  function handleAlterarTarifaBancaria(index, field, value) {
    setTarifasBancariasAtalhos((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  }

  function handleRemoverTarifaBancaria(index) {
    setTarifasBancariasAtalhos((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSalvarTarifasBancarias() {
    try {
      setSavingTarifasBancarias(true);
      limpar();
      const categoriasAptas = new Set(categoriasTarifasBancarias.map((categoria) => String(categoria.id)));
      const tarifaInvalida = tarifasBancariasAtalhos.find((tarifa) => !tarifa.categoria_financeira_id || !categoriasAptas.has(String(tarifa.categoria_financeira_id)));
      if (tarifaInvalida) {
        avisar.erro(`O atalho ${tarifaInvalida.nome || tarifaInvalida.codigo || 'de tarifa'} precisa usar uma categoria ativa, de saida e classificada para DRE.`);
        return;
      }
      const itensSalvos = await atualizarTarifasBancariasAtalhos({
        itens: prepararTarifasBancariasParaSalvar(tarifasBancariasAtalhos)
      });
      setTarifasBancariasAtalhos(prepararTarifasBancariasParaEdicao(itensSalvos));
      avisar.sucesso('Atalhos salvos. Os itens ativos já estão disponíveis na conciliação OFX.');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar atalhos de tarifas bancarias');
    } finally {
      setSavingTarifasBancarias(false);
    }
  }

  async function handleSalvarCartao(event) {
    event.preventDefault();
    try {
      setSavingCartao(true);
      limpar();
      const { id, ...payload } = pickCartaoFormData(cartaoForm);
      if (String(payload.tipo || '').toUpperCase() === 'DEBITO' && !payload.conta_bancaria_id) {
        throw new Error('Cartao de debito precisa ter uma conta bancaria vinculada.');
      }
      const cleanPayload = {
        ...payload,
        conta_bancaria_id: payload.conta_bancaria_id ? Number(payload.conta_bancaria_id) : null,
        dia_fechamento: Number(payload.dia_fechamento || 25),
        dia_vencimento: Number(payload.dia_vencimento || 5)
      };
      if (cartaoForm.id) {
        await atualizarCartaoFinanceiro(cartaoForm.id, cleanPayload);
      } else {
        await criarCartaoFinanceiro(cleanPayload);
      }
      setCartaoForm(defaultCartaoForm());
      await carregar();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar cartao');
    } finally {
      setSavingCartao(false);
    }
  }

  async function carregarFavorecidos(parceiroId = favorecidoForm.parceiro_id) {
    if (!parceiroId) {
      setFavorecidos([]);
      return;
    }

    try {
      setLoadingFavorecidos(true);
      limpar();
      const data = await getPaymentBeneficiaries({ parceiro_id: parceiroId });
      setFavorecidos(Array.isArray(data) ? data : []);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar favorecidos bancarios');
    } finally {
      setLoadingFavorecidos(false);
    }
  }

  async function handleSalvarFavorecido(event) {
    event.preventDefault();
    const documentoErro = getCpfCnpjError(favorecidoForm.cpf_cnpj, {
      required: true,
      label: 'CPF/CNPJ do favorecido'
    });
    if (documentoErro) {
      avisar.erro(documentoErro);
      return;
    }
    const pixErro = getPixDocumentError(favorecidoForm.pix_chave, favorecidoForm.pix_tipo_chave);
    if (pixErro) {
      avisar.erro(pixErro);
      return;
    }
    try {
      setSavingFavorecido(true);
      limpar();
      const payload = {
        parceiro_id: Number(favorecidoForm.parceiro_id),
        nome: favorecidoForm.nome,
        cpf_cnpj: onlyDigits(favorecidoForm.cpf_cnpj),
        metodo_preferencial: 'PIX_CHAVE',
        pix_tipo_chave: favorecidoForm.pix_tipo_chave,
        pix_chave: favorecidoForm.pix_chave,
        ativo: favorecidoForm.ativo
      };
      if (favorecidoForm.id) {
        await atualizarPaymentBeneficiary(favorecidoForm.id, payload);
      } else {
        await criarPaymentBeneficiary(payload);
      }
      const parceiroId = favorecidoForm.parceiro_id;
      setFavorecidoForm({ ...defaultFavorecidoForm(), parceiro_id: parceiroId });
      await carregarFavorecidos(parceiroId);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar favorecido bancario');
    } finally {
      setSavingFavorecido(false);
    }
  }

  return (
    <Pagina>
      {/* R5/R13: título, contagem e apoio da TELA moram na faixa fixa do
          topo — o `page-subtitle` solto sobre o canvas saiu. */}
      <PageHeader
        titulo="Cadastros financeiros"
        contagem={`${contas.length} conta(s) · ${categorias.length} categoria(s)`}
        descricao="Base de contas, categorias, formas de pagamento, cartões e favorecidos usada nas baixas e nos títulos."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {loading ? (
        <div className="app-empty-card">Carregando cadastros financeiros...</div>
      ) : (
        <>
          {/* B2: UM bloco primário. É a conta bancária: conta pagadora,
              cartão de débito e conciliação OFX todos apontam para ela, e
              sem ela os outros cadastros não fecham. */}
          <BlocoConteudo
            titulo="Contas bancárias"
            descricao={contaForm.id
              ? 'Edite a conta selecionada.'
              : 'Cadastre contas bancarias e caixas internos usados no financeiro.'}
            variante="primario"
            cor="var(--sem-info)"
          >
            <form onSubmit={handleSalvarConta}>
              <FormSecao legenda="Identificação" colunas={2}>
                <CampoForm label="Nome" obrigatorio linha>
                  <input
                    className="input w-full"
                    placeholder="Ex.: Banco do Brasil CSC ou Caixa Interno Matriz"
                    value={contaForm.nome}
                    onChange={(e) => setContaForm((c) => ({ ...c, nome: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Empresa do grupo">
                  <select
                    className="input w-full"
                    value={contaForm.empresa_id}
                    onChange={(e) => setContaForm((c) => ({ ...c, empresa_id: e.target.value }))}
                  >
                    <option value="">Não vinculada</option>
                    {empresasGrupo.map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                    ))}
                  </select>
                </CampoForm>

                <CampoForm label="Tipo operacional">
                  <select
                    className="input w-full"
                    value={contaForm.tipo_operacional}
                    onChange={(e) => {
                      const value = e.target.value;
                      setContaForm((c) => ({
                        ...c,
                        tipo_operacional: value,
                        exige_abertura_fechamento: value === 'CAIXA_INTERNO' ? true : c.exige_abertura_fechamento
                      }));
                    }}
                  >
                    <option value="BANCARIA">Conta bancária</option>
                    <option value="CAIXA_INTERNO">Caixa interno</option>
                  </select>
                </CampoForm>

                <CampoForm label="Banco">
                  <input
                    className="input w-full"
                    value={contaForm.banco}
                    onChange={(e) => setContaForm((c) => ({ ...c, banco: e.target.value }))}
                  />
                </CampoForm>

                <CampoForm label="Tipo da conta">
                  <input
                    className="input w-full"
                    value={contaForm.tipo_conta}
                    onChange={(e) => setContaForm((c) => ({ ...c, tipo_conta: e.target.value }))}
                  />
                </CampoForm>

                <CampoForm label="Agência">
                  <input
                    className="input w-full"
                    value={contaForm.agencia}
                    onChange={(e) => setContaForm((c) => ({ ...c, agencia: e.target.value }))}
                  />
                </CampoForm>

                <CampoForm label="Conta">
                  <input
                    className="input w-full"
                    value={contaForm.conta}
                    onChange={(e) => setContaForm((c) => ({ ...c, conta: e.target.value }))}
                  />
                </CampoForm>

                {/* R6: saldo inicial é dinheiro — 180px mínimos, à direita,
                    tabular-nums. */}
                <CampoForm label="Saldo inicial">
                  <input
                    className="input input-moeda w-full"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={contaForm.saldo_inicial}
                    onChange={(e) => setContaForm((c) => ({ ...c, saldo_inicial: e.target.value }))}
                  />
                </CampoForm>
              </FormSecao>

              <FormSecao legenda="Identificação OFX para conciliação" colunas={3}>
                <CampoForm label="Banco OFX" hint="Codigo do banco no arquivo, quando existir.">
                  <input
                    className="input w-full"
                    placeholder="Ex.: 0104, 001, 748"
                    value={contaForm.ofx_bank_id}
                    onChange={(e) => setContaForm((c) => ({ ...c, ofx_bank_id: e.target.value }))}
                  />
                </CampoForm>

                <CampoForm label="Agência OFX" hint="Se houver BRANCHID no arquivo.">
                  <input
                    className="input w-full"
                    value={contaForm.ofx_branch_id}
                    onChange={(e) => setContaForm((c) => ({ ...c, ofx_branch_id: e.target.value }))}
                  />
                </CampoForm>

                <CampoForm label="Conta OFX" hint="ACCTID do arquivo OFX. Obrigatoria para deteccao automatica em lote.">
                  <input
                    className="input w-full"
                    value={contaForm.ofx_account_id}
                    onChange={(e) => setContaForm((c) => ({ ...c, ofx_account_id: e.target.value }))}
                  />
                </CampoForm>
              </FormSecao>

              <FormSecao legenda="Regras da conta" colunas={2}>
                <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    checked={contaForm.exige_abertura_fechamento}
                    onChange={(e) => setContaForm((c) => ({ ...c, exige_abertura_fechamento: e.target.checked }))}
                  />
                  Exige abertura e fechamento de caixa
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    checked={contaForm.ativo}
                    onChange={(e) => setContaForm((c) => ({ ...c, ativo: e.target.checked }))}
                  />
                  Conta ativa
                </label>
              </FormSecao>

              <div className="app-actionbar">
                <button type="submit" className="btn btn-primary" disabled={savingConta}>
                  {savingConta ? 'Salvando...' : (contaForm.id ? 'Salvar alteracoes' : 'Criar conta')}
                </button>
                {contaForm.id && (
                  <button type="button" className="btn btn-outline" onClick={() => setContaForm(defaultContaForm())}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Contas cadastradas"
            contagem={`${contas.length} conta(s)`}
            variante="secundario"
          >
            {contas.length === 0 ? (
              <div className="app-note">Nenhuma conta bancária cadastrada.</div>
            ) : (
              <div className="app-list-stack">
                {contas.map((conta) => (
                  <div key={conta.id} className="app-list-card">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="text-sm">
                        <div className="font-medium text-[var(--c-text)]">{conta.nome}</div>
                        <div className="text-[var(--c-muted)]">
                          {conta.banco || 'Banco nao informado'} - {conta.agencia || '-'} / {conta.conta || '-'}
                        </div>
                        <div className="mt-1 text-[var(--c-muted)]">
                          {conta.empresa?.nome || 'Sem empresa vinculada'} - {conta.tipo_operacional === 'CAIXA_INTERNO' ? 'Caixa interno' : 'Conta bancaria'}
                        </div>
                      </div>
                      <div className="app-actionbar">
                        <span className={statusClass(conta.ativo)}>
                          {conta.ativo ? 'ATIVA' : 'INATIVA'}
                        </span>
                        <button type="button" className="btn btn-outline" onClick={() => setContaForm(pickContaFormData(conta))}>
                          Editar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Contas pagadoras"
            descricao={paymentAccountForm.id
              ? 'Edite a conta pagadora selecionada.'
              : 'Vincule uma conta bancaria interna ao CNPJ e ao convenio bancario. A empresa vem automaticamente da conta.'}
            variante="secundario"
          >
            <form onSubmit={handleSalvarPaymentAccount}>
              <FormSecao legenda="Vínculo" colunas={2}>
                <CampoForm label="Conta bancária interna" obrigatorio linha>
                  <select
                    className="input w-full"
                    value={paymentAccountForm.conta_bancaria_id}
                    onChange={(e) => preencherContaPagadoraPelaContaBancaria(e.target.value)}
                    required
                  >
                    <option value="">Selecione a conta bancária</option>
                    {contas.map((conta) => (
                      <option key={conta.id} value={conta.id}>
                        {conta.nome} - {conta.banco || 'Banco'} {conta.agencia || '-'} / {conta.conta || '-'}
                      </option>
                    ))}
                  </select>
                </CampoForm>

                <CampoForm label="CNPJ pagador" obrigatorio>
                  <input
                    className="input w-full"
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    value={maskCpfCnpj(paymentAccountForm.cnpj_pagador)}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, cnpj_pagador: maskCpfCnpj(e.target.value) }))}
                    required
                  />
                </CampoForm>

              </FormSecao>

              <FormSecao legenda="Dados bancários do pagador" colunas={3}>
                <CampoForm label="Código banco" obrigatorio>
                  <input
                    className="input w-full"
                    value={paymentAccountForm.banco_codigo}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, banco_codigo: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Agência" obrigatorio>
                  <input
                    className="input w-full"
                    value={paymentAccountForm.agencia}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, agencia: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Dígito agência">
                  <input
                    className="input w-full"
                    value={paymentAccountForm.agencia_digito}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, agencia_digito: e.target.value }))}
                  />
                </CampoForm>

                <CampoForm label="Conta" obrigatorio>
                  <input
                    className="input w-full"
                    value={paymentAccountForm.conta}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, conta: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Dígito conta">
                  <input
                    className="input w-full"
                    value={paymentAccountForm.conta_digito}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, conta_digito: e.target.value }))}
                  />
                </CampoForm>

                <CampoForm label="Tipo conta" obrigatorio>
                  <input
                    className="input w-full"
                    value={paymentAccountForm.tipo_conta}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, tipo_conta: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Convênio bancário" obrigatorio>
                  <input
                    className="input w-full"
                    value={paymentAccountForm.convenio}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, convenio: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Ambiente">
                  <select
                    className="input w-full"
                    value={paymentAccountForm.ambiente}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, ambiente: e.target.value }))}
                  >
                    <option value="HOMOLOGACAO">HOMOLOGACAO</option>
                    <option value="PRODUCAO">PRODUCAO</option>
                  </select>
                </CampoForm>
              </FormSecao>

              <FormSecao legenda="Credenciais e situação" colunas={3}>
                <CampoForm label="client_id_ref">
                  <input
                    className="input w-full"
                    value={paymentAccountForm.client_id_ref}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, client_id_ref: e.target.value }))}
                  />
                </CampoForm>
                <CampoForm label="client_secret_ref">
                  <input
                    className="input w-full"
                    value={paymentAccountForm.client_secret_ref}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, client_secret_ref: e.target.value }))}
                  />
                </CampoForm>
                <CampoForm label="certificate_ref">
                  <input
                    className="input w-full"
                    value={paymentAccountForm.certificate_ref}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, certificate_ref: e.target.value }))}
                  />
                </CampoForm>
                <label className="form-campo--linha flex items-center gap-2 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    checked={paymentAccountForm.ativo}
                    onChange={(e) => setPaymentAccountForm((c) => ({ ...c, ativo: e.target.checked }))}
                  />
                  Conta pagadora ativa
                </label>
              </FormSecao>

              <div className="app-actionbar">
                <button type="submit" className="btn btn-primary" disabled={savingPaymentAccount}>
                  {savingPaymentAccount ? 'Salvando...' : (paymentAccountForm.id ? 'Salvar conta pagadora' : 'Criar conta pagadora')}
                </button>
                {paymentAccountForm.id && (
                  <button type="button" className="btn btn-outline" onClick={() => setPaymentAccountForm(defaultPaymentAccountForm())}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Contas pagadoras cadastradas"
            contagem={`${paymentAccounts.length} conta(s)`}
            variante="secundario"
          >
            {paymentAccounts.length === 0 ? (
              <div className="app-note">Nenhuma conta pagadora cadastrada.</div>
            ) : (
              <div className="app-list-stack">
                {paymentAccounts.map((account) => (
                  <div key={account.id} className="app-list-card">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="text-sm">
                        <div className="font-medium text-[var(--c-text)]">
                          {account.contaBancaria?.nome || `Conta pagadora ${account.id}`}
                        </div>
                        <div className="text-[var(--c-muted)]">
                          CNPJ {account.cnpj_pagador} - Convenio {account.convenio || '-'}
                        </div>
                        <div className={account.empresa_id || account.empresa?.id ? 'text-[var(--c-muted)]' : 'font-medium text-[var(--sem-danger)]'}>
                          {account.empresa?.nome || 'Empresa pagadora nao vinculada'} - {account.provider?.nome || account.provider?.codigo || 'Provider'} {account.ambiente}
                        </div>
                      </div>
                      <div className="app-actionbar">
                        <span className={statusClass(account.ativo)}>
                          {account.ativo ? 'ATIVA' : 'INATIVA'}
                        </span>
                        <button type="button" className="btn btn-outline" onClick={() => setPaymentAccountForm(pickPaymentAccountFormData(account))}>
                          Editar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BlocoConteudo>

          <div ref={categoriaFormRef}>
            <BlocoConteudo
              titulo="Categorias financeiras"
              descricao={categoriaForm.id
                ? 'Edite a categoria selecionada.'
                : 'Cadastre categorias usadas nos titulos, baixas e DRE.'}
              variante="secundario"
            >
              <form onSubmit={handleSalvarCategoria}>
                <FormSecao legenda="Identificação" colunas={2}>
                  <CampoForm label="Nome" obrigatorio>
                    <input
                      ref={categoriaNomeInputRef}
                      className="input w-full"
                      value={categoriaForm.nome}
                      onChange={(e) => setCategoriaForm((c) => ({ ...c, nome: e.target.value }))}
                      required
                    />
                  </CampoForm>

                  <CampoForm label="Fluxo" hint="Define em que tipo de titulo a categoria aparece.">
                    <select
                      className="input w-full"
                      value={categoriaForm.tipo}
                      onChange={(e) => setCategoriaForm((c) => ({ ...c, tipo: e.target.value }))}
                    >
                      <option value="AMBOS">Ambos</option>
                      <option value="PAGAR">Pagar</option>
                      <option value="RECEBER">Receber</option>
                    </select>
                  </CampoForm>

                  <CampoForm label="Classificação gerencial" linha>
                    <select
                      className="input w-full"
                      value={categoriaForm.classificacao_gerencial}
                      onChange={(e) => setCategoriaForm((c) => ({ ...c, classificacao_gerencial: e.target.value }))}
                    >
                      {CATEGORIA_CLASSIFICACAO_GERENCIAL.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </CampoForm>

                  <CampoForm label="Descrição" tipo="observacao">
                    <textarea
                      className="input w-full"
                      value={categoriaForm.descricao}
                      onChange={(e) => setCategoriaForm((c) => ({ ...c, descricao: e.target.value }))}
                    />
                  </CampoForm>
                </FormSecao>

                {/* CONDIÇÃO derivada do conteúdo, não evento: fechar a faixa
                    não faria a categoria ganhar grupo DRE, e o salvamento
                    continuaria recusado. Por isso ela fica fixa, ao lado do
                    campo que a resolve — não vira aviso dispensável. */}
                {categoriaForm.considera_dre && !String(categoriaForm.dre_grupo || '').trim() && (
                  <div className="app-alert">
                    Para entrar na DRE, esta categoria precisa de grupo DRE definido de forma explícita. O sistema não classifica automaticamente pelo nome.
                  </div>
                )}

                <FormSecao legenda="DRE" colunas={3}>
                  <CampoForm label="Grupo DRE">
                    <input
                      className={`input w-full ${categoriaForm.considera_dre && !String(categoriaForm.dre_grupo || '').trim() ? 'border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)]' : ''}`}
                      value={categoriaForm.dre_grupo}
                      onChange={(e) => setCategoriaForm((c) => ({ ...c, dre_grupo: e.target.value }))}
                    />
                  </CampoForm>

                  <CampoForm label="Subgrupo DRE">
                    <input
                      className="input w-full"
                      value={categoriaForm.dre_subgrupo}
                      onChange={(e) => setCategoriaForm((c) => ({ ...c, dre_subgrupo: e.target.value }))}
                    />
                  </CampoForm>

                  <CampoForm label="Ordem DRE">
                    <input
                      className="input valor-tabular w-full"
                      type="number"
                      value={categoriaForm.dre_ordem}
                      onChange={(e) => setCategoriaForm((c) => ({ ...c, dre_ordem: e.target.value }))}
                    />
                  </CampoForm>

                  <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                    <input
                      type="checkbox"
                      checked={categoriaForm.considera_dre}
                      onChange={(e) => setCategoriaForm((c) => ({ ...c, considera_dre: e.target.checked }))}
                    />
                    Considerar na DRE
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                    <input
                      type="checkbox"
                      checked={categoriaForm.ativo}
                      onChange={(e) => setCategoriaForm((c) => ({ ...c, ativo: e.target.checked }))}
                    />
                    Categoria ativa
                  </label>
                </FormSecao>

                <div className="app-actionbar">
                  <button type="submit" className="btn btn-primary" disabled={savingCategoria}>
                    {savingCategoria ? 'Salvando...' : (categoriaForm.id ? 'Salvar alteracoes' : 'Criar categoria')}
                  </button>
                  {categoriaForm.id && (
                    <button type="button" className="btn btn-outline" onClick={() => setCategoriaForm(defaultCategoriaForm())}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </BlocoConteudo>
          </div>

          <BlocoConteudo
            titulo="Categorias cadastradas"
            contagem={`${categoriasFiltradas.length} de ${categorias.length}`}
            descricao="Digite parte do nome, descrição ou classificação, ou marque o fluxo para recortar a lista."
            variante="secundario"
            acoes={(
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setCategoriasModalBusca('');
                  setCategoriasModalAberto(true);
                }}
                aria-label="Abrir catalogo de categorias financeiras"
                title="Abrir catalogo de categorias"
              >
                <HiOutlineMagnifyingGlass className="h-4 w-4" aria-hidden="true" />
                Catalogo
              </button>
            )}
          >
            {/* R12/R16: UMA busca no contexto, ocupando a faixa, e o recorte
                por fluxo em MARCAÇÃO múltipla com etiqueta removível — o
                grupo de botões de escolha única saiu no mesmo movimento
                (coexistir seria duplicar o dono da responsabilidade). */}
            <BarraFiltros
              busca={{
                valor: categoriaFiltro,
                aoMudar: setCategoriaFiltro,
                placeholder: 'Buscar por ID, nome, descrição, DRE ou classificação'
              }}
              filtros={[{
                id: 'tipo',
                rotulo: 'Fluxo',
                opcoes: [
                  { valor: 'PAGAR', rotulo: CATEGORIA_TIPO_META.PAGAR.label },
                  { valor: 'RECEBER', rotulo: CATEGORIA_TIPO_META.RECEBER.label },
                  { valor: 'AMBOS', rotulo: CATEGORIA_TIPO_META.AMBOS.label }
                ]
              }]}
              ativos={categoriaFiltrosAtivos}
              aoAlternar={(dimensao, valor, opcoes) => setCategoriaFiltrosAtivos(
                (atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes)
              )}
              aoLimpar={() => setCategoriaFiltrosAtivos({})}
            />

            {categorias.length === 0 ? (
              <div className="app-note">Nenhuma categoria financeira cadastrada.</div>
            ) : !temRecorteCategoria ? (
              <div className="app-empty-card">
                Comece digitando, marque um fluxo, ou abra o catalogo para consultar todas.
              </div>
            ) : categoriasFiltradas.length === 0 ? (
              <div className="app-note">Nenhuma categoria encontrada para esse recorte.</div>
            ) : (
              <div className="finance-category-sections">
                {secoesCategorias.map((secao) => (
                  <section key={secao.key} className="finance-category-section">
                    <div className="finance-category-section-head">
                      <div>
                        <h3 className="finance-category-section-title">{secao.titulo}</h3>
                        <p className="finance-category-section-subtitle">{secao.descricao}</p>
                      </div>
                      <span className="badge-status badge-status--archived">
                        {secao.itens.length} item(ns)
                      </span>
                    </div>

                    {secao.itens.length === 0 ? (
                      <div className="app-note">
                        Nenhuma categoria em {categoriaTipoLabel(secao.key).toLowerCase()} para o recorte atual.
                      </div>
                    ) : (
                      <div className="app-list-stack">
                        {secao.itens.map((categoria) => (
                          <div key={categoria.id} className="app-list-card">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div className="text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium text-[var(--c-text)]">{categoria.nome}</div>
                                  <span className={categoriaTipoBadgeClass(String(categoria.tipo || 'AMBOS').trim().toUpperCase())}>
                                    {categoriaTipoLabel(String(categoria.tipo || 'AMBOS').trim().toUpperCase())}
                                  </span>
                                </div>
                                <div className="mt-1 text-[var(--c-muted)]">
                                  {categoria.descricao || 'Sem descricao complementar.'}
                                </div>
                                <div className="mt-1 text-xs text-[var(--c-muted)]">
                                  DRE: {categoria.considera_dre === false ? 'Nao considera' : `${categoria.dre_grupo || 'Nao classificada'}${categoria.dre_subgrupo ? ` / ${categoria.dre_subgrupo}` : ''}`}
                                </div>
                                <div className="mt-1 text-xs text-[var(--c-muted)]">
                                  Gerencial: {categoriaClassificacaoLabel(categoria.classificacao_gerencial)}
                                </div>
                              </div>
                              <div className="app-actionbar">
                                <span className={statusClass(categoria.ativo)}>
                                  {categoria.ativo ? 'ATIVA' : 'INATIVA'}
                                </span>
                                <button type="button" className="btn btn-outline" onClick={() => handleEditarCategoria(categoria)}>
                                  Editar
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Formas de pagamento"
            descricao={formaPagamentoForm.id
              ? 'Edite a forma selecionada.'
              : 'Defina como o titulo sera gerado: boleto, cartao, cheque, pix ou outros fluxos.'}
            variante="secundario"
          >
            <form onSubmit={handleSalvarFormaPagamento}>
              <FormSecao legenda="Identificação" colunas={2}>
                <CampoForm label="Nome" obrigatorio>
                  <input
                    className="input w-full"
                    value={formaPagamentoForm.nome}
                    onChange={(e) => setFormaPagamentoForm((c) => ({ ...c, nome: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Código" obrigatorio>
                  <input
                    className="input w-full"
                    value={formaPagamentoForm.codigo}
                    onChange={(e) => setFormaPagamentoForm((c) => ({ ...c, codigo: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Tipo">
                  <select
                    className="input w-full"
                    value={formaPagamentoForm.tipo}
                    onChange={(e) => setFormaPagamentoForm((c) => ({ ...c, tipo: e.target.value }))}
                  >
                    <option value="BOLETO">Boleto</option>
                    <option value="PIX">Pix</option>
                    <option value="TRANSFERENCIA">Transferência</option>
                    <option value="CARTAO_CREDITO">Cartão de crédito</option>
                    <option value="CARTAO_DEBITO">Cartão de débito</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                </CampoForm>

                <CampoForm label="Ordem de exibição">
                  <input
                    className="input valor-tabular w-full"
                    type="number"
                    min="0"
                    value={formaPagamentoForm.ordem}
                    onChange={(e) => setFormaPagamentoForm((c) => ({ ...c, ordem: e.target.value }))}
                  />
                </CampoForm>
              </FormSecao>

              <FormSecao legenda="Comportamento" colunas={2}>
                {[
                  ['permite_parcelamento', 'Permite parcelamento'],
                  ['gera_fatura', 'Gera fatura'],
                  ['gera_boleto', 'Gera boleto'],
                  ['exige_cartao', 'Exige cartao'],
                  ['exige_cheque', 'Exige cheque'],
                  ['ativo', 'Ativa']
                ].map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                    <input
                      type="checkbox"
                      checked={Boolean(formaPagamentoForm[field])}
                      onChange={(e) => setFormaPagamentoForm((c) => ({ ...c, [field]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </FormSecao>

              <div className="app-actionbar">
                <button type="submit" className="btn btn-primary" disabled={savingFormaPagamento}>
                  {savingFormaPagamento ? 'Salvando...' : (formaPagamentoForm.id ? 'Salvar alteracoes' : 'Criar forma')}
                </button>
                {formaPagamentoForm.id && (
                  <button type="button" className="btn btn-outline" onClick={() => setFormaPagamentoForm(defaultFormaPagamentoForm())}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            <div className="mt-4 app-list-stack">
              {formasPagamento.length === 0 ? (
                <div className="app-note">Nenhuma forma de pagamento cadastrada.</div>
              ) : formasPagamento.map((forma) => (
                <div key={forma.id} className="app-list-card">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="text-sm">
                      <div className="font-medium text-[var(--c-text)]">{forma.nome}</div>
                      <div className="text-[var(--c-muted)]">
                        {forma.codigo} - {forma.tipo}
                        {forma.permite_parcelamento ? ' - parcelavel' : ''}
                        {forma.gera_fatura ? ' - fatura' : ''}
                      </div>
                    </div>
                    <div className="app-actionbar">
                      <span className={statusClass(forma.ativo)}>{forma.ativo ? 'ATIVA' : 'INATIVA'}</span>
                      <button type="button" className="btn btn-outline" onClick={() => setFormaPagamentoForm(pickFormaPagamentoFormData(forma))}>
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Atalhos de tarifas bancárias"
            contagem={`${tarifasBancariasAtalhos.length} atalho(s)`}
            descricao="Atalhos da conciliação bancária para tarifas como TAR PIX, TAR TED e manutenção de conta. Cada atalho precisa de categoria financeira de saída e classificada para DRE."
            variante="secundario"
            acoes={(
              <button type="button" className="btn btn-outline" onClick={handleAdicionarTarifaBancaria}>
                Adicionar
              </button>
            )}
          >
            <div className="app-list-stack">
              {tarifasBancariasAtalhos.length === 0 ? (
                <div className="app-note">Nenhum atalho de tarifa configurado.</div>
              ) : tarifasBancariasAtalhos.map((tarifa, index) => (
                <div key={tarifa._draftId} className="app-list-card">
                  <FormSecao legenda={`Atalho ${index + 1}`} colunas={2}>
                    <CampoForm label="Nome exibido">
                      <input
                        className="input w-full"
                        value={tarifa.nome || ''}
                        onChange={(e) => handleAlterarTarifaBancaria(index, 'nome', e.target.value)}
                      />
                    </CampoForm>

                    <CampoForm label="Código">
                      <input
                        className="input w-full"
                        value={tarifa.codigo || ''}
                        onChange={(e) => handleAlterarTarifaBancaria(index, 'codigo', e.target.value)}
                      />
                    </CampoForm>

                    <CampoForm label="Descrição" tipo="observacao">
                      <textarea
                        className="input w-full"
                        value={tarifa.descricao || ''}
                        onChange={(e) => handleAlterarTarifaBancaria(index, 'descricao', e.target.value)}
                      />
                    </CampoForm>

                    <CampoForm
                      label="Categoria financeira da tarifa"
                      obrigatorio
                      linha
                      hint="A lista mostra apenas categorias ativas de pagar/ambos, com grupo DRE e sem classificacao de endividamento, investimento, patrimonial, entre empresas ou transferencia interna."
                    >
                      <select
                        className="input w-full"
                        value={tarifa.categoria_financeira_id || ''}
                        onChange={(e) => handleAlterarTarifaBancaria(index, 'categoria_financeira_id', e.target.value)}
                        required
                      >
                        <option value="">Selecione a categoria</option>
                        {categoriasTarifasBancarias.map((categoria) => (
                          <option key={categoria.id} value={categoria.id}>
                            {categoria.nome} ({categoria.dre_grupo}{categoria.dre_subgrupo ? ` / ${categoria.dre_subgrupo}` : ''})
                          </option>
                        ))}
                      </select>
                    </CampoForm>
                  </FormSecao>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                      <input
                        type="checkbox"
                        checked={tarifa.ativo !== false}
                        onChange={(e) => handleAlterarTarifaBancaria(index, 'ativo', e.target.checked)}
                      />
                      Ativo
                    </label>
                    <button type="button" className="btn btn-outline btn-perigo-suave" onClick={() => handleRemoverTarifaBancaria(index)}>
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="app-actionbar">
              <button type="button" className="btn btn-primary" disabled={savingTarifasBancarias} onClick={handleSalvarTarifasBancarias}>
                {savingTarifasBancarias ? 'Salvando...' : 'Salvar atalhos'}
              </button>
            </div>
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Cartões"
            descricao={cartaoForm.id
              ? 'Edite o cartao selecionado.'
              : 'Cadastre cartoes para agrupar titulos por fatura conforme fechamento e vencimento.'}
            variante="secundario"
          >
            <form onSubmit={handleSalvarCartao}>
              <FormSecao legenda="Identificação" colunas={3}>
                <CampoForm label="Nome do cartão" obrigatorio>
                  <input
                    className="input w-full"
                    value={cartaoForm.nome}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, nome: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Titular" obrigatorio>
                  <input
                    className="input w-full"
                    value={cartaoForm.titular}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, titular: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Tipo">
                  <select
                    className="input w-full"
                    value={cartaoForm.tipo}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, tipo: e.target.value }))}
                  >
                    <option value="CREDITO">Crédito</option>
                    <option value="DEBITO">Débito</option>
                  </select>
                </CampoForm>

                <CampoForm label="Bandeira">
                  <input
                    className="input w-full"
                    value={cartaoForm.bandeira}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, bandeira: e.target.value }))}
                  />
                </CampoForm>

                <CampoForm label="4 últimos dígitos" obrigatorio>
                  <input
                    className="input valor-tabular w-full"
                    maxLength={4}
                    inputMode="numeric"
                    value={cartaoForm.ultimos_digitos}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, ultimos_digitos: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    required
                  />
                </CampoForm>

                <CampoForm
                  label="Conta de pagamento"
                  obrigatorio={String(cartaoForm.tipo || '').toUpperCase() === 'DEBITO'}
                  hint={String(cartaoForm.tipo || '').toUpperCase() === 'DEBITO'
                    ? 'Conta obrigatoria para cartao de debito.'
                    : 'Opcional para cartao de credito.'}
                >
                  <select
                    className="input w-full"
                    value={cartaoForm.conta_bancaria_id}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, conta_bancaria_id: e.target.value }))}
                    required={String(cartaoForm.tipo || '').toUpperCase() === 'DEBITO'}
                  >
                    <option value="">Selecione a conta</option>
                    {contas.map((conta) => (
                      <option key={conta.id} value={conta.id}>{conta.nome}</option>
                    ))}
                  </select>
                </CampoForm>
              </FormSecao>

              <FormSecao legenda="Fatura" colunas={2}>
                <CampoForm label="Dia de fechamento" obrigatorio>
                  <input
                    className="input valor-tabular w-full"
                    type="number"
                    min="1"
                    max="31"
                    value={cartaoForm.dia_fechamento}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, dia_fechamento: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Dia de vencimento" obrigatorio>
                  <input
                    className="input valor-tabular w-full"
                    type="number"
                    min="1"
                    max="31"
                    value={cartaoForm.dia_vencimento}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, dia_vencimento: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Observações" tipo="observacao">
                  <textarea
                    className="input w-full"
                    value={cartaoForm.observacoes}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, observacoes: e.target.value }))}
                  />
                </CampoForm>

                <label className="form-campo--linha flex items-center gap-2 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    checked={cartaoForm.ativo}
                    onChange={(e) => setCartaoForm((c) => ({ ...c, ativo: e.target.checked }))}
                  />
                  Cartão ativo
                </label>
              </FormSecao>

              <div className="app-actionbar">
                <button type="submit" className="btn btn-primary" disabled={savingCartao}>
                  {savingCartao ? 'Salvando...' : (cartaoForm.id ? 'Salvar alteracoes' : 'Criar cartao')}
                </button>
                {cartaoForm.id && (
                  <button type="button" className="btn btn-outline" onClick={() => setCartaoForm(defaultCartaoForm())}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            <div className="mt-4 app-list-stack">
              {cartoes.length === 0 ? (
                <div className="app-note">Nenhum cartão cadastrado.</div>
              ) : cartoes.map((cartao) => (
                <div key={cartao.id} className="app-list-card">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="text-sm">
                      <div className="font-medium text-[var(--c-text)]">{cartao.nome}</div>
                      <div className="text-[var(--c-muted)]">
                        {labelTipoCartao(cartao.tipo)} - {cartao.bandeira || 'Bandeira nao informada'} final {cartao.ultimos_digitos} - fecha dia {cartao.dia_fechamento}, vence dia {cartao.dia_vencimento}
                      </div>
                    </div>
                    <div className="app-actionbar">
                      <span className={statusClass(cartao.ativo)}>{cartao.ativo ? 'ATIVO' : 'INATIVO'}</span>
                      <button type="button" className="btn btn-outline" onClick={() => setCartaoForm(pickCartaoFormData(cartao))}>
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Favorecidos bancários PIX"
            contagem={`${favorecidos.length} favorecido(s)`}
            descricao="Cadastro rastreado usado pelos lotes de pagamento em massa."
            variante="secundario"
            acoes={(
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => carregarFavorecidos()}
                disabled={!favorecidoForm.parceiro_id || loadingFavorecidos}
              >
                {loadingFavorecidos ? 'Carregando...' : 'Buscar favorecidos'}
              </button>
            )}
          >
            <form onSubmit={handleSalvarFavorecido}>
              <FormSecao legenda="Favorecido" colunas={3}>
                <CampoForm label="Parceiro ID" obrigatorio>
                  <input
                    className="input valor-tabular w-full"
                    inputMode="numeric"
                    value={favorecidoForm.parceiro_id}
                    onChange={(e) => setFavorecidoForm((c) => ({ ...c, parceiro_id: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Nome favorecido" obrigatorio>
                  <input
                    className="input w-full"
                    value={favorecidoForm.nome}
                    onChange={(e) => setFavorecidoForm((c) => ({ ...c, nome: e.target.value }))}
                    required
                  />
                </CampoForm>

                <CampoForm label="CPF/CNPJ" obrigatorio>
                  <input
                    className="input w-full"
                    value={maskCpfCnpj(favorecidoForm.cpf_cnpj)}
                    onChange={(e) => setFavorecidoForm((c) => ({ ...c, cpf_cnpj: maskCpfCnpj(e.target.value) }))}
                    inputMode="numeric"
                    maxLength={18}
                    required
                  />
                </CampoForm>

                <CampoForm label="Tipo chave">
                  <select
                    className="input w-full"
                    value={favorecidoForm.pix_tipo_chave}
                    onChange={(e) => setFavorecidoForm((c) => ({ ...c, pix_tipo_chave: e.target.value }))}
                  >
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="EMAIL">EMAIL</option>
                    <option value="TELEFONE">TELEFONE</option>
                    <option value="ALEATORIA">ALEATORIA</option>
                  </select>
                </CampoForm>

                <CampoForm label="Chave PIX" obrigatorio span={2}>
                  <input
                    className="input w-full"
                    value={favorecidoForm.pix_chave}
                    onChange={(e) => setFavorecidoForm((c) => ({ ...c, pix_chave: e.target.value }))}
                    required
                  />
                </CampoForm>

                <label className="form-campo--linha flex items-center gap-2 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    checked={favorecidoForm.ativo}
                    onChange={(e) => setFavorecidoForm((c) => ({ ...c, ativo: e.target.checked }))}
                  />
                  Favorecido ativo
                </label>
              </FormSecao>

              <div className="app-actionbar">
                <button type="submit" className="btn btn-primary" disabled={savingFavorecido}>
                  {savingFavorecido ? 'Salvando...' : (favorecidoForm.id ? 'Salvar favorecido' : 'Criar favorecido')}
                </button>
                {favorecidoForm.id && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setFavorecidoForm((current) => ({ ...defaultFavorecidoForm(), parceiro_id: current.parceiro_id }))}
                  >
                    Novo
                  </button>
                )}
              </div>
            </form>

            <div className="mt-4 app-list-stack">
              {favorecidos.length === 0 ? (
                <div className="app-note">Informe o parceiro ID e busque os favorecidos vinculados.</div>
              ) : favorecidos.map((favorecido) => (
                <div key={favorecido.id} className="app-list-card">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="text-sm">
                      <div className="font-medium text-[var(--c-text)]">{favorecido.nome}</div>
                      <div className="text-[var(--c-muted)]">{favorecido.pix_tipo_chave} - {favorecido.pix_chave}</div>
                      <div className="text-[var(--c-muted)]">CPF/CNPJ: {favorecido.cpf_cnpj}</div>
                    </div>
                    <div className="app-actionbar">
                      <span className={statusClass(favorecido.ativo)}>{favorecido.ativo ? 'ATIVO' : 'INATIVO'}</span>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setFavorecidoForm({
                          id: favorecido.id,
                          parceiro_id: String(favorecido.parceiro_id || ''),
                          nome: favorecido.nome || '',
                          cpf_cnpj: favorecido.cpf_cnpj || '',
                          pix_tipo_chave: favorecido.pix_tipo_chave || 'CNPJ',
                          pix_chave: favorecido.pix_chave || '',
                          ativo: favorecido.ativo !== false
                        })}
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </BlocoConteudo>
        </>
      )}

      {categoriasModalAberto && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="categorias-financeiras-modal-title">
          <div className="modal-dialog modal-dialog--xl finance-category-modal">
            <div className="modal-header">
              <div>
                <h2 id="categorias-financeiras-modal-title" className="text-lg font-semibold text-[var(--c-text)]">
                  Catalogo de categorias financeiras
                </h2>
                <p className="text-sm text-[var(--c-muted)]">
                  Consulte todas as categorias por fluxo e edite sem sair dos cadastros financeiros.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCategoriasModalAberto(false)}
                aria-label="Fechar catalogo de categorias"
              >
                <HiXMark className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="modal-body finance-category-modal-body">
              <div className="finance-category-modal-controls">
                {/* Seletor de CONTEXTO (qual catálogo se navega), não filtro
                    de lista: a R12 vale para o recorte da listagem, que já
                    está na BarraFiltros da tela. */}
                <div className="finance-category-toggle-group" role="tablist" aria-label="Tipo de categoria no catalogo">
                  {[
                    ['PAGAR', 'Contas a pagar'],
                    ['RECEBER', 'Contas a receber']
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={categoriasModalAba === key}
                      className={`finance-category-toggle ${categoriasModalAba === key ? 'finance-category-toggle--active' : ''}`}
                      onClick={() => setCategoriasModalAba(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="finance-category-search-line">
                  <input
                    className="input app-busca w-full"
                    placeholder="Filtrar por ID, nome, descrição, DRE ou classificação"
                    value={categoriasModalBusca}
                    onChange={(event) => setCategoriasModalBusca(event.target.value)}
                  />
                </div>
              </div>

              <div className="finance-category-modal-summary">
                <span className="badge-status badge-status--archived">
                  {categoriasModalFiltradas.length} categoria(s)
                </span>
                <span>
                  Categorias compartilhadas aparecem nas duas abas porque podem ser usadas nos dois fluxos.
                </span>
              </div>

              {categoriasModalFiltradas.length === 0 ? (
                <div className="app-empty-card">
                  Nenhuma categoria encontrada nesta aba.
                </div>
              ) : (
                <div className="finance-category-modal-table" role="table" aria-label="Categorias financeiras cadastradas">
                  <div className="finance-category-modal-row finance-category-modal-row--head" role="row">
                    <span>Ações</span>
                    <span>Categoria</span>
                    <span>Tipo</span>
                    <span>DRE</span>
                    <span>Status</span>
                  </div>
                  {categoriasModalFiltradas.map((categoria) => (
                    <div key={categoria.id} className="finance-category-modal-row" role="row">
                      <div className="finance-category-modal-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-icon"
                          onClick={() => handleEditarCategoria(categoria)}
                          aria-label={`Editar categoria ${categoria.nome}`}
                          title="Editar categoria"
                        >
                          <HiOutlinePencilSquare className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <div>
                        <strong>{categoria.nome}</strong>
                        <small>{categoria.descricao || 'Sem descricao complementar.'}</small>
                      </div>
                      <span className={categoriaTipoBadgeClass(String(categoria.tipo || 'AMBOS').trim().toUpperCase())}>
                        {categoriaTipoLabel(String(categoria.tipo || 'AMBOS').trim().toUpperCase())}
                      </span>
                      <div>
                        <strong>{categoria.considera_dre === false ? 'Nao considera' : (categoria.dre_grupo || 'Nao classificada')}</strong>
                        {categoria.dre_subgrupo && <small>{categoria.dre_subgrupo}</small>}
                      </div>
                      <span className={statusClass(categoria.ativo)}>
                        {categoria.ativo ? 'ATIVA' : 'INATIVA'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Pagina>
  );
}
