module.exports = (sequelize, DataTypes) => sequelize.define('SolicitacaoCadastroObraUsuario', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  solicitacao_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  usuario_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  criado_por: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'solicitacao_cadastro_obra_usuarios',
  freezeTableName: true,
  timestamps: true,
  indexes: [
    { unique: true, fields: ['solicitacao_id', 'usuario_id'] },
    { fields: ['usuario_id'] }
  ]
});
