module.exports = (sequelize, DataTypes) => {
  const SolicitacaoVisibilidadeUsuario = sequelize.define(
    'SolicitacaoVisibilidadeUsuario',
    {
      oculto: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    },
    {
      tableName: 'solicitacao_visibilidade_usuario'
    }
  );

  return SolicitacaoVisibilidadeUsuario;
};
