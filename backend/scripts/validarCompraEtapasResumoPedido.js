const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

// Exercita o controller real com persistência simulada, sem acessar banco ou rede.
const controllerPath = path.resolve(__dirname, '../src/controllers/SolicitacaoCompraEtapasController.js');
const plain = (dados) => ({ ...dados, toJSON: () => ({ ...dados }) });
const item = plain({ id: 91, quantidade_pedido: 2, valor_total: 100, frete_rateado: 10,
  respostaItem: { observacao: 'Entregar embalado', cotacaoFornecedor: { condicao_pagamento: '30 dias' } } });
const pedido = plain({ id: 12, solicitacao_compra_id: 2, valor_total: 110,
  fornecedor: { id: 8, nome: 'Fornecedor' }, obra: { id: 3, nome: 'Obra' }, itens: [item] });
let autorizado = true;
let consultas = 0;
const models = new Proxy({}, { get(target, name) {
  return target[name] ||= { findAll: async () => [], findOne: async () => null };
} });
models.SolicitacaoCompra.findOne = async () => ({ id: 2, origem: 'SOLICITACAO', status: 'COTACAO' });
models.PedidoCompra.findAll = async (options) => {
  consultas += 1;
  assert.equal(options.where.solicitacao_compra_id, 2);
  for (const alias of ['itens', 'fornecedor', 'obra']) assert.ok(options.include.some(i => i.as === alias));
  const resposta = options.include.find(i => i.as === 'itens').include[0];
  assert.equal(resposta.as, 'respostaItem');
  assert.deepEqual(resposta.attributes, ['id', 'observacao']);
  assert.deepEqual(resposta.include[0].attributes, ['id', 'condicao_pagamento']);
  return [pedido];
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === controllerPath) {
    if (request === '../models') return models;
    if (request.endsWith('solicitacaoRetornoService')) return {
      assertPodeVisualizarSolicitacao: async () => {
        if (!autorizado) throw Object.assign(new Error('Sem acesso'), { statusCode: 403 });
        return { solicitacao: { id: 77 } };
      }
    };
    if (request.endsWith('compraItensCotacaoService')) return { obterChavesItensEmCotacao: () => new Set() };
    if (request.endsWith('pedidoEntregaService')) return { resumirPedidos: async () => new Map([[91, { restante: 2 }]]) };
    if (request.includes('/services/') && !request.endsWith('pedidoCompraDocumentoUtils')) return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  const controller = require(controllerPath);
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.listar({ params: { id: 77 } }, res);
  assert.equal(res.statusCode, 200);
  const resumo = res.body.pedidos[0];
  assert.equal(resumo.fornecedor.nome, 'Fornecedor');
  assert.equal(resumo.obra.id, 3);
  assert.equal(resumo.condicao_pagamento, '30 dias');
  assert.equal(resumo.itens[0].observacoes, 'Entregar embalado');
  assert.equal(resumo.itens[0].respostaItem, undefined, 'Não expor a resposta de cotação inteira.');
  assert.equal(resumo.itens[0].entrega.restante, 2);
  assert.deepEqual(resumo.itens[0].recebimentos, []);
  autorizado = false;
  await controller.listar({ params: { id: 77 } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(consultas, 1, 'Sem acesso, não consultar pedidos.');
  console.log('OK: resumo por solicitação, fornecedor/obra, condições e observações da cotação, entregas preservadas e acesso negado antes da consulta.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; });
