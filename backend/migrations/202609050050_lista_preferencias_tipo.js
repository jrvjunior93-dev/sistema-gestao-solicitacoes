'use strict';

const {
  columnExists,
  indexExists,
  tableExists
} = require('../src/database/schemaUtils');

/**
 * PREFERENCIA DE LISTA SEPARADA POR TIPO
 * (`usuario_lista_preferencias`, componente ListaAvancada).
 *
 * O QUE MUDA
 * 1. `lista` passa de VARCHAR(80) para VARCHAR(160) nas duas tabelas de
 *    preferencia. As chaves de tabela do frontend sao hierarquicas
 *    (`tabela:auditoria-operacional:produtividade-financeira`): medidas
 *    em 05/09/2026, 280 chaves distintas, a maior com 64 caracteres.
 *    O teto anterior ja estava perto do maior caso real.
 * 2. Coluna `tipo` VARCHAR(20) NOT NULL DEFAULT 'geral', e o indice
 *    unico passa de (usuario_id, lista) para (usuario_id, lista, tipo).
 *
 * POR QUE POR TIPO, E NAO UM JSON SO
 * - o cliente vai querer resetar um tipo (as larguras, por exemplo) sem
 *   perder os outros;
 * - com JSON unico, duas abas abertas se sobrescrevem: arrastar uma
 *   coluna numa aba reescreveria blocos e filtros gravados na outra.
 *
 * SEM BACKFILL, DE PROPOSITO
 * Migration aqui altera ESTRUTURA, nunca DADO (Regra 5 de
 * CONVENCAO-MIGRATIONS.md — `runMigrations.js` varre o fonte e recusa a
 * migration que grave dado). O `DEFAULT 'geral'` resolve sozinho: o
 * proprio ALTER TABLE preenche as linhas ja existentes com 'geral', que
 * e exatamente o balde da rota legada — nenhuma linha nasce vazia e
 * nenhum script de dados e necessario.
 *
 * ORDEM DAS OPERACOES (importa)
 * O indice novo e criado ANTES de o antigo sair. `uq_usr_lista_pref` e o
 * indice que sustenta a FK `fk_usr_lista_pref_user`; o MySQL recusaria
 * remove-lo enquanto fosse o unico com `usuario_id` como prefixo a
 * esquerda. Criado o novo (que comeca por `usuario_id`), a FK segue
 * sustentada e o antigo pode sair.
 *
 * Nomes de indice curtos (Regra 6): o limite de 64 caracteres do MySQL
 * ja derrubou o boot do backend uma vez, e `server.js` roda as
 * migrations antes de abrir a porta.
 */

const PREFERENCIAS = 'usuario_lista_preferencias';
const FILTROS = 'usuario_lista_filtros';

const LISTA_TAMANHO = 160;
const INDICE_NOVO = 'uq_usr_lista_pref_tipo';
const INDICE_ANTIGO = 'uq_usr_lista_pref';

async function tamanhoDaColuna(sequelize, tabela, coluna) {
  const [rows] = await sequelize.query(
    `SELECT CHARACTER_MAXIMUM_LENGTH AS tamanho
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    { replacements: [tabela, coluna] }
  );

  return Number(rows?.[0]?.tamanho || 0);
}

async function ampliarColunaLista({ DataTypes, queryInterface, sequelize }, tabela) {
  if (!(await tableExists(sequelize, tabela))) return;
  if (!(await columnExists(sequelize, tabela, 'lista'))) return;
  if (await tamanhoDaColuna(sequelize, tabela, 'lista') >= LISTA_TAMANHO) return;

  await queryInterface.changeColumn(tabela, 'lista', {
    type: DataTypes.STRING(LISTA_TAMANHO),
    allowNull: false
  });
}

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, PREFERENCIAS))) {
      // A tabela nasce em 202609020050_lista_preferencias_filtros.js.
      // Sem ela nao ha o que alterar aqui.
      return;
    }

    await ampliarColunaLista({ DataTypes, queryInterface, sequelize }, PREFERENCIAS);
    await ampliarColunaLista({ DataTypes, queryInterface, sequelize }, FILTROS);

    if (!(await columnExists(sequelize, PREFERENCIAS, 'tipo'))) {
      await queryInterface.addColumn(PREFERENCIAS, 'tipo', {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'geral'
      });
    }

    // Valores fechados (`colunas`, `larguras`, `filtros`, `blocos`,
    // `visual`, `geral`) validados em
    // src/validators/listaPreferenciasValidators.js. VARCHAR e nao ENUM
    // para que um tipo novo seja mudanca de codigo, sem ALTER TABLE
    // numa tabela com indice unico.
    if (!(await indexExists(sequelize, PREFERENCIAS, INDICE_NOVO))) {
      await queryInterface.addIndex(PREFERENCIAS, ['usuario_id', 'lista', 'tipo'], {
        name: INDICE_NOVO,
        unique: true
      });
    }

    if (await indexExists(sequelize, PREFERENCIAS, INDICE_ANTIGO)) {
      await queryInterface.removeIndex(PREFERENCIAS, INDICE_ANTIGO);
    }
  },

  async down() {
    // Migration aditiva: rollback destrutivo somente de forma assistida.
  }
};
