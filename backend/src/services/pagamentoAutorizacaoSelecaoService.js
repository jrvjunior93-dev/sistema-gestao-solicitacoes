const crypto = require('crypto');
const { Op } = require('sequelize');

const falhar = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };
const MAX_ITENS = 1000;
function normalizar(payload, confirmar = false) {
  const permitidos = confirmar ? ['item_ids', 'selecao_id', 'credential'] : ['item_ids'];
  if (!payload || Array.isArray(payload) || typeof payload !== 'object' || Object.keys(payload).some(k => !permitidos.includes(k))) falhar(400, 'Selecao de autorizacao invalida.');
  const ids = payload.item_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_ITENS || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) falhar(400, `Selecione entre 1 e ${MAX_ITENS} itens validos, sem repeticao.`);
  if (confirmar && (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(payload.selecao_id || '')
    || !payload.credential || typeof payload.credential.id !== 'string')) falhar(400, 'Confirmacao da selecao invalida.');
  return [...ids].sort((a, b) => a - b);
}

// Sem efeitos na carga do modulo. Adaptador injeta as mesmas regras do fluxo legado.
module.exports = function criarServicoSelecao(d) {
  const { db, env, sha256, recordEvent, roundCurrency } = d;
  async function precondicoes(req) {
    d.assertFeatureAvailable(); d.assertNoDevSwitch(req); d.assertWebauthnConfig();
    return d.assertActiveAuthorizer(req.user);
  }
  async function conferir(req, ids, authorizer, transaction) {
    const opts = transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {};
    // Descobrir apenas IDs antes dos locks, depois reler tudo sob bloqueio.
    const candidatos = await db.PagamentoAutorizacaoItem.findAll({ where: { id: { [Op.in]: ids } },
      attributes: ['id', 'lote_id', 'titulo_financeiro_id'], transaction });
    if (candidatos.length !== ids.length) falhar(409, 'Um ou mais itens nao estao disponiveis. Atualize a selecao.');
    const tituloIds = candidatos.map(i => Number(i.titulo_financeiro_id)).sort((a, b) => a - b);
    if (new Set(tituloIds).size !== ids.length) falhar(409, 'A selecao contem mais de um ciclo do mesmo titulo.');
    const titulos = await db.TituloFinanceiro.findAll({ where: { id: { [Op.in]: tituloIds } }, ...opts, order: [['id', 'ASC']] });
    if (titulos.length !== ids.length) falhar(409, 'Um ou mais titulos nao estao disponiveis. Atualize a selecao.');
    const scope = await d.getFinanceiroObraScopeIds(req.user);
    for (const title of titulos) {
      if (title.compartilhamento_id) await d.assertEscopoCompartilhado(req, title, transaction);
      else if (scope !== null && !scope.includes(Number(title.obra_id))) falhar(403, 'A selecao contem titulo fora das obras do seu acesso.');
      if (title.deleted_at || title.renegociado_por_id || title.tipo !== 'PAGAR' || !['ABERTO', 'PARCIAL'].includes(title.status)
        || roundCurrency(title.valor_saldo) <= 0) falhar(409, `O titulo ${title.codigo || title.id} nao esta disponivel para autorizar.`);
    }
    const naFila = await db.PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: { [Op.in]: tituloIds },
      status: { [Op.in]: ['PENDENTE', 'EM_EDICAO', 'NAO_PAGO', 'DIVERGENTE'] } }, transaction, attributes: ['id'] });
    if (naFila.length) falhar(409, 'Um dos titulos ja esta na fila. Atualize a selecao antes de autorizar.');
    const loteIds = [...new Set(candidatos.map(i => Number(i.lote_id)))].sort((a, b) => a - b);
    const lotes = await db.PagamentoAutorizacaoLote.findAll({ where: { id: { [Op.in]: loteIds } }, ...opts, order: [['id', 'ASC']] });
    if (lotes.length !== loteIds.length || lotes.some(l => l.status !== 'AGUARDANDO')) falhar(409, 'Um ou mais lotes mudaram. Atualize a selecao.');
    if (lotes.some(l => Number(l.criado_por) === Number(req.user.id))) falhar(403, 'O preparador nao pode autorizar o proprio lote.');
    const itens = await db.PagamentoAutorizacaoItem.findAll({ where: { id: { [Op.in]: ids } }, ...opts, order: [['id', 'ASC']] });
    if (itens.length !== ids.length || itens.some(i => i.status !== 'PENDENTE' || !loteIds.includes(Number(i.lote_id))
      || !candidatos.some(c => Number(c.id) === Number(i.id) && Number(c.lote_id) === Number(i.lote_id)
        && Number(c.titulo_financeiro_id) === Number(i.titulo_financeiro_id)))) falhar(409, 'Um ou mais itens ja foram decididos ou alterados.');
    for (const lot of lotes) {
      const selecionados = itens.filter(i => Number(i.lote_id) === Number(lot.id));
      if (selecionados.length > 200) falhar(400, 'O lote excede o limite de 200 itens por confirmacao.');
      const total = selecionados.reduce((sum, i) => sum + Math.round(Number(i.valor_snapshot) * 100), 0);
      if (authorizer.limite_por_lote && total > Math.round(Number(authorizer.limite_por_lote) * 100)) falhar(403, 'O valor autorizado excede o limite nominal deste autorizador.');
    }
    const vinculo = { usuario_id: Number(req.user.id), item_ids: ids,
      lotes: lotes.map(l => ({ id: Number(l.id), dossie_hash: l.dossie_hash, revisao: Number(l.revisao_autorizacao || 0) })),
      itens: itens.map(i => ({ id: Number(i.id), lote_id: Number(i.lote_id), titulo_id: Number(i.titulo_financeiro_id),
        snapshot_hash: i.snapshot_hash, valor: roundCurrency(i.valor_snapshot) })) };
    return { itens, lotes, vinculo };
  }
  async function opcoes(req, payload) {
    const authorizer = await precondicoes(req), ids = normalizar(payload);
    const { vinculo } = await conferir(req, ids, authorizer);
    const credentials = await db.WebauthnCredential.findAll({ where: { usuario_id: req.user.id, ativo: true } });
    if (!credentials.length) falhar(409, 'Cadastre uma passkey antes de autorizar pagamentos.');
    const lib = await d.webauthnLib();
    const options = await lib.generateAuthenticationOptions({ rpID: env.webauthnRpId, userVerification: 'required',
      allowCredentials: credentials.map(c => ({ id: c.credential_id, transports: c.transports || undefined })) });
    const selecaoId = crypto.randomUUID();
    await d.saveChallenge({ purpose: 'authorize-selection', userId: req.user.id, lotId: selecaoId },
      { challenge: options.challenge, selecao_hash: sha256(vinculo) });
    return { selecao_id: selecaoId, publicKey: options };
  }
  async function conferirMaterial(req, item, transaction) {
    const title = await db.TituloFinanceiro.findByPk(item.titulo_financeiro_id, { include: d.titleInclude(), transaction, lock: transaction.LOCK.UPDATE });
    const docs = await db.PagamentoAutorizacaoDocumento.findAll({ where: { item_id: item.id },
      attributes: ['origem_id', 'nome', 'origem_tipo', 'arquivo_hash'], transaction, order: [['origem_id', 'ASC']] });
    const solicitacaoIds = [...new Set([Number(title?.solicitacao_id), ...(title?.participacoesCompartilhadas || [])
      .map(p => Number(p.solicitacao_id))].filter(Boolean))];
    const anexos = solicitacaoIds.length ? await db.Anexo.findAll({ where: { solicitacao_id: { [Op.in]: solicitacaoIds }, deleted_at: null },
      attributes: ['id', 'tipo', 'nome_original', 'caminho_arquivo'], transaction, order: [['id', 'ASC']] }) : [];
    const anterior = { snapshot: item.snapshot_json, documents: docs.map(doc => ({ origem_id: Number(doc.origem_id),
      nome: doc.nome, origem_tipo: doc.origem_tipo, arquivo_hash: doc.arquivo_hash })) };
    const atual = { snapshot: title ? d.buildSnapshot(title) : null, documents: anexos.filter(a => a.caminho_arquivo).map(a => ({
      origem_id: Number(a.id), nome: a.nome_original || `Documento ${a.id}`, origem_tipo: a.tipo || 'ANEXO', arquivo_hash: sha256({ source_url: a.caminho_arquivo }) })) };
    const bloqueio = title?.bloqueio_pagamento_proprietario;
    if (!title || (bloqueio && Number(item.id) <= Number(bloqueio.item_id))
      || roundCurrency(atual.snapshot.valor_total ?? title.valor_saldo) !== roundCurrency(item.valor_snapshot)
      || sha256(anterior) !== sha256(atual)) falhar(409, `O titulo ${title?.codigo || item.titulo_financeiro_id} ou seus documentos mudaram. Atualize a selecao; nenhum titulo foi enviado.`);
    return { item, title, bloqueio };
  }
  async function autorizar(req, payload) {
    await precondicoes(req);const ids = normalizar(payload, true);
    const stored = await d.consumeChallengeAtomic({ purpose: 'authorize-selection', userId: req.user.id, lotId: payload.selecao_id });
    if (!stored?.challenge || !stored.selecao_hash) falhar(409, 'Confirmacao expirada ou ja utilizada. Atualize antes de tentar novamente.');
    return db.sequelize.transaction(async transaction => {
      const credential = await db.WebauthnCredential.findOne({ where: { usuario_id: req.user.id, credential_id: payload.credential.id, ativo: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!credential) falhar(403, 'Passkey nao reconhecida para este autorizador.');
      await precondicoes(req);
      const authorizer = await db.PagamentoAutorizador.findOne({ where: { usuario_id: req.user.id, ativo: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!authorizer) falhar(403, 'Usuario nao cadastrado como autorizador nominal de pagamentos.');
      const dados = await conferir(req, ids, authorizer, transaction);
      if (sha256(dados.vinculo) !== stored.selecao_hash) falhar(409, 'A selecao ou um dossie mudou. Recarregue antes de autorizar.');
      let verification;
      try {
        const lib = await d.webauthnLib();
        verification = await lib.verifyAuthenticationResponse({ response: payload.credential, expectedChallenge: stored.challenge,
          expectedOrigin: env.webauthnOrigins, expectedRPID: env.webauthnRpId,
          credential: d.credentialForLibrary(credential), requireUserVerification: true });
      } catch (e) { d.logWebauthnVerificationFailure({ req, lotId: null, error: e });
        falhar(403, 'Nao foi possivel validar a passkey neste dispositivo. Tente novamente.'); }
      if (!verification.verified) falhar(403, 'Confirmacao biometrica invalida.');
      // Conferir todo o material antes da primeira mutacao financeira.
      const conferidos = [];
      for (const item of dados.itens) conferidos.push(await conferirMaterial(req, item, transaction));
      for (const { item, title, bloqueio } of conferidos) {
        if (bloqueio) {
          await title.update({ bloqueio_pagamento_proprietario: null }, { transaction });
          await recordEvent({ loteId: item.lote_id, itemId: item.id, userId: req.user.id, type: 'SALDO_REAUTORIZADO',
            data: { titulo_id: title.id, bloqueio_anterior: bloqueio, saldo: Number(title.valor_saldo) }, transaction });
        }
        await item.update({ status: 'AUTORIZADO', motivo_decisao: null, decidido_em: new Date() }, { transaction });
        await recordEvent({ loteId: item.lote_id, itemId: item.id, userId: req.user.id, type: 'ITEM_AUTORIZADO',
          data: { snapshot_hash: item.snapshot_hash, selecao_id: payload.selecao_id, selecao_hash: stored.selecao_hash }, transaction });
      }
      for (const lot of dados.lotes) {
        await lot.update({ decidido_por: req.user.id, decidido_em: new Date() }, { transaction });
        const tituloIds = dados.itens.filter(i => Number(i.lote_id) === Number(lot.id)).map(i => Number(i.titulo_financeiro_id));
        await d.enfileirarTitulosAutorizados(req, { titulo_ids: tituloIds,
          idempotency_key: `owner-selection-${payload.selecao_id}-${lot.id}` }, Number(lot.id), Number(lot.revisao_autorizacao || 0), transaction);
      }
      const atuais = await db.PagamentoAutorizacaoItem.findAll({ where: { id: { [Op.in]: ids } }, transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
      if (atuais.length !== ids.length || atuais.some(i => i.status !== 'ENFILEIRADO' || !i.fila_item_id)) falhar(409, 'O envio da selecao nao foi confirmado. Nenhum titulo foi enviado por esta tentativa.');
      await credential.update({ counter: Number(verification.authenticationInfo.newCounter || credential.counter), ultimo_uso_em: new Date() }, { transaction });
      return { selecao_id: payload.selecao_id, itens: atuais.map(i => ({ id: Number(i.id), lote_id: Number(i.lote_id),
        titulo_financeiro_id: Number(i.titulo_financeiro_id), status: i.status, fila_item_id: Number(i.fila_item_id) })), envio_pendente: false };
    });
  }
  return { opcoes, autorizar };
};
