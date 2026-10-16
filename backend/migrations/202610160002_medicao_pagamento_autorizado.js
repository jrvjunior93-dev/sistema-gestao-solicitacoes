'use strict';
const { columnExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    if (!await columnExists(sequelize, 'titulos_financeiros', 'medicao_pagamento')) {
      await queryInterface.addColumn('titulos_financeiros', 'medicao_pagamento', { type: DataTypes.JSON, allowNull: true });
    }
    if (!await columnExists(sequelize, 'titulos_financeiros', 'medicao_pagamento_origem_id')) {
      await queryInterface.addColumn('titulos_financeiros', 'medicao_pagamento_origem_id', { type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'titulos_financeiros', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    }
    const indices = await queryInterface.showIndex('titulos_financeiros');
    if (!indices.some(i => i.name === 'idx_titulo_medicao_pagamento_origem')) {
      await queryInterface.addIndex('titulos_financeiros', ['medicao_pagamento_origem_id'], { name: 'idx_titulo_medicao_pagamento_origem' });
    }
  },
  async down() { throw Error('Preserve titulos e auditoria: rollback estrutural exige revisao explicita.'); }
};
