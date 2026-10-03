'use strict';

module.exports = (sequelize, DataTypes) => sequelize.define('CrDilatacao', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  obra_id: { type: DataTypes.INTEGER, allowNull: false },
  competencia_id: { type: DataTypes.INTEGER, allowNull: false },
  dias: { type: DataTypes.INTEGER, allowNull: false },
  motivo: { type: DataTypes.TEXT, allowNull: false },
  situacao: { type: DataTypes.ENUM('SOLICITADA', 'APROVADA', 'NEGADA'), allowNull: false, defaultValue: 'SOLICITADA' },
  solicitado_por: { type: DataTypes.INTEGER, allowNull: false },
  decidido_por: { type: DataTypes.INTEGER, allowNull: true },
  decidido_em: { type: DataTypes.DATE, allowNull: true },
  observacao_decisao: { type: DataTypes.TEXT, allowNull: true },
  prazo_anterior: { type: DataTypes.DATE, allowNull: true },
  prazo_novo: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'cr_dilatacoes',
  timestamps: true,
  indexes: [
    { name: 'idx_cr_dilatacoes_competencia_situacao', fields: ['competencia_id', 'situacao'] },
    { name: 'idx_cr_dilatacoes_obra_criacao', fields: ['obra_id', 'createdAt'] }
  ]
});
