module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhSolicitacaoHistorico',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
    // ABERTURA | APROVACAO | REJEICAO | CANCELAMENTO | REENVIO | COMENTARIO
    acao: { type: DataTypes.STRING(30), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    // Sempre TEXTO — ver `setorParaHistorico` em src/utils/codigoDoSetor.js.
    setor: { type: DataTypes.STRING(60), allowNull: true },
    situacao_anterior: { type: DataTypes.STRING(20), allowNull: true },
    situacao_nova: { type: DataTypes.STRING(20), allowNull: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: true }
  },
  { tableName: 'rh_solicitacao_historicos', timestamps: true }
);
