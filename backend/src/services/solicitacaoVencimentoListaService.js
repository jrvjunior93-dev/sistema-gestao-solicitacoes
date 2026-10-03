const STATUS_TITULO_MEDICAO_ENCERRADO = Object.freeze([
  'QUITADO',
  'CANCELADO',
  'CANCELADA',
  'ESTORNADO',
  'EXCLUIDO',
  'RENEGOCIADO'
]);

function quoteAlias(alias) {
  const normalized = String(alias || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(normalized)) {
    throw new Error('Alias SQL invalido para vencimento de solicitacao.');
  }
  return `\`${normalized}\``;
}

function sqlVencimentoMedicaoPendente(aliasSolicitacao = 'Solicitacao') {
  const alias = quoteAlias(aliasSolicitacao);
  const statusesEncerrados = STATUS_TITULO_MEDICAO_ENCERRADO
    .map((status) => `'${status}'`)
    .join(', ');

  return `(
    SELECT MIN(mp.vencimento_aplicado)
    FROM medicao_parcelas mp
    INNER JOIN contrato_medicoes cm
      ON cm.id = mp.medicao_id
      AND cm.solicitacao_id = ${alias}.id
    INNER JOIN contrato_parcelas cp
      ON cp.id = mp.contrato_parcela_id
    LEFT JOIN titulos_financeiros tf
      ON tf.id = cp.titulo_financeiro_id
    WHERE mp.solicitacao_id = ${alias}.id
      AND mp.devolvido_em IS NULL
      AND (
        tf.id IS NULL
        OR (
          UPPER(COALESCE(tf.status, '')) NOT IN (${statusesEncerrados})
          AND COALESCE(tf.valor_saldo, 0) > 0
        )
      )
  )`;
}

function sqlVencimentoEfetivoSolicitacao(aliasSolicitacao = 'Solicitacao') {
  const alias = quoteAlias(aliasSolicitacao);
  return `COALESCE(${sqlVencimentoMedicaoPendente(aliasSolicitacao)}, ${alias}.data_vencimento)`;
}

function normalizarDataSomente(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const ano = value.getFullYear();
    const mes = String(value.getMonth() + 1).padStart(2, '0');
    const dia = String(value.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function aplicarVencimentoEfetivoSolicitacao(solicitacao = {}) {
  const vencimentoSolicitacao = normalizarDataSomente(solicitacao.data_vencimento);
  const vencimentoMedicao = normalizarDataSomente(solicitacao.data_vencimento_medicao);

  return {
    ...solicitacao,
    data_vencimento_solicitacao: vencimentoSolicitacao,
    data_vencimento_medicao: vencimentoMedicao,
    data_vencimento: vencimentoMedicao || vencimentoSolicitacao,
    data_vencimento_origem: vencimentoMedicao
      ? 'MEDICAO'
      : (vencimentoSolicitacao ? 'SOLICITACAO' : null)
  };
}

module.exports = {
  STATUS_TITULO_MEDICAO_ENCERRADO,
  aplicarVencimentoEfetivoSolicitacao,
  normalizarDataSomente,
  sqlVencimentoEfetivoSolicitacao,
  sqlVencimentoMedicaoPendente
};
