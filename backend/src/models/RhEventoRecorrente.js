module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhEventoRecorrente',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    colaborador_id: { type: DataTypes.INTEGER, allowNull: false },
    codigo: { type: DataTypes.STRING(40), allowNull: false },
    descricao: { type: DataTypes.STRING(160), allowNull: true },
    // CREDITO | DESCONTO
    natureza: { type: DataTypes.STRING(10), allowNull: false },
    forma: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'VALOR_FIXO' },
    valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    // `valor` permanece como o valor aplicado em cada competencia. Os campos abaixo preservam a
    // escolha feita no formulario e deixam a memoria de calculo auditavel.
    modo_valor: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'TOTAL' },
    valor_total: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    valor_parcela: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    // false = pagamento a parte (vale alimentacao); true = mexe no liquido do salario.
    entra_no_liquido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    competencia_inicio: { type: DataTypes.STRING(7), allowNull: false },
    competencia_fim: { type: DataTypes.STRING(7), allowNull: true },
    // Nulo = indefinido. Preenchido = para sozinho na ultima parcela.
    parcelas_total: { type: DataTypes.INTEGER, allowNull: true },
    parcelas_valores_json: { type: DataTypes.JSON, allowNull: true },
    beneficiario_nome: { type: DataTypes.STRING(180), allowNull: true },
    beneficiario_documento: { type: DataTypes.STRING(14), allowNull: true },
    beneficiario_banco: { type: DataTypes.STRING(120), allowNull: true },
    beneficiario_agencia: { type: DataTypes.STRING(30), allowNull: true },
    beneficiario_conta: { type: DataTypes.STRING(40), allowNull: true },
    beneficiario_tipo_conta: { type: DataTypes.STRING(30), allowNull: true },
    beneficiario_chave_pix: { type: DataTypes.STRING(120), allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },
    observacoes: { type: DataTypes.TEXT, allowNull: true },
    criado_por: { type: DataTypes.INTEGER, allowNull: true }
  },
  { tableName: 'rh_eventos_recorrentes', timestamps: true }
);
