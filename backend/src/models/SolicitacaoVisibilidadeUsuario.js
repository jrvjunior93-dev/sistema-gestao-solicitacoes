module.exports = (sequelize, DataTypes) => {
  const SolicitacaoVisibilidadeUsuario = sequelize.define(
    'SolicitacaoVisibilidadeUsuario',
    {
      solicitacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
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
