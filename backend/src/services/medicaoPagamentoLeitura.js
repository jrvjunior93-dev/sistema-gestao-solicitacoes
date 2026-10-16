'use strict';
const { Op } = require('sequelize');
const { TituloFinanceiro } = require('../models');
const { resumirTitulosDivididos } = require('./solicitacaoFavorecidosDomain');
const { estado, centavos, dinheiro } = require('./medicaoPagamentoDomain');
// Recebe somente parcelas ja autorizadas. Filhos em uma query indexada, sem
// escrita/reconciliacao em GET e sem misturar medido com valor financeiro.
async function projetarParcelas(parcelas, mapa, transaction) {
  const roots = parcelas.flatMap(p => p.divisao_favorecidos?.titulos_leitura || [p.titulo]).filter(t => t?.medicao_pagamento);
  if (!roots.length) return;
  const filhos = await TituloFinanceiro.findAll({ where: { medicao_pagamento_origem_id: { [Op.in]: roots.map(t => t.id) } },
    order: [['id', 'ASC']], transaction });
  for (const p of parcelas) {
    const grupo = p.divisao_favorecidos || { pagamentos: [], titulos: [p.titulo].filter(Boolean), titulos_leitura: [p.titulo].filter(Boolean) };
    if (!grupo.titulos_leitura.some(t => t.medicao_pagamento)) continue;
    const ids = grupo.titulos_leitura.map(t => Number(t.id));
    const leitura = [...new Map([...grupo.titulos_leitura, ...filhos.filter(t => ids.includes(Number(t.medicao_pagamento_origem_id)))].map(t => [Number(t.id), t])).values()];
    const ativos = leitura.filter(t => !['CANCELADO', 'EXCLUIDO', 'ESTORNADO'].includes(t.status));
    const sum = filtro => ativos.filter(filtro).reduce((s, t) => s + centavos(t.valor_original), 0);
    const resumo = { ...resumirTitulosDivididos(ativos) };
    const pagamento = { valor_titulos: Number(dinheiro(sum(t => t.status !== 'PREVISAO'))),
      valor_pendente: Number(dinheiro(sum(t => t.status === 'PREVISAO'))),
      abatimento: Number(dinheiro(ativos.reduce((s, t) => s + centavos(estado(t)?.abatimento || 0), 0))) };
    grupo.titulos_leitura = leitura; grupo.resumo = resumo;
    p.divisao_favorecidos = grupo; p.medicao_pagamento_resumo = pagamento; mapa.set(Number(p.id), grupo);
    const virtual = { ...(p.titulo?.toJSON ? p.titulo.toJSON() : p.titulo), ...resumo };
    if (p.setDataValue) p.setDataValue('titulo', virtual); else p.titulo = virtual;
  }
}
module.exports = { projetarParcelas };
