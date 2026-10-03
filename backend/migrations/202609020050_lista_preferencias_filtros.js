'use strict';

const {
  foreignKeyExists,
  indexExists,
  tableExists
} = require('../src/database/schemaUtils');

/**
 * PREFERENCIAS E FILTROS SALVOS DAS LISTAS (componente ListaAvancada) —
 * pacote B1 da reforma do frontend (docs/PROPOSTA-BACKEND.md, item 2).
 *
 * Duas tabelas, ambas SEMPRE do proprio usuario autenticado (o controller
 * nao aceita ler nem escrever registro de outra pessoa):
 *
 * 1. `usuario_lista_preferencias` — preferencias de exibicao POR USUARIO e
 *    POR CHAVE (`lista`, ex.: 'solicitacoes', 'home', 'atalhos',
 *    'detalhe-solicitacao'): colunas visiveis, larguras, modo
 *    tabela/cards, paginacao, agrupamento, arranjo de blocos. JSON
 *    serializado em `preferencias`. No banco, e nao em localStorage: o
 *    usuario nao perde a configuracao ao trocar de maquina, abrir no
 *    celular ou limpar o cache — e o mesmo mecanismo serve as proximas
 *    listas sem nova tabela.
 *
 * 2. `usuario_lista_filtros` — filtros nomeados criados pelo usuario
 *    (conteudo dele, nao preferencia de tela). Varios por usuario+lista.
 *
 * FK explicita para `users` com nome curto (Regra 6 da convencao) e
 * onDelete RESTRICT, como as migrations recentes da casa: usuario aqui e
 * desativado, nunca apagado — o RESTRICT nao atrapalha e evita linha orfa.
 */

const OPCOES_TABELA = { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' };

async function criarIndice(queryInterface, sequelize, tabela, campos, nome, unique = false) {
  if (await indexExists(sequelize, tabela, nome)) return;
  await queryInterface.addIndex(tabela, campos, { name: nome, unique });
}

async function criarFk(queryInterface, sequelize, tabela, campo, alvo, nome) {
  if (await foreignKeyExists(sequelize, tabela, nome)) return;
  await queryInterface.addConstraint(tabela, {
    fields: [campo],
    type: 'foreign key',
    name: nome,
    references: { table: alvo, field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT'
  });
}

const PREFERENCIAS = 'usuario_lista_preferencias';
const FILTROS = 'usuario_lista_filtros';

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, PREFERENCIAS))) {
      await queryInterface.createTable(PREFERENCIAS, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        usuario_id: { type: DataTypes.INTEGER, allowNull: false },
        lista: { type: DataTypes.STRING(80), allowNull: false },
        preferencias: { type: DataTypes.TEXT, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
      }, OPCOES_TABELA);
    }
    // Um registro por usuario+lista: o PUT substitui, nunca acumula.
    await criarIndice(queryInterface, sequelize, PREFERENCIAS, ['usuario_id', 'lista'], 'uq_usr_lista_pref', true);
    await criarFk(queryInterface, sequelize, PREFERENCIAS, 'usuario_id', 'users', 'fk_usr_lista_pref_user');

    if (!(await tableExists(sequelize, FILTROS))) {
      await queryInterface.createTable(FILTROS, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        usuario_id: { type: DataTypes.INTEGER, allowNull: false },
        lista: { type: DataTypes.STRING(80), allowNull: false },
        nome: { type: DataTypes.STRING(120), allowNull: false },
        filtros: { type: DataTypes.TEXT, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
      }, OPCOES_TABELA);
    }
    // Nao-unico de proposito: varios filtros nomeados por usuario+lista
    // (a unicidade do NOME e regra do controller, que substitui em vez de
    // duplicar).
    await criarIndice(queryInterface, sequelize, FILTROS, ['usuario_id', 'lista'], 'idx_usr_lista_filtros');
    await criarFk(queryInterface, sequelize, FILTROS, 'usuario_id', 'users', 'fk_usr_lista_filtros_user');
  },

  async down() {
    // Migration aditiva: rollback destrutivo somente de forma assistida.
  }
};
