module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhApuracaoEventoItem',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    apuracao_evento_id: { type: DataTypes.INTEGER, allowNull: false },
    evento_recorrente_id: { type: DataTypes.INTEGER, allowNull: true },
    codigo: { type: DataTypes.STRING(40), allowNull: false },
    descricao: { type: DataTypes.STRING(160), allowNull: true },
    natureza: { type: DataTypes.STRING(10), allowNull: false },
    // COPIADO da regra, nunca apontado: folha fechada nao muda quando a regra muda.
    valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    entra_no_liquido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Guardado para LER ("parcela 4 de 6"), nunca para contar.
    parcela_numero: { type: DataTypes.INTEGER, allowNull: true },
    parcelas_total: { type: DataTypes.INTEGER, allowNull: true },
    // RECORRENTE | MANUAL | PLANILHA
    origem: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'RECORRENTE' },
    observacoes: { type: DataTypes.TEXT, allowNull: true }
  },
  { tableName: 'rh_apuracao_evento_itens', timestamps: true }
);
