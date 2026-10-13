'use strict';

// Instrucao solicitada, nao uma baixa. Registro imutavel de quem recebe cada
// parte; os campos escalares historicos continuam sendo o caminho padrao.
module.exports = (sequelize, DataTypes) => sequelize.define('SolicitacaoFavorecido', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
  medicao_id: { type: DataTypes.INTEGER, allowNull: true },
  contrato_parcela_id: { type: DataTypes.INTEGER, allowNull: true },
  ordem: { type: DataTypes.INTEGER, allowNull: false },
  favorecido_id: { type: DataTypes.INTEGER, allowNull: false },
  nome_favorecido: { type: DataTypes.STRING(255), allowNull: false },
  cpf_cnpj: { type: DataTypes.STRING(30), allowNull: true },
  forma_pagamento_id: { type: DataTypes.INTEGER, allowNull: false },
  forma_pagamento_nome: { type: DataTypes.STRING(120), allowNull: false },
  forma_pagamento_tipo: { type: DataTypes.STRING(60), allowNull: true },
  valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  favorecido_chave_pix: { type: DataTypes.TEXT, allowNull: true },
  dados_pagamento: { type: DataTypes.TEXT, allowNull: true },
  boleto_nomes: { type: DataTypes.JSON, allowNull: true },
  titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: true, unique: true },
  criado_por: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'solicitacoes_favorecidos', timestamps: true });
