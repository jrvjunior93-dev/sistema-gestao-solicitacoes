module.exports = (sequelize, DataTypes) => {
  const TipoSolicitacao = sequelize.define('TipoSolicitacao', {
    nome: {
      type: DataTypes.STRING,
      allowNull: false
    },
    codigo_interno: {
      type: DataTypes.STRING,
      allowNull: true
    },
    comportamento: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    disponivel_para_obras: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'tipo_solicitacao',   // 🔴 NOME REAL DA TABELA
    freezeTableName: true,            // 🔴 NÃO pluralizar
    timestamps: true
  });

  return TipoSolicitacao;
};
