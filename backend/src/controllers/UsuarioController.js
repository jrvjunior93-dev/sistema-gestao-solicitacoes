const bcrypt = require('bcryptjs');

const {
  User,
  Cargo,
  Setor,
  Obra,
  UsuarioObra
} = require('../models');

module.exports = {

  // =====================================================
  // LISTAR USUÁRIOS
  // =====================================================
  async index(req, res) {
    try {

      const usuarios = await User.findAll({
        attributes: { exclude: ['senha'] }, // 🔐 nunca retornar senha
        include: [
          {
            model: Cargo,
            as: 'cargoInfo'
          },
          {
            model: Setor,
            as: 'setor'
          },
          {
            model: UsuarioObra,
            as: 'vinculos',
            include: [
              {
                model: Obra,
                as: 'obra'
              }
            ]
          }
        ],
        order: [['nome', 'ASC']]
      });

      return res.json(usuarios);

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao listar usuários'
      });
    }
  },

  // =====================================================
  // CRIAR USUÁRIO
  // =====================================================
  async create(req, res) {
    try {

      const {
        nome,
        email,
        senha,
        cargo_id,
        setor_id,
        perfil,
        obras = []
      } = req.body;

      if (!nome || !email || !senha || !perfil) {
        return res.status(400).json({
          error: 'Nome, email, senha e perfil são obrigatórios'
        });
      }

      // 🔎 Verifica email duplicado
      const existe = await User.findOne({ where: { email } });

      if (existe) {
        return res.status(400).json({
          error: 'Email já cadastrado'
        });
      }

      // 🔐 Criptografa senha
      const senhaHash = await bcrypt.hash(senha, 10);

      const usuario = await User.create({
        nome,
        email,
        senha: senhaHash,
        cargo_id,
        setor_id,
        perfil,
        ativo: true
      });

      // 🔗 Vínculo obras
      for (const obra_id of obras) {
        await UsuarioObra.create({
          user_id: usuario.id,
          obra_id
        });
      }

      return res.status(201).json({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        ativo: usuario.ativo
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao criar usuário'
      });
    }
  },

  // =====================================================
  // ATUALIZAR USUÁRIO
  // =====================================================
  async update(req, res) {
    try {

      const { id } = req.params;

      const {
        nome,
        email,
        senha,
        cargo_id,
        setor_id,
        perfil,
        obras = [],
        ativo
      } = req.body;

      const usuario = await User.findByPk(id);

      if (!usuario) {
        return res.status(404).json({
          error: 'Usuário não encontrado'
        });
      }

      const dadosUpdate = {
        nome,
        email,
        cargo_id,
        setor_id,
        perfil,
        ativo
      };

      // 🔐 Troca senha se enviada
      if (senha && senha.trim()) {
        dadosUpdate.senha = await bcrypt.hash(senha, 10);
      }

      await usuario.update(dadosUpdate);

      // 🔁 Atualizar obras
      await UsuarioObra.destroy({
        where: { user_id: id }
      });

      for (const obra_id of obras) {
        await UsuarioObra.create({
          user_id: id,
          obra_id
        });
      }

      return res.json({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        ativo: usuario.ativo
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao atualizar usuário'
      });
    }
  },

  // =====================================================
  // ATIVAR USUÁRIO
  // =====================================================
  async ativar(req, res) {
    try {

      await User.update(
        { ativo: true },
        { where: { id: req.params.id } }
      );

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao ativar usuário'
      });
    }
  },

  // =====================================================
  // DESATIVAR USUÁRIO
  // =====================================================
  async desativar(req, res) {
    try {

      await User.update(
        { ativo: false },
        { where: { id: req.params.id } }
      );

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao desativar usuário'
      });
    }
  }

};
