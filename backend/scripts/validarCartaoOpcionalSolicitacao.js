'use strict';

// Executa o servico real com todas as fronteiras de banco substituidas em memoria.
// Nao carrega models reais, dotenv, credenciais ou conexoes externas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateFinanceTituloCreateFromSolicitacaoBody } = require('../src/validators/financialValidators');

const file = path.resolve(__dirname, '../src/services/tituloFinanceiroService.js');
const state = { titulos: [], movimentos: [], faturas: [], eventos: [], historico: [], fila: [], cheques: [], chequeEventos: [], commits: 0, rollbacks: 0 };
function registro(data) {
  return { ...data, async update(changes) { Object.assign(this, changes); return this; }, setDataValue(key, value) { this[key] = value; } };
}
const formas = [
  { id: 1, tipo: 'CARTAO_CREDITO', codigo: 'CARTAO_CREDITO', ativo: true, exige_cartao: true, gera_fatura: true, permite_parcelamento: true },
  { id: 2, tipo: 'CARTAO_DEBITO', codigo: 'CARTAO_DEBITO', ativo: true, exige_cartao: true, gera_fatura: false, permite_parcelamento: false },
  { id: 3, tipo: 'PIX', codigo: 'PIX', ativo: true, exige_cartao: false },
  { id: 4, tipo: 'CHEQUE', codigo: 'CHEQUE', ativo: true, exige_cartao: false }
];
const conta = { id: 5, empresa_id: 1, ativo: true };
const cartoes = [
  { id: 10, nome: 'Credito QA', tipo: 'CREDITO', ativo: true, conta_bancaria_id: 5, contaBancaria: conta },
  { id: 20, nome: 'Debito QA', tipo: 'DEBITO', ativo: true, conta_bancaria_id: 5, contaBancaria: conta },
  { id: 30, nome: 'Inativo QA', tipo: 'CREDITO', ativo: false, conta_bancaria_id: 5, contaBancaria: conta }
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
  Obra: { findByPk: async () => ({ id: 1, nome: 'Obra QA', empresa_grupo_id: 1, ativo: true }) },
  TituloFinanceiroImposto: { destroy: async () => {} },
  Parceiro: { findByPk: async () => ({ id: 1, ativo: true, fornecedor: true, cliente: true }) },
  CategoriaFinanceira: { findByPk: async () => ({ id: 1, ativo: true, natureza: 'DESPESA', classificacao_dre: 'CUSTO' }) },
  Solicitacao: { findByPk: async () => solicitacao },
  Historico: { create: async (data) => { state.historico.push(data); return data; } },
  ChequeTerceiro: { findOne: async ({ where }) => state.cheques.find(row => row.id === where.id && row.status === where.status) },
  ChequeTerceiroMovimento: { create: async data => { state.chequeEventos.push(data); return data; } },
  PagamentoManualFilaItem: {
    findByPk: async id => state.fila.find(row => row.id === Number(id)),
    findAll: async ({ where }) => state.fila.filter(row => (!where.id || where.id[Symbol.for('in')].includes(row.id))
      && (!where.titulo_financeiro_id || where.titulo_financeiro_id === row.titulo_financeiro_id)
      && (!where.status || where.status[Symbol.for('in')].includes(row.status)))
  },
  MovimentoFinanceiro: { create: async (data) => { const row = registro({ id: state.movimentos.length + 1, ...data }); state.movimentos.push(row); return row; } },
  TituloFinanceiro: {
    create: async (data) => { const row = registro({ id: state.titulos.length + 1, ...data }); state.titulos.push(row); return row; },
    findByPk: async (id) => state.titulos.find((item) => item.id === Number(id)),
    findAll: async ({ where }) => state.titulos.filter(row => !where.id || where.id[Symbol.for('in')].includes(row.id))
  },
  sequelize: { transaction: async callback => {
    const tx = { commit: async () => { state.commits++; }, rollback: async () => { state.rollbacks++; }, LOCK: { UPDATE: 'UPDATE' } };
    if (!callback) return tx;
    const snapshot = JSON.parse(JSON.stringify(state));
    try { const result = await callback(tx); await tx.commit(); return result; }
    catch (error) {
      for (const [key, value] of Object.entries(snapshot)) state[key] = Array.isArray(value) ? value.map(registro) : value;
      await tx.rollback(); throw error;
    }
  } }
}, { get: (target, key) => key in target ? target[key] : noRecords });

const dependencies = {
  crypto: require('node:crypto'),
  sequelize: { Op: new Proxy({}, { get: (_, key) => Symbol.for(key) }) },
  '../models': models,
  './authorizationService': { canAccessFinanceiro: async () => true, getFinanceiroObraScopeIds: async () => null },
  './apropriacaoSelecaoService': {},
  './faturaCartaoFinanceiroService': {
    obterOuCriarFaturaCartao: async (data) => { const fatura = { id: state.faturas.length + 1, ...data }; state.faturas.push(fatura); return { fatura }; },
    vincularTituloAFatura: async ({ titulo, fatura, leituraCorrente }) => {
      fatura.leituraCorrente = leituraCorrente;
      return titulo.update({ fatura_cartao_id: fatura.id });
    }
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
dependencies['./comercialService'].sincronizarContratoComercialPorTituloEditado = async () => {};
dependencies['./pagamentoFilaValoresDomain'] = require('../src/services/pagamentoFilaValoresDomain');
const saldoModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/pagamentoFilaSaldoService.js'), 'utf8'), {
  module: saldoModule, require(id) { if (!(id in dependencies)) throw Error(`Dependencia nao isolada: ${id}`); return dependencies[id]; }
});
dependencies['./pagamentoFilaSaldoService'] = saldoModule.exports;
const isolated = { exports: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\nmodule.exports.test = { validarFormaPagamentoFinanceira, resolverFormaPagamentoBaixa, resolverCartaoBaixa };', {
  module: isolated, console, Date, Intl,
  require(id) { if (!(id in dependencies)) throw new Error(`Dependencia nao isolada: ${id}`); return dependencies[id]; }
}, { filename: file });
const { criarTituloPorSolicitacao, atualizarTitulo, baixarTitulo, test } = isolated.exports;
const queueFile = path.resolve(__dirname, '../src/services/pagamentoManualFilaService.js');
const queueModule = { exports: {} };
const vinculoModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/tituloSolicitacaoContratoService.js'), 'utf8'), {
  module: vinculoModule, require(id) { if (!(id in dependencies)) throw Error(`Dependencia de vinculo nao isolada: ${id}`); return dependencies[id]; }
});
const queueDependencies = { ...dependencies,
  './tituloSolicitacaoContratoService': vinculoModule.exports,
  './tituloFinanceiroService': { baixarTitulo },
  './analiseProprietarioService': {}, './pagamentoAutorizacaoFilaService': {},
  './s3': {}, './fileAccessService': {}, '../config/env': { env: {} },
  './paymentOwnerApprovalPolicy': {},
  './pagamentoFilaInstrumentoDomain': require('../src/services/pagamentoFilaInstrumentoDomain'),
  './pagamentoFilaValoresDomain': require('../src/services/pagamentoFilaValoresDomain'),
  './pagamentoFilaComprovanteDomain': require('../src/services/pagamentoFilaComprovanteDomain'),
  // Historico de arquivos e exercitado com o helper real em validarFilaComprovantePendente.
  './pagamentoFilaHistoricoService': { registrarComprovantesFilaNoHistorico: async () => {} }
};
vm.runInNewContext(fs.readFileSync(queueFile, 'utf8'), { module: queueModule, console, Date, Intl,
  require(id) { if (!(id in queueDependencies)) throw new Error(`Dependencia de fila nao isolada: ${id}`); return queueDependencies[id]; }
}, { filename: queueFile });
const { registrarBaixasFila, aprovarDivergenciasFila } = queueModule.exports;
const req = { user: { id: 99, setor: { codigo: 'GEO' } } };
const pagamento = (formaId, cartaoId, valor = 200, parcelas = 1) => ({ forma_pagamento_id: formaId, cartao_id: cartaoId,
  categoria_financeira_id: 1, valor, quantidade_parcelas: parcelas, data_compra: '2026-10-07', data_vencimento: '2026-10-20' });
const gerar = (pagamentos, status = 'ABERTO') => criarTituloPorSolicitacao(req, 100, { tipo: 'PAGAR', status, parceiro_id: 1,
  categoria_financeira_id: 1, pagamentos });
function reset() { for (const key of ['titulos', 'movimentos', 'faturas', 'eventos', 'historico', 'fila', 'cheques', 'chequeEventos']) state[key] = []; state.commits = 0; state.rollbacks = 0; solicitacao.status_global = 'PENDENTE'; solicitacao.valor = 200; }
function colocarNaFila(titulo) {
  const row = registro({ id: state.fila.length + 1, titulo_financeiro_id: titulo.id, status: 'PENDENTE',
    valor_previsto: titulo.valor_saldo, comprovante_hash: 'qa', comprovante_url: 'isolado://qa' });
  state.fila.push(row); return row;
}
const itemFila = (fila, instrumento = {}) => ({ fila_id: fila.id, conta_bancaria_id: 5,
  data_baixa: '2026-10-08', valor_pago: 200, ...instrumento });

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
  // Fila real + baixa real: o cartao ainda sera utilizado, nao existia compra na fatura.
  for (const [formaId, cartaoId] of [[1, 10], [2, 20], [3, undefined]]) {
    reset();
    const titulo = await gerar([pagamento(formaId)]), fila = colocarNaFila(titulo);
    fila.comprovante_hash = null; fila.comprovante_url = null;
    const payload = { idempotency_key: 'qa-fila-cartao', itens: [itemFila(fila, { forma_pagamento_id: formaId, cartao_id: cartaoId })] };
    const resultado = await registrarBaixasFila(req, payload);
    assert.equal(resultado.pendentes_comprovante, 1, 'Credito/debito/PIX baixam sem comprovante');
    assert.equal(resultado.itens_pendentes_comprovante[0].fila_id, fila.id);
    assert.equal(titulo.status, 'QUITADO'); assert.equal(fila.status, 'BAIXADO');
    assert.equal(state.movimentos.length, 1); assert.equal(state.faturas.length, formaId === 1 ? 1 : 0);
    if (formaId === 1) { assert.equal(state.faturas[0].novaCompraFila, true);
      assert.equal(state.faturas[0].leituraCorrente, true); assert.equal(titulo.fatura_cartao_id, 1); }
    await registrarBaixasFila(req, payload);
    assert.equal(state.movimentos.length, 1); assert.equal(state.faturas.length, formaId === 1 ? 1 : 0);
    await assert.rejects(registrarBaixasFila(req, { ...payload, idempotency_key: 'nova-chave' }), /nao esta mais pendente/);
  }
  // Parcial sem PDF continua divergente, mas a baixa real tambem deve ser cobrada.
  reset();
  let titulo = await gerar([pagamento(3)]), fila = colocarNaFila(titulo);
  fila.comprovante_hash = null; fila.comprovante_url = null;
  const parcial = await registrarBaixasFila(req, { itens: [itemFila(fila, { forma_pagamento_id: 3, valor_pago: 100, motivo: 'Parcial QA' })] });
  assert.equal(parcial.pendentes_comprovante, 1); assert.equal(fila.status, 'DIVERGENTE');
  assert.equal(titulo.valor_saldo, 100); assert.equal(state.movimentos.length, 1);
  reset(); titulo = await gerar([pagamento(3)]); fila = colocarNaFila(titulo);
  fila.comprovante_hash = null; fila.comprovante_url = null;
  const acima = await registrarBaixasFila(req, { itens: [itemFila(fila, { forma_pagamento_id: 3, valor_pago: 300, motivo: 'Acima QA' })] });
  assert.equal(acima.pendentes_comprovante, 0); assert.equal(fila.status, 'DIVERGENTE');
  assert.equal(titulo.valor_saldo, 200); assert.equal(state.movimentos.length, 0);
  reset();
  titulo = await gerar([pagamento(1)]); fila = colocarNaFila(titulo);
  await assert.rejects(registrarBaixasFila(req, { itens: [itemFila(fila, { forma_pagamento_id: 1 })] }), /cartao ativo/);
  await assert.rejects(registrarBaixasFila(req, { itens: [itemFila(fila, { forma_pagamento_id: 1, cartao_id: 20 })] }), /tipo do cartao/);
  await assert.rejects(registrarBaixasFila(req, { itens: [itemFila(fila, { forma_pagamento_id: 1, cartao_id: 10, valor_pago: 100, motivo: 'Parcial' })] }), /integralmente/);
  assert.equal(state.movimentos.length, 0); assert.equal(state.faturas.length, 0);
  reset(); titulo = await gerar([pagamento(3)]); fila = colocarNaFila(titulo);
  await registrarBaixasFila(req, { itens: [itemFila(fila, { forma_pagamento_id: 4, cheque_numero: '123',
    cheque_emitente: 'Empresa QA', cheque_banco: '001', data_emissao: '2026-10-08', data_vencimento: '2026-10-10' })] });
  assert.equal(state.movimentos[0].cheque_numero, '123'); assert.equal(state.movimentos[0].cheque_emitente, 'Empresa QA');
  assert.equal(state.movimentos[0].cheque_data_vencimento, '2026-10-10');
  for (const duplicado of [false, true]) {
    reset();
    solicitacao.valor = duplicado ? 400 : 200;
    await gerar([pagamento(3, undefined, 200), ...(duplicado ? [pagamento(3, undefined, 200)] : [])]);
    state.cheques.push(registro({ id: 77, status: 'EM_CARTEIRA', valor: 200, empresa_id: 1 }));
    const payload = { itens: state.titulos.map(title => itemFila(colocarNaFila(title), {
      forma_pagamento_id: 4, usar_cheque_terceiro: true, cheque_terceiro_id: 77 })) };
    if (duplicado) {
      await assert.rejects(registrarBaixasFila(req, payload), /indisponivel ou ja utilizado/);
      assert.equal(state.movimentos.length, 0); assert.equal(state.chequeEventos.length, 0);
      assert(state.titulos.every(row => row.status === 'ABERTO')); assert(state.fila.every(row => row.status === 'PENDENTE'));
      assert.equal(state.cheques[0].status, 'EM_CARTEIRA');
    } else {
      await registrarBaixasFila(req, payload);
      assert.equal(state.cheques[0].status, 'UTILIZADO'); assert.equal(state.chequeEventos.length, 1);
      assert.equal(state.movimentos[0].conta_bancaria_id, null, 'Cheque de terceiro nao duplica saida bancaria.');
    }
  }
  // Encargos nunca viram principal. Services reais da fila + baixa + edicao.
  for (const [formaId, cartaoId] of [[3, undefined], [1, 10], [2, 20], [4, undefined]]) {
    reset(); titulo = await gerar([pagamento(formaId === 4 ? 3 : formaId)]); fila = colocarNaFila(titulo);
    const payload = { idempotency_key: 'encargos', itens: [itemFila(fila, { forma_pagamento_id: formaId, cartao_id: cartaoId,
      ...(formaId === 4 ? { cheque_numero: '321', cheque_emitente: 'QA' } : {}),
      valor_pago: 213, juros: 10, multa: 3 })] };
    await registrarBaixasFila(req, payload);
    assert.equal(fila.status, 'BAIXADO'); assert.equal(titulo.valor_saldo, 0); assert.equal(titulo.valor_baixado, 200);
    assert.equal(fila.juros, 10); assert.equal(fila.multa, 3);
    assert.equal(state.movimentos[0].valor, 200); assert.equal(state.movimentos[0].juros, 10);
    assert.equal(state.movimentos[0].multa, 3); assert.equal(state.movimentos[0].valor_quitacao, 213);
    await registrarBaixasFila(req, payload); assert.equal(state.movimentos.length, 1);
  }
  reset(); titulo = await gerar([pagamento(3)]); fila = colocarNaFila(titulo);
  state.cheques.push(registro({ id: 77, status: 'EM_CARTEIRA', valor: 213, empresa_id: 1 }));
  await registrarBaixasFila(req, { itens: [itemFila(fila, { forma_pagamento_id: 4,
    usar_cheque_terceiro: true, cheque_terceiro_id: 77, juros: 10, multa: 3, valor_pago: 213 })] });
  assert.equal(state.cheques[0].status, 'UTILIZADO'); assert.equal(state.movimentos[0].valor_quitacao, 213);

  reset(); titulo = await gerar([pagamento(3)]); fila = colocarNaFila(titulo);
  await assert.rejects(registrarBaixasFila(req, { itens: [itemFila(fila, { juros: 201 })] }), /maior que a soma/);
  await assert.rejects(registrarBaixasFila(req, { itens: [itemFila(fila, { juros: -1 })] }), /nao negativo/);
  assert.equal(state.movimentos.length, 0);

  reset(); titulo = await gerar([pagamento(3)]); fila = colocarNaFila(titulo);
  await registrarBaixasFila(req, { itens: [itemFila(fila, { juros: 10, multa: 3, valor_pago: 163, motivo: 'Parcial com encargos' })] });
  assert.equal(titulo.valor_saldo, 50); assert.equal(fila.status, 'DIVERGENTE');
  const aprovar = { fila_ids: [fila.id], justificativa: 'Conferido', idempotency_key: 'aprovar-parcial' };
  await aprovarDivergenciasFila(req, aprovar); await aprovarDivergenciasFila(req, aprovar);
  assert.equal(state.movimentos.length, 1, 'Aprovacao parcial nao baixa novamente');

  reset(); titulo = await gerar([pagamento(3)]); fila = colocarNaFila(titulo);
  await registrarBaixasFila(req, { itens: [itemFila(fila, { juros: 10, multa: 3, valor_pago: 263, motivo: 'Valor atualizado em documento' })] });
  assert.equal(fila.status, 'DIVERGENTE'); assert.equal(state.movimentos.length, 0);
  const editar = { tipo: 'PAGAR', status: 'ABERTO', obra_id: 1, parceiro_id: 1, categoria_financeira_id: 1,
    descricao: 'Ajuste QA', valor: 250, impostos: [], juros: 10, multa: 3, data_vencimento: '2026-11-01',
    competencia_data: '2026-10-08', considera_dre: false };
  await atualizarTitulo(req, titulo.id, editar);
  assert.equal(fila.valor_previsto, 250); assert.equal(fila.data_vencimento_prevista, '2026-11-01');
  assert.equal(titulo.juros, 10); assert.equal(titulo.multa, 3);
  assert.equal(fila.valor_informado, 263); assert.equal(fila.motivo, 'Valor atualizado em documento');
  assert.equal(fila.status, 'DIVERGENTE', 'Edicao nao autoriza baixa automaticamente');
  const aprovacao = { fila_ids: [fila.id], justificativa: 'Titulo corrigido e conferido', idempotency_key: 'aprovar-ajuste' };
  await aprovarDivergenciasFila(req, aprovacao); await aprovarDivergenciasFila(req, aprovacao);
  assert.equal(state.movimentos.length, 1); assert.equal(state.movimentos[0].valor, 250);
  assert.equal(state.movimentos[0].valor_quitacao, 263); assert.equal(titulo.valor_saldo, 0);
  await assert.rejects(atualizarTitulo(req, titulo.id, editar), /em aberto ou previsao/);

  reset(); titulo = await gerar([pagamento(3)]); fila = colocarNaFila(titulo);
  await atualizarTitulo(req, titulo.id, editar);
  assert.equal(fila.juros, 10); assert.equal(fila.multa, 3); assert.equal(fila.valor_previsto, 250);
  await registrarBaixasFila(req, { itens: [itemFila(fila, { valor_pago: 263 })] });
  assert.equal(fila.status, 'BAIXADO', 'Cliente sem novos campos usa encargos persistidos');

  console.log('Cartao opcional na solicitacao: aberto sem cartao, quitacao com cartao, parcelas e baixa obrigatoria validados sem banco real.');
  console.log('Fila + baixa reais: juros/multa separados, edicao e aprovacao de divergencia, credito/fatura, debito, PIX, cheques, replay e rollback. Banco simulado.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
