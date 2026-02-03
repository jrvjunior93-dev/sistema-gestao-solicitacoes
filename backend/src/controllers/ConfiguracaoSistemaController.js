const { ConfiguracaoSistema } = require('../models');

const CHAVE_TEMA = 'TEMA_SISTEMA';

function getTemaPadrao() {
  return {
    palette: {
      bg: '#f5f7fb',
      surface: '#ffffff',
      border: '#e3e7ef',
      text: '#0f172a',
      muted: '#64748b',
      primary: '#2563eb',
      primary600: '#1d4ed8',
      secondary: '#0f766e',
      warning: '#d97706',
      danger: '#dc2626',
      success: '#16a34a'
    },
    actions: {
      ver: '#2563eb',
      assumir: '#16a34a',
      atribuir: '#7c3aed',
      enviar: '#f97316',
      ocultar: '#6b7280'
    },
    status: {
      global: {
        PENDENTE: '#64748b',
        EM_ANALISE: '#0ea5e9',
        AGUARDANDO_AJUSTE: '#f59e0b',
        APROVADA: '#16a34a',
        REJEITADA: '#dc2626',
        CONCLUIDA: '#059669'
      },
      setores: {}
    }
  };
}

module.exports = {
  async getTema(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TEMA }
      });
      if (!item || !item.valor) {
        return res.json(getTemaPadrao());
      }
      try {
        return res.json(JSON.parse(item.valor));
      } catch {
        return res.json(getTemaPadrao());
      }
    } catch (error) {
      console.error(error);
      return res.json(getTemaPadrao());
    }
  },

  async updateTema(req, res) {
    try {
      const tema = req.body || {};
      const valor = JSON.stringify(tema);

      await ConfiguracaoSistema.upsert({
        chave: CHAVE_TEMA,
        valor
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de tema' });
    }
  }
};
