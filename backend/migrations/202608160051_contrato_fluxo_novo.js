'use strict';

const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

const TABELA = 'contratos';

/**
 * Estrutura do novo fluxo de contratos.
 *
 * Aditiva: todas as colunas sao nullable (ou tem default), para a versao anterior do
 * codigo continuar inserindo normalmente se houver rollback.
 *
 * `fluxo_novo` default false e a trava que protege o legado: os 335 contratos ja
 * existentes ficam automaticamente no fluxo antigo, sem migracao de dados.
 */
const COLUNAS = {
  fluxo_novo: { tipo: 'BOOLEAN', allowNull: false, defaultValue: false, after: 'ativo' },
  status_contrato: { tipo: 'STRING', tamanho: 30, after: 'fluxo_novo' },
  objeto: { tipo: 'TEXT', after: 'descricao' },
  detalhes_contratacao: { tipo: 'TEXT', after: 'objeto' },
  vigencia_inicio: { tipo: 'DATEONLY', after: 'status_contrato' },
  vigencia_fim: { tipo: 'DATEONLY', after: 'vigencia_inicio' },
  responsavel_id: { tipo: 'INTEGER', after: 'vigencia_fim' },
  forma_pagamento_id: { tipo: 'INTEGER', after: 'responsavel_id' },
  qtde_parcelas: { tipo: 'INTEGER', after: 'forma_pagamento_id' },
  // Acumulado de aditivos ja aplicados. O teto de 25% e sobre a soma, nao por aditivo.
  valor_aditivos: { tipo: 'DECIMAL', allowNull: false, defaultValue: 0, after: 'valor_total' },
  aprovado_por: { tipo: 'INTEGER', after: 'qtde_parcelas' },
  aprovado_em: { tipo: 'DATE', after: 'aprovado_por' },
  rejeitado_por: { tipo: 'INTEGER', after: 'aprovado_em' },
  rejeitado_em: { tipo: 'DATE', after: 'rejeitado_por' },
  motivo_rejeicao: { tipo: 'TEXT', after: 'rejeitado_em' }
};

function montarTipo(DataTypes, definicao) {
  if (definicao.tipo === 'STRING') return DataTypes.STRING(definicao.tamanho);
  if (definicao.tipo === 'DECIMAL') return DataTypes.DECIMAL(14, 2);
  return DataTypes[definicao.tipo];
}

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, TABELA))) return;

    for (const [nome, definicao] of Object.entries(COLUNAS)) {
      if (await columnExists(sequelize, TABELA, nome)) continue;

      await queryInterface.addColumn(TABELA, nome, {
        type: montarTipo(DataTypes, definicao),
        allowNull: definicao.allowNull === false ? false : true,
        ...(definicao.defaultValue !== undefined ? { defaultValue: definicao.defaultValue } : {}),
        after: definicao.after
      });
    }

    if (!(await indexExists(sequelize, TABELA, 'idx_contratos_fluxo_novo'))) {
      await queryInterface.addIndex(TABELA, ['fluxo_novo'], { name: 'idx_contratos_fluxo_novo' });
    }

    // Sequencial do codigo CT-0001. Tabela dedicada porque MAX(numero)+1 em codigo de
    // aplicacao nao e seguro sob concorrencia: dois solicitantes simultaneos leem o
    // mesmo maximo e geram o mesmo codigo.
    if (!(await tableExists(sequelize, 'contrato_codigo_sequencias'))) {
      await queryInterface.createTable('contrato_codigo_sequencias', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        chave: { type: DataTypes.STRING(80), allowNull: false, unique: true },
        ultimo_numero: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    // Semeia a linha da sequencia. Cria-la sob demanda, com varios solicitantes
    // simultaneos, fazia todos disputarem o mesmo INSERT e cair em deadlock.
    await sequelize.query(
      'INSERT IGNORE INTO contrato_codigo_sequencias (chave, ultimo_numero, createdAt, updatedAt) ' +
      "VALUES ('CONTRATO_FLUXO_NOVO', 0, NOW(), NOW())"
    );

    // O indice unico (codigo, obra_id) fica na migration seguinte, de proposito:
    // ele depende da limpeza dos duplicados e precisa poder falhar sem levar junto
    // a criacao das colunas.
  },

  async down() {
    // Sem rollback destrutivo: as colunas preservam dados do fluxo novo de contratos.
  }
};
