'use strict';
// Servicos reais com transacoes/persistencia simuladas. Sem dotenv, DB ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const f = require('./validarTituloRenegociacaoService');
const pagamento = require('../src/services/tituloNegociacaoPagamentoService');
const { req } = f;
const pix = { forma_pagamento_id: 1, favorecido_id: 9, chave_pix: 'email-qa@example.invalid', dados_pagamento: 'Acordo QA' };
async function acordo() {
  f.reset();
  const body = await f.preparar();
  return f.service.confirmar(req, body, 'negociacao-pagamento-qa');
}
async function editar(id, patch = pix, revision) {
  const atual = await pagamento.consultar(req, id);
  return pagamento.atualizar(req, id, { pagamento: patch, revisao: revision || atual.revisao });
}
const valores = t => Object.fromEntries(Object.entries(t).filter(([k]) => ![
  'pagamento_negociacao', 'forma_pagamento_id', 'favorecido_pagamento_id', 'atualizado_por', 'updatedAt'
].includes(k)));
(async () => {
  let result = await acordo(), id = result.titulos[0].id;
  const original = structuredClone(f.state);
  assert.equal(f.state.titulos[2].pagamento_negociacao.favorecido_id, 7);
  const antes = await pagamento.consultar(req, id);
  assert.equal(f.state.auditoria.length, original.auditoria.length, 'GET sem escrita');
  const atualizado = await editar(id);
  assert.equal(atualizado.pagamento.favorecido_id, 9);
  assert.equal(f.state.titulos[0].parceiro_id, 7);
  assert.equal(f.state.auditoria.length, original.auditoria.length + 1);
  assert.equal(f.state.historico.length, original.historico.length + 2);
  assert.deepEqual(valores(f.state.titulos[2]), valores(original.titulos[2]));
  assert.deepEqual(f.state.titulos.slice(0, 2), original.titulos.slice(0, 2));
  assert.deepEqual(f.state.alocacoes, original.alocacoes); assert.deepEqual(f.state.rateios, original.rateios);
  assert.deepEqual(f.state.negociacoes, original.negociacoes, 'Snapshot/resultado original permanece imutavel');
  assert.equal(f.state.auditoria.at(-1).metadata.antes.favorecido_id, 7);
  assert.equal(f.state.auditoria.at(-1).metadata.depois.favorecido_id, 9);
  await pagamento.atualizar(req, id, { pagamento: pix, revisao: antes.revisao });
  assert.equal(f.state.auditoria.length, original.auditoria.length + 1, 'Retry nao duplica auditoria');
  await assert.rejects(pagamento.atualizar(req, id, { pagamento: { ...pix, chave_pix: 'outra' }, revisao: antes.revisao }), /mudou/);

  const atual = await pagamento.consultar(req, id);
  const concorrentes = await Promise.allSettled(['pix-a', 'pix-b'].map(chave_pix =>
    pagamento.atualizar(req, id, { pagamento: { ...pix, chave_pix }, revisao: atual.revisao })));
  assert.equal(concorrentes.filter(r => r.status === 'fulfilled').length, 1, 'Lock/revisao impede sobrescrita concorrente');
  assert.throws(() => pagamento.validar(undefined));
  for (const patch of [{}, { ...pix, valor: 1 }, { ...pix, forma_pagamento_id: 999 },
    { ...pix, forma_pagamento_id: 4 }, { ...pix, forma_pagamento_id: 5 }, { ...pix, favorecido_id: 10 },
    { ...pix, favorecido_id: 999 }, { ...pix, chave_pix: '' }, { ...pix, dados_pagamento: 'a'.repeat(2001) },
    { ...pix, chave_pix: 'a'.repeat(8193) }, { ...pix, forma_pagamento_id: 3, dados_pagamento: '' }]) {
    await assert.rejects(editar(id, patch));
  }
  await editar(id, { forma_pagamento_id: 2, favorecido_id: 9, dados_pagamento: 'Anexar boleto pelo fluxo atual' });
  await editar(id, { forma_pagamento_id: 3, favorecido_id: 9, dados_pagamento: 'Banco QA / agencia QA / conta QA' });
  f.permissoesNegadas.add('financeiro.titulos.editar');
  await assert.rejects(pagamento.consultar(req, id), /permissao/);
  f.permissoesNegadas.clear(); f.setObras([3]);
  await assert.rejects(pagamento.consultar(req, id), /todas as obras/);
  f.setObras(null);
  const revisaoAntesDoBloqueio = (await pagamento.consultar(req, id)).revisao;
  for (const nome of ['MovimentoFinanceiro', 'PaymentIntent', 'PagamentoManualFilaItem', 'PagamentoAutorizacaoItem']) {
    f.state.bloqueios[nome] = true;
    await assert.rejects(pagamento.consultar(req, id), /Existe baixa/);
    const qtdEventos = f.state.auditoria.length;
    await assert.rejects(pagamento.atualizar(req, id, { pagamento: pix, revisao: revisaoAntesDoBloqueio }), /Existe baixa/);
    assert.equal(f.state.auditoria.length, qtdEventos, 'Bloqueio revalidado dentro do PATCH');
    f.state.bloqueios[nome] = false;
  }
  const row = f.state.titulos.find(t => t.id === id);
  for (const patch of [{ status: 'PARCIAL' }, { valor_baixado: 1 }, { status: 'QUITADO' },
    { renegociado_por_id: 7 }, { compartilhamento_id: 1 }, { cartao_id: 1 }, { linha_digitavel: '123' },
    { status_cobranca: 'EMITIDO' }, { payment_beneficiary_id: 1 }, { bloqueio_pagamento_proprietario: { motivo: 'QA' } },
    { bloqueado_retorno_obra: true }]) {
    const prev = structuredClone(row); Object.assign(row, patch);
    await assert.rejects(pagamento.consultar(req, id));
    for (const k of Object.keys(row)) delete row[k]; Object.assign(row, prev);
  }
  f.state.titulos[0].bloqueado_retorno_obra = true;
  await assert.rejects(pagamento.consultar(req, id), /bloqueada/);
  delete f.state.titulos[0].bloqueado_retorno_obra;
  await assert.rejects(pagamento.consultar(req, 1), /Somente|vinculos/);
  const rev = (await pagamento.consultar(req, id)).revisao;
  await assert.rejects(pagamento.atualizar(req, id, { pagamento: pix, revisao: rev, valor_original: 1 }), /Consulte/);
  const createAudit = f.db.SecurityEventLog.create;
  f.db.SecurityEventLog.create = async () => { throw new Error('Falha auditoria QA'); };
  const rollback = structuredClone(f.state);
  await assert.rejects(editar(id, pix), /Falha auditoria/);
  assert.deepEqual(f.state, rollback, 'Falha na auditoria reverte pagamento');
  f.db.SecurityEventLog.create = createAudit;

  // Reproduz titulo legado sem instrucao estruturada, sem acessar TIT real.
  result = await acordo(); id = result.titulos[0].id;
  const legado = f.state.titulos.find(t => t.id === id); legado.codigo = 'TIT-011543';
  delete legado.pagamento_negociacao; delete legado.forma_pagamento_id; delete legado.favorecido_pagamento_id;
  await editar(id);
  assert.equal(legado.pagamento_negociacao.favorecido_id, 9);
  assert.equal(legado.codigo, 'TIT-011543');
  const projetado = { ...legado };
  await require('../src/services/instrucaoFinanceiraFavorecidoService').anexarInstrucoes([projetado]);
  assert.deepEqual(projetado.instrucao_favorecido, legado.pagamento_negociacao, 'Fila usa a instrucao do proprio titulo');
  // Hash condicional: nenhum dossie legado muda; alteracao de PIX/dados invalida material novo.
  const authSource = fs.readFileSync(path.join(__dirname, '../src/services/pagamentoAutorizacaoService.js'), 'utf8');
  const inicio = authSource.indexOf('function buildSnapshot(title) {');
  const func = authSource.slice(inicio, authSource.indexOf('\n}', inicio) + 2);
  const { sha256 } = require('../src/services/pagamentoAutorizacaoEventosService');
  const ctxSnapshot = { roundCurrency: Number, maskDocument: String, maskPaymentValue: String, sha256 };
  const buildSnapshot = vm.runInNewContext(`${func};buildSnapshot`, ctxSnapshot);
  const anterior = vm.runInNewContext(`${func.replace(/^.*pagamento_negociacao_hash.*\n/m, '')};buildSnapshot`, ctxSnapshot);
  const semInstrucao = { ...legado, pagamento_negociacao: null };
  assert.equal(JSON.stringify(buildSnapshot(semInstrucao)), JSON.stringify(anterior(semInstrucao)));
  assert.notEqual(buildSnapshot(legado).pagamento_negociacao_hash,
    buildSnapshot({ ...legado, pagamento_negociacao: { ...legado.pagamento_negociacao, dados_pagamento: 'Outra instrucao' } }).pagamento_negociacao_hash);
  f.reset();
  const previa = await f.service.preview(req, f.payload);
  await assert.rejects(f.service.confirmar(req, { ...f.payload, pagamento: pix, preview_hash: previa.preview_hash }, 'preview-pagamento-qa'), /mudaram/);
  assert.equal(f.state.negociacoes.length, 0, 'Trocar instrucao exige nova previa');
  await assert.rejects(f.service.preview(req, { ...f.payload, pagamento: undefined }), /pagamento/);

  // Migration idempotente e estrutural, com utilitarios reais e sem conectar.
  let coluna = false, adds = 0;
  const sequelize = { query: async (sql, { replacements }) => sql.includes('TABLE_NAME\n')
    ? [[{ TABLE_NAME: 'titulos_financeiros' }]] : [[{ total: coluna ? 1 : 0 }]] };
  const migration = require('../migrations/202610220001_titulo_negociacao_pagamento');
  const ctx = { sequelize, DataTypes: { JSON: 'JSON' }, queryInterface: { addColumn: async (table, field, def) => {
    assert.equal(table, 'titulos_financeiros'); assert.equal(field, 'pagamento_negociacao');
    assert.equal(def.allowNull, true); coluna = true; adds++;
  } } };
  await migration.up(ctx); await migration.up(ctx); assert.equal(adds, 1);
  await assert.rejects(migration.down(), /preservar/);
  const runner = fs.readFileSync(path.join(__dirname, '../src/database/runMigrations.js'), 'utf8');
  const patterns = vm.runInNewContext(`${runner.slice(runner.indexOf('const DATA_MUTATION_PATTERNS'), runner.indexOf('\nasync function ensureMigrationsTable'))};DATA_MUTATION_PATTERNS`);
  const migrationText = fs.readFileSync(require.resolve('../migrations/202610220001_titulo_negociacao_pagamento'), 'utf8');
  assert.equal(patterns.find(p => p.pattern.test(migrationText)), undefined);
  console.log('OK: negociacao com pagamento, legado TIT-011543 simulado, edicao restrita, previa/hash/replay/concorrencia/rollback, ACL/obras/origens, baixa/fila/autorizacao/boleto/cartao, auditoria/historico, valores/rateios intactos e migration estrutural idempotente. Sem DB/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
