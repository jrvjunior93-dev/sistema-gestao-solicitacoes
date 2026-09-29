'use strict';

const { indexExists, tableExists } = require('../src/database/schemaUtils');

const TABLE = 'solicitacao_cadastro_obra_usuarios';
const CODIGO_TIPO = 'CADASTRO_DE_OBRA';
const NOME_TIPO = 'CADASTRO DE OBRA';

const COMPORTAMENTO_OBRIGATORIO = Object.freeze({
  usa_fluxo_cadastro_obra: true,
  somente_gerencia_processos: true,
  finalidade_data_vencimento: 'RESPOSTA',
  mostrar_valor: false,
  exige_valor: false,
  mostrar_descricao: true,
  exige_descricao: true,
  mostrar_credor: false,
  exige_credor: false,
  mostrar_justificativa: false,
  exige_justificativa: false,
  mostrar_favorecido: false,
  exige_favorecido: false,
  mostrar_forma_pagamento: false,
  exige_forma_pagamento: false,
  mostrar_apropriacao_principal: false,
  exige_apropriacao_principal: false,
  mostrar_contrato: false,
  exige_contrato: false,
  mostrar_subtipo: false,
  exige_subtipo: false,
  mostrar_periodo_medicao: false,
  exige_periodo_medicao: false,
  mostrar_ref_contrato_abertura: false,
  exige_ref_contrato_abertura: false,
  mostrar_itens_apropriacao: false,
  exige_itens_apropriacao: false,
  exige_apropriacoes_contrato: false,
  mostrar_anexos: true,
  exige_anexos: true
});

function parseBehavior(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    if (!(await tableExists(sequelize, TABLE))) {
      await queryInterface.createTable(TABLE, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        solicitacao_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'solicitacoes', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        usuario_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        criado_por: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    if (!(await indexExists(sequelize, TABLE, 'uq_solicitacao_cadastro_obra_usuario'))) {
      await queryInterface.addIndex(TABLE, ['solicitacao_id', 'usuario_id'], {
        name: 'uq_solicitacao_cadastro_obra_usuario',
        unique: true
      });
    }
    if (!(await indexExists(sequelize, TABLE, 'idx_solicitacao_cadastro_obra_usuario'))) {
      await queryInterface.addIndex(TABLE, ['usuario_id'], {
        name: 'idx_solicitacao_cadastro_obra_usuario'
      });
    }

    const [tipos] = await sequelize.query(
      `SELECT id, comportamento
         FROM tipo_solicitacao
        WHERE codigo_interno = ? OR nome = ?
        ORDER BY id ASC
        LIMIT 1`,
      { replacements: [CODIGO_TIPO, NOME_TIPO] }
    );
    const existente = tipos?.[0] || null;
    const comportamento = JSON.stringify({
      ...parseBehavior(existente?.comportamento),
      ...COMPORTAMENTO_OBRIGATORIO
    });

    if (existente) {
      await sequelize.query(
        `UPDATE tipo_solicitacao
            SET nome = ?, codigo_interno = ?, comportamento = ?, disponivel_para_obras = 1,
                ativo = 1, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?`,
        { replacements: [NOME_TIPO, CODIGO_TIPO, comportamento, existente.id] }
      );
    } else {
      await sequelize.query(
        `INSERT INTO tipo_solicitacao
           (nome, codigo_interno, comportamento, disponivel_para_obras, ativo, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        { replacements: [NOME_TIPO, CODIGO_TIPO, comportamento] }
      );
    }
  },

  async down({ queryInterface, sequelize }) {
    if (await tableExists(sequelize, TABLE)) {
      await queryInterface.dropTable(TABLE);
    }
    // O tipo nao e removido: uma reversao de schema nao pode apagar o catalogo nem quebrar
    // solicitacoes que ja tenham sido abertas com ele. A operacao pode ser desativada pela UI.
  }
};
