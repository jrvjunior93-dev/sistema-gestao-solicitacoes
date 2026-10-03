'use strict';

const painelGestorService = require('../services/painelGestorService');
const planejamentoService = require('../modules/custosRecebiveis/services/planejamentoService');
const resultadoObrasService = require('../services/resultadoObrasService');
const painelGestorOlhoService = require('../services/painelGestorOlhoService');

const { PERMISSIONS } = painelGestorService;
const { mascararValores } = painelGestorOlhoService;

// Campos extras de erro que o frontend pode exibir (nunca dados sensiveis).
const CAMPOS_EXTRAS_ERRO = ['tempo_restante_segundos', 'bloqueado_ate', 'tentativas_restantes'];

function respondError(res, error, fallback) {
  const status = Number(error?.statusCode || error?.status);
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  if (safeStatus >= 500) console.error(`${fallback}:`, error);
  const extras = {};
  if (safeStatus < 500) {
    CAMPOS_EXTRAS_ERRO.forEach((campo) => {
      if (error?.[campo] != null) extras[campo] = error[campo];
    });
  }
  if (safeStatus === 429 && error?.tempo_restante_segundos) {
    res.setHeader('Retry-After', String(error.tempo_restante_segundos));
  }
  return res.status(safeStatus).json({
    error: safeStatus < 500 && error?.message ? error.message : fallback,
    ...(safeStatus < 500 && error?.code ? { code: error.code } : {}),
    ...extras
  });
}

function painelFechadoError() {
  const error = new Error('Os valores do Painel do Gestor estao ocultos. Abra o painel (olho) para informar saldos.');
  error.statusCode = 423;
  error.code = 'PAINEL_FECHADO';
  return error;
}

function criarPainelGestorController(overrides = {}) {
  const deps = {
    assertPermission: painelGestorService.assertPermission,
    resolverEscopo: painelGestorService.resolverEscopo,
    listarObras: painelGestorService.listarObras,
    carregarSaldosDaData: painelGestorService.carregarSaldosDaData,
    salvarSaldos: painelGestorService.salvarSaldos,
    obterDashboard: planejamentoService.obterDashboard,
    gerarResultadoObras: resultadoObrasService.gerarResultadoObras,
    olho: painelGestorOlhoService,
    ...overrides
  };

  /**
   * Resposta das GETs com valores: le o estado do olho (banco, cache curto) e, se fechado,
   * devolve a MESMA estrutura com todo valor financeiro = null. Mascara so aqui: as outras
   * telas que usam os mesmos servicos continuam intactas.
   */
  async function responderComOlho(req, res, payload) {
    const fechado = await deps.olho.estaFechado(req.user);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Painel-Valores-Ocultos', fechado ? '1' : '0');
    return res.json(fechado ? mascararValores(payload) : payload);
  }

  return {
    async resultadoObras(req, res) {
      try {
        await deps.assertPermission(req.user, PERMISSIONS.RESULTADO);
        const scope = await deps.resolverEscopo(req.user);
        const payload = await deps.gerarResultadoObras({
          query: req.query,
          obraIdsEscopo: scope.todas ? null : scope.obraIds
        });
        return await responderComOlho(req, res, payload);
      } catch (error) {
        return respondError(res, error, 'Erro ao consultar Resultado de Obras no Painel do Gestor');
      }
    },

    // So nomes/cadastro (id, codigo, nome, cidade, classificacao, empresa): sem valor financeiro.
    async obras(req, res) {
      try {
        await deps.assertPermission(req.user, req.query.contexto === 'custos' ? PERMISSIONS.CUSTOS : PERMISSIONS.RESULTADO);
        return res.json(await deps.listarObras(req.user));
      } catch (error) {
        return respondError(res, error, 'Erro ao listar obras do Painel do Gestor');
      }
    },

    async custosRecebiveis(req, res) {
      try {
        await deps.assertPermission(req.user, PERMISSIONS.CUSTOS);
        const scope = await deps.resolverEscopo(req.user);
        const payload = await deps.obterDashboard(
          req.user,
          req.query.competencia,
          req.query.obra_id,
          req.query.competencias,
          req.query.classificacao,
          { resolverEscopoObras: async () => ({ todas: scope.todas, obraIds: scope.obraIds || [] }) }
        );
        return await responderComOlho(req, res, payload);
      } catch (error) {
        return respondError(res, error, 'Erro ao consultar Custos e Recebiveis no Painel do Gestor');
      }
    },

    async saldos(req, res) {
      try {
        await deps.assertPermission(req.user, PERMISSIONS.SALDOS_VIEW);
        const payload = await deps.carregarSaldosDaData(req.user, req.query.data, { incluirPendentes: true });
        return await responderComOlho(req, res, payload);
      } catch (error) {
        return respondError(res, error, 'Erro ao consultar saldos diarios');
      }
    },

    async preenchimentoSaldos(req, res) {
      try {
        await deps.assertPermission(req.user, PERMISSIONS.SALDOS_WRITE);
        const payload = await deps.carregarSaldosDaData(req.user, req.query.data, { incluirPendentes: true });
        return await responderComOlho(req, res, payload);
      } catch (error) {
        return respondError(res, error, 'Erro ao preparar o lancamento de saldos');
      }
    },

    async salvarSaldos(req, res) {
      try {
        await deps.assertPermission(req.user, PERMISSIONS.SALDOS_WRITE);
        // Decisao do contrato: informar saldo exige o olho aberto.
        if (await deps.olho.estaFechado(req.user)) throw painelFechadoError();
        return res.json(await deps.salvarSaldos(req.user, req.body));
      } catch (error) {
        return respondError(res, error, 'Erro ao salvar os saldos diarios');
      }
    },

    // ----- Olho (mesma permissao de ver o painel: painel_gestor.acessar) -----

    async olhoEstado(req, res) {
      try {
        await deps.assertPermission(req.user, PERMISSIONS.ACCESS);
        res.setHeader('Cache-Control', 'no-store');
        return res.json(await deps.olho.obterEstado(req.user));
      } catch (error) {
        return respondError(res, error, 'Erro ao consultar o estado do Painel do Gestor');
      }
    },

    async olhoFechar(req, res) {
      try {
        await deps.assertPermission(req.user, PERMISSIONS.ACCESS);
        return res.json(await deps.olho.fechar(req.user, req));
      } catch (error) {
        return respondError(res, error, 'Erro ao ocultar os valores do Painel do Gestor');
      }
    },

    async olhoAbrir(req, res) {
      try {
        await deps.assertPermission(req.user, PERMISSIONS.ACCESS);
        return res.json(await deps.olho.abrir(req.user, req.body?.pin, req));
      } catch (error) {
        return respondError(res, error, 'Erro ao exibir os valores do Painel do Gestor');
      }
    },

    // ----- PIN (Configuracoes; autorizacao na rota: allowConfiguracoesStatusVinculos) -----

    async pinConfiguracao(req, res) {
      try {
        res.setHeader('Cache-Control', 'no-store');
        return res.json(await deps.olho.obterConfiguracaoPin());
      } catch (error) {
        return respondError(res, error, 'Erro ao consultar a senha do Painel do Gestor');
      }
    },

    async pinDefinir(req, res) {
      try {
        return res.json(await deps.olho.definirPin(req.user, req.body?.pin, req));
      } catch (error) {
        return respondError(res, error, 'Erro ao salvar a senha do Painel do Gestor');
      }
    }
  };
}

module.exports = criarPainelGestorController();
module.exports.criarPainelGestorController = criarPainelGestorController;
