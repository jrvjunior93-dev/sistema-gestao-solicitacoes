'use strict';

const {
  CartaoRecargaPrestacao,
  Historico,
  Solicitacao,
  SolicitacaoRecargaCartao,
  sequelize
} = require('../src/models');
const { findSetorByCapability, isGeoToken, resolveSetorPersistenciaValue } = require('../src/services/setorCapabilityService');

function lerSolicitacaoId() {
  const argumento = process.argv.find((item) => item.startsWith('--solicitacao='));
  if (!argumento) return null;
  const id = Number(argumento.split('=')[1]);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Informe --solicitacao com um ID numerico positivo.');
  return id;
}

async function listarPendencias(solicitacaoId = null) {
  const prestacoes = await CartaoRecargaPrestacao.findAll({
    where: { status: 'ENVIADA' },
    include: [{
      model: SolicitacaoRecargaCartao,
      as: 'recarga',
      required: true,
      include: [{
        model: Solicitacao,
        as: 'solicitacao',
        required: true,
        attributes: ['id', 'codigo', 'area_responsavel', 'status_global', 'updatedAt'],
        ...(solicitacaoId ? { where: { id: solicitacaoId } } : {})
      }]
    }],
    order: [['id', 'ASC']]
  });

  return prestacoes
    .map((prestacao) => ({
      prestacao_id: prestacao.id,
      recarga_id: prestacao.recarga?.id,
      solicitacao: prestacao.recarga?.solicitacao
    }))
    .filter((item) => item.solicitacao)
    .filter((item) => !isGeoToken(item.solicitacao.area_responsavel) || String(item.solicitacao.status_global || '').toUpperCase() !== 'PENDENTE');
}

async function executar() {
  const confirmar = process.argv.includes('--confirm');
  const solicitacaoId = lerSolicitacaoId();
  const setorGeo = await findSetorByCapability('eh_setor_geo', { attributes: ['id', 'codigo', 'nome'] });
  const destinoGeo = resolveSetorPersistenciaValue(setorGeo, 'GEO');
  const pendencias = await listarPendencias(solicitacaoId);

  console.table(pendencias.map((item) => ({
    solicitacao_id: item.solicitacao.id,
    codigo: item.solicitacao.codigo,
    setor_atual: item.solicitacao.area_responsavel,
    status_atual: item.solicitacao.status_global,
    destino: destinoGeo,
    status_destino: 'PENDENTE'
  })));

  if (!confirmar) {
    console.log(`Simulacao concluida: ${pendencias.length} solicitacao(oes) seria(m) reconciliada(s). Use --confirm para aplicar.`);
    return;
  }

  await sequelize.transaction(async (transaction) => {
    for (const item of pendencias) {
      const solicitacao = await Solicitacao.findByPk(item.solicitacao.id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!solicitacao) continue;
      if (isGeoToken(solicitacao.area_responsavel) && String(solicitacao.status_global || '').toUpperCase() === 'PENDENTE') continue;

      const setorAnterior = solicitacao.area_responsavel || null;
      const statusAnterior = solicitacao.status_global || null;
      await solicitacao.update({ area_responsavel: destinoGeo, status_global: 'PENDENTE' }, { transaction });
      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: null,
        setor: destinoGeo,
        acao: 'CORRECAO_FILA_PRESTACAO_RECARGA',
        status_anterior: statusAnterior,
        status_novo: 'PENDENTE',
        observacao: `Prestacao ja enviada reconciliada de ${setorAnterior || '-'} para ${destinoGeo}.`,
        metadata: JSON.stringify({
          prestacao_id: item.prestacao_id,
          recarga_id: item.recarga_id,
          origem: 'SCRIPT_RECONCILIACAO'
        })
      }, { transaction });
      if (!isGeoToken(setorAnterior)) {
        await Historico.create({
          solicitacao_id: solicitacao.id,
          usuario_responsavel_id: null,
          setor: destinoGeo,
          acao: 'ENVIADA_SETOR',
          observacao: `De ${setorAnterior || '-'} para ${destinoGeo}`,
          descricao: 'Reconciliacao de prestacao de contas ja enviada.'
        }, { transaction });
      }
    }
  });

  console.log(`Reconciliacao concluida: ${pendencias.length} solicitacao(oes) atualizada(s).`);
}

executar()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
