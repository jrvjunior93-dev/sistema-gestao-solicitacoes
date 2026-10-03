module.exports = (sequelize, DataTypes) => {
  const ContratoAditivo = sequelize.define(
    'ContratoAditivo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      contrato_id: { type: DataTypes.INTEGER, allowNull: false },
      solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },
      valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      nova_vigencia_fim: { type: DataTypes.DATEONLY, allowNull: true },
      // `VALOR` (so dinheiro, prazo intacto) ou `VALOR_E_VIGENCIA` (dinheiro e prazo). Informado no
      // pedido, nunca deduzido de "tem nova vigencia preenchida?" — deduzir transformaria um campo
      // esquecido em decisao tomada. E o que decide quantas parcelas nascem na aprovacao.
      tipo: { type: DataTypes.STRING(20), allowNull: true },
      // Quantas parcelas criar. So o aditivo de vigencia usa: no de valor o prazo nao mudou e a
      // regra e outra (ultima parcela livre, ou uma nova com o mesmo vencimento da ultima).
      qtde_parcelas: { type: DataTypes.INTEGER, allowNull: true },
      // Fotografia do cronograma financeiro negociado. A data de vencimento e independente da
      // vigencia do servico e pode ultrapassa-la.
      cronograma_parcelas: { type: DataTypes.JSON, allowNull: true },
      justificativa: { type: DataTypes.TEXT, allowNull: false },
      responsavel_id: { type: DataTypes.INTEGER, allowNull: true },
      // So APROVADO consome o teto de 25% (PI-12): rejeitado libera o valor de volta.
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
      motivo_rejeicao: { type: DataTypes.STRING(255), allowNull: true },
      aprovado_por: { type: DataTypes.INTEGER, allowNull: true },
      aprovado_em: { type: DataTypes.DATE, allowNull: true },
      criado_por: { type: DataTypes.INTEGER, allowNull: true }
    },
    { tableName: 'contrato_aditivos', timestamps: true }
  );

  return ContratoAditivo;
};
