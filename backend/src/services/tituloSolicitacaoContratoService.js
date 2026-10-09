'use strict';

const { Op } = require('sequelize');
const { ContratoParcela, Contrato, Solicitacao, Historico, SecurityEventLog } = require('../models');

// Apenas leitura: nao preenche FK, nao cria fila, nao muda valores/autorizacoes.
// O vinculo direto continua sendo autoridade; fallback restrito ao fluxo novo.
async function resolverSolicitacoesDosTitulos(titulos, transaction, { estrito = true, leituraCorrente = false } = {}) {
  const resultado = new Map();
  const legados = [];
  for (const titulo of titulos) {
    const id = Number(titulo.id);
    if (titulo.solicitacao_id) resultado.set(id, { solicitacao_id: Number(titulo.solicitacao_id), origem: 'DIRETO' });
    else if (titulo.tipo === 'PAGAR') legados.push(titulo);
  }
  if (!legados.length) return resultado;
  const lock = leituraCorrente ? transaction?.LOCK?.UPDATE : undefined;
  const parcelas = await ContratoParcela.findAll({
    where: { titulo_financeiro_id: { [Op.in]: legados.map(t => Number(t.id)) } },
    attributes: ['id', 'titulo_financeiro_id', 'contrato_id'],
    include: [{ model: Contrato, as: 'contrato', required: true,
      attributes: ['id', 'solicitacao_id', 'obra_id', 'fluxo_novo'] }],
    order: [['id', 'ASC']], transaction, lock
  });
  const ids = [...new Set(parcelas.map(p => Number(p.contrato?.solicitacao_id)).filter(Boolean))];
  const solicitacoes = ids.length ? await Solicitacao.findAll({ where: { id: { [Op.in]: ids } },
    attributes: ['id', 'obra_id'], order: [['id', 'ASC']], transaction, lock }) : [];
  const porId = new Map(solicitacoes.map(s => [Number(s.id), s]));
  for (const titulo of legados) {
    const candidatas = parcelas.filter(p => Number(p.titulo_financeiro_id) === Number(titulo.id));
    if (!candidatas.length) continue; // Titulo avulso continua sem solicitacao.
    const contratos = new Set(candidatas.map(p => Number(p.contrato_id)));
    const p = candidatas[0], contrato = p.contrato, solicitacao = porId.get(Number(contrato?.solicitacao_id));
    const valido = contratos.size === 1 && contrato?.fluxo_novo && solicitacao
      && Number(contrato.obra_id) > 0 && Number(titulo.obra_id) === Number(contrato.obra_id)
      && Number(solicitacao.obra_id) === Number(contrato.obra_id);
    if (!valido) {
      const motivo = 'Vinculo contratual ambiguo, inexistente, legado ou com obra divergente.';
      if (estrito) throw Object.assign(new Error(`Titulo ${titulo.codigo || titulo.id}: ${motivo}`), { statusCode: 409 });
      resultado.set(Number(titulo.id), { solicitacao_id: null, origem: 'BLOQUEADO', motivo });
      continue;
    }
    resultado.set(Number(titulo.id), { solicitacao_id: Number(solicitacao.id),
      contrato_id: Number(contrato.id), origem: 'CONTRATO' });
  }
  return resultado;
}

// Somente no envio REAL de uma nova entrada de fila, apos a convergencia do
// dossie. O titulo ja esta bloqueado; o deploy e o replay nao fazem backfill.
// Persistir a FK garante que a baixa/comprovantes posteriores usem a mesma dona.
async function registrarVinculosContratuaisAoEnfileirar({ titulos, vinculos, usuarioId, transaction }) {
  const alterados = [];
  for (const titulo of titulos) {
    const vinculo = vinculos.get(Number(titulo.id));
    if (titulo.solicitacao_id || vinculo?.origem !== 'CONTRATO') continue;
    await titulo.update({ solicitacao_id: vinculo.solicitacao_id }, { transaction });
    const metadata = { titulo_id: Number(titulo.id), contrato_id: vinculo.contrato_id,
      solicitacao_id: vinculo.solicitacao_id, origem: 'ENVIO_FILA' };
    await Historico.create({ solicitacao_id: vinculo.solicitacao_id, usuario_responsavel_id: usuarioId || null,
      setor: 'FINANCEIRO', acao: 'VINCULO_TITULO_RECONCILIADO',
      observacao: `Vinculo do titulo ${titulo.codigo || titulo.id} identificado pelo contrato durante o envio a fila.`,
      metadata: JSON.stringify(metadata) }, { transaction });
    alterados.push(metadata);
  }
  if (alterados.length) await SecurityEventLog.create({ usuario_id: usuarioId || null,
    tipo_evento: 'CONTRACT_TITLE_LINK_RESOLVED_ON_QUEUE', recurso_tipo: 'TITULO_FINANCEIRO', status: 'SUCCESS',
    descricao: 'Vinculo contratual legado registrado no envio a fila, sem alterar valores ou decisoes.',
    metadata: { vinculos: alterados } }, { transaction });
}

module.exports = { resolverSolicitacoesDosTitulos, registrarVinculosContratuaisAoEnfileirar };
