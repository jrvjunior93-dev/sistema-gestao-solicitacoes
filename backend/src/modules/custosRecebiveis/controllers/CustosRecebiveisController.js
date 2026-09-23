'use strict';

const { CUSTOS_RECEBIVEIS_MODULE_KEY } = require('../constants/custosRecebiveisConstants');
const { resolverEscopoObras } = require('../policies/obraScopePolicy');
const {
  gerarModeloPlanoMicro,
  importarPlanoMicro,
  listarObrasNoEscopo,
  obterPlanoObra,
  publicarPlanoMicro,
  validarArquivoPlanoMicro
} = require('../services/planoMicroService');
const {
  consolidarMedicao,
  criarCompetencia,
  decidirReabertura,
  finalizarCompetencia,
  obterComparativo,
  obterDashboard,
  obterPlanejamento,
  listarCompetencias,
  pesquisarItensPlano,
  resumirObrasCompetencia,
  salvarCustos,
  salvarRecebiveis,
  solicitarReabertura,
  solicitarReaberturaPorObraCompetencia
} = require('../services/planejamentoService');
const {
  gerarModeloPlanejamento,
  validarArquivoPlanejamento,
  validarItensPlanejamento
} = require('../services/planejamentoPlanilhaService');
const {
  listarRealizados,
  reconciliarRealizado,
  reprocessarRealizados
} = require('../services/realizadoService');
const { gerarExportacao } = require('../services/exportacaoService');
const {
  concederBypass,
  listarBypasses,
  listarMinhasObrigacoes,
  revogarBypass
} = require('../services/obrigacaoService');
const {
  cadastrarResponsavelObra,
  encerrarResponsabilidade,
  listarAuditoriaObra,
  listarResponsaveisObra
} = require('../services/governancaService');

function respondError(res, error, fallbackMessage) {
  const status = Number(error?.statusCode || error?.status);
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  const payload = {
    error: safeStatus < 500 && error?.message ? error.message : fallbackMessage
  };
  if (safeStatus < 500 && error?.code) payload.code = error.code;
  if (safeStatus < 500 && error?.details) payload.details = error.details;
  if (safeStatus >= 500) {
    console.error(`${fallbackMessage}:`, error);
  }
  return res.status(safeStatus).json(payload);
}

class CustosRecebiveisController {
  static async status(req, res) {
    try {
      const escopo = await resolverEscopoObras(req.user);

      return res.json({
        module: CUSTOS_RECEBIVEIS_MODULE_KEY,
        status: 'FOUNDATION_READY',
        escopo: {
          todas_obras: escopo.todas,
          quantidade_obras: escopo.todas ? null : escopo.obraIds.length
        }
      });
    } catch (error) {
      console.error('Erro ao consultar fundacao de Custos e Recebiveis:', error.message);
      return res.status(500).json({ error: 'Erro ao consultar Custos e Recebiveis' });
    }
  }

  static async obras(req, res) {
    try {
      const result = await listarObrasNoEscopo(req.user, req.query);
      const compact = ['1', 'true'].includes(String(req.query.compacto || '').toLowerCase());
      if (compact) return res.json(result);

      const competencia = result.items?.[0]?.competencia_referencia || req.query.competencia;
      const summaries = result.items?.length && competencia
        ? await resumirObrasCompetencia(req.user, result.items, competencia)
        : [];
      const summaryByWork = new Map(
        summaries.map((item) => [Number(item.obra?.id), item])
      );
      return res.json({
        ...result,
        items: (result.items || []).map((obra) => ({
          ...obra,
          resumo_competencia: summaryByWork.get(Number(obra.id)) || null
        }))
      });
    } catch (error) {
      return respondError(res, error, 'Erro ao listar obras de Custos e Recebiveis');
    }
  }

  static async plano(req, res) {
    try {
      return res.json(await obterPlanoObra(
        req.user,
        req.params.obraId,
        req.query
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar a estrutura micro da obra');
    }
  }

  static async modeloPlano(req, res) {
    try {
      const buffer = await gerarModeloPlanoMicro(req.user, req.params.obraId);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="modelo-plano-micro-obra-${Number(req.params.obraId)}.xlsx"`
      );
      res.setHeader('Cache-Control', 'no-store');
      return res.send(buffer);
    } catch (error) {
      return respondError(res, error, 'Erro ao gerar modelo da estrutura micro');
    }
  }

  static async validarImportacao(req, res) {
    try {
      return res.json(await validarArquivoPlanoMicro(
        req.user,
        req.params.obraId,
        req.file
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao validar a planilha micro');
    }
  }

  static async importar(req, res) {
    try {
      const result = await importarPlanoMicro(
        req.user,
        req.params.obraId,
        req.file,
        req.body
      );
      return res.status(result.idempotente ? 200 : 201).json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao importar a planilha micro');
    }
  }

  static async publicar(req, res) {
    try {
      return res.json(await publicarPlanoMicro(
        req.user,
        req.params.planoId,
        req.body
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao publicar a versao da estrutura micro');
    }
  }

  static async dashboard(req, res) {
    try {
      return res.json(await obterDashboard(
        req.user,
        req.query.competencia,
        req.query.obra_id,
        req.query.competencias,
        req.query.classificacao
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar dashboard de Custos e Recebiveis');
    }
  }

  static async planejamento(req, res) {
    try {
      return res.json(await obterPlanejamento(
        req.user,
        req.params.obraId,
        req.params.competencia
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar planejamento da competencia');
    }
  }

  static async competencias(req, res) {
    try {
      return res.json(await listarCompetencias(req.user, req.params.obraId));
    } catch (error) {
      return respondError(res, error, 'Erro ao listar competencias mensais');
    }
  }

  static async criarCompetencia(req, res) {
    try {
      const result = await criarCompetencia(
        req.user,
        req.params.obraId,
        req.body,
        req.get('Idempotency-Key')
      );
      return res.status(result.idempotente ? 200 : 201).json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao criar competencia mensal');
    }
  }

  static async itensPlano(req, res) {
    try {
      return res.json(await pesquisarItensPlano(
        req.user,
        req.params.obraId,
        req.query
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao pesquisar itens do plano micro');
    }
  }

  static async salvarCustos(req, res) {
    try {
      return res.json(await salvarCustos(
        req.user,
        req.params.obraId,
        req.params.competencia,
        req.body
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao salvar custos planejados');
    }
  }

  static async salvarRecebiveis(req, res) {
    try {
      return res.json(await salvarRecebiveis(
        req.user,
        req.params.obraId,
        req.params.competencia,
        req.body
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao salvar recebiveis previstos');
    }
  }

  static async finalizarCompetencia(req, res) {
    try {
      const result = await finalizarCompetencia(
        req.user,
        req.params.obraId,
        req.params.competencia,
        req.body,
        req.get('Idempotency-Key')
      );
      return res.status(result.idempotente ? 200 : 201).json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao finalizar a competencia');
    }
  }

  static async consolidarMedicao(req, res) {
    try {
      return res.json(await consolidarMedicao(
        req.user,
        req.params.obraId,
        req.params.competencia,
        {
          ...req.body,
          idempotency_key: req.get('Idempotency-Key')
        }
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao consolidar a medicao');
    }
  }

  static async modeloPlanejamento(req, res) {
    try {
      const result = await gerarModeloPlanejamento(
        req.params.obraId,
        req.params.competencia,
        req.params.tipo
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.buffer);
    } catch (error) {
      return respondError(res, error, 'Erro ao gerar modelo do planejamento');
    }
  }

  static async validarPlanilhaPlanejamento(req, res) {
    try {
      return res.json(await validarArquivoPlanejamento(
        req.params.obraId,
        req.params.competencia,
        req.params.tipo,
        req.file
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao validar planilha do planejamento');
    }
  }

  static async revalidarItensPlanejamento(req, res) {
    try {
      return res.json(await validarItensPlanejamento(
        req.params.obraId,
        req.params.competencia,
        req.params.tipo,
        req.body?.itens
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao revalidar itens do planejamento');
    }
  }

  static async comparativo(req, res) {
    try {
      return res.json(await obterComparativo(
        req.user,
        req.params.obraId,
        req.query.competencia
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar o comparativo');
    }
  }

  static async solicitarReabertura(req, res) {
    try {
      const result = await solicitarReabertura(
        req.user,
        req.params.competenciaId,
        req.body
      );
      return res.status(result.idempotente ? 200 : 201).json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao solicitar reabertura');
    }
  }

  static async solicitarReaberturaPorObraCompetencia(req, res) {
    try {
      const result = await solicitarReaberturaPorObraCompetencia(
        req.user,
        req.params.obraId,
        req.params.competencia,
        req.body
      );
      return res.status(result.idempotente ? 200 : 201).json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao solicitar reabertura');
    }
  }

  static async decidirReabertura(req, res) {
    try {
      return res.json(await decidirReabertura(
        req.user,
        req.params.reaberturaId,
        req.body
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao decidir a reabertura');
    }
  }

  static async realizados(req, res) {
    try {
      return res.json(await listarRealizados(
        req.user,
        req.params.obraId,
        req.query.competencia
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar o custo realizado');
    }
  }

  static async reprocessarRealizados(req, res) {
    try {
      return res.json(await reprocessarRealizados(
        req.user,
        req.params.obraId,
        req.body?.competencia || req.query.competencia
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao reprocessar o custo realizado');
    }
  }

  static async reconciliarRealizado(req, res) {
    try {
      const result = await reconciliarRealizado(
        req.user,
        req.params.id,
        req.body
      );
      return res.status(result.idempotente ? 200 : 201).json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao reconciliar o custo realizado');
    }
  }

  static async exportacao(req, res) {
    try {
      const result = await gerarExportacao(req.user, req.params.tipo, req.query);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(result.buffer);
    } catch (error) {
      return respondError(res, error, 'Erro ao gerar a exportacao');
    }
  }

  static async minhasObrigacoes(req, res) {
    try {
      return res.json(await listarMinhasObrigacoes(req.user));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar obrigacoes de Custos e Recebiveis');
    }
  }

  static async bypasses(req, res) {
    try {
      return res.json(await listarBypasses(req.user));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar bypasses de Custos e Recebiveis');
    }
  }

  static async concederBypass(req, res) {
    try {
      const result = await concederBypass(
        req.user,
        req.body,
        req.get('Idempotency-Key')
      );
      return res.status(result.idempotente ? 200 : 201).json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao conceder bypass de Custos e Recebiveis');
    }
  }

  static async revogarBypass(req, res) {
    try {
      const result = await revogarBypass(
        req.user,
        req.params.id,
        req.get('Idempotency-Key')
      );
      return res.json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao revogar bypass de Custos e Recebiveis');
    }
  }

  static async responsaveisObra(req, res) {
    try {
      return res.json(await listarResponsaveisObra(req.params.obraId));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar responsaveis da obra');
    }
  }

  static async cadastrarResponsavelObra(req, res) {
    try {
      const result = await cadastrarResponsavelObra(
        req.user,
        req.params.obraId,
        req.body,
        req.get('Idempotency-Key')
      );
      return res.status(result.idempotente ? 200 : 201).json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao cadastrar responsavel da obra');
    }
  }

  static async encerrarResponsabilidade(req, res) {
    try {
      const result = await encerrarResponsabilidade(
        req.user,
        req.params.id,
        req.body,
        req.get('Idempotency-Key')
      );
      return res.json(result);
    } catch (error) {
      return respondError(res, error, 'Erro ao encerrar responsabilidade da obra');
    }
  }

  static async auditoriaObra(req, res) {
    try {
      return res.json(await listarAuditoriaObra(
        req.params.obraId,
        req.query
      ));
    } catch (error) {
      return respondError(res, error, 'Erro ao consultar auditoria de Custos e Recebiveis');
    }
  }
}

module.exports = CustosRecebiveisController;
