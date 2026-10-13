'use strict';
// Codigo de dominio/servicos real com modelos em memoria. Nao carrega database,
// .env, S3 ou HTTP e nao executa migrations nem SQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const validators = require('../src/validators/paymentValidators');
const valores = require('../src/services/pagamentoFilaValoresDomain');
const cheques = require('../src/services/pagamentoFilaChequesDomain');
const instrumento = require('../src/services/pagamentoFilaInstrumentoDomain');
const req = { user: { id: 7 } };
const txRequired = options => assert(options?.transaction && options.transaction.LOCK.UPDATE);
let filas, titulos, movimentos, carteira, audit, autorizacao, eventos, faturas, vinculosFatura;
function registro(campos) {
  return { ...campos, async update(data, options) { txRequired(options); Object.assign(this, data); return this; } };
}
function iniciar() {
  filas = [registro({ id: 1, titulo_financeiro_id: 1, status: 'PENDENTE', juros: 10, multa: 3, comprovante_hash: 'preservar', comprovante_url: 'privado' })];
  titulos = [registro({ id: 1, codigo: 'TIT-QA', tipo: 'PAGAR', empresa_id: 1, forma_pagamento_id: 4,
    valor_original: 200, valor_saldo: 200, valor_baixado: 0, status: 'ABERTO', juros: 10, multa: 3 })];
  movimentos = []; carteira = [registro({ id: 77, valor: 103, empresa_id: 1, status: 'EM_CARTEIRA' })];
  faturas = []; vinculosFatura = [];
  audit = []; eventos = []; autorizacao = registro({ id: 8, lote_id: 10, status: 'ENFILEIRADO', fila_item_id: 1 });
}
const colecoes = () => [filas, titulos, movimentos, carteira, audit, eventos, faturas, vinculosFatura];
const copia = data => JSON.parse(JSON.stringify(data));
async function transaction(callback) {
  const inicial = colecoes().map(copia), aut = copia(autorizacao);
  const tx = { LOCK: { UPDATE: 'UPDATE' }, commit: async () => { tx.finished = 'commit'; },
    rollback: async () => {
      colecoes().forEach((lista, i) => {
        lista.length = inicial[i].length;
        inicial[i].forEach((campos, j) => {
          if (!lista[j]) lista[j] = registro(campos);
          for (const key of Object.keys(lista[j])) if (key !== 'update') delete lista[j][key];
          Object.assign(lista[j], campos);
        });
      });
      if (autorizacao && aut) { for (const key of Object.keys(autorizacao)) if (key !== 'update') delete autorizacao[key]; Object.assign(autorizacao, aut); }
      tx.finished = 'rollback';
    } };
  if (!callback) return tx;
  try { const resultado = await callback(tx); await tx.commit(); return resultado; }
  catch (error) { await tx.rollback(); throw error; }
}
const models = {
  sequelize: { transaction },
  PagamentoManualFilaItem: {
    findByPk: async (id, options) => { txRequired(options); assert(options.lock); return filas.find(row => row.id === Number(id)); },
    findAll: async options => { txRequired(options); return filas.filter(row => options.where.id[Op.in].includes(row.id)); },
    create: async (data, options) => { txRequired(options); const row = registro({ id: filas.length + 1, ...data }); filas.push(row); return row; }
  },
  TituloFinanceiro: { findByPk: async (id, options) => { txRequired(options); assert(options.lock); return titulos.find(row => row.id === Number(id)); },
    findAll: async options => { txRequired(options); assert(options.lock); return titulos; } },
  MovimentoFinanceiro: { findOne: async options => { txRequired(options); assert(options.lock); return movimentos.find(row => row.id === options.where.id && row.titulo_financeiro_id === options.where.titulo_financeiro_id); } },
  FaturaCartaoFinanceiro: { findByPk: async (id, options) => { txRequired(options); assert(options.lock); return faturas.find(row => row.id === Number(id)); } },
  FaturaCartaoTitulo: { destroy: async options => { txRequired(options);
    for (let i = vinculosFatura.length - 1; i >= 0; i--) if (vinculosFatura[i].titulo_financeiro_id === options.where.titulo_financeiro_id && vinculosFatura[i].fatura_cartao_id === options.where.fatura_cartao_id) vinculosFatura.splice(i, 1);
  } },
  ContaBancaria: { findByPk: async (id, options) => { txRequired(options); return Number(id) === 5 ? { id: 5, empresa_id: 1, ativo: true } : null; } },
  FormaPagamentoFinanceira: { findByPk: async id => ({ id: Number(id), ativo: true, tipo: Number(id) === 4 ? 'CHEQUE' : 'PIX' }) },
  ChequeTerceiro: { findOne: async options => { txRequired(options); return carteira.find(row => row.status === 'UTILIZADO' && row.movimento_saida_id === options.where[Op.or][0].movimento_saida_id); } },
  ChequeTerceiroMovimento: { create: async (data, options) => { txRequired(options); eventos.push(data); } },
  PagamentoAutorizacaoItem: { findOne: async () => autorizacao,
    findByPk: async (id, options) => { txRequired(options); assert(options.lock); return autorizacao; } },
  PagamentoAutorizacaoLote: { findByPk: async (id, options) => { txRequired(options); assert(options.lock); return { id, status: 'CONCLUIDO' }; } },
  SecurityEventLog: { create: async (data, options) => { txRequired(options); audit.push(data); } }
};
const roundCurrency = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const createHttpError = (code, message) => Object.assign(new Error(message), { statusCode: code });
const tituloSource = fs.readFileSync(path.resolve(__dirname, '../src/services/tituloFinanceiroService.js'), 'utf8');
const reverseSource = tituloSource.slice(tituloSource.indexOf('async function estornarMovimentoTitulo('), tituloSource.indexOf('async function atualizarCobrancaTitulo('));
const statusSource = tituloSource.slice(tituloSource.indexOf('function calcularStatusTitulo('), tituloSource.indexOf('async function sincronizarRealizacaoCompraPorTitulo('));
const scope = {
  ...models, Op, Date, roundCurrency, createHttpError,
  carregarTituloPorId: async (request, id, options) => {
    if (request.negado) throw createHttpError(403, 'Escopo negado');
    assert(options.transaction || options.includeMovimentos);
    return titulos.find(row => row.id === Number(id));
  },
  getTituloTipo: titulo => titulo.tipo,
  getSetorUsuario: () => 'FINANCEIRO',
  sincronizarContratoComercialPorTituloFinanceiro: async () => {},
  sincronizarRealizacaoCompraPorTitulo: async () => {},
  sincronizarStatusSolicitacaoPorBaixaTitulos: async () => {},
  reabrirConciliacoesPorMovimentos: async () => [],
  recalcularFaturaCartao: async (id, options) => { txRequired(options);
    assert(options.leituraCorrente); const fatura = faturas.find(row => row.id === id);
    await fatura.update({ valor_total: vinculosFatura.filter(row => row.fatura_cartao_id === id).reduce((sum, row) => sum + row.valor, 0) }, options);
  },
  registrarEventoSeguranca: async () => {},
  Historico: { create: async () => {} }
};
vm.runInNewContext(`${statusSource}\n${reverseSource}\nthis.estornar = estornarMovimentoTitulo;`, scope);
async function baixarTitulo(request, id, payload, options) {
  txRequired(options);
  const titulo = titulos.find(row => row.id === Number(id));
  const quitacao = roundCurrency(payload.valor + payload.juros + payload.multa - payload.desconto);
  const cheque = payload.usar_cheque_terceiro && carteira.find(row => row.id === Number(payload.cheque_terceiro_id));
  if (payload.usar_cheque_terceiro && (!cheque || cheque.status !== 'EM_CARTEIRA' || cheque.valor !== quitacao)) throw createHttpError(409, 'Cheque indisponivel ou valor diferente');
  const movimento = registro({ id: movimentos.length + 1, titulo_financeiro_id: id, tipo_movimento: 'BAIXA', status: 'ATIVO',
    valor: payload.valor, juros: payload.juros, multa: payload.multa, desconto: payload.desconto, valor_quitacao: quitacao });
  movimentos.push(movimento);
  if (cheque) await cheque.update({ status: 'UTILIZADO', movimento_saida_id: movimento.id }, options);
  await titulo.update({ valor_baixado: roundCurrency(titulo.valor_baixado + payload.valor),
    valor_saldo: roundCurrency(titulo.valor_saldo - payload.valor), status: titulo.valor_saldo === payload.valor ? 'QUITADO' : 'PARCIAL' }, options);
  return { movimento_financeiro_id: movimento.id };
}
const deps = {
  '../models': models, 'crypto': require('node:crypto'), 'sequelize': { Op },
  './tituloFinanceiroService': { baixarTitulo, estornarMovimentoTitulo: scope.estornar },
  './pagamentoFilaValoresDomain': valores, './pagamentoFilaInstrumentoDomain': instrumento,
  './pagamentoFilaChequesDomain': cheques,
  './tituloBloqueioRetornoObraService': { assertTituloDisponivelParaBaixa: titulo => { if (titulo.status_interno_pagar === 'EM EDICAO DP') throw createHttpError(409, 'DP editando'); } },
  './securityLogService': { registrarEventoSeguranca: async data => audit.push(data), getRequestIp: () => '127.0.0.1' },
  './pagamentoAutorizacaoEventosService': { recordEvent: async data => eventos.push(data) },
  './pagamentoFilaHistoricoService': { registrarComprovantesFilaNoHistorico: async () => {} },
  './pagamentoFilaComprovanteDomain': { pendenteComprovanteFila: () => false },
  '../config/env': { env: {} }
};
const moduleFila = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/pagamentoManualFilaService.js'), 'utf8'), {
  module: moduleFila, Date, console,
  require(id) { if (id in deps) return deps[id]; if (id.startsWith('./')) return {}; throw Error(`Dependencia nao isolada: ${id}`); }
});
const fila = moduleFila.exports;
const base = { fila_id: 1, conta_bancaria_id: 5, data_baixa: '2026-10-13', forma_pagamento_id: 4,
  valor_pago: 193, juros: 10, multa: 3, desconto: 20,
  parcelas_cheque: [{ valor_pago: 90, cheque_numero: '001', cheque_emitente: 'Empresa', data_vencimento: '2026-11-13' },
    { valor_pago: 103, usar_cheque_terceiro: true, cheque_terceiro_id: 77 }] };
async function executar() {
  iniciar();
  const payload = validators.validateManualPaymentQueueProcessBody({ itens: [base], idempotency_key: 'teste-cheques' });
  for (const extra of [{ parcelas_cheque: [] }, { parcelas_cheque: Array(61).fill(base.parcelas_cheque[0]) },
    { parcelas_cheque: [{ ...base.parcelas_cheque[0], movimento_id: 100 }] }, { desconto: -1 }]) {
    assert.throws(() => validators.validateManualPaymentQueueProcessBody({ itens: [{ ...base, ...extra }] }));
  }
  assert.throws(() => validators.validateManualPaymentQueueReverseBody({ motivo: '', idempotency_key: 'teste' }));
  assert.throws(() => validators.validateManualPaymentQueueReverseBody({ motivo: 'erro', idempotency_key: 'teste', bypass: true }));
  const rateio = cheques.distribuirCheques(base.parcelas_cheque, 193, valores.calcularValoresFila(193, 200, base));
  for (const [campo, total] of Object.entries({ valor: 200, juros: 10, multa: 3, desconto: 20 })) assert.equal(roundCurrency(rateio.reduce((sum, item) => sum + item[campo], 0)), total);
  assert.throws(() => cheques.conferirChequesUnicosLote([base, { ...base, fila_id: 2 }]), /mesmo cheque/);
  assert.throws(() => cheques.distribuirCheques([{ ...base.parcelas_cheque[0], valor_pago: 89 }], 193, {}), /soma/);
  const result = await fila.registrarBaixasFila(req, payload);
  assert.equal(result.baixados, 1); assert.equal(movimentos.length, 2);
  assert.equal(titulos[0].valor_saldo, 0); assert.equal(titulos[0].valor_baixado, 200);
  assert.equal(carteira[0].status, 'UTILIZADO'); assert.equal(filas[0].instrumento_pagamento_json.desconto, 20);
  await fila.registrarBaixasFila(req, payload); assert.equal(movimentos.length, 2, 'Reenvio nao duplica movimentos');
  await assert.rejects(fila.estornarBaixaFila({ ...req, negado: true }, 1, { motivo: 'Correção', idempotency_key: 'estorno' }), /Escopo/);
  assert.equal(movimentos[0].status, 'ATIVO');
  movimentos[1].baixa_grupo_id = 10;
  await assert.rejects(fila.estornarBaixaFila(req, 1, { motivo: 'Correção', idempotency_key: 'estorno' }), /multiplas fontes/);
  assert.equal(movimentos[0].status, 'ATIVO', 'Falha no ultimo movimento reverte estorno inteiro');
  assert.equal(carteira[0].status, 'UTILIZADO'); delete movimentos[1].baixa_grupo_id;
  const estorno = await fila.estornarBaixaFila(req, 1, { motivo: 'Conta errada', idempotency_key: 'estorno' });
  assert.equal(estorno.reaberto_id, 2); assert.equal(filas[1].status, 'PENDENTE'); assert.equal(autorizacao.fila_item_id, 2);
  assert.equal(movimentos.filter(item => item.status === 'ESTORNADO').length, 2);
  assert.equal(titulos[0].valor_saldo, 200); assert.equal(carteira[0].status, 'EM_CARTEIRA');
  assert.equal(filas[0].comprovante_hash, 'preservar'); assert.equal(filas[0].comprovante_url, 'privado');
  assert.equal((await fila.estornarBaixaFila(req, 1, { motivo: 'Conta errada', idempotency_key: 'estorno' })).idempotente, true);
  assert.equal(filas.length, 2); await assert.rejects(fila.estornarBaixaFila(req, 1, { motivo: 'Outro', idempotency_key: 'outro' }), /baixa ativa/);
  iniciar(); carteira[0].status = 'DEPOSITADO';
  await assert.rejects(fila.registrarBaixasFila(req, payload), /Cheque indisponivel/);
  assert.equal(movimentos.length, 0); assert.equal(titulos[0].valor_saldo, 200); assert.equal(filas[0].status, 'PENDENTE');
  iniciar(); filas[0].status = 'NAO_PAGO'; autorizacao.status = 'PENDENTE';
  await assert.rejects(fila.resolverItemFila(req, 1, { acao: 'REABRIR' }), /autorizacao/); assert.equal(filas.length, 1);
  autorizacao.status = 'ENFILEIRADO'; await fila.resolverItemFila(req, 1, { acao: 'REABRIR' });
  assert.equal(filas.length, 2); assert.equal(autorizacao.fila_item_id, 2);
  await assert.rejects(fila.resolverItemFila(req, 1, { acao: 'REABRIR' }), /pendencia/);
  // Estorno de cartao nao deixa titulo aberto associado a uma fatura quitada.
  iniciar();
  await fila.registrarBaixasFila(req, validators.validateManualPaymentQueueProcessBody({ itens: [{ ...base,
    forma_pagamento_id: 2, parcelas_cheque: undefined, valor_pago: 200, juros: 0, multa: 0, desconto: 0 }], idempotency_key: 'cartao' }));
  movimentos[0].fatura_cartao_id = 31; titulos[0].fatura_cartao_id = 31;
  faturas.push(registro({ id: 31, status: 'PAGA', valor_total: 200 }));
  vinculosFatura.push(registro({ fatura_cartao_id: 31, titulo_financeiro_id: 1, valor: 200 }));
  await assert.rejects(fila.estornarBaixaFila(req, 1, { motivo: 'Erro cartao', idempotency_key: 'cartao-estorno' }), /Reverta a fatura/);
  assert.equal(movimentos[0].status, 'ATIVO'); assert.equal(faturas[0].valor_total, 200); assert.equal(vinculosFatura.length, 1);
  faturas[0].status = 'ABERTA';
  await fila.estornarBaixaFila(req, 1, { motivo: 'Erro cartao', idempotency_key: 'cartao-estorno' });
  assert.equal(titulos[0].fatura_cartao_id, null); assert.equal(faturas[0].valor_total, 0); assert.equal(vinculosFatura.length, 0);
  const permissao = require('../src/services/financeiroRotaPermissoesService');
  assert.equal(permissao.PERMISSOES_ROTAS_FINANCEIRAS['POST /financeiro/fila-pagamentos/:id/estornar'][0], 'financeiro.titulos.estornar');
  console.log('OK: descontos, soma/rateio centavos, multiplos cheques, rollback integral, estorno real sob lock, carteira, ACL, autorizacao e idempotencia. Sem banco/rede.');
}
executar().catch(error => { console.error(error); process.exitCode = 1; });
