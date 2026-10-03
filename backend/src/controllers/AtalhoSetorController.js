// =====================================================================
// ATALHOS PADRÃO POR SETOR
// ---------------------------------------------------------------------
// CRUD dos atalhos sugeridos/obrigatórios por setor. `destino_id` é o id
// do destino na fonte única de navegação do frontend — rótulo, ícone,
// rota e permissão vêm sempre de lá; aqui vive só a associação.
// Leitura liberada para qualquer autenticado (o frontend precisa compor
// os atalhos do usuário); escrita gateada nas rotas pela mesma área de
// configurações das demais telas do fluxo. Máximo de 2 OBRIGATÓRIOS por
// setor (validado aqui): obrigatório = não removível pelo usuário.
// =====================================================================
const { SetorAtalhoPadrao, Sequelize } = require('../models');

const { Op } = Sequelize;

const MAX_OBRIGATORIOS_POR_SETOR = 2;

function normalizarPayload(body = {}) {
  const setor = String(body.setor || '').trim().toUpperCase().slice(0, 120);
  const destinoId = String(body.destino_id || '').trim().slice(0, 120);
  const obrigatorio = Boolean(body.obrigatorio);
  const posicao = Number.isFinite(Number(body.posicao)) ? Number(body.posicao) : 0;
  const ativo = body.ativo === undefined ? true : Boolean(body.ativo);

  if (!setor) return { erro: 'Informe o setor' };
  if (!destinoId || !/^[a-z0-9-]+$/.test(destinoId)) {
    return { erro: 'Informe o destino (id da fonte de navegacao)' };
  }

  return { valores: { setor, destino_id: destinoId, obrigatorio, posicao, ativo } };
}

async function validarLimiteObrigatorios({ setor, obrigatorio, ignorarId = null }) {
  if (!obrigatorio) return null;
  const where = { setor, obrigatorio: true, ativo: true };
  const existentes = await SetorAtalhoPadrao.count({
    where: ignorarId ? { ...where, id: { [Op.ne]: ignorarId } } : where
  });
  if (existentes >= MAX_OBRIGATORIOS_POR_SETOR) {
    return `Cada setor pode ter no maximo ${MAX_OBRIGATORIOS_POR_SETOR} atalhos obrigatorios`;
  }
  return null;
}

module.exports = {
  MAX_OBRIGATORIOS_POR_SETOR,

  async index(req, res) {
    try {
      const where = {};
      const setor = String(req.query.setor || '').trim().toUpperCase();
      if (setor) where.setor = setor;
      const itens = await SetorAtalhoPadrao.findAll({
        where,
        order: [['setor', 'ASC'], ['obrigatorio', 'DESC'], ['posicao', 'ASC'], ['id', 'ASC']]
      });
      return res.json(itens);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar atalhos por setor' });
    }
  },

  async store(req, res) {
    try {
      const { erro, valores } = normalizarPayload(req.body);
      if (erro) return res.status(400).json({ error: erro });

      const duplicado = await SetorAtalhoPadrao.findOne({
        where: { setor: valores.setor, destino_id: valores.destino_id }
      });
      if (duplicado) {
        return res.status(409).json({ error: 'Este destino ja e atalho padrao deste setor' });
      }

      const erroLimite = await validarLimiteObrigatorios(valores);
      if (erroLimite) return res.status(400).json({ error: erroLimite });

      const criado = await SetorAtalhoPadrao.create(valores);
      return res.status(201).json(criado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar atalho padrao' });
    }
  },

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const registro = Number.isInteger(id) && id > 0
        ? await SetorAtalhoPadrao.findByPk(id)
        : null;
      if (!registro) return res.status(404).json({ error: 'Atalho nao encontrado' });

      const { erro, valores } = normalizarPayload({ ...registro.toJSON(), ...req.body });
      if (erro) return res.status(400).json({ error: erro });

      const erroLimite = await validarLimiteObrigatorios({ ...valores, ignorarId: id });
      if (erroLimite) return res.status(400).json({ error: erroLimite });

      await registro.update(valores);
      return res.json(registro);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar atalho padrao' });
    }
  },

  async destroy(req, res) {
    try {
      const id = Number(req.params.id);
      const removidos = Number.isInteger(id) && id > 0
        ? await SetorAtalhoPadrao.destroy({ where: { id } })
        : 0;
      if (!removidos) return res.status(404).json({ error: 'Atalho nao encontrado' });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir atalho padrao' });
    }
  }
};
