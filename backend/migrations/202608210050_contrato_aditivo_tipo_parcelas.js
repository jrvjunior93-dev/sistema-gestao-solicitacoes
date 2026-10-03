'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `tipo` e `qtde_parcelas` em `contrato_aditivos`: o aditivo passa a gerar parcela.
 *
 * Ate 21/08 aprovar um aditivo so somava o valor em `contratos.valor_aditivos`. O saldo do contrato
 * abria e **nenhuma parcela nascia** — e parcela e o que se mede. O dinheiro do aditivo ficava
 * visivel no saldo e inalcancavel na pratica.
 *
 * Decisao do cliente: quem pede informa se o aditivo e so de VALOR ou tambem de VIGENCIA.
 *
 *   VALOR             -> o prazo nao muda; o valor cai na ultima parcela livre, ou nasce uma parcela
 *                        nova com o MESMO vencimento da ultima quando ela ja esta comprometida
 *   VALOR_E_VIGENCIA  -> o prazo se estende; nascem `qtde_parcelas` parcelas ate a nova vigencia
 *
 * `qtde_parcelas` e anulavel porque so o segundo tipo a usa.
 *
 * Aditivos anteriores permanecem com tipo nulo. O tipo e gravado somente nas operacoes feitas
 * pela interface depois do deploy; nenhum deles gera parcela retroativamente.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md` (numeracao criada no V4).
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await columnExists(sequelize, 'contrato_aditivos', 'tipo'))) {
      await queryInterface.addColumn('contrato_aditivos', 'tipo', {
        type: DataTypes.STRING(20),
        allowNull: true
      });

    // O BACKFILL SAIU DAQUI (24/08/2026).
    //
    // Regra do projeto: migration altera ESTRUTURA, nunca dados. `server.js` roda as migrations antes
    // de abrir a porta — um `UPDATE` aqui alteraria dados reais de producao sozinho, no deploy, sem
    // contagem antes nem conferencia depois.
    //
    // Registros anteriores permanecem nulos; nenhum script de dados acompanha o deploy.
    }

    if (!(await columnExists(sequelize, 'contrato_aditivos', 'qtde_parcelas'))) {
      await queryInterface.addColumn('contrato_aditivos', 'qtde_parcelas', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
