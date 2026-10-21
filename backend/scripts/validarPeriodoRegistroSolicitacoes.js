'use strict';
// Exercita validacao e predicado existentes do controller, sem carregar DB/env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8');
const validation = source.slice(source.indexOf('function isDataIsoConsultaValida('), source.indexOf('async function montarResumoSolicitacoesLista('));
const index = source.indexOf('async index(req, res)');
const start = source.indexOf('      if (data_registro) {', index);
const end = source.indexOf('      const isDataIsoValida =', start);
assert(start > source.indexOf('const escopo = await montarEscopoVisibilidadeLista(req', index));
assert(end > start);
const predicate = source.slice(start, end);
const { Op } = require('sequelize');
function consultar(query) {
  const ctx = { ...query, data_registro: query.data_registro || '', data_inicio: query.data_inicio || '',
    data_fim: query.data_fim || '', where: { escopo: 'PRESERVADO' }, Op };
  vm.createContext(ctx);
  vm.runInContext(validation + '\nresultadoErro=validarDatasConsultaSolicitacoes(' + JSON.stringify(query) + ');', ctx);
  if (ctx.resultadoErro) return { erro: ctx.resultadoErro };
  vm.runInContext(predicate, ctx);
  return ctx.where;
}
const dias = ['2026-09-30T23:59:59.999', '2026-10-01T00:00:00', '2026-10-02T12:00:00',
  '2026-10-02T23:59:59.999', '2026-10-03T00:00:00'];
const filtrar = query => {
  const where = consultar(query); assert.equal(where.escopo, 'PRESERVADO');
  return dias.filter(d => (!where.createdAt?.[Op.gte] || new Date(d) >= where.createdAt[Op.gte]) &&
    (!where.createdAt?.[Op.lte] || new Date(d) <= where.createdAt[Op.lte]));
};
for (const tz of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland']) {
  process.env.TZ = tz;
  assert.deepEqual(filtrar({ data_inicio: '2026-10-01', data_fim: '2026-10-02' }), dias.slice(1, 4));
  assert.deepEqual(filtrar({ data_inicio: '2026-10-02' }), dias.slice(2));
  assert.deepEqual(filtrar({ data_fim: '2026-10-01' }), dias.slice(0, 2));
  assert.deepEqual(filtrar({ data_inicio: '2026-10-02', data_fim: '2026-10-02' }), dias.slice(2, 4));
  assert.deepEqual(filtrar({ data_registro: '2026-10-02' }), dias.slice(2, 4));
  assert.deepEqual(filtrar({}), dias);
}
for (const q of [{ data_inicio: '2026-02-30' }, { data_fim: '2026-13-01' },
  { data_inicio: '0226-01-01' }, { data_inicio: '2026-10-02', data_fim: '2026-10-01' },
  { data_fim: '2026-10-02 OR 1=1' }]) assert(consultar(q).erro);
console.log('OK: controller existente filtra createdAt inclusivo, pontas independentes, dia unico/legado/todo periodo e rejeita datas invalidas/invertidas, UTC/BR/NZ. Predicado aditivo ao escopo. Sem DB/env/rede.');
