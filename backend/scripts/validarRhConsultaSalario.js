'use strict';
// Controllers/services reais com modelos em memoria. Sem .env, banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const validation = require('../src/middlewares/validation');
const validators = require('../src/validators/rhValidators');
const consulta = require('../src/services/rhSolicitacaoConsultaDomain');
const domain = require('../src/services/rhPessoalDomain');
const plain = value => JSON.parse(JSON.stringify(value));
const instance = data => ({ ...data, get() { return plain(this); },
  async update(p, options) { assert.ok(options.transaction); Object.assign(this, p); return this; } });
function load(file, deps) {
  const sandbox = { module: { exports: {} }, console: { ...console, error() {} }, Date, process: { env: {} },
    require(key) { if (key in deps) return deps[key]; throw new Error('Dependencia nao simulada: ' + key); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), sandbox);
  return sandbox.module.exports;
}
function matches(row, where) {
  return Reflect.ownKeys(where).every(k => {
    const v = where[k];
    if (k === Op.and) return v.every(w => matches(row, w));
    if (k === Op.or) return v.some(w => matches(row, w));
    if (Array.isArray(v)) return v.includes(row[k]);
    if (v && typeof v === 'object') return v[Op.in].includes(row[k]);
    return row[k] === v;
  });
}
async function consultas() {
  const rows = [
    { id: 8, obra_id: 14, colaborador_id: 218, tipo: 'JORNADA', subtipo: 'PAGAMENTO_POR_SOLICITACAO',
      situacao: 'RASCUNHO', criada_por: 41, dados_json: { competencia: '2026-10', linhas: [{ colaborador_id: 218, selecionado: true }] } },
    { id: 9, obra_id: 14, colaborador_id: 218, tipo: 'JORNADA', situacao: 'ABERTA', dados_json: {} },
    { id: 10, obra_id: 51, colaborador_id: null, tipo: 'JORNADA', subtipo: 'PAGAMENTO_POR_SOLICITACAO',
      situacao: 'ABERTA', dados_json: JSON.stringify({ linhas: [{ colaborador_id: 218, selecionado: true }, { colaborador_id: 219, selecionado: false }] }) },
    { id: 11, obra_id: 51, colaborador_id: null, tipo: 'JORNADA', subtipo: 'PAGAMENTO_POR_SOLICITACAO',
      situacao: 'APROVADA', dados_json: { linhas: [{ colaborador_id: 218, selecionado: true }, { colaborador_id: 220, selecionado: true }],
        titulos: [{ id: 1, tipo: 'SALARIO', colaborador_id: 218 }] } },
    { id: 12, obra_id: 14, colaborador_id: 218, tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA', situacao: 'ABERTA', dados_json: {} },
    { id: 13, obra_id: 51, colaborador_id: 219, tipo: 'MOVIMENTACAO', situacao: 'ABERTA', dados_json: {} }
  ].map(instance);
  const queries = [];
  const models = { RhSolicitacao: { async findAll(o) { queries.push(o); return rows.filter(r => matches(r, o.where)); } }, Obra: {}, RhColaborador: {} };
  const auth = { getRhDpObraScopeIds: async u => u.estrito ? [14] : null,
    getUserObraIds: async () => [14], userHasAreaPermission: async u => u.perfil === 'SUPERADMIN' };
  const deps = { sequelize: { Op }, '../models': models, '../middlewares/validation': validation,
    '../services/rhSolicitacaoService': {}, '../services/rhChecklistService': {},
    '../services/rhSolicitacaoConsultaDomain': consulta, '../services/rhPessoalDomain': domain,
    '../services/authorizationService': auth, '../services/setorCapabilityService': { userBelongsToDpSetor: async u => u.area === 'DP' },
    '../services/rhSolicitacaoAtividadeService': { comAtividade: async x => x }, '../utils/codigoDoSetor': {},
    '../utils/controllerError': { responderErroController: (res, e) => res.status(e.statusCode || 400).json({ error: e.message }) } };
  const ctrl = load('controllers/RhSolicitacaoController.js', deps);
  const res = { status(n) { this.code = n; return this; }, json(d) { this.data = d; return d; } };
  const ids = () => Array.from(res.data, r => r.id);
  const dp = { id: 65, area: 'DP', perfil: 'USUARIO' };
  await ctrl.index({ user: dp, query: {} }, res);
  assert.deepEqual(ids(), [9, 10, 11, 13], 'DP global sem conceder visibilidade a rascunho privado/transferencia');
  assert.equal(queries.at(-1).where.obra_id, undefined);
  await ctrl.index({ user: { id: 1, perfil: 'SUPERADMIN' }, query: {} }, res);
  assert.deepEqual(ids(), [9, 10, 11, 13], 'Nem superadmin recebe rascunho alheio');
  await ctrl.index({ user: { ...dp, id: 41 }, query: { colaborador_id: 218 } }, res);
  assert.deepEqual(ids(), [8, 9, 10, 11], 'Autor ve rascunho e colaborador encontra coletivo');
  await ctrl.index({ user: dp, query: { colaborador_id: 218 } }, res);
  assert.deepEqual(ids(), [9, 10, 11]);
  await ctrl.index({ user: dp, query: { colaborador_id: 219 } }, res);
  assert.deepEqual(ids(), [13], 'Linha nao selecionada nao vira solicitacao do colaborador');
  await ctrl.index({ user: { ...dp, estrito: true }, query: { colaborador_id: 218 } }, res);
  assert.deepEqual(ids(), [9], 'OBRA acumulando DP permanece estrita');
  assert.ok(queries.at(-1).where[Op.and]);
  await ctrl.index({ user: { id: 66, perfil: 'USUARIO' }, query: {} }, res);
  assert.deepEqual(ids(), [9], 'Outro setor sem ver_todas nao recebe consulta global');
  await ctrl.index({ user: dp, query: { obra_id: '14' } }, res);
  assert.deepEqual(ids(), [9], 'DP ainda pode usar recorte local explicito');
  await ctrl.index({ user: dp, query: { colaborador_id: 'invalido' } }, res);
  assert.equal(res.code, 400);
  const service = load('services/rhSolicitacaoService.js', {
    './rhDemissaoConclusaoDomain': require('../src/services/rhDemissaoConclusaoDomain'),
    sequelize: { Op }, '../models': models, '../middlewares/validation': validation,
    './rhSolicitacaoConsultaDomain': consulta, './rhPessoalDomain': domain,
    '../utils/codigoDoSetor': {}, './rhVinculoObraService': {}, './rhCalculoHistoricoService': {},
    './s3': {}, '../utils/fileName': {}, './rhSolicitacaoCodigoService': {},
    './rhColaboradorContatosDomain': {}, './rhChecklistService': {} });
  const destaque = await service.pedidosAbertosPorColaborador(null, 65);
  assert.deepEqual(Array.from(destaque.get(218), r => r.id), [9, 10, 11]);
  assert.deepEqual(Array.from((await service.pedidosAbertosPorColaborador(null, 41)).get(218), r => r.id), [8, 9, 10, 11]);
  assert.equal(destaque.get(218).at(-1).situacao, 'ENVIO_PARCIAL');
  assert.equal(rows[3].situacao, 'APROVADA', 'Consulta nao altera legado');
  // Caso real informado: quando existe somente RH-000008, nenhum destaque
  // para Luana/superadmin e rascunho preservado para Kaua.
  rows.splice(1);
  assert.equal((await service.pedidosAbertosPorColaborador(null, 65)).size, 0);
  assert.equal((await service.pedidosAbertosPorColaborador(null, 1)).size, 0);
  assert.equal((await service.pedidosAbertosPorColaborador(null, 41)).get(218)[0].id, 8);
  let filtrosDestaque;
  const colCtrl = load('controllers/RhColaboradorController.js', {
    '../services/rhService': { listarColaboradoresRh: async filtros => {
      filtrosDestaque = filtros; return []; } },
    '../services/authorizationService': auth, '../services/rhColaboradoresPlanilhaService': {},
    '../services/setorCapabilityService': deps['../services/setorCapabilityService'],
    '../utils/controllerError': deps['../utils/controllerError']
  });
  await colCtrl.index({ user: dp, query: { usuario_id_consulta: 41 } }, res);
  assert.equal(filtrosDestaque.usuario_id_consulta, 65, 'Destaque usa identidade autenticada, nunca query enviada');
  assert.equal(filtrosDestaque.solicitacoes_obra_ids, null);
  assert.deepEqual(Array.from(res.data), []);
  await colCtrl.index({ user: { id: 66, perfil: 'USUARIO' }, query: { usuario_id_consulta: 41, solicitacoes_obra_ids: [51] } }, res);
  assert.equal(filtrosDestaque.usuario_id_consulta, 66);
  assert.deepEqual(filtrosDestaque.solicitacoes_obra_ids, [14], 'Outro setor nao recebe destaque de pedido fora do escopo');
}
async function salarios() {
  const person = instance({ id: 218, nome: 'Pessoa QA', salario_base: '1000.00', obra_id: 14, status: 'ATIVO', data_admissao: '2020-01-01' });
  const history = [instance({ id: 1, colaborador_id: 218, valor: '1000.00', vigencia_inicio: '2020-01-01', vigencia_fim: null })];
  let tail = Promise.resolve();
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  const models = {
    sequelize: { async transaction(fn) {
      const prev = tail; let release; tail = new Promise(ok => { release = ok; }); await prev;
      const before = plain(person), old = history.map(plain);
      try { return await fn(tx); } catch (e) { Object.assign(person, before); history.splice(0, history.length, ...old.map(instance)); throw e; }
      finally { release(); }
    } },
    RhColaborador: { async findByPk(id, o) { assert.equal(id, 218); assert.ok(o.transaction); return person; },
      async update(p, o) { assert.equal(o.transaction, tx); Object.assign(person, p); } },
    RhColaboradorSalario: { async findOne() { return history.find(h => !h.vigencia_fim); },
      async create(p, o) { assert.equal(o.transaction, tx); const h = instance({ id: history.length + 1, ...p }); history.push(h); return h; } }
  };
  const salarioService = load('services/rhSalarioService.js', { sequelize: { Op }, '../models': models, '../middlewares/validation': validation });
  const service = load('services/rhService.js', { sequelize: { Op }, '../models': models,
    '../utils/pix': require('../src/utils/pix'), '../middlewares/validation': validation,
    './rhColaboradorContatosDomain': require('../src/services/rhColaboradorContatosDomain'),
    './rhSalarioService': salarioService, './authorizationService': { isSuperadmin: u => u.perfil === 'SUPERADMIN',
      isRhDpUsuarioObra: async u => Boolean(u.obra) && u.perfil !== 'SUPERADMIN',
      getRhDpObraScopeIds: async u => u.obra ? [14] : null,
      canManageRhDpColaboradores: async u => (u.permissoes || []).includes('rh_dp.colaboradores.editar'),
      userHasNominalAreaPermission: async (u, keys) => keys.every(k => (u.permissoes || []).includes(k)) },
    './setorCapabilityService': { userBelongsToDpSetor: async u => u.area === 'DP', userHasSetorCapability: async u => Boolean(u.obra) },
    './rhVinculoObraService': {}, './rhCalculoHistoricoService': {}, './s3': {},
    '../utils/fileName': {}, '../constants/empresaGrupo': {}, '../utils/excelWorkbook': {} });
  for (const user of [{ perfil: 'USUARIO', area: 'OBRA', obra: true },
    { perfil: 'USUARIO', area: 'DP', obra: true, permissoes: ['rh_dp.colaboradores.editar'] },
    { perfil: 'ADMINISTRADOR' }, { perfil: 'USUARIO', area: 'DP' }]) {
    await assert.rejects(service.atualizarColaboradorRh(218, { salario_restrito_obra: true }, user), /privacidade salarial|somente observacoes/);
  }
  for (const data of [{ salario_base: 1 }, { cpf: '52998224725' }, { obra_id: 99 }, { pagamento: { conta: '123' } }, { observacoes: 'Porta geral' }]) {
    await assert.rejects(service.atualizarColaboradorRh(218, data, { id: 41, perfil: 'USUARIO', area: 'OBRA', obra: true }), /cadastro limitado/);
  }
  assert.equal(person.salario_base, '1000.00'); assert.equal(person.obra_id, 14);
  const sigilo = validators.validateRhColaboradorUpdateBody({ salario_restrito_obra: true });
  assert.deepEqual(plain(sigilo), { salario_restrito_obra: true });
  await service.atualizarColaboradorRh(218, sigilo, { id: 65, perfil: 'USUARIO', area: 'DP', permissoes: ['rh_dp.colaboradores.editar'] });
  assert.equal(person.salario_restrito_obra, true); assert.equal(person.salario_base, '1000.00'); assert.equal(history.length, 1);
  await service.atualizarColaboradorRh(218, { salario_restrito_obra: false }, { id: 1, perfil: 'SUPERADMIN' });
  assert.equal(person.salario_restrito_obra, false); assert.equal(history.length, 1);
  assert.throws(() => validators.validateRhColaboradorUpdateBody({ salario_restrito_obra: 'maybe' }));
  const body = { salario_base: 'R$ 1.881,00', salario_vigencia_inicio: '2020-06-01', salario_motivo: 'Correcao cadastral' };
  const payload = validators.validateRhColaboradorUpdateBody(body);
  assert.equal(payload.salario_base, 1881);
  for (const perfil of ['USUARIO', 'ADMINISTRADOR', 'ADMIN']) {
    await assert.rejects(service.atualizarColaboradorRh(218, payload, { id: 1, perfil, area: 'DP' }), /Diretoria/);
    assert.equal(history.length, 1);
  }
  const admin = { id: 1, perfil: 'SUPERADMIN' };
  await assert.rejects(service.atualizarColaboradorRh(218, { salario_base: 1881 }, admin), /vigencia e o motivo/);
  await assert.rejects(service.atualizarColaboradorRh(218, { ...payload, salario_vigencia_inicio: '2020-02-31' }, admin), /vigencia salarial valida/);
  await assert.rejects(service.atualizarColaboradorRh(218, { ...payload, salario_vigencia_inicio: '2019-12-01' }, admin), /admissao/);
  const result = await Promise.all([service.atualizarColaboradorRh(218, payload, admin), service.atualizarColaboradorRh(218, payload, admin)]);
  assert.equal(history.length, 2, 'Repeticao simultanea serializada nao duplica historico');
  assert.equal(Number(result[0].salario_base), 1881);
  assert.equal(history[0].valor, '1000.00'); assert.equal(history[0].vigencia_fim, '2020-05-31');
  assert.equal(history[1].criado_por, 1); assert.equal(history[1].motivo, 'AJUSTE');
  await service.atualizarColaboradorRh(218, { ...payload, salario_base: 1950 }, admin);
  assert.equal(history.length, 2); assert.equal(history[1].vigencia_fim, null);
  assert.match(history[1].observacoes, /1881.00 -> 1950.00/);
  assert.match(history[1].observacoes, /usuario #1/);
  const dp = { id: 2, perfil: 'USUARIO', area: 'DP', permissoes: ['rh_dp.colaboradores.editar', 'rh_dp.salario.aprovar'] };
  for (const negado of [{ ...dp, permissoes: ['rh_dp.colaboradores.editar'] }, { ...dp, area: 'COMPRAS' },
    { ...dp, obra: true }, { ...dp, perfil: 'ADMINISTRADOR', permissoes: [] }]) {
    await assert.rejects(service.atualizarColaboradorRh(218, { ...payload, salario_base: 2000 }, negado), negado.obra ? /cadastro limitado/ : /Diretoria/);
  }
  await service.atualizarColaboradorRh(218, { ...payload, salario_base: 2000 }, dp);
  assert.equal(history.length, 2, 'Ajuste DP na mesma vigencia nao gera intervalo negativo');
  assert.match(history[1].observacoes, /DP autorizado/); assert.match(history[1].observacoes, /usuario #2/);
  await service.atualizarColaboradorRh(218, { ...payload, salario_base: 2100, salario_vigencia_inicio: '2099-01-01' }, admin);
  assert.equal(person.salario_base, '2000.00', 'Vigencia futura nao antecipa salario corrente');
  assert.equal(history.length, 3);
  await assert.rejects(service.atualizarColaboradorRh(218, { ...payload, salario_base: 2200, salario_vigencia_inicio: '2020-07-01' }, admin), /anterior ao inicio/);
  assert.equal(history.length, 3, 'Rollback preserva historico');
  assert.throws(() => validators.validateRhColaboradorUpdateBody({ ...body, perfil: 'SUPERADMIN' }), /nao permitidos/);
}
(async () => { await consultas(); await salarios(); console.log('DP global, escopo OBRA, rascunho privado, coletivos, destaque, salario SUPERADMIN/DP nominal, vigencia, auditoria, concorrencia e rollback aprovados. Sem banco/rede.'); })()
  .catch(e => { console.error(e); process.exitCode = 1; });
