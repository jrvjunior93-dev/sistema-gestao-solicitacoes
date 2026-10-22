'use strict';
const { Op } = require('sequelize');

function elegivel(titulo) {
  return titulo?.tipo === 'RECEBER' && titulo.origem_titulo === 'COMERCIAL'
    && !titulo.forma_pagamento_id && !titulo.formaPagamento?.id
    && !titulo.formaPagamento?.nome && !titulo.formaPagamento?.codigo
    && Number.isSafeInteger(Number(titulo.id)) && Number(titulo.id) > 0;
}

// Projecao somente leitura dos IDs DEPOIS do escopo/paginacao da listagem.
// Nao carregar contratos, movimentos ou hasMany no SELECT paginado dos titulos.
async function anexarFormasPrevistasContratos(titulos, { parcelasModel } = {}) {
  const candidatos = titulos.filter(elegivel);
  const ids = [...new Set(candidatos.map(t => Number(t.id)))];
  if (!ids.length) return titulos;
  const model = parcelasModel || require('../models').ContratoComercialParcela;
  const formas = new Map(ids.map(id => [id, new Set()]));
  for (let inicio = 0; inicio < ids.length; inicio += 500) {
    const linhas = await model.findAll({
      where: { titulo_financeiro_id: { [Op.in]: ids.slice(inicio, inicio + 500) } },
      attributes: ['titulo_financeiro_id', 'forma_recebimento_prevista'],
      raw: true
    });
    for (const linha of linhas) {
      const codigo = typeof linha.forma_recebimento_prevista === 'string'
        ? linha.forma_recebimento_prevista.trim().toUpperCase() : '';
      if (codigo) formas.get(Number(linha.titulo_financeiro_id))?.add(codigo);
    }
  }
  for (const titulo of candidatos) {
    const previstas = [...formas.get(Number(titulo.id))].sort();
    if (titulo.setDataValue) titulo.setDataValue('formas_recebimento_previstas_contrato', previstas);
    else titulo.formas_recebimento_previstas_contrato = previstas;
  }
  return titulos;
}

module.exports = { anexarFormasPrevistasContratos };
