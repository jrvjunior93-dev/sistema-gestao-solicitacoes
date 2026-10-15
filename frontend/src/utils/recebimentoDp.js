export const RECEBIMENTOS_DP = [
  ['CONTA_SALARIO', 'Conta salário'], ['PIX', 'Pix'], ['DINHEIRO', 'Dinheiro'],
  ['OUTRA_CONTA', 'Outra conta'], ['NAO_INFORMADO', 'Não informado']
];
export const rotuloRecebimentoDp = modo => RECEBIMENTOS_DP.find(([key]) => key === modo)?.[1] || 'Não informado';
export const ehTituloDp = titulo => ['RH_DP', 'RH_DP_TICKET'].includes(titulo?.origem_titulo);
