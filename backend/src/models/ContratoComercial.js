module.exports = (sequelize, DataTypes) => sequelize.define(
  'ContratoComercial',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    empreendimento_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    unidade_comercial_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    parceiro_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    corretor_parceiro_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    obra_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    categoria_financeira_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    categoria_financeira_comissao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    titulo_financeiro_comissao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    origem_dados: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'FLUXY'
    },
    identificador_externo: {
      type: DataTypes.STRING(180),
      allowNull: true
    },
    numero: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'ATIVO'
    },
    data_contrato: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    valor_total: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    valor_entrada: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    desconto_concedido: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    indice_reajuste: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    corretor_nome: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    comissao_percentual: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true
    },
    competencia_comissao_data: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    possui_vaga_garagem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    quantidade_vagas_garagem: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    vagas_garagem_posicao: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    local_assinatura: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    data_assinatura: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    testemunha_1_nome: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    testemunha_1_cpf: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    testemunha_2_nome: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    testemunha_2_cpf: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    data_distrato: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    motivo_distrato: {
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
    tableName: 'contratos_comerciais',
    timestamps: true
  }
);
