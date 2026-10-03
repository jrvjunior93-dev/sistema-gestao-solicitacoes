module.exports = (sequelize, DataTypes) => {
  const ObraTipoApropriacaoPadrao = sequelize.define(
    'ObraTipoApropriacaoPadrao',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      obra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      tipo_solicitacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      apropriacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      criado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      atualizado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    },
    {
      tableName: 'obra_tipo_apropriacao_padrao',
      timestamps: true
    }
  );

  return ObraTipoApropriacaoPadrao;
};
