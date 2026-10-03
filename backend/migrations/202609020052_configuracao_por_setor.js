'use strict';

const { indexExists, tableExists } = require('../src/database/schemaUtils');

/**
 * CONFIGURAÇÃO POR SETOR (camada do administrador) — pacote B4 da reforma
 * do frontend (docs/PROPOSTA-BACKEND.md, item 6). Três tabelas, nenhuma
 * permissão nova: a escrita dos três CRUDs usa o gate de configurações já
 * existente (`allowConfiguracoesStatusVinculos`); a leitura é metadado de
 * interface, aberta a autenticados.
 *
 * 1. `setor_atalhos_padrao` — atalhos sugeridos/obrigatórios por setor.
 *    `destino_id` referencia o id do destino na fonte única de navegação
 *    do frontend (frontend/src/navigation/navigationConfig.jsx); rótulo,
 *    ícone, rota e permissão vêm SEMPRE de lá — aqui só a associação.
 *    `obrigatorio` marca o atalho como não removível (máx. 2 por setor,
 *    validado no controller). Atalho cujo destino o usuário não pode ver
 *    simplesmente não aparece (a resolução por permissão é do frontend).
 *
 * 2. `setor_detalhe_layout` — arranjo dos blocos por setor de um CATÁLOGO
 *    FIXO de blocos que a tela já possui (nenhum bloco novo nasce aqui).
 *    `tela` discrimina o catálogo ('detalhe-solicitacao' | 'home');
 *    `config` é JSON `[{ bloco, visivel, posicao }]`. O usuário sobrepõe
 *    com o próprio arranjo (usuario_lista_preferencias); sem configuração
 *    vale o layout atual — nada quebra. (No FLUXY eram duas migrations —
 *    tabela e depois a coluna `tela`; nenhuma rodou fora de lá, então aqui
 *    nascem consolidadas.)
 *
 * 3. `acoes_principais_setor` — mapeamento setor+estado → ação em
 *    destaque no detalhe da solicitação. `status_global` NULL é curinga
 *    (vale para qualquer estado); o match mais específico vence. Sem
 *    linha correspondente, o detalhe mantém o comportamento genérico.
 *
 * `setor` é o token de setor usado nas telas (string), não FK — o mesmo
 * identificador que as permissões setoriais já usam.
 */

const OPCOES_TABELA = { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' };

async function criarIndice(queryInterface, sequelize, tabela, campos, nome, unique = false) {
  if (await indexExists(sequelize, tabela, nome)) return;
  await queryInterface.addIndex(tabela, campos, { name: nome, unique });
}

const ATALHOS = 'setor_atalhos_padrao';
const LAYOUTS = 'setor_detalhe_layout';
const ACOES = 'acoes_principais_setor';

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, ATALHOS))) {
      await queryInterface.createTable(ATALHOS, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        setor: { type: DataTypes.STRING(120), allowNull: false },
        destino_id: { type: DataTypes.STRING(120), allowNull: false },
        obrigatorio: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        posicao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
      }, OPCOES_TABELA);
    }
    await criarIndice(queryInterface, sequelize, ATALHOS, ['setor'], 'idx_setor_atalhos_padrao');
    await criarIndice(queryInterface, sequelize, ATALHOS, ['setor', 'destino_id'], 'uniq_setor_atalhos_destino', true);

    if (!(await tableExists(sequelize, LAYOUTS))) {
      await queryInterface.createTable(LAYOUTS, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        // Nasce já com `tela`: a Home e o detalhe usam o mesmo motor.
        tela: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'detalhe-solicitacao' },
        setor: { type: DataTypes.STRING(120), allowNull: false },
        config: { type: DataTypes.TEXT, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
      }, OPCOES_TABELA);
    }
    await criarIndice(queryInterface, sequelize, LAYOUTS, ['tela', 'setor'], 'uniq_setor_layout_tela', true);

    if (!(await tableExists(sequelize, ACOES))) {
      await queryInterface.createTable(ACOES, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        setor: { type: DataTypes.STRING(120), allowNull: false },
        status_global: { type: DataTypes.STRING(120), allowNull: true },
        acao: { type: DataTypes.STRING(80), allowNull: false },
        rotulo: { type: DataTypes.STRING(120), allowNull: true },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
      }, OPCOES_TABELA);
    }
    await criarIndice(queryInterface, sequelize, ACOES, ['setor'], 'idx_acoes_principais_setor');
  },

  async down() {
    // Migration aditiva: rollback destrutivo somente de forma assistida.
  }
};
