module.exports = (sequelize, DataTypes) => {
  const ContratoParcela = sequelize.define(
    'ContratoParcela',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      contrato_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      numero: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      valor: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false
      },
      // Valor da parcela na criacao do contrato. Gravado uma vez e nunca alterado: e a
      // referencia da auditoria "previsto x solicitado por parcela" (PI-5).
      valor_previsto: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true
      },
      data_vencimento: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'PREVISAO'
      },
      travada: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // So e preenchido na aprovacao do contrato. Ate la a parcela nao existe no financeiro.
      titulo_financeiro_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      parceiro_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      forma_pagamento_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      observacao: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      criado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      atualizado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    },
    {
      tableName: 'contrato_parcelas',
      timestamps: true
    }
  );

  return ContratoParcela;
};
