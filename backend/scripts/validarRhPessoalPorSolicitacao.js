'use strict';
// Executa os servicos reais com modelos em memoria. Sem .env, banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const domain = require('../src/services/rhPessoalDomain');
class ValidationError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function load(relative, deps, suffix = '') {
  const sandbox = { module: { exports: {} }, console: { ...console, error() {} },
    process: { env: { RH_JORNADA_40_60_ETAPAS: 'OFF' } },
    require(key) { if (key in deps) return deps[key]; throw new Error('Dependencia nao simulada: ' + key); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8') + suffix, sandbox);
  return sandbox.module.exports;
}
const instance = data => ({ ...data, get() { return { ...this }; }, async update(p) { Object.assign(this, p); return this; } });
async function enviosIndependentes() {
  const imports = [], lines = [], requests = [], locks = [];
  let tail = Promise.resolve();
  const models = {
    // Serializacao simulada; o servico tambem deve adquirir o mutex da obra.
    sequelize: { async transaction(fn) {
      const previous = tail; let release; tail = new Promise(ok => { release = ok; });
      await previous;
      try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); } finally { release(); }
    } },
    Obra: { async findByPk(id, o) { assert.equal(o.lock, 'UPDATE'); locks.push(id); return { id }; } },
    RhColaborador: { findAll: async o => o.where.id.map(id => instance({ id, nome: 'Pessoa ' + id, forma_calculo_gerencial: 'MENSAL' })) },
    RhColaboradorPagamento: { findAll: async () => [] },
    RhColaboradorVinculo: { findAll: async () => [] },
    RhImportacao: {
      findOne: async o => imports.find(i => i.idempotency_key === o.where.idempotency_key),
      create: async p => { const i = instance({ id: imports.length + 1, ...p }); imports.push(i); return i; }
    },
    RhImportacaoLinha: {
      findAll: async o => o.where.importacao_id ? lines.filter(i => i.importacao_id === o.where.importacao_id) : [],
      create: async p => { const i = instance({ id: lines.length + 1, ...p }); lines.push(i); return i; }
    },
    RhSolicitacao: {
      findAll: async () => requests,
      create: async p => { const i = instance({ id: requests.length + 1, ...p }); requests.push(i); return i; }
    },
    RhSolicitacaoHistorico: { create: async p => p }
  };
  const service = load('services/rhJornadaFormularioService.js', {
    crypto: require('node:crypto'), sequelize: { Op }, '../models': models,
    '../middlewares/validation': { ValidationError }, './rhPessoalDomain': domain,
    './rhVinculoObraService': { colaboradoresDaObraEm: async () => [11, 12, 13].map(colaborador_id => ({ colaborador_id, vigencia_inicio: '2026-09-01' })) },
    './rhCalculoHistoricoService': { resumo: () => ({ forma_calculo: 'MENSAL' }) },
    '../utils/codigoDoSetor': { setorParaHistorico: s => s },
    './rhSolicitacaoCodigoService': { garantirCodigoRhSolicitacao: async () => {} },
    '../utils/cpfCnpj': require('../src/utils/cpfCnpj')
  });
  const payload = { obra_id: 7, competencia: '2026-09', solicitacao_independente: true,
    idempotency_key: 'qa-pessoal-individual-001', linhas: [{ colaborador_id: 11, dias_trabalhados: 5 }] };
  const [first, retry] = await Promise.all([service.registrarJornada(payload), service.registrarJornada(payload)]);
  assert.equal(first.solicitacao.id, retry.solicitacao.id);
  assert.equal(imports.length, 1); assert.equal(requests.length, 1); assert.equal(lines.length, 1);
  assert.equal(retry.repetido, true);
  assert.ok(locks.length === 2);
  const second = await service.registrarJornada({ ...payload, idempotency_key: 'qa-pessoal-individual-002', linhas: [{ colaborador_id: 12, dias_trabalhados: 8 }] });
  assert.notEqual(second.solicitacao.id, first.solicitacao.id);
  assert.equal(first.solicitacao.dados_json.importacao_id, 1, 'O segundo colaborador nao substitui o primeiro pedido');
  assert.equal(second.solicitacao.dados_json.importacao_id, 2);
  await assert.rejects(service.registrarJornada({ ...payload, linhas: [{ colaborador_id: 11, dias_trabalhados: 6 }] }), /utilizado/);
  await assert.rejects(service.registrarJornada({ ...payload, idempotency_key: '' }), /Identificador/);
  // O caminho antigo continua podendo atualizar sua solicitacao mensal.
  const legacy = await service.registrarJornada({ ...payload, solicitacao_independente: false, idempotency_key: undefined,
    linhas: [{ colaborador_id: 13, dias_trabalhados: 3 }] });
  assert.notEqual(legacy.solicitacao.id, first.solicitacao.id, 'O caminho antigo nao reutiliza um novo pedido independente');
  const legacyRetry = await service.registrarJornada({ ...payload, solicitacao_independente: false, idempotency_key: undefined,
    linhas: [{ colaborador_id: 13, dias_trabalhados: 4 }] });
  assert.equal(legacyRetry.solicitacao.id, legacy.solicitacao.id);
  assert.equal(requests.length, 3);
}
async function escopoLocal() {
  const queries = []; let scope = [7, 51];
  const controller = load('controllers/RhSolicitacaoController.js', {
    sequelize: { Op }, '../services/rhSolicitacaoService': {}, '../services/rhChecklistService': {},
    '../models': { RhSolicitacao: { findAll: async o => { queries.push(o); return []; } } },
    '../utils/controllerError': { responderErroController: (res, error) => res.status(error.status).json({ erro: error.message }) },
    '../utils/codigoDoSetor': {}, '../services/setorCapabilityService': {},
    '../services/authorizationService': { getRhDpObraScopeIds: async () => scope, getUserObraIds: async () => [7, 51], userHasAreaPermission: async () => true },
    '../middlewares/validation': { ValidationError }, '../services/rhPessoalDomain': domain,
    '../services/rhSolicitacaoAtividadeService': { comAtividade: async x => x }
  });
  const res = { status(n) { this.codigo = n; return this; }, json(d) { this.dados = d; return d; } };
  const req = { user: { id: 2 }, query: { obra_id: '51', tipo: 'JORNADA' } };
  await controller.index(req, res);
  assert.equal(queries.at(-1).where.obra_id, 51); assert.equal(queries.at(-1).where.tipo, 'JORNADA');
  await controller.index({ ...req, query: { obra_id: '99' } }, res);
  assert.equal(queries.length, 1); assert.equal(res.dados.length, 0, 'Filtro nao amplia escopo');
  await controller.index({ ...req, query: { obra_id: 'invalido' } }, res);
  assert.equal(res.codigo, 400); assert.equal(queries.length, 1);
  scope = null;
  await controller.index(req, res);
  assert.equal(queries.at(-1).where.obra_id, 51, 'Permissao ver todas tambem respeita filtro local');
}
async function fontesJaIsoladas() {
  const people = [11, 12].map(id => instance({ id, nome: 'Pessoa ' + id }));
  const rows = people.map(colaborador => ({ colaborador_id: colaborador.id, colaborador,
    importacao: { id: 19, obra_id: 7, tipo: 'JORNADA' }, payload_json: { dias_trabalhados: 5 } }));
  let isolatedQueries = 0;
  const service = load('services/rhApuracaoService.js', {
    sequelize: { Op }, '../models': {
      RhImportacaoLinha: { findAll: async () => rows },
      RhColaboradorVinculo: { findAll: async () => [] },
      RhApuracaoEvento: { findAll: async o => {
        if (o.include[0].where.importacao_id) {
          isolatedQueries++; assert.equal(o.include[0].where.competencia, '2026-09');
          return [{ colaborador_id: 11, detalhes_json: { importacao_ids: [19] } }];
        }
        return [];
      } }
    }, '../middlewares/validation': { ValidationError },
    './rhApuracaoConferenciaDomain': require('../src/services/rhApuracaoConferenciaDomain'),
    './rhPessoalDomain': domain, './rhCalculoHistoricoService': {}, './rhJornadaFormularioService': {},
    './rhRecorrentesAplicacaoService': {}, './rhPagamentoGerencial': {},
    './rhPagamentoDomain': {}, './rhCalculoHistoricoDomain': {}, '../utils/codigoDoSetor': {}
  }, '\nmodule.exports.buildParaTeste = buildAgrupamentoImportacoes;');
  const data = { obra_id: 7, competencia: '2026-09', etapa_pagamento: 'DIARIA' };
  const remaining = await service.buildParaTeste(data, {});
  assert.deepEqual(Array.from(remaining, i => i.colaborador.id), [12], 'Nao duplica fonte ja isolada; preserva outro colaborador da mesma fonte');
  assert.equal(isolatedQueries, 1);
  const specific = await service.buildParaTeste({ ...data, importacao_id: 19 }, {});
  assert.equal(specific.length, 2); assert.equal(isolatedQueries, 1, 'O recorte da propria fonte nao se exclui');
}
(async () => {
  await enviosIndependentes(); await escopoLocal(); await fontesJaIsoladas();
  console.log('Pessoal por solicitacao: fontes separadas, repeticao simultanea, hash, escopo de centros/obras e exclusao na preparacao geral validados sem banco.');
})().catch(error => { console.error(error); process.exitCode = 1; });
