module.exports = (sequelize, DataTypes) => {
  return sequelize.define('EtapaSetor', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    setor: {
      type: DataTypes.STRING,
      allowNull: false
    },

    nome: {
      type: DataTypes.STRING,
      allowNull: false
    },

    ordem: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'etapas_setor',
    timestamps: true
  });
};
