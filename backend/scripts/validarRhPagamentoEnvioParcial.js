'use strict';
// Servicos reais, memoria transacional serializada. Nao carrega .env/banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const domain = require('../src/services/rhPagamentoSolicitacaoDomain');
const policy = require('../src/services/tituloBloqueioRetornoObraPolicy');
const { ValidationError } = require('../src/middlewares/validation');
let store = { pedidos: [], titulos: [], filas: [], historicos: [], auditorias: [], movimentos: [], intents: [] };
let scope = [7], permissao = true, falhaFila = false, falhaAuditoria = false;
let serial = Promise.resolve();
const inst = d => ({ ...d, get() { const { get, update, ...p } = this; return p; },
  async update(p) { Object.assign(this, p); return this; } });
const hidratar = () => { for (const k of ['pedidos', 'titulos', 'filas']) store[k] = store[k].map(inst); };
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(k => {
    const value = where[k];
    if (k === Op.or) return value.some(w => matches(row, w));
    if (k === Op.and) return value.every(w => matches(row, w));
    if (value && typeof value === 'object') {
      if (value[Op.in]) return value[Op.in].map(String).includes(String(row[k]));
      if (value[Op.notIn]) return !value[Op.notIn].includes(row[k]);
      if (value[Op.like]) return true;
      if (value[Op.ne] !== undefined) return row[k] !== value[Op.ne];
    }
    return String(row[k]) === String(value);
  });
}
const model = key => ({ findAll: async o => store[key].filter(r => matches(r, o.where)),
  count: async o => store[key].filter(r => matches(r, o.where)).length,
  findByPk: async id => store[key].find(r => Number(r.id) === Number(id)),
  create: async p => { const r = inst({ id: store[key].length + 1, codigo: `QA-${key}-${store[key].length + 1}`, ...p }); store[key].push(r); return r; } });
const cadastros = [11, 12, 13].map(id => ({ id, nome: `Colaborador ${id}`, cpf: '52998224725', obra_id: 7,
  status: 'ATIVO', empresa_grupo_id: 3, forma_calculo_gerencial: 'MENSAL', salario_base: 3000, pix_chave: `pix${id}@example.test` }));
const models = { sequelize: { async transaction(fn) {
  const anterior = serial; let liberar; serial = new Promise(ok => { liberar = ok; }); await anterior;
  const snapshot = JSON.stringify(store);
  try { return await fn({ LOCK: { UPDATE: 'UPDATE' }, afterCommit() {} }); }
  catch (e) { store = JSON.parse(snapshot); hidratar(); throw e; } finally { liberar(); }
} }, RhSolicitacao: model('pedidos'), TituloFinanceiro: model('titulos'), PagamentoManualFilaItem: model('filas'),
  MovimentoFinanceiro: model('movimentos'), PaymentIntent: model('intents'),
  RhSolicitacaoHistorico: { create: async p => store.historicos.push(p) },
  SecurityEventLog: { create: async p => { if (falhaAuditoria) throw Error('Auditoria indisponivel'); store.auditorias.push(p); } },
  Obra: { findByPk: async id => Number(id) === 7 ? { id: 7 } : null },
  RhColaborador: { findAll: async () => cadastros }, RhColaboradorPagamento: {},
  CrResponsavelObra: { findAll: async () => [{ user_id: 77 }] }, User: { findAll: async () => [{ id: 77, nome: 'Responsavel' }] },
  FormaPagamentoFinanceira: { findOne: async o => ({ id: o.where.tipo === 'PIX' ? 4 : 5 }) } };
const auth = { isBusinessAdmin: () => false, canEditRhDpApuracao: async u => u.dp,
  canExecuteRhDpFechamento: async u => u.dp && permissao, getRhDpObraScopeIds: async () => scope,
  userHasAreaPermission: async () => true, getUserObraIds: async () => [7], userHasNominalAreaPermission: async () => permissao };
function load(nome, extras = {}) {
  const deps = { sequelize: { Op }, '../models': models, '../middlewares/validation': { ValidationError },
    './rhPagamentoSolicitacaoDomain': domain, './rhPagamentoRevisaoPolicy': require('../src/services/rhPagamentoRevisaoPolicy'), ...extras };
  const ctx = { module: { exports: {} }, console, Date, require: id => {
    if (id in deps) return deps[id]; throw new Error('Dependencia nao simulada: ' + id);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services', nome), 'utf8'), ctx);
  return ctx.module.exports;
}
const revisaoService = load('rhPagamentoSolicitacaoRevisaoService.js');
const service = load('rhPagamentoSolicitacaoService.js', {
  'node:crypto': require('node:crypto'),
  './authorizationService': auth, './setorCapabilityService': { userBelongsToDpSetor: async u => u.dp },
  '../utils/codigoDoSetor': { codigoDoSetor: u => u.dp ? 'DP' : 'OBRA' },
  './rhSolicitacaoCodigoService': { garantirCodigoRhSolicitacao: async () => {} },
  './rhPagamentoSolicitacaoRevisaoService': revisaoService,
  '../modules/custosRecebiveis/services/bloqueioObraService': { assertObrasSemTrava: async () => {} },
  './rhFechamentoService': {
    ensureCategoriaFinanceiraPagar: async () => ({ id: 12 }), syncParceiroFavorecido: async () => ({ id: 11 }),
    syncFavorecidoBancarioRh: async p => { assert.equal(p.isolado, true); return { id: 66 }; },
    buildTituloRhPayload: p => ({ origem_titulo: 'RH_DP', tipo: 'PAGAR', status: 'ABERTO',
      categoria_financeira_id: p.categoriaFinanceiraId, obra_id: p.apuracao.obra_id, empresa_id: p.empresaId,
      valor_original: p.valor, valor_saldo: p.valor, valor_baixado: 0, data_vencimento: p.dataVencimento,
      observacoes: '', payment_beneficiary_id: p.paymentBeneficiaryId }) },
  './pagamentoManualFilaService': { enfileirarTitulos: async (req, p, options) => {
    assert.ok(options.transaction);
    if (falhaFila) throw new ValidationError('Governanca pausada', 423);
    for (const id of p.titulo_ids) {
      const titulo = store.titulos.find(t => t.id === Number(id)); policy.assertTituloDisponivelParaBaixa(titulo);
      if (!store.filas.some(f => f.titulo_financeiro_id === id && f.status !== 'CANCELADO')) {
        await models.PagamentoManualFilaItem.create({ titulo_financeiro_id: id, status: 'PENDENTE', valor_previsto: titulo.valor_saldo });
      }
    }
  } }
});
const dp = { user: { id: 3, dp: true, nome: 'DP QA' } }, obra = { user: { id: 9, dp: false } };
const reembolso = { responsavel_id: 77, valor: 60, modo_recebimento: 'PIX', favorecido_nome: 'Responsavel',
  favorecido_documento: '52998224725', chave_pix: 'responsavel@example.test' };
const dados = () => service.mostrar(dp, 1);
async function salvar(ids, ajustes = {}) {
  const atual = await dados(); const d = atual.solicitacao.dados_json;
  return service.salvar(dp, 1, { ...d, linhas: d.linhas.map(l => ({ ...l, selecionado: ids.includes(l.colaborador_id),
    conferido_dp: ids.includes(l.colaborador_id), conferir_alteracoes: true,
    ...(['PENDENTE', 'EM_EDICAO'].includes(l.pagamento_estado) ? ajustes[l.colaborador_id] || {} : {}) })) });
}
async function enviar(ids, ajustes = {}) {
  const atual = await salvar(ids, ajustes);
  return service.enviar(dp, 1, { revisao: atual.solicitacao.dados_json.revisao });
}
async function revisar(id, acao) {
  const atual = await dados();
  return service.revisar(dp, 1, { colaborador_id: id, acao, motivo: 'Conferencia QA', revisao: atual.solicitacao.dados_json.revisao });
}
(async () => {
  await service.iniciar(dp, { obra_id: 7 });
  const primeiro = await enviar([11], { 11: { descontos: 100, reembolso } });
  assert.equal(primeiro.solicitacao.situacao, 'ENVIO_PARCIAL');
  assert.equal(store.titulos.length, 2);
  const key = primeiro.solicitacao.dados_json.ultima_revisao_envio;
  await Promise.all([service.enviar(dp, 1, { revisao: key }), service.enviar(dp, 1, { revisao: key })]);
  assert.equal(store.titulos.length, 2, 'Replay nao duplica titulos');
  // Recupera legado sem gravar durante a leitura.
  store.pedidos[0].situacao = 'APROVADA';
  store.pedidos[0].dados_json.linhas.forEach(l => delete l.pagamento_estado);
  assert.equal((await dados()).solicitacao.situacao, 'ENVIO_PARCIAL');
  assert.equal(store.pedidos[0].situacao, 'APROVADA');
  await enviar([12, 13], { 12: { descontos: 100, reembolso }, 13: { descontos: 100, reembolso } });
  assert.equal((await dados()).solicitacao.situacao, 'APROVADA');
  assert.equal(store.titulos.length, 5, 'Restantes geram apenas dois salarios e um vale agrupado');
  const grupos = store.pedidos[0].dados_json.titulos;
  const salario12 = grupos.find(t => t.tipo === 'SALARIO' && t.colaborador_id === 12).id;
  const vale = grupos.find(t => t.tipo === 'REEMBOLSO' && t.origens.length === 2).id;
  const snapshot = JSON.stringify(store);
  scope = [8]; await assert.rejects(revisar(12, 'EDITAR'), /Acesso/); scope = [7];
  await assert.rejects(service.revisar(obra, 1, { colaborador_id: 12, acao: 'EDITAR' }), /Permissoes/);
  permissao = false; await assert.rejects(revisar(12, 'CANCELAR'), /Permissoes/); permissao = true;
  store.movimentos.push({ titulo_financeiro_id: vale, status: 'ATIVO' });
  await assert.rejects(revisar(12, 'EDITAR'), /baixa/); store.movimentos = [];
  store.titulos.find(t => t.id === salario12).valor_baixado = 10;
  await assert.rejects(revisar(12, 'CANCELAR'), /baixas/); store.titulos.find(t => t.id === salario12).valor_baixado = 0;
  store.intents.push({ titulo_financeiro_id: salario12, status: 'EM_LOTE' });
  await assert.rejects(revisar(12, 'EDITAR'), /bancario/); store.intents = [];
  assert.equal(JSON.stringify(store), snapshot, 'Negativas nao alteram pagamentos');
  const emEdicao = await revisar(12, 'EDITAR');
  assert.equal(emEdicao.solicitacao.situacao, 'EM_REVISAO');
  assert.ok(store.auditorias.some(a => a.tipo_evento === 'RH_PAYMENT_EDIT_LOCKED' && a.metadata.anterior.filas[0].status === 'PENDENTE'
    && a.metadata.atual.filas[0].status === 'EM_EDICAO'));
  assert.equal(emEdicao.solicitacao.dados_json.linhas.filter(l => l.pagamento_estado === 'EM_EDICAO').length, 2);
  const revisao = emEdicao.solicitacao.dados_json.revisao;
  await revisar(12, 'EDITAR'); assert.equal((await dados()).solicitacao.dados_json.revisao, revisao);
  for (const t of store.titulos.filter(t => [salario12, vale].includes(t.id))) {
    assert.throws(() => policy.assertTituloDisponivelParaBaixa(t), /bloqueado/);
    assert.equal(store.filas.find(f => f.titulo_financeiro_id === t.id).status, 'EM_EDICAO');
  }
  let salvo = await salvar([12], { 12: { acrescimos: 10, chave_pix: 'nova@example.test' } });
  await assert.rejects(service.enviar(dp, 1, { revisao: salvo.solicitacao.dados_json.revisao }), /todos os colaboradores/);
  salvo = await salvar([12, 13]);
  falhaFila = true;
  await assert.rejects(service.enviar(dp, 1, { revisao: salvo.solicitacao.dados_json.revisao }), /Governanca/);
  falhaFila = false;
  assert.equal(store.titulos.find(t => t.id === salario12).valor_original, 2900, 'Rollback preserva titulo original');
  assert.equal(store.filas.find(f => f.titulo_financeiro_id === salario12).status, 'EM_EDICAO');
  await service.enviar(dp, 1, { revisao: salvo.solicitacao.dados_json.revisao });
  assert.equal(store.titulos.length, 5, 'Reenvio conserva IDs dos titulos');
  assert.equal(store.titulos.find(t => t.id === salario12).valor_original, 2910);
  assert.equal(store.filas.find(f => f.titulo_financeiro_id === salario12).valor_previsto, 2910);
  const antesCancelamento = JSON.stringify(store);
  falhaAuditoria = true; await assert.rejects(revisar(12, 'CANCELAR'), /Auditoria indisponivel/); falhaAuditoria = false;
  assert.equal(JSON.stringify(store), antesCancelamento, 'Falha na auditoria reverte salario, vale, fila e solicitacao');
  await revisar(12, 'CANCELAR');
  assert.equal(store.titulos.find(t => t.id === salario12).status, 'CANCELADO');
  assert.equal(store.filas.find(f => f.titulo_financeiro_id === salario12).status, 'CANCELADO');
  assert.equal(store.titulos.find(t => t.id === vale).valor_saldo, 60, 'Somente vale individual removido');
  assert.equal(store.pedidos[0].dados_json.titulos.find(t => t.id === vale).origens.length, 1);
  await revisar(12, 'CANCELAR');
  await revisar(13, 'EDITAR'); await revisar(13, 'CANCELAR');
  assert.equal(store.titulos.find(t => t.id === vale).status, 'CANCELADO');
  assert.equal(store.titulos.length, 5);
  assert.ok(store.historicos.some(h => h.acao === 'PAGAMENTO_CANCELADO' && h.descricao.includes('Conferencia QA')));
  assert.ok(store.auditorias.some(a => a.tipo_evento === 'RH_PAYMENT_CANCELLED' && a.metadata.atual.status === 'CANCELADO'));
  await revisar(11, 'CANCELAR');
  assert.equal((await dados()).solicitacao.situacao, 'CANCELADA');
  console.log('Envio parcial DP: legado, restantes, escopo, replay/rollback, revisao agrupada, bloqueio de baixa, reenvio mesmos IDs, cancelamento parcial do vale e auditoria OK. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
