const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    if (!(await tableExists(sequelize, 'obras'))) return;

    if (!(await columnExists(sequelize, 'obras', 'nivel_apropriacao_formulario'))) {
      await queryInterface.addColumn('obras', 'nivel_apropriacao_formulario', {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null
      });
    }

    if (!(await indexExists(sequelize, 'obras', 'idx_obras_nivel_apropriacao_formulario'))) {
      await queryInterface.addIndex('obras', ['nivel_apropriacao_formulario'], {
        name: 'idx_obras_nivel_apropriacao_formulario'
      });
    }

    if (await tableExists(sequelize, 'apropriacoes')
      && await columnExists(sequelize, 'apropriacoes', 'macro_formulario')) {
      await sequelize.query(`
        UPDATE obras o
        SET o.nivel_apropriacao_formulario = 'PERSONALIZADO'
        WHERE o.nivel_apropriacao_formulario IS NULL
          AND EXISTS (
            SELECT 1
            FROM apropriacoes a
            WHERE a.obra_id = o.id
              AND a.ativo = 1
              AND a.macro_formulario = 1
          )
      `);
    }
  },

  async down() {
    // Conservadora: a configuracao passa a integrar a regra operacional da obra.
  }
};
