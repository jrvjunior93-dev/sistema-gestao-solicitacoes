const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  validateCompraPedidoQuery,
  validateCompraQuery
} = require('../src/validators/operationalValidators');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

function run() {
  assert.strictEqual(validateCompraQuery({ visao: 'resumo' }).visao, 'resumo');
  assert.strictEqual(
    validateCompraQuery({ contexto: 'delegacao', visao: 'delegacao' }).visao,
    'delegacao'
  );
  assert.strictEqual(validateCompraPedidoQuery({ visao: 'resumo' }).visao, 'resumo');
  assert.throws(() => validateCompraQuery({ visao: 'completa-invalida' }));
  assert.throws(() => validateCompraPedidoQuery({ visao: 'delegacao' }));

  const routes = read('src/routes.js');
  assert(routes.includes("'/compras/solicitacoes/:id/workspace-cotacao'"));
  assert(routes.includes('requireCompraAccess, SolicitacaoCompraController.workspaceCotacao'));

  const controller = read('src/controllers/SolicitacaoCompraController.js');
  assert(controller.includes("const visaoResumida = ['resumo', 'delegacao']"));
  assert(controller.includes('data.itens_count'));
  assert(controller.includes('data.fornecedores_count'));

  const pedidoService = read('src/services/pedidoCompraService.js');
  assert(pedidoService.includes("const visaoResumo = String(visao || '').trim().toLowerCase() === 'resumo'"));
  assert(pedidoService.includes('itens_ativos_count'));

  const realtime = read('src/services/comprasRealtimeService.js');
  assert(realtime.includes("topics: ['compras']"));
  assert(realtime.includes('DESTINATARIOS_CACHE_TTL_MS'));

  const migration = require('../migrations/202608030001_compras_performance_indexes');
  assert.strictEqual(typeof migration.up, 'function');
  assert.strictEqual(typeof migration.down, 'function');

  console.log('Validacao das fases de performance, rascunho e realtime de Compras concluida com sucesso.');
}

run();
