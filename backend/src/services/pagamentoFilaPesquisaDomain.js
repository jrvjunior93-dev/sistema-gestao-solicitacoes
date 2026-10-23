'use strict';
const { Op, literal } = require('sequelize');
const { wherePendenteComprovante, whereSemEstornoFila } = require('./pagamentoFilaComprovanteDomain');

function aliasSql(alias) {
  if (!/^[a-zA-Z_]+$/.test(alias)) throw Error('Alias SQL invalido');
  return '`' + alias + '`';
}

function filaStatusWhere(status = 'PENDENTE') {
  if (status === 'PENDENTE_COMPROVANTE') return wherePendenteComprovante();
  if (status === 'BAIXADO') return { status: { [Op.in]: ['BAIXADO', 'RESOLVIDO'] },
    movimento_financeiro_id: { [Op.gt]: 0 }, [Op.and]: whereSemEstornoFila() };
  if (status === 'PENDENTE') return { status: { [Op.in]: ['PENDENTE', 'EM_EDICAO'] } };
  return status && status !== 'TODOS' ? { status } : { status: { [Op.ne]: 'CANCELADO' } };
}

function rejeicaoWhere() {
  return { status: 'REJEITADO', [Op.and]: [
    literal('NOT EXISTS (SELECT 1 FROM pagamento_autorizacao_itens nova WHERE nova.titulo_financeiro_id = `PagamentoAutorizacaoItem`.titulo_financeiro_id AND nova.id > `PagamentoAutorizacaoItem`.id)'),
    literal("NOT EXISTS (SELECT 1 FROM pagamentos_manuais_fila ativa WHERE ativa.titulo_financeiro_id = `PagamentoAutorizacaoItem`.titulo_financeiro_id AND ativa.status IN ('PENDENTE','NAO_PAGO','DIVERGENTE','EM_EDICAO'))")
  ] };
}

// Espelha beneficiaryData/anexarInstrucoes/anexarDestinatarios SEM hidratar a
// fila inteira. Nao herdar nome de credor quando a instrucao esta incompleta.
function favorecidoSql(alias = 'titulo') {
  const t = aliasSql(alias);
  const partes = `SELECT CASE WHEN EXISTS (SELECT 1 FROM solicitacoes_favorecidos sf WHERE sf.titulo_financeiro_id = ${t}.id)
    THEN (SELECT sf.nome_favorecido FROM solicitacoes_favorecidos sf WHERE sf.titulo_financeiro_id = ${t}.id)
    ELSE (SELECT sf.nome_favorecido FROM solicitacoes_favorecidos sf WHERE sf.titulo_financeiro_id = ${t}.medicao_pagamento_origem_id) END`;
  const vinculo = `FROM contrato_parcelas cp JOIN medicao_parcelas mp ON mp.contrato_parcela_id = cp.id
    JOIN contrato_medicoes cm ON cm.id = mp.medicao_id AND cm.contrato_id = cp.contrato_id
    WHERE cp.titulo_financeiro_id IN (${t}.id, ${t}.medicao_pagamento_origem_id)
      AND mp.devolvido_em IS NULL AND cm.aprovada_em IS NOT NULL
      AND mp.solicitacao_id = ${t}.solicitacao_id AND cm.solicitacao_id = ${t}.solicitacao_id
      AND NOT EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id = ${t}.solicitacao_id
        AND s.contrato_id IS NOT NULL AND s.contrato_id <> cp.contrato_id)`;
  const tituloNome = `(SELECT p.nome FROM parceiros p WHERE p.id = ${t}.favorecido_pagamento_id)`;
  const instrucao = `CASE WHEN JSON_TYPE(${t}.pagamento_favorecido) = 'OBJECT'
    THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${t}.pagamento_favorecido, '$.nome_favorecido')), 'null')
    WHEN JSON_TYPE(${t}.pagamento_negociacao) = 'OBJECT'
    THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${t}.pagamento_negociacao, '$.nome_favorecido')), 'null')
    WHEN EXISTS (SELECT 1 FROM solicitacoes_favorecidos sf WHERE sf.titulo_financeiro_id IN (${t}.id, ${t}.medicao_pagamento_origem_id))
    THEN (${partes})
    WHEN (SELECT COUNT(DISTINCT cm.id) ${vinculo}) = 1
    THEN (SELECT p.nome FROM parceiros p WHERE p.id = (SELECT cm.favorecido_id ${vinculo} LIMIT 1))
    WHEN (SELECT COUNT(DISTINCT cm.id) ${vinculo}) > 1 THEN ${tituloNome}
    WHEN ${t}.favorecido_pagamento_id IS NOT NULL THEN ${tituloNome}
    WHEN ${t}.payment_beneficiary_id IS NOT NULL THEN (SELECT pb.nome FROM payment_beneficiaries pb WHERE pb.id = ${t}.payment_beneficiary_id)
    ELSE (SELECT p.nome FROM solicitacoes s JOIN parceiros p ON p.id = s.favorecido_id WHERE s.id = ${t}.solicitacao_id) END`;
  // A excecao DP/dinheiro recebe pelo colaborador, nao pelo cadastro bancario.
  const dp = require('./pagamentoFilaFiltrosDomain').recebimentoDpSql(alias);
  return `COALESCE(NULLIF(CASE WHEN ${t}.origem_titulo IN ('RH_DP','RH_DP_TICKET') AND (${dp}) = 'DINHEIRO'
    THEN COALESCE(NULLIF(CASE WHEN JSON_TYPE(${t}.pagamento_favorecido) = 'OBJECT'
      THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${t}.pagamento_favorecido, '$.nome_favorecido')), 'null')
      WHEN JSON_TYPE(${t}.pagamento_negociacao) = 'OBJECT'
      THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${t}.pagamento_negociacao, '$.nome_favorecido')), 'null')
      WHEN EXISTS (SELECT 1 FROM solicitacoes_favorecidos sf WHERE sf.titulo_financeiro_id IN (${t}.id, ${t}.medicao_pagamento_origem_id)) THEN (${partes})
      WHEN (SELECT COUNT(DISTINCT cm.id) ${vinculo}) = 1
      THEN (SELECT p.nome FROM parceiros p WHERE p.id = (SELECT cm.favorecido_id ${vinculo} LIMIT 1)) END, ''),
      NULLIF(${tituloNome}, ''), (SELECT p.nome FROM parceiros p WHERE p.id = ${t}.parceiro_id))
    ELSE ${instrucao} END, ''), 'Favorecido não informado')`;
}

function vencimentoSql(filaAlias = 'PagamentoManualFilaItem') {
  return filaAlias ? `COALESCE(\`titulo\`.data_vencimento, ${aliasSql(filaAlias)}.data_vencimento_prevista)` : '`titulo`.data_vencimento';
}

function filaPesquisaWhere(filters, escape, filaAlias = 'PagamentoManualFilaItem') {
  const clauses = [];
  if (filters.vencimento_de) clauses.push(literal(`${vencimentoSql(filaAlias)} >= ${escape(filters.vencimento_de)}`));
  if (filters.vencimento_ate) clauses.push(literal(`${vencimentoSql(filaAlias)} <= ${escape(filters.vencimento_ate)}`));
  return clauses.length ? { [Op.and]: clauses } : {};
}

module.exports = { aliasSql, filaStatusWhere, rejeicaoWhere, favorecidoSql, vencimentoSql, filaPesquisaWhere };
