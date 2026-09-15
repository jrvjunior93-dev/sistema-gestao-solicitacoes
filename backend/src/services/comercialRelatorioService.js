const { Op } = require('sequelize');
const {
  ContratoComercial,
  ContratoComercialDocumento,
  ContratoComercialParcela,
  ContratoComercialUnidade,
  Empreendimento,
  Obra,
  Parceiro,
  UnidadeComercial
} = require('../models');

const STATUS_CONTRATOS_CARTEIRA = ['ATIVO', 'INADIMPLENTE', 'QUITADO'];

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function resolvePeriodo(query = {}) {
  const hoje = new Date();
  const today = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  let dataInicial = query.data_inicial;
  let dataFinal = query.data_final;

  if (!dataInicial || !dataFinal) {
    const periodo = String(query.periodo || 'MES_ATUAL').toUpperCase();
    if (periodo === '30_DIAS') {
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 29);
      dataInicial = dataInicial || toDateOnly(start);
      dataFinal = dataFinal || toDateOnly(today);
    } else if (periodo === '90_DIAS') {
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 89);
      dataInicial = dataInicial || toDateOnly(start);
      dataFinal = dataFinal || toDateOnly(today);
    } else if (periodo === 'ANO_ATUAL') {
      dataInicial = dataInicial || `${today.getUTCFullYear()}-01-01`;
      dataFinal = dataFinal || toDateOnly(today);
    } else {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      dataInicial = dataInicial || toDateOnly(start);
      dataFinal = dataFinal || toDateOnly(end);
    }
  }

  return {
    periodo: query.periodo || 'MES_ATUAL',
    data_inicial: dataInicial,
    data_final: dataFinal
  };
}

function incrementMap(map, key, amount = 1) {
  const normalized = key || 'Nao informado';
  map.set(normalized, (map.get(normalized) || 0) + amount);
}

function sumMap(map, key, amount = 0) {
  const normalized = key || 'Nao informado';
  map.set(normalized, toNumber(map.get(normalized)) + toNumber(amount));
}

function mapToRows(map, valueKey = 'total') {
  return Array.from(map.entries())
    .map(([nome, value]) => ({ nome, [valueKey]: value }))
    .sort((a, b) => toNumber(b[valueKey]) - toNumber(a[valueKey]));
}

function monthKey(date) {
  return date ? String(date).slice(0, 7) : 'Sem data';
}

async function gerarRelatorioComercialOperacional(query = {}) {
  const periodo = resolvePeriodo(query);
  const contratoWhere = {
    data_contrato: { [Op.between]: [periodo.data_inicial, periodo.data_final] }
  };
  const unidadeWhere = {};
  const empreendimentoWhere = {};

  if (query.empreendimento_id) {
    contratoWhere.empreendimento_id = query.empreendimento_id;
    unidadeWhere.empreendimento_id = query.empreendimento_id;
    empreendimentoWhere.id = query.empreendimento_id;
  }
  if (query.obra_id) {
    contratoWhere.obra_id = query.obra_id;
    empreendimentoWhere.obra_id = query.obra_id;
  }
  if (query.status) contratoWhere.status = query.status;

  const [contratos, unidades, empreendimentos, documentos] = await Promise.all([
    ContratoComercial.findAll({
      where: contratoWhere,
      include: [
        { model: Empreendimento, as: 'empreendimento', attributes: ['id', 'nome', 'obra_id'] },
        { model: UnidadeComercial, as: 'unidadeComercial', attributes: ['id', 'codigo', 'nome', 'situacao', 'valor_tabela'] },
        {
          model: ContratoComercialUnidade,
          as: 'unidadesContrato',
          separate: true,
          order: [['ordem', 'ASC']],
          include: [{ model: UnidadeComercial, as: 'unidadeComercial', attributes: ['id', 'codigo', 'nome', 'situacao', 'valor_tabela'] }]
        },
        { model: Parceiro, as: 'cliente', attributes: ['id', 'nome', 'cpf_cnpj'] },
        { model: Parceiro, as: 'corretorParceiro', attributes: ['id', 'nome'] },
        { model: Obra, as: 'obra', attributes: ['id', 'nome'] },
        { model: ContratoComercialParcela, as: 'parcelas', attributes: ['id', 'valor_original', 'data_vencimento', 'tipo_parcela'] }
      ],
      order: [['data_contrato', 'DESC']]
    }),
    UnidadeComercial.findAll({
      where: unidadeWhere,
      include: [
        {
          model: Empreendimento,
          as: 'empreendimento',
          attributes: ['id', 'nome', 'obra_id'],
          where: empreendimentoWhere,
          required: Boolean(query.obra_id || query.empreendimento_id)
        }
      ],
      order: [['codigo', 'ASC']]
    }),
    Empreendimento.findAll({
      where: empreendimentoWhere,
      include: [{ model: Obra, as: 'obra', attributes: ['id', 'nome'] }],
      order: [['nome', 'ASC']]
    }),
    ContratoComercialDocumento.findAll({
      include: [
        {
          model: ContratoComercial,
          as: 'contrato',
          attributes: ['id', 'empreendimento_id', 'obra_id', 'data_contrato', 'status'],
          where: contratoWhere,
          required: true
        }
      ]
    })
  ]);

  const contratosPorStatus = new Map();
  const contratosPorMes = new Map();
  const vgvPorEmpreendimento = new Map();
  const contratosPorEmpreendimento = new Map();
  const contratosPorCorretor = new Map();
  const unidadesPorSituacao = new Map();
  const estoquePorEmpreendimento = new Map();
  const documentosPorStatus = new Map();
  let vgvCarteira = 0;
  let vgvDistratado = 0;
  let descontosConcedidos = 0;
  let comissaoPrevista = 0;
  let valorParcelas = 0;
  let parcelasQuantidade = 0;

  contratos.forEach((contrato) => {
    const valorTotal = toNumber(contrato.valor_total);
    const status = contrato.status || 'Nao informado';
    const empreendimentoNome = contrato.empreendimento?.nome || 'Sem empreendimento';
    const corretorNome = contrato.corretorParceiro?.nome || contrato.corretor_nome || 'Sem corretor';

    incrementMap(contratosPorStatus, status);
    incrementMap(contratosPorMes, monthKey(contrato.data_contrato));
    incrementMap(contratosPorEmpreendimento, empreendimentoNome);
    incrementMap(contratosPorCorretor, corretorNome);
    const discounts = toNumber(contrato.desconto_concedido);

    if (STATUS_CONTRATOS_CARTEIRA.includes(status)) {
      vgvCarteira += valorTotal;
      sumMap(vgvPorEmpreendimento, empreendimentoNome, valorTotal);
      descontosConcedidos += discounts;
      comissaoPrevista += valorTotal * (toNumber(contrato.comissao_percentual) / 100);
    }
    if (status === 'DISTRATADO') {
      vgvDistratado += valorTotal;
    }

    (contrato.parcelas || []).forEach((parcela) => {
      valorParcelas += toNumber(parcela.valor_original);
      parcelasQuantidade += 1;
    });
  });

  unidades.forEach((unidade) => {
    const situacao = unidade.situacao || 'Nao informado';
    const empreendimentoNome = unidade.empreendimento?.nome || 'Sem empreendimento';
    incrementMap(unidadesPorSituacao, situacao);
    if (situacao === 'DISPONIVEL') {
      sumMap(estoquePorEmpreendimento, empreendimentoNome, unidade.valor_tabela);
    }
  });

  documentos.forEach((documento) => {
    incrementMap(documentosPorStatus, documento.status || 'Nao informado');
  });

  const contratosAnaliticos = contratos.slice(0, 150).map((contrato) => ({
    id: contrato.id,
    numero: contrato.numero,
    status: contrato.status,
    data_contrato: contrato.data_contrato,
    empreendimento_nome: contrato.empreendimento?.nome || null,
    unidade_codigo: contrato.unidadesContrato?.map((item) => item.unidadeComercial?.codigo).filter(Boolean).join(' / ')
      || contrato.unidadeComercial?.codigo || null,
    unidades: contrato.unidadesContrato?.map((item) => ({
      id: item.unidade_comercial_id,
      codigo: item.unidadeComercial?.codigo || null,
      valor_atribuido: toNumber(item.valor_atribuido),
      principal: Boolean(item.principal)
    })) || [],
    cliente_nome: contrato.cliente?.nome || null,
    corretor_nome: contrato.corretorParceiro?.nome || contrato.corretor_nome || null,
    obra_nome: contrato.obra?.nome || null,
    valor_total: toNumber(contrato.valor_total),
    valor_entrada: toNumber(contrato.valor_entrada),
    desconto_concedido: toNumber(contrato.desconto_concedido),
    comissao_percentual: toNumber(contrato.comissao_percentual),
    parcelas: Array.isArray(contrato.parcelas) ? contrato.parcelas.length : 0
  }));

  return {
    filtro: periodo,
    resumo: {
      empreendimentos: empreendimentos.length,
      unidades_total: unidades.length,
      unidades_disponiveis: unidadesPorSituacao.get('DISPONIVEL') || 0,
      unidades_reservadas: unidadesPorSituacao.get('RESERVADA') || 0,
      unidades_vendidas: unidadesPorSituacao.get('VENDIDA') || 0,
      contratos_periodo: contratos.length,
      contratos_carteira: contratos.filter((contrato) => STATUS_CONTRATOS_CARTEIRA.includes(contrato.status)).length,
      contratos_distratados: contratos.filter((contrato) => contrato.status === 'DISTRATADO').length,
      vgv_carteira: vgvCarteira,
      vgv_distratado: vgvDistratado,
      descontos_concedidos: descontosConcedidos,
      comissao_prevista: comissaoPrevista,
      parcelas_quantidade: parcelasQuantidade,
      valor_parcelas: valorParcelas,
      documentos_gerados: documentos.length
    },
    contratos: {
      por_status: mapToRows(contratosPorStatus),
      por_mes: mapToRows(contratosPorMes),
      por_empreendimento: mapToRows(contratosPorEmpreendimento),
      por_corretor: mapToRows(contratosPorCorretor),
      vgv_por_empreendimento: mapToRows(vgvPorEmpreendimento, 'valor'),
      analitico: contratosAnaliticos
    },
    unidades: {
      por_situacao: mapToRows(unidadesPorSituacao),
      estoque_por_empreendimento: mapToRows(estoquePorEmpreendimento, 'valor')
    },
    documentos: {
      por_status: mapToRows(documentosPorStatus)
    }
  };
}

module.exports = {
  gerarRelatorioComercialOperacional
};
