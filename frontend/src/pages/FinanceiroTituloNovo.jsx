import DateInputBR from '../components/DateInputBR';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFecharAoSair } from '../hooks/useFecharAoSair';
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
import { formatCurrencyInput, getCpfCnpjError, getPixDocumentError, maskCpfCnpj, normalizeCurrencyTyping, onlyDigits } from '../utils/formatters';
import {
  categoriaFinanceiraMatchesAutocomplete,
  categoriaFinanceiraMatchesSearch
} from '../utils/categoriaFinanceira';
import CategoriaFinanceiraAutocomplete from '../components/ui/CategoriaFinanceiraAutocomplete';
import OverlayModal from '../components/ui/OverlayModal';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

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
      label: 'Chave variável',
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
  // R3/R19: a faixa de avisos do sistema no lugar da caixa do navegador e do
  // `app-alert` solto. `avisar` é EVENTO (falhou ao carregar, falhou ao
  // salvar); condição derivada do conteúdo — "as formas ainda não fecham o
  // valor do título" — continua no fluxo, ao lado do campo que a descreve.
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
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
        limpar();
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
        avisar.erro(
          `${err?.message || 'Falha ao falar com o servidor.'} Nao foi possivel carregar obras, categorias e formas de pagamento: sem elas o titulo nao pode ser cadastrado. Recarregue a pagina; se repetir, avise o financeiro informando o horario da tentativa.`
        );
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
        avisar.erro(
          `${err?.message || 'Falha ao falar com o servidor.'} A busca de ${form.tipo === 'RECEBER' ? 'clientes' : 'credores'} nao respondeu. Tente digitar o termo de novo em alguns segundos; sem escolher um nome na lista o titulo nao pode ser salvo.`
        );
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

  /*
    A LISTA DE CATEGORIAS NÃO FECHAVA DE JEITO NENHUM (05/09).

    `mostrarListaCategorias` era só "tem texto digitado e ainda não há
    categoria escolhida": a camada (`absolute z-dropdown`) ficava pousada sobre
    a "Descrição" e o "Número do documento" logo abaixo, e a única saída
    era escolher uma categoria ou APAGAR a busca — quem digitasse e
    quisesse conferir um campo abaixo perdia o termo para conseguir ver.
    Clicar fora não fazia nada; `Esc` não fazia nada.

    A condição de CONTEÚDO fica; o que entra é o estado de ABERTA por
    cima dela, que é o que o clique fora e o `Esc` desligam. Digitar ou
    focar o campo reabre, sem perder o texto.

    A seleção continua funcionando: o ref envolve o campo E a lista
    (clique na opção é DENTRO, o hook não fecha no `mousedown`), e a
    opção ganhou `onMouseDown` com `preventDefault` para o foco não sair
    do campo antes do `onClick`.
  */
  const listaCategoriasRef = useRef(null);
  const [listaCategoriasAberta, setListaCategoriasAberta] = useState(false);
  useFecharAoSair(listaCategoriasRef, listaCategoriasAberta, () => setListaCategoriasAberta(false));
  const mostrarListaCategorias = categoriaBusca.trim().length > 0
    && !form.categoria_financeira_id
    && listaCategoriasAberta;

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
      // DEFEITO ENCONTRADO E CORRIGIDO NA REFORMA (03/09): este ramo chamava
      // `setParceiroDocumentoBusca` e `setParceiroNomeBusca`, dois nomes que
      // NÃO EXISTEM neste arquivo (o estado é `parceiroBusca`). Toda chamada
      // a `updateField('tipo', …)` estouraria ReferenceError — a mesma
      // classe da R22: o `npm run build` passa e a tela quebra em execução.
      // O ramo estava inalcançável porque o seletor de tipo duplicava esta
      // lógica inline; agora é o seletor que chama este ramo (dono único) e
      // o campo de busca do parceiro é limpo junto com o `parceiro_id`, que
      // já era zerado aqui — texto sobrando no campo com o vínculo vazio era
      // o que fazia a validação acusar "selecione o credor" com o nome à
      // vista.
      setSearchParams({ tipo: value });
      setParceiroBusca('');
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

  /*
    CAMINHOS DE ERRO DESTA TELA (reforma 03/09).

    A régua aqui é a do dinheiro: mensagem que diz O QUE FALHOU mas não O QUE
    FAZER é defeito. Cada retorno abaixo nomeia o campo, diz a ação e, quando
    o erro é de fechamento de conta, mostra o número que precisa bater — quem
    está digitando um título não deveria ter de descobrir sozinho quanto
    falta.

    As CONDIÇÕES são as mesmas de antes, com os mesmos limites (0,009 na soma
    das formas, 0,02 no rateio): regra de negócio não se mexe numa reforma de
    layout. O que mudou foi só o TEXTO.
  */
  function validarCadastroTitulo() {
    const rotuloParceiro = form.tipo === 'RECEBER' ? 'cliente' : 'credor';
    const empresaSelecionadaId = form.empresa_id || getEmpresaObraId(obraSelecionada);
    if (!empresaSelecionadaId) {
      return 'A obra/centro de custo escolhida nao tem empresa do grupo vinculada, e o titulo precisa de uma para existir. Escolha outra obra no campo Obra/Centro de Custo ou peca o vinculo da empresa antes de cadastrar.';
    }

    if (!form.parceiro_id) {
      return `Nenhum ${rotuloParceiro} esta vinculado ao titulo. Digite o nome ou o CPF/CNPJ no campo ${form.tipo === 'RECEBER' ? 'Cliente' : 'Credor'} e CLIQUE no nome que aparecer na lista — digitar sem clicar nao vincula.`;
    }

    if (valorTitulo <= 0) {
      return 'Informe o valor total do titulo, maior que zero, no campo Valor.';
    }

    if (descontoFinanceiro < 0) {
      return 'O desconto concedido esta negativo. Apague o sinal de menos do campo Desconto concedido ou deixe o campo vazio.';
    }

    if (descontoFinanceiro > valorTitulo) {
      return `O desconto concedido (${formatCurrency(descontoFinanceiro)}) e maior que o valor do titulo (${formatCurrency(valorTitulo)}). Reduza o desconto para no maximo o valor do titulo.`;
    }

    if (valorLiquidoPrevisto <= 0) {
      return `Com as retencoes e o desconto informados o liquido do titulo ficou em ${formatCurrency(valorLiquidoPrevisto)}, e ele precisa ser maior que zero. Reduza as retencoes no bloco Impostos, reduza o desconto concedido ou aumente o valor do titulo.`;
    }

    if (!form.categoria_financeira_id) {
      return 'Selecione a categoria financeira do titulo: digite no campo Categoria financeira e clique na sugestao, ou abra a lupa para ver a lista inteira. E ela que define se o titulo entra na DRE.';
    }

    const pagamentos = Array.isArray(form.pagamentos) ? form.pagamentos : [];
    if (pagamentos.length === 0) {
      return 'O titulo precisa de pelo menos uma forma de pagamento. Use o botao Adicionar forma, no bloco Formas de pagamento.';
    }

    for (const [pagamentoIndex, pagamento] of pagamentos.entries()) {
      const forma = getFormaPagamento(pagamento.forma_pagamento_id);
      const usaDetalhe = formaUsaParcelasDetalhadas(forma);
      const usaCartao = isFormaCartao(forma);
      const valorPagamento = getValorPagamento(pagamento);
      const labelForma = `forma ${pagamentoIndex + 1}`;

      if (!pagamento.forma_pagamento_id) {
        return `Escolha a forma de pagamento no bloco "Forma ${pagamentoIndex + 1}" (pix, cartao, boleto, cheque...). Sem ela o sistema nao sabe como o titulo sera liquidado.`;
      }

      if (pagamentos.length > 1 && !pagamento.parceiro_id) {
        return `Falta o ${rotuloParceiro} da ${labelForma}. Com mais de uma forma cada titulo gerado precisa do seu proprio ${rotuloParceiro}: digite o nome no campo da ${labelForma} e clique no resultado.`;
      }

      if (pagamentos.length > 1 && !(pagamento.categoria_financeira_id || form.categoria_financeira_id)) {
        return `Falta a categoria financeira da ${labelForma}. Escolha uma no campo "Categoria financeira deste titulo", dentro do bloco da ${labelForma}.`;
      }

      if (valorPagamento <= 0) {
        return `Informe o valor da ${labelForma}, maior que zero. A soma das formas tem de fechar exatamente ${formatCurrency(valorTitulo)}.`;
      }

      if (usaDetalhe) {
        const quantidade = getQuantidadeParcelas(pagamento);
        const parcelas = Array.isArray(pagamento.parcelas) ? pagamento.parcelas : [];
        if (parcelas.length !== quantidade) {
          return `A ${labelForma} diz ${quantidade} parcela(s) e tem ${parcelas.length} detalhada(s). Reinforme a quantidade no campo Parcelas da ${labelForma} para o sistema montar a lista de novo.`;
        }

        for (const [parcelaIndex, parcela] of parcelas.entries()) {
          const labelParcela = `parcela ${parcelaIndex + 1}/${quantidade} da ${labelForma}`;
          if (currencyToNumber(parcela.valor) <= 0) {
            return `Informe o valor da ${labelParcela}, maior que zero. A soma das parcelas e que forma o valor da ${labelForma}.`;
          }
          if (!parcela.data_vencimento) {
            return `Informe a data de vencimento da ${labelParcela}. Sem vencimento a parcela nao entra na agenda de pagamento.`;
          }
        }
      } else if (!usaCartao && !pagamento.data_vencimento) {
        return `Informe a data de vencimento da ${labelForma}. Sem vencimento o titulo nao entra na agenda de pagamento.`;
      }
    }

    if (!totalBateComTitulo) {
      const direcao = diferencaPagamentos > 0 ? 'faltam' : 'sobram';
      const ajuste = diferencaPagamentos > 0
        ? 'Aumente o valor de uma das formas (ou adicione outra)'
        : 'Reduza o valor de uma das formas (ou remova uma)';
      return `A soma das formas de pagamento (${formatCurrency(totalPagamentos)}) nao fecha o valor do titulo (${formatCurrency(valorTitulo)}): ainda ${direcao} ${formatCurrency(Math.abs(diferencaPagamentos))}. ${ajuste}, ou corrija o valor do titulo.`;
    }

    const rateios = Array.isArray(form.rateios) ? form.rateios : [];
    if (rateios.length > 0) {
      for (const [rateioIndex, rateio] of rateios.entries()) {
        if (!rateio.obra_id) {
          return `Escolha a obra/centro de custo do rateio ${rateioIndex + 1}, ou remova a linha pelo botao Remover.`;
        }
        if (rateio.tipo_rateio === 'VALOR' && currencyToNumber(rateio.valor_rateio) <= 0) {
          return `Informe o valor do rateio ${rateioIndex + 1}, maior que zero — ou troque o tipo para Percentual, ou remova a linha.`;
        }
        if (rateio.tipo_rateio === 'PERCENTUAL' && currencyToNumber(rateio.percentual) <= 0) {
          return `Informe o percentual do rateio ${rateioIndex + 1}, maior que zero — ou troque o tipo para Valor, ou remova a linha.`;
        }
      }
      if (Math.abs(totalRateioValor - valorTitulo) > 0.02 || Math.abs(totalRateioPercentual - 100) > 0.02) {
        const faltaValor = roundCurrency(valorTitulo - totalRateioValor);
        return `O rateio ainda nao fecha o titulo: soma ${formatCurrency(totalRateioValor)} (${totalRateioPercentual.toFixed(2)}%) e precisa somar ${formatCurrency(valorTitulo)} (100%). ${faltaValor > 0 ? `Faltam ${formatCurrency(faltaValor)}` : `Sobram ${formatCurrency(Math.abs(faltaValor))}`}: ajuste as linhas do bloco Rateio ou remova todas para lancar o titulo em uma obra so.`;
      }
    }

    const impostos = Array.isArray(form.impostos) ? form.impostos : [];
    for (const [impostoIndex, imposto] of impostos.entries()) {
      if (!String(imposto.tipo_imposto || imposto.descricao || '').trim()) {
        return `Informe o tipo do imposto/desconto ${impostoIndex + 1} (ISS, INSS, IRRF, desconto...), ou remova a linha pelo botao Remover.`;
      }
      if (currencyToNumber(imposto.valor) <= 0) {
        return `Informe o valor do imposto/desconto ${impostoIndex + 1}, maior que zero. Preenchendo base e aliquota o sistema calcula o valor sozinho; ou remova a linha.`;
      }
    }

    if (form.intercompany) {
      if (!form.empresa_origem_id) {
        return 'Escolha a empresa ORIGEM no bloco Movimentacao entre empresas do grupo — ou desmarque a caixa se este titulo nao for entre empresas.';
      }
      if (!form.empresa_destino_id) {
        return 'Escolha a empresa DESTINO no bloco Movimentacao entre empresas do grupo — ou desmarque a caixa se este titulo nao for entre empresas.';
      }
      if (String(form.empresa_origem_id) === String(form.empresa_destino_id)) {
        return 'A empresa origem e a empresa destino da movimentacao entre empresas estao iguais. Troque uma das duas: movimentacao entre empresas exige empresas diferentes.';
      }
      if (!form.tipo_intercompany) {
        return 'Escolha o tipo da movimentacao entre empresas (aporte, emprestimo, reembolso, rateio...) no bloco Movimentacao entre empresas do grupo.';
      }
    }

    /*
      DADOS PIX DO FAVORECIDO — validados AQUI, antes de qualquer gravação.

      Antes da reforma estas checagens moravam dentro do `try` do envio, entre
      a montagem do payload e a criação do favorecido; falhavam com `throw` e
      caíam no `catch` genérico, que dizia "Erro ao criar conta manual". A
      pessoa lia um erro de conta para um problema de chave PIX. Nenhuma
      gravação acontece entre o ponto antigo e este, então mover é só
      antecipar a leitura — a ordem efetiva das mensagens não muda.
    */
    if (form.tipo === 'PAGAR' && paymentDraft.preparar_pagamento_pix) {
      if (!form.parceiro_id || !paymentDraft.nome || !paymentDraft.cpf_cnpj || !paymentDraft.pix_tipo_chave || !paymentDraft.pix_chave) {
        return 'Voce marcou "Preparar PIX": preencha nome do favorecido, CPF/CNPJ, tipo de chave e chave PIX no bloco Dados para pagamento do credor. Se ainda nao tem esses dados, desmarque "Preparar PIX" e cadastre o titulo — o favorecido pode ser vinculado depois.';
      }
      const documentoErro = getCpfCnpjError(paymentDraft.cpf_cnpj, {
        required: true,
        label: 'CPF/CNPJ do favorecido'
      });
      if (documentoErro) {
        return `${documentoErro} Corrija o campo CPF/CNPJ no bloco Dados para pagamento do credor: o lote PIX e recusado pelo banco com documento invalido.`;
      }
      const pixErro = getPixDocumentError(paymentDraft.pix_chave, paymentDraft.pix_tipo_chave);
      if (pixErro) {
        return `${pixErro} Corrija a chave PIX (ou troque o tipo de chave) no bloco Dados para pagamento do credor.`;
      }
    }

    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    // Aviso velho não sobrevive à nova tentativa: faixa de erro antiga ao
    // lado de um formulário já corrigido faz a pessoa procurar problema que
    // não existe mais.
    limpar();
    const erroValidacao = validarCadastroTitulo();
    if (erroValidacao) {
      avisar.alerta(erroValidacao, 'Faltou algo para criar a conta');
      return;
    }

    try {
      setSaving(true);

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
        // Os três `throw` de validação que ficavam aqui subiram para o
        // `validarCadastroTitulo` (mesmas condições, mesma ordem efetiva),
        // para o erro de chave PIX deixar de sair com o texto de "erro ao
        // criar conta". Nada é gravado entre um ponto e outro.
        const beneficiaryPayload = {
          parceiro_id: Number(form.parceiro_id),
          nome: paymentDraft.nome,
          cpf_cnpj: onlyDigits(paymentDraft.cpf_cnpj),
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

      /*
        R3/R19 — a ÚNICA caixa do navegador desta tela morava aqui:
        `alert('Conta criada com sucesso.')`, logo antes de sair para a tela
        do título criado.

        Por que CONFIRMAÇÃO e não aviso: a faixa do `useAvisos` vive dentro
        da página, e a linha seguinte troca a página. O aviso apareceria e
        morreria no mesmo quadro — ninguém leria que o título foi criado nem
        com que número. É o mesmo raciocínio já registrado no UsuarioNovo: o
        `alert` daqui não estava informando, estava SEGURANDO a navegação
        até ser dispensado, e o substituto do sistema para "segurar" é o
        `useConfirmacao`.

        E o clique deixou de ser desperdiçado: em vez de um "OK" que só
        libera a saída, os dois botões são os dois destinos reais, cada um
        dizendo para onde vai. O texto nomeia o título, o valor e o
        favorecido — quem acabou de digitar dinheiro precisa poder conferir
        antes da tela mudar.

        R21: o retorno é OBJETO — desestruturado. Ler `confirmar()` como
        booleano é o defeito que já mandou um estorno indevido para o
        financeiro.
      */
      /*
        E a mensagem CONTA QUANTOS títulos nasceram, não "um".

        O `alert` antigo dizia "Conta criada com sucesso." no singular, e o
        endpoint devolve `parcelas_geradas` justamente porque UM envio com
        várias formas/parcelas cria VÁRIOS títulos — a tela levava para o
        primeiro deles sem nunca dizer que os outros existiam. É a classe de
        defeito de CONSENTIMENTO da DoD ao contrário: a pessoa autoriza N e a
        mensagem afirma 1. O número aqui vem da resposta do servidor, não de
        uma contagem paralela da tela.
      */
      const idsGerados = Array.isArray(titulo?.parcelas_geradas) ? titulo.parcelas_geradas : [];
      const quantidadeCriada = Math.max(idsGerados.length, 1);
      const codigoTitulo = titulo?.codigo || titulo?.numero_documento || `#${titulo?.id}`;
      const nomeParceiro = parceiroSelecionado?.nome
        || (form.tipo === 'RECEBER' ? 'o cliente informado' : 'o credor informado');
      const resumoValor = `${formatCurrency(valorTitulo)} (liquido previsto ${formatCurrency(valorLiquidoPrevisto)})`;
      const { ok: abrirTitulo } = await confirmar({
        titulo: form.tipo === 'RECEBER' ? 'Conta a receber criada' : 'Conta a pagar criada',
        mensagem: quantidadeCriada > 1
          ? `${quantidadeCriada} titulos foram criados a partir deste cadastro (uma por parcela/forma de pagamento), somando ${resumoValor}, para ${nomeParceiro}. O primeiro deles e o ${codigoTitulo}.`
          : `Titulo ${codigoTitulo} criado no valor de ${resumoValor} para ${nomeParceiro}.`,
        rotuloConfirmar: quantidadeCriada > 1 ? 'Abrir o primeiro titulo' : 'Abrir o título criado',
        rotuloCancelar: `Voltar para ${tituloListLabel}`
      });
      navigate(abrirTitulo ? `/financeiro/titulos/${titulo.id}` : tituloListPath);
    } catch (err) {
      // O que falhou E o que fazer — e, antes de tudo, o estado do dinheiro:
      // dizer que o título NÃO foi criado é o que evita a segunda tentativa
      // virar título em duplicidade.
      avisar.erro(
        `${err?.message || 'Falha ao falar com o servidor.'} O titulo NAO foi criado. Corrija o que a mensagem aponta e clique de novo em criar; nao recarregue a pagina, o que voce digitou continua aqui. Se repetir, avise o financeiro com o horario da tentativa.`,
        'Nao foi possivel criar a conta'
      );
    } finally {
      setSaving(false);
    }
  }

  const tituloListPath = form.tipo === 'PAGAR' ? '/financeiro/contas-a-pagar' : '/financeiro/contas-a-receber';
  const tituloListLabel = form.tipo === 'PAGAR' ? 'contas a pagar' : 'contas a receber';

  /*
    ESTRUTURA DA TELA (reforma 03/09).

    Antes: `div.page` cru, cabeçalho à mão com `page-subtitle` solto (R5), 42
    campos embrulhados em `.sol-filter-field` — a caixa de FILTRO da lista de
    solicitações, reaproveitada como campo de formulário — e oito famílias de
    cor crua do Tailwind (R25).

    Agora: `Pagina` (ritmo vertical e posição da faixa fixa), `PageHeader`
    (faixa fixa R13, apoio na prop `descricao` R5, seta de voltar R11/C3),
    `BlocoConteudo` primário com a cor do módulo financeiro, `FormSecao` +
    `CampoForm` para o grid (R2/R7: mesma altura, rótulo sempre acima) e
    `.input-moeda` em TODO campo de dinheiro (R6: 180px, à direita,
    tabular-nums).

    Os blocos opcionais — cobrança, entre empresas, rateio, impostos —
    nascem RECOLHIDOS, com o título sempre à vista. É a leitura vencendo a
    densidade (D4): a tela tinha 42 campos empilhados de uma vez, e a maioria
    das contas usa uns doze deles.
  */
  return (
    <Pagina>
      <PageHeader
        titulo={form.tipo === 'RECEBER' ? 'Nova conta a receber' : 'Nova conta a pagar'}
        descricao="Conta manual, que não nasceu de solicitação nem de contrato de venda."
        voltar={{ to: tituloListPath, title: `Voltar para ${tituloListLabel}` }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {loadingBase ? (
        <div className="app-empty-card">Carregando estrutura do financeiro...</div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* R5/B3: o apoio DA TELA mora na faixa fixa; este é o apoio DO
              BLOCO — a regra que vale para o que está sendo digitado aqui. */}
          <BlocoConteudo
            variante="primario"
            cor="var(--module-financeiro)"
            descricao="Em previsão, aberto ou parcial a conta já entra no previsto, mesmo sem solicitação vinculada."
          >
            <div className="space-y-4">

              <FormSecao legenda="Identificação da conta" colunas={3}>
                <CampoForm label="Tipo" obrigatorio>
                  <select
                    className="input w-full"
                    value={form.tipo}
                    onChange={(event) => updateField('tipo', resolveTipo(event.target.value))}
                  >
                    <option value="PAGAR">Conta a pagar</option>
                    <option value="RECEBER">Conta a receber</option>
                  </select>
                </CampoForm>

                <CampoForm
                  label="Status inicial"
                  obrigatorio
                  hint="Previsao entra nos relatorios, mas so fica disponivel para baixa depois de virar aberto."
                >
                  <select
                    className="input w-full"
                    value={form.status}
                    onChange={(event) => updateField('status', event.target.value)}
                  >
                    <option value="ABERTO">Aberto</option>
                    <option value="PREVISAO">Previsão</option>
                  </select>
                </CampoForm>

                <CampoForm label="Obra/Centro de Custo" obrigatorio hint="Define a empresa do grupo dona do titulo.">
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
                </CampoForm>

                {/*
                  Campo COMPOSTO (entrada + lista de resultados). Usa as
                  classes do CampoForm mas num `div`, não num `label`: o
                  `CampoForm` sempre envolve num `<label>`, e um `<label>` em
                  volta de vários controles rouba o clique dos botões para o
                  primeiro campo. Lacuna do padrão registrada no relatório —
                  R21: não se muda o contrato do componente por causa de uma
                  tela.
                */}
                <div className="form-group form-campo--linha">
                  <span className="form-label form-label--required">
                    {form.tipo === 'RECEBER' ? 'Cliente' : 'Credor'}
                  </span>
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
                          Nenhum {form.tipo === 'RECEBER' ? 'cliente' : 'credor'} encontrado. Tente outro trecho do nome ou o CPF/CNPJ.
                        </div>
                      ) : parceiros.slice(0, 8).map((parceiro) => {
                        const selected = String(parceiro.id) === String(form.parceiro_id);
                        return (
                          <button
                            key={parceiro.id}
                            type="button"
                            className={`w-full border-b border-[var(--c-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--ui-surface-2)] ${selected ? 'bg-[var(--ui-surface-2)] font-medium text-[var(--c-text)]' : 'text-[var(--c-muted)]'}`}
                            onClick={() => selecionarParceiro(parceiro)}
                          >
                            <span className="block text-[var(--c-text)]">{parceiro.nome}</span>
                            <span className="block text-xs">{parceiro.cpf_cnpj || 'CPF/CNPJ nao informado'}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <span className="form-hint">
                    {loadingParceiros ? 'Carregando parceiros...' : parceiroResumo}
                  </span>
                </div>

                {/* Campo composto: entrada + lupa + limpar + sugestões. */}
                <div className="form-group form-campo--linha">
                  <span className="form-label form-label--required">Categoria financeira</span>
                  <div className="relative space-y-2" ref={listaCategoriasRef}>
                    <div className="flex gap-2">
                      <input
                        className="input w-full"
                        placeholder="Digite para buscar a categoria"
                        value={categoriaBusca}
                        onFocus={() => setListaCategoriasAberta(true)}
                        onChange={(event) => {
                          setListaCategoriasAberta(true);
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
                      <div className="absolute left-0 right-0 top-full z-dropdown mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] shadow-lg">
                        {categoriasAutocomplete.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-[var(--c-muted)]">
                            Nenhuma categoria encontrada. Apague parte do texto ou abra a lupa para ver a lista inteira.
                          </div>
                        ) : categoriasAutocomplete.map((categoria) => (
                          <button
                            key={categoria.id}
                            type="button"
                            className="w-full border-b border-[var(--c-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--ui-surface-2)]"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selecionarCategoriaFinanceira(categoria)}
                          >
                            <span className="block font-medium text-[var(--c-text)]">{categoria.nome}</span>
                            <span className="block text-xs text-[var(--c-muted)]">{getCategoriaDreResumo(categoria)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="form-hint">
                    {categoriaSelecionada
                      ? getCategoriaDreResumo(categoriaSelecionada)
                      : 'A categoria financeira define automaticamente se o titulo entra na DRE.'}
                  </span>
                </div>

                <CampoForm label="Descrição" obrigatorio span={2}>
                  <input
                    className="input w-full"
                    placeholder="Ex.: Aluguel administrativo, recebimento de cliente, ajuste de caixa"
                    value={form.descricao}
                    onChange={(event) => updateField('descricao', event.target.value)}
                    required
                  />
                </CampoForm>

                <CampoForm label="Número do documento">
                  <input
                    className="input w-full"
                    placeholder="NF, boleto, recibo ou referência interna"
                    value={form.numero_documento}
                    onChange={(event) => updateField('numero_documento', event.target.value)}
                  />
                </CampoForm>
              </FormSecao>

              {/* R6 — todo campo de dinheiro com .input-moeda: 180px de piso,
                  alinhado à direita, tabular-nums. Inclusive os campos de
                  LEITURA (líquido e total das formas): número de dinheiro que
                  não alinha com o de cima obriga a conferir com o dedo. */}
              <FormSecao legenda="Valores do título" colunas={3}>
                <CampoForm label="Valor" obrigatorio>
                  <input
                    className="input input-moeda w-full"
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    value={form.valor}
                    onChange={(event) => updateField('valor', normalizeCurrencyTyping(event.target.value))}
                    onBlur={(event) => updateField('valor', formatCurrencyInput(event.target.value))}
                    required
                  />
                </CampoForm>

                <CampoForm label="Desconto concedido" hint="Opcional. Reduz o valor liquido do titulo.">
                  <input
                    className="input input-moeda w-full"
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    value={form.desconto_financeiro}
                    onChange={(event) => updateField('desconto_financeiro', normalizeCurrencyTyping(event.target.value))}
                    onBlur={(event) => updateField('desconto_financeiro', formatCurrencyInput(event.target.value))}
                  />
                </CampoForm>

                <CampoForm label="Valor líquido previsto" hint="Valor menos retencoes e desconto, mais acrescimos.">
                  <div className="valor-tabular input-moeda flex min-h-12 items-center justify-end rounded-lg border border-[var(--c-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-sm text-[var(--c-muted)]">
                    {formatCurrency(valorLiquidoPrevisto)}
                  </div>
                </CampoForm>

                {/*
                  R3, fronteira do `useAvisos`: isto NÃO é aviso, é CONDIÇÃO
                  derivada do conteúdo — fecha e o problema continua. Por isso
                  fica no fluxo, ao lado dos valores que a produzem, e não na
                  faixa de avisos (que some com um clique e deixaria a pessoa
                  enviar sem ver que as formas não fecham o título).
                */}
                <div className="form-group form-campo--linha">
                  <span className="form-label">Total das formas de pagamento</span>
                  <div
                    className={`flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                      totalBateComTitulo
                        ? 'border-[var(--sem-success-border)] bg-[var(--sem-success-bg)] text-[var(--sem-success)]'
                        : 'border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]'
                    }`}
                  >
                    <span className="valor-tabular font-semibold">{formatCurrency(totalPagamentos)}</span>
                    <span className="text-xs">
                      {totalBateComTitulo
                        ? `Fecha o valor do titulo (${formatCurrency(valorTitulo)}).`
                        : `${diferencaPagamentos > 0 ? 'Faltam' : 'Sobram'} ${formatCurrency(Math.abs(diferencaPagamentos))} para fechar ${formatCurrency(valorTitulo)}.`}
                    </span>
                  </div>
                  <span className="form-hint">
                    A soma das formas tem de ser igual ao valor do título para salvar.
                  </span>
                </div>
              </FormSecao>

              <FormSecao legenda="Datas e competência" colunas={3}>
                <CampoForm label="Data de emissão">
                  <DateInputBR
                    className="input w-full"
                    value={form.data_emissao}
                    onChange={(event) => updateField('data_emissao', event.target.value)}
                  />
                </CampoForm>

                {moduloApropriacoesHabilitado && obraSelecionadaEhObra && (
                  <CampoForm
                    label="Item de apropriação"
                    hint={!form.obra_id
                      ? 'Selecione uma obra para ver os itens.'
                      : loadingApropriacoes
                        ? 'Carregando...'
                        : apropriacoes.length === 0
                          ? 'Nenhum item cadastrado para esta obra.'
                          : `${apropriacoes.length} item(s) disponivel(is).`}
                  >
                    <select
                      className="input w-full"
                      value={form.apropriacao_id}
                      onChange={(event) => updateField('apropriacao_id', event.target.value)}
                      disabled={!form.obra_id || loadingApropriacoes}
                    >
                      <option value="">Sem apropriação</option>
                      {apropriacoes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.codigo ? `${item.codigo} — ${item.descricao}` : item.descricao}
                        </option>
                      ))}
                    </select>
                  </CampoForm>
                )}
              </FormSecao>

              <BlocoConteudo
                titulo="Formas de pagamento"
                variante="secundario"
                descricao="Combine pix, cartão, boleto ou cheque até fechar o valor total do título."
                contagem={`${quantidadePagamentos} forma(s)`}
              >
                <div className="space-y-3">
                  <div className="app-actionbar">
                    <button type="button" className="btn btn-outline" onClick={adicionarPagamento}>
                      Adicionar forma
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
                            Forma {pagamentoIndex + 1} de {quantidadePagamentos}
                          </div>
                          {quantidadePagamentos > 1 && (
                            <button
                              type="button"
                              className="btn btn-outline btn-perigo-suave"
                              onClick={() => removerPagamento(pagamentoIndex)}
                            >
                              Remover forma {pagamentoIndex + 1}
                            </button>
                          )}
                        </div>

                        {quantidadePagamentos > 1 && (
                          <div className="rounded-2xl border border-[var(--sem-info-border)] bg-[var(--sem-info-bg)] p-3">
                            <div className="form-group">
                              <span className="form-label form-label--required">
                                {form.tipo === 'RECEBER' ? 'Cliente deste titulo' : 'Credor deste título'}
                              </span>
                              <input
                                className="input w-full"
                                placeholder={form.tipo === 'RECEBER' ? 'Digite para buscar o cliente' : 'Digite para buscar o credor'}
                                value={pagamento.parceiro_id ? (pagamento.parceiro_nome || 'Selecionado') : (pagamento.parceiro_busca || '')}
                                onChange={(event) => updatePagamento(pagamentoIndex, {
                                  parceiro_id: '',
                                  parceiro_nome: '',
                                  parceiro_busca: event.target.value
                                })}
                              />
                              {!pagamento.parceiro_id && String(pagamento.parceiro_busca || '').trim() && (
                                <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                                  {filtrarParceirosPagamento(pagamento.parceiro_busca).length === 0 ? (
                                    <div className="px-3 py-2 text-sm text-[var(--c-muted)]">
                                      Nenhum {form.tipo === 'RECEBER' ? 'cliente' : 'credor'} encontrado. Busque primeiro no campo do topo da tela para carregar a lista.
                                    </div>
                                  ) : filtrarParceirosPagamento(pagamento.parceiro_busca).map((parceiro) => (
                                    <button
                                      key={parceiro.id}
                                      type="button"
                                      className="w-full border-b border-[var(--c-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--ui-surface-2)]"
                                      onClick={() => selecionarParceiroPagamento(pagamentoIndex, parceiro)}
                                    >
                                      <span className="block font-semibold text-[var(--c-text)]">{parceiro.nome}</span>
                                      <span className="block text-xs text-[var(--c-muted)]">{parceiro.cpf_cnpj || 'CPF/CNPJ nao informado'}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <span className="form-hint">
                                Use quando cada titulo precisar sair para um {form.tipo === 'RECEBER' ? 'cliente' : 'credor'} diferente.
                              </span>
                            </div>
                          </div>
                        )}

                        {quantidadePagamentos > 1 && (
                          <CategoriaFinanceiraAutocomplete
                            label="Categoria financeira deste título"
                            value={pagamento.categoria_financeira_id || form.categoria_financeira_id || ''}
                            options={categoriasFiltradas}
                            onChange={(categoriaId) => updatePagamento(pagamentoIndex, {
                              categoria_financeira_id: categoriaId
                            })}
                            helperText="A categoria deste titulo sera aplicada a todas as parcelas geradas nele."
                          />
                        )}

                        <FormSecao colunas={2}>
                          <CampoForm label="Forma de pagamento" obrigatorio>
                            <select
                              className="input w-full"
                              value={pagamento.forma_pagamento_id}
                              onChange={(event) => updateFormaPagamento(pagamentoIndex, event.target.value)}
                            >
                              <option value="">Não informar</option>
                              {formasPagamento.filter((item) => item.ativo !== false).map((item) => (
                                <option key={item.id} value={item.id}>{item.nome}</option>
                              ))}
                            </select>
                          </CampoForm>

                          <CampoForm
                            label="Valor desta forma"
                            obrigatorio={!usaDetalhe}
                            hint={usaDetalhe ? 'Somado a partir das parcelas informadas abaixo.' : undefined}
                          >
                            {usaDetalhe ? (
                              <div className="valor-tabular input-moeda flex min-h-12 items-center justify-end rounded-lg border border-[var(--c-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-sm text-[var(--c-muted)]">
                                {pagamento.valor || 'R$ 0,00'}
                              </div>
                            ) : (
                              <input
                                className="input input-moeda w-full"
                                type="text"
                                inputMode="decimal"
                                placeholder="R$ 0,00"
                                value={pagamento.valor}
                                onChange={(event) => updateValorPagamento(pagamentoIndex, normalizeCurrencyTyping(event.target.value))}
                                onBlur={(event) => updateValorPagamento(pagamentoIndex, formatCurrencyInput(event.target.value))}
                              />
                            )}
                          </CampoForm>

                          {formaPermiteParcelamentoOperacional(forma) ? (
                            <CampoForm label="Parcelas">
                              <input
                                className="input w-full"
                                type="number"
                                min="1"
                                max="120"
                                value={pagamento.quantidade_parcelas}
                                onChange={(event) => updateQuantidadeParcelas(pagamentoIndex, event.target.value)}
                              />
                            </CampoForm>
                          ) : (
                            <CampoForm label="Parcelas" hint="Esta forma de pagamento nao parcela.">
                              <div className="flex min-h-12 items-center rounded-lg border border-[var(--c-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-sm text-[var(--c-muted)]">1 parcela</div>
                            </CampoForm>
                          )}

                          {usaCartao ? (
                            <CampoForm label="Data da compra">
                              <DateInputBR
                                className="input w-full"
                                value={pagamento.data_compra}
                                onChange={(event) => updatePagamento(pagamentoIndex, { data_compra: event.target.value })}
                              />
                            </CampoForm>
                          ) : usaDetalhe ? (
                            <CampoForm label="Vencimento" hint="Cada parcela tem o seu, informado abaixo.">
                              <div className="flex min-h-12 items-center rounded-lg border border-[var(--c-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-sm text-[var(--c-muted)]">Definido nas parcelas</div>
                            </CampoForm>
                          ) : (
                            <CampoForm label="Vencimento" obrigatorio>
                              <DateInputBR
                                className="input w-full"
                                value={pagamento.data_vencimento}
                                onChange={(event) => updatePagamento(pagamentoIndex, { data_vencimento: event.target.value })}
                                required
                              />
                            </CampoForm>
                          )}

                          {forma?.exige_cartao && (
                            <CampoForm
                              label="Cartão"
                              span={2}
                              hint="A conta vinculada ao cartao define a empresa da movimentacao bancaria."
                            >
                              <select
                                className="input w-full"
                                value={pagamento.cartao_id || ''}
                                onChange={(event) => updatePagamento(pagamentoIndex, { cartao_id: event.target.value })}
                              >
                                <option value="">Selecione o cartão</option>
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
                            </CampoForm>
                          )}
                        </FormSecao>

                        {forma?.exige_cartao && cartaoSelecionado && (
                          <div
                            className={`rounded-lg border px-3 py-2 text-xs ${
                              cartaoEntreEmpresas
                                ? 'border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]'
                                : 'border-[var(--sem-success-border)] bg-[var(--sem-success-bg)] text-[var(--sem-success)]'
                            }`}
                          >
                            {cartaoEntreEmpresas
                              ? form.tipo === 'RECEBER'
                                ? `Entre empresas automatico: ${nomeEmpresaTitulo || 'empresa do titulo'} recebe por conta de ${nomeEmpresaCartao || 'empresa do cartao'}. O titulo e a classificacao gerencial permanecem na empresa da obra.`
                                : `Entre empresas automatico: ${nomeEmpresaCartao || 'empresa do cartao'} paga titulo de ${nomeEmpresaTitulo || 'empresa da obra'}. O titulo e a classificacao gerencial permanecem na empresa da obra.`
                              : `Movimentacao na mesma empresa do titulo: ${nomeEmpresaTitulo || nomeEmpresaCartao || 'empresa da obra'}.`}
                          </div>
                        )}

                        {usaDetalhe && (
                          <div className="space-y-3">
                            <div className="text-xs text-[var(--c-muted)]">
                              Informe vencimento e valor de cada {getLabelParcelaForma(forma)}. A soma das parcelas forma o valor desta forma de pagamento.
                            </div>
                            {(pagamento.parcelas || []).map((parcela, parcelaIndex) => (
                              <div key={parcelaIndex} className="rounded-2xl border border-[var(--c-border)] bg-[var(--ui-surface-2)] p-3">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">
                                  Parcela {parcelaIndex + 1}/{quantidade}
                                </div>
                                <FormSecao colunas={2}>
                                  <CampoForm label="Valor" obrigatorio>
                                    <input
                                      className="input input-moeda w-full"
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="R$ 0,00"
                                      value={parcela.valor || ''}
                                      onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'valor', normalizeCurrencyTyping(event.target.value))}
                                      onBlur={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'valor', formatCurrencyInput(event.target.value))}
                                      required
                                    />
                                  </CampoForm>
                                  <CampoForm label="Vencimento" obrigatorio>
                                    <DateInputBR
                                      className="input w-full"
                                      value={parcela.data_vencimento || ''}
                                      onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'data_vencimento', event.target.value)}
                                      required
                                    />
                                  </CampoForm>

                                  {formaAceitaDadosBoletoOuGuia(forma) && (
                                    <>
                                      <CampoForm label="Documento ou referência" span={2}>
                                        <input
                                          className="input w-full"
                                          value={parcela.numero_documento || ''}
                                          onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'numero_documento', event.target.value)}
                                          placeholder={isFormaOutros(forma) ? 'Referencia da guia ou pagamento' : 'Nosso numero ou referencia'}
                                        />
                                      </CampoForm>
                                      <CampoForm label="Código do banco">
                                        <input
                                          className="input w-full"
                                          inputMode="numeric"
                                          maxLength={8}
                                          pattern="[0-9]*"
                                          value={parcela.banco_cobranca || ''}
                                          onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'banco_cobranca', normalizeCodigoBancoInput(event.target.value))}
                                          placeholder="Ex.: 001, 104, 237"
                                        />
                                      </CampoForm>
                                      <CampoForm label="Linha digitável">
                                        <input
                                          className="input w-full"
                                          value={parcela.linha_digitavel || ''}
                                          onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'linha_digitavel', event.target.value)}
                                          placeholder="Linha digitável, se houver"
                                        />
                                      </CampoForm>
                                      <CampoForm label="Código de barras" span={2}>
                                        <input
                                          className="input w-full"
                                          value={parcela.codigo_barras || ''}
                                          onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'codigo_barras', event.target.value)}
                                          placeholder="Código de barras, se houver"
                                        />
                                      </CampoForm>
                                    </>
                                  )}
                                </FormSecao>

                                {isFormaCheque(forma) && (
                                  <div className="mt-3 rounded-xl border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-3 py-2 text-xs text-[var(--sem-warning)]">
                                    Os dados do cheque serão informados na baixa, quando o instrumento real for definido.
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </BlocoConteudo>

              {form.tipo === 'RECEBER' && (
                <BlocoConteudo
                  titulo="Cobrança bancária"
                  variante="secundario"
                  descricao="Opcional. Preencha quando a cobrança deste recebimento for controlada por boleto, pix ou outro instrumento emitido."
                  recolhivel
                  recolhidoPadrao={!form.forma_cobranca}
                >
                  <FormSecao colunas={3}>
                    <CampoForm label="Forma de cobrança">
                      <select
                        className="input w-full"
                        value={form.forma_cobranca}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          forma_cobranca: event.target.value,
                          status_cobranca: event.target.value ? (current.status_cobranca || 'PENDENTE_EMISSAO') : 'PENDENTE_EMISSAO'
                        }))}
                      >
                        <option value="">Não controlar</option>
                        {FORMAS_COBRANCA.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </CampoForm>

                    <CampoForm
                      label="Status da cobrança"
                      hint={form.forma_cobranca ? undefined : 'Escolha uma forma de cobranca para liberar este campo.'}
                    >
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
                    </CampoForm>

                    <CampoForm label="Código do banco da cobrança">
                      <input
                        className="input w-full"
                        inputMode="numeric"
                        maxLength={8}
                        pattern="[0-9]*"
                        placeholder="Ex.: 001, 104, 237"
                        value={form.banco_cobranca}
                        onChange={(event) => updateField('banco_cobranca', normalizeCodigoBancoInput(event.target.value))}
                      />
                    </CampoForm>

                    <CampoForm label="Emitido em">
                      <DateInputBR
                        className="input w-full"
                        value={form.boleto_emitido_em}
                        onChange={(event) => updateField('boleto_emitido_em', event.target.value)}
                      />
                    </CampoForm>

                    <CampoForm label="Nosso número">
                      <input
                        className="input w-full"
                        value={form.nosso_numero}
                        onChange={(event) => updateField('nosso_numero', event.target.value)}
                      />
                    </CampoForm>

                    <CampoForm label="Identificador externo">
                      <input
                        className="input w-full"
                        placeholder="ID da cobrança no banco"
                        value={form.identificador_externo}
                        onChange={(event) => updateField('identificador_externo', event.target.value)}
                      />
                    </CampoForm>

                    <CampoForm label="Linha digitável" span={2}>
                      <input
                        className="input w-full"
                        value={form.linha_digitavel}
                        onChange={(event) => updateField('linha_digitavel', event.target.value)}
                      />
                    </CampoForm>

                    <CampoForm label="Código de barras" span={2}>
                      <input
                        className="input w-full"
                        value={form.codigo_barras}
                        onChange={(event) => updateField('codigo_barras', event.target.value)}
                      />
                    </CampoForm>
                  </FormSecao>
                </BlocoConteudo>
              )}

              <BlocoConteudo
                titulo="Movimentação entre empresas do grupo"
                variante="secundario"
                descricao="Opcional. Use nas formas sem cartão — para cartões, a conta vinculada já define as empresas envolvidas."
                recolhivel
                recolhidoPadrao={!form.intercompany}
              >
                <div className="space-y-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={Boolean(form.intercompany)}
                      onChange={(event) => updateField('intercompany', event.target.checked)}
                    />
                    <span className="grid gap-1">
                      <span className="font-medium">Este título e uma movimentação entre empresas do grupo</span>
                      <span className="app-note">
                        Ao marcar, informe empresa origem, empresa destino e o tipo da movimentação.
                      </span>
                    </span>
                  </label>

                  <FormSecao colunas={3}>
                    <CampoForm label="Empresa origem" obrigatorio={Boolean(form.intercompany)}>
                      <select
                        className="input w-full"
                        value={form.empresa_origem_id}
                        onChange={(event) => updateField('empresa_origem_id', event.target.value)}
                        disabled={!form.intercompany}
                      >
                        <option value="">Selecione a empresa origem</option>
                        {empresasGrupo
                          .filter(empresaIntercompanySelecionavel)
                          .map((empresa) => (
                            <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                          ))}
                      </select>
                    </CampoForm>

                    <CampoForm label="Empresa destino" obrigatorio={Boolean(form.intercompany)}>
                      <select
                        className="input w-full"
                        value={form.empresa_destino_id}
                        onChange={(event) => updateField('empresa_destino_id', event.target.value)}
                        disabled={!form.intercompany}
                      >
                        <option value="">Selecione a empresa destino</option>
                        {empresasGrupo
                          .filter((empresa) => (
                            empresaIntercompanySelecionavel(empresa)
                            && String(empresa.id) !== String(form.empresa_origem_id)
                          ))
                          .map((empresa) => (
                            <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                          ))}
                      </select>
                    </CampoForm>

                    <CampoForm label="Tipo da movimentação" obrigatorio={Boolean(form.intercompany)}>
                      <select
                        className="input w-full"
                        value={form.tipo_intercompany}
                        onChange={(event) => updateField('tipo_intercompany', event.target.value)}
                        disabled={!form.intercompany}
                      >
                        <option value="">Selecione o tipo</option>
                        {TIPOS_INTERCOMPANY.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </CampoForm>

                    <CampoForm label="Grupo da movimentação" hint="Opcional. Amarra varias movimentacoes na mesma operacao.">
                      <input
                        className="input w-full"
                        value={form.intercompany_group_id}
                        onChange={(event) => updateField('intercompany_group_id', event.target.value)}
                        disabled={!form.intercompany}
                        placeholder="Identificador do grupo, se houver"
                      />
                    </CampoForm>

                    <CampoForm label="Motivo" span={2}>
                      <input
                        className="input w-full"
                        value={form.motivo_intercompany}
                        onChange={(event) => updateField('motivo_intercompany', event.target.value)}
                        disabled={!form.intercompany}
                        placeholder="Por que a movimentação aconteceu"
                      />
                    </CampoForm>
                  </FormSecao>
                </div>
              </BlocoConteudo>

              <BlocoConteudo
                titulo="Rateio por obra/centro de custo"
                variante="secundario"
                descricao="Opcional. Use quando o mesmo título precisa compor mais de uma obra no financeiro de obras."
                contagem={(form.rateios || []).length === 0
                  ? 'Sem rateio'
                  : `${formatCurrency(totalRateioValor)} · ${totalRateioPercentual.toFixed(2)}%`}
                recolhivel
                recolhidoPadrao={(form.rateios || []).length === 0}
              >
                <div className="space-y-3">
                  {(form.rateios || []).length > 0 && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        Math.abs(totalRateioValor - valorTitulo) <= 0.02 && Math.abs(totalRateioPercentual - 100) <= 0.02
                          ? 'border-[var(--sem-success-border)] bg-[var(--sem-success-bg)] text-[var(--sem-success)]'
                          : 'border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]'
                      }`}
                    >
                      Rateado: <span className="valor-tabular font-semibold">{formatCurrency(totalRateioValor)}</span>{' '}
                      ({totalRateioPercentual.toFixed(2)}%) de {formatCurrency(valorTitulo)} (100%).
                      {' '}
                      {Math.abs(totalRateioValor - valorTitulo) <= 0.02 && Math.abs(totalRateioPercentual - 100) <= 0.02
                        ? 'O rateio fecha o titulo.'
                        : 'Ajuste as linhas ate fechar 100%, ou remova todas para lancar o titulo em uma obra so.'}
                    </div>
                  )}

                  <div className="app-actionbar">
                    <button type="button" className="btn btn-outline" onClick={adicionarRateio}>
                      Adicionar rateio
                    </button>
                  </div>

                  {(form.rateios || []).map((rateio, rateioIndex) => (
                    <div key={rateio.id || rateioIndex} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                      <FormSecao colunas={3}>
                        <CampoForm label="Obra/centro de custo" obrigatorio span={2}>
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
                        </CampoForm>

                        <CampoForm label="Tipo do rateio">
                          <select
                            className="input w-full"
                            value={rateio.tipo_rateio}
                            onChange={(event) => updateRateio(rateioIndex, 'tipo_rateio', event.target.value)}
                          >
                            <option value="PERCENTUAL">Percentual</option>
                            <option value="VALOR">Valor</option>
                          </select>
                        </CampoForm>

                        {rateio.tipo_rateio === 'VALOR' ? (
                          <CampoForm label="Valor do rateio" obrigatorio>
                            <input
                              className="input input-moeda w-full"
                              inputMode="decimal"
                              placeholder="R$ 0,00"
                              value={rateio.valor_rateio}
                              onChange={(event) => updateRateio(rateioIndex, 'valor_rateio', normalizeCurrencyTyping(event.target.value))}
                              onBlur={(event) => updateRateio(rateioIndex, 'valor_rateio', formatCurrencyInput(event.target.value))}
                            />
                          </CampoForm>
                        ) : (
                          <CampoForm label="Percentual do rateio" obrigatorio>
                            <input
                              className="input valor-tabular w-full"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={rateio.percentual}
                              onChange={(event) => updateRateio(rateioIndex, 'percentual', event.target.value)}
                            />
                          </CampoForm>
                        )}

                        <CampoForm label="Observações do rateio">
                          <input
                            className="input w-full"
                            placeholder="Opcional"
                            value={rateio.observacoes}
                            onChange={(event) => updateRateio(rateioIndex, 'observacoes', event.target.value)}
                          />
                        </CampoForm>
                      </FormSecao>

                      {/* C5 — a ação destrutiva fica APARTADA das demais. */}
                      <div className="app-actionbar">
                        <span className="app-actionbar-apartada">
                          <button
                            type="button"
                            className="btn btn-outline btn-perigo-suave"
                            onClick={() => removerRateio(rateioIndex)}
                          >
                            Remover rateio {rateioIndex + 1}
                          </button>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </BlocoConteudo>

              <BlocoConteudo
                titulo="Impostos, retenções e descontos"
                variante="secundario"
                descricao="Opcional. Registre os valores que explicam a diferença entre o bruto e o líquido do título."
                contagem={`Líquido previsto: ${formatCurrency(valorLiquidoPrevisto)}`}
                recolhivel
                recolhidoPadrao={(form.impostos || []).length === 0}
              >
                <div className="space-y-3">
                  <div className="app-actionbar">
                    <button type="button" className="btn btn-outline" onClick={adicionarImposto}>
                      Adicionar imposto
                    </button>
                  </div>

                  {(form.impostos || []).map((imposto, impostoIndex) => (
                    <div key={imposto.id || impostoIndex} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                      <FormSecao colunas={3}>
                        <CampoForm label="Natureza">
                          <select
                            className="input w-full"
                            value={imposto.natureza}
                            onChange={(event) => updateImposto(impostoIndex, 'natureza', event.target.value)}
                          >
                            <option value="RETENCAO">Retenção/desconto</option>
                            <option value="ACRESCIMO">Acréscimo</option>
                          </select>
                        </CampoForm>

                        <CampoForm label="Tipo" obrigatorio span={2}>
                          <input
                            className="input w-full"
                            placeholder="ISS, INSS, IRRF, desconto..."
                            value={imposto.tipo_imposto}
                            onChange={(event) => updateImposto(impostoIndex, 'tipo_imposto', event.target.value)}
                          />
                        </CampoForm>

                        <CampoForm label="Base de cálculo">
                          <input
                            className="input input-moeda w-full"
                            inputMode="decimal"
                            placeholder="R$ 0,00"
                            value={imposto.base_calculo}
                            onChange={(event) => updateImposto(impostoIndex, 'base_calculo', normalizeCurrencyTyping(event.target.value))}
                            onBlur={(event) => updateImposto(impostoIndex, 'base_calculo', formatCurrencyInput(event.target.value))}
                          />
                        </CampoForm>

                        <CampoForm label="Aliquota %" hint="Com base e aliquota preenchidas o valor e calculado sozinho.">
                          <input
                            className="input valor-tabular w-full"
                            inputMode="decimal"
                            placeholder="0,00"
                            value={imposto.aliquota}
                            onChange={(event) => updateImposto(impostoIndex, 'aliquota', event.target.value)}
                          />
                        </CampoForm>

                        <CampoForm label="Valor" obrigatorio>
                          <input
                            className="input input-moeda w-full"
                            inputMode="decimal"
                            placeholder="R$ 0,00"
                            value={imposto.valor}
                            onChange={(event) => updateImposto(impostoIndex, 'valor', normalizeCurrencyTyping(event.target.value))}
                            onBlur={(event) => updateImposto(impostoIndex, 'valor', formatCurrencyInput(event.target.value))}
                          />
                        </CampoForm>
                      </FormSecao>

                      {/* C5 — a ação destrutiva fica APARTADA das demais. */}
                      <div className="app-actionbar">
                        <span className="app-actionbar-apartada">
                          <button
                            type="button"
                            className="btn btn-outline btn-perigo-suave"
                            onClick={() => removerImposto(impostoIndex)}
                          >
                            Remover imposto {impostoIndex + 1}
                          </button>
                        </span>
                      </div>
                    </div>
                  ))}

                  {(form.impostos || []).length > 0 && (
                    <div className="text-xs text-[var(--c-muted)]">
                      Retencoes/descontos: <span className="valor-tabular">{formatCurrency(totalImpostosRetencao + descontoFinanceiro)}</span>.
                      {' '}Acrescimos: <span className="valor-tabular">{formatCurrency(totalImpostosAcrescimo)}</span>.
                    </div>
                  )}
                </div>
              </BlocoConteudo>

              {form.tipo === 'PAGAR' && (
                <BlocoConteudo
                  titulo="Dados para pagamento do credor"
                  variante="secundario"
                  descricao="Opcional. Preencha para deixar o credor pronto para lotes PIX por chave."
                >
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={paymentDraft.preparar_pagamento_pix}
                        onChange={(event) => setPaymentDraft((current) => ({ ...current, preparar_pagamento_pix: event.target.checked }))}
                      />
                      <span className="grid gap-1">
                        <span className="font-medium">Preparar PIX para este credor</span>
                        <span className="app-note">
                          O favorecido vinculado e o cadastro bancário rastreado usado no lote PIX. Pode ser o próprio credor do título ou um favorecido separado, com snapshot travado quando o lote for criado.
                        </span>
                      </span>
                    </label>

                    {paymentDraft.preparar_pagamento_pix && (
                      <FormSecao colunas={3}>
                        <div className="form-group form-campo--linha">
                          <label className="flex items-start gap-3 text-sm">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={paymentDraft.usar_credor_como_favorecido}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setPaymentDraft((current) => ({ ...current, usar_credor_como_favorecido: checked }));
                                if (checked && parceiroSelecionado) preencherFavorecidoComParceiro(parceiroSelecionado);
                              }}
                              disabled={!parceiroSelecionado}
                            />
                            <span className="grid gap-1">
                              <span className="font-medium">Usar o mesmo credor como favorecido</span>
                              <span className="app-note">
                                {parceiroSelecionado
                                  ? 'Preenche nome, CPF/CNPJ e a primeira chave PIX cadastrada no credor.'
                                  : 'Escolha primeiro o credor do titulo para poder usar os dados dele aqui.'}
                              </span>
                            </span>
                          </label>
                        </div>

                        <CampoForm
                          label="Favorecido bancário vinculado"
                          span={2}
                          hint="Se nao houver favorecido salvo, use o proprio credor ou informe os dados abaixo."
                        >
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
                        </CampoForm>

                        {paymentDraft.usar_credor_como_favorecido && parceiroPixOptions.length > 1 && (
                          <CampoForm label="Chave PIX do credor">
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
                          </CampoForm>
                        )}

                        <CampoForm label="Nome do favorecido" obrigatorio span={2}>
                          <input
                            className="input w-full"
                            value={paymentDraft.nome}
                            onChange={(event) => setPaymentDraft((current) => ({ ...current, nome: event.target.value }))}
                            required={paymentDraft.preparar_pagamento_pix}
                          />
                        </CampoForm>

                        <CampoForm label="CPF/CNPJ do favorecido" obrigatorio>
                          <input
                            className="input w-full"
                            value={maskCpfCnpj(paymentDraft.cpf_cnpj)}
                            onChange={(event) => setPaymentDraft((current) => ({ ...current, cpf_cnpj: maskCpfCnpj(event.target.value) }))}
                            inputMode="numeric"
                            maxLength={18}
                            required={paymentDraft.preparar_pagamento_pix}
                          />
                        </CampoForm>

                        <CampoForm label="Tipo da chave PIX" obrigatorio>
                          <select
                            className="input w-full"
                            value={paymentDraft.pix_tipo_chave}
                            onChange={(event) => setPaymentDraft((current) => ({ ...current, pix_tipo_chave: event.target.value }))}
                          >
                            {PIX_TIPOS_CHAVE.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                          </select>
                        </CampoForm>

                        <CampoForm label="Chave PIX" obrigatorio span={2}>
                          <input
                            className="input w-full"
                            value={paymentDraft.pix_chave}
                            onChange={(event) => setPaymentDraft((current) => ({ ...current, pix_chave: event.target.value }))}
                            required={paymentDraft.preparar_pagamento_pix}
                          />
                        </CampoForm>

                        <CampoForm
                          label="Conta pagadora BB"
                          span={2}
                          hint="Cadastre em Cadastros Financeiros > Contas pagadoras BB. Cada conta pode ter empresa, CNPJ e convenio proprios."
                        >
                          <select
                            className="input w-full"
                            value={paymentDraft.payment_account_id}
                            onChange={(event) => setPaymentDraft((current) => ({ ...current, payment_account_id: event.target.value }))}
                          >
                            <option value="">Selecione a conta</option>
                            {paymentAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.contaBancaria?.nome || `Conta ${account.id}`} - CNPJ {account.cnpj_pagador} - Conv. {account.convenio || '-'}
                              </option>
                            ))}
                          </select>
                        </CampoForm>

                        <CampoForm label="Data de pagamento">
                          <DateInputBR
                            className="input w-full"
                            value={paymentDraft.data_pagamento || form.data_vencimento}
                            onChange={(event) => setPaymentDraft((current) => ({ ...current, data_pagamento: event.target.value }))}
                          />
                        </CampoForm>

                        <div className="form-group form-campo--linha">
                          <span className="app-note">
                            O título guarda o parceiro como origem. O lote futuro cria snapshot imutavel do favorecido, valor e conta pagadora.
                          </span>
                        </div>
                      </FormSecao>
                    )}
                  </div>
                </BlocoConteudo>
              )}

              {/* B3 — sem legenda aqui: o rótulo do campo já nomeia a seção,
                  e repetir "Observações" duas vezes é a mesma informação
                  aparecendo duas vezes na tela. */}
              <FormSecao>
                <CampoForm label="Observações" tipo="observacao">
                  <textarea
                    className="input w-full"
                    placeholder="Informações adicionais para a operação financeira"
                    value={form.observacoes}
                    onChange={(event) => updateField('observacoes', event.target.value)}
                  />
                </CampoForm>
              </FormSecao>

              {/* C5 — um primário sólido, secundário em contorno. */}
              <div className="app-actionbar">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : (form.tipo === 'RECEBER' ? 'Criar conta a receber' : 'Criar conta a pagar')}
                </button>
                {/*
                  CANCELAR VOLTA PELO HISTÓRICO (decisão do cliente, 04/09).

                  Era um link (react-router) para uma rota fixa, e a C6 acusava com
                  razão: navegação vestida de ação na barra de ações.

                  O motivo da decisão é mais forte que a regra de forma:
                  cancelar é DESFAZER A INTENÇÃO de quem chegou aqui, e
                  voltar pelo histórico devolve a pessoa de onde ela veio,
                  seja qual for o caminho. Link fixo manda todo mundo para o
                  mesmo lugar — inclusive quem chegou por outro: de uma
                  busca, de um título vizinho, de um relatório.

                  `navigate(-1)` sem histórico não faz nada (aba nova, URL
                  digitada), então o destino declarado sobrevive como
                  fallback — nunca como primeira escolha.
                */}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    if (window.history.length > 1) navigate(-1);
                    else navigate(tituloListPath);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </BlocoConteudo>
        </form>
      )}

      {/*
        R9 — escolha de categoria é uso esporádico e abre em MODAL, agora no
        `OverlayModal` do sistema (portal fora do `.layout-main`, trava de
        rolagem, Escape e devolução de foco) no lugar do `fixed inset-0`
        montado à mão, que não tinha nenhum dos quatro.
      */}
      {categoriaModalOpen && (
        <OverlayModal
          rotulo="Selecionar categoria financeira"
          onFechar={() => setCategoriaModalOpen(false)}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="app-bloco-titulo">Selecionar categoria financeira</h2>
                <p className="text-xs text-[var(--c-muted)]">
                  Todas as categorias compativeis com o tipo do título. Filtre por ID, nome, grupo, subgrupo ou descrição.
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

            <input
              className="input app-busca w-full"
              placeholder="Filtrar por ID, nome, grupo, subgrupo ou descrição"
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
                  Nenhuma categoria encontrada para esse filtro. Apague parte do texto para ver a lista inteira.
                </div>
              ) : categoriasModalFiltradas.map((categoria) => (
                <button
                  key={categoria.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    String(form.categoria_financeira_id) === String(categoria.id)
                      ? 'border-[var(--sem-info-border)] bg-[var(--sem-info-bg)]'
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
        </OverlayModal>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
