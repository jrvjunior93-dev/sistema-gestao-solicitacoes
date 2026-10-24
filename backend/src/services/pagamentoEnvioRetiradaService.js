'use strict';
const { Op } = require('sequelize');
const { createHash } = require('node:crypto');
const erro = (mensagem, statusCode = 409) => Object.assign(new Error(mensagem), { statusCode });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const FILA_ATIVA = ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE', 'EM_EDICAO'];
const ITEM_ATIVO = ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'];
const PERMISSOES = { AUTORIZACAO: 'financeiro.autorizacoes_pagamento.retirar', FILA: 'financeiro.fila_pagamentos.retirar' };
const cents = value => Math.round(Number(value || 0) * 100);
function normalizar(raw, confirmar = false) {
  const chaves = confirmar ? ['itens', 'motivo', 'referencia', 'idempotency_key'] : ['itens'];
  if (!raw || Array.isArray(raw) || typeof raw !== 'object' || Object.keys(raw).some(k => !chaves.includes(k))
    || !Array.isArray(raw.itens) || !raw.itens.length || raw.itens.length > 50) throw erro('Selecione entre 1 e 50 envios.', 400);
  const itens = raw.itens.map(i => {
    if (!i || typeof i !== 'object' || Array.isArray(i) || Object.keys(i).some(k => !['titulo_id', 'origem', 'referencia_id'].includes(k)) || !Object.hasOwn(PERMISSOES, i.origem)
      || ![i.titulo_id, i.referencia_id].every(n => Number.isSafeInteger(n) && n > 0)) throw erro('Referencia de envio invalida.', 400);
    return { titulo_id: i.titulo_id, origem: i.origem, referencia_id: i.referencia_id };
  }).sort((a, b) => a.titulo_id - b.titulo_id);
  if (new Set(itens.map(i => i.titulo_id)).size !== itens.length) throw erro('Selecione apenas um envio de cada titulo.', 400);
  if (!confirmar) return { itens };
  if (typeof raw.motivo !== 'string' || !raw.motivo.trim() || raw.motivo.trim().length > 500
    || !/^[a-f0-9]{64}$/.test(raw.referencia || '') || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw.idempotency_key || '')) throw erro('Confira a retirada e informe o motivo (ate 500 caracteres).', 400);
  return { itens, motivo: raw.motivo.trim(), referencia: raw.referencia, idempotency_key: raw.idempotency_key.toLowerCase() };
}
// Adaptador injetavel: QA executa o fluxo real com banco/transacoes isolados.
function criarServico(d) {
  const { db, auth, env, recordEvent, assertEscopoCompartilhado, assertSemRevisaoDp } = d;
  async function permissao(req, itens) {
    if (!req.user?.id) throw erro('Sessao obrigatoria.', 401);
    for (const origem of new Set(itens.map(i => i.origem))) {
      if (origem === 'AUTORIZACAO' && ['OFF', 'PAUSED'].includes(env.paymentOwnerApprovalMode)) throw erro('Autorizacoes indisponiveis para retirada.', 423);
      if (!await auth.userHasNominalAreaPermission(req.user, [PERMISSOES[origem]])) throw erro('Sem permissao nominal para retirar estes envios.', 403);
    }
  }
  async function titulos(req, itens, transaction, bloquear) {
    const options = { transaction, ...(bloquear ? { lock: transaction.LOCK.UPDATE } : {}) };
    const rows = await db.TituloFinanceiro.findAll({ where: { id: { [Op.in]: itens.map(i => i.titulo_id) } }, order: [['id', 'ASC']], ...options });
    if (rows.length !== itens.length) throw erro('Um ou mais titulos nao estao disponiveis.');
    const scope = await auth.getFinanceiroObraScopeIds(req.user);
    for (const t of rows) {
      if (t.compartilhamento_id) await assertEscopoCompartilhado(req, t, transaction);
      else if (scope !== null && !scope.includes(Number(t.obra_id))) throw erro('Envio fora das obras do seu acesso.', 403);
    }
    const rateios = await db.TituloFinanceiroRateio.findAll({ where: { titulo_financeiro_id: { [Op.in]: itens.map(i => i.titulo_id) } }, attributes: ['obra_id'], transaction });
    if (scope !== null && rateios.some(r => !scope.includes(Number(r.obra_id)))) throw erro('O rateio possui obra fora do seu acesso.', 403);
    // A mesma leitura financeira usada pelo detalhe preserva as regras para
    // renegociacoes/compartilhamento e outras origens; nao cria autoria na SOL.
    for (const t of rows) await d.assertTituloAccess(req, t.id, transaction);
    return rows;
  }
  async function conferir(req, itens, titles, transaction, bloquear) {
    const options = { transaction, ...(bloquear ? { lock: transaction.LOCK.UPDATE } : {}) };
    const ids = itens.map(i => i.titulo_id);
    // Ordem canonica: titulos -> lotes -> itens -> fila -> pagamentos bancarios.
    const refs = await db.PagamentoAutorizacaoItem.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids } }, attributes: ['id', 'lote_id', 'titulo_financeiro_id'], order: [['id', 'ASC']], transaction, limit: 2001 });
    if (refs.length > 2000) throw erro('Historico extenso: reduza a selecao para conferir os envios.');
    const ultimos = new Map(refs.map(i => [Number(i.titulo_financeiro_id), i]));
    const lotIds = [...new Set([...ultimos.values()].map(i => Number(i.lote_id)))].sort((a, b) => a - b);
    const lots = lotIds.length ? await db.PagamentoAutorizacaoLote.findAll({ where: { id: { [Op.in]: lotIds } }, order: [['id', 'ASC']], ...options }) : [];
    const items = lotIds.length ? await db.PagamentoAutorizacaoItem.findAll({ where: { lote_id: { [Op.in]: lotIds } }, order: [['id', 'ASC']], ...options }) : [];
    const filas = await db.PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids } }, order: [['id', 'ASC']], ...options });
    const bancos = await db.PaymentIntent.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids },
      status: { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO', 'BAIXADO'] } }, ...options });
    const conferidos = [];
    for (const envio of itens) {
      const title = titles.find(t => Number(t.id) === envio.titulo_id);
      if (title.tipo !== 'PAGAR' || !['ABERTO', 'PARCIAL'].includes(title.status) || title.deleted_at || title.renegociado_por_id
        || !Number.isFinite(Number(title.valor_saldo)) || cents(title.valor_saldo) <= 0 || title.bloqueio_pagamento_proprietario) throw erro('Titulo sem saldo livre para retirada. Atualize a lista.');
      assertSemRevisaoDp(title);
      if (bancos.some(b => Number(b.titulo_financeiro_id) === envio.titulo_id)) throw erro('Pagamento bancario em andamento. Finalize esse fluxo antes de retirar o envio.');
      const historico = items.filter(i => Number(i.titulo_financeiro_id) === envio.titulo_id);
      const item = historico.at(-1) || null;
      const fila = filas.filter(f => Number(f.titulo_financeiro_id) === envio.titulo_id).at(-1) || null;
      const ativas = filas.filter(f => Number(f.titulo_financeiro_id) === envio.titulo_id && FILA_ATIVA.includes(f.status));
      if (ativas.length > 1 || ativas.some(f => f.status === 'EM_EDICAO')) throw erro('Fila em revisao ou com envios concomitantes. Atualize antes de retirar.');
      if (envio.origem === 'AUTORIZACAO') {
        if (!item || Number(item.id) !== envio.referencia_id || !['PENDENTE', 'AUTORIZADO'].includes(item.status) || ativas.length) throw erro('A aprovacao selecionada mudou ou ja foi enviada para a fila. Atualize a selecao.');
      } else {
        if (!fila || Number(fila.id) !== envio.referencia_id || !ativas.some(f => Number(f.id) === envio.referencia_id)) throw erro('O envio selecionado nao esta mais ativo na fila.');
        if (item && ['PENDENTE', 'AUTORIZADO'].includes(item.status) && !item.fila_item_id) throw erro('Existe uma nova aprovacao para este titulo. Confira o ciclo atual antes de retirar.');
      }
      const lot = item ? lots.find(l => Number(l.id) === Number(item.lote_id)) : null;
      if (item && !lot) throw erro('Lote da aprovacao indisponivel.');
      const atual = { titulo_id: envio.titulo_id, origem: envio.origem, referencia_id: envio.referencia_id,
        codigo: title.codigo, saldo: cents(title.valor_saldo) / 100, pago: cents(title.valor_baixado) / 100,
        versao: hash([title.id, title.status, String(title.updatedAt), cents(title.valor_saldo), cents(title.valor_baixado),
          item && [item.id, item.status, item.snapshot_hash, item.fila_item_id], lot && [lot.id, lot.revisao_autorizacao, lot.dossie_hash],
          fila && [fila.id, fila.status, String(fila.updatedAt), fila.movimento_financeiro_id]]) };
      conferidos.push({ title, item, lot, fila: envio.origem === 'FILA' ? fila : null, atual });
    }
    return { conferidos, lots, items };
  }
  const dto = c => ({ itens: c.conferidos.map(i => i.atual), referencia: hash(c.conferidos.map(i => i.atual)),
    saldo_total: c.conferidos.reduce((s, i) => s + cents(i.atual.saldo), 0) / 100 });
  async function preview(req, raw) {
    const body = normalizar(raw); await permissao(req, body.itens);
    return db.sequelize.transaction(async transaction => dto(await conferir(req, body.itens, await titulos(req, body.itens, transaction, false), transaction, false)));
  }
  async function confirmar(req, raw) {
    const body = normalizar(raw, true); await permissao(req, body.itens);
    const pedido = hash(body);
    try { return await db.sequelize.transaction(async transaction => {
      const titles = await titulos(req, body.itens, transaction, true);
      const recibo = await db.PagamentoEnvioRetirada.findOne({ where: { usuario_id: req.user.id, chave: body.idempotency_key }, transaction, lock: transaction.LOCK.UPDATE });
      if (recibo) {
        if (recibo.pedido_hash !== pedido) throw erro('Chave de retirada ja usada por outra operacao.');
        return { ...recibo.resultado, idempotente: true };
      }
      const contexto = await conferir(req, body.itens, titles, transaction, true);
      if (dto(contexto).referencia !== body.referencia) throw erro('Envio, aprovacao ou saldo alterado. Confira novamente antes de retirar.');
      const registro = await db.PagamentoEnvioRetirada.create({ usuario_id: req.user.id, chave: body.idempotency_key, pedido_hash: pedido, resultado: {} }, { transaction });
      const quando = new Date();
      for (const c of contexto.conferidos) {
        if (c.fila) await c.fila.update({ status: 'RESOLVIDO', resolvido_por: req.user.id, resolvido_em: quando,
          motivo: `${c.fila.motivo ? c.fila.motivo + '\n' : ''}Envio retirado: ${body.motivo}`,
          instrumento_pagamento_json: { ...c.fila.instrumento_pagamento_json,
            retirada_envio: { id: registro.id, usuario_id: req.user.id, motivo: body.motivo, em: quando.toISOString(), saldo: c.atual.saldo, pago: c.atual.pago } }
        }, { transaction });
        if (c.item && ITEM_ATIVO.includes(c.item.status) && (!c.fila || Number(c.item.fila_item_id) === Number(c.fila.id))) {
          c.alterouItem = true;
          const decisaoAnterior = { status: c.item.status, motivo: c.item.motivo_decisao || null, decidido_em: c.item.decidido_em || null };
          // Retirar nao e decidir pelo proprietario: preservar autor/data/motivo
          // da decisao original e registrar a nova operacao no evento separado.
          await c.item.update({ status: 'RETIRADO' }, { transaction });
          await recordEvent({ loteId: c.lot.id, itemId: c.item.id, userId: req.user.id, type: 'ITEM_ENVIO_RETIRADO',
            data: { retirada_id: registro.id, motivo: body.motivo, decisao_anterior: decisaoAnterior, ...c.atual, fila_id: c.fila?.id || null }, transaction });
        }
        await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'PAYMENT_SUBMISSION_WITHDRAWN', recurso_tipo: 'TITULO_FINANCEIRO',
          recurso_id: String(c.title.id), status: 'SUCCESS', descricao: 'Envio retirado; baixas anteriores preservadas',
          metadata: { retirada_id: registro.id, motivo: body.motivo, ...c.atual, dev_user_switch: req.dev_user_switch || null } }, { transaction });
      }
      const alterados = new Set(contexto.conferidos.filter(c => c.alterouItem).map(c => Number(c.lot.id)));
      for (const lot of contexto.lots.filter(l => alterados.has(Number(l.id)))) {
        const itens = contexto.items.filter(i => Number(i.lote_id) === Number(lot.id));
        const status = itens.some(i => i.status === 'PENDENTE') ? 'AGUARDANDO' : itens.some(i => i.status === 'AUTORIZADO') ? 'AUTORIZADO'
          : itens.some(i => i.status === 'ENFILEIRADO') ? 'CONCLUIDO' : itens.every(i => i.status === 'RETIRADO') ? 'CANCELADO' : 'REJEITADO';
        await lot.update({ status, revisao_autorizacao: Number(lot.revisao_autorizacao || 0) + 1 }, { transaction });
      }
      const resultado = { retirados: contexto.conferidos.map(c => ({ titulo_id: c.atual.titulo_id, codigo: c.atual.codigo, origem: c.atual.origem,
        saldo: c.atual.saldo, pago: c.atual.pago })), retirada_id: registro.id };
      await registro.update({ resultado }, { transaction });
      return { ...resultado, idempotente: false };
    }); } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError' || ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(e.original?.code)) throw erro('Outra operacao esta em andamento. Aguarde e tente novamente com a mesma confirmacao.');
      throw e;
    }
  }
  return { preview, confirmar };
}
let instancia;
function servico() {
  return instancia ||= criarServico({ db: require('../models'), auth: require('./authorizationService'), env: require('../config/env').env,
    recordEvent: require('./pagamentoAutorizacaoEventosService').recordEvent,
    assertEscopoCompartilhado: require('./tituloCompartilhadoLeitura').assertEscopo,
    assertSemRevisaoDp: require('./rhPagamentoRevisaoPolicy').assertSemRevisaoDp,
    assertTituloAccess: (req, id, transaction) => require('./tituloFinanceiroService').carregarTituloPorId(req, id, { transaction }) });
}
module.exports = { criarServico, normalizar, PERMISSOES,
  preview: (...args) => servico().preview(...args), confirmar: (...args) => servico().confirmar(...args) };
