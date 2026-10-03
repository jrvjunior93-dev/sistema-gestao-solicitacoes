module.exports = (sequelize, DataTypes) => {
  const MedicaoParcela = sequelize.define(
    'MedicaoParcela',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
      // PI-16: depois que a medicao deixou de ser solicitacao, `solicitacao_id` passou a ser
      // sempre a mesma (a do contrato). E `medicao_id` que diz QUAL medicao consumiu a parcela.
      medicao_id: { type: DataTypes.INTEGER, allowNull: true },
      contrato_parcela_id: { type: DataTypes.INTEGER, allowNull: false },
      valor_medido: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      // Estado da parcela ANTES da medicao — trilha de auditoria (MD-7).
      valor_anterior: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      vencimento_anterior: { type: DataTypes.DATEONLY, allowNull: false },
      vencimento_aplicado: { type: DataTypes.DATEONLY, allowNull: false },
      criado_por: { type: DataTypes.INTEGER, allowNull: true },
      // Comprometimento desfeito (titulo excluido / contrato encerrado). A linha fica como
      // trilha; o saldo do contrato deixa de conta-la.
      devolvido_em: { type: DataTypes.DATE, allowNull: true },
      devolvido_motivo: { type: DataTypes.STRING(255), allowNull: true }
    },
    {
      tableName: 'medicao_parcelas',
      timestamps: true
    }
  );

  return MedicaoParcela;
};
