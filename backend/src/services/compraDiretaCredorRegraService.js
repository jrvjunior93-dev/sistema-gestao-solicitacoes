'use strict';

const { obterConfigCamposNovaSolicitacao, resolverCamposNovaSolicitacao } = require('./novaSolicitacaoCamposConfig');
const { normalizeTipoSolicitacaoBehavior } = require('./tipoSolicitacaoBehaviorService');
const { obterAreasConfiguracaoCamposDestino } = require('./tipoSolicitacaoDisponibilidadeService');
const { findSetorByCapability, resolveSetorPersistenciaValue } = require('./setorCapabilityService');

// Uma unica resolucao para a referencia da tela e a revalidacao no envio.
// Nao aceita a area nem a obrigatoriedade informadas pelo cliente.
async function resolverRegraCredorCompraDireta({ tipo, obra, transaction }) {
  const setor = await findSetorByCapability('eh_setor_geo', {
    attributes: ['id', 'codigo', 'nome'], onlyActive: false, transaction
  });
  const areas = [...obterAreasConfiguracaoCamposDestino(obra),
    setor?.codigo, setor?.nome, resolveSetorPersistenciaValue(setor, 'GERENCIA DE PROCESSOS')];
  const config = await obterConfigCamposNovaSolicitacao();
  const campos = resolverCamposNovaSolicitacao(normalizeTipoSolicitacaoBehavior(tipo), config, tipo.id, {
    areaResponsavel: areas
  });
  return { obrigatorio: campos.credor.obrigatorio === true };
}

module.exports = { resolverRegraCredorCompraDireta };
