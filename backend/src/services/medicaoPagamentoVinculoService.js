'use strict';
const { Op } = require('sequelize');
const db = require('../models');
const { erro } = require('./medicaoPagamentoDomain');
// Edicao generica nao escolhe destino nem invalida dossie: valor de medicao
// aprovada deve passar pela operacao especializada. Consultas indexadas por titulo.
async function impedirValorGenerico(titulo, transaction) {
  const [parcelas, partes] = await Promise.all([
    db.ContratoParcela.findAll({ where: { titulo_financeiro_id: titulo.id }, attributes: ['id'], transaction }),
    db.SolicitacaoFavorecido.findAll({ where: { titulo_financeiro_id: titulo.id }, attributes: ['medicao_id'], transaction })
  ]);
  const vinculos = parcelas.length ? await db.MedicaoParcela.findAll({ where: { contrato_parcela_id: { [Op.in]: parcelas.map(p => p.id) }, devolvido_em: null }, attributes: ['medicao_id'], transaction }) : [];
  const ids = [...new Set([...vinculos, ...partes].map(p => p.medicao_id).filter(Boolean))];
  if (ids.length && await db.ContratoMedicao.findOne({ where: { id: { [Op.in]: ids }, aprovada_em: { [Op.ne]: null } }, transaction })) {
    throw erro('Medicao aprovada: ajuste o valor na opcao Valor para pagamento da medicao, informando o destino da diferenca.', 409);
  }
}
module.exports = { impedirValorGenerico };
