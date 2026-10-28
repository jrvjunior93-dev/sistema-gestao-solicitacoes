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
const auth = { isBusinessAdmin: () => false, isRhDpUsuarioObra: async u => Boolean(u.obra), canEditRhDpApuracao: async u => u.dp,
  canExecuteRhDpFechamento: async u => u.dp && permissao, getRhDpObraScopeIds: async () => scope,
  userHasAreaPermission: async () => true, getUserObraIds: async () => [7], userHasNominalAreaPermission: async () => permissao };
function load(nome, extras = {}) {
  const deps = { sequelize: { Op }, '../models': models, '../middlewares/validation': { ValidationError },
    './rhPagamentoSolicitacaoDomain': domain, './rhPagamentoCadastroDomain': require('../src/services/rhPagamentoCadastroDomain'),
    './rhPagamentoRevisaoPolicy': require('../src/services/rhPagamentoRevisaoPolicy'), ...extras };
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
  // Remocao de linha e cancelamento integral: servicos reais, mesma transacao.
  const reset = () => { store = { pedidos: [], titulos: [], filas: [], historicos: [], auditorias: [], movimentos: [], intents: [] }; };
  const compor = async (tipo, colaborador_id, extra = {}) => {
    const d = (await dados()).solicitacao.dados_json;
    return service[tipo](dp, 1, { revisao: d.revisao, motivo: 'Ajuste solicitado QA', colaborador_id, ...extra });
  };
  reset(); await service.iniciar(dp, { obra_id: 7 });
  const original = JSON.stringify(store);
  await assert.rejects(service.removerColaborador(obra, 1, { colaborador_id: 11 }), /DP autorizado/);
  scope = [8]; await assert.rejects(compor('removerColaborador', 11), /Acesso/); scope = [7];
  await assert.rejects(compor('removerColaborador', 11, { motivo: '' }), /motivo/);
  await assert.rejects(compor('removerColaborador', 11, { revisao: -1 }), /atualizada/);
  await assert.rejects(compor('removerColaborador', 999), /pertence/);
  assert.equal(JSON.stringify(store), original);
  store.pedidos[0].criada_por = 44;
  await assert.rejects(compor('removerColaborador', 11), /rascunho pertence/);
  store.pedidos[0].criada_por = 3;
  permissao = false;
  const removida = await compor('removerColaborador', 11);
  permissao = true;
  assert.equal(store.titulos.length, 0, 'Remover pendente nao cria titulo');
  assert.equal(removida.solicitacao.dados_json.linhas.length, 3, 'Snapshot preservado');
  assert(removida.solicitacao.dados_json.linhas[0].removido_em);
  assert.equal(removida.solicitacao.dados_json.linhas[0].pagamento_estado, 'CANCELADO');
  const consulta = require('../src/services/rhSolicitacaoConsultaDomain');
  assert(!consulta.colaboradoresDoPedido({ ...removida.solicitacao, colaborador_id: 11 }).includes(11));
  const posRemocao = JSON.stringify(store);
  await service.removerColaborador(dp, 1, { colaborador_id: 11, motivo: 'Ajuste solicitado QA', revisao: 0 });
  assert.equal(JSON.stringify(store), posRemocao, 'Replay nao duplica historico');
  await salvar([11, 12]);
  assert.equal((await dados()).solicitacao.dados_json.linhas[0].selecionado, false, 'PUT nao ressuscita linha removida');
  await compor('cancelarSolicitacaoPagamento');
  assert.equal((await dados()).solicitacao.situacao, 'CANCELADA');
  const cancelada = JSON.stringify(store);
  await service.cancelarSolicitacaoPagamento(dp, 1, { motivo: 'Ajuste solicitado QA', revisao: 0 });
  assert.equal(JSON.stringify(store), cancelada);
  await assert.rejects(salvar([12]), /alterada/);

  reset(); await service.iniciar(dp, { obra_id: 7 });
  await enviar([11, 12], { 11: { descontos: 100, reembolso }, 12: { descontos: 100, reembolso } });
  const grupo = store.titulos.find(t => t.numero_documento.includes('REEMBOLSO'));
  grupo.valor_baixado = 1;
  await assert.rejects(compor('removerColaborador', 11), /baixas/);
  store.titulos.find(t => t.id === grupo.id).valor_baixado = 0;
  permissao = false; await assert.rejects(compor('cancelarSolicitacaoPagamento'), /Permissoes/); permissao = true;
  const salario = store.titulos.find(t => t.numero_documento.includes('COL-12-'));
  store.movimentos.push({ titulo_financeiro_id: salario.id, status: 'ATIVO' });
  const comPagamento = JSON.stringify(store);
  await assert.rejects(compor('cancelarSolicitacaoPagamento'), /baixa/);
  assert.equal(JSON.stringify(store), comPagamento, 'Cancelamento integral nao pode ser parcial');
  store.movimentos = [];
  store.intents.push({ titulo_financeiro_id: salario.id, status: 'EM_LOTE' });
  await assert.rejects(compor('cancelarSolicitacaoPagamento'), /bancario/); store.intents = [];
  const antesFalha = JSON.stringify(store);
  const refAnteriores = store.pedidos[0].dados_json.titulos;
  store.pedidos[0].dados_json.titulos = [];
  await assert.rejects(compor('cancelarSolicitacaoPagamento'), /Titulo.*nao encontrado/);
  store.pedidos[0].dados_json.titulos = refAnteriores;
  falhaAuditoria = true; await assert.rejects(compor('cancelarSolicitacaoPagamento'), /Auditoria/); falhaAuditoria = false;
  assert.equal(JSON.stringify(store), antesFalha, 'Rollback inclui todo financeiro e composicao');
  await compor('removerColaborador', 11);
  assert.equal(store.titulos.find(t => t.id === grupo.id).valor_saldo, 60, 'Vale preserva parte dos demais');
  assert.equal((await dados()).solicitacao.dados_json.linhas[1].pagamento_estado, 'ENVIADO');
  // Estorno concluido e historico preservado nao impedem cancelar o saldo reaberto.
  store.movimentos.push({ titulo_financeiro_id: salario.id, status: 'ESTORNADO' });
  store.filas.push(inst({ id: 98, titulo_financeiro_id: salario.id, status: 'RESOLVIDO',
    movimento_financeiro_id: 70, instrumento_pagamento_json: { estorno: { reaberto_id: 3 } } }));
  const rev = (await dados()).solicitacao.dados_json.revisao;
  await Promise.all([service.cancelarSolicitacaoPagamento(dp, 1, { revisao: rev, motivo: 'Encerrar QA' }),
    service.cancelarSolicitacaoPagamento(dp, 1, { revisao: rev, motivo: 'Encerrar QA' })]);
  assert.equal((await dados()).solicitacao.situacao, 'CANCELADA');
  assert(store.titulos.every(t => t.status === 'CANCELADO'));
  assert.equal(store.filas.find(f => f.id === 98).status, 'RESOLVIDO', 'Nao apaga fila/baixa estornada');
  assert.equal(store.movimentos.length, 1);
  assert.equal(store.historicos.filter(h => h.acao === 'SOLICITACAO_PAGAMENTO_CANCELADA').length, 1);
  assert(store.auditorias.some(a => a.tipo_evento === 'RH_PAYMENT_EMPLOYEE_REMOVED'));
  assert(store.auditorias.some(a => a.tipo_evento === 'RH_PAYMENT_REQUEST_CANCELLED'));
  console.log('DP: remocao pendente/enviada, vale compartilhado, cancelamento integral atomico, motivo, ACL/privacidade, estorno concluido, replay/concorrencia e rollback aprovados.');
  console.log('Envio parcial DP: legado, restantes, escopo, replay/rollback, revisao agrupada, bloqueio de baixa, reenvio mesmos IDs, cancelamento parcial do vale e auditoria OK. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
