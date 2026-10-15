'use strict';
const { Op, literal, where } = require('sequelize');
const MODOS = ['CONTA_SALARIO', 'PIX', 'DINHEIRO', 'OUTRA_CONTA', 'NAO_INFORMADO'];
const ORIGENS_DP = ['RH_DP', 'RH_DP_TICKET'];

// Projecao estritamente vinculada ao titulo financeiro ja autorizado pelo chamador.
// Nao consulta cadastro atual, nao expoe JSON RH, nao escreve ou muda snapshots.
// O numero_documento identifica a solicitacao; a referencia interna confirma o titulo.
function recebimentoDpSql(alias = 'titulo') {
  if (!/^[a-zA-Z_]+$/.test(alias)) throw Error('Alias SQL invalido');
  const t = '`' + alias + '`';
  return `CASE WHEN ${t}.origem_titulo IN ('RH_DP', 'RH_DP_TICKET') THEN COALESCE(
    (SELECT COALESCE(NULLIF(ref.modo, ''), CASE WHEN linha.estado = 'EM_EDICAO' THEN NULL WHEN ref.tipo = 'SALARIO' THEN linha.modo ELSE linha.modo_vale END)
     FROM rh_solicitacoes rs
     CROSS JOIN JSON_TABLE(IF(JSON_TYPE(rs.dados_json) = 'OBJECT', rs.dados_json, JSON_OBJECT()), '$.titulos[*]'
       COLUMNS(titulo_id INT PATH '$.id', colaborador_id INT PATH '$.colaborador_id',
         responsavel_id INT PATH '$.responsavel_id', tipo VARCHAR(30) PATH '$.tipo', modo VARCHAR(30) PATH '$.modo_recebimento')) ref
     LEFT JOIN JSON_TABLE(IF(JSON_TYPE(rs.dados_json) = 'OBJECT', rs.dados_json, JSON_OBJECT()), '$.linhas[*]'
       COLUMNS(colaborador_id INT PATH '$.colaborador_id', empresa_id INT PATH '$.empresa_grupo_id',
         estado VARCHAR(30) PATH '$.pagamento_estado', responsavel_id INT PATH '$.reembolso.responsavel_id',
         modo VARCHAR(30) PATH '$.modo_recebimento', modo_vale VARCHAR(30) PATH '$.reembolso.modo_recebimento')) linha
       ON (ref.tipo = 'SALARIO' AND ref.colaborador_id = linha.colaborador_id)
       OR (ref.tipo = 'REEMBOLSO' AND ref.responsavel_id = linha.responsavel_id AND linha.empresa_id = ${t}.empresa_id)
     WHERE ${t}.numero_documento LIKE 'RHDP-%-SOL-%'
       AND rs.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(${t}.numero_documento, '-SOL-', -1), '-', 1) AS UNSIGNED)
       AND ref.titulo_id = ${t}.id LIMIT 1),
    (SELECT CASE WHEN pb.metodo_preferencial IN ('PIX_CHAVE', 'PIX_DADOS_BANCARIOS') THEN 'PIX' END
       FROM payment_beneficiaries pb WHERE pb.id = ${t}.payment_beneficiary_id),
    'NAO_INFORMADO') ELSE NULL END`;
}

function tituloWhere(filters = {}) {
  const clauses = [];
  if (filters.origem === 'RH_DP') clauses.push({ origem_titulo: { [Op.in]: ORIGENS_DP } });
  if (filters.origem === 'OUTROS') clauses.push({ origem_titulo: { [Op.notIn]: ORIGENS_DP } });
  if (filters.empresa_id) clauses.push({ empresa_id: Number(filters.empresa_id) });
  if (filters.credor_id) clauses.push({ parceiro_id: Number(filters.credor_id) });
  if (filters.recebimento_dp) clauses.push(where(literal(recebimentoDpSql()), filters.recebimento_dp));
  return clauses.length ? { [Op.and]: clauses } : {};
}

function opcoesDosTitulos(rows) {
  const empresas = new Map(), credores = new Map();
  for (const row of rows) {
    const titulo = row.titulo || {};
    if (titulo.empresa?.id) empresas.set(Number(titulo.empresa.id), { id: Number(titulo.empresa.id), nome: titulo.empresa.nome });
    if (titulo.parceiro?.id) credores.set(Number(titulo.parceiro.id), { id: Number(titulo.parceiro.id), nome: titulo.parceiro.nome });
  }
  const ordenar = map => [...map.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return { empresas: ordenar(empresas), credores: ordenar(credores) };
}
const recebimentoDpAtributo = () => [literal(recebimentoDpSql()), 'recebimento_dp'];
module.exports = { MODOS, ORIGENS_DP, recebimentoDpSql, recebimentoDpAtributo, tituloWhere, opcoesDosTitulos };
