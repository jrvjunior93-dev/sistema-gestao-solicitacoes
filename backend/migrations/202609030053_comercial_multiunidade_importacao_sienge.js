const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

async function addIndexIfMissing(queryInterface, sequelize, tableName, fields, options) {
  if (!(await indexExists(sequelize, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await columnExists(sequelize, 'parceiros', 'cadastro_incompleto'))) {
      await queryInterface.addColumn('parceiros', 'cadastro_incompleto', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
    if (!(await columnExists(sequelize, 'parceiros', 'origem_cadastro'))) {
      await queryInterface.addColumn('parceiros', 'origem_cadastro', {
        type: DataTypes.STRING(40),
        allowNull: true
      });
    }
    if (!(await columnExists(sequelize, 'contratos_comerciais', 'origem_dados'))) {
      await queryInterface.addColumn('contratos_comerciais', 'origem_dados', {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'FLUXY'
      });
    }
    if (!(await columnExists(sequelize, 'contratos_comerciais', 'identificador_externo'))) {
      await queryInterface.addColumn('contratos_comerciais', 'identificador_externo', {
        type: DataTypes.STRING(180),
        allowNull: true
      });
    }

    if (!(await tableExists(sequelize, 'contrato_comercial_unidades'))) {
      await queryInterface.createTable('contrato_comercial_unidades', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        contrato_comercial_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'contratos_comerciais', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        unidade_comercial_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'unidades_comerciais', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        principal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        valor_cadastro_referencia: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
        valor_atribuido: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
        confirmado_por: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        confirmado_em: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    if (!(await tableExists(sequelize, 'comercial_contrato_importacoes'))) {
      await queryInterface.createTable('comercial_contrato_importacoes', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        codigo: { type: DataTypes.STRING(50), allowNull: false },
        template_version: { type: DataTypes.STRING(20), allowNull: false },
        arquivo_nome: { type: DataTypes.STRING(255), allowNull: false },
        arquivo_hash: { type: DataTypes.STRING(64), allowNull: false },
        idempotency_key: { type: DataTypes.STRING(180), allowNull: true },
        status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PREVIEW' },
        total_contratos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        total_unidades: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        total_parcelas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        total_recebimentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        total_erros: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        total_avisos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        valor_contratos: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
        valor_saldo: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
        valor_recebido_principal: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
        erros_json: { type: DataTypes.TEXT('long'), allowNull: true },
        avisos_json: { type: DataTypes.TEXT('long'), allowNull: true },
        falha_mensagem: { type: DataTypes.TEXT, allowNull: true },
        criado_por: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        confirmado_por: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        expira_em: { type: DataTypes.DATE, allowNull: false },
        confirmado_em: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    if (!(await tableExists(sequelize, 'comercial_contrato_importacao_linhas'))) {
      await queryInterface.createTable('comercial_contrato_importacao_linhas', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        importacao_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'comercial_contrato_importacoes', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        aba: { type: DataTypes.STRING(40), allowNull: false },
        numero_linha: { type: DataTypes.INTEGER, allowNull: false },
        chave_importacao: { type: DataTypes.STRING(120), allowNull: false },
        fingerprint: { type: DataTypes.STRING(64), allowNull: true },
        payload_json: { type: DataTypes.TEXT('long'), allowNull: true },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'VALIDO' },
        erros_json: { type: DataTypes.TEXT('long'), allowNull: true },
        avisos_json: { type: DataTypes.TEXT('long'), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    if (!(await tableExists(sequelize, 'comercial_contrato_importacao_resultados'))) {
      await queryInterface.createTable('comercial_contrato_importacao_resultados', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        importacao_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'comercial_contrato_importacoes', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        chave_importacao: { type: DataTypes.STRING(120), allowNull: false },
        contrato_comercial_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'contratos_comerciais', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        status_resultado: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CRIADO' },
        parceiros_ids_json: { type: DataTypes.TEXT, allowNull: true },
        unidades_ids_json: { type: DataTypes.TEXT, allowNull: true },
        parcelas_ids_json: { type: DataTypes.TEXT('long'), allowNull: true },
        titulos_ids_json: { type: DataTypes.TEXT('long'), allowNull: true },
        movimentos_ids_json: { type: DataTypes.TEXT('long'), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    await addIndexIfMissing(queryInterface, sequelize, 'contrato_comercial_unidades', ['contrato_comercial_id', 'unidade_comercial_id'], {
      name: 'uk_contrato_comercial_unidades_vinculo', unique: true
    });
    await addIndexIfMissing(queryInterface, sequelize, 'contrato_comercial_unidades', ['unidade_comercial_id'], {
      name: 'idx_contrato_comercial_unidades_unidade'
    });
    await addIndexIfMissing(queryInterface, sequelize, 'contrato_comercial_unidades', ['contrato_comercial_id', 'principal'], {
      name: 'idx_contrato_comercial_unidades_principal'
    });
    await addIndexIfMissing(queryInterface, sequelize, 'contratos_comerciais', ['origem_dados', 'identificador_externo'], {
      name: 'uk_contratos_comerciais_origem_externa', unique: true
    });
    await addIndexIfMissing(queryInterface, sequelize, 'comercial_contrato_importacoes', ['codigo'], {
      name: 'uk_comercial_contrato_importacoes_codigo', unique: true
    });
    await addIndexIfMissing(queryInterface, sequelize, 'comercial_contrato_importacoes', ['idempotency_key'], {
      name: 'uk_comercial_contrato_importacoes_idempotency', unique: true
    });
    await addIndexIfMissing(queryInterface, sequelize, 'comercial_contrato_importacoes', ['arquivo_hash', 'criado_por'], {
      name: 'idx_comercial_contrato_importacoes_hash_usuario'
    });
    await addIndexIfMissing(queryInterface, sequelize, 'comercial_contrato_importacoes', ['status', 'expira_em'], {
      name: 'idx_comercial_contrato_importacoes_status_expira'
    });
    await addIndexIfMissing(queryInterface, sequelize, 'comercial_contrato_importacao_linhas', ['importacao_id', 'aba', 'numero_linha'], {
      name: 'uk_comercial_contrato_importacao_linha', unique: true
    });
    await addIndexIfMissing(queryInterface, sequelize, 'comercial_contrato_importacao_linhas', ['fingerprint'], {
      name: 'idx_comercial_contrato_importacao_linhas_fingerprint'
    });
    await addIndexIfMissing(queryInterface, sequelize, 'comercial_contrato_importacao_resultados', ['importacao_id', 'chave_importacao'], {
      name: 'uk_comercial_contrato_importacao_resultado', unique: true
    });
  },

  async down() {
    // Migration aditiva. A remocao exige auditoria previa dos contratos e recebimentos importados.
  }
};
