'use strict';
// Servicos reais em memoria, transacoes serializadas e rollback. Sem .env,
// banco real, integracao, rede, passkey ou mudanca de flags.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const lib = require('sequelize'), { Op } = lib;
const domain = require('../src/services/medicaoPagamentoDomain');
const protection = require('../src/services/medicaoPagamentoProtecao');
const clone = v => JSON.parse(JSON.stringify(v));
function load(nome, deps, append = '') {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services', nome), 'utf8') + append, { module, console,
    require(id) { if (id in deps) return deps[id]; throw Error('Dependencia nao isolada: ' + id); } }, { filename: nome });
  return module.exports;
}
let s, permitido, scope, finScope, geo, auditoriaFalha, faturaPaga, consultaTitulos, corrente = Promise.resolve();
function reset() {
  permitido = geo = true; scope = finScope = [7]; auditoriaFalha = faturaPaga = false; consultaTitulos = 0;
  s = { titulos: [{ id: 1, codigo: 'TIT-1', tipo: 'PAGAR', status: 'ABERTO', origem_titulo: 'CONTRATO',
    valor_original: '10000.00', valor_saldo: '10000.00', valor_baixado: '0.00', valor_bruto: '10000.00', valor_liquido: '10000.00',
    parceiro_id: 20, empresa_id: 1, obra_id: 7, solicitacao_id: 42, categoria_financeira_id: 3, possui_rateio: true,
    data_vencimento: '2026-10-30', linha_digitavel: 'boleto-antigo', juros: 0, multa: 0, valor_impostos: 0 }],
    contratos: [{ id: 4, obra_id: 7, solicitacao_id: 42, fluxo_novo: true, ativo: true, status_contrato: 'ATIVO' }],
    solicitacoes: [{ id: 42, status_global: 'ENVIADO PARA PAGAMENTO', area_responsavel: 'OBRA' }],
    medicoes: [{ id: 9, contrato_id: 4, solicitacao_id: 42, aprovada_em: '2026-10-01', valor_total: '10000.00' }],
    parcelas: [{ id: 101, contrato_id: 4, titulo_financeiro_id: 1, valor: '10000.00' }],
    vinculos: [{ id: 301, medicao_id: 9, contrato_parcela_id: 101, devolvido_em: null, valor_medido: '10000.00' }], partes: [],
    rateios: [{ id: 1, titulo_financeiro_id: 1, obra_id: 7, tipo_rateio: 'VALOR', valor_rateio: '6666.67' },
      { id: 2, titulo_financeiro_id: 1, obra_id: 7, tipo_rateio: 'VALOR', valor_rateio: '3333.33' }],
    filas: [{ id: 1, titulo_financeiro_id: 1, status: 'PENDENTE', valor_previsto: '10000.00' }],
    lotes: [{ id: 1, status: 'AGUARDANDO', revisao_autorizacao: 0 }],
    itens: [{ id: 1, lote_id: 1, titulo_financeiro_id: 1, status: 'AUTORIZADO', valor_snapshot: '10000.00', snapshot_json: { valor: 10000 },
      snapshot_hash: 'imutavel', decidido_em: '2026-10-01', fila_item_id: 1 },
      { id: 2, lote_id: 1, titulo_financeiro_id: 77, status: 'PENDENTE', valor_snapshot: '10.00' }],
    movimentos: [], bancarios: [], recibos: [], seguranca: [], eventos: [] };
}
function match(r, where = {}) {
  return Reflect.ownKeys(where).every(k => {
    const v = where[k];
    if (k === Op.or) return v.some(w => match(r, w));
    if (k === Op.and) return v.every(w => match(r, w));
    if (Array.isArray(v)) return v.includes(r[k]);
    if (v && typeof v === 'object') return Reflect.ownKeys(v).every(op => op === Op.in ? v[op].includes(r[k]) : op === Op.notIn ? !v[op].includes(r[k]) : op === Op.ne ? r[k] != v[op] : false);
    return v === null ? r[k] == null : r[k] === v;
  });
}
function row(bucket, raw) {
  if (!raw) return null;
  const value = { ...clone(raw) };
  Object.defineProperty(value, 'toJSON', { value: () => clone(Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v !== 'function'))) });
  value.update = async (data, options) => {
    assert(options.transaction, 'Escrita exige transacao');
    if (bucket === 'titulos') protection.validar(raw, data, options);
    Object.assign(raw, clone(data)); Object.assign(value, clone(data)); return value;
  };
  return value;
}
function model(bucket) {
  return {
    async findAll(o = {}) { if (bucket === 'titulos') consultaTitulos++; return s[bucket].filter(r => match(r, o.where)).map(r => row(bucket, r)); },
    async findOne(o = {}) { return (await this.findAll(o))[0] || null; },
    async findByPk(id, o = {}) { return this.findOne({ ...o, where: { id: Number(id) } }); },
    async create(data, options) { assert(options.transaction); if (bucket === 'seguranca' && auditoriaFalha) throw Error('Auditoria indisponivel QA');
      const r = { id: Math.max(0, ...s[bucket].map(r => r.id)) + 1, ...clone(data), createdAt: '2026-10-16T12:00:00Z' }; s[bucket].push(r); return row(bucket, r); }
  };
}
const models = Object.fromEntries(Object.entries({ TituloFinanceiro: 'titulos', Contrato: 'contratos', ContratoMedicao: 'medicoes',
  Solicitacao: 'solicitacoes',
  ContratoParcela: 'parcelas', MedicaoParcela: 'vinculos', SolicitacaoFavorecido: 'partes', TituloFinanceiroRateio: 'rateios',
  PagamentoManualFilaItem: 'filas', PagamentoAutorizacaoItem: 'itens', PagamentoAutorizacaoLote: 'lotes', PaymentIntent: 'bancarios',
  MovimentoFinanceiro: 'movimentos', LogExclusao: 'recibos', SecurityEventLog: 'seguranca' }).map(([k, b]) => [k, model(b)]));
const parcelasAll = models.ContratoParcela.findAll.bind(models.ContratoParcela);
models.ContratoParcela.findAll = async o => {
  const ps = await parcelasAll(o);
  if (o.include?.some(i => i.as === 'titulo')) for (const p of ps) p.titulo = await models.TituloFinanceiro.findByPk(p.titulo_financeiro_id);
  return ps;
};
models.MedicaoParcela.count = async o => (await models.MedicaoParcela.findAll(o)).length;
models.sequelize = { transaction: fn => {
  const run = async () => { const antes = clone(s); try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); } catch (e) { s = antes; throw e; } };
  const p = corrente.then(run, run); corrente = p.catch(() => {}); return p;
} };
const auth = { isSuperadmin: u => u?.perfil === 'SUPERADMIN', canViewContratos: async () => permitido,
  getUserObraScopeIds: async () => scope, canAccessContratosGlobal: async () => false,
  canAccessFinanceiro: async () => permitido, getFinanceiroObraScopeIds: async () => finScope,
  userHasAreaPermission: async () => permitido, userHasStrictAreaPermission: async () => permitido };
const ciclos = load('medicaoPagamentoAutorizacoesService.js', { sequelize: lib, '../models': models,
  './pagamentoAutorizacaoEventosService': { recordEvent: async p => { assert(p.transaction); s.eventos.push(clone({ ...p, transaction: undefined })); } },
  './medicaoPagamentoDomain': domain });
const service = load('medicaoPagamentoService.js', { crypto: require('node:crypto'), sequelize: lib, '../models': models,
  './authorizationService': auth, './setorCapabilityService': { userHasSetorCapability: async () => geo }, './medicaoPagamentoDomain': domain,
  './tituloFinanceiroService': { carregarTituloPorId: async (_req, id) => {
    if (!permitido || finScope !== null && !finScope.includes(s.titulos.find(t => t.id === Number(id))?.obra_id)) throw domain.erro('Financeiro fora do escopo', 403);
    return models.TituloFinanceiro.findByPk(id);
  } }, './tituloBloqueioRetornoObraService': { assertTituloDisponivelParaBaixa: t => { if (t.bloqueado_retorno_obra) throw domain.erro('Retorno a obra', 409); } },
  './medicaoPagamentoAutorizacoesService': ciclos,
  './medicaoAtualContratoService': { obterMedicaoAtual: async () => [...s.medicoes].sort((a, b) => b.id - a.id)[0] },
  './pagamentoFilaPrevisaoCartaoService': { desvincularPrevisaoCartao: async (t, uid, transaction) => {
    if (faturaPaga) throw domain.erro('Fatura paga', 409);
    await t.update({ fatura_cartao_id: null, cartao_id: null, atualizado_por: uid }, { transaction });
  } } });
const leitura = load('medicaoPagamentoLeitura.js', { sequelize: lib, '../models': models,
  './solicitacaoFavorecidosDomain': require('../src/services/solicitacaoFavorecidosDomain'), './medicaoPagamentoDomain': domain });
const vinculoService = load('medicaoPagamentoVinculoService.js', { sequelize: lib, '../models': models, './medicaoPagamentoDomain': domain });
const medicaoService = load('medicaoContratoService.js', { sequelize: lib, '../models': models,
  '../utils/codigoDoSetor': { codigoDoSetor: () => 'GEO', setorParaHistorico: () => 'GEO' },
  './contratoParcelasService': { paraCentavos: v => domain.centavos(v || 0), somenteData: v => v, formatarISO: v => v },
  './formasPagamentoMedicaoService': {}, './setorCapabilityService': {},
  './medicaoAtualContratoService': { obterMedicaoAtual: async () => s.medicoes[0], obterParcelasDaMedicao: async () => new Set([101]) },
  './solicitacaoFavorecidosService': { projetarDivisoesNasParcelas: async (ps, tx) => { await leitura.projetarParcelas(ps, new Map(), tx); } },
  './tituloRenegociacaoVinculos': { projetarAssociacoes: async () => {} },
  './analiseProprietarioService': { emAnaliseProprietario: () => false }
}, '\nmodule.exports.calcularStatusDaSolicitacaoDoContrato = calcularStatusDaSolicitacaoDoContrato;');
const req = { user: { id: 5, perfil: 'USUARIO', area: 'GEO' } };
const body = extra => ({ titulo_id: 1, acao: 'REDUZIR', valor_anterior: '10000.00', valor_autorizado: '8000.00', destino: 'FUTURO',
  motivo: 'Autorizado em reuniao; manter saldo futuro', revisao: 0, idempotency_key: 'medicao-ajuste-0001', ...extra });
const aplicar = b => service.alterar(req, 4, 9, b);
const imutavel = () => clone({ medicoes: s.medicoes, parcelas: s.parcelas, vinculos: s.vinculos });

async function projetar() {
  const p = { ...s.parcelas[0], titulo: clone(s.titulos[0]) }, mapa = new Map();
  await leitura.projetarParcelas([p], mapa);
  return p;
}
(async () => {
  reset(); const medido = imutavel(), snapshot = clone(s.itens[0].snapshot_json);
  const primeiro = await aplicar(body());
  assert.equal(primeiro.pendente_id, 2); assert.equal(primeiro.novo_envio_obrigatorio, true);
  assert.equal(s.titulos[0].valor_original, '8000.00'); assert.equal(s.titulos[0].linha_digitavel, null);
  assert.equal(s.titulos[1].status, 'PREVISAO'); assert.equal(s.titulos[1].valor_original, '2000.00');
  assert.equal(s.titulos[1].medicao_pagamento_origem_id, 1); assert.equal(s.titulos[1].solicitacao_id, 42);
  assert.deepEqual(imutavel(), medido, 'Medido/parcelas imutaveis');
  assert.equal(s.itens[0].status, 'INVALIDADO'); assert.deepEqual(s.itens[0].snapshot_json, snapshot); assert.equal(s.itens[0].decidido_em, '2026-10-01');
  assert.equal(s.itens[1].status, 'PENDENTE'); assert.equal(s.lotes[0].status, 'AGUARDANDO'); assert.equal(s.lotes[0].revisao_autorizacao, 1);
  assert.equal(s.filas[0].status, 'RESOLVIDO'); assert(!s.filas[0].movimento_financeiro_id);
  assert.equal(s.solicitacoes[0].status_global, 'AGUARDANDO AJUSTE'); assert.equal(s.solicitacoes[0].area_responsavel, 'OBRA');
  assert.equal(s.recibos[0].solicitacao_id, null, 'Nao cria autoria de solicitacao'); assert.equal(s.eventos.length, 1);
  assert.equal(s.rateios.filter(r => r.titulo_financeiro_id === 1).reduce((s, r) => s + domain.centavos(r.valor_rateio), 0), 800000);
  assert.equal(s.rateios.filter(r => r.titulo_financeiro_id === 2).reduce((s, r) => s + domain.centavos(r.valor_rateio), 0), 200000);
  const depois = clone(s); assert.equal((await aplicar(body())).idempotente, true); assert.deepEqual(s, depois);
  await assert.rejects(aplicar(body({ idempotency_key: 'outra-chave-00001' })), { statusCode: 409 });
  await assert.rejects(aplicar(body({ motivo: 'Diferente' })), { statusCode: 409 });
  const simultaneos = await Promise.all([aplicar(body()), aplicar(body())]); assert(simultaneos.every(r => r.idempotente)); assert.equal(s.titulos.length, 2);
  let p = await projetar(); assert.equal(p.valor, '10000.00'); assert.equal(p.medicao_pagamento_resumo.valor_titulos, 8000); assert.equal(p.medicao_pagamento_resumo.valor_pendente, 2000);
  await medicaoService.reconciliarParcelasComOPago(4, {}, { LOCK: { UPDATE: 'UPDATE' } });
  assert.deepEqual(imutavel(), medido, 'Reconciliacao real nao redefine o medido para 8 mil');
  Object.assign(s.titulos[0], { status: 'QUITADO', valor_baixado: '8000.00', valor_saldo: '0.00' });
  const pago = clone(s.titulos[0]);
  p = await projetar(); assert.equal(p.titulo.status, 'PARCIAL'); assert.equal(p.titulo.valor_saldo, 2000, 'Pendente impede PAGA');
  assert.notEqual(await medicaoService.calcularStatusDaSolicitacaoDoContrato(4), 'PAGA');
  await assert.rejects(aplicar(body({ revisao: 1, valor_anterior: '8000.00', valor_autorizado: '7000.00', idempotency_key: 'pago-nao-alterar-1' })), { statusCode: 409 });
  await aplicar({ titulo_id: 2, acao: 'LIBERAR_PENDENTE', valor_anterior: '2000.00', motivo: 'Liberado posteriormente', revisao: 1, idempotency_key: 'liberar-pendente-1' });
  assert.deepEqual(s.titulos[0], pago); assert.equal(s.titulos[1].status, 'ABERTO'); assert.equal(s.filas.length, 1, 'Liberar nao enfileira nem aprova');
  Object.assign(s.titulos[1], { status: 'QUITADO', valor_baixado: '2000.00', valor_saldo: '0.00' });
  p = await projetar(); assert.equal(p.titulo.status, 'QUITADO'); assert.equal(p.titulo.valor_baixado, 10000); assert.deepEqual(imutavel(), medido);
  await medicaoService.reconciliarParcelasComOPago(4, {}, { LOCK: { UPDATE: 'UPDATE' } });
  assert.deepEqual(imutavel(), medido); assert.equal(await medicaoService.calcularStatusDaSolicitacaoDoContrato(4), 'PAGA');

  reset(); await aplicar(body({ destino: 'DEFINITIVO' }));
  assert.equal(s.titulos.length, 1); assert.equal(s.titulos[0].medicao_pagamento.abatimento, '2000.00');
  p = await projetar(); assert.equal(p.medicao_pagamento_resumo.abatimento, 2000); assert.equal(p.medicao_pagamento_resumo.valor_pendente, 0);
  assert.throws(() => protection.validar(s.titulos[0], { valor_original: 9000 }), { statusCode: 409 });
  assert.throws(() => protection.validar(s.titulos[0], { valor_baixado: 9000 }), { statusCode: 409 });
  assert.throws(() => protection.validar(s.titulos[0], { deleted_at: 'agora' }), { statusCode: 409 });
  assert.doesNotThrow(() => protection.validar(s.titulos[0], { valor_baixado: 8000, valor_saldo: 0, status: 'QUITADO' }, { transaction: {} }));
  Object.assign(s.titulos[0], { status: 'QUITADO', valor_baixado: '8000.00', valor_saldo: '0.00' });
  await medicaoService.reconciliarParcelasComOPago(4, {}, { LOCK: { UPDATE: 'UPDATE' } });
  assert.deepEqual(imutavel(), medido, 'Definitivo nao devolve 2 mil para medir de novo');
  assert.equal(await medicaoService.calcularStatusDaSolicitacaoDoContrato(4), 'PAGA');
  reset(); const corridas = await Promise.allSettled([aplicar(body()), aplicar(body({ idempotency_key: 'concorrente-outro-1' }))]);
  assert.equal(corridas.filter(r => r.status === 'fulfilled').length, 1); assert.equal(s.titulos.length, 2);
  reset(); s.medicoes.push({ id: 10, contrato_id: 4, valor_total: '1000.00', aprovada_em: null });
  await aplicar(body()); assert.equal(s.solicitacoes[0].status_global, 'ENVIADO PARA PAGAMENTO', 'Ciclo de medicao posterior preservado');

  for (const patch of [{ status: 'QUITADO', valor_baixado: 1 }, { status: 'PARCIAL' }, { status: 'CANCELADO' }, { compartilhamento_id: 4 },
    { renegociado_por_id: 3 }, { juros: 10 }, { valor_impostos: 1 }, { status_cobranca: 'EMITIDO' }, { bloqueado_retorno_obra: true }]) {
    reset(); Object.assign(s.titulos[0], patch); const antes = clone(s);
    await assert.rejects(aplicar(body())); assert.deepEqual(s, antes, 'Negativa nao escreve');
  }
  reset(); s.movimentos.push({ id: 1, titulo_financeiro_id: 1, status: 'ATIVO' }); await assert.rejects(aplicar(body()), { statusCode: 409 });
  reset(); s.bancarios.push({ id: 1, titulo_financeiro_id: 1, status: 'ENVIADO' }); await assert.rejects(aplicar(body()), { statusCode: 409 });
  reset(); s.filas[0].processado_em = '2026-10-16'; let antes = clone(s); await assert.rejects(aplicar(body()), { statusCode: 409 }); assert.deepEqual(s, antes);
  reset(); auditoriaFalha = true; antes = clone(s); await assert.rejects(aplicar(body()), /Auditoria indisponivel/); assert.deepEqual(s, antes, 'Falha final restaura titulo, filho, rateios, fila, dossie e eventos');
  reset(); s.titulos[0].fatura_cartao_id = 8; antes = clone(s); await assert.rejects(aplicar(body()), /Confirme a desvinculacao/); assert.deepEqual(s, antes);
  faturaPaga = true; await assert.rejects(aplicar(body({ desvincular_fatura: true })), /Fatura paga/); assert.deepEqual(s, antes);
  faturaPaga = false; await aplicar(body({ desvincular_fatura: true })); assert.equal(s.titulos[0].fatura_cartao_id, null);
  for (const preparar of [() => { permitido = false; }, () => { geo = false; }, () => { scope = [99]; }, () => { finScope = [99]; }]) {
    reset(); preparar(); antes = clone(s); await assert.rejects(aplicar(body()), { statusCode: 403 }); assert.deepEqual(s, antes);
  }
  reset(); await assert.rejects(service.alterar(req, 4, 999, body()), { statusCode: 404 });
  await assert.rejects(vinculoService.impedirValorGenerico(s.titulos[0]), { statusCode: 409 });
  await assert.rejects(aplicar(body({ titulo_id: 999 })), { statusCode: 404 });
  for (const bad of [null, [], { ...body(), extra: 1 }, body({ valor_autorizado: '8000.001' }), body({ valor_autorizado: '0' }),
    body({ valor_autorizado: '10000' }), body({ destino: '' }), body({ motivo: '' }), body({ revisao: -1 }), body({ idempotency_key: 'x' })]) assert.throws(() => domain.validar(bad));
  reset(); await aplicar(body()); consultaTitulos = 0; const consulta = await service.consultar(req, 4, 9);
  assert.equal(consulta.valor_medido, 10000); assert.equal(consulta.titulos.length, 2); assert.equal(consulta.historico.length, 1);
  assert.equal(consultaTitulos, 1, 'Consulta em lote, sem N+1');
  const moduloResumo = load('contratoResumoOperacionalService.js', { sequelize: lib, '../models': models, './tituloRenegociacaoVinculos': {} });
  assert.equal(moduloResumo.classificarStatusOperacional({ contratado: 10000, medido: 10000, movimentado: 8000, abatimento: 2000 }), 'CONCLUIDO');
  const orm = load('tituloRenegociacaoProtecao.js', {
    './medicaoPagamentoProtecao': protection, './tituloCompartilhadoProtecao': { validar() {} }
  });
  let consultouOrm = false;
  const modeloOrm = { unscoped() { return this; }, async findAll(options) {
    consultouOrm = true;
    assert(options.attributes.includes('medicao_pagamento'));
    assert(options.attributes.includes('medicao_pagamento_origem_id'));
    assert.equal(options.lock, 'UPDATE');
    return [s.titulos[0]];
  } };
  await assert.rejects(orm.proteger(modeloOrm, { id: 1 }, { valor_original: 1 }, { transaction: { LOCK: { UPDATE: 'UPDATE' } } }), { statusCode: 409 });
  assert(consultouOrm, 'Protecao ORM consulta marcadores sob lock');
  const filho = s.titulos[1];
  assert.throws(() => protection.validar(filho, { status: 'ABERTO' }), { statusCode: 409 });
  assert.throws(() => protection.validar(filho, { valor_baixado: 1 }), { statusCode: 409 });
  assert.throws(() => protection.validar(s.titulos[0], { medicao_pagamento: s.titulos[0].medicao_pagamento }), { statusCode: 409 });
  // Migration real em simulador DDL: execucao repetida e retomada parcial,
  // sem require do banco/configuracao e sem qualquer DML ou exclusao.
  const migrationModule = { exports: {} }, colunas = new Set(), indices = [], ddl = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../migrations/202610160002_medicao_pagamento_autorizado.js'), 'utf8'), {
    module: migrationModule, require(id) {
      assert.equal(id, '../src/database/schemaUtils');
      return { columnExists: async (_db, tabela, coluna) => { assert.equal(tabela, 'titulos_financeiros'); return colunas.has(coluna); } };
    }
  });
  const queryInterface = {
    async addColumn(tabela, coluna, config) {
      assert.equal(tabela, 'titulos_financeiros'); assert.equal(config.allowNull, true);
      if (config.references) { assert.equal(config.references.model, tabela); assert.equal(config.onDelete, 'RESTRICT'); }
      colunas.add(coluna); ddl.push(coluna);
    }, async showIndex() { return indices; },
    async addIndex(tabela, campos, config) { assert.equal(tabela, 'titulos_financeiros'); assert.equal(campos[0], 'medicao_pagamento_origem_id'); indices.push({ name: config.name }); ddl.push(config.name); }
  };
  const migrationArgs = { queryInterface, sequelize: {}, DataTypes: { JSON: 'JSON', INTEGER: 'INTEGER' } };
  await migrationModule.exports.up(migrationArgs); assert.equal(ddl.length, 3);
  await migrationModule.exports.up(migrationArgs); assert.equal(ddl.length, 3, 'Replay DDL nao duplica colunas/indice');
  indices.length = 0; await migrationModule.exports.up(migrationArgs); assert.equal(ddl.length, 4, 'Retoma somente indice pendente');
  await assert.rejects(migrationModule.exports.down(), /rollback estrutural/);
  console.log('OK: FUTURO/DEFINITIVO, medido imutavel, previsao/liberacao sem mexer no pago, novo envio, dossie/fila antigos invalidados, rateio/centavos, idempotencia/concorrencia, rollback, ACL/escopo e protecoes. Sem banco/rede.');
  console.log('OK: protecao ORM sob lock, previsao bloqueada fora do fluxo e migration DDL repetivel/retomavel. Nenhuma migration aplicada.');
})().catch(e => { console.error(e); process.exitCode = 1; });
