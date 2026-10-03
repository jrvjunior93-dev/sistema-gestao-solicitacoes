'use strict';

const { resolveTableName, tableExists } = require('../src/database/schemaUtils');

/**
 * Vinculo entre tipo de solicitacao e apropriacao padrao, por obra.
 *
 * Permite que a tela de nova solicitacao ja traga a apropriacao preenchida quando o
 * solicitante escolhe obra + tipo (ex.: ADM Local de Obra, Locacao de Maq. e Eq.).
 *
 * Optamos por tabela propria em vez de JSON em configuracoes_sistema porque:
 *  - o vinculo referencia obra, tipo e apropriacao reais (integridade por FK);
 *  - e consultado a cada abertura de solicitacao (precisa de indice);
 *  - configuracoes_sistema nao tem unicidade por chave e ja acumula linhas duplicadas.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'obra_tipo_apropriacao_padrao')) return;

    const obrasTableName = await resolveTableName(sequelize, ['Obras', 'obras'], 'Obras');

    await queryInterface.createTable('obra_tipo_apropriacao_padrao', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      obra_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: obrasTableName, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      tipo_solicitacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'tipo_solicitacao', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      apropriacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'apropriacoes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      criado_por: { type: DataTypes.INTEGER, allowNull: true },
      atualizado_por: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });

    await Promise.all([
      // Uma unica apropriacao padrao por obra + tipo. Evita a ambiguidade que hoje existe
      // em configuracoes_sistema, onde a linha valida depende da ordem do SELECT.
      queryInterface.addIndex('obra_tipo_apropriacao_padrao', ['obra_id', 'tipo_solicitacao_id'], {
        name: 'obra_tipo_aprop_unico',
        unique: true
      }),
      queryInterface.addIndex('obra_tipo_apropriacao_padrao', ['apropriacao_id'], {
        name: 'obra_tipo_aprop_apropriacao'
      })
    ]);
  },

  async down() {
    // Sem rollback destrutivo: o vinculo configurado pelo cliente nao deve ser descartado.
  }
};
