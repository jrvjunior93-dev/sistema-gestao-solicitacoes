'use strict';

module.exports = (sequelize, DataTypes) => sequelize.define('CrPrazoObra', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  obra_id: { type: DataTypes.INTEGER, allowNull: false },
  planejamento_dia_abertura: { type: DataTypes.INTEGER, allowNull: false },
  planejamento_dia_fechamento: { type: DataTypes.INTEGER, allowNull: false },
  medicao_prazo_dias: { type: DataTypes.INTEGER, allowNull: false },
  atualizado_por: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'cr_prazos_obra',
  timestamps: true,
  indexes: [
    { name: 'uq_cr_prazos_obra_obra', unique: true, fields: ['obra_id'] }
  ]
});
