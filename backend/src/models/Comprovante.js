module.exports = (sequelize, DataTypes) => {
  const Comprovante = sequelize.define('Comprovante', {
    nome_original: {
      type: DataTypes.STRING,
      allowNull: false
    },

    caminho_arquivo: {
      type: DataTypes.STRING,
      allowNull: false
    },

    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    obra_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    valor: {
      type: DataTypes.DECIMAL(12,2),
      allowNull: true
    },

    status: {
      type: DataTypes.STRING,
      defaultValue: 'PENDENTE'
    }
  });

  return Comprovante;
};
