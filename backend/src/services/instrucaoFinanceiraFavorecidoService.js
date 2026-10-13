'use strict';
const { Op } = require('sequelize');
// Apenas titulos ja autorizados pelo chamador; nao concede acesso por id.
async function anexarInstrucoes(titulos, { transaction } = {}) {
  const { SolicitacaoFavorecido } = require('../models');
  if (!SolicitacaoFavorecido || !titulos.length) return titulos;
  const ids = [...new Set(titulos.map(t => Number(t.id)).filter(Boolean))];
  const partes = await SolicitacaoFavorecido.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction });
  const porId = new Map(partes.map(p => [Number(p.titulo_financeiro_id), p.toJSON ? p.toJSON() : p]));
  for (const titulo of titulos) {
    const parte = porId.get(Number(titulo.id));
    if (!parte) continue;
    if (titulo.setDataValue) titulo.setDataValue('instrucao_favorecido', parte);
    else titulo.instrucao_favorecido = parte;
  }
  return titulos;
}
module.exports = { anexarInstrucoes };
