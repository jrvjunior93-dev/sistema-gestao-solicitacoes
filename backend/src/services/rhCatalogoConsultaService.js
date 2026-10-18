'use strict';
const { Op } = require('sequelize');
const { RhEmpresaGrupo, RhColaborador } = require('../models');
const { getRhDpObraScopeIds } = require('./authorizationService');

// Apenas seletores de telas de leitura; gerenciar empresas continua separado.
async function empresasConsulta(user) {
  const escopo = await getRhDpObraScopeIds(user);
  const where = { ativo: true };
  if (Array.isArray(escopo)) {
    if (!escopo.length) return [];
    const vinculadas = await RhColaborador.findAll({
      where: { obra_id: { [Op.in]: escopo } }, attributes: ['empresa_grupo_id'],
      group: ['empresa_grupo_id'], raw: true
    });
    const ids = vinculadas.map(c => Number(c.empresa_grupo_id)).filter(id => id > 0);
    if (!ids.length) return [];
    where.id = { [Op.in]: ids };
  }
  const empresas = await RhEmpresaGrupo.findAll({ where, attributes: ['id', 'nome', 'cnpj'], order: [['nome', 'ASC']], raw: true });
  return empresas.map(e => ({ id: e.id, nome: e.nome, cnpj: e.cnpj }));
}
module.exports = { empresasConsulta };
