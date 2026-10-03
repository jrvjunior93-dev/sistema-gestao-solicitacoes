const {
  CartaoFinanceiro,
  CategoriaFinanceira,
  ConfiguracaoSistema,
  ContaBancaria,
  EmpresaGrupo,
  FormaPagamentoFinanceira,
  sequelize
} = require('../models');
const {
  canAccessFinanceiro
} = require('./authorizationService');
const { registrarEventoSeguranca } = require('./securityLogService');
const {
  CLASSIFICACOES_GERENCIAIS_FINANCEIRAS
} = require('../constants/categoriaFinanceiraGerencial');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizeTextField(value, { emptyAsNull = false } = {}) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return emptyAsNull ? null : '';
  }

  return normalized;
}

const TARIFAS_BANCARIAS_CONFIG_KEY = 'FINANCEIRO_TARIFAS_BANCARIAS_ATALHOS';
const TARIFAS_BANCARIAS_PADRAO = [
  { codigo: 'TAR_PIX', nome: 'TAR PIX', categoria_financeira_id: null, ativo: true },
  { codigo: 'TAR_TED', nome: 'TAR TED', categoria_financeira_id: null, ativo: true },
  { codigo: 'TAR_TEV', nome: 'TAR TEV', categoria_financeira_id: null, ativo: true },
  { codigo: 'TAR_MAN_CONT', nome: 'TAR MAN CONT', categoria_financeira_id: null, ativo: true }
];

async function assertFinanceAccess(req) {
  const allowed = await canAccessFinanceiro(req.user);
  if (allowed) {
    return;
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: 'FINANCEIRO',
    recursoId: req.originalUrl,
    status: 'DENIED',
    descricao: 'Usuario sem permissao para acessar cadastros financeiros'
  });

  throw createHttpError(403, 'Acesso negado para o modulo financeiro');
}

function sanitizeContaPayload(payload = {}, { partial = false } = {}) {
  const tipoOperacional = payload.tipo_operacional === undefined
    ? undefined
    : String(payload.tipo_operacional || '').trim().toUpperCase();
  const data = {
    nome: sanitizeTextField(payload.nome),
    empresa_id: payload.empresa_id === undefined ? undefined : (payload.empresa_id ? Number(payload.empresa_id) : null),
    tipo_operacional: tipoOperacional,
    banco: sanitizeTextField(payload.banco, { emptyAsNull: true }),
    agencia: sanitizeTextField(payload.agencia, { emptyAsNull: true }),
    conta: sanitizeTextField(payload.conta, { emptyAsNull: true }),
    ofx_bank_id: sanitizeTextField(payload.ofx_bank_id, { emptyAsNull: true }),
    ofx_branch_id: sanitizeTextField(payload.ofx_branch_id, { emptyAsNull: true }),
    ofx_account_id: sanitizeTextField(payload.ofx_account_id, { emptyAsNull: true }),
    tipo_conta: sanitizeTextField(payload.tipo_conta, { emptyAsNull: true }),
    exige_abertura_fechamento: payload.exige_abertura_fechamento === undefined
      ? undefined
      : sanitizeBoolean(payload.exige_abertura_fechamento),
    saldo_inicial: payload.saldo_inicial === undefined ? undefined : Number(payload.saldo_inicial || 0),
    ativo: payload.ativo
  };

  if (!partial) {
    if (!String(data.nome || '').trim()) {
      throw createHttpError(400, 'Nome da conta bancaria e obrigatorio.');
    }
    data.tipo_operacional = data.tipo_operacional || 'BANCARIA';
    data.exige_abertura_fechamento = Boolean(data.exige_abertura_fechamento);
    data.saldo_inicial = Number(data.saldo_inicial || 0);
  }

  if (data.tipo_operacional !== undefined && !['BANCARIA', 'CAIXA_INTERNO'].includes(data.tipo_operacional)) {
    throw createHttpError(400, 'Tipo operacional da conta deve ser bancaria ou caixa interno.');
  }

  if (data.empresa_id !== undefined && data.empresa_id !== null && (!Number.isInteger(data.empresa_id) || data.empresa_id <= 0)) {
    throw createHttpError(400, 'Empresa do grupo invalida para a conta.');
  }

  if (data.saldo_inicial !== undefined && !Number.isFinite(data.saldo_inicial)) {
    throw createHttpError(400, 'Saldo inicial invalido.');
  }

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function sanitizeCategoriaPayload(payload = {}, { partial = false } = {}) {
  const classificacaoGerencial = payload.classificacao_gerencial === undefined
    ? undefined
    : String(payload.classificacao_gerencial || '').trim().toUpperCase();
  const data = {
    nome: sanitizeTextField(payload.nome),
    tipo: sanitizeTextField(payload.tipo),
    descricao: sanitizeTextField(payload.descricao, { emptyAsNull: true }),
    dre_grupo: sanitizeTextField(payload.dre_grupo, { emptyAsNull: true }),
    dre_subgrupo: sanitizeTextField(payload.dre_subgrupo, { emptyAsNull: true }),
    dre_ordem: payload.dre_ordem != null && payload.dre_ordem !== '' ? Number(payload.dre_ordem) : payload.dre_ordem,
    considera_dre: payload.considera_dre,
    classificacao_gerencial: classificacaoGerencial,
    ativo: payload.ativo
  };

  if (!partial) {
    if (!String(data.nome || '').trim()) {
      throw createHttpError(400, 'Nome da categoria financeira e obrigatorio.');
    }
    if (!String(data.tipo || '').trim()) {
      throw createHttpError(400, 'Tipo da categoria financeira e obrigatorio.');
    }
  }

  if (data.dre_ordem !== undefined && data.dre_ordem !== null && !Number.isInteger(data.dre_ordem)) {
    throw createHttpError(400, 'Ordem DRE invalida.');
  }

  if (!partial && !data.classificacao_gerencial) {
    data.classificacao_gerencial = 'OPERACIONAL';
  }

  if (data.classificacao_gerencial !== undefined && !CLASSIFICACOES_GERENCIAIS_FINANCEIRAS.includes(data.classificacao_gerencial)) {
    throw createHttpError(400, 'Classificacao gerencial da categoria invalida.');
  }

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function validarCategoriaDreExplicita(data = {}) {
  if (data.considera_dre === false) {
    return;
  }

  if (!String(data.dre_grupo || '').trim()) {
    throw createHttpError(400, 'Categoria considerada na DRE precisa ter grupo DRE informado.');
  }
}

function normalizeCodigo(value, fallback = '') {
  return String(value || fallback)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function isSuperadmin(user) {
  return String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
}

function normalizeTarifaBancariaConfigItem(item = {}, index = 0, { requireCategoria = false } = {}) {
  const tipoAtalho = String(item.tipo_atalho || 'TARIFA').trim().toUpperCase();
  if (!['TARIFA', 'RENDIMENTO'].includes(tipoAtalho)) {
    throw createHttpError(400, `Tipo do atalho ${index + 1} invalido.`);
  }
  const nome = sanitizeTextField(item.nome || item.codigo || `Tarifa ${index + 1}`);
  const codigo = normalizeCodigo(item.codigo || nome);
  const categoriaFinanceiraId = item.categoria_financeira_id === undefined || item.categoria_financeira_id === null || item.categoria_financeira_id === ''
    ? null
    : Number(item.categoria_financeira_id);
  if (!codigo) {
    throw createHttpError(400, `Codigo da tarifa ${index + 1} e obrigatorio.`);
  }
  if (!nome) {
    throw createHttpError(400, `Nome da tarifa ${index + 1} e obrigatorio.`);
  }
  if (requireCategoria && (!Number.isInteger(categoriaFinanceiraId) || categoriaFinanceiraId <= 0)) {
    throw createHttpError(400, `Categoria financeira da tarifa ${index + 1} e obrigatoria.`);
  }
  if (categoriaFinanceiraId !== null && (!Number.isInteger(categoriaFinanceiraId) || categoriaFinanceiraId <= 0)) {
    throw createHttpError(400, `Categoria financeira da tarifa ${index + 1} e invalida.`);
  }

  return {
    codigo,
    nome: nome.slice(0, 80),
    tipo_atalho: tipoAtalho,
    categoria_financeira_id: categoriaFinanceiraId,
    descricao: sanitizeTextField(item.descricao, { emptyAsNull: true }),
    ativo: sanitizeBoolean(item.ativo, true)
  };
}

function parseTarifasBancariasConfig(valor) {
  if (!valor) return TARIFAS_BANCARIAS_PADRAO;

  try {
    const parsed = JSON.parse(valor);
    if (!Array.isArray(parsed)) return TARIFAS_BANCARIAS_PADRAO;
    return parsed.map(normalizeTarifaBancariaConfigItem).filter((item) => item.codigo && item.nome);
  } catch {
    return TARIFAS_BANCARIAS_PADRAO;
  }
}

async function listarTarifasBancariasConfig(req) {
  await assertFinanceAccess(req);

  const config = await ConfiguracaoSistema.findOne({
    where: { chave: TARIFAS_BANCARIAS_CONFIG_KEY },
    order: [['updatedAt', 'DESC'], ['id', 'DESC']]
  });

  const itens = parseTarifasBancariasConfig(config?.valor);
  const categoriaIds = [...new Set(itens.map((item) => item.categoria_financeira_id).filter(Boolean))];
  if (!categoriaIds.length) {
    return itens;
  }

  const categorias = await CategoriaFinanceira.findAll({
    where: { id: categoriaIds },
    attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo', 'considera_dre', 'classificacao_gerencial', 'ativo']
  });
  const categoriasById = new Map(categorias.map((categoria) => [Number(categoria.id), categoria]));

  return itens.map((item) => {
    const categoria = categoriasById.get(Number(item.categoria_financeira_id));
    return {
      ...item,
      categoria_financeira: categoria ? categoria.get({ plain: true }) : null
    };
  });
}

async function salvarTarifasBancariasConfig(req, payload = {}) {
  await assertFinanceAccess(req);
  if (!isSuperadmin(req.user)) {
    throw createHttpError(403, 'Somente SUPERADMIN pode configurar atalhos de tarifas bancarias.');
  }

  const itensPayload = Array.isArray(payload.itens) ? payload.itens : [];
  if (!itensPayload.length) {
    throw createHttpError(400, 'Informe pelo menos uma tarifa bancaria.');
  }

  const vistos = new Set();
  const itens = itensPayload.map((item, index) => normalizeTarifaBancariaConfigItem(item, index, { requireCategoria: true })).map((item) => {
    if (vistos.has(item.codigo)) {
      throw createHttpError(400, `Codigo de tarifa duplicado: ${item.codigo}.`);
    }
    vistos.add(item.codigo);
    return item;
  });
  const categoriaIds = [...new Set(itens.map((item) => item.categoria_financeira_id).filter(Boolean))];
  const categorias = await CategoriaFinanceira.findAll({
    where: { id: categoriaIds }
  });
  const categoriasById = new Map(categorias.map((categoria) => [Number(categoria.id), categoria]));
  for (const item of itens) {
    const categoria = categoriasById.get(Number(item.categoria_financeira_id));
    if (!categoria) {
      throw createHttpError(400, `Categoria financeira nao encontrada para a tarifa ${item.nome}.`);
    }
    const tipoCategoria = String(categoria.tipo || '').trim().toUpperCase();
    const tiposPermitidos = item.tipo_atalho === 'RENDIMENTO' ? ['RECEBER', 'AMBOS'] : ['PAGAR', 'AMBOS'];
    if (!tiposPermitidos.includes(tipoCategoria)) {
      throw createHttpError(400, `Categoria financeira do atalho ${item.nome} deve ser do tipo ${tiposPermitidos.join(' ou ')}.`);
    }
    if (categoria.ativo === false) {
      throw createHttpError(400, `Categoria financeira da tarifa ${item.nome} esta inativa.`);
    }
    if (categoria.considera_dre === false || !String(categoria.dre_grupo || '').trim()) {
      throw createHttpError(400, `Categoria financeira da tarifa ${item.nome} precisa estar classificada para DRE.`);
    }
    const classificacaoGerencial = String(categoria.classificacao_gerencial || '').trim().toUpperCase();
    if (['ENDIVIDAMENTO', 'INVESTIMENTO', 'PATRIMONIAL', 'INTERCOMPANY', 'TRANSFERENCIA_INTERNA'].includes(classificacaoGerencial)) {
      throw createHttpError(400, `Categoria financeira da tarifa ${item.nome} nao pode ser ${classificacaoGerencial.toLowerCase().replace(/_/g, ' ')}.`);
    }
  }

  const valorSerializado = JSON.stringify(itens);
  const transaction = await sequelize.transaction();
  try {
    // A coluna `chave` nao possui restricao UNIQUE nas instalacoes legadas.
    // Atualizar todas as ocorrencias evita que uma leitura posterior encontre
    // um registro antigo e aparente que o novo atalho nao foi salvo.
    const configExistente = await ConfiguracaoSistema.findOne({
      where: { chave: TARIFAS_BANCARIAS_CONFIG_KEY },
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (configExistente) {
      await ConfiguracaoSistema.update(
        { valor: valorSerializado },
        {
          where: { chave: TARIFAS_BANCARIAS_CONFIG_KEY },
          transaction
        }
      );
    } else {
      await ConfiguracaoSistema.create({
        chave: TARIFAS_BANCARIAS_CONFIG_KEY,
        valor: valorSerializado
      }, { transaction });
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_BANK_FEE_SHORTCUTS_UPDATED',
    recursoTipo: 'CONFIGURACAO_SISTEMA',
    recursoId: TARIFAS_BANCARIAS_CONFIG_KEY,
    status: 'SUCCESS',
    descricao: 'Atalhos de tarifas bancarias atualizados',
    metadata: { total: itens.length }
  });

  return listarTarifasBancariasConfig(req);
}

function sanitizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizarTipoCartao(value, fallback = 'CREDITO') {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (normalized === 'CARTAO_CREDITO' || normalized === 'CREDITO') return 'CREDITO';
  if (normalized === 'CARTAO_DEBITO' || normalized === 'DEBITO') return 'DEBITO';
  throw createHttpError(400, 'Tipo do cartao deve ser credito ou debito.');
}

function sanitizeFormaPagamentoPayload(payload = {}, { partial = false } = {}) {
  const nome = sanitizeTextField(payload.nome);
  const data = {
    nome,
    codigo: payload.codigo === undefined ? undefined : normalizeCodigo(payload.codigo, nome),
    tipo: payload.tipo === undefined ? undefined : normalizeCodigo(payload.tipo),
    permite_parcelamento: payload.permite_parcelamento === undefined ? undefined : sanitizeBoolean(payload.permite_parcelamento),
    gera_fatura: payload.gera_fatura === undefined ? undefined : sanitizeBoolean(payload.gera_fatura),
    gera_boleto: payload.gera_boleto === undefined ? undefined : sanitizeBoolean(payload.gera_boleto),
    exige_cartao: payload.exige_cartao === undefined ? undefined : sanitizeBoolean(payload.exige_cartao),
    exige_cheque: payload.exige_cheque === undefined ? undefined : sanitizeBoolean(payload.exige_cheque),
    ordem: payload.ordem === undefined ? undefined : Number(payload.ordem || 0),
    ativo: payload.ativo === undefined ? undefined : sanitizeBoolean(payload.ativo, true)
  };

  if (!partial) {
    if (!String(data.nome || '').trim()) throw createHttpError(400, 'Nome da forma de pagamento e obrigatorio.');
    data.codigo = data.codigo || normalizeCodigo(data.nome);
    data.tipo = data.tipo || data.codigo;
  }

  if (data.ordem !== undefined && (!Number.isInteger(data.ordem) || data.ordem < 0)) {
    throw createHttpError(400, 'Ordem da forma de pagamento invalida.');
  }

  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function sanitizeCartaoPayload(payload = {}, { partial = false } = {}) {
  const data = {
    nome: sanitizeTextField(payload.nome),
    titular: sanitizeTextField(payload.titular),
    tipo: payload.tipo === undefined ? undefined : normalizarTipoCartao(payload.tipo),
    bandeira: sanitizeTextField(payload.bandeira, { emptyAsNull: true }),
    ultimos_digitos: payload.ultimos_digitos === undefined ? undefined : String(payload.ultimos_digitos || '').replace(/\D/g, '').slice(-4),
    conta_bancaria_id: payload.conta_bancaria_id === undefined ? undefined : (payload.conta_bancaria_id ? Number(payload.conta_bancaria_id) : null),
    dia_fechamento: payload.dia_fechamento === undefined ? undefined : Number(payload.dia_fechamento),
    dia_vencimento: payload.dia_vencimento === undefined ? undefined : Number(payload.dia_vencimento),
    ativo: payload.ativo === undefined ? undefined : sanitizeBoolean(payload.ativo, true),
    observacoes: sanitizeTextField(payload.observacoes, { emptyAsNull: true })
  };

  if (!partial) {
    if (!String(data.nome || '').trim()) throw createHttpError(400, 'Nome do cartao e obrigatorio.');
    if (!String(data.titular || '').trim()) throw createHttpError(400, 'Titular do cartao e obrigatorio.');
    data.tipo = data.tipo || 'CREDITO';
    if (!String(data.ultimos_digitos || '').trim() || data.ultimos_digitos.length !== 4) {
      throw createHttpError(400, 'Informe os 4 ultimos digitos do cartao.');
    }
  }

  for (const field of ['dia_fechamento', 'dia_vencimento']) {
    if (data[field] !== undefined && (!Number.isInteger(data[field]) || data[field] < 1 || data[field] > 31)) {
      throw createHttpError(400, `${field === 'dia_fechamento' ? 'Dia de fechamento' : 'Dia de vencimento'} invalido.`);
    }
  }

  if (data.conta_bancaria_id !== undefined && data.conta_bancaria_id !== null && (!Number.isInteger(data.conta_bancaria_id) || data.conta_bancaria_id <= 0)) {
    throw createHttpError(400, 'Conta bancaria do cartao invalida.');
  }

  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

async function validarContaCartao(data = {}, cartaoAtual = null) {
  const tipoFinal = String(data.tipo || cartaoAtual?.tipo || 'CREDITO').trim().toUpperCase();
  const contaFinal = data.conta_bancaria_id !== undefined
    ? data.conta_bancaria_id
    : cartaoAtual?.conta_bancaria_id || null;

  if (tipoFinal === 'DEBITO' && !contaFinal) {
    throw createHttpError(
      400,
      'Cartao de debito precisa ter conta bancaria vinculada para baixar no ato do registro.'
    );
  }

  if (!contaFinal) {
    return null;
  }

  const conta = await ContaBancaria.findByPk(contaFinal);
  if (!conta || conta.ativo === false) {
    throw createHttpError(400, 'Conta bancaria do cartao invalida ou inativa.');
  }

  return conta;
}

async function listarContasBancarias(req) {
  await assertFinanceAccess(req);

  return ContaBancaria.findAll({
    include: [
      {
        model: EmpresaGrupo,
        as: 'empresa',
        attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
      }
    ],
    order: [['nome', 'ASC']]
  });
}

async function assertEmpresaGrupoAtiva(empresaId) {
  if (!empresaId) return null;
  const empresa = await EmpresaGrupo.findByPk(empresaId);
  if (!empresa || empresa.ativo === false) {
    throw createHttpError(400, 'Empresa do grupo invalida ou inativa.');
  }
  return empresa;
}

async function criarContaBancaria(req, payload = {}) {
  await assertFinanceAccess(req);
  const data = sanitizeContaPayload(payload);
  await assertEmpresaGrupoAtiva(data.empresa_id);
  data.criado_por = req.user?.id || null;
  data.atualizado_por = req.user?.id || null;

  const conta = await ContaBancaria.create(data);

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_BANK_ACCOUNT_CREATED',
    recursoTipo: 'CONTA_BANCARIA',
    recursoId: conta.id,
    status: 'SUCCESS',
    descricao: 'Conta bancaria criada no modulo financeiro',
    metadata: {
      nome: conta.nome
    }
  });

  return ContaBancaria.findByPk(conta.id, {
    include: [{ model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] }]
  });
}

async function atualizarContaBancaria(req, contaId, payload = {}) {
  await assertFinanceAccess(req);

  const conta = await ContaBancaria.findByPk(contaId);
  if (!conta) {
    throw createHttpError(404, 'Conta bancaria nao encontrada.');
  }

  const data = sanitizeContaPayload(payload, { partial: true });
  if (Object.keys(data).length === 0) {
    throw createHttpError(400, 'Nenhum campo valido informado para atualizar a conta bancaria.');
  }

  if (Object.prototype.hasOwnProperty.call(data, 'empresa_id')) {
    await assertEmpresaGrupoAtiva(data.empresa_id);
  }

  data.atualizado_por = req.user?.id || null;
  await conta.update(data);

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_BANK_ACCOUNT_UPDATED',
    recursoTipo: 'CONTA_BANCARIA',
    recursoId: conta.id,
    status: 'SUCCESS',
    descricao: 'Conta bancaria atualizada no modulo financeiro',
    metadata: {
      campos_alterados: Object.keys(data)
    }
  });

  return ContaBancaria.findByPk(conta.id, {
    include: [{ model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] }]
  });
}

async function listarCategoriasFinanceiras(req) {
  await assertFinanceAccess(req);

  return CategoriaFinanceira.findAll({
    order: [['nome', 'ASC']]
  });
}

async function listarFormasPagamentoFinanceiras(req) {
  await assertFinanceAccess(req);

  return FormaPagamentoFinanceira.findAll({
    order: [['ordem', 'ASC'], ['nome', 'ASC']]
  });
}

async function criarFormaPagamentoFinanceira(req, payload = {}) {
  await assertFinanceAccess(req);
  const data = sanitizeFormaPagamentoPayload(payload);
  data.criado_por = req.user?.id || null;
  data.atualizado_por = req.user?.id || null;

  const forma = await FormaPagamentoFinanceira.create(data);

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_PAYMENT_METHOD_CREATED',
    recursoTipo: 'FORMA_PAGAMENTO_FINANCEIRA',
    recursoId: forma.id,
    status: 'SUCCESS',
    descricao: 'Forma de pagamento financeira criada',
    metadata: { codigo: forma.codigo, tipo: forma.tipo }
  });

  return forma;
}

async function atualizarFormaPagamentoFinanceira(req, formaId, payload = {}) {
  await assertFinanceAccess(req);

  const forma = await FormaPagamentoFinanceira.findByPk(formaId);
  if (!forma) throw createHttpError(404, 'Forma de pagamento nao encontrada.');

  const data = sanitizeFormaPagamentoPayload(payload, { partial: true });
  if (Object.keys(data).length === 0) {
    throw createHttpError(400, 'Nenhum campo valido informado para atualizar a forma de pagamento.');
  }

  data.atualizado_por = req.user?.id || null;
  await forma.update(data);
  return forma;
}

function buildCartaoContaInclude() {
  return [{
    model: ContaBancaria,
    as: 'contaBancaria',
    attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id'],
    include: [{
      model: EmpresaGrupo,
      as: 'empresa',
      attributes: ['id', 'codigo', 'nome', 'razao_social']
    }]
  }];
}

async function listarCartoesFinanceiros(req) {
  await assertFinanceAccess(req);

  return CartaoFinanceiro.findAll({
    include: buildCartaoContaInclude(),
    order: [['nome', 'ASC']]
  });
}

async function criarCartaoFinanceiro(req, payload = {}) {
  await assertFinanceAccess(req);
  const data = sanitizeCartaoPayload(payload);
  await validarContaCartao(data);
  data.criado_por = req.user?.id || null;
  data.atualizado_por = req.user?.id || null;

  const cartao = await CartaoFinanceiro.create(data);
  return CartaoFinanceiro.findByPk(cartao.id, {
    include: buildCartaoContaInclude()
  });
}

async function atualizarCartaoFinanceiro(req, cartaoId, payload = {}) {
  await assertFinanceAccess(req);

  const cartao = await CartaoFinanceiro.findByPk(cartaoId);
  if (!cartao) throw createHttpError(404, 'Cartao nao encontrado.');

  const data = sanitizeCartaoPayload(payload, { partial: true });
  if (Object.keys(data).length === 0) {
    throw createHttpError(400, 'Nenhum campo valido informado para atualizar o cartao.');
  }
  await validarContaCartao(data, cartao);

  data.atualizado_por = req.user?.id || null;
  await cartao.update(data);
  return CartaoFinanceiro.findByPk(cartao.id, {
    include: buildCartaoContaInclude()
  });
}

async function criarCategoriaFinanceira(req, payload = {}) {
  await assertFinanceAccess(req);
  const data = sanitizeCategoriaPayload(payload);
  validarCategoriaDreExplicita(data);
  data.criado_por = req.user?.id || null;
  data.atualizado_por = req.user?.id || null;

  const categoria = await CategoriaFinanceira.create(data);

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_CATEGORY_CREATED',
    recursoTipo: 'CATEGORIA_FINANCEIRA',
    recursoId: categoria.id,
    status: 'SUCCESS',
    descricao: 'Categoria financeira criada',
    metadata: {
      nome: categoria.nome,
      tipo: categoria.tipo
    }
  });

  return categoria;
}

async function atualizarCategoriaFinanceira(req, categoriaId, payload = {}) {
  await assertFinanceAccess(req);

  const categoria = await CategoriaFinanceira.findByPk(categoriaId);
  if (!categoria) {
    throw createHttpError(404, 'Categoria financeira nao encontrada.');
  }

  const data = sanitizeCategoriaPayload(payload, { partial: true });
  if (Object.keys(data).length === 0) {
    throw createHttpError(400, 'Nenhum campo valido informado para atualizar a categoria financeira.');
  }

  validarCategoriaDreExplicita({
    ...categoria.get({ plain: true }),
    ...data
  });

  data.atualizado_por = req.user?.id || null;
  await categoria.update(data);

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_CATEGORY_UPDATED',
    recursoTipo: 'CATEGORIA_FINANCEIRA',
    recursoId: categoria.id,
    status: 'SUCCESS',
    descricao: 'Categoria financeira atualizada',
    metadata: {
      campos_alterados: Object.keys(data)
    }
  });

  return categoria;
}

module.exports = {
  normalizeTarifaBancariaConfigItem,
  atualizarCartaoFinanceiro,
  atualizarCategoriaFinanceira,
  atualizarContaBancaria,
  atualizarFormaPagamentoFinanceira,
  criarCartaoFinanceiro,
  criarCategoriaFinanceira,
  criarContaBancaria,
  criarFormaPagamentoFinanceira,
  listarCartoesFinanceiros,
  listarCategoriasFinanceiras,
  listarContasBancarias,
  listarFormasPagamentoFinanceiras,
  listarTarifasBancariasConfig,
  salvarTarifasBancariasConfig
};
