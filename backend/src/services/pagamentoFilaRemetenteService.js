'use strict';
const { Op } = require('sequelize');

function instrumento(fila) {
  try {
    const value = fila.instrumento_pagamento_json;
    return typeof value === 'string' ? JSON.parse(value) : (value || {});
  } catch { return {}; }
}

// selecionado_por identifica quem criou AQUELA entrada operacional. Um estorno
// cria outra entrada, mas nao constitui outro envio. Somente o vinculo explicito
// estorno.reaberto_id permite atravessar esse retorno; MIN(id) por titulo mistura
// envios diferentes, especialmente depois de rejeicao e nova autorizacao/envio.
function mapearRemetentes(historico) {
  const filas = new Map(historico.map(f => [Number(f.id), f]));
  const anteriores = new Map();
  for (const anterior of filas.values()) {
    const novoId = Number(instrumento(anterior).estorno?.reaberto_id);
    const novo = filas.get(novoId);
    if (anterior.status !== 'RESOLVIDO' || !Number.isSafeInteger(novoId)
      || novoId <= Number(anterior.id) || !novo
      || Number(novo.titulo_financeiro_id) !== Number(anterior.titulo_financeiro_id)) continue;
    // Historico inconsistente nao pode atribuir um envio a uma pessoa arbitraria.
    anteriores.set(novoId, anteriores.has(novoId) ? null : Number(anterior.id));
  }
  const result = new Map();
  for (const fila of filas.values()) {
    let origem = fila;
    const caminho = [];
    while (origem && !result.has(Number(origem.id))) {
      const id = Number(origem.id);
      caminho.push(id);
      if (!anteriores.has(id)) break;
      const anteriorId = anteriores.get(id);
      origem = anteriorId === null ? null : filas.get(anteriorId);
    }
    const remetente = (origem && result.get(Number(origem.id))) || {
      fila_envio_id: origem ? Number(origem.id) : null,
      enviado_por_id: origem?.selecionado_por || null,
      enviado_em: origem?.selecionado_em || null
    };
    caminho.forEach(id => result.set(id, remetente));
  }
  return result;
}

async function obterRemetentes(rows, db) {
  const titulos = [...new Set(rows.filter(r => r.fila_id)
    .map(r => Number(r.titulo_financeiro_id)))];
  if (!titulos.length) return new Map();
  // Uma consulta em lote, apenas dos titulos da pagina ja autorizada/filtrada.
  // Nao altera a CTE de totais/filtros/cursores nem faz busca global por JSON.
  const historico = await db.PagamentoManualFilaItem.findAll({
    where: { titulo_financeiro_id: { [Op.in]: titulos } },
    attributes: ['id', 'titulo_financeiro_id', 'status', 'selecionado_por',
      'selecionado_em', 'instrumento_pagamento_json'],
    raw: true
  });
  return mapearRemetentes(historico);
}

module.exports = { mapearRemetentes, obterRemetentes };
