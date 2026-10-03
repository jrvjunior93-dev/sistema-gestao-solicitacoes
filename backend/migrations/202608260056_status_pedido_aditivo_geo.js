'use strict';

/**
 * Status operacional usado quando um contrato do fluxo novo retorna a Gerencia de Processos para
 * analise de termo aditivo. A solicitacao guarda o status como texto, mas a etapa precisa existir
 * em `etapas_setor` para aparecer nos filtros, cores e seletores administrativos do setor GEO.
 */
module.exports = {
  async up() {
    // Migration mantida para preservar a sequencia ja aplicada no banco local.
    // O status PED. ADITIVO e cadastro funcional e deve ser criado pela interface
    // de configuracao, nunca inserido por migration de estrutura.
  },

  async down() {
    // Sem rollback destrutivo: o status pode estar gravado em solicitacoes e historicos.
  }
};
