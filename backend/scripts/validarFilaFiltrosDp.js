'use strict';
// ORM MySQL real com execucao de SQL interceptada. Nenhuma conexao ou arquivo de ambiente.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SequelizeLib = require('sequelize'), { Sequelize, DataTypes } = SequelizeLib;
const { validateManualPaymentQueueQuery } = require('../src/validators/paymentValidators');
const filtros = require('../src/services/pagamentoFilaFiltrosDomain');
const query = validateManualPaymentQueueQuery({ status: 'PENDENTE', origem: 'RH_DP', empresa_id: '3', credor_id: '11', recebimento_dp: 'DINHEIRO' });
assert.deepEqual(query, { status: 'PENDENTE', origem: 'RH_DP', empresa_id: 3, credor_id: 11, recebimento_dp: 'DINHEIRO' });
for (const q of [{ origem: 'RH_DP OR 1=1' }, { empresa_id: '3 OR 1=1' }, { credor_id: -1 }, { recebimento_dp: 'BOLETO' }, { escopo: 'TODOS' }]) assert.throws(() => validateManualPaymentQueueQuery(q));
assert.throws(() => filtros.recebimentoDpSql('titulo;DROP'), /Alias/);
const opcoes = filtros.opcoesDosTitulos([{ titulo: { empresa: { id: 3, nome: 'Empresa QA' }, parceiro: { id: 11, nome: 'Ana' } } }, { titulo: { empresa: { id: 3, nome: 'Empresa QA' } } }]);
assert.equal(opcoes.empresas.length, 1); assert.equal(opcoes.credores.length, 1);
const db = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
const models = { sequelize: db };
for (const name of ['TituloFinanceiro', 'PagamentoManualFilaItem', 'PagamentoManualFilaComprovante']) models[name] = require('../src/models/' + name)(db, DataTypes);
for (const name of ['ContaBancaria', 'EmpresaGrupo', 'Obra', 'Parceiro', 'PaymentBeneficiary', 'Solicitacao', 'FormaPagamentoFinanceira', 'User']) {
  models[name] = db.define(name, { id: { type: DataTypes.INTEGER, primaryKey: true } });
}
const fila = models.PagamentoManualFilaItem, titulo = models.TituloFinanceiro;
fila.belongsTo(titulo, { as: 'titulo', foreignKey: 'titulo_financeiro_id' });
fila.hasMany(models.PagamentoManualFilaComprovante, { as: 'comprovantes', foreignKey: 'fila_id' });
fila.belongsTo(models.ContaBancaria, { as: 'contaBancaria', foreignKey: 'conta_bancaria_id' });
for (const as of ['selecionadoPor', 'processadoPor', 'resolvidoPor']) fila.belongsTo(models.User, { as, foreignKey: as + '_id' });
for (const [name, as, key] of [['Parceiro', 'parceiro', 'parceiro_id'], ['Parceiro', 'favorecidoPagamento', 'favorecido_pagamento_id'],
  ['PaymentBeneficiary', 'paymentBeneficiary', 'payment_beneficiary_id'], ['FormaPagamentoFinanceira', 'formaPagamento', 'forma_pagamento_id'],
  ['Obra', 'obra', 'obra_id'], ['EmpresaGrupo', 'empresa', 'empresa_id'], ['Solicitacao', 'solicitacao', 'solicitacao_id']]) titulo.belongsTo(models[name], { as, foreignKey: key });
models.Solicitacao.belongsTo(models.Parceiro, { as: 'favorecido', foreignKey: 'favorecido_id' });
models.Solicitacao.belongsTo(models.FormaPagamentoFinanceira, { as: 'formaPagamento', foreignKey: 'forma_pagamento_id' });
models.PagamentoAutorizacaoItem = { findAll: async () => [] };
const sqls = [];
db.query = async (sql, options) => {
  sqls.push(sql);
  assert.match(sql, /^SELECT /); // Nenhuma escrita, nem conexao.
  return options.plain ? { count: 0 } : [];
};
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/pagamentoManualFilaService.js'), 'utf8'), {
  module: mod, console, require(id) {
    if (id === '../models') return models;
    if (id === 'sequelize') return SequelizeLib;
    if (id === 'crypto') return require('node:crypto');
    if (id === './pagamentoFilaFiltrosDomain') return filtros;
    if (id === './pagamentoFilaComprovanteDomain') return require('../src/services/pagamentoFilaComprovanteDomain');
    if (id === './instrucaoFinanceiraFavorecidoService') return { anexarInstrucoes: async () => {} };
    return {};
  }
});
(async () => {
  const result = await mod.exports.listarFilaPagamentos({ user: { id: 1 } }, query);
  assert.equal(result.data.length, 0);
  const list = sqls.find(sql => sql.includes('LIMIT 500'));
  assert(list); assert.match(list, /JSON_TABLE/); assert.match(list, /ref\.titulo_id = `titulo`\.id/);
  for (const trecho of ['`titulo`.`empresa_id` = 3', '`titulo`.`parceiro_id` = 11', "IN ('RH_DP', 'RH_DP_TICKET')", "= 'DINHEIRO'"]) assert(list.includes(trecho), trecho);
  assert(list.indexOf('WHERE') < list.indexOf('LIMIT 500'));
  assert(sqls.some(sql => sql.includes('GROUP BY `PagamentoManualFilaItem`.`status`')));
  const catalogo = sqls.find(sql => sql.includes('GROUP BY `titulo`.`empresa_id`'));
  assert(catalogo); assert(catalogo.includes('`titulo->empresa`.`nome`'));
  assert(!catalogo.includes("= 'DINHEIRO'"), 'Catalogo nao desaparece ao escolher filtro sem resultados');
  assert(!list.includes('rh_colaboradores'), 'Nao reclassifica titulo historico pelo cadastro atual');
  assert(list.includes('linha.empresa_id = `titulo`.empresa_id'), 'Vale legado respeita empresa do grupo');
  console.log('Fila filtros: SQL MySQL real gerado, filtros antes do limite, totais/catalogos, snapshot RH vinculado por titulo/empresa e negativas de query; sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
