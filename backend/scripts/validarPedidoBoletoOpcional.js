'use strict';

// Servico real com dependencias em memoria: nao carrega modelos/banco nem envia arquivos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateCompraPedidoPrevisoesBody } = require('../src/validators/operationalValidators');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const formas = [{ id: 1, nome: 'Boleto', gera_boleto: true }, { id: 2, nome: 'Pix' }, { id: 3, nome: 'Transferencia' }];
const tituloPayloads = [], vinculos = [], documentos = [], anexos = [], historicos = [];
const pedido = { id: 10, financeiro_fluxo_versao: 1, status: 'FECHADO_FORNECEDOR',
  obra_id: 7, valor_total_fornecedor: 100, fornecedor: { parceiro_id: 20, nome: 'Fornecedor' },
  solicitacao: { solicitacao_principal_id: 30 }, update: async () => {} };
const frete = { id: 8, parceiro_id: 21, valor_total: 25 };
const modelos = {
  Parceiro: { findOne: async ({ where }) => where.id > 0 ? { id: where.id, nome: 'Favorecido' } : null },
  PedidoCompra: { findByPk: async (_id, options) => {
    assert.equal(options.lock, transaction.LOCK.UPDATE); return pedido;
  } },
  PedidoCompraTitulo: {
    findOne: async ({ where }) => vinculos.find((v) => v.idempotency_key === where.idempotency_key),
    create: async (data, options) => { assert.equal(options.transaction, transaction); vinculos.push(data); }
  },
  PedidoCompraFrete: { findAll: async () => [frete] },
  PedidoCompraDocumentoFinanceiro: { findOrCreate: async ({ defaults, transaction: tx }) => {
    assert.equal(tx, transaction); documentos.push(defaults); return [defaults];
  } },
  Anexo: { findOrCreate: async ({ defaults, transaction: tx }) => {
    assert.equal(tx, transaction); anexos.push(defaults); return [defaults];
  } },
  Historico: { create: async (data) => historicos.push(data) }
};
const sandbox = { module: { exports: {} }, require(id) {
  if (id === 'sequelize') return { Op: {} };
  if (id === '../models') return modelos;
  if (id === './tituloFinanceiroService') return { criarTituloManual: async (_req, data, options) => {
    assert.equal(options.transaction, transaction);
    tituloPayloads.push(data);
    return { titulos: [{ id: tituloPayloads.length, valor_original: data.valor, data_vencimento: data.data_vencimento }] };
  } };
  if (id === './notificacoes') return {};
  if (id === './pedidoCompraTituloConfigService') return { validarCategoriaTituloPedido: async (id) => id };
  if (id === './formasPagamentoMedicaoService') return { listarFormasDosFluxos: async () => ({ formas }) };
  throw new Error(`Dependencia nao simulada: ${id}`);
} };
const arquivo = path.join(__dirname, '../src/services/pedidoCompraFinanceiroService.js');
vm.runInNewContext(fs.readFileSync(arquivo, 'utf8') + `
  // Apenas consultas de projecao sao substituidas na fixture.
  buscarTitulosPedido = async () => [];
  obterResumoFinanceiroPedido = async () => ({ ok: true });
  module.exports.qaPagamento = validarPagamentoNegociado;
`, sandbox, { filename: arquivo });
const service = sandbox.module.exports;
const base = { categoria_financeira_id: 1, forma_pagamento_id: 1, favorecido_pagamento_id: 20,
  parcelas: [{ valor: 100, data_vencimento: '2026-10-20' }],
  fretes: [{ frete_id: 8, forma_pagamento_id: 1, favorecido_pagamento_id: 21,
    parcelas: [{ valor: 25, data_vencimento: '2026-10-21' }] }] };

(async () => {
  const criar = async (payload, chave) => service.criarPrevisoesPedido({ req: { user: { id: 4 } },
    pedidoId: 10, payload: validateCompraPedidoPrevisoesBody(payload), idempotencyKey: chave, transaction });
  await criar(base, 'sem-boleto');
  assert.equal(tituloPayloads.length, 2, 'Compra e frete geram titulos mesmo sem boleto');
  assert.equal(tituloPayloads[0].valor, 100);
  assert.equal(tituloPayloads[1].valor, 25);
  assert.ok(tituloPayloads.every((t) => t.status === 'ABERTO' && t.forma_pagamento_id === 1));
  assert.equal(vinculos.length, 2);
  assert.equal(historicos.length, 1);
  assert.equal(documentos.length, 0);
  assert.equal(anexos.length, 0, 'Nao cria anexo ficticio');
  await criar(base, 'sem-boleto');
  assert.equal(tituloPayloads.length, 2, 'Retry com mesma chave nao duplica titulos');
  assert.equal(historicos.length, 1);

  const boletos = [1, 2].map((n) => ({ arquivo_url: `https://arquivos.test/boleto${n}.pdf`, arquivo_nome: `boleto${n}.pdf` }));
  await criar({ ...base, boletos, fretes: [{ ...base.fretes[0], boletos: [boletos[0]] }] }, 'com-boleto');
  assert.equal(documentos.length, 3, 'Preserva multiplos boletos da compra e o do frete');
  assert.equal(anexos.length, 3);
  assert.equal(documentos[0].tipo, 'BOLETO_COMPRA');
  assert.equal(documentos[2].tipo, 'BOLETO_FRETE');
  assert.equal(anexos[0].solicitacao_id, 30);
  await assert.rejects(criar(base, ''), /idempotencia obrigatoria/);
  await assert.rejects(criar({ ...base, parcelas: [{ valor: 99, data_vencimento: '2026-10-20' }] }, 'soma'), /soma das parcelas/);
  const validar = (data) => service.qaPagamento({ favorecido_pagamento_id: 20, ...data }, 'a compra', formas, transaction);
  await assert.rejects(validar({ forma_pagamento_id: 999 }), /ativa e habilitada/);
  await assert.rejects(validar({ forma_pagamento_id: 1, favorecido_pagamento_id: 0 }), /favorecido/);
  await assert.rejects(validar({ forma_pagamento_id: 2 }), /chave PIX/);
  await assert.rejects(validar({ forma_pagamento_id: 3 }), /dados para pagamento/);
  assert.equal((await validar({ forma_pagamento_id: 2, chave_pix: 'compras@pix' })).chavePix, 'compras@pix');
  assert.equal((await validar({ forma_pagamento_id: 3, dados_pagamento: 'Conta 123' })).dadosPagamento, 'Conta 123');
  assert.throws(() => validateCompraPedidoPrevisoesBody({ ...base, boletos: [{}] }), /URL/);
  assert.throws(() => validateCompraPedidoPrevisoesBody({ ...base, parcelas: [{ valor: 100 }] }), /Vencimento/);
  console.log('Boleto opcional: criacao compra/frete, anexos, auditoria, retry e validacoes preservadas. Sem banco real.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
