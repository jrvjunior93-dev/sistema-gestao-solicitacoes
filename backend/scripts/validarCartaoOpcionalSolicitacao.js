'use strict';

// Executa o servico real com todas as fronteiras de banco substituidas em memoria.
// Nao carrega models reais, dotenv, credenciais ou conexoes externas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateFinanceTituloCreateFromSolicitacaoBody } = require('../src/validators/financialValidators');

const file = path.resolve(__dirname, '../src/services/tituloFinanceiroService.js');
const state = { titulos: [], movimentos: [], faturas: [], eventos: [], historico: [], commits: 0, rollbacks: 0 };
function registro(data) {
  return { ...data, async update(changes) { Object.assign(this, changes); return this; }, setDataValue(key, value) { this[key] = value; } };
}
const formas = [
  { id: 1, tipo: 'CARTAO_CREDITO', codigo: 'CARTAO_CREDITO', ativo: true, exige_cartao: true, gera_fatura: true, permite_parcelamento: true },
  { id: 2, tipo: 'CARTAO_DEBITO', codigo: 'CARTAO_DEBITO', ativo: true, exige_cartao: true, gera_fatura: false, permite_parcelamento: false },
  { id: 3, tipo: 'PIX', codigo: 'PIX', ativo: true, exige_cartao: false }
];
const conta = { id: 5, empresa_id: 1, ativo: true };
const cartoes = [
  { id: 10, nome: 'Credito QA', tipo: 'CREDITO', ativo: true, contaBancaria: conta },
  { id: 20, nome: 'Debito QA', tipo: 'DEBITO', ativo: true, contaBancaria: conta },
  { id: 30, nome: 'Inativo QA', tipo: 'CREDITO', ativo: false, contaBancaria: conta }
];
const solicitacao = registro({ id: 100, codigo: 'SOL-QA', valor: 200, obra_id: 1, parceiro_id: 1,
  createdAt: new Date('2026-10-07T15:00:00Z'), obra: { id: 1, empresa_grupo_id: 1 },
  data_vencimento: '2026-10-20', area_responsavel: 'GEO', status_global: 'PENDENTE' });
const noRecords = { findAll: async () => [], findOne: async () => null };
const models = new Proxy({
  FormaPagamentoFinanceira: { findByPk: async (id) => formas.find((item) => item.id === Number(id)) },
  CartaoFinanceiro: { findByPk: async (id) => cartoes.find((item) => item.id === Number(id)) },
  ContaBancaria: { findByPk: async () => conta },
  EmpresaGrupo: { findByPk: async () => ({ id: 1, ativo: true }) },
  Parceiro: { findByPk: async () => ({ id: 1, ativo: true, fornecedor: true, cliente: true }) },
  CategoriaFinanceira: { findByPk: async () => ({ id: 1, ativo: true, natureza: 'DESPESA', classificacao_dre: 'CUSTO' }) },
  Solicitacao: { findByPk: async () => solicitacao },
  Historico: { create: async (data) => { state.historico.push(data); return data; } },
  MovimentoFinanceiro: { create: async (data) => { const row = registro({ id: state.movimentos.length + 1, ...data }); state.movimentos.push(row); return row; } },
  TituloFinanceiro: {
    create: async (data) => { const row = registro({ id: state.titulos.length + 1, ...data }); state.titulos.push(row); return row; },
    findByPk: async (id) => state.titulos.find((item) => item.id === Number(id))
  },
  sequelize: { transaction: async () => ({ commit: async () => { state.commits++; }, rollback: async () => { state.rollbacks++; }, LOCK: { UPDATE: 'UPDATE' } }) }
}, { get: (target, key) => key in target ? target[key] : noRecords });

const dependencies = {
  crypto: require('node:crypto'),
  sequelize: { Op: new Proxy({}, { get: (_, key) => Symbol.for(key) }) },
  '../models': models,
  './authorizationService': { canAccessFinanceiro: async () => true, getFinanceiroObraScopeIds: async () => null },
  './apropriacaoSelecaoService': {},
  './faturaCartaoFinanceiroService': {
    obterOuCriarFaturaCartao: async (data) => { const fatura = { id: state.faturas.length + 1, ...data }; state.faturas.push(fatura); return { fatura }; },
    vincularTituloAFatura: async ({ titulo, fatura }) => titulo.update({ fatura_cartao_id: fatura.id })
  },
  './financeiroCaixaSessionHelper': { obterSessaoAbertaParaConta: async () => null },
  './securityLogService': { registrarEventoSeguranca: async (data) => state.eventos.push(data) },
  '../constants/intercompany': require('../src/constants/intercompany'),
  './tituloIntercompanyCartaoHelper': require('../src/services/tituloIntercompanyCartaoHelper'),
  './solicitacaoFinanceiroStatusService': { sincronizarStatusSolicitacaoPorBaixaTitulos: async () => {} },
  './conciliacaoEstornoService': {},
  './tituloBloqueioRetornoObraService': { assertTituloDisponivelParaBaixa: () => {} },
  '../utils/tituloFinanceiroStatusFilter': {},
  './comercialService': { sincronizarContratoComercialPorTituloFinanceiro: async () => {} }
};
const isolated = { exports: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\nmodule.exports.test = { validarFormaPagamentoFinanceira, resolverFormaPagamentoBaixa, resolverCartaoBaixa };', {
  module: isolated, console, Date, Intl,
  require(id) { if (!(id in dependencies)) throw new Error(`Dependencia nao isolada: ${id}`); return dependencies[id]; }
}, { filename: file });
const { criarTituloPorSolicitacao, baixarTitulo, test } = isolated.exports;
const req = { user: { id: 99, setor: { codigo: 'GEO' } } };
const pagamento = (formaId, cartaoId, valor = 200, parcelas = 1) => ({ forma_pagamento_id: formaId, cartao_id: cartaoId,
  categoria_financeira_id: 1, valor, quantidade_parcelas: parcelas, data_compra: '2026-10-07', data_vencimento: '2026-10-20' });
const gerar = (pagamentos, status = 'ABERTO') => criarTituloPorSolicitacao(req, 100, { tipo: 'PAGAR', status, parceiro_id: 1,
  categoria_financeira_id: 1, pagamentos });
function reset() { for (const key of ['titulos', 'movimentos', 'faturas', 'eventos', 'historico']) state[key] = []; state.commits = 0; state.rollbacks = 0; solicitacao.status_global = 'PENDENTE'; }

async function main() {
  const validado = validateFinanceTituloCreateFromSolicitacaoBody({ categoria_financeira_id: 1, pagamentos: [pagamento(1)] });
  assert.equal(validado.pagamentos[0].cartao_id, undefined);
  assert.throws(() => validateFinanceTituloCreateFromSolicitacaoBody({ categoria_financeira_id: 1, permitirCartaoPendente: true }), /campos nao permitidos/);
  for (const formaId of [1, 2]) {
    reset();
    const pagamentoSemCartao = pagamento(formaId);
    delete pagamentoSemCartao.data_vencimento; // Mesmo payload do formulario para cartao.
    const titulo = await gerar([pagamentoSemCartao]);
    assert.equal(titulo.status, 'ABERTO');
    assert.equal(titulo.cartao_id, null);
    assert.equal(titulo.forma_pagamento_id, formaId);
    assert.equal(titulo.valor_saldo, 200);
    assert.equal(titulo.valor_baixado, 0);
    assert.equal(titulo.data_quitacao, null);
    assert.equal(titulo.data_vencimento, '2026-10-20');
    assert.equal(state.movimentos.length, 0);
    assert.equal(state.faturas.length, 0);
    assert.equal(state.commits, 1);
    assert(!state.eventos.some((item) => item.tipoEvento === 'FINANCIAL_CARD_SETTLED_ON_CREATE'));
  }
  for (const [formaId, cartaoId] of [[1, 10], [2, 20]]) {
    reset();
    const titulo = await gerar([pagamento(formaId, cartaoId)]);
    assert.equal(titulo.status, 'QUITADO');
    assert.equal(titulo.cartao_id, cartaoId);
    assert.equal(titulo.valor_saldo, 0);
    assert.equal(titulo.valor_baixado, 200);
    assert.equal(state.movimentos.length, 1);
    assert.equal(state.movimentos[0].cartao_id, cartaoId);
    assert.equal(state.faturas.length, formaId === 1 ? 1 : 0);
  }
  reset();
  await gerar([pagamento(1, undefined, 100), pagamento(2, 20, 100)]);
  assert.equal(state.titulos[0].status, 'ABERTO');
  assert.equal(state.titulos[1].status, 'QUITADO');
  assert.equal(state.movimentos.length, 1);
  reset();
  await gerar([pagamento(1, undefined, 200, 2)]);
  assert.equal(state.titulos.length, 2);
  assert(state.titulos.every((item) => item.status === 'ABERTO' && item.valor_saldo === 100));
  assert.equal(state.titulos[1].data_vencimento, '2026-11-20');
  assert.equal(state.movimentos.length, 0);
  reset();
  await assert.rejects(gerar([pagamento(1, 30)]), /inativo/);
  await assert.rejects(gerar([pagamento(1, 20)]), /cartao de credito/);
  await assert.rejects(gerar([pagamento(2, 10)]), /cartao de debito/);
  assert.equal(state.titulos.length, 0);
  // A dispensa da solicitacao nao se transforma em dispensa global ou HTTP.
  await assert.rejects(test.validarFormaPagamentoFinanceira(1, { permitirCartaoPendente: true }), /Informe o cartao/);
  for (const formaId of [1, 2]) {
    const forma = await test.resolverFormaPagamentoBaixa({ forma_pagamento_id: formaId });
    assert.equal(forma.formaRecebimento, 'CARTAO');
    await assert.rejects(test.resolverCartaoBaixa({ formaRecebimento: forma.formaRecebimento }), /Informe o cartao utilizado na baixa/);
  }
  // Criar em aberto e pagar posteriormente usando a mesma baixa real da aplicacao.
  for (const [formaId, cartaoId] of [[1, 10], [2, 20]]) {
    reset();
    const titulo = await gerar([pagamento(formaId)]);
    const payload = { forma_pagamento_id: formaId, conta_bancaria_id: conta.id, valor: 200, data_movimento: '2026-10-08' };
    await assert.rejects(baixarTitulo(req, titulo.id, payload), /Informe o cartao utilizado na baixa/);
    assert.equal(titulo.status, 'ABERTO');
    assert.equal(state.movimentos.length, 0);
    await baixarTitulo(req, titulo.id, { ...payload, cartao_id: cartaoId });
    assert.equal(titulo.status, 'QUITADO');
    assert.equal(titulo.cartao_id, cartaoId);
    assert.equal(titulo.valor_saldo, 0);
    assert.equal(state.movimentos.length, 1);
    assert.equal(state.movimentos[0].cartao_id, cartaoId);
    await assert.rejects(baixarTitulo(req, titulo.id, { ...payload, cartao_id: cartaoId }), /Somente titulos em aberto/);
    assert.equal(state.movimentos.length, 1, 'Repetir a baixa de titulo quitado nao pode duplicar o movimento.');
  }
  reset();
  await gerar([pagamento(1, 10)], 'PREVISAO');
  assert.equal(state.titulos[0].status, 'PREVISAO');
  assert.equal(state.movimentos.length, 0);
  assert.equal(state.faturas.length, 0);
  console.log('Cartao opcional na solicitacao: aberto sem cartao, quitacao com cartao, parcelas e baixa obrigatoria validados sem banco real.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
