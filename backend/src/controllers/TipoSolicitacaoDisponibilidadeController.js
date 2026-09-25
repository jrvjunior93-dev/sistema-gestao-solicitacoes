'use strict';

const {
  obterAreasConfiguracaoCamposDestinoInicial,
  resolverDestinoInicialNovaSolicitacao
} = require('../services/novaSolicitacaoDestinoService');
const {
  listarTiposDisponiveis,
  obterConfiguracao,
  salvarConfiguracao
} = require('../services/tipoSolicitacaoDisponibilidadeService');

function responderErro(res, error, fallback) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: status >= 500 ? fallback : error.message });
}

module.exports = {
  async disponiveis(req, res) {
    try {
      const [catalogo, destinoInicial] = await Promise.all([
        listarTiposDisponiveis(req.query?.obra_id),
        resolverDestinoInicialNovaSolicitacao()
      ]);
      return res.json({
        contexto: catalogo.contexto,
        obra_centro_custo: catalogo.destino,
        destino_inicial: {
          id: destinoInicial.setor.id,
          codigo: destinoInicial.areaResponsavel,
          nome: destinoInicial.setor.nome
        },
        tipo_automatico: catalogo.tipo_automatico === true,
        areas_configuracao_campos: [...new Set([
          ...catalogo.areas_configuracao_campos,
          ...obterAreasConfiguracaoCamposDestinoInicial(destinoInicial)
        ])],
        tipos: catalogo.tipos
      });
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar os tipos disponiveis para a Nova Solicitacao.');
    }
  },

  async configuracao(req, res) {
    try {
      return res.json(await obterConfiguracao());
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar a disponibilidade dos tipos.');
    }
  },

  async atualizarConfiguracao(req, res) {
    try {
      const resultado = await salvarConfiguracao({
        escopo: req.body?.escopo,
        centroCustoId: req.body?.centro_custo_id,
        tipos: req.body?.tipos,
        usuarioId: req.user?.id
      });
      return res.json({ ok: true, ...resultado });
    } catch (error) {
      return responderErro(res, error, 'Erro ao salvar a disponibilidade dos tipos.');
    }
  }
};
