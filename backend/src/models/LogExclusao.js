module.exports = (sequelize, DataTypes) => {
  const LogExclusao = sequelize.define(
    'LogExclusao',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      entidade: {
        type: DataTypes.STRING(60),
        allowNull: false
      },
      entidade_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      solicitacao_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      perfil: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      setor: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      motivo: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      payload_json: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'logs_exclusao',
      timestamps: true
    }
  );

  return LogExclusao;
};
