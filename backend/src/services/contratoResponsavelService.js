'use strict';

const { Op } = require('sequelize');
const { User, UsuarioObra } = require('../models');

const erroValidacao = (mensagem) => Object.assign(new Error(mensagem), { statusCode: 400 });

function normalizarId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Responsaveis que podem ser escolhidos em um contrato pertencem a obra/centro de custo.
 * A mesma consulta alimenta a tela e a validacao de escrita, evitando duas regras diferentes.
 */
async function listarResponsaveisVinculadosObra(obraId, { transaction } = {}) {
  const obraIdNormalizado = normalizarId(obraId);
  if (!obraIdNormalizado) return [];

  return User.findAll({
    where: {
      ativo: true,
      perfil: { [Op.ne]: 'SUPERADMIN' }
    },
    attributes: ['id', 'nome'],
    include: [{
      model: UsuarioObra,
      as: 'vinculos',
      attributes: [],
      where: { obra_id: obraIdNormalizado },
      required: true
    }],
    order: [['nome', 'ASC']],
    distinct: true,
    ...(transaction ? { transaction } : {})
  });
}

async function validarResponsavelVinculadoObra(responsavelId, obraId, { transaction } = {}) {
  if (responsavelId === null || responsavelId === undefined || responsavelId === '') return null;

  const responsavelIdNormalizado = normalizarId(responsavelId);
  const obraIdNormalizado = normalizarId(obraId);
  if (!responsavelIdNormalizado) throw erroValidacao('Responsavel pelo contrato invalido.');
  if (!obraIdNormalizado) throw erroValidacao('Obra do contrato invalida.');

  const responsavel = await User.findOne({
    where: {
      id: responsavelIdNormalizado,
      ativo: true,
      perfil: { [Op.ne]: 'SUPERADMIN' }
    },
    attributes: ['id'],
    include: [{
      model: UsuarioObra,
      as: 'vinculos',
      attributes: [],
      where: { obra_id: obraIdNormalizado },
      required: true
    }],
    ...(transaction ? { transaction } : {})
  });

  if (!responsavel) {
    throw erroValidacao('O responsavel selecionado nao possui vinculo ativo com esta obra/centro de custo.');
  }

  return responsavelIdNormalizado;
}

module.exports = {
  listarResponsaveisVinculadosObra,
  validarResponsavelVinculadoObra
};
