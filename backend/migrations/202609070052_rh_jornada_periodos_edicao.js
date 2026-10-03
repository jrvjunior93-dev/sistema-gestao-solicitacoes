'use strict';

const {
  columnExists,
  indexExists,
  resolveTableName,
  tableExists
} = require('../src/database/schemaUtils');

/**
 * Periodos de jornada e autorizacao pontual de edicao.
 *
 * Migration exclusivamente estrutural: jornadas antigas continuam sem periodo explicito e sao
 * interpretadas em leitura como mensais. Nenhum registro funcional e criado ou alterado aqui.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const importacoes = 'rh_importacoes';

    if (!await columnExists(sequelize, importacoes, 'periodicidade')) {
      await queryInterface.addColumn(importacoes, 'periodicidade', {
        type: DataTypes.STRING(15),
        allowNull: true
      });
    }
    if (!await columnExists(sequelize, importacoes, 'periodo_inicio')) {
      await queryInterface.addColumn(importacoes, 'periodo_inicio', {
        type: DataTypes.DATEONLY,
        allowNull: true
      });
    }
    if (!await columnExists(sequelize, importacoes, 'periodo_fim')) {
      await queryInterface.addColumn(importacoes, 'periodo_fim', {
        type: DataTypes.DATEONLY,
        allowNull: true
      });
    }
    if (!await indexExists(sequelize, importacoes, 'idx_rh_importacoes_periodo')) {
      await queryInterface.addIndex(
        importacoes,
        ['obra_id', 'competencia', 'tipo', 'status', 'periodo_inicio', 'periodo_fim'],
        { name: 'idx_rh_importacoes_periodo' }
      );
    }

    if (!await tableExists(sequelize, 'rh_jornada_edicoes')) {
      const tabelaObras = await resolveTableName(sequelize, ['Obras', 'obras'], 'Obras');
      await queryInterface.createTable('rh_jornada_edicoes', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        importacao_linha_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'rh_importacao_linhas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        obra_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: tabelaObras, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        colaborador_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'rh_colaboradores', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        competencia: { type: DataTypes.STRING(7), allowNull: false },
        periodicidade: { type: DataTypes.STRING(15), allowNull: false },
        periodo_inicio: { type: DataTypes.DATEONLY, allowNull: false },
        periodo_fim: { type: DataTypes.DATEONLY, allowNull: false },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
        motivo: { type: DataTypes.TEXT, allowNull: false },
        motivo_decisao: { type: DataTypes.TEXT, allowNull: true },
        solicitada_por: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        solicitada_em: { type: DataTypes.DATE, allowNull: false },
        decidida_por: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        decidida_em: { type: DataTypes.DATE, allowNull: true },
        utilizada_em: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
      await queryInterface.addIndex('rh_jornada_edicoes', ['importacao_linha_id', 'status'], {
        name: 'idx_rh_jornada_edicoes_linha_status'
      });
      await queryInterface.addIndex('rh_jornada_edicoes', ['obra_id', 'competencia', 'status'], {
        name: 'idx_rh_jornada_edicoes_fila_dp'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: periodos e decisoes integram a trilha da folha.
  }
};
