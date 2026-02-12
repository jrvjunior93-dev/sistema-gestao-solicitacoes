const { ConfiguracaoSistema } = require('../models');

const CHAVE_TEMA = 'TEMA_SISTEMA';
const CHAVE_AREAS_OBRA = 'AREAS_OBRA_VISIVEIS';
const CHAVE_AREAS_POR_SETOR_ORIGEM = 'AREAS_POR_SETOR_ORIGEM';
const CHAVE_SETORES_VISIVEIS_POR_USUARIO = 'SETORES_VISIVEIS_POR_USUARIO';

function parseJsonOrDefault(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

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

function normalizarListaSetores(lista) {
  if (!Array.isArray(lista)) return [];
  return [...new Set(
    lista
      .map(item => String(item || '').trim().toUpperCase())
      .filter(Boolean)
  )];
}

module.exports = {
  async getTema(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TEMA },
        order: [['id', 'DESC']]
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

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TEMA },
        order: [['id', 'DESC']]
      });

      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_TEMA,
          valor
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de tema' });
    }
  }
  ,

  async getAreasObra(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_AREAS_OBRA },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({ areas: [] });
      }

      const data = parseJsonOrDefault(item.valor, { areas: [] });
      const areas = Array.isArray(data?.areas) ? data.areas : [];
      return res.json({ areas });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de areas' });
    }
  },

  async updateAreasObra(req, res) {
    try {
      const raw = Array.isArray(req.body?.areas) ? req.body.areas : [];
      const areas = [...new Set(raw
        .map(item => String(item || '').trim().toUpperCase())
        .filter(Boolean)
      )];

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_AREAS_OBRA },
        order: [['id', 'DESC']]
      });

      if (existente) {
        await existente.update({ valor: JSON.stringify({ areas }) });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_AREAS_OBRA,
          valor: JSON.stringify({ areas })
        });
      }

      return res.json({ ok: true, areas });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de areas' });
    }
  }
  ,

  async getAreasPorSetorOrigem(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_AREAS_POR_SETOR_ORIGEM },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({ regras: {} });
      }

      const data = parseJsonOrDefault(item.valor, { regras: {} });
      const regras = data?.regras && typeof data.regras === 'object' ? data.regras : {};
      return res.json({ regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de areas por setor' });
    }
  },

  async updateAreasPorSetorOrigem(req, res) {
    try {
      const input = req.body?.regras && typeof req.body.regras === 'object'
        ? req.body.regras
        : {};

      const regras = {};
      Object.entries(input).forEach(([origem, destinos]) => {
        const key = String(origem || '').trim().toUpperCase();
        if (!key) return;
        regras[key] = normalizarListaSetores(destinos);
      });

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_AREAS_POR_SETOR_ORIGEM },
        order: [['id', 'DESC']]
      });

      const valor = JSON.stringify({ regras });
      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_AREAS_POR_SETOR_ORIGEM,
          valor
        });
      }

      return res.json({ ok: true, regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de areas por setor' });
    }
  },

  async getSetoresVisiveisPorUsuario(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_SETORES_VISIVEIS_POR_USUARIO },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({ regras: {} });
      }

      const data = parseJsonOrDefault(item.valor, { regras: {} });
      const regras = data?.regras && typeof data.regras === 'object' ? data.regras : {};
      return res.json({ regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de visibilidade por usuario' });
    }
  },

  async updateSetoresVisiveisPorUsuario(req, res) {
    try {
      const input = req.body?.regras && typeof req.body.regras === 'object'
        ? req.body.regras
        : {};

      const regras = {};
      Object.entries(input).forEach(([usuarioId, setores]) => {
        const key = String(usuarioId || '').trim();
        if (!key) return;
        regras[key] = normalizarListaSetores(setores);
      });

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_SETORES_VISIVEIS_POR_USUARIO },
        order: [['id', 'DESC']]
      });

      const valor = JSON.stringify({ regras });
      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_SETORES_VISIVEIS_POR_USUARIO,
          valor
        });
      }

      return res.json({ ok: true, regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de visibilidade por usuario' });
    }
  }
};
