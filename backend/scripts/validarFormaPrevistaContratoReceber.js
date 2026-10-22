'use strict';
// Listagem real/controller/validador em memoria e SQL MySQL offline. Sem env/DB/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op, Sequelize, DataTypes } = require('sequelize');
const leitura = require('../src/services/tituloFormaPrevistaLeitura');
const { resolveTituloStatusFilters } = require('../src/utils/tituloFinanceiroStatusFilter');
const { validateFinanceTituloQuery } = require('../src/validators/financialValidators');
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/tituloFinanceiroService.js'), 'utf8');
const listing = source.slice(source.indexOf('async function listarTitulos('), source.indexOf('async function listarBaixasRealizadas('));
const titulo = (id, extra = {}) => ({ id, tipo: 'RECEBER', origem_titulo: 'COMERCIAL', obra_id: 10,
  forma_pagamento_id: null, formaPagamento: null, valor_original: '100.00', valor_baixado: '0.00',
  valor_saldo: '100.00', status: 'ABERTO', ...extra });
const store = [titulo(1), titulo(2, { status: 'PARCIAL', valor_baixado: '30.00', valor_saldo: '70.00' }),
  titulo(3, { obra_id: 20 }), titulo(4, { forma_pagamento_id: 9, formaPagamento: { id: 9, nome: 'Forma explicita', codigo: 'PIX' } }),
  titulo(5, { tipo: 'PAGAR' }), titulo(6, { origem_titulo: 'MANUAL' }), titulo(7),
  titulo(8, { status: 'QUITADO', valor_baixado: '100.00', valor_saldo: '0.00' })];
const parcelas = [{ titulo_financeiro_id: 1, forma_recebimento_prevista: 'CHEQUE' },
  { titulo_financeiro_id: 1, forma_recebimento_prevista: ' cheque ' },
  { titulo_financeiro_id: 2, forma_recebimento_prevista: 'BOLETO' },
  { titulo_financeiro_id: 2, forma_recebimento_prevista: 'PIX' },
  { titulo_financeiro_id: 3, forma_recebimento_prevista: 'BENS' },
  { titulo_financeiro_id: 4, forma_recebimento_prevista: 'CHEQUE' },
  { titulo_financeiro_id: 5, forma_recebimento_prevista: 'BOLETO' },
  { titulo_financeiro_id: 6, forma_recebimento_prevista: 'OUTROS' },
  { titulo_financeiro_id: 8, forma_recebimento_prevista: 'CHEQUE' },
  { titulo_financeiro_id: null, forma_recebimento_prevista: 'PIX' }];
const snapshot = JSON.stringify({ store, parcelas });
let scope = [10], allow = true, fail = false;
const consultas = [], consultasParcelas = [];
const parcelasModel = { async findAll(options) {
  consultasParcelas.push(options);
  assert.deepEqual(options.attributes, ['titulo_financeiro_id', 'forma_recebimento_prevista']);
  assert.equal(options.raw, true);
  assert.equal(options.include, undefined);
  if (fail) throw Error('Falha de leitura simulada');
  return parcelas.filter(p => options.where.titulo_financeiro_id[Op.in].includes(p.titulo_financeiro_id));
} };
function matches(row, where) {
  return Reflect.ownKeys(where).every(key => {
    const value = where[key];
    if (key === Op.and) return value.every(v => typeof v === 'string' || matches(row, v));
    if (key === Op.or) return value.some(v => matches(row, v));
    return value && typeof value === 'object' && value[Op.in] ? value[Op.in].includes(row[key]) : row[key] === value;
  });
}
const context = {
  Op, assertFinanceAccess: async () => { if (!allow) throw Object.assign(Error('Sem permissao financeira'), { statusCode: 403 }); },
  getFinanceiroObraScopeIds: async () => scope,
  assertObraScope: async () => { throw Object.assign(Error('Fora do escopo'), { statusCode: 403 }); },
  createHttpError: (statusCode, message) => Object.assign(Error(message), { statusCode }),
  parseCurrencyFilter: () => null, resolveTituloStatusFilters, buildTituloInclude: () => [],
  sequelize: { literal: s => s, col: s => s },
  TituloFinanceiro: {
    async findAndCountAll(options) {
      consultas.push(options);
      const rows = store.filter(t => matches(t, options.where));
      const page = options.limit ? rows.slice(options.offset, options.offset + options.limit) : rows;
      return { rows: structuredClone(page), count: rows.length };
    },
    async findAll(options) { consultas.push(options); return structuredClone(store.filter(t => matches(t, options.where))); }
  },
  require(name) {
    if (name === './tituloRenegociacaoLeitura') return { whereRateado: where => where };
    if (name === './tituloCompartilhadoLeitura') return { escopoCompletoSql: () => 'escopo preservado', anexarParticipacoes: async rows => rows };
    if (name === './tituloFormaPrevistaLeitura') return {
      anexarFormasPrevistasContratos: rows => leitura.anexarFormasPrevistasContratos(rows, { parcelasModel })
    };
    throw Error(`Dependencia nao permitida: ${name}`);
  }
};
const listarTitulos = vm.runInNewContext(`${listing}; listarTitulos`, context);
const req = { user: { id: 1 } };
function formas(row) { return Array.from(row.formas_recebimento_previstas_contrato || []); }
async function main() {
  let r = await listarTitulos(req, { tipo: 'RECEBER', paginated: '1', limit: '1', page: '1' });
  assert.equal(r.pagination.total, 6); assert.equal(r.pagination.total_pages, 6);
  assert.deepEqual(Array.from(r.data, t => t.id), [1]); assert.deepEqual(formas(r.data[0]), ['CHEQUE']);
  assert.deepEqual(consultasParcelas.at(-1).where.titulo_financeiro_id[Op.in], [1], 'So os IDs da pagina, nunca toda a carteira');
  assert.equal(consultas.at(-1).distinct, true); assert.equal(consultas.at(-1).include.length, 0);
  r = await listarTitulos(req, { tipo: 'RECEBER', paginated: '1', limit: '1', page: '2' });
  assert.deepEqual(formas(r.data[0]), ['BOLETO', 'PIX']); assert.equal(r.data[0].status, 'PARCIAL');
  assert.equal(r.data[0].valor_baixado, '30.00'); assert.equal(r.data[0].forma_pagamento_id, null);
  r = await listarTitulos(req, { tipo: 'RECEBER', paginated: '1', limit: 'all' });
  assert.equal(r.data.length, 6); assert.equal(r.pagination.total, 6);
  assert.deepEqual(r.data.find(t => t.id === 4).formaPagamento, store[3].formaPagamento);
  assert.equal(r.data.find(t => t.id === 4).formas_recebimento_previstas_contrato, undefined);
  assert.equal(r.data.find(t => t.id === 6).formas_recebimento_previstas_contrato, undefined);
  assert.deepEqual(formas(r.data.find(t => t.id === 7)), []);
  assert.deepEqual(formas(r.data.find(t => t.id === 8)), ['CHEQUE']);
  assert.deepEqual(consultasParcelas.at(-1).where.titulo_financeiro_id[Op.in], [1, 2, 7, 8]);
  const qtdAntes = consultasParcelas.length;
  r = await listarTitulos(req, { tipo: 'PAGAR' }); assert.equal(r.length, 1);
  assert.equal(consultasParcelas.length, qtdAntes, 'PAGAR nao consulta contratos');
  r = await listarTitulos(req, { tipo: 'RECEBER' }, { tituloIds: [2] });
  assert.deepEqual(Array.from(r, t => t.id), [2]); assert.deepEqual(formas(r[0]), ['BOLETO', 'PIX']);
  assert.equal(consultasParcelas.length, qtdAntes + 1);
  const semAcessoAntes = consultas.length, parcelasAntes = consultasParcelas.length;
  await assert.rejects(listarTitulos(req, { tipo: 'RECEBER', obra_id: '20' }), e => e.statusCode === 403);
  allow = false; await assert.rejects(listarTitulos(req, {}), e => e.statusCode === 403); allow = true;
  scope = []; r = await listarTitulos(req, { paginated: '1' }); assert.equal(r.data.length, 0);
  assert.equal(consultas.length, semAcessoAntes); assert.equal(consultasParcelas.length, parcelasAntes);
  scope = [10];
  fail = true; await assert.rejects(listarTitulos(req, { tipo: 'RECEBER' }), /Falha de leitura simulada/); fail = false;
  scope = null; r = await listarTitulos(req, { tipo: 'RECEBER' }); assert.deepEqual(formas(r.find(t => t.id === 3)), ['BENS']);
  assert.equal(JSON.stringify({ store, parcelas }), snapshot, 'Persistencia/valores/status/baixas/formas intocados');

  // Colecao grande: consultas limitadas a500 IDs, sem N+1 ou linhas duplicadas.
  const grande = Array.from({ length: 1001 }, (_, i) => titulo(100 + i)); const lotes = [];
  const retorno = await leitura.anexarFormasPrevistasContratos(grande, { parcelasModel: { async findAll(o) {
    const ids = o.where.titulo_financeiro_id[Op.in]; lotes.push(ids);
    return ids.map(id => ({ titulo_financeiro_id: id, forma_recebimento_prevista: 'PIX' }));
  } } });
  assert.equal(retorno.length, 1001); assert.deepEqual(lotes.map(l => l.length), [500, 500, 1]);
  assert(retorno.every(t => formas(t).join() === 'PIX' && t.valor_saldo === '100.00'));
  for (const id of [0, -1, '1 OR 1=1', null, Number.MAX_SAFE_INTEGER + 1]) {
    await leitura.anexarFormasPrevistasContratos([titulo(id)], { parcelasModel: { findAll() { assert.fail('ID invalido nao consulta'); } } });
  }

  // Sequelize real gera SELECT com filtro tipado no modelo existente, sem conexao.
  const orm = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
  const Parcela = require('../src/models/ContratoComercialParcela')(orm, DataTypes);
  const Titulo = require('../src/models/TituloFinanceiro')(orm, DataTypes);
  const sql = []; orm.query = async query => { sql.push(query); return [{ titulo_financeiro_id: 1, forma_recebimento_prevista: 'CHEQUE' }]; };
  const modelTitulo = Titulo.build(titulo(1), { isNewRecord: false, raw: true });
  await leitura.anexarFormasPrevistasContratos([modelTitulo], { parcelasModel: Parcela });
  assert.deepEqual(modelTitulo.toJSON().formas_recebimento_previstas_contrato, ['CHEQUE']);
  assert.equal(modelTitulo.forma_pagamento_id, null);
  assert.equal(modelTitulo.toJSON().valor_original, '100.00');
  assert(sql[0].startsWith('SELECT ')); assert(sql[0].includes('`contratos_comerciais_parcelas`'));
  assert(sql[0].includes('`titulo_financeiro_id` IN (1)')); assert(!/JOIN|UPDATE|INSERT|DELETE/i.test(sql[0]));
  const query = validateFinanceTituloQuery({ tipo: 'RECEBER', paginated: '1' });
  assert.equal(query.tipo, 'RECEBER');
  assert.throws(() => validateFinanceTituloQuery({ tipo: 'RECEBER', formas_recebimento_previstas_contrato: ['PIX'] }));
  const route = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  assert(route.includes("router.get('/financeiro/titulos', allowFinanceiro, validateRequest({ query: validateFinanceTituloQuery }), TituloFinanceiroController.index)"));
  console.log('Forma prevista: listagem real paginada/legada/selecao, escopo/403, prioridade explicita, multiplas/ausentes/parcial/quitado, lote500/sem N+1, Sequelize/SQL MySQL offline e serializacao aprovados. Sem escrita/DB/rede.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
