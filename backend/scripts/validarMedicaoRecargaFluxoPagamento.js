'use strict';
// Servicos reais, modelos em memoria. Nenhuma conexao, .env ou escrita externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op, fn, col, literal } = require('sequelize');
const root = path.resolve(__dirname, '../src/services');
const { resumoTituloEnvioMedicao } = require('../src/services/tituloMedicaoEnvioDomain');
const tituloResumo = { id: 9, tipo: 'PAGAR', status: 'ABERTO', valor_saldo: '1000.00' };
assert.deepEqual(resumoTituloEnvioMedicao(tituloResumo, [{ id: 7, status: 'PENDENTE', segredo: 'omitido' }]),
  { id: 9, tipo: 'PAGAR', status: 'ABERTO', status_interno_pagar: null, valor_saldo: 1000, valor_original: 0,
    medicao_pagamento_origem_id: null, filaPagamentosManuais: [{ id: 7, status: 'PENDENTE' }] });
assert.equal(resumoTituloEnvioMedicao(null), null);
assert.equal(resumoTituloEnvioMedicao({ ...tituloResumo, renegociado_por_id: 30 }).status, 'RENEGOCIADO');
assert.equal(resumoTituloEnvioMedicao({ ...tituloResumo, valor_saldo: '0.00', status: 'QUITADO' }).valor_saldo, 0);
const fonteParcelasEnvio = fs.readFileSync(path.join(root, 'contratoFluxoNovoService.js'), 'utf8');
assert.match(fonteParcelasEnvio, /titulo_pagamento: resumoTituloEnvioMedicao\(p\.medicao_pagamento_resumo/);
assert.match(fonteParcelasEnvio, /attributes: \['id', 'tipo', 'status', 'status_interno_pagar', 'valor_original', 'valor_baixado', 'valor_saldo', 'renegociado_por_id', 'medicao_pagamento', 'medicao_pagamento_origem_id'\]/);
function load(name, dependencies, extra = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, name), 'utf8'), {
    module, console, ...extra, require(id) {
      if (id in dependencies) return dependencies[id];
      throw new Error(`Dependencia nao isolada: ${id}`);
    }
  }, { filename: name });
  return module.exports;
}
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every((key) => {
    const value = where[key];
    if (key === Op.and) return value.every((item) => matches(row, item));
    if (key === Op.or) return value.some((item) => matches(row, item));
    if (Array.isArray(value)) return value.includes(row[key]);
    if (value && typeof value === 'object') return Reflect.ownKeys(value).every((op) =>
      op === Op.in ? value[op].includes(row[key]) : op === Op.notIn ? !value[op].includes(row[key])
        : op === Op.ne ? row[key] !== value[op] : false);
    // Coluna nullable adicionada a fixtures antigas equivale ao NULL do banco.
    return value === null ? row[key] == null : row[key] === value;
  });
}
let state, grants = true, hasAnexo = true, failHistory = false;
const tx = { LOCK: { UPDATE: 'UPDATE' } };
const names = ['Contrato', 'ContratoMedicao', 'ContratoParcela', 'MedicaoParcela',
  'TituloFinanceiro', 'TituloFinanceiroRateio', 'Solicitacao', 'Historico', 'PagamentoManualFilaItem', 'SolicitacaoFavorecido'];
const models = {};
function reset() {
  state = Object.fromEntries(names.map((name) => [name, []]));
  state.Contrato = [{ id: 1, codigo: 'CTR-QA', fluxo_novo: true, solicitacao_id: 50 }];
  state.ContratoMedicao = [{ id: 1, numero: 1, contrato_id: 1, favorecido_id: 10, forma_pagamento_id: 1, valor_total: 100, aprovada_em: null }];
  state.Solicitacao = [{ id: 50, area_responsavel: 'GEO', status_global: 'NEC. DE MEDICAO' }];
  state.ContratoParcela = [1, 2].map((id) => ({ id, numero: id, contrato_id: 1, titulo_financeiro_id: id, valor: id * 100, status: 'PREVISAO' }));
  state.TituloFinanceiro = [1, 2].map((id) => ({ id, status: 'PREVISAO', valor_original: id * 100, valor_saldo: id * 100, valor_baixado: 0 }));
  state.MedicaoParcela = [{ id: 1, medicao_id: 1, contrato_parcela_id: 1, devolvido_em: null }];
  grants = true; hasAnexo = true; failHistory = false;
}
function instance(name, row, options = {}) {
  if (!row) return null;
  const result = { ...row, async update(values, opts) {
    assert.equal(opts.transaction, tx); Object.assign(row, values); Object.assign(this, values); return this;
  } };
  if (name === 'ContratoParcela' && options.include) result.titulo = instance('TituloFinanceiro', state.TituloFinanceiro.find((item) => item.id === row.titulo_financeiro_id));
  return result;
}
for (const name of names) models[name] = {
  async findAll(options = {}) { return state[name].filter((row) => matches(row, options.where)).map((row) => instance(name, row, options)); },
  async findOne(options = {}) { return (await this.findAll(options))[0] || null; },
  async max(field, options = {}) { return Math.max(0, ...state[name].filter(row => matches(row, options.where)).map(row => Number(row[field]))); },
  async findByPk(id, options = {}) { return instance(name, state[name].find((row) => row.id === Number(id)), options); },
  async count(options = {}) {
    let rows = state[name].filter((row) => matches(row, options.where));
    if (name === 'MedicaoParcela' && options.include) rows = rows.filter((row) => state.ContratoMedicao.some((m) => m.id === row.medicao_id && matches(m, options.include[0].where)));
    return rows.length;
  },
  async update(values, options) { assert.equal(options.transaction, tx); const rows = state[name].filter((row) => matches(row, options.where)); rows.forEach((row) => Object.assign(row, values)); return [rows.length]; },
  async create(values, options) { assert.equal(options.transaction, tx); if (failHistory) throw new Error('Auditoria QA');
    const row = { id: state[name].length + 1, ...values }; state[name].push(row); return instance(name, row); }
};
models.sequelize = { async transaction(action) {
  const before = structuredClone(state); try { return await action(tx); } catch (error) { state = before; throw error; }
} };
models.Anexo = { count: async () => hasAnexo ? 1 : 0 };
models.Parceiro = { findOne: async () => ({ id: 10 }) };
models.FormaPagamentoFinanceira = { findByPk: async () => ({ id: 1, tipo: 'PIX' }) };
const analise = { STATUS_ANALISE_PROPRIETARIO: 'EM ANÁLISE DO PROPRIETÁRIO',
  emAnaliseProprietario: (value) => value === 'EM ANÁLISE DO PROPRIETÁRIO' };
const medicaoAtual = load('medicaoAtualContratoService.js', { sequelize: { Op }, '../models': models });
const favorecidos = load('solicitacaoFavorecidosService.js', { sequelize: { Op }, '../models': models,
  './solicitacaoFavorecidosDomain': require('../src/services/solicitacaoFavorecidosDomain'),
  './formasPagamentoMedicaoService': { formaPagamentoEhBoleto: () => false, formaPagamentoEhPix: () => true },
  './tituloRenegociacaoVinculos': { projetarOrigens: async titulos => titulos }
});
const service = load('medicaoContratoService.js', {
  sequelize: { Op }, '../models': models,
  '../utils/codigoDoSetor': { codigoDoSetor: () => 'GEO', setorParaHistorico: (value) => value },
  './contratoParcelasService': require('../src/services/contratoParcelasService'),
  './formasPagamentoMedicaoService': { formaPagamentoEhBoleto: () => false, formaPagamentoEhPix: () => true },
  './authorizationService': { userHasStrictAreaPermission: async () => grants },
  './setorCapabilityService': { findSetorByCapability: async (cap, options) => {
    assert.equal(cap, 'eh_setor_obra'); assert.equal(options.transaction, tx); return { codigo: 'OBRA' };
  }, resolveSetorPersistenciaValue: (setor) => setor.codigo },
  './tituloRenegociacaoVinculos': { projetarAssociacoes: async () => {} },
  './solicitacaoFavorecidosService': favorecidos,
  './medicaoFavorecidosService': { dividirTitulosDaMedicao: async () => null },
  './analiseProprietarioService': analise,
  './medicaoAtualContratoService': medicaoAtual
});
function prepararDivisao({ gerada = false } = {}) {
  reset();
  Object.assign(state.Contrato[0], { valor_total: 300, valor_aditivos: 0 });
  Object.assign(state.ContratoMedicao[0], { solicitacao_id: 50 });
  Object.assign(state.Solicitacao[0], { contrato_id: 1 });
  state.ContratoParcela.forEach(p => { p.data_vencimento = '2026-10-20'; });
  Object.assign(state.MedicaoParcela[0], { solicitacao_id: 50, valor_medido: 100 });
  state.SolicitacaoFavorecido = [60, 40].map((valor, i) => ({ id: 20 + i, solicitacao_id: 50, medicao_id: 1,
    contrato_parcela_id: 1, favorecido_id: 10 + i, nome_favorecido: `Favorecido ${i + 1}`, valor,
    titulo_financeiro_id: gerada ? i === 0 ? 1 : 3 : null }));
  if (gerada) {
    state.ContratoMedicao[0].aprovada_em = '2026-10-01';
    state.ContratoParcela[0].status = 'APROVADA';
    Object.assign(state.TituloFinanceiro[0], { tipo: 'PAGAR', status: 'ABERTO', valor_original: 60, valor_saldo: 60 });
    state.TituloFinanceiro.push({ id: 3, tipo: 'PAGAR', status: 'ABERTO', valor_original: 40, valor_saldo: 40, valor_baixado: 0 });
  }
}
async function edicaoEReconciliacaoDividida() {
  const usuario = { id: 2 };
  const itens = [{ contrato_parcela_id: 1, valor_medido: 120, vencimento: '2026-11-20' }];
  const valores = [{ id: 20, valor: 70 }, { id: 21, valor: 50 }];
  for (const invalido of [undefined, [{ id: 20, valor: 70 }, { id: 21, valor: 49.99 }],
    [{ id: 20, valor: 70 }, { id: 99, valor: 50 }], [{ id: 20, valor: 70 }, { id: 20, valor: 50 }],
    [{ id: true, valor: 70 }, { id: 21, valor: 50 }], [{ id: 20, valor: null }, { id: 21, valor: 50 }]]) {
    prepararDivisao();
    const before = structuredClone(state);
    await assert.rejects(() => service.atualizarMedicaoDoContrato(1, { itens, favorecidos_valores: invalido, usuario }));
    assert.deepEqual(state, before, 'Erro de soma/ID nao deixa alteracao parcial.');
  }
  prepararDivisao(); grants = false;
  await assert.rejects(() => service.atualizarMedicaoDoContrato(1, { itens, favorecidos_valores: valores, usuario }), e => e.statusCode === 403);
  grants = true; failHistory = true;
  await assert.rejects(() => service.atualizarMedicaoDoContrato(1, { itens, favorecidos_valores: valores, usuario }), /Auditoria QA/);
  assert.deepEqual(state.SolicitacaoFavorecido.map(p => p.valor), [60, 40]);
  assert.equal(state.ContratoParcela[0].valor, 100);
  failHistory = false;
  await service.atualizarMedicaoDoContrato(1, { itens, favorecidos_valores: valores, usuario });
  assert.deepEqual(state.SolicitacaoFavorecido.map(p => p.valor), [70, 50]);
  assert.deepEqual(state.ContratoParcela.map(p => p.valor), [120, 180]);
  assert.deepEqual(state.TituloFinanceiro.map(t => t.valor_original), [120, 180]);
  assert.equal(state.MedicaoParcela[0].valor_medido, 120);
  assert.equal(state.ContratoMedicao[0].valor_total, 120);
  assert.equal(state.Historico.filter(h => h.acao === 'DADOS_PAGAMENTO_ALTERADOS').length, 2);
  const count = state.Historico.length;
  await service.atualizarMedicaoDoContrato(1, { itens, favorecidos_valores: valores, usuario });
  assert.equal(state.Historico.filter(h => h.acao === 'DADOS_PAGAMENTO_ALTERADOS').length, 2, 'Retry nao repete auditoria financeira nem redistribuicao.');
  assert.deepEqual(state.ContratoParcela.map(p => p.valor), [120, 180]);
  assert.ok(state.Historico.length >= count);
  state.ContratoMedicao[0].aprovada_em = '2026-10-01';
  await assert.rejects(() => service.atualizarMedicaoDoContrato(1, { itens, favorecidos_valores: valores, usuario }), e => e.statusCode === 409);

  prepararDivisao({ gerada: true });
  Object.assign(state.TituloFinanceiro[0], { status: 'PARCIAL', valor_baixado: 50, valor_saldo: 10 });
  await service.reconciliarParcelasComOPago(1, { usuarioId: 2 }, tx);
  assert.deepEqual(state.ContratoParcela.map(p => p.valor), [90, 210]);
  assert.equal(state.TituloFinanceiro[0].valor_saldo, 0, 'Somente a parte paga a menor fecha.');
  assert.equal(state.TituloFinanceiro[2].valor_saldo, 40, 'Outra parte continua exigivel.');
  assert.equal(state.TituloFinanceiro[2].valor_original, 40);
  assert.equal(state.MedicaoParcela[0].valor_medido, 90);
  assert.equal((await service.calcularSaldoDoContrato(1, tx)).comprometido, 90);
  await service.reconciliarParcelasComOPago(1, {}, tx);
  assert.deepEqual(state.ContratoParcela.map(p => p.valor), [90, 210], 'Recomputacao idempotente.');
  Object.assign(state.TituloFinanceiro[0], { status: 'ABERTO', valor_baixado: 0, valor_saldo: 60 });
  await service.reconciliarParcelasComOPago(1, {}, tx);
  assert.deepEqual(state.ContratoParcela.map(p => p.valor), [100, 200], 'Estorno restaura somente principal da parte.');

  // Complemento sozinho governa fila/analise e ainda nao pode encerrar toda a medicao.
  state.TituloFinanceiro[2].status_interno_pagar = analise.STATUS_ANALISE_PROPRIETARIO;
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, analise.STATUS_ANALISE_PROPRIETARIO);
  state.PagamentoManualFilaItem.push({ id: 1, titulo_financeiro_id: 3, status: 'PENDENTE' });
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, 'ENVIADO PARA PAGAMENTO');

  prepararDivisao({ gerada: true });
  state.TituloFinanceiro[2].status = 'EXCLUIDO';
  await service.devolverSaldoDeTitulosExcluidos([3], { usuarioId: 2 }, tx);
  assert.deepEqual(state.ContratoParcela.map(p => p.valor), [60, 240]);
  assert.equal(state.TituloFinanceiro[0].valor_original, 60, 'Cancelamento de complemento nao duplica o primeiro.');
  assert.equal(state.TituloFinanceiro[0].valor_saldo, 60);
  assert.equal(state.MedicaoParcela[0].devolvido_em, null, 'Uma parte cancelada nao devolve toda a medicao.');
  await service.devolverSaldoDeTitulosExcluidos([3], {}, tx);
  assert.deepEqual(state.ContratoParcela.map(p => p.valor), [60, 240]);
  state.TituloFinanceiro[0].status = 'EXCLUIDO';
  await service.devolverSaldoDeTitulosExcluidos([1], { usuarioId: 2 }, tx);
  assert.deepEqual(state.ContratoParcela.map(p => p.valor), [0, 300]);
  assert.ok(state.MedicaoParcela[0].devolvido_em);
  assert.equal((await service.calcularSaldoDoContrato(1, tx)).comprometido, 0);
}
async function rescisaoDividida() {
  prepararDivisao({ gerada: true });
  models.TituloFinanceiro.unscoped = () => models.TituloFinanceiro;
  models.ContratoParcela.unscoped = () => models.ContratoParcela;
  state.ContratoParcela[0].medicoes = [{ id: 1, devolvido_em: null }];
  const source = fs.readFileSync(path.join(root, 'contratoFluxoNovoService.js'), 'utf8');
  const start = source.indexOf('async function encerrarContrato(');
  const end = source.indexOf('\nmodule.exports', start);
  const contexto = { module: { exports: {} }, ...models, Date,
    paraCentavos: require('../src/services/contratoParcelasService').paraCentavos,
    STATUS_CONTRATO: { RESCINDIDO: 'RESCINDIDO' }, STATUS_PARCELA: { REJEITADA: 'REJEITADA' },
    contratoFoiRescindido: c => c.status_contrato === 'RESCINDIDO',
    calcularResumoOperacional: async () => ({ saldo_contratual: 200 }), espelharERegistrar: async () => {},
    require: id => {
      if (id === './authorizationService') return { userHasStrictAreaPermission: async () => grants };
      if (id === './solicitacaoFavorecidosService') return favorecidos;
      throw Error(id);
    }
  };
  vm.runInNewContext(`${source.slice(start, end)}\nmodule.exports=encerrarContrato;`, contexto);
  grants = false;
  await assert.rejects(() => contexto.module.exports(1, { usuario: { id: 2 }, motivo: 'QA' }), e => e.statusCode === 403);
  grants = true;
  const dto = await contexto.module.exports(1, { usuario: { id: 2 }, motivo: 'QA' });
  assert.deepEqual(Array.from(dto.titulos_preservados), [1, 3], 'Rescisao registra todas as obrigacoes medidas sem cancelar complementos.');
  assert.deepEqual(Array.from(dto.titulos_excluidos), [2], 'So cancela previsao ainda nao medida.');
  assert.deepEqual(state.TituloFinanceiro.map(t => t.status), ['ABERTO', 'EXCLUIDO', 'ABERTO']);
  assert.deepEqual(state.ContratoParcela.map(p => p.valor), [100, 0]);
  await assert.rejects(() => contexto.module.exports(1, { usuario: { id: 2 }, motivo: 'QA' }), e => e.statusCode === 409);
}
async function medicao() {
  reset(); grants = false;
  await assert.rejects(() => service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } }), (e) => e.statusCode === 403);
  assert.equal(state.Historico.length, 0);
  grants = true; hasAnexo = false;
  await assert.rejects(() => service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } }), /Anexe/);
  assert.equal(state.TituloFinanceiro[0].status, 'PREVISAO');
  hasAnexo = true; failHistory = true;
  await assert.rejects(() => service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } }), /Auditoria QA/);
  assert.equal(state.ContratoMedicao[0].aprovada_em, null);
  assert.equal(state.TituloFinanceiro[0].status, 'PREVISAO');
  failHistory = false;
  const result = await service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } });
  assert.equal(result.enviada_para, 'OBRA');
  assert.equal(state.Solicitacao[0].area_responsavel, 'OBRA');
  assert.equal(state.Solicitacao[0].status_global, 'LIBERADO');
  assert.equal(state.TituloFinanceiro[0].status, 'ABERTO');
  assert.equal(state.TituloFinanceiro[0].parceiro_id, 10);
  assert.equal(state.TituloFinanceiro[1].status, 'PREVISAO', 'Parcela nao medida nao abre.');
  const historyCount = state.Historico.length;
  await assert.rejects(() => service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } }), (e) => e.statusCode === 409);
  assert.equal(state.Historico.length, historyCount);
  state.TituloFinanceiro[0].status_interno_pagar = analise.STATUS_ANALISE_PROPRIETARIO;
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, analise.STATUS_ANALISE_PROPRIETARIO);
  state.PagamentoManualFilaItem.push({ id: 1, titulo_financeiro_id: 1, status: 'PENDENTE' });
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, 'ENVIADO PARA PAGAMENTO');
  state.PagamentoManualFilaItem[0].status = 'RESOLVIDO';
  state.TituloFinanceiro[0].status_interno_pagar = 'AGUARDANDO AJUSTE DE PAGAMENTO';
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, 'AGUARDANDO AJUSTE');
}
async function medicaoMaisRecente() {
  // Orquestrador de registro REAL, isolando somente validacao/calculo de parcelas.
  // Recalculo de status e consultas de medicao sao os servicos reais acima.
  const source = fs.readFileSync(path.join(root, 'medicaoContratoService.js'), 'utf8');
  const inicio = source.indexOf('async function registrarMedicaoDoContrato(');
  const fim = source.indexOf('/**', inicio);
  const module = { exports: {} };
  vm.runInNewContext(`${source.slice(inicio, fim)}\nmodule.exports=registrarMedicaoDoContrato;`, {
    module, ...models, SETOR_GERENCIA_PROCESSOS: 'GEO', erro: mensagem => Error(mensagem),
    validarDadosDePagamento: async () => ({ favorecido_id: 10, forma_pagamento_id: 1 }),
    aplicarMedicaoNasParcelas: async ({ medicaoId }) => {
      state.MedicaoParcela.push({ id: 2, medicao_id: medicaoId, contrato_parcela_id: 2, devolvido_em: null });
      return { total_medido: 200 };
    }, sincronizarStatusDaSolicitacaoDoContrato: service.sincronizarStatusDaSolicitacaoDoContrato
  });
  reset();
  state.ContratoMedicao[0].aprovada_em = '2026-10-01';
  state.ContratoParcela[0].status = 'APROVADA'; state.TituloFinanceiro[0].status = 'ABERTO';
  state.PagamentoManualFilaItem.push({ id: 1, titulo_financeiro_id: 1, status: 'PENDENTE' });
  Object.assign(state.Solicitacao[0], { status_global: 'ENVIADO PARA PAGAMENTO', area_responsavel: 'OBRA' });
  const registrada = await module.exports({ contratoId: 1, usuarioId: 2, itens: [] });
  assert.equal(registrada.medicao.numero, 2);
  assert.equal(state.Solicitacao[0].status_global, 'NEC. DE MEDICAO', 'Registro de M2 aplica o novo ciclo na mesma transacao.');
  assert.equal(state.Solicitacao[0].area_responsavel, 'GEO');
  assert.equal(state.PagamentoManualFilaItem.length, 1, 'Fila de M1 permanece intacta.');
  function segundaMedicao() {
    reset();
    state.ContratoMedicao.push({ ...state.ContratoMedicao[0], id: 2, numero: 2,
      periodo_inicio: '2026-01-01', periodo_fim: '2026-01-31' });
    state.MedicaoParcela.push({ id: 2, medicao_id: 2, contrato_parcela_id: 2, devolvido_em: null });
    state.Solicitacao[0].area_responsavel = 'GEO';
    state.TituloFinanceiro.forEach(t => { t.solicitacao_id = 50; });
  }
  segundaMedicao();
  state.ContratoMedicao[0].aprovada_em = '2026-10-01';
  state.ContratoParcela[0].status = 'APROVADA'; state.TituloFinanceiro[0].status = 'ABERTO';
  state.PagamentoManualFilaItem.push({ id: 1, titulo_financeiro_id: 1, status: 'PENDENTE' });
  state.Solicitacao[0].status_global = 'ENVIADO PARA PAGAMENTO';
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, 'NEC. DE MEDICAO', 'M2 pendente vence a fila de M1.');
  assert.equal(state.Solicitacao[0].area_responsavel, 'GEO');
  await service.aprovarMedicaoDoContrato(2, { usuario: { id: 2 } });
  assert.equal(state.Solicitacao[0].status_global, 'LIBERADO', 'A fila antiga nao substitui a aprovacao de M2.');
  assert.equal(state.Solicitacao[0].area_responsavel, 'OBRA');
  state.TituloFinanceiro[0].status_interno_pagar = 'AGUARDANDO AJUSTE DE PAGAMENTO';
  state.TituloFinanceiro[1].status_interno_pagar = analise.STATUS_ANALISE_PROPRIETARIO;
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, analise.STATUS_ANALISE_PROPRIETARIO);

  const financeiro = load('solicitacaoFinanceiroStatusService.js', {
    './tituloCompartilhadoLeitura': { whereOrigem: w => w },
    './tituloCompartilhadoConsulta': { porSolicitacao: async (req, titulos) => titulos },
    sequelize: { Op }, '../models': models, './medicaoContratoService': service,
    './medicaoAtualContratoService': medicaoAtual,
    './setorCapabilityService': { findSetorByCapability: async () => ({ codigo: 'FINANCEIRO' }),
      resolveSetorPersistenciaValue: s => s.codigo }
  });
  state.Solicitacao[0].area_responsavel = 'GEO';
  Object.assign(state.TituloFinanceiro[0], { status: 'QUITADO', valor_saldo: 0, valor_baixado: 100 });
  state.PagamentoManualFilaItem[0].status = 'BAIXADO';
  await financeiro.sincronizarStatusSolicitacaoPorBaixaTitulos({ solicitacaoId: 50, transaction: tx });
  assert.equal(state.Solicitacao[0].status_global, analise.STATUS_ANALISE_PROPRIETARIO, 'Baixa antiga nao apaga analise de M2.');
  assert.equal(state.Solicitacao[0].area_responsavel, 'GEO');
  state.PagamentoManualFilaItem.push({ id: 2, titulo_financeiro_id: 2, status: 'PENDENTE' });
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, 'ENVIADO PARA PAGAMENTO');
  Object.assign(state.TituloFinanceiro[1], { status: 'QUITADO', valor_saldo: 0, valor_baixado: 200 });
  state.PagamentoManualFilaItem[1].status = 'BAIXADO';
  // Ultima medicao paga nao equivale a contrato quitado se a primeira continuar devendo.
  Object.assign(state.TituloFinanceiro[0], { status: 'ABERTO', valor_saldo: 100, valor_baixado: 0 });
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, 'NEC. DE MEDICAO');
  Object.assign(state.TituloFinanceiro[0], { status: 'QUITADO', valor_saldo: 0, valor_baixado: 100 });
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, 'PAGA', 'Encerramento ainda exige todas as medicoes pagas.');

  segundaMedicao();
  const antiga = await service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } });
  assert.equal(state.TituloFinanceiro[0].status, 'ABERTO', 'Aprovacao antiga continua funcional.');
  assert.equal(state.Solicitacao[0].area_responsavel, 'GEO', 'Aprovacao antiga nao tira M2 de GEO.');
  assert.equal(state.Solicitacao[0].status_global, 'NEC. DE MEDICAO');
  assert.equal(antiga.enviada_para, 'GEO');
}
async function relatorio() {
  const titulos = [
    { id: 1, obra_id: 10, origem_titulo: 'RECARGA_CARTAO', tipo: 'PAGAR', status: 'QUITADO', renegociacao_id: null, valor_original: 100, valor_baixado: 100, valor_saldo: 0, considera_dre: false },
    { id: 2, obra_id: 10, origem_titulo: null, tipo: 'PAGAR', status: 'QUITADO', renegociacao_id: null, compartilhamento_id: null, valor_original: 50, valor_baixado: 50, valor_saldo: 0 }
  ];
  const modelReport = {
    Obra: { findAll: async () => [{ id: 10, ativo: true, nome: 'Obra QA', classificacao: 'PRIVADA' }] },
    Apropriacao: {}, ObraCustoHistorico: { findAll: async () => [] }, ContratoComercial: { findAll: async () => [] },
    TituloFinanceiro: { findAll: async (options) => titulos.filter((row) => matches(row, options.where)).map((row) => ({
      obra_id: row.obra_id, tipo: row.tipo, total_valor_original: row.valor_original,
      total_valor_baixado: row.valor_baixado, total_valor_saldo: row.valor_saldo, quantidade: 1
    })) },
    TituloFinanceiroRateio: { findAll: async (options) => titulos.filter((row) => row.origem_titulo === 'RECARGA_CARTAO' && matches(row, options.include[0].where))
      .map((row) => ({ obra_id: 10, valor_rateio: 100, tituloFinanceiro: row })) }
  };
  const report = load('resultadoObrasService.js', {
    sequelize: { Op, fn, col, literal }, '../models': modelReport,
    '../constants/centroCusto': { TIPO_CENTRO_CUSTO_OBRA: 'OBRA' },
    './obraVgvService': { obterVgvEfetivoPorObras: async () => new Map() },
    './obraGestaoApropriacaoService': {}, './tituloRenegociacaoLeitura': { buscarTitulos: async () => [] }
  }, { process: { env: {} } });
  assert.equal((await report.gerarResultadoObras())[0].pagar.executado, 50, 'Recarga paga nao antecipa custo sem prestacao validada.');
  titulos[0].considera_dre = true;
  assert.equal((await report.gerarResultadoObras())[0].pagar.executado, 150, 'Rateio validado entra uma unica vez, mesmo com origem no titulo.');
}
function filtroFinanceiroObras() {
  // Executa a funcao real de construcao do WHERE sem carregar clientes/banco do relatorio.
  const source = fs.readFileSync(path.join(root, 'relatorioFinanceiroService.js'), 'utf8');
  const inicio = source.indexOf('function buildFinanceiroObrasTituloWhere(');
  const fim = source.indexOf('function getFinanceiroObrasTituloIncludes(', inicio);
  assert(inicio >= 0 && fim > inicio);
  const module = { exports: {} };
  vm.runInNewContext(`${source.slice(inicio, fim)}\nmodule.exports=buildFinanceiroObrasTituloWhere;`, { module, Op });
  const obraWhere = { [Op.and]: [{ [Op.or]: [{ obra_id: 10 }, { obra_id: 11 }] }] };
  const where = module.exports({}, obraWhere, {}, 'REALIZADO');
  const recarga = { obra_id: 10, origem_titulo: 'RECARGA_CARTAO', status: 'QUITADO', possui_rateio: false, considera_dre: false };
  assert.equal(matches(recarga, where), false);
  assert.equal(matches({ ...recarga, possui_rateio: true, considera_dre: true }, where), false, 'Gasto validado entra pelo rateio de destino, sem duplicar na origem.');
  assert.equal(matches({ ...recarga, origem_titulo: null }, where), true, 'Titulos legados preservados.');
  assert.equal(matches({ ...recarga, obra_id: 99, origem_titulo: null }, where), false, 'Escopo de obra continua limitado.');
  const busca = module.exports({ q: 'QA' }, obraWhere, {}, 'REALIZADO');
  assert.equal(busca[Op.and].length, 2, 'Busca textual nao sobrepoe a guarda de classificacao.');
}
async function leituraParcelasEnvio() {
  // Executa o DTO real com models simulados; sem carregar .env/banco.
  const source = fonteParcelasEnvio;
  const inicio = source.indexOf('async function listarParcelasDoContrato(');
  const fim = source.indexOf('async function tramitarNoJuridico(', inicio);
  assert(inicio >= 0 && fim > inicio);
  let tituloAtual = { ...tituloResumo };
  let filas = [];
  let consultasFila = 0;
  let divisoesLeitura = new Map();
  const parcela = { id: 10, numero: 10, valor: 1000, valor_previsto: 1000,
    titulo_financeiro_id: 9, status: 'APROVADA', data_vencimento: '2026-10-20' };
  const vazio = { findAll: async () => [], findOne: async () => null };
  const models = {
    Contrato: { findByPk: async () => ({ id: 1, codigo: 'CT-QA', solicitacao_id: 100,
      fluxo_novo: true, valor_total: 1000, ativo: true, status_contrato: 'ATIVO' }) },
    ContratoParcela: { findAll: async consulta => {
      assert(consulta.include[0].attributes.includes('tipo'));
      assert(consulta.include[0].attributes.includes('renegociado_por_id'));
      return [{ ...parcela, titulo: tituloAtual }];
    } },
    TituloFinanceiro: {}, MedicaoParcela: { findAll: async () => [{ contrato_parcela_id: 10,
      valor_medido: 1000, medicao: { id: 1, numero: 1, aprovada_em: '2026-10-08' } }] },
    ContratoMedicao: {}, Parceiro: vazio, FormaPagamentoFinanceira: vazio,
    User: vazio, ContratoCredor: vazio, ContratoApropriacao: vazio,
    Apropriacao: {}, ContratoAnexo: vazio, Anexo: vazio,
    PagamentoManualFilaItem: { findAll: async consulta => {
      consultasFila++;
      assert.deepEqual(Array.from(consulta.where.titulo_financeiro_id[Op.in]), [9]);
      assert.equal(consulta.raw, true);
      return filas;
    } }
  };
  const dependencies = {
    '../models': models,
    './medicaoContratoService': { calcularSaldoDoContrato: async () => ({ saldo_cent: 0, total_cent: 100000 }),
      statusEfetivo: p => ({ status: p.titulo?.status || p.status, origem: 'TITULO', editavel: false }) },
    './tituloRenegociacaoVinculos': { projetarAssociacoes: async () => {} },
    './solicitacaoFavorecidosService': { projetarDivisoesNasParcelas: async () => divisoesLeitura },
    './tituloMedicaoEnvioDomain': { resumoTituloEnvioMedicao },
    './alertaSaldoContratoService': { classificarSaldo: async () => null }
  };
  const module = { exports: {} };
  vm.runInNewContext(`${source.slice(inicio, fim)}\nmodule.exports=listarParcelasDoContrato;`, {
    module, ...models, Op, STATUS_PARCELA: { APROVADA: 'APROVADA', PREVISAO: 'PREVISAO' },
    STATUS_CONTRATO: { ATIVO: 'ATIVO' }, TIPO_ANEXO_MINUTA: 'MINUTA',
    paraCentavos: v => Math.round(Number(v || 0) * 100), somenteData: v => v,
    formatarISO: v => v, permissoesDoUsuarioNoContrato: async () => ({ aprovar: true }),
    require: id => { if (id in dependencies) return dependencies[id]; throw new Error(id); }
  });
  const read = module.exports;
  let dto = await read(1);
  assert.deepEqual(JSON.parse(JSON.stringify(dto.parcelas[0].titulo_pagamento)), resumoTituloEnvioMedicao(tituloAtual));
  assert.equal(dto.parcelas[0].medicao.id, 1);
  assert.equal(consultasFila, 1, 'Fila consultada em lote, sem consulta por parcela.');
  divisoesLeitura = new Map([[10, { pagamentos: [{ id: 81, medicao_id: 1 }, { id: 82, medicao_id: 1 }, { id: 71, medicao_id: 2 }] }]]);
  dto = await read(1);
  assert.deepEqual(Array.from(dto.contrato.pagamentos_medicao_atual, p => p.id), [81, 82], 'Resumo da medicao corrente nao mistura instrucoes de outros eventos.');
  filas = [{ id: 7, titulo_financeiro_id: 9, status: 'PENDENTE' }];
  dto = await read(1);
  assert.equal(dto.parcelas[0].titulo_pagamento.filaPagamentosManuais[0].status, 'PENDENTE');
  tituloAtual = { ...tituloResumo, status: 'PREVISAO' };
  assert.equal((await read(1)).parcelas[0].titulo_pagamento.status, 'PREVISAO');
  tituloAtual = null;
  assert.equal((await read(1)).parcelas[0].titulo_pagamento, null);
}
(async () => { await leituraParcelasEnvio(); await medicao(); await medicaoMaisRecente(); await edicaoEReconciliacaoDividida(); await rescisaoDividida(); await relatorio(); filtroFinanceiroObras();
  console.log('OK: medicao mais recente governa registro/aprovacao/analise/fila; aprovar ou baixar a anterior preserva status/setor atuais e quitacao integral. Permissoes, anexos, rollback, replay e custo de recarga preservados. Sem banco/rede.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
