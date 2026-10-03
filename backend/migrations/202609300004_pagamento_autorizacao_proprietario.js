'use strict';

const { indexExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    if (!(await tableExists(sequelize, 'pagamento_autorizadores'))) {
      await queryInterface.createTable('pagamento_autorizadores', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        usuario_id: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        piloto: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        limite_por_lote: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
        configurado_por: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }

    if (!(await tableExists(sequelize, 'pagamento_autorizacao_lotes'))) {
      await queryInterface.createTable('pagamento_autorizacao_lotes', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        codigo: { type: DataTypes.STRING(50), allowNull: false, unique: true },
        status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AGUARDANDO' },
        modo: { type: DataTypes.STRING(20), allowNull: false },
        valor_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        quantidade_itens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        dossie_hash: { type: DataTypes.STRING(64), allowNull: false },
        idempotency_key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
        criado_por: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        decidido_por: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        decidido_em: { type: DataTypes.DATE, allowNull: true },
        expira_em: { type: DataTypes.DATE, allowNull: false },
        observacao: { type: DataTypes.STRING(500), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }
    if (!(await indexExists(sequelize, 'pagamento_autorizacao_lotes', 'idx_pag_aut_lotes_status_expira'))) await queryInterface.addIndex('pagamento_autorizacao_lotes', ['status', 'expira_em'], { name: 'idx_pag_aut_lotes_status_expira' });

    if (!(await tableExists(sequelize, 'pagamento_autorizacao_itens'))) {
      await queryInterface.createTable('pagamento_autorizacao_itens', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        lote_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'pagamento_autorizacao_lotes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'titulos_financeiros', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PENDENTE' },
        valor_snapshot: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
        vencimento_snapshot: { type: DataTypes.DATEONLY, allowNull: true },
        snapshot_json: { type: DataTypes.JSON, allowNull: false },
        snapshot_hash: { type: DataTypes.STRING(64), allowNull: false },
        motivo_decisao: { type: DataTypes.STRING(500), allowNull: true },
        decidido_em: { type: DataTypes.DATE, allowNull: true },
        fila_item_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'pagamentos_manuais_fila', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }
    if (!(await indexExists(sequelize, 'pagamento_autorizacao_itens', 'uq_pag_aut_item_lote_titulo'))) await queryInterface.addIndex('pagamento_autorizacao_itens', ['lote_id', 'titulo_financeiro_id'], { name: 'uq_pag_aut_item_lote_titulo', unique: true });
    if (!(await indexExists(sequelize, 'pagamento_autorizacao_itens', 'idx_pag_aut_item_titulo_status'))) await queryInterface.addIndex('pagamento_autorizacao_itens', ['titulo_financeiro_id', 'status'], { name: 'idx_pag_aut_item_titulo_status' });

    if (!(await tableExists(sequelize, 'pagamento_autorizacao_documentos'))) {
      await queryInterface.createTable('pagamento_autorizacao_documentos', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        item_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'pagamento_autorizacao_itens', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        origem_tipo: { type: DataTypes.STRING(40), allowNull: false },
        origem_id: { type: DataTypes.INTEGER, allowNull: true },
        nome: { type: DataTypes.STRING(255), allowNull: false },
        arquivo_url_snapshot: { type: DataTypes.TEXT, allowNull: false },
        arquivo_hash: { type: DataTypes.STRING(64), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }

    if (!(await tableExists(sequelize, 'pagamento_autorizacao_eventos'))) {
      await queryInterface.createTable('pagamento_autorizacao_eventos', {
        id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
        lote_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'pagamento_autorizacao_lotes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        item_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'pagamento_autorizacao_itens', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        tipo: { type: DataTypes.STRING(60), allowNull: false },
        dados_json: { type: DataTypes.JSON, allowNull: true },
        hash_anterior: { type: DataTypes.STRING(64), allowNull: true },
        evento_hash: { type: DataTypes.STRING(64), allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }
    if (!(await indexExists(sequelize, 'pagamento_autorizacao_eventos', 'idx_pag_aut_eventos_lote'))) await queryInterface.addIndex('pagamento_autorizacao_eventos', ['lote_id', 'id'], { name: 'idx_pag_aut_eventos_lote' });

    if (!(await tableExists(sequelize, 'webauthn_credentials'))) {
      await queryInterface.createTable('webauthn_credentials', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        usuario_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        credential_id: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        public_key: { type: DataTypes.TEXT('long'), allowNull: false },
        counter: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        transports: { type: DataTypes.JSON, allowNull: true },
        device_type: { type: DataTypes.STRING(40), allowNull: true },
        backed_up: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        nome_dispositivo: { type: DataTypes.STRING(120), allowNull: true },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        ultimo_uso_em: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }
    if (!(await indexExists(sequelize, 'webauthn_credentials', 'idx_webauthn_usuario_ativo'))) await queryInterface.addIndex('webauthn_credentials', ['usuario_id', 'ativo'], { name: 'idx_webauthn_usuario_ativo' });

    if (!(await tableExists(sequelize, 'web_push_subscriptions'))) {
      await queryInterface.createTable('web_push_subscriptions', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        usuario_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        endpoint_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        endpoint: { type: DataTypes.TEXT, allowNull: false },
        p256dh: { type: DataTypes.TEXT, allowNull: false },
        auth: { type: DataTypes.TEXT, allowNull: false },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }
    if (!(await indexExists(sequelize, 'web_push_subscriptions', 'idx_push_usuario_ativo'))) await queryInterface.addIndex('web_push_subscriptions', ['usuario_id', 'ativo'], { name: 'idx_push_usuario_ativo' });
  },

  async down({ queryInterface, sequelize }) {
    const tables = [
      'web_push_subscriptions',
      'webauthn_credentials',
      'pagamento_autorizacao_eventos',
      'pagamento_autorizacao_documentos',
      'pagamento_autorizacao_itens',
      'pagamento_autorizacao_lotes',
      'pagamento_autorizadores'
    ];
    for (const table of tables) {
      if (await tableExists(sequelize, table)) await queryInterface.dropTable(table);
    }
  }
};
