'use strict';
// Controller e validadores reais; persistencia simulada, sem carregar models/config/env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateContratoUpdateBody } = require('../src/validators/operationalValidators');
const vigencia = require('../src/services/contratoVigenciaEdicao');
const validation = require('../src/middlewares/validation');

function preparar(options = {}) {
  const base = { id: 1, obra_id: 7, solicitacao_id: 10, codigo: 'CT-QA', valor_total: 1000,
    vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31', ...options.dados };
  let banco = { ...base }, fila = Promise.resolve();
  const historicos = [], escritas = [], tx = { LOCK: { UPDATE: 'UPDATE' } };
  const models = {
    Contrato: { async findByPk() {
      if (options.inexistente) return null;
      return { ...banco,
        async reload(opts) {
          assert.equal(opts.transaction, tx); assert.equal(opts.lock, 'UPDATE');
          Object.assign(this, banco, options.noBloqueio);
        },
        async update(patch, opts) {
          assert.equal(opts.transaction, tx);
          escritas.push({ ...patch }); banco = { ...banco, ...patch }; Object.assign(this, patch);
        }
      };
    } },
    Historico: { async create(item, opts) {
      assert.equal(opts.transaction, tx);
      if (options.falhaHistorico) throw new Error('Falha simulada de historico');
      historicos.push(item);
    } },
    Obra: { findByPk: async () => ({ id: 7 }) },
    sequelize: { transaction(fn) {
      const executar = fila.then(async () => {
        const antes = { ...banco }, tamanho = historicos.length;
        try { return await fn(tx); }
        catch (e) { banco = antes; historicos.length = tamanho; throw e; }
      });
      fila = executar.catch(() => {}); return executar;
    } }
  };
  const stubs = {
    '../models': models,
    sequelize: { Op: {} },
    '../middlewares/validation': validation,
    '../services/contratoVigenciaEdicao': vigencia,
    '../utils/codigoDoSetor': { codigoDoSetor: () => 'GEO' },
    '../services/securityLogService': { registrarEventoSeguranca: async () => {} },
    '../services/authorizationService': {
      canManageContratos: async () => !options.semPermissao,
      isSuperadmin: () => false, canAccessContratosGlobal: async () => false,
      shouldRestrictContratosToObras: async () => true,
      getUserObraScopeIds: async () => options.foraEscopo ? [99] : [7]
    }
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/ContratoController.js'), 'utf8'), {
    module: modulo, require: (id) => stubs[id] || {}, console: { error() {} }, Buffer
  });
  return {
    historicos, escritas, dados: () => banco,
    async salvar(body) {
      const res = { code: 200, status(c) { this.code = c; return this; }, json(value) { this.body = value; return this; } };
      await modulo.exports.update({ params: { id: 1 }, user: { id: 3 }, body: validateContratoUpdateBody(body) }, res);
      return res;
    }
  };
}

(async () => {
  for (const data of ['2026-02-30', '2026-02-29', '2026-13-01', '01/01/2026', 20261008, [], {}]) {
    assert.throws(() => validateContratoUpdateBody({ vigencia_fim: data }), { statusCode: 400 });
  }
  assert.equal(validateContratoUpdateBody({ vigencia_inicio: '2028-02-29' }).vigencia_inicio, '2028-02-29');
  let caso = preparar();
  assert.equal((await caso.salvar({ vigencia_fim: '2025-12-31' })).code, 400);
  assert.equal(caso.escritas.length, 0);
  assert.equal((await caso.salvar({ vigencia_inicio: '2027-01-01' })).code, 400);
  assert.equal((await caso.salvar({ vigencia_fim: '2026-01-01' })).code, 200);
  assert.equal(caso.historicos.length, 1);
  const evento = caso.historicos[0];
  assert.equal(evento.usuario_responsavel_id, 3); assert.equal(evento.solicitacao_id, 10);
  assert.deepEqual(JSON.parse(evento.metadata).anterior, { vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31' });
  assert.equal(caso.dados().valor_total, 1000);
  caso = preparar();
  const respostas = await Promise.all([caso.salvar({ vigencia_fim: '2027-01-31' }), caso.salvar({ vigencia_fim: '2027-01-31' })]);
  assert(respostas.every(r => r.code === 200)); assert.equal(caso.historicos.length, 1);
  assert.equal((await caso.salvar({ codigo: 'CORRECAO' })).code, 200);
  assert.equal(caso.dados().vigencia_fim, '2027-01-31'); assert.equal(caso.historicos.length, 1);
  caso = preparar({ dados: { solicitacao_id: null, vigencia_inicio: null, vigencia_fim: null } });
  assert.equal((await caso.salvar({ vigencia_fim: '2026-10-31' })).code, 200);
  assert.equal(caso.historicos.length, 0);
  assert.equal((await caso.salvar({ vigencia_fim: null })).code, 200); assert.equal(caso.dados().vigencia_fim, null);
  for (const [opcoes, status] of [[{ semPermissao: true }, 403], [{ foraEscopo: true }, 403], [{ inexistente: true }, 404]]) {
    caso = preparar(opcoes); assert.equal((await caso.salvar({ vigencia_fim: '2027-01-31' })).code, status);
    assert.equal(caso.escritas.length, 0);
  }
  caso = preparar({ noBloqueio: { vigencia_inicio: '2027-01-01' } });
  assert.equal((await caso.salvar({ vigencia_fim: '2026-11-30' })).code, 400);
  caso = preparar({ noBloqueio: { obra_id: 99 } });
  assert.equal((await caso.salvar({ vigencia_fim: '2027-11-30' })).code, 409);
  caso = preparar({ falhaHistorico: true });
  assert.equal((await caso.salvar({ vigencia_fim: '2027-11-30' })).code, 500);
  assert.equal(caso.dados().vigencia_fim, '2026-12-31'); assert.equal(caso.historicos.length, 0);
  console.log('OK vigencia: datas reais, PATCH parcial, legado, permissao/obra, historico, repeticao concorrente e rollback simulados; nenhum banco acessado.');
})().catch(error => { console.error(error); process.exitCode = 1; });
