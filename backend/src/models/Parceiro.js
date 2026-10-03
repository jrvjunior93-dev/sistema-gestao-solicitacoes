module.exports = (sequelize, DataTypes) => {
  const Parceiro = sequelize.define(
    'Parceiro',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      cpf_cnpj: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true
      },
      nome: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      telefone: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      rg: {
        type: DataTypes.STRING(40),
        allowNull: true
      },
      data_nascimento: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      nacionalidade: {
        type: DataTypes.STRING(80),
        allowNull: true
      },
      profissao: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      estado_civil: {
        type: DataTypes.STRING(60),
        allowNull: true
      },
      endereco: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      numero: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      complemento: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      bairro: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      cep: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      municipio: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      estado: {
        type: DataTypes.STRING(2),
        allowNull: true
      },
      tipo_pessoa: {
        type: DataTypes.STRING(1),
        allowNull: true
      },
      cliente: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      fornecedor: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      corretor: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      testemunha: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      cadastro_incompleto: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      origem_cadastro: {
        type: DataTypes.STRING(40),
        allowNull: true
      },
      // Nome de fachada. A razao social identifica a empresa no papel; quem trabalha na obra
      // conhece o fornecedor por este. Sem o campo, os dois brigavam dentro de `nome`.
      nome_fantasia: {
        type: DataTypes.STRING(180),
        allowNull: true
      },
      // Representante legal: numa PJ quem assina o contrato e uma pessoa DIFERENTE do parceiro.
      // Os campos de qualificacao repetem o vocabulario que o Comercial ja usa para o parceiro
      // pessoa fisica, para as duas partes do sistema falarem a mesma lingua.
      representante_nome: { type: DataTypes.STRING(180), allowNull: true },
      representante_cpf: { type: DataTypes.STRING(20), allowNull: true },
      representante_rg: { type: DataTypes.STRING(40), allowNull: true },
      representante_cargo: { type: DataTypes.STRING(80), allowNull: true },
      representante_nacionalidade: { type: DataTypes.STRING(60), allowNull: true },
      representante_estado_civil: { type: DataTypes.STRING(40), allowNull: true },
      representante_profissao: { type: DataTypes.STRING(80), allowNull: true },
      conjuge_nome: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      conjuge_parceiro_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      regime_bens: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      creci: {
        type: DataTypes.STRING(60),
        allowNull: true
      },
      pix_chave_fixa_1_tipo: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      pix_chave_fixa_1: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      pix_chave_fixa_2_tipo: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      pix_chave_fixa_2: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      pix_chave_variavel_tipo: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      pix_chave_variavel: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      cadastro_simplificado_favorecido: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      pix_chave_canonica: {
        type: DataTypes.STRING(300),
        allowNull: true,
        unique: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: 'parceiros',
      timestamps: true
    }
  );

  return Parceiro;
};
