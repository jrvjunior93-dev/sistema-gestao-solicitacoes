'use strict';

// Somente estrutura aditiva. Documentos antigos continuam privados do DP.
module.exports = {
  async up({ queryInterface, DataTypes: Sequelize }) {
    const colaboradores = await queryInterface.describeTable('rh_colaboradores');
    if (!colaboradores.salario_restrito_obra) await queryInterface.addColumn('rh_colaboradores', 'salario_restrito_obra', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
    });
    const documentos = await queryInterface.describeTable('rh_documentos');
    if (!documentos.obra_origem_id) await queryInterface.addColumn('rh_documentos', 'obra_origem_id', {
      type: Sequelize.INTEGER, allowNull: true
    });
    if (!documentos.chave_envio_obra) await queryInterface.addColumn('rh_documentos', 'chave_envio_obra', {
      type: Sequelize.STRING(140), allowNull: true
    });
    const indexes = await queryInterface.showIndex('rh_colaboradores');
    if (!indexes.some(i => i.name === 'rh_colaborador_salario_restrito_obra_idx')) {
      await queryInterface.addIndex('rh_colaboradores', ['salario_restrito_obra', 'obra_id', 'id'], { name: 'rh_colaborador_salario_restrito_obra_idx' });
    }
    const docIndexes = await queryInterface.showIndex('rh_documentos');
    if (!docIndexes.some(i => i.name === 'rh_documento_envio_obra_uk')) {
      await queryInterface.addIndex('rh_documentos', ['colaborador_id', 'chave_envio_obra'], { name: 'rh_documento_envio_obra_uk', unique: true });
    }
  },
  async down() {
    throw new Error('Migration aditiva de privacidade: reversao estrutural exige plano especifico; nenhum dado ou coluna foi removido.');
  }
};
