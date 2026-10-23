'use strict';
// Servicos reais de titulo/fatura/desvinculacao; modelos em memoria. Sem .env,
// banco, rede, migrations ou alteracoes de dados reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { h, load, memoria, reset: resetBase, previsao } = require('./validarFilaPrevisaoCartao');
const { state, models, dependencies, req } = h;
const { validateTituloDesvincularFaturaBody: validate } = require('../src/validators/tituloDesvincularFaturaValidator');
let falharRecalculo = false, falharAudit = false, falharRecibo = false;
const encontrarAudit = options => state.eventos.find(e => e.tipo_evento === options.where.tipo_evento
  && e.recurso_tipo === options.where.recurso_tipo && e.recurso_id === options.where.recurso_id
  && e.metadata?.idempotency_key === options.where.metadata.idempotency_key) || null;
models.SecurityEventLog.findOne = async options => { assert(options.transaction && options.lock); return encontrarAudit(options); };
models.SecurityEventLog.findAll = memoria('eventos').findAll;
const registrarAudit = models.SecurityEventLog.create;
models.SecurityEventLog.create = async (...args) => { if (falharAudit) throw Error('Auditoria indisponivel'); return registrarAudit(...args); };
models.PaymentIntent = memoria('intents');
models.PagamentoAutorizacaoItem = memoria('autorizacoes');
models.LogExclusao = memoria('recibos');
const criarRecibo = models.LogExclusao.create;
models.LogExclusao.create = async (...args) => { if (falharRecibo) throw Error('Recibo indisponivel'); return criarRecibo(...args); };
const auditoria = load('tituloDesvincularFaturaAuditoriaService', dependencies);
dependencies['./tituloDesvincularFaturaAuditoriaService'] = auditoria;
dependencies['./favorecidoEdicaoAuditoriaService'] = { listarEventos: async () => [] };
const atualizarFatura = models.FaturaCartaoFinanceiro.update;
models.FaturaCartaoFinanceiro.update = async (...args) => {
  if (falharRecalculo) throw Error('Recalculo indisponivel'); return atualizarFatura(...args);
};
const service = load('tituloDesvincularFaturaService', { ...dependencies,
  './tituloFinanceiroService': h.isolated.exports,
  './pagamentoFilaPrevisaoCartaoService': previsao,
  './tituloDesvincularFaturaAuditoriaService': auditoria,
  './authorizationService': { ...dependencies['./authorizationService'],
    userHasAreaPermission: async (actor, keys) => {
      assert.deepEqual(Array.from(keys), ['financeiro.titulos.editar']); return actor.editar !== false;
    } },
  '../validators/tituloDesvincularFaturaValidator': { validateTituloDesvincularFaturaBody: validate }
});
function reset() {
  resetBase(); state.intents = []; state.autorizacoes = []; state.recibos = [];
  falharRecalculo = false; falharAudit = false; falharRecibo = false; req.user.editar = true;
}
const body = { motivo: 'Correcao de previsao cadastrada incorretamente', idempotency_key: 'desvincular-qa-0001', fatura_cartao_id: 79 };
const executar = (payload = body) => service.desvincularFaturaTitulo(req, 1, payload);
const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(state)
  .filter(([key]) => !['commits', 'rollbacks'].includes(key))));
async function main() {
  for (const change of [{ motivo: '' }, { motivo: 'ab' }, { idempotency_key: '' }, { idempotency_key: 'curta' },
    { fatura_cartao_id: -1 }, { fatura_cartao_id: 'abc' }, { valor: 50 }, { autorizadoPorFilaPagamento: true }]) {
    assert.throws(() => validate({ ...body, ...change }));
  }
  reset(); const antes = { ...state.titulos[0] };
  await executar();
  const titulo = state.titulos[0];
  assert.equal(titulo.fatura_cartao_id, null); assert.equal(titulo.cartao_id, null);
  assert.equal(titulo.valor_original, antes.valor_original); assert.equal(titulo.valor_saldo, antes.valor_saldo);
  assert.equal(titulo.status, 'ABERTO'); assert.equal(titulo.numero_parcela, 1); assert.equal(titulo.total_parcelas, 2);
  assert.equal(state.faturas[0].valor_total, 0); assert.equal(state.faturas[0].status, 'ABERTA');
  assert.equal(state.vinculos.length, 0); assert.equal(state.movimentos.length, 0);
  assert.equal(state.historico.length, 0, 'Nao cria autoria na solicitacao nem amplia visibilidade');
  assert.equal(state.eventos.length, 1);
  assert.equal(state.recibos.length, 1); assert.equal(state.recibos[0].solicitacao_id, null);
  assert.equal(state.eventos[0].metadata.antes.fatura_cartao_id, 79);
  const apos = snapshot(); assert.equal((await executar()).idempotente, true);
  assert.equal(snapshot(), apos, 'Replay nao duplica historico nem altera novamente');
  assert.equal((await h.isolated.exports.listarAuditoriaTitulo(req, 1)).length, 1, 'Nao duplica trilha duravel e log');
  state.eventos = []; // Retencao do log de seguranca nao elimina trilha nem replay.
  assert.equal((await executar()).idempotente, true);
  const trilha = await h.isolated.exports.listarAuditoriaTitulo(req, 1);
  assert.equal(trilha.length, 1); assert.equal(trilha[0].metadata.antes.fatura_cartao_id, 79);
  await assert.rejects(executar({ ...body, motivo: 'Outro motivo' }), /Chave ja utilizada/);
  req.user.id = 88; await assert.rejects(executar(), /Chave ja utilizada/); req.user.id = 99;
  // Replay revalida acesso inclusive quando o estado ja foi corrigido.
  req.user.scope = [2]; await assert.rejects(executar(), /acesso|escopo/i); req.user.scope = null;
  await assert.rejects(executar({ ...body, idempotency_key: 'nova-chave-qa-0002' }), /vinculo|Vinculo/);

  // A edicao canonica passa a aceitar o novo valor, sem baixa ou fatura.
  await h.isolated.exports.atualizarTitulo(req, 1, { tipo: 'PAGAR', status: 'ABERTO',
    obra_id: 1, parceiro_id: 1, categoria_financeira_id: 1, descricao: 'Valor corrigido QA',
    valor: 250, impostos: [], juros: 0, multa: 0, data_vencimento: '2026-11-01',
    competencia_data: '2026-10-16', considera_dre: false });
  assert.equal(state.titulos[0].valor_original, 250); assert.equal(state.titulos[0].valor_saldo, 250);
  assert.equal(state.movimentos.length, 0); assert.equal(state.faturas[0].valor_total, 0);

  // Outros titulos da mesma fatura sao mantidos, sem dados deles no retorno.
  reset(); state.titulos.push(h.registro({ id: 2, fatura_cartao_id: 79, valor_original: 300 }));
  state.vinculos.push(h.registro({ id: 2, fatura_cartao_id: 79, titulo_financeiro_id: 2 }));
  const resultado = await executar(); assert.equal(state.faturas[0].valor_total, 300);
  assert.equal(state.vinculos[0].titulo_financeiro_id, 2);
  assert(!('valor_total' in resultado)); assert(!('fatura_anterior_total_recalculado' in state.eventos[0].metadata));

  for (const [alterar, erro] of [
    [() => { req.user.editar = false; }, /Permissao/],
    [() => { req.user.scope = [2]; }, /acesso|escopo/i],
    [() => { state.titulos[0].status = 'QUITADO'; }, /Somente/],
    [() => { state.titulos[0].valor_baixado = 1; }, /Somente/],
    [() => { state.titulos[0].tipo = 'RECEBER'; }, /Somente/],
    [() => { state.titulos[0].renegociado_por_id = 20; }, /especializado/],
    [() => { state.titulos[0].origem_titulo = 'RH_DP'; }, /especializado/],
    [() => { state.titulos[0].origem_titulo = 'RECARGA_CARTAO'; }, /especializado/],
    [() => { state.titulos[0].bloqueado_retorno_obra = true; }, /bloqueada|bloqueado/i],
    [() => { state.fila.push(h.registro({ id: 1, titulo_financeiro_id: 1, status: 'PENDENTE' })); }, /fila/],
    [() => { state.intents.push(h.registro({ id: 1, titulo_financeiro_id: 1, status: 'PREPARADO' })); }, /fila/],
    [() => { state.autorizacoes.push(h.registro({ id: 1, titulo_financeiro_id: 1, status: 'AUTORIZADO' })); }, /fila/],
    [() => { state.autorizacoes.push(h.registro({ id: 1, titulo_financeiro_id: 1, status: 'PENDENTE' })); }, /fila/],
    [() => { state.faturas[0].status = 'PAGA'; }, /fatura prevista/],
    [() => { state.faturas[0].status = 'FECHADA'; }, /fatura prevista/],
    [() => { state.faturas[0].data_pagamento = '2026-10-15'; }, /fatura prevista/],
    [() => { state.movimentos.push(h.registro({ id: 1, titulo_financeiro_id: 1, status: 'ATIVO' })); }, /movimento/],
    [() => { state.movimentos.push(h.registro({ id: 2, fatura_cartao_id: 79, tipo_movimento: 'PAGAMENTO_FATURA', status: 'ATIVO' })); }, /movimento/],
    [() => { state.vinculos.length = 0; }, /Vinculo/]
  ]) {
    reset(); alterar(); const antesErro = snapshot();
    await assert.rejects(executar(), erro); assert.equal(snapshot(), antesErro, 'Rejeicao nao altera registros');
  }
  for (const campo of ['compartilhamento_id', 'renegociacao_id']) {
    // A ACL especializada e executada antes de qualquer mutacao; a fixture
    // recusa dependencia nao simulada em vez de dispensar a regra especializada.
    reset(); state.titulos[0][campo] = 5; const antesErro = snapshot();
    await assert.rejects(executar()); assert.equal(snapshot(), antesErro);
  }
  for (const falhar of [() => { falharRecalculo = true; }, () => { falharAudit = true; }, () => { falharRecibo = true; }]) {
    reset(); falhar(); const antesErro = snapshot();
    await assert.rejects(executar(), /indisponivel/); assert.equal(snapshot(), antesErro, 'Rollback restaura vinculo/fatura/titulo');
  }
  reset(); await assert.rejects(executar({ ...body, fatura_cartao_id: 80 }), /vinculo|Vinculo/);
  assert.equal(state.vinculos.length, 1);
  // Duas chamadas, serializacao equivalente ao lock do titulo, sem MySQL real.
  const transaction = models.sequelize.transaction; let cauda = Promise.resolve();
  models.sequelize.transaction = callback => { const atual = cauda.then(() => transaction(callback)); cauda = atual.catch(() => {}); return atual; };
  try { await Promise.all([executar(), executar()]); } finally { models.sequelize.transaction = transaction; }
  assert.equal(state.eventos.length, 1); assert.equal(state.historico.length, 0);
  assert.equal(state.recibos.length, 1);
  const { PERMISSOES_ROTAS_FINANCEIRAS: permissoes } = require('../src/services/financeiroRotaPermissoesService');
  assert.deepEqual(permissoes['POST /financeiro/titulos/:id/desvincular-fatura'], ['financeiro.titulos.editar']);
  const route = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8').split('\n').find(line => line.includes("router.post('/financeiro/titulos/:id/desvincular-fatura'"));
  for (const guard of ['allowFinanceiro', 'criticalRateLimit', 'validateNumericIdParam', 'validateTituloDesvincularFaturaBody']) assert(route.includes(guard));
  console.log('OK: desvinculacao real atomica/auditada/idempotente, motivo/rota estritos, ACL/edicao, faturas/pagamentos/fila/autorizacoes protegidos, valor editavel e sem baixa. Banco somente simulado.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
