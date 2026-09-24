import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getMinhasObras } from '../services/obras';
import { buscarParceiros } from '../services/parceiros';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import {
  atualizarPaymentBeneficiary,
  criarPaymentBeneficiary,
  criarTituloFinanceiro,
  getCartoesFinanceiros,
  getCategoriasFinanceiras,
  getFormasPagamentoFinanceiras,
  getPaymentAccounts,
  getPaymentBeneficiaries
} from '../services/financeiro';
import { listarApropriacoes } from '../services/apropriacoes';
import { useAuth } from '../contexts/AuthContext';
import { hasEnabledModule } from '../utils/acessoProduto';
import { formatCurrencyInput, normalizeCurrencyTyping } from '../utils/formatters';
import {
  categoriaFinanceiraMatchesAutocomplete,
  categoriaFinanceiraMatchesSearch
} from '../utils/categoriaFinanceira';
import CategoriaFinanceiraAutocomplete from '../components/ui/CategoriaFinanceiraAutocomplete';
import ApropriacaoAutocomplete from '../components/ui/ApropriacaoAutocomplete';

const FORMAS_COBRANCA = ['BOLETO', 'PIX', 'OUTROS'];
const STATUS_COBRANCA = ['PENDENTE_EMISSAO', 'EMITIDO', 'PAGO_BANCO', 'CONCILIADO', 'CANCELADO'];
const PIX_TIPOS_CHAVE = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'];
const TIPOS_INTERCOMPANY = [
  ['APORTE', 'Aporte'],
  ['EMPRESTIMO', 'Emprestimo'],
  ['REEMBOLSO', 'Reembolso'],
  ['RATEIO', 'Rateio'],
  ['COBERTURA_CAIXA', 'Cobertura de caixa'],
  ['FOLHA', 'Folha'],
  ['ADMINISTRATIVO', 'Administrativo'],
  ['IMPOSTO', 'Imposto'],
  ['TRANSFERENCIA_OPERACIONAL', 'Transferencia operacional']
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function resolveTipo(value) {
  return String(value || '').trim().toUpperCase() === 'RECEBER' ? 'RECEBER' : 'PAGAR';
}

function parceiroCompativelComTipo(parceiro, tipo) {
  if (!parceiro) return false;
  if (resolveTipo(tipo) === 'RECEBER') {
    return parceiro.cliente !== false;
  }
  return parceiro.fornecedor !== false || parceiro.corretor === true;
}

function isCadastroObra(obra) {
  return String(obra?.tipo_centro_custo || 'OBRA').trim().toUpperCase() === 'OBRA';
}

function getEmpresaObraId(obra) {
  return obra?.empresa_grupo_id ? String(obra.empresa_grupo_id) : '';
}

function empresaIntercompanySelecionavel(empresa) {
  return empresa?.ativo !== false && String(empresa?.tipo_empresa || 'OPERACIONAL').toUpperCase() !== 'HOLDING';
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function currencyToNumber(value) {
  if (value == null || value === '') return 0;
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeCodigoBancoInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function calcularValorImposto(imposto) {
  const base = currencyToNumber(imposto?.base_calculo);
  const aliquota = currencyToNumber(imposto?.aliquota);
  if (base <= 0 || aliquota <= 0) return '';
  return formatCurrencyInput(roundCurrency((base * aliquota) / 100));
}

function addMonths(dateString, amount) {
  const date = new Date(`${dateString || today()}T00:00:00`);
  if (Number.isNaN(date.getTime())) return today();
  const day = date.getDate();
  date.setMonth(date.getMonth() + Number(amount || 0), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function distribuirParcelasFormatadas(valorTotal, quantidade) {
  const totalCentavos = Math.round(currencyToNumber(valorTotal) * 100);
  if (!totalCentavos || !quantidade) return [];
  const base = Math.floor(totalCentavos / quantidade);
  let resto = totalCentavos - (base * quantidade);
  return Array.from({ length: quantidade }, () => {
    const centavos = base + (resto > 0 ? 1 : 0);
    if (resto > 0) resto -= 1;
    return formatCurrencyInput(centavos / 100);
  });
}

function buildParcelasDetalhadas(
  parcelasAtuais = [],
  quantidade = 1,
  dataBase = today(),
  valorTotal = '',
  { redistribuirValores = false } = {}
) {
  const valoresSugeridos = distribuirParcelasFormatadas(valorTotal, quantidade);
  return Array.from({ length: quantidade }, (_, index) => ({
    valor: redistribuirValores ? (valoresSugeridos[index] || '') : (parcelasAtuais[index]?.valor || valoresSugeridos[index] || ''),
    data_vencimento: parcelasAtuais[index]?.data_vencimento || addMonths(dataBase || today(), index),
    numero_documento: parcelasAtuais[index]?.numero_documento || '',
    banco_cobranca: parcelasAtuais[index]?.banco_cobranca || '',
    linha_digitavel: parcelasAtuais[index]?.linha_digitavel || '',
    codigo_barras: parcelasAtuais[index]?.codigo_barras || '',
    observacoes: parcelasAtuais[index]?.observacoes || '',
    cheque_numero: parcelasAtuais[index]?.cheque_numero || '',
    cheque_banco: parcelasAtuais[index]?.cheque_banco || '',
    cheque_agencia: parcelasAtuais[index]?.cheque_agencia || '',
    cheque_conta: parcelasAtuais[index]?.cheque_conta || '',
    cheque_emitente: parcelasAtuais[index]?.cheque_emitente || ''
  }));
}

function createPagamento(valor = '', parceiro = null, categoriaFinanceiraId = '') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    valor,
    parceiro_id: parceiro?.id ? String(parceiro.id) : '',
    parceiro_nome: parceiro?.nome || '',
    parceiro_busca: '',
    categoria_financeira_id: categoriaFinanceiraId ? String(categoriaFinanceiraId) : '',
    data_vencimento: today(),
    forma_pagamento_id: '',
    cartao_id: '',
    quantidade_parcelas: '1',
    data_compra: today(),
    parcelas: []
  };
}

function createRateio(valor = '') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    obra_id: '',
    tipo_rateio: 'PERCENTUAL',
    percentual: '',
    valor_rateio: valor,
    observacoes: ''
  };
}

function createImposto() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tipo_imposto: '',
    descricao: '',
    natureza: 'RETENCAO',
    base_calculo: '',
    aliquota: '',
    valor: '',
    observacoes: ''
  };
}

function buildDefaultForm(tipo = 'PAGAR') {
  return {
    tipo: resolveTipo(tipo),
    status: 'ABERTO',
    obra_id: '',
    empresa_id: '',
    parceiro_id: '',
    categoria_financeira_id: '',
    descricao: '',
    numero_documento: '',
    forma_cobranca: '',
    status_cobranca: 'PENDENTE_EMISSAO',
    banco_cobranca: '',
    nosso_numero: '',
    linha_digitavel: '',
    codigo_barras: '',
    identificador_externo: '',
    boleto_emitido_em: '',
    valor: '',
    desconto_financeiro: '',
    data_emissao: today(),
    competencia_data: today(),
    considera_dre: true,
    intercompany: false,
    empresa_contraparte_id: '',
    intercompany_group_id: '',
    empresa_origem_id: '',
    empresa_destino_id: '',
    tipo_intercompany: '',
    motivo_intercompany: '',
    elimina_consolidado: true,
    transferencia_interna: true,
    data_vencimento: today(),
    observacoes: '',
    apropriacao_id: '',
    forma_pagamento_id: '',
    cartao_id: '',
    quantidade_parcelas: 1,
    data_compra: today(),
    rateios: [],
    impostos: [],
    pagamentos: [createPagamento('')]
  };
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function categoriaCompativel(categoria, tipoTitulo) {
  if (!categoria || categoria.ativo === false) {
    return false;
  }

  const tipoCategoria = String(categoria?.tipo || '').trim().toUpperCase();
  const tipo = String(tipoTitulo || '').trim().toUpperCase();
  return !tipoCategoria || tipoCategoria === 'AMBOS' || tipoCategoria === tipo;
}

function prioridadeCategoria(categoria, tipoTitulo) {
  const tipoCategoria = String(categoria?.tipo || '').trim().toUpperCase();
  if (tipoCategoria === tipoTitulo) return 0;
  return 2;
}

function getTipoCartaoPorForma(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''}`.toUpperCase();
  if (value.includes('DEBITO')) return 'DEBITO';
  if (value.includes('CREDITO')) return 'CREDITO';
  return null;
}

function cartaoCompativelComForma(cartao, forma) {
  const tipoEsperado = getTipoCartaoPorForma(forma);
  if (!tipoEsperado) return true;
  return String(cartao?.tipo || 'CREDITO').trim().toUpperCase() === tipoEsperado;
}

function labelTipoCartao(value) {
  return String(value || 'CREDITO').trim().toUpperCase() === 'DEBITO' ? 'debito' : 'credito';
}

function isFormaCartao(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''}`.toUpperCase();
  return Boolean(forma?.exige_cartao) || value.includes('CARTAO');
}

function isFormaBoleto(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`.toUpperCase();
  return value.includes('BOLETO');
}

function isFormaOutros(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`.toUpperCase();
  return value.includes('OUTROS') || value.includes('OUTRO');
}

function isFormaCheque(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`.toUpperCase();
  return value.includes('CHEQUE');
}

function isFormaPix(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`.toUpperCase();
  return value.includes('PIX');
}

function formaPermiteParcelamentoOperacional(forma) {
  return Boolean(forma?.permite_parcelamento) || isFormaPix(forma) || isFormaOutros(forma);
}

function formaUsaParcelasDetalhadas(forma) {
  return Boolean(forma) && (isFormaBoleto(forma) || isFormaCheque(forma) || isFormaPix(forma) || isFormaOutros(forma));
}

function getLabelParcelaForma(forma) {
  if (isFormaCheque(forma)) return 'cheque';
  if (isFormaPix(forma)) return 'PIX';
  if (isFormaOutros(forma)) return 'guia de pagamento';
  return 'boleto';
}

function formaAceitaDadosBoletoOuGuia(forma) {
  return isFormaBoleto(forma) || isFormaOutros(forma);
}

function resolveFormaCobrancaPagamento(forma) {
  if (isFormaOutros(forma)) return 'OUTROS';
  if (isFormaBoleto(forma)) return 'BOLETO';
  return undefined;
}

function resolveFormaCobrancaPagamentos(pagamentos = [], getFormaPagamento) {
  const formaComCobranca = pagamentos
    .map((pagamento) => getFormaPagamento(pagamento?.forma_pagamento_id))
    .find((forma) => formaAceitaDadosBoletoOuGuia(forma));
  return resolveFormaCobrancaPagamento(formaComCobranca);
}

function getParceiroPixOptions(parceiro) {
  if (!parceiro) return [];
  return [
    {
      id: 'pix_chave_fixa_1',
      label: 'Chave fixa 1',
      tipo: parceiro.pix_chave_fixa_1_tipo,
      chave: parceiro.pix_chave_fixa_1
    },
    {
      id: 'pix_chave_fixa_2',
      label: 'Chave fixa 2',
      tipo: parceiro.pix_chave_fixa_2_tipo,
      chave: parceiro.pix_chave_fixa_2
    },
    {
      id: 'pix_chave_variavel',
      label: 'Chave variavel',
      tipo: parceiro.pix_chave_variavel_tipo,
      chave: parceiro.pix_chave_variavel
    }
  ].filter((item) => item.tipo && item.chave);
}

function getParceiroPixPrincipal(parceiro) {
  return getParceiroPixOptions(parceiro)[0] || null;
}

function getCategoriaDreResumo(categoria) {
  if (!categoria) return 'Sem categoria financeira';
  if (categoria.considera_dre === false) return 'Categoria fora da DRE';
  const grupo = categoria.dre_grupo || 'Grupo DRE nao classificado';
  const subgrupo = categoria.dre_subgrupo ? ` / ${categoria.dre_subgrupo}` : '';
  return `${grupo}${subgrupo}`;
}

function isCategoriaClassificadaParaDre(categoria) {
  return Boolean(categoria && categoria.considera_dre !== false && String(categoria.dre_grupo || '').trim());
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function FinanceiroTituloNovo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const moduloApropriacoesHabilitado = hasEnabledModule(user, 'OBRAS');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTipo = resolveTipo(searchParams.get('tipo'));
  const [form, setForm] = useState(() => buildDefaultForm(initialTipo));
  const [obras, setObras] = useState([]);
  const [empresasGrupo, setEmpresasGrupo] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [apropriacoes, setApropriacoes] = useState([]);
  const [loadingApropriacoes, setLoadingApropriacoes] = useState(false);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingParceiros, setLoadingParceiros] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parceiroBusca, setParceiroBusca] = useState('');
  const [categoriaBusca, setCategoriaBusca] = useState('');
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [categoriaModalBusca, setCategoriaModalBusca] = useState('');
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [paymentDraft, setPaymentDraft] = useState({
    preparar_pagamento_pix: false,
    usar_credor_como_favorecido: false,
    payment_beneficiary_id: '',
    nome: '',
    cpf_cnpj: '',
    pix_tipo_chave: 'CNPJ',
    pix_chave: '',
    payment_account_id: '',
    data_pagamento: today()
  });
  const [prefillAplicado, setPrefillAplicado] = useState(false);

  useEffect(() => {
    let active = true;

    async function carregarBase() {
      try {
        setLoadingBase(true);
        setError('');
        const [obrasData, categoriasData, empresasData, paymentAccountsData, formasData, cartoesData] = await Promise.all([
          getMinhasObras({ modo: 'FINANCEIRO', escopo: 'TODOS' }),
          getCategoriasFinanceiras(),
          getEmpresasGrupo({ ativo: 1 }).catch(() => []),
          getPaymentAccounts().catch(() => []),
          getFormasPagamentoFinanceiras().catch(() => []),
          getCartoesFinanceiros().catch(() => [])
        ]);

        if (!active) return;

        const obrasLista = Array.isArray(obrasData) ? obrasData : [];
        const categoriasLista = Array.isArray(categoriasData) ? categoriasData : [];
        setObras(obrasLista);
        setCategorias(categoriasLista);
        setEmpresasGrupo(Array.isArray(empresasData) ? empresasData : []);
        setPaymentAccounts(Array.isArray(paymentAccountsData) ? paymentAccountsData : []);
        setFormasPagamento(Array.isArray(formasData) ? formasData : []);
        setCartoes(Array.isArray(cartoesData) ? cartoesData : []);
        setPaymentDraft((current) => ({
          ...current,
          payment_account_id: current.payment_account_id || String(paymentAccountsData?.[0]?.id || '')
        }));
        setForm((current) => {
          const obraPadrao = obrasLista.find((obra) => String(obra.id) === String(current.obra_id)) || obrasLista[0];
          return {
            ...current,
            obra_id: current.obra_id || String(obraPadrao?.id || ''),
            empresa_id: current.empresa_id || getEmpresaObraId(obraPadrao)
          };
        });
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Erro ao carregar dados do financeiro');
      } finally {
        if (active) setLoadingBase(false);
      }
    }

    carregarBase();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (prefillAplicado || loadingBase) return;

    const origemFreteId = searchParams.get('origem_frete_id');
    if (!origemFreteId) {
      setPrefillAplicado(true);
      return;
    }

    const parceiroId = searchParams.get('parceiro_id') || '';
    const parceiroNome = searchParams.get('parceiro_nome') || '';
    const obraId = searchParams.get('obra_id') || '';
    const valor = searchParams.get('valor') || '';
    const vencimento = searchParams.get('data_vencimento') || today();
    const descricao = searchParams.get('descricao') || 'Frete de pedido de compra';
    const numeroDocumento = searchParams.get('numero_documento') || '';
    const observacoes = searchParams.get('observacoes') || '';
    const obraSelecionadaPrefill = obras.find((obra) => String(obra.id) === String(obraId));
    if (obraId && !obraSelecionadaPrefill) {
      return;
    }

    if (parceiroId && parceiroNome) {
      setParceiros((current) => {
        if (current.some((parceiro) => String(parceiro.id) === String(parceiroId))) {
          return current;
        }
        return [
          {
            id: parceiroId,
            nome: parceiroNome,
            fornecedor: true,
            ativo: true
          },
          ...current
        ];
      });
      setParceiroBusca(parceiroNome);
    }

    setForm((current) => ({
      ...current,
      tipo: 'PAGAR',
      status: 'ABERTO',
      obra_id: obraId || current.obra_id,
      empresa_id: getEmpresaObraId(obraSelecionadaPrefill) || current.empresa_id,
      parceiro_id: parceiroId || current.parceiro_id,
      valor: valor ? formatCurrencyInput(Number(valor)) : current.valor,
      data_vencimento: vencimento,
      data_emissao: current.data_emissao || today(),
      competencia_data: current.competencia_data || vencimento,
      descricao,
      numero_documento: numeroDocumento,
      observacoes,
      pagamentos: (current.pagamentos || [createPagamento('')]).map((pagamento, index) => index === 0
        ? {
          ...pagamento,
          valor: valor ? formatCurrencyInput(Number(valor)) : pagamento.valor,
          parceiro_id: parceiroId || pagamento.parceiro_id,
          parceiro_nome: parceiroNome || pagamento.parceiro_nome,
          data_vencimento: vencimento
        }
        : pagamento)
    }));
    setPrefillAplicado(true);
  }, [loadingBase, obras, prefillAplicado, searchParams]);

  useEffect(() => {
    let active = true;

    async function carregarParceiros() {
      const termoBusca = parceiroBusca.trim();
      if (!termoBusca) {
        setParceiros([]);
        setLoadingParceiros(false);
        return;
      }

      try {
        setLoadingParceiros(true);
        const params = {
          ativo: 1,
          limit: 200,
          q: termoBusca
        };

        if (form.tipo === 'RECEBER') {
          params.cliente = 1;
        }

        const data = await buscarParceiros(params);
        if (!active) return;
        const listaBase = Array.isArray(data) ? data : [];
        const lista = listaBase.filter((item) => parceiroCompativelComTipo(item, form.tipo));
        setParceiros(lista);
      } catch (err) {
        if (!active) return;
        setParceiros([]);
        setError(err?.message || 'Erro ao carregar parceiros');
      } finally {
        if (active) setLoadingParceiros(false);
      }
    }

    carregarParceiros();

    return () => {
      active = false;
    };
  }, [form.tipo, parceiroBusca]);

  const obraSelecionada = useMemo(
    () => obras.find((obra) => String(obra.id) === String(form.obra_id)) || null,
    [obras, form.obra_id]
  );
  const obraSelecionadaEhObra = isCadastroObra(obraSelecionada);

  useEffect(() => {
    if (!moduloApropriacoesHabilitado || !form.obra_id || !obraSelecionadaEhObra) {
      setApropriacoes([]);
      setForm((current) => ({ ...current, apropriacao_id: '' }));
      setLoadingApropriacoes(false);
      return;
    }

    let active = true;

    async function carregarApropriacoes() {
      try {
        setLoadingApropriacoes(true);
        const data = await listarApropriacoes({ obra_id: form.obra_id });
        if (!active) return;
        setApropriacoes(Array.isArray(data) ? data : []);
        setForm((current) => {
          if (!current.apropriacao_id) return current;
          const lista = Array.isArray(data) ? data : [];
          const exists = lista.some((item) => String(item.id) === String(current.apropriacao_id));
          return exists ? current : { ...current, apropriacao_id: '' };
        });
      } catch {
        if (!active) return;
        setApropriacoes([]);
      } finally {
        if (active) setLoadingApropriacoes(false);
      }
    }

    carregarApropriacoes();

    return () => {
      active = false;
    };
  }, [form.obra_id, obraSelecionadaEhObra, moduloApropriacoesHabilitado]);

  useEffect(() => {
    if (form.tipo !== 'PAGAR' || !form.parceiro_id) {
      setBeneficiaries([]);
      setPaymentDraft((current) => ({
        ...current,
        usar_credor_como_favorecido: false,
        payment_beneficiary_id: '',
        nome: '',
        cpf_cnpj: '',
        pix_chave: ''
      }));
      return undefined;
    }

    let active = true;
    getPaymentBeneficiaries({ parceiro_id: form.parceiro_id })
      .then((data) => {
        if (!active) return;
        const lista = Array.isArray(data) ? data : [];
        setBeneficiaries(lista);
        const beneficiary = lista.find((item) => item.ativo !== false) || lista[0];
        if (beneficiary) {
          setPaymentDraft((current) => ({
            ...current,
            payment_beneficiary_id: current.usar_credor_como_favorecido ? '' : String(beneficiary.id),
            nome: current.usar_credor_como_favorecido ? current.nome : (beneficiary.nome || current.nome),
            cpf_cnpj: current.usar_credor_como_favorecido ? current.cpf_cnpj : (beneficiary.cpf_cnpj || current.cpf_cnpj),
            pix_tipo_chave: current.usar_credor_como_favorecido ? current.pix_tipo_chave : (beneficiary.pix_tipo_chave || current.pix_tipo_chave),
            pix_chave: current.usar_credor_como_favorecido ? current.pix_chave : (beneficiary.pix_chave || current.pix_chave)
          }));
        }
      })
      .catch(() => setBeneficiaries([]));

    return () => {
      active = false;
    };
  }, [form.tipo, form.parceiro_id]);

  const categoriasFiltradas = useMemo(() => {
    return [...categorias]
      .filter((categoria) => categoriaCompativel(categoria, form.tipo))
      .sort((a, b) => {
        const prioridade = prioridadeCategoria(a, form.tipo) - prioridadeCategoria(b, form.tipo);
        if (prioridade !== 0) return prioridade;
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });
      });
  }, [categorias, form.tipo]);

  const categoriaSelecionada = useMemo(() => {
    return categorias.find((categoria) => String(categoria.id) === String(form.categoria_financeira_id)) || null;
  }, [categorias, form.categoria_financeira_id]);

  const categoriasAutocomplete = useMemo(() => {
    if (!categoriaBusca.trim() || form.categoria_financeira_id) {
      return [];
    }

    return categoriasFiltradas
      .filter((categoria) => categoriaFinanceiraMatchesAutocomplete(categoria, categoriaBusca));
  }, [categoriaBusca, categoriasFiltradas, form.categoria_financeira_id]);

  const mostrarListaCategorias = categoriaBusca.trim().length > 0 && !form.categoria_financeira_id;

  const categoriasModalFiltradas = useMemo(() => {
    if (!categoriaModalBusca.trim()) {
      return categoriasFiltradas;
    }

    return categoriasFiltradas.filter((categoria) => (
      categoriaFinanceiraMatchesSearch(categoria, categoriaModalBusca)
    ));
  }, [categoriaModalBusca, categoriasFiltradas]);

  const parceiroSelecionado = useMemo(() => {
    return parceiros.find((item) => String(item.id) === String(form.parceiro_id)) || null;
  }, [form.parceiro_id, parceiros]);

  const parceiroPixOptions = useMemo(() => getParceiroPixOptions(parceiroSelecionado), [parceiroSelecionado]);

  const parceiroResumo = useMemo(() => {
    const termo = parceiroBusca.trim();
    if (!termo) {
      return `Digite parte do nome ou documento para buscar ${form.tipo === 'RECEBER' ? 'clientes' : 'credores'}.`;
    }
    if (form.parceiro_id) {
      return `${form.tipo === 'RECEBER' ? 'Cliente' : 'Credor'} selecionado.`;
    }
    return `${parceiros.length} ${form.tipo === 'RECEBER' ? 'cliente(s)' : 'credor(es)'} encontrado(s) para "${termo}"`;
  }, [form.tipo, form.parceiro_id, parceiros, parceiroBusca]);

  const mostrarListaParceiros = useMemo(() => {
    return !form.parceiro_id && parceiroBusca.trim().length > 0;
  }, [form.parceiro_id, parceiroBusca]);
  const quantidadePagamentos = (form.pagamentos || []).length;

  function getFormaPagamento(formaPagamentoId) {
    return formasPagamento.find((item) => String(item.id) === String(formaPagamentoId)) || null;
  }

  function getQuantidadeParcelas(pagamento) {
    return Math.max(Number(pagamento?.quantidade_parcelas || 1), 1);
  }

  function pagamentoUsaParcelasDetalhadas(pagamento) {
    const forma = getFormaPagamento(pagamento?.forma_pagamento_id);
    return formaUsaParcelasDetalhadas(forma);
  }

  function getValorPagamento(pagamento) {
    if (pagamentoUsaParcelasDetalhadas(pagamento)) {
      return roundCurrency((pagamento.parcelas || []).reduce((acc, parcela) => acc + currencyToNumber(parcela.valor), 0));
    }
    return roundCurrency(currencyToNumber(pagamento?.valor));
  }

  const totalPagamentos = useMemo(() => {
    return roundCurrency((form.pagamentos || []).reduce((acc, pagamento) => acc + getValorPagamento(pagamento), 0));
  }, [form.pagamentos, formasPagamento]);

  const valorTitulo = useMemo(() => roundCurrency(currencyToNumber(form.valor)), [form.valor]);
  const descontoFinanceiro = useMemo(() => roundCurrency(currencyToNumber(form.desconto_financeiro)), [form.desconto_financeiro]);
  const diferencaPagamentos = useMemo(() => roundCurrency(valorTitulo - totalPagamentos), [valorTitulo, totalPagamentos]);
  const totalBateComTitulo = Math.abs(diferencaPagamentos) <= 0.009;
  const totalRateioValor = useMemo(() => {
    return roundCurrency((form.rateios || []).reduce((acc, rateio) => {
      if (rateio.tipo_rateio === 'VALOR') return acc + currencyToNumber(rateio.valor_rateio);
      return acc + (valorTitulo * currencyToNumber(rateio.percentual) / 100);
    }, 0));
  }, [form.rateios, valorTitulo]);
  const totalRateioPercentual = useMemo(() => {
    return roundCurrency((form.rateios || []).reduce((acc, rateio) => {
      if (rateio.tipo_rateio === 'PERCENTUAL') return acc + currencyToNumber(rateio.percentual);
      return acc + (valorTitulo > 0 ? (currencyToNumber(rateio.valor_rateio) / valorTitulo) * 100 : 0);
    }, 0));
  }, [form.rateios, valorTitulo]);
  const totalImpostosRetencao = useMemo(() => {
    return roundCurrency((form.impostos || [])
      .filter((item) => item.natureza !== 'ACRESCIMO')
      .reduce((acc, item) => acc + currencyToNumber(item.valor), 0));
  }, [form.impostos]);
  const totalImpostosAcrescimo = useMemo(() => {
    return roundCurrency((form.impostos || [])
      .filter((item) => item.natureza === 'ACRESCIMO')
      .reduce((acc, item) => acc + currencyToNumber(item.valor), 0));
  }, [form.impostos]);
  const valorLiquidoPrevisto = useMemo(() => {
    return roundCurrency(valorTitulo - totalImpostosRetencao - descontoFinanceiro + totalImpostosAcrescimo);
  }, [valorTitulo, totalImpostosRetencao, descontoFinanceiro, totalImpostosAcrescimo]);

  function preencherFavorecidoComParceiro(parceiro) {
    const pix = getParceiroPixPrincipal(parceiro);
    setPaymentDraft((current) => ({
      ...current,
      payment_beneficiary_id: '',
      nome: parceiro?.nome || '',
      cpf_cnpj: parceiro?.cpf_cnpj || '',
      pix_tipo_chave: pix?.tipo || current.pix_tipo_chave || 'CNPJ',
      pix_chave: pix?.chave || ''
    }));
  }

  function selecionarParceiro(parceiro) {
    if (!parceiro) return;
    setForm((current) => ({
      ...current,
      parceiro_id: String(parceiro.id),
      pagamentos: (current.pagamentos || []).map((pagamento) => ({
        ...pagamento,
        parceiro_id: String(parceiro.id),
        parceiro_nome: parceiro.nome || '',
        parceiro_busca: ''
      }))
    }));
    setParceiroBusca(parceiro.nome || parceiro.cpf_cnpj || '');
    setPaymentDraft((current) => {
      if (!current.usar_credor_como_favorecido) return current;
      const pix = getParceiroPixPrincipal(parceiro);
      return {
        ...current,
        payment_beneficiary_id: '',
        nome: parceiro.nome || '',
        cpf_cnpj: parceiro.cpf_cnpj || '',
        pix_tipo_chave: pix?.tipo || current.pix_tipo_chave || 'CNPJ',
        pix_chave: pix?.chave || ''
      };
    });
  }

  function filtrarParceirosPagamento(busca) {
    const termo = normalizeSearchText(busca);
    if (!termo) return [];
    return parceiros
      .filter((parceiro) => parceiroCompativelComTipo(parceiro, form.tipo))
      .filter((parceiro) => {
        const texto = normalizeSearchText(`${parceiro.nome || ''} ${parceiro.cpf_cnpj || ''}`);
        return texto.includes(termo);
      })
      .slice(0, 8);
  }

  function selecionarParceiroPagamento(index, parceiro) {
    if (!parceiro) return;
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      const pagamento = pagamentos[index] || createPagamento();
      pagamentos[index] = {
        ...pagamento,
        parceiro_id: String(parceiro.id),
        parceiro_nome: parceiro.nome || '',
        parceiro_busca: ''
      };
      return { ...current, pagamentos };
    });
  }

  function selecionarCategoriaFinanceira(categoria) {
    if (!categoria) return;
    const categoriaId = String(categoria.id);
    setForm((current) => ({
      ...current,
      categoria_financeira_id: categoriaId,
      pagamentos: (current.pagamentos || []).map((pagamento) => ({
        ...pagamento,
        categoria_financeira_id: categoriaId
      }))
    }));
    setCategoriaBusca(categoria.nome || '');
    setCategoriaModalOpen(false);
  }

  useEffect(() => {
    if (paymentDraft.usar_credor_como_favorecido && parceiroSelecionado) {
      preencherFavorecidoComParceiro(parceiroSelecionado);
    }
  }, [paymentDraft.usar_credor_como_favorecido, parceiroSelecionado]);

  function updateField(field, value) {
    if (field === 'intercompany') {
      setForm((current) => ({
        ...current,
        intercompany: Boolean(value),
        empresa_contraparte_id: value ? current.empresa_contraparte_id : '',
        intercompany_group_id: value ? current.intercompany_group_id : '',
        empresa_origem_id: value ? current.empresa_origem_id : '',
        empresa_destino_id: value ? current.empresa_destino_id : '',
        tipo_intercompany: value ? current.tipo_intercompany : '',
        motivo_intercompany: value ? current.motivo_intercompany : '',
        elimina_consolidado: value ? current.elimina_consolidado : true,
        transferencia_interna: value ? current.transferencia_interna : true
      }));
      return;
    }

    if (field === 'empresa_origem_id') {
      setForm((current) => ({
        ...current,
        empresa_origem_id: value,
        empresa_destino_id: String(current.empresa_destino_id) === String(value) ? '' : current.empresa_destino_id,
        empresa_contraparte_id: String(current.empresa_destino_id) === String(value) ? '' : current.empresa_contraparte_id
      }));
      return;
    }

    if (field === 'empresa_destino_id') {
      setForm((current) => ({
        ...current,
        empresa_destino_id: String(current.empresa_origem_id) === String(value) ? '' : value,
        empresa_contraparte_id: String(current.empresa_origem_id) === String(value) ? '' : value
      }));
      return;
    }

    if (field === 'tipo') {
      setSearchParams({ tipo: value });
      setParceiroDocumentoBusca('');
      setParceiroNomeBusca('');
      setCategoriaBusca('');
      setBeneficiaries([]);
      setForm((current) => ({
        ...current,
        tipo: value,
        parceiro_id: '',
        categoria_financeira_id: '',
        pagamentos: (current.pagamentos || []).map((pagamento) => ({
          ...pagamento,
          categoria_financeira_id: ''
        })),
        forma_cobranca: ['RECEBER', 'PAGAR'].includes(value) ? current.forma_cobranca : '',
        status_cobranca: value === 'RECEBER' ? current.status_cobranca : 'PENDENTE_EMISSAO',
        banco_cobranca: ['RECEBER', 'PAGAR'].includes(value) ? current.banco_cobranca : '',
        nosso_numero: value === 'RECEBER' ? current.nosso_numero : '',
        linha_digitavel: ['RECEBER', 'PAGAR'].includes(value) ? current.linha_digitavel : '',
        codigo_barras: ['RECEBER', 'PAGAR'].includes(value) ? current.codigo_barras : '',
        identificador_externo: value === 'RECEBER' ? current.identificador_externo : '',
        boleto_emitido_em: value === 'RECEBER' ? current.boleto_emitido_em : ''
      }));
      return;
    }

    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'obra_id') {
        const obra = obras.find((item) => String(item.id) === String(value));
        next.empresa_id = getEmpresaObraId(obra);
        next.apropriacao_id = '';
      }
      if (field === 'valor' && (current.pagamentos || []).length === 1) {
        const pagamento = current.pagamentos[0] || createPagamento(value);
        const quantidade = getQuantidadeParcelas(pagamento);
        next.pagamentos = [{
          ...pagamento,
          valor: value,
          parcelas: pagamentoUsaParcelasDetalhadas(pagamento)
            ? buildParcelasDetalhadas(pagamento.parcelas, quantidade, pagamento.data_vencimento || today(), value)
            : pagamento.parcelas
        }];
      }
      return next;
    });
  }

  function updatePagamento(index, changes) {
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      pagamentos[index] = {
        ...pagamentos[index],
        ...changes
      };
      return { ...current, pagamentos };
    });
  }

  function updateFormaPagamento(index, formaPagamentoId) {
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      const pagamento = pagamentos[index] || createPagamento();
      const forma = formasPagamento.find((item) => String(item.id) === String(formaPagamentoId));
      const cartaoAtual = cartoes.find((item) => String(item.id) === String(pagamento.cartao_id));
      const manterCartao = forma?.exige_cartao && cartaoAtual && cartaoCompativelComForma(cartaoAtual, forma);
      const quantidade = formaPermiteParcelamentoOperacional(forma) ? getQuantidadeParcelas(pagamento) : 1;
      const usaParcelas = formaUsaParcelasDetalhadas(forma);
      pagamentos[index] = {
        ...pagamento,
        forma_pagamento_id: formaPagamentoId,
        cartao_id: manterCartao ? pagamento.cartao_id : '',
        quantidade_parcelas: String(quantidade),
        data_compra: forma?.exige_cartao ? (pagamento.data_compra || today()) : pagamento.data_compra,
        parcelas: usaParcelas
          ? buildParcelasDetalhadas(pagamento.parcelas, quantidade, pagamento.data_vencimento || today(), pagamento.valor)
          : []
      };
      return { ...current, pagamentos };
    });
  }

  function updateQuantidadeParcelas(index, value) {
    const quantidade = Math.max(Number(value || 1), 1);
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      const pagamento = pagamentos[index] || createPagamento();
      pagamentos[index] = {
        ...pagamento,
        quantidade_parcelas: value,
        parcelas: pagamentoUsaParcelasDetalhadas(pagamento)
          ? buildParcelasDetalhadas(
              pagamento.parcelas,
              quantidade,
              pagamento.data_vencimento || today(),
              pagamento.valor,
              { redistribuirValores: true }
            )
          : pagamento.parcelas
      };
      return { ...current, pagamentos };
    });
  }

  function updateValorPagamento(index, value) {
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      const pagamento = pagamentos[index] || createPagamento();
      const quantidade = getQuantidadeParcelas(pagamento);
      pagamentos[index] = {
        ...pagamento,
        valor: value,
        parcelas: pagamentoUsaParcelasDetalhadas(pagamento)
          ? buildParcelasDetalhadas(pagamento.parcelas, quantidade, pagamento.data_vencimento || today(), value)
          : pagamento.parcelas
      };
      return { ...current, pagamentos };
    });
  }

  function updateParcela(pagamentoIndex, parcelaIndex, field, value) {
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      const pagamento = pagamentos[pagamentoIndex] || createPagamento();
      const quantidade = getQuantidadeParcelas(pagamento);
      const parcelas = buildParcelasDetalhadas(pagamento.parcelas, quantidade, pagamento.data_vencimento || today(), pagamento.valor);
      parcelas[parcelaIndex] = {
        ...parcelas[parcelaIndex],
        [field]: value
      };
      pagamentos[pagamentoIndex] = {
        ...pagamento,
        parcelas,
        valor: field === 'valor'
          ? formatCurrencyInput(parcelas.reduce((acc, parcela) => acc + currencyToNumber(parcela.valor), 0))
          : pagamento.valor
      };
      return { ...current, pagamentos };
    });
  }

  function adicionarPagamento() {
    setForm((current) => ({
      ...current,
      pagamentos: [
        ...(current.pagamentos || []),
        createPagamento('', parceiroSelecionado, current.categoria_financeira_id)
      ]
    }));
  }

  function removerPagamento(index) {
    setForm((current) => {
      const pagamentos = (current.pagamentos || []).filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        pagamentos: pagamentos.length
          ? pagamentos
          : [createPagamento(current.valor, parceiroSelecionado, current.categoria_financeira_id)]
      };
    });
  }

  function adicionarRateio() {
    setForm((current) => ({
      ...current,
      rateios: [...(current.rateios || []), createRateio()]
    }));
  }

  function updateRateio(index, field, value) {
    setForm((current) => {
      const rateios = [...(current.rateios || [])];
      const rateio = rateios[index] || createRateio();
      rateios[index] = {
        ...rateio,
        [field]: value
      };
      return { ...current, rateios };
    });
  }

  function removerRateio(index) {
    setForm((current) => ({
      ...current,
      rateios: (current.rateios || []).filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function adicionarImposto() {
    setForm((current) => ({
      ...current,
      impostos: [...(current.impostos || []), createImposto()]
    }));
  }

  function updateImposto(index, field, value) {
    setForm((current) => {
      const impostos = [...(current.impostos || [])];
      const imposto = impostos[index] || createImposto();
      const next = {
        ...imposto,
        [field]: value
      };
      if (['base_calculo', 'aliquota'].includes(field)) {
        const valorCalculado = calcularValorImposto(next);
        if (valorCalculado) next.valor = valorCalculado;
      }
      impostos[index] = next;
      return { ...current, impostos };
    });
  }

  function removerImposto(index) {
    setForm((current) => ({
      ...current,
      impostos: (current.impostos || []).filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function validarCadastroTitulo() {
    const empresaSelecionadaId = form.empresa_id || getEmpresaObraId(obraSelecionada);
    if (!empresaSelecionadaId) {
      return 'Selecione uma obra/centro de custo com empresa vinculada.';
    }

    if (!form.parceiro_id) {
      return `Selecione o ${form.tipo === 'RECEBER' ? 'cliente' : 'credor'} na lista antes de salvar.`;
    }

    if (valorTitulo <= 0) {
      return 'Informe o valor total do titulo.';
    }

    if (descontoFinanceiro < 0) {
      return 'O desconto concedido nao pode ser negativo.';
    }

    if (descontoFinanceiro > valorTitulo) {
      return 'O desconto concedido nao pode ser maior que o valor do titulo.';
    }

    if (valorLiquidoPrevisto <= 0) {
      return 'O valor liquido do titulo precisa ser maior que zero.';
    }

    if (!form.categoria_financeira_id) {
      return 'Selecione a categoria financeira do titulo.';
    }

    if (!form.competencia_data) {
      return 'Informe a competencia DRE real do titulo.';
    }

    const pagamentos = Array.isArray(form.pagamentos) ? form.pagamentos : [];
    if (pagamentos.length === 0) {
      return 'Informe pelo menos uma forma de pagamento.';
    }

    for (const [pagamentoIndex, pagamento] of pagamentos.entries()) {
      const forma = getFormaPagamento(pagamento.forma_pagamento_id);
      const usaDetalhe = formaUsaParcelasDetalhadas(forma);
      const usaCartao = isFormaCartao(forma);
      const valorPagamento = getValorPagamento(pagamento);
      const labelForma = `forma de pagamento ${pagamentoIndex + 1}`;

      if (!pagamento.forma_pagamento_id) {
        return `Selecione a ${labelForma}.`;
      }

      if (pagamentos.length > 1 && !pagamento.parceiro_id) {
        return `Selecione o ${form.tipo === 'RECEBER' ? 'cliente' : 'credor'} da ${labelForma}.`;
      }

      if (pagamentos.length > 1 && !(pagamento.categoria_financeira_id || form.categoria_financeira_id)) {
        return `Selecione a categoria financeira da ${labelForma}.`;
      }

      if (valorPagamento <= 0) {
        return `Informe o valor da ${labelForma}.`;
      }

      if (usaDetalhe) {
        const quantidade = getQuantidadeParcelas(pagamento);
        const parcelas = Array.isArray(pagamento.parcelas) ? pagamento.parcelas : [];
        if (parcelas.length !== quantidade) {
          return `Confira a quantidade de parcelas da ${labelForma}.`;
        }

        for (const [parcelaIndex, parcela] of parcelas.entries()) {
          const labelParcela = `parcela ${parcelaIndex + 1} da ${labelForma}`;
          if (currencyToNumber(parcela.valor) <= 0) {
            return `Informe o valor da ${labelParcela}.`;
          }
          if (!parcela.data_vencimento) {
            return `Informe o vencimento da ${labelParcela}.`;
          }
        }
      } else if (!usaCartao && !pagamento.data_vencimento) {
        return `Informe o vencimento da ${labelForma}.`;
      }
    }

    if (!totalBateComTitulo) {
      const direcao = diferencaPagamentos > 0 ? 'faltam' : 'sobram';
      return `A soma das formas de pagamento precisa ser igual ao valor do titulo. Valor do titulo: ${formatCurrency(valorTitulo)}. Total informado: ${formatCurrency(totalPagamentos)}. Ainda ${direcao} ${formatCurrency(Math.abs(diferencaPagamentos))}.`;
    }

    const rateios = Array.isArray(form.rateios) ? form.rateios : [];
    if (rateios.length > 0) {
      for (const [rateioIndex, rateio] of rateios.entries()) {
        if (!rateio.obra_id) {
          return `Selecione a obra/centro de custo do rateio ${rateioIndex + 1}.`;
        }
        if (rateio.tipo_rateio === 'VALOR' && currencyToNumber(rateio.valor_rateio) <= 0) {
          return `Informe o valor do rateio ${rateioIndex + 1}.`;
        }
        if (rateio.tipo_rateio === 'PERCENTUAL' && currencyToNumber(rateio.percentual) <= 0) {
          return `Informe o percentual do rateio ${rateioIndex + 1}.`;
        }
      }
      if (Math.abs(totalRateioValor - valorTitulo) > 0.02 || Math.abs(totalRateioPercentual - 100) > 0.02) {
        return `O rateio precisa fechar 100% ou ${formatCurrency(valorTitulo)}. Total atual: ${formatCurrency(totalRateioValor)} (${totalRateioPercentual.toFixed(2)}%).`;
      }
    }

    const impostos = Array.isArray(form.impostos) ? form.impostos : [];
    for (const [impostoIndex, imposto] of impostos.entries()) {
      if (!String(imposto.tipo_imposto || imposto.descricao || '').trim()) {
        return `Informe o tipo ou descricao do imposto/desconto ${impostoIndex + 1}.`;
      }
      if (currencyToNumber(imposto.valor) <= 0) {
        return `Informe o valor do imposto/desconto ${impostoIndex + 1}.`;
      }
    }

    if (form.intercompany) {
      if (!form.empresa_origem_id) return 'Informe a empresa origem da movimentacao entre empresas.';
      if (!form.empresa_destino_id) return 'Informe a empresa destino da movimentacao entre empresas.';
      if (String(form.empresa_origem_id) === String(form.empresa_destino_id)) {
        return 'Empresa origem e destino nao podem ser iguais na movimentacao entre empresas.';
      }
      if (!form.tipo_intercompany) return 'Informe o tipo.';
    }

    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const erroValidacao = validarCadastroTitulo();
    if (erroValidacao) {
      setError(erroValidacao);
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        ...form,
        obra_id: Number(form.obra_id),
        empresa_id: Number(form.empresa_id || getEmpresaObraId(obraSelecionada)),
        parceiro_id: Number(form.parceiro_id),
        apropriacao_id: form.apropriacao_id ? Number(form.apropriacao_id) : undefined,
        categoria_financeira_id: form.categoria_financeira_id ? Number(form.categoria_financeira_id) : undefined
      };
      delete payload.desconto_financeiro;
      const origemFreteId = searchParams.get('origem_frete_id');
      if (origemFreteId) {
        payload.origem_frete_id = Number(origemFreteId);
      }
      payload.empresa_contraparte_id = form.intercompany && form.empresa_contraparte_id
        ? Number(form.empresa_contraparte_id)
        : form.intercompany && form.empresa_destino_id
          ? Number(form.empresa_destino_id)
          : undefined;
      payload.empresa_origem_id = form.intercompany && form.empresa_origem_id
        ? Number(form.empresa_origem_id)
        : undefined;
      payload.empresa_destino_id = form.intercompany && form.empresa_destino_id
        ? Number(form.empresa_destino_id)
        : undefined;
      payload.tipo_intercompany = form.intercompany ? form.tipo_intercompany || undefined : undefined;
      payload.motivo_intercompany = form.intercompany ? form.motivo_intercompany || undefined : undefined;
      payload.intercompany_group_id = form.intercompany ? form.intercompany_group_id || undefined : undefined;
      payload.elimina_consolidado = form.intercompany ? Boolean(form.elimina_consolidado) : false;
      payload.transferencia_interna = form.intercompany ? Boolean(form.transferencia_interna) : false;
      payload.considera_dre = isCategoriaClassificadaParaDre(categoriaSelecionada);
      payload.status = form.status || 'ABERTO';
      payload.intercompany = Boolean(form.intercompany);
      payload.competencia_data = form.competencia_data || undefined;
      payload.forma_cobranca = form.tipo === 'PAGAR'
        ? (form.forma_cobranca || resolveFormaCobrancaPagamentos(form.pagamentos, getFormaPagamento))
        : form.forma_cobranca || undefined;
      payload.valor_bruto = form.valor;
      payload.valor_liquido = formatCurrencyInput(valorLiquidoPrevisto);
      payload.rateios = (form.rateios || []).map((rateio) => ({
        obra_id: rateio.obra_id ? Number(rateio.obra_id) : undefined,
        tipo_rateio: rateio.tipo_rateio || 'PERCENTUAL',
        percentual: rateio.tipo_rateio === 'PERCENTUAL' ? rateio.percentual : undefined,
        valor_rateio: rateio.tipo_rateio === 'VALOR' ? rateio.valor_rateio : undefined,
        observacoes: rateio.observacoes || undefined
      }));
      const impostosPayload = (form.impostos || []).map((imposto) => ({
        tipo_imposto: imposto.tipo_imposto || imposto.descricao,
        descricao: imposto.descricao || imposto.tipo_imposto,
        natureza: imposto.natureza || 'RETENCAO',
        base_calculo: imposto.base_calculo || undefined,
        aliquota: imposto.aliquota || undefined,
        valor: imposto.valor,
        observacoes: imposto.observacoes || undefined
      }));
      if (descontoFinanceiro > 0) {
        impostosPayload.push({
          tipo_imposto: 'DESCONTO',
          descricao: 'Desconto concedido',
          natureza: 'RETENCAO',
          base_calculo: form.valor,
          valor: form.desconto_financeiro,
          observacoes: 'Desconto informado no cadastro do titulo.'
        });
      }
      payload.impostos = impostosPayload;
      payload.pagamentos = (form.pagamentos || []).map((pagamento) => {
        const forma = getFormaPagamento(pagamento.forma_pagamento_id);
        const usaDetalhe = formaUsaParcelasDetalhadas(forma);
        return {
          parceiro_id: pagamento.parceiro_id ? Number(pagamento.parceiro_id) : undefined,
          categoria_financeira_id: pagamento.categoria_financeira_id || form.categoria_financeira_id || undefined,
          valor: usaDetalhe ? undefined : pagamento.valor,
          forma_pagamento_id: pagamento.forma_pagamento_id || undefined,
          cartao_id: pagamento.cartao_id || undefined,
          quantidade_parcelas: pagamento.quantidade_parcelas || undefined,
          data_compra: isFormaCartao(forma) ? pagamento.data_compra : undefined,
          data_vencimento: !isFormaCartao(forma) && !usaDetalhe ? pagamento.data_vencimento : undefined,
          numero_documento: pagamento.numero_documento || undefined,
          observacoes: pagamento.observacoes || undefined,
          parcelas: usaDetalhe ? pagamento.parcelas : undefined
        };
      });

      if (form.tipo === 'PAGAR' && paymentDraft.preparar_pagamento_pix) {
        if (!form.parceiro_id || !paymentDraft.nome || !paymentDraft.cpf_cnpj || !paymentDraft.pix_tipo_chave || !paymentDraft.pix_chave) {
          throw new Error('Preencha os dados PIX do favorecido para pagamento em massa.');
        }

        const beneficiaryPayload = {
          parceiro_id: Number(form.parceiro_id),
          nome: paymentDraft.nome,
          cpf_cnpj: paymentDraft.cpf_cnpj,
          metodo_preferencial: 'PIX_CHAVE',
          pix_tipo_chave: paymentDraft.pix_tipo_chave,
          pix_chave: paymentDraft.pix_chave,
          ativo: true
        };

        if (paymentDraft.payment_beneficiary_id) {
          await atualizarPaymentBeneficiary(paymentDraft.payment_beneficiary_id, beneficiaryPayload);
        } else {
          await criarPaymentBeneficiary(beneficiaryPayload);
        }
      }

      const titulo = await criarTituloFinanceiro(payload);
      alert('Conta criada com sucesso.');
      navigate(`/financeiro/titulos/${titulo.id}`);
    } catch (err) {
      setError(err?.message || 'Erro ao criar conta manual');
    } finally {
      setSaving(false);
    }
  }

  const tituloListPath = form.tipo === 'PAGAR' ? '/financeiro/contas-a-pagar' : '/financeiro/contas-a-receber';
  const tituloListLabel = form.tipo === 'PAGAR' ? 'contas a pagar' : 'contas a receber';

  return (
    <div className="page solicitacoes-page max-w-5xl mx-auto">
      <div className="app-page-header">
        <div className="app-page-header-row">
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">
              {form.tipo === 'RECEBER' ? 'Nova conta a receber' : 'Nova conta a pagar'}
            </h1>
            <p className="page-subtitle">
              Cadastre contas manuais que nao nasceram de uma solicitacao ou contrato de venda.
            </p>
          </div>
          <div className="app-page-actions">
            <Link to={tituloListPath} className="btn btn-outline">Voltar para {tituloListLabel}</Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="app-alert app-alert--error">
          {error}
        </div>
      )}

      {loadingBase ? (
        <div className="app-empty-card">Carregando estrutura do financeiro...</div>
      ) : (
        <div className="card sol-surface-card">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="sol-filtros-head">
              <div>
                <p className="sol-filtros-title">Dados da conta</p>
                <p className="sol-filtros-subtitle">
                  Esta conta entra no previsto enquanto estiver em previsao, aberto ou parcial, mesmo sem solicitacao vinculada.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
              <label className="sol-filter-field xl:col-span-2">
                <span className="sol-filter-label">Tipo</span>
                <select
                  className="input w-full"
                  value={form.tipo}
                  onChange={(event) => {
                    const tipo = resolveTipo(event.target.value);
                    setSearchParams({ tipo });
                    setCategoriaBusca('');
                    setForm((current) => ({
                      ...current,
                      tipo,
                      parceiro_id: '',
                      categoria_financeira_id: '',
                      pagamentos: (current.pagamentos || []).map((pagamento) => ({
                        ...pagamento,
                        categoria_financeira_id: ''
                      })),
                      forma_cobranca: ['RECEBER', 'PAGAR'].includes(tipo) ? current.forma_cobranca : '',
                      status_cobranca: tipo === 'RECEBER' ? current.status_cobranca : 'PENDENTE_EMISSAO',
                      banco_cobranca: ['RECEBER', 'PAGAR'].includes(tipo) ? current.banco_cobranca : '',
                      nosso_numero: tipo === 'RECEBER' ? current.nosso_numero : '',
                      linha_digitavel: ['RECEBER', 'PAGAR'].includes(tipo) ? current.linha_digitavel : '',
                      codigo_barras: ['RECEBER', 'PAGAR'].includes(tipo) ? current.codigo_barras : '',
                      identificador_externo: tipo === 'RECEBER' ? current.identificador_externo : '',
                      boleto_emitido_em: tipo === 'RECEBER' ? current.boleto_emitido_em : ''
                    }));
                  }}
                >
                  <option value="PAGAR">Conta a pagar</option>
                  <option value="RECEBER">Conta a receber</option>
                </select>
              </label>

              <label className="sol-filter-field xl:col-span-2">
                <span className="sol-filter-label">Status inicial</span>
                <select
                  className="input w-full"
                  value={form.status}
                  onChange={(event) => updateField('status', event.target.value)}
                >
                  <option value="ABERTO">Aberto</option>
                  <option value="PREVISAO">Previsao</option>
                </select>
                <span className="app-note mt-2">
                  Previsao entra nos relatorios, mas nao fica disponivel para baixa ate virar aberto.
                </span>
              </label>

              <label className="sol-filter-field xl:col-span-3">
                <span className="sol-filter-label">Obra/Centro de Custo</span>
                <select
                  className="input w-full"
                  value={form.obra_id}
                  onChange={(event) => updateField('obra_id', event.target.value)}
                  required
                >
                  <option value="">Selecione a obra/centro de custo</option>
                  {obras.map((obra) => (
                    <option key={obra.id} value={obra.id}>
                      {obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sol-filter-field xl:col-span-3">
                <span className="sol-filter-label">Categoria financeira</span>
                <div className="relative space-y-2">
                  <div className="flex gap-2">
                    <input
                      className="input w-full"
                      placeholder="Digite para buscar a categoria"
                      value={categoriaBusca}
                      onChange={(event) => {
                        setCategoriaBusca(event.target.value);
                        setForm((current) => ({
                          ...current,
                          categoria_financeira_id: '',
                          pagamentos: (current.pagamentos || []).map((pagamento) => ({
                            ...pagamento,
                            categoria_financeira_id: ''
                          }))
                        }));
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline shrink-0 px-3"
                      title="Pesquisar categorias"
                      aria-label="Pesquisar categorias financeiras"
                      onClick={() => {
                        setCategoriaModalBusca('');
                        setCategoriaModalOpen(true);
                      }}
                    >
                      <SearchIcon />
                    </button>
                    {categoriaSelecionada && (
                      <button
                        type="button"
                        className="btn btn-outline shrink-0"
                        onClick={() => {
                          setCategoriaBusca('');
                          setForm((current) => ({
                            ...current,
                            categoria_financeira_id: '',
                            pagamentos: (current.pagamentos || []).map((pagamento) => ({
                              ...pagamento,
                              categoria_financeira_id: ''
                            }))
                          }));
                        }}
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  {categoriaSelecionada && (
                    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-xs text-[var(--c-muted)]">
                      Selecionada: <span className="font-semibold text-[var(--c-text)]">{categoriaSelecionada.nome}</span>
                    </div>
                  )}
                  {mostrarListaCategorias && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] shadow-lg">
                      {categoriasAutocomplete.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-[var(--c-muted)]">
                          Nenhuma categoria encontrada.
                        </div>
                      ) : categoriasAutocomplete.map((categoria) => (
                        <button
                          key={categoria.id}
                          type="button"
                          className="w-full border-b border-[var(--c-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--c-surface-muted)]"
                          onClick={() => selecionarCategoriaFinanceira(categoria)}
                        >
                          <span className="block font-medium text-[var(--c-text)]">{categoria.nome}</span>
                          <span className="block text-xs text-[var(--c-muted)]">{getCategoriaDreResumo(categoria)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="app-note mt-2">
                  {categoriaSelecionada
                    ? getCategoriaDreResumo(categoriaSelecionada)
                    : 'A categoria financeira define automaticamente se o titulo entra na DRE.'}
                </span>
              </label>

              <div className="sol-filter-field md:col-span-2 xl:col-span-9">
                <span className="sol-filter-label">{form.tipo === 'RECEBER' ? 'Cliente' : 'Credor'}</span>
                <input
                  className="input w-full"
                  placeholder={form.tipo === 'RECEBER'
                    ? 'Buscar cliente por nome ou CPF/CNPJ'
                    : 'Buscar credor por nome ou CPF/CNPJ'}
                  value={parceiroBusca}
                  onChange={(event) => {
                    setParceiroBusca(event.target.value);
                    setForm((current) => ({ ...current, parceiro_id: '' }));
                  }}
                  required={!form.parceiro_id}
                />
                <input type="hidden" value={form.parceiro_id} required />
                {mostrarListaParceiros && (
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)]">
                    {parceiros.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-[var(--c-muted)]">
                        Nenhum {form.tipo === 'RECEBER' ? 'cliente' : 'credor'} encontrado.
                      </div>
                    ) : parceiros.slice(0, 8).map((parceiro) => {
                      const selected = String(parceiro.id) === String(form.parceiro_id);
                      return (
                        <button
                          key={parceiro.id}
                          type="button"
                          className={`w-full border-b border-[var(--c-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--c-surface-muted)] ${selected ? 'bg-[var(--c-surface-muted)] font-medium text-[var(--c-text)]' : 'text-[var(--c-muted)]'}`}
                          onClick={() => selecionarParceiro(parceiro)}
                        >
                          <span className="block text-[var(--c-text)]">{parceiro.nome}</span>
                          <span className="block text-xs">{parceiro.cpf_cnpj || 'CPF/CNPJ nao informado'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <span className="app-note mt-2">{loadingParceiros ? 'Carregando parceiros...' : parceiroResumo}</span>
              </div>

              <label className="sol-filter-field md:col-span-2 xl:col-span-4">
                <span className="sol-filter-label">Descricao</span>
                <input
                  className="input w-full"
                  placeholder="Ex.: Aluguel administrativo, recebimento de cliente, ajuste de caixa"
                  value={form.descricao}
                  onChange={(event) => updateField('descricao', event.target.value)}
                  required
                />
              </label>

              <label className="sol-filter-field xl:col-span-3">
                <span className="sol-filter-label">Numero do documento</span>
                <input
                  className="input w-full"
                  placeholder="NF, boleto, recibo ou referencia interna"
                  value={form.numero_documento}
                  onChange={(event) => updateField('numero_documento', event.target.value)}
                />
              </label>

              <label className="sol-filter-field xl:col-span-2">
                <span className="sol-filter-label">Valor</span>
                <input
                  className="input w-full"
                  placeholder="R$ 0,00"
                  value={form.valor}
                  onChange={(event) => updateField('valor', normalizeCurrencyTyping(event.target.value))}
                  onBlur={(event) => updateField('valor', formatCurrencyInput(event.target.value))}
                  required
                />
              </label>

              <label className="sol-filter-field xl:col-span-2">
                <span className="sol-filter-label">Desconto concedido</span>
                <input
                  className="input w-full"
                  placeholder="R$ 0,00"
                  value={form.desconto_financeiro}
                  onChange={(event) => updateField('desconto_financeiro', normalizeCurrencyTyping(event.target.value))}
                  onBlur={(event) => updateField('desconto_financeiro', formatCurrencyInput(event.target.value))}
                />
                <span className="app-note mt-2">Opcional. Reduz o valor liquido do titulo.</span>
              </label>

              <div className="sol-filter-field xl:col-span-2">
                <span className="sol-filter-label">Valor liquido</span>
                <div className="input flex items-center bg-slate-50 text-slate-700">
                  {formatCurrency(valorLiquidoPrevisto)}
                </div>
              </div>

              <div className="sol-filter-field xl:col-span-3">
                <span className="sol-filter-label">Total das formas</span>
                <div className={`input flex items-center ${totalBateComTitulo ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {formatCurrency(totalPagamentos)}
                  {!totalBateComTitulo && ` (${diferencaPagamentos > 0 ? 'faltam' : 'sobram'} ${formatCurrency(Math.abs(diferencaPagamentos))})`}
                </div>
              </div>

              <label className="sol-filter-field xl:col-span-3">
                <span className="sol-filter-label">Data de emissao</span>
                <input
                  type="date"
                  className="input w-full"
                  value={form.data_emissao}
                  onChange={(event) => updateField('data_emissao', event.target.value)}
                />
              </label>

              <label className="sol-filter-field xl:col-span-3">
                <span className="sol-filter-label">Competencia DRE</span>
                <input
                  type="date"
                  className="input w-full"
                  value={form.competencia_data}
                  onChange={(event) => updateField('competencia_data', event.target.value)}
                  required={isCategoriaClassificadaParaDre(categoriaSelecionada)}
                />
                <span className="app-note mt-2">
                  {isCategoriaClassificadaParaDre(categoriaSelecionada)
                    ? 'Obrigatoria para DRE. Use o mes/periodo economico real do fato gerador.'
                    : 'Opcional quando o titulo nao entra na DRE.'}
                </span>
              </label>

              <div className="sol-filter-field md:col-span-2 xl:col-span-6">
                <span className="sol-filter-label">Entre Empresas</span>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="flex min-h-[42px] items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] px-3 text-sm text-[var(--c-text)]">
                    <input
                      type="checkbox"
                      checked={Boolean(form.intercompany)}
                      onChange={(event) => updateField('intercompany', event.target.checked)}
                    />
                    Movimentacao entre empresas do grupo
                  </label>
                  <select
                    className="input w-full"
                    value={form.empresa_origem_id}
                    onChange={(event) => updateField('empresa_origem_id', event.target.value)}
                    disabled={!form.intercompany}
                  >
                    <option value="">Empresa origem</option>
                    {empresasGrupo
                      .filter(empresaIntercompanySelecionavel)
                      .map((empresa) => (
                        <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                      ))}
                  </select>
                  <select
                    className="input w-full"
                    value={form.empresa_destino_id}
                    onChange={(event) => updateField('empresa_destino_id', event.target.value)}
                    disabled={!form.intercompany}
                  >
                    <option value="">Empresa destino</option>
                    {empresasGrupo
                      .filter((empresa) => (
                        empresaIntercompanySelecionavel(empresa)
                        && String(empresa.id) !== String(form.empresa_origem_id)
                      ))
                      .map((empresa) => (
                        <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                      ))}
                  </select>
                  <select
                    className="input w-full"
                    value={form.tipo_intercompany}
                    onChange={(event) => updateField('tipo_intercompany', event.target.value)}
                    disabled={!form.intercompany}
                  >
                    <option value="">Tipo</option>
                    {TIPOS_INTERCOMPANY.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <input
                    className="input w-full"
                    value={form.intercompany_group_id}
                    onChange={(event) => updateField('intercompany_group_id', event.target.value)}
                    disabled={!form.intercompany}
                    placeholder="Grupo da movimentacao opcional"
                  />
                  <input
                    className="input w-full"
                    value={form.motivo_intercompany}
                    onChange={(event) => updateField('motivo_intercompany', event.target.value)}
                    disabled={!form.intercompany}
                    placeholder="Motivo"
                  />
                </div>
                <span className="app-note mt-2">
                  Use esta configuracao nas formas sem cartao. Para cartoes, a conta vinculada define automaticamente as empresas envolvidas.
                </span>
              </div>

              <div className="financeiro-formas-pagamento md:col-span-2 xl:col-span-12 space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--c-text)]">Formas de pagamento</div>
                    <div className="text-xs text-[var(--c-muted)]">
                      Combine pix, cartao, boleto ou cheque ate fechar o valor total do titulo.
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline shrink-0" onClick={adicionarPagamento}>
                    Adicionar
                  </button>
                </div>

                {(form.pagamentos || []).map((pagamento, pagamentoIndex) => {
                  const forma = getFormaPagamento(pagamento.forma_pagamento_id);
                  const quantidade = getQuantidadeParcelas(pagamento);
                  const usaDetalhe = formaUsaParcelasDetalhadas(forma);
                  const usaCartao = isFormaCartao(forma);
                  const cartoesFiltrados = cartoes.filter((item) => item.ativo !== false && cartaoCompativelComForma(item, forma));
                  const cartaoSelecionado = cartoesFiltrados.find((item) => String(item.id) === String(pagamento.cartao_id));
                  const empresaContaCartao = cartaoSelecionado?.contaBancaria?.empresa;
                  const empresaTitulo = empresasGrupo.find((item) => String(item.id) === String(form.empresa_id));
                  const nomeEmpresaCartao = empresaContaCartao?.nome || empresaContaCartao?.razao_social;
                  const nomeEmpresaTitulo = empresaTitulo?.nome || empresaTitulo?.razao_social;
                  const cartaoEntreEmpresas = Boolean(
                    empresaContaCartao?.id
                    && empresaTitulo?.id
                    && String(empresaContaCartao.id) !== String(empresaTitulo.id)
                  );

                  return (
                    <div key={pagamento.id || pagamentoIndex} className="space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">
                          Forma {pagamentoIndex + 1}
                        </div>
                        {(form.pagamentos || []).length > 1 && (
                          <button type="button" className="text-sm font-semibold text-rose-600" onClick={() => removerPagamento(pagamentoIndex)}>
                            Remover
                          </button>
                        )}
                      </div>

                      {quantidadePagamentos > 1 && (
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                          <label className="text-sm">
                            <span className="mb-1 block font-semibold text-blue-950">
                              {form.tipo === 'RECEBER' ? 'Cliente deste titulo' : 'Credor deste titulo'}
                            </span>
                            <input
                              className="input w-full bg-white"
                              placeholder={form.tipo === 'RECEBER' ? 'Digite para buscar o cliente' : 'Digite para buscar o credor'}
                              value={pagamento.parceiro_id ? (pagamento.parceiro_nome || 'Selecionado') : (pagamento.parceiro_busca || '')}
                              onChange={(event) => updatePagamento(pagamentoIndex, {
                                parceiro_id: '',
                                parceiro_nome: '',
                                parceiro_busca: event.target.value
                              })}
                            />
                          </label>
                          {!pagamento.parceiro_id && String(pagamento.parceiro_busca || '').trim() && (
                            <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-blue-100 bg-white">
                              {filtrarParceirosPagamento(pagamento.parceiro_busca).length === 0 ? (
                                <div className="px-3 py-2 text-sm text-[var(--c-muted)]">
                                  Nenhum {form.tipo === 'RECEBER' ? 'cliente' : 'credor'} encontrado.
                                </div>
                              ) : filtrarParceirosPagamento(pagamento.parceiro_busca).map((parceiro) => (
                                <button
                                  key={parceiro.id}
                                  type="button"
                                  className="w-full border-b border-blue-50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-blue-50"
                                  onClick={() => selecionarParceiroPagamento(pagamentoIndex, parceiro)}
                                >
                                  <span className="block font-semibold text-[var(--c-text)]">{parceiro.nome}</span>
                                  <span className="block text-xs text-[var(--c-muted)]">{parceiro.cpf_cnpj || 'CPF/CNPJ nao informado'}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <span className="mt-2 block text-xs text-blue-700">
                            Use quando cada titulo precisar sair para um {form.tipo === 'RECEBER' ? 'cliente' : 'credor'} diferente.
                          </span>
                        </div>
                      )}

                      {quantidadePagamentos > 1 && (
                        <CategoriaFinanceiraAutocomplete
                          label="Categoria financeira deste titulo"
                          value={pagamento.categoria_financeira_id || form.categoria_financeira_id || ''}
                          options={categoriasFiltradas}
                          onChange={(categoriaId) => updatePagamento(pagamentoIndex, {
                            categoria_financeira_id: categoriaId
                          })}
                          helperText="A categoria deste titulo sera aplicada a todas as parcelas geradas nele."
                        />
                      )}

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">
                          <span className="mb-1 block text-[var(--c-muted)]">Forma de pagamento</span>
                          <select
                            className="input w-full"
                            value={pagamento.forma_pagamento_id}
                            onChange={(event) => updateFormaPagamento(pagamentoIndex, event.target.value)}
                          >
                            <option value="">Nao informar</option>
                            {formasPagamento.filter((item) => item.ativo !== false).map((item) => (
                              <option key={item.id} value={item.id}>{item.nome}</option>
                            ))}
                          </select>
                        </label>

                        <div className="text-sm">
                          <span className="mb-1 block text-[var(--c-muted)]">Valor desta forma</span>
                          {usaDetalhe ? (
                            <div className="input flex items-center bg-slate-50 text-slate-700">
                              {pagamento.valor || 'R$ 0,00'}
                            </div>
                          ) : (
                            <input
                              className="input w-full"
                              type="text"
                              inputMode="decimal"
                              placeholder="R$ 0,00"
                              value={pagamento.valor}
                              onChange={(event) => updateValorPagamento(pagamentoIndex, normalizeCurrencyTyping(event.target.value))}
                              onBlur={(event) => updateValorPagamento(pagamentoIndex, formatCurrencyInput(event.target.value))}
                            />
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {formaPermiteParcelamentoOperacional(forma) ? (
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Parcelas</span>
                            <input
                              className="input w-full"
                              type="number"
                              min="1"
                              max="120"
                              value={pagamento.quantidade_parcelas}
                              onChange={(event) => updateQuantidadeParcelas(pagamentoIndex, event.target.value)}
                            />
                          </label>
                        ) : (
                          <div className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Parcelas</span>
                            <div className="input flex items-center bg-slate-50 text-slate-500">1 parcela</div>
                          </div>
                        )}

                        {usaCartao ? (
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Data da compra</span>
                            <input
                              className="input w-full"
                              type="date"
                              value={pagamento.data_compra}
                              onChange={(event) => updatePagamento(pagamentoIndex, { data_compra: event.target.value })}
                            />
                          </label>
                        ) : usaDetalhe ? (
                          <div className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Vencimento</span>
                            <div className="input flex items-center bg-slate-50 text-slate-500">Definido nas parcelas</div>
                          </div>
                        ) : (
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Vencimento</span>
                            <input
                              className="input w-full"
                              type="date"
                              value={pagamento.data_vencimento}
                              onChange={(event) => updatePagamento(pagamentoIndex, { data_vencimento: event.target.value })}
                              required
                            />
                          </label>
                        )}
                      </div>

                      {forma?.exige_cartao && (
                        <div className="space-y-2">
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Cartao</span>
                            <select
                              className="input w-full"
                              value={pagamento.cartao_id || ''}
                              onChange={(event) => updatePagamento(pagamentoIndex, { cartao_id: event.target.value })}
                            >
                              <option value="">Selecione o cartao</option>
                              {cartoesFiltrados.map((cartao) => {
                                const empresaCartao = cartao?.contaBancaria?.empresa;
                                const nomeEmpresa = empresaCartao?.nome || empresaCartao?.razao_social;
                                return (
                                  <option key={cartao.id} value={cartao.id}>
                                    {cartao.nome} {cartao.ultimos_digitos ? `- final ${cartao.ultimos_digitos}` : ''} ({labelTipoCartao(cartao.tipo)}){nomeEmpresa ? ` - ${nomeEmpresa}` : ''}
                                  </option>
                                );
                              })}
                            </select>
                            <span className="mt-1 block text-xs text-[var(--c-muted)]">
                              A conta vinculada ao cartao define a empresa da movimentacao bancaria.
                            </span>
                          </label>

                          {cartaoSelecionado && (
                            <div className={`rounded-lg border px-3 py-2 text-xs ${cartaoEntreEmpresas ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                              {cartaoEntreEmpresas
                                ? form.tipo === 'RECEBER'
                                  ? `Entre empresas automatico: ${nomeEmpresaTitulo || 'empresa do titulo'} recebe por conta de ${nomeEmpresaCartao || 'empresa do cartao'}. O titulo e a classificacao gerencial permanecem na empresa da obra.`
                                  : `Entre empresas automatico: ${nomeEmpresaCartao || 'empresa do cartao'} paga titulo de ${nomeEmpresaTitulo || 'empresa da obra'}. O titulo e a classificacao gerencial permanecem na empresa da obra.`
                                : `Movimentacao na mesma empresa do titulo: ${nomeEmpresaTitulo || nomeEmpresaCartao || 'empresa da obra'}.`}
                            </div>
                          )}
                        </div>
                      )}

                      {usaDetalhe && (
                        <div className="space-y-3">
                          <div className="text-xs text-[var(--c-muted)]">
                            Informe vencimento e valor de cada {getLabelParcelaForma(forma)}.
                          </div>
                          {(pagamento.parcelas || []).map((parcela, parcelaIndex) => (
                            <div key={parcelaIndex} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface-muted)] p-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">
                                Parcela {parcelaIndex + 1}/{quantidade}
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="text-sm">
                                  <span className="mb-1 block text-[var(--c-muted)]">Valor</span>
                                  <input
                                    className="input w-full"
                                    type="text"
                                    inputMode="decimal"
                                    value={parcela.valor || ''}
                                    onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'valor', normalizeCurrencyTyping(event.target.value))}
                                    onBlur={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'valor', formatCurrencyInput(event.target.value))}
                                    required
                                  />
                                </label>
                                <label className="text-sm">
                                  <span className="mb-1 block text-[var(--c-muted)]">Vencimento</span>
                                  <input
                                    className="input w-full"
                                    type="date"
                                    value={parcela.data_vencimento || ''}
                                    onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'data_vencimento', event.target.value)}
                                    required
                                  />
                                </label>

                                {formaAceitaDadosBoletoOuGuia(forma) && (
                                  <>
                                    <label className="text-sm md:col-span-2">
                                      <span className="mb-1 block text-[var(--c-muted)]">Documento ou referencia</span>
                                      <input
                                        className="input w-full"
                                        value={parcela.numero_documento || ''}
                                        onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'numero_documento', event.target.value)}
                                        placeholder={isFormaOutros(forma) ? 'Referencia da guia ou pagamento' : 'Nosso numero ou referencia'}
                                      />
                                    </label>
                                    <label className="text-sm">
                                      <span className="mb-1 block text-[var(--c-muted)]">Codigo do banco</span>
                                      <input
                                        className="input w-full"
                                        inputMode="numeric"
                                        maxLength={8}
                                        pattern="[0-9]*"
                                        value={parcela.banco_cobranca || ''}
                                        onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'banco_cobranca', normalizeCodigoBancoInput(event.target.value))}
                                        placeholder="Ex.: 001, 104, 237"
                                      />
                                    </label>
                                    <label className="text-sm">
                                      <span className="mb-1 block text-[var(--c-muted)]">Linha digitavel</span>
                                      <input
                                        className="input w-full"
                                        value={parcela.linha_digitavel || ''}
                                        onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'linha_digitavel', event.target.value)}
                                        placeholder="Linha digitavel, se houver"
                                      />
                                    </label>
                                    <label className="text-sm md:col-span-2">
                                      <span className="mb-1 block text-[var(--c-muted)]">Codigo de barras</span>
                                      <input
                                        className="input w-full"
                                        value={parcela.codigo_barras || ''}
                                        onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'codigo_barras', event.target.value)}
                                        placeholder="Codigo de barras, se houver"
                                      />
                                    </label>
                                  </>
                                )}

                                {isFormaCheque(forma) && (
                                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800 md:col-span-2">
                                    Os dados do cheque serao informados na baixa, quando o instrumento real for definido.
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {form.tipo === 'RECEBER' && (
                <>
                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">Forma de cobranca</span>
                    <select
                      className="input w-full"
                      value={form.forma_cobranca}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        forma_cobranca: event.target.value,
                        status_cobranca: event.target.value ? (current.status_cobranca || 'PENDENTE_EMISSAO') : 'PENDENTE_EMISSAO'
                      }))}
                    >
                      <option value="">Nao controlar</option>
                      {FORMAS_COBRANCA.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>

                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">Status da cobranca</span>
                    <select
                      className="input w-full"
                      value={form.status_cobranca}
                      onChange={(event) => updateField('status_cobranca', event.target.value)}
                      disabled={!form.forma_cobranca}
                    >
                      {STATUS_COBRANCA.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>

                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">Codigo do banco da cobranca</span>
                    <input
                      className="input w-full"
                      inputMode="numeric"
                      maxLength={8}
                      pattern="[0-9]*"
                      placeholder="Ex.: 001, 104, 237"
                      value={form.banco_cobranca}
                      onChange={(event) => updateField('banco_cobranca', normalizeCodigoBancoInput(event.target.value))}
                    />
                  </label>

                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">Emitido em</span>
                    <input
                      type="date"
                      className="input w-full"
                      value={form.boleto_emitido_em}
                      onChange={(event) => updateField('boleto_emitido_em', event.target.value)}
                    />
                  </label>

                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">Nosso numero</span>
                    <input
                      className="input w-full"
                      value={form.nosso_numero}
                      onChange={(event) => updateField('nosso_numero', event.target.value)}
                    />
                  </label>

                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">Identificador externo</span>
                    <input
                      className="input w-full"
                      placeholder="ID da cobranca no banco"
                      value={form.identificador_externo}
                      onChange={(event) => updateField('identificador_externo', event.target.value)}
                    />
                  </label>

                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">Linha digitavel</span>
                    <input
                      className="input w-full"
                      value={form.linha_digitavel}
                      onChange={(event) => updateField('linha_digitavel', event.target.value)}
                    />
                  </label>

                  <label className="sol-filter-field xl:col-span-3">
                    <span className="sol-filter-label">Codigo de barras</span>
                    <input
                      className="input w-full"
                      value={form.codigo_barras}
                      onChange={(event) => updateField('codigo_barras', event.target.value)}
                    />
                  </label>
                </>
              )}

              {moduloApropriacoesHabilitado && obraSelecionadaEhObra && (
              <label className="sol-filter-field xl:col-span-4">
                <span className="sol-filter-label">Item de apropriacão</span>
                <ApropriacaoAutocomplete
                  value={form.apropriacao_id}
                  options={apropriacoes}
                  onChange={(id) => updateField('apropriacao_id', id)}
                  disabled={!form.obra_id || loadingApropriacoes}
                  disabledPlaceholder="Selecione a obra primeiro"
                  placeholder="Sem apropriação — pesquise para selecionar"
                />
                <span className="app-note mt-2">
                  {!form.obra_id
                    ? 'Selecione uma obra para ver os itens.'
                    : loadingApropriacoes
                      ? 'Carregando...'
                      : apropriacoes.length === 0
                        ? 'Nenhum item cadastrado para esta obra.'
                        : `${apropriacoes.length} item(s) disponivel(is).`}
                </span>
              </label>
              )}

              <div className="md:col-span-2 xl:col-span-12 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--c-text)]">Rateio por obra/centro de custo</h2>
                    <p className="text-sm text-[var(--c-muted)]">
                      Opcional. Use quando o mesmo titulo precisa compor mais de uma obra no financeiro de obras.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      (form.rateios || []).length === 0 || (Math.abs(totalRateioValor - valorTitulo) <= 0.02 && Math.abs(totalRateioPercentual - 100) <= 0.02)
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {(form.rateios || []).length === 0
                        ? 'Sem rateio'
                        : `${formatCurrency(totalRateioValor)} - ${totalRateioPercentual.toFixed(2)}%`}
                    </span>
                    <button type="button" className="btn btn-outline" onClick={adicionarRateio}>
                      Adicionar rateio
                    </button>
                  </div>
                </div>

                {(form.rateios || []).length > 0 && (
                  <div className="mt-4 space-y-3">
                    {(form.rateios || []).map((rateio, rateioIndex) => (
                      <div key={rateio.id || rateioIndex} className="grid gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 md:grid-cols-2 xl:grid-cols-12">
                        <label className="sol-filter-field xl:col-span-4">
                          <span className="sol-filter-label">Obra/centro de custo</span>
                          <select
                            className="input w-full"
                            value={rateio.obra_id}
                            onChange={(event) => updateRateio(rateioIndex, 'obra_id', event.target.value)}
                          >
                            <option value="">Selecione</option>
                            {obras.map((obra) => (
                              <option key={obra.id} value={obra.id}>
                                {obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="sol-filter-field xl:col-span-2">
                          <span className="sol-filter-label">Tipo</span>
                          <select
                            className="input w-full"
                            value={rateio.tipo_rateio}
                            onChange={(event) => updateRateio(rateioIndex, 'tipo_rateio', event.target.value)}
                          >
                            <option value="PERCENTUAL">Percentual</option>
                            <option value="VALOR">Valor</option>
                          </select>
                        </label>
                        {rateio.tipo_rateio === 'VALOR' ? (
                          <label className="sol-filter-field xl:col-span-2">
                            <span className="sol-filter-label">Valor</span>
                            <input
                              className="input w-full"
                              placeholder="R$ 0,00"
                              value={rateio.valor_rateio}
                              onChange={(event) => updateRateio(rateioIndex, 'valor_rateio', normalizeCurrencyTyping(event.target.value))}
                              onBlur={(event) => updateRateio(rateioIndex, 'valor_rateio', formatCurrencyInput(event.target.value))}
                            />
                          </label>
                        ) : (
                          <label className="sol-filter-field xl:col-span-2">
                            <span className="sol-filter-label">Percentual</span>
                            <input
                              className="input w-full"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={rateio.percentual}
                              onChange={(event) => updateRateio(rateioIndex, 'percentual', event.target.value)}
                            />
                          </label>
                        )}
                        <label className="sol-filter-field xl:col-span-3">
                          <span className="sol-filter-label">Observacoes</span>
                          <input
                            className="input w-full"
                            placeholder="Opcional"
                            value={rateio.observacoes}
                            onChange={(event) => updateRateio(rateioIndex, 'observacoes', event.target.value)}
                          />
                        </label>
                        <div className="flex items-end xl:col-span-1">
                          <button type="button" className="btn btn-outline w-full" onClick={() => removerRateio(rateioIndex)}>
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:col-span-2 xl:col-span-12 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--c-text)]">Impostos, retencoes e descontos</h2>
                    <p className="text-sm text-[var(--c-muted)]">
                      Opcional. Registre os valores que explicam a diferenca entre bruto e liquido do titulo.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--c-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--c-muted)]">
                      Liquido previsto: {formatCurrency(valorLiquidoPrevisto)}
                    </span>
                    <button type="button" className="btn btn-outline" onClick={adicionarImposto}>
                      Adicionar imposto
                    </button>
                  </div>
                </div>

                {(form.impostos || []).length > 0 && (
                  <div className="mt-4 space-y-3">
                    {(form.impostos || []).map((imposto, impostoIndex) => (
                      <div key={imposto.id || impostoIndex} className="grid gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 md:grid-cols-2 xl:grid-cols-12">
                        <label className="sol-filter-field xl:col-span-2">
                          <span className="sol-filter-label">Natureza</span>
                          <select
                            className="input w-full"
                            value={imposto.natureza}
                            onChange={(event) => updateImposto(impostoIndex, 'natureza', event.target.value)}
                          >
                            <option value="RETENCAO">Retencao/desconto</option>
                            <option value="ACRESCIMO">Acrescimo</option>
                          </select>
                        </label>
                        <label className="sol-filter-field xl:col-span-3">
                          <span className="sol-filter-label">Tipo</span>
                          <input
                            className="input w-full"
                            placeholder="ISS, INSS, IRRF, desconto..."
                            value={imposto.tipo_imposto}
                            onChange={(event) => updateImposto(impostoIndex, 'tipo_imposto', event.target.value)}
                          />
                        </label>
                        <label className="sol-filter-field xl:col-span-2">
                          <span className="sol-filter-label">Base</span>
                          <input
                            className="input w-full"
                            placeholder="R$ 0,00"
                            value={imposto.base_calculo}
                            onChange={(event) => updateImposto(impostoIndex, 'base_calculo', normalizeCurrencyTyping(event.target.value))}
                            onBlur={(event) => updateImposto(impostoIndex, 'base_calculo', formatCurrencyInput(event.target.value))}
                          />
                        </label>
                        <label className="sol-filter-field xl:col-span-2">
                          <span className="sol-filter-label">Aliquota %</span>
                          <input
                            className="input w-full"
                            inputMode="decimal"
                            placeholder="0,00"
                            value={imposto.aliquota}
                            onChange={(event) => updateImposto(impostoIndex, 'aliquota', event.target.value)}
                          />
                        </label>
                        <label className="sol-filter-field xl:col-span-2">
                          <span className="sol-filter-label">Valor</span>
                          <input
                            className="input w-full"
                            placeholder="R$ 0,00"
                            value={imposto.valor}
                            onChange={(event) => updateImposto(impostoIndex, 'valor', normalizeCurrencyTyping(event.target.value))}
                            onBlur={(event) => updateImposto(impostoIndex, 'valor', formatCurrencyInput(event.target.value))}
                          />
                        </label>
                        <div className="flex items-end xl:col-span-1">
                          <button type="button" className="btn btn-outline w-full" onClick={() => removerImposto(impostoIndex)}>
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="text-xs text-[var(--c-muted)]">
                      Retencoes/descontos: {formatCurrency(totalImpostosRetencao + descontoFinanceiro)}. Acrescimos: {formatCurrency(totalImpostosAcrescimo)}.
                    </div>
                  </div>
                )}
              </div>

              {form.tipo === 'PAGAR' && (
                <div className="md:col-span-2 xl:col-span-12 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-[var(--c-text)]">Dados para pagamento do credor</h2>
                      <p className="text-sm text-[var(--c-muted)]">
                        Use estes dados para deixar o credor pronto para lotes PIX por chave.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                      <input
                        type="checkbox"
                        checked={paymentDraft.preparar_pagamento_pix}
                        onChange={(event) => setPaymentDraft((current) => ({ ...current, preparar_pagamento_pix: event.target.checked }))}
                      />
                      Preparar PIX
                    </label>
                  </div>

                  {paymentDraft.preparar_pagamento_pix && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                      <div className="xl:col-span-12 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-muted)] px-3 py-2 text-sm text-[var(--c-muted)]">
                        Favorecido vinculado e o cadastro bancario rastreado que sera usado no lote PIX. Ele pode ser o proprio credor do titulo ou um favorecido separado, com snapshot travado quando o lote for criado.
                      </div>

                      <label className="flex items-start gap-2 text-sm text-[var(--c-text)] xl:col-span-4">
                        <input
                          type="checkbox"
                          checked={paymentDraft.usar_credor_como_favorecido}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setPaymentDraft((current) => ({ ...current, usar_credor_como_favorecido: checked }));
                            if (checked && parceiroSelecionado) preencherFavorecidoComParceiro(parceiroSelecionado);
                          }}
                          disabled={!parceiroSelecionado}
                        />
                        <span>
                          Usar o mesmo credor como favorecido
                          <span className="mt-1 block text-xs text-[var(--c-muted)]">
                            Preenche nome, CPF/CNPJ e a primeira chave PIX cadastrada no credor.
                          </span>
                        </span>
                      </label>

                      <label className="sol-filter-field xl:col-span-4">
                        <span className="sol-filter-label">Favorecido bancario vinculado</span>
                        <select
                          className="input w-full"
                          value={paymentDraft.payment_beneficiary_id}
                          onChange={(event) => {
                            const selected = beneficiaries.find((item) => String(item.id) === String(event.target.value));
                            setPaymentDraft((current) => ({
                              ...current,
                              usar_credor_como_favorecido: false,
                              payment_beneficiary_id: event.target.value,
                              nome: selected?.nome || current.nome,
                              cpf_cnpj: selected?.cpf_cnpj || current.cpf_cnpj,
                              pix_tipo_chave: selected?.pix_tipo_chave || current.pix_tipo_chave,
                              pix_chave: selected?.pix_chave || current.pix_chave
                            }));
                          }}
                        >
                          <option value="">Novo favorecido</option>
                          {beneficiaries.map((beneficiary) => (
                            <option key={beneficiary.id} value={beneficiary.id}>
                              {beneficiary.nome} - {beneficiary.pix_chave || 'sem PIX'}
                            </option>
                          ))}
                        </select>
                        <span className="app-note mt-2">
                          Se nao houver favorecido salvo, use o proprio credor ou informe os dados abaixo.
                        </span>
                      </label>
                      {paymentDraft.usar_credor_como_favorecido && parceiroPixOptions.length > 1 && (
                        <label className="sol-filter-field xl:col-span-4">
                          <span className="sol-filter-label">Chave PIX do credor</span>
                          <select
                            className="input w-full"
                            value={`${paymentDraft.pix_tipo_chave}:${paymentDraft.pix_chave}`}
                            onChange={(event) => {
                              const selected = parceiroPixOptions.find((item) => `${item.tipo}:${item.chave}` === event.target.value);
                              if (!selected) return;
                              setPaymentDraft((current) => ({
                                ...current,
                                pix_tipo_chave: selected.tipo,
                                pix_chave: selected.chave
                              }));
                            }}
                          >
                            {parceiroPixOptions.map((item) => (
                              <option key={item.id} value={`${item.tipo}:${item.chave}`}>
                                {item.label} - {item.tipo} {item.chave}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="sol-filter-field xl:col-span-3">
                        <span className="sol-filter-label">Nome favorecido</span>
                        <input className="input w-full" value={paymentDraft.nome} onChange={(event) => setPaymentDraft((current) => ({ ...current, nome: event.target.value }))} required={paymentDraft.preparar_pagamento_pix} />
                      </label>
                      <label className="sol-filter-field xl:col-span-2">
                        <span className="sol-filter-label">CPF/CNPJ</span>
                        <input className="input w-full" value={paymentDraft.cpf_cnpj} onChange={(event) => setPaymentDraft((current) => ({ ...current, cpf_cnpj: event.target.value }))} required={paymentDraft.preparar_pagamento_pix} />
                      </label>
                      <label className="sol-filter-field xl:col-span-2">
                        <span className="sol-filter-label">Tipo chave PIX</span>
                        <select className="input w-full" value={paymentDraft.pix_tipo_chave} onChange={(event) => setPaymentDraft((current) => ({ ...current, pix_tipo_chave: event.target.value }))}>
                          {PIX_TIPOS_CHAVE.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                        </select>
                      </label>
                      <label className="sol-filter-field xl:col-span-2">
                        <span className="sol-filter-label">Chave PIX</span>
                        <input className="input w-full" value={paymentDraft.pix_chave} onChange={(event) => setPaymentDraft((current) => ({ ...current, pix_chave: event.target.value }))} required={paymentDraft.preparar_pagamento_pix} />
                      </label>
                      <label className="sol-filter-field xl:col-span-4">
                        <span className="sol-filter-label">Conta pagadora BB</span>
                        <select className="input w-full" value={paymentDraft.payment_account_id} onChange={(event) => setPaymentDraft((current) => ({ ...current, payment_account_id: event.target.value }))}>
                          <option value="">Selecione a conta</option>
                          {paymentAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.contaBancaria?.nome || `Conta ${account.id}`} - CNPJ {account.cnpj_pagador} - Conv. {account.convenio || '-'}
                            </option>
                          ))}
                        </select>
                        <span className="app-note mt-2">
                          Cadastre em Cadastros Financeiros &gt; Contas pagadoras BB. Cada conta pode ter empresa, CNPJ e convenio proprios.
                        </span>
                      </label>
                      <label className="sol-filter-field xl:col-span-2">
                        <span className="sol-filter-label">Data de Pagamento</span>
                        <input className="input w-full" type="date" value={paymentDraft.data_pagamento || form.data_vencimento} onChange={(event) => setPaymentDraft((current) => ({ ...current, data_pagamento: event.target.value }))} />
                      </label>
                      <div className="xl:col-span-6 app-note">
                        O titulo guarda o parceiro como origem. O lote futuro cria snapshot imutavel do favorecido, valor e conta pagadora.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <label className="sol-filter-field md:col-span-2 xl:col-span-12">
                <span className="sol-filter-label">Observacoes</span>
                <textarea
                  className="input min-h-[120px] w-full"
                  placeholder="Informacoes adicionais para a operacao financeira"
                  value={form.observacoes}
                  onChange={(event) => updateField('observacoes', event.target.value)}
                />
              </label>
            </div>

            <div className="app-page-actions justify-end">
              <Link to={tituloListPath} className="btn btn-outline">Cancelar</Link>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando...' : (form.tipo === 'RECEBER' ? 'Criar conta a receber' : 'Criar conta a pagar')}
              </button>
            </div>
          </form>
        </div>
      )}

      {categoriaModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="card flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col gap-3 overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--c-text)]">Selecionar categoria financeira</h3>
                <p className="text-xs text-[var(--c-muted)]">
                  Veja todas as categorias compativeis com o tipo do titulo ou filtre por nome, grupo ou descricao.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCategoriaModalOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <input
                className="input w-full"
                placeholder="Filtrar por ID, nome, grupo, subgrupo ou descricao"
                value={categoriaModalBusca}
                onChange={(event) => setCategoriaModalBusca(event.target.value)}
                autoFocus
              />

              <div className="text-xs text-[var(--c-muted)]">
                {categoriasModalFiltradas.length} categoria(s) disponivel(is) para {form.tipo === 'RECEBER' ? 'conta a receber' : 'conta a pagar'}.
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-2">
                {categoriasModalFiltradas.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-[var(--c-muted)]">
                    Nenhuma categoria encontrada para esse filtro.
                  </div>
                ) : categoriasModalFiltradas.map((categoria) => (
                  <button
                    key={categoria.id}
                    type="button"
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      String(form.categoria_financeira_id) === String(categoria.id)
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-transparent hover:border-[var(--c-border)] hover:bg-[var(--c-surface)]'
                    }`}
                    onClick={() => selecionarCategoriaFinanceira(categoria)}
                  >
                    <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="font-semibold text-[var(--c-text)]">{categoria.nome}</div>
                        <div className="text-xs text-[var(--c-muted)]">
                          {categoria.tipo} - {categoria.descricao || 'Sem descricao complementar'}
                        </div>
                        <div className="text-xs text-[var(--c-muted)]">{getCategoriaDreResumo(categoria)}</div>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">
                        #{categoria.id}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
