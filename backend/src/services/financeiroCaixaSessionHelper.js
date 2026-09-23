const { CaixaFinanceiroSessao, ContaBancaria } = require('../models');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function contaExigeSessao(conta) {
  const valorConfigurado = conta?.exige_abertura_fechamento;
  const exigeAberturaFechamento = valorConfigurado === true ||
    Number(valorConfigurado) === 1 ||
    String(valorConfigurado || '').trim().toLowerCase() === 'true';

  return exigeAberturaFechamento ||
    String(conta?.tipo_operacional || '').toUpperCase() === 'CAIXA_INTERNO';
}

function sessaoAbrangeDataMovimento(sessao, dataMovimento = today()) {
  const dataAbertura = String(sessao?.data_abertura || '');
  const dataReferencia = String(dataMovimento || today());
  return Boolean(dataAbertura) && dataAbertura <= dataReferencia;
}

async function carregarContaBancaria(contaBancariaId, { transaction = null } = {}) {
  const id = Number(contaBancariaId || 0);
  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'Conta financeira invalida.');
  }

  const conta = await ContaBancaria.findByPk(id, { transaction });
  if (!conta || conta.ativo === false) {
    throw createHttpError(400, 'Conta financeira invalida ou inativa.');
  }
  return conta;
}

async function obterSessaoAbertaParaConta(
  contaOrId,
  dataMovimento = today(),
  { transaction = null, exigir = false, permitirDataAnteriorSemVinculo = false } = {}
) {
  const conta = typeof contaOrId === 'object' && contaOrId !== null
    ? contaOrId
    : await carregarContaBancaria(contaOrId, { transaction });

  const sessao = await CaixaFinanceiroSessao.findOne({
    where: {
      conta_bancaria_id: conta.id,
      status: 'ABERTO'
    },
    order: [['data_abertura', 'DESC'], ['id', 'DESC']],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });

  if (sessao) {
    if (!sessao.empresa_id) {
      throw createHttpError(
        400,
        `O caixa aberto da conta ${conta.nome || conta.id} nao possui empresa vinculada. Feche e reabra o caixa apos corrigir a conta financeira.`
      );
    }
    if (conta.empresa_id && Number(sessao.empresa_id) !== Number(conta.empresa_id)) {
      throw createHttpError(
        400,
        `O caixa aberto da conta ${conta.nome || conta.id} esta vinculado a empresa diferente da conta financeira. Reabra o caixa apos corrigir o cadastro.`
      );
    }

    if (sessaoAbrangeDataMovimento(sessao, dataMovimento)) {
      return sessao;
    }

    // A conciliacao de um OFX historico pode ocorrer depois que o saldo atual
    // do caixa ja foi conferido e uma nova sessao foi aberta. Nesse caso a
    // sessao aberta autoriza a operacao, mas nao deve receber o vinculo da
    // transferencia antiga, pois isso descontaria o mesmo valor novamente do
    // saldo operacional atual.
    if (permitirDataAnteriorSemVinculo) {
      return null;
    }
  }

  if (exigir || contaExigeSessao(conta)) {
    throw createHttpError(
      400,
      `Abra o caixa da conta ${conta.nome || conta.id} antes de registrar movimentacoes nessa data.`
    );
  }

  return null;
}

module.exports = {
  carregarContaBancaria,
  contaExigeSessao,
  obterSessaoAbertaParaConta,
  sessaoAbrangeDataMovimento
};
