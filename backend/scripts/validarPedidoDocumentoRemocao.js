'use strict';
// Servico e controller reais; ORM e permissoes em memoria, sem banco/S3/HTTP.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let anexar = true, excluir = true, parent = true, falharAuditoria = false;
let updates = [], historicos = [], commits = 0, rollbacks = 0;
const tx = { LOCK: { UPDATE: 'UPDATE' }, async commit() { commits++; }, async rollback() {
  rollbacks++; Object.assign(documento, anterior); historicos.length = 0;
} };
const checkTx = options => { assert.equal(options.transaction, tx); };
const pedido = { id: 10, financeiro_fluxo_versao: 1, status: 'FECHADO_FORNECEDOR',
  solicitacao: { solicitacao_principal_id: 30 } };
const documento = { id: 91, pedido_compra_id: 10, tipo: 'BOLETO_COMPRA', numero_documento: '123',
  observacoes: 'Preservar', arquivo_url: 's3://qa/boleto.pdf', arquivo_nome: 'boleto.pdf', idempotency_key: 'original',
  async update(data, options) { checkTx(options); updates.push(JSON.parse(JSON.stringify(data))); Object.assign(this, data); },
  toJSON() { return Object.fromEntries(Object.entries(this).filter(([, value]) => typeof value !== 'function')); } };
const anterior = JSON.parse(JSON.stringify(documento));
const modelos = {
  PedidoCompra: { sequelize: { transaction: async () => tx }, findByPk: async (id, options) => {
    checkTx(options); assert.equal(options.lock, tx.LOCK.UPDATE); return parent && id === 10 ? pedido : null;
  } },
  PedidoCompraDocumentoFinanceiro: { findOne: async options => {
    checkTx(options); assert.equal(options.lock, tx.LOCK.UPDATE);
    return options.where.id === documento.id && options.where.pedido_compra_id === documento.pedido_compra_id ? documento : null;
  }, findAll: async () => [documento, { tipo: 'NOTA_FISCAL', toJSON: () => ({ id: 92, tipo: 'NOTA_FISCAL', numero_documento: '456', arquivo_url: null }) }] },
  Historico: { create: async (data, options) => { checkTx(options); if (falharAuditoria) throw new Error('AUDITORIA_QA'); historicos.push(data); } },
  PedidoCompraReabertura: { findOne: async () => null }, CartaoFinanceiro: { findAll: async () => [] }
};
const arquivo = path.join(__dirname, '../src/services/pedidoCompraFinanceiroService.js');
const sandbox = { module: { exports: {} }, require(id) {
  if (id === 'sequelize') return { Op: {} };
  if (id === '../models') return modelos;
  if (id === './authorizationService') return { canAnexarDocumentoPedidoCompraFinanceiro: async () => anexar,
    canDeleteSolicitacaoAnexo: async () => excluir };
  if (id === './tituloFinanceiroService' || id === './notificacoes') return {};
  if (id === './pedidoCompraTituloConfigService') return { obterConfiguracaoCategoriasTituloPedido: async () => ({ categorias: [] }) };
  if (id === './formasPagamentoMedicaoService') return { listarFormasDosFluxos: async () => ({ formas: [] }) };
  throw new Error(`Dependencia inesperada: ${id}`);
} };
vm.runInNewContext(fs.readFileSync(arquivo, 'utf8') + '\nbuscarTitulosPedido = async () => [];', sandbox, { filename: arquivo });
const service = sandbox.module.exports;
const req = { user: { id: 4 }, params: { id: '10', documentoId: '91' } };
const remover = overrides => service.removerArquivoDocumentoFinanceiro({ req, pedidoId: 10, documentoId: 91, transaction: tx, ...overrides });
const controllerSandbox = { module: { exports: {} }, console: { error() {} }, require(id) {
  if (id === '../models') return modelos;
  if (id === '../services/pedidoCompraFinanceiroService') return service;
  if (id === '../utils/controllerError') return { responderErroController: (res, erro) => res.status(erro.statusCode || 400).json({ erro: erro.message }) };
  throw new Error(id);
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/PedidoCompraFinanceiroController.js'), 'utf8'), controllerSandbox);
const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
(async () => {
  anexar = false; await assert.rejects(remover(), { statusCode: 403 });
  anexar = true; excluir = false; await assert.rejects(remover(), { statusCode: 403 });
  assert.equal(updates.length, 0); excluir = true;
  parent = false; await assert.rejects(remover(), { statusCode: 404 }); parent = true;
  await assert.rejects(remover({ documentoId: 92 }), { statusCode: 404 });
  documento.pedido_compra_id = 11; await assert.rejects(remover(), { statusCode: 404 }); documento.pedido_compra_id = 10;
  assert.equal(updates.length, 0, 'Outro pedido nao altera dados');
  falharAuditoria = true;
  await controllerSandbox.module.exports.removerArquivo(req, res);
  assert.equal(rollbacks, 1); assert.equal(commits, 0); assert.equal(documento.arquivo_url, anterior.arquivo_url);
  falharAuditoria = false;
  await controllerSandbox.module.exports.removerArquivo(req, res);
  assert.equal(commits, 1); assert.equal(res.code, 200); assert.equal(res.data.ja_removido, false);
  assert.deepEqual(updates.at(-1), { arquivo_url: null, arquivo_nome: null });
  for (const key of ['numero_documento', 'observacoes', 'tipo', 'idempotency_key']) assert.equal(documento[key], anterior[key]);
  assert.equal(historicos.length, 1); assert.equal(historicos[0].solicitacao_id, 30);
  assert.equal(historicos[0].usuario_responsavel_id, 4); assert.equal(historicos[0].acao, 'PEDIDO_COMPRA_ARQUIVO_DESVINCULADO');
  const metadata = JSON.parse(historicos[0].metadata);
  assert.equal(metadata.pedido_compra_id, 10); assert.equal(metadata.documento_id, 91);
  assert.equal(metadata.arquivo_desvinculado.arquivo_url, anterior.arquivo_url);
  const repeticao = await remover(); assert.equal(repeticao.ja_removido, true);
  assert.equal(historicos.length, 1, 'Repeticao idempotente nao duplica auditoria');
  const resumo = await service.obterResumoFinanceiroPedido(pedido, { transaction: tx, incluirDetalhes: true });
  assert.deepEqual(Array.from(resumo.documentos, d => d.id), [92], 'Boleto sem arquivo sai; nota fiscal sem arquivo preserva metadados');
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  const rota = routes.split(/\r?\n/).find(line => line.includes('documentos/:documentoId/arquivo'));
  assert(rota.includes('router.delete(') && rota.includes('allowComprasPedidosFinanceiroRemoverArquivo'));
  assert(rota.includes('criticalRateLimit') && rota.includes("validateNumericIdParams(['id', 'documentoId']"));
  assert(rota.includes('requirePedidoCompraAccess') && rota.includes('PedidoCompraFinanceiroController.removerArquivo'));
  assert.equal(routes.match(/documentos\/:documentoId\/arquivo/g).length, 1);
  console.log('OK: remocao isolada real, permissoes 403, pedido/documento 404, locks, transacao/rollback, auditoria, idempotencia e resumo; sem banco/S3/titulos.');
})().catch(error => { console.error(error); process.exitCode = 1; });
