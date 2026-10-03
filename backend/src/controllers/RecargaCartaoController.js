const {
  decidirPrestacao,
  editarRecargaPendente,
  editarRateiosPrestacaoGeo,
  listarAdmin,
  listarMeusCartoes,
  obterContextoCartao,
  obterContextoSolicitacao,
  salvarCartao,
  salvarPrestacao
} = require('../services/recargaCartaoService');
const {
  assertPodeInteragirSolicitacao,
  assertPodeVisualizarSolicitacao,
  montarContextoInteracao
} = require('../services/solicitacaoRetornoService');

function responderErro(res, error, fallback) {
  console.error(error);
  return res.status(Number(error?.statusCode) || 500).json({
    error: error?.message || fallback,
    code: error?.code || undefined
  });
}

module.exports = {
  async meusCartoes(req, res) {
    try {
      return res.json({ cartoes: await listarMeusCartoes(req.user) });
    } catch (error) {
      return responderErro(res, error, 'Erro ao buscar os cartoes vinculados ao usuario.');
    }
  },

  async contextoCartao(req, res) {
    try {
      const contexto = await obterContextoCartao(req.params.id, req.user);
      const solicitacaoAnterior = contexto?.ultima_recarga?.solicitacao || null;
      if (solicitacaoAnterior) {
        contexto.contexto_interacao = await montarContextoInteracao(req, solicitacaoAnterior);
      }
      return res.json(contexto);
    } catch (error) {
      return responderErro(res, error, 'Erro ao conferir a ultima recarga do cartao.');
    }
  },

  async contextoSolicitacao(req, res) {
    try {
      await assertPodeVisualizarSolicitacao(req, req.params.id);
      return res.json(await obterContextoSolicitacao(req.params.id, req.user, {
        acessoSolicitacaoValidado: true
      }));
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar o fluxo da recarga.');
    }
  },

  async enviarPrestacao(req, res) {
    try {
      await assertPodeInteragirSolicitacao(req, req.params.id);
      const recarga = await salvarPrestacao(req.params.id, req.body || {}, req.user);
      return res.json({ recarga });
    } catch (error) {
      return responderErro(res, error, 'Erro ao salvar a prestacao de contas.');
    }
  },

  async editarPendente(req, res) {
    try {
      await assertPodeInteragirSolicitacao(req, req.params.id);
      const recarga = await editarRecargaPendente(req.params.id, req.body || {}, req.user);
      return res.json({ recarga });
    } catch (error) {
      return responderErro(res, error, 'Erro ao editar a solicitacao de recarga.');
    }
  },

  async decidirPrestacao(req, res) {
    try {
      await assertPodeInteragirSolicitacao(req, req.params.id);
      const recarga = await decidirPrestacao(req.params.id, req.body || {}, req.user);
      return res.json({ recarga });
    } catch (error) {
      return responderErro(res, error, 'Erro ao decidir a prestacao de contas.');
    }
  },

  async editarRateiosPrestacao(req, res) {
    try {
      await assertPodeInteragirSolicitacao(req, req.params.id);
      const recarga = await editarRateiosPrestacaoGeo(req.params.id, req.body || {}, req.user);
      return res.json({ recarga });
    } catch (error) {
      return responderErro(res, error, 'Erro ao corrigir obra e apropriacao da prestacao.');
    }
  },

  async adminIndex(req, res) {
    try {
      return res.json(await listarAdmin(req.user));
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar o cadastro de cartoes de recarga.');
    }
  },

  async adminCreate(req, res) {
    try {
      const cartao = await salvarCartao(null, req.body || {}, req.user);
      return res.status(201).json(cartao);
    } catch (error) {
      return responderErro(res, error, 'Erro ao cadastrar o cartao de recarga.');
    }
  },

  async adminUpdate(req, res) {
    try {
      return res.json(await salvarCartao(req.params.id, req.body || {}, req.user));
    } catch (error) {
      return responderErro(res, error, 'Erro ao atualizar o cartao de recarga.');
    }
  }
};
