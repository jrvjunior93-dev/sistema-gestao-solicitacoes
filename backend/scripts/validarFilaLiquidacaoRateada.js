'use strict';
// Services reais da fila, titulo e fatura; somente modelos em memoria.
// Nao importa database/models reais, dotenv, credenciais nem banco externo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const h = require('./validarCartaoOpcionalSolicitacao');
const { planejarRateioFila } = require('../src/services/pagamentoFilaRateioDomain');
const { validateManualPaymentQueueProcessBody: validate } = require('../src/validators/paymentValidators');
const { state, models, dependencies, queueDependencies, isolated, queueModule, registro, cartoes, req, faturaMocks } = h;
const cents = value => Math.round(Number(value || 0) * 100);
const op = name => Symbol.for(name);
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(key => {
    if (key === op('or')) return where[key].some(clause => matches(row, clause));
    const value = where[key];
    if (value && typeof value === 'object') return Reflect.ownKeys(value).every(operator =>
      operator === op('in') ? value[operator].includes(row[key]) : operator === op('ne') ? row[key] != value[operator] : false);
    return row[key] === value;
  });
}
const contas = [h.conta, { id: 6, empresa_id: 2, ativo: true }];
cartoes.push({ id: 11, nome: 'Credito outra conta', tipo: 'CREDITO', ativo: true, conta_bancaria_id: 6, dia_fechamento: 15, dia_vencimento: 25 });
cartoes.forEach(card => { card.dia_fechamento = 15; card.dia_vencimento = 25; });
models.ContaBancaria.findByPk = async id => contas.find(item => item.id === Number(id));
models.EmpresaGrupo.findByPk = async id => ({ id: Number(id), ativo: true });
models.PagamentoFilaLiquidacao = {
  findOne: async ({ where }) => state.grupos.find(item => matches(item, where)),
  findByPk: async id => state.grupos.find(item => item.id === Number(id)),
  create: async data => { const item = registro({ id: state.grupos.length + 1, ...data }); state.grupos.push(item); return item; }
};
models.PagamentoManualFilaItem.create = async data => { const row = registro({ id: state.fila.length + 1, ...data }); state.fila.push(row); return row; };
models.ChequeTerceiro.findByPk = async id => state.cheques.find(row => row.id === Number(id));
models.MovimentoFinanceiro.findByPk = async id => state.movimentos.find(row => row.id === Number(id));
models.MovimentoFinanceiro.findOne = async ({ where }) => state.movimentos.find(row => matches(row, where));
models.MovimentoFinanceiro.findAll = async ({ where, include }) => state.movimentos.filter(row => matches(row, where))
  .map(row => { if (include) row.titulo = state.titulos.find(item => item.id === row.titulo_financeiro_id); return row; });
models.TituloFinanceiro.findAll = async ({ where }) => state.titulos.filter(row => matches(row, where));
models.SecurityEventLog = { create: async data => { state.eventos.push(data); return data; } };
models.FaturaCartaoTitulo = { findOrCreate: async () => [{ id: 1 }], destroy: async () => {} };
models.FaturaCartaoFinanceiro = {
  findOrCreate: async ({ where, defaults }) => {
    let item = state.faturas.find(row => matches(row, where));
    if (!item) { item = registro({ id: state.faturas.length + 1, ...where, ...defaults }); state.faturas.push(item); }
    return [item];
  },
  findByPk: async id => {
    const fatura = state.faturas.find(row => row.id === Number(id));
    if (fatura) {
      fatura.titulos = state.titulos.filter(t => t.fatura_cartao_id === fatura.id);
      fatura.cartao = cartoes.find(card => card.id === fatura.cartao_id);
    }
    return fatura;
  },
  findAll: async () => Promise.all(state.faturas.map(row => models.FaturaCartaoFinanceiro.findByPk(row.id))),
  update: async (data, { where }) => state.faturas.filter(row => matches(row, where)).forEach(row => Object.assign(row, data))
};
function load(name, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, `../src/services/${name}.js`), 'utf8'), {
    module, console, Date, Intl, require(id) { if (!(id in deps)) throw Error(`Dependencia nao isolada: ${id}`); return deps[id]; }
  }, { filename: name });
  return module.exports;
}
const faturaService = load('faturaCartaoFinanceiroService', dependencies);
Object.assign(faturaMocks, faturaService);
isolated.exports = load('tituloFinanceiroService', dependencies);
queueDependencies['./tituloFinanceiroService'] = isolated.exports;
queueModule.exports = load('pagamentoManualFilaService', queueDependencies);
const liquidacao = load('pagamentoFilaLiquidacaoService', { ...queueDependencies,
  './pagamentoFilaRateioDomain': require('../src/services/pagamentoFilaRateioDomain') });
queueDependencies['./pagamentoFilaLiquidacaoService'] = liquidacao;
function reset() { h.reset(); state.grupos = []; }
async function preparar() {
  reset(); h.solicitacao.valor = 400;
  await h.gerar([h.pagamento(3, undefined, 200), h.pagamento(3, undefined, 200)]);
  state.titulos.forEach(h.colocarNaFila);
  return state.fila.map(row => h.itemFila(row));
}
const payloadCheque = itens => validate({ idempotency_key: 'cheques-unicos-lote', itens,
  instrumentos_lote: { tipo: 'CHEQUE', forma_pagamento_id: 4, componentes: [
    { valor_pago: 150, cheque_numero: '123', cheque_emitente: 'QA' },
    { valor_pago: 250, usar_cheque_terceiro: true, cheque_terceiro_id: 77 }] } });
const wallet = () => state.cheques.push(registro({ id: 77, empresa_id: 1, status: 'EM_CARTEIRA', valor: 250 }));
async function main() {
  // Rateio em centavos deterministico: linhas/colunas e encargos preservados.
  let seed = 1337;
  const random = limit => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % limit; };
  for (let test = 0; test < 1000; test++) {
    const valores = Array.from({ length: 1 + random(8) }, () => 100 + random(10000));
    const total = valores.reduce((a, b) => a + b, 0);
    const partes = Array.from({ length: 1 + random(8) }, () => 1);
    for (let i = partes.length; i < total; i++) partes[random(partes.length)]++;
    const plano = planejarRateioFila(valores.map((valor, index) => ({ fila_id: index + 1, valor_pago: valor / 100 })), partes.map(valor => ({ valor_pago: valor / 100 })));
    plano.forEach((row, index) => assert.equal(row.reduce((sum, item) => sum + cents(item.valor_pago), 0), valores[index]));
    partes.forEach((valor, index) => assert.equal(plano.flat().filter(item => item.componente === index).reduce((sum, item) => sum + cents(item.valor_pago), 0), valor));
  }
  assert.throws(() => planejarRateioFila([{ valor_pago: 100 }], [{ valor_pago: 99.99 }]), /soma/);
  assert.throws(() => planejarRateioFila([{ valor_pago: -1 }], [{ valor_pago: -1 }]), /invalido/);
  assert.throws(() => planejarRateioFila([{ valor_pago: Infinity }], [{ valor_pago: Infinity }]), /invalido/);
  const base = { fila_id: 1, data_baixa: '2026-10-13', conta_bancaria_id: 5, valor_pago: 200 };
  for (const body of [
    { itens: [{ ...base, parcelas_cartao: [{ cartao_id: 10, valor_pago: 200 }] }] },
    { idempotency_key: 'x', itens: [{ ...base, cartao_id: 10, parcelas_cartao: [{ cartao_id: 10, valor_pago: 200 }] }] },
    { idempotency_key: 'x', itens: [base], instrumentos_lote: { tipo: 'CARTAO', forma_pagamento_id: 1, componentes: [{ cartao_id: 10, valor_pago: 200, empresa_id: 1 }] } },
    { idempotency_key: 'x', itens: [{ ...base, forma_pagamento_id: 3 }], instrumentos_lote: { tipo: 'CARTAO', forma_pagamento_id: 1, componentes: [{ cartao_id: 10, valor_pago: 200 }] } }
  ]) assert.throws(() => validate(body));
  let itens = await preparar(); wallet();
  const cheque = payloadCheque(itens);
  await queueModule.exports.registrarBaixasFila(req, cheque);
  assert.equal(state.grupos.length, 1); assert.equal(state.movimentos.length, 4);
  assert(state.titulos.every(row => row.valor_saldo === 0 && row.status === 'QUITADO'));
  assert.equal(state.cheques[0].status, 'UTILIZADO'); assert.equal(state.chequeEventos.length, 1);
  assert.equal(state.chequeEventos[0].valor, 250, 'Documento consumido inteiro, uma unica vez');
  assert.equal(state.movimentos.filter(row => row.conta_bancaria_id === null).length, 2, 'Cheque terceiro nao duplica banco');
  await queueModule.exports.registrarBaixasFila(req, cheque);
  assert.equal(state.movimentos.length, 4); assert.equal(state.chequeEventos.length, 1);
  await assert.rejects(queueModule.exports.registrarBaixasFila(req, { ...cheque, itens: cheque.itens.map(item => ({ ...item, motivo: 'Outro' })) }), /Chave ja utilizada/);
  await assert.rejects(isolated.exports.estornarMovimentoTitulo(req, 1, state.movimentos[0].id, {}), /grupo completo/);
  assert(state.movimentos.every(row => row.status === 'ATIVO'));
  // Guarda de escopo existente do estorno verifica TODOS antes de qualquer escrita.
  state.titulos[1].obra_id = 2;
  await assert.rejects(queueModule.exports.estornarBaixaFila({ user: { ...req.user, scope: [1] } }, 1,
    { motivo: 'QA', idempotency_key: 'r' }), /Acesso negado/);
  assert(state.movimentos.every(row => row.status === 'ATIVO')); assert.equal(state.cheques[0].status, 'UTILIZADO');
  state.titulos[1].obra_id = 1;
  const result = await queueModule.exports.estornarBaixaFila(req, 1, { motivo: 'QA', idempotency_key: 'r' });
  assert.equal(result.reaberto_ids.length, 2); assert.equal(state.grupos[0].status, 'ESTORNADO');
  assert(state.titulos.every(row => row.valor_saldo === 200)); assert(state.movimentos.every(row => row.status === 'ESTORNADO'));
  assert.equal(state.cheques[0].status, 'EM_CARTEIRA'); assert.equal(state.chequeEventos.length, 2);
  await queueModule.exports.estornarBaixaFila(req, 2, { motivo: 'Replay', idempotency_key: 'r2' });
  assert.equal(state.fila.length, 4); assert.equal(state.chequeEventos.length, 2);
  // Falha no segundo titulo desfaz primeiro, grupo, movimentos e consumo.
  itens = await preparar(); wallet(); state.titulos[1].status_interno_pagar = 'EM EDICAO DP'; state.titulos[1].origem_titulo = 'RH_DP';
  await assert.rejects(queueModule.exports.registrarBaixasFila(req, payloadCheque(itens)), /em edi.*DP/i);
  assert.equal(state.movimentos.length, 0); assert.equal(state.grupos.length, 0); assert.equal(state.cheques[0].status, 'EM_CARTEIRA');
  assert.equal(state.titulos[0].valor_saldo, 200); assert(state.fila.every(row => row.status === 'PENDENTE'));
  itens = await preparar(); wallet(); state.cheques[0].status = 'UTILIZADO';
  await assert.rejects(queueModule.exports.registrarBaixasFila(req, payloadCheque(itens)), /indisponivel/);
  assert.equal(state.movimentos.length, 0);
  // Cartoes com contas/empresas distintas, somente cada parte na propria fatura.
  itens = await preparar(); itens.forEach(item => { item.valor_pago = 193; item.juros = 10; item.multa = 3; item.desconto = 20; });
  const cards = validate({ idempotency_key: 'cards-group', itens, instrumentos_lote: { tipo: 'CARTAO', forma_pagamento_id: 1,
    componentes: [{ cartao_id: 10, valor_pago: 150 }, { cartao_id: 11, valor_pago: 236 }] } });
  await queueModule.exports.registrarBaixasFila(req, cards);
  assert.equal(state.faturas.length, 2); assert.deepEqual(state.faturas.map(row => row.valor_total), [150, 236]);
  assert(state.titulos.every(row => row.valor_saldo === 0 && !row.fatura_cartao_id));
  assert.equal(cents(state.movimentos.reduce((sum, row) => sum + row.valor, 0)), 40000);
  assert.equal(cents(state.movimentos.reduce((sum, row) => sum + row.desconto, 0)), 4000);
  assert(state.movimentos.filter(row => row.cartao_id === 11).every(row => row.conta_bancaria_id === 6 && row.empresa_id === 2));
  assert(state.titulos.every(row => !row.intercompany), 'Partes nao reclassificam o titulo inteiro como entre empresas');
  const detail = await faturaService.carregarFaturaCartao(req, 1);
  assert.equal(detail.compras_rateadas.length, 2); assert.equal(detail.titulos.length, 0);
  state.titulos[1].obra_id = 2;
  await assert.rejects(faturaService.carregarFaturaCartao({ user: { ...req.user, scope: [1] } }, 1), /Acesso negado/);
  assert.equal((await faturaService.listarFaturasCartao({ user: { ...req.user, scope: [1] } })).length, 0);
  state.titulos[1].obra_id = 1;
  state.faturas[1].status = 'PAGA';
  await assert.rejects(queueModule.exports.estornarBaixaFila(req, 1, { motivo: 'QA', idempotency_key: 'r' }), /processamento posterior/);
  assert(state.movimentos.every(row => row.status === 'ATIVO')); assert(state.titulos.every(row => row.valor_saldo === 0));
  state.faturas[1].status = 'ABERTA';
  await queueModule.exports.estornarBaixaFila(req, 1, { motivo: 'QA', idempotency_key: 'r' });
  assert.deepEqual(state.faturas.map(row => row.valor_total), [0, 0]);
  // Pagamento da fatura usa total alocado, nao baixa o titulo quitado novamente.
  itens = await preparar();
  const pagos = validate({ idempotency_key: 'cards-pay-bill', itens, instrumentos_lote: { tipo: 'CARTAO', forma_pagamento_id: 1,
    componentes: [{ cartao_id: 10, valor_pago: 150 }, { cartao_id: 11, valor_pago: 250 }] } });
  await queueModule.exports.registrarBaixasFila(req, pagos);
  await faturaService.baixarFaturaCartao(req, 1, { conta_bancaria_id: 6, data_movimento: '2026-10-13' });
  assert.equal(state.movimentos.filter(row => row.tipo_movimento === 'BAIXA').length, 4);
  assert.equal(state.movimentos.find(row => row.tipo_movimento === 'PAGAMENTO_FATURA').valor, -150);
  assert(state.titulos.every(row => row.valor_baixado === 200));
  // Dois rateios individuais com chave de 80 caracteres nao colidem.
  itens = await preparar();
  const individuais = validate({ idempotency_key: 'x'.repeat(80), itens: itens.map(item => ({ ...item, forma_pagamento_id: 2,
    parcelas_cartao: [{ cartao_id: 20, valor_pago: 200 }] })) });
  await queueModule.exports.registrarBaixasFila(req, individuais);
  assert.equal(state.grupos.length, 2); assert.notEqual(state.grupos[0].idempotency_key, state.grupos[1].idempotency_key);
  assert.equal(state.faturas.length, 0); assert.equal(state.movimentos.length, 2);
  await assert.rejects(isolated.exports.baixarTitulo(req, 1, {}, { filaLiquidacaoId: 1 }), /transacao interna/);
  // Fatura fechada no segundo cartao: nada da primeira parte pode persistir.
  itens = await preparar();
  state.faturas.push(registro({ id: 1, cartao_id: 11, competencia: '2026-10', status: 'FECHADA', valor_total: 0 }));
  const fechado = validate({ idempotency_key: 'fechada', itens, instrumentos_lote: { tipo: 'CARTAO', forma_pagamento_id: 1,
    componentes: [{ cartao_id: 10, valor_pago: 150 }, { cartao_id: 11, valor_pago: 250 }] } });
  await assert.rejects(queueModule.exports.registrarBaixasFila(req, fechado), /nao esta aberta/);
  assert.equal(state.movimentos.length, 0); assert.equal(state.grupos.length, 0); assert.equal(state.faturas.length, 1);
  assert(state.titulos.every(row => row.valor_saldo === 200)); assert(state.fila.every(row => row.status === 'PENDENTE'));
  // Saldo previamente pago nao e regravado pelo rateio ou estorno do lote.
  itens = await preparar(); state.titulos[0].valor_baixado = 100; state.titulos[0].valor_saldo = 100; state.titulos[0].status = 'PARCIAL'; itens[0].valor_pago = 100;
  const residual = validate({ idempotency_key: 'residual', itens, instrumentos_lote: { tipo: 'CARTAO', forma_pagamento_id: 2,
    componentes: [{ cartao_id: 20, valor_pago: 300 }] } });
  await queueModule.exports.registrarBaixasFila(req, residual);
  assert(state.titulos.every(row => row.valor_baixado === 200));
  await queueModule.exports.estornarBaixaFila(req, 1, { motivo: 'QA residual', idempotency_key: 'residual-r' });
  assert.equal(state.titulos[0].valor_baixado, 100); assert.equal(state.titulos[0].valor_saldo, 100);
  assert.equal(state.titulos[1].valor_baixado, 0); assert.equal(state.titulos[1].valor_saldo, 200);
  // Migration aditiva repetivel; consultas de schema somente leitura, sem DML.
  const migration = require('../migrations/202610130002_fila_liquidacao_rateada');
  const schema = new Set(), writes = [];
  const fake = { DataTypes: { INTEGER: 'INTEGER', JSON: 'JSON', DATE: 'DATE', STRING: length => `STRING:${length}` },
    sequelize: { query: async (sql, options) => { assert.match(sql, /^SELECT/); return [[{ total: schema.has(options.replacements.join('.')) ? 1 : 0 }]]; } },
    queryInterface: { createTable: async (name, fields) => { schema.add(name); writes.push('table'); assert(fields.dados && fields.idempotency_key.unique); },
      addColumn: async (table, column, definition) => { schema.add(`${table}.${column}`); writes.push('column'); assert.equal(definition.allowNull, true); },
      addIndex: async (table, columns, options) => { schema.add(`${table}.${options.name}`); writes.push('index'); } } };
  await migration.up(fake); await migration.up(fake); assert.deepEqual(writes, ['table', 'column', 'index']);
  console.log('OK: 1000 rateios em centavos, validadores estritos, services reais fila/titulo/fatura, carteira unica, replay, rollback, estorno atomico/escopo, contas distintas, pagamento da fatura e migration aditiva. Sem banco real.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
