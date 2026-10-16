// Mesmo catalogo na abertura, nas solicitacoes e no detalhe do colaborador.
export const SUBTIPOS_MOVIMENTACAO = [
  { valor: 'ATESTADO', rotulo: 'Atestado' },
  { valor: 'FERIAS', rotulo: 'Ferias' },
  { valor: 'RETORNO_AFASTAMENTO', rotulo: 'Retorno de afastamento' },
  { valor: 'ALTERACAO_SALARIAL', rotulo: 'Alteracao salarial' },
  { valor: 'ALTERACAO_CARGO', rotulo: 'Alteracao de cargo ou funcao' },
  { valor: 'TRANSFERENCIA_OBRA', rotulo: 'Transferencia de obra' },
  { valor: 'CONTRA_CHEQUE', rotulo: 'Contra-cheque', orientacao: 'Anexe os arquivos de contra-cheque assinados do colaborador. Use Acrescentar arquivo para incluir mais de um documento.' },
  { valor: 'FOLHA_PONTO', rotulo: 'Folha de ponto', orientacao: 'Anexe as folhas de ponto assinadas do colaborador. Estes anexos não alteram a apuração ou geram pagamentos.' },
  { valor: 'ACIDENTE_TRABALHO_CAT', rotulo: 'Acidente de Trabalho - CAT', orientacao: 'Comunique o acidente ao DP pelo relato abaixo e anexe os documentos disponíveis. Este registro é uma comunicação interna; não emite nem transmite a CAT a órgãos externos.' }
];

export function rotuloMovimentacao(subtipo) {
  return SUBTIPOS_MOVIMENTACAO.find(item => item.valor === subtipo)?.rotulo || String(subtipo || '').replaceAll('_', ' ');
}

export function orientacaoMovimentacao(subtipo) {
  return SUBTIPOS_MOVIMENTACAO.find(item => item.valor === subtipo)?.orientacao || '';
}
