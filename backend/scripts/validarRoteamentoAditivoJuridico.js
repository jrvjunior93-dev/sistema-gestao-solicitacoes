'use strict';

/**
 * Prova pura do roteamento do pedido de aditivo pelo limite juridico.
 *
 * Nao abre conexao nem grava no banco. O limite entra como dado para provar a fronteira exata e
 * evitar que uma alteracao futura passe a somar aditivos ao valor original.
 */

const {
  calcularRoteamentoSolicitacaoAditivo
} = require('../src/services/contratoAditivoRoteamento');

function garantir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function conferir(cenario, entrada, esperado) {
  const resultado = calcularRoteamentoSolicitacaoAditivo(entrada);

  garantir(
    resultado.valorOriginalCent === esperado.valorOriginalCent,
    `${cenario}: original esperado ${esperado.valorOriginalCent}; recebido ${resultado.valorOriginalCent}.`
  );
  garantir(
    resultado.setorDestino === esperado.setorDestino,
    `${cenario}: setor esperado ${esperado.setorDestino}; recebido ${resultado.setorDestino}.`
  );
  garantir(
    resultado.statusDestino === esperado.statusDestino,
    `${cenario}: status esperado ${esperado.statusDestino}; recebido ${resultado.statusDestino}.`
  );
  garantir(
    resultado.encaminharDiretoAoJuridico === esperado.encaminharDiretoAoJuridico,
    `${cenario}: decisao de encaminhamento divergente.`
  );

  console.log(`OK: ${cenario}`);
}

const limiteCent = 5_000_000;

conferir(
  'valor original exatamente no limite permanece na GEO',
  { valorOriginal: 50000, limiteCent },
  {
    valorOriginalCent: limiteCent,
    setorDestino: 'GEO',
    statusDestino: 'PED. ADITIVO',
    encaminharDiretoAoJuridico: false
  }
);

conferir(
  'contrato original um centavo acima segue direto ao Juridico',
  { valorOriginal: 50000.01, limiteCent },
  {
    valorOriginalCent: limiteCent + 1,
    setorDestino: 'JURIDICO',
    statusDestino: 'PENDENTE',
    encaminharDiretoAoJuridico: true
  }
);

conferir(
  'contrato original de 49 mil permanece na GEO mesmo com aditivo de 2 mil',
  { valorOriginal: 49000, valorAditivosAprovados: 0, valorSolicitado: 2000, limiteCent },
  {
    valorOriginalCent: 4_900_000,
    setorDestino: 'GEO',
    statusDestino: 'PED. ADITIVO',
    encaminharDiretoAoJuridico: false
  }
);

conferir(
  'contrato original acima do limite segue ao Juridico independentemente do aditivo',
  { valorOriginal: 60000, valorAditivosAprovados: 12000, valorSolicitado: 0, limiteCent },
  {
    valorOriginalCent: 6_000_000,
    setorDestino: 'JURIDICO',
    statusDestino: 'PENDENTE',
    encaminharDiretoAoJuridico: true
  }
);

console.log('Roteamento de aditivo pelo limite juridico validado sem escrita no banco.');
