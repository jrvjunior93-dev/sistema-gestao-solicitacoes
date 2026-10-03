module.exports = (sequelize, DataTypes) => {
  const Anexo = sequelize.define('Anexo', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // PI-16: a qual MEDICAO este registro pertence. Com uma solicitacao por contrato, sem isto
    // os documentos e comentarios de todas as medicoes viram uma pilha unica sem dono. Nulo
    // quando pertence a propria solicitacao (abertura, minuta, contrato assinado) e em toda a
    // trilha legada.
    medicao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    tipo: {
      type: DataTypes.STRING,
      allowNull: false
    },

    nome_original: {
      type: DataTypes.STRING,
      allowNull: false
    },

    caminho_arquivo: {
      type: DataTypes.STRING,
      allowNull: false
    },

    area_origem: {
      type: DataTypes.STRING,
      allowNull: false
    },

    uploaded_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    }

  }, {
    tableName: 'anexos',
    timestamps: true
  });

  return Anexo;
};
