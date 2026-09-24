'use strict';

const {
  PERMISSIONS,
  assertPermission,
  carregarSaldosDaData,
  listarObras,
  resolverEscopo,
  salvarSaldos
} = require('../services/painelGestorService');
const { obterDashboard } = require('../modules/custosRecebiveis/services/planejamentoService');
const { gerarResultadoObras } = require('../services/resultadoObrasService');

function respondError(res, error, fallback) {
  const status = Number(error?.statusCode || error?.status);
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  if (safeStatus >= 500) console.error(`${fallback}:`, error);
  return res.status(safeStatus).json({
    error: safeStatus < 500 && error?.message ? error.message : fallback,
    ...(safeStatus < 500 && error?.code ? { code: error.code } : {})
  });
}

module.exports = {
  async resultadoObras(req, res) {
    try {
      await assertPermission(req.user, PERMISSIONS.RESULTADO);
      const scope = await resolverEscopo(req.user);
      return res.json(await gerarResultadoObras({
        query: req.query,
        obraIdsEscopo: scope.todas ? null : scope.obraIds
      }));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar Resultado de Obras no Painel do Gestor');
    }
  },

  async obras(req, res) {
    try {
      await assertPermission(req.user, req.query.contexto === 'custos' ? PERMISSIONS.CUSTOS : PERMISSIONS.RESULTADO);
      return res.json(await listarObras(req.user));
    } catch (error) {
      return respondError(res, error, 'Erro ao listar obras do Painel do Gestor');
    }
  },

  async custosRecebiveis(req, res) {
    try {
      await assertPermission(req.user, PERMISSIONS.CUSTOS);
      const scope = await resolverEscopo(req.user);
      return res.json(await obterDashboard(
        req.user,
        req.query.competencia,
        req.query.obra_id,
        req.query.competencias,
        req.query.classificacao,
        { resolverEscopoObras: async () => ({ todas: scope.todas, obraIds: scope.obraIds || [] }) }
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar Custos e Recebiveis no Painel do Gestor');
    }
  },

  async saldos(req, res) {
    try {
      await assertPermission(req.user, PERMISSIONS.SALDOS_VIEW);
      return res.json(await carregarSaldosDaData(req.user, req.query.data));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar saldos diarios');
    }
  },

  async preenchimentoSaldos(req, res) {
    try {
      await assertPermission(req.user, PERMISSIONS.SALDOS_WRITE);
      return res.json(await carregarSaldosDaData(req.user, req.query.data, { incluirPendentes: true }));
    } catch (error) {
      return respondError(res, error, 'Erro ao preparar o lancamento de saldos');
    }
  },

  async salvarSaldos(req, res) {
    try {
      await assertPermission(req.user, PERMISSIONS.SALDOS_WRITE);
      return res.json(await salvarSaldos(req.user, req.body));
    } catch (error) {
      return respondError(res, error, 'Erro ao salvar os saldos diarios');
    }
  }
};
