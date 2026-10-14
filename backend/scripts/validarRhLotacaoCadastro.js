'use strict';
// Services reais em memoria, sem .env, banco, rede ou atualizacao de negocio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const validation = require('../src/middlewares/validation');
const validators = require('../src/validators/rhValidators');
const domain = require('../src/services/rhPessoalDomain');
const plain = x => JSON.parse(JSON.stringify(x));
const instance = d => ({ ...d, get() { return plain(this); }, async update(p, o) { assert.ok(o.transaction); Object.assign(this, p); return this; } });
function load(file, deps) {
  const ctx = { module: { exports: {} }, console, Date, process: { env: {} },
    require(k) { if (k in deps) return deps[k]; throw new Error('Dependencia nao simulada: ' + k); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services', file), 'utf8'), ctx); return ctx.module.exports;
}
const person = instance({ id: 218, nome: 'Lotacao QA', obra_id: 1, status: 'ATIVO', data_admissao: '2020-01-01' });
const vinculos = [instance({ id: 1, colaborador_id: 218, obra_id: 1, vigencia_inicio: '2020-01-01', vigencia_fim: null })];
const tx = { LOCK: { UPDATE: 'UPDATE' } }; let tail = Promise.resolve(), pendente = false;
const models = {
  sequelize: { async transaction(fn) { const prev = tail; let release; tail = new Promise(ok => { release = ok; }); await prev;
    const before = plain(person), old = vinculos.map(plain);
    try { return await fn(tx); } catch (e) { Object.assign(person, before); vinculos.splice(0, vinculos.length, ...old.map(instance)); throw e; } finally { release(); } } },
  RhColaborador: { async findByPk(id, o) { assert.ok(o.transaction); return person; } },
  RhColaboradorVinculo: { async findOne() { return vinculos.find(v => !v.vigencia_fim); },
    async create(p, o) { assert.equal(o.transaction, tx); const v = instance({ id: vinculos.length + 1, ...p }); vinculos.push(v); return v; } },
  Obra: { async findByPk(id) { return Number(id) === 99 ? { id, ativo: false } : { id, ativo: true, tipo_centro_custo: 'CENTRO_CUSTO' }; } },
  RhSolicitacao: { async findOne() { return pendente ? { id: 9 } : null; } }
};
const vinculo = load('rhVinculoObraService.js', { sequelize: { Op }, '../models': models, '../middlewares/validation': validation, './rhPessoalDomain': domain });
const service = load('rhService.js', { sequelize: { Op }, '../models': models, '../utils/pix': require('../src/utils/pix'),
  '../middlewares/validation': validation, './rhColaboradorContatosDomain': require('../src/services/rhColaboradorContatosDomain'),
  './authorizationService': { isSuperadmin: u => u.perfil === 'SUPERADMIN' }, './rhVinculoObraService': vinculo,
  './rhCalculoHistoricoService': {}, './s3': {}, '../utils/fileName': {}, '../constants/empresaGrupo': {}, '../utils/excelWorkbook': {} });
(async () => {
  const admin = { id: 1, perfil: 'SUPERADMIN' };
  const body = { obra_id: 2, obra_vigencia_inicio: '2020-02-01', obra_motivo: 'Correcao da lotacao' };
  const payload = validators.validateRhColaboradorUpdateBody(body);
  for (const perfil of ['USUARIO', 'ADMIN', 'ADMINISTRADOR']) await assert.rejects(service.atualizarColaboradorRh(218, payload, { id: 2, perfil, area: 'DP' }), /nao e alterada/);
  for (const invalido of [{ ...body, obra_vigencia_inicio: '' }, { ...body, obra_motivo: '' },
    { ...body, obra_vigencia_inicio: '2020-02-31' }, { ...body, obra_vigencia_inicio: '2019-12-31' },
    { ...body, obra_vigencia_inicio: '2099-01-01' }, { ...body, obra_id: 99 }]) {
    await assert.rejects(service.atualizarColaboradorRh(218, invalido, admin)); assert.equal(person.obra_id, 1); assert.equal(vinculos.length, 1);
  }
  pendente = true; await assert.rejects(service.atualizarColaboradorRh(218, payload, admin), /transferencia pendente/); pendente = false;
  await assert.rejects(service.atualizarColaboradorRh(218, { ...payload, salario_base: 1000 }, admin), /vigencia e o motivo/);
  assert.equal(vinculos.length, 1, 'Erro posterior reverte lotacao'); assert.equal(person.obra_id, 1);
  await Promise.all([service.atualizarColaboradorRh(218, payload, admin), service.atualizarColaboradorRh(218, payload, admin)]);
  assert.equal(person.obra_id, 2); assert.equal(vinculos.length, 2); assert.equal(vinculos[0].vigencia_fim, '2020-01-31');
  assert.match(vinculos[1].observacoes, /local 1 -> 2/); assert.match(vinculos[1].observacoes, /usuario #1/);
  await service.atualizarColaboradorRh(218, { ...payload, obra_id: 3 }, admin);
  assert.equal(vinculos.length, 2); assert.equal(vinculos[1].vigencia_fim, null); assert.match(vinculos[1].observacoes, /local 2 -> 3/);
  await assert.rejects(service.atualizarColaboradorRh(218, { ...payload, obra_id: 4, obra_vigencia_inicio: '2020-01-15' }, admin), /vinculo atual/);
  const semLocal = validators.validateRhColaboradorUpdateBody({ ...body, obra_id: null, obra_vigencia_inicio: '2020-03-01' });
  await service.atualizarColaboradorRh(218, semLocal, admin); assert.equal(person.obra_id, null); assert.equal(vinculos.length, 3);
  person.status = 'INATIVO'; await assert.rejects(service.atualizarColaboradorRh(218, payload, admin), /ativo/); person.status = 'ATIVO';
  person.obra_id = 4; await assert.rejects(service.atualizarColaboradorRh(218, payload, admin), /historico de lotacao/);
  assert.throws(() => validators.validateRhColaboradorUpdateBody({ ...body, ajusteCadastroSuperadmin: true }), /nao permitidos/);
  console.log('Lotacao SUPERADMIN: ACL negativa DP/ADMIN, centros, vigencia/motivo, historico, concorrencia, replay, mesmo dia, sem local, pendencias e rollback aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
