'use strict';

const { Op } = require('sequelize');
const { Contrato, ContratoMedicao, MedicaoParcela, ContratoParcela,
  TituloRenegociacaoAlocacao } = require('../models');

// Numero e ID de registro, nunca periodo/vencimento/data de pagamento.
// Leitura corrente em transacao: nao reutilizar snapshot anterior ao lock da solicitacao.
async function obterMedicaoAtual(contratoId, transaction) {
  const medicoes = await ContratoMedicao.findAll({
    where: { contrato_id: Number(contratoId) }, attributes: ['id', 'numero', 'aprovada_em'],
    order: [['numero', 'DESC'], ['id', 'DESC']],
    limit: 1, transaction, lock: transaction?.LOCK?.UPDATE
  });
  return medicoes.sort((a, b) => Number(b.numero) - Number(a.numero) || Number(b.id) - Number(a.id))[0] || null;
}

async function obterParcelasDaMedicao(medicaoId, transaction) {
  const vinculos = await MedicaoParcela.findAll({
    where: { medicao_id: Number(medicaoId), devolvido_em: null },
    attributes: ['contrato_parcela_id'], transaction, lock: transaction?.LOCK?.UPDATE
  });
  return new Set(vinculos.map(v => Number(v.contrato_parcela_id)));
}

// null = fluxo geral/legado sem evento de medicao; [] = evento anterior ou ainda nao aprovado.
// Chamador bloqueia a solicitacao antes desta consulta e continua auditando o titulo antigo.
async function titulosQueAtualizamMedicaoAtual({ solicitacaoId, titulos, transaction }) {
  const contrato = await Contrato.findOne({
    where: { solicitacao_id: Number(solicitacaoId), fluxo_novo: true },
    attributes: ['id'], transaction
  });
  if (!contrato) return null;
  const medicao = await obterMedicaoAtual(contrato.id, transaction);
  if (!medicao) return null; // Compatibilidade com vinculos anteriores aos eventos de medicao.
  if (!medicao.aprovada_em) return [];
  const parcelaIds = await obterParcelasDaMedicao(medicao.id, transaction);
  if (!parcelaIds.size) return [];
  const parcelas = await ContratoParcela.findAll({
    where: { contrato_id: contrato.id, id: { [Op.in]: [...parcelaIds] } },
    attributes: ['titulo_financeiro_id'], transaction, lock: transaction?.LOCK?.UPDATE
  });
  const ids = new Set(parcelas.map(p => Number(p.titulo_financeiro_id)));
  const naoDiretos = titulos.filter(t => !ids.has(Number(t.id)));
  // A renegociacao preserva a parcela apontando ao titulo original.
  const alocacoes = naoDiretos.length ? await TituloRenegociacaoAlocacao.findAll({
    where: { titulo_origem_id: { [Op.in]: [...ids] },
      titulo_destino_id: { [Op.in]: naoDiretos.map(t => Number(t.id)) } },
    attributes: ['titulo_destino_id'], transaction, lock: transaction?.LOCK?.UPDATE
  }) : [];
  alocacoes.forEach(a => ids.add(Number(a.titulo_destino_id)));
  return titulos.filter(t => ids.has(Number(t.id)));
}

module.exports = { obterMedicaoAtual, obterParcelasDaMedicao, titulosQueAtualizamMedicaoAtual };
