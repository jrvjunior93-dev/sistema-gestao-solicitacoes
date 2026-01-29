module.exports = (sequelize, DataTypes) => {
  return sequelize.define('StatusArea', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    setor: {
      type: DataTypes.STRING,
      allowNull: false
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false
    },

    observacao: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'status_area',
    timestamps: true
  });
};
