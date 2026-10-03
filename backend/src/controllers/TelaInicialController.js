// =====================================================================
// TELA INICIAL DO USUÁRIO — endpoints
// ---------------------------------------------------------------------
// GET  /me/tela-inicial          → escolha atual (validada) + telas
//                                  que o usuário pode escolher
// PUT  /me/tela-inicial {id}     → define (validação no backend)
// DELETE /me/tela-inicial        → limpa (volta para a Home)
//
// A validação usa a fonte única compilada + o MESMO objeto de sessão
// que o frontend recebe (buildSessionUser) — permissão conferida no
// servidor, não só na tela.
// =====================================================================
const { buildSessionUser } = require('./AuthController');
const {
  listarTelasEscolhiveis,
  obterTelaInicialValidada,
  salvarTelaInicial,
  limparTelaInicial
} = require('../services/telaInicialService');

module.exports = {
  async get(req, res) {
    try {
      const sessionUser = await buildSessionUser(req.user);
      return res.json({
        tela_inicial: await obterTelaInicialValidada(sessionUser),
        telas: listarTelasEscolhiveis(sessionUser)
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar tela inicial' });
    }
  },

  async put(req, res) {
    try {
      const sessionUser = await buildSessionUser(req.user);
      const resultado = await salvarTelaInicial(sessionUser, req.body?.id);
      if (!resultado.ok) {
        return res.status(400).json({ error: resultado.motivo });
      }
      return res.json({ ok: true, tela_inicial: resultado.tela });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar tela inicial' });
    }
  },

  async delete(req, res) {
    try {
      await limparTelaInicial(req.user.id);
      return res.json({ ok: true, tela_inicial: null });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao limpar tela inicial' });
    }
  }
};
