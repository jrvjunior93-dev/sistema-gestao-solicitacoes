'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
// Chamado pelo harness de servicos reais validarAnaliseProprietario.js.
module.exports = async function validar(h) {
  const { digital, models, reset, req, env, getState, webauthnMetrics } = h;
  const dono = { ...req, user: { id: 31, grants: ['financeiro.autorizacoes_pagamento.decidir'] } };
  const snap = () => JSON.stringify(getState());
  async function preparar(compartilhado = false) {
    reset();
    if (compartilhado) {
      const s = getState();s.TituloFinanceiro[0].compartilhamento_id = 1;
      s.TituloFinanceiro[0].participacoesCompartilhadas = [
        { solicitacao_id: 6, obra_id: 7, empresa_id: 1, valor: 50 },
        { solicitacao_id: 11, obra_id: 8, empresa_id: 1, valor: 50 }
      ];
      s.TituloCompartilhadoOrigem.push(...s.TituloFinanceiro[0].participacoesCompartilhadas.map((p, i) => ({ ...p, id: i + 1, titulo_financeiro_id: 1 })));
      s.Solicitacao.push({ id: 11, status_global: 'TITULO_CADASTRADO', area_responsavel: 'GEO' });
      s.Anexo.push({ id: 1, solicitacao_id: 6, deleted_at: null, caminho_arquivo: 'qa-doc-um', nome_original: 'um.pdf', tipo: 'ANEXO' },
        { id: 2, solicitacao_id: 11, deleted_at: null, caminho_arquivo: 'qa-doc-dois', nome_original: 'dois.pdf', tipo: 'ANEXO' });
    }
    await digital.createBatch(req, { titulo_ids: [1, 2], idempotency_key: 'selecao-lote-a' });
    await digital.createBatch(req, { titulo_ids: [3], idempotency_key: 'selecao-lote-b' });
    const s = getState();
    s.PagamentoAutorizador.push({ id: 1, usuario_id: 31, ativo: true });
    s.WebauthnCredential.push({ id: 1, usuario_id: 31, credential_id: 'qa', public_key: Buffer.from('pk').toString('base64'), counter: 0, ativo: true });
  }
  const options = (ids = [1, 3], actor = dono) => digital.selectionOptions(actor, { item_ids: ids });
  const authorize = (o, ids = [1, 3], actor = dono) => digital.authorizeSelection(actor,
    { item_ids: ids, selecao_id: o.selecao_id, credential: { id: 'qa' } });
  await preparar();
  const beforeTitles = JSON.stringify(getState().TituloFinanceiro.map(t => ({ id: t.id, saldo: t.valor_saldo, baixado: t.valor_baixado })));
  const o = await options();const before = snap();
  assert.equal(webauthnMetrics.generate, 1);assert.equal(webauthnMetrics.verify, 0);
  assert.equal(getState().PagamentoManualFilaItem.length, 0, 'Opcoes nao enviam nada');
  const result = await authorize(o);
  assert.deepEqual(Array.from(result.itens, i => i.id), [1, 3]);assert.equal(result.envio_pendente, false);
  assert.equal(webauthnMetrics.verify, 1, 'Uma verificacao para dois lotes');
  assert.equal(getState().WebauthnCredential[0].counter, 1);
  assert.equal(getState().PagamentoManualFilaItem.length, 2);
  assert.equal(getState().PagamentoAutorizacaoItem[1].status, 'PENDENTE', 'Outro item do mesmo lote nao e enviado');
  assert.equal(getState().PagamentoAutorizacaoLote[0].status, 'AGUARDANDO');
  assert.equal(getState().PagamentoAutorizacaoLote[1].status, 'CONCLUIDO');
  assert.equal(JSON.stringify(getState().TituloFinanceiro.map(t => ({ id: t.id, saldo: t.valor_saldo, baixado: t.valor_baixado }))), beforeTitles);
  const events = getState().PagamentoAutorizacaoEvento.filter(e => e.tipo === 'ITEM_AUTORIZADO');
  assert.equal(events.length, 2);assert(events.every(e => e.dados_json.selecao_id === o.selecao_id));
  assert.equal(new Set(events.map(e => e.dados_json.selecao_hash)).size, 1);
  const apos = snap();await assert.rejects(authorize(o), { statusCode: 409 });assert.equal(snap(), apos);
  assert.notEqual(apos, before);

  async function recusar(configurar, erro, ids = [1, 3]) {
    await preparar();const o = await options(ids);configurar(getState());const antes = snap();
    await assert.rejects(authorize(o, ids), erro);assert.equal(snap(), antes, 'Falha nao muda fila/itens/counter/historico');
  }
  await recusar(s => { s.TituloFinanceiro[0].valor_saldo = 101; }, /mudaram/);
  await recusar(s => { s.TituloFinanceiro[2].status = 'CANCELADO'; }, /nao esta disponivel/);
  await recusar(s => { s.TituloFinanceiro[0].renegociado_por_id = 5; }, /nao esta disponivel/);
  await recusar(s => { s.PagamentoAutorizacaoLote[1].revisao_autorizacao = 1; }, /dossie mudou/);
  await recusar(s => { s.PagamentoAutorizacaoLote[1].dossie_hash = 'alterado'; }, /dossie mudou/);
  await recusar(s => { s.PagamentoAutorizacaoItem[2].status = 'REJEITADO'; }, /ja foram decididos/);
  await recusar(s => { s.PagamentoAutorizador[0].ativo = false; }, /autorizador nominal/);
  await recusar(s => { s.PagamentoAutorizacaoLote[1].criado_por = 31; }, /proprio lote/);
  await recusar(s => { s.PagamentoAutorizador[0].limite_por_lote = 99; }, /limite nominal/);
  await recusar(s => { s.WebauthnCredential[0].ativo = false; }, /Passkey nao reconhecida/);
  await recusar(() => { webauthnMetrics.invalid = true; }, /biometrica invalida/);
  await recusar(() => { h.scope([7]); }, /fora das obras/);
  await recusar(s => { s.PaymentIntent.push({ id: 1, titulo_financeiro_id: 3, status: 'ENVIADO' }); }, /andamento/);
  await recusar(s => { s.PagamentoManualFilaItem.push({ id: 1, titulo_financeiro_id: 3, status: 'PENDENTE' }); }, /ja esta na fila/);
  await recusar(s => { s.Anexo.push({ id: 1, solicitacao_id: 6, deleted_at: null, caminho_arquivo: 'qa-documento-novo' }); }, /documentos mudaram/);
  await preparar();const outro = await options();const antesTroca = snap();
  await assert.rejects(authorize(outro, [1, 2]), /selecao ou um dossie mudou/);assert.equal(snap(), antesTroca);
  await assert.rejects(options([1, 1]), { statusCode: 400 });
  await assert.rejects(options([]), { statusCode: 400 });
  await assert.rejects(options(['1']), { statusCode: 400 });
  await assert.rejects(options(Array.from({ length: 1001 }, (_, i) => i + 1)), { statusCode: 400 });
  await assert.rejects(options([1, 999]), { statusCode: 409 });
  await assert.rejects(options([1, 3], { ...dono, user: { id: 31, grants: [] } }), { statusCode: 403 });
  await assert.rejects(options([1, 3], { ...dono, dev_user_switch: {} }), { statusCode: 403 });
  for (const mode of ['OFF', 'PAUSED']) { env.paymentOwnerApprovalMode = mode;await assert.rejects(options(), { statusCode: mode === 'OFF' ? 404 : 423 }); }

  // Falha no segundo lote depois de criar a primeira fila: rollback global.
  await preparar();const falha = await options();const antesFalha = snap();
  const create = models.PagamentoManualFilaItem.create;
  models.PagamentoManualFilaItem.create = async (data, opts) => {
    if (data.titulo_financeiro_id === 3) throw Error('Falha injetada no segundo lote');
    return create(data, opts);
  };
  try { await assert.rejects(authorize(falha), /segundo lote/); }
  finally { models.PagamentoManualFilaItem.create = create; }
  assert.equal(snap(), antesFalha, 'Nada do primeiro lote sobrevive a falha do segundo');

  // Falha depois do enfileiramento/historico tambem desfaz toda a selecao.
  await preparar();const tardia = await options();const antesCounter = snap();
  const buscarCredential = models.WebauthnCredential.findOne;
  models.WebauthnCredential.findOne = async opts => {
    const credential = await buscarCredential.call(models.WebauthnCredential, opts);
    if (credential) credential.update = async () => { throw Error('Counter indisponivel QA'); };
    return credential;
  };
  try { await assert.rejects(authorize(tardia), /Counter indisponivel/); }
  finally { models.WebauthnCredential.findOne = buscarCredential; }
  assert.equal(snap(), antesCounter, 'Falha tardia nao deixa fila, decisao ou historico parcial');

  await preparar();h.serial();const c = await options();
  const concurrent = await Promise.allSettled([authorize(c), authorize(c)]);
  assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(getState().PagamentoManualFilaItem.length, 2);assert.equal(webauthnMetrics.verify, 1);
  await preparar();h.serial();const a = await options(), b = await options();
  assert.notEqual(a.selecao_id, b.selecao_id, 'Outra aba nao sobrescreve o challenge');
  const competing = await Promise.allSettled([authorize(a), authorize(b)]);
  assert.equal(competing.filter(r => r.status === 'fulfilled').length, 1);assert.equal(getState().PagamentoManualFilaItem.length, 2);
  // Store real com Redis inteiramente em memoria: isolamento por usuario,
  // finalidade/aba, TTL e GETDEL atomico, inclusive indisponibilidade.
  const values = new Map();let redis = {
    set: async (key, value, opts) => { assert.equal(opts.EX, 300);values.set(key, value); },
    getDel: async key => { const value = values.get(key);values.delete(key);return value; }
  };
  const box = { module: { exports: {} }, require(id) {
    if (id === '../config/env') return { env: { redisKeyPrefix: 'qa-selection:' } };
    if (id === './rateLimitStore') return { getRedisClient: async () => redis };
    throw Error('Dependencia inesperada: ' + id);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/webauthnChallengeStore.js'), 'utf8'), box);
  const store = box.module.exports, ctx = { purpose: 'authorize-selection', userId: 31, lotId: 'qa-aba-a' };
  await store.saveChallenge(ctx, { challenge: 'um', selecao_hash: 'hash' });
  await store.saveChallenge({ ...ctx, lotId: 'qa-aba-b' }, { challenge: 'outro' });
  assert.equal(await store.consumeChallengeAtomic({ ...ctx, userId: 32 }), null);
  assert.equal(await store.consumeChallengeAtomic({ ...ctx, purpose: 'decide' }), null);
  const consumes = await Promise.all([store.consumeChallengeAtomic(ctx), store.consumeChallengeAtomic(ctx)]);
  assert.equal(consumes.filter(Boolean).length, 1);
  assert.equal((await store.consumeChallengeAtomic({ ...ctx, lotId: 'qa-aba-b' })).challenge, 'outro');
  redis = null;await assert.rejects(store.consumeChallengeAtomic(ctx), { statusCode: 503 });
  await preparar();getState().PagamentoAutorizacaoItem[2].titulo_financeiro_id = 1;
  await assert.rejects(options(), /mais de um ciclo/);
  await preparar();getState().PagamentoAutorizador[0].limite_por_lote = 100;
  await options([1, 3]); // Limite por lote, nao soma indevida entre lotes.
  await assert.rejects(options([1, 2]), /limite nominal/);
  await preparar();h.scope([7]);
  const shared = getState();shared.TituloFinanceiro[0].compartilhamento_id = 1;
  shared.TituloCompartilhadoOrigem.push({ id: 1, titulo_financeiro_id: 1, obra_id: 7 }, { id: 2, titulo_financeiro_id: 1, obra_id: 8 });
  await assert.rejects(options([1]), /todas as obras/);
  await preparar(true);const docsCompartilhados = await options();
  await authorize(docsCompartilhados);
  assert.equal(getState().PagamentoManualFilaItem.length, 2, 'Compartilhado confere anexos de todas as origens, sem duplicar o titulo');
  await preparar(true);const docAlterado = await options();getState().Anexo[1].caminho_arquivo = 'qa-doc-alterado';
  const antesDoc = snap();await assert.rejects(authorize(docAlterado), /documentos mudaram/);assert.equal(snap(), antesDoc);
  // As novas rotas continuam atras da autenticacao global e do rate limit.
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  const selectionRoute = routes.indexOf("router.post('/financeiro/autorizacoes-pagamento/painel/selecao/autenticacao/opcoes', criticalRateLimit");
  const authRoute = routes.indexOf('router.use(auth);');
  assert(authRoute >= 0 && selectionRoute > authRoute);
  assert(routes.includes("router.post('/financeiro/autorizacoes-pagamento/painel/selecao/autorizar', criticalRateLimit, PagamentoAutorizacaoController.authorizeSelection)"));
  console.log('OK selecao unica: uma passkey/dois lotes, somente selecionados, historico/counter, ACL/escopo/material/revisao/limite, falha tardia rollback global, replay e concorrencia sem fila duplicada. Sem DB/Redis/rede reais.');
};
if (require.main === module) require('./validarAnaliseProprietario');
