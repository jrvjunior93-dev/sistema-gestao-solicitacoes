module.exports = (sequelize, DataTypes) => sequelize.define(
  'TituloFinanceiro',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    codigo: {
      type: DataTypes.STRING(40),
      allowNull: true,
      unique: true
    },
    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    obra_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    apropriacao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    empresa_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    empresa_contraparte_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    intercompany_group_id: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    empresa_origem_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    empresa_destino_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    tipo_intercompany: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    motivo_intercompany: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    elimina_consolidado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    transferencia_interna: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    parceiro_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    payment_beneficiary_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    categoria_financeira_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    forma_pagamento_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    cartao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    fatura_cartao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    grupo_parcelamento_id: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    numero_parcela: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    total_parcelas: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    data_compra: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    competencia_data: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    considera_dre: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    possui_rateio: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    intercompany: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    origem_titulo: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'MANUAL'
    },
    tipo: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ABERTO'
    },
    descricao: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    numero_documento: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    cheque_numero: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    cheque_banco: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    cheque_agencia: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    cheque_conta: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    cheque_emitente: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    forma_cobranca: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    status_cobranca: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'NAO_APLICAVEL'
    },
    banco_cobranca: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    nosso_numero: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    linha_digitavel: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    codigo_barras: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    identificador_externo: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    boleto_emitido_em: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    valor_original: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    valor_bruto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    valor_impostos: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    valor_liquido: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    valor_saldo: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    valor_baixado: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    data_emissao: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    data_vencimento: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    data_quitacao: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    criado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    atualizado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    bloqueado_retorno_obra: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    bloqueio_retorno_pedido_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    bloqueio_retorno_motivo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    bloqueio_retorno_em: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deleted_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    deleted_reason: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  },
  {
    tableName: 'titulos_financeiros',
    defaultScope: {
      where: {
        deleted_at: null
      }
    },
    hooks: {
      beforeUpdate(titulo) {
        if (!titulo.bloqueado_retorno_obra || !titulo.changed('valor_baixado')) return;
        const valorAnterior = Number(titulo.previous('valor_baixado') || 0);
        const novoValor = Number(titulo.valor_baixado || 0);
        if (novoValor <= valorAnterior) return;

        const error = new Error(
          titulo.bloqueio_retorno_motivo
          || 'Baixa bloqueada: a Obra solicitou o retorno da solicitacao vinculada a este titulo.'
        );
        error.statusCode = 409;
        error.code = 'TITULO_BLOQUEADO_RETORNO_OBRA';
        throw error;
      }
    },
    timestamps: true
  }
);
