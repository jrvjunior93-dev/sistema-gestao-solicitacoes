'use strict';
const { Op } = require('sequelize');
// Apenas titulos ja autorizados pelo chamador; nao concede acesso por id.
async function anexarInstrucoes(titulos, { transaction } = {}) {
  const { SolicitacaoFavorecido } = require('../models');
  if (!titulos.length) return titulos;
  const ids = [...new Set(titulos.flatMap(t => [Number(t.id), Number(t.medicao_pagamento_origem_id)]).filter(Boolean))];
  const partes = SolicitacaoFavorecido ? await SolicitacaoFavorecido.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction }) : [];
  const porId = new Map(partes.map(p => [Number(p.titulo_financeiro_id), p.toJSON ? p.toJSON() : p]));
  for (const titulo of titulos) {
    const parte = titulo.pagamento_favorecido || titulo.pagamento_negociacao || porId.get(Number(titulo.id)) || porId.get(Number(titulo.medicao_pagamento_origem_id));
    if (!parte) continue;
    if (titulo.setDataValue) titulo.setDataValue('instrucao_favorecido', parte);
    else titulo.instrucao_favorecido = parte;
  }
  return titulos;
}
module.exports = { anexarInstrucoes };
