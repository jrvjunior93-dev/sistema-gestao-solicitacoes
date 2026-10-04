'use strict';

const assert = require('node:assert/strict');
const { Contrato } = require('../src/models');
const { solicitacaoSegueFluxoContratoNovo } = require('../src/services/solicitacao/aprovacaoTipoConfig');

async function executar() {
  const originalFindOne = Contrato.findOne;
  const consultas = [];
  try {
    Contrato.findOne = async (options) => {
      consultas.push(options);
      return options.where.id === 7 && options.where.solicitacao_id === 42
        ? { id: 7 }
        : null;
    };

    assert.equal(await solicitacaoSegueFluxoContratoNovo({ id: 42, contrato_id: 7 }), true);
    assert.deepEqual(consultas[0].where, {
      id: 7,
      solicitacao_id: 42,
      fluxo_novo: true
    });

    // Uma medicao/aditivo legado pode apontar para o mesmo contrato, mas nao e
    // a solicitacao propria dele e nao deve perder a aprovacao generica.
    assert.equal(await solicitacaoSegueFluxoContratoNovo({ id: 43, contrato_id: 7 }), false);
    assert.equal(await solicitacaoSegueFluxoContratoNovo({ id: 44, contrato_id: null }), false);
    assert.equal(consultas.length, 2);
  } finally {
    Contrato.findOne = originalFindOne;
  }

  console.log('Aprovacao exclusiva do contrato novo validada sem acesso ao banco.');
}

executar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
