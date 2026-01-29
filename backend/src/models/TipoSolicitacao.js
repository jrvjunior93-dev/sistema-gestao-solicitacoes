module.exports = (sequelize, DataTypes) => {
  const TipoSolicitacao = sequelize.define('TipoSolicitacao', {
    nome: {
      type: DataTypes.STRING,
      allowNull: false
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
