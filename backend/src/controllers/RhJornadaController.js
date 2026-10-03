const {
  registrarJornada,
  registrarJornadaGerencial,
  registrarPagamentoIndividual,
  colaboradoresParaJornada,
  solicitarEdicaoJornada,
  decidirEdicaoJornada,
  listarEdicoesJornadaPendentes
} = require('../services/rhJornadaFormularioService');
const {
  eventosVigentes,
  listarEventosRecorrentes,
  atualizarEventoRecorrente,
  desativarEventoRecorrente,
  itensDaLinha
} = require('../services/rhEventoRecorrenteService');
const { historicoDoColaborador: historicoDeVinculo } = require('../services/rhVinculoObraService');
const { historicoDoColaborador: historicoDeSalario } = require('../services/rhSalarioService');
const { responderErroController } = require('../utils/controllerError');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const { RhColaborador, RhImportacaoLinha } = require('../models');
const { Op } = require('sequelize');
const { ValidationError } = require('../middlewares/validation');
const { getRhDpObraScopeIds, userHasAreaPermission } = require('../services/authorizationService');
const { gerarModeloJornada, importarJornadaPlanilha } = require('../services/rhJornadaPlanilhaService');
const { anexarNoPedido } = require('../services/rhSolicitacaoService');

/**
 * Jornada por formulario, eventos recorrentes e os historicos (Fase 4/5 do modulo DP, 26/08).
 *
 * Este controller existe porque os servicos existiam SEM PORTA: `rhJornadaFormularioService` estava
 * provado por 14 conferencias e nao era referenciado por nenhum arquivo do sistema. Servico que
 * ninguem chama parece pronto e nao esta — e a suite verde ajuda a esconder isso.
 */
function contextoDe(req) {
  return { usuarioId: req.user?.id || null, setor: codigoDoSetor(req.user), usuario: req.user };
}

async function exigirObraNoEscopoDoUsuario(req, obraId) {
  const escopo = await getRhDpObraScopeIds(req.user);
  if (!Array.isArray(escopo)) return;
  const id = Number(obraId);
  if (!id || !escopo.includes(id)) {
    throw new ValidationError('Acesso negado: a obra nao esta vinculada ao usuario.', 403);
  }
}

async function exigirColaboradorNoEscopoDoUsuario(req, colaboradorId) {
  const escopo = await getRhDpObraScopeIds(req.user);
  if (!Array.isArray(escopo)) return;
  const colaborador = await RhColaborador.findByPk(colaboradorId, { attributes: ['id', 'obra_id'] });
  if (!colaborador) throw new ValidationError('Colaborador nao encontrado.', 404);
  if (!colaborador.obra_id || !escopo.includes(Number(colaborador.obra_id))) {
    throw new ValidationError('Acesso negado a este colaborador.', 403);
  }
}

module.exports = {
  async modelo(req, res) {
    try {
      await exigirObraNoEscopoDoUsuario(req, req.query.obra_id);
      const buffer = await gerarModeloJornada(req.query || {});
      const competencia = String(req.query.competencia || '').replace(/[^0-9-]/g, '');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="modelo-jornada-${competencia || 'periodo'}.xlsx"`);
      return res.send(buffer);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao gerar o modelo da jornada');
    }
  },

  async importar(req, res) {
    try {
      await exigirObraNoEscopoDoUsuario(req, req.body?.obra_id);
      // Custos e Recebiveis (29/09/2026): obra travada nao recebe jornada nova.
      // Multipart: a obra so existe depois do multer, por isso a checagem e aqui.
      await require('../modules/custosRecebiveis/services/bloqueioObraService')
        .assertObrasSemTrava([req.body?.obra_id], 'POST /rh/jornada/importar');
      const contexto = contextoDe(req);
      contexto.obraIds = await getRhDpObraScopeIds(req.user);
      contexto.podeDecidir = await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.decidir']);
      const resultado = await importarJornadaPlanilha(req.body || {}, req.files?.planilha?.[0], contexto);
      const fichas = Array.isArray(req.files?.fichas) ? req.files.fichas : [];
      const erros = [];
      let anexadas = 0;
      for (const ficha of fichas) {
        try {
          await anexarNoPedido(resultado.solicitacao.id, {}, contexto, ficha);
          anexadas += 1;
        } catch (error) {
          erros.push(`${ficha.originalname}: ${error.message}`);
        }
      }
      return res.status(201).json({
        ...resultado,
        fichas_anexadas: anexadas,
        fichas_com_erro: erros
      });
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao importar a jornada');
    }
  },

  /** A lista que o formulario abre: quem estava na obra NAQUELA competencia, pelo vinculo. */
  async colaboradoresDaCompetencia(req, res) {
    try {
      await exigirObraNoEscopoDoUsuario(req, req.query.obra_id);
      const dados = await colaboradoresParaJornada(
        Number(req.query.obra_id),
        String(req.query.competencia || ''),
        req.query
      );
      return res.json(dados);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao montar a lista de jornada');
    }
  },

  async registrar(req, res) {
    try {
      await exigirObraNoEscopoDoUsuario(req, req.body?.obra_id);
      const contexto = contextoDe(req);
      contexto.obraIds = await getRhDpObraScopeIds(req.user);
      contexto.podeDecidir = await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.decidir']);
      const dados = await registrarJornada(req.body || {}, contexto);
      return res.status(201).json(dados);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao registrar a jornada');
    }
  },

  async colaboradoresDaCompetenciaGerencial(req, res) {
    try {
      await exigirObraNoEscopoDoUsuario(req, req.query.obra_id);
      const obraId = Number(req.query.obra_id);
      const competencia = String(req.query.competencia || '');
      const [mensais, diarias] = await Promise.all([
        colaboradoresParaJornada(obraId, competencia, { modo_gerencial_v2: true, etapa_pagamento: 'PROPORCIONAL' }),
        colaboradoresParaJornada(obraId, competencia, { modo_gerencial_v2: true, etapa_pagamento: 'DIARIA' })
      ]);
      const enviadas = await RhImportacaoLinha.findAll({
        where: { status: 'CONFIRMADA', colaborador_id: {
          [Op.in]: mensais.map((item) => Number(item.colaborador_id)).filter(Boolean)
        } },
        attributes: ['colaborador_id'],
        include: [{ association: 'importacao', required: true,
          attributes: ['etapa_pagamento', 'obra_id'], where: {
            competencia, tipo: 'JORNADA', status: 'CONFIRMADA'
          } }]
      });
      const etapasPorId = new Map();
      enviadas.forEach((linha) => {
        const id = Number(linha.colaborador_id);
        if (!etapasPorId.has(id)) etapasPorId.set(id, { obra: new Set(), competencia: new Set() });
        const etapa = linha.importacao?.etapa_pagamento;
        if (etapa) {
          etapasPorId.get(id).competencia.add(etapa);
          if (Number(linha.importacao?.obra_id) === obraId) etapasPorId.get(id).obra.add(etapa);
        }
      });
      const diariaPorId = new Map(diarias.map((item) => [Number(item.colaborador_id), item]));
      return res.json(mensais.map((item) => ({ ...item,
        etapas_enviadas: [...(etapasPorId.get(Number(item.colaborador_id))?.obra || [])],
        etapas_enviadas_competencia: [...(etapasPorId.get(Number(item.colaborador_id))?.competencia || [])],
        dias_diaria_elegiveis: diariaPorId.get(Number(item.colaborador_id))?.dias_diaria_elegiveis || [],
        dias_diaria_ja_informados: diariaPorId.get(Number(item.colaborador_id))?.dias_diaria_ja_informados || []
      })));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao montar a lista gerencial da jornada');
    }
  },

  async registrarGerencial(req, res) {
    try {
      await exigirObraNoEscopoDoUsuario(req, req.body?.obra_id);
      const contexto = contextoDe(req);
      contexto.obraIds = await getRhDpObraScopeIds(req.user);
      contexto.podeDecidir = await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.decidir']);
      const dados = await registrarJornadaGerencial(req.body || {}, contexto);
      return res.status(201).json(dados);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao registrar a jornada gerencial');
    }
  },

  async pagamentoIndividual(req, res) {
    try {
      await exigirObraNoEscopoDoUsuario(req, req.body?.obra_id);
      const contexto = contextoDe(req);
      contexto.obraIds = await getRhDpObraScopeIds(req.user);
      contexto.podeDecidir = await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.decidir']);
      const dados = await registrarPagamentoIndividual(req.body || {}, contexto);
      return res.status(201).json(dados);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao registrar o pagamento individual');
    }
  },

  async solicitarEdicao(req, res) {
    try {
      const contexto = contextoDe(req);
      contexto.obraIds = await getRhDpObraScopeIds(req.user);
      const dados = await solicitarEdicaoJornada(req.body || {}, contexto);
      return res.status(201).json(dados);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao solicitar edicao da jornada');
    }
  },

  async listarEdicoesPendentes(req, res) {
    try {
      return res.json(await listarEdicoesJornadaPendentes());
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar solicitacoes de edicao da jornada');
    }
  },

  async decidirEdicao(req, res) {
    try {
      const dados = await decidirEdicaoJornada(req.params.id, req.body || {}, contextoDe(req));
      return res.json(dados);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao decidir edicao da jornada');
    }
  },

  async eventosDoColaborador(req, res) {
    try {
      await exigirColaboradorNoEscopoDoUsuario(req, req.params.id);
      const competencia = String(req.query.competencia || new Date().toISOString().slice(0, 7));
      return res.json(await eventosVigentes(Number(req.params.id), competencia));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar eventos recorrentes');
    }
  },

  async listarEventos(req, res) {
    try {
      const contexto = contextoDe(req);
      contexto.obraIds = await getRhDpObraScopeIds(req.user);
      return res.json(await listarEventosRecorrentes(req.query || {}, contexto));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar a gestao de eventos recorrentes');
    }
  },

  async atualizarEvento(req, res) {
    try {
      const contexto = contextoDe(req);
      contexto.obraIds = await getRhDpObraScopeIds(req.user);
      const evento = await atualizarEventoRecorrente(req.params.id, req.body || {}, contexto);
      return res.json(evento);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar o evento recorrente');
    }
  },

  async desativarEvento(req, res) {
    try {
      const contexto = contextoDe(req);
      contexto.obraIds = await getRhDpObraScopeIds(req.user);
      const evento = await desativarEventoRecorrente(req.params.id, req.body?.motivo, contexto);
      return res.json(evento);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao desativar o evento recorrente');
    }
  },

  /** Os itens que compoem a soma da folha — para a tela abrir e mostrar de onde veio cada centavo. */
  async itensDaFolha(req, res) {
    try {
      return res.json(await itensDaLinha(Number(req.params.id)));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar os itens da folha');
    }
  },

  async historicoDeVinculo(req, res) {
    try {
      await exigirColaboradorNoEscopoDoUsuario(req, req.params.id);
      return res.json(await historicoDeVinculo(Number(req.params.id)));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar o historico de lotacao');
    }
  },

  async historicoDeSalario(req, res) {
    try {
      await exigirColaboradorNoEscopoDoUsuario(req, req.params.id);
      return res.json(await historicoDeSalario(Number(req.params.id)));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar o historico de salario');
    }
  }
};
