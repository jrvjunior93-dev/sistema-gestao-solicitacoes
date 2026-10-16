'use strict';
// Fila, baixa de titulo, correcao de previsao e recalculo de fatura reais.
// Somente modelos/transacao em memoria, sem database, .env, rede ou producao.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const h = require('./validarCartaoOpcionalSolicitacao');
const { state, models, dependencies, queueDependencies, registro, req } = h;
const Op = dependencies.sequelize.Op;
let falharAuditoria = false;
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(key => {
    const value = where[key];
    if (key === Op.or) return value.some(item => matches(row, item));
    if (value && typeof value === 'object') return Reflect.ownKeys(value).every(op =>
      op === Op.in ? value[op].includes(row[key]) : op === Op.notIn ? !value[op].includes(row[key]) : false);
    return row[key] === value;
  });
}
function memoria(key) {
  return {
    findAll: async (options = {}) => state[key].filter(row => matches(row, options.where)),
    findOne: async (options = {}) => state[key].find(row => matches(row, options.where)) || null,
    findByPk: async id => state[key].find(row => Number(row.id) === Number(id)) || null,
    create: async (values, options) => {
      assert(options?.transaction);
      const row = registro({ id: Math.max(0, ...state[key].map(item => item.id)) + 1, ...values });
      state[key].push(row); return row;
    },
    update: async (values, options) => { assert(options.transaction);
      state[key].filter(row => matches(row, options.where)).forEach(row => Object.assign(row, values)); },
    destroy: async options => { assert(options.transaction);
      const tamanho = state[key].length; state[key] = state[key].filter(row => !matches(row, options.where));
      return tamanho - state[key].length; },
    findOrCreate: async function(options) {
      const row = await this.findOne(options);
      return row ? [row, false] : [await this.create({ ...options.defaults, ...options.where }, options), true];
    }
  };
}
Object.assign(models.TituloFinanceiro, memoria('titulos'));
Object.assign(models.PagamentoManualFilaItem, memoria('fila'));
Object.assign(models.MovimentoFinanceiro, memoria('movimentos'));
models.FaturaCartaoFinanceiro = memoria('faturas');
models.FaturaCartaoTitulo = memoria('vinculos');
models.PaymentIntent = { findAll: async () => [] };
models.SecurityEventLog = { create: async (data, options) => {
  assert(options?.transaction);
  if (falharAuditoria) throw Error('Auditoria indisponivel');
  state.eventos.push(data); return data;
} };
function load(name, deps) {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, `../src/services/${name}.js`), 'utf8'), {
    module: mod, console, Date, Intl, require(id) {
      if (!(id in deps)) throw Error(`Dependencia nao isolada: ${id}`);
      return deps[id];
    }
  }, { filename: name });
  return mod.exports;
}
const faturas = load('faturaCartaoFinanceiroService', dependencies);
Object.assign(h.faturaMocks, faturas);
dependencies['./securityLogService'].getRequestIp = () => '127.0.0.1';
const previsao = load('pagamentoFilaPrevisaoCartaoService', { ...dependencies,
  './faturaCartaoFinanceiroService': faturas });
queueDependencies['./pagamentoFilaPrevisaoCartaoService'] = previsao;
queueDependencies['./authorizationService'] = { ...dependencies['./authorizationService'],
  userHasNominalAreaPermission: async actor => actor.preparar !== false };
queueDependencies['./securityLogService'].getRequestIp = () => '127.0.0.1';
queueDependencies['./analiseProprietarioService'] = { atualizarAnaliseAoEnfileirar: async () => {} };
queueDependencies['./pagamentoAutorizacaoFilaService'] = { sincronizarDossiesComFila: async () => {} };
queueDependencies['./paymentOwnerApprovalPolicy'] = require('../src/services/paymentOwnerApprovalPolicy');
queueDependencies['./tituloSolicitacaoContratoService'] = {
  resolverSolicitacoesDosTitulos: async () => new Map(), registrarVinculosContratuaisAoEnfileirar: async () => {}
};
const fila = load('pagamentoManualFilaService', queueDependencies);
const validators = require('../src/validators/paymentValidators');
const tx = { LOCK: { UPDATE: 'UPDATE' } };
function reset() {
  h.reset(); state.vinculos = []; falharAuditoria = false; req.user.scope = null; req.user.preparar = true;
  const titulo = registro({ id: 1, codigo: 'TIT-PREVISAO-QA', solicitacao_id: 100, obra_id: 1, empresa_id: 1,
    tipo: 'PAGAR', status: 'ABERTO', valor_original: 200, valor_saldo: 200, valor_baixado: 0,
    forma_pagamento_id: 1, cartao_id: 40, fatura_cartao_id: 79,
    data_vencimento: '2026-10-21', data_compra: '2026-10-01', numero_parcela: 1, total_parcelas: 2 });
  state.titulos.push(titulo);
  state.faturas.push(registro({ id: 79, cartao_id: 40, status: 'ABERTA', valor_total: 200,
    data_vencimento: '2026-10-21' }));
  state.vinculos.push(registro({ id: 1, titulo_financeiro_id: 1, fatura_cartao_id: 79 }));
  return titulo;
}
const enviar = () => fila.enfileirarTitulos(req, { titulo_ids: [1], idempotency_key: 'envio-qa' });
const baixar = (extra = {}, key = 'baixa-qa') => fila.registrarBaixasFila(req,
  validators.validateManualPaymentQueueProcessBody({ idempotency_key: key,
    itens: [{ fila_id: state.fila[0].id, data_baixa: '2026-10-16', conta_bancaria_id: 5,
      valor_pago: 200, forma_pagamento_id: 3, ...extra }] }));
function snapshot() { return JSON.stringify([state.titulos, state.faturas, state.vinculos, state.fila, state.movimentos]); }
async function main() {
  reset();
  assert.equal(await previsao.validarPrevisaoCartaoFila({ id: 5 }, null), null);
  await assert.rejects(previsao.validarPrevisaoCartaoFila(state.titulos[0], null), /transacao/);
  await enviar(); await enviar();
  assert.equal(state.fila.length, 1, 'Replay nao duplica fila');
  assert.equal(state.titulos[0].fatura_cartao_id, 79, 'Enfileirar nao muda previsao');
  assert.equal(state.faturas[0].valor_total, 200);
  await baixar();
  assert.equal(state.titulos[0].status, 'QUITADO');
  assert.equal(state.titulos[0].forma_pagamento_id, 1, 'Forma prevista preservada');
  assert.equal(state.titulos[0].fatura_cartao_id, null);
  assert.equal(state.titulos[0].cartao_id, null);
  assert.equal(state.movimentos[0].forma_recebimento, 'PIX', 'Movimento registra forma efetiva');
  assert.equal(state.faturas[0].valor_total, 0); assert.equal(state.vinculos.length, 0);
  assert.equal(state.eventos.filter(e => e.tipo_evento === 'MANUAL_PAYMENT_CARD_FORECAST_CORRECTED').length, 1);
  assert.equal(state.fila[0].instrumento_pagamento_json.previsao_cartao_anterior.fatura_cartao_id, 79);
  await baixar(); assert.equal(state.movimentos.length, 1, 'Replay nao duplica baixa/correcao');

  // Interleavings serializados como o lock do titulo no banco (sem alegar
  // teste concorrente MySQL): duas chamadas com a mesma chave nao duplicam.
  reset(); await enviar();
  const transacaoOriginal = models.sequelize.transaction;
  let cauda = Promise.resolve();
  models.sequelize.transaction = callback => {
    const atual = cauda.then(() => transacaoOriginal(callback));
    cauda = atual.catch(() => {}); return atual;
  };
  try { await Promise.all([baixar(), baixar()]); }
  finally { models.sequelize.transaction = transacaoOriginal; }
  assert.equal(state.movimentos.length, 1);
  assert.equal(state.eventos.filter(e => e.tipo_evento === 'MANUAL_PAYMENT_CARD_FORECAST_CORRECTED').length, 1);

  // Troca de cartao usa baixa e vinculo canonicos, recalculando ambas as faturas.
  reset(); await enviar(); await baixar({ forma_pagamento_id: 1, cartao_id: 10 });
  assert.equal(state.titulos[0].cartao_id, 10); assert.notEqual(state.titulos[0].fatura_cartao_id, 79);
  assert.equal(state.faturas[0].valor_total, 0);
  assert.equal(state.faturas[1].valor_total, 200); assert.equal(state.faturas[1].status, 'ABERTA');
  assert.equal(state.vinculos.length, 1); assert.equal(state.vinculos[0].fatura_cartao_id, state.faturas[1].id);
  assert.equal(state.movimentos[0].forma_recebimento, 'CARTAO_CREDITO');

  reset(); state.titulos[0].cartao_id = 10; state.faturas[0].cartao_id = 10;
  state.faturas[0].competencia = faturas.calcularDatasFatura(h.cartoes[0], '2026-10-16').competencia;
  await enviar(); await baixar({ forma_pagamento_id: 1, cartao_id: 10 });
  assert.equal(state.faturas.length, 1, 'Mesmo cartao/competencia reutiliza fatura');
  assert.equal(state.faturas[0].valor_total, 200, 'Reuso nao duplica valor');
  assert.equal(state.vinculos.length, 1);

  reset(); state.titulos.push(registro({ id: 2, fatura_cartao_id: 79, valor_original: 300 }));
  state.vinculos.push(registro({ id: 2, fatura_cartao_id: 79, titulo_financeiro_id: 2 }));
  state.faturas[0].valor_total = 500;
  await enviar(); await baixar();
  assert.equal(state.faturas[0].valor_total, 300, 'Demais titulos da fatura preservados');
  assert.equal(state.vinculos.length, 1); assert.equal(state.vinculos[0].titulo_financeiro_id, 2);

  reset(); await enviar(); await baixar({ valor_pago: 100, motivo: 'Parte paga por PIX' });
  assert.equal(state.titulos[0].status, 'PARCIAL'); assert.equal(state.titulos[0].valor_saldo, 100);
  assert.equal(state.faturas[0].valor_total, 0, 'Restante continua em aberto, sem fatura ficticia');

  // Baixa com cartao errado/conta errada, parcial em credito e ausencia de forma.
  for (const [dados, erro] of [[{ forma_pagamento_id: 1, cartao_id: 30 }, /cartao ativo/],
    [{ forma_pagamento_id: 1, cartao_id: 10, conta_bancaria_id: 8 }, /conta pagadora/],
    [{ forma_pagamento_id: 1, cartao_id: 10, valor_pago: 100, motivo: 'parcial' }, /integralmente/],
    [{ forma_pagamento_id: undefined }, /forma efetiva/]]) {
    reset(); await enviar(); const antes = snapshot(); await assert.rejects(baixar(dados), erro);
    assert.equal(snapshot(), antes, 'Falha preserva titulo/fatura/fila');
  }
  // Permissao/visibilidade de envio e gate de baixa seguem os existentes.
  reset(); req.user.preparar = false;
  await assert.rejects(enviar(), /Permissao/); assert.equal(state.fila.length, 0);
  reset(); req.user.scope = [2]; await assert.rejects(enviar(), /obra do seu acesso/);
  // A permissao propria de baixa da fila nao usa a ACL de edicao de titulos.
  // Nao criar outra permissao nem ampliar a rota nesta correcao.
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  assert(routes.includes("router.post('/financeiro/fila-pagamentos/baixar', allowFilaPagamentosBaixa"));
  // Mudancas entre envio e baixa sao revalidadas antes de qualquer correcao.
  for (const alterar of [
    () => { state.faturas[0].status = 'PAGA'; },
    () => { state.faturas[0].status = 'FECHADA'; },
    () => { state.faturas[0].status = 'PARCIAL'; },
    () => { state.faturas[0].data_pagamento = '2026-10-15'; },
    () => { state.faturas[0].conciliacao_bancaria_id = 3; },
    () => { state.movimentos.push(registro({ id: 90, fatura_cartao_id: 79, tipo_movimento: 'PAGAMENTO_FATURA', status: 'ATIVO' })); },
    () => { state.movimentos.push(registro({ id: 91, titulo_financeiro_id: 1, tipo_movimento: 'BAIXA', status: 'ATIVO' })); },
    () => { state.titulos[0].valor_baixado = 1; state.titulos[0].status = 'PARCIAL'; },
    () => { state.vinculos[0].fatura_cartao_id = 90; },
    () => { state.faturas.length = 0; }
  ]) {
    reset(); await enviar(); alterar(); const antes = snapshot();
    await assert.rejects(baixar(), /fatura|movimento|baixa anterior|Vinculo/);
    assert.equal(snapshot(), antes, 'Estado posterior protegido');
  }
  // Lancamento de compra quitada de OUTRO titulo nao e pagamento da fatura.
  reset(); state.movimentos.push(registro({ id: 9, titulo_financeiro_id: 2, fatura_cartao_id: 79,
    tipo_movimento: 'BAIXA', status: 'ATIVO', forma_recebimento: 'CARTAO_CREDITO' }));
  await enviar(); await baixar(); assert.equal(state.titulos[0].status, 'QUITADO');
  // Auditoria e baixa real falhando revertem tambem desvinculo/recalculo.
  reset(); await enviar(); falharAuditoria = true; const antesAudit = snapshot();
  await assert.rejects(baixar(), /Auditoria/); assert.equal(snapshot(), antesAudit);
  reset(); await enviar(); const antesBaixa = snapshot(); const eventosAntes = state.eventos.length;
  const obter = h.faturaMocks.obterOuCriarFaturaCartao;
  h.faturaMocks.obterOuCriarFaturaCartao = async () => { throw Error('Fatura destino indisponivel'); };
  await assert.rejects(baixar({ forma_pagamento_id: 1, cartao_id: 10 }), /destino/);
  h.faturaMocks.obterOuCriarFaturaCartao = obter;
  assert.equal(snapshot(), antesBaixa); assert.equal(state.eventos.length, eventosAntes, 'So auditoria de envio permanece');
  // Divergencia acima do saldo nao desfaz previsao ate autorizacao efetiva.
  reset(); await enviar(); await baixar({ valor_pago: 210, motivo: 'valor conferido' });
  assert.equal(state.fila[0].status, 'DIVERGENTE'); assert.equal(state.titulos[0].fatura_cartao_id, 79);
  state.fila[0].comprovante_hash = 'qa'; state.fila[0].comprovante_url = 'isolado://qa';
  await fila.aprovarDivergenciasFila(req, { fila_ids: [state.fila[0].id], justificativa: 'Conferido QA', idempotency_key: 'aprovar' });
  assert.equal(state.titulos[0].fatura_cartao_id, null); assert.equal(state.movimentos[0].forma_recebimento, 'PIX');
  assert.equal(state.faturas[0].valor_total, 0);

  // Falha no segundo titulo reverte correcao, faturas e baixa do primeiro.
  reset(); await enviar();
  state.titulos.push(registro({ ...JSON.parse(JSON.stringify(state.titulos[0])), id: 2, fatura_cartao_id: 80 }));
  state.faturas.push(registro({ id: 80, status: 'PAGA', cartao_id: 40, valor_total: 200 }));
  state.vinculos.push(registro({ id: 2, titulo_financeiro_id: 2, fatura_cartao_id: 80 }));
  state.fila.push(registro({ ...JSON.parse(JSON.stringify(state.fila[0])), id: 2, titulo_financeiro_id: 2 }));
  const antesLote = snapshot();
  await assert.rejects(fila.registrarBaixasFila(req, { idempotency_key: 'lote-atomico', itens: [1,2].map(id => ({
    fila_id: id, data_baixa: '2026-10-16', conta_bancaria_id: 5, valor_pago: 200, forma_pagamento_id: 3
  })) }), /fatura prevista/);
  assert.equal(snapshot(), antesLote); assert.equal(state.movimentos.length, 0);
  console.log('OK: fila/baixa/recalculo reais, previsao preservada no envio, PIX/cartao efetivos, ACL, replay, fatura paga/fechada, movimentos, rollback e divergencias. Banco somente simulado.');
}
module.exports = { h, load, memoria, reset, previsao, faturas, fila };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
