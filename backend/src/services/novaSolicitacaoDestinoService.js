'use strict';

const { findSetorByCapability, resolveSetorPersistenciaValue } = require('./setorCapabilityService');

async function resolverDestinoInicialNovaSolicitacao(transaction = null) {
  const setor = await findSetorByCapability('eh_setor_geo', {
    attributes: ['id', 'codigo', 'nome', 'ativo', 'eh_setor_geo'],
    transaction
  });

  if (!setor) {
    throw Object.assign(
      new Error('O setor GEO ativo nao esta configurado. A solicitacao nao foi criada.'),
      { statusCode: 503 }
    );
  }

  return {
    setor,
    areaResponsavel: resolveSetorPersistenciaValue(setor, 'GEO')
  };
}

function obterAreasConfiguracaoCamposDestinoInicial(destinoInicial) {
  return [...new Set([
    destinoInicial?.setor?.codigo,
    destinoInicial?.setor?.nome,
    destinoInicial?.areaResponsavel
  ].map((area) => String(area || '').trim()).filter(Boolean))];
}

module.exports = {
  obterAreasConfiguracaoCamposDestinoInicial,
  resolverDestinoInicialNovaSolicitacao
};
