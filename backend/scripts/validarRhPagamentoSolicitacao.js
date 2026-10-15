'use strict';
// Servico real, modelos transacionais em memoria. Sem .env, banco, rede ou pagamentos reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const domain = require('../src/services/rhPagamentoSolicitacaoDomain');
const { ValidationError } = require('../src/middlewares/validation');
const cadastro = { id: 11, nome: 'Ana QA', cpf: '52998224725', obra_id: 7, status: 'ATIVO', empresa_grupo_id: 3,
  forma_calculo_gerencial: 'MENSAL', salario_base: 3000, pix_chave: 'ana@example.test' };
const dados = { dias: 30, faltas: 0, acrescimos: 0, descontos: 100, parcela_40: true, parcela_60: false };
assert.equal(domain.calcularLinha(dados, cadastro).liquido, 1100);
assert.equal(domain.calcularLinha({ ...dados, parcela_60: true }, cadastro).bruto, 3000);
assert.equal(domain.calcularLinha({ ...dados, parcela_40: false }, cadastro).bruto, 3000);
assert.equal(domain.calcularLinha({ ...dados, parcela_40: false, parcela_60: true }, cadastro).liquido, 1700);
const metade = { ...dados, parcela_40: false, parcela_50: true, acrescimos: 25.25, descontos: 100 };
assert.equal(domain.calcularLinha(metade, cadastro).percentual, 50);
assert.equal(domain.calcularLinha(metade, cadastro).bruto, 1500);
assert.equal(domain.calcularLinha(metade, cadastro).liquido, 1425.25, 'Ajustes integrais, como 40/60, nao divididos por dois');
assert.equal(domain.calcularLinha({ ...metade, descontos: 0, acrescimos: 0 }, { ...cadastro, salario_base: 3000.01 }).bruto, 1500.01);
assert.equal(domain.calcularLinha({ ...metade, dias: 5 }, { ...cadastro, forma_calculo_gerencial: 'DIARIA', valor_diaria: 100 }).bruto, 500);
for (const patch of [{ parcela_40: true }, { parcela_60: true }, { parcela_50: 'false' }]) {
  assert.throws(() => domain.calcularLinha({ ...metade, ...patch }, cadastro), /50%/);
}
assert.equal(domain.calcularLinha({ ...dados, dias: 5, faltas: 1 }, { ...cadastro, forma_calculo_gerencial: 'DIARIA', valor_diaria: 100 }).liquido, 400);
for (const dias of [0, 1, 15, 30, 31]) {
  for (const faltas of [0, 10, 31]) {
    assert.equal(domain.calcularLinha({ ...dados, dias, faltas }, cadastro).liquido, 1100, 'Dias/faltas nao alteram mensalista 40%');
    assert.equal(domain.calcularLinha({ ...dados, dias, faltas, parcela_40: false, parcela_60: true }, cadastro).liquido, 1700);
    assert.equal(domain.calcularLinha({ ...dados, dias, faltas, parcela_40: false }, cadastro).liquido, 2900);
  }
}
assert.equal(domain.calcularLinha({ ...dados, dias: 2.5, faltas: 10 }, { ...cadastro, forma_calculo_gerencial: 'DIARIA', valor_diaria: 100 }).liquido, 150, 'Fracao legada preservada; faltas informativas');
assert.throws(() => domain.calcularLinha({ ...dados, faltas: 32 }, cadastro), /Faltas/);
assert.throws(() => domain.calcularLinha({ ...dados, dias: 32 }, cadastro), /Dias/);
assert.throws(() => domain.calcularLinha({ ...dados, descontos: 9999 }, cadastro), /Descontos maiores/);
assert.throws(() => domain.validarPeriodo({ competencia: '2026-10', data_vencimento: '2026-02-30' }), /vencimento/);
assert.equal(domain.valorReembolso({ nome: 'Ana', descontos: 100, reembolso: {} }), 100, 'Legado integral');
assert.equal(domain.valorReembolso({ nome: 'Ana', descontos: 100, reembolso: { valor: 60.25 } }), 60.25);
for (const valor of [0, '', null, -1, 100.01, NaN, Infinity, 'R$ 60,00']) {
  assert.throws(() => domain.valorReembolso({ nome: 'Ana', descontos: 100, reembolso: { valor } }), /reembolso|Reembolso/);
}
const contaSalario = { favorecido_nome: 'Ana QA', favorecido_documento: cadastro.cpf, banco: '104', agencia: '1234', conta: '23456', tipo_conta: 'SALARIO' };
assert.equal(domain.recebimento({ modo_recebimento: 'CONTA_SALARIO', conta: 'fraude' }, { ...cadastro, conta_salario: contaSalario }, {}, true).conta, '23456');
const especie = domain.recebimento({ modo_recebimento: 'DINHEIRO', chave_pix: 'nao-usar', banco: '104', agencia: '1', conta: '2', tipo_conta: 'SALARIO' }, cadastro, {}, true);
assert.equal(especie.modo_recebimento, 'DINHEIRO');
for (const campo of ['chave_pix', 'banco', 'agencia', 'conta', 'tipo_conta']) assert.equal(especie[campo], '');
assert.equal(especie.favorecido_documento, cadastro.cpf);
assert.throws(() => domain.recebimento({ modo_recebimento: 'DINHEIRO' }, { nome: 'Sem CPF' }, {}, true), /recebimento/);
let store = { requests: [], titles: [{ id: 1, codigo: 'TIT-ANTERIOR', status: 'BAIXADO', valor_original: 8760,
  numero_documento: 'RHDP-2026-10-COL-11-INTEGRAL' }], historicos: [], filas: [] };
let bloquearFila = false, scope = [7], ativo = true, podeFila = true;
let dinheiroAtivo = true;
let cadastros = [cadastro];
const beneficiariosCriados = [];
let tail = Promise.resolve();
const instance = data => ({ ...data, get() { const { get, update, ...p } = this; return p; }, async update(p) { Object.assign(this, p); return this; } });
const hydrate = () => { store.requests = store.requests.map(instance); store.titles = store.titles.map(instance); };
hydrate();
const models = {
  sequelize: { async transaction(fn) {
    const before = tail; let release; tail = new Promise(ok => { release = ok; }); await before;
    const snapshot = JSON.stringify(store);
    const callbacks = [];
    try { const result = await fn({ LOCK: { UPDATE: 'UPDATE' }, afterCommit: cb => callbacks.push(cb) });
      for (const cb of callbacks) await cb(); return result;
    } catch (e) { store = JSON.parse(snapshot); hydrate(); throw e; } finally { release(); }
  } },
  Obra: { findByPk: async id => Number(id) === 7 ? { id: 7 } : null },
  RhColaborador: { findAll: async o => ativo ? cadastros.filter(c => Number(c.obra_id) === Number(o.where.obra_id)
    && (!o.where.id || o.where.id[Op.in].includes(Number(c.id))))
    .map(c => instance({ ...c, pagamento: c.pagamento || contaSalario })) : [] },
  RhColaboradorPagamento: {},
  RhSolicitacao: {
    findOne: async o => store.requests.find(r => Object.entries(o.where).every(([k, v]) => r[k] === v)),
    findAll: async o => store.requests.filter(r => Object.entries(o.where).every(([k, v]) => r[k] === v)).reverse(),
    findByPk: async id => store.requests.find(r => r.id === Number(id)),
    create: async p => { const r = instance({ id: store.requests.length + 1, ...p }); store.requests.push(r); return r; }
  },
  RhSolicitacaoHistorico: { create: async p => store.historicos.push(p) },
  CrResponsavelObra: { findAll: async () => [{ user_id: 77 }] },
  User: { findAll: async () => [{ id: 77, nome: 'Responsavel QA' }] },
  FormaPagamentoFinanceira: { findOne: async o => o.where.tipo === 'DINHEIRO' && !dinheiroAtivo ? null
    : ({ id: o.where.tipo === 'PIX' ? 4 : o.where.tipo === 'DINHEIRO' ? 6 : 5 }) },
  TituloFinanceiro: {
    findAll: async () => store.titles,
    create: async p => { const t = instance({ id: store.titles.length + 1, codigo: `TIT-${store.titles.length + 1}`, ...p }); store.titles.push(t); return t; }
  }
};
const deps = {
  'node:crypto': require('node:crypto'),
  sequelize: { Op }, '../models': models, '../middlewares/validation': { ValidationError },
  './rhPagamentoSolicitacaoDomain': domain,
  './rhPagamentoCadastroDomain': require('../src/services/rhPagamentoCadastroDomain'),
  '../utils/codigoDoSetor': { codigoDoSetor: u => u.dp ? 'DP' : 'OBRA' },
  './setorCapabilityService': { userBelongsToDpSetor: async u => u.dp },
  './authorizationService': { isBusinessAdmin: () => false, canEditRhDpApuracao: async u => u.dp,
    canExecuteRhDpFechamento: async u => u.dp, getRhDpObraScopeIds: async () => scope,
    getUserObraIds: async () => [7], userHasAreaPermission: async () => true,
    userHasNominalAreaPermission: async () => podeFila },
  './rhSolicitacaoCodigoService': { garantirCodigoRhSolicitacao: async s => s.update({ codigo: `RH-${s.id}` }) },
  './rhFechamentoService': {
    ensureCategoriaFinanceiraPagar: async () => ({ id: 12 }),
    syncParceiroFavorecido: async p => ({ id: p.favorecidoNome === 'Ana QA' ? 11 : 77 }),
    syncFavorecidoBancarioRh: async p => { assert.ok(p.chavePix || p.conta); const id = 100 + beneficiariosCriados.length; beneficiariosCriados.push({ ...p, id }); return { id }; },
    buildTituloRhPayload: p => ({ origem_titulo: 'RH_DP', tipo: 'PAGAR', status: 'ABERTO',
      categoria_financeira_id: p.categoriaFinanceiraId, empresa_id: p.empresaId, obra_id: p.apuracao.obra_id,
      valor_original: p.valor, valor_saldo: p.valor, observacoes: '', payment_beneficiary_id: p.paymentBeneficiaryId })
  },
  '../modules/custosRecebiveis/services/bloqueioObraService': { assertObrasSemTrava: async () => {} },
  './pagamentoManualFilaService': { enfileirarTitulos: async (req, p, o) => {
    assert.ok(o.transaction, 'Titulos/fila devem ser atomicos');
    if (bloquearFila) throw new ValidationError('Governanca pausada', 423);
    store.filas.push(...p.titulo_ids);
  } }
};
const sandbox = { module: { exports: {} }, console, Date, require: key => {
  if (key in deps) return deps[key]; throw new Error('Dependencia nao simulada: ' + key);
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/rhPagamentoSolicitacaoService.js'), 'utf8'), sandbox);
const service = sandbox.module.exports;
const obra = { user: { id: 2, dp: false } }, dp = { user: { id: 3, dp: true } };
async function filaCanonicaTransacaoExterna() {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/pagamentoManualFilaService.js'), 'utf8');
  const trecho = source.slice(source.indexOf('async function enfileirarTitulos('), source.indexOf('function enfileirarTitulosAutorizados('));
  let transacoes = 0, nominal = true, gate = 'DIRECT';
  const audits = [], callbacks = [], criados = [];
  const tx = { LOCK: { UPDATE: 'UPDATE' }, afterCommit: fn => callbacks.push(fn) };
  const context = { module: { exports: {} }, Op, crypto: require('node:crypto'), Map, Set,
    createHttpError: (code, message) => new ValidationError(message, code),
    userHasNominalAreaPermission: async () => nominal,
    resolvePaymentQueueGate: () => gate, env: { paymentOwnerApprovalMode: 'PILOT' },
    getFinanceiroObraScopeIds: async () => null, roundCurrency: domain.dinheiro,
    ACTIVE_STATUSES: ['PENDENTE'], PAYMENT_INTENT_INACTIVE_STATUSES: ['CANCELADO'],
    sequelize: { transaction: async fn => { transacoes++; return fn(tx); } },
    TituloFinanceiro: { findAll: async () => [{ id: 701, obra_id: 7, tipo: 'PAGAR', status: 'ABERTO', valor_saldo: 1100 }] },
    FormaPagamentoFinanceira: {}, PaymentIntent: { findAll: async () => [] },
    PagamentoManualFilaItem: { findAll: async () => [], create: async p => { const i = { id: 1, ...p }; criados.push(i);return i; } },
    SecurityEventLog: { create: async p => audits.push(p.tipo_evento) },
    getRequestIp: () => '127.0.0.1', assertTituloDisponivelParaBaixa: () => {},
    sincronizarDossiesComFila: async () => {}, atualizarAnaliseAoEnfileirar: async () => {},
    resolverSolicitacoesDosTitulos: async () => new Map(), registrarVinculosContratuaisAoEnfileirar: async () => {},
    registrarEventoSeguranca: async p => audits.push(p.tipoEvento)
  };
  vm.runInNewContext(trecho + '\nmodule.exports = enfileirarTitulos;', context);
  const enfileirar = context.module.exports;
  const resultado = await enfileirar(dp, { titulo_ids: [701], idempotency_key: 'QA-FILA' }, { transaction: tx });
  assert.equal(resultado.criados, 1);assert.equal(transacoes, 0, 'Nao abrir transacao separada');
  assert.equal(criados[0].valor_previsto, 1100);
  assert.equal(audits.includes('MANUAL_PAYMENT_QUEUE_CREATED'), false, 'Auditoria de sucesso somente apos commit externo');
  await callbacks[0]();assert.ok(audits.includes('MANUAL_PAYMENT_QUEUE_CREATED'));
  await enfileirar(dp, { titulo_ids: [701] });assert.equal(transacoes, 1, 'Via existente conserva transacao propria');
  nominal = false;await assert.rejects(enfileirar(dp, { titulo_ids: [701] }, { transaction: tx }), /Permissao/);
  nominal = true;gate = 'AUTHORIZATION_REQUIRED';
  await assert.rejects(enfileirar(dp, { titulo_ids: [701] }, { transaction: tx }), /proprietario/);
}
async function validarPreviaRascunho() {
  const estadoInicial = JSON.stringify(store);
  const visivel = require('../src/services/rhSolicitacaoConsultaDomain').visivelNaConsulta;
  try {
    const params = { obra_id: 7, colaborador_id: 11 };
    for (let i = 0; i < 3; i++) {
      const previa = await service.preparar(obra, params);
      assert.equal(previa.solicitacao.id, null); assert.equal(previa.solicitacao.codigo, null);
      assert.equal(previa.solicitacao.dados_json.linhas.length, 1);
      assert.equal(store.requests.length, 0); assert.equal(store.historicos.length, 0);
    }
    const previa = await service.preparar(obra, params);
    const payload = { ...params, chave_idempotencia: 'rascunho-qa-chave-0001', dados: {
      ...previa.solicitacao.dados_json, linhas: previa.solicitacao.dados_json.linhas.map(l => ({ ...l,
        parcela_50: true, conferido_obra: true, acrescimos: 25 })) } };
    const invalido = { ...payload, dados: { ...payload.dados, data_vencimento: '2026-02-30' } };
    await assert.rejects(service.salvarNovo(obra, invalido), /vencimento/);
    assert.equal(store.requests.length, 0); assert.equal(store.historicos.length, 0, 'Criacao e primeiro save atomicos');
    const [a, b] = await Promise.all([service.salvarNovo(obra, payload), service.salvarNovo(obra, payload)]);
    assert.equal(a.solicitacao.id, b.solicitacao.id); assert.equal(store.requests.length, 1);
    assert.equal(a.solicitacao.dados_json.linhas[0].liquido, 1525);
    assert.equal(a.solicitacao.dados_json.linhas[0].conferido_obra, true);
    assert.equal(a.pode_excluir_rascunho, true);
    const consultaAntes = JSON.stringify(store);
    assert.equal((await service.preparar(obra, params)).solicitacao.id, a.solicitacao.id);
    assert.equal(JSON.stringify(store), consultaAntes, 'Reabrir rascunho nao grava');
    await assert.rejects(service.excluirRascunho(dp, a.solicitacao.id), /autor/);
    await assert.rejects(service.salvarNovo(obra, { ...payload, dados: { ...payload.dados, competencia: '2026-11' } }), /processado/);
    await assert.rejects(service.salvarNovo(obra, { ...payload, chave_idempotencia: 'outra-chave-rascunho-002' }), /Ja existe/);
    const titulosAntes = JSON.stringify(store.titles);
    await Promise.all([service.excluirRascunho(obra, a.solicitacao.id), service.excluirRascunho(obra, a.solicitacao.id)]);
    assert.equal(store.historicos.filter(h => h.acao === 'RASCUNHO_EXCLUIDO').length, 1);
    assert.equal(JSON.stringify(store.titles), titulosAntes);
    assert.equal(visivel(store.requests[0], obra.user.id), false);
    assert.equal(visivel(store.requests[0], dp.user.id), false);
    await assert.rejects(service.mostrar(obra, a.solicitacao.id), /excluido/);
    await assert.rejects(service.salvarNovo(obra, payload), /processado/);
    assert.equal((await service.preparar(obra, params)).solicitacao.id, null);
    const novamente = await service.salvarNovo(obra, { ...payload, chave_idempotencia: 'rascunho-qa-chave-0002' });
    await service.enviar(obra, novamente.solicitacao.id, { revisao: novamente.solicitacao.dados_json.revisao });
    await assert.rejects(service.excluirRascunho(obra, novamente.solicitacao.id), /Somente rascunhos/);
    scope = [];
    await assert.rejects(service.preparar(obra, params), /Acesso negado/);
    await assert.rejects(service.excluirRascunho(obra, novamente.solicitacao.id), /Acesso negado/);
    scope = [7];
    console.log('Previa sem escrita; primeiro save atomico/idempotente; exclusao propria, historico, privacidade e negativas aprovados.');
  } finally { store = JSON.parse(estadoInicial); hydrate(); scope = [7]; }
}
async function validarCadastroAtual() {
  const snapshot = JSON.stringify(store), antes = cadastros;
  try {
    cadastros = [{ ...cadastro }];
    let p = await service.iniciar(obra, { obra_id: 7, colaborador_id: 11 });
    const id = p.solicitacao.id;
    p = await service.salvar(obra, id, { ...p.solicitacao.dados_json, linhas: p.solicitacao.dados_json.linhas.map(l => ({ ...l,
      modo_recebimento: 'CONTA_SALARIO', parcela_50: true, dias: 17, faltas: 2, acrescimos: 20, descontos: 50,
      observacoes: 'Preservar ajustes', conferido_obra: true })) });
    const antigo = p.solicitacao.dados_json;
    cadastros[0] = { ...cadastro, salario_base: 10000, pagamento: { ...contaSalario, conta: 'NOVA-CONTA' } };
    const estadoAntesGet = JSON.stringify(store);
    p = await service.mostrar(obra, id);
    assert.equal(JSON.stringify(store), estadoAntesGet, 'GET nao grava');
    const l = p.solicitacao.dados_json.linhas[0];
    assert.equal(l.salario_base, 10000); assert.equal(l.conta, 'NOVA-CONTA');
    assert.equal(l.conferido_obra, false); assert.equal(l.cadastro_atualizado, true);
    assert.equal(l.dias, 17); assert.equal(l.faltas, 2); assert.equal(l.observacoes, 'Preservar ajustes');
    await assert.rejects(service.salvar(obra, id, antigo), /cadastro.*mudou/);
    await assert.rejects(service.enviar(obra, id, { revisao: antigo.revisao }), /cadastro.*mudou/);
    assert.equal(JSON.stringify(store), estadoAntesGet, 'Negativas sem escrita');
    p = await service.salvar(obra, id, { ...p.solicitacao.dados_json,
      linhas: [{ ...l, salario_base: 999999, conta: 'CONTA-FORJADA', conferido_obra: true }] });
    assert.equal(p.solicitacao.dados_json.linhas[0].liquido, 4970, '50% do cadastro, nao do body');
    assert.equal(p.solicitacao.dados_json.linhas[0].conta, 'NOVA-CONTA');
    await service.enviar(obra, id, { revisao: p.solicitacao.dados_json.revisao });
    cadastros[0] = { ...cadastros[0], salario_base: 12000, pagamento: { ...contaSalario, conta: 'DP-CONTA' } };
    p = await service.mostrar(dp, id);
    assert.equal(p.solicitacao.dados_json.linhas[0].salario_base, 12000, 'DP recebe atualizado');
    assert.equal(p.solicitacao.dados_json.linhas[0].conferido_dp, false);
    p = await service.salvar(dp, id, { ...p.solicitacao.dados_json, linhas: p.solicitacao.dados_json.linhas.map(l => ({ ...l,
      conferido_dp: true, conferir_alteracoes: true })) });
    const revisao = p.solicitacao.dados_json.revisao;
    cadastros[0].salario_base = 13000;
    await assert.rejects(service.enviar(dp, id, { revisao }), /cadastro.*mudou/, 'Mudanca apos conferencia bloqueia fila');
    p = await service.mostrar(dp, id);
    p = await service.salvar(dp, id, { ...p.solicitacao.dados_json, linhas: p.solicitacao.dados_json.linhas.map(l => ({ ...l,
      conferido_dp: true, conferir_alteracoes: true })) });
    p = await service.enviar(dp, id, { revisao: p.solicitacao.dados_json.revisao });
    assert.equal(p.solicitacao.dados_json.linhas[0].liquido, 6470);
    const historico = JSON.stringify(p.solicitacao.dados_json.linhas[0]);
    const titulos = JSON.stringify(store.titles);
    cadastros[0] = { ...cadastros[0], salario_base: 90000, pagamento: { ...contaSalario, conta: 'FUTURA' } };
    p = await service.mostrar(dp, id);
    assert.equal(JSON.stringify(p.solicitacao.dados_json.linhas[0]), historico, 'Enviado conserva snapshot');
    assert.equal(JSON.stringify(store.titles), titulos, 'Titulos intocados');
    console.log('Cadastro: autor/DP atualizados, GET sem escrita, nova conferencia, corpo forjado, envio obsoleto e titulos historicos aprovados.');
  } finally { store = JSON.parse(snapshot); hydrate(); cadastros = antes; }
}
(async () => {
  await validarCadastroAtual();
  await validarPreviaRascunho();
  await filaCanonicaTransacaoExterna();
  const [primeiro, replay] = await Promise.all([service.iniciar(obra, { obra_id: 7 }), service.iniciar(obra, { obra_id: 7 })]);
  assert.equal(primeiro.solicitacao.id, replay.solicitacao.id); assert.equal(store.requests.length, 1);
  const id = primeiro.solicitacao.id;
  let f = { ...primeiro.solicitacao.dados_json, competencia: '2026-10', linhas: primeiro.solicitacao.dados_json.linhas.map(l => ({ ...l, ...dados, dias: 1, faltas: 10, selecionado: true, conferido_obra: true,
    reembolso: { responsavel_id: 77, modo_recebimento: 'PIX', favorecido_nome: 'Responsavel QA', favorecido_documento: cadastro.cpf, chave_pix: 'responsavel@example.test' } })) };
  let saved = await service.salvar(obra, id, f);
  assert.equal(saved.solicitacao.dados_json.linhas[0].conferido_obra, true);
  assert.equal(saved.solicitacao.dados_json.linhas[0].bruto, 1200);
  assert.equal(saved.solicitacao.dados_json.linhas[0].dias, 1);
  assert.equal(saved.solicitacao.dados_json.linhas[0].faltas, 10);
  assert.ok(saved.avisos.length); // Pagamento anterior nao bloqueia.
  await assert.rejects(service.salvar(obra, id, f), /atualizada/);
  await assert.rejects(service.mostrar({ user: { id: 88 } }, id), /outro usuario/);
  await service.enviar(obra, id, { revisao: saved.solicitacao.dados_json.revisao });
  assert.equal(store.titles.length, 1, 'A obra nao cria titulos');
  const conf = await service.mostrar(dp, id);
  f = conf.solicitacao.dados_json;
  await assert.rejects(service.enviar(dp, id, { revisao: f.revisao }), /conferidos/);
  saved = await service.salvar(dp, id, { ...f, linhas: f.linhas.map(l => ({ ...l, conferido_dp: true, conferir_alteracoes: true })) });
  const rev = saved.solicitacao.dados_json.revisao;
  podeFila = false;
  await assert.rejects(service.enviar(dp, id, { revisao: rev }), /Permissoes/); podeFila = true;
  bloquearFila = true;
  await assert.rejects(service.enviar(dp, id, { revisao: rev }), /Governanca/);
  assert.equal(store.titles.length, 1); assert.equal(store.requests[0].situacao, 'ABERTA');
  bloquearFila = false;
  await Promise.all([service.enviar(dp, id, { revisao: rev }), service.enviar(dp, id, { revisao: rev })]);
  assert.equal(store.titles.length, 3); assert.equal(store.filas.length, 2);
  assert.deepEqual(store.titles.slice(1).map(t => t.valor_original), [1100, 100]);
  assert.ok(store.titles.slice(1).every(t => t.categoria_financeira_id === 12 && t.tipo === 'PAGAR'));
  assert.equal(store.titles[0].valor_original, 8760, 'Pagamento anterior preservado');
  assert.equal(store.requests[0].situacao, 'APROVADA');
  assert.notEqual(store.titles[1].numero_documento, store.titles[2].numero_documento);
  cadastros = [cadastro, { ...cadastro, id: 12, nome: 'Bruno QA', salario_base: 2000 }];
  const proximo = await service.iniciar(dp, { obra_id: 7 });
  assert.notEqual(proximo.solicitacao.id, id);
  const reembolso = { responsavel_id: 77, modo_recebimento: 'PIX', favorecido_nome: 'Responsavel QA', favorecido_documento: cadastro.cpf, chave_pix: 'responsavel@example.test' };
  let grupoForm = { ...proximo.solicitacao.dados_json, linhas: proximo.solicitacao.dados_json.linhas.map((l, i) => ({ ...l,
    selecionado: true, descontos: i ? 200 : 100, conferido_dp: true, conferir_alteracoes: true,
    modo_recebimento: i ? 'OUTRA_CONTA' : 'CONTA_SALARIO', banco: '104', agencia: '1234', conta: i ? '99999' : '23456' })) };
  let grupoSalvo = await service.salvar(dp, proximo.solicitacao.id, grupoForm);
  assert.ok(grupoSalvo.solicitacao.dados_json.linhas.every(l => l.desconto_sem_reembolso), 'Desconto comum nao exige confirmacao extra');
  grupoForm = { ...grupoSalvo.solicitacao.dados_json, linhas: grupoSalvo.solicitacao.dados_json.linhas.map((l, i) => ({ ...l,
    conferido_dp: true, conferir_alteracoes: true, reembolso: { ...reembolso, chave_pix: i ? 'outra@example.test' : reembolso.chave_pix } })) };
  grupoSalvo = await service.salvar(dp, proximo.solicitacao.id, grupoForm);
  const antesGrupo = store.titles.length;
  await assert.rejects(service.enviar(dp, proximo.solicitacao.id, { revisao: grupoSalvo.solicitacao.dados_json.revisao }), /dados para pagamento diferentes/);
  assert.equal(store.titles.length, antesGrupo, 'Dados distintos revertem todos os titulos');
  grupoForm = { ...grupoSalvo.solicitacao.dados_json, linhas: grupoSalvo.solicitacao.dados_json.linhas.map(l => ({ ...l,
    conferido_dp: true, conferir_alteracoes: true, reembolso })) };
  grupoSalvo = await service.salvar(dp, proximo.solicitacao.id, grupoForm);
  await Promise.all([service.enviar(dp, proximo.solicitacao.id, { revisao: grupoSalvo.solicitacao.dados_json.revisao }), service.enviar(dp, proximo.solicitacao.id, { revisao: grupoSalvo.solicitacao.dados_json.revisao })]);
  const novos = store.titles.slice(antesGrupo);
  assert.equal(novos.length, 3, 'Dois salarios e apenas um reembolso para o mesmo responsavel');
  assert.deepEqual(novos.map(t => t.valor_original), [2900, 1800, 300]);
  assert.ok(novos[2].observacoes.includes('Ana QA') && novos[2].observacoes.includes('Bruno QA'));
  const finalGrupo = await service.mostrar(dp, proximo.solicitacao.id);
  assert.equal(finalGrupo.solicitacao.dados_json.titulos[2].origens.length, 2);
  assert.ok(novos.every(t => beneficiariosCriados.some(b => b.id === t.payment_beneficiary_id)));
  assert.equal(beneficiariosCriados.find(b => b.id === novos[0].payment_beneficiary_id).conta, '23456');
  assert.equal(beneficiariosCriados.find(b => b.id === novos[1].payment_beneficiary_id).conta, '99999');
  assert.equal(beneficiariosCriados.find(b => b.id === novos[2].payment_beneficiary_id).chavePix, reembolso.chave_pix);
  const empresas = domain.agruparReembolsos(grupoForm.linhas.map((l, i) => ({ ...l, empresa_grupo_id: i + 1 })));
  assert.equal(empresas.length, 2, 'Empresas distintas nunca sao misturadas');
  const parcial = await service.iniciar(obra, { obra_id: 7, colaborador_ids: [11, 12] });
  const parcialSalvo = await service.salvar(obra, parcial.solicitacao.id, { ...parcial.solicitacao.dados_json,
    linhas: parcial.solicitacao.dados_json.linhas.map((l, i) => ({ ...l, conferido_obra: true,
      descontos: i ? 200 : 100, reembolso: { ...reembolso, valor: i ? 125.55 : 60.25 } })) });
  assert.deepEqual(Array.from(parcialSalvo.solicitacao.dados_json.linhas, l => l.liquido), [2900, 1800], 'Desconto integral permanece no salario');
  for (const valor of [0, null, -1, 101, 'invalido']) {
    await assert.rejects(service.salvar(obra, parcial.solicitacao.id, { ...parcialSalvo.solicitacao.dados_json,
      linhas: parcialSalvo.solicitacao.dados_json.linhas.map((l, i) => i ? l : { ...l, reembolso: { ...l.reembolso, valor } }) }), /reembolso|Reembolso/);
  }
  assert.equal((await service.mostrar(obra, parcial.solicitacao.id)).solicitacao.dados_json.revisao, parcialSalvo.solicitacao.dados_json.revisao, 'Valor invalido nao grava revisao');
  await service.enviar(obra, parcial.solicitacao.id, { revisao: parcialSalvo.solicitacao.dados_json.revisao });
  const parcialDp = await service.mostrar(dp, parcial.solicitacao.id);
  assert.equal(parcialDp.solicitacao.dados_json.linhas[0].reembolso.valor, 60.25, 'Valor enviado ao DP');
  const parcialEditado = await service.salvar(dp, parcial.solicitacao.id, { ...parcialDp.solicitacao.dados_json,
    linhas: parcialDp.solicitacao.dados_json.linhas.map((l, i) => ({ ...l, conferido_dp: true,
      reembolso: { ...l.reembolso, valor: i ? 125.55 : 50.25 } })) });
  assert.equal(parcialEditado.solicitacao.dados_json.linhas[0].conferido_dp, false, 'Editar reembolso invalida conferencia da linha alterada');
  assert.equal(parcialEditado.solicitacao.dados_json.linhas[1].conferido_dp, true, 'Linha inalterada pode ser conferida');
  await assert.rejects(service.enviar(dp, parcial.solicitacao.id, { revisao: parcialEditado.solicitacao.dados_json.revisao }), /conferidos/);
  const parcialConferido = await service.salvar(dp, parcial.solicitacao.id, { ...parcialEditado.solicitacao.dados_json,
    linhas: parcialEditado.solicitacao.dados_json.linhas.map(l => ({ ...l, conferido_dp: true, conferir_alteracoes: true })) });
  const antesParcial = store.titles.length;
  store.requests.find(s => s.id === parcial.solicitacao.id).dados_json.linhas[0].reembolso.valor = 101;
  await assert.rejects(service.enviar(dp, parcial.solicitacao.id, { revisao: parcialConferido.solicitacao.dados_json.revisao }), /nao ultrapassar/);
  assert.equal(store.titles.length, antesParcial, 'Envio revalida valor e nao gera titulos parciais');
  store.requests.find(s => s.id === parcial.solicitacao.id).dados_json.linhas[0].reembolso.valor = 50.25;
  await Promise.all([service.enviar(dp, parcial.solicitacao.id, { revisao: parcialConferido.solicitacao.dados_json.revisao }),
    service.enviar(dp, parcial.solicitacao.id, { revisao: parcialConferido.solicitacao.dados_json.revisao })]);
  assert.deepEqual(store.titles.slice(antesParcial).map(t => t.valor_original), [2900, 1800, 175.8], 'Soma somente parcelas reembolsaveis, sem duplicar');
  const parcialFinal = await service.mostrar(dp, parcial.solicitacao.id);
  assert.deepEqual(Array.from(parcialFinal.solicitacao.dados_json.titulos[2].origens, o => o.valor), [50.25, 125.55]);
  assert.ok(store.titles[antesParcial + 2].observacoes.includes('50,25') && store.titles[antesParcial + 2].observacoes.includes('125,55'));
  assert.equal(novos[2].valor_original, 300, 'Titulo anterior integral nunca e recalculado');
  cadastros = [{ ...cadastro, forma_calculo_gerencial: 'DIARIA', valor_diaria: 100 }];
  const diaria = await service.iniciar(dp, { obra_id: 7 });
  const diariaSalva = await service.salvar(dp, diaria.solicitacao.id, { ...diaria.solicitacao.dados_json,
    linhas: diaria.solicitacao.dados_json.linhas.map(l => ({ ...l, selecionado: true, dias: 5, faltas: 10,
      acrescimos: 20, descontos: 50, desconto_sem_reembolso: true, conferido_dp: true, conferir_alteracoes: true })) });
  const antesDiaria = store.titles.length;
  await service.enviar(dp, diaria.solicitacao.id, { revisao: diariaSalva.solicitacao.dados_json.revisao });
  assert.equal(store.titles[antesDiaria].valor_original, 470, 'Titulo de diaria usa dias, nao subtrai faltas');
  assert.equal(store.requests[0].dados_json.linhas[0].liquido, 1100, 'Titulo anterior nao e recalculado');
  cadastros = [cadastro];
  const comum = await service.iniciar(obra, { obra_id: 7 });
  let comumSalvo = await service.salvar(obra, comum.solicitacao.id, { ...comum.solicitacao.dados_json,
    linhas: comum.solicitacao.dados_json.linhas.map(l => ({ ...l, selecionado: true, descontos: 75,
      desconto_sem_reembolso: false, conferido_obra: true })) });
  assert.equal(comumSalvo.solicitacao.dados_json.linhas[0].desconto_sem_reembolso, true);
  // Rascunho legado sem classificacao tambem pode seguir, sem reembolso implicito.
  store.requests.find(s => s.id === comum.solicitacao.id).dados_json.linhas[0].desconto_sem_reembolso = false;
  await service.enviar(obra, comum.solicitacao.id, { revisao: comumSalvo.solicitacao.dados_json.revisao });
  comumSalvo = await service.mostrar(dp, comum.solicitacao.id);
  comumSalvo = await service.salvar(dp, comum.solicitacao.id, { ...comumSalvo.solicitacao.dados_json,
    linhas: comumSalvo.solicitacao.dados_json.linhas.map(l => ({ ...l, conferido_dp: true, conferir_alteracoes: true })) });
  const antesComum = store.titles.length;
  await service.enviar(dp, comum.solicitacao.id, { revisao: comumSalvo.solicitacao.dados_json.revisao });
  assert.equal(store.titles.length, antesComum + 1, 'Desconto comum gera apenas salario, sem reembolso automatico');
  assert.equal(store.titles[antesComum].valor_original, 2925);
  const preparo = await service.iniciar(obra, { obra_id: 7 });
  const reembolsoPreparo = await service.salvar(obra, preparo.solicitacao.id, { ...preparo.solicitacao.dados_json,
    linhas: preparo.solicitacao.dados_json.linhas.map(l => ({ ...l, selecionado: false, descontos: 100, reembolso })) });
  assert.equal(reembolsoPreparo.solicitacao.dados_json.linhas[0].reembolso.responsavel_id, 77, 'Opcao manual conservada antes da selecao');
  assert.equal(reembolsoPreparo.solicitacao.dados_json.linhas[0].desconto_sem_reembolso, false);
  await assert.rejects(service.salvar(obra, preparo.solicitacao.id, { ...reembolsoPreparo.solicitacao.dados_json,
    linhas: reembolsoPreparo.solicitacao.dados_json.linhas.map(l => ({ ...l, reembolso: { ...reembolso, responsavel_id: 999 } })) }), /responsavel vigente/);
  cadastros = [cadastro, { ...cadastro, id: 12, nome: 'Bruno QA' }, { ...cadastro, id: 13, nome: 'Caio QA' }];
  const antesSelecao = store.requests.length;
  for (const colaborador_ids of [[], '11', [11, 11], [0], [-1], [1.5], [999], Array.from({ length: 101 }, (_, i) => i + 1)]) {
    await assert.rejects(service.iniciar(obra, { obra_id: 7, colaborador_ids }), /invalida|ativo/);
  }
  await assert.rejects(service.iniciar(obra, { obra_id: 7, colaborador_id: 11, colaborador_ids: [12] }), /invalida/);
  await assert.rejects(service.iniciar(obra, { obra_id: 51, colaborador_ids: [11] }), /Acesso negado/);
  assert.equal(store.requests.length, antesSelecao, 'Selecao invalida nao cria rascunho');
  const individual = await service.iniciar(obra, { obra_id: 7, colaborador_id: 11 });
  assert.deepEqual(Array.from(individual.solicitacao.dados_json.linhas, l => l.colaborador_id), [11]);
  assert.ok(individual.solicitacao.dados_json.linhas[0].selecionado);
  assert.equal((await service.iniciar(obra, { obra_id: 7, colaborador_ids: [11] })).solicitacao.id, individual.solicitacao.id);
  const [grupo, grupoReplay] = await Promise.all([
    service.iniciar(obra, { obra_id: 7, colaborador_ids: [12, 11] }),
    service.iniciar(obra, { obra_id: 7, colaborador_ids: [11, 12] })
  ]);
  assert.equal(grupo.solicitacao.id, grupoReplay.solicitacao.id, 'Mesmo grupo nao duplica rascunho');
  assert.deepEqual(Array.from(grupo.solicitacao.dados_json.linhas, l => l.colaborador_id), [11, 12]);
  assert.ok(grupo.solicitacao.dados_json.linhas.every(l => l.selecionado));
  assert.notEqual(grupo.solicitacao.id, preparo.solicitacao.id, 'Rascunho geral nao contamina grupo escolhido');
  const diferente = await service.iniciar(obra, { obra_id: 7, colaborador_ids: [11, 13] });
  assert.notEqual(diferente.solicitacao.id, grupo.solicitacao.id);
  assert.equal((await service.iniciar(obra, { obra_id: 7, colaborador_ids: [12, 11] })).solicitacao.id, grupo.solicitacao.id);
  const grupoSalvoEscopo = await service.salvar(obra, grupo.solicitacao.id, { ...grupo.solicitacao.dados_json,
    colaboradores_escopo: [13],
    linhas: grupo.solicitacao.dados_json.linhas.map(l => ({ ...l, conferido_obra: true })) });
  assert.deepEqual(Array.from(grupoSalvoEscopo.solicitacao.dados_json.colaboradores_escopo), [11, 12], 'PUT nao permite trocar grupo');
  await service.enviar(obra, grupo.solicitacao.id, { revisao: grupoSalvoEscopo.solicitacao.dados_json.revisao });
  const noDp = await service.mostrar(dp, grupo.solicitacao.id);
  assert.deepEqual(Array.from(noDp.solicitacao.dados_json.linhas, l => l.colaborador_id), [11, 12], 'DP confere somente o grupo enviado');
  await assert.rejects(service.salvar(dp, grupo.solicitacao.id, { ...noDp.solicitacao.dados_json,
    linhas: [...noDp.solicitacao.dados_json.linhas, { ...noDp.solicitacao.dados_json.linhas[0], colaborador_id: 13 }] }), /Lista/);
  const grupoConferidoEscopo = await service.salvar(dp, grupo.solicitacao.id, { ...noDp.solicitacao.dados_json,
    linhas: noDp.solicitacao.dados_json.linhas.map(l => ({ ...l, conferido_dp: true, conferir_alteracoes: true })) });
  const titulosAntesEscopo = store.titles.length;
  await service.enviar(dp, grupo.solicitacao.id, { revisao: grupoConferidoEscopo.solicitacao.dados_json.revisao });
  assert.equal(store.titles.length, titulosAntesEscopo + 2, 'Fila recebe somente os dois salarios do grupo');
  assert.ok(store.titles.slice(titulosAntesEscopo).every(t => !t.numero_documento.includes('-COL-13-')));
  // Rascunho individual legado com roster inteiro nao deve aparecer nem ser cortado no novo modal.
  store.requests.find(s => s.id === individual.solicitacao.id).dados_json = {
    ...individual.solicitacao.dados_json, colaboradores_escopo: undefined,
    linhas: cadastros.map(c => ({ ...individual.solicitacao.dados_json.linhas[0], colaborador_id: c.id }))
  };
  const legadoAntes = JSON.stringify(store.requests.find(s => s.id === individual.solicitacao.id).dados_json);
  const novoIndividual = await service.iniciar(obra, { obra_id: 7, colaborador_id: 11 });
  assert.notEqual(novoIndividual.solicitacao.id, individual.solicitacao.id);
  assert.equal(novoIndividual.solicitacao.dados_json.linhas.length, 1);
  assert.equal(JSON.stringify(store.requests.find(s => s.id === individual.solicitacao.id).dados_json), legadoAntes);
  // Introduzir a flag desligada nao invalida conferencias antigas de 40/60/100%.
  const sem50 = await service.iniciar(obra, { obra_id: 7, colaborador_id: 13 });
  const sem50Salvo = await service.salvar(obra, sem50.solicitacao.id, { ...sem50.solicitacao.dados_json,
    linhas: sem50.solicitacao.dados_json.linhas.map(l => ({ ...l, conferido_obra: true })) });
  await service.enviar(obra, sem50.solicitacao.id, { revisao: sem50Salvo.solicitacao.dados_json.revisao });
  const sem50Dp = await service.mostrar(dp, sem50.solicitacao.id);
  await service.salvar(dp, sem50.solicitacao.id, { ...sem50Dp.solicitacao.dados_json,
    linhas: sem50Dp.solicitacao.dados_json.linhas.map(l => ({ ...l, conferido_dp: true, conferir_alteracoes: true })) });
  store.requests.find(s => s.id === sem50.solicitacao.id).dados_json.linhas.forEach(l => delete l.parcela_50);
  const legadoConferido = await service.mostrar(dp, sem50.solicitacao.id);
  const legadoResalvo = await service.salvar(dp, sem50.solicitacao.id, legadoConferido.solicitacao.dados_json);
  assert.equal(legadoResalvo.solicitacao.dados_json.linhas[0].conferido_dp, true);
  assert.equal(legadoResalvo.solicitacao.dados_json.linhas[0].percentual, 100);
  // Mesmo dominio de 50% para individual, geral e selecionados, sem alterar titulos anteriores.
  const titulosAntes50 = JSON.stringify(store.titles);
  for (const selecao of [{ colaborador_id: 11 }, {}, { colaborador_ids: [11, 12] }]) {
    const pedido50 = await service.iniciar(obra, { obra_id: 7, ...selecao });
    const salvo50 = await service.salvar(obra, pedido50.solicitacao.id, { ...pedido50.solicitacao.dados_json,
      linhas: pedido50.solicitacao.dados_json.linhas.map(l => ({ ...l, selecionado: true,
        parcela_40: false, parcela_60: false, parcela_50: true, conferido_obra: true,
        acrescimos: 0, descontos: 0, reembolso: null })) });
    for (const l of salvo50.solicitacao.dados_json.linhas) {
      assert.equal(l.percentual, 50); assert.equal(l.parcela_50, true); assert.equal(l.bruto, domain.dinheiro(l.salario_base / 2));
    }
    await service.enviar(obra, pedido50.solicitacao.id, { revisao: salvo50.solicitacao.dados_json.revisao });
    const recebido50 = await service.mostrar(dp, pedido50.solicitacao.id);
    const conferido50 = await service.salvar(dp, pedido50.solicitacao.id, { ...recebido50.solicitacao.dados_json,
      linhas: recebido50.solicitacao.dados_json.linhas.map(l => ({ ...l, conferido_dp: true, conferir_alteracoes: true })) });
    const antesFila50 = store.titles.length;
    await Promise.all([service.enviar(dp, pedido50.solicitacao.id, { revisao: conferido50.solicitacao.dados_json.revisao }),
      service.enviar(dp, pedido50.solicitacao.id, { revisao: conferido50.solicitacao.dados_json.revisao })]);
    assert.equal(store.titles.length - antesFila50, conferido50.solicitacao.dados_json.linhas.length);
    assert.deepEqual(store.titles.slice(antesFila50).map(t => t.valor_original), Array.from(conferido50.solicitacao.dados_json.linhas, l => l.liquido));
    assert.ok(store.titles.slice(antesFila50).every(t => t.descricao.includes('50%')));
  }
  assert.equal(JSON.stringify(store.titles.slice(0, JSON.parse(titulosAntes50).length)), titulosAntes50);
  for (const selecao of [{ colaborador_id: 11 }, {}, { colaborador_ids: [11, 12] }]) {
    const pedido = await service.iniciar(obra, { obra_id: 7, ...selecao });
    const salvo = await service.salvar(obra, pedido.solicitacao.id, { ...pedido.solicitacao.dados_json,
      linhas: pedido.solicitacao.dados_json.linhas.map(l => ({ ...l, modo_recebimento: 'DINHEIRO',
        selecionado: true, conferido_obra: true, descontos: 0, reembolso: null })) });
    await service.enviar(obra, pedido.solicitacao.id, { revisao: salvo.solicitacao.dados_json.revisao });
    const recebido = await service.mostrar(dp, pedido.solicitacao.id);
    const conferido = await service.salvar(dp, pedido.solicitacao.id, { ...recebido.solicitacao.dados_json,
      linhas: recebido.solicitacao.dados_json.linhas.map(l => ({ ...l, conferido_dp: true, conferir_alteracoes: true })) });
    const antes = store.titles.length, beneficiariosAntes = beneficiariosCriados.length;
    dinheiroAtivo = false;
    await assert.rejects(() => service.enviar(dp, pedido.solicitacao.id, { revisao: conferido.solicitacao.dados_json.revisao }), /forma de pagamento ativa/);
    assert.equal(store.titles.length, antes, 'Forma DINHEIRO ausente nao cria titulo ou pagamento');
    dinheiroAtivo = true;
    await Promise.all([service.enviar(dp, pedido.solicitacao.id, { revisao: conferido.solicitacao.dados_json.revisao }),
      service.enviar(dp, pedido.solicitacao.id, { revisao: conferido.solicitacao.dados_json.revisao })]);
    assert.equal(store.titles.length - antes, conferido.solicitacao.dados_json.linhas.length);
    assert.equal(beneficiariosCriados.length, beneficiariosAntes, 'Dinheiro nao cria favorecido bancario falso');
    assert(store.titles.slice(antes).every(t => t.payment_beneficiary_id === null));
    assert(store.titles.slice(antes).every(t => t.forma_pagamento_id === 6));
    const final = await service.mostrar(dp, pedido.solicitacao.id);
    assert(final.solicitacao.dados_json.titulos.every(t => t.modo_recebimento === 'DINHEIRO'));
  }
  console.log('DINHEIRO: individual/todos/selecionados, sem Pix/conta, identificacao preservada, snapshot por titulo e replay concorrente aprovados.');
  const outroRascunho = await service.iniciar(obra, { obra_id: 7 });
  ativo = false;
  await assert.rejects(service.salvar(obra, outroRascunho.solicitacao.id, { ...outroRascunho.solicitacao.dados_json,
    linhas: outroRascunho.solicitacao.dados_json.linhas.map(l => ({ ...l, selecionado: true })) }), /mais ativo/);
  scope = [];
  await assert.rejects(service.mostrar(dp, id), /Acesso negado/);
  console.log('Pagamento por solicitacao: calculos, rascunho, escopo, conferencia, vales agrupados/discriminados, dados bancarios/Pix no titulo/fila, classificacao, aviso sem bloqueio, rollback, idempotencia e governanca OK. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
