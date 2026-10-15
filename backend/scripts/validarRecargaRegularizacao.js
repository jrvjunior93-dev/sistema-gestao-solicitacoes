'use strict';
// Servico/controller reais, modelos em memoria. Nunca carrega .env, banco ou rede.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const Op = { in: Symbol('in'), lt: Symbol('lt'), or: Symbol('or'), and: Symbol('and') };
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/recargaCartaoRegularizacaoService.js'), 'utf8');
const geo = { id: 1, perfil: 'USUARIO', area: 'GEO', scope: [19] };
function ambiente() {
  const w = { reads: 0, writes: 0, locks: [], failAudit: false,
    data: { Solicitacao: [{ id: 31, codigo: 'SOL-31', obra_id: 19, criado_por: 99, tipo_solicitacao_id: 3, cancelada: true, status_global: 'PENDENTE', area_responsavel: 'OBRA' }],
      SolicitacaoRecargaCartao: [{ id: 7, solicitacao_id: 31, cartao_recarga_id: 1, titulo_financeiro_id: 80, valor_solicitado: 100, valor_efetivo: 0, status_ciclo: 'AGUARDANDO_PAGAMENTO' }],
      CartaoRecarga: [{ id: 1, nome: 'Joao', ultimos_quatro: '1234' }],
      TituloFinanceiro: [{ id: 80, solicitacao_id: 31, origem_titulo: 'RECARGA_CARTAO', tipo: 'PAGAR', status: 'ABERTO', valor_original: 100, valor_baixado: 0, valor_saldo: 100 }],
      CartaoRecargaPrestacao: [], Historico: [], LogExclusao: [], MovimentoFinanceiro: [], PaymentIntent: [], PagamentoManualFilaItem: [],
      PagamentoAutorizacaoItem: [], IntegracaoSiengeFila: [], CaixaPagamentoRemessaItem: [], Obra: [] } };
  function matches(row, where = {}) {
    return Reflect.ownKeys(where).every(k => {
      const value = where[k];
      if (k === Op.or) return value.some(w => matches(row, w));
      if (k === Op.and) return value.every(w => matches(row, w));
      if (value && typeof value === 'object') {
        if (Op.in in value) return value[Op.in].includes(row[k]);
        if (Op.lt in value) return row[k] < value[Op.lt];
      }
      return row[k] === value;
    });
  }
  function row(name, data) {
    if (!data) return null;
    Object.defineProperty(data, 'update', { configurable: true, enumerable: false, value: async (values, opts) => {
      assert(opts?.transaction, 'toda escrita precisa de transacao'); w.writes++; Object.assign(data, values); return data;
    } });
    return data;
  }
  const models = {};
  for (const name of Object.keys(w.data)) models[name] = {
    unscoped() { return this; },
    async findByPk(id, opts = {}) { w.reads++; if (opts.lock) w.locks.push(name + ':' + id); return row(name, w.data[name].find(r => r.id === Number(id))); },
    async findAll(opts = {}) {
      w.reads++;
      let rows = w.data[name].filter(r => matches(r, opts.where));
      if (name === 'Solicitacao' && opts.include) rows = rows.filter(s => w.data.SolicitacaoRecargaCartao.some(r => r.solicitacao_id === s.id)).map(s => ({ ...s,
        recargasCartao: w.data.SolicitacaoRecargaCartao.filter(r => r.solicitacao_id === s.id).map(r => ({ ...r, cartao: w.data.CartaoRecarga.find(c => c.id === r.cartao_recarga_id) })), obra: { nome: 'Obra QA' } }));
      if (opts.order?.[0]?.[1] === 'DESC') rows.sort((a, b) => b.id - a.id);
      if (opts.limit) rows = rows.slice(0, opts.limit);
      return rows.map(r => row(name, r));
    },
    async findOne(opts) { return (await this.findAll(opts))[0] || null; },
    async create(values, opts) {
      assert(opts?.transaction); if (name === 'LogExclusao' && w.failAudit) throw Error('falha auditada');
      w.writes++; const data = { id: w.data[name].length + 1, ...values }; w.data[name].push(data); return row(name, data);
    },
    async findOrCreate(opts) { const atual = await this.findOne(opts); return atual ? [atual, false] : [await this.create({ ...opts.where, ...opts.defaults }, opts), true]; }
  };
  let fila = Promise.resolve();
  models.sequelize = { transaction(executar) {
    const result = fila.then(async () => {
      const antes = structuredClone(w.data), writes = w.writes;
      try { return await executar({ LOCK: { UPDATE: 'UPDATE' } }); }
      catch (e) { w.data = antes; w.writes = writes; throw e; }
    }); fila = result.catch(() => {}); return result;
  } };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, console, require(name) {
    if (name === 'node:crypto') return require(name);
    if (name === 'sequelize') return { Op };
    if (name === '../models') return models;
    if (name === './authorizationService') throw Error('Regularizacao nao pode alterar ou reutilizar acesso global as obras');
    if (name === './cartaoRecargaSaldoService') return { bloquearCartao: async (id, transaction) => {
      assert(transaction); w.locks.push('Cartao:' + id); if (!w.data.CartaoRecarga.some(c => c.id === id)) throw Error('Cartao ausente');
    } };
    throw Error('Dependencia nao simulada: ' + name);
  } });
  w.service = module.exports; w.models = models; return w;
}

// Executar a regra REAL de leitura do detalhe e dos anexos sobre os mesmos
// dados alterados pela regularizacao. O teste precisa pegar concessoes indiretas
// por setor, autoria, atribuicao, mencao ou historico de interacao.
function declaracao(file, name) {
  const code = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  const trecho = code.slice(code.indexOf('async function ' + name + '('));
  assert(trecho.startsWith('async function ' + name + '('));
  const fim = trecho.indexOf('\n}\n');
  if (fim >= 0) return trecho.slice(0, fim + 2);
  const fimWindows = trecho.indexOf('\r\n}\r\n');
  assert(fimWindows >= 0); return trecho.slice(0, fimWindows + 3);
}
function regrasNormais(w) {
  const sandbox = { Op, Notificacao: {}, NotificacaoDestinatario: { findOne: async () => null },
    Historico: w.models.Historico, obterAreaUsuario: async req => req.user.area,
    expandirTokensComAliasesGeo: t => t, obterTokensSetorPrincipalUsuario: async req => [req.user.area],
    isAdministrativoToken: s => s === 'ADMINISTRATIVO', isSetorObraGeral: async req => req.user.area === 'OBRA',
    obterSetoresExtrasVisiveisUsuario: async () => [], userHasConfiguredAreaPermissions: async () => true,
    PERMISSAO_SOLICITACOES_VISUALIZAR_MINHAS: 'minhas', PERMISSAO_SOLICITACOES_VISUALIZAR_SETOR: 'setor',
    PERMISSAO_SOLICITACOES_VISUALIZAR_TODAS: 'todas', userHasAreaPermission: async (_u, keys) => keys[0] !== 'todas',
    podeVisualizarSolicitacaoPelaFila: async () => false, validarAcessoObra: async () => true,
    setorPertenceAoUsuario: (tokens, setor) => tokens.includes(setor), solicitacaoPertenceASetoresVisiveis: async () => false,
    isUsuarioSetorGeo: async req => req.user.area === 'GEO', obterModoRecebimentoPorSetorETipo: async () => 'ADMIN_PRIMEIRO',
    isGeoToken: s => s === 'GEO', ACOES_ENCAMINHAMENTO_SETOR: ['ENVIADA_SETOR'],
    solicitacaoAtendeEscopoOperacionalUsuario: async () => false };
  const detalhe = vm.runInNewContext('(' + declaracao('../src/controllers/SolicitacaoController.js', 'verificarAcessoDetalheSolicitacao') + ')', sandbox);
  const arquivos = vm.runInNewContext('(' + declaracao('../src/services/fileAccessService.js', 'canAccessSolicitacaoFile') + ')', {
    Solicitacao: w.models.Solicitacao, podeVisualizarSolicitacaoPelaFila: async () => false,
    isBusinessAdmin: u => u.perfil === 'SUPERADMIN', hasObraAccess: async () => false,
    buildUserScopeTokens: async u => [u.area], tokensContainAreaValue: (t, s) => t.includes(s),
    userSetorParticipatedInSolicitacao: async () => w.data.Historico.some(h => h.setor === 'GEO'),
    userParticipatedInSolicitacao: async u => w.data.Historico.some(h => h.usuario_responsavel_id === u.id),
    userMentionedInSolicitacao: async () => false, logFileDenied: async () => {} });
  return { detalhe: (u, s = w.data.Solicitacao[0]) => detalhe({ user: u }, s, { permitirLeituraGlobal: true }),
    arquivos: u => arquivos({ user: u }, 31) };
}
function pago(w, status = null) {
  Object.assign(w.data.TituloFinanceiro[0], { status: 'QUITADO', valor_baixado: 100, valor_saldo: 0 });
  Object.assign(w.data.SolicitacaoRecargaCartao[0], { valor_efetivo: 100, status_ciclo: 'PRESTACAO_PENDENTE' });
  if (status) w.data.CartaoRecargaPrestacao.push({ id: 21, solicitacao_recarga_id: 7, valor_base: 100, status, valor_despesas: 30, observacoes: 'Preservar', validado_por: 9 });
}
const payload = ctx => ({ motivo: 'Conferencia da exclusao de teste', revisao: ctx.revisao, chave_idempotencia: 'regularizacao-teste-20261015' });
async function rejeita(w, modify, regex) {
  if (modify) modify(w);
  const ctx = await w.service.consultar(31, geo);
  assert.equal(ctx.pode_regularizar, false);
  assert.match(ctx.impedimento, regex);
  await assert.rejects(() => w.service.regularizar(31, payload(ctx), geo), regex);
  assert.equal(w.writes, 0);
}
(async () => {
  {
    const w = ambiente(), ctx = await w.service.consultar(31, geo); assert.equal(w.writes, 0);
    assert.equal(ctx.acao, 'ENCERRAR_SEM_PAGAMENTO'); assert.equal(ctx.pode_regularizar, true);
    const p = payload(ctx); const r = await w.service.regularizar(31, p, geo);
    assert.equal(r.recuperada, false); assert.equal(w.data.Solicitacao[0].cancelada, true);
    assert.equal(w.data.TituloFinanceiro[0].status, 'CANCELADO'); assert.equal(w.data.TituloFinanceiro[0].valor_saldo, 0);
    assert.equal(w.data.TituloFinanceiro[0].valor_original, 100); assert.equal(w.data.SolicitacaoRecargaCartao[0].status_ciclo, 'CANCELADA');
    assert.equal(w.data.CartaoRecargaPrestacao.length, 0); assert.equal(w.data.LogExclusao.length, 1); assert.equal(w.data.Historico.length, 0);
    const audit = JSON.parse(w.data.LogExclusao[0].payload_json); assert.equal(audit.antes[0].titulo_status, 'ABERTO'); assert.equal(audit.antes[0].valor_saldo, 100);
    assert.equal(w.data.LogExclusao[0].usuario_id, geo.id); assert.equal(audit.motivo, p.motivo);
    const writes = w.writes; assert.equal((await w.service.regularizar(31, p, geo)).replay, true); assert.equal(w.writes, writes);
    await assert.rejects(() => w.service.regularizar(31, { ...p, motivo: 'Motivo diferente apos repetir' }, geo), /dados diferentes/);
    assert.equal(w.locks[0], 'Cartao:1'); assert.equal(w.locks[1], 'Solicitacao:31');
  }
  for (const status of [null, 'PENDENTE', 'REJEITADA', 'ENVIADA', 'VALIDADA']) {
    const w = ambiente(); pago(w, status);
    const titulo = JSON.stringify(w.data.TituloFinanceiro), prestacao = JSON.stringify(w.data.CartaoRecargaPrestacao);
    const ctx = await w.service.consultar(31, geo); const p = payload(ctx);
    const r = await w.service.regularizar(31, p, geo);
    assert.equal(r.recuperada, true); assert.equal(w.data.Solicitacao[0].cancelada, false); assert.equal(w.data.Solicitacao[0].area_responsavel, 'OBRA');
    assert.equal(w.data.Solicitacao[0].status_global, 'PENDENTE');
    assert.equal(JSON.stringify(w.data.TituloFinanceiro), titulo, 'titulo pago nunca e reescrito');
    if (status) assert.equal(JSON.stringify(w.data.CartaoRecargaPrestacao), prestacao, 'prestacao existente nunca e resetada');
    else { assert.equal(w.data.CartaoRecargaPrestacao.length, 1); assert.equal(w.data.CartaoRecargaPrestacao[0].valor_base, 100); }
    assert.equal((await w.service.regularizar(31, p, geo)).replay, true); assert.equal(w.data.LogExclusao.length, 1); assert.equal(w.data.Historico.length, 0);
  }
  {
    const w = ambiente(); pago(w, 'ENVIADA');
    w.data.CartaoRecarga.push({ id: 2, nome: 'Segundo', ultimos_quatro: '9876' });
    w.data.SolicitacaoRecargaCartao.push({ id: 8, solicitacao_id: 31, cartao_recarga_id: 2, titulo_financeiro_id: 81, valor_solicitado: 50, valor_efetivo: 0, status_ciclo: 'AGUARDANDO_PAGAMENTO' });
    w.data.TituloFinanceiro.push({ id: 81, solicitacao_id: 31, origem_titulo: 'RECARGA_CARTAO', tipo: 'PAGAR', status: 'PREVISAO', valor_original: 50, valor_baixado: 0, valor_saldo: 50 });
    const ctx = await w.service.consultar(31, geo); assert.equal(ctx.recargas.length, 2);
    await w.service.regularizar(31, payload(ctx), geo);
    assert.equal(w.data.TituloFinanceiro[0].status, 'QUITADO'); assert.equal(w.data.TituloFinanceiro[1].status, 'CANCELADO');
    assert.equal(w.data.Solicitacao[0].status_global, 'PENDENTE'); assert.equal(w.data.CartaoRecargaPrestacao.length, 1);
    assert.equal(w.data.SolicitacaoRecargaCartao[1].status_ciclo, 'CANCELADA');
  }
  for (const [model, status] of [['PaymentIntent', 'ENVIADO_AO_BANCO'], ['PagamentoManualFilaItem', 'PENDENTE'], ['PagamentoAutorizacaoItem', 'AUTORIZADO'], ['IntegracaoSiengeFila', 'PENDENTE'], ['CaixaPagamentoRemessaItem', 'GERADO']]) {
    await rejeita(ambiente(), w => w.data[model].push({ id: 1, titulo_financeiro_id: 80, status }), /processamento/);
  }
  await rejeita(ambiente(), w => w.data.TituloFinanceiro.splice(0), /Vinculo financeiro/);
  await rejeita(ambiente(), w => { w.data.TituloFinanceiro[0].origem_titulo = 'MANUAL'; }, /Vinculo financeiro/);
  await rejeita(ambiente(), w => { w.data.TituloFinanceiro[0].renegociacao_id = 5; }, /protegido/);
  await rejeita(ambiente(), w => { w.data.SolicitacaoRecargaCartao[0].valor_efetivo = 100; }, /divergente/);
  await rejeita(ambiente(), w => w.data.MovimentoFinanceiro.push({ id: 1, titulo_financeiro_id: 80, status: 'ATIVO' }), /movimento financeiro/);
  await rejeita(ambiente(), w => { pago(w, 'VALIDANDO'); }, /processada/);
  await rejeita(ambiente(), w => { pago(w, 'PENDENTE'); w.data.TituloFinanceiro[0].deleted_at = '2026-10-15'; }, /divergente/);
  await rejeita(ambiente(), w => { pago(w, 'PENDENTE'); w.data.CartaoRecargaPrestacao[0].valor_base = 200; }, /divergentes/);
  {
    const w = ambiente(); pago(w, 'PENDENTE');
    for (const [name, status] of [['PaymentIntent', 'BAIXADO'], ['PagamentoManualFilaItem', 'BAIXADO'], ['IntegracaoSiengeFila', 'SUCESSO']]) w.data[name].push({ id: 1, titulo_financeiro_id: 80, status });
    const ctx = await w.service.consultar(31, geo); assert.equal(ctx.pode_regularizar, true);
    await w.service.regularizar(31, payload(ctx), geo);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo); pago(w);
    await assert.rejects(() => w.service.regularizar(31, payload(ctx), geo), /mudou/); assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo);
    w.data.TituloFinanceiro[0].valor_original = 500;
    await assert.rejects(() => w.service.regularizar(31, payload(ctx), geo), /mudou/); assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo);
    await w.service.regularizar(31, { ...payload(ctx), titulo_id: 999, valor_pago: 900, acao: 'RECUPERAR_PRESTACAO', obra_id: 99 }, geo);
    assert.equal(w.data.Solicitacao[0].cancelada, true); assert.equal(w.data.TituloFinanceiro[0].valor_baixado, 0);
    assert.equal(w.data.TituloFinanceiro[0].id, 80); assert.equal(w.data.Solicitacao[0].obra_id, 19);
  }
  {
    const w = ambiente(); pago(w); w.data.Solicitacao[0].cancelada = false;
    await assert.rejects(() => w.service.consultar(31, geo), /ja esta ativa/);
    await assert.rejects(() => w.service.regularizar(31, { ...payload({ revisao: 'a'.repeat(64) }) }, geo), /ja esta ativa/);
    assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo); const p = payload(ctx);
    await assert.rejects(() => w.service.regularizar(31, { ...p, motivo: '' }, geo), /Informe motivo/);
    await assert.rejects(() => w.service.regularizar(31, { ...p, chave_idempotencia: '' }, geo), /Informe motivo/);
    await assert.rejects(() => w.service.consultar('31abc', geo), /invalida/); assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo);
    const motivo = 'Regularizacao detalhada '.repeat(70).trim();
    await w.service.regularizar(31, { ...payload(ctx), motivo }, geo);
    assert.equal(w.data.LogExclusao[0].motivo.length, 255);
    assert.equal(JSON.parse(w.data.LogExclusao[0].payload_json).motivo, motivo);
    assert.equal(w.data.Historico.length, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo); w.failAudit = true;
    const antes = JSON.stringify(w.data); await assert.rejects(() => w.service.regularizar(31, payload(ctx), geo), /falha auditada/);
    assert.equal(JSON.stringify(w.data), antes); assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo); const p = payload(ctx);
    const ambos = await Promise.all([w.service.regularizar(31, p, geo), w.service.regularizar(31, p, geo)]);
    assert.equal(ambos.filter(r => r.replay).length, 1); assert.equal(w.data.LogExclusao.length, 1); assert.equal(w.data.Historico.length, 0);
  }
  for (const pagoAntes of [false, true]) {
    const w = ambiente(), semVinculo = { ...geo, scope: [] };
    if (pagoAntes) pago(w, 'ENVIADA');
    const regras = regrasNormais(w);
    assert.equal((await regras.detalhe(semVinculo, { ...w.data.Solicitacao[0], cancelada: false })).allowed, false);
    assert.equal((await regras.arquivos(semVinculo)).allowed, false);
    assert.equal((await w.service.listar(semVinculo)).items.length, 1);
    const ctx = await w.service.consultar(31, semVinculo);
    const resultado = await w.service.regularizar(31, payload(ctx), semVinculo);
    assert.equal(resultado.recuperada, pagoAntes);
    assert.equal((await regras.detalhe(semVinculo)).allowed, false, 'regularizar nao permite ler o detalhe');
    assert.equal((await regras.arquivos(semVinculo)).allowed, false, 'regularizar nao permite ler anexos');
    assert.equal(w.data.Solicitacao[0].area_responsavel, 'OBRA'); assert.equal(w.data.Solicitacao[0].status_global, 'PENDENTE');
    assert.equal(w.data.Historico.length, 0); assert.equal(w.data.LogExclusao.length, 1);
    assert.equal(semVinculo.scope.length, 0);
    if (pagoAntes) {
      // Controle positivo: o historico comum concederia acesso. A nova trilha nao pode estar la.
      w.data.Historico.push({ id: 88, solicitacao_id: 31, usuario_responsavel_id: semVinculo.id, setor: 'GEO', acao: 'RECARGA_EXCLUIDA_REGULARIZADA' });
      assert.equal((await regras.detalhe(semVinculo)).allowed, true);
      assert.equal((await regras.arquivos(semVinculo)).allowed, true);
    }
  }
  {
    const w = ambiente(); pago(w, 'PENDENTE'); w.data.Solicitacao[0].area_responsavel = 'GEO';
    const regras = regrasNormais(w), ctx = await w.service.consultar(31, geo);
    assert.equal((await regras.detalhe(geo, { ...w.data.Solicitacao[0], cancelada: false })).allowed, true);
    const p = payload(ctx); await w.service.regularizar(31, p, geo);
    assert.equal((await regras.detalhe(geo)).allowed, true, 'acesso normal preexistente e preservado');
    // Replay de commit anterior a esta mudanca continua funcionando sem gravar nem apagar o passado.
    const legado = JSON.parse(w.data.LogExclusao[0].payload_json);
    w.data.LogExclusao = []; w.data.Historico = [{ id: 77, solicitacao_id: 31, acao: 'RECARGA_EXCLUIDA_REGULARIZADA', usuario_responsavel_id: geo.id, metadata: JSON.stringify(legado) }];
    const writes = w.writes; assert.equal((await w.service.regularizar(31, p, geo)).replay, true); assert.equal(w.writes, writes);
  }
  for (const user of [{ id: 2, area: 'OBRA' }, { id: 3, area: 'DEPARTAMENTO PESSOAL' }, { id: 4, perfil: 'ADMIN', area: 'FINANCEIRO' }]) {
    const w = ambiente(); await assert.rejects(() => w.service.listar(user), /Somente GEO/);
    await assert.rejects(() => w.service.consultar(31, user), /Somente GEO/);
    await assert.rejects(() => w.service.regularizar(31, {}, user), /Somente GEO/); assert.equal(w.reads, 0);
  }
  {
    const w = ambiente(); const semVinculo = { ...geo, scope: [] };
    assert.equal((await w.service.consultar(31, semVinculo)).id, 31);
    assert.equal((await w.service.listar(semVinculo)).items.length, 1); assert.equal(w.writes, 0);
    assert.equal((await w.service.listar(geo)).items.length, 1);
    assert.equal((await w.service.listar(geo, { codigo: 'SOL-404' })).items.length, 0);
    assert.equal((await w.service.listar(geo, { antes_de: 31 })).items.length, 0);
    const ctx = await w.service.consultar(31, { id: 5, perfil: 'SUPERADMIN' }); await w.service.regularizar(31, payload(ctx), { id: 5, perfil: 'SUPERADMIN' });
  }
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  assert.match(routes, /router\.post\('\/recargas-cartao\/regularizacao\/:id', criticalRateLimit/);
  assert.match(routes, /'\/recargas-cartao\/solicitacoes\/:solicitacaoOperacionalId'/);
  const controllerModule = { exports: {} };
  let podeVer = false, erroAcl = 403;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/controllers/RecargaCartaoRegularizacaoController.js'), 'utf8'), {
    module: controllerModule, console: { error() {} }, require(name) {
      if (name === '../services/solicitacaoRetornoService') return { assertPodeVisualizarSolicitacao: async (req, id) => {
        assert.equal(id, 31); if (!podeVer) throw Object.assign(Error('negado'), { statusCode: erroAcl });
      } };
      return {
      listar: async user => { assert.equal(user.area, 'OBRA'); throw Object.assign(Error('negado'), { statusCode: 403 }); },
      consultar: async () => { throw Error('segredo interno'); }, regularizar: async () => ({ solicitacao_id: 31, recuperada: true })
    }; }
  });
  const response = () => ({ codigo: 200, body: null, status(n) { this.codigo = n; return this; }, json(b) { this.body = b; return this; } });
  let res = response(); await controllerModule.exports.listar({ user: { area: 'OBRA' }, query: {}, body: { area: 'GEO' } }, res);
  assert.equal(res.codigo, 403); res = response(); await controllerModule.exports.consultar({ params: { id: 31 } }, res);
  assert.equal(res.codigo, 500); assert(!res.body.error.includes('segredo'));
  for (const permitido of [false, true, false]) {
    podeVer = permitido; res = response();
    await controllerModule.exports.regularizar({ params: { id: 31 }, user: geo }, res);
    assert.equal(res.body.pode_abrir_solicitacao, permitido, 'revalidar ACL inclusive em replay');
  }
  erroAcl = 500; res = response();
  await controllerModule.exports.regularizar({ params: { id: 31 }, user: geo }, res);
  assert.equal(res.body.pode_abrir_solicitacao, false, 'falha da ACL nunca libera detalhe');
  const prazosModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/prazosOperacionaisRotaService.js'), 'utf8'), {
    module: prazosModule, require(name) { if (name === 'sequelize') return { Op }; if (name === '../models') return {}; throw Error(name); }
  });
  const prazos = prazosModule.exports;
  const obras = await prazos.obrasDaOperacao({ path: '/recargas-cartao/regularizacao/31', body: {}, method: 'POST' }, { Solicitacao: { findAll: async () => [{ id: 31, obra_id: 19 }] } });
  assert.equal(JSON.stringify(obras), '[19]');
  console.log('Regularizacao: GEO global sem ampliar visibilidade/anexos, auditoria isolada, consulta sem escrita, recuperacao paga/mista, filas protegidas, replay atual/legado, concorrencia, revisao e rollback aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
