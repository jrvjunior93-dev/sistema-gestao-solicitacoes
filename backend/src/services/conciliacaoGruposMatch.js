'use strict';
const { Op } = require('sequelize');
const { normalizeDateOnly, toSignedCents } = require('../utils/conciliacaoMatch');
const { classifyBankReversal } = require('./conciliacaoEstornoBancarioService');

function chaveGrupo(item) {
  const conta = Number(item?.conta_bancaria_id), data = normalizeDateOnly(item?.data_movimento);
  const valor = toSignedCents(item?.valor);
  return Number.isSafeInteger(conta) && conta > 0 && data && valor !== null && valor !== 0
    ? `${conta}|${data}|${valor}` : null;
}

// Leitura global apenas dos grupos visiveis, sem filtro/paginacao esconder
// outra ocorrencia do mesmo extrato. Nao reserva nem grava qualquer registro.
async function carregarGrupos(itens, model) {
  const chaves = new Map();
  for (const item of itens) {
    const chave = chaveGrupo(item);
    if (chave && item.status === 'PENDENTE' && !classifyBankReversal(item)) chaves.set(chave, item);
  }
  const grupos = new Map([...chaves.keys()].map(chave => [chave, { chave, pendentes_ids: [], tem_match_confirmado: false }]));
  const entradas = [...chaves.values()];
  for (let inicio = 0; inicio < entradas.length; inicio += 100) {
    const rows = await model.findAll({
      where: { deleted_at: null, status: { [Op.in]: ['PENDENTE', 'CONCILIADO'] },
        [Op.or]: entradas.slice(inicio, inicio + 100).map(item => ({ conta_bancaria_id: Number(item.conta_bancaria_id),
          data_movimento: normalizeDateOnly(item.data_movimento), valor: Number(item.valor) })) },
      attributes: ['id', 'conta_bancaria_id', 'data_movimento', 'valor', 'status', 'movimento_financeiro_id', 'descricao_banco'],
      order: [['id', 'ASC']], raw: true
    });
    for (const row of rows) {
      const grupo = grupos.get(chaveGrupo(row));
      if (!grupo || classifyBankReversal(row)) continue;
      if (row.status === 'PENDENTE') grupo.pendentes_ids.push(Number(row.id));
      if (row.status === 'CONCILIADO' && row.movimento_financeiro_id) grupo.tem_match_confirmado = true;
    }
  }
  for (const grupo of grupos.values()) grupo.pendentes_ids = [...new Set(grupo.pendentes_ids)].sort((a, b) => a - b);
  return grupos;
}

function projetarGrupo(conciliacaoId, grupo, candidatos) {
  const pendentes = grupo?.pendentes_ids || [Number(conciliacaoId)];
  const repetido = pendentes.length > 1;
  const podeDistribuirUnico = candidatos.length === 1 && grupo?.tem_match_confirmado;
  const disponiveis = (grupo && !pendentes.includes(Number(conciliacaoId)))
    || (podeDistribuirUnico && Number(conciliacaoId) !== pendentes[0]) ? [] : candidatos;
  const manual = disponiveis.length > 1 || (disponiveis.length > 0 && repetido && !podeDistribuirUnico);
  return { sugestoes: disponiveis, sugestao_automatica: !manual ? disponiveis[0] || null : null,
    total_candidatos: disponiveis.length, total_candidatos_exatos_mesmo_dia: disponiveis.length,
    associacao_manual_recomendada: manual, conciliacao_em_lote_disponivel: !manual && disponiveis.length === 1 };
}

module.exports = { chaveGrupo, carregarGrupos, projetarGrupo };
