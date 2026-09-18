module.exports = (sequelize, DataTypes) => {
  const SolicitacaoCompra = sequelize.define(
    'SolicitacaoCompra',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      origem: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'NORMAL'
      },
      titulo: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      obra_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      solicitante_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      solicitacao_principal_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'ENVIADO'
      },
      numero_sienge: {
        type: DataTypes.STRING,
        allowNull: true
      },
      integrado_sienge: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      data_integracao_sienge: {
        type: DataTypes.DATE,
        allowNull: true
      },
      liberado_para_compra_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      encerrado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      observacoes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      necessario_para: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      link_geral: {
        type: DataTypes.STRING,
        allowNull: true
      },
      comprador_responsavel_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      prazo_compra: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      delegado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      delegado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      motivo_atraso: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      motivo_atraso_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      motivo_delegacao_vencida: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      motivo_delegacao_vencida_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      valor_fechado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      desconto_total: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      frete_tipo: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'SEM_FRETE'
      },
      frete_valor: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      frete_data_vencimento: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      frete_parceiro_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      frete_dados_pagamento: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      formas_pagamento_json: {
        type: DataTypes.JSON,
        allowNull: true
      },
      dados_pagamento: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      frete_forma_pagamento_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      frete_favorecido_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      frete_favorecido_chave_pix: {
        type: DataTypes.STRING(255),
        allowNull: true
      }
    },
    {
      tableName: 'solicitacao_compras',
      timestamps: true
    }
  );

  return SolicitacaoCompra;
};
