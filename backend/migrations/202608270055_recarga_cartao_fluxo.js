'use strict';

const {
  foreignKeyExists,
  indexExists,
  resolveTableName,
  tableExists
} = require('../src/database/schemaUtils');

const TABELAS = {
  cartoes: 'cartoes_recarga',
  usuarios: 'cartoes_recarga_usuarios',
  solicitacoes: 'solicitacoes_recarga_cartao',
  prestacoes: 'cartoes_recarga_prestacoes',
  rateios: 'cartoes_recarga_prestacao_rateios'
};

async function adicionarFk(queryInterface, sequelize, tabela, nome, fields, references, onDelete = 'RESTRICT') {
  if (await foreignKeyExists(sequelize, tabela, nome)) return;
  await queryInterface.addConstraint(tabela, {
    fields,
    type: 'foreign key',
    name: nome,
    references,
    onUpdate: 'CASCADE',
    onDelete
  });
}

async function adicionarIndice(queryInterface, sequelize, tabela, nome, fields, unique = false) {
  if (await indexExists(sequelize, tabela, nome)) return;
  await queryInterface.addIndex(tabela, fields, { name: nome, unique });
}

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const obrasTableName = await resolveTableName(sequelize, ['Obras', 'obras'], 'Obras');

    if (!(await tableExists(sequelize, TABELAS.cartoes))) {
      await queryInterface.createTable(TABELAS.cartoes, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        nome: { type: DataTypes.STRING(120), allowNull: false },
        identificador: { type: DataTypes.STRING(80), allowNull: false },
        ultimos_quatro: { type: DataTypes.STRING(4), allowNull: false },
        parceiro_id: { type: DataTypes.INTEGER, allowNull: false },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        observacoes: { type: DataTypes.TEXT, allowNull: true },
        criado_por: { type: DataTypes.INTEGER, allowNull: true },
        atualizado_por: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    if (!(await tableExists(sequelize, TABELAS.usuarios))) {
      await queryInterface.createTable(TABELAS.usuarios, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        cartao_recarga_id: { type: DataTypes.INTEGER, allowNull: false },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        criado_por: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    if (!(await tableExists(sequelize, TABELAS.solicitacoes))) {
      await queryInterface.createTable(TABELAS.solicitacoes, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
        cartao_recarga_id: { type: DataTypes.INTEGER, allowNull: false },
        titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: false },
        valor_solicitado: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        valor_efetivo: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        valor_nao_recarregado: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        status_ciclo: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PENDENTE' },
        criado_por: { type: DataTypes.INTEGER, allowNull: false },
        atualizado_por: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    if (!(await tableExists(sequelize, TABELAS.prestacoes))) {
      await queryInterface.createTable(TABELAS.prestacoes, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        solicitacao_recarga_id: { type: DataTypes.INTEGER, allowNull: false },
        valor_base: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
        observacoes: { type: DataTypes.TEXT, allowNull: true },
        motivo_rejeicao: { type: DataTypes.TEXT, allowNull: true },
        enviado_por: { type: DataTypes.INTEGER, allowNull: true },
        enviado_em: { type: DataTypes.DATE, allowNull: true },
        validado_por: { type: DataTypes.INTEGER, allowNull: true },
        validado_em: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    if (!(await tableExists(sequelize, TABELAS.rateios))) {
      await queryInterface.createTable(TABELAS.rateios, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        prestacao_id: { type: DataTypes.INTEGER, allowNull: false },
        obra_id: { type: DataTypes.INTEGER, allowNull: false },
        apropriacao_id: { type: DataTypes.INTEGER, allowNull: false },
        valor_rateio: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        percentual: { type: DataTypes.DECIMAL(10, 6), allowNull: false },
        criado_por: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    await adicionarFk(queryInterface, sequelize, TABELAS.cartoes, 'cr_cartao_parceiro_fk', ['parceiro_id'], { table: 'parceiros', field: 'id' });
    await adicionarFk(queryInterface, sequelize, TABELAS.cartoes, 'cr_cartao_criado_fk', ['criado_por'], { table: 'users', field: 'id' }, 'SET NULL');
    await adicionarFk(queryInterface, sequelize, TABELAS.cartoes, 'cr_cartao_atualizado_fk', ['atualizado_por'], { table: 'users', field: 'id' }, 'SET NULL');

    await adicionarFk(queryInterface, sequelize, TABELAS.usuarios, 'cr_usuario_cartao_fk', ['cartao_recarga_id'], { table: TABELAS.cartoes, field: 'id' }, 'CASCADE');
    await adicionarFk(queryInterface, sequelize, TABELAS.usuarios, 'cr_usuario_user_fk', ['user_id'], { table: 'users', field: 'id' }, 'CASCADE');
    await adicionarFk(queryInterface, sequelize, TABELAS.usuarios, 'cr_usuario_criado_fk', ['criado_por'], { table: 'users', field: 'id' }, 'SET NULL');

    await adicionarFk(queryInterface, sequelize, TABELAS.solicitacoes, 'cr_sol_solicitacao_fk', ['solicitacao_id'], { table: 'solicitacoes', field: 'id' }, 'CASCADE');
    await adicionarFk(queryInterface, sequelize, TABELAS.solicitacoes, 'cr_sol_cartao_fk', ['cartao_recarga_id'], { table: TABELAS.cartoes, field: 'id' });
    await adicionarFk(queryInterface, sequelize, TABELAS.solicitacoes, 'cr_sol_titulo_fk', ['titulo_financeiro_id'], { table: 'titulos_financeiros', field: 'id' });
    await adicionarFk(queryInterface, sequelize, TABELAS.solicitacoes, 'cr_sol_criado_fk', ['criado_por'], { table: 'users', field: 'id' });
    await adicionarFk(queryInterface, sequelize, TABELAS.solicitacoes, 'cr_sol_atualizado_fk', ['atualizado_por'], { table: 'users', field: 'id' }, 'SET NULL');

    await adicionarFk(queryInterface, sequelize, TABELAS.prestacoes, 'cr_prest_sol_fk', ['solicitacao_recarga_id'], { table: TABELAS.solicitacoes, field: 'id' }, 'CASCADE');
    await adicionarFk(queryInterface, sequelize, TABELAS.prestacoes, 'cr_prest_enviado_fk', ['enviado_por'], { table: 'users', field: 'id' }, 'SET NULL');
    await adicionarFk(queryInterface, sequelize, TABELAS.prestacoes, 'cr_prest_validado_fk', ['validado_por'], { table: 'users', field: 'id' }, 'SET NULL');

    await adicionarFk(queryInterface, sequelize, TABELAS.rateios, 'cr_rateio_prest_fk', ['prestacao_id'], { table: TABELAS.prestacoes, field: 'id' }, 'CASCADE');
    await adicionarFk(queryInterface, sequelize, TABELAS.rateios, 'cr_rateio_obra_fk', ['obra_id'], { table: obrasTableName, field: 'id' });
    await adicionarFk(queryInterface, sequelize, TABELAS.rateios, 'cr_rateio_aprop_fk', ['apropriacao_id'], { table: 'apropriacoes', field: 'id' });
    await adicionarFk(queryInterface, sequelize, TABELAS.rateios, 'cr_rateio_criado_fk', ['criado_por'], { table: 'users', field: 'id' }, 'SET NULL');

    await adicionarIndice(queryInterface, sequelize, TABELAS.cartoes, 'cr_cartao_identificador_uq', ['identificador'], true);
    await adicionarIndice(queryInterface, sequelize, TABELAS.usuarios, 'cr_usuario_cartao_user_uq', ['cartao_recarga_id', 'user_id'], true);
    await adicionarIndice(queryInterface, sequelize, TABELAS.usuarios, 'cr_usuario_user_ativo_idx', ['user_id', 'ativo']);
    await adicionarIndice(queryInterface, sequelize, TABELAS.solicitacoes, 'cr_sol_solicitacao_uq', ['solicitacao_id'], true);
    await adicionarIndice(queryInterface, sequelize, TABELAS.solicitacoes, 'cr_sol_titulo_uq', ['titulo_financeiro_id'], true);
    await adicionarIndice(queryInterface, sequelize, TABELAS.solicitacoes, 'cr_sol_cartao_status_idx', ['cartao_recarga_id', 'status_ciclo']);
    await adicionarIndice(queryInterface, sequelize, TABELAS.prestacoes, 'cr_prest_sol_uq', ['solicitacao_recarga_id'], true);
    await adicionarIndice(queryInterface, sequelize, TABELAS.prestacoes, 'cr_prest_status_idx', ['status']);
    await adicionarIndice(queryInterface, sequelize, TABELAS.rateios, 'cr_rateio_prest_obra_idx', ['prestacao_id', 'obra_id']);
  },

  async down() {
    // Sem rollback destrutivo: cartoes, prestacoes e rateios compoem a auditoria financeira.
  }
};
