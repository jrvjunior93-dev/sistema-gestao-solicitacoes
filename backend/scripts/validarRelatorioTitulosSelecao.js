const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { Op } = require('sequelize');
const { validateRequest } = require('../src/middlewares/validation');
const { validateFinanceTituloQuery, validateFinanceTituloRelatorioBody } = require('../src/validators/financialValidators');
const { resolverPermissoesRotaFinanceira } = require('../src/services/financeiroRotaPermissoesService');
const { resolveTituloStatusFilters } = require('../src/utils/tituloFinanceiroStatusFilter');

// Funcao real de listagem e controller real; apenas models, acesso e PDF em memoria.
const rows = [
  { id: 1, obra_id: 10, tipo: 'PAGAR', status: 'ABERTO' },
  { id: 2, obra_id: 10, tipo: 'PAGAR', status: 'ABERTO' },
  { id: 3, obra_id: 20, tipo: 'PAGAR', status: 'ABERTO' },
  { id: 4, obra_id: 10, tipo: 'RECEBER', status: 'ABERTO' },
  { id: 5, obra_id: 10, tipo: 'PAGAR', status: 'QUITADO' }
];
const queries = [], reports = [];
let scope = [10], allow = true;
function matches(row, where) {
  return Reflect.ownKeys(where).every(key => {
    const value = where[key];
    if (key === Op.and) return value.every(item => typeof item === 'string' || matches(row, item));
    if (key === Op.or) return value.some(item => matches(row, item));
    return value && typeof value === 'object' && value[Op.in]
      ? value[Op.in].includes(row[key]) : row[key] === value;
  });
}
const context = {
  Op, Number, Set,
  assertFinanceAccess: async () => { if (!allow) throw Object.assign(new Error('Sem acesso'), { statusCode: 403 }); },
  getFinanceiroObraScopeIds: async () => scope,
  assertObraScope: async () => { throw Object.assign(new Error('Obra fora do escopo'), { statusCode: 403 }); },
  createHttpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }),
  parseCurrencyFilter: () => null,
  resolveTituloStatusFilters,
  buildTituloInclude: () => [],
  sequelize: { literal: value => value, col: value => value },
  TituloFinanceiro: { async findAndCountAll(options) {
    queries.push(options);
    const data = rows.filter(row => matches(row, options.where));
    return { rows: data, count: data.length };
  }, async findAll(options) { queries.push(options); return rows.filter(row => matches(row, options.where)); } },
  require: name => {
    assert.equal(name, './tituloRenegociacaoLeitura');
    return { whereRateado: where => where };
  }
};
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/tituloFinanceiroService.js'), 'utf8');
const listing = source.slice(source.indexOf('async function listarTitulos('), source.indexOf('async function listarBaixasRealizadas('));
const listarTitulos = vm.runInNewContext(`${listing}; listarTitulos`, context);
const controllerPath = path.resolve(__dirname, '../src/controllers/TituloFinanceiroController.js');
const controllerModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(controllerPath, 'utf8'), {
  module: controllerModule, exports: controllerModule.exports, Buffer,
  console: { error() {} },
  require(name) {
    if (name === '../services/tituloFinanceiroService') return { listarTitulos };
    if (name === '../validators/financialValidators') return { validateFinanceTituloRelatorioBody };
    if (name === '../services/tituloFinanceiroRelatorioPdfService') return {
      gerarRelatorioTitulosFinanceirosPdf: async data => {
        reports.push(data);
        return Buffer.from(`%PDF-QA:${data.titulos.map(titulo => titulo.id).join(',')}`);
      }
    };
    if (name === '../services/authorizationService') return {};
    if (name === '../utils/controllerError') return {
      responderErroController: (res, error) => res.status(error.statusCode || 500).json({ error: error.message })
    };
    throw new Error(`Dependencia nao permitida: ${name}`);
  }
}, { filename: controllerPath });

async function main() {
  for (const titulo_ids of [undefined, [], '1,2', [0], [-1], [1.5], [[1]], [{}], [true], [null], ['1 OR 1=1'], [Number.MAX_SAFE_INTEGER + 1], Array(5001).fill(1)]) {
    assert.throws(() => validateFinanceTituloRelatorioBody({ titulo_ids }), { name: 'ValidationError' });
  }
  assert.throws(() => validateFinanceTituloRelatorioBody({ titulo_ids: [1], obra_id: 20 }));
  assert.deepEqual(validateFinanceTituloRelatorioBody({ titulo_ids: ['2', 2, 1] }).titulo_ids, [2, 1]);
  for (const method of ['GET', 'POST']) {
    assert.deepEqual(resolverPermissoesRotaFinanceira({ method, path: '/financeiro/titulos/relatorio.pdf' }), ['financeiro.titulos.exportar']);
  }
  // Relatorio por POST e consulta; baixas por POST continuam bloqueadas por prazo.
  const controleModule = { exports: {} };
  let avaliacoes = 0;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/middlewares/controlePrazosOperacionais.js'), 'utf8'), {
    module: controleModule, console,
    require(name) {
      if (name === '../services/prazosOperacionaisService') return { estado: async () => {
        avaliacoes++; return { obras: [{ id: 10, bloqueada: true }] };
      } };
      if (name === '../services/prazosOperacionaisRotaService') return {
        MODULOS_OBRA: /^\/financeiro/, CADASTROS_GLOBAIS: /^\/cadastros/,
        regularizacao: () => false, FORMULARIOS_OBRA: new Set(), obrasDaOperacao: async () => [10]
      };
      if (name === '../services/avisoPendenciasEntregaService') return require('../src/services/avisoPendenciasEntregaService');
      throw new Error(`Dependencia nao permitida: ${name}`);
    }
  });
  for (const [method, rota, esperado] of [
    ['GET', '/financeiro/titulos/relatorio.pdf', 200],
    ['POST', '/financeiro/titulos/relatorio.pdf', 200],
    ['POST', '/financeiro/titulos/relatorio.pdf/', 200],
    ['POST', '/financeiro/titulos/1/baixa', 423],
    ['DELETE', '/financeiro/titulos/relatorio.pdf', 423]
  ]) {
    let resultado;
    await controleModule.exports({ method, path: rota, user: {} }, {
      status(code) { resultado = code; return this; }, json() {}
    }, () => { resultado = 200; });
    assert.equal(resultado, esperado);
  }
  assert.equal(avaliacoes, 2, 'Consultas nao executam controle de escritas');
  const app = express(); app.use(express.json());
  const router = app;
  const allowFinanceiro = (req, res, next) => {
    req.user = { id: 7 };
    assert.deepEqual(resolverPermissoesRotaFinanceira(req), ['financeiro.titulos.exportar']);
    return req.headers['x-exportar'] === 'sim' ? next() : res.sendStatus(403);
  };
  const TituloFinanceiroController = controllerModule.exports;
  const routeSource = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  const declarations = routeSource.split('\n').filter(line => /^router\.(get|post)\('\/financeiro\/titulos\/relatorio\.pdf'/.test(line));
  assert.equal(declarations.length, 2);
  vm.runInNewContext(declarations.join('\n'), { router, allowFinanceiro, validateRequest,
    validateFinanceTituloQuery, validateFinanceTituloRelatorioBody, TituloFinanceiroController });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/financeiro/titulos/relatorio.pdf?tipo=PAGAR&status=ABERTO`;
  async function request(ids, exportar = true, suffix = '') {
    const response = await fetch(url + suffix, { method: ids === null ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-exportar': exportar ? 'sim' : 'nao' },
      ...(ids === null ? {} : { body: JSON.stringify({ titulo_ids: ids }) }) });
    return { response, text: await response.text() };
  }
  try {
    let result = await request([2]); assert.equal(result.response.status, 200); assert.equal(result.text, '%PDF-QA:2');
    assert.deepEqual(Array.from(queries.at(-1).where.id[Op.in]), [2]);
    assert.deepEqual(Array.from(queries.at(-1).where.obra_id[Op.in]), [10]);
    result = await request(null); assert.equal(result.text, '%PDF-QA:1,2'); assert.equal(queries.at(-1).where.id, undefined);
    result = await request([2, 1, 2]); assert.equal(result.text, '%PDF-QA:1,2');
    const before = reports.length;
    for (const ids of [[3], [1, 3], [4], [5], [999]]) {
      result = await request(ids); assert.equal(result.response.status, 409, 'Sem PDF parcial ou titulo nao autorizado');
    }
    result = await request([1], true, '&obra_id=20'); assert.equal(result.response.status, 403);
    result = await request([], true); assert.equal(result.response.status, 400);
    result = await request([1], false); assert.equal(result.response.status, 403);
    assert.equal(reports.length, before, 'Falhas nao geram PDF');
    scope = []; result = await request([1]); assert.equal(result.response.status, 409);
    result = await request(null); assert.equal(result.text, '%PDF-QA:');
    scope = null; result = await request([3]); assert.equal(result.text, '%PDF-QA:3');
    allow = false; result = await request([1]); assert.equal(result.response.status, 403);
    allow = true;
    await assert.rejects(listarTitulos({ user: {} }, {}, { tituloIds: [] }), { statusCode: 400 });
    console.log('Relatorio selecionado: GET filtrado, POST por IDs, validacao, permissao exportar, intersecao com filtros/obras, IDs fora do escopo e ausencia de fallback validados. Sem banco.');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
