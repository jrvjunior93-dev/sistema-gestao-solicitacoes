'use strict';

const { columnExists, foreignKeyExists } = require('../src/database/schemaUtils');

/**
 * FASE 8 DO DP — O CADASTRO QUE A ADMISSAO PRECISA TER (27/08).
 *
 * O item 8 do escopo lista 14 campos obrigatorios na admissao. Conferido contra
 * `rh_colaboradores`: SEIS nao tinham onde morar — nome dos pais, endereco, dados bancarios, chave
 * PIX, carga horaria e responsavel pela contratacao.
 *
 * A carga horaria ja nasceu na Fase 7. Esta migration abre o resto.
 *
 * POR QUE NO COLABORADOR, E NAO NO `dados_json` DO PEDIDO. O pedido de admissao morre depois de
 * aprovado; o endereco e a conta bancaria do colaborador nao. Guardar isso so no JSON do pedido
 * faria o dado existir enquanto o pedido existisse, e sumir da ficha depois — que e o oposto do que
 * "carteira de colaboradores por obra" significa.
 *
 * NOMES SEGUEM A CONVENCAO DA CASA, e nao uma inventada aqui:
 *
 *   endereco / numero / complemento / bairro / municipio / estado / cep   <- igual a `parceiros`
 *   banco / agencia / conta                                              <- igual a `contas_bancarias`
 *   pix_chave_tipo / pix_chave                                           <- igual a `parceiros`
 *
 * Divergir do padrao aqui obrigaria todo relatorio futuro a ter um `CASE` para lembrar que o
 * colaborador chama diferente.
 *
 * TUDO ANULAVEL, SEM EXCECAO. Sao 137 colaboradores ja cadastrados que nao tem esses dados, e uma
 * coluna `NOT NULL` faria a migration falhar no `ALTER TABLE` ou preencher com vazio — que e gravar
 * dado, e migration nao grava dado (Regra 5). A obrigatoriedade destes campos e da ADMISSAO NOVA, e
 * mora na validacao do pedido (Fase 9), nao no schema.
 *
 * `estado` com 2 caracteres de proposito: sigla da UF. `parceiros.estado` e mais largo por
 * historico, e repetir isso aqui so aumentaria a chance de alguem digitar "Minas Gerais".
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md` (Regra 3). So estrutura.
 */

const TABELA = 'rh_colaboradores';

// [nome, tipo, depoisDe]
const COLUNAS = [
  // filiacao — o escopo pede "Nome dos pais". Duas colunas, e nao um campo "pais": a Certidao de
  // Nascimento e o eSocial tratam pai e mae separadamente, e juntar obrigaria a separar depois.
  ['nome_pai', 'STRING_180', 'data_nascimento'],
  ['nome_mae', 'STRING_180', 'nome_pai'],

  // endereco
  ['endereco', 'STRING_255', 'nome_mae'],
  ['numero', 'STRING_50', 'endereco'],
  ['complemento', 'STRING_120', 'numero'],
  ['bairro', 'STRING_120', 'complemento'],
  ['municipio', 'STRING_120', 'bairro'],
  ['estado', 'STRING_2', 'municipio'],
  ['cep', 'STRING_20', 'estado'],

  // dados bancarios
  ['banco', 'STRING_120', 'cep'],
  ['agencia', 'STRING_20', 'banco'],
  ['conta', 'STRING_30', 'agencia'],
  // CORRENTE | POUPANCA | SALARIO
  ['conta_tipo', 'STRING_20', 'conta'],
  // CPF | CNPJ | EMAIL | TELEFONE | ALEATORIA
  ['pix_chave_tipo', 'STRING_20', 'conta_tipo'],
  ['pix_chave', 'STRING_255', 'pix_chave_tipo'],

  // quem respondeu pela contratacao. Usuario do sistema, e nao texto: o escopo pede o RESPONSAVEL,
  // e um nome digitado nao responde por nada em auditoria.
  ['responsavel_contratacao_id', 'INTEGER', 'pix_chave']
];

function tipoDe(DataTypes, chave) {
  if (chave === 'INTEGER') return DataTypes.INTEGER;
  const tamanho = Number(String(chave).split('_')[1]);
  return DataTypes.STRING(tamanho);
}

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    for (const [nome, tipo, depoisDe] of COLUNAS) {
      if (await columnExists(sequelize, TABELA, nome)) continue;
      await queryInterface.addColumn(TABELA, nome, {
        type: tipoDe(DataTypes, tipo),
        allowNull: true,
        after: depoisDe
      });
    }

    // FK com nome explicito — Regra 6. O gerado automaticamente para
    // `rh_colaboradores_responsavel_contratacao_id_foreign_idx` tem 58 caracteres e vive perto do
    // limite de 64; um estouro aqui derruba o boot, porque as migrations rodam antes da porta abrir.
    if (!(await foreignKeyExists(sequelize, TABELA, 'fk_rh_colab_responsavel'))) {
      await queryInterface.addConstraint(TABELA, {
        fields: ['responsavel_contratacao_id'],
        type: 'foreign key',
        name: 'fk_rh_colab_responsavel',
        references: { table: 'users', field: 'id' },
        onUpdate: 'CASCADE',
        // RESTRICT, e nao SET NULL: apagar o usuario nao pode apagar o registro de quem respondeu
        // pela contratacao. Se o usuario precisa sair, o vinculo se resolve a mao, com alguem
        // olhando.
        onDelete: 'RESTRICT'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: as colunas guardam endereco, conta bancaria e filiacao.
  }
};
