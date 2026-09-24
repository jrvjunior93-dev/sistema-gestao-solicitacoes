const {
  columnExists,
  foreignKeyExists,
  indexExists,
  tableExists
} = require('../src/database/schemaUtils');

async function addColumnIfMissing(queryInterface, sequelize, table, column, definition) {
  if (!(await columnExists(sequelize, table, column))) {
    await queryInterface.addColumn(table, column, definition);
  }
}

module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {

    await addColumnIfMissing(queryInterface, sequelize, 'rh_colaboradores', 'forma_calculo_gerencial', {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'MENSAL',
      after: 'valor_contratual'
    });
    await addColumnIfMissing(queryInterface, sequelize, 'rh_colaboradores', 'valor_diaria', {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      after: 'forma_calculo_gerencial'
    });
    await addColumnIfMissing(queryInterface, sequelize, 'rh_colaboradores', 'pagamento_automatico_40_60', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'valor_diaria'
    });

    await addColumnIfMissing(queryInterface, sequelize, 'rh_solicitacoes', 'codigo', {
      type: DataTypes.STRING(30),
      allowNull: true,
      after: 'id'
    });
    await sequelize.query(
      "UPDATE rh_solicitacoes SET codigo = CONCAT('RH-', LPAD(id, 6, '0')) WHERE codigo IS NULL OR TRIM(codigo) = ''"
    );
    if (!(await indexExists(sequelize, 'rh_solicitacoes', 'uq_rh_solicitacoes_codigo'))) {
      await queryInterface.addIndex('rh_solicitacoes', ['codigo'], {
        name: 'uq_rh_solicitacoes_codigo',
        unique: true
      });
    }

    const eventoColumns = {
      modo_valor: {
        type: DataTypes.STRING(20), allowNull: false, defaultValue: 'TOTAL', after: 'valor'
      },
      valor_total: {
        type: DataTypes.DECIMAL(14, 2), allowNull: true, after: 'modo_valor'
      },
      valor_parcela: {
        type: DataTypes.DECIMAL(14, 2), allowNull: true, after: 'valor_total'
      },
      beneficiario_nome: {
        type: DataTypes.STRING(180), allowNull: true, after: 'parcelas_total'
      },
      beneficiario_documento: {
        type: DataTypes.STRING(14), allowNull: true, after: 'beneficiario_nome'
      },
      beneficiario_banco: {
        type: DataTypes.STRING(120), allowNull: true, after: 'beneficiario_documento'
      },
      beneficiario_agencia: {
        type: DataTypes.STRING(30), allowNull: true, after: 'beneficiario_banco'
      },
      beneficiario_conta: {
        type: DataTypes.STRING(40), allowNull: true, after: 'beneficiario_agencia'
      },
      beneficiario_tipo_conta: {
        type: DataTypes.STRING(30), allowNull: true, after: 'beneficiario_conta'
      },
      beneficiario_chave_pix: {
        type: DataTypes.STRING(120), allowNull: true, after: 'beneficiario_tipo_conta'
      }
    };
    for (const [column, definition] of Object.entries(eventoColumns)) {
      // eslint-disable-next-line no-await-in-loop
      await addColumnIfMissing(queryInterface, sequelize, 'rh_eventos_recorrentes', column, definition);
    }

    if (await tableExists(sequelize, 'rh_fechamento_titulos')) {
      await addColumnIfMissing(queryInterface, sequelize, 'rh_fechamento_titulos', 'tipo_titulo', {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'INTEGRAL',
        after: 'parceiro_id'
      });
      await addColumnIfMissing(queryInterface, sequelize, 'rh_fechamento_titulos', 'evento_recorrente_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        after: 'tipo_titulo'
      });
      if (!(await foreignKeyExists(
        sequelize,
        'rh_fechamento_titulos',
        'fk_rh_fechamento_titulos_evento_recorrente'
      ))) {
        await queryInterface.addConstraint('rh_fechamento_titulos', {
          fields: ['evento_recorrente_id'],
          type: 'foreign key',
          name: 'fk_rh_fechamento_titulos_evento_recorrente',
          references: { table: 'rh_eventos_recorrentes', field: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        });
      }

      // Um item mensal pode gerar adiantamento (40%), saldo (60%) e pensao. Portanto, a relacao
      // item -> titulo deixa de ser unica, preservando a rastreabilidade de cada parcela.
      if (!(await indexExists(sequelize, 'rh_fechamento_titulos', 'idx_rh_fechamento_titulos_item'))) {
        await queryInterface.addIndex('rh_fechamento_titulos', ['apuracao_evento_id'], {
          name: 'idx_rh_fechamento_titulos_item'
        });
      }
      if (await indexExists(sequelize, 'rh_fechamento_titulos', 'uq_rh_fechamento_titulos_item')) {
        await queryInterface.removeIndex('rh_fechamento_titulos', 'uq_rh_fechamento_titulos_item');
      }
      if (!(await indexExists(sequelize, 'rh_fechamento_titulos', 'idx_rh_fechamento_titulos_titulo'))) {
        await queryInterface.addIndex('rh_fechamento_titulos', ['titulo_financeiro_id'], {
          name: 'idx_rh_fechamento_titulos_titulo'
        });
      }
      if (await indexExists(sequelize, 'rh_fechamento_titulos', 'uq_rh_fechamento_titulos_titulo')) {
        await queryInterface.removeIndex('rh_fechamento_titulos', 'uq_rh_fechamento_titulos_titulo');
      }
    }
  }
};
