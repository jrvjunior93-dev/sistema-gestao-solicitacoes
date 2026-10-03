/**
 * Quais documentos cada tipo de pedido do DP cobra, e com que forca.
 *
 * `solicitacao_subtipo` NULO vale para todos os subtipos do tipo; preenchido, sobrepoe a linha nula
 * naquele subtipo. E o que faz o checklist do escopo caber sem duplicar lista — ver
 * `scripts/dados/seedCatalogoDeDocumentosDoDp.js`.
 */
module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhDocumentoExigencia',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    documento_tipo_id: { type: DataTypes.INTEGER, allowNull: false },
    solicitacao_tipo: { type: DataTypes.STRING(30), allowNull: false },
    solicitacao_subtipo: { type: DataTypes.STRING(40), allowNull: true },
    // OBRIGATORIO trava o envio | CONDICIONAL e o "quando aplicavel" | OPCIONAL nao cobra nada
    nivel: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CONDICIONAL' },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  {
    tableName: 'rh_documento_exigencias',
    timestamps: true
  }
);
