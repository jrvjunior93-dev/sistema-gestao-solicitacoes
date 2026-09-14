const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const {
  BaixaFinanceiraAlocacao,
  BaixaFinanceiraComponente,
  BaixaFinanceiraGrupo,
  CartaoFinanceiro,
  ChequeTerceiro,
  ChequeTerceiroMovimento,
  ContaBancaria,
  EmpresaGrupo,
  FormaPagamentoFinanceira,
  MovimentoFinanceiro,
  Obra,
  Parceiro,
  TituloFinanceiro,
  sequelize
} = require('../models');
const {
  baixarTitulo,
  resolverTipoOperacionalFormaPagamento,
  sincronizarRealizacaoCompraPorTitulo,
  sincronizarStatusSolicitacaoPorBaixaTitulos
} = require('./tituloFinanceiroService');
const { isValidCpfCnpj, normalizarCpfCnpj } = require('./parceiroService');
const { registrarEventoSeguranca } = require('./securityLogService');
const { reabrirConciliacoesPorMovimentos } = require('./conciliacaoEstornoService');
const { contaExigeSessao, obterSessaoAbertaParaConta } = require('./financeiroCaixaSessionHelper');

const STATUS_CHEQUE = ['EM_CARTEIRA', 'RESERVADO', 'UTILIZADO', 'DEPOSITADO', 'DEVOLVIDO', 'CANCELADO'];
const EVENTOS_MANUAIS = {
  DEPOSITAR: { de: ['EM_CARTEIRA'], para: 'DEPOSITADO', evento: 'DEPOSITO' },
  DEVOLVER: { de: ['EM_CARTEIRA'], para: 'DEVOLVIDO', evento: 'DEVOLUCAO' },
  CANCELAR: { de: ['EM_CARTEIRA'], para: 'CANCELADO', evento: 'CANCELAMENTO' }
};

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  return error;
}

function round(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function codigoCheque() {
  return `CHQ-${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
}

function codigoGrupo() {
  return `BC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function texto(value, max = 255) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function dataOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(value));
    return excelEpoch.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseMoney(value) {
  if (typeof value === 'number') return round(value);
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/[^0-9.-]/g, '');
  return round(Number(normalized));
}

async function empresaAtiva(id, transaction) {
  const empresa = await EmpresaGrupo.findByPk(Number(id), { transaction });
  if (!empresa || empresa.ativo === false) throw httpError(400, 'Empresa detentora invalida ou inativa.');
  return empresa;
}

async function pessoaAtiva(id, label, transaction) {
  if (!id) return null;
  const pessoa = await Parceiro.findOne({
    where: { id: Number(id), ativo: true },
    transaction
  });
  if (!pessoa) throw httpError(400, `${label} nao encontrado ou inativo.`);
  return pessoa;
}

async function validarDuplicidadeCheque(payload, transaction, excludeId = null) {
  const where = {
    empresa_id: Number(payload.empresa_id),
    banco: texto(payload.banco, 80),
    agencia: texto(payload.agencia, 30),
    conta: texto(payload.conta, 40),
    numero_cheque: texto(payload.numero_cheque, 60),
    valor: round(payload.valor)
  };
  if (excludeId) where.id = { [Op.ne]: Number(excludeId) };
  const existente = await ChequeTerceiro.findOne({ where, transaction });
  if (existente) throw httpError(409, `Cheque possivelmente duplicado (${existente.codigo || `#${existente.id}`}).`);
}

async function registrarEventoCheque(cheque, dados, transaction) {
  return ChequeTerceiroMovimento.create({
    cheque_terceiro_id: cheque.id,
    tipo_evento: dados.tipo_evento,
    status_anterior: dados.status_anterior ?? null,
    status_novo: dados.status_novo,
    empresa_origem_id: dados.empresa_origem_id ?? null,
    empresa_destino_id: dados.empresa_destino_id ?? null,
    titulo_financeiro_id: dados.titulo_financeiro_id ?? null,
    movimento_financeiro_id: dados.movimento_financeiro_id ?? null,
    baixa_grupo_id: dados.baixa_grupo_id ?? null,
    valor: round(dados.valor ?? cheque.valor),
    data_evento: dados.data_evento || hoje(),
    observacoes: texto(dados.observacoes, 4000),
    metadata_json: dados.metadata_json || null,
    criado_por: dados.criado_por || null
  }, { transaction });
}

async function criarChequeSaldoInicial(req, payload, options = {}) {
  const transaction = options.transaction || await sequelize.transaction();
  const ownTransaction = !options.transaction;
  try {
    const empresa = await empresaAtiva(payload.empresa_id, transaction);
    const titularParceiro = await pessoaAtiva(payload.titular_parceiro_id, 'Titular', transaction);
    const clienteOrigem = await pessoaAtiva(payload.parceiro_entregou_id, 'Cliente/origem', transaction);
    const valor = round(payload.valor);
    const titularNome = titularParceiro?.nome || texto(payload.titular_nome, 180);
    const titularDocumento = titularParceiro?.cpf_cnpj || normalizarCpfCnpj(payload.titular_documento);
    if (valor <= 0) throw httpError(400, 'Valor do cheque deve ser maior que zero.');
    if (!texto(payload.numero_cheque)) throw httpError(400, 'Numero do cheque e obrigatorio.');
    if (!titularNome) throw httpError(400, 'Titular do cheque e obrigatorio.');
    if (titularDocumento && !isValidCpfCnpj(titularDocumento)) {
      throw httpError(400, 'CPF/CNPJ do titular invalido.');
    }
    if (!dataOnly(payload.data_vencimento)) throw httpError(400, 'Data de vencimento valida e obrigatoria.');
    if (!texto(payload.motivo_origem)) throw httpError(400, 'Justificativa da origem e obrigatoria para saldo inicial.');

    let obra = null;
    if (payload.obra_origem_id) {
      obra = await Obra.findByPk(Number(payload.obra_origem_id), { transaction });
      if (!obra) throw httpError(400, 'Obra de origem nao encontrada.');
      if (obra.empresa_grupo_id && Number(obra.empresa_grupo_id) !== Number(empresa.id)) {
        throw httpError(400, 'A obra de origem pertence a outra empresa do grupo.');
      }
    }

    if (payload.chave_importacao) {
      const repetido = await ChequeTerceiro.findOne({ where: { chave_importacao: payload.chave_importacao }, transaction });
      if (repetido) {
        if (ownTransaction) await transaction.commit();
        return repetido;
      }
    }

    await validarDuplicidadeCheque(payload, transaction);
    const cheque = await ChequeTerceiro.create({
      codigo: codigoCheque(),
      empresa_id: empresa.id,
      obra_origem_id: obra?.id || null,
      parceiro_entregou_id: clienteOrigem?.id || null,
      titular_parceiro_id: titularParceiro?.id || null,
      cliente_nome: clienteOrigem?.nome || texto(payload.cliente_nome, 180),
      titular_nome: titularNome,
      titular_documento: titularDocumento || null,
      banco: texto(payload.banco, 80),
      agencia: texto(payload.agencia, 30),
      conta: texto(payload.conta, 40),
      numero_cheque: texto(payload.numero_cheque, 60),
      valor,
      data_emissao: dataOnly(payload.data_emissao),
      data_vencimento: dataOnly(payload.data_vencimento),
      data_entrada: dataOnly(payload.data_entrada) || hoje(),
      origem_tipo: 'SALDO_INICIAL_LEGADO',
      motivo_origem: texto(payload.motivo_origem, 255),
      status: 'EM_CARTEIRA',
      arquivo_url: texto(payload.arquivo_url, 2000),
      observacoes: texto(payload.observacoes, 4000),
      chave_importacao: payload.chave_importacao || null,
      criado_por: req.user?.id || null,
      atualizado_por: req.user?.id || null
    }, { transaction });

    await registrarEventoCheque(cheque, {
      tipo_evento: 'SALDO_INICIAL',
      status_novo: 'EM_CARTEIRA',
      empresa_destino_id: empresa.id,
      valor,
      data_evento: cheque.data_entrada,
      observacoes: cheque.motivo_origem,
      criado_por: req.user?.id || null
    }, transaction);

    if (ownTransaction) await transaction.commit();
    return cheque;
  } catch (error) {
    if (ownTransaction) await transaction.rollback();
    throw error;
  }
}

async function listarCheques(req, filters = {}) {
  const where = {};
  if (filters.empresa_id) where.empresa_id = Number(filters.empresa_id);
  if (filters.status && STATUS_CHEQUE.includes(String(filters.status).toUpperCase())) where.status = String(filters.status).toUpperCase();
  if (filters.data_inicio || filters.data_fim) {
    where.data_vencimento = {};
    if (filters.data_inicio) where.data_vencimento[Op.gte] = filters.data_inicio;
    if (filters.data_fim) where.data_vencimento[Op.lte] = filters.data_fim;
  }
  const q = texto(filters.q, 120);
  if (q) {
    where[Op.or] = ['codigo', 'numero_cheque', 'titular_nome', 'titular_documento', 'cliente_nome', 'banco']
      .map((field) => ({ [field]: { [Op.like]: `%${q}%` } }));
  }
  const limit = Math.min(Math.max(Number(filters.limit || 100), 1), 300);
  const cheques = await ChequeTerceiro.findAll({
    where,
    include: [
      { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome'] },
      { model: Obra, as: 'obraOrigem', attributes: ['id', 'codigo', 'nome'], required: false },
      { model: Parceiro, as: 'parceiroEntregou', attributes: ['id', 'nome', 'cpf_cnpj'], required: false },
      { model: Parceiro, as: 'titularParceiro', attributes: ['id', 'nome', 'cpf_cnpj'], required: false }
    ],
    order: [['data_vencimento', 'ASC'], ['id', 'ASC']],
    limit
  });
  const totais = cheques.reduce((acc, item) => {
    const status = String(item.status || 'SEM_STATUS');
    acc[status] = round((acc[status] || 0) + Number(item.valor || 0));
    return acc;
  }, {});
  return { cheques, totais, total: cheques.length };
}

async function obterCheque(id) {
  const cheque = await ChequeTerceiro.findByPk(Number(id), {
    include: [
      { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome'] },
      { model: Obra, as: 'obraOrigem', attributes: ['id', 'codigo', 'nome'], required: false },
      { model: Parceiro, as: 'parceiroEntregou', attributes: ['id', 'nome', 'cpf_cnpj'], required: false },
      { model: Parceiro, as: 'titularParceiro', attributes: ['id', 'nome', 'cpf_cnpj'], required: false },
      { model: ChequeTerceiroMovimento, as: 'historico', separate: true, order: [['id', 'DESC']] }
    ]
  });
  if (!cheque) throw httpError(404, 'Cheque de terceiro nao encontrado.');
  return cheque;
}

async function movimentarCheque(req, id, payload = {}) {
  const acao = String(payload.acao || '').trim().toUpperCase();
  const config = EVENTOS_MANUAIS[acao];
  const transaction = await sequelize.transaction();
  try {
    const cheque = await ChequeTerceiro.findByPk(Number(id), { transaction, lock: transaction.LOCK.UPDATE });
    if (!cheque) throw httpError(404, 'Cheque de terceiro nao encontrado.');
    const statusAtual = String(cheque.status).toUpperCase();

    if (acao === 'TRANSFERIR') {
      if (statusAtual !== 'EM_CARTEIRA') throw httpError(409, 'Somente cheques em carteira podem ser transferidos.');
      const empresaDestino = await empresaAtiva(payload.empresa_destino_id, transaction);
      if (Number(empresaDestino.id) === Number(cheque.empresa_id)) throw httpError(400, 'Selecione outra empresa para a transferencia.');
      const empresaOrigemId = cheque.empresa_id;
      await cheque.update({ empresa_id: empresaDestino.id, atualizado_por: req.user?.id || null }, { transaction });
      await registrarEventoCheque(cheque, {
        tipo_evento: 'TRANSFERENCIA_EMPRESA',
        status_anterior: statusAtual,
        status_novo: statusAtual,
        empresa_origem_id: empresaOrigemId,
        empresa_destino_id: empresaDestino.id,
        observacoes: payload.observacoes,
        criado_por: req.user?.id || null
      }, transaction);
    } else {
      if (!config) throw httpError(400, 'Acao de cheque invalida.');
      if (!config.de.includes(statusAtual)) throw httpError(409, `Cheque nao pode ser ${acao.toLowerCase()} no estado atual.`);
      let contaDeposito = null;
      if (acao === 'DEPOSITAR') {
        contaDeposito = await ContaBancaria.findOne({
          where: { id: Number(payload.conta_bancaria_id), empresa_id: cheque.empresa_id, ativo: true },
          transaction
        });
        if (!contaDeposito) throw httpError(400, 'Selecione uma conta ativa da empresa para registrar o deposito.');
      }
      await cheque.update({
        status: config.para,
        data_saida: ['DEPOSITADO', 'DEVOLVIDO'].includes(config.para) ? (payload.data_evento || hoje()) : cheque.data_saida,
        atualizado_por: req.user?.id || null
      }, { transaction });
      await registrarEventoCheque(cheque, {
        tipo_evento: config.evento,
        status_anterior: statusAtual,
        status_novo: config.para,
        empresa_origem_id: cheque.empresa_id,
        observacoes: payload.observacoes,
        data_evento: payload.data_evento || hoje(),
        metadata_json: contaDeposito ? { conta_bancaria_id: Number(contaDeposito.id) } : null,
        criado_por: req.user?.id || null
      }, transaction);
    }
    await transaction.commit();
    return obterCheque(id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function gerarModeloCheques() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('CHEQUES');
  sheet.columns = [
    ['empresa_codigo', 18], ['numero_cheque', 20], ['titular_nome', 30], ['titular_documento', 20],
    ['banco', 20], ['agencia', 15], ['conta', 18], ['valor', 16],
    ['data_vencimento', 18], ['data_entrada', 16], ['cliente_nome', 28], ['obra_codigo', 16],
    ['motivo_origem', 35], ['observacoes', 40]
  ].map(([header, width]) => ({ header, key: header, width }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12325B' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'N1' };
  sheet.addRow({ motivo_origem: 'Saldo inicial sem lastro de obra identificado' });

  const refs = workbook.addWorksheet('EMPRESAS');
  refs.columns = [{ header: 'codigo', key: 'codigo', width: 20 }, { header: 'nome', key: 'nome', width: 40 }];
  const empresas = await EmpresaGrupo.findAll({ where: { ativo: true }, order: [['nome', 'ASC']] });
  empresas.forEach((empresa) => refs.addRow({ codigo: empresa.codigo, nome: empresa.nome }));

  const obrasSheet = workbook.addWorksheet('OBRAS');
  obrasSheet.columns = [{ header: 'empresa_codigo', key: 'empresa_codigo', width: 20 }, { header: 'obra_codigo', key: 'obra_codigo', width: 20 }, { header: 'obra', key: 'obra', width: 40 }];
  const obras = await Obra.findAll({ where: { ativo: true }, include: [{ model: EmpresaGrupo, as: 'empresaGrupo', required: false }], order: [['nome', 'ASC']] }).catch(() => []);
  obras.forEach((obra) => obrasSheet.addRow({ empresa_codigo: obra.empresaGrupo?.codigo || '', obra_codigo: obra.codigo, obra: obra.nome }));
  return workbook.xlsx.writeBuffer();
}

async function previewImportacao(buffer) {
  if (!buffer?.length) throw httpError(400, 'Envie uma planilha XLSX valida.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('CHEQUES') || workbook.worksheets[0];
  if (!sheet) throw httpError(400, 'A planilha nao possui aba de cheques.');
  const headers = {};
  sheet.getRow(1).eachCell((cell, col) => { headers[normalizeHeader(cell.value)] = col; });
  const value = (row, key) => row.getCell(headers[key] || -1).value;
  const empresas = await EmpresaGrupo.findAll({ where: { ativo: true } });
  const empresaMap = new Map(empresas.map((item) => [String(item.codigo || '').trim().toUpperCase(), item]));
  const obras = await Obra.findAll({ where: { ativo: true } });
  const obraMap = new Map(obras.map((item) => [`${item.empresa_grupo_id}:${String(item.codigo || '').trim().toUpperCase()}`, item]));
  const linhas = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const empresaCodigo = texto(value(row, 'empresa_codigo'), 60);
    const numero = texto(value(row, 'numero_cheque'), 60);
    const titular = texto(value(row, 'titular_nome'), 180);
    const valorCheque = parseMoney(value(row, 'valor'));
    if (!empresaCodigo && !numero && !titular && !valorCheque) return;
    const empresa = empresaMap.get(String(empresaCodigo || '').toUpperCase());
    const obraCodigo = texto(value(row, 'obra_codigo'), 60);
    const obra = empresa && obraCodigo ? obraMap.get(`${empresa.id}:${obraCodigo.toUpperCase()}`) : null;
    const titularDocumento = normalizarCpfCnpj(value(row, 'titular_documento'));
    const item = {
      linha: rowNumber,
      empresa_id: empresa?.id || null,
      empresa_codigo: empresaCodigo,
      obra_origem_id: obra?.id || null,
      obra_codigo: obraCodigo,
      numero_cheque: numero,
      titular_nome: titular,
      titular_documento: titularDocumento || null,
      banco: texto(value(row, 'banco'), 80),
      agencia: texto(value(row, 'agencia'), 30),
      conta: texto(value(row, 'conta'), 40),
      valor: valorCheque,
      data_vencimento: dataOnly(value(row, 'data_vencimento')),
      data_entrada: dataOnly(value(row, 'data_entrada')) || hoje(),
      cliente_nome: texto(value(row, 'cliente_nome'), 180),
      motivo_origem: texto(value(row, 'motivo_origem'), 255),
      observacoes: texto(value(row, 'observacoes'), 4000),
      erros: []
    };
    if (!empresa) item.erros.push('Empresa nao encontrada.');
    if (obraCodigo && !obra) item.erros.push('Obra nao encontrada para a empresa.');
    if (!numero) item.erros.push('Numero do cheque obrigatorio.');
    if (!titular) item.erros.push('Titular obrigatorio.');
    if (titularDocumento && !isValidCpfCnpj(titularDocumento)) item.erros.push('CPF/CNPJ do titular invalido.');
    if (valorCheque <= 0) item.erros.push('Valor deve ser maior que zero.');
    if (!item.data_vencimento) item.erros.push('Data de vencimento invalida ou ausente.');
    if (!item.motivo_origem) item.erros.push('Motivo da origem obrigatorio.');
    item.valido = item.erros.length === 0;
    linhas.push(item);
  });
  return { linhas, total: linhas.length, validas: linhas.filter((item) => item.valido).length, erros: linhas.filter((item) => !item.valido).length };
}

async function confirmarImportacao(req, payload = {}, idempotencyKey) {
  const linhas = Array.isArray(payload.linhas) ? payload.linhas : [];
  if (!linhas.length) throw httpError(400, 'Nenhum cheque informado para importacao.');
  if (!idempotencyKey) throw httpError(400, 'Idempotency-Key e obrigatoria.');
  const transaction = await sequelize.transaction();
  try {
    const criados = [];
    for (let index = 0; index < linhas.length; index += 1) {
      const cheque = await criarChequeSaldoInicial(req, {
        ...linhas[index],
        chave_importacao: `${idempotencyKey}:${index + 1}`
      }, { transaction });
      criados.push(cheque);
    }
    await transaction.commit();
    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'THIRD_PARTY_CHECKS_IMPORTED',
      recursoTipo: 'CHEQUE_TERCEIRO',
      status: 'SUCCESS',
      descricao: 'Saldo inicial de cheques de terceiros importado',
      metadata: { quantidade: criados.length, ids: criados.map((item) => item.id) }
    });
    return { criados: criados.length, ids: criados.map((item) => item.id) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

function normalizarComponentes(payload) {
  const componentes = Array.isArray(payload.componentes) ? payload.componentes : [];
  if (!componentes.length) throw httpError(400, 'Adicione ao menos uma operacao financeira.');
  return componentes.map((item, index) => {
    const valor = round(item.valor);
    if (valor <= 0) throw httpError(400, `Valor invalido na operacao ${index + 1}.`);
    const juros = round(item.juros);
    const multa = round(item.multa);
    const desconto = round(item.desconto);
    if (juros || multa || desconto) {
      throw httpError(400, 'Juros, multa e desconto devem ser registrados pela baixa simples. A baixa com multiplas fontes distribui apenas o principal.');
    }
    return {
      ...item,
      ordem: index + 1,
      empresa_id: Number(item.empresa_id) || null,
      forma_pagamento_id: Number(item.forma_pagamento_id) || null,
      conta_bancaria_id: Number(item.conta_bancaria_id) || null,
      cartao_id: Number(item.cartao_id) || null,
      cheque_terceiro_id: Number(item.cheque_terceiro_id) || null,
      cheque_numero: texto(item.cheque_numero, 60),
      cheque_emitente: texto(item.cheque_emitente, 160),
      cheque_titular_documento: texto(item.cheque_titular_documento || item.titular_documento, 40),
      cheque_banco: texto(item.cheque_banco, 120),
      cheque_agencia: texto(item.cheque_agencia, 40),
      cheque_conta: texto(item.cheque_conta, 60),
      cheque_data_emissao: dataOnly(item.cheque_data_emissao || item.data_emissao),
      cheque_data_vencimento: dataOnly(item.cheque_data_vencimento || item.data_vencimento),
      valor,
      juros,
      multa,
      desconto
    };
  });
}

async function validarBaixaComposta(payload, transaction, { lock = false } = {}) {
  const dataMovimento = dataOnly(payload.data_movimento);
  if (!dataMovimento) throw httpError(400, 'Data da baixa e obrigatoria.');
  const componentes = normalizarComponentes(payload);
  const alocacoesInput = Array.isArray(payload.alocacoes) ? payload.alocacoes : [];
  if (!alocacoesInput.length) throw httpError(400, 'Distribua as operacoes entre os titulos.');

  const tituloIds = [...new Set(alocacoesInput.map((item) => Number(item.titulo_financeiro_id)).filter(Boolean))].sort((a, b) => a - b);
  const titulos = await TituloFinanceiro.findAll({
    where: { id: { [Op.in]: tituloIds } },
    order: [['id', 'ASC']],
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (titulos.length !== tituloIds.length) throw httpError(404, 'Um ou mais titulos nao foram encontrados.');
  if (titulos.some((titulo) => String(titulo.tipo).toUpperCase() !== 'PAGAR')) throw httpError(400, 'A baixa composta esta disponivel somente para contas a pagar.');
  if (titulos.some((titulo) => !['ABERTO', 'PARCIAL'].includes(String(titulo.status).toUpperCase()))) throw httpError(409, 'Todos os titulos precisam estar abertos ou parciais.');
  const parceiroId = Number(titulos[0].parceiro_id);
  if (titulos.some((titulo) => Number(titulo.parceiro_id) !== parceiroId)) throw httpError(400, 'Selecione somente titulos do mesmo credor.');
  const empresaReferencia = await empresaAtiva(titulos[0].empresa_id, transaction);
  const empresasTituloIds = [...new Set(titulos.map((titulo) => Number(titulo.empresa_id)).filter(Boolean))];
  for (const empresaTituloId of empresasTituloIds) await empresaAtiva(empresaTituloId, transaction);

  const tituloMap = new Map(titulos.map((titulo) => [Number(titulo.id), titulo]));
  const formaIds = [...new Set(componentes.map((item) => item.forma_pagamento_id).filter(Boolean))];
  const formas = await FormaPagamentoFinanceira.findAll({ where: { id: { [Op.in]: formaIds }, ativo: true }, transaction });
  const formaMap = new Map(formas.map((item) => [Number(item.id), item]));
  const contaIds = [...new Set(componentes.map((item) => item.conta_bancaria_id).filter(Boolean))];
  const contas = contaIds.length ? await ContaBancaria.findAll({ where: { id: { [Op.in]: contaIds }, ativo: true }, transaction }) : [];
  const contaMap = new Map(contas.map((item) => [Number(item.id), item]));
  const cartaoIds = [...new Set(componentes.map((item) => item.cartao_id).filter(Boolean))];
  const cartoes = cartaoIds.length ? await CartaoFinanceiro.findAll({
    where: { id: { [Op.in]: cartaoIds }, ativo: true },
    include: [{ model: ContaBancaria, as: 'contaBancaria', required: false }],
    transaction
  }) : [];
  const cartaoMap = new Map(cartoes.map((item) => [Number(item.id), item]));

  const componentesValidados = [];
  const chequesSelecionados = new Set();
  for (const item of componentes) {
    const forma = formaMap.get(item.forma_pagamento_id);
    if (!forma) throw httpError(400, `Forma de pagamento invalida na operacao ${item.ordem}.`);
    if (forma.gera_fatura) {
      throw httpError(400, 'Cartao de credito com geracao de fatura deve usar a baixa simples para preservar vencimento e vinculo da fatura.');
    }
    const tipo = resolverTipoOperacionalFormaPagamento(forma);
    if (!tipo) throw httpError(400, `Forma de pagamento sem tipo operacional na operacao ${item.ordem}.`);
    const chequeTerceiro = Boolean(item.cheque_terceiro_id);
    const exigeConta = !['PERMUTA', 'BENS', 'OUTROS'].includes(tipo) && !(tipo === 'CHEQUE' && chequeTerceiro);
    const conta = item.conta_bancaria_id ? contaMap.get(item.conta_bancaria_id) : null;
    if (exigeConta && !conta) throw httpError(400, `Informe a conta financeira na operacao ${item.ordem}.`);
    if (tipo === 'DINHEIRO') {
      if (!contaExigeSessao(conta)) {
        throw httpError(
          400,
          `A operacao ${item.ordem} em dinheiro deve usar um caixa fisico com controle de abertura e fechamento.`
        );
      }
      await obterSessaoAbertaParaConta(conta, dataMovimento, {
        transaction,
        exigir: true
      });
    }
    const cartao = item.cartao_id ? cartaoMap.get(item.cartao_id) : null;
    if (tipo === 'CARTAO' && !cartao) throw httpError(400, `Informe um cartao ativo na operacao ${item.ordem}.`);
    if (tipo === 'CHEQUE' && !chequeTerceiro && (!item.cheque_numero || !item.cheque_emitente)) {
      throw httpError(400, `Informe numero e emitente do cheque na operacao ${item.ordem}.`);
    }

    let cheque = null;
    if (chequeTerceiro) {
      if (tipo !== 'CHEQUE') throw httpError(400, `Cheque de terceiro so pode ser usado com forma CHEQUE na operacao ${item.ordem}.`);
      if (chequesSelecionados.has(item.cheque_terceiro_id)) throw httpError(400, `O mesmo cheque nao pode ser usado em mais de uma operacao do grupo.`);
      chequesSelecionados.add(item.cheque_terceiro_id);
      cheque = await ChequeTerceiro.findOne({
        where: { id: item.cheque_terceiro_id, status: 'EM_CARTEIRA' },
        transaction,
        ...(lock ? { lock: transaction.LOCK.UPDATE } : {})
      });
      if (!cheque) throw httpError(409, `Cheque da operacao ${item.ordem} indisponivel.`);
      if (Math.abs(round(cheque.valor) - item.valor) >= 0.01) throw httpError(400, `O cheque da operacao ${item.ordem} deve ser utilizado integralmente.`);
    }

    const empresasFonteVinculadas = [
      conta?.empresa_id ? Number(conta.empresa_id) : null,
      cartao?.contaBancaria?.empresa_id ? Number(cartao.contaBancaria.empresa_id) : null,
      cheque?.empresa_id ? Number(cheque.empresa_id) : null
    ].filter(Boolean);
    const empresasFonte = empresasFonteVinculadas.length
      ? empresasFonteVinculadas
      : [Number(item.empresa_id) || null].filter(Boolean);
    const empresaFonteIds = [...new Set(empresasFonte)];
    if (!empresaFonteIds.length) throw httpError(400, `Informe a empresa da fonte na operacao ${item.ordem}.`);
    if (empresaFonteIds.length > 1) throw httpError(400, `Conta, cartao ou cheque da operacao ${item.ordem} pertencem a empresas diferentes.`);
    const empresaFonte = await empresaAtiva(empresaFonteIds[0], transaction);

    componentesValidados.push({
      ...item,
      empresa_id: Number(empresaFonte.id),
      empresaFonte,
      forma,
      tipo,
      conta,
      cartao,
      cheque
    });
  }

  const somaComponente = new Map();
  const somaTitulo = new Map();
  const alocacoes = alocacoesInput.map((item) => {
    const componenteIndex = Number(item.componente_index);
    const tituloId = Number(item.titulo_financeiro_id);
    const valor = round(item.valor);
    if (!Number.isInteger(componenteIndex) || componenteIndex < 0 || componenteIndex >= componentesValidados.length) throw httpError(400, 'Alocacao referencia uma operacao invalida.');
    if (!tituloMap.has(tituloId)) throw httpError(400, 'Alocacao referencia um titulo invalido.');
    if (valor <= 0) throw httpError(400, 'Valor de alocacao deve ser maior que zero.');
    somaComponente.set(componenteIndex, round((somaComponente.get(componenteIndex) || 0) + valor));
    somaTitulo.set(tituloId, round((somaTitulo.get(tituloId) || 0) + valor));
    return { componente_index: componenteIndex, titulo_financeiro_id: tituloId, valor };
  });
  componentesValidados.forEach((item, index) => {
    if (Math.abs(round(somaComponente.get(index)) - item.valor) >= 0.01) throw httpError(400, `A distribuicao da operacao ${index + 1} precisa totalizar ${item.valor.toFixed(2)}.`);
  });
  somaTitulo.forEach((valor, tituloId) => {
    const saldo = round(tituloMap.get(tituloId).valor_saldo);
    if (valor > saldo) throw httpError(400, `A baixa do titulo ${tituloMap.get(tituloId).codigo || `#${tituloId}`} ultrapassa o saldo.`);
  });
  const valorPrincipal = round(componentesValidados.reduce((sum, item) => sum + item.valor, 0));
  return {
    empresaReferencia,
    parceiro_id: parceiroId,
    data_movimento: dataMovimento,
    componentes: componentesValidados,
    alocacoes,
    titulos,
    valor_principal: valorPrincipal
  };
}

async function previewBaixaComposta(payload) {
  const transaction = await sequelize.transaction();
  try {
    const validacao = await validarBaixaComposta(payload, transaction, { lock: false });
    await transaction.rollback();
    return {
      valido: true,
      valor_principal: validacao.valor_principal,
      titulos: validacao.titulos.map((titulo) => ({ id: titulo.id, codigo: titulo.codigo, saldo: Number(titulo.valor_saldo) })),
      componentes: validacao.componentes.map((item) => ({
        ordem: item.ordem,
        tipo: item.tipo,
        valor: item.valor,
        empresa_id: item.empresa_id,
        empresa: item.empresaFonte?.nome || null,
        conta: item.conta?.nome || null,
        cheque: item.cheque?.codigo || null
      }))
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function confirmarBaixaComposta(req, payload, idempotencyKey) {
  if (!idempotencyKey) throw httpError(400, 'Idempotency-Key e obrigatoria para confirmar a baixa composta.');
  const existente = await BaixaFinanceiraGrupo.findOne({ where: { idempotency_key: idempotencyKey } });
  if (existente) return obterBaixaComposta(existente.id);

  const transaction = await sequelize.transaction();
  try {
    const validacao = await validarBaixaComposta(payload, transaction, { lock: true });
    const grupo = await BaixaFinanceiraGrupo.create({
      codigo: codigoGrupo(),
      idempotency_key: idempotencyKey,
      tipo: 'PAGAMENTO',
      empresa_id: validacao.empresaReferencia.id,
      parceiro_id: validacao.parceiro_id,
      data_movimento: validacao.data_movimento,
      status: 'CONFIRMADO',
      valor_principal: validacao.valor_principal,
      valor_quitacao: round(validacao.componentes.reduce((sum, item) => sum + item.valor + item.juros + item.multa - item.desconto, 0)),
      observacoes: texto(payload.observacoes, 4000),
      criado_por: req.user?.id || null
    }, { transaction });

    for (let componentIndex = 0; componentIndex < validacao.componentes.length; componentIndex += 1) {
      const item = validacao.componentes[componentIndex];
      const componente = await BaixaFinanceiraComponente.create({
        baixa_grupo_id: grupo.id,
        ordem: item.ordem,
        empresa_id: item.empresa_id,
        forma_pagamento_id: item.forma_pagamento_id,
        forma_recebimento: item.tipo,
        conta_bancaria_id: item.conta_bancaria_id,
        cartao_id: item.cartao_id,
        cheque_terceiro_id: item.cheque_terceiro_id,
        valor: item.valor,
        juros: item.juros,
        multa: item.multa,
        desconto: item.desconto,
        valor_quitacao: round(item.valor + item.juros + item.multa - item.desconto),
        documento_referencia: texto(item.documento_referencia, 120),
        cheque_numero: item.cheque_terceiro_id ? null : item.cheque_numero,
        cheque_emitente: item.cheque_terceiro_id ? null : item.cheque_emitente,
        cheque_titular_documento: item.cheque_terceiro_id ? null : item.cheque_titular_documento,
        cheque_banco: item.cheque_terceiro_id ? null : item.cheque_banco,
        cheque_agencia: item.cheque_terceiro_id ? null : item.cheque_agencia,
        cheque_conta: item.cheque_terceiro_id ? null : item.cheque_conta,
        cheque_data_emissao: item.cheque_terceiro_id ? null : item.cheque_data_emissao,
        cheque_data_vencimento: item.cheque_terceiro_id ? null : item.cheque_data_vencimento,
        observacoes: texto(item.observacoes, 4000)
      }, { transaction });
      const alocacoes = validacao.alocacoes.filter((alocacao) => alocacao.componente_index === componentIndex);
      let primeiroMovimentoId = null;
      for (const alocacao of alocacoes) {
        const tituloAlocado = validacao.titulos.find((titulo) => Number(titulo.id) === Number(alocacao.titulo_financeiro_id));
        const intercompany = Number(tituloAlocado?.empresa_id) !== Number(item.empresa_id);
        const resultado = await baixarTitulo(req, alocacao.titulo_financeiro_id, {
          empresa_id: item.empresa_id,
          conta_bancaria_id: item.conta_bancaria_id,
          cartao_id: item.cartao_id,
          forma_pagamento_id: item.forma_pagamento_id,
          forma_recebimento: item.tipo,
          valor: alocacao.valor,
          juros: 0,
          multa: 0,
          desconto: 0,
          data_movimento: validacao.data_movimento,
          documento_referencia: item.documento_referencia,
          cheque_numero: item.cheque_numero,
          cheque_emitente: item.cheque_emitente,
          titular_documento: item.cheque_titular_documento,
          cheque_banco: item.cheque_banco,
          cheque_agencia: item.cheque_agencia,
          cheque_conta: item.cheque_conta,
          data_emissao: item.cheque_data_emissao,
          data_vencimento: item.cheque_data_vencimento,
          observacoes: item.observacoes || `Componente ${item.ordem} da baixa composta ${grupo.codigo}.`,
          intercompany,
          natureza_intercompany_baixa: item.natureza_intercompany_baixa || 'OPERACIONAL_TERCEIRO',
          motivo_intercompany: item.motivo_intercompany || payload.observacoes || `Pagamento intercompany na baixa composta ${grupo.codigo}.`,
          intercompany_group_id: intercompany ? `IC-${grupo.codigo}-${item.ordem}` : null,
          baixa_grupo_id: grupo.id,
          baixa_componente_id: componente.id
        }, { transaction, skipSecurityEvent: true, skipTituloIntercompanyUpdate: true });
        primeiroMovimentoId ||= resultado.movimento_financeiro_id;
        await BaixaFinanceiraAlocacao.create({
          baixa_grupo_id: grupo.id,
          componente_id: componente.id,
          titulo_financeiro_id: alocacao.titulo_financeiro_id,
          movimento_financeiro_id: resultado.movimento_financeiro_id,
          valor: alocacao.valor
        }, { transaction });
      }
      if (item.cheque) {
        await item.cheque.update({
          status: 'UTILIZADO',
          movimento_saida_id: primeiroMovimentoId,
          data_saida: validacao.data_movimento,
          atualizado_por: req.user?.id || null
        }, { transaction });
        await registrarEventoCheque(item.cheque, {
          tipo_evento: 'UTILIZACAO',
          status_anterior: 'EM_CARTEIRA',
          status_novo: 'UTILIZADO',
          empresa_origem_id: item.cheque.empresa_id,
          movimento_financeiro_id: primeiroMovimentoId,
          baixa_grupo_id: grupo.id,
          valor: item.cheque.valor,
          data_evento: validacao.data_movimento,
          observacoes: `Cheque utilizado na baixa composta ${grupo.codigo}.`,
          criado_por: req.user?.id || null
        }, transaction);
      }
    }
    await transaction.commit();
    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_COMPOSED_SETTLEMENT_CONFIRMED',
      recursoTipo: 'BAIXA_FINANCEIRA_GRUPO',
      recursoId: grupo.id,
      status: 'SUCCESS',
      descricao: 'Baixa composta confirmada',
      metadata: { codigo: grupo.codigo, valor: validacao.valor_principal, titulos: validacao.titulos.map((item) => item.id) }
    });
    return obterBaixaComposta(grupo.id);
  } catch (error) {
    await transaction.rollback();
    if (error?.name === 'SequelizeUniqueConstraintError') {
      const repetido = await BaixaFinanceiraGrupo.findOne({ where: { idempotency_key: idempotencyKey } });
      if (repetido) return obterBaixaComposta(repetido.id);
    }
    throw error;
  }
}

async function obterBaixaComposta(id) {
  const grupo = await BaixaFinanceiraGrupo.findByPk(Number(id), {
    include: [
      { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome'] },
      { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] },
      {
        model: BaixaFinanceiraComponente,
        as: 'componentes',
        include: [
          { model: EmpresaGrupo, as: 'empresaFonte', attributes: ['id', 'codigo', 'nome'], required: false },
          { model: FormaPagamentoFinanceira, as: 'formaPagamento', required: false },
          { model: ContaBancaria, as: 'contaBancaria', required: false },
          { model: CartaoFinanceiro, as: 'cartao', required: false },
          { model: ChequeTerceiro, as: 'chequeTerceiro', required: false },
          { model: BaixaFinanceiraAlocacao, as: 'alocacoes', include: [{ model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'codigo', 'descricao'] }] }
        ]
      }
    ]
  });
  if (!grupo) throw httpError(404, 'Baixa composta nao encontrada.');
  return grupo;
}

async function listarBaixasCompostas(filters = {}) {
  const where = {};
  if (filters.empresa_id) where.empresa_id = Number(filters.empresa_id);
  if (filters.status) where.status = String(filters.status).toUpperCase();
  return BaixaFinanceiraGrupo.findAll({
    where,
    include: [
      { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome'] },
      { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] }
    ],
    order: [['id', 'DESC']],
    limit: Math.min(Math.max(Number(filters.limit || 100), 1), 300)
  });
}

async function estornarBaixaComposta(req, id, payload = {}) {
  const transaction = await sequelize.transaction();
  let conciliacoesReabertas = [];
  try {
    const motivoEstorno = texto(payload.motivo || payload.observacoes, 4000);
    if (!motivoEstorno) throw httpError(400, 'Justificativa do estorno e obrigatoria.');
    const grupo = await BaixaFinanceiraGrupo.findByPk(Number(id), { transaction, lock: transaction.LOCK.UPDATE });
    if (!grupo) throw httpError(404, 'Baixa composta nao encontrada.');
    if (grupo.status !== 'CONFIRMADO') throw httpError(409, 'A baixa composta ja foi estornada.');
    const alocacoes = await BaixaFinanceiraAlocacao.findAll({ where: { baixa_grupo_id: grupo.id }, transaction });
    const movimentoIds = alocacoes.map((item) => Number(item.movimento_financeiro_id)).filter(Boolean);
    const movimentos = await MovimentoFinanceiro.findAll({ where: { id: { [Op.in]: movimentoIds } }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    if (movimentos.some((item) => item.status !== 'ATIVO')) throw httpError(409, 'Um dos movimentos da baixa nao esta ativo. O grupo nao pode ser estornado parcialmente.');
    const tituloIds = [...new Set(alocacoes.map((item) => Number(item.titulo_financeiro_id)))].sort((a, b) => a - b);
    const titulos = await TituloFinanceiro.findAll({ where: { id: { [Op.in]: tituloIds } }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    const totalPorTitulo = new Map();
    alocacoes.forEach((item) => totalPorTitulo.set(Number(item.titulo_financeiro_id), round((totalPorTitulo.get(Number(item.titulo_financeiro_id)) || 0) + Number(item.valor))));

    await MovimentoFinanceiro.update({
      status: 'ESTORNADO',
      estornado_por: req.user?.id || null,
      estornado_em: new Date()
    }, { where: { id: { [Op.in]: movimentoIds } }, transaction });

    for (const titulo of titulos) {
      const novoBaixado = Math.max(0, round(Number(titulo.valor_baixado || 0) - (totalPorTitulo.get(Number(titulo.id)) || 0)));
      const saldo = Math.max(0, round(Number(titulo.valor_original || 0) - novoBaixado));
      const status = novoBaixado <= 0 ? 'ABERTO' : (saldo <= 0 ? 'QUITADO' : 'PARCIAL');
      await titulo.update({ valor_baixado: novoBaixado, valor_saldo: saldo, status, data_quitacao: status === 'QUITADO' ? titulo.data_quitacao : null, atualizado_por: req.user?.id || null }, { transaction });
      await sincronizarRealizacaoCompraPorTitulo({ titulo, statusTitulo: status, transaction });
      await sincronizarStatusSolicitacaoPorBaixaTitulos({
        solicitacaoId: titulo.solicitacao_id,
        usuarioId: req.user?.id || null,
        setor: req.user?.setor?.nome || req.user?.setor || null,
        transaction,
        observacao: 'Status atualizado apos estorno de baixa composta.'
      });
    }

    const componentes = await BaixaFinanceiraComponente.findAll({ where: { baixa_grupo_id: grupo.id }, transaction });
    for (const componente of componentes.filter((item) => item.cheque_terceiro_id)) {
      const cheque = await ChequeTerceiro.findByPk(componente.cheque_terceiro_id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!cheque || cheque.status !== 'UTILIZADO') throw httpError(409, 'Cheque da baixa possui movimentacao posterior e impede o estorno do grupo.');
      await cheque.update({ status: 'EM_CARTEIRA', movimento_saida_id: null, data_saida: null, atualizado_por: req.user?.id || null }, { transaction });
      await registrarEventoCheque(cheque, {
        tipo_evento: 'ESTORNO_UTILIZACAO',
        status_anterior: 'UTILIZADO',
        status_novo: 'EM_CARTEIRA',
        empresa_destino_id: cheque.empresa_id,
        baixa_grupo_id: grupo.id,
        valor: cheque.valor,
        data_evento: hoje(),
        observacoes: motivoEstorno,
        criado_por: req.user?.id || null
      }, transaction);
    }
    conciliacoesReabertas = await reabrirConciliacoesPorMovimentos({
      movimentoIds,
      usuarioId: req.user?.id || null,
      transaction
    });
    await grupo.update({ status: 'ESTORNADO', estornado_por: req.user?.id || null, estornado_em: new Date(), observacoes: [grupo.observacoes, `Estorno: ${motivoEstorno}`].filter(Boolean).join('\n') }, { transaction });
    await transaction.commit();
    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_COMPOSED_SETTLEMENT_REVERSED',
      recursoTipo: 'BAIXA_FINANCEIRA_GRUPO',
      recursoId: grupo.id,
      status: 'SUCCESS',
      descricao: 'Baixa composta estornada',
      metadata: { conciliacoes_reabertas: conciliacoesReabertas }
    });
    return obterBaixaComposta(grupo.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  confirmarBaixaComposta,
  confirmarImportacao,
  criarChequeSaldoInicial,
  estornarBaixaComposta,
  gerarModeloCheques,
  listarBaixasCompostas,
  listarCheques,
  movimentarCheque,
  obterBaixaComposta,
  obterCheque,
  previewBaixaComposta,
  previewImportacao
};
