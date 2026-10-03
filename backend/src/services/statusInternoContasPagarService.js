const { Op } = require('sequelize');
const { ConfiguracaoSistema, TituloFinanceiro, sequelize } = require('../models');
const { getFinanceiroObraScopeIds } = require('./authorizationService');

const CHAVE = 'CONTAS_PAGAR_STATUS_INTERNOS';
function erro(statusCode, message) { return Object.assign(new Error(message), { statusCode }); }
function normalizar(value) { return String(value || '').trim().replace(/\s+/g, ' '); }

async function carregar(transaction = null) {
  const registro = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE }, order: [['id', 'DESC']], transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  let status = [];
  try { status = JSON.parse(registro?.valor || '[]'); } catch { status = []; }
  return { registro, status: Array.isArray(status) ? status.filter((item) => typeof item === 'string') : [] };
}

async function listarStatusInternosPagar() {
  return (await carregar()).status;
}

async function criarStatusInternoPagar(nome) {
  const valor = normalizar(nome);
  if (!valor || valor.length > 80) throw erro(400, 'Informe um nome de status com ate 80 caracteres.');
  if (valor.toUpperCase() === '__CLEAR__') throw erro(400, 'Este nome de status e reservado pelo sistema.');
  return sequelize.transaction(async (transaction) => {
    const { registro, status } = await carregar(transaction);
    if (status.some((item) => item.toLocaleLowerCase('pt-BR') === valor.toLocaleLowerCase('pt-BR'))) {
      throw erro(409, 'Este status interno ja existe.');
    }
    const proximos = [...status, valor];
    if (registro) await registro.update({ valor: JSON.stringify(proximos) }, { transaction });
    else await ConfiguracaoSistema.create({ chave: CHAVE, valor: JSON.stringify(proximos) }, { transaction });
    return proximos;
  });
}

async function atribuirStatusInternoPagar(user, tituloIds, nome) {
  const ids = Array.isArray(tituloIds) ? [...new Set(tituloIds.map(Number))] : [];
  if (!ids.length || ids.length > 200 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw erro(400, 'Selecione entre 1 e 200 titulos validos.');
  }
  const valor = nome == null || nome === '' ? null : normalizar(nome);
  if (valor && !(await listarStatusInternosPagar()).includes(valor)) throw erro(400, 'Status interno nao cadastrado.');
  const obrasPermitidas = await getFinanceiroObraScopeIds(user);
  const where = { id: { [Op.in]: ids }, tipo: 'PAGAR' };
  if (obrasPermitidas !== null) where.obra_id = { [Op.in]: obrasPermitidas };
  return sequelize.transaction(async (transaction) => {
    const titulos = await TituloFinanceiro.findAll({
      where,
      attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE
    });
    if (titulos.length !== ids.length) throw erro(400, 'A selecao contem titulo inexistente ou que nao pertence ao Contas a Pagar.');
    await TituloFinanceiro.update({ status_interno_pagar: valor }, {
      where, transaction
    });
    return { quantidade: ids.length, status_interno_pagar: valor };
  });
}

module.exports = { listarStatusInternosPagar, criarStatusInternoPagar, atribuirStatusInternoPagar };
