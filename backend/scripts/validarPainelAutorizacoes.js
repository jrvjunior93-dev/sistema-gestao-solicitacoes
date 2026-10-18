'use strict';
// Fixtures/VM somente: nao importa models reais, dotenv ou conexao.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { situacaoItem, situacaoLote, projetarLote, projetarLotesAtuais, SITUACAO_SQL } = require('../src/services/pagamentoAutorizacaoSituacao');
const { filtros, consulta } = require('../src/services/pagamentoAutorizacaoConsultaService');
const base = { id: 1, status: 'ENFILEIRADO', snapshot_hash: 'inalterado', valor_snapshot: 100,
  titulo: { status: 'ABERTO', valor_baixado: 0, valor_saldo: 100 }, filaItem: { status: 'PENDENTE' }, lote: { expira_em: '2099-01-01' } };
for (const [alterar, esperado] of [
  [i => i.titulo = null, 'INDISPONIVEL'], [i => i.titulo.status = 'QUITADO', 'QUITADO'],
  [i => i.titulo.status = 'PARCIAL', 'PARCIALMENTE_PAGO'], [i => i.titulo.valor_baixado = 1, 'PARCIALMENTE_PAGO'],
  [i => i.filaItem.status = 'NAO_PAGO', 'NAO_PAGO'], [i => {}, 'NA_FILA'],
  [i => { i.status = 'PENDENTE'; i.filaItem.status = 'NAO_PAGO'; }, 'NAO_PAGO'],
  [i => { i.status = 'PENDENTE'; i.filaItem = null; i.lote.expira_em = '2000-01-01'; }, 'AGUARDANDO'],
  [i => { i.filaItem.status = 'RESOLVIDO'; }, 'PENDENTE_FINANCEIRO'],
  [i => { i.filaItem = null; i.status = 'AUTORIZADO'; }, 'AUTORIZADO'],
  [i => { i.status = 'INVALIDADO'; i.filaItem = null; }, 'INVALIDADO'],
  [i => { i.status = 'REJEITADO'; i.filaItem = null; }, 'REJEITADO'],
  [i => { i.status = 'INVALIDADO'; }, 'NA_FILA'],
  [i => { i.titulo.bloqueio_pagamento_proprietario = { item_id:0 }; }, 'REJEITADO'],
  ...['CANCELADO', 'ESTORNADO', 'PREVISAO', 'RENEGOCIADO'].map(s => [i => i.titulo.status = s, s]),
  [i => { i.titulo.renegociado_por_id = 3; }, 'RENEGOCIADO'],
  [i => { i.titulo.status = 'QUITADO'; i.filaItem.status = 'NAO_PAGO'; }, 'QUITADO']
]) { const item = structuredClone(base); alterar(item); assert.equal(situacaoItem(item), esperado); assert(SITUACAO_SQL.includes(`'${esperado}'`)); }
const origem = { id: 7, status: 'CONCLUIDO', dossie_hash: 'assinado', itens: [structuredClone(base)] };
origem.itens[0].titulo.status = 'QUITADO'; const antes = JSON.stringify(origem), dto = projetarLote(origem);
assert.equal(dto.situacao_financeira, 'QUITADO'); assert.equal(dto.status, 'CONCLUIDO'); assert.equal(JSON.stringify(origem), antes);
assert.equal(dto.itens[0].status, 'ENFILEIRADO'); assert.equal(dto.itens[0].snapshot_hash, 'inalterado');
for (const [estados, esperado] of [
  [['QUITADO','QUITADO'], 'QUITADO'], [['QUITADO','NA_FILA'], 'PARCIALMENTE_PAGO'],
  [['PARCIALMENTE_PAGO','NAO_PAGO'], 'PARCIALMENTE_PAGO'], [['NAO_PAGO','NAO_PAGO'], 'NAO_PAGO'],
  [['NA_FILA','NAO_PAGO'], 'NA_FILA'], [['AGUARDANDO','NA_FILA'], 'AGUARDANDO'], [['REJEITADO','INVALIDADO'], 'MISTO']
]) assert.equal(situacaoLote(estados.map(s => ({ situacao_financeira: s }))), esperado);
for (const query of [ { pagina: '0' }, { limite: '100' }, { limite: '99999' }, { situacao: 'DROP TABLE' },
  { obra: [] }, { obra_id: '1 OR 1=1' }, { pagina: {} }, { vencimento_inicio: '2026-02-30' },
  { vencimento_inicio: '2026-10-18', vencimento_fim: '2026-10-17' }, { item_ids: '1,2,0' },
  { item_ids: Array.from({ length: 201 }, (_, i) => i + 1).join(',') } ]) assert.throws(() => filtros(query));
for (const cursor of [ { sentido: 'PROXIMA' }, { sentido: 'APROVAR', cursor_item_id: '1', cursor_vencimento: '2026-10-17' },
  { sentido: 'ANTERIOR', cursor_item_id: '1 OR 1=1', cursor_vencimento: 'SEM_DATA' },
  { sentido: 'PROXIMA', cursor_item_id: '1', cursor_vencimento: '2026-02-30' },
  { sentido: 'PROXIMA', cursor_item_id: '1', cursor_vencimento: '2026-10-17', pagina: '2' },
  { sentido: 'PROXIMA', cursor_item_id: '1', cursor_vencimento: '2026-10-17', item_ids: '1' } ]) assert.throws(() => filtros(cursor));
assert.equal(filtros({ sentido: 'PROXIMA', cursor_item_id: '1', cursor_vencimento: 'SEM_DATA' }).cursorId, 1);
const sql = consulta({ situacao: 'QUITADO', obra: "Obra_%' OR 1=1 --", vencimento_inicio: '2026-10-01', pagina: '20' });
assert(!sql.cte.includes("OR 1=1 --")); assert.equal(sql.replacements.obra, "%Obra!_!%' OR 1=1 --%"); assert.equal(sql.replacements.offset, 570);
assert(sql.cte.indexOf('situacao_financeira = :situacao') < sql.cte.indexOf('pesos AS'));
assert(sql.cte.includes('MAX(id) autorizacao_id')); assert(sql.cte.includes('MAX(id) fila_id')); assert(sql.cte.includes('t.deleted_at IS NULL'));
assert(sql.cte.includes('WHERE 1=0'), 'Sem filtro por pagamento nao varrer movimentos');
assert.equal(filtros({ data_tipo:'PAGAMENTO',data_inicio:'2026-10-18' }).dataTipo,'PAGAMENTO');
assert.equal(filtros({ item_ids:'-11,5',sentido:'' }).ids[0],-11);
for(const q of [{ data_tipo:'MOVIMENTO' }, { data_inicio:'2026-02-30' }, { item_ids:'-9007199254740992' }]) assert.throws(()=>filtros(q));
assert(!/\b(UPDATE|INSERT|DELETE|ALTER|CREATE|DROP)\s/i.test(consulta({}).cte));

// Servico ativo em VM, ACL nominal e paginacao real dos lotes sem teto 100.
let permitir = true, leituras = 0, autorAtivo = false; const env = { paymentOwnerApprovalMode: 'PILOT' };
const lotes = Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, status: 'CONCLUIDO', itens: [base] }));
const db = { PagamentoAutorizacaoLote: {
  findAll: async o => { leituras++; assert(o.limit <= 50); assert(o.order.some(v => v[0] === 'id')); return lotes.slice(o.offset, o.offset + o.limit); },
  count: async () => lotes.length, findByPk: async id => lotes.find(l => l.id === id)
}, PagamentoAutorizador: { findOne: async () => autorAtivo ? { usuario_id: 1, ativo: true } : null }, WebauthnCredential: { count: async () => { throw Error('Leitura nao deve contar passkeys'); } } };
const moduleVm = { exports: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../src/services/pagamentoAutorizacaoService'), 'utf8'), {
  module: moduleVm, Date, Map, Set, structuredClone, console,
  require(id) {
    if (id === 'crypto' || id === 'sequelize') return require(id);
    if (id === '../models') return db;
    if (id === '../config/env') return { env };
    if (id === './authorizationService') return { userHasNominalAreaPermission: async (user, keys) => permitir && keys.every(k => !user.grants || user.grants.includes(k)) };
    if (id === './webPushService') return { isConfigured: () => false, hasActiveSubscription: async () => { throw Error('Leitura nao deve consultar push'); } };
    if (id === './pagamentoAutorizacaoSituacao') return require('../src/services/pagamentoAutorizacaoSituacao');
    if (id === './pagamentoAutorizacaoConsultaService') return { ...require('../src/services/pagamentoAutorizacaoConsultaService'),
      listarObras: async () => { leituras++; return {}; }, listarTitulos: async () => { leituras++; return {}; } };
    return {};
  }
});
(async () => {
  const loteFilaAntiga = { id: 1, status: 'CONCLUIDO', itens: [{ ...base, titulo_financeiro_id: 9, fila_item_id: 1 }] };
  const copiaFila = JSON.stringify(loteFilaAntiga); let consultasFila = 0;
  const atual = await projetarLotesAtuais([loteFilaAntiga], { query: async (sql, options) => {
    consultasFila++; assert(sql.startsWith('SELECT ')); assert.deepEqual(options.replacements.lotes, [1]);
    return [{ id: 8, titulo_financeiro_id: 9, status: 'NAO_PAGO' }];
  } });
  assert.equal(consultasFila, 1); assert.equal(atual[0].situacao_financeira, 'NAO_PAGO'); assert.equal(atual[0].itens[0].fila_item_id, 1);
  assert.equal(JSON.stringify(loteFilaAntiga), copiaFila, 'Vinculo antigo nao e reescrito para exibir fila atual');
  const service = moduleVm.exports, req = { user: { id: 1 } }, ids = [];
  for (let pagina = 1; pagina <= 34; pagina++) {
    const r = await service.listBatchesPage(req, { pagina: String(pagina), limite: '30' });
    assert.equal(r.paginacao.total, 1001); assert.equal(r.paginacao.mais, pagina < 34); ids.push(...r.data.map(l => l.id));
  }
  assert.equal(new Set(ids).size, 1001); assert.equal(ids.length, 1001);
  permitir = false; const contador = leituras;
  for (const fn of ['listBatchesPage', 'listWorks', 'listTitles']) await assert.rejects(service[fn](req), e => e.statusCode === 403);
  assert.equal(leituras, contador, 'Negativa antes da consulta');
  permitir = true; env.paymentOwnerApprovalMode = 'OFF';
  for (const fn of ['listBatchesPage', 'listWorks', 'listTitles']) await assert.rejects(service[fn](req), e => e.statusCode === 404);
  env.paymentOwnerApprovalMode = 'PAUSED'; await service.listWorks(req); // Leitura preservada na pausa.
  for (const grant of ['visualizar','preparar','configurar']) await service.listWorks({ user: { id: 1, grants: ['financeiro.autorizacoes_pagamento.' + grant] } });
  const apenasDecide = { user: { id: 1, grants: ['financeiro.autorizacoes_pagamento.decidir'] } };
  await assert.rejects(service.listWorks(apenasDecide), e => e.statusCode === 403);
  autorAtivo = true; await service.listWorks(apenasDecide);
  await assert.rejects(service.listWorks({ user: { id: 1, grants: [] } }), e => e.statusCode === 403);
  const verificarDev = require('./verificarPainelAutorizacoesDev');
  let consultou = false;
  await assert.rejects(verificarDev.executar({ db: { sequelize: { query: async () => { consultou = true; } } }, env: { deploymentEnvironment: 'production' } }), /EXCLUSIVO_DEV/);
  assert.equal(consultou, false, 'EXPLAIN DEV nunca consulta producao');
  assert.equal(JSON.stringify(origem), antes);
  console.log('Painel autorizacoes: estados financeiros/estorno/nao pago, dossie imutavel, lotes mistos, filtros parametrizados/negativas, ACL nominal/OFF/PAUSED e 1001 lotes em 34 paginas aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
