'use strict';
// Executa os sincronizadores REAIS de pedido, comercial e medição com um
// repositório em memória. Não carrega credenciais e não substitui teste MySQL.
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const mock = (path, exports) => { require.cache[require.resolve(path)] = { exports, loaded: true }; };
const transaction = { LOCK: { UPDATE: 'UPDATE' }, afterCommit() {} };
const state = {
  TituloFinanceiro: [
    { id: 1, status: 'RENEGOCIADO', renegociado_por_id: 1, obra_id: 3, solicitacao_id: null, valor_original: '150.00', valor_baixado: '50.00', valor_saldo: '0.00' },
    { id: 2, status: 'RENEGOCIADO', renegociado_por_id: 1, obra_id: 4, solicitacao_id: 12, valor_original: '200.00', valor_baixado: '0.00', valor_saldo: '0.00' },
    { id: 3, status: 'ABERTO', renegociacao_id: 1, valor_original: '330.00', valor_baixado: '0.00', valor_saldo: '330.00', data_vencimento: '2090-01-01' }
  ],
  TituloRenegociacaoAlocacao: [
    { id: 1, titulo_origem_id: 1, titulo_destino_id: 3, obra_id: 3, valor: '110.00', principal: '100.00', juros: '10.00', multa: '0.00' },
    { id: 2, titulo_origem_id: 2, titulo_destino_id: 3, obra_id: 4, valor: '220.00', principal: '200.00', juros: '20.00', multa: '0.00' }
  ],
  MovimentoFinanceiro: [], Obra: [{ id: 3 }, { id: 4 }], CategoriaFinanceira: [],
  PedidoCompraTitulo: [{ id: 1, pedido_compra_id: 21, titulo_financeiro_id: 1, status_liberacao: 'LIBERADO' }],
  PedidoCompraFrete: [],
  PedidoCompra: [{ id: 21, solicitacao_compra_id: 31, status: 'FECHADO_FORNECEDOR', financeiro_fluxo_versao: 1, status_financeiro: 'LIBERADO_FINANCEIRO' }],
  SolicitacaoCompra: [{ id: 31, solicitacao_principal_id: 11 }],
  SolicitacaoCompraAlocacao: [
    { id: 1, pedido_compra_id: 21, titulo_financeiro_id: 1, status: 'ATIVA', status_financeiro: 'PREVISTO', solicitacao_compra_id: 31 },
    { id: 2, pedido_compra_id: null, titulo_financeiro_id: 2, status: 'ATIVA', status_financeiro: 'PREVISTO', solicitacao_compra_id: 31 },
    { id: 3, pedido_compra_id: null, titulo_financeiro_id: 99, status: 'ATIVA', status_financeiro: 'PREVISTO', solicitacao_compra_id: 31 }
  ],
  Solicitacao: [11, 12, 13].map(id => ({ id, status_global: 'TITULO_CADASTRADO', area_responsavel: 'FINANCEIRO' })),
  Contrato: [{ id: 41, codigo: 'CT-41', solicitacao_id: 13, fluxo_novo: true }],
  ContratoParcela: [{ id: 51, contrato_id: 41, titulo_financeiro_id: 1, valor: 150, numero: 1 }],
  MedicaoParcela: [{ id: 61, contrato_parcela_id: 51, devolvido_em: null }],
  ContratoComercial: [{ id: 71, numero: 'CC-71', status: 'ATIVO' }],
  ContratoComercialParcela: [{ id: 81, contrato_comercial_id: 71, titulo_financeiro_id: 2, valor_original: 200, data_vencimento: '2020-01-01' }],
  Historico: [], ContratoComercialEvento: [], SolicitacaoPedidoRetorno: []
};
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(k => {
    const v = where[k];
    if (k === Op.and) return v.every(c => matches(row, c));
    if (k === Op.or) return v.some(c => matches(row, c));
    if (Array.isArray(v)) return v.includes(row[k]);
    if (v && typeof v === 'object') {
      if (v[Op.in]) return v[Op.in].includes(row[k]);
      if (v[Op.notIn]) return !v[Op.notIn].includes(row[k]);
      if (Object.hasOwn(v, Op.ne)) return v[Op.ne] === null ? row[k] != null : row[k] !== v[Op.ne];
      throw new Error(`Condição não simulada: ${String(k)}`);
    }
    return v == null ? row[k] == null : row[k] === v;
  });
}
function instance(row, include = []) {
  if (!row) return null;
  const value = { ...row };
  for (const inc of include) if (['titulo', 'tituloFinanceiro'].includes(inc.as)) {
    const t = state.TituloFinanceiro.find(t => t.id === row.titulo_financeiro_id);
    // Aplicar attributes expõe bugs em projeções que dependam de campos não selecionados.
    value[inc.as] = t && instance(inc.attributes ? Object.fromEntries(inc.attributes.map(k => [k, t[k]])) : t);
  }
  Object.defineProperties(value, {
    toJSON: { value: () => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v?.toJSON ? v.toJSON() : v])) },
    update: { value: async (data, options) => {
      assert.equal(options.transaction, transaction); Object.assign(row, data); Object.assign(value, data);
    } }
  });
  return value;
}
const db = {};
for (const name of Object.keys(state)) db[name] = {
  findAll: async ({ where, include, transaction: tx } = {}) => {
    assert.equal(tx, transaction, `${name}: leitura fora da transação`);
    return state[name].filter(row => matches(row, where)).map(row => instance(row, include));
  },
  findOne: async options => (await db[name].findAll(options))[0] || null,
  findByPk: async (id, options) => db[name].findOne({ ...options, where: { id: Number(id) } }),
  update: async (data, options) => {
    assert.equal(options.transaction, transaction);
    for (const row of state[name].filter(row => matches(row, options.where))) Object.assign(row, data);
  },
  create: async (data, options) => {
    assert.equal(options.transaction, transaction); state[name].push({ ...data });
  },
  count: async () => 0
};
db.sequelize = { transaction: () => { throw new Error('Não pode abrir transação separada na sincronização'); } };
mock('../src/models', db);
mock('../src/services/tituloFinanceiroService', {});
mock('../src/services/notificacoes', {});
mock('../src/services/securityLogService', {});
mock('../src/services/recargaCartaoService', { sincronizarCicloAposBaixa: async () => null });
mock('../src/services/contratoParcelasService', { paraCentavos: v => Math.round(Number(v) * 100) });
mock('../src/services/formasPagamentoMedicaoService', {});
const sync = require('../src/services/tituloRenegociacaoSincronizacao');
async function main() {
  await sync.sincronizarOrigens([1, 2], { transaction, usuarioId: 99 });
  assert.equal(state.PedidoCompra[0].status_financeiro, 'PAGO_PARCIALMENTE');
  assert.equal(state.ContratoComercial[0].status, 'ATIVO', 'vencimento renegociado deve prevalecer');
  assert.equal(state.Solicitacao[2].status_global, 'LIBERADO');
  const original = JSON.stringify(state.TituloFinanceiro.slice(0, 2));
  for (const [valor, status, esperadoPedido, esperadoComercial, esperadoContrato] of [
    ['100.00', 'PARCIAL', 'PAGO_PARCIALMENTE', 'ATIVO', 'LIBERADO'],
    ['330.00', 'QUITADO', 'CONCLUIDO', 'QUITADO', 'PAGA'],
    ['0.00', 'ABERTO', 'PAGO_PARCIALMENTE', 'ATIVO', 'LIBERADO']
  ]) {
    state.MovimentoFinanceiro = Number(valor) ? [{ id: 1, titulo_financeiro_id: 3, tipo_movimento: 'BAIXA', status: 'ATIVO', valor, valor_quitacao: valor }] : [];
    Object.assign(state.TituloFinanceiro[2], { status, valor_baixado: valor, valor_saldo: (330 - Number(valor)).toFixed(2) });
    await sync.sincronizarDestinos([3], { transaction, usuarioId: 99 });
    assert.equal(state.PedidoCompra[0].status_financeiro, esperadoPedido);
    assert.equal(state.ContratoComercial[0].status, esperadoComercial);
    assert.equal(state.Solicitacao[2].status_global, esperadoContrato);
    assert.equal(state.SolicitacaoCompraAlocacao[1].status_financeiro, status === 'QUITADO' ? 'REALIZADO' : 'PREVISTO');
    assert.equal(state.SolicitacaoCompraAlocacao[1].titulo_financeiro_id, 2);
    assert.equal(state.SolicitacaoCompraAlocacao[2].status_financeiro, 'PREVISTO');
    assert.equal(JSON.stringify(state.TituloFinanceiro.slice(0, 2)), original);
    assert.equal(state.ContratoParcela[0].valor, 150, 'cronograma contratual não pode ser reescrito pela negociação');
    assert.equal(state.ContratoComercialParcela[0].data_vencimento, '2020-01-01');
  }
  await assert.rejects(sync.sincronizarOrigens([1]), /transação/);
  // Uma baixa composta estorna todos os movimentos antes de atualizar os títulos.
  // A guarda continua ativa; só o sincronizador é adiado até o estado completo.
  state.TituloFinanceiro.push({ ...state.TituloFinanceiro[2], id: 4 });
  state.TituloRenegociacaoAlocacao.push(...state.TituloRenegociacaoAlocacao.map(a => ({ ...a, id: a.id + 2, titulo_destino_id: 4 })));
  state.MovimentoFinanceiro = [3, 4].map(id => ({ id, titulo_financeiro_id: id, tipo_movimento: 'BAIXA', status: 'ATIVO', valor: '330.00', valor_quitacao: '330.00' }));
  for (const t of state.TituloFinanceiro.filter(t => t.renegociacao_id)) Object.assign(t, { valor_baixado: '330.00', valor_saldo: '0.00', status: 'QUITADO' });
  await sync.sincronizarDestinos([3, 4], { transaction });
  assert.equal(state.PedidoCompra[0].status_financeiro, 'CONCLUIDO');
  state.MovimentoFinanceiro.forEach(m => { m.status = 'ESTORNADO'; });
  for (const t of state.TituloFinanceiro.filter(t => t.renegociacao_id)) {
    Object.assign(t, { valor_baixado: '0.00', valor_saldo: '330.00', status: 'ABERTO' });
    await sync.aposAtualizarTitulo({ ...t, changed: () => true }, { transaction, adiarSincronizacaoRenegociacao: true });
  }
  await sync.sincronizarDestinos([3, 4], { transaction });
  assert.equal(state.PedidoCompra[0].status_financeiro, 'PAGO_PARCIALMENTE');
  assert.equal(state.ContratoComercial[0].status, 'ATIVO');
  console.log('OK: sincronizadores reais de pedido, contrato comercial, medição e solicitação: parcial, integral e estorno; alocação legada; mesma transação; origens preservadas. Repositório simulado, sem MySQL.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
