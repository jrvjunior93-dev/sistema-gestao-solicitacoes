'use strict';
const { Op } = require('sequelize');
const { sequelize, RhSolicitacao, RhTicketLoteItem } = require('../models');

function dadosDo(pedido) {
  try { return typeof pedido.dados_json === 'string' ? JSON.parse(pedido.dados_json) : pedido.dados_json || {}; }
  catch { return {}; }
}

// Usa a referencia persistida por titulo, nunca CPF/nome/descricao aproximados.
function referenciaDoColaborador(ref, id) {
  return Number(ref.colaborador_id) === id || (Array.isArray(ref.origens)
    && ref.origens.some(origem => Number(origem.colaborador_id) === id));
}

async function titulosAdicionaisDoColaborador(colaboradorId) {
  const id = Number(colaboradorId);
  // Caminho SQL constante: fn() escapa '$' como '$$' em strings de argumentos.
  const contem = objeto => sequelize.where(sequelize.fn('JSON_CONTAINS', sequelize.col('dados_json'), JSON.stringify(objeto), sequelize.literal("'$.titulos'")), 1);
  const [pedidos, tickets] = await Promise.all([
    RhSolicitacao.findAll({ where: { tipo: 'JORNADA', subtipo: 'PAGAMENTO_POR_SOLICITACAO', [Op.or]: [
      contem({ colaborador_id: id }), contem({ origens: [{ colaborador_id: id }] })
    ] }, attributes: ['id', 'dados_json'], order: [['id', 'ASC']] }),
    RhTicketLoteItem.findAll({ where: { colaborador_id: id }, attributes: ['titulo_financeiro_id'], raw: true })
  ]);
  const ids = new Set(tickets.map(t => Number(t.titulo_financeiro_id)).filter(n => n > 0));
  for (const pedido of pedidos) {
    const referencias = dadosDo(pedido).titulos;
    for (const ref of Array.isArray(referencias) ? referencias : []) {
      if (!ref || typeof ref !== 'object') continue;
      if (referenciaDoColaborador(ref, id) && Number(ref.id) > 0) ids.add(Number(ref.id));
    }
  }
  return [...ids];
}
module.exports = { titulosAdicionaisDoColaborador, referenciaDoColaborador };
