'use strict';

module.exports = (sequelize, DataTypes) => sequelize.define('CrMedicaoSemRegistro', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  competencia_id: { type: DataTypes.INTEGER, allowNull: false },
  justificativa: { type: DataTypes.TEXT, allowNull: false },
  registrado_por: { type: DataTypes.INTEGER, allowNull: false },
  registrado_em: { type: DataTypes.DATE, allowNull: false }
}, {
  tableName: 'cr_medicao_sem_registro',
  timestamps: true,
  indexes: [
    { name: 'uq_cr_medicao_sem_registro_competencia', unique: true, fields: ['competencia_id'] }
  ]
});
