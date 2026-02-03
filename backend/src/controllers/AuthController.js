const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Setor } = require('../models');

const JWT_SECRET = 'segredo_super_secreto';

module.exports = {

  async login(req, res) {
    try {

      const { email, senha } = req.body;

      const user = await User.findOne({
        where: { email },
        include: [
          {
            model: Setor,
            as: 'setor',
            attributes: ['id', 'nome', 'codigo']
          }
        ]
      });

      if (!user)
        return res.status(401).json({ error: 'Usuário não encontrado' });

      if (!user.senha)
        return res.status(401).json({ error: 'Usuário sem senha cadastrada' });

      const ok = await bcrypt.compare(
        String(senha),
        String(user.senha)
      );

      if (!ok)
        return res.status(401).json({ error: 'Senha inválida' });

      const token = jwt.sign(
        {
          id: user.id,
          perfil: user.perfil,
          area: user.setor?.codigo || null,
          setor_id: user.setor_id
        },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      return res.json({
        token,
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          perfil: user.perfil,
          setor_id: user.setor_id,
          setor: user.setor
        }
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro no login' });
    }
  }

};
