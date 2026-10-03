'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * O DP ATESTA O DOCUMENTO ANTES DE ELE ENTRAR NA PASTA (26/08).
 *
 * Pedido do cliente: "uma solicitacao da obra precisa passar por uma revisao e validacao do DP antes
 * de ficar registrado no sistema como documentacao — o DP precisa atestar que o documento e valido e
 * util antes de vincular esse documento a pasta do colaborador".
 *
 * O QUE MUDA NA FASE 3. Ate aqui, aprovar o pedido transferia AUTOMATICAMENTE todo anexo tipado para
 * `rh_documentos`. O efeito colateral: bastava a obra anexar qualquer arquivo com o tipo certo para
 * ele virar documento oficial do colaborador. Foto tremida, pagina faltando, CPF de outra pessoa —
 * tudo entrava, e a pasta do colaborador passava a ter documento que ninguem conferiu.
 *
 * Com esta mudanca o anexo nasce PENDENTE e so vira documento depois que alguem do DP atesta.
 *
 * POR QUE ISSO NAO E SO UM CAMPO A MAIS: e a diferenca entre "a obra mandou" e "o DP aceitou". A
 * pasta do colaborador e o que vale em fiscalizacao — ela precisa dizer o que foi CONFERIDO, nao o
 * que foi enviado.
 *
 * `validado_por` e `validado_em` gravam QUEM e QUANDO, e nao um booleano: atestar que um documento e
 * valido e uma declaracao de responsabilidade, e um `1` nao diz de quem. Mesma razao de
 * `dados_confirmados_por` existir na medicao do contrato.
 *
 * `motivo_recusa` e obrigatorio na recusa (regra de servico): devolver sem dizer por que obriga a
 * obra a adivinhar o que reenviar.
 *
 * PENDENTE como padrao, e nao VALIDADO: os anexos que ja existirem quando esta coluna nascer nao
 * foram atestados por ninguem, e assumir o contrario seria dar por conferido o que nao foi. No
 * ambiente local nao ha nenhum; em producao o modulo nem entrou.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md`. Cria colunas e NADA MAIS.
 */
const COLUNAS = [
  // PENDENTE | VALIDADO | RECUSADO
  ['situacao', { tipo: 'STRING_20', padrao: 'PENDENTE', obrigatorio: true }],
  ['validado_por', { tipo: 'INTEGER' }],
  ['validado_em', { tipo: 'DATE' }],
  ['motivo_recusa', { tipo: 'TEXT' }],
  // O que o DP escreveu ao atestar — "confere com o original", "chegou por e-mail em 20/08".
  ['observacao_validacao', { tipo: 'TEXT' }]
];

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const tipos = {
      STRING_20: (c) => ({
        type: DataTypes.STRING(20),
        allowNull: !c.obrigatorio,
        defaultValue: c.padrao
      }),
      INTEGER: () => ({ type: DataTypes.INTEGER, allowNull: true }),
      DATE: () => ({ type: DataTypes.DATE, allowNull: true }),
      TEXT: () => ({ type: DataTypes.TEXT, allowNull: true })
    };

    for (const [coluna, config] of COLUNAS) {
      // eslint-disable-next-line no-await-in-loop
      if (await columnExists(sequelize, 'rh_solicitacao_anexos', coluna)) continue;
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.addColumn('rh_solicitacao_anexos', coluna, tipos[config.tipo](config));
    }
  },

  async down() {
    // Sem rollback destrutivo: quem atestou o documento e parte do registro.
  }
};
