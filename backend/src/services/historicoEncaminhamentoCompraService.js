'use strict';

const ACAO_ENCAMINHAMENTO_COMPRA = 'SOLICITACAO_COMPRA_ENCAMINHADA_COMPRAS';
const ACOES_ENCAMINHAMENTO_SETOR = ['ENVIADA_SETOR', ACAO_ENCAMINHAMENTO_COMPRA];

function extrairEncaminhamentoCompra(historico) {
  if (String(historico?.acao || '').trim().toUpperCase() !== ACAO_ENCAMINHAMENTO_COMPRA) return null;
  let metadata = historico.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { return null; }
  }
  const origem = typeof metadata?.area_anterior === 'string' ? metadata.area_anterior.trim() : '';
  const destino = typeof metadata?.area_nova === 'string' ? metadata.area_nova.trim() : '';
  return origem && destino ? { origem, destino } : null;
}

// Fragmento somente de leitura; usa o alias h da consulta de historicos.
// CHAR(36) evita que o Sequelize interprete o caminho JSON como bind parameter.
function sqlEncaminhamentoCompraPorSetores(tokens) {
  const valores = [...new Set(tokens.map(value => String(value || '').trim().toUpperCase()).filter(Boolean))];
  if (!valores.length) return '1 = 0';
  const lista = valores.map(value => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`).join(', ');
  const json = name => `JSON_EXTRACT(IF(JSON_VALID(h.metadata), h.metadata, '{}'), CONCAT(CHAR(36), '.${name}'))`;
  const campo = name => `UPPER(TRIM(JSON_UNQUOTE(${json(name)})))`;
  const origem = campo('area_anterior');
  const destino = campo('area_nova');
  return `(UPPER(TRIM(h.acao)) = '${ACAO_ENCAMINHAMENTO_COMPRA}'
    AND JSON_TYPE(${json('area_anterior')}) = 'STRING' AND JSON_TYPE(${json('area_nova')}) = 'STRING'
    AND ${origem} <> '' AND ${destino} <> ''
    AND (${origem} IN (${lista}) OR ${destino} IN (${lista})))`;
}

module.exports = { ACAO_ENCAMINHAMENTO_COMPRA, ACOES_ENCAMINHAMENTO_SETOR, extrairEncaminhamentoCompra, sqlEncaminhamentoCompraPorSetores };
