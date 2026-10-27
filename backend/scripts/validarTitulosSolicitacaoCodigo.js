'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { Sequelize, Op } = require('sequelize');
const { filtroSolicitacaoCodigo } = require('../src/services/tituloSolicitacaoCodigoFiltro');
const { validateFinanceTituloQuery: validate } = require('../src/validators/financialValidators');
const { resolveTituloStatusFilters } = require('../src/utils/tituloFinanceiroStatusFilter');

test('codigo exibido validado separadamente do ID interno', () => {
  assert.equal(validate({ solicitacao_codigo: ' SOL-650 ' }).solicitacao_codigo, 'SOL-650');
  assert.equal(validate({ solicitacao_codigo: '650', solicitacao_id: '999' }).solicitacao_id, 999);
  for (const value of ['a'.repeat(41), {}, []]) assert.throws(() => validate({ solicitacao_codigo: value }));
  assert.throws(() => validate({ solicitacao_codigo: '650', sql: 'SELECT' }));
});

test('listagem real: filtro antes COUNT/LIMIT, ACL e origens diretas/compartilhadas/negociadas', async () => {
  const sqlDb = new DatabaseSync(':memory:');
  const sequelize = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
  const queries = []; let allow = true, scope = [10];
  sqlDb.function('regexp', (pattern, text) => new RegExp(pattern).test(String(text || '')) ? 1 : 0);
  sqlDb.exec(`CREATE TABLE solicitacoes(id INTEGER,codigo TEXT);
    CREATE TABLE titulos_financeiros(id INTEGER,solicitacao_id INTEGER,obra_id INTEGER,tipo TEXT,status TEXT,data_vencimento TEXT,createdAt TEXT);
    CREATE TABLE titulos_compartilhados_origens(titulo_financeiro_id INTEGER,solicitacao_id INTEGER,obra_id INTEGER);
    CREATE TABLE titulo_renegociacao_alocacoes(titulo_destino_id INTEGER,solicitacao_id INTEGER,obra_id INTEGER);
    INSERT INTO solicitacoes VALUES(999,'SOL-00650'),(650,'SOL-999'),(700,'SOL-1650');
    INSERT INTO titulos_financeiros VALUES
      (601,999,10,'PAGAR','ABERTO','2026-10-27','2026-10-27'),
      (602,NULL,10,'PAGAR','ABERTO','2026-10-27','2026-10-27'),
      (603,NULL,10,'PAGAR','ABERTO','2026-10-27','2026-10-27'),
      (604,999,20,'PAGAR','ABERTO','2026-10-27','2026-10-27'),
      (605,999,10,'RECEBER','ABERTO','2026-10-27','2026-10-27'),
      (606,650,10,'PAGAR','ABERTO','2026-10-27','2026-10-27'),
      (607,700,10,'PAGAR','ABERTO','2026-10-27','2026-10-27'),
      (608,999,10,'PAGAR','QUITADO','2026-10-27','2026-10-27'),
      (609,999,10,'PAGAR','ABERTO','2026-10-27','2026-10-27');
    INSERT INTO titulos_compartilhados_origens VALUES(602,999,10),(602,999,10),(609,999,20);
    INSERT INTO titulo_renegociacao_alocacoes VALUES(603,999,10);`);
  const insert = sqlDb.prepare("INSERT INTO titulos_financeiros VALUES(?,650,10,'PAGAR','ABERTO','2026-10-27','2026-10-27')");
  for (let i = 1; i <= 600; i++) insert.run(i);
  const shared = require('../src/services/tituloCompartilhadoLeitura');
  const renegSource = fs.readFileSync(path.resolve(__dirname, '../src/services/tituloRenegociacaoLeitura.js'), 'utf8');
  const whereRateado = vm.runInNewContext(renegSource.slice(renegSource.indexOf('function idsCondicao'), renegSource.indexOf('\nconst campos=')) + ';whereRateado', {
    Op, literal: sequelize.literal.bind(sequelize), require: () => shared
  });
  function select(options, count = false) {
    const where = sequelize.getQueryInterface().queryGenerator.whereQuery(options.where);
    const sql = `SELECT ${count ? 'COUNT(*) AS n' : 'TituloFinanceiro.id'} FROM titulos_financeiros AS TituloFinanceiro ${where}`
      + (count ? '' : ` ORDER BY TituloFinanceiro.id${options.limit ? ` LIMIT ${options.limit} OFFSET ${options.offset}` : ''}`);
    queries.push(sql); assert.match(sql, /^SELECT /);
    return sqlDb.prepare(sql.replace(/\\'/g, "''")).all();
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/tituloFinanceiroService.js'), 'utf8');
  const context = { Op, sequelize, resolveTituloStatusFilters,
    assertFinanceAccess: async () => { if (!allow) throw Object.assign(new Error('Sem acesso'), { statusCode: 403 }); },
    getFinanceiroObraScopeIds: async () => scope,
    assertObraScope: async () => { throw Object.assign(new Error('Obra negada'), { statusCode: 403 }); },
    createHttpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }),
    parseCurrencyFilter: () => null, buildTituloInclude: () => [],
    TituloFinanceiro: { findAndCountAll: async options => ({ count: Number(select(options, true)[0].n), rows: select(options) }), findAll: async options => select(options) },
    require(name) {
      if (name === './tituloSolicitacaoCodigoFiltro') return { filtroSolicitacaoCodigo };
      if (name === './tituloRenegociacaoLeitura') return { whereRateado };
      if (name === './tituloCompartilhadoLeitura') return { ...shared, anexarParticipacoes: async rows => rows };
      if (name === './tituloFormaPrevistaLeitura') return { anexarFormasPrevistasContratos: async rows => rows };
      throw new Error(name);
    }
  };
  const listar = vm.runInNewContext(source.slice(source.indexOf('async function listarTitulos('), source.indexOf('async function listarBaixasRealizadas(')) + ';listarTitulos', context);
  try {
    for (const codigo of ['650', '000650', 'sol-650', 'SOL-00650']) {
      const result = await listar({ user: {} }, validate({ tipo: 'PAGAR', status: 'ABERTO', solicitacao_codigo: codigo, paginated: '1', limit: '2', page: '1' }));
      assert.equal(result.pagination.total, 3); assert.deepEqual(result.data.map(r => r.id), [601, 602]);
    }
    const base = { tipo: 'PAGAR', status: 'ABERTO', solicitacao_codigo: '650', paginated: true, limit: '2', page: 2 };
    assert.deepEqual((await listar({ user: {} }, base)).data.map(r => r.id), [603]);
    assert.deepEqual((await listar({ user: {} }, { ...base, tipo: 'RECEBER', page: 1 })).data.map(r => r.id), [605]);
    assert.equal((await listar({ user: {} }, { ...base, solicitacao_id: 650 })).pagination.total, 0);
    assert.equal((await listar({ user: {} }, { ...base, solicitacao_codigo: "650' OR 1=1 --" })).pagination.total, 0);
    assert.equal((await listar({ user: {} }, { ...base, solicitacao_codigo: '%' })).pagination.total, 0);
    assert.deepEqual((await listar({ user: {} }, { ...base, paginated: false, page: 1 })).map(r => r.id), [601, 602, 603]);
    await assert.rejects(listar({ user: {} }, { ...base, obra_id: 20 }), { statusCode: 403 });
    scope = []; assert.equal((await listar({ user: {} }, base)).pagination.total, 0);
    scope = null; assert.equal((await listar({ user: {} }, { ...base, page: 1 })).pagination.total, 5);
    allow = false; await assert.rejects(listar({ user: {} }, base), { statusCode: 403 });
    assert(queries.some(q => q.includes('COUNT(*)') && q.includes('REGEXP') && !q.includes(' LIMIT ')));
  } finally { sqlDb.close(); await sequelize.close(); }
});
