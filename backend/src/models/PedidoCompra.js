module.exports = (sequelize, DataTypes) => {
  const PedidoCompra = sequelize.define(
    'PedidoCompra',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      solicitacao_compra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      fechamento_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      obra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      fornecedor_compra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      criado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'ABERTO'
      },
      origem: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'COTACAO'
      },
      valor_total: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      valor_total_fornecedor: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      valor_minimo_pedido: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true
      },
      condicao_pagamento: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      desconto_total: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      valor_mercadorias: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      valor_tributos: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      difal_total: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      prazo_entrega_dias: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      entrega_controle_obrigatorio: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      prazo_entrega_tipo: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      frete_tipo_cotacao: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      frete_modo_cotacao: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'GLOBAL'
      },
      frete_valor_cotacao: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      frete_total: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      frete_data_vencimento: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      frete_transportador_nome: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      frete_transportador_cpf_cnpj: {
        type: DataTypes.STRING(30),
        allowNull: true
      },
      atingiu_pedido_minimo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      observacoes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      atribuido_a: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      prazo_finalizacao: {
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
      cancelado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      cancelado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      motivo_cancelamento: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      espelho_fornecedor_url: {
        type: DataTypes.STRING(1000),
        allowNull: true
      },
      espelho_fornecedor_nome: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      espelho_fornecedor_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      encerrado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      financeiro_fluxo_versao: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      status_financeiro: {
        type: DataTypes.STRING(40),
        allowNull: true
      },
      financeiro_encaminhado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      financeiro_atualizado_em: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'pedido_compras',
      timestamps: true
    }
  );

  return PedidoCompra;
};
