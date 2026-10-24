'use strict';
// Somente estrutura; nao cadastra empresa, nao ativa conector e nao altera titulos.
const { tableExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ sequelize, queryInterface: qi, DataTypes: T }) {
    const schemas = {
      fiscal_nsdocs_captures: {
        id: { type: T.STRING(36), primaryKey: true },
        empresa_id: { type: T.INTEGER, allowNull: false, references: { model: 'empresas_grupo', key: 'id' }, onDelete: 'RESTRICT' },
        fiscal_company_id: { type: T.INTEGER, allowNull: false, references: { model: 'fiscal_companies', key: 'id' }, onDelete: 'RESTRICT' },
        company_cnpj: { type: T.STRING(14), allowNull: false },
        request_hash: { type: T.STRING(64), allowNull: false },
        request_json: { type: T.JSON, allowNull: false },
        page_json: { type: T.JSON, allowNull: true },
        state: { type: T.STRING(20), allowNull: false },
        result_json: { type: T.JSON, allowNull: true },
        error_code: { type: T.STRING(120), allowNull: true },
        createdAt: { type: T.DATE, allowNull: false }, updatedAt: { type: T.DATE, allowNull: false }
      },
      fiscal_nsdocs_capture_events: {
        id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
        capture_id: { type: T.STRING(36), allowNull: false, references: { model: 'fiscal_nsdocs_captures', key: 'id' }, onDelete: 'RESTRICT' },
        outcome: { type: T.STRING(120), allowNull: false },
        createdAt: { type: T.DATE, allowNull: false }, updatedAt: { type: T.DATE, allowNull: false }
      },
      fiscal_nsdocs_observations: {
        id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
        capture_id: { type: T.STRING(36), allowNull: false, references: { model: 'fiscal_nsdocs_captures', key: 'id' }, onDelete: 'RESTRICT' },
        fiscal_dfe_document_id: { type: T.INTEGER, allowNull: false, references: { model: 'fiscal_dfe_documents', key: 'id' }, onDelete: 'RESTRICT' },
        access_key: { type: T.STRING(44), allowNull: false },
        provider_id: { type: T.STRING(64), allowNull: false },
        snapshot_json: { type: T.JSON, allowNull: false },
        xml_bucket: { type: T.STRING(63), allowNull: false }, xml_key: { type: T.STRING(500), allowNull: false },
        xml_hash: { type: T.STRING(64), allowNull: false },
        createdAt: { type: T.DATE, allowNull: false }, updatedAt: { type: T.DATE, allowNull: false }
      }
    };
    for (const [table, schema] of Object.entries(schemas)) {
      if (await tableExists(sequelize, table)) {
        const columns = await qi.describeTable(table);
        if (Object.keys(schema).some(key => !columns[key])) throw Error('Schema NSDOCS existente incompativel; preservar historico.');
      } else await qi.createTable(table, schema, { engine: 'InnoDB', charset: 'utf8mb4', collate: 'utf8mb4_bin' });
    }
    const indices = await qi.showIndex('fiscal_nsdocs_observations');
    if (!indices.some(i => i.unique && i.fields.map(f => f.attribute).join(',') === 'capture_id,access_key')) {
      await qi.addIndex('fiscal_nsdocs_observations', ['capture_id', 'access_key'], { unique: true, name: 'nsdocs_capture_access_unique' });
    }
  },
  async down() { throw Error('Reversao automatica bloqueada: preservar NF-e, XMLs e historico NSDOCS.'); }
};
