'use strict';

const { paraCentavos } = require('./contratoParcelasService');

const SETOR_GERENCIA_PROCESSOS = 'GEO';
const SETOR_JURIDICO = 'JURIDICO';
const STATUS_SOLICITACAO_PEDIDO_ADITIVO = 'PED. ADITIVO';
const STATUS_SOLICITACAO_JURIDICO = 'PENDENTE';

/**
 * Decide a fila do pedido exclusivamente pelo valor original do contrato.
 *
 * Funcao pura para a fronteira monetaria ser testada sem banco: exatamente no limite permanece na
 * GEO; somente um contrato originalmente superior segue diretamente ao Juridico. Aditivos ja
 * aprovados e o valor deste novo pedido deliberadamente nao participam da decisao.
 */
function calcularRoteamentoSolicitacaoAditivo({
  valorOriginal,
  limiteCent
}) {
  const valorOriginalCent = paraCentavos(valorOriginal);
  const encaminharDiretoAoJuridico = valorOriginalCent > Number(limiteCent || 0);

  return {
    valorOriginalCent,
    encaminharDiretoAoJuridico,
    setorDestino: encaminharDiretoAoJuridico ? SETOR_JURIDICO : SETOR_GERENCIA_PROCESSOS,
    statusDestino: encaminharDiretoAoJuridico
      ? STATUS_SOLICITACAO_JURIDICO
      : STATUS_SOLICITACAO_PEDIDO_ADITIVO
  };
}

module.exports = {
  calcularRoteamentoSolicitacaoAditivo,
  SETOR_GERENCIA_PROCESSOS,
  SETOR_JURIDICO,
  STATUS_SOLICITACAO_PEDIDO_ADITIVO,
  STATUS_SOLICITACAO_JURIDICO
};
