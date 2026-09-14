const { Op } = require('sequelize');
const {
  CategoriaFinanceira,
  ContaBancaria,
  EmpresaGrupo,
  FinanciamentoBancario,
  FinanciamentoBancarioParcela,
  Obra,
  Parceiro,
  SecurityEventLog,
  TituloFinanceiro,
  User,
  sequelize
} = require('../models');
const {
  canAccessFinanceiro,
  getFinanceiroObraScopeIds
} = require('./authorizationService');
const { registrarEventoSeguranca } = require('./securityLogService');

const STATUS_FINANCIAMENTO = ['RASCUNHO', 'ATIVO', 'LIQUIDADO', 'CANCELADO'];
const SISTEMAS_AMORTIZACAO = ['FIXO', 'PRICE', 'SAC'];

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function addMonths(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  date.setMonth(date.getMonth() + Number(amount || 0), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function distribuirValor(valorTotal, quantidade) {
  const totalCentavos = Math.round(Number(valorTotal || 0) * 100);
  const base = Math.floor(totalCentavos / quantidade);
  let resto = totalCentavos - (base * quantidade);
  return Array.from({ length: quantidade }, () => {
    const centavos = base + (resto > 0 ? 1 : 0);
    if (resto > 0) resto -= 1;
    return roundCurrency(centavos / 100);
  });
}

async function assertFinanceAccess(req) {
  const allowed = await canAccessFinanceiro(req.user);
  if (allowed) return;

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: 'FINANCIAMENTO_BANCARIO',
    recursoId: req.originalUrl,
    status: 'DENIED',
    descricao: 'Usuario sem permissao para acessar financiamentos bancarios'
  });

  throw createHttpError(403, 'Acesso negado para o modulo financeiro');
}

async function getFinanceiroEmpresaScopeIds(user) {
  const obrasPermitidas = await getFinanceiroObraScopeIds(user);
  if (obrasPermitidas === null) return null;
  if (!obrasPermitidas.length) return [];

  const obras = await Obra.findAll({
    where: { id: { [Op.in]: obrasPermitidas } },
    attributes: ['empresa_grupo_id'],
    raw: true
  });

  return [...new Set(
    obras
      .map((obra) => Number(obra.empresa_grupo_id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
}

async function assertEmpresaScope(req, empresaId) {
  const empresasPermitidas = await getFinanceiroEmpresaScopeIds(req.user);
  if (empresasPermitidas === null) return;

  if (empresasPermitidas.includes(Number(empresaId))) return;

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: 'FINANCIAMENTO_BANCARIO',
    recursoId: String(empresaId),
    status: 'DENIED',
    descricao: 'Usuario tentou acessar financiamento bancario fora do escopo de empresa',
    metadata: { empresa_id: Number(empresaId) || null }
  });

  throw createHttpError(403, 'Acesso negado para esta empresa');
}

function buildInclude({ includeParcelas = true } = {}) {
  const include = [
    {
      model: EmpresaGrupo,
      as: 'empresa',
      attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
    },
    {
      model: ContaBancaria,
      as: 'contaBancaria',
      attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id']
    },
    {
      model: Obra,
      as: 'obra',
      attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id', 'tipo_centro_custo']
    },
    {
      model: Parceiro,
      as: 'instituicaoFinanceira',
      attributes: ['id', 'nome', 'cpf_cnpj', 'fornecedor', 'ativo']
    },
    {
      model: CategoriaFinanceira,
      as: 'categoriaFinanceira',
      attributes: ['id', 'nome', 'tipo', 'considera_dre', 'classificacao_gerencial']
    },
    {
      model: User,
      as: 'criadoPor',
      attributes: ['id', 'nome', 'email']
    }
  ];

  if (includeParcelas) {
    include.push({
      model: FinanciamentoBancarioParcela,
      as: 'parcelas',
      include: [
        {
          model: TituloFinanceiro,
          as: 'tituloFinanceiro',
          attributes: ['id', 'codigo', 'status', 'valor_original', 'valor_saldo', 'valor_baixado', 'data_vencimento']
        }
      ],
      separate: true,
      order: [['numero_parcela', 'ASC']]
    });
  }

  return include;
}

async function carregarReferencias(req, payload) {
  const [conta, parceiro, categoria] = await Promise.all([
    ContaBancaria.findByPk(payload.conta_bancaria_id),
    Parceiro.findByPk(payload.parceiro_id),
    CategoriaFinanceira.findByPk(payload.categoria_financeira_id)
  ]);

  if (!conta || conta.ativo === false) {
    throw createHttpError(400, 'Conta bancaria do credito invalida ou inativa.');
  }
  if (!conta.empresa_id) {
    throw createHttpError(400, 'A conta bancaria selecionada nao possui empresa vinculada.');
  }

  const empresa = await EmpresaGrupo.findByPk(Number(conta.empresa_id));
  if (!empresa || empresa.ativo === false) throw createHttpError(400, 'Empresa vinculada a conta bancaria invalida ou inativa.');
  await assertEmpresaScope(req, empresa.id);

  if (!parceiro || parceiro.ativo === false || parceiro.fornecedor === false) {
    throw createHttpError(400, 'Instituicao financeira invalida. Cadastre o banco como fornecedor ativo.');
  }

  if (!categoria || categoria.ativo === false) {
    throw createHttpError(400, 'Categoria financeira invalida.');
  }
  const tipoCategoria = String(categoria.tipo || '').trim().toUpperCase();
  if (tipoCategoria && tipoCategoria !== 'AMBOS' && tipoCategoria !== 'PAGAR') {
    throw createHttpError(400, 'Categoria financeira incompativel com parcelas a pagar.');
  }

  return { conta, parceiro, categoria, empresa };
}

function calcularParcelas(payload) {
  const quantidade = Number(payload.quantidade_parcelas);
  const principal = roundCurrency(payload.valor_credito);
  const jurosInformado = roundCurrency(payload.valor_juros_total || 0);
  const iofTotal = roundCurrency(payload.valor_iof || 0);
  const tarifasTotal = roundCurrency(payload.valor_tarifas || 0);
  const sistema = String(payload.sistema_amortizacao || 'FIXO').toUpperCase();
  const taxaMensal = Number(payload.taxa_juros_mensal || 0) / 100;

  const iofParcelas = distribuirValor(iofTotal, quantidade);
  const tarifaParcelas = distribuirValor(tarifasTotal, quantidade);
  let principalParcelas = [];
  let jurosParcelas = [];

  if (sistema === 'SAC' && taxaMensal > 0) {
    principalParcelas = distribuirValor(principal, quantidade);
    let saldo = principal;
    jurosParcelas = principalParcelas.map((amortizacao, index) => {
      const juros = roundCurrency(saldo * taxaMensal);
      saldo = roundCurrency(saldo - amortizacao);
      return index === quantidade - 1 && saldo !== 0 ? juros : juros;
    });
  } else if (sistema === 'PRICE' && taxaMensal > 0) {
    const parcelaBase = roundCurrency(principal * (taxaMensal / (1 - ((1 + taxaMensal) ** (-quantidade)))));
    let saldo = principal;
    for (let index = 0; index < quantidade; index += 1) {
      const juros = roundCurrency(saldo * taxaMensal);
      const amortizacao = index === quantidade - 1
        ? roundCurrency(saldo)
        : roundCurrency(parcelaBase - juros);
      principalParcelas.push(amortizacao);
      jurosParcelas.push(juros);
      saldo = roundCurrency(saldo - amortizacao);
    }
  } else {
    principalParcelas = distribuirValor(principal, quantidade);
    jurosParcelas = distribuirValor(jurosInformado, quantidade);
  }

  return Array.from({ length: quantidade }, (_, index) => {
    const valorPrincipal = principalParcelas[index] || 0;
    const valorJuros = jurosParcelas[index] || 0;
    const valorIof = iofParcelas[index] || 0;
    const valorTarifa = tarifaParcelas[index] || 0;
    return {
      numero_parcela: index + 1,
      data_vencimento: addMonths(payload.primeiro_vencimento, index),
      valor_principal: roundCurrency(valorPrincipal),
      valor_juros: roundCurrency(valorJuros),
      valor_iof: roundCurrency(valorIof),
      valor_tarifa: roundCurrency(valorTarifa),
      valor_parcela: roundCurrency(valorPrincipal + valorJuros + valorIof + valorTarifa)
    };
  });
}

function resumoParcelas(parcelas) {
  return parcelas.reduce((acc, parcela) => ({
    principal: roundCurrency(acc.principal + Number(parcela.valor_principal || 0)),
    juros: roundCurrency(acc.juros + Number(parcela.valor_juros || 0)),
    iof: roundCurrency(acc.iof + Number(parcela.valor_iof || 0)),
    tarifas: roundCurrency(acc.tarifas + Number(parcela.valor_tarifa || 0)),
    total: roundCurrency(acc.total + Number(parcela.valor_parcela || 0))
  }), {
    principal: 0,
    juros: 0,
    iof: 0,
    tarifas: 0,
    total: 0
  });
}

async function listarFinanciamentosBancarios(req, filters = {}) {
  await assertFinanceAccess(req);

  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.empresa_id) where.empresa_id = filters.empresa_id;
  if (filters.conta_bancaria_id) where.conta_bancaria_id = filters.conta_bancaria_id;
  if (filters.parceiro_id) where.parceiro_id = filters.parceiro_id;
  if (filters.q) {
    where[Op.or] = [
      { codigo: { [Op.like]: `%${filters.q}%` } },
      { numero_contrato: { [Op.like]: `%${filters.q}%` } },
      { documento_referencia: { [Op.like]: `%${filters.q}%` } }
    ];
  }

  const empresasPermitidas = await getFinanceiroEmpresaScopeIds(req.user);
  if (empresasPermitidas !== null) {
    if (empresasPermitidas.length === 0) return [];
    if (where.empresa_id) {
      if (!empresasPermitidas.includes(Number(where.empresa_id))) return [];
    } else {
      where.empresa_id = { [Op.in]: empresasPermitidas };
    }
  }

  return FinanciamentoBancario.findAll({
    where,
    include: buildInclude({ includeParcelas: true }),
    order: [['createdAt', 'DESC']],
    limit: filters.limit || 200
  });
}

async function carregarFinanciamentoBancario(req, id) {
  await assertFinanceAccess(req);

  const financiamento = await FinanciamentoBancario.findByPk(id, {
    include: buildInclude({ includeParcelas: true })
  });

  if (!financiamento) {
    throw createHttpError(404, 'Financiamento bancario nao encontrado.');
  }
  await assertEmpresaScope(req, financiamento.empresa_id);
  return financiamento;
}

async function criarFinanciamentoBancario(req, payload = {}) {
  await assertFinanceAccess(req);
  const referencias = await carregarReferencias(req, payload);
  const parcelas = calcularParcelas(payload);
  const resumo = resumoParcelas(parcelas);

  const transaction = await sequelize.transaction();
  try {
    const financiamento = await FinanciamentoBancario.create({
      codigo: null,
      status: 'RASCUNHO',
      empresa_id: referencias.empresa.id,
      conta_bancaria_id: referencias.conta.id,
      obra_id: null,
      parceiro_id: referencias.parceiro.id,
      categoria_financeira_id: referencias.categoria.id,
      numero_contrato: payload.numero_contrato,
      documento_referencia: payload.documento_referencia || null,
      tipo_contrato: payload.tipo_contrato || null,
      sistema_amortizacao: String(payload.sistema_amortizacao || 'FIXO').toUpperCase(),
      taxa_juros_mensal: payload.taxa_juros_mensal || null,
      data_contrato: payload.data_contrato,
      data_credito: payload.data_credito,
      primeiro_vencimento: payload.primeiro_vencimento,
      quantidade_parcelas: Number(payload.quantidade_parcelas),
      valor_credito: resumo.principal,
      valor_juros_total: resumo.juros,
      valor_iof: resumo.iof,
      valor_tarifas: resumo.tarifas,
      valor_total: resumo.total,
      observacoes: payload.observacoes || null,
      criado_por: req.user?.id || null,
      atualizado_por: req.user?.id || null
    }, { transaction });

    await financiamento.update({
      codigo: `FIN-${String(financiamento.id).padStart(6, '0')}`
    }, { transaction });

    await FinanciamentoBancarioParcela.bulkCreate(
      parcelas.map((parcela) => ({
        financiamento_bancario_id: financiamento.id,
        ...parcela,
        status: 'PREVISTA'
      })),
      { transaction }
    );

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'BANK_LOAN_CREATED',
      recursoTipo: 'FINANCIAMENTO_BANCARIO',
      recursoId: financiamento.id,
      status: 'SUCCESS',
      descricao: 'Financiamento bancario cadastrado',
      metadata: {
        codigo: financiamento.codigo,
        conta_bancaria_id: referencias.conta.id,
        empresa_id: referencias.empresa.id,
        valor_total: resumo.total,
        quantidade_parcelas: parcelas.length
      }
    });

    return carregarFinanciamentoBancario(req, financiamento.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

function buildTituloFromParcela({ financiamento, parcela, userId }) {
  const documentoBase = financiamento.documento_referencia || financiamento.numero_contrato;
  const descricao = `Financiamento ${financiamento.numero_contrato} - Parcela ${parcela.numero_parcela}/${financiamento.quantidade_parcelas}`;

  return {
    solicitacao_id: null,
    obra_id: financiamento.obra_id,
    apropriacao_id: null,
    empresa_id: financiamento.empresa_id,
    parceiro_id: financiamento.parceiro_id,
    categoria_financeira_id: financiamento.categoria_financeira_id,
    forma_pagamento_id: null,
    grupo_parcelamento_id: `FIN-${financiamento.id}`,
    numero_parcela: parcela.numero_parcela,
    total_parcelas: financiamento.quantidade_parcelas,
    data_compra: financiamento.data_credito,
    competencia_data: parcela.data_vencimento,
    considera_dre: financiamento.categoriaFinanceira?.considera_dre !== false,
    origem_titulo: 'FINANCIAMENTO_BANCARIO',
    tipo: 'PAGAR',
    status: 'ABERTO',
    descricao: descricao.slice(0, 255),
    numero_documento: `${documentoBase}-${String(parcela.numero_parcela).padStart(3, '0')}`.slice(0, 120),
    valor_original: parcela.valor_parcela,
    valor_saldo: parcela.valor_parcela,
    valor_baixado: 0,
    data_emissao: financiamento.data_contrato,
    data_vencimento: parcela.data_vencimento,
    data_quitacao: null,
    observacoes: [
      financiamento.observacoes,
      `Contrato: ${financiamento.numero_contrato}`,
      `Amortizacao: ${parcela.valor_principal}`,
      `Juros: ${parcela.valor_juros}`,
      `IOF: ${parcela.valor_iof}`,
      `Tarifa: ${parcela.valor_tarifa}`
    ].filter(Boolean).join('\n'),
    criado_por: userId || null,
    atualizado_por: userId || null
  };
}

async function atualizarParcelaFinanciamentoBancario(req, parcelaId, payload = {}) {
  await assertFinanceAccess(req);

  const parcela = await FinanciamentoBancarioParcela.findByPk(parcelaId, {
    include: [
      {
        model: FinanciamentoBancario,
        as: 'financiamento'
      },
      {
        model: TituloFinanceiro,
        as: 'tituloFinanceiro'
      }
    ]
  });

  if (!parcela || !parcela.financiamento) {
    throw createHttpError(404, 'Parcela do financiamento nao encontrada.');
  }

  await assertEmpresaScope(req, parcela.financiamento.empresa_id);

  const titulo = parcela.tituloFinanceiro || null;
  const tituloBaixado = titulo && (
    Number(titulo.valor_baixado || 0) > 0 ||
    ['BAIXADO', 'PAGO', 'QUITADO'].includes(String(titulo.status || '').toUpperCase())
  );

  if (tituloBaixado) {
    throw createHttpError(400, 'Nao e possivel editar parcela de financiamento com titulo ja baixado.');
  }

  const valorPrincipal = roundCurrency(
    payload.valor_principal !== undefined ? payload.valor_principal : parcela.valor_principal
  );
  const valorJuros = roundCurrency(
    payload.valor_juros !== undefined ? payload.valor_juros : parcela.valor_juros
  );
  const valorIof = roundCurrency(parcela.valor_iof);
  const valorTarifa = roundCurrency(parcela.valor_tarifa);
  const valorParcela = roundCurrency(valorPrincipal + valorJuros + valorIof + valorTarifa);

  if (valorPrincipal < 0 || valorJuros < 0 || valorParcela <= 0) {
    throw createHttpError(400, 'Informe valores validos para amortizacao e juros da parcela.');
  }

  const anterior = {
    valor_principal: Number(parcela.valor_principal || 0),
    valor_juros: Number(parcela.valor_juros || 0),
    valor_parcela: Number(parcela.valor_parcela || 0)
  };

  const transaction = await sequelize.transaction();
  try {
    await parcela.update({
      valor_principal: valorPrincipal,
      valor_juros: valorJuros,
      valor_parcela: valorParcela,
      observacoes: payload.observacoes !== undefined ? String(payload.observacoes || '').trim() || null : parcela.observacoes
    }, { transaction });

    if (titulo) {
      await titulo.update({
        valor_original: valorParcela,
        valor_saldo: valorParcela,
        observacoes: [
          parcela.financiamento.observacoes,
          `Contrato: ${parcela.financiamento.numero_contrato}`,
          `Amortizacao: ${valorPrincipal}`,
          `Juros: ${valorJuros}`,
          `IOF: ${valorIof}`,
          `Tarifa: ${valorTarifa}`
        ].filter(Boolean).join('\n'),
        atualizado_por: req.user?.id || null
      }, { transaction });
    }

    const parcelasAtualizadas = await FinanciamentoBancarioParcela.findAll({
      where: { financiamento_bancario_id: parcela.financiamento_bancario_id },
      transaction
    });

    const resumo = resumoParcelas(parcelasAtualizadas);
    await parcela.financiamento.update({
      valor_credito: resumo.principal,
      valor_juros_total: resumo.juros,
      valor_iof: resumo.iof,
      valor_tarifas: resumo.tarifas,
      valor_total: resumo.total,
      atualizado_por: req.user?.id || null
    }, { transaction });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'BANK_LOAN_INSTALLMENT_UPDATED',
      recursoTipo: 'FINANCIAMENTO_BANCARIO',
      recursoId: parcela.financiamento_bancario_id,
      status: 'SUCCESS',
      descricao: 'Parcela de financiamento bancario atualizada',
      metadata: {
        parcela_id: parcela.id,
        numero_parcela: parcela.numero_parcela,
        anterior,
        novo: {
          valor_principal: valorPrincipal,
          valor_juros: valorJuros,
          valor_parcela: valorParcela
        }
      }
    });

    return carregarFinanciamentoBancario(req, parcela.financiamento_bancario_id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function gerarTitulosFinanciamentoBancario(req, id) {
  const financiamento = await carregarFinanciamentoBancario(req, id);
  const parcelas = Array.isArray(financiamento.parcelas) ? financiamento.parcelas : [];

  if (!parcelas.length) {
    throw createHttpError(400, 'Financiamento sem parcelas previstas.');
  }
  if (parcelas.some((parcela) => parcela.titulo_financeiro_id)) {
    throw createHttpError(400, 'Este financiamento ja possui titulos gerados.');
  }

  const transaction = await sequelize.transaction();
  try {
    const titulos = [];
    for (const parcela of parcelas) {
      const titulo = await TituloFinanceiro.create(
        buildTituloFromParcela({
          financiamento,
          parcela,
          userId: req.user?.id || null
        }),
        { transaction }
      );

      await parcela.update({
        titulo_financeiro_id: titulo.id,
        status: 'TITULO_GERADO'
      }, { transaction });

      titulos.push(titulo);
    }

    await financiamento.update({
      status: 'ATIVO',
      titulos_gerados_em: new Date(),
      atualizado_por: req.user?.id || null
    }, { transaction });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'BANK_LOAN_TITLES_GENERATED',
      recursoTipo: 'FINANCIAMENTO_BANCARIO',
      recursoId: financiamento.id,
      status: 'SUCCESS',
      descricao: 'Titulos financeiros gerados para financiamento bancario',
      metadata: {
        quantidade_titulos: titulos.length,
        titulo_ids: titulos.map((titulo) => titulo.id)
      }
    });

    return carregarFinanciamentoBancario(req, financiamento.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function listarAuditoriaFinanciamentoBancario(req, id) {
  const financiamento = await carregarFinanciamentoBancario(req, id);
  return SecurityEventLog.findAll({
    where: {
      recurso_tipo: 'FINANCIAMENTO_BANCARIO',
      recurso_id: String(financiamento.id)
    },
    include: [{
      model: User,
      as: 'usuario',
      attributes: ['id', 'nome', 'email']
    }],
    order: [['createdAt', 'DESC']],
    limit: 50
  });
}

module.exports = {
  SISTEMAS_AMORTIZACAO,
  STATUS_FINANCIAMENTO,
  carregarFinanciamentoBancario,
  atualizarParcelaFinanciamentoBancario,
  criarFinanciamentoBancario,
  gerarTitulosFinanciamentoBancario,
  listarAuditoriaFinanciamentoBancario,
  listarFinanciamentosBancarios
};
