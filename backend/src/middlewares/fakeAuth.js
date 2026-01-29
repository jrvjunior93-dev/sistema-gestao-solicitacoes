module.exports = (req, res, next) => {
  // EXEMPLO TEMPORÁRIO
  req.user = {
    id: 2,
    nome: 'Teste1',
    perfil: 'USUARIO', // ADMIN | GEO | COMPRAS | FINANCEIRO
    area: 'FINANCEIRO'
  };

  next();
};
