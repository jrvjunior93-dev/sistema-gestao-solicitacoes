const { Op } = require('sequelize');
const {
  CaixaFinanceiroSessao,
  CaixaConciliacaoConfirmacao,
  ConciliacaoBancaria,
  ContaBancaria,
  EmpresaGrupo,
  MovimentoFinanceiro,
  TituloFinanceiro,
  TransferenciaFinanceira,
  User,
  sequelize
} = require('../models');
const { canAccessFinanceiro } = require('./authorizationService');
const { registrarEventoSeguranca } = require('./securityLogService');
const { uploadToS3 } = require('./s3');
const { recordEvent } = require('../modules/governanca/services/auditoriaOperacionalService');
const {
  obterCaixaDiarioConfig,
  usuarioEstaSujeitoAoBloqueio,
  usuarioPodeAprovarDivergencia,
  usuarioPodeOperarCaixa
} = require('./caixaDiarioConfigService');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00.000`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function assertFinanceAccess(req) {
  const allowed = await canAccessFinanceiro(req.user);
  if (allowed) return;

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: 'CAIXA_FINANCEIRO',
    recursoId: req.originalUrl,
    status: 'DENIED',
    descricao: 'Usuario sem permissao para acessar abertura e fechamento de caixa'
  });

  throw createHttpError(403, 'Acesso negado para o modulo financeiro');
}

async function assertCaixaOperator(req) {
  if (await usuarioPodeOperarCaixa(req.user)) return;
  throw createHttpError(403, 'Somente os responsaveis definidos pelo superadmin podem operar a conciliacao e o controle diario de contas.');
}

async function assertDivergenceApprover(req) {
  if (await usuarioPodeAprovarDivergencia(req.user)) return;
  throw createHttpError(403, 'Somente os aprovadores definidos pelo superadmin podem decidir divergencias de caixa.');
}

function parsePositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} invalido.`);
  }
  return parsed;
}

function parseMoney(value, fieldName, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      throw createHttpError(400, `${fieldName} e obrigatorio.`);
    }
    return null;
  }
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, `${fieldName} invalido.`);
  }
  return roundCurrency(parsed);
}

function parseDate(value, fieldName, fallback = null) {
  const date = value || fallback;
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    throw createHttpError(400, `${fieldName} invalida.`);
  }
  return String(date);
}

function includeSessao() {
  return [
    {
      model: ContaBancaria,
      as: 'contaBancaria',
      attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'tipo_operacional', 'empresa_id', 'exige_abertura_fechamento']
    },
    {
      model: EmpresaGrupo,
      as: 'empresa',
      attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
    },
    {
      model: User,
      as: 'abertoPor',
      attributes: ['id', 'nome', 'email']
    },
    {
      model: User,
      as: 'fechadoPor',
      attributes: ['id', 'nome', 'email']
    },
    {
      model: User,
      as: 'divergenciaSolicitadaPor',
      attributes: ['id', 'nome', 'email']
    },
    {
      model: User,
      as: 'divergenciaDecididaPor',
      attributes: ['id', 'nome', 'email']
    }
  ];
}

function contaExigeSessao(conta) {
  return Boolean(conta?.exige_abertura_fechamento)
    || String(conta?.tipo_operacional || '').toUpperCase() === 'CAIXA_INTERNO';
}

function contaEhCaixaFisico(conta) {
  return String(conta?.tipo_operacional || '').toUpperCase() === 'CAIXA_INTERNO';
}

async function carregarConta(contaBancariaId, { transaction = null, lock = null } = {}) {
  const id = parsePositiveInteger(contaBancariaId, 'Conta financeira');
  const conta = await ContaBancaria.findByPk(id, {
    transaction,
    ...(lock ? { lock } : {})
  });
  if (!conta || conta.ativo === false) {
    throw createHttpError(400, 'Conta financeira invalida ou inativa.');
  }
  if (!conta.empresa_id) {
    throw createHttpError(400, 'A conta financeira precisa estar vinculada a uma empresa do grupo antes de abrir caixa.');
  }
  if (!contaExigeSessao(conta)) {
    throw createHttpError(400, 'Esta conta nao esta configurada para abertura e fechamento de caixa.');
  }
  return conta;
}

async function obterResumoConciliacaoDia(contaBancariaId, dataReferencia) {
  const movimentos = await ConciliacaoBancaria.findAll({
    where: {
      conta_bancaria_id: contaBancariaId,
      data_movimento: dataReferencia,
      deleted_at: null
    },
    attributes: ['id', 'status']
  });

  return movimentos.reduce((acc, item) => {
    const status = String(item.status || '').toUpperCase();
    acc.total_movimentos += 1;
    if (status === 'CONCILIADO') {
      acc.total_conciliados += 1;
    } else if (status === 'IGNORADO') {
      acc.total_ignorados += 1;
    } else {
      acc.total_pendentes += 1;
    }
    return acc;
  }, {
    total_movimentos: 0,
    total_conciliados: 0,
    total_ignorados: 0,
    total_pendentes: 0
  });
}

async function confirmarConciliacaoDiaCaixa(req, payload = {}) {
  await assertFinanceAccess(req);
  await assertCaixaOperator(req);
  const conta = await carregarConta(payload.conta_bancaria_id);
  const dataReferencia = parseDate(payload.data_referencia, 'Data de referencia', addDays(today(), -1));
  const resumo = await obterResumoConciliacaoDia(conta.id, dataReferencia);

  if (resumo.total_pendentes > 0) {
    throw createHttpError(
      400,
      `Ainda existem ${resumo.total_pendentes} movimento(s) OFX pendente(s) para esta conta em ${dataReferencia}. Concilie ou ignore antes de confirmar.`
    );
  }

  const existente = await CaixaConciliacaoConfirmacao.findOne({
    where: {
      conta_bancaria_id: conta.id,
      data_referencia: dataReferencia
    }
  });

  const values = {
    empresa_id: Number(conta.empresa_id) || null,
    total_movimentos: resumo.total_movimentos,
    total_conciliados: resumo.total_conciliados,
    total_ignorados: resumo.total_ignorados,
    observacoes: payload.observacoes || null,
    confirmado_por: req.user?.id || null,
    confirmado_em: new Date()
  };

  const confirmacao = existente
    ? await existente.update(values)
    : await CaixaConciliacaoConfirmacao.create({
        conta_bancaria_id: conta.id,
        data_referencia: dataReferencia,
        ...values
      });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_CASH_PREVIOUS_OFX_CONFIRMED',
    recursoTipo: 'CAIXA_FINANCEIRO',
    recursoId: `${conta.id}:${dataReferencia}`,
    status: 'SUCCESS',
    descricao: 'Conciliacao OFX do dia anterior confirmada para abertura de caixa',
    metadata: {
      conta_bancaria_id: conta.id,
      empresa_id: Number(conta.empresa_id) || null,
      data_referencia: dataReferencia,
      ...resumo
    }
  });

  return confirmacao;
}

function obterNaturezaMovimento(movimento) {
  const tipoMovimento = String(movimento?.tipo_movimento || '').toUpperCase();
  if (tipoMovimento === 'CAIXA_ENTRADA_MANUAL') return 'ENTRADA';
  if (tipoMovimento === 'CAIXA_SAIDA_MANUAL') return 'SAIDA';
  if (tipoMovimento === 'RENDIMENTO_BANCARIO') return 'ENTRADA';
  if (tipoMovimento === 'CAIXA_AJUSTE_DIVERGENCIA_ENTRADA') return 'ENTRADA';
  if (tipoMovimento === 'CAIXA_AJUSTE_DIVERGENCIA_SAIDA') return 'SAIDA';
  if (String(movimento?.titulo?.tipo || '').toUpperCase() === 'RECEBER') return 'ENTRADA';
  return 'SAIDA';
}

function movimentoWhereVinculadoSessao(sessao) {
  return {
    status: 'ATIVO',
    caixa_sessao_id: sessao.id
  };
}

function movimentoWhereLegadoSessao(sessao) {
  return {
    status: 'ATIVO',
    caixa_sessao_id: null,
    conta_bancaria_id: sessao.conta_bancaria_id,
    data_movimento: {
      [Op.gte]: sessao.data_abertura,
      [Op.lte]: sessao.data_fechamento || today()
    }
  };
}

async function carregarMovimentosSessao(sessao, { transaction = null } = {}) {
  const include = [
    {
      // Movimentos manuais de caixa nao possuem titulo financeiro. O escopo
      // padrao de TituloFinanceiro adiciona `deleted_at IS NULL` e, sem tornar
      // a associacao explicitamente opcional, o Sequelize pode gerar INNER
      // JOIN e ocultar justamente esses movimentos do livro do caixa.
      model: TituloFinanceiro.unscoped(),
      as: 'titulo',
      attributes: ['id', 'codigo', 'descricao', 'tipo'],
      required: false
    },
    {
      model: User,
      as: 'criadoPor',
      attributes: ['id', 'nome', 'email'],
      required: false
    }
  ];
  const queryOptions = {
    include,
    order: [['data_movimento', 'DESC'], ['id', 'DESC']],
    transaction
  };

  // O vinculo explicito com a sessao e a fonte canonica dos movimentos novos.
  // A busca por conta/data existe apenas para movimentos antigos, anteriores ao
  // campo caixa_sessao_id. Consultas separadas evitam que a compatibilidade
  // legada esconda um movimento recem-criado na mesma transacao.
  const movimentosVinculados = await MovimentoFinanceiro.findAll({
    ...queryOptions,
    where: movimentoWhereVinculadoSessao(sessao)
  });
  const movimentosLegados = await MovimentoFinanceiro.findAll({
    ...queryOptions,
    where: movimentoWhereLegadoSessao(sessao)
  });

  return [...movimentosVinculados, ...movimentosLegados]
    .sort((a, b) => (
      String(b.data_movimento || '').localeCompare(String(a.data_movimento || ''))
      || Number(b.id) - Number(a.id)
    ));
}

async function carregarTransferenciasSessao(sessao, { transaction = null } = {}) {
  return TransferenciaFinanceira.findAll({
    where: {
      status: 'ATIVA',
      data_transferencia: {
        [Op.gte]: sessao.data_abertura,
        [Op.lte]: sessao.data_fechamento || today()
      },
      [Op.or]: [
        { caixa_sessao_origem_id: sessao.id },
        { caixa_sessao_destino_id: sessao.id },
        {
          caixa_sessao_origem_id: null,
          conta_origem_id: sessao.conta_bancaria_id
        },
        {
          caixa_sessao_destino_id: null,
          conta_destino_id: sessao.conta_bancaria_id
        }
      ]
    },
    include: [
      { model: ContaBancaria, as: 'contaOrigem', attributes: ['id', 'nome'] },
      { model: ContaBancaria, as: 'contaDestino', attributes: ['id', 'nome'] },
      { model: User, as: 'criadoPor', attributes: ['id', 'nome', 'email'] }
    ],
    order: [['data_transferencia', 'DESC'], ['id', 'DESC']],
    transaction
  });
}

async function obterDataMinimaFechamento(sessao, { transaction = null } = {}) {
  const ultimoMovimento = await MovimentoFinanceiro.findOne({
    attributes: ['data_movimento'],
    where: {
      status: 'ATIVO',
      [Op.or]: [
        { caixa_sessao_id: sessao.id },
        {
          caixa_sessao_id: null,
          conta_bancaria_id: sessao.conta_bancaria_id,
          data_movimento: { [Op.gte]: sessao.data_abertura }
        }
      ]
    },
    order: [['data_movimento', 'DESC'], ['id', 'DESC']],
    transaction
  });

  const ultimaTransferencia = await TransferenciaFinanceira.findOne({
    attributes: ['data_transferencia'],
    where: {
      status: 'ATIVA',
      data_transferencia: { [Op.gte]: sessao.data_abertura },
      [Op.or]: [
        { caixa_sessao_origem_id: sessao.id },
        { caixa_sessao_destino_id: sessao.id },
        {
          caixa_sessao_origem_id: null,
          conta_origem_id: sessao.conta_bancaria_id
        },
        {
          caixa_sessao_destino_id: null,
          conta_destino_id: sessao.conta_bancaria_id
        }
      ]
    },
    order: [['data_transferencia', 'DESC'], ['id', 'DESC']],
    transaction
  });

  const datasValidas = [
    today(),
    String(sessao.data_abertura || ''),
    String(ultimoMovimento?.data_movimento || ''),
    String(ultimaTransferencia?.data_transferencia || '')
  ]
    .filter((data) => /^\d{4}-\d{2}-\d{2}$/.test(data))
    .sort();

  return datasValidas[datasValidas.length - 1] || today();
}

async function calcularResumoSessao(sessao, { transaction = null } = {}) {
  const movimentos = await carregarMovimentosSessao(sessao, { transaction });

  let totalEntradas = 0;
  let totalSaidas = 0;

  for (const movimento of movimentos) {
    const valor = Math.abs(roundCurrency(movimento.valor_quitacao || movimento.valor || 0));
    if (obterNaturezaMovimento(movimento) === 'ENTRADA') {
      totalEntradas = roundCurrency(totalEntradas + valor);
    } else {
      totalSaidas = roundCurrency(totalSaidas + valor);
    }
  }

  const transferencias = await carregarTransferenciasSessao(sessao, { transaction });

  for (const transferencia of transferencias) {
    const valor = roundCurrency(transferencia.valor || 0);
    if (Number(transferencia.conta_destino_id) === Number(sessao.conta_bancaria_id)) {
      totalEntradas = roundCurrency(totalEntradas + valor);
    }
    if (Number(transferencia.conta_origem_id) === Number(sessao.conta_bancaria_id)) {
      totalSaidas = roundCurrency(totalSaidas + valor);
    }
  }

  const saldoAbertura = roundCurrency(sessao.saldo_abertura || 0);
  const saldoSistema = roundCurrency(saldoAbertura + totalEntradas - totalSaidas);

  return {
    total_entradas: totalEntradas,
    total_saidas: totalSaidas,
    saldo_sistema: saldoSistema,
    quantidade_movimentos: movimentos.length,
    quantidade_transferencias: transferencias.length
  };
}

async function listarSessoesCaixa(req, filters = {}) {
  await assertFinanceAccess(req);
  const where = {};

  if (filters.conta_bancaria_id) {
    where.conta_bancaria_id = parsePositiveInteger(filters.conta_bancaria_id, 'Conta financeira');
  }
  if (filters.empresa_id) {
    where.empresa_id = parsePositiveInteger(filters.empresa_id, 'Empresa do grupo');
  }
  if (filters.status) {
    const status = String(filters.status || '').trim().toUpperCase();
    if (!['ABERTO', 'AGUARDANDO_APROVACAO', 'FECHADO', 'TODOS'].includes(status)) {
      throw createHttpError(400, 'Status do caixa invalido.');
    }
    if (status !== 'TODOS') where.status = status;
  }

  const sessoes = await CaixaFinanceiroSessao.findAll({
    where,
    include: includeSessao(),
    order: [['data_abertura', 'DESC'], ['id', 'DESC']],
    limit: Math.min(Math.max(Number(filters.limit || 50), 1), 200)
  });

  return Promise.all(sessoes.map(async (sessao) => {
    if (['ABERTO', 'AGUARDANDO_APROVACAO'].includes(sessao.status)) {
      const resumo = await calcularResumoSessao(sessao);
      sessao.setDataValue('resumo_atual', resumo);
    }
    return sessao;
  }));
}

async function obterPainelDiarioCaixas(req, dataReferencia = today()) {
  await assertFinanceAccess(req);
  const data = parseDate(dataReferencia, 'Data de referencia', today());
  const dataConciliacao = addDays(data, -1);
  const contas = await ContaBancaria.findAll({
    where: {
      ativo: { [Op.ne]: false },
      [Op.or]: [
        { exige_abertura_fechamento: true },
        { tipo_operacional: 'CAIXA_INTERNO' }
      ]
    },
    include: [{ model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social'] }],
    order: [['empresa_id', 'ASC'], ['nome', 'ASC']]
  });
  const contaIds = contas.map((conta) => Number(conta.id));
  const sessoes = contaIds.length > 0
    ? await CaixaFinanceiroSessao.findAll({
        where: {
          conta_bancaria_id: { [Op.in]: contaIds },
          [Op.or]: [
            { status: { [Op.in]: ['ABERTO', 'AGUARDANDO_APROVACAO'] } },
            { status: 'FECHADO', data_fechamento: data }
          ]
        },
        include: includeSessao(),
        order: [['data_abertura', 'DESC'], ['id', 'DESC']]
      })
    : [];
  const confirmacoes = contaIds.length > 0
    ? await CaixaConciliacaoConfirmacao.findAll({
        where: { conta_bancaria_id: { [Op.in]: contaIds }, data_referencia: dataConciliacao }
      })
    : [];
  const ultimosFechamentos = contaIds.length > 0
    ? await CaixaFinanceiroSessao.findAll({
        where: {
          conta_bancaria_id: { [Op.in]: contaIds },
          status: 'FECHADO',
          data_fechamento: { [Op.lte]: data }
        },
        attributes: ['id', 'conta_bancaria_id', 'data_fechamento', 'saldo_sistema', 'saldo_informado'],
        order: [['conta_bancaria_id', 'ASC'], ['data_fechamento', 'DESC'], ['id', 'DESC']]
      })
    : [];
  const sessaoPorConta = new Map();
  sessoes.forEach((sessao) => {
    const key = Number(sessao.conta_bancaria_id);
    const atual = sessaoPorConta.get(key);
    const sessaoAtiva = ['ABERTO', 'AGUARDANDO_APROVACAO'].includes(sessao.status);
    const atualAtiva = atual && ['ABERTO', 'AGUARDANDO_APROVACAO'].includes(atual.status);
    if (!atual || (sessaoAtiva && !atualAtiva)) sessaoPorConta.set(key, sessao);
  });
  const confirmacaoPorConta = new Map(confirmacoes.map((item) => [Number(item.conta_bancaria_id), item]));
  const ultimoFechamentoPorConta = new Map();
  ultimosFechamentos.forEach((item) => {
    const contaId = Number(item.conta_bancaria_id);
    if (!ultimoFechamentoPorConta.has(contaId)) ultimoFechamentoPorConta.set(contaId, item);
  });

  const itens = await Promise.all(contas.map(async (conta) => {
    const sessao = sessaoPorConta.get(Number(conta.id)) || null;
    const resumo = sessao ? await calcularResumoSessao(sessao) : null;
    const caixaFisico = contaEhCaixaFisico(conta);
    const resumoOfx = caixaFisico ? null : await obterResumoConciliacaoDia(conta.id, dataConciliacao);
    const confirmacao = confirmacaoPorConta.get(Number(conta.id)) || null;
    const ultimoFechamento = ultimoFechamentoPorConta.get(Number(conta.id)) || null;
    const saldoAberturaEsperado = ultimoFechamento
      ? roundCurrency(ultimoFechamento.saldo_informado ?? ultimoFechamento.saldo_sistema)
      : roundCurrency(conta.saldo_inicial || 0);
    let situacao = 'PENDENTE_ABERTURA';
    if (sessao?.status === 'AGUARDANDO_APROVACAO') situacao = 'DIVERGENCIA_PENDENTE';
    else if (sessao?.status === 'ABERTO' && String(sessao.data_abertura) === data) situacao = 'PRONTO';
    else if (sessao?.status === 'ABERTO') situacao = 'ABERTO_ATRASADO';
    else if (sessao?.status === 'FECHADO') situacao = 'FECHADO_DIA';

    return {
      conta: conta.get({ plain: true }),
      sessao: sessao ? { ...sessao.get({ plain: true }), resumo_atual: resumo } : null,
      situacao,
      data_referencia: data,
      data_conciliacao: dataConciliacao,
      conciliacao_confirmada: caixaFisico || Boolean(confirmacao),
      conciliacao: resumoOfx,
      saldo_abertura_esperado: saldoAberturaEsperado,
      ultimo_fechamento: ultimoFechamento ? {
        id: ultimoFechamento.id,
        data: ultimoFechamento.data_fechamento,
        saldo: saldoAberturaEsperado
      } : null,
      saldo_atual: Number(resumo?.saldo_sistema ?? sessao?.saldo_sistema ?? conta.saldo_inicial ?? 0)
    };
  }));

  const config = await obterCaixaDiarioConfig();
  const prontas = itens.filter((item) => item.situacao === 'PRONTO').length;
  const fechadas = itens.filter((item) => item.situacao === 'FECHADO_DIA').length;
  return {
    data_referencia: data,
    data_conciliacao: dataConciliacao,
    configuracao: {
      bloqueio_ativo: config.bloqueio_ativo,
      usuario_sujeito_bloqueio: await usuarioEstaSujeitoAoBloqueio(req.user),
      pode_operar: await usuarioPodeOperarCaixa(req.user),
      pode_aprovar_divergencia: await usuarioPodeAprovarDivergencia(req.user)
    },
    resumo: {
      total_contas: itens.length,
      contas_prontas: prontas,
      contas_fechadas: fechadas,
      contas_pendentes: itens.filter((item) => !['PRONTO', 'FECHADO_DIA'].includes(item.situacao)).length,
      operacao_liberada: itens.length > 0 && prontas === itens.length,
      divergencias_pendentes: itens.filter((item) => item.situacao === 'DIVERGENCIA_PENDENTE').length,
      saldo_consolidado: roundCurrency(itens.reduce((total, item) => total + Number(item.saldo_atual || 0), 0))
    },
    contas: itens
  };
}

async function abrirSessaoCaixa(req, payload = {}, comprovante = null) {
  await assertFinanceAccess(req);
  await assertCaixaOperator(req);
  const dataAbertura = parseDate(payload.data_abertura, 'Data de abertura', today());
  const dataConciliacaoObrigatoria = addDays(dataAbertura, -1);
  let contaAudit = null;
  let saldoAberturaAudit = 0;
  let ajusteAudit = null;
  let comprovanteUrl = null;

  const sessaoId = await sequelize.transaction(async (transaction) => {
    const conta = await carregarConta(payload.conta_bancaria_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    contaAudit = conta;

    const aberto = await CaixaFinanceiroSessao.findOne({
      where: { conta_bancaria_id: conta.id, status: { [Op.in]: ['ABERTO', 'AGUARDANDO_APROVACAO'] } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (aberto) {
      throw createHttpError(409, 'Ja existe um caixa aberto para esta conta.');
    }

    const ultimaFechada = await CaixaFinanceiroSessao.findOne({
      where: { conta_bancaria_id: conta.id, status: 'FECHADO' },
      order: [['data_fechamento', 'DESC'], ['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const saldoPadrao = ultimaFechada
      ? roundCurrency(ultimaFechada.saldo_informado ?? ultimaFechada.saldo_sistema)
      : roundCurrency(conta.saldo_inicial || 0);
    const saldoContado = parseMoney(payload.saldo_abertura, 'Saldo de abertura') ?? saldoPadrao;
    const diferencaAbertura = roundCurrency(saldoContado - saldoPadrao);
    const naturezaAjuste = diferencaAbertura > 0 ? 'ENTRADA' : 'SAIDA';
    const descricaoAjuste = String(payload.ajuste_descricao || '').trim();
    if (Math.abs(diferencaAbertura) > 0.009 && descricaoAjuste.length < 10) {
      throw createHttpError(400, 'Informe o motivo do ajuste com pelo menos 10 caracteres para abrir com saldo divergente.');
    }
    if (diferencaAbertura < -0.009 && !comprovanteUrl) {
      if (comprovante) {
        comprovanteUrl = await uploadToS3(comprovante, 'financeiro/caixas/ajustes-abertura');
      }
    }
    if (diferencaAbertura < -0.009 && !comprovanteUrl) {
      throw createHttpError(400, 'Anexe o comprovante da saida usada para ajustar o saldo de abertura.');
    }
    saldoAberturaAudit = saldoPadrao;

    // Caixa fisico tem conferencia propria no fechamento e nao depende de arquivo OFX.
    if (!contaEhCaixaFisico(conta)) {
      const confirmacaoConciliacao = await CaixaConciliacaoConfirmacao.findOne({
        where: { conta_bancaria_id: conta.id, data_referencia: dataConciliacaoObrigatoria },
        transaction
      });
      if (!confirmacaoConciliacao) {
        throw createHttpError(
          400,
          `Confirme que todos os OFX de ${dataConciliacaoObrigatoria} desta conta foram conciliados antes de abrir o caixa.`
        );
      }
    }

    const sessao = await CaixaFinanceiroSessao.create({
      empresa_id: Number(conta.empresa_id),
      conta_bancaria_id: conta.id,
      data_abertura: dataAbertura,
      status: 'ABERTO',
      saldo_abertura: saldoPadrao,
      saldo_sistema: saldoContado,
      observacoes_abertura: payload.observacoes || null,
      aberto_por: req.user?.id || null
    }, { transaction });
    if (Math.abs(diferencaAbertura) > 0.009) {
      const valorAjuste = Math.abs(diferencaAbertura);
      const movimento = await MovimentoFinanceiro.create({
        titulo_financeiro_id: null,
        conta_bancaria_id: conta.id,
        empresa_id: Number(conta.empresa_id),
        caixa_sessao_id: sessao.id,
        tipo_movimento: naturezaAjuste === 'ENTRADA' ? 'CAIXA_ENTRADA_MANUAL' : 'CAIXA_SAIDA_MANUAL',
        status: 'ATIVO',
        valor: valorAjuste,
        juros: 0,
        multa: 0,
        desconto: 0,
        valor_quitacao: valorAjuste,
        data_movimento: dataAbertura,
        documento_referencia: 'AJUSTE_ABERTURA',
        comprovante_url: naturezaAjuste === 'SAIDA' ? comprovanteUrl : null,
        comprovante_nome: naturezaAjuste === 'SAIDA' ? String(comprovante?.originalname || '').slice(0, 255) : null,
        observacoes: descricaoAjuste,
        criado_por: req.user?.id || null
      }, { transaction });
      ajusteAudit = { movimento_id: movimento.id, natureza: naturezaAjuste, valor: valorAjuste, saldo_contado: saldoContado };
    }
    return sessao.id;
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_CASH_SESSION_OPENED',
    recursoTipo: 'CAIXA_FINANCEIRO',
    recursoId: sessaoId,
    status: 'SUCCESS',
    descricao: 'Sessao de caixa aberta',
    metadata: {
      conta_bancaria_id: contaAudit.id,
      empresa_id: Number(contaAudit.empresa_id),
      saldo_abertura: saldoAberturaAudit,
      tipo_operacional: contaAudit.tipo_operacional
    }
  });
  if (ajusteAudit) {
    await recordEvent({
      usuario_id: req.user?.id || null,
      setor_id: req.user?.setor_id || null,
      perfil_snapshot: req.user?.perfil || null,
      categoria: 'OPERACAO',
      tipo_evento: 'CASH_DIVERGENCE_OPENING',
      modulo: 'FINANCEIRO',
      recurso_tipo: 'CAIXA_FINANCEIRO',
      recurso_id: String(sessaoId),
      empresa_id: Number(contaAudit.empresa_id) || null,
      resumo: `Divergencia de abertura ajustada por ${ajusteAudit.natureza.toLowerCase()}`,
      resultado: 'SUCCESS',
      metadata: {
        conta_bancaria_id: contaAudit.id,
        natureza: ajusteAudit.natureza,
        valor: ajusteAudit.valor,
        saldo_anterior: saldoAberturaAudit,
        saldo_contado: ajusteAudit.saldo_contado,
        movimento_id: ajusteAudit.movimento_id
      }
    });
  }

  return CaixaFinanceiroSessao.findByPk(sessaoId, { include: includeSessao() });
}

async function fecharSessaoCaixa(req, sessaoId, payload = {}) {
  await assertFinanceAccess(req);
  await assertCaixaOperator(req);
  const id = parsePositiveInteger(sessaoId, 'Caixa');
  let fechamentoAudit = null;

  await sequelize.transaction(async (transaction) => {
    const sessao = await CaixaFinanceiroSessao.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!sessao) throw createHttpError(404, 'Caixa nao encontrado.');
    if (sessao.status !== 'ABERTO') {
      throw createHttpError(400, 'Apenas caixas abertos podem ser fechados.');
    }

    const dataFechamento = parseDate(payload.data_fechamento, 'Data de fechamento', today());
    if (dataFechamento < sessao.data_abertura) {
      throw createHttpError(400, 'Data de fechamento nao pode ser anterior a data de abertura.');
    }
    const dataMinimaFechamento = await obterDataMinimaFechamento(sessao, { transaction });
    if (dataFechamento < dataMinimaFechamento) {
      throw createHttpError(
        400,
        `Data de fechamento nao pode ser retroativa nem anterior ao ultimo movimento do caixa (${dataMinimaFechamento}).`
      );
    }

    sessao.data_fechamento = dataFechamento;
    const resumo = await calcularResumoSessao(sessao, { transaction });
    const saldoInformado = parseMoney(payload.saldo_informado, 'Saldo informado', { required: true });
    const diferenca = roundCurrency(saldoInformado - resumo.saldo_sistema);
    const observacoes = String(payload.observacoes || '').trim();
    if (Math.abs(diferenca) > 0.009 && observacoes.length < 10) {
      throw createHttpError(400, 'Informe uma justificativa com pelo menos 10 caracteres para fechar o caixa com divergencia.');
    }

    const fechamentoComDivergencia = Math.abs(diferenca) > 0.009;
    await sessao.update({
      data_fechamento: dataFechamento,
      status: fechamentoComDivergencia ? 'AGUARDANDO_APROVACAO' : 'FECHADO',
      total_entradas: resumo.total_entradas,
      total_saidas: resumo.total_saidas,
      saldo_sistema: resumo.saldo_sistema,
      saldo_informado: saldoInformado,
      diferenca,
      observacoes_fechamento: observacoes || null,
      fechado_por: fechamentoComDivergencia ? null : (req.user?.id || null),
      fechado_em: fechamentoComDivergencia ? null : new Date(),
      divergencia_status: fechamentoComDivergencia ? 'PENDENTE' : null,
      divergencia_solicitada_por: fechamentoComDivergencia ? (req.user?.id || null) : null,
      divergencia_solicitada_em: fechamentoComDivergencia ? new Date() : null,
      divergencia_decidida_por: null,
      divergencia_decidida_em: null,
      divergencia_decisao_observacao: null
    }, { transaction });
    fechamentoAudit = {
      conta_bancaria_id: sessao.conta_bancaria_id,
      empresa_id: sessao.empresa_id || null,
      saldo_sistema: resumo.saldo_sistema,
      saldo_informado: saldoInformado,
      diferenca
    };
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: Math.abs(Number(fechamentoAudit?.diferenca || 0)) > 0.009
      ? 'FINANCIAL_CASH_DIVERGENCE_REQUESTED'
      : 'FINANCIAL_CASH_SESSION_CLOSED',
    recursoTipo: 'CAIXA_FINANCEIRO',
    recursoId: id,
    status: 'SUCCESS',
    descricao: Math.abs(Number(fechamentoAudit?.diferenca || 0)) > 0.009
      ? 'Fechamento de caixa enviado para aprovacao de divergencia'
      : 'Sessao de caixa fechada',
    metadata: {
      ...fechamentoAudit
    }
  });
  if (Math.abs(Number(fechamentoAudit?.diferenca || 0)) > 0.009) {
    await recordEvent({
      usuario_id: req.user?.id || null,
      setor_id: req.user?.setor_id || null,
      perfil_snapshot: req.user?.perfil || null,
      categoria: 'OPERACAO',
      tipo_evento: 'CASH_DIVERGENCE_CLOSING',
      modulo: 'FINANCEIRO',
      recurso_tipo: 'CAIXA_FINANCEIRO',
      recurso_id: String(id),
      empresa_id: fechamentoAudit.empresa_id || null,
      resumo: 'Fechamento de caixa com divergencia enviado para aprovacao',
      resultado: 'SUCCESS',
      metadata: {
        saldo_sistema: fechamentoAudit.saldo_sistema,
        saldo_informado: fechamentoAudit.saldo_informado,
        diferenca: fechamentoAudit.diferenca
      }
    });
  }

  return CaixaFinanceiroSessao.findByPk(id, { include: includeSessao() });
}

async function carregarSessaoParaMovimento(sessaoId, transaction) {
  const id = parsePositiveInteger(sessaoId, 'Caixa');
  const sessao = await CaixaFinanceiroSessao.findByPk(id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!sessao) throw createHttpError(404, 'Caixa nao encontrado.');
  if (sessao.status !== 'ABERTO') {
    throw createHttpError(400, 'O caixa precisa estar aberto para registrar ou estornar movimentos.');
  }
  const conta = await ContaBancaria.findByPk(sessao.conta_bancaria_id, {
    attributes: ['id', 'nome', 'tipo_operacional', 'empresa_id', 'exige_abertura_fechamento'],
    transaction
  });
  if (!conta || !contaEhCaixaFisico(conta)) {
    throw createHttpError(400, 'Lancamentos manuais sao permitidos somente em contas de caixa fisico.');
  }
  sessao.setDataValue('contaBancaria', conta);
  return sessao;
}

async function registrarMovimentoCaixa(req, sessaoId, payload = {}, comprovante = null) {
  await assertFinanceAccess(req);
  await assertCaixaOperator(req);
  const natureza = String(payload.natureza || '').trim().toUpperCase();
  if (!['ENTRADA', 'SAIDA'].includes(natureza)) {
    throw createHttpError(400, 'Natureza do movimento invalida.');
  }
  const descricao = String(payload.descricao || '').trim();
  if (descricao.length < 3) {
    throw createHttpError(400, 'Informe uma descricao com pelo menos 3 caracteres.');
  }
  const valor = parseMoney(payload.valor, 'Valor', { required: true });
  if (valor <= 0) throw createHttpError(400, 'O valor deve ser maior que zero.');
  const dataMovimento = parseDate(payload.data_movimento, 'Data do movimento', today());
  if (dataMovimento > today()) {
    throw createHttpError(400, 'A data do movimento nao pode ser futura.');
  }
  if (natureza === 'SAIDA' && !comprovante) {
    throw createHttpError(400, 'Anexe o comprovante para registrar uma saida de caixa.');
  }
  const comprovanteUrl = comprovante
    ? await uploadToS3(comprovante, `financeiro/caixas/${sessaoId}/comprovantes`)
    : null;
  let movimentoId = null;
  let sessaoAudit = null;
  let detalheAtualizado = null;

  await sequelize.transaction(async (transaction) => {
    const sessao = await carregarSessaoParaMovimento(sessaoId, transaction);
    if (dataMovimento < sessao.data_abertura) {
      throw createHttpError(400, 'A data do movimento nao pode ser anterior a abertura do caixa.');
    }
    // Calcula a base antes do INSERT. A sessao esta bloqueada para UPDATE, entao
    // dois lancamentos manuais no mesmo caixa nao atualizam os totais em paralelo.
    // A recarga completa do livro e feita somente depois do commit: em alguns
    // ambientes MySQL a releitura ORM dentro desta transacao nao enxergava a
    // linha recem-criada e provocava um rollback indevido.
    const resumoAnterior = await calcularResumoSessao(sessao, { transaction });
    const movimento = await MovimentoFinanceiro.create({
      titulo_financeiro_id: null,
      conta_bancaria_id: sessao.conta_bancaria_id,
      empresa_id: sessao.empresa_id || sessao.contaBancaria?.empresa_id || null,
      caixa_sessao_id: sessao.id,
      tipo_movimento: natureza === 'ENTRADA' ? 'CAIXA_ENTRADA_MANUAL' : 'CAIXA_SAIDA_MANUAL',
      status: 'ATIVO',
      valor,
      juros: 0,
      multa: 0,
      desconto: 0,
      valor_quitacao: valor,
      data_movimento: dataMovimento,
      documento_referencia: String(payload.documento_referencia || '').trim().slice(0, 120) || null,
      comprovante_url: comprovanteUrl,
      comprovante_nome: comprovante ? String(comprovante.originalname || '').slice(0, 255) : null,
      observacoes: descricao,
      criado_por: req.user?.id || null
    }, { transaction });
    movimentoId = movimento.id;
    sessaoAudit = sessao;

    const totalEntradas = roundCurrency(
      resumoAnterior.total_entradas + (natureza === 'ENTRADA' ? valor : 0)
    );
    const totalSaidas = roundCurrency(
      resumoAnterior.total_saidas + (natureza === 'SAIDA' ? valor : 0)
    );
    const saldoSistema = roundCurrency(
      Number(sessao.saldo_abertura || 0) + totalEntradas - totalSaidas
    );

    await sessao.update({
      total_entradas: totalEntradas,
      total_saidas: totalSaidas,
      saldo_sistema: saldoSistema
    }, { transaction });
  });

  // Fora da transacao, a listagem consulta apenas dados efetivamente commitados.
  // O INSERT e a atualizacao dos totais continuam atomicos: qualquer erro dentro
  // do bloco acima reverte ambos antes de chegar a esta recarga.
  detalheAtualizado = await montarDetalheSessaoCaixa(sessaoAudit.id);
  detalheAtualizado.total_entradas = detalheAtualizado.resumo_atual.total_entradas;
  detalheAtualizado.total_saidas = detalheAtualizado.resumo_atual.total_saidas;
  detalheAtualizado.saldo_sistema = detalheAtualizado.resumo_atual.saldo_sistema;

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_CASH_MOVEMENT_CREATED',
    recursoTipo: 'MOVIMENTO_FINANCEIRO',
    recursoId: movimentoId,
    status: 'SUCCESS',
    descricao: `${natureza === 'ENTRADA' ? 'Entrada' : 'Saida'} manual registrada no caixa fisico`,
    metadata: {
      caixa_sessao_id: Number(sessaoAudit.id),
      conta_bancaria_id: Number(sessaoAudit.conta_bancaria_id),
      empresa_id: sessaoAudit.empresa_id ? Number(sessaoAudit.empresa_id) : null,
      natureza,
      valor,
      data_movimento: dataMovimento,
      documento_referencia: payload.documento_referencia || null
    }
  });

  return detalheAtualizado;
}

async function estornarMovimentoCaixa(req, sessaoId, movimentoId, payload = {}) {
  await assertFinanceAccess(req);
  await assertCaixaOperator(req);
  const idMovimento = parsePositiveInteger(movimentoId, 'Movimento');
  const motivo = String(payload.motivo || '').trim();
  if (motivo.length < 10) {
    throw createHttpError(400, 'Informe um motivo com pelo menos 10 caracteres para o estorno.');
  }
  let movimentoAudit = null;

  await sequelize.transaction(async (transaction) => {
    const sessao = await carregarSessaoParaMovimento(sessaoId, transaction);
    const movimento = await MovimentoFinanceiro.findOne({
      where: {
        id: idMovimento,
        caixa_sessao_id: sessao.id
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!movimento) throw createHttpError(404, 'Movimento do caixa nao encontrado.');
    if (movimento.status !== 'ATIVO') throw createHttpError(400, 'Este movimento ja foi estornado.');
    if (!['CAIXA_ENTRADA_MANUAL', 'CAIXA_SAIDA_MANUAL'].includes(String(movimento.tipo_movimento || '').toUpperCase())) {
      throw createHttpError(400, 'Somente lancamentos manuais podem ser estornados por este fluxo.');
    }
    await movimento.update({
      status: 'ESTORNADO',
      estornado_por: req.user?.id || null,
      estornado_em: new Date(),
      observacoes: `${movimento.observacoes || ''}\n[ESTORNO] ${motivo}`.trim()
    }, { transaction });
    movimentoAudit = {
      caixa_sessao_id: sessao.id,
      conta_bancaria_id: sessao.conta_bancaria_id,
      empresa_id: sessao.empresa_id || null,
      tipo_movimento: movimento.tipo_movimento,
      valor: Number(movimento.valor_quitacao || movimento.valor || 0)
    };
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_CASH_MOVEMENT_REVERSED',
    recursoTipo: 'MOVIMENTO_FINANCEIRO',
    recursoId: idMovimento,
    status: 'SUCCESS',
    descricao: 'Movimento manual de caixa estornado',
    metadata: { ...movimentoAudit, motivo }
  });

  return obterResumoSessaoCaixa(req, movimentoAudit.caixa_sessao_id);
}

function serializarMovimentoSessao(movimento, sessao) {
  const natureza = obterNaturezaMovimento(movimento);
  const manual = ['CAIXA_ENTRADA_MANUAL', 'CAIXA_SAIDA_MANUAL'].includes(String(movimento.tipo_movimento || '').toUpperCase());
  return {
    id: movimento.id,
    origem: 'MOVIMENTO',
    natureza,
    tipo: movimento.tipo_movimento,
    data: movimento.data_movimento,
    valor: Math.abs(Number(movimento.valor_quitacao || movimento.valor || 0)),
    descricao: movimento.observacoes || movimento.titulo?.descricao || movimento.titulo?.codigo || 'Movimento financeiro',
    documento: movimento.documento_referencia || movimento.titulo?.codigo || null,
    comprovante: movimento.comprovante_url ? {
      url: movimento.comprovante_url,
      nome: movimento.comprovante_nome || 'Comprovante'
    } : null,
    titulo: movimento.titulo || null,
    usuario: movimento.criadoPor || null,
    estornavel: sessao.status === 'ABERTO' && manual && movimento.status === 'ATIVO'
  };
}

function serializarTransferenciaSessao(transferencia, sessao) {
  const entrada = Number(transferencia.conta_destino_id) === Number(sessao.conta_bancaria_id);
  return {
    id: transferencia.id,
    origem: 'TRANSFERENCIA',
    natureza: entrada ? 'ENTRADA' : 'SAIDA',
    tipo: 'TRANSFERENCIA',
    data: transferencia.data_transferencia,
    valor: Math.abs(Number(transferencia.valor || 0)),
    descricao: transferencia.descricao || `Transferencia ${entrada ? 'recebida' : 'enviada'}`,
    documento: null,
    conta_contraparte: entrada ? transferencia.contaOrigem?.nome : transferencia.contaDestino?.nome,
    usuario: transferencia.criadoPor || null,
    estornavel: false
  };
}

async function montarDetalheSessaoCaixa(sessaoId, { transaction = null } = {}) {
  const sessao = await CaixaFinanceiroSessao.findByPk(parsePositiveInteger(sessaoId, 'Caixa'), {
    include: includeSessao(),
    transaction
  });
  if (!sessao) {
    throw createHttpError(404, 'Caixa nao encontrado.');
  }
  const resumo = await calcularResumoSessao(sessao, { transaction });
  // Dentro de uma transacao do Sequelize, as consultas compartilham a mesma
  // conexao. Mantelas sequenciais evita concorrencia na conexao e garante que
  // o movimento recem-criado seja lido antes de confirmar o sucesso ao cliente.
  const movimentos = await carregarMovimentosSessao(sessao, { transaction });
  const transferencias = await carregarTransferenciasSessao(sessao, { transaction });
  const movimentosDetalhados = [
    ...movimentos.map((movimento) => serializarMovimentoSessao(movimento, sessao)),
    ...transferencias.map((transferencia) => serializarTransferenciaSessao(transferencia, sessao))
  ]
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || Number(b.id) - Number(a.id))
    .slice(0, 300);
  return {
    ...sessao.get({ plain: true }),
    resumo_atual: resumo,
    movimentos_detalhados: movimentosDetalhados
  };
}

async function obterResumoSessaoCaixa(req, sessaoId) {
  await assertFinanceAccess(req);
  return montarDetalheSessaoCaixa(sessaoId);
}

async function decidirDivergenciaCaixa(req, sessaoId, payload = {}) {
  await assertFinanceAccess(req);
  await assertDivergenceApprover(req);
  const id = parsePositiveInteger(sessaoId, 'Caixa');
  const decisao = String(payload.decisao || '').trim().toUpperCase();
  const observacao = String(payload.observacao || '').trim();
  if (!['APROVAR', 'REJEITAR'].includes(decisao)) {
    throw createHttpError(400, 'Decisao de divergencia invalida.');
  }
  if (observacao.length < 10) {
    throw createHttpError(400, 'Informe uma observacao com pelo menos 10 caracteres para a decisao.');
  }
  let audit = null;

  await sequelize.transaction(async (transaction) => {
    const sessao = await CaixaFinanceiroSessao.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!sessao) throw createHttpError(404, 'Caixa nao encontrado.');
    if (sessao.status !== 'AGUARDANDO_APROVACAO' || sessao.divergencia_status !== 'PENDENTE') {
      throw createHttpError(409, 'Esta divergencia ja foi decidida ou nao esta pendente.');
    }
    if (Number(sessao.divergencia_solicitada_por) === Number(req.user?.id)) {
      throw createHttpError(403, 'Quem informou a divergencia nao pode aprovar ou rejeitar a propria solicitacao.');
    }

    const diferencaOriginal = roundCurrency(sessao.diferenca || 0);
    if (decisao === 'REJEITAR') {
      await sessao.update({
        status: 'ABERTO',
        data_fechamento: null,
        saldo_informado: null,
        diferenca: null,
        fechado_por: null,
        fechado_em: null,
        divergencia_status: 'REJEITADA',
        divergencia_decidida_por: req.user?.id || null,
        divergencia_decidida_em: new Date(),
        divergencia_decisao_observacao: observacao
      }, { transaction });
    } else {
      const valorAjuste = Math.abs(diferencaOriginal);
      if (valorAjuste > 0.009) {
        const entrada = diferencaOriginal > 0;
        await MovimentoFinanceiro.create({
          titulo_financeiro_id: null,
          conta_bancaria_id: sessao.conta_bancaria_id,
          empresa_id: sessao.empresa_id || null,
          caixa_sessao_id: sessao.id,
          tipo_movimento: entrada
            ? 'CAIXA_AJUSTE_DIVERGENCIA_ENTRADA'
            : 'CAIXA_AJUSTE_DIVERGENCIA_SAIDA',
          status: 'ATIVO',
          valor: valorAjuste,
          juros: 0,
          multa: 0,
          desconto: 0,
          valor_quitacao: valorAjuste,
          data_movimento: sessao.data_fechamento || today(),
          documento_referencia: `AJUSTE-CAIXA-${sessao.id}`,
          observacoes: `Ajuste de divergencia aprovado: ${observacao}`,
          criado_por: req.user?.id || null
        }, { transaction });
      }
      const resumoAjustado = await calcularResumoSessao(sessao, { transaction });
      await sessao.update({
        status: 'FECHADO',
        total_entradas: resumoAjustado.total_entradas,
        total_saidas: resumoAjustado.total_saidas,
        saldo_sistema: resumoAjustado.saldo_sistema,
        fechado_por: sessao.divergencia_solicitada_por || null,
        fechado_em: new Date(),
        divergencia_status: 'APROVADA',
        divergencia_decidida_por: req.user?.id || null,
        divergencia_decidida_em: new Date(),
        divergencia_decisao_observacao: observacao
      }, { transaction });
    }
    audit = {
      decisao,
      observacao,
      conta_bancaria_id: sessao.conta_bancaria_id,
      empresa_id: sessao.empresa_id || null,
      diferenca: diferencaOriginal,
      solicitada_por: sessao.divergencia_solicitada_por || null
    };
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: decisao === 'APROVAR'
      ? 'FINANCIAL_CASH_DIVERGENCE_APPROVED'
      : 'FINANCIAL_CASH_DIVERGENCE_REJECTED',
    recursoTipo: 'CAIXA_FINANCEIRO',
    recursoId: id,
    status: 'SUCCESS',
    descricao: decisao === 'APROVAR'
      ? 'Divergencia de caixa aprovada e saldo ajustado'
      : 'Divergencia de caixa rejeitada e sessao reaberta',
    metadata: audit
  });

  return montarDetalheSessaoCaixa(id);
}

module.exports = {
  obterNaturezaMovimento,
  abrirSessaoCaixa,
  confirmarConciliacaoDiaCaixa,
  decidirDivergenciaCaixa,
  estornarMovimentoCaixa,
  fecharSessaoCaixa,
  listarSessoesCaixa,
  obterPainelDiarioCaixas,
  obterResumoSessaoCaixa,
  registrarMovimentoCaixa
};
