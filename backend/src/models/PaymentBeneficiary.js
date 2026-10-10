module.exports = (sequelize, DataTypes) => sequelize.define(
  'PaymentBeneficiary',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    parceiro_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    nome: {
      type: DataTypes.STRING(180),
      allowNull: false
    },
    cpf_cnpj: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    metodo_preferencial: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'PIX_CHAVE'
    },
    pix_tipo_chave: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    pix_chave: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    banco_codigo: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    agencia: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    agencia_digito: {
      type: DataTypes.STRING(5),
      allowNull: true
    },
    conta: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    conta_digito: {
      type: DataTypes.STRING(5),
      allowNull: true
    },
    tipo_conta: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    validado_em: {
      type: DataTypes.DATE,
      allowNull: true
    },
    validado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    tableName: 'payment_beneficiaries',
    timestamps: true
  }
);
