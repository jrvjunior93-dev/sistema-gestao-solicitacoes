module.exports = (sequelize, DataTypes) => sequelize.define(
  'UnidadeComercial',
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
    parceiro_reserva_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    codigo: {
      type: DataTypes.STRING(60),
      allowNull: false
    },
    nome: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    bloco: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    torre: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    pavimento: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    tipologia: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    metragem_privativa: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    fracao_ideal: {
      type: DataTypes.DECIMAL(12, 6),
      allowNull: true
    },
    valor_tabela: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    valor_base_venda: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    situacao: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'DISPONIVEL'
    },
    reservado_ate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    excluido_em: {
      type: DataTypes.DATE,
      allowNull: true
    },
    excluido_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    motivo_exclusao: {
      type: DataTypes.STRING(500),
      allowNull: true
    }
  },
  {
    tableName: 'unidades_comerciais',
    timestamps: true
  }
);
