const treinamentoService = require('../services/treinamentoService');
const videoService = require('../services/treinamentoVideoService');
const {
  canManageTreinamento,
  canPublishTreinamento,
  canViewTreinamentoRelatorios
} = require('../services/authorizationService');

function responderErro(res, error, fallback) {
  return res.status(error.statusCode || 500).json({
    error: error.message || fallback
  });
}

async function userCanManage(req) {
  return canManageTreinamento(req.user);
}

module.exports = {
  async relatorioVideo(req, res) {
    try {
      if (!(await canViewTreinamentoRelatorios(req.user))) return res.status(403).json({ error: 'Acesso negado aos relatorios de treinamento.' });
      return res.json(await videoService.relatorio(req.query));
    } catch (error) { return responderErro(res, error, 'Erro ao consultar rastreio'); }
  },
  async iniciarVideo(req, res) {
    try {
      return res.json(await videoService.iniciar(req.params.id, req.user, req.dev_user_switch?.actor_id, req.body, await userCanManage(req)));
    } catch (error) { return responderErro(res, error, 'Erro ao iniciar rastreio'); }
  },
  async registrarVideo(req, res) {
    try {
      return res.json(await videoService.registrar(req.params.id, req.user, req.dev_user_switch?.actor_id, req.body, await userCanManage(req)));
    } catch (error) { return responderErro(res, error, 'Erro ao registrar reproducao'); }
  },
  async resumo(req, res) {
    try {
      const canManage = await userCanManage(req);
      const resumo = await treinamentoService.resumoConteudos({ canManage });
      return res.json(resumo);
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar resumo de treinamento');
    }
  },

  async index(req, res) {
    try {
      const canManage = await userCanManage(req);
      const data = await treinamentoService.listarConteudos({
        query: req.query,
        canManage
      });
      return res.json(data);
    } catch (error) {
      return responderErro(res, error, 'Erro ao listar conteudos de treinamento');
    }
  },

  async show(req, res) {
    try {
      const canManage = await userCanManage(req);
      const data = await treinamentoService.obterConteudo(req.params.id, { canManage });
      return res.json(data);
    } catch (error) {
      return responderErro(res, error, 'Erro ao buscar conteudo de treinamento');
    }
  },

  async create(req, res) {
    try {
      const data = await treinamentoService.criarConteudo(req.body, req.user?.id);
      return res.status(201).json(data);
    } catch (error) {
      return responderErro(res, error, 'Erro ao criar conteudo de treinamento');
    }
  },

  async update(req, res) {
    try {
      const data = await treinamentoService.atualizarConteudo(req.params.id, req.body, req.user?.id);
      return res.json(data);
    } catch (error) {
      return responderErro(res, error, 'Erro ao atualizar conteudo de treinamento');
    }
  },

  async destroy(req, res) {
    try {
      const data = await treinamentoService.arquivarConteudo(req.params.id, req.user?.id);
      return res.json(data);
    } catch (error) {
      return responderErro(res, error, 'Erro ao arquivar conteudo de treinamento');
    }
  },

  async upload(req, res) {
    try {
      const data = await treinamentoService.uploadConteudoArquivo(
        req.params.id,
        req.file,
        req.body?.tipo_arquivo,
        req.user?.id
      );
      return res.json(data);
    } catch (error) {
      return responderErro(res, error, 'Erro ao enviar arquivo de treinamento');
    }
  },

  async arquivoUrl(req, res) {
    try {
      const canManage = await userCanManage(req);
      const data = await treinamentoService.assinarArquivo(req.params.id, req.query?.tipo_arquivo, { canManage });
      return res.json(data);
    } catch (error) {
      return responderErro(res, error, 'Erro ao assinar arquivo de treinamento');
    }
  },

  async publicar(req, res) {
    try {
      if (!(await canPublishTreinamento(req.user))) {
        return res.status(403).json({ error: 'Acesso negado para publicar treinamento' });
      }
      const data = await treinamentoService.atualizarConteudo(
        req.params.id,
        { status: 'PUBLICADO' },
        req.user?.id
      );
      return res.json(data);
    } catch (error) {
      return responderErro(res, error, 'Erro ao publicar conteudo de treinamento');
    }
  },

  async leitura(req, res) {
    try {
      const data = await treinamentoService.marcarLeitura(
        req.params.id,
        req.user?.id,
        Boolean(req.body?.concluido)
      );
      return res.json(data);
    } catch (error) {
      return responderErro(res, error, 'Erro ao registrar leitura de treinamento');
    }
  }
};
