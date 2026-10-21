'use strict';
// Servicos reais; modelos/transacoes exclusivamente em memoria. Nao carregar .env/database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { h, load, memoria } = require('./validarFilaPrevisaoCartao');
const domain = require('../src/services/cartaoParcelamentoDomain');
const validators = require('../src/validators/financialValidators');
const queueValidators = require('../src/validators/paymentValidators');
const { state, models, dependencies, queueDependencies, registro, req, isolated, cartoes } = h;
models.CartaoBaixaParcela = memoria('parcelas');
models.PagamentoFilaLiquidacao = memoria('grupos');
dependencies['./cartaoParcelamentoDomain'] = domain;
queueDependencies['./cartaoParcelamentoDomain'] = domain;
const faturas = load('faturaCartaoFinanceiroService', dependencies);
Object.assign(h.faturaMocks, faturas);
const parcelamento = load('cartaoParcelamentoService', { ...dependencies, './faturaCartaoFinanceiroService': faturas });
dependencies['./cartaoParcelamentoService'] = parcelamento;
queueDependencies['./cartaoParcelamentoService'] = parcelamento;
// Baixa e estorno reais precisam estar presentes antes do destructuring do servico.
queueDependencies['./tituloFinanceiroService'] = isolated.exports;
const fila = load('pagamentoManualFilaService', queueDependencies);
queueDependencies['./pagamentoFilaRateioDomain'] = require('../src/services/pagamentoFilaRateioDomain');
queueDependencies['./pagamentoFilaLiquidacaoService'] = load('pagamentoFilaLiquidacaoService', queueDependencies);
const oldAll = models.CartaoBaixaParcela.findAll;
models.CartaoBaixaParcela.findAll = async options => (await oldAll(options)).map(row => Object.assign(row, { titulo: state.titulos.find(t => t.id === row.titulo_financeiro_id) }));
const faturaByPk = models.FaturaCartaoFinanceiro.findByPk;
models.FaturaCartaoFinanceiro.findByPk = async (...args) => {
  const row = await faturaByPk(...args);
  if (row) { row.cartao = cartoes.find(c => c.id === row.cartao_id); row.titulos = state.titulos.filter(t => t.fatura_cartao_id === row.id); }
  return row;
};
// Modelos manuais precisam restaurar tambem o estado quando o servico usa ownTransaction.
models.sequelize.transaction = async callback => {
  const snapshot = JSON.stringify(state);
  const tx = { LOCK: { UPDATE: 'UPDATE' }, commit: async () => { state.commits++; }, rollback: async () => {
    const anterior = JSON.parse(snapshot);
    for (const [key, value] of Object.entries(anterior)) state[key] = Array.isArray(value) ? value.map(registro) : value;
    state.rollbacks++;
  } };
  if (!callback) return tx;
  try { const value = await callback(tx); await tx.commit(); return value; } catch (error) { await tx.rollback(); throw error; }
};
const key = 'qa-cartao-baixa-123456789';
const input = (extra = {}) => validators.validateFinanceTituloBaixaBody({ empresa_id: 1, cartao_id: 10,
  forma_recebimento: 'CARTAO', valor: 2740, juros: 0, multa: 0, desconto: 0, data_movimento: '2026-10-19',
  parcelamento_cartao: { quantidade_parcelas: 6, data_compra: '2026-10-19', chave_idempotencia: key }, ...extra });
function reset() {
  h.reset(); state.vinculos = []; state.parcelas = []; state.grupos = [];
  req.user.scope = null;
  Object.assign(cartoes[0], { dia_fechamento: 10, dia_vencimento: 20 });
  state.titulos.push(registro({ id: 1, codigo: 'TIT-CARTAO-QA', solicitacao_id: 100, obra_id: 1, empresa_id: 1,
    tipo: 'PAGAR', status: 'ABERTO', valor_original: 2740, valor_saldo: 2740, valor_baixado: 0 }));
}
const somaFaturas = () => Math.round(state.faturas.reduce((sum, f) => sum + Number(f.valor_total || 0), 0) * 100);
async function main() {
  reset();
  const result = await isolated.exports.baixarTitulo(req, 1, input());
  assert.equal(state.movimentos.length, 1); assert.equal(state.titulos.length, 1);
  assert.equal(result.movimento_financeiro_id, 1); assert.equal(state.titulos[0].valor_saldo, 0);
  assert.equal(state.titulos[0].fatura_cartao_id, null); assert.equal(state.movimentos[0].fatura_cartao_id, null);
  assert.equal(state.movimentos[0].forma_recebimento, 'CARTAO_CREDITO');
  assert.equal(state.parcelas.length, 6); assert.equal(state.faturas.length, 6); assert.equal(somaFaturas(), 274000);
  assert.deepEqual(state.parcelas.map(p => p.valor), [456.67,456.67,456.67,456.67,456.66,456.66]);
  assert.equal(state.faturas[0].data_vencimento, '2026-11-20'); assert.equal(state.faturas[5].data_vencimento, '2027-04-20');
  const replay = await isolated.exports.baixarTitulo(req, 1, input());
  assert(replay.idempotente); assert.equal(state.movimentos.length, 1); assert.equal(state.parcelas.length, 6);
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, input({ valor: 2000 })), /Chave de baixa/);
  const contaByPk = models.ContaBancaria.findByPk;
  models.ContaBancaria.findByPk = async id => Number(id) === 6 ? { id: 6, empresa_id: 1, ativo: true } : contaByPk(id);
  // Pagar uma fatura movimenta apenas seu valor, sem criar outra baixa do titulo.
  await faturas.baixarFaturaCartao(req, state.faturas[0].id, { conta_bancaria_id: 6, data_movimento: '2026-11-20' });
  assert.equal(state.movimentos.filter(m => m.tipo_movimento === 'BAIXA').length, 1);
  assert.equal(state.movimentos.find(m => m.tipo_movimento === 'PAGAMENTO_FATURA').valor, -456.67);
  assert.equal(state.titulos[0].valor_baixado, 2740);
  const snapshot = JSON.stringify(state.parcelas);
  state.faturas[3].status = 'PAGA';
  await assert.rejects(isolated.exports.estornarMovimentoTitulo(req, 1, 1), /fatura do parcelamento/);
  assert.equal(JSON.stringify(state.parcelas), snapshot); assert.equal(state.movimentos[0].status, 'ATIVO');
  state.faturas[3].status = 'ABERTA';
  // Ainda bloqueado pela primeira fatura efetivamente paga, mesmo com status adulterado.
  state.faturas[0].status = 'ABERTA';
  await assert.rejects(isolated.exports.estornarMovimentoTitulo(req, 1, 1), /fatura do parcelamento/);
  state.faturas[0].data_pagamento = null; state.faturas[0].pago_por = null;
  await assert.rejects(isolated.exports.estornarMovimentoTitulo(req, 1, 1), /possui pagamento/);
  state.movimentos.filter(m => m.tipo_movimento !== 'BAIXA').forEach(m => { m.status = 'ESTORNADO'; });
  await isolated.exports.estornarMovimentoTitulo(req, 1, 1);
  assert(state.parcelas.every(p => p.status === 'ESTORNADA')); assert.equal(somaFaturas(), 0);
  assert.equal(state.titulos[0].valor_saldo, 2740); assert.equal(state.movimentos[0].status, 'ESTORNADO');
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, input()), /Chave de baixa/);

  reset(); req.user.scope = [99];
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, input()), /Acesso negado/); assert.equal(state.movimentos.length, 0);
  reset(); state.titulos[0].bloqueio_retorno_obra = true;
  // Protecao explicita de titulo ja quitado nao e enfraquecida pelo campo novo.
  state.titulos[0].status = 'QUITADO';
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, input()), /Somente titulos/);
  reset();
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, input({ cartao_id: 20 })), /cartao de credito/);
  assert.equal(state.movimentos.length, 0);
  reset(); state.faturas.push(registro({ id: 70, cartao_id: 10, competencia: '2027-01', status: 'PAGA' }));
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, input()), /fatura desta compra nao esta aberta/);
  assert.equal(state.faturas.length, 1); assert.equal(state.movimentos.length, 0); assert.equal(state.parcelas.length, 0);
  reset();
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, input({ parcelamento_cartao: { quantidade_parcelas: 6,
    data_compra: '2026-10-19', chave_idempotencia: key, calendario: { dia_fechamento: 15, dia_vencimento: 20 } } })), /calendario do cartao mudou/);
  assert.equal(state.movimentos.length, 0); assert.equal(state.faturas.length, 0);
  reset();
  const originalCreate = models.CartaoBaixaParcela.create;
  models.CartaoBaixaParcela.create = async (data, options) => { if (data.numero_parcela === 4) throw Error('Falha simulada de parcela'); return originalCreate(data, options); };
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, input()), /Falha simulada/);
  models.CartaoBaixaParcela.create = originalCreate;
  assert.equal(state.movimentos.length, 0); assert.equal(state.parcelas.length, 0); assert.equal(state.faturas.length, 0); assert.equal(state.titulos[0].valor_saldo, 2740);
  reset();
  await isolated.exports.baixarTitulo(req, 1, input({ valor: 1000, juros: 9, multa: 1, desconto: 5 }));
  assert.equal(state.titulos[0].valor_saldo, 1740); assert.equal(somaFaturas(), 100500); assert.equal(Number(state.movimentos[0].valor), 1000);
  const semParcelamento = input({ valor: 1740 }); delete semParcelamento.parcelamento_cartao;
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, semParcelamento), /possui compra parcelada/);
  assert.equal(state.movimentos.length, 1); assert.equal(somaFaturas(), 100500); assert.equal(state.titulos[0].valor_saldo, 1740);

  reset(); h.colocarNaFila(state.titulos[0]);
  const body = queueValidators.validateManualPaymentQueueProcessBody({ idempotency_key: 'qa-fila-cartao', itens: [{
    fila_id: 1, valor_pago: 2740, data_baixa: '2026-10-19', conta_bancaria_id: 5, forma_pagamento_id: 1,
    cartao_id: 10, parcelamento_cartao: { quantidade_parcelas: 6, data_compra: '2026-10-19' }
  }] });
  await fila.registrarBaixasFila(req, body);
  assert.equal(state.movimentos.length, 1); assert.equal(state.parcelas.length, 6); assert.equal(somaFaturas(), 274000);
  await fila.registrarBaixasFila(req, body);
  assert.equal(state.movimentos.length, 1); assert.equal(state.parcelas.length, 6);
  reset(); h.colocarNaFila(state.titulos[0]);
  cartoes.push({ ...cartoes[0], id: 11, nome: 'Segundo credito QA' });
  const multi = queueValidators.validateManualPaymentQueueProcessBody({ idempotency_key: 'qa-multicartoes-parcelados', itens: [{
    fila_id: 1, data_baixa: '2026-10-19', valor_pago: 2740, conta_bancaria_id: 5, forma_pagamento_id: 1,
    parcelas_cartao: [{ cartao_id: 10, valor_pago: 1740, parcelamento_cartao: { quantidade_parcelas: 3, data_compra: '2026-10-19' } },
      { cartao_id: 11, valor_pago: 1000, parcelamento_cartao: { quantidade_parcelas: 2, data_compra: '2026-10-19' } }]
  }] });
  await fila.registrarBaixasFila(req, multi);
  assert.equal(state.movimentos.length, 2); assert.equal(state.parcelas.length, 5); assert.equal(somaFaturas(), 274000);
  assert.equal(state.grupos.length, 1); assert.equal(state.titulos[0].valor_saldo, 0);
  await fila.registrarBaixasFila(req, multi);
  assert.equal(state.movimentos.length, 2); assert.equal(state.parcelas.length, 5);
  reset();
  state.titulos.push(registro({ ...state.titulos[0], id: 2, codigo: 'TIT-CARTAO-2', valor_original: 1000, valor_saldo: 1000 }));
  state.titulos.forEach(t => h.colocarNaFila(t));
  const grupoTitulos = queueValidators.validateManualPaymentQueueProcessBody({ idempotency_key: 'qa-dois-titulos-mesmo-cartao',
    instrumentos_lote: { tipo: 'CARTAO', forma_pagamento_id: 1, componentes: [{ cartao_id: 10, valor_pago: 3740,
      parcelamento_cartao: { quantidade_parcelas: 6, data_compra: '2026-10-19' } }] },
    itens: [2740,1000].map((valor_pago,index)=>({fila_id:index+1,valor_pago,data_baixa:'2026-10-19',conta_bancaria_id:5})) });
  await fila.registrarBaixasFila(req, grupoTitulos);
  assert.equal(state.movimentos.length, 2); assert.equal(state.parcelas.length, 12); assert.equal(state.faturas.length, 6);
  assert.equal(somaFaturas(), 374000); assert.equal(Number(state.faturas[0].valor_total), 623.34);
  reset(); h.colocarNaFila(state.titulos[0]);
  h.formas[0].permite_parcelamento = false;
  await assert.rejects(fila.registrarBaixasFila(req, body), /nao permite parcelamento/);
  assert.equal(state.movimentos.length, 0);
  h.formas[0].permite_parcelamento = true;
  reset(); h.colocarNaFila(state.titulos[0]);
  state.titulos[0].valor_baixado = 100; state.titulos[0].valor_saldo = 2640; state.titulos[0].status = 'PARCIAL';
  const partial = JSON.parse(JSON.stringify(body)); partial.itens[0].valor_pago = 2640;
  delete partial.itens[0].parcelamento_cartao; // Legado sem config continua bloqueado.
  await assert.rejects(fila.registrarBaixasFila(req, partial), /integralmente/); assert.equal(state.movimentos.length, 0);
  await require('./validarFilaCartaoSaldoRemanescente').validarQuitacaoSaldoCartao({ h, reset, fila });

  // API estrita: nem debito, strings de data incompletas ou chaves falsas abrem caminho alternativo.
  for (const cfg of [{ quantidade_parcelas: 61, data_compra: '2026-10-19', chave_idempotencia: key },
    { quantidade_parcelas: 6, data_compra: '2026-02-30', chave_idempotencia: key },
    { quantidade_parcelas: 6, data_compra: '20260-10-19', chave_idempotencia: key },
    { quantidade_parcelas: 1.5, data_compra: '2026-10-19', chave_idempotencia: key },
    { quantidade_parcelas: 6, data_compra: '2026-10-19', chave_idempotencia: 'curta' },
    { quantidade_parcelas: 6, data_compra: '2026-10-19', valor: 0, chave_idempotencia: key }]) assert.throws(() => input({ parcelamento_cartao: cfg }));
  assert.throws(() => input({ forma_recebimento: 'PIX' }));
  assert.throws(() => queueValidators.validateManualPaymentQueueProcessBody({ itens: body.itens }), /idempotencia/);
  // Migration estrutural repetivel, inclusive apos execucao parcialmente concluida.
  const tables = new Set(), cols = new Set(), indexes = new Set(), writes = [];
  const migration = { exports: {} };
  const source = fs.readFileSync(path.resolve(__dirname, '../migrations/202610190001_cartao_parcelamento_baixa.js'), 'utf8');
  assert(!/bulkInsert|bulkUpdate|bulkDelete|INSERT INTO|UPDATE.+SET|DELETE FROM/i.test(source));
  vm.runInNewContext(source, { module: migration, require(id) {
    assert.equal(id, '../src/database/schemaUtils');
    return { tableExists: async (_, name) => tables.has(name), columnExists: async (_, table, name) => cols.has(`${table}:${name}`),
      indexExists: async (_, table, name) => indexes.has(`${table}:${name}`) };
  } });
  const qi = { addColumn: async (table, name) => { cols.add(`${table}:${name}`); writes.push(name); },
    createTable: async (name, fields) => { tables.add(name); writes.push(name); assert.equal(fields.movimento_financeiro_id.onDelete, 'RESTRICT'); },
    addIndex: async (table, fields, opts) => { indexes.add(`${table}:${opts.name}`); writes.push(opts.name); } };
  const D = { INTEGER: 'INTEGER', STRING: n => `STRING${n}`, DATE: 'DATE', DATEONLY: 'DATEONLY', DECIMAL: () => 'DECIMAL' };
  await migration.exports.up({ queryInterface: qi, sequelize: {}, DataTypes: D });
  const countWrites = writes.length;
  await migration.exports.up({ queryInterface: qi, sequelize: {}, DataTypes: D });
  assert.equal(writes.length, countWrites); assert.equal(tables.size, 1); assert.equal(cols.size, 2); assert.equal(indexes.size, 4);
  await assert.rejects(migration.exports.down(), /historico/);
  console.log('OK: um titulo/uma baixa, 6 faturas, centavos/encargos, parcial no detalhe, protecao integral da fila, replay, ACL, debito, estorno/fatura paga, rollback total e validacao estrita. Sem banco/rede.');
}
module.exports = { h, faturas, domain, reset, input, fila, parcelamento };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
