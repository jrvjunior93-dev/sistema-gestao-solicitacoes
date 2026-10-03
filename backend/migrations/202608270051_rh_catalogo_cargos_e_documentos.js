'use strict';

const {
  columnExists,
  foreignKeyExists,
  indexExists,
  tableExists
} = require('../src/database/schemaUtils');

/**
 * FASE 7 DO DP — O CATALOGO QUE OS QUATRO CHECKLISTS COBRAM (27/08).
 *
 * O escopo do cliente (itens 8 a 11) repete quatro vezes a mesma frase: "o sistema so permite
 * concluir a solicitacao se todos os documentos marcados no checklist estiverem efetivamente
 * anexados". Nada disso e possivel com o catalogo de hoje, e esta migration abre o que falta.
 *
 * TRES BURACOS, MEDIDOS ANTES DE ESCREVER:
 *
 * 1. CARGO NAO EXISTE COMO LISTA. O escopo pede "Cargo (lista do banco de dados)". A tabela `cargos`
 *    existe, mas tem GEO, FINANCEIRO, DP e DIRETOR — e SETOR ADMINISTRATIVO, nao cargo de obra. O
 *    cargo real dos 137 colaboradores esta em `rh_colaboradores.cargo`, TEXTO LIVRE, com 21 valores
 *    distintos e grafia inconsistente (uns em caixa alta, outros em caixa mista). Conferido: depois
 *    de normalizar acento, espaco e caixa continuam sendo 21 — nenhuma duplicata semantica. Dai
 *    `rh_cargos`, que padroniza a grafia sem fundir cargo nenhum.
 *
 *    `rh_colaboradores.cargo` CONTINUA EXISTINDO e nao e tocada aqui. Duas razoes: migration nao
 *    mexe em dado (Regra 5), e apagar o texto antes do script de mapeamento rodar perderia os 21
 *    valores que sao a unica fonte para montar a lista.
 *
 * 2. A OBRIGATORIEDADE NAO SABE DE QUAL PEDIDO ESTA FALANDO. Hoje `rh_documentos_tipos.obrigatorio`
 *    e decidido so por `tipo_vinculo` (CLT / NAO CLT). Mas RG e obrigatorio na ADMISSAO e irrelevante
 *    no PAGAMENTO DE MAO DE OBRA. Sem o eixo "para qual tipo de solicitacao", o checklist da
 *    admissao cobraria cartao de ponto e o do pagamento cobraria certidao de nascimento.
 *
 *    Dai `rh_documento_exigencias`, que cruza documento x tipo x subtipo e diz o NIVEL:
 *
 *      OBRIGATORIO — trava o ENVIO. E a "Documentacao Obrigatoria" do escopo.
 *      CONDICIONAL — o "quando aplicavel" do escopo. Aparece no checklist, nao trava sozinho.
 *      OPCIONAL    — o "(opcional)" do escopo. Titulo de eleitor, relatorio do gestor.
 *
 * 3. NAO HA ONDE GRAVAR A PROMESSA. Decisao do cliente em 27/08, sobre a leitura do escopo: sao
 *    DUAS CAMADAS. A documentacao obrigatoria trava no ENVIO; o checklist marcado trava na
 *    CONCLUSAO — o que a obra marcou, a obra entrega.
 *
 *    Isso preserva a decisao ja tomada na Fase 3 ("AVISA, NAO TRAVA", porque o ASO costuma sair
 *    depois do pedido): nao marcar o ASO na abertura continua permitido. O que deixa de ser
 *    permitido e marcar e nao entregar.
 *
 *    Marcar e um ATO DE ALGUEM, entao `rh_solicitacao_checklist` grava QUEM e QUANDO — e nao um
 *    booleano num JSON. Mesma razao de `validado_por` existir na Fase 3: promessa sem dono nao
 *    cobra ninguem.
 *
 *    Tabela, e nao JSON: e ela que o portao da conclusao le a cada tentativa, e uma FK impede que um
 *    tipo de documento removido do catalogo deixe promessa pendurada apontando para o nada.
 *
 * O `subtipo` em `rh_solicitacoes` nasce AQUI, e nao na Fase 10, porque `rh_documento_exigencias`
 * aponta para ele: o checklist de "Atestado" nao e o de "Ferias", e os dois sao MOVIMENTACAO.
 *
 * NADA DE DADO. Os ~22 tipos de documento novos e o mapeamento dos 21 cargos em texto livre vao em
 * `backend/scripts/dados/`, com `--conferir`, fora da cadeia de migrations (Regra 5). Depois do
 * deploy as tabelas existem VAZIAS ate os scripts rodarem.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md` (Regra 3).
 */

const CARGOS = 'rh_cargos';
const EXIGENCIAS = 'rh_documento_exigencias';
const CHECKLIST = 'rh_solicitacao_checklist';
const COLABORADORES = 'rh_colaboradores';
const SOLICITACOES = 'rh_solicitacoes';

/**
 * COLLATION FIXADA, e nao herdada do banco.
 *
 * Descoberto ao rodar o seed em 27/08: `rh_colaboradores` e `rh_documentos_tipos` sao
 * `utf8mb4_0900_ai_ci`, enquanto o padrao deste banco e `utf8mb4_unicode_ci`. Comparar texto entre
 * uma tabela nova e `rh_colaboradores.cargo` estourou com "Illegal mix of collations".
 *
 * Herdar o padrao do banco faria a tabela nascer com uma collation AQUI e possivelmente outra em
 * producao — e o erro apareceria la, no deploy, e nao aqui. Fixar torna o resultado igual nos dois.
 */
const OPCOES_TABELA = { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' };

async function criarIndice(queryInterface, sequelize, tabela, campos, nome) {
  if (await indexExists(sequelize, tabela, nome)) return;
  await queryInterface.addIndex(tabela, campos, { name: nome });
}

async function criarIndiceUnico(queryInterface, sequelize, tabela, campos, nome) {
  if (await indexExists(sequelize, tabela, nome)) return;
  await queryInterface.addIndex(tabela, campos, { name: nome, unique: true });
}

/**
 * FK com nome explicito, sempre — Regra 6. `rh_documento_exigencias` tem 25 caracteres, e o nome
 * gerado automaticamente (`<tabela>_<coluna>_foreign_idx`) passa perto do limite de 64 do MySQL.
 * Um estouro aqui derruba o boot inteiro, porque `server.js` roda as migrations antes de abrir a
 * porta.
 */
async function criarFk(queryInterface, sequelize, tabela, campo, alvo, nome, onDelete = 'RESTRICT') {
  if (await foreignKeyExists(sequelize, tabela, nome)) return;
  await queryInterface.addConstraint(tabela, {
    fields: [campo],
    type: 'foreign key',
    name: nome,
    references: { table: alvo, field: 'id' },
    onUpdate: 'CASCADE',
    onDelete
  });
}

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    // ---------------------------------------------------------------- 1. cargos
    if (!(await tableExists(sequelize, CARGOS))) {
      await queryInterface.createTable(CARGOS, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        // O codigo e o que o script de dados usa para casar com o texto livre de hoje sem depender
        // de acento nem de caixa: `AUXILIAR_DE_OBRAS` cobre `AUXILIAR DE OBRAS`.
        codigo: { type: DataTypes.STRING(80), allowNull: false },
        nome: { type: DataTypes.STRING(120), allowNull: false },
        // CBO fica anulavel de proposito: a empresa nao usa hoje, e exigir agora travaria o
        // cadastro dos 21 cargos que ja existem por um dado que ninguem tem.
        cbo: { type: DataTypes.STRING(10), allowNull: true },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
      }, OPCOES_TABELA);
    }
    await criarIndiceUnico(queryInterface, sequelize, CARGOS, ['codigo'], 'uq_rh_cargos_codigo');
    await criarIndice(queryInterface, sequelize, CARGOS, ['ativo', 'nome'], 'idx_rh_cargos_ativo');

    if (!(await columnExists(sequelize, COLABORADORES, 'cargo_id'))) {
      await queryInterface.addColumn(COLABORADORES, 'cargo_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        after: 'cargo'
      });
    }
    await criarFk(queryInterface, sequelize, COLABORADORES, 'cargo_id', CARGOS, 'fk_rh_colab_cargo');

    // O escopo pede carga horaria na admissao, e ela e do VINCULO, nao do pedido — precisa
    // sobreviver a solicitacao que a criou.
    if (!(await columnExists(sequelize, COLABORADORES, 'carga_horaria_semanal'))) {
      await queryInterface.addColumn(COLABORADORES, 'carga_horaria_semanal', {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        after: 'cargo_id'
      });
    }

    // -------------------------------------------------- 2. subtipo da solicitacao
    if (!(await columnExists(sequelize, SOLICITACOES, 'subtipo'))) {
      await queryInterface.addColumn(SOLICITACOES, 'subtipo', {
        type: DataTypes.STRING(40),
        allowNull: true,
        after: 'tipo'
      });
    }
    await criarIndice(queryInterface, sequelize, SOLICITACOES, ['tipo', 'subtipo'], 'idx_rh_sol_tipo_subtipo');

    // ------------------------------------------------------- 3. exigencias
    if (!(await tableExists(sequelize, EXIGENCIAS))) {
      await queryInterface.createTable(EXIGENCIAS, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        documento_tipo_id: { type: DataTypes.INTEGER, allowNull: false },
        // Texto, e nao FK: o tipo do pedido do DP e uma constante de codigo (`ADMISSAO`,
        // `MOVIMENTACAO`), nao uma linha de tabela. Ver `TIPOS` em rhSolicitacaoService.
        solicitacao_tipo: { type: DataTypes.STRING(30), allowNull: false },
        // NULO = vale para todo subtipo do tipo. E o caso da ADMISSAO, que nao tem subtipo.
        solicitacao_subtipo: { type: DataTypes.STRING(40), allowNull: true },
        // OBRIGATORIO trava o envio | CONDICIONAL e o "quando aplicavel" | OPCIONAL nao cobra nada
        nivel: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CONDICIONAL' },
        // Ordem de exibicao do checklist na tela. O escopo lista os documentos numa ordem que a obra
        // ja conhece de cor; embaralhar isso custa conferencia.
        ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
      }, OPCOES_TABELA);
    }
    await criarIndice(
      queryInterface, sequelize, EXIGENCIAS,
      ['solicitacao_tipo', 'solicitacao_subtipo', 'ativo'], 'idx_rh_exig_tipo'
    );
    await criarFk(queryInterface, sequelize, EXIGENCIAS, 'documento_tipo_id', 'rh_documentos_tipos', 'fk_rh_exig_doc_tipo');

    // -------------------------------------------------------- 4. checklist
    if (!(await tableExists(sequelize, CHECKLIST))) {
      await queryInterface.createTable(CHECKLIST, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
        documento_tipo_id: { type: DataTypes.INTEGER, allowNull: false },
        // QUEM prometeu e QUANDO. Um booleano diria que alguem marcou, sem dizer quem cobrar.
        marcado_por: { type: DataTypes.INTEGER, allowNull: true },
        marcado_em: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
      }, OPCOES_TABELA);
    }
    // Marcar duas vezes o mesmo documento e uma promessa so.
    await criarIndiceUnico(
      queryInterface, sequelize, CHECKLIST,
      ['solicitacao_id', 'documento_tipo_id'], 'uq_rh_checklist_item'
    );
    // CASCADE aqui, e so aqui: a promessa nao existe sem o pedido. Apagado o pedido, a linha do
    // checklist vira lixo que nao aponta para nada.
    await criarFk(queryInterface, sequelize, CHECKLIST, 'solicitacao_id', SOLICITACOES, 'fk_rh_checklist_sol', 'CASCADE');
    await criarFk(queryInterface, sequelize, CHECKLIST, 'documento_tipo_id', 'rh_documentos_tipos', 'fk_rh_checklist_doc');
  },

  async down() {
    // Sem rollback destrutivo: derrubar o catalogo levaria junto o checklist ja prometido e o
    // vinculo do colaborador com o cargo. As tabelas ficam.
  }
};
