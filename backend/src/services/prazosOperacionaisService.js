'use strict';
const { Op, QueryTypes } = require('sequelize');
const db = require('../models');
const dominio = require('./prazosOperacionaisDomain');
const { userHasSetorCapability } = require('./setorCapabilityService');

async function configuracao(transaction) {
  const row = await db.ConfiguracaoSistema.findOne({ where: { chave: dominio.CHAVE }, transaction });
  return dominio.validar(row?.valor ? JSON.parse(row.valor) : dominio.PADRAO);
}
async function salvarConfig(entrada, usuarioId) {
  const regra = dominio.validar(entrada);
  return db.sequelize.transaction(async (transaction) => {
    const row = await db.ConfiguracaoSistema.findOne({ where: { chave: dominio.CHAVE }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw Object.assign(new Error('Aplique a migration de prazos operacionais antes de configurar.'), { statusCode: 409 });
    const atual = JSON.parse(row.valor);
    if (Number(entrada.revisao) !== Number(atual.revisao)) throw Object.assign(new Error('A configuração foi alterada. Recarregue antes de salvar.'), { statusCode: 409 });
    if (regra.ativo && (!atual.ativo || regra.iniciar_em !== atual.iniciar_em) && regra.iniciar_em < dominio.diaBrasil()) {
      throw Object.assign(new Error('A ativação deve começar hoje ou em uma data futura; não haverá cobrança retroativa.'), { statusCode: 400 });
    }
    const novo = { ...regra, revisao: Number(atual.revisao) + 1, alterado_por: usuarioId, alterado_em: new Date().toISOString() };
    await row.update({ valor: JSON.stringify(novo) }, { transaction });
    return novo;
  });
}
async function encerrarItem(itemId, status, usuarioId, motivo, transaction) {
  await db.ObrigacaoOperacional.update({ status, encerrada_em: new Date(), usuario_id: usuarioId, motivo: String(motivo || '').slice(0, 2000) }, {
    where: { tipo: 'ENTREGA_OBRA', referencia_id: itemId, status: 'PENDENTE' }, transaction
  });
}
async function registrarEntrega({ pedido, solicitacaoId, itemId, previsao, versao, usuarioId, feriados = [], transaction, regra: regraRecebida }) {
  const regra = regraRecebida || await configuracao(transaction), agora = new Date();
  // Somente confirmação/reprogramação após ativação: consultas nunca criam obrigações.
  if (!regra.ativo || dominio.diaBrasil(agora) < regra.iniciar_em) return;
  await encerrarItem(itemId, 'CANCELADA', usuarioId, 'Previsão substituída por novo ciclo de entrega.', transaction);
  await db.ObrigacaoOperacional.create({ chave: `ENTREGA_OBRA:${itemId}:${versao}`, tipo: 'ENTREGA_OBRA', setor: 'OBRA',
    obra_id: pedido.obra_id, pedido_id: pedido.id, solicitacao_id: solicitacaoId, referencia_id: itemId,
    ...dominio.calcular(previsao, regra, feriados, agora), regra_snapshot: { ...regra, feriados }, status: 'PENDENTE', usuario_id: usuarioId
  }, { transaction });
}
async function pendencias({ obraIds, solicitacaoIds, transaction, regra } = {}) {
  regra ||= await configuracao(transaction);
  if (!regra.ativo || dominio.diaBrasil() < regra.iniciar_em || (obraIds && !obraIds.length) || (solicitacaoIds && !solicitacaoIds.length)) return [];
  const filtros = [], replacements = {};
  if (obraIds) { filtros.push('o.obra_id IN (:obras)'); replacements.obras = obraIds; }
  if (solicitacaoIds) { filtros.push('o.solicitacao_id IN (:solicitacoes)'); replacements.solicitacoes = solicitacaoIds; }
  // Deriva a validade atual sem escrever em GET: cancelamentos/remanejamentos não deixam bloqueios fantasma.
  return db.sequelize.query(`SELECT o.*, w.nome AS obra_nome, s.codigo AS solicitacao_codigo, i.descricao AS item_descricao
    FROM obrigacoes_operacionais o JOIN pedido_compra_entregas e ON e.pedido_compra_item_id=o.referencia_id
    JOIN pedido_compra_itens i ON i.id=o.referencia_id JOIN pedido_compras p ON p.id=i.pedido_compra_id
    JOIN obras w ON w.id=o.obra_id LEFT JOIN solicitacoes s ON s.id=o.solicitacao_id
    WHERE o.tipo='ENTREGA_OBRA' AND o.setor='OBRA' AND o.status='PENDENTE' AND e.estado='OBRA'
      AND p.status<>'CANCELADO' AND i.removido=0 AND p.id=o.pedido_id AND p.obra_id=o.obra_id
      AND i.quantidade_pedido-COALESCE(i.quantidade_cancelada,0) >
        COALESCE((SELECT SUM(r.quantidade) FROM pedido_compra_item_recebimentos r WHERE r.pedido_compra_item_id=i.id),0)
      ${filtros.map((f) => `AND ${f}`).join(' ')} ORDER BY o.limite_em, o.id`, { replacements, type: QueryTypes.SELECT, transaction });
}
async function estado(user) {
  const agora = new Date();
  if (String(user?.perfil).toUpperCase() === 'SUPERADMIN' || !await userHasSetorCapability(user, 'eh_setor_obra')) {
    return { ativo: false, modo: null, servidor_agora: agora.toISOString(), obras: [] };
  }
  const regra = await configuracao();
  const base = { ativo: regra.ativo, modo: regra.modo, servidor_agora: agora.toISOString(), obras: [] };
  if (!regra.ativo) return base;
  const vinculos = await db.UsuarioObra.findAll({ where: { user_id: user.id }, attributes: ['obra_id'], raw: true });
  const ids = vinculos.map((v) => Number(v.obra_id));
  const linhas = await pendencias({ obraIds: ids, regra });
  const liberacoes = ids.length ? await db.ObrigacaoOperacionalLiberacao.findAll({ where: { obra_id: { [Op.in]: ids }, setor: 'OBRA', ate: { [Op.gt]: agora } }, raw: true }) : [];
  for (const id of [...new Set(linhas.map((o) => Number(o.obra_id)))]) {
    const itens = linhas.filter((o) => Number(o.obra_id) === id), resumo = dominio.resumir(itens, regra, agora);
    const liberacao = liberacoes.filter((l) => Number(l.obra_id) === id).sort((a, b) => +new Date(b.ate) - +new Date(a.ate))[0];
    base.obras.push({ id, nome: itens[0].obra_nome, ...resumo,
      bloqueada: regra.modo === 'BLOQUEAR' && resumo.vencidas > 0 && !liberacao,
      liberada_ate: liberacao ? new Date(liberacao.ate).toISOString() : null,
      pendencias: itens.map((o) => ({ id: o.id, solicitacao_id: o.solicitacao_id, codigo: o.solicitacao_codigo,
        pedido_id: o.pedido_id, item: o.item_descricao, limite_em: new Date(o.limite_em).toISOString() })) });
  }
  return base;
}
async function liberar(entrada, usuarioId) {
  const obraId = Number(entrada.obra_id), ate = new Date(Math.floor(Date.parse(entrada.ate) / 1000) * 1000), agora = new Date();
  const motivo = String(entrada.motivo || '').trim(), chave = String(entrada.idempotency_key || '');
  if (!Number.isSafeInteger(obraId) || obraId <= 0 || !motivo || motivo.length > 2000
      || !/^[A-Za-z0-9_-]{8,100}$/.test(chave) || !Number.isFinite(+ate) || ate <= agora || +ate - +agora > 7 * 86400000) {
    throw Object.assign(new Error('Informe obra, motivo, chave da operação e validade futura de até 7 dias.'), { statusCode: 400 });
  }
  return db.sequelize.transaction(async (transaction) => {
    const obra = await db.Obra.findByPk(obraId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!obra) throw Object.assign(new Error('Obra não encontrada.'), { statusCode: 404 });
    const existente = await db.ObrigacaoOperacionalLiberacao.findOne({ where: { chave }, transaction });
    if (existente) {
      if (Number(existente.obra_id) !== obraId || Number(existente.usuario_id) !== Number(usuarioId) || +new Date(existente.ate) !== +ate || existente.motivo !== motivo) {
        throw Object.assign(new Error('Chave já utilizada para outra liberação.'), { statusCode: 409 });
      }
      return existente;
    }
    return db.ObrigacaoOperacionalLiberacao.create({ chave, obra_id: obraId, setor: 'OBRA', ate, usuario_id: usuarioId, motivo }, { transaction });
  });
}
module.exports = { configuracao, salvarConfig, registrarEntrega, encerrarItem, pendencias, estado, liberar };
