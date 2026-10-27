'use strict';
const { QueryTypes } = require('sequelize');
const { filaStatusWhere, rejeicaoWhere, favorecidoSql } = require('./pagamentoFilaPesquisaDomain');

// Somente rotulos de registros desta fila/status. Nenhum cadastro completo,
// instrucao bancaria, documento, valor ou DTO financeiro sai deste endpoint.
async function listarSugestoesFila(req, filters, db = require('../models'),
  obterEscopo = require('./authorizationService').getFinanceiroObraScopeIds) {
  const { sequelize } = db, escape = value => sequelize.escape(value);
  const { campo, q = '', status = 'PENDENTE' } = filters;
  const campos = {
    obra_id: ["COALESCE(tc.obra_id, titulo.obra_id)", "(SELECT CONCAT_WS(' · ', o.codigo, o.nome) FROM obras o WHERE o.id = COALESCE(tc.obra_id, titulo.obra_id))"],
    solicitacao_id: ["COALESCE(tc.solicitacao_id, titulo.solicitacao_id)", "(SELECT s.codigo FROM solicitacoes s WHERE s.id = COALESCE(tc.solicitacao_id, titulo.solicitacao_id))"],
    titulo_id: ['titulo.id', "CONCAT_WS(' · ', titulo.codigo, titulo.descricao)"],
    favorecido: null, forma_pagamento_id: ['fp.id', 'fp.nome']
  };
  if (!Object.hasOwn(campos, campo) || typeof q !== 'string' || (campo !== 'forma_pagamento_id' && q.trim().length < 2) || q.length > 120) {
    throw Object.assign(new Error('Filtro ou busca invalida.'), { statusCode: 400 });
  }
  if (campo === 'favorecido') campos.favorecido = [favorecidoSql(), favorecidoSql()];
  const [id, nome] = campos[campo];
  const obras = await obterEscopo(req.user);
  const scope = obras === null ? '1 = 1' : require('./tituloCompartilhadoLeitura').escopoCompletoSql(obras, 'titulo').val;
  const gen = sequelize.getQueryInterface().queryGenerator;
  const statusSql = gen.getWhereConditions(filaStatusWhere(status), 'PagamentoManualFilaItem', db.PagamentoManualFilaItem);
  const rejeitadoSql = gen.getWhereConditions(rejeicaoWhere(), 'PagamentoAutorizacaoItem', db.PagamentoAutorizacaoItem);
  const normal = `FROM pagamentos_manuais_fila AS PagamentoManualFilaItem
    JOIN titulos_financeiros titulo ON titulo.id = PagamentoManualFilaItem.titulo_financeiro_id AND titulo.deleted_at IS NULL`;
  const rejeitado = `FROM pagamento_autorizacao_itens AS PagamentoAutorizacaoItem
    JOIN titulos_financeiros titulo ON titulo.id = PagamentoAutorizacaoItem.titulo_financeiro_id AND titulo.deleted_at IS NULL`;
  const condRejeitado = `${rejeitadoSql} AND titulo.status IN ('ABERTO','PARCIAL') AND titulo.valor_saldo > 0`;
  const incluirRejeitados = ['NAO_PAGO', 'TODOS'].includes(status);
  const like = escape('%' + q.trim().replace(/[\\%_]/g, '\\$&') + '%');
  const pesquisa = q.trim() ? `CONVERT(${nome} USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ${like}` : '1 = 1';
  // Ao abrir o campo, listar apenas formas referenciadas por titulos da fila
  // autorizada/status. Nao hidratar a fila, nem limitar a pagina atual.
  const limite = campo === 'forma_pagamento_id' && !q.trim() ? 100 : 20;
  let sql;
  if (campo === 'forma_pagamento_id') {
    sql = `SELECT fp.id AS id, fp.nome AS nome FROM financeiro_formas_pagamento fp
      WHERE ${pesquisa} AND (EXISTS (SELECT 1 ${normal} WHERE ${statusSql} AND ${scope} AND titulo.forma_pagamento_id = fp.id)
      ${incluirRejeitados ? `OR EXISTS (SELECT 1 ${rejeitado} WHERE ${condRejeitado} AND ${scope} AND titulo.forma_pagamento_id = fp.id)` : ''})`;
  } else {
    const origem = ['obra_id', 'solicitacao_id'].includes(campo)
      ? ' LEFT JOIN titulos_compartilhados_origens tc ON tc.titulo_financeiro_id = titulo.id' : '';
    const selecionar = (from, cond) => `SELECT DISTINCT ${id} AS id, ${nome} AS nome ${from}${origem}
      WHERE ${cond} AND ${scope} AND ${id} IS NOT NULL AND ${pesquisa}`;
    // Cada ramo limitado; nunca materializa milhares de titulos no Node.
    sql = incluirRejeitados
      ? `SELECT * FROM ((${selecionar(normal, statusSql)} ORDER BY nome, id LIMIT 21)
        UNION (${selecionar(rejeitado, condRejeitado)} ORDER BY nome, id LIMIT 21)) opcoes`
      : selecionar(normal, statusSql);
  }
  const rows = await sequelize.query(`${sql} ORDER BY nome, id LIMIT ${limite + 1}`, { type: QueryTypes.SELECT });
  return { data: rows.slice(0, limite), mais: rows.length > limite, ...(limite !== 20 ? { limite } : {}) };
}

module.exports = { listarSugestoesFila };
