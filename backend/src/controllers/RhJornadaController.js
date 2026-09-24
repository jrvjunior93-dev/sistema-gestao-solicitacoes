const {
  registrarJornada,
  registrarPagamentoIndividual,
  colaboradoresParaJornada,
  solicitarEdicaoJornada,
  decidirEdicaoJornada,
  listarEdicoesJornadaPendentes
} = require('../services/rhJornadaFormularioService');
const { eventosVigentes, desativarEventoRecorrente, itensDaLinha } = require('../services/rhEventoRecorrenteService');
const { historicoDoColaborador: historicoDeVinculo } = require('../services/rhVinculoObraService');
const { historicoDoColaborador: historicoDeSalario } = require('../services/rhSalarioService');
const { responderErroController } = require('../utils/controllerError');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const { RhColaborador } = require('../models');
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

  async desativarEvento(req, res) {
    try {
      const evento = await desativarEventoRecorrente(req.params.id, req.body?.motivo, contextoDe(req));
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
