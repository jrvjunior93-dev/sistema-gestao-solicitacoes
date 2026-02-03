const { Solicitacao, Setor, Sequelize } = require('../models');
const { Op } = Sequelize;

module.exports = {
  async executivo(req, res) {
    try {
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      let areaUsuario = req.user?.area || null;
      let setorAtual = null;

      if (!areaUsuario && req.user?.setor_id) {
        const setorIdRaw = String(req.user.setor_id);
        setorAtual = await Setor.findOne({
          where: {
            [Op.or]: [
              { id: req.user.setor_id },
              { codigo: setorIdRaw },
              { nome: setorIdRaw }
            ]
          },
          attributes: ['id', 'codigo', 'nome']
        });
        areaUsuario = setorAtual?.codigo || setorAtual?.nome || null;
      } else if (!setorAtual && req.user?.setor_id) {
        setorAtual = await Setor.findByPk(req.user.setor_id, {
          attributes: ['id', 'codigo', 'nome']
        });
      }

      if (areaUsuario) {
        areaUsuario = String(areaUsuario).trim().toUpperCase();
      }

      const isAdmin = perfil === 'ADMIN';
      const isSuperadmin = perfil === 'SUPERADMIN';
      const nomeSetor = String(setorAtual?.nome || '').toUpperCase();
      const codigoSetor = String(setorAtual?.codigo || '').toUpperCase();
      const isAdminGEO =
        isAdmin &&
        (areaUsuario === 'GEO' || nomeSetor === 'GEO' || codigoSetor === 'GEO');

      if (!isSuperadmin && !isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const whereBase = { cancelada: false };
      if (isAdmin && !isAdminGEO) {
        if (!areaUsuario) {
          return res.status(403).json({ error: 'Acesso negado' });
        }
        const setoresPermitidos = [];
        if (areaUsuario) setoresPermitidos.push(areaUsuario);
        if (setorAtual?.codigo) setoresPermitidos.push(setorAtual.codigo);
        if (setorAtual?.nome) setoresPermitidos.push(setorAtual.nome);
        if (setorAtual?.id) setoresPermitidos.push(String(setorAtual.id));
        const setoresUnicos = Array.from(new Set(setoresPermitidos.filter(Boolean)));
        whereBase.area_responsavel = { [Op.in]: setoresUnicos };
      }


      /**
       * 🔹 TOTAL GERAL
       */
      const total = await Solicitacao.count({
        where: whereBase
      });

      /**
       * 🔹 POR STATUS
       */
      const porStatus = await Solicitacao.findAll({
        attributes: [
          'status_global',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'total']
        ],
        where: whereBase,
        group: ['status_global']
      });

      /**
       * 🔹 POR ÁREA
       */
      const porAreaRaw = await Solicitacao.findAll({
        attributes: [
          'area_responsavel',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'total']
        ],
        where: whereBase,
        group: ['area_responsavel']
      });
      const setores = await Setor.findAll({
        attributes: ['codigo', 'nome']
      });
      const mapaSetores = new Map();
      setores.forEach(s => {
        if (s.codigo) {
          mapaSetores.set(String(s.codigo).toUpperCase(), s.nome);
        }
        if (s.nome) {
          mapaSetores.set(String(s.nome).toUpperCase(), s.nome);
        }
      });
      const porArea = porAreaRaw.map(item => {
        const area = String(item.area_responsavel || '').toUpperCase();
        const nome = mapaSetores.get(area) || item.area_responsavel;
        return {
          area_responsavel: nome,
          total: item.get('total')
        };
      });

      /**
       * 🔹 VALOR TOTAL POR STATUS
       */
      const valoresPorStatus = await Solicitacao.findAll({
        attributes: [
          'status_global',
          [Sequelize.fn('SUM', Sequelize.col('valor')), 'valor_total']
        ],
        where: {
          ...whereBase,
          valor: { [Op.not]: null }
        },
        group: ['status_global']
      });

      /**
       * 🔹 SLA MÉDIO (em dias)
       * Diferença entre createdAt e updatedAt
       */
      const slaMedio = await Solicitacao.findAll({
        attributes: [
          'status_global',
          [
            Sequelize.fn(
              'AVG',
              Sequelize.literal('TIMESTAMPDIFF(MINUTE, createdAt, updatedAt)')
            ),
            'sla_minutos'
          ]
        ],
        where: whereBase,
        group: ['status_global']
      });

      return res.json({
        total,
        porStatus,
        porArea,
        valoresPorStatus,
        slaMedio
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao carregar dashboard executivo'
      });
    }
  }
};
