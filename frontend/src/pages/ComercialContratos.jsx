import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineEye, HiOutlinePencilSquare, HiPlus, HiXMark } from 'react-icons/hi2';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ComercialContratoImportacaoPanel from '../components/comercial/ComercialContratoImportacaoPanel';
import { buscarParceiros, criarParceiro } from '../services/parceiros';
import ParceiroAutocomplete from '../components/ui/ParceiroAutocomplete';
import { ResizableTable, ResizableTh } from '../components/ResizableTable';
import { canImportComercialContratos } from '../utils/acessoProduto';
import { isValidCpfCnpj, maskCep, maskCpfCnpj, maskCreci, maskPhone, normalizeCurrencyTyping, onlyDigits } from '../utils/formatters';
import {
  atualizarContratoComercial,
  anexarContratoAssinadoComercial,
  criarContratoComercial,
  distratarContratoComercial,
  excluirDocumentoContratoComercial,
  excluirContratoComercial,
  gerarDocumentoContratoComercial,
  getContratoComercialById,
  getContratosComerciais,
  getCategoriasFinanceirasComercial,
  getDocumentosContratoComercial,
  getEmpreendimentosComerciais,
  getLinkDocumentoContratoComercial,
  getModelosContratoComercial,
  getObrasComerciais,
  getUnidadesComerciais,
  sincronizarStatusFinanceiroContratoComercial,
  trocarUnidadeContratoComercial
} from '../services/comercial';

const STATUS_CONTRATO = ['RASCUNHO', 'ATIVO', 'INADIMPLENTE', 'QUITADO', 'DISTRATADO', 'CANCELADO'];
const FORMAS_RECEBIMENTO = ['DINHEIRO', 'PIX', 'CARTAO', 'TRANSFERENCIA', 'BOLETO', 'CHEQUE', 'PERMUTA', 'BENS', 'OUTROS'];
const PARCELA_TIPOS = ['ENTRADA', 'PARCELA', 'INTERMEDIARIA', 'CHAVES', 'BALAO', 'OUTRA'];
const PARCELA_REAJUSTE_TIPOS = [
  { value: 'FIXA', label: 'Fixa', resumo: 'F' },
  { value: 'REAJUSTAVEL', label: 'Reajustavel', resumo: 'R' }
];
const TIPOS_DOCUMENTO_MODELO = [
  { value: 'CONTRATO', label: 'Contrato padrao' },
  { value: 'CONTRATO_ASSINADO', label: 'Contrato assinado' }
];
const MODOS_COMPOSICAO = [
  { value: 'ENTRADA', label: 'Entrada' },
  { value: 'PERIODICO', label: 'Parcelas periodicas' },
  { value: 'MANUAL', label: 'Lancamentos manuais' }
];
const PERIODICIDADES = [
  { value: 'AVISTA', label: 'A vista', intervalMonths: 0 },
  { value: 'MENSAL', label: 'Mensal', intervalMonths: 1 },
  { value: 'TRIMESTRAL', label: 'Trimestral', intervalMonths: 3 },
  { value: 'SEMESTRAL', label: 'Semestral', intervalMonths: 6 },
  { value: 'ANUAL', label: 'Anual', intervalMonths: 12 },
  { value: 'PERSONALIZADA', label: 'Datas pre-definidas', intervalMonths: null }
];
const CONTRATO_COMERCIAL_DRAFT_KEY = 'fluxy:comercial:contrato-venda:draft';
const CONTRATOS_CARTEIRA_COLUMNS = [
  { key: 'contrato', width: 190, minWidth: 140 },
  { key: 'status', width: 200, minWidth: 140 },
  { key: 'cliente', width: 250, minWidth: 170 },
  { key: 'empreendimento', width: 210, minWidth: 150 },
  { key: 'unidade', width: 160, minWidth: 120 },
  { key: 'corretor', width: 190, minWidth: 140 },
  { key: 'comissao', width: 100, minWidth: 84 },
  { key: 'obra', width: 220, minWidth: 160 },
  { key: 'valor_total', width: 145, minWidth: 120 },
  { key: 'em_aberto', width: 145, minWidth: 120 },
  { key: 'vencido', width: 140, minWidth: 115 },
  { key: 'acoes', width: 104, minWidth: 96 }
];

function getOptionValue(option) {
  return String(option?.value || option || '').trim();
}

function getOptionLabel(option) {
  if (option && typeof option === 'object') return option.label || option.value || '';
  return option || '';
}

function getOptionResumo(option) {
  if (option && typeof option === 'object') return option.resumo || '';
  return '';
}

function resolveOptionCatalog(configCatalog, fallbackCatalog) {
  return Array.isArray(configCatalog) && configCatalog.length ? configCatalog : fallbackCatalog;
}

function filterOptionsByActive(catalog, activeValues) {
  if (!Array.isArray(activeValues)) return catalog;
  const active = new Set(activeValues.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean));
  return catalog.filter((item) => active.has(getOptionValue(item).toUpperCase()));
}

function optionIsAvailable(options, value) {
  const normalized = String(value || '').trim().toUpperCase();
  return options.some((item) => getOptionValue(item).toUpperCase() === normalized);
}

function firstOptionValue(options, fallback = '') {
  const first = options[0];
  return first ? getOptionValue(first) : fallback;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function buildContratoNumero(empreendimento, unidade) {
  if (!unidade) return '';

  return [empreendimento?.codigo, unidade?.torre, unidade?.codigo]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' - ');
}

function buildUnidadeOptionLabel(unidade) {
  const identificacao = [unidade?.torre, unidade?.codigo]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' - ');
  const vendida = String(unidade?.situacao || '').trim().toUpperCase() === 'VENDIDA';

  return `${identificacao || unidade?.nome || 'Unidade'}${vendida ? ' - vendida' : ''}`;
}

function getContratoUnidadesLabel(contrato) {
  const source = Array.isArray(contrato?.unidades) && contrato.unidades.length
    ? contrato.unidades.map((item) => item.unidade).filter(Boolean)
    : [contrato?.unidadeComercial].filter(Boolean);
  return source
    .map((item) => [item.torre, item.codigo].filter(Boolean).join(' - ') || item.nome)
    .filter(Boolean)
    .join(' + ');
}

function getUnidadeValorReferencia(unidade) {
  return Number(unidade?.valor_base_venda || unidade?.valor_tabela || 0);
}

function defaultContratoUnidade() {
  return {
    unidade_comercial_id: '',
    valor_cadastro_referencia: '',
    valor_atribuido: '',
    principal: true
  };
}

function normalizeContratoUnidadesForm(contrato = {}) {
  const source = Array.isArray(contrato.unidades) && contrato.unidades.length
    ? contrato.unidades
    : (contrato.unidade_comercial_id ? [{
      unidade_comercial_id: contrato.unidade_comercial_id,
      valor_cadastro_referencia: contrato.unidadeComercial?.valor_base_venda || contrato.unidadeComercial?.valor_tabela,
      valor_atribuido: contrato.valor_total,
      principal: true
    }] : []);
  const normalized = source.map((item, index) => {
    const valorReferencia = item.valor_cadastro_referencia ?? getUnidadeValorReferencia(item.unidade);
    const valorAtribuido = hasText(item.valor_atribuido) ? item.valor_atribuido : valorReferencia;
    return {
      unidade_comercial_id: String(item.unidade_comercial_id || item.unidade?.id || ''),
      valor_cadastro_referencia: formatCurrencyInput(valorReferencia),
      valor_atribuido: formatCurrencyInput(valorAtribuido),
      principal: Boolean(item.principal) || (index === 0 && !source.some((row) => row.principal))
    };
  });
  return normalized.length ? normalized : [defaultContratoUnidade()];
}

function atualizarFormComUnidades(current, unidades) {
  const valorTotal = roundCurrency(
    (unidades || []).reduce((total, item) => total + toNumber(item.valor_atribuido), 0)
  );
  return {
    ...current,
    unidades,
    valor_total: valorTotal > 0 ? formatCurrencyInput(valorTotal) : ''
  };
}

function buildContratoNumeroMulti(empreendimento, unidadesSelecionadas = []) {
  const codigos = unidadesSelecionadas
    .map((unidade) => [unidade?.torre, unidade?.codigo].filter(Boolean).join('-'))
    .filter(Boolean);
  return [empreendimento?.codigo, codigos.join(' + ')]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' - ');
}

function defaultForm() {
  return {
    id: null,
    empreendimento_id: '',
    unidade_comercial_id: '',
    unidades: [defaultContratoUnidade()],
    parceiro_id: '',
    compradores: [],
    corretor_parceiro_id: '',
    obra_id: '',
    categoria_financeira_id: '',
    numero: '',
    status: 'ATIVO',
    data_contrato: today(),
    valor_total: '',
    valor_entrada: '',
    desconto_concedido: '',
    corretor_nome: '',
    comissao_percentual: '',
    competencia_comissao_data: '',
    possui_vaga_garagem: false,
    quantidade_vagas_garagem: '',
    vagas_garagem_posicao_especifica: false,
    vagas_garagem_posicao: '',
    local_assinatura: '',
    data_assinatura: today(),
    testemunha_1_nome: '',
    testemunha_1_cpf: '',
    testemunha_2_nome: '',
    testemunha_2_cpf: '',
    observacoes: '',
    parcelas: []
  };
}

function defaultGenerator() {
  return {
    modo: 'PERIODICO',
    titulo_bloco: '',
    tipo_parcela: 'PARCELA',
    periodicidade: 'MENSAL',
    quantidade_parcelas: '12',
    valor_parcela: '',
    primeiro_vencimento: today(),
    competencia_data: '',
    forma_recebimento_prevista: 'BOLETO',
    reajuste_tipo: 'FIXA',
    detalhe_forma_recebimento: '',
    parcelas_personalizadas: [
      {
        descricao: 'Parcela 1',
        tipo_parcela: 'PARCELA',
        reajuste_tipo: 'FIXA',
        data_vencimento: today(),
        competencia_data: '',
        valor: '',
        observacoes: ''
      }
    ]
  };
}

function defaultDistratoForm() {
  return {
    data_distrato: today(),
    motivo_distrato: '',
    observacoes: ''
  };
}

function defaultTrocaForm() {
  return {
    unidade_comercial_origem_id: '',
    unidade_comercial_destino_id: '',
    novo_valor_total: '',
    data_efetiva: today(),
    competencia_data: '',
    observacoes: ''
  };
}

function normalizeCompradoresForm(compradores = [], parceiroPrincipalId = '') {
  const principalId = String(parceiroPrincipalId || '').trim();
  const vistos = new Set();
  const normalizados = [];

  if (principalId) {
    vistos.add(principalId);
    const principalItem = (Array.isArray(compradores) ? compradores : []).find((item) =>
      String(item?.parceiro_id ?? item?.id ?? (item || '')).trim() === principalId
    );
    normalizados.push({ parceiro_id: principalId, principal: true, parceiro: principalItem?.parceiro });
  }

  (Array.isArray(compradores) ? compradores : []).forEach((item) => {
    const parceiroId = String(item?.parceiro_id ?? item?.id ?? (item || '')).trim();
    if (!parceiroId || vistos.has(parceiroId)) return;
    vistos.add(parceiroId);
    normalizados.push({
      parceiro_id: parceiroId,
      principal: false,
      parceiro: item?.parceiro,
      percentual_participacao: item?.percentual_participacao || ''
    });
  });

  return normalizados.map((item, index) => ({
    ...item,
    ordem: index + 1,
    principal: index === 0
  }));
}

function defaultPessoaRapidaForm(tipo = 'cliente') {
  return {
    tipo,
    cpf_cnpj: '',
    nome: '',
    telefone: '',
    email: '',
    data_nascimento: '',
    nacionalidade: '',
    profissao: '',
    estado_civil: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cep: '',
    municipio: '',
    estado: '',
    possui_conjuge: false,
    conjuge: defaultConjugeRapidoForm(),
    regime_bens: '',
    creci: ''
  };
}

function defaultConjugeRapidoForm() {
  return {
    cpf_cnpj: '',
    nome: '',
    telefone: '',
    email: '',
    data_nascimento: '',
    nacionalidade: '',
    profissao: '',
    estado_civil: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cep: '',
    municipio: '',
    estado: ''
  };
}

function buildPessoaRapidaPayload(form, tipo, extras = {}) {
  return {
    cpf_cnpj: onlyDigits(form.cpf_cnpj),
    nome: form.nome,
    telefone: onlyDigits(form.telefone),
    email: form.email,
    data_nascimento: form.data_nascimento,
    nacionalidade: form.nacionalidade,
    profissao: form.profissao,
    estado_civil: form.estado_civil,
    endereco: form.endereco,
    numero: form.numero,
    complemento: form.complemento,
    bairro: form.bairro,
    cep: onlyDigits(form.cep),
    municipio: form.municipio,
    estado: form.estado,
    creci: tipo === 'corretor' ? form.creci : '',
    cliente: tipo === 'cliente',
    fornecedor: tipo === 'corretor',
    corretor: tipo === 'corretor',
    testemunha: tipo === 'testemunha',
    ...extras
  };
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isDescricaoParcelaGenerica(value) {
  const normalized = normalizeSearch(value).trim();
  return !normalized || /^parcela\s+\d+$/.test(normalized);
}

function normalizarParcelasContrato(parcelas = []) {
  let sequenciaBoleto = 0;

  return parcelas.map((item, index) => {
    const formaRecebimento = String(item.forma_recebimento_prevista || '').trim().toUpperCase();
    const proximaParcela = {
      ...item,
      sequencia: index + 1
    };

    if (formaRecebimento === 'BOLETO') {
      sequenciaBoleto += 1;
      if (isDescricaoParcelaGenerica(proximaParcela.descricao)) {
        proximaParcela.descricao = `Parcela ${sequenciaBoleto}`;
      }
    }

    return proximaParcela;
  });
}

function formatCurrency(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatCurrencyInput(value) {
  if (value == null || String(value).trim() === '') return '';
  const numeric = toNumber(value);
  return numeric > 0 ? formatCurrency(numeric) : '';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function toNumber(value) {
  if (value == null || String(value).trim() === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value || '').trim().replace(/[R$\s]/gi, '');
  if (!raw) return 0;

  let normalized = raw;
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function hasText(value) {
  return String(value ?? '').trim() !== '';
}

function formatMissingFields(fields) {
  if (fields.length <= 1) return fields[0] || '';
  if (fields.length === 2) return `${fields[0]} e ${fields[1]}`;
  return `${fields.slice(0, -1).join(', ')} e ${fields[fields.length - 1]}`;
}

function addMonths(dateString, monthsToAdd) {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  if (!year || !month || !day) return today();
  const target = new Date(year, month - 1 + monthsToAdd, day);
  if (target.getDate() !== day) target.setDate(0);
  return new Date(target.getTime() - target.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getPeriodicidadeConfig(periodicidade, periodicidades = PERIODICIDADES) {
  return periodicidades.find((item) => getOptionValue(item) === periodicidade) || periodicidades[0] || PERIODICIDADES[0];
}

function getModoComposicaoLabel(modo, modos = MODOS_COMPOSICAO) {
  return getOptionLabel(modos.find((item) => getOptionValue(item) === modo)) || 'Composicao';
}

function getModoComposicaoTipo(modo) {
  const normalized = String(modo || '').trim().toUpperCase();
  if (normalized === 'ENTRADA') return 'ENTRADA';
  if (normalized === 'PERIODICO') return 'PERIODICO';
  return 'MANUAL';
}

function buildParcelaCustomizada(index = 1, overrides = {}) {
  return {
    descricao: `Parcela ${index}`,
    tipo_parcela: 'PARCELA',
    reajuste_tipo: 'FIXA',
    data_vencimento: today(),
    competencia_data: '',
    valor: '',
    observacoes: '',
    ...overrides
  };
}

function isFormaComDetalhe(forma) {
  return ['BENS', 'PERMUTA', 'OUTROS'].includes(String(forma || '').toUpperCase());
}

function isChequeForma(forma) {
  return String(forma || '').trim().toUpperCase() === 'CHEQUE';
}

function buildObservacoesParcela(observacoes, detalheFormaRecebimento) {
  const partes = [
    detalheFormaRecebimento ? `Detalhe da forma: ${String(detalheFormaRecebimento).trim()}` : '',
    String(observacoes || '').trim()
  ].filter(Boolean);

  return partes.join('\n');
}

function statusClass(status) {
  switch (String(status || '').toUpperCase()) {
    case 'ATIVO':
      return 'bg-emerald-100 text-emerald-700';
    case 'QUITADO':
      return 'bg-blue-100 text-blue-700';
    case 'INADIMPLENTE':
      return 'bg-amber-100 text-amber-700';
    case 'DISTRATADO':
    case 'CANCELADO':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function documentoTipoLabel(tipo) {
  return TIPOS_DOCUMENTO_MODELO.find((item) => item.value === String(tipo || '').toUpperCase())?.label || tipo || '-';
}

function documentoEstaAssinado(documento) {
  const status = String(documento?.status || '').trim().toUpperCase();
  const d4signStatus = String(documento?.d4sign_status || '').trim().toUpperCase();
  return status === 'ASSINADO'
    || d4signStatus === 'ASSINADO'
    || d4signStatus === 'FINALIZADO'
    || d4signStatus === 'CONCLUIDO'
    || Boolean(documento?.d4sign_finalizado_em);
}

function pickEditForm(contrato = {}) {
  const compradores = normalizeCompradoresForm(
    Array.isArray(contrato.compradores) ? contrato.compradores : [],
    contrato.parceiro_id ? String(contrato.parceiro_id) : ''
  );
  const dataAssinatura = contrato.data_assinatura || contrato.data_contrato || today();
  const possuiCorretor = Boolean(contrato.corretor_parceiro_id);
  const categoriaFinanceiraId = contrato.categoria_financeira_id ? String(contrato.categoria_financeira_id) : '';
  const unidadesNormalizadas = normalizeContratoUnidadesForm(contrato);
  const valorTotalUnidades = roundCurrency(
    unidadesNormalizadas.reduce((total, item) => total + toNumber(item.valor_atribuido), 0)
  );

  return {
    id: contrato.id || null,
    empreendimento_id: contrato.empreendimento_id ? String(contrato.empreendimento_id) : '',
    unidade_comercial_id: contrato.unidade_comercial_id ? String(contrato.unidade_comercial_id) : '',
    unidades: unidadesNormalizadas,
    parceiro_id: contrato.parceiro_id ? String(contrato.parceiro_id) : '',
    compradores,
    corretor_parceiro_id: contrato.corretor_parceiro_id ? String(contrato.corretor_parceiro_id) : '',
    obra_id: contrato.obra_id ? String(contrato.obra_id) : '',
    categoria_financeira_id: categoriaFinanceiraId,
    numero: contrato.numero || '',
    status: contrato.status || 'ATIVO',
    data_contrato: dataAssinatura,
    valor_total: formatCurrencyInput(valorTotalUnidades || contrato.valor_total),
    valor_entrada: formatCurrencyInput(contrato.valor_entrada),
    desconto_concedido: formatCurrencyInput(contrato.desconto_concedido),
    corretor_nome: possuiCorretor ? (contrato.corretorParceiro?.nome || contrato.corretor_nome || '') : '',
    comissao_percentual: possuiCorretor ? (contrato.comissao_percentual || '') : '',
    competencia_comissao_data: possuiCorretor ? dataAssinatura : '',
    possui_vaga_garagem: Boolean(contrato.possui_vaga_garagem),
    quantidade_vagas_garagem: contrato.quantidade_vagas_garagem ? String(contrato.quantidade_vagas_garagem) : '',
    vagas_garagem_posicao_especifica: Boolean(contrato.vagas_garagem_posicao),
    vagas_garagem_posicao: contrato.vagas_garagem_posicao || '',
    local_assinatura: contrato.local_assinatura || '',
    data_assinatura: dataAssinatura,
    testemunha_1_nome: contrato.testemunha_1_nome || '',
    testemunha_1_cpf: contrato.testemunha_1_cpf || '',
    testemunha_2_nome: contrato.testemunha_2_nome || '',
    testemunha_2_cpf: contrato.testemunha_2_cpf || '',
    observacoes: contrato.observacoes || '',
    parcelas: Array.isArray(contrato.parcelas)
      ? contrato.parcelas.map((parcela) => {
        const cheque = parcela.tituloFinanceiro?.chequesTerceiros?.[0] || null;
        return {
          ...parcela,
          competencia_data: dataAssinatura,
          cheque_numero: parcela.cheque_numero || cheque?.numero_cheque || '',
          cheque_titular_nome: parcela.cheque_titular_nome || cheque?.titular_nome || '',
          cheque_titular_documento: parcela.cheque_titular_documento || cheque?.titular_documento || '',
          cheque_banco: parcela.cheque_banco || cheque?.banco || '',
          cheque_agencia: parcela.cheque_agencia || cheque?.agencia || '',
          cheque_conta: parcela.cheque_conta || cheque?.conta || '',
          cheque_data_emissao: parcela.cheque_data_emissao || cheque?.data_emissao || ''
        };
      })
      : []
  };
}

function getStoredContratoDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONTRATO_COMERCIAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.form?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredContratoDraft(payload) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONTRATO_COMERCIAL_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // localStorage pode estar indisponivel em alguns navegadores corporativos.
  }
}

function clearStoredContratoDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CONTRATO_COMERCIAL_DRAFT_KEY);
  } catch {
    // Sem acao: a limpeza visual do formulario continua funcionando.
  }
}

function resolveGeneratorByModo(modo, current = {}) {
  const tipoModo = getModoComposicaoTipo(modo);
  if (tipoModo === 'ENTRADA') {
    return {
      ...current,
      modo,
      titulo_bloco: current.titulo_bloco || 'Entrada',
      tipo_parcela: 'ENTRADA',
      periodicidade: 'AVISTA',
      quantidade_parcelas: '1'
    };
  }

  return { ...current, modo };
}

function gerarParcelasDoBloco(plano = {}, planoId = '', periodicidades = PERIODICIDADES, competenciaAssinatura = '') {
  const tipoModo = getModoComposicaoTipo(plano.modo);
  const formaRecebimento = plano.forma_recebimento_prevista || '';
  const tituloBase = String(plano.titulo_bloco || '').trim();
  const tipoParcelaPadrao = plano.tipo_parcela || 'PARCELA';
  const periodicidade = getPeriodicidadeConfig(plano.periodicidade, periodicidades);
  const planoPeriodicidade = tipoModo === 'MANUAL'
    ? ''
    : (tipoModo === 'ENTRADA' ? 'AVISTA' : plano.periodicidade || '');

  if (!competenciaAssinatura) {
    return { error: 'Informe a data de assinatura do contrato para definir a competencia DRE.' };
  }

  function withPlanoMetadata(parcela, index, intervalMonths = null) {
    return {
      ...parcela,
      plano_pagamento_id: planoId || plano.id || '',
      plano_parcela_index: index,
      plano_periodicidade: planoPeriodicidade,
      plano_interval_months: intervalMonths,
      competencia_data: competenciaAssinatura,
      cheque_numero: parcela.cheque_numero || '',
      cheque_titular_nome: parcela.cheque_titular_nome || '',
      cheque_titular_documento: parcela.cheque_titular_documento || '',
      cheque_banco: parcela.cheque_banco || '',
      cheque_agencia: parcela.cheque_agencia || '',
      cheque_conta: parcela.cheque_conta || '',
      cheque_data_emissao: parcela.cheque_data_emissao || ''
    };
  }

  if (tipoModo === 'ENTRADA') {
    const valorEntrada = toNumber(plano.valor_parcela);
    if (valorEntrada <= 0 || !plano.primeiro_vencimento) {
      return { error: 'Informe valor e vencimento da entrada.' };
    }

    const parcela = withPlanoMetadata({
      descricao: tituloBase || 'Entrada',
      tipo_parcela: 'ENTRADA',
      forma_recebimento_prevista: formaRecebimento,
      reajuste_tipo: plano.reajuste_tipo || 'FIXA',
      data_vencimento: plano.primeiro_vencimento,
      competencia_data: competenciaAssinatura,
      valor: valorEntrada.toFixed(2),
      observacoes: buildObservacoesParcela('', plano.detalhe_forma_recebimento)
    }, 0, 0);

    return {
      parcelas: [parcela],
      total: roundCurrency(valorEntrada)
    };
  }

  if (tipoModo === 'MANUAL') {
    const parcelas = (plano.parcelas_personalizadas || [])
      .map((item, index) => ({
        descricao: item.descricao || (tituloBase ? `${tituloBase} ${index + 1}` : `Lancamento ${index + 1}`),
        tipo_parcela: item.tipo_parcela || tipoParcelaPadrao,
        forma_recebimento_prevista: formaRecebimento,
        reajuste_tipo: item.reajuste_tipo || plano.reajuste_tipo || 'FIXA',
        data_vencimento: item.data_vencimento,
        competencia_data: competenciaAssinatura,
        valor: toNumber(item.valor).toFixed(2),
        observacoes: buildObservacoesParcela(item.observacoes, plano.detalhe_forma_recebimento)
      }))
      .filter((item) => item.data_vencimento && toNumber(item.valor) > 0);

    if (!parcelas.length) {
      return { error: 'Informe ao menos um lancamento manual com vencimento e valor.' };
    }

    return {
      parcelas: parcelas.map((item, index) => withPlanoMetadata(item, index, null)),
      total: roundCurrency(parcelas.reduce((acc, item) => acc + toNumber(item.valor), 0))
    };
  }

  const periodicidadeValue = getOptionValue(periodicidade);
  const intervalMonths = Number.isFinite(Number(periodicidade.intervalMonths)) ? Number(periodicidade.intervalMonths) : 0;
  const quantidade = periodicidadeValue === 'AVISTA'
    ? 1
    : Math.max(0, Number(plano.quantidade_parcelas || 0));
  const valorParcela = toNumber(plano.valor_parcela);

  if (!quantidade || valorParcela <= 0) {
    return { error: 'Informe quantidade e valor validos para a composicao periodica.' };
  }

  const parcelas = Array.from({ length: quantidade }).map((_, index) => withPlanoMetadata({
    descricao: tituloBase ? `${tituloBase} ${index + 1}` : `Parcela ${index + 1}`,
    tipo_parcela: tipoParcelaPadrao,
    forma_recebimento_prevista: formaRecebimento,
    reajuste_tipo: plano.reajuste_tipo || 'FIXA',
    data_vencimento: addMonths(plano.primeiro_vencimento || today(), index * intervalMonths),
    competencia_data: competenciaAssinatura,
    valor: valorParcela.toFixed(2),
    observacoes: buildObservacoesParcela('', plano.detalhe_forma_recebimento)
  }, index, intervalMonths));

  return {
    parcelas,
    total: roundCurrency(parcelas.reduce((acc, item) => acc + toNumber(item.valor), 0))
  };
}

export default function ComercialContratos() {
  const { user } = useAuth();
  const [draftLoaded] = useState(() => getStoredContratoDraft());
  const [form, setForm] = useState(() => {
    if (!draftLoaded?.form) return defaultForm();
    const unidadesNormalizadas = normalizeContratoUnidadesForm(draftLoaded.form);
    return atualizarFormComUnidades({
      ...defaultForm(),
      ...draftLoaded.form,
      unidades: unidadesNormalizadas
    }, unidadesNormalizadas);
  });
  const [generator, setGenerator] = useState(() => draftLoaded?.generator || defaultGenerator());
  const [paymentPlans, setPaymentPlans] = useState(() => (
    Array.isArray(draftLoaded?.paymentPlans) ? draftLoaded.paymentPlans : []
  ));
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [corretores, setCorretores] = useState([]);
  const [testemunhas, setTestemunhas] = useState([]);
  const [obras, setObras] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaConfig, setCategoriaConfig] = useState({
    contrato_venda_categoria_ids: [],
    comissao_categoria_id: null,
    opcoes_pagamento: {}
  });
  const [categoriaConfigLoaded, setCategoriaConfigLoaded] = useState(false);
  const [contratos, setContratos] = useState([]);
  const [modelosContrato, setModelosContrato] = useState([]);
  const [documentosContrato, setDocumentosContrato] = useState([]);
  const [contratoSelecionado, setContratoSelecionado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const submitInFlightRef = useRef(false);
  const [processingAction, setProcessingAction] = useState('');
  const [parcelaEditandoIndex, setParcelaEditandoIndex] = useState(null);
  const [showDistrato, setShowDistrato] = useState(false);
  const [showTroca, setShowTroca] = useState(false);
  const [pessoaRapidaModal, setPessoaRapidaModal] = useState(null);
  const [pessoaRapidaForm, setPessoaRapidaForm] = useState(defaultPessoaRapidaForm());
  const [compradorSelecionarId, setCompradorSelecionarId] = useState('');
  const [mostrarCompradorAdicional, setMostrarCompradorAdicional] = useState(false);
  const [testemunhaRapidaSlot, setTestemunhaRapidaSlot] = useState(null);
  const [distratoForm, setDistratoForm] = useState(defaultDistratoForm());
  const [trocaForm, setTrocaForm] = useState(defaultTrocaForm());
  const [contratoAssinadoArquivo, setContratoAssinadoArquivo] = useState(null);
  const [error, setError] = useState('');

  async function carregar() {
    try {
      setLoading(true);
      setError('');
      const [empreData, unidData, clientesData, corretoresData, testemunhasData, obrasData, categoriasData, contratosData, modelosData] = await Promise.all([
        getEmpreendimentosComerciais({ ativo: 1 }),
        getUnidadesComerciais({ ativo: 1 }),
        buscarParceiros({ cliente: 1, ativo: 1, limit: 'all' }),
        buscarParceiros({ corretor: 1, ativo: 1, limit: 300 }),
        buscarParceiros({ testemunha: 1, ativo: 1, limit: 300 }),
        getObrasComerciais(),
        getCategoriasFinanceirasComercial(),
        getContratosComerciais(),
        getModelosContratoComercial().catch(() => [])
      ]);
      setEmpreendimentos(Array.isArray(empreData) ? empreData : []);
      setUnidades(Array.isArray(unidData) ? unidData : []);
      setClientes(Array.isArray(clientesData) ? clientesData : []);
      setCorretores(Array.isArray(corretoresData) ? corretoresData : []);
      setTestemunhas(Array.isArray(testemunhasData) ? testemunhasData : []);
      setObras(Array.isArray(obrasData) ? obrasData : []);
      const categoriasPayload = Array.isArray(categoriasData?.categorias)
        ? categoriasData.categorias
        : (Array.isArray(categoriasData) ? categoriasData : []);
      const categoriaConfigData = categoriasData?.config || null;
      setCategorias(categoriasPayload);
      if (categoriaConfigData) {
        setCategoriaConfig({
          contrato_venda_categoria_ids: Array.isArray(categoriaConfigData.contrato_venda_categoria_ids)
            ? categoriaConfigData.contrato_venda_categoria_ids.map(Number)
            : [],
          comissao_categoria_id: categoriaConfigData.comissao_categoria_id
            ? Number(categoriaConfigData.comissao_categoria_id)
            : null,
          opcoes_pagamento: categoriaConfigData.opcoes_pagamento || {}
        });
        setCategoriaConfigLoaded(true);
      } else {
        setCategoriaConfigLoaded(false);
      }
      setContratos(Array.isArray(contratosData) ? contratosData : []);
      setModelosContrato(Array.isArray(modelosData) ? modelosData : []);
    } catch (err) {
      setError(err?.message || 'Erro ao carregar contratos comerciais');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (form.id) return;
    saveStoredContratoDraft({ form, generator, paymentPlans });
  }, [form, generator, paymentPlans]);

  const unidadesDoEmpreendimento = useMemo(() => {
    const unidadesBase = form.empreendimento_id
      ? unidades.filter((item) => String(item.empreendimento_id) === String(form.empreendimento_id))
      : unidades;

    return unidadesBase.filter((item) => {
      const situacao = String(item.situacao || '').trim().toUpperCase();
      const unidadeAtualDoContrato = form.id && (form.unidades || []).some((row) => String(item.id) === String(row.unidade_comercial_id));
      return unidadeAtualDoContrato || situacao !== 'VENDIDA';
    });
  }, [form.empreendimento_id, form.id, form.unidades, unidades]);

  const empreendimentoSelecionado = useMemo(
    () => empreendimentos.find((item) => String(item.id) === String(form.empreendimento_id)),
    [empreendimentos, form.empreendimento_id]
  );

  const unidadesSelecionadas = useMemo(
    () => (form.unidades || [])
      .map((row) => unidades.find((item) => String(item.id) === String(row.unidade_comercial_id)))
      .filter(Boolean),
    [form.unidades, unidades]
  );

  const numeroContratoCalculado = useMemo(
    () => buildContratoNumeroMulti(empreendimentoSelecionado, unidadesSelecionadas),
    [empreendimentoSelecionado, unidadesSelecionadas]
  );

  useEffect(() => {
    if (form.id || !numeroContratoCalculado || form.numero === numeroContratoCalculado) return;
    setForm((current) => ({ ...current, numero: numeroContratoCalculado }));
  }, [form.id, form.numero, numeroContratoCalculado]);

  const obraSelecionada = useMemo(
    () => obras.find((item) => String(item.id) === String(form.obra_id)),
    [form.obra_id, obras]
  );

  const categoriasCompativeis = useMemo(
    () => {
      const permitidas = new Set((categoriaConfig.contrato_venda_categoria_ids || []).map(Number));
      return categorias.filter((item) => {
        const compativel = ['RECEBER', 'AMBOS'].includes(String(item.tipo || '').toUpperCase());
        const classificadaDre = item?.considera_dre !== false && String(item?.dre_grupo || '').trim();
        return compativel && classificadaDre && (!categoriaConfigLoaded || permitidas.has(Number(item.id)));
      });
    },
    [categorias, categoriaConfig.contrato_venda_categoria_ids, categoriaConfigLoaded]
  );

  const compradoresContrato = useMemo(() => {
    const mapaClientes = new Map(clientes.map((cliente) => [String(cliente.id), cliente]));
    return normalizeCompradoresForm(form.compradores, form.parceiro_id).map((item) => ({
      ...item,
      parceiro: mapaClientes.get(String(item.parceiro_id)) || item.parceiro || null
    }));
  }, [clientes, form.compradores, form.parceiro_id]);

  const clientesDisponiveisComprador = useMemo(() => {
    const selecionados = new Set(compradoresContrato.map((item) => String(item.parceiro_id)));
    return clientes.filter((cliente) => !selecionados.has(String(cliente.id)));
  }, [clientes, compradoresContrato]);

  const opcoesPagamentoConfig = categoriaConfig.opcoes_pagamento || {};
  const modosComposicao = useMemo(
    () => filterOptionsByActive(resolveOptionCatalog(opcoesPagamentoConfig.modos, MODOS_COMPOSICAO), opcoesPagamentoConfig.modos_ativos),
    [opcoesPagamentoConfig.modos, opcoesPagamentoConfig.modos_ativos]
  );
  const parcelaTipos = useMemo(
    () => filterOptionsByActive(resolveOptionCatalog(opcoesPagamentoConfig.tipos_parcela, PARCELA_TIPOS), opcoesPagamentoConfig.tipos_parcela_ativos),
    [opcoesPagamentoConfig.tipos_parcela, opcoesPagamentoConfig.tipos_parcela_ativos]
  );
  const formasRecebimento = useMemo(
    () => filterOptionsByActive(resolveOptionCatalog(opcoesPagamentoConfig.formas_recebimento, FORMAS_RECEBIMENTO), opcoesPagamentoConfig.formas_recebimento_ativas),
    [opcoesPagamentoConfig.formas_recebimento, opcoesPagamentoConfig.formas_recebimento_ativas]
  );
  const parcelaReajusteTipos = useMemo(
    () => filterOptionsByActive(resolveOptionCatalog(opcoesPagamentoConfig.reajustes, PARCELA_REAJUSTE_TIPOS), opcoesPagamentoConfig.reajustes_ativos),
    [opcoesPagamentoConfig.reajustes, opcoesPagamentoConfig.reajustes_ativos]
  );
  const periodicidades = useMemo(
    () => filterOptionsByActive(resolveOptionCatalog(opcoesPagamentoConfig.periodicidades, PERIODICIDADES), opcoesPagamentoConfig.periodicidades_ativas),
    [opcoesPagamentoConfig.periodicidades, opcoesPagamentoConfig.periodicidades_ativas]
  );

  useEffect(() => {
    setGenerator((current) => {
      let next = current;
      const ensure = (condition, patch) => {
        if (!condition) {
          next = { ...next, ...patch };
        }
      };

      ensure(!modosComposicao.length || optionIsAvailable(modosComposicao, next.modo), { modo: firstOptionValue(modosComposicao, next.modo) });
      const tipoModo = getModoComposicaoTipo(next.modo);
      if (tipoModo !== 'ENTRADA') {
        ensure(!parcelaTipos.length || optionIsAvailable(parcelaTipos, next.tipo_parcela), { tipo_parcela: firstOptionValue(parcelaTipos, next.tipo_parcela) });
      }
      ensure(!formasRecebimento.length || !next.forma_recebimento_prevista || optionIsAvailable(formasRecebimento, next.forma_recebimento_prevista), {
        forma_recebimento_prevista: firstOptionValue(formasRecebimento, '')
      });
      ensure(!parcelaReajusteTipos.length || optionIsAvailable(parcelaReajusteTipos, next.reajuste_tipo), {
        reajuste_tipo: firstOptionValue(parcelaReajusteTipos, next.reajuste_tipo)
      });
      if (tipoModo === 'PERIODICO') {
        ensure(!periodicidades.length || optionIsAvailable(periodicidades, next.periodicidade), {
          periodicidade: firstOptionValue(periodicidades, next.periodicidade)
        });
      }

      const parcelasAtuais = next.parcelas_personalizadas || [];
      const parcelasPersonalizadas = parcelasAtuais.map((item) => {
        let parcela = item;
        if (parcelaTipos.length && !optionIsAvailable(parcelaTipos, parcela.tipo_parcela)) {
          parcela = { ...parcela, tipo_parcela: firstOptionValue(parcelaTipos, parcela.tipo_parcela) };
        }
        if (parcelaReajusteTipos.length && !optionIsAvailable(parcelaReajusteTipos, parcela.reajuste_tipo)) {
          parcela = { ...parcela, reajuste_tipo: firstOptionValue(parcelaReajusteTipos, parcela.reajuste_tipo) };
        }
        return parcela;
      });

      if (parcelasPersonalizadas.some((item, index) => item !== parcelasAtuais[index])) {
        next = { ...next, parcelas_personalizadas: parcelasPersonalizadas };
      }

      return next === current ? current : resolveGeneratorByModo(next.modo, next);
    });
  }, [formasRecebimento, modosComposicao, parcelaReajusteTipos, parcelaTipos, periodicidades]);

  const contratosFiltrados = useMemo(() => {
    const termo = normalizeSearch(busca);
    return contratos.filter((item) => {
      if (statusFiltro && String(item.status) !== statusFiltro) return false;
      if (!termo) return true;
      const blob = normalizeSearch([
        item.numero,
        item.cliente?.nome,
        getContratoUnidadesLabel(item),
        item.empreendimento?.nome,
        item.corretor_nome
      ].filter(Boolean).join(' '));
      return blob.includes(termo);
    });
  }, [busca, contratos, statusFiltro]);

  const totalParcelas = useMemo(
    () => form.parcelas.reduce((acc, item) => acc + toNumber(item.valor || item.valor_original), 0),
    [form.parcelas]
  );
  const valorEntradaComposicao = useMemo(
    () => form.parcelas
      .filter((item) => String(item.tipo_parcela || '').toUpperCase() === 'ENTRADA')
      .reduce((acc, item) => acc + toNumber(item.valor || item.valor_original), 0),
    [form.parcelas]
  );

  const valorTotalContrato = useMemo(() => toNumber(form.valor_total), [form.valor_total]);
  const diferencaComposicao = useMemo(
    () => roundCurrency(valorTotalContrato - totalParcelas),
    [valorTotalContrato, totalParcelas]
  );

  const unidadesElegiveisTroca = useMemo(() => {
    if (!contratoSelecionado?.unidade_comercial_id) return [];
    const idsAtuais = new Set((contratoSelecionado.unidades || [])
      .map((item) => String(item.unidade_comercial_id)));
    if (!idsAtuais.size && contratoSelecionado.unidade_comercial_id) idsAtuais.add(String(contratoSelecionado.unidade_comercial_id));
    return unidades.filter((item) =>
      !idsAtuais.has(String(item.id))
      && String(item.ativo) !== 'false'
      && !['VENDIDA', 'BLOQUEADA'].includes(String(item.situacao || '').toUpperCase())
    );
  }, [contratoSelecionado?.unidade_comercial_id, contratoSelecionado?.unidades, unidades]);

  const modelosDoContratoSelecionado = useMemo(() => {
    if (!contratoSelecionado?.empreendimento_id) return [];
    return modelosContrato.filter((item) =>
      Number(item.empreendimento_id) === Number(contratoSelecionado.empreendimento_id)
      && String(item.tipo_documento || '').toUpperCase() === 'CONTRATO'
    );
  }, [contratoSelecionado?.empreendimento_id, modelosContrato]);

  const possuiModeloQuadroResumoSelecionado = useMemo(() => {
    if (!contratoSelecionado?.empreendimento_id) return false;
    return modelosContrato.some((item) =>
      Number(item.empreendimento_id) === Number(contratoSelecionado.empreendimento_id)
      && String(item.tipo_documento || '').toUpperCase() === 'QUADRO_RESUMO'
    );
  }, [contratoSelecionado?.empreendimento_id, modelosContrato]);

  const documentosContratoPadrao = useMemo(
    () => documentosContrato.filter((item) => ['CONTRATO', 'CONTRATO_ASSINADO'].includes(String(item.tipo_documento || '').toUpperCase())),
    [documentosContrato]
  );

  const possuiContratoAssinado = useMemo(
    () => documentosContratoPadrao.some((item) => documentoEstaAssinado(item)),
    [documentosContratoPadrao]
  );

  const isSuperadmin = useMemo(
    () => String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN',
    [user?.perfil]
  );

  const podeImportarSienge = useMemo(() => canImportComercialContratos(user), [user]);

  const totalValorUnidades = useMemo(
    () => roundCurrency((form.unidades || []).reduce((sum, item) => sum + toNumber(item.valor_atribuido), 0)),
    [form.unidades]
  );

  function aplicarPlanosAoContrato(planos) {
    const parcelas = normalizarParcelasContrato(planos.flatMap((plano) =>
      (plano.parcelas_geradas || []).map((item) => ({ ...item }))
    ));
    const total = roundCurrency(parcelas.reduce((acc, item) => acc + toNumber(item.valor), 0));

    setParcelaEditandoIndex(null);
    setForm((current) => ({
      ...current,
      parcelas: parcelas.map((item) => ({
        ...item,
        competencia_data: current.data_assinatura
      })),
      valor_total: current.valor_total ? current.valor_total : (total > 0 ? formatCurrencyInput(total) : '')
    }));
  }

  function handleDataAssinaturaChange(value) {
    setForm((current) => ({
      ...current,
      data_assinatura: value,
      data_contrato: value,
      competencia_comissao_data: current.corretor_parceiro_id ? value : '',
      parcelas: (current.parcelas || []).map((item) => ({
        ...item,
        competencia_data: value
      }))
    }));
    setPaymentPlans((current) => current.map((plano) => ({
      ...plano,
      competencia_data: value,
      parcelas_geradas: (plano.parcelas_geradas || []).map((item) => ({
        ...item,
        competencia_data: value
      }))
    })));
    setGenerator((current) => ({
      ...current,
      competencia_data: value,
      parcelas_personalizadas: (current.parcelas_personalizadas || []).map((item) => ({
        ...item,
        competencia_data: value
      }))
    }));
  }

  function selecionarEmpreendimentoContrato(empreendimentoId) {
    const empreendimento = empreendimentos.find((item) => String(item.id) === String(empreendimentoId));
    setForm((current) => ({
      ...current,
      empreendimento_id: empreendimentoId,
      unidade_comercial_id: '',
      unidades: [defaultContratoUnidade()],
      obra_id: empreendimento?.obra_id ? String(empreendimento.obra_id) : '',
      numero: '',
      valor_total: ''
    }));
  }

  function atualizarUnidadeContrato(index, unidadeId) {
    const unidade = unidades.find((item) => String(item.id) === String(unidadeId));
    const referencia = getUnidadeValorReferencia(unidade);
    setForm((current) => {
      const proximas = (current.unidades || []).map((item, itemIndex) => itemIndex === index ? {
        ...item,
        unidade_comercial_id: unidadeId,
        valor_cadastro_referencia: referencia ? formatCurrencyInput(referencia) : '',
        valor_atribuido: referencia ? formatCurrencyInput(referencia) : ''
      } : item);
      const principal = proximas.find((item) => item.principal) || proximas[0];
      return atualizarFormComUnidades({
        ...current,
        unidade_comercial_id: principal?.unidade_comercial_id || ''
      }, proximas);
    });
  }

  function adicionarUnidadeContrato() {
    setForm((current) => ({
      ...current,
      unidades: [...(current.unidades || []), { ...defaultContratoUnidade(), principal: false }]
    }));
  }

  function removerUnidadeContrato(index) {
    setForm((current) => {
      let proximas = (current.unidades || []).filter((_, itemIndex) => itemIndex !== index);
      if (!proximas.length) proximas = [defaultContratoUnidade()];
      if (!proximas.some((item) => item.principal)) proximas = proximas.map((item, itemIndex) => ({ ...item, principal: itemIndex === 0 }));
      const principal = proximas.find((item) => item.principal) || proximas[0];
      return atualizarFormComUnidades({
        ...current,
        unidade_comercial_id: principal?.unidade_comercial_id || ''
      }, proximas);
    });
  }

  function definirUnidadePrincipal(index) {
    setForm((current) => {
      const proximas = (current.unidades || []).map((item, itemIndex) => ({ ...item, principal: itemIndex === index }));
      return { ...current, unidades: proximas, unidade_comercial_id: proximas[index]?.unidade_comercial_id || '' };
    });
  }

  function adicionarFormaPagamento() {
    if (isFormaComDetalhe(generator.forma_recebimento_prevista) && !String(generator.detalhe_forma_recebimento || '').trim()) {
      setError('Descreva o bem, a permuta ou o outro recebimento antes de adicionar a forma de pagamento.');
      return;
    }

    const planoId = `${Date.now()}-${Math.random()}`;
    const resultado = gerarParcelasDoBloco(generator, planoId, periodicidades, form.data_assinatura);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    const proximoPlano = {
      id: planoId,
      ...generator,
      parcelas_geradas: resultado.parcelas,
      total_bloco: resultado.total
    };
    const proximosPlanos = [...paymentPlans, proximoPlano];

    setError('');
    setPaymentPlans(proximosPlanos);
    aplicarPlanosAoContrato(proximosPlanos);
    setGenerator(defaultGenerator());
  }

  function removerFormaPagamento(planoId) {
    const proximosPlanos = paymentPlans.filter((item) => item.id !== planoId);
    setPaymentPlans(proximosPlanos);
    setParcelaEditandoIndex(null);
    aplicarPlanosAoContrato(proximosPlanos);
  }

  function updateParcelaCustomizada(index, field, value) {
    setGenerator((current) => {
      const parcelasPersonalizadas = [...(current.parcelas_personalizadas || [])];
      parcelasPersonalizadas[index] = {
        ...parcelasPersonalizadas[index],
        [field]: value
      };
      return {
        ...current,
        parcelas_personalizadas: parcelasPersonalizadas
      };
    });
  }

  function adicionarParcelaCustomizada() {
    setGenerator((current) => ({
      ...current,
      parcelas_personalizadas: [
        ...(current.parcelas_personalizadas || []),
        buildParcelaCustomizada((current.parcelas_personalizadas || []).length + 1)
      ]
    }));
  }

  function removerParcelaCustomizada(index) {
    setGenerator((current) => {
      const parcelasPersonalizadas = (current.parcelas_personalizadas || []).filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        parcelas_personalizadas: parcelasPersonalizadas.length
          ? parcelasPersonalizadas
          : [buildParcelaCustomizada(1)]
      };
    });
  }

  function updateParcela(index, field, value) {
    setForm((current) => {
      const parcelas = [...current.parcelas];
      const parcelaAtual = parcelas[index] || {};
      const planoId = parcelaAtual.plano_pagamento_id;

      parcelas[index] = { ...parcelaAtual, [field]: value };

      if (field === 'data_vencimento' && value && planoId && Number(parcelaAtual.plano_interval_months) > 0) {
        const intervalo = Number(parcelaAtual.plano_interval_months);
        const indiceBase = Number(parcelaAtual.plano_parcela_index || 0);

        parcelas.forEach((parcela, parcelaIndex) => {
          if (
            parcelaIndex !== index
            && parcela.plano_pagamento_id === planoId
            && Number(parcela.plano_parcela_index || 0) > indiceBase
          ) {
            parcelas[parcelaIndex] = {
              ...parcela,
              data_vencimento: addMonths(value, (Number(parcela.plano_parcela_index || 0) - indiceBase) * intervalo)
            };
          }
        });
      }

      const parcelasNormalizadas = normalizarParcelasContrato(parcelas);
      if (planoId) {
        setPaymentPlans((plans) => plans.map((plano) => {
          if (plano.id !== planoId) return plano;
          const parcelasGeradas = parcelasNormalizadas
            .filter((parcela) => parcela.plano_pagamento_id === planoId)
            .map((parcela) => ({ ...parcela }));
          return {
            ...plano,
            parcelas_geradas: parcelasGeradas,
            total_bloco: roundCurrency(parcelasGeradas.reduce((acc, item) => acc + toNumber(item.valor || item.valor_original), 0))
          };
        }));
      }

      return {
        ...current,
        parcelas: parcelasNormalizadas
      };
    });
  }

  function ajustarParcelaParaFechamento(index) {
    const parcela = form.parcelas[index];
    if (!parcela) return;

    if (Math.abs(diferencaComposicao) <= 0.009) {
      setError('As formas de pagamento ja fecham o valor total do contrato.');
      return;
    }

    const valorAtual = toNumber(parcela.valor || parcela.valor_original);
    const novoValor = roundCurrency(valorAtual + diferencaComposicao);

    if (novoValor < 0) {
      setError('A diferenca e maior que o valor desta parcela. Escolha outra parcela para ajustar o fechamento.');
      return;
    }

    setError('');
    setParcelaEditandoIndex(index);
    updateParcela(index, 'valor', formatCurrencyInput(novoValor));
  }

  function limparFormasPagamentoContrato() {
    setError('');
    setParcelaEditandoIndex(null);
    setGenerator(defaultGenerator());
    setPaymentPlans([]);
    setForm((current) => ({
      ...current,
      parcelas: [],
      valor_entrada: ''
    }));
  }

  function limparDadosContrato({ confirmar = true } = {}) {
    if (confirmar) {
      const confirmado = window.confirm('Limpar todos os dados preenchidos deste contrato? Esta acao tambem apaga as formas de pagamento do rascunho.');
      if (!confirmado) return;
    }

    clearStoredContratoDraft();
    setError('');
    setParcelaEditandoIndex(null);
    setForm(defaultForm());
    setGenerator(defaultGenerator());
    setPaymentPlans([]);
  }

  async function carregarDocumentosContrato(contratoId) {
    if (!contratoId) {
      setDocumentosContrato([]);
      return [];
    }

    const data = await getDocumentosContratoComercial(contratoId);
    const lista = Array.isArray(data) ? data : [];
    setDocumentosContrato(lista);
    return lista;
  }

  async function selecionarContrato(id) {
    try {
      const detalhe = await getContratoComercialById(id);
      setContratoSelecionado(detalhe);
      await carregarDocumentosContrato(id);
      setShowDistrato(false);
      setShowTroca(false);
      setDistratoForm(defaultDistratoForm());
      setTrocaForm((current) => ({
        ...defaultTrocaForm(),
        novo_valor_total: formatCurrencyInput(detalhe?.valor_total)
      }));
      return detalhe;
    } catch (err) {
      setError(err?.message || 'Erro ao carregar detalhe do contrato');
      return null;
    }
  }

  async function editarContrato(id) {
    const detalhe = await selecionarContrato(id);
    if (!detalhe) return;
    setPaymentPlans([]);
    setForm(pickEditForm(detalhe));
  }

  async function handleSincronizarStatusFinanceiro(id) {
    try {
      setProcessingAction('sync');
      setError('');
      const data = await sincronizarStatusFinanceiroContratoComercial(id);
      setContratoSelecionado(data);
      await carregar();
    } catch (err) {
      setError(err?.message || 'Erro ao sincronizar status financeiro do contrato');
    } finally {
      setProcessingAction('');
    }
  }

  async function handleDistratarContrato() {
    if (!contratoSelecionado?.id) return;
    try {
      setProcessingAction('distrato');
      setError('');
      const data = await distratarContratoComercial(contratoSelecionado.id, distratoForm);
      setContratoSelecionado(data);
      setShowDistrato(false);
      setDistratoForm(defaultDistratoForm());
      await carregar();
    } catch (err) {
      setError(err?.message || 'Erro ao distratar contrato');
    } finally {
      setProcessingAction('');
    }
  }

  async function handleTrocaUnidadeContrato() {
    if (!contratoSelecionado?.id) return;
    if ((contratoSelecionado.unidades || []).length > 1 && !trocaForm.unidade_comercial_origem_id) {
      setError('Selecione qual unidade do contrato sera trocada.');
      return;
    }
    if (!trocaForm.unidade_comercial_destino_id) {
      setError('Selecione a nova unidade.');
      return;
    }
    const novoValor = toNumber(trocaForm.novo_valor_total);
    const valorAtual = toNumber(contratoSelecionado.valor_total);
    if (novoValor > valorAtual && !hasText(trocaForm.competencia_data)) {
      setError('Informe a competencia DRE do ajuste quando a troca aumentar o valor do contrato.');
      return;
    }
    try {
      setProcessingAction('troca');
      setError('');
      const data = await trocarUnidadeContratoComercial(contratoSelecionado.id, trocaForm);
      setContratoSelecionado(data);
      setShowTroca(false);
      setTrocaForm({
        ...defaultTrocaForm(),
        novo_valor_total: formatCurrencyInput(data?.valor_total)
      });
      await carregar();
    } catch (err) {
      setError(err?.message || 'Erro ao trocar unidade do contrato');
    } finally {
      setProcessingAction('');
    }
  }

  async function handleExcluirContrato() {
    if (!contratoSelecionado?.id) return;

    const confirmado = window.confirm(
      'Excluir este contrato comercial? Esta acao cancela os titulos ainda sem baixa, libera a unidade e nao pode ser desfeita.'
    );
    if (!confirmado) return;

    try {
      setProcessingAction('excluir');
      setError('');
      await excluirContratoComercial(contratoSelecionado.id);
      setContratoSelecionado(null);
      setDocumentosContrato([]);
      setShowDistrato(false);
      setShowTroca(false);
      if (String(form.id || '') === String(contratoSelecionado.id)) {
        limparDadosContrato({ confirmar: false });
      }
      await carregar();
      window.alert('Contrato excluido com sucesso.');
    } catch (err) {
      setError(err?.message || 'Erro ao excluir contrato comercial');
    } finally {
      setProcessingAction('');
    }
  }

  async function handleGerarDocumentoContrato() {
    if (!contratoSelecionado?.id) return;
    try {
      setProcessingAction('gerar-documento');
      setError('');
      const payload = {
        tipo_documento: 'CONTRATO'
      };
      const documentoGerado = await gerarDocumentoContratoComercial(contratoSelecionado.id, payload);
      await carregarDocumentosContrato(contratoSelecionado.id);
      if (documentoGerado?.id) {
        await abrirDocumentoContrato(documentoGerado.id, 'pdf');
      }
    } catch (err) {
      setError(err?.message || 'Erro ao gerar documento do contrato');
    } finally {
      setProcessingAction('');
    }
  }

  async function abrirDocumentoContrato(documentoId, tipo = 'pdf') {
    try {
      setError('');
      const data = await getLinkDocumentoContratoComercial(documentoId, tipo);
      if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err?.message || 'Erro ao abrir documento');
    }
  }

  async function handleExcluirDocumentoContrato(documento) {
    if (!documento?.id || !contratoSelecionado?.id) return;

    const confirmado = window.confirm(
      'Excluir este PDF gerado? O contrato comercial continua cadastrado, mas este documento sai da lista.'
    );
    if (!confirmado) return;

    try {
      setProcessingAction(`excluir-doc-${documento.id}`);
      setError('');
      await excluirDocumentoContratoComercial(documento.id);
      await carregarDocumentosContrato(contratoSelecionado.id);
      window.alert('Documento gerado excluido com sucesso.');
    } catch (err) {
      setError(err?.message || 'Erro ao excluir documento do contrato');
    } finally {
      setProcessingAction('');
    }
  }

  async function handleAnexarContratoAssinado() {
    if (!contratoSelecionado?.id || !contratoAssinadoArquivo) return;
    try {
      setProcessingAction('anexar-assinado');
      setError('');
      await anexarContratoAssinadoComercial(contratoSelecionado.id, contratoAssinadoArquivo);
      setContratoAssinadoArquivo(null);
      await carregarDocumentosContrato(contratoSelecionado.id);
    } catch (err) {
      setError(err?.message || 'Erro ao anexar contrato assinado');
    } finally {
      setProcessingAction('');
    }
  }

  function abrirCadastroRapidoPessoa(tipo, options = {}) {
    setPessoaRapidaForm(defaultPessoaRapidaForm(tipo));
    setPessoaRapidaModal(tipo);
    setTestemunhaRapidaSlot(tipo === 'testemunha' ? options.slot || null : null);
  }

  function selecionarClientePrincipal(parceiroId) {
    setForm((current) => ({
      ...current,
      parceiro_id: parceiroId,
      compradores: normalizeCompradoresForm(current.compradores, parceiroId)
    }));
  }

  function adicionarComprador(parceiroId = compradorSelecionarId) {
    const id = String(parceiroId || '').trim();
    if (!id) return;

    setForm((current) => ({
      ...current,
      compradores: normalizeCompradoresForm([
        ...(current.compradores || []),
        { parceiro_id: id }
      ], current.parceiro_id || id),
      parceiro_id: current.parceiro_id || id
    }));
    setCompradorSelecionarId('');
    setMostrarCompradorAdicional(false);
  }

  function removerComprador(parceiroId) {
    const id = String(parceiroId || '').trim();
    if (!id || id === String(form.parceiro_id)) return;

    setForm((current) => ({
      ...current,
      compradores: normalizeCompradoresForm(
        (current.compradores || []).filter((item) => String(item.parceiro_id) !== id),
        current.parceiro_id
      )
    }));
  }

  function aplicarTestemunha(slot, testemunha) {
    if (!slot || !testemunha) return;
    const prefix = slot === 2 ? 'testemunha_2' : 'testemunha_1';
    setForm((current) => ({
      ...current,
      [`${prefix}_nome`]: testemunha.nome || '',
      [`${prefix}_cpf`]: maskCpfCnpj(testemunha.cpf_cnpj || '')
    }));
  }

  function getTestemunhaSelecionadaId(slot) {
    const cpf = onlyDigits(slot === 2 ? form.testemunha_2_cpf : form.testemunha_1_cpf);
    const nome = normalizeSearch(slot === 2 ? form.testemunha_2_nome : form.testemunha_1_nome);
    const encontrada = testemunhas.find((item) => (
      (cpf && onlyDigits(item.cpf_cnpj) === cpf)
      || (!cpf && nome && normalizeSearch(item.nome) === nome)
    ));
    return encontrada ? String(encontrada.id) : '';
  }

  function atualizarConjugeRapido(campo, valor) {
    setPessoaRapidaForm((current) => ({
      ...current,
      conjuge: {
        ...current.conjuge,
        [campo]: valor
      }
    }));
  }

  async function salvarPessoaRapida() {
    try {
      const tipo = pessoaRapidaModal || pessoaRapidaForm.tipo || 'cliente';

      if (!isValidCpfCnpj(pessoaRapidaForm.cpf_cnpj)) {
        setError('Informe um CPF/CNPJ valido no cadastro rapido.');
        return;
      }
      if (tipo === 'testemunha' && onlyDigits(pessoaRapidaForm.cpf_cnpj).length !== 11) {
        setError('Informe um CPF valido para a testemunha.');
        return;
      }

      let conjugeCriado = null;

      if (tipo === 'cliente' && pessoaRapidaForm.possui_conjuge) {
        if (!isValidCpfCnpj(pessoaRapidaForm.conjuge.cpf_cnpj)) {
          setError('Informe um CPF/CNPJ valido para o conjuge.');
          return;
        }
        if (!String(pessoaRapidaForm.conjuge.nome || '').trim()) {
          setError('Informe o nome do conjuge.');
          return;
        }
        if (!String(pessoaRapidaForm.conjuge.telefone || '').trim()) {
          setError('Informe o telefone do conjuge.');
          return;
        }

        conjugeCriado = await criarParceiro(buildPessoaRapidaPayload(pessoaRapidaForm.conjuge, 'cliente'));
      }

      const payload = buildPessoaRapidaPayload(
        pessoaRapidaForm,
        tipo,
        tipo === 'cliente'
          ? {
              conjuge_nome: conjugeCriado?.nome || '',
              conjuge_parceiro_id: conjugeCriado?.id || null,
              regime_bens: pessoaRapidaForm.regime_bens
            }
          : {}
      );
      const pessoa = await criarParceiro(payload);

      if (tipo === 'cliente') {
        setClientes((current) => [...current, ...[pessoa, conjugeCriado].filter(Boolean)].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''))));
        setForm((current) => {
          const parceiroId = String(pessoa.id);
          const principalId = current.parceiro_id || parceiroId;
          return {
            ...current,
            parceiro_id: principalId,
            compradores: normalizeCompradoresForm([
              ...(current.compradores || []),
              { parceiro_id: parceiroId }
            ], principalId)
          };
        });
        setMostrarCompradorAdicional(false);
      } else if (tipo === 'testemunha') {
        setTestemunhas((current) => [...current, pessoa].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''))));
        aplicarTestemunha(testemunhaRapidaSlot || 1, pessoa);
      } else {
        setCorretores((current) => [...current, pessoa].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''))));
        setForm((current) => ({
          ...current,
          corretor_parceiro_id: String(pessoa.id),
          corretor_nome: pessoa.nome || '',
          competencia_comissao_data: current.data_assinatura || ''
        }));
      }

      setPessoaRapidaModal(null);
      setTestemunhaRapidaSlot(null);
      setPessoaRapidaForm(defaultPessoaRapidaForm());
    } catch (err) {
      setError(err?.message || 'Erro ao cadastrar pessoa');
    }
  }

  function validarCriacaoContrato() {
    const camposFaltando = [];

    if (!hasText(form.empreendimento_id)) camposFaltando.push('Empreendimento');
    if (!(form.unidades || []).length || (form.unidades || []).some((item) => !hasText(item.unidade_comercial_id))) camposFaltando.push('Unidades');
    if ((form.unidades || []).some((item) => toNumber(item.valor_atribuido) <= 0)) camposFaltando.push('Valor de cada unidade');
    if (!hasText(form.parceiro_id)) camposFaltando.push('Cliente');
    if (!hasText(form.obra_id) || !empreendimentoSelecionado?.obra_id) camposFaltando.push('Obra vinculada ao empreendimento');
    if (!hasText(numeroContratoCalculado)) camposFaltando.push('Contrato');
    if (!hasText(form.status)) camposFaltando.push('Status');
    if (!hasText(form.categoria_financeira_id)) camposFaltando.push('Categoria financeira');
    if (hasText(form.corretor_parceiro_id) && (!hasText(form.comissao_percentual) || toNumber(form.comissao_percentual) <= 0)) camposFaltando.push('Comissao %');
    if (!hasText(form.valor_total) || roundCurrency(form.valor_total) <= 0) camposFaltando.push('Valor total');
    if (form.possui_vaga_garagem && (!hasText(form.quantidade_vagas_garagem) || Number(form.quantidade_vagas_garagem) <= 0)) camposFaltando.push('Quantidade de vagas');
    if (form.possui_vaga_garagem && form.vagas_garagem_posicao_especifica && !hasText(form.vagas_garagem_posicao)) camposFaltando.push('Posicao das vagas');
    if (!hasText(form.local_assinatura)) camposFaltando.push('Local de assinatura');
    if (!hasText(form.data_assinatura)) camposFaltando.push('Data de assinatura');
    if (hasText(form.testemunha_1_nome) !== hasText(form.testemunha_1_cpf)) camposFaltando.push('Nome e CPF da testemunha 1');
    if (hasText(form.testemunha_2_nome) !== hasText(form.testemunha_2_cpf)) camposFaltando.push('Nome e CPF da testemunha 2');
    if (hasText(form.testemunha_1_cpf) && (onlyDigits(form.testemunha_1_cpf).length !== 11 || !isValidCpfCnpj(form.testemunha_1_cpf))) camposFaltando.push('CPF valido da testemunha 1');
    if (hasText(form.testemunha_2_cpf) && (onlyDigits(form.testemunha_2_cpf).length !== 11 || !isValidCpfCnpj(form.testemunha_2_cpf))) camposFaltando.push('CPF valido da testemunha 2');

    if (!form.parcelas.length) {
      camposFaltando.push('Formas de pagamento');
    } else {
      const parcelaIncompleta = form.parcelas.some((item) =>
        !hasText(item.descricao)
        || !hasText(item.tipo_parcela)
        || !hasText(item.forma_recebimento_prevista)
        || !hasText(item.reajuste_tipo)
        || !hasText(item.data_vencimento)
        || roundCurrency(item.valor || item.valor_original) <= 0
      );
      if (parcelaIncompleta) camposFaltando.push('Dados das parcelas');

      const chequeIncompleto = form.parcelas.some((item) => {
        if (String(item.forma_recebimento_prevista || '').toUpperCase() !== 'CHEQUE') return false;
        return !hasText(item.cheque_numero)
          || !hasText(item.cheque_titular_nome)
          || !hasText(item.cheque_titular_documento)
          || !isValidCpfCnpj(item.cheque_titular_documento)
          || !hasText(item.cheque_banco)
          || !hasText(item.cheque_data_emissao);
      });
      if (chequeIncompleto) camposFaltando.push('Dados dos cheques');
    }

    if (camposFaltando.length) {
      return `Para criar o contrato, preencha: ${formatMissingFields(camposFaltando)}. Desconto e observacoes podem ficar em branco.`;
    }

    if (Math.abs(diferencaComposicao) > 0.009) {
      return 'A composicao das formas de pagamento precisa fechar exatamente o valor total do contrato.';
    }

    const unidadeIds = (form.unidades || []).map((item) => String(item.unidade_comercial_id));
    if (new Set(unidadeIds).size !== unidadeIds.length) {
      return 'A mesma unidade nao pode ser vinculada mais de uma vez ao contrato.';
    }

    if (Math.abs(totalValorUnidades - valorTotalContrato) > 0.02) {
      return 'A soma dos valores das unidades precisa fechar o valor total do contrato, com tolerancia de R$ 0,02.';
    }

    return '';
  }

  function validarUnidadesContrato() {
    const linhas = form.unidades || [];
    if (!linhas.length || linhas.some((item) => !hasText(item.unidade_comercial_id))) return 'Selecione todas as unidades do contrato.';
    if (linhas.some((item) => toNumber(item.valor_atribuido) <= 0)) return 'Informe o valor de cada unidade antes de salvar.';
    const ids = linhas.map((item) => String(item.unidade_comercial_id));
    if (new Set(ids).size !== ids.length) return 'A mesma unidade nao pode ser vinculada mais de uma vez ao contrato.';
    if (Math.abs(totalValorUnidades - valorTotalContrato) > 0.02) return 'A soma dos valores das unidades precisa fechar o valor total do contrato, com tolerancia de R$ 0,02.';
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitInFlightRef.current) return;
    {
      const validationMessage = form.id ? validarUnidadesContrato() : validarCriacaoContrato();
      if (validationMessage) {
        setError(validationMessage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    submitInFlightRef.current = true;
    try {
      setSaving(true);
      setError('');
      const corretorSelecionado = corretores.find((item) => String(item.id) === String(form.corretor_parceiro_id));
      const possuiCorretor = Boolean(form.corretor_parceiro_id);
      const dadosComissao = possuiCorretor
        ? {
          corretor_parceiro_id: Number(form.corretor_parceiro_id),
          corretor_nome: corretorSelecionado?.nome || form.corretor_nome || null,
          comissao_percentual: form.comissao_percentual,
          competencia_comissao_data: form.data_assinatura || null
        }
        : {
          corretor_parceiro_id: null,
          corretor_nome: null,
          comissao_percentual: null,
          competencia_comissao_data: null
        };
      if (form.id) {
        await atualizarContratoComercial(form.id, {
          status: form.status,
          unidades: form.unidades.map((item, index) => ({
            unidade_comercial_id: Number(item.unidade_comercial_id),
            valor_cadastro_referencia: toNumber(item.valor_cadastro_referencia) || undefined,
            valor_atribuido: toNumber(item.valor_atribuido),
            principal: Boolean(item.principal),
            ordem: index + 1
          })),
          compradores: compradoresContrato.map((item) => ({
            parceiro_id: Number(item.parceiro_id),
            principal: Boolean(item.principal),
            ordem: item.ordem
          })),
          categoria_financeira_id: form.categoria_financeira_id ? Number(form.categoria_financeira_id) : undefined,
          ...dadosComissao,
          desconto_concedido: form.desconto_concedido || undefined,
          possui_vaga_garagem: Boolean(form.possui_vaga_garagem),
          quantidade_vagas_garagem: form.possui_vaga_garagem ? Number(form.quantidade_vagas_garagem || 0) : null,
          vagas_garagem_posicao: form.possui_vaga_garagem && form.vagas_garagem_posicao_especifica ? form.vagas_garagem_posicao || null : null,
          local_assinatura: form.local_assinatura || undefined,
          data_assinatura: form.data_assinatura || undefined,
          testemunha_1_nome: form.testemunha_1_nome || null,
          testemunha_1_cpf: form.testemunha_1_cpf || null,
          testemunha_2_nome: form.testemunha_2_nome || null,
          testemunha_2_cpf: form.testemunha_2_cpf || null,
          observacoes: form.observacoes || undefined
        });
      } else {
        await criarContratoComercial({
          empreendimento_id: Number(form.empreendimento_id),
          unidade_comercial_id: Number(form.unidade_comercial_id),
          unidades: form.unidades.map((item, index) => ({
            unidade_comercial_id: Number(item.unidade_comercial_id),
            valor_cadastro_referencia: toNumber(item.valor_cadastro_referencia) || undefined,
            valor_atribuido: toNumber(item.valor_atribuido),
            principal: Boolean(item.principal),
            ordem: index + 1
          })),
          parceiro_id: Number(form.parceiro_id),
          compradores: compradoresContrato.map((item) => ({
            parceiro_id: Number(item.parceiro_id),
            principal: Boolean(item.principal),
            ordem: item.ordem
          })),
          ...dadosComissao,
          obra_id: Number(form.obra_id),
          categoria_financeira_id: form.categoria_financeira_id ? Number(form.categoria_financeira_id) : undefined,
          numero: numeroContratoCalculado,
          status: form.status,
          data_contrato: form.data_assinatura,
          valor_total: form.valor_total || undefined,
          valor_entrada: valorEntradaComposicao || undefined,
          desconto_concedido: form.desconto_concedido || undefined,
          possui_vaga_garagem: Boolean(form.possui_vaga_garagem),
          quantidade_vagas_garagem: form.possui_vaga_garagem ? Number(form.quantidade_vagas_garagem || 0) : null,
          vagas_garagem_posicao: form.possui_vaga_garagem && form.vagas_garagem_posicao_especifica ? form.vagas_garagem_posicao || null : null,
          local_assinatura: form.local_assinatura || undefined,
          data_assinatura: form.data_assinatura || undefined,
          testemunha_1_nome: form.testemunha_1_nome || null,
          testemunha_1_cpf: form.testemunha_1_cpf || null,
          testemunha_2_nome: form.testemunha_2_nome || null,
          testemunha_2_cpf: form.testemunha_2_cpf || null,
          observacoes: form.observacoes || undefined,
          parcelas: form.parcelas.map((item, index) => ({
            sequencia: item.sequencia || index + 1,
            descricao: item.descricao,
            tipo_parcela: item.tipo_parcela,
            forma_recebimento_prevista: item.forma_recebimento_prevista || undefined,
            periodicidade: item.plano_periodicidade || item.periodicidade || undefined,
            reajuste_tipo: item.reajuste_tipo || 'FIXA',
            data_vencimento: item.data_vencimento,
            competencia_data: form.data_assinatura,
            valor: item.valor || item.valor_original,
            observacoes: item.observacoes || undefined,
            cheque_numero: item.cheque_numero || undefined,
            cheque_titular_nome: item.cheque_titular_nome || undefined,
            cheque_titular_documento: item.cheque_titular_documento || undefined,
            cheque_banco: item.cheque_banco || undefined,
            cheque_agencia: item.cheque_agencia || undefined,
            cheque_conta: item.cheque_conta || undefined,
            cheque_data_emissao: item.cheque_data_emissao || undefined
          }))
        });
      }

      limparDadosContrato({ confirmar: false });
      await carregar();
    } catch (err) {
      setError(err?.message || 'Erro ao salvar contrato comercial');
    } finally {
      submitInFlightRef.current = false;
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="page solicitacoes-page"><div className="app-empty-card">Carregando contratos comerciais...</div></div>;
  }

  return (
    <div className="page solicitacoes-page space-y-5 md:space-y-6">
      <header className="app-page-header">
        <div className="app-page-header-row">
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">Contratos de venda</h1>
            <p className="page-subtitle">
              Contratos, agenda financeira e titulos a receber integrados ao modulo financeiro.
            </p>
          </div>
        </div>
      </header>

      {error && <div className="app-alert app-alert--error">{error}</div>}

      {podeImportarSienge && <ComercialContratoImportacaoPanel onImported={carregar} />}

      <section className="sol-surface-card rounded-2xl p-4 md:p-5 space-y-4">
        <div className="sol-filtros-head">
          <div>
            <p className="sol-filtros-title">{form.id ? 'Editar resumo do contrato' : 'Novo contrato comercial'}</p>
            <p className="sol-filtros-subtitle">
              {form.id ? 'A edicao inicial ajusta status e dados complementares.' : 'A criacao gera as parcelas e os titulos financeiros.'}
            </p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--c-text)]">Dados principais</h3>
              <p className="text-xs text-[var(--c-muted)]">Identifique o empreendimento e o comprador responsavel pelo contrato.</p>
            </div>
            <div className="grid items-start gap-3 lg:grid-cols-2">
              <label className="sol-filter-field">
                <span className="sol-filter-label">Empreendimento</span>
                <select className="input w-full" value={form.empreendimento_id} onChange={(e) => selecionarEmpreendimentoContrato(e.target.value)} required disabled={Boolean(form.id)}>
                  <option value="">Selecione</option>
                  {empreendimentos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                </select>
              </label>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="sol-filter-label">Comprador principal</span>
                  {!form.id && (
                    <button type="button" className="btn btn-outline btn-sm inline-flex h-8 w-8 items-center justify-center p-0" onClick={() => setMostrarCompradorAdicional(true)} title="Adicionar comprador">
                      <HiPlus className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <ParceiroAutocomplete
                  label=""
                  value={form.parceiro_id}
                  options={clientes}
                  onChange={selecionarClientePrincipal}
                  disabled={Boolean(form.id)}
                  placeholder="Digite nome, CPF/CNPJ ou e-mail"
                  emptyLabel="Nenhum cliente encontrado"
                  showOptionsOnFocus
                  resultLimit={8}
                />
                {!form.id && (
                  <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => abrirCadastroRapidoPessoa('cliente')}>
                    Cadastro rapido
                  </button>
                )}
                {compradoresContrato[0]?.parceiro?.conjuge_nome && (
                  <p className="mt-2 text-xs text-[var(--c-muted)]">Conjuge: {compradoresContrato[0].parceiro.conjuge_nome}</p>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-[var(--c-border)] pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--c-text)]">Unidades e valores</h3>
                <p className="text-xs text-[var(--c-muted)]">O valor cadastrado e sugerido automaticamente e pode ser alterado para este contrato.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={adicionarUnidadeContrato} disabled={!form.empreendimento_id}>
                <HiPlus className="h-4 w-4" /> Adicionar unidade
              </button>
            </div>
            <div className="divide-y divide-[var(--c-border)] border-y border-[var(--c-border)]">
              {(form.unidades || []).map((linha, index) => {
                const selecionadasEmOutrasLinhas = new Set((form.unidades || [])
                  .filter((_, itemIndex) => itemIndex !== index)
                  .map((item) => String(item.unidade_comercial_id)));
                return (
                  <div key={`${index}-${linha.unidade_comercial_id}`} className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-3 md:items-end">
                    <label className="sol-filter-field">
                      <span className="sol-filter-label">Unidade {index + 1}</span>
                      <select className="input w-full" value={linha.unidade_comercial_id} onChange={(event) => atualizarUnidadeContrato(index, event.target.value)} required>
                        <option value="">Selecione</option>
                        {unidadesDoEmpreendimento
                          .filter((item) => !selecionadasEmOutrasLinhas.has(String(item.id)))
                          .map((item) => <option key={item.id} value={item.id}>{buildUnidadeOptionLabel(item)}</option>)}
                      </select>
                    </label>
                    <label className="sol-filter-field">
                      <span className="sol-filter-label">Valor da Unidade *</span>
                      <input
                        className="input w-full"
                        inputMode="decimal"
                        value={linha.valor_atribuido}
                        onChange={(event) => setForm((current) => {
                          const proximas = current.unidades.map((item, itemIndex) => itemIndex === index ? {
                            ...item,
                            valor_atribuido: normalizeCurrencyTyping(event.target.value)
                          } : item);
                          return atualizarFormComUnidades(current, proximas);
                        })}
                        onBlur={(event) => setForm((current) => {
                          const proximas = current.unidades.map((item, itemIndex) => itemIndex === index ? {
                            ...item,
                            valor_atribuido: formatCurrencyInput(event.target.value)
                          } : item);
                          return atualizarFormComUnidades(current, proximas);
                        })}
                        placeholder="R$ 0,00"
                      />
                    </label>
                    <div className="flex min-h-10 flex-wrap items-center gap-2 md:justify-end">
                      <label className="inline-flex items-center gap-2 text-sm text-[var(--c-text)]">
                        <input type="radio" name="unidade-principal" checked={Boolean(linha.principal)} onChange={() => definirUnidadePrincipal(index)} /> Principal
                      </label>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => removerUnidadeContrato(index)} disabled={(form.unidades || []).length === 1} aria-label={`Remover unidade ${index + 1}`}>
                        <HiXMark className="h-4 w-4" /> Remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <label className="sol-filter-field">
                <span className="sol-filter-label">Desconto</span>
                <input className="input w-full" inputMode="decimal" value={form.desconto_concedido} onChange={(e) => setForm((c) => ({ ...c, desconto_concedido: normalizeCurrencyTyping(e.target.value) }))} onBlur={(e) => setForm((c) => ({ ...c, desconto_concedido: formatCurrencyInput(e.target.value) }))} placeholder="R$ 0,00" />
              </label>
              <label className="sol-filter-field">
                <span className="sol-filter-label">Valor total do contrato</span>
                <input className="input w-full" value={form.valor_total} readOnly aria-readonly="true" placeholder="R$ 0,00" />
                <span className="mt-1 text-xs text-[var(--c-muted)]">Calculado pela soma dos valores das unidades.</span>
              </label>
            </div>
            {form.empreendimento_id && unidadesDoEmpreendimento.length === 0 && (
              <div className="text-xs text-[var(--c-muted)]">Nenhuma unidade disponivel para contrato neste empreendimento.</div>
            )}
          </section>
          {!form.id && mostrarCompradorAdicional && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="sol-filter-label">Comprador adicional</span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm inline-flex h-8 w-8 items-center justify-center p-0"
                    onClick={() => {
                      setCompradorSelecionarId('');
                      setMostrarCompradorAdicional(false);
                    }}
                    title="Fechar comprador adicional"
                  >
                    <HiXMark className="h-4 w-4" />
                  </button>
                </div>
                <ParceiroAutocomplete
                  label=""
                  value={compradorSelecionarId}
                  options={clientesDisponiveisComprador}
                  onChange={setCompradorSelecionarId}
                  placeholder="Digite nome, CPF/CNPJ ou e-mail"
                  emptyLabel="Nenhum cliente disponível"
                  showOptionsOnFocus
                  resultLimit={8}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => adicionarComprador()} disabled={!compradorSelecionarId}>
                    Adicionar
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirCadastroRapidoPessoa('cliente')}>
                    Cadastro rapido
                  </button>
                </div>
                <p className="mt-2 text-xs text-[var(--c-muted)]">
                  O comprador adicional entra no contrato e nas assinaturas. O principal continua vinculado aos titulos financeiros.
                </p>
            </div>
          )}
          <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="sol-filter-field">
              <span className="sol-filter-label">Obra</span>
              <input
                className="input w-full"
                value={
                  obraSelecionada
                    ? (obraSelecionada.codigo ? `${obraSelecionada.codigo} - ${obraSelecionada.nome}` : obraSelecionada.nome)
                    : ''
                }
                placeholder={form.empreendimento_id ? 'Empreendimento sem obra vinculada' : 'Selecione o empreendimento'}
                disabled
                required
              />
              {!form.id && form.empreendimento_id && !empreendimentoSelecionado?.obra_id && (
                <span className="mt-1 text-xs text-amber-600">
                  Vincule uma obra no cadastro do empreendimento antes de criar o contrato.
                </span>
              )}
            </label>
            <label className="sol-filter-field">
              <span className="sol-filter-label">Codigo do contrato</span>
              <input
                className="input w-full"
                value={form.id ? form.numero : numeroContratoCalculado}
                readOnly
                aria-readonly="true"
                required
              />
              {!form.id && (
                <span className="mt-1 text-xs text-[var(--c-muted)]">
                  Gerado automaticamente por empreendimento, torre e unidade.
                </span>
              )}
            </label>
            <label className="sol-filter-field">
              <span className="sol-filter-label">Status</span>
              <select className="input w-full" value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}>
                {STATUS_CONTRATO.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="sol-filter-field">
              <span className="sol-filter-label">Categoria financeira</span>
              <select
                className="input w-full"
                value={form.categoria_financeira_id}
                onChange={(e) => setForm((current) => ({ ...current, categoria_financeira_id: e.target.value }))}
              >
                <option value="">Selecione uma categoria de receita DRE</option>
                {categoriasCompativeis.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.dre_grupo ? ` - ${item.dre_grupo}` : ''}</option>)}
              </select>
              {!categoriasCompativeis.length ? (
                <span className="mt-1 text-xs text-amber-600">Cadastre/libere uma categoria RECEBER/AMBOS marcada para DRE e com grupo DRE.</span>
              ) : null}
            </label>
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="sol-filter-field">
              <span className="sol-filter-label">Vaga de garagem</span>
              <select
                className="input w-full"
                value={form.possui_vaga_garagem ? 'sim' : 'nao'}
                onChange={(e) => setForm((c) => ({
                  ...c,
                  possui_vaga_garagem: e.target.value === 'sim',
                  quantidade_vagas_garagem: e.target.value === 'sim' ? c.quantidade_vagas_garagem : '',
                  vagas_garagem_posicao_especifica: e.target.value === 'sim' ? c.vagas_garagem_posicao_especifica : false,
                  vagas_garagem_posicao: e.target.value === 'sim' ? c.vagas_garagem_posicao : ''
                }))}
              >
                <option value="nao">Nao possui</option>
                <option value="sim">Possui</option>
              </select>
            </label>
            {form.possui_vaga_garagem && (
              <>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Quantidade de vagas</span>
                  <input className="input w-full" type="number" min="1" value={form.quantidade_vagas_garagem} onChange={(e) => setForm((c) => ({ ...c, quantidade_vagas_garagem: e.target.value }))} />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Posicao especifica</span>
                  <select
                    className="input w-full"
                    value={form.vagas_garagem_posicao_especifica ? 'sim' : 'nao'}
                    onChange={(e) => setForm((c) => ({
                      ...c,
                      vagas_garagem_posicao_especifica: e.target.value === 'sim',
                      vagas_garagem_posicao: e.target.value === 'sim' ? c.vagas_garagem_posicao : ''
                    }))}
                  >
                    <option value="nao">Nao</option>
                    <option value="sim">Sim</option>
                  </select>
                </label>
                {form.vagas_garagem_posicao_especifica && (
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Posicao das vagas</span>
                    <input className="input w-full" value={form.vagas_garagem_posicao} onChange={(e) => setForm((c) => ({ ...c, vagas_garagem_posicao: e.target.value }))} placeholder="Ex.: vagas 12 e 13 / subsolo 1" />
                  </label>
                )}
              </>
            )}
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="sol-filter-field">
              <span className="sol-filter-label">Corretor parceiro</span>
              <ParceiroAutocomplete
                label=""
                value={form.corretor_parceiro_id}
                options={corretores}
                onChange={(corretorId) => {
                  const corretor = corretores.find((item) => String(item.id) === String(corretorId));
                  setForm((c) => ({
                    ...c,
                    corretor_parceiro_id: corretorId,
                    corretor_nome: corretor?.nome || '',
                    comissao_percentual: corretorId ? c.comissao_percentual : '',
                    competencia_comissao_data: corretorId ? c.data_assinatura : ''
                  }));
                }}
                placeholder="Digite nome, CPF/CNPJ ou e-mail"
                emptyLabel="Nenhum corretor encontrado"
              />
              <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => abrirCadastroRapidoPessoa('corretor')}>
                Cadastro rapido
              </button>
            </label>
            {form.corretor_parceiro_id && (
              <>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Comissao %</span>
                  <input
                    className="input w-full"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.comissao_percentual}
                    onChange={(e) => setForm((c) => ({ ...c, comissao_percentual: e.target.value }))}
                    required
                  />
                </label>
                <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">Dados da comissao</p>
                  <p className="mt-1 text-sm text-[var(--c-text)]">
                    Competencia DRE: <strong>{form.data_assinatura ? formatDate(form.data_assinatura) : 'Informe a data de assinatura'}</strong>
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="sol-filter-field xl:col-span-2">
              <span className="sol-filter-label">Local de assinatura</span>
              <input className="input w-full" value={form.local_assinatura} onChange={(e) => setForm((c) => ({ ...c, local_assinatura: e.target.value }))} placeholder="Ex.: Balneario de Iriri, Anchieta-ES" />
            </label>
            <label className="sol-filter-field">
              <span className="sol-filter-label">Data de assinatura</span>
              <input className="input w-full" type="date" value={form.data_assinatura} onChange={(e) => handleDataAssinaturaChange(e.target.value)} />
            </label>
          </div>
          <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
            <p className="mb-3 text-sm font-semibold text-[var(--c-text)]">Testemunhas do contrato</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="sol-filter-field">
                <span className="sol-filter-label">Testemunha 1</span>
                <ParceiroAutocomplete
                  label=""
                  value={getTestemunhaSelecionadaId(1)}
                  options={testemunhas}
                  onChange={(testemunhaId) => {
                    const testemunha = testemunhas.find((item) => String(item.id) === String(testemunhaId));
                    if (testemunha) {
                      aplicarTestemunha(1, testemunha);
                    } else {
                      setForm((c) => ({ ...c, testemunha_1_nome: '', testemunha_1_cpf: '' }));
                    }
                  }}
                  placeholder="Digite nome, CPF/CNPJ ou e-mail"
                  emptyLabel="Nenhuma testemunha encontrada"
                />
                <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => abrirCadastroRapidoPessoa('testemunha', { slot: 1 })}>
                  Cadastro rapido
                </button>
              </label>
              <label className="sol-filter-field">
                <span className="sol-filter-label">Testemunha 2</span>
                <ParceiroAutocomplete
                  label=""
                  value={getTestemunhaSelecionadaId(2)}
                  options={testemunhas}
                  onChange={(testemunhaId) => {
                    const testemunha = testemunhas.find((item) => String(item.id) === String(testemunhaId));
                    if (testemunha) {
                      aplicarTestemunha(2, testemunha);
                    } else {
                      setForm((c) => ({ ...c, testemunha_2_nome: '', testemunha_2_cpf: '' }));
                    }
                  }}
                  placeholder="Digite nome, CPF/CNPJ ou e-mail"
                  emptyLabel="Nenhuma testemunha encontrada"
                />
                <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => abrirCadastroRapidoPessoa('testemunha', { slot: 2 })}>
                  Cadastro rapido
                </button>
              </label>
            </div>
          </div>
          {compradoresContrato.length > 1 && (
            <section className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
              <div className="mb-3">
                <p className="text-sm font-semibold text-[var(--c-text)]">Compradores vinculados ao contrato</p>
                <p className="text-xs text-[var(--c-muted)]">
                  Lista de conferencia para assinaturas e dados do contrato.
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {compradoresContrato.map((item) => (
                  <div key={item.parceiro_id} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--c-text)]">{item.parceiro?.nome || `Cliente ${item.parceiro_id}`}</p>
                        <p className="text-xs text-[var(--c-muted)]">{maskCpfCnpj(item.parceiro?.cpf_cnpj || '') || 'CPF/CNPJ nao informado'}</p>
                        {item.parceiro?.conjuge_nome && (
                          <p className="mt-1 text-xs text-[var(--c-muted)]">Conjuge: {item.parceiro.conjuge_nome}</p>
                        )}
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.principal ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {item.principal ? 'Principal' : `Comprador ${item.ordem}`}
                      </span>
                    </div>
                    {!item.principal && !form.id && (
                      <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => removerComprador(item.parceiro_id)}>
                        Remover
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <label className="sol-filter-field"><span className="sol-filter-label">Observacoes</span><textarea className="input min-h-[92px] w-full" value={form.observacoes} onChange={(e) => setForm((c) => ({ ...c, observacoes: e.target.value }))} /></label>

          {!form.id && (
            <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--c-text)]">Composicao das formas de pagamento</p>
                  <p className="text-xs text-[var(--c-muted)]">
                    Adicione blocos de recebimento e acompanhe a diferenca ate fechar o valor total do contrato.
                  </p>
                  <p className="text-xs text-[var(--c-muted)]">
                    Se houver entrada em dinheiro, PIX, bens ou outro formato, registre essa parte como um bloco proprio abaixo.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="inline-flex items-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]">
                    Contrato: <strong className="ml-1">{formatCurrency(valorTotalContrato)}</strong>
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]">
                    Agenda: <strong className="ml-1">{formatCurrency(totalParcelas)}</strong>
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]">
                    Entrada: <strong className="ml-1">{formatCurrency(valorEntradaComposicao)}</strong>
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-3 py-2 ${Math.abs(diferencaComposicao) <= 0.009 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : diferencaComposicao > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                    {Math.abs(diferencaComposicao) <= 0.009
                      ? 'Fechado'
                      : diferencaComposicao > 0
                        ? `Faltam ${formatCurrency(diferencaComposicao)}`
                        : `Excede ${formatCurrency(Math.abs(diferencaComposicao))}`}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <strong>Competencia DRE:</strong> {form.data_assinatura ? formatDate(form.data_assinatura) : 'informe a data de assinatura'}.
                Todas as formas de pagamento usam automaticamente a assinatura do contrato como competencia.
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Modo</span>
                  <select className="input w-full" value={generator.modo} onChange={(e) => setGenerator((c) => resolveGeneratorByModo(e.target.value, c))}>
                    {modosComposicao.map((item) => <option key={getOptionValue(item)} value={getOptionValue(item)}>{getOptionLabel(item)}</option>)}
                  </select>
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Descricao do bloco</span>
                  <input className="input w-full" value={generator.titulo_bloco} onChange={(e) => setGenerator((c) => ({ ...c, titulo_bloco: e.target.value }))} placeholder="Ex.: Mensais, reforco anual, bens recebidos" />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Tipo da parcela</span>
                  <select className="input w-full" value={generator.tipo_parcela} onChange={(e) => setGenerator((c) => ({ ...c, tipo_parcela: e.target.value }))} disabled={getModoComposicaoTipo(generator.modo) === 'ENTRADA'}>
                    {parcelaTipos.map((tipo) => <option key={getOptionValue(tipo)} value={getOptionValue(tipo)}>{getOptionLabel(tipo)}</option>)}
                  </select>
                </label>
                <label className="sol-filter-field md:col-span-2">
                  <span className="sol-filter-label">Forma prevista</span>
                  <select className="input w-full" value={generator.forma_recebimento_prevista} onChange={(e) => setGenerator((c) => ({ ...c, forma_recebimento_prevista: e.target.value, detalhe_forma_recebimento: isFormaComDetalhe(e.target.value) ? c.detalhe_forma_recebimento : '' }))}>
                    <option value="">Nao informar</option>
                    {formasRecebimento.map((item) => <option key={getOptionValue(item)} value={getOptionValue(item)}>{getOptionLabel(item)}</option>)}
                  </select>
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Reajuste</span>
                  <select className="input w-full" value={generator.reajuste_tipo} onChange={(e) => setGenerator((c) => ({ ...c, reajuste_tipo: e.target.value }))}>
                    {parcelaReajusteTipos.map((item) => {
                      const resumo = getOptionResumo(item);
                      return <option key={getOptionValue(item)} value={getOptionValue(item)}>{getOptionLabel(item)}{resumo ? ` (${resumo})` : ''}</option>;
                    })}
                  </select>
                </label>
              </div>

              {isFormaComDetalhe(generator.forma_recebimento_prevista) && (
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Detalhe do recebimento</span>
                  <input
                    className="input w-full"
                    value={generator.detalhe_forma_recebimento}
                    onChange={(e) => setGenerator((c) => ({ ...c, detalhe_forma_recebimento: e.target.value }))}
                    placeholder="Ex.: veiculo Corolla 2024, permuta por lote 12, credito de terceiros"
                  />
                </label>
              )}

              {getModoComposicaoTipo(generator.modo) === 'ENTRADA' ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Valor da entrada</span>
                    <input className="input w-full" inputMode="decimal" value={generator.valor_parcela} onChange={(e) => setGenerator((c) => ({ ...c, valor_parcela: normalizeCurrencyTyping(e.target.value) }))} onBlur={(e) => setGenerator((c) => ({ ...c, valor_parcela: formatCurrencyInput(e.target.value) }))} placeholder="R$ 0,00" />
                  </label>
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Vencimento da entrada</span>
                    <input className="input w-full" type="date" value={generator.primeiro_vencimento} onChange={(e) => setGenerator((c) => ({ ...c, primeiro_vencimento: e.target.value }))} />
                  </label>
                </div>
              ) : getModoComposicaoTipo(generator.modo) === 'PERIODICO' ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Periodicidade</span>
                  <select className="input w-full" value={generator.periodicidade} onChange={(e) => setGenerator((c) => ({ ...c, periodicidade: e.target.value, quantidade_parcelas: e.target.value === 'AVISTA' ? '1' : c.quantidade_parcelas }))}>
                    {periodicidades.filter((item) => getOptionValue(item) !== 'PERSONALIZADA').map((item) => <option key={getOptionValue(item)} value={getOptionValue(item)}>{getOptionLabel(item)}</option>)}
                  </select>
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Qtd. parcelas</span>
                  <input className="input w-full" type="number" min="1" value={generator.periodicidade === 'AVISTA' ? '1' : generator.quantidade_parcelas} onChange={(e) => setGenerator((c) => ({ ...c, quantidade_parcelas: e.target.value }))} disabled={generator.periodicidade === 'AVISTA'} />
                </label>
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Valor parcela</span>
                    <input className="input w-full" inputMode="decimal" value={generator.valor_parcela} onChange={(e) => setGenerator((c) => ({ ...c, valor_parcela: normalizeCurrencyTyping(e.target.value) }))} onBlur={(e) => setGenerator((c) => ({ ...c, valor_parcela: formatCurrencyInput(e.target.value) }))} placeholder="R$ 0,00" />
                  </label>
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Primeiro vencimento</span>
                    <input className="input w-full" type="date" value={generator.primeiro_vencimento} onChange={(e) => setGenerator((c) => ({ ...c, primeiro_vencimento: e.target.value }))} />
                  </label>
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--c-text)]">Lancamentos manuais</p>
                      <p className="text-xs text-[var(--c-muted)]">
                        Use para bens, outros recebimentos ou parcelas com datas e valores especificos.
                      </p>
                    </div>
                    <button type="button" className="btn btn-outline" onClick={adicionarParcelaCustomizada}>
                      Adicionar linha
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(generator.parcelas_personalizadas || []).map((item, index) => (
                      <div key={`custom-${index}`} className="grid gap-3 rounded-2xl border border-[var(--c-border)] p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_150px_150px_160px_150px_auto]">
                        <label className="sol-filter-field">
                          <span className="sol-filter-label">Descricao</span>
                          <input className="input w-full" value={item.descricao} onChange={(e) => updateParcelaCustomizada(index, 'descricao', e.target.value)} />
                        </label>
                        <label className="sol-filter-field">
                          <span className="sol-filter-label">Tipo</span>
                          <select className="input w-full" value={item.tipo_parcela} onChange={(e) => updateParcelaCustomizada(index, 'tipo_parcela', e.target.value)}>
                            {parcelaTipos.map((tipo) => <option key={getOptionValue(tipo)} value={getOptionValue(tipo)}>{getOptionLabel(tipo)}</option>)}
                          </select>
                        </label>
                        <label className="sol-filter-field">
                          <span className="sol-filter-label">Reajuste</span>
                          <select className="input w-full" value={item.reajuste_tipo || 'FIXA'} onChange={(e) => updateParcelaCustomizada(index, 'reajuste_tipo', e.target.value)}>
                            {parcelaReajusteTipos.map((tipo) => <option key={getOptionValue(tipo)} value={getOptionValue(tipo)}>{getOptionLabel(tipo)}</option>)}
                          </select>
                        </label>
                        <label className="sol-filter-field">
                          <span className="sol-filter-label">Vencimento</span>
                          <input className="input w-full" type="date" value={item.data_vencimento} onChange={(e) => updateParcelaCustomizada(index, 'data_vencimento', e.target.value)} />
                        </label>
                        <label className="sol-filter-field">
                          <span className="sol-filter-label">Valor</span>
                          <input className="input w-full" inputMode="decimal" value={item.valor} onChange={(e) => updateParcelaCustomizada(index, 'valor', normalizeCurrencyTyping(e.target.value))} onBlur={(e) => updateParcelaCustomizada(index, 'valor', formatCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
                        </label>
                        <div className="flex items-end">
                          <button type="button" className="btn btn-outline w-full" onClick={() => removerParcelaCustomizada(index)}>
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline" onClick={adicionarFormaPagamento}>
                  Adicionar forma de pagamento
                </button>
                <span className="inline-flex items-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm text-[var(--c-text)]">
                  Rascunho do bloco: <strong className="ml-1">{formatCurrency(gerarParcelasDoBloco(generator, '', periodicidades, form.data_assinatura).total || 0)}</strong>
                </span>
              </div>

              {paymentPlans.length > 0 && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-[var(--c-text)]">Formas adicionadas</div>
                  <div className="space-y-3">
                    {paymentPlans.map((plano, index) => (
                      <article key={plano.id} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                Forma {index + 1}
                              </span>
                              <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                {getModoComposicaoLabel(plano.modo, modosComposicao)}
                              </span>
                              {plano.forma_recebimento_prevista && (
                                <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                  {plano.forma_recebimento_prevista}
                                </span>
                              )}
                              <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                {plano.reajuste_tipo === 'REAJUSTAVEL' ? 'Reajustavel (R)' : 'Fixa (F)'}
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-[var(--c-text)]">
                              {plano.titulo_bloco || 'Composicao sem descricao'}
                            </div>
                            {plano.detalhe_forma_recebimento && (
                              <div className="text-sm text-[var(--c-muted)]">
                                Detalhe: {plano.detalhe_forma_recebimento}
                              </div>
                            )}
                            <div className="grid gap-2 text-sm text-[var(--c-muted)] md:grid-cols-3">
                              <span>Parcelas geradas: {plano.parcelas_geradas?.length || 0}</span>
                              <span>Tipo base: {plano.tipo_parcela || 'PARCELA'}</span>
                              <span>Total: {formatCurrency(plano.total_bloco)}</span>
                            </div>
                          </div>
                          <button type="button" className="btn btn-outline" onClick={() => removerFormaPagamento(plano.id)}>
                            Remover forma
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {form.parcelas.length > 0 && (
                <div className="space-y-3 xl:hidden">
                  {form.parcelas.map((item, index) => {
                    const isEditing = parcelaEditandoIndex === index;
                    const reajusteLabel = getOptionLabel(parcelaReajusteTipos.find((tipo) => getOptionValue(tipo) === (item.reajuste_tipo || 'FIXA'))) || item.reajuste_tipo || 'Fixa';
                    const canAdjust = Math.abs(diferencaComposicao) > 0.009;

                    return (
                      <article key={`mobile-${item.descricao}-${index}`} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">Parcela {index + 1}</div>
                            <div className="mt-1 font-semibold text-[var(--c-text)]">{item.descricao || 'Sem descricao'}</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm inline-flex shrink-0 items-center gap-1.5"
                            onClick={() => setParcelaEditandoIndex(isEditing ? null : index)}
                            title={isEditing ? 'Concluir edicao da parcela' : 'Editar parcela'}
                          >
                            <HiOutlinePencilSquare className="h-4 w-4" />
                            {isEditing ? 'Concluir' : 'Editar'}
                          </button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-xs font-semibold text-[var(--c-muted)] sm:col-span-2">
                            Descricao
                            {isEditing ? (
                              <input className="input w-full" value={item.descricao} onChange={(e) => updateParcela(index, 'descricao', e.target.value)} />
                            ) : <span className="block text-sm font-medium text-[var(--c-text)]">{item.descricao || '-'}</span>}
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-[var(--c-muted)]">
                            Tipo
                            {isEditing ? (
                              <select className="input w-full" value={item.tipo_parcela} onChange={(e) => updateParcela(index, 'tipo_parcela', e.target.value)}>
                                {parcelaTipos.map((tipo) => <option key={getOptionValue(tipo)} value={getOptionValue(tipo)}>{getOptionLabel(tipo)}</option>)}
                              </select>
                            ) : <span className="block text-sm font-medium text-[var(--c-text)]">{item.tipo_parcela || '-'}</span>}
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-[var(--c-muted)]">
                            Forma
                            {isEditing ? (
                              <select className="input w-full" value={item.forma_recebimento_prevista || ''} onChange={(e) => updateParcela(index, 'forma_recebimento_prevista', e.target.value)}>
                                <option value="">Nao informar</option>
                                {formasRecebimento.map((forma) => <option key={getOptionValue(forma)} value={getOptionValue(forma)}>{getOptionLabel(forma)}</option>)}
                              </select>
                            ) : <span className="block text-sm font-medium text-[var(--c-text)]">{item.forma_recebimento_prevista || '-'}</span>}
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-[var(--c-muted)]">
                            Reajuste
                            {isEditing ? (
                              <select className="input w-full" value={item.reajuste_tipo || 'FIXA'} onChange={(e) => updateParcela(index, 'reajuste_tipo', e.target.value)}>
                                {parcelaReajusteTipos.map((tipo) => {
                                  const resumo = getOptionResumo(tipo);
                                  return <option key={getOptionValue(tipo)} value={getOptionValue(tipo)}>{getOptionLabel(tipo)}{resumo ? ` (${resumo})` : ''}</option>;
                                })}
                              </select>
                            ) : <span className="block text-sm font-medium text-[var(--c-text)]">{reajusteLabel}</span>}
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-[var(--c-muted)]">
                            Vencimento
                            {isEditing ? (
                              <input className="input w-full" type="date" value={item.data_vencimento} onChange={(e) => updateParcela(index, 'data_vencimento', e.target.value)} />
                            ) : <span className="block text-sm font-medium text-[var(--c-text)]">{formatDate(item.data_vencimento)}</span>}
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-[var(--c-muted)]">
                            Competencia DRE
                            <span className="block text-sm font-medium text-[var(--c-text)]">{formatDate(form.data_assinatura)}</span>
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-[var(--c-muted)]">
                            Valor
                            {isEditing ? (
                              <input className="input w-full text-right" inputMode="decimal" value={item.valor || formatCurrencyInput(item.valor_original)} onChange={(e) => updateParcela(index, 'valor', normalizeCurrencyTyping(e.target.value))} onBlur={(e) => updateParcela(index, 'valor', formatCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
                            ) : <span className="block text-sm font-semibold text-[var(--c-text)]">{formatCurrency(item.valor || item.valor_original)}</span>}
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-[var(--c-muted)] sm:col-span-2">
                            Detalhe
                            {isEditing ? (
                              <input className="input w-full" value={item.observacoes || ''} onChange={(e) => updateParcela(index, 'observacoes', e.target.value)} placeholder="Detalhe do bem, permuta ou outro recebimento" />
                            ) : <span className="block text-sm font-medium text-[var(--c-text)]">{item.observacoes || '-'}</span>}
                          </label>
                        </div>

                        {isEditing && canAdjust && (
                          <button type="button" className="btn btn-primary btn-sm mt-3 w-full" onClick={() => ajustarParcelaParaFechamento(index)}>
                            Fechar diferenca
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {form.parcelas.length > 0 && (
                <div className="hidden overflow-x-auto rounded-2xl border border-[var(--c-border)] xl:block">
                  <table className="min-w-[1180px] text-sm">
                    <thead className="bg-[var(--c-bg)] text-[var(--c-muted)]">
                      <tr>
                        <th className="px-3 py-3 text-left">Descricao</th>
                        <th className="px-3 py-3 text-left">Tipo</th>
                        <th className="px-3 py-3 text-left">Forma</th>
                        <th className="px-3 py-3 text-left">Reajuste</th>
                        <th className="px-3 py-3 text-left">Detalhe</th>
                        <th className="px-3 py-3 text-left">Vencimento</th>
                        <th className="px-3 py-3 text-left">Competencia DRE</th>
                        <th className="px-3 py-3 text-right">Valor</th>
                        <th className="px-3 py-3 text-right">Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.parcelas.map((item, index) => (
                        (() => {
                          const isEditing = parcelaEditandoIndex === index;
                          const reajusteLabel = getOptionLabel(parcelaReajusteTipos.find((tipo) => getOptionValue(tipo) === (item.reajuste_tipo || 'FIXA'))) || item.reajuste_tipo || 'Fixa';
                          const canAdjust = Math.abs(diferencaComposicao) > 0.009;

                          return (
                            <tr key={`${item.descricao}-${index}`} className={`border-t border-[var(--c-border)] ${isEditing ? 'bg-blue-50/50' : ''}`}>
                              <td className="px-3 py-3">
                                {isEditing ? (
                                  <input className="input w-full" value={item.descricao} onChange={(e) => updateParcela(index, 'descricao', e.target.value)} />
                                ) : (
                                  <span className="font-medium text-[var(--c-text)]">{item.descricao || '-'}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {isEditing ? (
                                  <select className="input w-full" value={item.tipo_parcela} onChange={(e) => updateParcela(index, 'tipo_parcela', e.target.value)}>
                                    {parcelaTipos.map((tipo) => <option key={getOptionValue(tipo)} value={getOptionValue(tipo)}>{getOptionLabel(tipo)}</option>)}
                                  </select>
                                ) : (
                                  <span className="text-[var(--c-muted)]">{item.tipo_parcela || '-'}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {isEditing ? (
                                  <select className="input w-full" value={item.forma_recebimento_prevista || ''} onChange={(e) => updateParcela(index, 'forma_recebimento_prevista', e.target.value)}>
                                    <option value="">Nao informar</option>
                                    {formasRecebimento.map((forma) => <option key={getOptionValue(forma)} value={getOptionValue(forma)}>{getOptionLabel(forma)}</option>)}
                                  </select>
                                ) : (
                                  <span className="text-[var(--c-muted)]">{item.forma_recebimento_prevista || '-'}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {isEditing ? (
                                  <select className="input w-full" value={item.reajuste_tipo || 'FIXA'} onChange={(e) => updateParcela(index, 'reajuste_tipo', e.target.value)}>
                                    {parcelaReajusteTipos.map((tipo) => {
                                      const resumo = getOptionResumo(tipo);
                                      return <option key={getOptionValue(tipo)} value={getOptionValue(tipo)}>{getOptionLabel(tipo)}{resumo ? ` (${resumo})` : ''}</option>;
                                    })}
                                  </select>
                                ) : (
                                  <span className="text-[var(--c-muted)]">{reajusteLabel}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {isEditing ? (
                                  <input className="input w-full" value={item.observacoes || ''} onChange={(e) => updateParcela(index, 'observacoes', e.target.value)} placeholder="Detalhe do bem, permuta ou outro recebimento" />
                                ) : (
                                  <span className="text-[var(--c-muted)]">{item.observacoes || '-'}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {isEditing ? (
                                  <input className="input w-full" type="date" value={item.data_vencimento} onChange={(e) => updateParcela(index, 'data_vencimento', e.target.value)} />
                                ) : (
                                  <span className="text-[var(--c-muted)]">{formatDate(item.data_vencimento)}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[var(--c-muted)]">{formatDate(form.data_assinatura)}</span>
                              </td>
                              <td className="px-3 py-3 text-right">
                                {isEditing ? (
                                  <input className="input w-full text-right" inputMode="decimal" value={item.valor || formatCurrencyInput(item.valor_original)} onChange={(e) => updateParcela(index, 'valor', normalizeCurrencyTyping(e.target.value))} onBlur={(e) => updateParcela(index, 'valor', formatCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
                                ) : (
                                  <span className="font-semibold text-[var(--c-text)]">{formatCurrency(item.valor || item.valor_original)}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex min-w-[176px] flex-wrap justify-end gap-2">
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm inline-flex items-center gap-1.5"
                                    onClick={() => setParcelaEditandoIndex(isEditing ? null : index)}
                                    title={isEditing ? 'Concluir edicao da parcela' : 'Editar parcela'}
                                  >
                                    <HiOutlinePencilSquare className="h-4 w-4" />
                                    {isEditing ? 'Concluir' : 'Editar'}
                                  </button>
                                  {isEditing && canAdjust && (
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      onClick={() => ajustarParcelaParaFechamento(index)}
                                      title="Ajusta esta parcela pela diferenca entre a agenda e o valor total do contrato."
                                    >
                                      Fechar diferenca
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })()
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {form.parcelas.some((item) => isChequeForma(item.forma_recebimento_prevista)) && (
                <section className="space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 md:p-4">
                  <div>
                    <h4 className="font-semibold text-[var(--c-text)]">Dados dos cheques</h4>
                    <p className="mt-1 text-sm text-[var(--c-muted)]">Informe os dados de cada cheque. Ao criar o contrato, os documentos serao registrados automaticamente na Carteira de Cheques.</p>
                  </div>
                  {form.parcelas.map((item, index) => {
                    if (!isChequeForma(item.forma_recebimento_prevista)) return null;
                    return (
                      <article key={`cheque-${index}`} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--c-text)]">{item.descricao || `Cheque ${index + 1}`}</span>
                          <span className="text-sm font-semibold text-[var(--c-text)]">{formatCurrency(item.valor || item.valor_original)}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <label className="space-y-1 text-sm text-[var(--c-text)]">Numero do cheque *
                            <input className="input w-full" value={item.cheque_numero || ''} onChange={(e) => updateParcela(index, 'cheque_numero', e.target.value)} />
                          </label>
                          <label className="space-y-1 text-sm text-[var(--c-text)]">Titular *
                            <input className="input w-full" value={item.cheque_titular_nome || ''} onChange={(e) => updateParcela(index, 'cheque_titular_nome', e.target.value)} />
                          </label>
                          <label className="space-y-1 text-sm text-[var(--c-text)]">CPF/CNPJ do titular *
                            <input className="input w-full" inputMode="numeric" value={item.cheque_titular_documento || ''} onChange={(e) => updateParcela(index, 'cheque_titular_documento', maskCpfCnpj(e.target.value))} />
                          </label>
                          <label className="space-y-1 text-sm text-[var(--c-text)]">Banco *
                            <input className="input w-full" value={item.cheque_banco || ''} onChange={(e) => updateParcela(index, 'cheque_banco', e.target.value)} />
                          </label>
                          <label className="space-y-1 text-sm text-[var(--c-text)]">Agencia
                            <input className="input w-full" value={item.cheque_agencia || ''} onChange={(e) => updateParcela(index, 'cheque_agencia', e.target.value)} />
                          </label>
                          <label className="space-y-1 text-sm text-[var(--c-text)]">Conta
                            <input className="input w-full" value={item.cheque_conta || ''} onChange={(e) => updateParcela(index, 'cheque_conta', e.target.value)} />
                          </label>
                          <label className="space-y-1 text-sm text-[var(--c-text)]">Data de emissao *
                            <input className="input w-full" type="date" value={item.cheque_data_emissao || ''} onChange={(e) => updateParcela(index, 'cheque_data_emissao', e.target.value)} />
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </section>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : form.id ? 'Salvar resumo' : 'Criar contrato'}
            </button>
            {!form.id && (
              <button type="button" className="btn btn-outline" onClick={limparFormasPagamentoContrato} disabled={saving}>
                Limpar formas de pagamento
              </button>
            )}
            {!form.id && (
              <button type="button" className="btn btn-outline border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => limparDadosContrato()} disabled={saving}>
                Limpar dados do contrato
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="sol-surface-card rounded-2xl p-4 md:p-5">
        <div className="sol-filtros-head">
          <div>
            <p className="sol-filtros-title">Carteira comercial</p>
            <p className="sol-filtros-subtitle">Contratos de venda com acesso rapido ao financeiro.</p>
          </div>
          <div className="sol-filtros-meta">
            <span>Total listado {contratosFiltrados.length}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <label className="sol-filter-field">
            <span className="sol-filter-label">Status</span>
            <select className="input w-full" value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
              <option value="">Todos</option>
              {STATUS_CONTRATO.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="sol-filter-field">
            <span className="sol-filter-label">Busca</span>
            <input className="input w-full" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Contrato, cliente ou unidade" />
          </label>
        </div>

        <div className="app-table-shell mt-4 overflow-hidden rounded-xl border border-[var(--c-border)]">
          {contratosFiltrados.length === 0 ? (
            <div className="app-empty-card">Nenhum contrato comercial encontrado.</div>
          ) : (
            <ResizableTable
              columns={CONTRATOS_CARTEIRA_COLUMNS}
              storageKey="fluxy.comercial.contratos.carteira.columns"
              className="table"
              scrollLabel="Carteira de contratos comerciais com colunas redimensionaveis"
            >
              <thead>
                <tr>
                  <ResizableTh columnKey="contrato">Contrato</ResizableTh>
                  <ResizableTh columnKey="status">Status</ResizableTh>
                  <ResizableTh columnKey="cliente">Cliente</ResizableTh>
                  <ResizableTh columnKey="empreendimento">Empreendimento</ResizableTh>
                  <ResizableTh columnKey="unidade">Torre / unidade</ResizableTh>
                  <ResizableTh columnKey="corretor">Corretor</ResizableTh>
                  <ResizableTh columnKey="comissao" className="text-right">Comissao</ResizableTh>
                  <ResizableTh columnKey="obra">Obra</ResizableTh>
                  <ResizableTh columnKey="valor_total" className="text-right">Valor total</ResizableTh>
                  <ResizableTh columnKey="em_aberto" className="text-right">Em aberto</ResizableTh>
                  <ResizableTh columnKey="vencido" className="text-right">Vencido</ResizableTh>
                  <ResizableTh columnKey="acoes" className="text-center">Acoes</ResizableTh>
                </tr>
              </thead>
              <tbody>
                {contratosFiltrados.map((item) => (
                  <tr key={item.id}>
                    <td className="font-semibold text-[var(--c-text)]" title={item.numero || ''}>{item.numero || '-'}</td>
                    <td>
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span>
                      {item.indicadoresFinanceiros?.status_sugerido && item.indicadoresFinanceiros.status_sugerido !== item.status && (
                          <span className="inline-flex max-w-full rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700" title={`Financeiro sugere ${item.indicadoresFinanceiros.status_sugerido}`}>
                            Sugere {item.indicadoresFinanceiros.status_sugerido}
                          </span>
                        )}
                      </div>
                    </td>
                    <td title={item.cliente?.nome || ''}>{item.cliente?.nome || '-'}</td>
                    <td title={item.empreendimento?.nome || ''}>{item.empreendimento?.nome || '-'}</td>
                    <td title={[item.unidadeComercial?.torre, item.unidadeComercial?.codigo].filter(Boolean).join(' - ')}>
                      {[item.unidadeComercial?.torre, item.unidadeComercial?.codigo].filter(Boolean).join(' - ') || '-'}
                    </td>
                    <td title={item.corretor_nome || ''}>{item.corretor_nome || '-'}</td>
                    <td className="text-right">
                      {Number(item.comissao_percentual || 0) > 0 ? `${Number(item.comissao_percentual).toLocaleString('pt-BR')}%` : '-'}
                    </td>
                    <td title={item.obra?.nome || ''}>{item.obra?.nome || '-'}</td>
                    <td className="text-right font-medium tabular-nums">{formatCurrency(item.valor_total)}</td>
                    <td className="text-right font-medium tabular-nums">{formatCurrency(item.indicadoresFinanceiros?.valor_em_aberto || 0)}</td>
                    <td className="text-right font-medium tabular-nums">{formatCurrency(item.indicadoresFinanceiros?.valor_vencido || 0)}</td>
                    <td>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm inline-flex h-9 w-9 items-center justify-center p-0"
                          onClick={() => selecionarContrato(item.id)}
                          title="Abrir detalhes"
                          aria-label={`Abrir detalhes do contrato ${item.numero}`}
                        >
                          <HiOutlineEye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm inline-flex h-9 w-9 items-center justify-center p-0"
                          onClick={() => editarContrato(item.id)}
                          title="Editar resumo"
                          aria-label={`Editar resumo do contrato ${item.numero}`}
                        >
                          <HiOutlinePencilSquare className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResizableTable>
          )}
        </div>
      </section>

      {contratoSelecionado && (
        <section className="sol-surface-card rounded-2xl p-4 md:p-5">
          <div className="sol-filtros-head">
            <div>
              <p className="sol-filtros-title">Detalhe do contrato {contratoSelecionado.numero}</p>
              <p className="sol-filtros-subtitle">Parcelas geradas e acesso aos titulos do financeiro.</p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--c-border)]">
            <div className="bg-[var(--c-bg)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">Unidades vinculadas</div>
            <div className="divide-y divide-[var(--c-border)]">
              {(contratoSelecionado.unidades || []).map((item) => (
                <div key={item.unidade_comercial_id} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[minmax(0,1fr)_170px_170px_auto]">
                  <span className="font-medium text-[var(--c-text)]">{buildUnidadeOptionLabel(item.unidade)}</span>
                  <span className="text-[var(--c-muted)]">Cadastro: {formatCurrency(item.valor_cadastro_referencia)}</span>
                  <span className="text-[var(--c-text)]">Valor da unidade: {formatCurrency(item.valor_atribuido)}</span>
                  <span className="text-xs text-[var(--c-muted)]">{item.principal ? 'Principal' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">Corretor</div>
              <div className="mt-2 text-sm font-semibold text-[var(--c-text)]">{contratoSelecionado.corretor_nome || '-'}</div>
            </div>
            <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">Comissao</div>
              <div className="mt-2 text-sm font-semibold text-[var(--c-text)]">
                {Number(contratoSelecionado.comissao_percentual || 0) > 0
                  ? `${Number(contratoSelecionado.comissao_percentual).toLocaleString('pt-BR')}%`
                  : '-'}
              </div>
              <div className="mt-1 text-xs text-[var(--c-muted)]">
                Competencia DRE: {formatDate(contratoSelecionado.competencia_comissao_data)}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">Titulo comissao</div>
              <div className="mt-2">
                {contratoSelecionado.tituloFinanceiroComissao?.id ? (
                  <Link className="btn btn-outline" to={`/financeiro/titulos/${contratoSelecionado.tituloFinanceiroComissao.id}`}>
                    Abrir titulo da comissao
                  </Link>
                ) : (
                  <span className="text-sm text-[var(--c-muted)]">Nao gerado</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">Status sugerido</div>
              <div className="mt-2 text-sm font-semibold text-[var(--c-text)]">{contratoSelecionado.indicadoresFinanceiros?.status_sugerido || contratoSelecionado.status}</div>
            </div>
            <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">Valor em aberto</div>
              <div className="mt-2 text-sm font-semibold text-[var(--c-text)]">{formatCurrency(contratoSelecionado.indicadoresFinanceiros?.valor_em_aberto || 0)}</div>
            </div>
            <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">Valor vencido</div>
              <div className="mt-2 text-sm font-semibold text-[var(--c-text)]">{formatCurrency(contratoSelecionado.indicadoresFinanceiros?.valor_vencido || 0)}</div>
            </div>
            <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">Proximo vencimento</div>
              <div className="mt-2 text-sm font-semibold text-[var(--c-text)]">{formatDate(contratoSelecionado.indicadoresFinanceiros?.proximo_vencimento)}</div>
            </div>
          </div>

          {(contratoSelecionado.data_distrato || contratoSelecionado.motivo_distrato) && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <strong>Distrato registrado.</strong> Data: {formatDate(contratoSelecionado.data_distrato)}. Motivo: {contratoSelecionado.motivo_distrato || '-'}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--c-text)]">Acoes operacionais do contrato</p>
                <p className="text-xs text-[var(--c-muted)]">Controle inadimplencia, distrato guiado e troca de unidade com ajuste financeiro.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline" onClick={() => handleSincronizarStatusFinanceiro(contratoSelecionado.id)} disabled={processingAction === 'sync'}>
                  {processingAction === 'sync' ? 'Sincronizando...' : 'Sincronizar status financeiro'}
                </button>
                {!['DISTRATADO', 'CANCELADO'].includes(String(contratoSelecionado.status || '').toUpperCase()) && (
                  <>
                    <button type="button" className="btn btn-outline" onClick={() => { setShowTroca((value) => !value); setShowDistrato(false); }}>
                      {showTroca ? 'Fechar troca' : 'Trocar unidade'}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => { setShowDistrato((value) => !value); setShowTroca(false); }}>
                      {showDistrato ? 'Fechar distrato' : 'Distratar contrato'}
                    </button>
                  </>
                )}
                {isSuperadmin && (
                  <button
                    type="button"
                    className="btn btn-outline border-rose-200 text-rose-700 hover:bg-rose-50"
                    onClick={handleExcluirContrato}
                    disabled={processingAction === 'excluir' || possuiContratoAssinado}
                    title={possuiContratoAssinado ? 'Contratos assinados nao podem ser excluidos.' : 'Excluir contrato nao assinado'}
                  >
                    {processingAction === 'excluir' ? 'Excluindo...' : 'Excluir contrato'}
                  </button>
                )}
              </div>
            </div>

            {showTroca && (
              <div className="grid gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4 md:grid-cols-6">
                {(contratoSelecionado.unidades || []).length > 1 && (
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Unidade que sera trocada</span>
                    <select className="input w-full" value={trocaForm.unidade_comercial_origem_id} onChange={(e) => setTrocaForm((current) => ({ ...current, unidade_comercial_origem_id: e.target.value }))}>
                      <option value="">Selecione</option>
                      {(contratoSelecionado.unidades || []).map((item) => <option key={item.unidade_comercial_id} value={item.unidade_comercial_id}>{buildUnidadeOptionLabel(item.unidade)}</option>)}
                    </select>
                  </label>
                )}
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Nova unidade</span>
                  <select className="input w-full" value={trocaForm.unidade_comercial_destino_id} onChange={(e) => setTrocaForm((current) => ({ ...current, unidade_comercial_destino_id: e.target.value }))}>
                    <option value="">Selecione</option>
                    {unidadesElegiveisTroca.map((item) => <option key={item.id} value={item.id}>{item.codigo} - {item.empreendimento?.nome || item.nome || 'Unidade'}</option>)}
                  </select>
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Novo valor total</span>
                  <input className="input w-full" inputMode="decimal" value={trocaForm.novo_valor_total} onChange={(e) => setTrocaForm((current) => ({ ...current, novo_valor_total: normalizeCurrencyTyping(e.target.value) }))} onBlur={(e) => setTrocaForm((current) => ({ ...current, novo_valor_total: formatCurrencyInput(e.target.value) }))} placeholder="R$ 0,00" />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Data efetiva</span>
                  <input className="input w-full" type="date" value={trocaForm.data_efetiva} onChange={(e) => setTrocaForm((current) => ({ ...current, data_efetiva: e.target.value }))} />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Competencia DRE do ajuste</span>
                  <input className="input w-full" type="date" value={trocaForm.competencia_data} onChange={(e) => setTrocaForm((current) => ({ ...current, competencia_data: e.target.value }))} />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Observacoes</span>
                  <input className="input w-full" value={trocaForm.observacoes} onChange={(e) => setTrocaForm((current) => ({ ...current, observacoes: e.target.value }))} />
                </label>
                <div className="md:col-span-5">
                  <button type="button" className="btn btn-primary" onClick={handleTrocaUnidadeContrato} disabled={processingAction === 'troca'}>
                    {processingAction === 'troca' ? 'Aplicando troca...' : 'Confirmar troca de unidade'}
                  </button>
                </div>
              </div>
            )}

            {showDistrato && (
              <div className="grid gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 md:grid-cols-3">
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Data do distrato</span>
                  <input className="input w-full" type="date" value={distratoForm.data_distrato} onChange={(e) => setDistratoForm((current) => ({ ...current, data_distrato: e.target.value }))} />
                </label>
                <label className="sol-filter-field md:col-span-2">
                  <span className="sol-filter-label">Motivo</span>
                  <input className="input w-full" value={distratoForm.motivo_distrato} onChange={(e) => setDistratoForm((current) => ({ ...current, motivo_distrato: e.target.value }))} />
                </label>
                <label className="sol-filter-field md:col-span-3">
                  <span className="sol-filter-label">Observacoes</span>
                  <textarea className="input min-h-[92px] w-full" value={distratoForm.observacoes} onChange={(e) => setDistratoForm((current) => ({ ...current, observacoes: e.target.value }))} />
                </label>
                <div className="md:col-span-3">
                  <button type="button" className="btn btn-primary" onClick={handleDistratarContrato} disabled={processingAction === 'distrato'}>
                    {processingAction === 'distrato' ? 'Distratando...' : 'Confirmar distrato'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--c-text)]">Documentos e assinatura digital</p>
                <p className="text-xs text-[var(--c-muted)]">
                  Ao gerar contrato, o PDF sai com Quadro Resumo primeiro e Contrato na sequencia.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGerarDocumentoContrato}
                  disabled={
                    processingAction === 'gerar-documento'
                    || modelosDoContratoSelecionado.length === 0
                    || !possuiModeloQuadroResumoSelecionado
                    || possuiContratoAssinado
                  }
                >
                  {processingAction === 'gerar-documento' ? 'Gerando PDF...' : 'Gerar PDF completo'}
                </button>
                <label className="btn btn-outline cursor-pointer">
                  <input
                    className="sr-only"
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={possuiContratoAssinado}
                    onChange={(event) => setContratoAssinadoArquivo(event.target.files?.[0] || null)}
                  />
                  {contratoAssinadoArquivo ? contratoAssinadoArquivo.name : 'Selecionar contrato assinado'}
                </label>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleAnexarContratoAssinado}
                  disabled={possuiContratoAssinado || !contratoAssinadoArquivo || processingAction === 'anexar-assinado'}
                >
                  {processingAction === 'anexar-assinado' ? 'Anexando...' : 'Anexar PDF assinado'}
                </button>
              </div>
            </div>

            {modelosDoContratoSelecionado.length === 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Cadastre um modelo DOCX para este empreendimento e tipo de documento antes de gerar o PDF.
                <Link className="btn btn-outline btn-sm ml-2" to="/comercial/modelos-contrato">
                  Abrir modelos
                </Link>
              </div>
            )}

            {!possuiModeloQuadroResumoSelecionado && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Para gerar o contrato completo, cadastre tambem um modelo ativo de Quadro Resumo para este empreendimento.
              </div>
            )}

            {possuiContratoAssinado && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Este contrato ja possui documento assinado digitalmente. Uma nova geracao fica bloqueada para preservar o arquivo assinado.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              {documentosContratoPadrao.length === 0 ? (
                <div className="app-empty-card md:col-span-2">Nenhum documento gerado para este contrato.</div>
              ) : (
                documentosContratoPadrao.map((documento) => (
                  <article key={documento.id} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4">
                    {(() => {
                      const documentoAssinado = documentoEstaAssinado(documento);
                      return (
                        <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">{documentoTipoLabel(documento.tipo_documento)}</div>
                        <div className="mt-2 text-sm font-semibold text-[var(--c-text)]">{documento.nome}</div>
                        <div className="mt-1 text-xs text-[var(--c-muted)]">Status: {documento.status}</div>
                        {documento.erro && <div className="mt-2 text-xs text-rose-600">{documento.erro}</div>}
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(documento.status)}`}>
                        {documento.status}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-outline" onClick={() => abrirDocumentoContrato(documento.id, 'pdf')}>
                        Abrir PDF
                      </button>
                      {isSuperadmin && (
                        <button
                          type="button"
                          className="btn btn-outline border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() => handleExcluirDocumentoContrato(documento)}
                          disabled={processingAction === `excluir-doc-${documento.id}` || documentoAssinado}
                          title={documentoAssinado ? 'Documentos assinados nao podem ser excluidos.' : 'Excluir PDF gerado'}
                        >
                          {processingAction === `excluir-doc-${documento.id}` ? 'Excluindo...' : 'Excluir PDF gerado'}
                        </button>
                      )}
                    </div>
                        </>
                      );
                    })()}
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--c-border)]">
            <table className="min-w-[1180px] text-sm">
              <thead className="bg-[var(--c-bg)] text-[var(--c-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left">Seq.</th>
                  <th className="px-4 py-3 text-left">Descricao</th>
                  <th className="px-4 py-3 text-left">Forma prevista</th>
                  <th className="px-4 py-3 text-left">Reajuste</th>
                  <th className="px-4 py-3 text-left">Detalhe</th>
                  <th className="px-4 py-3 text-left">Vencimento</th>
                  <th className="px-4 py-3 text-left">Competencia DRE</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-left">Status financeiro</th>
                  <th className="px-4 py-3 text-right">Acao</th>
                </tr>
              </thead>
              <tbody>
                {(contratoSelecionado.parcelas || []).map((parcela) => {
                  const cheque = parcela.tituloFinanceiro?.chequesTerceiros?.[0];
                  return (
                  <tr key={parcela.id} className="border-t border-[var(--c-border)]">
                    <td className="px-4 py-3 text-[var(--c-text)]">{parcela.sequencia}</td>
                    <td className="px-4 py-3 text-[var(--c-text)]">{parcela.descricao}</td>
                    <td className="px-4 py-3 text-[var(--c-text)]">
                      <div>{parcela.forma_recebimento_prevista || '-'}</div>
                      {cheque && (
                        <div className="mt-1 max-w-[280px] text-xs leading-relaxed text-[var(--c-muted)]">
                          Cheque {cheque.numero_cheque} · {cheque.banco || 'Banco nao informado'} · {cheque.titular_nome || 'Titular nao informado'} · {cheque.titular_documento ? maskCpfCnpj(cheque.titular_documento) : 'Documento nao informado'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--c-text)]">{String(parcela.reajuste_tipo || 'FIXA') === 'REAJUSTAVEL' ? 'Reajustavel (R)' : 'Fixa (F)'}</td>
                    <td className="px-4 py-3 text-[var(--c-text)]">{parcela.observacoes || '-'}</td>
                    <td className="px-4 py-3 text-[var(--c-text)]">{formatDate(parcela.tituloFinanceiro?.data_vencimento || parcela.data_vencimento)}</td>
                    <td className="px-4 py-3 text-[var(--c-text)]">{formatDate(parcela.competencia_data || parcela.tituloFinanceiro?.competencia_data)}</td>
                    <td className="px-4 py-3 text-right text-[var(--c-text)]">{formatCurrency(parcela.valor_original)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(parcela.tituloFinanceiro?.status || 'ABERTO')}`}>
                        {parcela.tituloFinanceiro?.status || 'ABERTO'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {parcela.tituloFinanceiro?.id ? (
                        <Link className="btn btn-outline" to={`/financeiro/titulos/${parcela.tituloFinanceiro.id}`}>
                          Abrir titulo
                        </Link>
                      ) : (
                        <span className="text-[var(--c-muted)]">-</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
            <div className="text-sm font-semibold text-[var(--c-text)]">Historico operacional</div>
            <div className="mt-3 space-y-3">
              {(contratoSelecionado.eventos || []).length === 0 ? (
                <div className="text-sm text-[var(--c-muted)]">Nenhum evento comercial registrado para este contrato.</div>
              ) : (
                (contratoSelecionado.eventos || []).map((evento) => (
                  <article key={`${evento.id}-${evento.data_evento}`} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{evento.tipo_evento}</span>
                      <span className="text-[var(--c-muted)]">{formatDate(evento.data_evento)}</span>
                      <span className="text-[var(--c-muted)]">{evento.criadoPor?.nome || '-'}</span>
                    </div>
                    <div className="mt-2 text-sm font-medium text-[var(--c-text)]">{evento.descricao}</div>
                    {evento.metadata && (
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950/90 p-3 text-xs text-slate-100">{JSON.stringify(evento.metadata, null, 2)}</pre>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {pessoaRapidaModal && (
        <div className="quick-person-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="quick-person-dialog w-full">
            <div className="quick-person-header">
              <div>
                <p className="quick-person-kicker">Contrato comercial</p>
                <h2 className="quick-person-title">
                  Cadastro rapido de {pessoaRapidaModal === 'cliente' ? 'cliente' : pessoaRapidaModal === 'testemunha' ? 'testemunha' : 'corretor'}
                </h2>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => {
                setPessoaRapidaModal(null);
                setTestemunhaRapidaSlot(null);
              }}>
                Fechar
              </button>
            </div>

            <div className="quick-person-body">
              <section className="quick-person-section">
                <div className="quick-person-section-head">
                  <h3>Identificacao</h3>
                  <p>Dados minimos para criar a pessoa e vincular ao contrato.</p>
                </div>
                <div className="quick-person-grid quick-person-grid-main">
              <label className="sol-filter-field">
                <span className="sol-filter-label">{pessoaRapidaModal === 'testemunha' ? 'CPF' : 'CPF/CNPJ'}</span>
                <input
                  className="input w-full"
                  value={pessoaRapidaForm.cpf_cnpj}
                  onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, cpf_cnpj: maskCpfCnpj(e.target.value) }))}
                  onBlur={() => {
                    if (pessoaRapidaModal === 'testemunha' && pessoaRapidaForm.cpf_cnpj && onlyDigits(pessoaRapidaForm.cpf_cnpj).length !== 11) {
                      setError('Informe um CPF valido para a testemunha.');
                      return;
                    }
                    if (pessoaRapidaForm.cpf_cnpj && !isValidCpfCnpj(pessoaRapidaForm.cpf_cnpj)) {
                      setError('Informe um CPF/CNPJ valido no cadastro rapido.');
                    }
                  }}
                  required
                />
              </label>
              <label className="sol-filter-field quick-span-2">
                <span className="sol-filter-label">Nome</span>
                <input
                  className="input w-full"
                  value={pessoaRapidaForm.nome}
                  onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, nome: e.target.value }))}
                  required
                />
              </label>
              {pessoaRapidaModal !== 'testemunha' && (
                <>
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Telefone</span>
                    <input
                      className="input w-full"
                      value={pessoaRapidaForm.telefone}
                      onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, telefone: maskPhone(e.target.value) }))}
                      required
                    />
                  </label>
                  <label className="sol-filter-field quick-span-2">
                    <span className="sol-filter-label">E-mail</span>
                    <input
                      className="input w-full"
                      value={pessoaRapidaForm.email}
                      onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, email: e.target.value }))}
                    />
                  </label>
                </>
              )}
              {pessoaRapidaModal === 'corretor' && (
                <label className="sol-filter-field quick-span-2">
                  <span className="sol-filter-label">CRECI</span>
                  <input
                    className="input w-full"
                    value={pessoaRapidaForm.creci}
                    onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, creci: maskCreci(e.target.value) }))}
                  />
                </label>
              )}
                </div>
              </section>

            {pessoaRapidaModal === 'cliente' && (
                <section className="quick-person-section">
                  <div className="quick-person-section-head">
                    <h3>Dados civis</h3>
                    <p>Campos usados pelos modelos de contrato e quadro resumo.</p>
                  </div>
                  <div className="quick-person-grid">
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Nascimento</span>
                  <input
                    className="input w-full"
                    type="date"
                    value={pessoaRapidaForm.data_nascimento}
                    onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, data_nascimento: e.target.value }))}
                  />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Nacionalidade</span>
                  <input
                    className="input w-full"
                    value={pessoaRapidaForm.nacionalidade}
                    onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, nacionalidade: e.target.value }))}
                  />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Profissao</span>
                  <input
                    className="input w-full"
                    value={pessoaRapidaForm.profissao}
                    onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, profissao: e.target.value }))}
                  />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Estado civil</span>
                  <input
                    className="input w-full"
                    value={pessoaRapidaForm.estado_civil}
                    onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, estado_civil: e.target.value }))}
                  />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Regime de bens</span>
                  <input
                    className="input w-full"
                    value={pessoaRapidaForm.regime_bens}
                    onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, regime_bens: e.target.value }))}
                  />
                </label>
                <label className="quick-person-check quick-span-2">
                  <input
                    type="checkbox"
                    checked={pessoaRapidaForm.possui_conjuge}
                    onChange={(e) => setPessoaRapidaForm((current) => ({
                      ...current,
                      possui_conjuge: e.target.checked,
                      conjuge: e.target.checked ? current.conjuge : defaultConjugeRapidoForm()
                    }))}
                  />
                  <span>
                    <strong>Possui conjuge</strong>
                    <small>Cadastra o conjuge como uma segunda pessoa no sistema.</small>
                  </span>
                </label>
                  </div>
                </section>
            )}

              {pessoaRapidaModal !== 'testemunha' && (
                <section className="quick-person-section">
                  <div className="quick-person-section-head">
                    <h3>Endereco</h3>
                    <p>Preenche rua, numero, bairro, cidade, UF e CEP nos documentos.</p>
                  </div>
                  <div className="quick-person-grid">
                    <label className="sol-filter-field quick-span-2">
                      <span className="sol-filter-label">Endereco</span>
                      <input
                        className="input w-full"
                        value={pessoaRapidaForm.endereco}
                        onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, endereco: e.target.value }))}
                      />
                    </label>
                    <label className="sol-filter-field">
                      <span className="sol-filter-label">Numero</span>
                      <input
                        className="input w-full"
                        value={pessoaRapidaForm.numero}
                        onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, numero: e.target.value }))}
                      />
                    </label>
                    <label className="sol-filter-field">
                      <span className="sol-filter-label">Complemento</span>
                      <input
                        className="input w-full"
                        value={pessoaRapidaForm.complemento}
                        onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, complemento: e.target.value }))}
                      />
                    </label>
                    <label className="sol-filter-field">
                      <span className="sol-filter-label">Bairro</span>
                      <input
                        className="input w-full"
                        value={pessoaRapidaForm.bairro}
                        onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, bairro: e.target.value }))}
                      />
                    </label>
                    <label className="sol-filter-field">
                      <span className="sol-filter-label">CEP</span>
                      <input
                        className="input w-full"
                        value={pessoaRapidaForm.cep}
                        onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, cep: maskCep(e.target.value) }))}
                      />
                    </label>
                    <label className="sol-filter-field">
                      <span className="sol-filter-label">Municipio</span>
                      <input
                        className="input w-full"
                        value={pessoaRapidaForm.municipio}
                        onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, municipio: e.target.value }))}
                      />
                    </label>
                    <label className="sol-filter-field">
                      <span className="sol-filter-label">UF</span>
                      <input
                        className="input w-full"
                        maxLength={2}
                        value={pessoaRapidaForm.estado}
                        onChange={(e) => setPessoaRapidaForm((current) => ({ ...current, estado: e.target.value.toUpperCase() }))}
                      />
                    </label>
                  </div>
                </section>
              )}

              {pessoaRapidaModal === 'cliente' && pessoaRapidaForm.possui_conjuge && (
                <>
                  <section className="quick-person-section">
                    <div className="quick-person-section-head">
                      <h3>Conjuge</h3>
                      <p>Cria uma segunda pessoa ativa e vincula ao cliente principal.</p>
                    </div>
                    <div className="quick-person-grid quick-person-grid-main">
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">CPF/CNPJ</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.cpf_cnpj}
                          onChange={(e) => atualizarConjugeRapido('cpf_cnpj', maskCpfCnpj(e.target.value))}
                          onBlur={() => {
                            if (pessoaRapidaForm.conjuge.cpf_cnpj && !isValidCpfCnpj(pessoaRapidaForm.conjuge.cpf_cnpj)) {
                              setError('Informe um CPF/CNPJ valido para o conjuge.');
                            }
                          }}
                        />
                      </label>
                      <label className="sol-filter-field quick-span-2">
                        <span className="sol-filter-label">Nome</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.nome}
                          onChange={(e) => atualizarConjugeRapido('nome', e.target.value)}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">Telefone</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.telefone}
                          onChange={(e) => atualizarConjugeRapido('telefone', maskPhone(e.target.value))}
                        />
                      </label>
                      <label className="sol-filter-field quick-span-2">
                        <span className="sol-filter-label">E-mail</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.email}
                          onChange={(e) => atualizarConjugeRapido('email', e.target.value)}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="quick-person-section">
                    <div className="quick-person-section-head">
                      <h3>Dados civis do conjuge</h3>
                      <p>Usado nos contratos quando o modelo exigir assinatura do casal.</p>
                    </div>
                    <div className="quick-person-grid">
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">Nascimento</span>
                        <input
                          className="input w-full"
                          type="date"
                          value={pessoaRapidaForm.conjuge.data_nascimento}
                          onChange={(e) => atualizarConjugeRapido('data_nascimento', e.target.value)}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">Nacionalidade</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.nacionalidade}
                          onChange={(e) => atualizarConjugeRapido('nacionalidade', e.target.value)}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">Profissao</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.profissao}
                          onChange={(e) => atualizarConjugeRapido('profissao', e.target.value)}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">Estado civil</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.estado_civil}
                          onChange={(e) => atualizarConjugeRapido('estado_civil', e.target.value)}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="quick-person-section">
                    <div className="quick-person-section-head">
                      <h3>Endereco do conjuge</h3>
                      <p>Pode repetir o endereco do cliente ou guardar um endereco proprio.</p>
                    </div>
                    <div className="quick-person-grid">
                      <label className="sol-filter-field quick-span-2">
                        <span className="sol-filter-label">Endereco</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.endereco}
                          onChange={(e) => atualizarConjugeRapido('endereco', e.target.value)}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">Numero</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.numero}
                          onChange={(e) => atualizarConjugeRapido('numero', e.target.value)}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">Complemento</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.complemento}
                          onChange={(e) => atualizarConjugeRapido('complemento', e.target.value)}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">Bairro</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.bairro}
                          onChange={(e) => atualizarConjugeRapido('bairro', e.target.value)}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">CEP</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.cep}
                          onChange={(e) => atualizarConjugeRapido('cep', maskCep(e.target.value))}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">Municipio</span>
                        <input
                          className="input w-full"
                          value={pessoaRapidaForm.conjuge.municipio}
                          onChange={(e) => atualizarConjugeRapido('municipio', e.target.value)}
                        />
                      </label>
                      <label className="sol-filter-field">
                        <span className="sol-filter-label">UF</span>
                        <input
                          className="input w-full"
                          maxLength={2}
                          value={pessoaRapidaForm.conjuge.estado}
                          onChange={(e) => atualizarConjugeRapido('estado', e.target.value.toUpperCase())}
                        />
                      </label>
                    </div>
                  </section>
                </>
              )}
            </div>

            <div className="quick-person-footer">
              <p>
                {pessoaRapidaModal === 'cliente'
                  ? 'Sera salvo como cliente ativo e selecionado neste contrato.'
                  : pessoaRapidaModal === 'testemunha'
                    ? 'Sera salvo como testemunha ativa e preenchera o campo selecionado.'
                    : 'Sera salvo como corretor e credor/fornecedor para comissao financeira.'}
              </p>
              <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => {
                setPessoaRapidaModal(null);
                setTestemunhaRapidaSlot(null);
              }}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={salvarPessoaRapida}>
                Salvar pessoa
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
