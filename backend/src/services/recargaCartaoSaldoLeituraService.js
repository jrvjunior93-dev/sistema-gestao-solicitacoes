'use strict';
// Projecao de leitura: nao altera o saldo, sua revisao nem as regras de prestacao.
const { Op } = require('sequelize');
const { SolicitacaoRecargaCartao, CartaoRecargaPrestacao, CartaoRecargaPrestacaoRateio } = require('../models');
const { assertPodeVisualizarSolicitacao } = require('./solicitacaoRetornoService');
const STATUS_PENDENTES = ['ENVIADA', 'REJEITADA', 'VALIDANDO', 'ENVIANDO'];
const LIMITE_ORIGENS = 100;
const centavos = v => Math.round(Number(v || 0) * 100);

async function enriquecerOrigensSaldo(contexto, req) {
  const itens = contexto?.recargas || [contexto];
  const ids = [...new Set(itens.filter(c => c?.saldo_cartao && !c.historico_restrito
    && Number(c.saldo_cartao.despesas_pendentes) > 0)
    .map(c => Number(c.ultima_recarga?.cartao_recarga_id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return contexto;
  const porCartao = new Map(ids.map(id => [id, { origens: [], total: 0, incompletas: false }]));
  try {
    // Uma consulta para todos os cartoes da solicitacao, sem buscar cada recarga.
    const recargas = await SolicitacaoRecargaCartao.findAll({
      where: { cartao_recarga_id: { [Op.in]: ids } }, attributes: ['id', 'solicitacao_id', 'cartao_recarga_id'],
      include: [{ model: CartaoRecargaPrestacao, as: 'prestacao', required: true,
        where: { status: { [Op.in]: STATUS_PENDENTES } }, attributes: ['id', 'status'],
        include: [{ model: CartaoRecargaPrestacaoRateio, as: 'rateios', required: false, attributes: ['valor_rateio'] }] }],
      order: [['id', 'ASC']], limit: LIMITE_ORIGENS + 1
    });
    if (recargas.length > LIMITE_ORIGENS) for (const alvo of porCartao.values()) alvo.incompletas = true;
    const acessos = new Map();
    for (const r of recargas.slice(0, LIMITE_ORIGENS)) {
      const alvo = porCartao.get(Number(r.cartao_recarga_id)), p = r.prestacao;
      if (!alvo || !p || !STATUS_PENDENTES.includes(p.status)) continue;
      const total = (p.rateios || []).reduce((s, linha) => s + centavos(linha.valor_rateio), 0);
      if (!Number.isSafeInteger(total) || total < 0) { alvo.incompletas = true; continue; }
      alvo.total += total;
      if (!total) continue;
      const id = Number(r.solicitacao_id);
      if (!Number.isSafeInteger(id) || id <= 0) { alvo.incompletas = true; continue; }
      if (!acessos.has(id)) {
        try {
          // Regra NORMAL de leitura, inclusive exclusao e restricoes GEO. Nao
          // substitui por vinculo de cartao/obra ou permissao de validar gastos.
          const { solicitacao } = await assertPodeVisualizarSolicitacao(req, id);
          acessos.set(id, Number(solicitacao?.id) === id ? solicitacao : null);
        } catch { acessos.set(id, null); } // Falha fechada, sem revelar IDs/codigos.
      }
      const s = acessos.get(id);
      if (!s) { alvo.incompletas = true; continue; }
      alvo.origens.push({ solicitacao_id: id, solicitacao_codigo: s.codigo || `Solicitacao #${id}`,
        prestacao_id: p.id, status: p.status, valor: total / 100 });
    }
  } catch {
    // A origem e auxiliar: falha nao impede consultar o saldo ja autorizado,
    // nao inventa vinculos e nao transforma o erro em detalhe de outra obra.
    for (const alvo of porCartao.values()) { alvo.origens = []; alvo.incompletas = true; }
  }
  function projetar(item) {
    const alvo = !item.historico_restrito && porCartao.get(Number(item.ultima_recarga?.cartao_recarga_id));
    if (!item.saldo_cartao || !alvo) return item;
    return { ...item, prestacoes_pendentes_saldo: alvo.origens,
      origens_prestacoes_incompletas: alvo.incompletas || alvo.total !== centavos(item.saldo_cartao.despesas_pendentes) };
  }
  return contexto.recargas ? { ...projetar(contexto), recargas: itens.map(projetar) } : projetar(contexto);
}
module.exports = { enriquecerOrigensSaldo };
