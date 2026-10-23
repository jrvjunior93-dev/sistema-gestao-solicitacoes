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
for (const name of ['TituloFinanceiro', 'PagamentoManualFilaItem', 'PagamentoManualFilaComprovante', 'TituloCompartilhadoOrigem']) models[name] = require('../src/models/' + name)(db, DataTypes);
for (const name of ['ContaBancaria', 'EmpresaGrupo', 'Obra', 'Parceiro', 'PaymentBeneficiary', 'Solicitacao', 'FormaPagamentoFinanceira', 'User']) {
  models[name] = db.define(name, { id: { type: DataTypes.INTEGER, primaryKey: true } });
}
const fila = models.PagamentoManualFilaItem, titulo = models.TituloFinanceiro;
titulo.hasMany(models.TituloCompartilhadoOrigem, { as: 'participacoesCompartilhadas', foreignKey: 'titulo_financeiro_id' });
models.TituloCompartilhadoOrigem.belongsTo(models.EmpresaGrupo, { as: 'empresa', foreignKey: 'empresa_id' });
fila.belongsTo(titulo, { as: 'titulo', foreignKey: 'titulo_financeiro_id' });
fila.hasMany(models.PagamentoManualFilaComprovante, { as: 'comprovantes', foreignKey: 'fila_id' });
fila.belongsTo(models.ContaBancaria, { as: 'contaBancaria', foreignKey: 'conta_bancaria_id' });
for (const as of ['selecionadoPor', 'processadoPor', 'resolvidoPor']) fila.belongsTo(models.User, { as, foreignKey: as + '_id' });
for (const [name, as, key] of [['Parceiro', 'parceiro', 'parceiro_id'], ['Parceiro', 'favorecidoPagamento', 'favorecido_pagamento_id'],
  ['PaymentBeneficiary', 'paymentBeneficiary', 'payment_beneficiary_id'], ['FormaPagamentoFinanceira', 'formaPagamento', 'forma_pagamento_id'],
  ['Obra', 'obra', 'obra_id'], ['EmpresaGrupo', 'empresa', 'empresa_id'], ['Solicitacao', 'solicitacao', 'solicitacao_id']]) titulo.belongsTo(models[name], { as, foreignKey: key });
models.Solicitacao.belongsTo(models.Parceiro, { as: 'favorecido', foreignKey: 'favorecido_id' });
models.Solicitacao.belongsTo(models.Parceiro, { as: 'parceiro', foreignKey: 'parceiro_id' });
models.Solicitacao.belongsTo(models.FormaPagamentoFinanceira, { as: 'formaPagamento', foreignKey: 'forma_pagamento_id' });
const autorizacoes = [];
models.PagamentoAutorizacaoItem = { findAll: async o => { autorizacoes.push(['lista', o]); return []; }, count: async o => { autorizacoes.push(['contagem', o]); return 0; } };
const sqls = [];
let contagemSimulada = 0;
db.query = async (sql, options) => {
  sqls.push(sql);
  assert.match(sql, /^SELECT /); // Nenhuma escrita, nem conexao.
  return options.plain ? { count: contagemSimulada } : [];
};
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/pagamentoManualFilaService.js'), 'utf8'), {
  module: mod, console, require(id) {
    if (id === '../models') return models;
    if (id === 'sequelize') return SequelizeLib;
    if (id === 'crypto') return require('node:crypto');
    if (id === './pagamentoFilaFiltrosDomain') return filtros;
    if (id === './pagamentoFilaPesquisaDomain') return require('../src/services/pagamentoFilaPesquisaDomain');
    if (id === './pagamentoFilaComprovanteDomain') return require('../src/services/pagamentoFilaComprovanteDomain');
    if (id === './instrucaoFinanceiraFavorecidoService') return { anexarInstrucoes: async () => {} };
    if (id === './pagamentoFilaDestinatarioService') return { anexarDestinatarios: async () => {} };
    if (id === './recebimentoDpConsultaService') return { anexarRecebimentosDp: async () => {} };
    if (id === './authorizationService') return { getFinanceiroObraScopeIds: async () => null };
    if (id === './tituloCompartilhadoLeitura') return { anexarParticipacoes: async () => {} };
    return {};
  }
});
(async () => {
  contagemSimulada = 100;
  await mod.exports.listarFilaPagamentos({ user: { id: 1 } }, { pagina: 1, limite: 50,
    obra_id: 3, solicitacao_id: 10, titulo_id: 200, forma_pagamento_id: 4, favorecido: "Nome d'Teste", vencimento_de: '2026-10-01', vencimento_ate: '2026-10-31' });
  const pesquisa = sqls.join('\n');
  const listaPesquisa = sqls.find(sql => sql.includes('LIMIT 0, 50'));
  assert(listaPesquisa, 'Consulta paginada real com o novo recorte');
  assert(listaPesquisa.indexOf('data_vencimento_prevista') < listaPesquisa.lastIndexOf('LIMIT 0, 50'));
  for (const trecho of ['`titulo`.`id` = 200', '`titulo`.`forma_pagamento_id` = 4', 'tc.obra_id IN (3)',
    'tc.solicitacao_id IN (10)', 'data_vencimento_prevista', '2026-10-31', 'solicitacoes_favorecidos', 'cm.solicitacao_id = `titulo`.solicitacao_id']) assert(pesquisa.includes(trecho), trecho);
  sqls.length = 0;
  contagemSimulada = 0;
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
  assert(!autorizacoes.some(([tipo]) => tipo === 'lista'), 'Pendentes nao materializam historico de autorizacoes');
  for (const [, o] of autorizacoes) {
    assert(o.where[SequelizeLib.Op.and].some(l => l.val.includes('NOT EXISTS') && l.val.includes('id >')),
      'Rejeicao precisa ser a ultima decisao, nao uma rejeicao antiga');
  }
  sqls.length = 0;
  await mod.exports.listarFilaPagamentos({ user: { id: 1 } }, { status: 'PENDENTE' });
  assert(sqls.every(sql => !sql.includes('JSON_TABLE')), 'Exibicao sem filtro nao expande JSON por titulo');
  const report = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/rhTitulosEnviadosRelatorioService.js'), 'utf8'), {
    module: report, console, require(id) {
      if (id === '../models') return models;
      if (id === 'sequelize') return SequelizeLib;
      if (id === './authorizationService') return { canViewRhDpDashboard: async () => true,
        userHasAreaPermission: async () => true, getRhDpObraScopeIds: async () => [7] };
      if (id === './pagamentoFilaFiltrosDomain') return filtros;
      if (id === './pagamentoFilaPesquisaDomain') return require('../src/services/pagamentoFilaPesquisaDomain');
      if (id === '../middlewares/validation') return require('../src/middlewares/validation');
      if (id === './recebimentoDpConsultaService') return { anexarRecebimentosDp: async () => {} };
      throw Error('Dependencia nao isolada: ' + id);
    }
  });
  sqls.length = 0;
  await report.exports.consultar({ user: { id: 1 } }, { empresa_id: 3, obra_id: 7, competencia: '2026-10',
    recebimento_dp: 'DINHEIRO', status_fila: 'PENDENTE', q: "Ana_%'", pagina: 2 });
  assert(sqls.every(sql => sql.includes('`TituloFinanceiro`.`obra_id` IN (7)')), 'Escopo em TODAS as consultas do relatorio');
  assert(!sqls[0].includes('JSON_TABLE') && !sqls[0].includes('instrumento_pagamento_json'), 'Universo leve nao expande snapshots/historico');
  const pagina = sqls.find(sql => sql.includes('LIMIT 0, 50'));
  assert(pagina); assert(pagina.includes('JSON_TABLE')); assert(pagina.includes('DATE_FORMAT'));
  assert(pagina.includes('`TituloFinanceiro`.`empresa_id` = 3')); assert(pagina.includes('ORDER BY f.id DESC LIMIT 1'));
  assert(!pagina.slice(0, pagina.indexOf(' FROM ')).includes('JSON_TABLE'), 'Recebimento nao e subconsulta de projecao');
  contagemSimulada = 650;
  for (const status of ['PENDENTE', 'PENDENTE_COMPROVANTE', 'NAO_PAGO', 'DIVERGENTE', 'EM_EDICAO', 'BAIXADO', 'RESOLVIDO', 'TODOS']) {
    sqls.length = 0;
    const r = await mod.exports.listarFilaPagamentos({ user: { id: 1 } }, { status, pagina: 12, limite: 50, q: "Ana_%'" });
    assert.equal(r.total, 650); assert.equal(r.total_paginas, 13); assert.equal(r.pagina, 12);
    const lista = sqls.find(s => s.includes('LIMIT 550, 50'));
    assert(lista, status + ': pagina posterior ao antigo limite de 500 continua acessivel');
    assert(lista.includes('LOWER(COALESCE(`titulo->parceiro`.nome'), 'Busca antes da paginacao');
    assert(!lista.includes('LEFT OUTER JOIN `pagamentos_manuais_fila_comprovantes`'), 'Comprovantes 1:N nao multiplicam as linhas da pagina');
  }
  for (const q of [{pagina:-1},{limite:101},{fila_ids:'1,2 OR 1=1'},{fila_ids:'-7'},{fila_ids:Array.from({length:101},(_,i)=>i+1).join(',')}]) assert.throws(()=>validateManualPaymentQueueQuery(q));
  const selecionados=validateManualPaymentQueueQuery({pagina:1,limite:100,fila_ids:'1,51,1'});
  assert.deepEqual(selecionados.fila_ids,[1,51]);
  sqls.length=0; await mod.exports.listarFilaPagamentos({user:{id:1}},selecionados);
  assert(sqls.some(s=>s.includes('`PagamentoManualFilaItem`.`id` IN (1, 51)')),'Revalidacao limitada aos IDs escolhidos');
  console.log('Fila filtros: SQL MySQL real gerado, filtros antes do limite, totais/catalogos, snapshot RH vinculado por titulo/empresa e negativas de query; sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
