module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ConversaInterna', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    assunto: {
      type: DataTypes.STRING,
      allowNull: false
    },

    criado_por_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    destinatario_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    status: {
      type: DataTypes.ENUM('ABERTA', 'CONCLUIDA'),
      allowNull: false,
      defaultValue: 'ABERTA'
    },

    concluida_por_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    concluida_em: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'conversas_internas',
    timestamps: true
  });
};
