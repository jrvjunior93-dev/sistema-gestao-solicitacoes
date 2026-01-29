module.exports = function permit(perfisPermitidos = []) {
  return (req, res, next) => {
    const { perfil } = req.user;

    if (!perfisPermitidos.includes(perfil)) {
      return res.status(403).json({
        error: 'Acesso negado para este perfil'
      });
    }

    next();
  };
};
