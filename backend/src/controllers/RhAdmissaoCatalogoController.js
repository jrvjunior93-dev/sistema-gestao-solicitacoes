const { RhEmpresaGrupo } = require('../models');
const { userHasAreaPermission } = require('../services/authorizationService');
const { responderErroController } = require('../utils/controllerError');

module.exports = {
  async empresas(req, res) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Usuario nao autenticado' });
      if (!await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.abrir'])) {
        return res.status(403).json({ error: 'Acesso negado ao catalogo de admissao.' });
      }
      // Catalogo para selecionar no pedido; nao reutiliza a consulta administrativa.
      // Filtros recebidos nao podem ampliar atributos, incluir inativas ou associacoes.
      const empresas = await RhEmpresaGrupo.findAll({ where: { ativo: true },
        attributes: ['id', 'nome', 'cnpj'], order: [['nome', 'ASC']], raw: true });
      res.setHeader('Cache-Control', 'no-store');
      return res.json(empresas.map(e => ({ id: e.id, nome: e.nome, cnpj: e.cnpj })));
    } catch (error) {
      return responderErroController(res, error, 'Erro ao consultar empresas para admissao');
    }
  }
};
