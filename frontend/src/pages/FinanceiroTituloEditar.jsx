import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getMinhasObras } from '../services/obras';
import { buscarParceiros } from '../services/parceiros';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import {
  atualizarPaymentBeneficiary,
  atualizarTituloFinanceiro,
  criarPaymentBeneficiary,
  getCategoriasFinanceiras,
  getPaymentBeneficiaries,
  getTituloFinanceiroById
} from '../services/financeiro';
import { listarApropriacoes } from '../services/apropriacoes';
import { formatCurrencyInput, normalizeCurrencyTyping } from '../utils/formatters';
import {
  categoriaFinanceiraMatchesAutocomplete,
  categoriaFinanceiraMatchesSearch
} from '../utils/categoriaFinanceira';
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

function toCurrencyNumber(value) {
  if (value == null || value === '') return 0;
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  const parsed = Number(value || 0);
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100) / 100;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function calcularValorImposto(imposto) {
  const base = toCurrencyNumber(imposto?.base_calculo);
  const aliquota = toCurrencyNumber(imposto?.aliquota);
  if (base <= 0 || aliquota <= 0) return '';
  return formatCurrencyInput(roundCurrency((base * aliquota) / 100));
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

function isDescontoImposto(imposto) {
  const tipo = normalizarBusca(imposto?.tipo_imposto || imposto?.tipo || '');
  const descricao = normalizarBusca(imposto?.descricao || '');
  return tipo === 'desconto' || descricao === 'desconto' || descricao.includes('desconto concedido');
}

function getEmpresaObraId(obra) {
  return obra?.empresa_grupo_id ? String(obra.empresa_grupo_id) : '';
}

function empresaIntercompanySelecionavel(empresa) {
  return empresa?.ativo !== false && String(empresa?.tipo_empresa || 'OPERACIONAL').toUpperCase() !== 'HOLDING';
}

function normalizarBusca(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parceiroMatchesSearch(parceiro, termo) {
  const search = normalizarBusca(termo);
  if (!search) return true;

  const haystack = normalizarBusca([
    parceiro?.nome,
    parceiro?.razao_social,
    parceiro?.nome_fantasia,
    parceiro?.cpf_cnpj
  ].filter(Boolean).join(' '));

  return haystack.includes(search);
}

function getCategoriaDreResumo(categoria) {
  if (!categoria) return 'Sem categoria financeira';
  if (categoria.considera_dre === false) return 'Categoria fora da DRE';
  const grupo = categoria.dre_grupo || 'Grupo DRE nao classificado';
  const subgrupo = categoria.dre_subgrupo ? ` / ${categoria.dre_subgrupo}` : '';
  return `${grupo}${subgrupo}`;
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

function getTituloBloqueado(titulo) {
  const status = String(titulo?.status || '').toUpperCase();
  const valorBaixado = Number(titulo?.valor_baixado || 0);
  const movimentosAtivos = Array.isArray(titulo?.movimentos)
    ? titulo.movimentos.filter((item) => String(item.status || '').toUpperCase() === 'ATIVO')
    : [];
  const pagamentosAtivos = Array.isArray(titulo?.paymentIntents)
    ? titulo.paymentIntents.filter((item) => !['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO'].includes(String(item.status || '').toUpperCase()))
    : [];

  if (!['PREVISAO', 'ABERTO'].includes(status)) return 'Somente titulos em aberto ou previsao podem ser editados.';
  if (valorBaixado > 0 || movimentosAtivos.length > 0) return 'Este titulo ja possui baixa. Estorne a baixa antes de corrigir o lancamento.';
  if (pagamentosAtivos.length > 0) return 'Este titulo possui pagamento em massa vinculado. Cancele ou rejeite o pagamento antes de editar.';
  return '';
}

function categoriaCompativel(categoria, tipoTitulo) {
  if (!categoria || categoria.ativo === false) {
    return false;
  }

  const tipoCategoria = String(categoria?.tipo || '').trim().toUpperCase();
  const tipo = String(tipoTitulo || '').trim().toUpperCase();
  return !tipoCategoria || tipoCategoria === tipo || tipoCategoria === 'AMBOS';
}

function buildFormFromTitulo(titulo) {
  const impostosTitulo = Array.isArray(titulo?.impostos) ? titulo.impostos : [];
  const descontoFinanceiro = roundCurrency(impostosTitulo
    .filter((imposto) => isDescontoImposto(imposto))
    .reduce((acc, imposto) => acc + toCurrencyNumber(imposto.valor), 0));

  return {
    tipo: String(titulo?.tipo || 'PAGAR').toUpperCase() === 'RECEBER' ? 'RECEBER' : 'PAGAR',
    status: ['PREVISAO', 'ABERTO'].includes(String(titulo?.status || '').toUpperCase())
      ? String(titulo.status).toUpperCase()
      : 'ABERTO',
    empresa_id: String(titulo?.empresa_id || ''),
    obra_id: String(titulo?.obra_id || ''),
    apropriacao_id: String(titulo?.apropriacao_id || ''),
    parceiro_id: String(titulo?.parceiro_id || ''),
    categoria_financeira_id: String(titulo?.categoria_financeira_id || ''),
    descricao: titulo?.descricao || '',
    numero_documento: titulo?.numero_documento || '',
    valor: formatCurrencyInput(titulo?.valor_bruto ?? titulo?.valor_original),
    desconto_financeiro: descontoFinanceiro > 0 ? formatCurrencyInput(descontoFinanceiro) : '',
    data_emissao: titulo?.data_emissao || today(),
    data_vencimento: titulo?.data_vencimento || today(),
    competencia_data: titulo?.competencia_data || today(),
    considera_dre: titulo?.considera_dre !== false,
    observacoes: titulo?.observacoes || '',
    forma_cobranca: titulo?.forma_cobranca || '',
    status_cobranca: titulo?.status_cobranca && titulo.status_cobranca !== 'NAO_APLICAVEL'
      ? titulo.status_cobranca
      : 'PENDENTE_EMISSAO',
    banco_cobranca: titulo?.banco_cobranca || '',
    nosso_numero: titulo?.nosso_numero || '',
    linha_digitavel: titulo?.linha_digitavel || '',
    codigo_barras: titulo?.codigo_barras || '',
    identificador_externo: titulo?.identificador_externo || '',
    boleto_emitido_em: titulo?.boleto_emitido_em || '',
    intercompany: Boolean(titulo?.intercompany || titulo?.intercompany_group_id || titulo?.tipo_intercompany),
    empresa_contraparte_id: String(titulo?.empresa_contraparte_id || ''),
    intercompany_group_id: titulo?.intercompany_group_id || '',
    empresa_origem_id: String(titulo?.empresa_origem_id || ''),
    empresa_destino_id: String(titulo?.empresa_destino_id || ''),
    tipo_intercompany: titulo?.tipo_intercompany || '',
    motivo_intercompany: titulo?.motivo_intercompany || '',
    elimina_consolidado: titulo?.elimina_consolidado !== false,
    transferencia_interna: titulo?.transferencia_interna !== false,
    rateios: Array.isArray(titulo?.rateios)
      ? titulo.rateios.map((rateio) => ({
        id: rateio.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        obra_id: String(rateio.obra_id || ''),
        tipo_rateio: rateio.tipo_rateio || 'PERCENTUAL',
        percentual: rateio.percentual != null ? String(rateio.percentual).replace('.', ',') : '',
        valor_rateio: rateio.valor_rateio != null ? formatCurrencyInput(rateio.valor_rateio) : '',
        observacoes: rateio.observacoes || ''
      }))
      : [],
    impostos: impostosTitulo
      .filter((imposto) => !isDescontoImposto(imposto))
      .map((imposto) => ({
        id: imposto.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        tipo_imposto: imposto.tipo_imposto || '',
        descricao: imposto.descricao || '',
        natureza: imposto.natureza || 'RETENCAO',
        base_calculo: imposto.base_calculo != null ? formatCurrencyInput(imposto.base_calculo) : '',
        aliquota: imposto.aliquota != null ? String(imposto.aliquota).replace('.', ',') : '',
        valor: imposto.valor != null ? formatCurrencyInput(imposto.valor) : '',
        observacoes: imposto.observacoes || ''
      }))
  };
}

export default function FinanceiroTituloEditar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState(null);
  const [form, setForm] = useState(null);
  const [obras, setObras] = useState([]);
  const [empresasGrupo, setEmpresasGrupo] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [apropriacoes, setApropriacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parceiroBusca, setParceiroBusca] = useState('');
  const [categoriaBusca, setCategoriaBusca] = useState('');
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [categoriaModalBusca, setCategoriaModalBusca] = useState('');
  const [parceiroModalOpen, setParceiroModalOpen] = useState(false);
  const [parceiroModalNomeBusca, setParceiroModalNomeBusca] = useState('');
  const [parceiroModalDocumentoBusca, setParceiroModalDocumentoBusca] = useState('');
  const [parceiroModalResultados, setParceiroModalResultados] = useState([]);
  const [loadingParceiroModal, setLoadingParceiroModal] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [paymentDraft, setPaymentDraft] = useState({
    preparar_pagamento_pix: false,
    usar_credor_como_favorecido: false,
    payment_beneficiary_id: '',
    nome: '',
    cpf_cnpj: '',
    pix_tipo_chave: 'CNPJ',
    pix_chave: ''
  });

  useEffect(() => {
    let active = true;

    async function carregar() {
      try {
        setLoading(true);
        setError('');
        const [tituloData, obrasData, categoriasData, empresasData] = await Promise.all([
          getTituloFinanceiroById(id),
          getMinhasObras({ modo: 'FINANCEIRO', escopo: 'TODOS' }),
          getCategoriasFinanceiras(),
          getEmpresasGrupo({ ativo: 1 })
        ]);

        if (!active) return;

        const formBase = buildFormFromTitulo(tituloData);
        setTitulo(tituloData);
        setForm(formBase);
        setObras(Array.isArray(obrasData) ? obrasData : []);
        setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
        setEmpresasGrupo(Array.isArray(empresasData) ? empresasData : []);
        setParceiroBusca(tituloData?.parceiro?.nome || '');
        setCategoriaBusca(tituloData?.categoriaFinanceira?.nome || '');
      } catch (err) {
        if (active) setError(err?.message || 'Erro ao carregar titulo financeiro');
      } finally {
        if (active) setLoading(false);
      }
    }

    carregar();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!form?.obra_id) {
      setApropriacoes([]);
      return undefined;
    }

    let active = true;
    listarApropriacoes({ obra_id: form.obra_id })
      .then((data) => {
        if (!active) return;
        setApropriacoes(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setApropriacoes([]);
      });

    return () => {
      active = false;
    };
  }, [form?.obra_id]);

  useEffect(() => {
    if (!form) return undefined;

    let active = true;
    const params = {
      ativo: 1,
      limit: 200,
      q: parceiroBusca.trim()
    };
    if (form.tipo === 'RECEBER') {
      params.cliente = 1;
    }

    buscarParceiros(params)
      .then((data) => {
        if (!active) return;
        const lista = Array.isArray(data) ? data : [];
        const filtrada = form.tipo === 'RECEBER'
          ? lista.filter((item) => item.cliente !== false)
          : lista.filter((item) => item.fornecedor !== false || item.corretor === true);
        const parceiroAtual = titulo?.parceiro && !filtrada.some((item) => String(item.id) === String(titulo.parceiro.id))
          ? [titulo.parceiro]
          : [];
        setParceiros([...parceiroAtual, ...filtrada]);
      })
      .catch(() => {
        if (active) setParceiros(titulo?.parceiro ? [titulo.parceiro] : []);
      });

    return () => {
      active = false;
    };
  }, [form?.tipo, parceiroBusca, titulo]);

  const categoriasFiltradas = useMemo(
    () => categorias
      .filter((categoria) => categoriaCompativel(categoria, form?.tipo))
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' })),
    [categorias, form?.tipo]
  );
  const bloqueio = useMemo(() => getTituloBloqueado(titulo), [titulo]);
  const categoriasAutocomplete = useMemo(() => {
    if (!categoriaBusca.trim() || form?.categoria_financeira_id) return [];

    return categoriasFiltradas
      .filter((categoria) => categoriaFinanceiraMatchesAutocomplete(categoria, categoriaBusca));
  }, [categoriaBusca, categoriasFiltradas, form?.categoria_financeira_id]);
  const mostrarListaCategorias = categoriaBusca.trim().length > 0 && !form?.categoria_financeira_id && !bloqueio;
  const categoriasModalFiltradas = useMemo(() => {
    if (!categoriaModalBusca.trim()) return categoriasFiltradas;

    return categoriasFiltradas.filter((categoria) => (
      categoriaFinanceiraMatchesSearch(categoria, categoriaModalBusca)
    ));
  }, [categoriaModalBusca, categoriasFiltradas]);
  const parceirosAutocomplete = useMemo(
    () => parceiros.filter((parceiro) => parceiroMatchesSearch(parceiro, parceiroBusca)).slice(0, 8),
    [parceiros, parceiroBusca]
  );
  const mostrarListaParceiros = parceiroBusca.trim().length >= 2 && !form?.parceiro_id;
  const obraSelecionada = useMemo(
    () => obras.find((obra) => String(obra.id) === String(form?.obra_id)) || null,
    [obras, form?.obra_id]
  );
  const empresaDaObraId = getEmpresaObraId(obraSelecionada);
  const categoriaSelecionada = useMemo(
    () => categorias.find((categoria) => String(categoria.id) === String(form?.categoria_financeira_id)) || null,
    [categorias, form?.categoria_financeira_id]
  );
  const parceiroSelecionado = useMemo(
    () => parceiros.find((item) => String(item.id) === String(form?.parceiro_id)) || null,
    [form?.parceiro_id, parceiros]
  );
  const parceiroPixOptions = useMemo(() => getParceiroPixOptions(parceiroSelecionado), [parceiroSelecionado]);
  const valorTitulo = useMemo(() => roundCurrency(toCurrencyNumber(form?.valor)), [form?.valor]);
  const totalRateioValor = useMemo(() => {
    return roundCurrency((form?.rateios || []).reduce((acc, rateio) => {
      if (rateio.tipo_rateio === 'VALOR') return acc + toCurrencyNumber(rateio.valor_rateio);
      return acc + (valorTitulo * toCurrencyNumber(rateio.percentual) / 100);
    }, 0));
  }, [form?.rateios, valorTitulo]);
  const totalRateioPercentual = useMemo(() => {
    return roundCurrency((form?.rateios || []).reduce((acc, rateio) => {
      if (rateio.tipo_rateio === 'PERCENTUAL') return acc + toCurrencyNumber(rateio.percentual);
      return acc + (valorTitulo > 0 ? (toCurrencyNumber(rateio.valor_rateio) / valorTitulo) * 100 : 0);
    }, 0));
  }, [form?.rateios, valorTitulo]);
  const totalImpostosRetencao = useMemo(() => {
    return roundCurrency((form?.impostos || [])
      .filter((imposto) => imposto.natureza !== 'ACRESCIMO')
      .reduce((acc, imposto) => acc + toCurrencyNumber(imposto.valor), 0));
  }, [form?.impostos]);
  const totalImpostosAcrescimo = useMemo(() => {
    return roundCurrency((form?.impostos || [])
      .filter((imposto) => imposto.natureza === 'ACRESCIMO')
      .reduce((acc, imposto) => acc + toCurrencyNumber(imposto.valor), 0));
  }, [form?.impostos]);
  const descontoFinanceiro = useMemo(() => roundCurrency(toCurrencyNumber(form?.desconto_financeiro)), [form?.desconto_financeiro]);
  const valorLiquidoPrevisto = useMemo(() => {
    return roundCurrency(Math.max(valorTitulo - descontoFinanceiro - totalImpostosRetencao + totalImpostosAcrescimo, 0));
  }, [valorTitulo, descontoFinanceiro, totalImpostosRetencao, totalImpostosAcrescimo]);

  useEffect(() => {
    if (!form || form.tipo !== 'PAGAR' || !form.parceiro_id) {
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
            preparar_pagamento_pix: true,
            payment_beneficiary_id: current.usar_credor_como_favorecido ? '' : String(beneficiary.id),
            nome: current.usar_credor_como_favorecido ? current.nome : (beneficiary.nome || current.nome),
            cpf_cnpj: current.usar_credor_como_favorecido ? current.cpf_cnpj : (beneficiary.cpf_cnpj || current.cpf_cnpj),
            pix_tipo_chave: current.usar_credor_como_favorecido ? current.pix_tipo_chave : (beneficiary.pix_tipo_chave || current.pix_tipo_chave),
            pix_chave: current.usar_credor_como_favorecido ? current.pix_chave : (beneficiary.pix_chave || current.pix_chave)
          }));
        }
      })
      .catch(() => {
        if (active) setBeneficiaries([]);
      });

    return () => {
      active = false;
    };
  }, [form?.tipo, form?.parceiro_id]);

  useEffect(() => {
    if (!form || !empresaDaObraId || String(form.empresa_id || '') === String(empresaDaObraId)) {
      return;
    }

    setForm((current) => ({
      ...current,
      empresa_id: empresaDaObraId
    }));
  }, [empresaDaObraId, form]);

  function resetPaymentDraft() {
    setBeneficiaries([]);
    setPaymentDraft((current) => ({
      ...current,
      preparar_pagamento_pix: false,
      usar_credor_como_favorecido: false,
      payment_beneficiary_id: '',
      nome: '',
      cpf_cnpj: '',
      pix_chave: ''
    }));
  }

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'obra_id') {
        const obra = obras.find((item) => String(item.id) === String(value));
        next.empresa_id = getEmpresaObraId(obra);
        next.apropriacao_id = '';
      }
      if (field === 'tipo') {
        next.parceiro_id = '';
        next.categoria_financeira_id = '';
        setCategoriaBusca('');
        next.forma_cobranca = value === 'RECEBER' ? next.forma_cobranca : '';
      }
      if (field === 'intercompany' && !value) {
        next.empresa_contraparte_id = '';
        next.intercompany_group_id = '';
        next.empresa_origem_id = '';
        next.empresa_destino_id = '';
        next.tipo_intercompany = '';
        next.motivo_intercompany = '';
      }
      if (field === 'empresa_origem_id' && String(next.empresa_destino_id) === String(value)) {
        next.empresa_destino_id = '';
        next.empresa_contraparte_id = '';
      }
      if (field === 'empresa_destino_id') {
        if (String(next.empresa_origem_id) === String(value)) {
          next.empresa_destino_id = '';
          next.empresa_contraparte_id = '';
        } else {
          next.empresa_contraparte_id = value;
        }
      }
      return next;
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
      rateios[index] = { ...rateio, [field]: value };
      if (field === 'tipo_rateio') {
        rateios[index].percentual = '';
        rateios[index].valor_rateio = '';
      }
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
      const next = { ...(impostos[index] || createImposto()), [field]: value };
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

  function handleTipoChange(value) {
    updateField('tipo', value);
    if (value !== 'PAGAR') {
      resetPaymentDraft();
    }
  }

  function selecionarParceiro(parceiro) {
    setParceiroBusca(parceiro?.nome || '');
    setForm((current) => ({
      ...current,
      parceiro_id: parceiro?.id ? String(parceiro.id) : ''
    }));
    setPaymentDraft((current) => {
      if (!current.usar_credor_como_favorecido) return current;
      const pix = getParceiroPixPrincipal(parceiro);
      return {
        ...current,
        payment_beneficiary_id: '',
        nome: parceiro?.nome || '',
        cpf_cnpj: parceiro?.cpf_cnpj || '',
        pix_tipo_chave: pix?.tipo || current.pix_tipo_chave || 'CNPJ',
        pix_chave: pix?.chave || ''
      };
    });
    setParceiroModalOpen(false);
  }

  function selecionarCategoriaFinanceira(categoria) {
    setCategoriaBusca(categoria?.nome || '');
    updateField('categoria_financeira_id', categoria?.id ? String(categoria.id) : '');
    setCategoriaModalOpen(false);
  }

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

  async function pesquisarParceirosModal() {
    const nome = parceiroModalNomeBusca.trim();
    const documento = parceiroModalDocumentoBusca.trim();

    try {
      setLoadingParceiroModal(true);
      const params = {
        ativo: 1,
        limit: 200,
        q: documento || nome
      };
      if (form.tipo === 'RECEBER') {
        params.cliente = 1;
      }

      const data = await buscarParceiros(params);
      const lista = Array.isArray(data) ? data : [];
      const tipoFiltrado = form.tipo === 'RECEBER'
        ? lista.filter((item) => item.cliente !== false)
        : lista.filter((item) => item.fornecedor !== false || item.corretor === true);
      const termoFinal = documento || nome;
      setParceiroModalResultados(tipoFiltrado.filter((item) => parceiroMatchesSearch(item, termoFinal)));
    } catch (err) {
      setParceiroModalResultados([]);
    } finally {
      setLoadingParceiroModal(false);
    }
  }

  function validar() {
    if (!form.obra_id) return 'Selecione a obra/centro de custo.';
    if (!empresaDaObraId) return 'A obra/centro de custo selecionado nao possui empresa vinculada.';
    if (!form.parceiro_id) return 'Selecione o parceiro.';
    if (!form.descricao.trim()) return 'Informe a descricao.';
    if (toCurrencyNumber(form.valor) <= 0) return 'Informe o valor do titulo.';
    if (descontoFinanceiro < 0) return 'Informe um desconto valido.';
    if (descontoFinanceiro > valorTitulo) return 'O desconto nao pode ser maior que o valor do titulo.';
    if (!form.data_vencimento) return 'Informe o vencimento.';
    if ((form.rateios || []).length > 0) {
      for (const rateio of form.rateios) {
        if (!rateio.obra_id) return 'Informe a obra/centro de custo em todos os rateios.';
        if (rateio.tipo_rateio === 'PERCENTUAL' && toCurrencyNumber(rateio.percentual) <= 0) {
          return 'Informe o percentual de todos os rateios percentuais.';
        }
        if (rateio.tipo_rateio === 'VALOR' && toCurrencyNumber(rateio.valor_rateio) <= 0) {
          return 'Informe o valor de todos os rateios por valor.';
        }
      }
      if (Math.abs(totalRateioValor - valorTitulo) > 0.02 || Math.abs(totalRateioPercentual - 100) > 0.02) {
        return `O rateio precisa fechar 100% ou ${formatCurrency(valorTitulo)}. Total atual: ${formatCurrency(totalRateioValor)} (${totalRateioPercentual.toFixed(2)}%).`;
      }
    }
    if ((form.impostos || []).length > 0) {
      for (const imposto of form.impostos) {
        if (!String(imposto.tipo_imposto || imposto.descricao || '').trim()) return 'Informe o tipo dos impostos/retencoes.';
        if (toCurrencyNumber(imposto.valor) <= 0) return 'Informe o valor dos impostos/retencoes.';
      }
    }
    if (!form.categoria_financeira_id) return 'Selecione a categoria financeira do titulo.';
    if (!form.competencia_data) return 'Informe a competencia DRE.';
    if (form.intercompany) {
      if (!form.empresa_origem_id) return 'Informe a empresa origem.';
      if (!form.empresa_destino_id) return 'Informe a empresa destino.';
      if (String(form.empresa_origem_id) === String(form.empresa_destino_id)) return 'Origem e destino nao podem ser iguais.';
      if (!form.empresa_contraparte_id) return 'Informe a empresa contraparte.';
      if (!form.tipo_intercompany) return 'Informe o tipo.';
    }
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const erroValidacao = validar();
    if (erroValidacao) {
      setError(erroValidacao);
      return;
    }

    try {
      setSaving(true);
      setError('');
      const payload = {
        ...form,
        empresa_id: empresaDaObraId,
        status: form.status || 'ABERTO',
        valor: toCurrencyNumber(form.valor),
        apropriacao_id: form.apropriacao_id || null,
        categoria_financeira_id: form.categoria_financeira_id || null,
        numero_documento: form.numero_documento || null,
        observacoes: form.observacoes || null,
        data_emissao: form.data_emissao || null,
        considera_dre: Boolean(categoriaSelecionada && categoriaSelecionada.considera_dre !== false && String(categoriaSelecionada.dre_grupo || '').trim()),
        competencia_data: form.competencia_data,
        forma_cobranca: form.tipo === 'RECEBER' ? form.forma_cobranca || null : null,
        status_cobranca: form.tipo === 'RECEBER' && form.forma_cobranca ? form.status_cobranca : null,
        banco_cobranca: form.banco_cobranca || null,
        nosso_numero: form.nosso_numero || null,
        linha_digitavel: form.linha_digitavel || null,
        codigo_barras: form.codigo_barras || null,
        identificador_externo: form.identificador_externo || null,
        boleto_emitido_em: form.boleto_emitido_em || null,
        empresa_contraparte_id: form.intercompany ? form.empresa_contraparte_id || null : null,
        intercompany_group_id: form.intercompany ? form.intercompany_group_id || null : null,
        empresa_origem_id: form.intercompany ? form.empresa_origem_id || null : null,
        empresa_destino_id: form.intercompany ? form.empresa_destino_id || null : null,
        tipo_intercompany: form.intercompany ? form.tipo_intercompany || null : null,
        motivo_intercompany: form.intercompany ? form.motivo_intercompany || null : null,
        valor_bruto: form.valor,
        desconto_financeiro: formatCurrencyInput(descontoFinanceiro),
        valor_liquido: formatCurrencyInput(valorLiquidoPrevisto),
        rateios: (form.rateios || []).map((rateio) => ({
          obra_id: rateio.obra_id ? Number(rateio.obra_id) : undefined,
          tipo_rateio: rateio.tipo_rateio || 'PERCENTUAL',
          percentual: rateio.tipo_rateio === 'PERCENTUAL' ? rateio.percentual : undefined,
          valor_rateio: rateio.tipo_rateio === 'VALOR' ? rateio.valor_rateio : undefined,
          observacoes: rateio.observacoes || undefined
        })),
        impostos: (form.impostos || []).map((imposto) => ({
          tipo_imposto: imposto.tipo_imposto || imposto.descricao,
          descricao: imposto.descricao || imposto.tipo_imposto,
          natureza: imposto.natureza || 'RETENCAO',
          base_calculo: imposto.base_calculo || undefined,
          aliquota: imposto.aliquota || undefined,
          valor: imposto.valor,
          observacoes: imposto.observacoes || undefined
        }))
      };
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

      const atualizado = await atualizarTituloFinanceiro(id, payload);
      navigate(`/financeiro/titulos/${atualizado.id}`);
    } catch (err) {
      setError(err?.message || 'Erro ao salvar edicao do titulo');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--c-muted)]">Carregando titulo financeiro...</p>;
  }

  if (!titulo || !form) {
    return <p className="text-sm text-[var(--c-muted)]">Titulo financeiro nao encontrado.</p>;
  }

  return (
    <div className="page solicitacoes-page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Link className="btn btn-outline mb-3" to={`/financeiro/titulos/${id}`}>
            Voltar ao titulo
          </Link>
          <h1 className="page-title">Editar titulo {titulo.codigo || `#${titulo.id}`}</h1>
          <p className="text-sm text-[var(--c-muted)]">
            Ajuste permitido apenas enquanto o titulo estiver aberto e sem baixa.
          </p>
        </div>
      </div>

      {bloqueio && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {bloqueio}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="form-field">
            <span>Tipo</span>
            <select value={form.tipo} onChange={(event) => handleTipoChange(event.target.value)} disabled={Boolean(bloqueio)}>
              <option value="PAGAR">Conta a pagar</option>
              <option value="RECEBER">Conta a receber</option>
            </select>
          </label>

          <label className="form-field">
            <span>Status</span>
            <select value={form.status} onChange={(event) => updateField('status', event.target.value)} disabled={Boolean(bloqueio)}>
              <option value="ABERTO">Aberto</option>
              <option value="PREVISAO">Previsao</option>
            </select>
          </label>

          <label className="form-field xl:col-span-2">
            <span>Obra/Centro de custo</span>
            <select value={form.obra_id} onChange={(event) => updateField('obra_id', event.target.value)} disabled={Boolean(bloqueio)}>
              <option value="">Selecione</option>
              {obras.map((obra) => (
                <option key={obra.id} value={obra.id}>{obra.nome}</option>
              ))}
            </select>
          </label>

          <label className="form-field relative xl:col-span-2">
            <span>Credor/Fornecedor</span>
            <div className="flex gap-2">
              <input
                value={parceiroBusca}
                onChange={(event) => {
                  setParceiroBusca(event.target.value);
                  updateField('parceiro_id', '');
                }}
                placeholder="Digite nome, razao social, CPF ou CNPJ"
                disabled={Boolean(bloqueio)}
              />
              <button
                type="button"
                className="btn btn-outline shrink-0 px-3"
                title="Pesquisar parceiro"
                aria-label="Pesquisar parceiro"
                disabled={Boolean(bloqueio)}
                onClick={() => {
                  setParceiroModalNomeBusca(parceiroBusca);
                  setParceiroModalDocumentoBusca('');
                  setParceiroModalResultados([]);
                  setParceiroModalOpen(true);
                }}
              >
                <SearchIcon />
              </button>
            </div>
            <input type="hidden" value={form.parceiro_id} required />
            {mostrarListaParceiros && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-56 overflow-y-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] shadow-lg">
                {parceirosAutocomplete.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-[var(--c-muted)]">
                    Nenhum parceiro encontrado.
                  </div>
                ) : parceirosAutocomplete.map((parceiro) => (
                  <button
                    key={parceiro.id}
                    type="button"
                    className="w-full border-b border-[var(--c-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--c-surface-muted)]"
                    onClick={() => selecionarParceiro(parceiro)}
                  >
                    <span className="block font-medium text-[var(--c-text)]">{parceiro.nome}</span>
                    <span className="block text-xs text-[var(--c-muted)]">{parceiro.cpf_cnpj || 'CPF/CNPJ nao informado'}</span>
                  </button>
                ))}
              </div>
            )}
            {form.parceiro_id && (
              <small className="text-xs text-[var(--c-muted)]">
                Selecionado: {parceiroBusca || `Parceiro #${form.parceiro_id}`}
              </small>
            )}
          </label>

          <label className="form-field xl:col-span-2">
            <span>Categoria financeira</span>
            <div className="relative space-y-2">
              <div className="flex gap-2">
                <input
                  value={categoriaBusca}
                  onChange={(event) => {
                    setCategoriaBusca(event.target.value);
                    updateField('categoria_financeira_id', '');
                  }}
                  placeholder="Digite para buscar a categoria"
                  disabled={Boolean(bloqueio)}
                  required={!form.categoria_financeira_id}
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
                  disabled={Boolean(bloqueio)}
                >
                  <SearchIcon />
                </button>
                {categoriaSelecionada && !bloqueio && (
                  <button
                    type="button"
                    className="btn btn-outline shrink-0"
                    onClick={() => {
                      setCategoriaBusca('');
                      updateField('categoria_financeira_id', '');
                    }}
                  >
                    Limpar
                  </button>
                )}
              </div>
              <input type="hidden" value={form.categoria_financeira_id} required />
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
            <small className="text-xs text-[var(--c-muted)]">
              {categoriaSelecionada
                ? getCategoriaDreResumo(categoriaSelecionada)
                : 'A categoria financeira define se o titulo entra na DRE.'}
            </small>
          </label>

          <label className="form-field">
            <span>Apropriacao</span>
            <ApropriacaoAutocomplete
              value={form.apropriacao_id}
              options={apropriacoes}
              onChange={(id) => updateField('apropriacao_id', id)}
              disabled={Boolean(bloqueio)}
              placeholder="Sem apropriação — pesquise para selecionar"
            />
          </label>

          <label className="form-field">
            <span>Valor</span>
            <input value={form.valor} onChange={(event) => updateField('valor', normalizeCurrencyTyping(event.target.value))} disabled={Boolean(bloqueio)} />
          </label>

          <label className="form-field">
            <span>Desconto concedido</span>
            <input
              value={form.desconto_financeiro}
              onChange={(event) => updateField('desconto_financeiro', normalizeCurrencyTyping(event.target.value))}
              disabled={Boolean(bloqueio)}
              placeholder="R$ 0,00"
            />
          </label>

          <label className="form-field xl:col-span-2">
            <span>Descricao</span>
            <input value={form.descricao} onChange={(event) => updateField('descricao', event.target.value)} disabled={Boolean(bloqueio)} />
          </label>

          <label className="form-field">
            <span>Numero do documento</span>
            <input value={form.numero_documento} onChange={(event) => updateField('numero_documento', event.target.value)} disabled={Boolean(bloqueio)} />
          </label>

          <label className="form-field">
            <span>Emissao</span>
            <input type="date" value={form.data_emissao} onChange={(event) => updateField('data_emissao', event.target.value)} disabled={Boolean(bloqueio)} />
          </label>

          <label className="form-field">
            <span>Vencimento</span>
            <input type="date" value={form.data_vencimento} onChange={(event) => updateField('data_vencimento', event.target.value)} disabled={Boolean(bloqueio)} />
          </label>

          <label className="form-field">
            <span>Competencia DRE</span>
            <input
              type="date"
              value={form.competencia_data}
              onChange={(event) => updateField('competencia_data', event.target.value)}
              disabled={Boolean(bloqueio) || !(categoriaSelecionada && categoriaSelecionada.considera_dre !== false && String(categoriaSelecionada.dre_grupo || '').trim())}
            />
            <small className="text-xs text-[var(--c-muted)]">
              A categoria financeira define automaticamente se o titulo entra na DRE.
            </small>
          </label>
        </div>

        <div className="rounded-xl border border-[var(--c-border)] p-4">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--c-text)]">Rateio por obra/centro de custo</h2>
              <p className="text-xs text-[var(--c-muted)]">
                Use quando o mesmo titulo precisar compor mais de uma obra. Sem rateio, o titulo segue na obra principal selecionada.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                (form.rateios || []).length === 0 || (Math.abs(totalRateioValor - valorTitulo) <= 0.02 && Math.abs(totalRateioPercentual - 100) <= 0.02)
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {(form.rateios || []).length === 0
                  ? 'Sem rateio'
                  : `${formatCurrency(totalRateioValor)} - ${totalRateioPercentual.toFixed(2)}%`}
              </span>
              <button type="button" className="btn btn-outline" onClick={adicionarRateio} disabled={Boolean(bloqueio)}>
                Adicionar rateio
              </button>
            </div>
          </div>

          {(form.rateios || []).length > 0 && (
            <div className="space-y-3">
              {(form.rateios || []).map((rateio, index) => (
                <div key={rateio.id || index} className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                    <label className="form-field xl:col-span-4">
                      <span>Obra/Centro de custo</span>
                      <select value={rateio.obra_id} onChange={(event) => updateRateio(index, 'obra_id', event.target.value)} disabled={Boolean(bloqueio)}>
                        <option value="">Selecione</option>
                        {obras.map((obra) => (
                          <option key={obra.id} value={obra.id}>{obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome}</option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field xl:col-span-2">
                      <span>Tipo</span>
                      <select value={rateio.tipo_rateio} onChange={(event) => updateRateio(index, 'tipo_rateio', event.target.value)} disabled={Boolean(bloqueio)}>
                        <option value="PERCENTUAL">Percentual</option>
                        <option value="VALOR">Valor R$</option>
                      </select>
                    </label>
                    {rateio.tipo_rateio === 'PERCENTUAL' ? (
                      <label className="form-field xl:col-span-2">
                        <span>Percentual</span>
                        <input value={rateio.percentual} onChange={(event) => updateRateio(index, 'percentual', event.target.value)} disabled={Boolean(bloqueio)} placeholder="Ex.: 50" />
                      </label>
                    ) : (
                      <label className="form-field xl:col-span-2">
                        <span>Valor</span>
                        <input value={rateio.valor_rateio} onChange={(event) => updateRateio(index, 'valor_rateio', normalizeCurrencyTyping(event.target.value))} disabled={Boolean(bloqueio)} placeholder="R$ 0,00" />
                      </label>
                    )}
                    <label className="form-field xl:col-span-3">
                      <span>Observacoes</span>
                      <input value={rateio.observacoes} onChange={(event) => updateRateio(index, 'observacoes', event.target.value)} disabled={Boolean(bloqueio)} />
                    </label>
                    <div className="flex items-end xl:col-span-1">
                      <button type="button" className="btn btn-outline w-full" onClick={() => removerRateio(index)} disabled={Boolean(bloqueio)}>
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--c-border)] p-4">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--c-text)]">Impostos e retencoes</h2>
              <p className="text-xs text-[var(--c-muted)]">
                Registre retencoes ou acrescimos para acompanhar o valor liquido do titulo. Desconto fica no campo proprio ao lado do valor.
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={adicionarImposto} disabled={Boolean(bloqueio)}>
              Adicionar imposto/retencao
            </button>
          </div>

          {(form.impostos || []).length > 0 && (
            <div className="space-y-3">
              {(form.impostos || []).map((imposto, index) => (
                <div key={imposto.id || index} className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                    <label className="form-field xl:col-span-2">
                      <span>Natureza</span>
                      <select value={imposto.natureza} onChange={(event) => updateImposto(index, 'natureza', event.target.value)} disabled={Boolean(bloqueio)}>
                        <option value="RETENCAO">Retencao</option>
                        <option value="ACRESCIMO">Acrescimo</option>
                      </select>
                    </label>
                    <label className="form-field xl:col-span-2">
                      <span>Tipo</span>
                      <input value={imposto.tipo_imposto} onChange={(event) => updateImposto(index, 'tipo_imposto', event.target.value)} disabled={Boolean(bloqueio)} placeholder="IRRF, INSS..." />
                    </label>
                    <label className="form-field xl:col-span-2">
                      <span>Base</span>
                      <input value={imposto.base_calculo} onChange={(event) => updateImposto(index, 'base_calculo', normalizeCurrencyTyping(event.target.value))} disabled={Boolean(bloqueio)} placeholder="R$ 0,00" />
                    </label>
                    <label className="form-field xl:col-span-1">
                      <span>Aliq. %</span>
                      <input value={imposto.aliquota} onChange={(event) => updateImposto(index, 'aliquota', event.target.value)} disabled={Boolean(bloqueio)} />
                    </label>
                    <label className="form-field xl:col-span-2">
                      <span>Valor</span>
                      <input value={imposto.valor} onChange={(event) => updateImposto(index, 'valor', normalizeCurrencyTyping(event.target.value))} disabled={Boolean(bloqueio)} placeholder="R$ 0,00" />
                    </label>
                    <label className="form-field xl:col-span-2">
                      <span>Descricao</span>
                      <input value={imposto.descricao} onChange={(event) => updateImposto(index, 'descricao', event.target.value)} disabled={Boolean(bloqueio)} />
                    </label>
                    <div className="flex items-end xl:col-span-1">
                      <button type="button" className="btn btn-outline w-full" onClick={() => removerImposto(index)} disabled={Boolean(bloqueio)}>
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-muted)] px-3 py-2 text-sm text-[var(--c-text)]">
            Valor bruto: <strong>{formatCurrency(valorTitulo)}</strong>. Desconto: <strong>{formatCurrency(descontoFinanceiro)}</strong>. Retencoes: <strong>{formatCurrency(totalImpostosRetencao)}</strong>. Acrescimos: <strong>{formatCurrency(totalImpostosAcrescimo)}</strong>. Valor liquido previsto: <strong>{formatCurrency(valorLiquidoPrevisto)}</strong>.
          </div>
        </div>

        {form.tipo === 'RECEBER' && (
          <div className="rounded-xl border border-[var(--c-border)] p-4">
            <h2 className="mb-3 text-base font-semibold text-[var(--c-text)]">Dados de cobranca</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="form-field">
                <span>Forma</span>
                <select value={form.forma_cobranca} onChange={(event) => updateField('forma_cobranca', event.target.value)} disabled={Boolean(bloqueio)}>
                  <option value="">Sem cobranca</option>
                  {FORMAS_COBRANCA.map((forma) => <option key={forma} value={forma}>{forma}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Status</span>
                <select value={form.status_cobranca} onChange={(event) => updateField('status_cobranca', event.target.value)} disabled={Boolean(bloqueio) || !form.forma_cobranca}>
                  {STATUS_COBRANCA.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Banco</span>
                <input value={form.banco_cobranca} onChange={(event) => updateField('banco_cobranca', event.target.value)} disabled={Boolean(bloqueio)} />
              </label>
              <label className="form-field">
                <span>Nosso numero</span>
                <input value={form.nosso_numero} onChange={(event) => updateField('nosso_numero', event.target.value)} disabled={Boolean(bloqueio)} />
              </label>
              <label className="form-field xl:col-span-2">
                <span>Linha digitavel</span>
                <input value={form.linha_digitavel} onChange={(event) => updateField('linha_digitavel', event.target.value)} disabled={Boolean(bloqueio)} />
              </label>
              <label className="form-field xl:col-span-2">
                <span>Codigo de barras</span>
                <input value={form.codigo_barras} onChange={(event) => updateField('codigo_barras', event.target.value)} disabled={Boolean(bloqueio)} />
              </label>
            </div>
          </div>
        )}

        {form.tipo === 'PAGAR' && (
          <div className="rounded-xl border border-[var(--c-border)] p-4">
            <h2 className="mb-1 text-base font-semibold text-[var(--c-text)]">Dados do boleto para pagamento</h2>
            <p className="mb-3 text-xs text-[var(--c-muted)]">
              Informe a linha digitavel ou o codigo de barras para o titulo aparecer em Bancos Enterprise e gerar remessa Caixa CNAB240.
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="form-field">
                <span>Banco do boleto</span>
                <input value={form.banco_cobranca} onChange={(event) => updateField('banco_cobranca', event.target.value)} disabled={Boolean(bloqueio)} />
              </label>
              <label className="form-field xl:col-span-2">
                <span>Linha digitavel</span>
                <input value={form.linha_digitavel} onChange={(event) => updateField('linha_digitavel', event.target.value)} disabled={Boolean(bloqueio)} />
              </label>
              <label className="form-field">
                <span>Codigo de barras</span>
                <input value={form.codigo_barras} onChange={(event) => updateField('codigo_barras', event.target.value)} disabled={Boolean(bloqueio)} />
              </label>
            </div>
          </div>
        )}

        {form.tipo === 'PAGAR' && (
          <div className="rounded-xl border border-[var(--c-border)] p-4">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--c-text)]">Favorecido PIX para pagamento em massa</h2>
                <p className="text-xs text-[var(--c-muted)]">
                  Cadastre ou atualize o favorecido usado quando este credor entrar em lotes PIX por chave.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                <input
                  type="checkbox"
                  checked={paymentDraft.preparar_pagamento_pix}
                  onChange={(event) => setPaymentDraft((current) => ({ ...current, preparar_pagamento_pix: event.target.checked }))}
                  disabled={Boolean(bloqueio)}
                />
                Preparar PIX
              </label>
            </div>

            {paymentDraft.preparar_pagamento_pix && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                <label className="flex items-start gap-2 text-sm text-[var(--c-text)] xl:col-span-4">
                  <input
                    type="checkbox"
                    checked={paymentDraft.usar_credor_como_favorecido}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setPaymentDraft((current) => ({ ...current, usar_credor_como_favorecido: checked }));
                      if (checked && parceiroSelecionado) preencherFavorecidoComParceiro(parceiroSelecionado);
                    }}
                    disabled={Boolean(bloqueio) || !parceiroSelecionado}
                  />
                  <span>
                    Usar o mesmo credor como favorecido
                    <span className="mt-1 block text-xs text-[var(--c-muted)]">
                      Preenche nome, CPF/CNPJ e a primeira chave PIX cadastrada no credor.
                    </span>
                  </span>
                </label>

                <label className="form-field xl:col-span-4">
                  <span>Favorecido bancario vinculado</span>
                  <select
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
                    disabled={Boolean(bloqueio)}
                  >
                    <option value="">Novo favorecido</option>
                    {beneficiaries.map((beneficiary) => (
                      <option key={beneficiary.id} value={beneficiary.id}>
                        {beneficiary.nome} - {beneficiary.pix_chave || 'sem PIX'}
                      </option>
                    ))}
                  </select>
                  <small className="text-xs text-[var(--c-muted)]">
                    Se nao houver favorecido salvo, informe os dados abaixo.
                  </small>
                </label>

                {paymentDraft.usar_credor_como_favorecido && parceiroPixOptions.length > 1 && (
                  <label className="form-field xl:col-span-4">
                    <span>Chave PIX do credor</span>
                    <select
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
                      disabled={Boolean(bloqueio)}
                    >
                      {parceiroPixOptions.map((item) => (
                        <option key={item.id} value={`${item.tipo}:${item.chave}`}>
                          {item.label} - {item.tipo} {item.chave}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="form-field xl:col-span-3">
                  <span>Nome favorecido</span>
                  <input
                    value={paymentDraft.nome}
                    onChange={(event) => setPaymentDraft((current) => ({ ...current, nome: event.target.value }))}
                    disabled={Boolean(bloqueio)}
                    required={paymentDraft.preparar_pagamento_pix}
                  />
                </label>
                <label className="form-field xl:col-span-2">
                  <span>CPF/CNPJ</span>
                  <input
                    value={paymentDraft.cpf_cnpj}
                    onChange={(event) => setPaymentDraft((current) => ({ ...current, cpf_cnpj: event.target.value }))}
                    disabled={Boolean(bloqueio)}
                    required={paymentDraft.preparar_pagamento_pix}
                  />
                </label>
                <label className="form-field xl:col-span-2">
                  <span>Tipo chave PIX</span>
                  <select
                    value={paymentDraft.pix_tipo_chave}
                    onChange={(event) => setPaymentDraft((current) => ({ ...current, pix_tipo_chave: event.target.value }))}
                    disabled={Boolean(bloqueio)}
                  >
                    {PIX_TIPOS_CHAVE.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                  </select>
                </label>
                <label className="form-field xl:col-span-5">
                  <span>Chave PIX</span>
                  <input
                    value={paymentDraft.pix_chave}
                    onChange={(event) => setPaymentDraft((current) => ({ ...current, pix_chave: event.target.value }))}
                    disabled={Boolean(bloqueio)}
                    required={paymentDraft.preparar_pagamento_pix}
                  />
                </label>
                <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-muted)] px-3 py-2 text-xs text-[var(--c-muted)] xl:col-span-12">
                  O lote de pagamento cria um snapshot do favorecido no momento da montagem. Ajustes feitos aqui valem para os proximos lotes.
                </div>
              </div>
            )}
          </div>
        )}

        {form.intercompany && (
          <div className="rounded-xl border border-[var(--c-border)] p-4">
            <h2 className="mb-3 text-base font-semibold text-[var(--c-text)]">Entre Empresas</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="form-field">
                <span>Origem</span>
                <select value={form.empresa_origem_id} onChange={(event) => updateField('empresa_origem_id', event.target.value)} disabled={Boolean(bloqueio)}>
                  <option value="">Selecione</option>
                  {empresasGrupo
                    .filter(empresaIntercompanySelecionavel)
                    .map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nome || empresa.razao_social}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Destino</span>
                <select value={form.empresa_destino_id} onChange={(event) => updateField('empresa_destino_id', event.target.value)} disabled={Boolean(bloqueio)}>
                  <option value="">Selecione</option>
                  {empresasGrupo
                    .filter((empresa) => (
                      empresaIntercompanySelecionavel(empresa)
                      && String(empresa.id) !== String(form.empresa_origem_id)
                    ))
                    .map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nome || empresa.razao_social}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Contraparte</span>
                <select value={form.empresa_contraparte_id} onChange={(event) => updateField('empresa_contraparte_id', event.target.value)} disabled={Boolean(bloqueio)}>
                  <option value="">Selecione</option>
                  {empresasGrupo.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nome || empresa.razao_social}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Tipo</span>
                <select value={form.tipo_intercompany} onChange={(event) => updateField('tipo_intercompany', event.target.value)} disabled={Boolean(bloqueio)}>
                  <option value="">Selecione</option>
                  {TIPOS_INTERCOMPANY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="form-field xl:col-span-4">
                <span>Motivo</span>
                <input value={form.motivo_intercompany} onChange={(event) => updateField('motivo_intercompany', event.target.value)} disabled={Boolean(bloqueio)} />
              </label>
            </div>
          </div>
        )}

        <label className="form-field">
          <span>Observacoes</span>
          <textarea value={form.observacoes} onChange={(event) => updateField('observacoes', event.target.value)} disabled={Boolean(bloqueio)} rows={4} />
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Link className="btn btn-outline" to={`/financeiro/titulos/${id}`}>
            Cancelar
          </Link>
          <button type="submit" className="btn btn-primary" disabled={Boolean(bloqueio) || saving}>
            {saving ? 'Salvando...' : 'Salvar alteracoes'}
          </button>
        </div>
      </form>

      {categoriaModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--c-text)]">Selecionar categoria financeira</h3>
                <p className="text-sm text-[var(--c-muted)]">
                  Veja categorias compativeis com o tipo do titulo ou filtre por nome, grupo e descricao.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--c-muted)] hover:bg-[var(--c-bg)] hover:text-[var(--c-text)]"
                onClick={() => setCategoriaModalOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
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

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-2">
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

      {parceiroModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--c-text)]">Pesquisar credor/fornecedor</h3>
                <p className="text-sm text-[var(--c-muted)]">
                  Busque por CPF/CNPJ, nome ou razao social.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--c-muted)] hover:bg-[var(--c-bg)] hover:text-[var(--c-text)]"
                onClick={() => setParceiroModalOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="form-field">
                  <span>CPF/CNPJ</span>
                  <input
                    value={parceiroModalDocumentoBusca}
                    onChange={(event) => setParceiroModalDocumentoBusca(event.target.value)}
                    placeholder="Digite CPF ou CNPJ"
                  />
                </label>
                <label className="form-field">
                  <span>Nome/Razao social</span>
                  <input
                    value={parceiroModalNomeBusca}
                    onChange={(event) => setParceiroModalNomeBusca(event.target.value)}
                    placeholder="Digite parte do nome ou razao social"
                  />
                </label>
              </div>

              <div className="flex justify-end">
                <button type="button" className="btn btn-primary" onClick={pesquisarParceirosModal} disabled={loadingParceiroModal}>
                  {loadingParceiroModal ? 'Pesquisando...' : 'Pesquisar'}
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--c-border)]">
                {parceiroModalResultados.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-[var(--c-muted)]">
                    Nenhum resultado listado. Informe um termo e pesquise.
                  </div>
                ) : parceiroModalResultados.map((parceiro) => (
                  <button
                    key={parceiro.id}
                    type="button"
                    className="w-full border-b border-[var(--c-border)] px-4 py-3 text-left text-sm last:border-b-0 hover:bg-[var(--c-bg)]"
                    onClick={() => selecionarParceiro(parceiro)}
                  >
                    <span className="block font-semibold text-[var(--c-text)]">{parceiro.nome}</span>
                    <span className="block text-xs text-[var(--c-muted)]">{parceiro.cpf_cnpj || 'CPF/CNPJ nao informado'}</span>
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
