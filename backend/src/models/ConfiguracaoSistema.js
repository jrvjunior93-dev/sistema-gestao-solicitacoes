module.exports = (sequelize, DataTypes) => {
  const ConfiguracaoSistema = sequelize.define('ConfiguracaoSistema', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    chave: {
      type: DataTypes.STRING,
      allowNull: false
    },
    valor: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'configuracoes_sistema',
    timestamps: true
  });

  return ConfiguracaoSistema;
};
