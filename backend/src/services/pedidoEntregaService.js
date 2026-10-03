'use strict';

const crypto = require('node:crypto');
const { Op, QueryTypes } = require('sequelize');
const { sequelize, PedidoCompra, PedidoCompraItem, PedidoCompraItemRecebimento,
  PedidoCompraEntrega, PedidoCompraEntregaOperacao, SolicitacaoCompra, Historico, ConfiguracaoSistema } = require('../models');
const { arredondar, hojeBrasil, dataValida, adicionarDiasUteis, situacaoEntrega } = require('./pedidoEntregaDomain');

function falhar(mensagem, statusCode = 409) { throw Object.assign(new Error(mensagem), { statusCode }); }
const sqlBase = `FROM pedido_compra_entregas e
  JOIN pedido_compra_itens ei ON ei.id = e.pedido_compra_item_id
  JOIN pedido_compras ep ON ep.id = e.pedido_compra_id
  JOIN solicitacao_compras ec ON ec.id = ep.solicitacao_compra_id`;
const sqlAtivo = "ep.status <> 'CANCELADO' AND ei.removido = 0";
function condicaoPendencia(setor, hoje = hojeBrasil()) {
  // Data gerada internamente, nunca interpolar entrada HTTP nesta expressao.
  if (setor === 'COMPRAS') return "e.estado IN ('COMPRAS', 'DIVERGENCIA')";
  return `e.estado = 'OBRA' AND e.previsao < '${hoje}' AND
    ei.quantidade_pedido - COALESCE(ei.quantidade_cancelada,0) >
    COALESCE((SELECT SUM(er.quantidade) FROM pedido_compra_item_recebimentos er WHERE er.pedido_compra_item_id=ei.id),0)`;
}
function sqlPendenciaEntrega(setor, alias = 'Solicitacao') {
  return `EXISTS (SELECT 1 ${sqlBase} WHERE ec.solicitacao_principal_id = ${alias}.id AND ${sqlAtivo} AND (${condicaoPendencia(setor)}))`;
}
function sqlOrdemEntrega(setor, alias = 'Solicitacao') {
  return `(SELECT MAX(e.updatedAt) ${sqlBase} WHERE ec.solicitacao_principal_id = ${alias}.id AND ${sqlAtivo} AND (${condicaoPendencia(setor)}))`;
}
async function pendenciasEntrega({ obraId, solicitacaoIds, setor = 'OBRA', transaction } = {}) {
  const filtros = [];
  const replacements = {};
  if (obraId) { filtros.push('ep.obra_id = :obraId'); replacements.obraId = obraId; }
  if (solicitacaoIds) {
    if (!solicitacaoIds.length) return [];
    filtros.push('ec.solicitacao_principal_id IN (:ids)'); replacements.ids = solicitacaoIds;
  }
  return sequelize.query(`SELECT ec.solicitacao_principal_id AS solicitacao_id,
    ep.id AS pedido_id, ep.obra_id, ei.id AS item_id, ei.descricao, e.estado,
    DATE_FORMAT(e.previsao, '%Y-%m-%d') AS previsao,
    DATE_FORMAT(e.prazo_compras, '%Y-%m-%d') AS prazo_compras, e.updatedAt,
    (e.estado = 'COMPRAS' AND e.prazo_compras < :hoje) AS vencida
    ${sqlBase} WHERE ${sqlAtivo} AND (${condicaoPendencia(setor)})
    ${filtros.map((f) => `AND ${f}`).join(' ')} ORDER BY e.updatedAt DESC`, {
    type: QueryTypes.SELECT, replacements: { ...replacements, hoje: hojeBrasil() }, transaction
  });
}
async function assertObraPodeCriarCompra(obraId, transaction) {
  const pendencias = await pendenciasEntrega({ obraId, transaction });
  if (pendencias.length) falhar(`Informe a entrega vencida do pedido #${pendencias[0].pedido_id} (${pendencias.length} item(ns) pendente(s) nesta obra) antes de criar Solicitação de Compra ou Compra Direta.`);
}
async function assertComprasPodeGerarPedido(transaction) {
  const pendencias = await pendenciasEntrega({ setor: 'COMPRAS', transaction });
  const vencida = pendencias.find((p) => Number(p.vencida));
  if (vencida) falhar(`Compras precisa informar nova previsão do pedido #${vencida.pedido_id}. O prazo de 2 dias úteis terminou em ${vencida.prazo_compras}. Cotações continuam liberadas; novos pedidos estão bloqueados.`);
}
async function calendarioEntrega(transaction) {
  const config = await ConfiguracaoSistema.findOne({ where: { chave: 'COMPRAS_ENTREGA_FERIADOS' }, transaction });
  const valor = config?.valor;
  const datas = typeof valor === 'string' ? JSON.parse(valor || '[]') : valor || [];
  if (!Array.isArray(datas) || datas.some((d) => !dataValida(d))) falhar('Calendário de feriados de Compras inválido. Peça a revisão ao administrador.', 500);
  return datas;
}
async function resumirPedidos(pedidos, recebimentos = []) {
  const ids = pedidos.map((p) => p.id);
  const controles = ids.length ? await PedidoCompraEntrega.findAll({ where: { pedido_compra_id: { [Op.in]: ids } }, raw: true }) : [];
  const mapa = new Map(controles.map((c) => [Number(c.pedido_compra_item_id), c]));
  const somas = new Map();
  recebimentos.forEach((r) => somas.set(Number(r.pedido_compra_item_id), arredondar((somas.get(Number(r.pedido_compra_item_id)) || 0) + Number(r.quantidade))));
  return new Map(pedidos.flatMap((p) => p.itens.map((i) => [Number(i.id), situacaoEntrega(i, somas.get(Number(i.id)) || 0, mapa.get(Number(i.id)))])));
}
async function assertPrevisaoConfirmada(pedido, transaction) {
  if (!pedido.entrega_controle_obrigatorio) return;
  const itens = await PedidoCompraItem.findAll({ where: { pedido_compra_id: pedido.id, removido: false }, transaction });
  const controles = await PedidoCompraEntrega.findAll({ where: { pedido_compra_id: pedido.id }, transaction });
  if (itens.some((i) => !controles.some((c) => Number(c.pedido_compra_item_id) === Number(i.id) && c.previsao))) {
    falhar('Confirme a previsão de entrega de todos os itens no acompanhamento de entregas antes de fechar com o fornecedor.');
  }
}

async function operarEntrega({ pedidoId, compraId, solicitacaoId, usuarioId, payload }) {
  const { acao, itens, idempotency_key: chave } = payload;
  const acoes = ['RECEBER', 'NAO_ENTREGUE', 'PREVISAO', 'CANCELAR_SALDO', 'CORRIGIR_RECEBIDO', 'DEVOLVER_EXCESSO'];
  if (!acoes.includes(acao) || !Array.isArray(itens) || !itens.length || itens.length > 500) falhar('Ação ou seleção de itens inválida.', 400);
  if (itens.some((i) => !i || typeof i !== 'object' || Array.isArray(i))) falhar('Item de entrega inválido.', 400);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(chave || ''))) falhar('Chave de operação inválida.', 400);
  const ids = itens.map((i) => Number(i.id));
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) falhar('Selecione itens únicos e válidos.', 400);
  const motivo = String(payload.motivo || '').trim();
  if (motivo.length > 2000 || (['CANCELAR_SALDO', 'CORRIGIR_RECEBIDO', 'DEVOLVER_EXCESSO', 'NAO_ENTREGUE'].includes(acao) && !motivo)) falhar('Informe o motivo (até 2.000 caracteres).', 400);
  const hash = crypto.createHash('sha256').update(JSON.stringify({ pedidoId: Number(pedidoId), usuarioId, acao, motivo, itens })).digest('hex');
  const executar = async (transaction) => {
    // Um pedido por operação; ordem fixa de locks. Versões impedem duplicar recebimentos
    // vindos de duas telas, mesmo se os clientes gerarem chaves distintas.
    const pedido = await PedidoCompra.findOne({ where: { id: pedidoId, solicitacao_compra_id: compraId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!pedido) falhar('Pedido não pertence à solicitação.', 404);
    const repetida = await PedidoCompraEntregaOperacao.findOne({ where: { chave }, transaction });
    if (repetida) {
      if (repetida.payload_hash !== hash) falhar('Esta chave já foi usada em outra operação. Atualize a tela.');
      return repetida.resultado;
    }
    if (pedido.status === 'CANCELADO') falhar('Pedido cancelado não recebe alterações de entrega.');
    const registros = await PedidoCompraItem.findAll({ where: { pedido_compra_id: pedido.id, id: { [Op.in]: ids }, removido: false }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    if (registros.length !== ids.length) falhar('Um item não pertence ao pedido ou foi cancelado. Atualize a tela.');
    const feriados = await calendarioEntrega(transaction);
    const hoje = hojeBrasil();
    const resultado = [];
    for (const item of registros) {
      const entrada = itens.find((i) => Number(i.id) === Number(item.id));
      let controle = await PedidoCompraEntrega.findByPk(item.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!controle) controle = await PedidoCompraEntrega.create({ pedido_compra_item_id: item.id, pedido_compra_id: pedido.id }, { transaction });
      if (!Number.isInteger(entrada.versao) || entrada.versao !== controle.versao) falhar('A entrega foi alterada por outro usuário. Atualize a tela antes de registrar novamente.');
      const recebido = arredondar(await PedidoCompraItemRecebimento.sum('quantidade', { where: { pedido_compra_item_id: item.id }, transaction }) || 0);
      const anterior = situacaoEntrega(item, recebido, controle.toJSON(), hoje);
      let novoRecebido = recebido;
      const atualizacao = { versao: controle.versao + 1 };
      if (acao === 'PREVISAO') {
        if (!dataValida(entrada.previsao) || entrada.previsao < hoje) falhar('A previsão deve ser uma data válida, hoje ou futura.', 400);
        if (anterior.restante <= 0 || controle.estado === 'DIVERGENCIA') falhar('Item concluído ou com divergência: trate o recebimento antes de reprogramar.');
        if (controle.previsao && !motivo) falhar('Informe o motivo da alteração da previsão.', 400);
        if (anterior.informar_obrigatorio) falhar('A Obra precisa informar a entrega vencida antes de Compras reprogramar.');
        Object.assign(atualizacao, { previsao: entrada.previsao, estado: 'OBRA', prazo_compras: null });
      } else if (acao === 'CANCELAR_SALDO') {
        if (!anterior.restante) falhar('Este item não possui saldo pendente para cancelar.');
        const service = require('./pedidoCompraService');
        try { await service.cancelarSaldoNaoRecebido({ pedido, item, recebido, motivo, usuarioId, transaction }); }
        catch (error) { if (!error.statusCode) error.statusCode = 409; throw error; }
        Object.assign(atualizacao, { estado: 'CONCLUIDO', prazo_compras: null,
          saldo_cancelado: arredondar(Number(controle.saldo_cancelado || 0) + anterior.restante) });
      } else {
        if (acao === 'NAO_ENTREGUE') {
          if (!anterior.restante || controle.estado !== 'OBRA') falhar('Este item não está aguardando informação da Obra.');
        } else {
          const quantidade = Number(entrada.quantidade);
          if (typeof entrada.quantidade !== 'number' || !Number.isFinite(quantidade) || quantidade < 0 || quantidade > 999999999 || arredondar(quantidade) !== quantidade) falhar('Quantidade inválida: use até três casas decimais.', 400);
          if (acao === 'RECEBER' && quantidade <= 0) falhar('Informe uma quantidade maior que zero ou use Não entregue.', 400);
          if (acao === 'DEVOLVER_EXCESSO' && (!quantidade || quantidade > Math.max(0, recebido - anterior.previsto))) falhar('A devolução não pode superar o excesso recebido.', 400);
          const delta = acao === 'CORRIGIR_RECEBIDO' ? arredondar(quantidade - recebido)
            : acao === 'DEVOLVER_EXCESSO' ? -quantidade : quantidade;
          if (!delta) falhar('Nenhuma alteração na quantidade recebida.', 400);
          novoRecebido = arredondar(recebido + delta);
          await PedidoCompraItemRecebimento.create({ pedido_compra_item_id: item.id, quantidade: delta,
            recebido_em: new Date(), usuario_id: usuarioId, observacao: `${acao}: ${motivo}`,
            idempotency_key: `${chave}_${item.id}` }, { transaction });
        }
        const novaSituacao = situacaoEntrega(item, novoRecebido);
        if (novaSituacao.situacao === 'DIVERGENCIA') Object.assign(atualizacao, { estado: 'DIVERGENCIA', prazo_compras: null });
        else if (novaSituacao.restante === 0) Object.assign(atualizacao, { estado: 'CONCLUIDO', prazo_compras: null });
        else Object.assign(atualizacao, { estado: 'COMPRAS', prazo_compras: controle.estado === 'COMPRAS' && controle.prazo_compras
          ? controle.prazo_compras : adicionarDiasUteis(hoje, 2, feriados) });
      }
      await controle.update(atualizacao, { transaction });
      const depois = situacaoEntrega(item, novoRecebido, controle.toJSON(), hoje);
      resultado.push({ item_id: item.id, entrega: depois });
      await Historico.create({ solicitacao_id: solicitacaoId, usuario_responsavel_id: usuarioId,
        setor: ['RECEBER', 'NAO_ENTREGUE'].includes(acao) ? 'OBRA' : 'COMPRAS', acao: 'PEDIDO_ENTREGA_ATUALIZADA',
        descricao: `Pedido #${pedido.id} · ${item.descricao}: ${acao}${motivo ? ` — ${motivo}` : ''}`,
        metadata: JSON.stringify({ pedido_id: pedido.id, pedido_item_id: item.id, acao_entrega: acao, anterior, depois, feriados_considerados: feriados }) }, { transaction });
    }
    await PedidoCompraEntregaOperacao.create({ chave, pedido_compra_id: pedido.id, usuario_id: usuarioId, payload_hash: hash, resultado }, { transaction });
    return resultado;
  };
  try { return await sequelize.transaction(executar); }
  catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const repetida = await PedidoCompraEntregaOperacao.findOne({ where: { chave } });
      if (repetida?.payload_hash === hash) return repetida.resultado;
    }
    throw error;
  }
}

module.exports = { operarEntrega, resumirPedidos, calendarioEntrega, assertPrevisaoConfirmada,
  assertObraPodeCriarCompra, assertComprasPodeGerarPedido, pendenciasEntrega, sqlPendenciaEntrega, sqlOrdemEntrega };
