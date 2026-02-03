const { Setor, SetorPermissao } = require('../models');

module.exports = {
  async index(req, res) {
    try {
      const { setor } = req.query;

      let setores = await Setor.findAll({
        attributes: ['id', 'codigo', 'nome'],
        order: [['nome', 'ASC']]
      });

      if (setor) {
        const setorUpper = String(setor).toUpperCase();
        setores = setores.filter(s => {
          const codigo = String(s.codigo || '').toUpperCase();
          const nome = String(s.nome || '').toUpperCase();
          return codigo === setorUpper || nome === setorUpper || String(s.id) === String(setor);
        });
      }

      const permissoes = await SetorPermissao.findAll();
      const mapa = new Map();
      permissoes.forEach(p => {
        if (p.setor) {
          mapa.set(String(p.setor).toUpperCase(), p);
        }
      });

      const resultado = setores.map(s => {
        const tokens = [
          String(s.codigo || '').toUpperCase(),
          String(s.nome || '').toUpperCase(),
          String(s.id)
        ];
        let perm = null;
        for (const t of tokens) {
          if (mapa.has(t)) {
            perm = mapa.get(t);
            break;
          }
        }
        return {
          setor_id: s.id,
          codigo: s.codigo,
          nome: s.nome,
          usuario_pode_assumir: perm?.usuario_pode_assumir || false,
          usuario_pode_atribuir: perm?.usuario_pode_atribuir || false
        };
      });

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar permissoes do setor' });
    }
  },

  async upsert(req, res) {
    try {
      const { setor_id, setor, usuario_pode_assumir, usuario_pode_atribuir } = req.body;
      let setorRow = null;

      if (setor_id) {
        setorRow = await Setor.findByPk(setor_id, {
          attributes: ['id', 'codigo', 'nome']
        });
      } else if (setor) {
        setorRow = await Setor.findOne({
          where: {
            [Op.or]: [
              { codigo: setor },
              { nome: setor },
              { id: setor }
            ]
          },
          attributes: ['id', 'codigo', 'nome']
        });
      }

      if (!setorRow) {
        return res.status(404).json({ error: 'Setor nao encontrado' });
      }

      const setorKey = setorRow.codigo || setorRow.nome;
      if (!setorKey) {
        return res.status(400).json({ error: 'Setor invalido' });
      }

      const [registro] = await SetorPermissao.upsert({
        setor: setorKey,
        usuario_pode_assumir: !!usuario_pode_assumir,
        usuario_pode_atribuir: !!usuario_pode_atribuir
      });

      return res.json({
        setor_id: setorRow.id,
        codigo: setorRow.codigo,
        nome: setorRow.nome,
        usuario_pode_assumir: registro?.usuario_pode_assumir ?? !!usuario_pode_assumir,
        usuario_pode_atribuir: registro?.usuario_pode_atribuir ?? !!usuario_pode_atribuir
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar permissao do setor' });
    }
  }
};
