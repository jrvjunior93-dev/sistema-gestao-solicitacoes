'use strict';
// Controller/formatador reais e models interceptados: sem banco, env ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const { anexarDetalheTitulo } = require('../src/services/pagamentoFilaDestinatarioService');
const origem = { id: 11053, codigo: 'TIT-009886', tipo: 'PAGAR', status: 'QUITADO',
  solicitacao_id: 6345, parceiro_id: 9, parceiro: { id: 9, nome: 'Favorecido da medicao' },
  valor_baixado: '1000.00', valor_saldo: '0.00', data_quitacao: '2026-10-15',
  forma_pagamento_id: 3, formaPagamento: { id: 3, nome: 'Pix', tipo: 'PIX' },
  movimentos: [{ id: 801, status: 'ATIVO', valor: '1000.00' }], paymentIntents: [] };
let consultas = 0;
const model = findAll => new Proxy({ findAll }, { get(target, key) {
  if (!(key in target)) throw Error(`Escrita/chamada nao prevista: ${String(key)}`); return target[key];
} });
const db = {
  Solicitacao: { findByPk: async (id, options) => {
    consultas++; assert.equal(id, 6345); assert(options.attributes.includes('favorecido_chave_pix'));
    return { id: 6345, contrato_id: 5, parceiro: { id: 1, nome: 'Credor contratual' } };
  } },
  Anexo: model(async options => { consultas++; assert.equal(options.where.solicitacao_id, 6345); assert.equal(options.where.deleted_at, null); return []; }),
  MedicaoParcela: {}, ContratoMedicao: {}, FormaPagamentoFinanceira: {},
  ContratoParcela: model(async options => {
    consultas++; assert.deepEqual(options.where[Op.or][0].titulo_financeiro_id[Op.in], [11053], 'ID interno, nunca numero do codigo TIT');
    return [{ id: 1, contrato_id: 5, titulo_financeiro_id: 11053, medicoes: [{ solicitacao_id: 6345, medicao: {
      id: 1, contrato_id: 5, solicitacao_id: 6345, favorecido_id: 9,
      favorecido_chave_pix: 'chave-explicita-da-medicao', forma_pagamento_id: 3
    } }] }];
  }),
  ContratoCredor: model(async () => { consultas++; return [{ contrato_id: 5, parceiro_id: 1 }]; }),
  Parceiro: model(async () => { consultas++; return [{ id: 1, nome: 'Credor contratual' }, { id: 9, nome: 'Favorecido da medicao' }]; })
};
const modulo = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/TituloFinanceiroController.js'), 'utf8'), {
  module: modulo, console: { error() {} }, require(name) {
    if (name === '../services/tituloFinanceiroService') return { carregarTituloPorId: async req => {
      if (req.negado) throw Object.assign(Error('Fora do escopo'), { statusCode: 403 });
      return structuredClone(origem);
    } };
    if (name === '../services/authorizationService') return { userHasAreaPermission: async user => user.operador };
    if (name === '../services/pagamentoFilaDestinatarioService') return { anexarDetalheTitulo: payload => anexarDetalheTitulo(payload, db) };
    if (name === '../utils/controllerError') return { responderErroController: (res, error) => res.status(error.statusCode || 500).json({ error: error.message }) };
    if (['../services/tituloFinanceiroRelatorioPdfService', '../validators/financialValidators'].includes(name)) return {};
    throw Error(`Dependencia nao isolada ${name}`);
  }
});
const resposta = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
async function run() {
  const antes = structuredClone(origem), res = resposta();
  await modulo.exports.show({ user: { operador: true }, params: { id: 11053 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.instrucao_medicao_fila.favorecido_chave_pix, 'chave-explicita-da-medicao');
  assert.equal(res.body.credor_fila.nome, 'Credor contratual');
  assert.deepEqual(res.body.movimentos, origem.movimentos);
  assert.equal(res.body.valor_saldo, '0.00'); assert.equal(res.body.status, 'QUITADO');
  assert.deepEqual(origem, antes);
  const previsao = { ...structuredClone(origem), status: 'PREVISAO', valor_baixado: 0, valor_saldo: 1000, forma_pagamento_id: null, formaPagamento: null };
  await anexarDetalheTitulo(previsao, { ...db, FormaPagamentoFinanceira: model(async options => {
    assert.deepEqual(options.where.id[Op.in], [3]); return [{ id: 3, nome: 'Pix da medicao', tipo: 'PIX' }];
  }), ContratoParcela: model(async options => {
    assert.deepEqual(options.include[0].include[0].where, { rejeicao: null }, 'Detalhe PREVISAO permite conferir medicao pendente, sem entrar na fila');
    return [{ id: 1, contrato_id: 5, titulo_financeiro_id: 11053, medicoes: [{ solicitacao_id: 6345, medicao: {
      id: 1, contrato_id: 5, solicitacao_id: 6345, favorecido_id: 9, aprovada_em: null, rejeicao: null,
      favorecido_chave_pix: 'pix-pendente', forma_pagamento_id: 3
    } }] }];
  }) });
  assert.equal(previsao.instrucao_medicao_fila.favorecido_chave_pix, 'pix-pendente');
  assert.equal(previsao.instrucao_medicao_fila.forma_pagamento_tipo, 'PIX');
  const restrito = resposta();
  await modulo.exports.show({ user: { operador: false }, params: { id: 11053 } }, restrito);
  assert.equal(restrito.body.movimentos, undefined); assert.equal(restrito.body.paymentIntents, undefined);
  assert.equal(restrito.body.instrucao_medicao_fila.nome_favorecido, 'Favorecido da medicao');
  const total = consultas, negado = resposta();
  await modulo.exports.show({ negado: true, user: {}, params: { id: 11053 } }, negado);
  assert.equal(negado.statusCode, 403); assert.equal(consultas, total, 'Nenhuma consulta extra apos acesso negado');
  const receber = { id: 1, tipo: 'RECEBER' };
  assert.equal(await anexarDetalheTitulo(receber, new Proxy({}, { get() { throw Error('Receber nao deve consultar instrucao de pagamento'); } })), receber);
  const consultaAvulsa = { ...db, ContratoParcela: model(async () => []),
    Solicitacao: { findByPk: async id => { assert.equal(id, 20); return {
      id: 20, favorecido_id: 22, favorecido: { id: 22, nome: 'Favorecido da solicitacao' },
      favorecido_chave_pix: 'pix-da-solicitacao', dados_pagamento: 'Instrucoes complementares da origem'
    }; } },
    Anexo: model(async () => []), PaymentBeneficiary: { findByPk: async id => {
      assert.equal(id, 33); return { id: 33, nome: 'Favorecido bancario', pix_chave: 'pix-da-conta' };
    } }
  };
  const solicitado = { id: 100, tipo: 'PAGAR', solicitacao_id: 20 };
  await anexarDetalheTitulo(solicitado, consultaAvulsa);
  assert.equal(solicitado.solicitacao.favorecido.nome, 'Favorecido da solicitacao');
  assert.equal(solicitado.solicitacao.favorecido_chave_pix, 'pix-da-solicitacao');
  assert.equal(solicitado.solicitacao.dados_pagamento, 'Instrucoes complementares da origem');
  const manual = { id: 101, tipo: 'PAGAR', payment_beneficiary_id: 33 };
  await anexarDetalheTitulo(manual, consultaAvulsa);
  assert.equal(manual.paymentBeneficiary.pix_chave, 'pix-da-conta');
  const dp = { id: 102, tipo: 'PAGAR', origem_titulo: 'RH_DP' };
  await anexarDetalheTitulo(dp, consultaAvulsa, async itens => { itens[0].recebimento_dp = 'DINHEIRO'; });
  assert.equal(dp.recebimento_dp, 'DINHEIRO');
  console.log('OK: GET real do detalhe, ID11053/codigo TIT-009886, medicao/Pix/favorecido/credor, dados originais/baixa intactos, 403 antes de consultar, movimentos/intencoes restritos e RECEBER preservados. Sem banco/rede.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
