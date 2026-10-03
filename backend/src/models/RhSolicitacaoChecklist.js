/**
 * A PROMESSA: o que o solicitante marcou que vai anexar.
 *
 * Grava QUEM marcou e QUANDO, e nao um booleano — promessa sem dono nao cobra ninguem. E o que o
 * portao da conclusao le: marcou, entrega.
 */
module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhSolicitacaoChecklist',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
    documento_tipo_id: { type: DataTypes.INTEGER, allowNull: false },
    marcado_por: { type: DataTypes.INTEGER, allowNull: true },
    marcado_em: { type: DataTypes.DATE, allowNull: true }
  },
  {
    tableName: 'rh_solicitacao_checklist',
    timestamps: true
  }
);
