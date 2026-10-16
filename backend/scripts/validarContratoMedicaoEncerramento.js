'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op } = require('sequelize');
const domain = require('../src/services/contratoMedicaoEncerramentoDomain');
const copy = x => JSON.parse(JSON.stringify(x));
let state, fila = Promise.resolve(), falha = '', consultas = 0, criadas = 0;
const geo = { id: 9, geo: true, editar: true, ver: true, obras: [7] };
function reset(novo = true) {
  falha = ''; consultas = 0; criadas = 0;
  state = { contrato: { id: 4, codigo: 'CT-0004', obra_id: 7, ativo: true, fluxo_novo: novo,
    status_contrato: novo ? 'ATIVO' : null, solicitacao_id: novo ? 100 : null, valor_total: 1000, medicao_encerramento: null },
    auditorias: [], historicos: [], recibos: [], financeiro: { parcelas: [{ id: 1, valor: 1000 }], titulos: [{ id: 3, status: 'PARCIAL', valor_baixado: 400 }] } };
}
const model = row => ({ ...row, toJSON() { return copy(row); }, async update(p, o) {
  assert(o.transaction); assert.deepEqual(Object.keys(p), ['medicao_encerramento']); Object.assign(row, copy(p)); Object.assign(this, copy(p));
} });
const models = {
  sequelize: { async transaction(fn) {
    const antes = fila; let liberar; fila = new Promise(r => { liberar = r; }); await antes;
    const snapshot = copy(state);
    try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); } catch (e) { state = snapshot; throw e; } finally { liberar(); }
  } },
  Contrato: { async findByPk(id, o = {}) { consultas++; if (o.transaction) assert.equal(o.lock, 'UPDATE'); return Number(id) === 4 ? model(state.contrato) : null; } },
  SecurityEventLog: { async create(d, o) { assert(o.transaction); if (falha === 'audit') throw Error('FALHA_AUDITORIA'); state.auditorias.push({ ...copy(d), id: state.auditorias.length + 1, createdAt: new Date().toISOString() }); },
    async findAll(o) { assert.equal(o.where.recurso_id, '4'); assert.equal(o.where.tipo_evento, 'CONTRATO_MEDICAO_MARCACAO'); return [...state.auditorias].reverse(); } },
  Historico: { async create(d, o) { assert(o.transaction); if (falha === 'historico') throw Error('FALHA_HISTORICO'); state.historicos.push(copy(d)); } },
  LogExclusao: { async create(d, o) { assert(o.transaction); assert.equal(d.solicitacao_id, null); if (falha === 'recibo') throw Error('FALHA_RECIBO'); state.recibos.push({ ...copy(d), id: state.recibos.length + 1, createdAt: new Date().toISOString() }); },
    async findAll(o) { assert.equal(o.where.entidade, 'CONTRATO_MEDICAO_MARCACAO'); assert.equal(o.where.entidade_id, 4); return [...state.recibos].reverse().slice(0, o.limit); } },
  Solicitacao: { async create(d, o) { assert(o.transaction); criadas++; return { id: 100, ...d }; } },
  ContratoParcela: { async findAll() { return [{ id: 1, numero: 1, valor: 1000, status: 'PREVISAO', data_vencimento: '2099-01-01' }]; } },
  MedicaoParcela: { async findAll() { return []; } }
};
const auth = { isSuperadmin: u => u?.super === true, canViewContratos: async u => !!u?.ver,
  canManageContratos: async u => !!u.editar, canAccessContratosGlobal: async u => !!u.global, getUserObraScopeIds: async u => u.obras };
function load(file, deps) {
  const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8'), {
    module: m, console, Date, require(id) { if (!(id in deps)) throw Error('Dependencia nao isolada: ' + id); return deps[id]; }
  }, { filename: file }); return m.exports;
}
const service = load('services/contratoMedicaoEncerramentoService.js', { '../models': models,
  './authorizationService': auth, './setorCapabilityService': { userHasSetorCapability: async u => !!u.geo }, './contratoMedicaoEncerramentoDomain': domain });
const payload = (finalizado, revisao, motivo = 'Conferencia fisica concluida') => ({ finalizado, revisao, motivo });
async function negativas() {
  for (const u of [{ ...geo, geo: false }, { ...geo, editar: false }, { ...geo, obras: [8] }, { ...geo, ver: false }]) {
    const antes = copy(state); await assert.rejects(service.alterar(4, payload(true, 0), u), e => e.statusCode === 403); assert.deepEqual(state, antes);
  }
  for (const p of [null, [], 'marcar', payload(true, -1), payload('true', 0), payload(true, 0, ''), { ...payload(true, 0), valor_total: 1 }, payload(true, 0, 'x'.repeat(2001))]) {
    await assert.rejects(service.alterar(4, p, geo), e => e.statusCode === 400);
  }
  for (const patch of [{ ativo: false }, { status_contrato: 'RESCINDIDO' }, { rescindido_em: '2026-10-15' }, { status_contrato: 'AGUARDANDO_APROVACAO' }]) {
    reset(); Object.assign(state.contrato, patch); await assert.rejects(service.alterar(4, payload(true, 0), geo), e => e.statusCode === 409);
  }
}
async function testarListas() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/ContratoController.js'), 'utf8');
  const extrair = name => { const inicio = source.indexOf(`  async ${name}(req, res) {`); const fim = source.indexOf('\n  },', inicio); assert(inicio > 0 && fim > inicio); return source.slice(inicio, fim + 4); };
  const rows = [false, true].flatMap(fluxo_novo => [false, true].map(finalizado => {
    const r = { id: 1 + Number(fluxo_novo) * 2 + Number(finalizado), fluxo_novo, solicitacao_id: fluxo_novo ? 100 : null,
      medicao_encerramento: finalizado ? { finalizado } : null, toJSON() { return { ...this, toJSON: undefined }; }, solicitacaoContrato: {} }; return r;
  }));
  const globals = { Op, console, Contrato: { findAll: async () => rows }, Obra: {}, TipoSolicitacao: {}, TipoSubContrato: {}, Solicitacao: {},
    canViewContratos: async () => true, shouldRestrictContratosToObras: async u => u.obra, canAccessContratosGlobal: async u => !u.obra,
    isSuperadmin: () => false, getUserObraScopeIds: async () => [7], obterTokensSetorUsuario: async () => [], obterSetoresCriacaoTodasObras: async () => [],
    contratoApropriacoesInclude: () => ({}), contratoCredoresInclude: () => ({}), montarContextoInteracao: async () => ({ allowed: true, pode_interagir: true }),
    calcularResumosOperacionais: async () => new Map(rows.map(r => [r.id, { solicitacoes: [], medicoes: [], titulos: [], saldo_contratual: 1000 }])) };
  for (const method of ['index', 'resumo']) {
    const handler = vm.runInNewContext('({' + extrair(method) + '})', globals)[method];
    for (const obra of [false, true]) {
      let retorno; const res = { json: r => { retorno = r; }, status(s) { throw Error('Status inesperado: ' + s); } };
      await handler({ user: { obra }, query: {} }, res); assert.equal(retorno.length, obra ? 2 : 4);
      if (method === 'index') { await handler({ user: { obra }, query: { modo: 'CRIACAO' } }, res); assert.equal(retorno.length, 2); }
    }
  }
  // Executar as funcoes reais da criacao legada com a marcacao alterada apos a previa.
  const a = source; assert(a.includes('medicao_encerramento'));
  const sol = fs.readFileSync(path.resolve(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8');
  const inicio = sol.indexOf('      const validarMarcacaoNaCriacao =');
  const fim = sol.indexOf('      const criarSolicitacaoComDistribuicao =', inicio);
  for (const finalizado of [false, true]) {
    reset(false); state.contrato.medicao_encerramento = { finalizado };
    const executar = vm.runInNewContext('(async()=>{' + sol.slice(inicio, fim) + 'return criarSolicitacaoComRateio();})', {
      sequelize: models.sequelize, Contrato: models.Contrato, Solicitacao: models.Solicitacao,
      dadosSolicitacao: { contrato_id: 4 }, criacaoDeMedicao: true, rateioApropriacoesDetalhado: [], pagamentosFavorecidosValidados: [],
      require(id) { assert.equal(id, '../services/contratoMedicaoEncerramentoDomain'); return domain; }
    });
    if (finalizado) { await assert.rejects(executar(), e => e.statusCode === 409); assert.equal(criadas, 0); }
    else { await executar(); assert.equal(criadas, 1); }
  }
}
(async () => {
  for (const novo of [false, true]) {
    reset(novo); const financeiro = copy(state.financeiro);
    const respostas = await Promise.all([service.alterar(4, payload(true, 0), geo), service.alterar(4, payload(true, 0), geo)]);
    assert.equal(respostas.filter(r => r.repetida).length, 1); assert.equal(state.auditorias.length, 1);
    assert.equal(state.historicos.length, 0, 'Nao criar autoria/interacao que amplie visibilidade'); assert.equal(state.recibos.length, 1); assert.throws(() => domain.assertNovaMedicao(state.contrato), e => e.statusCode === 409);
    const antes = copy(state); const dto = await service.consultar(4, geo); assert(dto.pode_alterar); assert.equal(dto.historico[0].motivo, payload(true, 0).motivo); assert.deepEqual(state, antes);
    await service.alterar(4, payload(false, 1, 'Retomar saldo remanescente'), geo); domain.assertNovaMedicao(state.contrato);
    await assert.rejects(service.alterar(4, payload(true, 0), geo), e => e.statusCode === 409);
    assert.deepEqual(state.financeiro, financeiro); assert.equal(state.contrato.ativo, true);
    assert.equal(state.contrato.status_contrato, novo ? 'ATIVO' : null); assert.equal(state.auditorias.length, 2);
    state.auditorias = []; assert.equal((await service.consultar(4, geo)).historico.length, 2, 'Historico independe da retencao dos logs de seguranca');
  }
  reset(); await negativas();
  for (const erro of ['audit', 'recibo']) { reset(); const antes = copy(state); falha = erro; await assert.rejects(service.alterar(4, payload(true, 0), geo)); assert.deepEqual(state, antes); }
  reset(); await service.alterar(4, payload(true, 0), { ...geo, super: true, geo: false, editar: false, obras: null });
  reset(); const antes = consultas; await assert.rejects(service.consultar(4, { ...geo, ver: false }), e => e.statusCode === 403); assert.equal(consultas, antes);
  await assert.rejects(service.consultar(4, { ...geo, obras: [8] }), e => e.statusCode === 403);
  const medicao = load('services/medicaoContratoService.js', { sequelize: { Op }, '../models': models,
    '../utils/codigoDoSetor': {}, './contratoParcelasService': require('../src/services/contratoParcelasService'),
    './formasPagamentoMedicaoService': {}, './setorCapabilityService': {}, './medicaoAtualContratoService': {}, './contratoMedicaoEncerramentoDomain': domain });
  state.contrato.medicao_encerramento = { finalizado: true };
  await assert.rejects(medicao.registrarMedicaoDoContrato({ contratoId: 4 }), e => e.statusCode === 409);
  await assert.rejects(medicao.validarMedicaoParcelas({ contratoId: 4, itens: [{ contrato_parcela_id: 1, valor_medido: 100 }] }), e => e.statusCode === 409);
  const reprogramacao = load('services/contratoSaldoReprogramacaoService.js', {
    'node:crypto': require('node:crypto'), sequelize: { Op }, '../models': { ...models, ContratoParcela: { findAll: async () => [] } },
    './authorizationService': { ...auth, userHasStrictAreaPermission: async () => true }, './setorCapabilityService': {},
    './medicaoContratoService': { calcularSaldoDoContrato: async () => ({ total_cent: 100000, comprometido_cent: 0, saldo_cent: 100000 }) },
    './contratoParcelasService': require('../src/services/contratoParcelasService'), './tituloFinanceiroService': {}, '../utils/codigoDoSetor': {}
  });
  assert.equal((await reprogramacao.consultar(4, geo)).pode_reprogramar, false);
  const financeiro = copy(state.financeiro);
  await assert.rejects(reprogramacao.reprogramar(4, { justificativa: 'Nao contornar marcacao', referencia: 'a'.repeat(64), parcelas: [] }, { usuario: geo }), e => e.statusCode === 409);
  assert.deepEqual(state.financeiro, financeiro);
  await testarListas();
  const resumoModels = Object.fromEntries(['ContratoParcela', 'MedicaoParcela', 'ContratoMedicao', 'Solicitacao', 'SolicitacaoPagamento', 'TituloFinanceiro', 'Comprovante'].map(k => [k, { findAll: async () => [] }]));
  resumoModels.TituloFinanceiro.unscoped = () => resumoModels.TituloFinanceiro;
  const resumo = load('services/contratoResumoOperacionalService.js', { sequelize: { Op }, '../models': resumoModels,
    './solicitacaoFavorecidosService': { projetarDivisoesNasParcelas: async () => {} }, './tituloRenegociacaoVinculos': { projetarOrigens: async () => [] } });
  reset(); state.contrato.medicao_encerramento = { finalizado: true };
  const calculado = await resumo.calcularResumoOperacional(state.contrato);
  assert.equal(calculado.status_operacional, 'TOTALMENTE_MEDIDO'); assert.equal(calculado.status_operacional_calculado, 'ATIVO');
  assert.equal(calculado.saldo_contratual, 1000); assert.equal(calculado.medido, 0); assert.equal(calculado.movimentado, 0);
  let existe = false, alteracoes = 0;
  const migration = load('../migrations/202610150003_contrato_medicao_encerramento.js', { '../src/database/schemaUtils': { columnExists: async () => existe } });
  const opcoes = { sequelize: {}, DataTypes: { JSON: 'JSON' }, queryInterface: { async addColumn(t, c, d) {
    assert.equal(t, 'contratos'); assert.equal(c, 'medicao_encerramento'); assert.equal(d.allowNull, true); assert.equal(d.defaultValue, undefined); existe = true; alteracoes++;
  } } };
  await migration.up(opcoes); await migration.up(opcoes); assert.equal(alteracoes, 1); await assert.rejects(migration.down());
  console.log('Contrato totalmente medido: novo/legado, ACL/escopo, marcar/desfazer, replay/concorrencia/rollback, financeiro intacto, listas, criacao legada atomica, guardas de medicao e schema idempotente aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
