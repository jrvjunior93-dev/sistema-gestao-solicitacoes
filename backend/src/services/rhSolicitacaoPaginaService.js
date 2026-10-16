'use strict';

const { Op, literal } = require('sequelize');
const { RhSolicitacao } = require('../models');
const { ValidationError } = require('../middlewares/validation');
const { ehTransferencia } = require('./rhPessoalDomain');
const { visivelNaConsulta, normalizarConsulta, colaboradoresDoPedido } = require('./rhSolicitacaoConsultaDomain');
const { comAtividade } = require('./rhSolicitacaoAtividadeService');

// O estado legado de pagamentos depende das linhas e dos titulos. Nao filtrar
// somente pela coluna situacao nem paginar ANTES dessa regra. Ler metadados
// compactos, sem contas/salarios/documentos, e materializar DTOs apenas da pagina.
const resumoJson = `CASE WHEN \`RhSolicitacao\`.subtipo = 'PAGAMENTO_POR_SOLICITACAO' THEN
  JSON_OBJECT('rascunho_excluido', JSON_EXTRACT(dados_json, '$.rascunho_excluido'),
    'titulos', COALESCE(JSON_EXTRACT(dados_json, '$.titulos'), JSON_ARRAY()),
    'linhas', COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('colaborador_id', l.colaborador_id,
      'pagamento_estado', l.estado, 'selecionado', JSON_EXTRACT(\`RhSolicitacao\`.dados_json, CONCAT('$.linhas[', l.ord - 1, '].selecionado')), 'removido_em', l.removido))
      FROM JSON_TABLE(COALESCE(\`RhSolicitacao\`.dados_json, JSON_OBJECT()), '$.linhas[*]'
      COLUMNS(ord FOR ORDINALITY, colaborador_id INT PATH '$.colaborador_id', estado VARCHAR(30) PATH '$.pagamento_estado',
        removido VARCHAR(80) PATH '$.removido_em')) l), JSON_ARRAY()))
  ELSE JSON_OBJECT('primeira_lotacao', JSON_EXTRACT(dados_json, '$.primeira_lotacao'),
    'origem_sem_obra', JSON_EXTRACT(dados_json, '$.origem_sem_obra')) END`;

function numeroPagina(valor, padrao, max) {
  const n = valor == null || valor === '' ? padrao : Number(valor);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new ValidationError('Paginacao invalida.');
  return n;
}

async function paginaSolicitacoes({ user, where, query, filtroSituacao, colaboradorId }) {
  const limite = numeroPagina(query.limite, 50, 100);
  const solicitada = numeroPagina(query.pagina, 1, 100000);
  const metadados = await RhSolicitacao.findAll({ where,
    attributes: ['id', 'tipo', 'subtipo', 'situacao', 'colaborador_id', 'obra_id', 'criada_por', 'createdAt', 'updatedAt',
      [literal(resumoJson), 'dados_json']], raw: true });
  const abertos = ['ABERTA', 'ENVIO_PARCIAL', 'EM_REVISAO'];
  const filtrados = metadados.filter(s => !ehTransferencia(s) && visivelNaConsulta(s, user.id)
    && (colaboradorId === null || colaboradoresDoPedido(s).includes(colaboradorId)))
    .map(normalizarConsulta).filter(s => !filtroSituacao || (filtroSituacao === 'EM_ANDAMENTO'
      ? abertos.includes(s.situacao) : s.situacao === filtroSituacao));
  const ordenados = await comAtividade(filtrados, user.id);
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / limite));
  const pagina = Math.min(solicitada, totalPaginas);
  const porTipo = {};
  for (const s of ordenados) porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1;
  return { ids: ordenados.slice((pagina - 1) * limite, pagina * limite).map(s => Number(s.id)),
    total: ordenados.length, pagina, limite, total_paginas: totalPaginas, por_tipo: porTipo,
    abertas: ordenados.filter(s => abertos.includes(s.situacao)).length,
    nao_lidas_abertas: ordenados.filter(s => abertos.includes(s.situacao) && s.nao_lida).length };
}

module.exports = { paginaSolicitacoes, resumoJson, numeroPagina };
