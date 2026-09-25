module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhColaborador',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    empresa_grupo_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    obra_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    setor_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    nome: {
      type: DataTypes.STRING(180),
      allowNull: false
    },
    cpf: {
      type: DataTypes.STRING(14),
      allowNull: false
    },
    parceiro_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    matricula: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    rg: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    telefone: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    cargo: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    // Fase 7: o cargo passa a ter catalogo (`rh_cargos`). `cargo` (texto) continua como a prova do
    // que estava escrito antes do de-para, e nao e apagada.
    cargo_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    carga_horaria_semanal: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    tipo_vinculo: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    data_inicio: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    data_admissao: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    data_demissao: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    data_nascimento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ATIVO'
    },
    salario_base: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    valor_contratual: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    // O vinculo trabalhista e a forma de calculo gerencial sao dimensoes diferentes: um CLT pode
    // receber por diaria no controle interno, sem mudar a natureza formal do contrato.
    forma_calculo_gerencial: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'MENSAL'
    },
    valor_diaria: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    valor_ticket: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    pagamento_automatico_40_60: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // --- Fase 8 (27/08): os campos que o item 8 do escopo exige na admissao.
    // Todos anulaveis no schema: a obrigatoriedade e da ADMISSAO NOVA e mora na validacao do
    // pedido, nao aqui — sao 137 colaboradores antigos sem esses dados.
    nome_pai: {
      type: DataTypes.STRING(180),
      allowNull: true
    },
    nome_mae: {
      type: DataTypes.STRING(180),
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
    municipio: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    estado: {
      type: DataTypes.STRING(2),
      allowNull: true
    },
    cep: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    banco: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    agencia: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    conta: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    conta_tipo: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    pix_chave_tipo: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    pix_chave: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    responsavel_contratacao_id: {
      type: DataTypes.INTEGER,
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
    tableName: 'rh_colaboradores',
    timestamps: true
  }
);
