'use strict';
// Servico completo com adaptadores em memoria. Nao carrega .env, banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Op, DataTypes } = require('sequelize');
const domain = require('../src/services/adiantamentoDomain');
let state, fila = Promise.resolve(), negar = false;
const tx = { LOCK: { UPDATE: 'UPDATE' } };
function reset() {
  state = { principal: { id: 10, codigo: 'SOL-QA', obra_id: 30, tipo_sub_id: 9, valor: 1000, status_global: 'TITULO_CADASTRADO', area_responsavel: 'FINANCEIRO' },
    ciclos: [ { id: 1, solicitacao_id: 10, solicitacao_favorecido_id: 11, titulo_financeiro_id: 100, valor_solicitado: 600, status: 'AGUARDANDO_PAGAMENTO' },
      { id: 2, solicitacao_id: 10, solicitacao_favorecido_id: 12, titulo_financeiro_id: 101, valor_solicitado: 400, status: 'AGUARDANDO_PAGAMENTO' } ],
    titulos: [ { id: 100, status: 'QUITADO', valor_original: 600, valor_baixado: 600, valor_saldo: 0, categoria_financeira_id: 4, favorecido_pagamento_id: 5, empresa_id: 2 },
      { id: 101, status: 'ABERTO', valor_original: 400, valor_baixado: 0, valor_saldo: 400, categoria_financeira_id: 4, favorecido_pagamento_id: 6, empresa_id: 2 } ], historico: [], rateios: [] };
}
const row = r => r && { ...r, async update(v, o) { assert.equal(o.transaction, tx); Object.assign(r, v); Object.assign(this, v); return this; } };
const modelos = {
  sequelize: { transaction(fn) { const run = async () => { const before = structuredClone(state); try { return await fn(tx); } catch(e) { state = before; throw e; } };
    const trabalho = fila.then(run); fila = trabalho.catch(() => {}); return trabalho; } },
  Solicitacao: { findByPk: async id => Number(id) === 10 ? row(state.principal) : null },
  SolicitacaoAdiantamento: { findAll: async ({ where }) => state.ciclos.filter(c => c.solicitacao_id === where.solicitacao_id).map(row) },
  TipoSubContrato: { findByPk: async () => ({ usa_fluxo_adiantamento: true }) },
  Obra: { findByPk: async () => ({ id: 30, ativo: true, tipo_centro_custo: 'CENTRO_CUSTO' }) },
  Apropriacao: { findAll: async () => [], findOne: async () => null },
  Anexo: { count: async ({ where }) => where.solicitacao_id === 10 && where.tipo === 'PRESTACAO_ADIANTAMENTO'
    ? where.id[Op.in].filter(id => [1, 2].includes(id)).length : 0, findAll: async () => [{ id: 1 }, { id: 2 }] },
  TituloFinanceiro: { findByPk: async id => row(state.titulos.find(t => t.id === Number(id))),
    findAll: async ({ where }) => state.titulos.filter(t => where.id[Op.in].includes(t.id)).map(row),
    create: async (v, o) => { assert.equal(o.transaction, tx); const r = { id: 102 + state.titulos.length, ...v }; state.titulos.push(r); return row(r); } },
  TituloFinanceiroRateio: { destroy: async ({ where }) => { state.rateios = state.rateios.filter(r => r.titulo_financeiro_id !== where.titulo_financeiro_id); },
    bulkCreate: async data => state.rateios.push(...data) },
  CategoriaFinanceira: { findByPk: async () => ({ ativo: true, considera_dre: true }) },
  Historico: { create: async data => state.historico.push(data) }, StatusArea: { create: async () => {} }
};
const deps = { sequelize: { Op }, '../models': modelos, './adiantamentoDomain': domain,
  './solicitacaoRetornoService': { assertPodeVisualizarSolicitacao: async req => { if (negar) throw domain.erro('Acesso negado', 403); return row(state.principal); },
    assertPodeInteragirSolicitacao: async req => { if (negar || req.user.area !== state.principal.area_responsavel) throw domain.erro('Acesso negado', 403); } },
  './centroCustoDistribuicaoService': { listarObrasElegiveisDistribuicao: async () => ({ obras: [{ id: 2 }] }) },
  './recargaCartaoService': { isGerenciaProcessos: u => u.area === 'GEO', resolverDestinoPrestacaoAposBaixa: async () => 'ADMINISTRATIVO' },
  './setorCapabilityService': { findSetorByCapability: async cap => ({ codigo: cap === 'eh_setor_financeiro' ? 'FINANCEIRO' : 'GEO' }), resolveSetorPersistenciaValue: s => s.codigo },
  './apropriacaoSelecaoService': require('../src/services/apropriacaoSelecaoService'),
  './solicitacaoFavorecidosService': { listarFavorecidos: async () => [{ id: 11, nome_favorecido: 'Pessoa A' }, { id: 12, nome_favorecido: 'Pessoa B' }] }
};
const moduleIsolado = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/adiantamentoService.js'), 'utf8'), {
  module: moduleIsolado, console, require: name => { if (!(name in deps)) throw Error(`Dependencia nao isolada: ${name}`); return deps[name]; }
});
const service = moduleIsolado.exports;
const req = (ciclo, area = 'ADMINISTRATIVO', valor = 500, anexo = 1) => ({ params: { id: 10 }, user: { id: 9, area },
  body: { ciclo_id: ciclo, itens: [{ obra_id: 2, descricao: 'Despesa', valor }], anexo_ids: [anexo] } });
async function sync() { return modelos.sequelize.transaction(transaction => service.sincronizarBaixa({ solicitacao: row(state.principal), titulos: [], usuarioId: 9, transaction })); }
async function main() {
  reset(); await sync();
  assert.equal(state.ciclos[0].status, 'PRESTACAO_PENDENTE'); assert.equal(state.ciclos[1].status, 'AGUARDANDO_PAGAMENTO');
  assert.equal(state.principal.area_responsavel, 'ADMINISTRATIVO');
  const ctx = await service.contexto({ ...req(2), query: { ciclo_id: 2 } });
  assert.equal(ctx.ciclo.id, 2); assert.equal(ctx.titulo.id, 101); assert.equal(ctx.ciclos[1].nome_favorecido, 'Pessoa B');
  for (const invalido of [undefined, 999, '-1', '1x', [1], true, {}]) await assert.rejects(service.enviar(req(invalido)));
  await assert.rejects(service.contexto({ ...req(1), query: { ciclo_id: 999 } }), /nao pertence/);
  await assert.rejects(service.enviar(req(2, 'ADMINISTRATIVO', 400, 2)), /Conclua o pagamento/);
  negar = true; await assert.rejects(service.contexto(req(1)), /Acesso/); await assert.rejects(service.enviar(req(1)), /Acesso/); negar = false;
  // Mais de um favorecido pago: primeira prestacao nao tira a principal da origem.
  Object.assign(state.titulos[1], { status: 'QUITADO', valor_saldo: 0, valor_baixado: 400 }); await sync();
  const concorrentes = await Promise.allSettled([service.enviar(req(1)), service.enviar(req(1))]);
  assert.equal(concorrentes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(state.principal.area_responsavel, 'ADMINISTRATIVO', 'Restante continua editavel, sem conceder permissao nova');
  await assert.rejects(service.enviar(req(2, 'ADMINISTRATIVO', 400, 1)), /outro favorecido/);
  await service.enviar(req(2, 'ADMINISTRATIVO', 400, 2)); assert.equal(state.principal.area_responsavel, 'GEO');
  await assert.rejects(service.decidir({ ...req(1), body: { ciclo_id: 1, decisao: 'APROVAR' } }), /Somente GEO/);
  const aprovar = c => ({ ...req(c, 'GEO'), body: { ciclo_id: c, decisao: 'APROVAR', data_devolucao: '2099-12-01' } });
  await service.decidir(aprovar(1));
  assert.equal(state.ciclos[0].status, 'DEVOLUCAO_PENDENTE'); assert.equal(state.ciclos[1].status, 'PRESTACAO_ENVIADA');
  const devolucao = state.titulos.find(t => t.origem_titulo === 'DEVOLUCAO_ADIANTAMENTO');
  assert.equal(devolucao.valor_original, 100); assert.equal(devolucao.parceiro_id, 5);
  assert.equal(state.principal.area_responsavel, 'GEO', 'Outra prestacao enviada continua para conferencia');
  await service.decidir(aprovar(2)); assert.equal(state.principal.status_global, 'DEVOLUCAO PENDENTE');
  assert.equal(state.rateios.reduce((s, r) => s + r.valor_rateio, 0), 900, 'Somente despesas reais de cada beneficiario');
  await assert.rejects(service.decidir(aprovar(2)), /Acesso/);
  Object.assign(state.titulos.find(t => t.id === devolucao.id), { status: 'QUITADO', valor_saldo: 0 }); await sync();
  assert.equal(state.principal.status_global, 'PAGA'); assert.ok(state.ciclos.every(c => c.status === 'VALIDADA'));
  Object.assign(state.titulos.find(t => t.id === devolucao.id), { status: 'ABERTO', valor_saldo: 100 }); await sync(); assert.equal(state.principal.status_global, 'DEVOLUCAO PENDENTE');
  state.titulos[0].status = 'ABERTO'; await assert.rejects(sync(), /nao permite estorno/);
  // Migration posterior conserva titulos/ciclos existentes, remove apenas unique da principal.
  const migration = require('../migrations/202610120002_adiantamento_favorecidos');
  let coluna = false, indices = [{ name: 'principal', unique: true, fields: [{ attribute: 'solicitacao_id' }] },
    { name: 'titulo', unique: true, fields: [{ attribute: 'titulo_financeiro_id' }] }], ddl = 0;
  const queryInterface = { describeTable: async () => coluna ? { solicitacao_favorecido_id: {} } : {},
    addColumn: async (_t, _n, f) => { assert.equal(f.allowNull, true); assert.equal(f.references.model, 'solicitacoes_favorecidos'); coluna = true; ddl++; },
    showIndex: async () => [...indices], addIndex: async (_t, fields, opts) => { indices.push({ ...opts, fields: fields.map(attribute => ({ attribute })) }); ddl++; },
    removeIndex: async (_t, name) => { assert.equal(name, 'principal'); assert.ok(indices.some(i => i.name === 'adiantamento_solicitacao')); indices = indices.filter(i => i.name !== name); ddl++; } };
  await migration.up({ DataTypes, queryInterface }); await migration.up({ DataTypes, queryInterface });
  assert.equal(ddl, 4); assert.ok(indices.some(i => i.name === 'titulo')); await assert.rejects(migration.down(), /Preservar/);
  console.log('OK: ciclos separados, ACL, ID estranho, comprovante exclusivo, concorrencia, envio sem bloquear restante, baixa parcial, devolucao individual e encerramento agregado; migration retomavel. Sem banco/rede.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
