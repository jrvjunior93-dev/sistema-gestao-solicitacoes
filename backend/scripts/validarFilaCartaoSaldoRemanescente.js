'use strict';
// Fila, baixa, faturas e estorno reais com modelos/transacoes em memoria.
// Nao carregar .env, models reais, rede ou qualquer banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const validators = require('../src/validators/paymentValidators');

async function validarQuitacaoSaldoCartao({ h, reset, fila }) {
  const { state, models, req, registro, isolated } = h;
  const centavos = value => Math.round(Number(value) * 100);
  const snapshot = () => JSON.stringify({ titulos: state.titulos, movimentos: state.movimentos,
    fila: state.fila, faturas: state.faturas, parcelas: state.parcelas, historico: state.historico });
  const body = (extra = {}, key = 'qa-saldo-pix-cartao-6x') => validators.validateManualPaymentQueueProcessBody({
    idempotency_key: key, itens: [{ fila_id: 1, conta_bancaria_id: 5, forma_pagamento_id: 1, cartao_id: 10,
      valor_pago: 29000, desconto: 6853.30, juros: 0, multa: 0, data_baixa: '2026-10-21',
      parcelamento_cartao: { quantidade_parcelas: 6, data_compra: '2026-10-20' }, ...extra }]
  });
  async function preparar() {
    reset();
    Object.assign(state.titulos[0], { codigo: 'TIT-SALDO-CARTAO-QA', valor_original: 40810,
      valor_saldo: 40810, valor_baixado: 0, data_vencimento: '2026-10-19' });
    // Primeiro pagamento nao e um numero isolado no titulo: gerar o PIX real.
    await isolated.exports.baixarTitulo(req, 1, { empresa_id: 1, conta_bancaria_id: 5,
      forma_recebimento: 'PIX', valor: 4956.70, juros: 0, multa: 0, desconto: 0,
      data_movimento: '2026-10-20', observacoes: 'PIX anterior que deve ser preservado' });
    assert.equal(state.titulos[0].status, 'PARCIAL');
    assert.equal(centavos(state.titulos[0].valor_saldo), 3585330);
    assert.equal(state.movimentos.length, 1);
    assert.equal(state.movimentos[0].forma_recebimento, 'PIX');
    h.colocarNaFila(state.titulos[0]);
    return { pix: JSON.stringify(state.movimentos[0]), historico: JSON.stringify(state.historico),
      quantidadeHistorico: state.historico.length };
  }
  async function rejeitarSemEfeito(payload, erro, configurar = () => {}) {
    await preparar();
    configurar();
    const antes = snapshot();
    await assert.rejects(fila.registrarBaixasFila(req, payload), erro);
    assert.equal(snapshot(), antes, 'Rejeicao preserva PIX, saldo, fila, faturas e historico');
  }

  const anterior = await preparar();
  const entrada = body();
  const resultado = await fila.registrarBaixasFila(req, entrada);
  assert.equal(resultado.baixados, 1);
  assert.equal(resultado.divergentes, 0);
  assert.equal(JSON.stringify(state.movimentos[0]), anterior.pix);
  assert.equal(JSON.stringify(state.historico.slice(0, anterior.quantidadeHistorico)), anterior.historico);
  assert.equal(state.movimentos.length, 2);
  const cartao = state.movimentos[1];
  assert.equal(cartao.forma_recebimento, 'CARTAO_CREDITO');
  assert.equal(centavos(cartao.valor), 3585330);
  assert.equal(centavos(cartao.desconto), 685330);
  assert.equal(centavos(cartao.valor_quitacao), 2900000);
  assert.equal(cartao.fatura_cartao_id, null);
  assert.equal(state.titulos.length, 1);
  assert.equal(state.titulos[0].status, 'QUITADO');
  assert.equal(centavos(state.titulos[0].valor_baixado), 4081000);
  assert.equal(centavos(state.titulos[0].valor_saldo), 0);
  assert.equal(state.fila[0].status, 'BAIXADO');
  assert.equal(centavos(state.fila[0].instrumento_pagamento_json.desconto), 685330);
  assert.equal(state.parcelas.length, 6);
  assert.deepEqual(state.parcelas.map(item => centavos(item.valor)), [483334,483334,483333,483333,483333,483333]);
  assert(state.parcelas.every(item => item.movimento_financeiro_id === cartao.id));
  assert.equal(state.faturas.length, 6);
  assert.equal(state.faturas.reduce((sum, item) => sum + centavos(item.valor_total), 0), 2900000);
  assert(state.faturas.every(item => item.status === 'ABERTA'));
  assert.equal(state.historico.length, anterior.quantidadeHistorico + 1);
  assert.match(state.historico.at(-1).observacao, /6 parcela\(s\).*29\.000,00/);
  const apos = snapshot();
  await fila.registrarBaixasFila(req, entrada);
  assert.equal(snapshot(), apos, 'Replay nao duplica baixa, parcelas nem historico');
  await assert.rejects(fila.registrarBaixasFila(req, body({}, 'outra-chave-mesmo-titulo')), /nao esta mais pendente/);
  assert.equal(snapshot(), apos, 'Outra chave nao permite segunda baixa');

  // Fatura processada bloqueia o estorno apenas da compra nova, sem tocar PIX.
  state.faturas[2].status = 'PAGA';
  let antes = snapshot();
  await assert.rejects(fila.estornarBaixaFila(req, 1, { motivo: 'Teste isolado', idempotency_key: 'qa-estorno-saldo' }), /fatura do parcelamento/);
  assert.equal(snapshot(), antes);
  state.faturas[2].status = 'ABERTA';
  await fila.estornarBaixaFila(req, 1, { motivo: 'Estornar apenas compra no cartao', idempotency_key: 'qa-estorno-saldo' });
  assert.equal(JSON.stringify(state.movimentos[0]), anterior.pix);
  assert.equal(state.movimentos[1].status, 'ESTORNADO');
  assert.equal(state.titulos[0].status, 'PARCIAL');
  assert.equal(centavos(state.titulos[0].valor_baixado), 495670);
  assert.equal(centavos(state.titulos[0].valor_saldo), 3585330);
  assert(state.parcelas.every(item => item.status === 'ESTORNADA'));
  assert.equal(state.faturas.reduce((sum, item) => sum + centavos(item.valor_total), 0), 0);
  assert.equal(state.fila.at(-1).status, 'PENDENTE');

  // Sem config validada continua no fluxo legado, que nao recebe saldo parcial.
  const legado = body(); delete legado.itens[0].parcelamento_cartao;
  await rejeitarSemEfeito(legado, /integralmente/);
  // A excecao e para quitar o saldo, nao para abrir pagamentos parciais na fila.
  await rejeitarSemEfeito(body({ valor_pago: 28999.99, motivo: 'Justificativa nao dispensa a trava' }), /integralmente/);
  await rejeitarSemEfeito(body({ valor_pago: 29000.01, motivo: 'Justificativa nao dispensa a trava' }), /integralmente/);
  await rejeitarSemEfeito(body({ desconto: 0 }), /integralmente/);
  await rejeitarSemEfeito(body(), /fatura desta compra nao esta aberta/, () => {
    state.faturas.push(registro({ id: 70, cartao_id: 10, competencia: '2027-01', status: 'PAGA', valor_total: 321 }));
  });
  await rejeitarSemEfeito(body(), /fatura desta compra nao esta aberta/, () => {
    state.faturas.push(registro({ id: 70, cartao_id: 10, competencia: '2027-01', status: 'FECHADA', valor_total: 321 }));
  });
  await rejeitarSemEfeito(body(), /Pagamento bloqueado pelo proprietario/, () => {
    state.titulos[0].bloqueio_pagamento_proprietario = { item_id: 1, motivo: 'Saldo suspenso' };
  });
  await rejeitarSemEfeito(body({ conta_bancaria_id: 999 }), /conta pagadora deve ser a vinculada/);
  await rejeitarSemEfeito(body({ cartao_id: 20 }), /debito nao permite parcelamento/);
  await rejeitarSemEfeito(body(), /nao permite parcelamento/, () => { h.formas[0].permite_parcelamento = false; });
  h.formas[0].permite_parcelamento = true;
  await rejeitarSemEfeito(body(), /nao esta mais disponivel/, () => { state.titulos[0].status = 'CANCELADO'; });

  // Erro depois de criar movimento/parcelas precisa reverter toda a compra nova.
  await preparar(); antes = snapshot();
  const criarParcela = models.CartaoBaixaParcela.create;
  models.CartaoBaixaParcela.create = async (dados, options) => {
    if (dados.numero_parcela === 4) throw Error('Falha injetada na parcela 4');
    return criarParcela(dados, options);
  };
  try { await assert.rejects(fila.registrarBaixasFila(req, body()), /Falha injetada/); }
  finally { models.CartaoBaixaParcela.create = criarParcela; }
  assert.equal(snapshot(), antes, 'Rollback total da compra nova preserva o PIX anterior');

  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  assert(routes.includes("router.post('/financeiro/fila-pagamentos/baixar', allowFilaPagamentosBaixa"));
  await validarPermissaoBaixaFila(fila, body, preparar, snapshot, routes);
  assert.throws(() => body({ parcelamento_cartao: { quantidade_parcelas: 6, data_compra: '2026-02-30' } }));
  assert.throws(() => body({ parcelamento_cartao: { quantidade_parcelas: 61, data_compra: '2026-10-20' } }));
  console.log('OK: PIX4956,70 preservado + desconto6853,30 + cartao29000 em6x quita40810; historico/replay/estorno/rollback, legado/parcial/excesso/ACL/conta/debito/faturas processadas protegidos. Sem banco/rede.');
}

async function validarPermissaoBaixaFila(fila, body, preparar, snapshot, routes) {
  const read = file => fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');
  const load = (source, dependencies) => {
    const module = { exports: {} };
    vm.runInNewContext(source, { module, console, Date, require(id) {
      assert(Object.hasOwn(dependencies, id), `Dependencia nao isolada: ${id}`);
      return dependencies[id];
    } });
    return module.exports;
  };
  const auth = load(read('services/authorizationService.js'), {
    '../models': { ConfiguracaoSistema: { findOne: async () => null }, UsuarioObra: {},
      Setor: { findByPk: async () => { throw Error('Consulta de setor inesperada'); } } },
    './setorCapabilityService': { userHasSetorCapability: async (user, key) =>
      key === 'eh_setor_financeiro' && user?.setor?.codigo === 'FINANCEIRO' },
    '../constants/rhDpPermissions': require('../src/constants/rhDpPermissions'),
    '../constants/moduloPermissoes': require('../src/constants/moduloPermissoes')
  });
  const denied = [];
  const permit = load(read('middlewares/permissions.js'), {
    '../services/authorizationService': auth,
    '../services/securityLogService': { registrarEventoSeguranca: async event => denied.push(event) }
  });
  const section = (start, end) => {
    const begin = routes.indexOf(start), finish = routes.indexOf(end, begin);
    assert(begin >= 0 && finish > begin);
    return routes.slice(begin, finish);
  };
  let handlers, executados = 0;
  const context = { permit, canBaixarFilaPagamentos: auth.canBaixarFilaPagamentos,
    router: { post: (_url, ...steps) => { handlers = steps; } },
    criticalRateLimit: (_req, _res, next) => next(),
    validateRequest: config => (req, _res, next) => { req.body = config.body(req.body); return next(); },
    validateManualPaymentQueueProcessBody: validators.validateManualPaymentQueueProcessBody,
    PagamentoManualFilaController: { baixar: async (req, res) => {
      executados++; return res.json(await fila.registrarBaixasFila(req, req.body));
    } }
  };
  const route = routes.split(/\r?\n/).find(line => line.startsWith("router.post('/financeiro/fila-pagamentos/baixar',"));
  vm.runInNewContext(section('function allowPaymentAction(', 'const allowPagamentosRead =') +
    section('const allowFilaPagamentosBaixa =', 'const allowFilaPagamentosReportar =') + route, context);
  const user = keys => ({ id: 17, perfil: 'USUARIO', setor: { codigo: 'FINANCEIRO' },
    areas_permissoes_configuradas: true, areas_permissoes: keys });
  async function chamar(actor) {
    let status = 200;
    const req = { user: actor, body: body(), method: 'POST', originalUrl: '/financeiro/fila-pagamentos/baixar' };
    const res = { status(code) { status = code; return this; }, json() { return this; } };
    const next = async index => { if (index < handlers.length) await handlers[index](req, res, () => next(index + 1)); };
    await next(0); return status;
  }
  await preparar();
  const antes = snapshot();
  assert.equal(await chamar(null), 401);
  assert.equal(await chamar(user([])), 403);
  assert.equal(await chamar(user(['financeiro.fila_pagamentos.visualizar'])), 403);
  assert.equal(snapshot(), antes);
  assert.equal(executados, 0, 'Negativas nao chegam ao servico de baixa');
  assert.equal(denied.length, 2);
  assert.equal(await chamar(user(['financeiro.fila_pagamentos.baixar'])), 200);
  assert.equal(executados, 1, 'Operador granular autorizado conclui a mesma baixa, sem SUPERADMIN');
}
module.exports = { validarQuitacaoSaldoCartao };
if (require.main === module) validarQuitacaoSaldoCartao(require('./validarCartaoParcelamentoBaixa'))
  .catch(error => { console.error(error); process.exitCode = 1; });
