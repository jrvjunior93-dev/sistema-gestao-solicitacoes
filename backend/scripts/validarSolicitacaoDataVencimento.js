const assert = require('assert');
const {
  validateSolicitacaoCreateBody,
  validateSolicitacaoDataVencimentoBody
} = require('../src/validators/operationalValidators');
const {
  FINALIDADES_DATA_SOLICITACAO,
  normalizeTipoSolicitacaoBehavior,
  obterRotuloDataSolicitacao,
  serializeTipoSolicitacaoBehavior
} = require('../src/services/tipoSolicitacaoBehaviorService');
const {
  aplicarVencimentoEfetivoSolicitacao,
  sqlVencimentoEfetivoSolicitacao,
  sqlVencimentoMedicaoPendente
} = require('../src/services/solicitacaoVencimentoListaService');
const fs = require('fs');
const path = require('path');

function formatDateOnly(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function buildPayload(dataVencimento) {
  return {
    obra_id: 1,
    tipo_solicitacao_id: 1,
    area_responsavel: 'FINANCEIRO',
    descricao: 'Solicitacao de teste',
    data_vencimento: dataVencimento
  };
}

function run() {
  const now = Date.now();
  const past = formatDateOnly(new Date(now - (3 * 24 * 60 * 60 * 1000)));
  const today = formatDateOnly(new Date(now));
  const future = formatDateOnly(new Date(now + (3 * 24 * 60 * 60 * 1000)));

  assert.throws(
    () => validateSolicitacaoCreateBody(buildPayload(past)),
    /nao pode ser anterior a data atual/i
  );
  assert.strictEqual(validateSolicitacaoCreateBody(buildPayload(today)).data_vencimento, today);
  assert.strictEqual(validateSolicitacaoCreateBody(buildPayload(future)).data_vencimento, future);

  assert.throws(
    () => validateSolicitacaoDataVencimentoBody({ data_vencimento: past }),
    /nao pode ser anterior a data atual/i
  );
  assert.strictEqual(
    validateSolicitacaoDataVencimentoBody({ data_vencimento: future }).data_vencimento,
    future
  );

  const comportamentoPadrao = normalizeTipoSolicitacaoBehavior({ comportamento: null });
  assert.strictEqual(
    comportamentoPadrao.finalidade_data_vencimento,
    FINALIDADES_DATA_SOLICITACAO.RESPOSTA
  );
  assert.strictEqual(obterRotuloDataSolicitacao(comportamentoPadrao), 'Data de Resposta');

  const comportamentoPagamento = normalizeTipoSolicitacaoBehavior({
    comportamento: { finalidade_data_vencimento: 'pagamento' }
  });
  assert.strictEqual(
    comportamentoPagamento.finalidade_data_vencimento,
    FINALIDADES_DATA_SOLICITACAO.PAGAMENTO
  );
  assert.strictEqual(obterRotuloDataSolicitacao(comportamentoPagamento), 'Data de Pagamento');
  assert.strictEqual(
    obterRotuloDataSolicitacao(comportamentoPagamento, { recargaCartao: true }),
    'Data prevista para recarga'
  );
  assert.strictEqual(
    JSON.parse(serializeTipoSolicitacaoBehavior(comportamentoPagamento)).finalidade_data_vencimento,
    FINALIDADES_DATA_SOLICITACAO.PAGAMENTO
  );

  assert.deepStrictEqual(
    aplicarVencimentoEfetivoSolicitacao({
      data_vencimento: '2026-10-20',
      data_vencimento_medicao: '2026-09-25'
    }),
    {
      data_vencimento: '2026-09-25',
      data_vencimento_medicao: '2026-09-25',
      data_vencimento_solicitacao: '2026-10-20',
      data_vencimento_origem: 'MEDICAO'
    }
  );
  assert.deepStrictEqual(
    aplicarVencimentoEfetivoSolicitacao({ data_vencimento: '2026-10-20' }),
    {
      data_vencimento: '2026-10-20',
      data_vencimento_medicao: null,
      data_vencimento_solicitacao: '2026-10-20',
      data_vencimento_origem: 'SOLICITACAO'
    }
  );

  const sqlMedicao = sqlVencimentoMedicaoPendente();
  const sqlEfetivo = sqlVencimentoEfetivoSolicitacao();
  assert(sqlMedicao.includes('MIN(mp.vencimento_aplicado)'), 'Deve manter o vencimento mais proximo das medicoes.');
  assert(sqlMedicao.includes('mp.devolvido_em IS NULL'), 'Vinculos devolvidos nao podem definir o vencimento.');
  assert(sqlMedicao.includes('COALESCE(tf.valor_saldo, 0) > 0'), 'Somente medicoes pendentes devem definir o vencimento.');
  assert(sqlEfetivo.includes('COALESCE(') && sqlEfetivo.includes('`Solicitacao`.data_vencimento'));

  const controllerSource = fs.readFileSync(
    path.resolve(__dirname, '../src/controllers/SolicitacaoController.js'),
    'utf8'
  );
  const frontendSource = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/src/pages/Solicitacoes/LinhaSolicitacao.jsx'),
    'utf8'
  );
  assert(
    controllerSource.includes("'data_vencimento_medicao'")
      && controllerSource.includes('sqlVencimentoEfetivoSolicitacao()'),
    'Lista, filtro, contadores e ordenacao devem receber o vencimento efetivo.'
  );
  assert(
    frontendSource.includes("data_vencimento_origem === 'MEDICAO'")
      && frontendSource.includes('Vencimento mais próximo entre as medições pendentes'),
    'A coluna deve identificar o vencimento derivado da medicao e impedir edicao enganosa.'
  );

  console.log('Validacao de vencimento de solicitacoes concluida com sucesso.');
}

run();
