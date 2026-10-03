module.exports = (sequelize, DataTypes) => sequelize.define('SolicitacaoCadastroObraDados', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
  tipo_obra: { type: DataTypes.STRING(20), allowNull: false },
  fase_obra: { type: DataTypes.STRING(30), allowNull: false },
  valor_obra: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  responsavel_tecnico: { type: DataTypes.STRING(160), allowNull: true },
  responsavel_tecnico_id: { type: DataTypes.INTEGER, allowNull: true },
  endereco: { type: DataTypes.TEXT, allowNull: false },
  documentacao_pendente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  obra_cadastrada_id: { type: DataTypes.INTEGER, allowNull: true },
  obra_cadastrada_por: { type: DataTypes.INTEGER, allowNull: true },
  obra_cadastrada_em: { type: DataTypes.DATE, allowNull: true },
  criado_por: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'solicitacao_cadastro_obra_dados',
  freezeTableName: true,
  timestamps: true,
  indexes: [
    { unique: true, fields: ['solicitacao_id'] },
    { unique: true, fields: ['obra_cadastrada_id'] }
  ]
});
