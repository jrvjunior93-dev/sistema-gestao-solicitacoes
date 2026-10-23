'use strict';
// Servicos reais em VM com models transacionais em memoria. Nao carrega
// models/index, .env, credenciais, banco, S3 ou qualquer integracao externa.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), { Op } = require('sequelize');
const copy = x => JSON.parse(JSON.stringify(x));
let state, falha = '', serial = 0, fila = Promise.resolve(), indiceLegado = false;
const nomes = ['Contrato', 'ContratoMedicao', 'ContratoParcela', 'MedicaoParcela', 'Solicitacao', 'SolicitacaoFavorecido',
  'TituloFinanceiro', 'TituloFinanceiroRateio', 'Parceiro', 'FormaPagamentoFinanceira', 'Historico', 'SecurityEventLog', 'LogExclusao', 'Anexo',
  'MovimentoFinanceiro', 'PaymentIntent', 'PagamentoManualFilaItem', 'PagamentoAutorizacaoItem', 'FaturaCartaoTitulo', 'BoletoCaixa',
  'FinanceiroDdaBoleto', 'ChequeTerceiro', 'ConciliacaoBancaria', 'IntegracaoSiengeFila', 'PedidoCompraTitulo', 'RhFechamentoTitulo',
  'SolicitacaoRecargaCartao', 'SolicitacaoAdiantamento', 'ContratoComercialParcela', 'FinanciamentoBancarioParcela', 'TituloRenegociacaoAlocacao'];
const permissoes = ['contratos.medicao.rejeitar', 'contratos.medicao.editar_pagamento', 'financeiro.titulos.editar', 'contratos.aprovacao.aprovar'];
const geo = { id: 9, nome: 'Conferente', setor: 'GEO', obras: [7], permissoes, ver: true, financeiro: true, leitura: true };
const req = (user = geo) => ({ user });
function reset(n = 2) {
  falha = ''; serial = 0; state = Object.fromEntries(nomes.map(k => [k, []]));
  state.Contrato.push({ id: 4, codigo: 'CT-0004', obra_id: 7, ativo: true, fluxo_novo: true, status_contrato: 'ATIVO',
    solicitacao_id: 42, valor_total: 10000, valor_aditivos: 0 });
  state.Solicitacao.push({ id: 42, contrato_id: 4, obra_id: 7, area_responsavel: 'GEO', status_global: 'NEC. DE MEDICAO' });
  state.ContratoMedicao.push({ id: 9, numero: 2, contrato_id: 4, solicitacao_id: 42, valor_total: n * 1000,
    aprovada_em: null, rejeicao: null, favorecido_id: 11, favorecido_chave_pix: 'pix-antigo', favorecido_contato: null, forma_pagamento_id: 3 });
  for (let i = 1; i <= n; i++) {
    state.ContratoParcela.push({ id: i, numero: i, contrato_id: 4, valor: 1000, valor_previsto: 1000,
      data_vencimento: `2026-11-${String(i).padStart(2, '0')}`, status: 'PREVISAO', titulo_financeiro_id: 100 + i });
    state.MedicaoParcela.push({ id: i, medicao_id: 9, contrato_parcela_id: i, solicitacao_id: 42,
      valor_medido: 1000, valor_anterior: 1000, vencimento_anterior: '2026-11-01', devolvido_em: null });
    state.TituloFinanceiro.push({ id: 100 + i, codigo: `TIT-${100 + i}`, tipo: 'PAGAR', status: 'PREVISAO', origem_titulo: 'CONTRATO',
      solicitacao_id: 42, obra_id: 7, empresa_id: 5, parceiro_id: 10, valor_original: 1000, valor_saldo: 1000, valor_baixado: 0,
      valor_bruto: 1000, valor_liquido: 1000, categoria_financeira_id: 1, data_vencimento: '2026-11-01',
      competencia_data: '2026-11-01', descricao: 'Previsao contrato', forma_pagamento_id: 3 });
  }
  state.Parceiro.push({ id: 10, nome: 'Credor', ativo: true, cpf_cnpj: '111' }, { id: 11, nome: 'Anterior', ativo: true, cpf_cnpj: '222' }, { id: 12, nome: 'Novo favorecido', ativo: true, cpf_cnpj: '333' });
  state.FormaPagamentoFinanceira.push({ id: 3, nome: 'PIX', tipo: 'PIX', ativo: true });
  state.Anexo.push({ id: 1, medicao_id: 9, deleted_at: null });
}
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(k => {
    const v = where[k];
    if (k === Op.or) return v.some(w => matches(row, w));
    if (k === Op.and) return (Array.isArray(v) ? v : [v]).every(w => matches(row, w));
    if (Array.isArray(v)) return v.includes(row[k]);
    if (v && typeof v === 'object') return Reflect.ownKeys(v).every(op => {
      if (op === Op.in) return v[op].includes(row[k]);
      if (op === Op.notIn) return !v[op].includes(row[k]);
      if (op === Op.ne) return (row[k] ?? null) !== v[op];
      if (op === Op.gt) return row[k] > v[op];
      throw Error('Operador nao simulado: ' + String(op));
    });
    return (row[k] ?? null) === v;
  });
}
function instance(row, model, options = {}) {
  const result = copy(row);
  Object.defineProperties(result, {
    toJSON: { value() { return copy({ ...this }); } },
    setDataValue: { value(k, v) { this[k] = v; } },
    update: { value: async function(p, o) {
      assert(o?.transaction, 'Escrita fora de transacao');
      if (model === 'TituloFinanceiro' && !o.transaction.locks.has(row.id)) throw Error('Titulo sem lock');
      if (falha === model) throw Error('FALHA_' + model);
      if (model === 'MedicaoParcela') conferirVinculo({ ...row, ...p }, row.id);
      Object.assign(row, copy(p), { updatedAt: new Date(1800000000000 + ++serial).toISOString() }); Object.assign(this, copy(row)); return this;
    } }
  });
  if (options.lock && model === 'TituloFinanceiro') options.transaction.locks.add(row.id);
  for (const inc of options.include || []) {
    if (inc.as === 'titulo') result.titulo = state.TituloFinanceiro.find(t => t.id === row.titulo_financeiro_id) ? instance(state.TituloFinanceiro.find(t => t.id === row.titulo_financeiro_id), 'TituloFinanceiro', options) : null;
    if (inc.as === 'medicao') result.medicao = copy(state.ContratoMedicao.find(m => m.id === row.medicao_id));
  }
  return result;
}
// Mesmo contrato de unicidade do banco (SQL real em validarMedicaoVinculoSchema).
// O teste anterior nao representava o indice legado e deixava esse bug passar.
function conferirVinculo(data, ignorarId) {
  const evento = r => r.medicao_id == null ? `S${r.solicitacao_id}` : `M${r.medicao_id}`;
  const outros = state.MedicaoParcela.filter(r => r.id !== ignorarId && r.contrato_parcela_id === data.contrato_parcela_id);
  if (indiceLegado && outros.some(r => r.solicitacao_id === data.solicitacao_id)
    || !indiceLegado && outros.some(r => evento(r) === evento(data) || r.devolvido_em == null && data.devolvido_em == null)) {
    throw Object.assign(Error('Validation error'), { name: 'SequelizeUniqueConstraintError' });
  }
}
const models = Object.fromEntries(nomes.map(model => [model, {
  async findAll(o = {}) {
    let rows = state[model].filter(r => matches(r, o.where));
    for (const inc of o.include || []) {
      if (inc.as === 'solicitacao') rows = rows.filter(r => state.Solicitacao.some(s => s.id === r.solicitacao_id && matches(s, inc.where)));
      if (inc.as === 'parcela') rows = rows.filter(r => state.ContratoParcela.some(p => p.id === r.contrato_parcela_id && matches(p, inc.where)));
    }
    for (const [k, dir] of [...(o.order || [])].reverse()) rows.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir === 'DESC' ? -1 : 1));
    if (o.limit) rows = rows.slice(0, o.limit);
    return rows.map(r => instance(r, model, o));
  },
  async findOne(o = {}) { return (await this.findAll(o))[0] || null; },
  async findByPk(id, o = {}) { return this.findOne({ ...o, where: { id: Number(id) } }); },
  async count(o = {}) { return (await this.findAll(o)).length; },
  async bulkCreate(rows, o) { return Promise.all(rows.map(r => this.create(r, o))); },
  async max(k, o) { return Math.max(0, ...(await this.findAll(o)).map(r => r[k])); },
  async create(data, o) {
    assert(o?.transaction); if (falha === model) throw Error('FALHA_' + model);
    if (model === 'MedicaoParcela') conferirVinculo(data);
    const row = { id: Math.max(0, ...state[model].map(r => r.id)) + 1, ...copy(data) }; state[model].push(row);
    if (model === 'TituloFinanceiro') o.transaction.locks.add(row.id);
    return instance(row, model, o);
  },
  async update(p, o) { const rows = await this.findAll(o); for (const row of rows) await row.update(p, o); return [rows.length]; }
}]));
models.sequelize = { async transaction(fn) {
  const anterior = fila; let liberar; fila = new Promise(r => { liberar = r; }); await anterior;
  const snapshot = copy(state);
  try { return await fn({ LOCK: { UPDATE: 'UPDATE' }, locks: new Set() }); }
  catch (e) { state = snapshot; throw e; } finally { liberar(); }
} };
const auth = { isSuperadmin: u => u?.super === true, canViewContratos: async u => !!u?.ver || !!u?.super,
  canAccessFinanceiro: async u => !!u?.financeiro || !!u?.super,
  getUserObraScopeIds: async u => u.super ? null : u.obras, getFinanceiroObraScopeIds: async u => u.super ? null : u.obras,
  canAccessContratosGlobal: async u => !!u.global,
  userHasStrictAreaPermission: async (u, keys) => !!u?.super || keys.some(k => u?.permissoes?.includes(k)) };
const setor = { userHasSetorCapability: async (u, c) => c === 'eh_setor_geo' && u.setor === 'GEO',
  findSetorByCapability: async () => ({ codigo: 'OBRA' }), resolveSetorPersistenciaValue: () => 'OBRA' };
const retorno = { async assertPodeVisualizarSolicitacao(r, s) { if (!s || (!r.user.leitura && !r.user.super)) throw Object.assign(Error('Sem leitura'), { statusCode: 403 }); },
  async assertPodeInteragirSolicitacao(r, s) { if (!r.user.super && r.user.setor !== s.area_responsavel) throw Object.assign(Error('Fora do setor'), { statusCode: 409 }); } };
const projetos = { projetarAssociacoes: async () => {}, projetarOrigens: async ts => ts };
const divisao = { projetarDivisoesNasParcelas: async () => new Map(), listarFavorecidos: async (sid, o) => models.SolicitacaoFavorecido.findAll({ where: { medicao_id: o.medicaoId } }) };
const parcelasDomain = require('../src/services/contratoParcelasService');
function load(file, deps = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services', file), 'utf8'), { module: mod, console, Date,
    require(id) { if (id in deps) return deps[id]; if (id === 'sequelize') return { Op }; if (id === 'node:crypto') return crypto;
      throw Error('Dependencia nao isolada ' + file + ': ' + id); } }, { filename: file });
  return mod.exports;
}
const comuns = { '../models': models, './authorizationService': auth, './setorCapabilityService': setor,
  './solicitacaoRetornoService': retorno, './contratoParcelasService': parcelasDomain,
  '../utils/codigoDoSetor': { codigoDoSetor: u => u?.setor || 'GEO', setorParaHistorico: v => v || 'GEO' } };
const contexto = load('medicaoOperacaoContextoService.js', comuns);
const atual = load('medicaoAtualContratoService.js', comuns);
const medicao = load('medicaoContratoService.js', { ...comuns, './medicaoAtualContratoService': atual,
  './formasPagamentoMedicaoService': { formaPagamentoEhBoleto: f => f?.tipo === 'BOLETO', formaPagamentoEhPix: f => f?.tipo === 'PIX', listarFormasDaMedicao: async () => ({ formas: state.FormaPagamentoFinanceira }) },
  './solicitacaoFavorecidosService': divisao, './tituloRenegociacaoVinculos': projetos });
const auditoria = load('tituloCancelamentoAuditoriaService.js', comuns);
const financeiro = { carregarTituloPorId: async (r, id) => {
  const t = await models.TituloFinanceiro.findByPk(id); if (!t || (!r.user.super && !r.user.obras.includes(t.obra_id))) throw Object.assign(Error('Sem acesso'), { statusCode: 403 }); return t;
}, criarTituloManual: async (r, p, o) => {
  assert(o.transaction); assert.equal(o.origemTitulo, 'CONTRATO'); assert(o.pularAcessoFinanceiro); assert(o.permitirFormaPagamentoPendente);
  assert.equal(p.status, 'PREVISAO'); assert(!p.favorecido_pagamento_id && !p.payment_beneficiary_id && !p.pagamento_favorecido);
  if (falha === 'CRIAR') throw Error('FALHA_CRIAR');
  const t = await models.TituloFinanceiro.create({ ...p, origem_titulo: 'CONTRATO', valor_original: p.valor, valor_baixado: 0, valor_saldo: p.valor }, o);
  return { titulos: [t] };
} };
const rejeicao = load('medicaoRejeicaoService.js', { ...comuns, './medicaoOperacaoContextoService': contexto,
  './tituloCancelamentoAuditoriaService': auditoria, './tituloFinanceiroService': financeiro, './medicaoContratoService': medicao });
const resolver = load('tituloNegociacaoPagamentoService.js', { ...comuns, '../utils/pix': require('../src/utils/pix') });
const instrucao = load('instrucaoFinanceiraFavorecidoService.js', comuns);
const favorecido = load('favorecidoEdicaoService.js', { ...comuns, './medicaoOperacaoContextoService': contexto,
  './tituloNegociacaoPagamentoService': resolver, './tituloFinanceiroService': financeiro, './instrucaoFinanceiraFavorecidoService': instrucao,
  './pagamentoFilaDestinatarioService': { anexarDetalheTitulo: async () => {} } });
const rejeitarBody = async (r = req()) => ({ referencia: (await rejeicao.consultar(r, 9)).referencia, motivo: 'Servico nao realizado. Solicitar nova medicao.', idempotency_key: crypto.randomUUID() });
const editarBody = async (tipo, id, r = req()) => ({ referencia: (await favorecido[tipo === 'medicao' ? 'consultarMedicao' : 'consultarTitulo'](r, id)).referencia,
  favorecido_id: 12, chave_pix: 'pix-novo', dados_pagamento: '', confirmado: true, motivo: 'Favorecido corrigido apos conferencia' });
async function semEscrita(fn, status = 409) { const antes = copy(state); await assert.rejects(fn, e => e.statusCode === status); assert.deepEqual(state, antes); }

(async () => {
  // Reproduzir o defeito original usando o servico real e o indice antigo:
  // rejeicao funciona, mas inserir o novo vinculo falha e faz rollback.
  reset(); await rejeicao.rejeitar(req(), 9, await rejeitarBody()); indiceLegado = true;
  const pedirNovamente = () => medicao.registrarMedicaoDoContrato({ contratoId: 4, usuarioId: 9,
    itens: [{ contrato_parcela_id: 1, valor_medido: 1000, vencimento: '2026-11-01' }],
    pagamento: { forma_pagamento_id: 3, favorecido_id: 12, favorecido_chave_pix: 'pix-novo', dados_confirmados: true,
      anexos_pendentes_nomes: ['nova-medicao.pdf'] } });
  const antesIndice = copy(state);
  await assert.rejects(pedirNovamente, { name: 'SequelizeUniqueConstraintError' }); assert.deepEqual(state, antesIndice);
  indiceLegado = false;
  // Regra principal: cancelar ambos, nao duplicar, preservar 100% dos pagos/contrato,
  // liberar comprometimento e medir DE NOVO na previsao nova, sem reprogramacao extra.
  reset(); const body = await rejeitarBody(), total = copy(state.Contrato);
  const respostas = await Promise.all([rejeicao.rejeitar(req(), 9, body), rejeicao.rejeitar(req(), 9, body)]);
  assert.equal(respostas.filter(r => r.idempotente).length, 1); assert.equal(state.TituloFinanceiro.length, 4);
  assert((await rejeicao.rejeitar(req(), 9, { motivo: body.motivo, idempotency_key: body.idempotency_key, referencia: body.referencia })).idempotente);
  await semEscrita(() => rejeicao.rejeitar(req({ ...geo, id: 8 }), 9, body));
  assert(state.TituloFinanceiro.slice(0, 2).every(t => t.status === 'CANCELADO' && t.valor_saldo === 0 && t.valor_original === 1000));
  assert.deepEqual(state.Contrato, total); assert.equal(state.Solicitacao[0].area_responsavel, 'OBRA');
  assert(state.MedicaoParcela.every(v => v.devolvido_em)); assert.equal((await medicao.calcularSaldoDoContrato(4)).saldo, 10000);
  assert.equal(await atual.obterMedicaoAtual(4), null); assert.equal(state.Historico.filter(h => h.acao === 'MEDICAO_REJEITADA').length, 1);
  assert.equal(state.LogExclusao.length, 2); assert.equal(state.Anexo.length, 1);
  const vinculosAntigos = copy(state.MedicaoParcela), rejeicaoAntiga = copy(state.ContratoMedicao[0]);
  const novaMedicao = await medicao.registrarMedicaoDoContrato({ contratoId: 4, usuarioId: 9,
    itens: [{ contrato_parcela_id: 1, valor_medido: 1000, vencimento: '2026-11-01' }],
    pagamento: { forma_pagamento_id: 3, favorecido_id: 12, favorecido_chave_pix: 'pix-novo', dados_confirmados: true,
      anexos_pendentes_nomes: ['nova-medicao.pdf'] } });
  assert.equal(novaMedicao.medicao.numero, 3, 'Nao reutilizar o numero da medicao rejeitada');
  assert.equal(state.ContratoMedicao[0].rejeicao.motivo, body.motivo);
  assert.equal(state.MedicaoParcela.filter(v => !v.devolvido_em).length, 1);
  assert.deepEqual(state.MedicaoParcela.slice(0, vinculosAntigos.length), vinculosAntigos);
  assert.deepEqual(state.ContratoMedicao[0], rejeicaoAntiga);
  await semEscrita(pedirNovamente);
  // Duas requisicoes competindo depois da rejeicao: exatamente uma medicao.
  reset(); await rejeicao.rejeitar(req(), 9, await rejeitarBody());
  const simultaneas = await Promise.allSettled([pedirNovamente(), pedirNovamente()]);
  assert.equal(simultaneas.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(simultaneas.find(r => r.status === 'rejected').reason.statusCode, 409);
  assert.equal(state.MedicaoParcela.filter(v => !v.devolvido_em && v.contrato_parcela_id === 1).length, 1);
  assert.equal(state.ContratoMedicao.length, 2); assert.equal(state.MovimentoFinanceiro.length, 0);
  // Limite de 24: a rejeicao nao acrescenta parcelas nem impede medir novamente.
  reset(24); await rejeicao.rejeitar(req(), 9, await rejeitarBody()); assert.equal(state.ContratoParcela.length, 24);
  for (const f of ['CRIAR', 'LogExclusao', 'SecurityEventLog', 'Historico', 'MedicaoParcela', 'ContratoParcela']) {
    reset(); const b = await rejeitarBody(), antes = copy(state); falha = f;
    await assert.rejects(rejeicao.rejeitar(req(), 9, b)); assert.deepEqual(state, antes, f + ' deve fazer rollback de tudo');
  }
  for (const patch of [{ aprovada_em: '2026-10-01' }, { rejeicao: { usuario_id: 8 } }]) {
    reset(); const b = await rejeitarBody(); Object.assign(state.ContratoMedicao[0], patch); await semEscrita(() => rejeicao.rejeitar(req(), 9, b));
  }
  for (const patch of [{ valor_baixado: 1 }, { status: 'QUITADO' }, { cartao_id: 2 }, { fatura_cartao_id: 2 }, { renegociacao_id: 2 },
    { compartilhamento_id: 2 }, { bloqueio_pagamento_proprietario: {} }, { linha_digitavel: '123' }, { valor_impostos: 2 }]) {
    reset(); Object.assign(state.TituloFinanceiro[1], patch); const b = await rejeitarBody(); await semEscrita(() => rejeicao.rejeitar(req(), 9, b));
  }
  for (const model of ['MovimentoFinanceiro', 'PaymentIntent', 'PagamentoManualFilaItem', 'PagamentoAutorizacaoItem', 'FaturaCartaoTitulo',
    'BoletoCaixa', 'FinanceiroDdaBoleto', 'ChequeTerceiro', 'ConciliacaoBancaria', 'IntegracaoSiengeFila', 'PedidoCompraTitulo']) {
    reset(); state[model].push({ id: 1, titulo_financeiro_id: 102, status: model === 'MovimentoFinanceiro' ? 'ATIVO' : 'PENDENTE' });
    const b = await rejeitarBody(); await semEscrita(() => rejeicao.rejeitar(req(), 9, b));
  }
  for (const user of [{ ...geo, permissoes: [] }, { ...geo, setor: 'FINANCEIRO' }, { ...geo, obras: [8] }, { ...geo, leitura: false }, { ...geo, ver: false }]) {
    reset(); const b = await rejeitarBody(); await semEscrita(() => rejeicao.rejeitar(req(user), 9, b), 403);
  }
  reset(); let b = await rejeitarBody(); state.Solicitacao[0].area_responsavel = 'FINANCEIRO'; await semEscrita(() => rejeicao.rejeitar(req(), 9, b));
  reset(); b = await rejeitarBody(); state.TituloFinanceiro[1].descricao = 'Alterado'; await semEscrita(() => rejeicao.rejeitar(req(), 9, b));
  reset(); b = await rejeitarBody(); await semEscrita(() => rejeicao.rejeitar(req(), 9, { ...b, valor: 1 }), 400);
  reset(); state.TituloFinanceiroRateio.push({ id: 1, titulo_financeiro_id: 101, obra_id: 8 });
  await semEscrita(() => rejeicao.consultar(req(), 9));
  reset(); b = await rejeitarBody(); state.ContratoMedicao.push({ ...copy(state.ContratoMedicao[0]), id: 10, numero: 3 });
  await rejeicao.rejeitar(req(), 9, b); assert.equal(state.Solicitacao[0].area_responsavel, 'GEO', 'Nao retirar outra pendencia do GEO');
  // Favorecido da medicao, inclusive abrindo pelo titulo PREVISAO.
  reset(); const antesTitulos = copy(state.TituloFinanceiro); const edit = await editarBody('titulo', 101);
  assert.equal((await favorecido.consultarTitulo(req(), 101)).origem, 'MEDICAO');
  await favorecido.alterarTitulo(req(), 101, edit); assert.equal(state.ContratoMedicao[0].favorecido_id, 12);
  assert.equal(state.ContratoMedicao[0].favorecido_chave_pix, 'pix-novo'); assert.deepEqual(state.TituloFinanceiro, antesTitulos);
  const n = state.LogExclusao.length; await favorecido.alterarTitulo(req(), 101, edit); assert.equal(state.LogExclusao.length, n);
  assert.equal(JSON.parse(state.LogExclusao[0].payload_json).antes.favorecido_id, 11);
  reset(); const e = await editarBody('medicao', 9); await semEscrita(() => favorecido.alterarMedicao(req(), 9, { ...e, confirmado: false }), 400);
  await semEscrita(() => favorecido.alterarMedicao(req(), 9, { ...e, chave_pix: '' }), 400);
  state.Parceiro[2].ativo = false; await semEscrita(() => favorecido.alterarMedicao(req(), 9, e), 400);
  reset(); const es = await editarBody('medicao', 9); state.ContratoMedicao[0].favorecido_chave_pix = 'mudou'; await semEscrita(() => favorecido.alterarMedicao(req(), 9, es));
  reset(); state.SolicitacaoFavorecido.push({ id: 31, ordem: 1, medicao_id: 9, contrato_parcela_id: 1, solicitacao_id: 42,
    favorecido_id: 11, nome_favorecido: 'Anterior', forma_pagamento_id: 3, favorecido_chave_pix: 'pix-antigo', valor: 600 },
    { id: 32, ordem: 2, medicao_id: 9, contrato_parcela_id: 1, solicitacao_id: 42, favorecido_id: 11, forma_pagamento_id: 3, valor: 400 });
  const ep = await editarBody('medicao', 9); await favorecido.alterarMedicao(req(), 9, { ...ep, unidade_id: 32 });
  assert.equal(state.SolicitacaoFavorecido[1].favorecido_id, 12); assert.equal(state.ContratoMedicao[0].favorecido_id, 11);
  // Titulo vigente: override somente desse titulo; sem tocar medicao aprovada,
  // credor, valores, outro titulo ou cadastro bancario global.
  reset(); state.ContratoMedicao[0].aprovada_em = '2026-10-01'; state.TituloFinanceiro[0].status = 'ABERTO';
  const medAntes = copy(state.ContratoMedicao), outro = copy(state.TituloFinanceiro[1]);
  const et = await editarBody('titulo', 101); await favorecido.alterarTitulo(req(), 101, et);
  assert.equal(state.TituloFinanceiro[0].parceiro_id, 10); assert.equal(state.TituloFinanceiro[0].favorecido_pagamento_id, 12);
  assert.equal(state.TituloFinanceiro[0].valor_saldo, 1000); assert.equal(state.TituloFinanceiro[0].pagamento_favorecido.favorecido_chave_pix, 'pix-novo');
  assert.deepEqual(state.ContratoMedicao, medAntes); assert.deepEqual(state.TituloFinanceiro[1], outro);
  assert.equal(state.Historico.length, 0, 'Nao ampliar visibilidade pela correcao exclusivamente financeira');
  const auditFavorecido = load('favorecidoEdicaoAuditoriaService.js', comuns);
  state.SecurityEventLog = [];
  assert.equal((await auditFavorecido.listarEventos(101))[0].metadata.depois.nome_favorecido, 'Novo favorecido', 'Trilha nao depende de logs com retencao');
  for (const f of ['LogExclusao', 'SecurityEventLog']) {
    reset(); state.MedicaoParcela = []; state.TituloFinanceiro[0].origem_titulo = 'MANUAL'; const r = await editarBody('titulo', 101), antes = copy(state); falha = f;
    await assert.rejects(favorecido.alterarTitulo(req(), 101, r)); assert.deepEqual(state, antes);
  }
  reset(); state.TituloFinanceiro[0].status = 'QUITADO'; state.TituloFinanceiro[0].valor_baixado = 1000;
  const pagou = copy(state); await assert.rejects(favorecido.alterarMedicao(req(), 9, await editarBody('medicao', 9)), e => e.statusCode === 409); assert.deepEqual(state, pagou);
  const eligibility = load('paymentEligibilityService.js', { ...comuns, './tituloBloqueioRetornoObraService': { assertTituloDisponivelParaBaixa() {} } });
  const tit = { id: 1, tipo: 'PAGAR', status: 'ABERTO', valor_saldo: 1000,
    pagamento_favorecido: { favorecido_id: 12, cpf_cnpj: '333', favorecido_chave_pix: 'pix-novo' } };
  const bank = { id: 7, ativo: true, nome: 'Novo favorecido', cpf_cnpj: '333', pix_tipo_chave: 'EMAIL', pix_chave: 'pix-novo' };
  await assert.rejects(eligibility.validateTituloEligibleForPayment(tit, { beneficiary: bank }), e => e.statusCode === 409);
  await assert.rejects(eligibility.validateTituloEligibleForPayment({ ...tit, payment_beneficiary_id: 7 }, { beneficiary: { ...bank, pix_chave: 'pix-antigo' } }), e => e.statusCode === 409);
  await eligibility.validateTituloEligibleForPayment({ ...tit, payment_beneficiary_id: 7 }, { beneficiary: bank });
  // Edicao e rejeicao disputando o mesmo retrato: uma vence, a outra nao
  // pode cancelar dados alterados sem uma nova conferencia.
  reset(); const eb = await editarBody('medicao', 9), rb = await rejeitarBody();
  const disputa = await Promise.allSettled([favorecido.alterarMedicao(req(), 9, eb), rejeicao.rejeitar(req(), 9, rb)]);
  assert.equal(disputa.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(disputa.find(r => r.status === 'rejected').reason.statusCode, 409);
  reset(); await rejeicao.rejeitar(req(), 9, await rejeitarBody());
  await semEscrita(() => medicao.aprovarMedicaoDoContrato(9, { usuario: geo, req: req() }));
  reset(); state.MedicaoParcela = []; Object.assign(state.TituloFinanceiro[0], { origem_titulo: 'MANUAL', favorecido_pagamento_id: 12,
    solicitacao: { favorecido_id: 11, favorecido_chave_pix: 'pix-de-outro', dados_pagamento: 'conta-de-outro' } });
  const naoMisturar = await favorecido.consultarTitulo(req(), 101);
  assert.equal(naoMisturar.unidades[0].favorecido.id, 12); assert.equal(naoMisturar.unidades[0].chave_pix, '');
  assert.equal(naoMisturar.unidades[0].dados_pagamento, '');
  // Migration apenas aditiva/idempotente; down nunca apaga trilhas.
  const migration = require('../migrations/202610230001_medicao_rejeicao_favorecido_titulo');
  let adds = 0; const cols = new Set();
  const mig = loadMigration();
  async function up() { await mig.up({ sequelize: {}, DataTypes: { JSON: 'JSON' }, queryInterface: { addColumn: async (t, c, d) => { assert.equal(d.allowNull, true); cols.add(t + c); adds++; } } }); }
  function loadMigration() {
    const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../migrations/202610230001_medicao_rejeicao_favorecido_titulo.js'), 'utf8'), {
      module: m, require: () => ({ resolveTableName: async (s, ns) => ns[0], columnExists: async (s, t, c) => cols.has(t + c) }) }); return m.exports;
  }
  await up(); await up(); assert.equal(adds, 2); await assert.rejects(migration.down());
  console.log('OK: rejeicao atomica/multiparcelas/24limite/rollback/replay/ACL/pendencias/nova medicao; favorecidos medicao/titulo/divisao/PIX/historico e migration idempotente. Sem banco real/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
