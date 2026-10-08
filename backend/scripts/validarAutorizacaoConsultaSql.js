'use strict';

// Servico, modelos, gerador SQL e hidratacao reais do Sequelize/MySQL.
// Somente transporte de banco e dependencias externas simulados; nao le .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Sequelize, DataTypes, Op } = require('sequelize');
const MySqlQuery = require('sequelize/lib/dialects/mysql/query');
const sequelize = new Sequelize('offline', 'offline', 'offline', { dialect: 'mysql', logging: false });
// Qualquer tentativa de abrir uma conexao real deve falhar, nunca acessar um banco.
sequelize.connectionManager.getConnection = async () => { throw new Error('Conexao de banco proibida neste teste'); };
const models = { sequelize };
for (const name of ['PagamentoAutorizacaoLote', 'PagamentoAutorizacaoItem', 'PagamentoAutorizacaoDocumento', 'TituloFinanceiro']) {
  models[name] = require(`../src/models/${name}`)(sequelize, DataTypes);
}
models.User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true }, nome: DataTypes.STRING
}, { tableName: 'users' });
const { PagamentoAutorizacaoLote: Lote, PagamentoAutorizacaoItem: Item,
  PagamentoAutorizacaoDocumento: Documento, TituloFinanceiro: Titulo, User } = models;
Lote.belongsTo(User, { foreignKey: 'criado_por', as: 'criadoPor' });
Lote.belongsTo(User, { foreignKey: 'decidido_por', as: 'decididoPor' });
Lote.hasMany(Item, { foreignKey: 'lote_id', as: 'itens' });
Item.hasMany(Documento, { foreignKey: 'item_id', as: 'documentos' });
Item.belongsTo(Titulo, { foreignKey: 'titulo_financeiro_id', as: 'titulo' });
models.PagamentoAutorizador = { findOne: async () => null };
models.WebauthnCredential = { count: async () => 0 };
const env = { paymentOwnerApprovalMode: 'PILOT' };
const stubs = {
  crypto: require('node:crypto'), sequelize: { Op }, '../models': models, '../config/env': { env },
  './authorizationService': { userHasNominalAreaPermission: async (user, permissions) => permissions.every(key => user.grants.includes(key)) },
  './analiseProprietarioService': {}, './pagamentoManualFilaService': {},
  './pagamentoAutorizacaoEventosService': {}, './s3': {}, './webauthnChallengeStore': {},
  './webPushService': { isConfigured: () => false, hasActiveSubscription: async () => false },
  './securityLogService': {}
};
function loadService(source) {
  const sandbox = { module: { exports: {} }, console, Date, Buffer,
    require(dependency) {
      assert(Object.hasOwn(stubs, dependency), `Dependencia externa nao simulada: ${dependency}`);
      return stubs[dependency];
    } };
  vm.runInNewContext(source, sandbox, { filename: 'pagamentoAutorizacaoService.js' });
  return sandbox.module.exports;
}
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/pagamentoAutorizacaoService.js'), 'utf8');
const service = loadService(source);
const req = { user: { id: 2, grants: ['financeiro.autorizacoes_pagamento.visualizar'] } };
const sqlQueries = [];
let fixtureRows = [];
function assertQuery(sql, options) {
  assert(sql.startsWith('SELECT '), 'A consulta nao pode gerar escrita');
  const itemInclude = options.include.find(include => include.as === 'itens');
  const titleInclude = itemInclude.include.find(include => include.as === 'titulo');
  assert.equal(titleInclude.required, false, 'Historico deve sobreviver ao titulo ausente/excluido');
  assert.match(sql, /LEFT OUTER JOIN `titulos_financeiros` AS `itens->titulo`/);
  assert.match(sql, /`itens->titulo`\.`deleted_at` IS NULL/);
  assert.match(sql, /`itens->titulo`\.`valor_baixado` AS `itens\.titulo\.valor_baixado`/);
  assert.match(sql, /`itens->documentos`\.`nome` AS `itens\.documentos\.nome`/);
  if (options.limit === 100) {
    const begin = sql.indexOf('FROM (SELECT ');
    const end = sql.indexOf(') AS `PagamentoAutorizacaoLote`', begin);
    assert(begin > 0 && end > begin, 'Limite deve incidir nos lotes, nao nos itens/documentos');
    const subquery = sql.slice(begin, end);
    assert.match(subquery, /ORDER BY `PagamentoAutorizacaoLote`\.`createdAt` DESC LIMIT 100$/);
    assert(!subquery.includes('`itens`') && !subquery.includes('`itens->titulo`'),
      'Regressao: subquery nao pode referenciar itens antes de sua juncao');
  }
}
sequelize.query = async (sql, options) => {
  sqlQueries.push(sql);
  assertQuery(sql, options);
  return new MySqlQuery({}, sequelize, options).handleSelectQuery(fixtureRows);
};
function row(itemId, documentId, titlePresent = true) {
  return {
    id: 8, codigo: 'AUT-QA', status: 'AGUARDANDO',
    'criadoPor.id': 2, 'criadoPor.nome': 'Preparador QA', 'decididoPor.id': null,
    'itens.id': itemId, 'itens.lote_id': 8, 'itens.titulo_financeiro_id': 90 + itemId,
    'itens.status': 'PENDENTE', 'itens.snapshot_json': { codigo: `TIT-QA-${itemId}` },
    'itens.documentos.id': documentId, 'itens.documentos.nome': documentId ? 'Documento QA' : null,
    'itens.titulo.id': titlePresent ? 90 + itemId : null,
    'itens.titulo.status': titlePresent ? 'ABERTO' : null,
    'itens.titulo.valor_baixado': titlePresent ? '0.00' : null
  };
}
(async () => {
  fixtureRows = [row(1, 10), row(1, 11), row(2, null, false)];
  const lots = await service.listBatches(req);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].itens.length, 2, 'Documentos nao podem duplicar itens');
  assert.equal(lots[0].itens[0].documentos.length, 2);
  assert.equal(lots[0].itens[0].titulo.status, 'ABERTO');
  assert.equal(lots[0].itens[1].titulo, null);
  assert.equal(lots[0].itens[1].snapshot_json.codigo, 'TIT-QA-2', 'Snapshot historico preservado');
  await service.listBatches(req, { status: ' autorizado ' });
  assert.match(sqlQueries.at(-1), /`PagamentoAutorizacaoLote`\.`status` = 'AUTORIZADO'/);
  const lot = await service.getBatch(req, 8);
  assert.equal(lot.id, 8);
  assert.equal(lot.itens.length, 2);
  assert.match(sqlQueries.at(-1), /`PagamentoAutorizacaoLote`\.`id` = 8/);
  fixtureRows = [];
  assert.equal((await service.listBatches(req)).length, 0);
  await assert.rejects(service.getBatch(req, 999), error => error.statusCode === 404);
  const before = sqlQueries.length;
  await assert.rejects(service.listBatches({ user: { id: 3, grants: [] } }), error => error.statusCode === 403);
  await assert.rejects(service.getBatch({ user: { id: 3, grants: [] } }, 8), error => error.statusCode === 403);
  env.paymentOwnerApprovalMode = 'OFF';
  await assert.rejects(service.listBatches(req), error => error.statusCode === 404);
  assert.equal(sqlQueries.length, before, 'Sem permissao ou com OFF nao pode consultar lotes');
  env.paymentOwnerApprovalMode = 'PAUSED';
  await service.listBatches(req); // PAUSED preserva consulta, nao libera decisoes.
  env.paymentOwnerApprovalMode = 'PILOT';
  // Prova negativa: retirar apenas a correcao recria o SQL invalido original.
  const oldSource = source.replace("attributes: ['id', 'status', 'valor_baixado'], required: false",
    "attributes: ['id', 'status', 'valor_baixado']");
  assert.notEqual(oldSource, source);
  await assert.rejects(loadService(oldSource).listBatches(req), /Historico deve sobreviver/);
  const invalidSql = sqlQueries.at(-1);
  const invalidSubquery = invalidSql.slice(invalidSql.indexOf('FROM (SELECT '),
    invalidSql.indexOf(') AS `PagamentoAutorizacaoLote`'));
  assert.match(invalidSubquery, /INNER JOIN `titulos_financeiros` AS `itens->titulo` ON `itens`\.`titulo_financeiro_id`/);
  assert(!invalidSubquery.includes('FROM `pagamento_autorizacao_itens` AS `itens` INNER JOIN `titulos_financeiros` AS `itens->titulo`'),
    'A versao anterior deve reproduzir a referencia ao alias itens fora do escopo');
  console.log('OK: SQL MySQL real de lista/detalhe, limite por lote, soft delete, snapshots, documentos, filtros, permissao e regressao. Sem banco ou rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
