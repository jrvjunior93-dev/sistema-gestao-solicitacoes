module.exports = (sequelize, DataTypes) => {
  const Obra = sequelize.define('Obra', {
    codigo: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: false
    },
    cidade: {
      type: DataTypes.STRING,
      allowNull: true
    },
    nome: {
      type: DataTypes.STRING,
      allowNull: false
    },
    empresa_grupo_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    tipo_centro_custo: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'OBRA'
    },
    classificacao: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null
    },
    vgv: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: null
    },
    planilha_geral: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: null
    },
    margem_custo_esperada: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: null
    },
    nivel_apropriacao_formulario: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null
    },
    cno: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    endereco_logradouro: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    endereco_numero: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    endereco_complemento: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    endereco_bairro: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    endereco_cep: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    endereco_uf: {
      type: DataTypes.STRING(2),
      allowNull: true
    }
  });

  return Obra;
};
